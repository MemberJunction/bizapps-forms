/**
 * Server-side magic-link redeem for the public respondent host route (`/f/:slug`).
 *
 * This closes the "link → login" gap the {@link RespondentHostMiddleware} header documents:
 * a respondent must reach `<mj-form>` holding the *redeemed* anonymous session JWT, never the
 * raw `PublicLinkToken` (the S1 resolvers call `GetUserFromPayload` and throw with no session).
 * Rather than wait for the core change that re-points `MagicLinkRouter.sendRedeemResult` at
 * `/f/:slug`, the route does the redeem itself, here, before rendering the host page:
 *
 *   1. Resolve `:slug` → the `FormDistribution` row; refuse before minting if the link is not yet
 *      open, closed, full, or its form has no published version ({@link distributionRefusalReason},
 *      {@link hasPublishedVersion}); otherwise read its raw `PublicLinkToken`.
 *   2. POST that token to core's redeem endpoint with `format=json` so it returns the session
 *      JWT as JSON (instead of a 302 to Explorer).
 *   3. Hand the JWT to the host page via an escaped `data-token` attribute.
 *
 * Everything that touches the network or the DB is injected ({@link RedeemDeps}) so the flow is
 * unit-testable without a live server: tests pass a fake distribution loader and a stub `fetch`.
 */
import { LogError, LogStatus, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

import { publishedVersionFilter } from '../public-submit/definition-loader.service.js';
import { distributionWindowRefusal } from '../public-submit/distribution-window.js';
import { FORM_DISTRIBUTION_ENTITY, FORM_VERSION_ENTITY } from '../public-submit/entity-names.js';
import { distributionQuotaExceeded } from '../public-submit/quota.service.js';

/**
 * The narrow slice of a data provider this flow uses: a single `RunView`. Typed minimally (not
 * the full `IRunViewProvider`) so both the core `RunView` class and a unit-test fake satisfy it
 * without casts — the flow never calls anything else on the provider.
 */
export interface RedeemRunViewProvider {
  RunView<T = mjBizAppsFormsFormDistributionEntityType>(
    params: RunViewParams,
    contextUser?: UserInfo,
  ): Promise<RunViewResult<T>>;
}

/**
 * Core's `RedeemMagicLinkResult` JSON (the fields this flow reads), plus what the RESPONSE itself
 * said about it. The three fields after `success` are not part of core’s body and are named as
 * such below: `errorCode` alone cannot tell the refusals apart, so the door has to keep what the
 * status and headers carried.
 */
export interface RedeemMagicLinkJsonResult {
  success: boolean;
  /**
   * The HTTP status core answered with. Carried because `errorCode` is ambiguous on its own:
   * core sends `'invalid'` both for a dead invite (410) and for its redeem rate limit (429).
   */
  status?: number;
  /**
   * Whether this refusal is core's per-IP redeem cap rather than a verdict about the token —
   * {@link isRateLimitRefusal}'s answer, kept so no caller has to repeat that judgement
   * (bizapps-forms#139).
   */
  rateLimited?: boolean;
  /**
   * Seconds until the caller's budget refills, from the refusal's own headers, and only when they
   * carried a usable one. Set with `rateLimited` only.
   */
  retryAfterSeconds?: number;
  /** The minted RS256 anonymous session JWT (present only on success). */
  token?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Every reason a slug can fail to become a redeemed session token — as a VALUE, with the union
 * derived from it. One list, not two: `error-view.ts` proves at compile time that it handles each
 * member, and its spec iterates this array, so a new reason cannot be added without both a view
 * and a test. Three hand-maintained copies of this list used to live in that spec, and nothing
 * failed when one of them fell out of step.
 */
export const REDEEM_FAILURE_REASONS = [
  'distribution-not-found',
  'distribution-not-yet-open',
  'distribution-closed',
  'distribution-full',
  'form-unpublished',
  'no-token',
  // Core refused because the caller is over its per-IP redeem budget (bizapps-forms#139). Its own
  // reason rather than a refusal, because it is the one refusal a respondent can act on: the page
  // answers 429 with how long to wait, not the 502 the rest of this group renders.
  'rate-limited',
  // The door's own pre-redeem read failed — a database problem, not a redeem one. Logged by
  // `hasPublishedVersion`, which is the frame that knows what it was reading.
  'redeem-failed',
  // The two below the redeem endpoint: we asked and never got a usable answer (connect refused,
  // DNS, TLS, a truncated body, an HTML error page from a proxy, a JSON body of some other shape).
  'redeem-unreachable',
  // Core answered and said no — a revoked token, an exhausted invite — or answered "success" while
  // returning no token, which is the same thing from here. A tripped rate limit is NOT in this
  // group: it is caught above and gets a page a respondent can act on.
  'redeem-refused',
] as const;

/** Why a slug could not be turned into a redeemed session token. */
export type RedeemFailureReason = (typeof REDEEM_FAILURE_REASONS)[number];

/** Outcome of {@link redeemSlugToToken}. Flat (non-discriminated) shape to match the package's
 * non-`strictNullChecks` compile, like the public-submit services. */
export interface RedeemOutcome {
  ok: boolean;
  /** The redeemed anonymous session JWT, on success. */
  token?: string;
  /**
   * The distribution row the door resolved the slug to, on success. Handed up so the host page can
   * name the form (`Form`, the view's joined name column) without a second, identical read of the
   * hottest unauthenticated path in the product.
   */
  distribution?: mjBizAppsFormsFormDistributionEntityType;
  /** Why it failed, on failure. */
  reason?: RedeemFailureReason;
  /** When the link opens — set with `distribution-not-yet-open` only, so the page can say when. */
  opensAt?: Date;
  /**
   * Seconds until the caller's redeem budget refills — set with `rate-limited` only, and only when
   * the refusal's own headers carried a usable one, so the page can say roughly when to come back.
   */
  retryAfterSeconds?: number;
}

/**
 * What the row alone decides: refuse with a reason, or proceed with the credential to redeem.
 *
 * Discriminated rather than "a reason, or undefined" so the ONE thing proceeding requires — a
 * non-empty `PublicLinkToken` — is handed back by the function that checked it. The caller used to
 * re-read `dist.PublicLinkToken` afterwards and rely on a comment to say it could not be null; the
 * compiler proves it instead, and there is no second guard to fall out of step.
 *
 * The discriminant is a STRING, not the `ok: true | false` this file's other result types use.
 * TypeScript narrows a boolean-literal discriminant only under `strictNullChecks`, which the BUILD
 * config cannot have (it changes `emitDecoratorMetadata` output, and type-graphql reads that at
 * runtime — see `tsconfig.typecheck.json`). A string discriminant narrows under both.
 */
type DistributionRowVerdict =
  | { verdict: 'refuse'; reason: RedeemFailureReason; opensAt?: Date }
  | { verdict: 'proceed'; rawToken: string };

/** Injectable dependencies so the redeem flow is pure/unit-testable (no live server). */
export interface RedeemDeps {
  /** The data provider used for the slug → distribution read (the system-user provider). */
  provider: RedeemRunViewProvider;
  /** A context user for the pre-auth read (system user — see the middleware). */
  contextUser: UserInfo;
  /** Absolute URL of core's magic-link redeem endpoint (without query string). */
  redeemUrl: string;
  /** The `fetch` implementation (Node global by default; injected in tests). */
  fetchImpl: typeof fetch;
}

/**
 * Judge the distribution row alone: refuse with a reason, or proceed with the credential to redeem.
 * The published-version check, which costs a read, comes after.
 *
 * One decision, not a boolean plus a special case beside it: every reason a respondent must be
 * turned away BEFORE they type anything is settled here, and each carries its own message. That
 * matters because "not yet open", "closed" and "full" are different facts about the link and
 * imply different things to the person holding it — one has not started, one may reopen, and one
 * has already had its fill. The door used to announce the first as the second (bizapps-forms#118).
 *
 * None of these facts is judged here. They come from the SAME predicates the submit path uses —
 * {@link distributionWindowRefusal} (whose boolean form is the submit gate's) and
 * {@link distributionQuotaExceeded} — rather than a second spelling of each rule written at this
 * door. A link that opens but cannot accept a submission is precisely the defect this closes
 * (bizapps-forms#81), so the door and the submit gate must not be able to drift apart; sharing the
 * predicates is what guarantees it.
 *
 * The submit-time gate REMAINS the authority: this read is a snapshot, and two respondents can be
 * holding the last slot at once. This only stops the form inviting work it already knows it cannot
 * accept; it does not decide the race.
 */
function judgeDistributionRow(
  dist: mjBizAppsFormsFormDistributionEntityType,
  now: Date,
): DistributionRowVerdict {
  const window = distributionWindowRefusal(dist, now);
  // A link the author switched off is 'paused' to them whatever else is true of it, so that answer
  // comes first — a human decision outranks a calendar one.
  if (window === 'closed') {
    return { verdict: 'refuse', reason: 'distribution-closed' };
  }
  // Then a link the host never minted a credential for. This ordering is the builder's, and the
  // reason is the builder's too: "Telling someone their never-issued link is merely 'Scheduled'
  // sends them to edit a date when the actual problem is that the host never minted a token"
  // (`share-state.ts` / `share-state.spec.ts`, which pin `pending` ahead of `scheduled` and `full`).
  // Ranked last, the door answered a tokenless scheduled link with 503 "It opens on <date>" and a
  // `Retry-After` naming that instant — a machine-readable promise it cannot keep, because the same
  // URL answers 409 the moment the date arrives. It also spares that link the version read below,
  // which could not help it either way.
  const rawToken = dist.PublicLinkToken;
  if (!rawToken) {
    return { verdict: 'refuse', reason: 'no-token' };
  }
  if (window === 'not-yet-open') {
    // Non-null by construction — `distributionWindowRefusal` only says 'not-yet-open' from inside
    // its own `dist.OpenAt &&` guard — but narrowed here anyway, because that guard is in another
    // module and `new Date(null)` is the EPOCH rather than an invalid date, which would announce
    // "It opens on January 1, 1970". Without a date the view still refuses, it just names none.
    return {
      verdict: 'refuse',
      reason: 'distribution-not-yet-open',
      opensAt: dist.OpenAt ? new Date(dist.OpenAt) : undefined,
    };
  }
  if (distributionQuotaExceeded(dist)) {
    return { verdict: 'refuse', reason: 'distribution-full' };
  }
  return { verdict: 'proceed', rawToken };
}

/**
 * The three distinct things a slug lookup can find, kept apart because two of them used to be one.
 *
 * `absent` and `unreadable` both returned `undefined`, so a database problem reached the respondent
 * as "This form link was not found. Please check the link and try again." — advice that cannot help
 * and is not true — while the frame holding the slug logged nothing (bizapps-forms#194 review).
 * `hasPublishedVersion` below had already made the opposite decision for the same condition.
 *
 * A string discriminant, like {@link DistributionRowVerdict} and {@link PostRedeemOutcome}, for the
 * reason spelled out on those: this package compiles without `strictNullChecks`.
 */
type DistributionLookup =
  | { lookup: 'found'; row: mjBizAppsFormsFormDistributionEntityType }
  | { lookup: 'absent' }
  | { lookup: 'unreadable' };

/** Load the distribution row for a slug, or `undefined` if the read fails / no row matches. */
async function loadDistribution(
  deps: RedeemDeps,
  slug: string,
): Promise<DistributionLookup> {
  const result = await deps.provider.RunView<mjBizAppsFormsFormDistributionEntityType>(
    {
      EntityName: FORM_DISTRIBUTION_ENTITY,
      ExtraFilter: `Slug=${quoteSqlString(slug)}`,
      ResultType: 'simple',
      MaxRows: 1,
    },
    deps.contextUser,
  );
  // RunView never throws — check Success. A failed READ is not a negative answer: reporting it as
  // "no such slug" tells the holder of a perfectly good link to go and check the link, and tells the
  // operator nothing at all. Same decision, and same wording, as `hasPublishedVersion` below.
  if (!result.Success) {
    LogError(`[Forms] Distribution read failed for slug '${slug}': ${result.ErrorMessage}`);
    return { lookup: 'unreadable' };
  }
  const row = result.Results[0];
  return row ? { lookup: 'found', row } : { lookup: 'absent' };
}

/**
 * Whether the form behind the link has a Published version — the one thing the widget will ask
 * for next, and the one thing a link can lack while every distribution field looks fine. Sharing
 * a link before publishing is an ordinary authoring mistake; without this check the door minted a
 * session for it, the widget got `null`, and the respondent got "Try again" (bizapps-forms#118).
 *
 * A yes/no, so the read is as narrow as it can be: the ID only, one row, no snapshot. The filter
 * is the submit gate's own ({@link publishedVersionFilter}) so "published" means one thing at both
 * gates. `undefined` means the read itself failed — that is a database problem, not an unpublished
 * form, and the caller must not report it as one; it is logged here with what was being read.
 */
async function hasPublishedVersion(
  deps: RedeemDeps,
  dist: mjBizAppsFormsFormDistributionEntityType,
): Promise<boolean | undefined> {
  const result = await deps.provider.RunView<{ ID: string }>(
    {
      EntityName: FORM_VERSION_ENTITY,
      ExtraFilter: publishedVersionFilter(dist.FormID),
      Fields: ['ID'],
      ResultType: 'simple',
      MaxRows: 1,
    },
    deps.contextUser,
  );
  // RunView never throws — check Success.
  if (!result.Success) {
    LogError(
      `[Forms] Published-version read failed for distribution '${dist.Slug}' (form ${dist.FormID}): ${result.ErrorMessage}`,
    );
    return undefined;
  }
  return result.Results.length > 0;
}

/**
 * The longest wait this door will repeat to a respondent, in seconds. Core's own window is 60s; a
 * far larger number is a misconfigured or hostile upstream, and echoing it back as `Retry-After`
 * would park a monitor for the rest of the day on the strength of one header.
 */
const MAX_RETRY_AFTER_SECONDS = 3600;

/**
 * How long the door will wait on core's redeem before giving up, in milliseconds.
 *
 * Not a tuning knob — a bound on a SHARED resource. `handleMetered` holds one of
 * `FORMS_REDEEM_MAX_IN_FLIGHT` process-wide slots for the whole request, so without a deadline here
 * it is the UPSTREAM's latency, not this door's policy, that decides how long a slot is held. An
 * upstream that accepts the connection and then says nothing never rejects, so every such request
 * parks a slot until Node's own 300-second header timeout; a handful of them exhaust the cap and
 * the door starts answering "This form is receiving a lot of traffic right now" — reporting a
 * wedged dependency as its own load, which is the same class of lie as the 502 this change removes.
 *
 * Ten seconds is far longer than a healthy redeem (one indexed lookup, a provision, a JWT mint) and
 * far shorter than a respondent's patience. Crossing it fails safe through the transport `catch`:
 * the request becomes `'redeem-unreachable'` and renders the 502, which is the honest answer when
 * the door genuinely could not ask — and the catch logs the deadline, so an operator reading the
 * log can tell a wedged upstream from a refused connection.
 */
const REDEEM_TIMEOUT_MS = 10_000;

/**
 * What core's redeem endpoint answered, reduced to the one distinction every caller must make:
 * we got a usable answer — whatever it said — or we never did.
 *
 * This exists because `undefined` used to mean both. An unreachable API, a proxy's HTML error page
 * and a revoked token arrived at the caller as the same nothing, and the caller re-derived a single
 * reason from three falsy checks on a value that had already thrown its evidence away
 * (bizapps-forms#140). `'answered'` still carries the full result, because the refusal's own
 * contents are what {@link redeemSlugToToken} routes on: `rateLimited` is a page a respondent can
 * act on, every other refusal is not.
 *
 * A STRING discriminant, like {@link DistributionRowVerdict} above and for the same reason spelled
 * out there: this package compiles without `strictNullChecks`, and TypeScript narrows a
 * boolean-literal discriminant only under it.
 */
type PostRedeemOutcome =
  | { outcome: 'answered'; result: RedeemMagicLinkJsonResult }
  | { outcome: 'unreachable' };

/**
 * Refusals that are ORDINARY for the tokens {@link redeemRawToken} redeems, so they are logged as
 * news rather than as errors.
 *
 * This function exists for single-use response invites (the resume routes), and a single-use token
 * already being spent is the two-tab / restored-tab race — `refusedRedeem` in
 * `device-resume.service.ts` calls it "the COMMON case for this refusal, not the exotic one" and
 * answers `open-elsewhere` without even clearing the cookie. An error-level line for an everyday
 * outcome dilutes the signal this file exists to create (bizapps-forms#194 review).
 *
 * It lives HERE rather than as a parameter the caller passes because it is a property of what this
 * function redeems, not of anyone's taste: the door's own `PublicLinkToken` is MULTI-use, so
 * `consumed` there is genuinely anomalous — and `redeemSlugToToken` reaches {@link postRedeem}
 * directly, so it never picks this list up. A parameter would be one more piece of wiring to forget.
 */
const RESUME_ROUTINE_REFUSALS = ['consumed'] as const;

/**
 * Redeem ANY raw magic-link token through core, not just a distribution's public one.
 *
 * Exported because the resume routes redeem a token whose resource is a FormResponse rather than a
 * distribution — the same endpoint, the same POST, the same JSON contract, and deliberately the
 * same function: a second spelling of this call is a second place for the `format=json` / POST-only
 * details to drift, and the failure that produces is a 405 nobody attributes to a redeem.
 *
 * `slug` is for the LOG only — the distribution the redeem is being done on behalf of, which the
 * resume routes are scoped to just as the door is. It is required rather than optional because an
 * optional context argument is one a caller forgets, and a log line with no handle in it is the
 * thing bizapps-forms#140 exists to stop.
 *
 * Flattens back to `RedeemMagicLinkJsonResult | undefined`, which is the shape its own callers
 * judge: they distinguish refusals by `errorCode` and `status`, and an unreachable endpoint is not
 * a distinction they act on. {@link redeemSlugToToken} calls {@link postRedeem} directly because it
 * does act on it.
 */
export async function redeemRawToken(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl'>,
  rawToken: string,
  slug: string,
): Promise<RedeemMagicLinkJsonResult | undefined> {
  const redeemed = await postRedeem(deps, rawToken, slug, RESUME_ROUTINE_REFUSALS);
  return redeemed.outcome === 'answered' ? redeemed.result : undefined;
}

/**
 * POST the raw token to core's redeem endpoint with `format=json` and judge the answer.
 *
 * Everything the door knows about how core spells a refusal lives HERE and nowhere else: the
 * status, and — for the one refusal a respondent can act on — the two headers that carry the wait
 * (bizapps-forms#139). Callers read `rateLimited` / `retryAfterSeconds` and never touch a header.
 *
 * And every way this can fail is logged HERE, once, with the slug and the endpoint that was called
 * — this is the last frame that still holds both. `/f/:slug` is the anonymous public entry point,
 * so a production failure arrives with no reproduction steps and no user to interview: the log line
 * is the whole diagnosis. Both catches used to be bare and a refusal body was discarded unread,
 * which made an unreachable API, an HTML error page, a revoked token and a tripped rate limit the
 * same silent 502 — and core had already sent the sentence explaining which (bizapps-forms#140).
 *
 * Never logs `rawToken` or the minted JWT. Both are credentials, and a log line is durable, shipped
 * onward, and outlives the session; the slug is the safe handle, and it is already in the URL the
 * operator is looking at.
 */
async function postRedeem(
  deps: Pick<RedeemDeps, 'redeemUrl' | 'fetchImpl'>,
  rawToken: string,
  slug: string,
  routineRefusalCodes: readonly string[] = [],
): Promise<PostRedeemOutcome> {
  // Core reads `format` from the query string only; the body carries `{ token }` as JSON.
  // POST only — a GET with format=json is 405 by design.
  const url = `${deps.redeemUrl}?format=json`;
  let response: Response;
  try {
    response = await deps.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token: rawToken }),
      // Covers the body read below as well as the request: an upstream can also stall midway
      // through streaming a response, which holds the slot just as effectively.
      signal: AbortSignal.timeout(REDEEM_TIMEOUT_MS),
    });
  } catch (e: unknown) {
    LogError(
      `[Forms] Redeem transport failure for distribution '${slug}' (POST ${url}, ` +
        `${REDEEM_TIMEOUT_MS}ms deadline): ${e instanceof Error ? e.message : String(e)}`,
    );
    return { outcome: 'unreachable' };
  }
  // A body we cannot read is not the end of the enquiry: the STATUS LINE has already been received,
  // and for the one refusal a respondent can act on it is sufficient on its own. Giving up here
  // would throw away a 429 the door has already been told about — see the rate-limit check below.
  // The parse error is KEPT rather than logged on the spot, because a 429 from a CDN arrives
  // exactly this way and that path is handled, not broken: logging there would cry wolf.
  let parsed: unknown;
  let parseError: string | undefined;
  try {
    parsed = await response.json();
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e);
  }
  const result = isRedeemResult(parsed) ? parsed : undefined;
  // Before the "no usable body" exit, not after it. `isRateLimitRefusal` is written to answer
  // without a body precisely because a hop that refuses on its own account — a CDN, an nginx, an
  // API gateway — sends ITS page, not core's JSON, so the status survives and the body does not.
  if (isRateLimitRefusal(response.status, result)) {
    // The line whose absence cost a two-repository source read to learn the answer had been "Too
    // many redemption attempts. Try again later." all along (bizapps-forms#140). A respondent now
    // sees a 429 with the wait rather than a 502, but the operator still needs to know the door is
    // being throttled — that is a capacity signal, not just this caller's bad luck.
    const retryAfterSeconds = retryAfterSecondsFrom(response.headers);
    LogError(
      `[Forms] Redeem rate-limited for distribution '${slug}' (POST ${url}, ` +
        `HTTP ${response.status}): errorCode=${result?.errorCode || 'none'} ` +
        `error=${result?.error || 'none'} retryAfterSeconds=${retryAfterSeconds ?? 'unknown'}`,
    );
    return {
      outcome: 'answered',
      result: {
        // `success: false` before the spread, so a body that carried one still wins. Without a body
        // this is the status line's own assertion, not a fabrication: 429 IS a refusal.
        success: false,
        ...result,
        status: response.status,
        rateLimited: true,
        retryAfterSeconds,
      },
    };
  }
  if (!result) {
    // Every OTHER unreadable answer is unreachable. A 500, a 200 or a 410 with a body we cannot
    // parse proves nothing about the token, and inventing a refusal from one would be this same
    // mistake pointing the other way. Now it says WHICH kind of unreadable, because the two have
    // different fixes: a parse error is usually an upstream returning its own page, and readable
    // JSON of the wrong shape is usually the URL pointing somewhere that is not core.
    LogError(
      parseError !== undefined
        ? `[Forms] Redeem response was not readable JSON for distribution '${slug}' ` +
            `(POST ${url}, HTTP ${response.status}): ${parseError}`
        : `[Forms] Redeem response was JSON but not a redeem result for distribution '${slug}' ` +
            `(POST ${url}, HTTP ${response.status}). Check that FORMS_MAGICLINK_REDEEM_URL ` +
            `('${deps.redeemUrl}') is core's magic-link redeem endpoint.`,
    );
    return { outcome: 'unreachable' };
  }
  if (!result.success || !result.token) {
    // Core's own words, verbatim. "success without a token" is folded in here rather than given a
    // reason of its own: from this side it is the same event — the endpoint answered and we hold
    // no session — and it is a core bug, which the trailing clause says so an operator does not go
    // looking for a revoked link.
    const line =
      `[Forms] Redeem refused for distribution '${slug}' (POST ${url}, HTTP ${response.status}): ` +
      `errorCode=${result.errorCode || 'none'} error=${result.error || 'none'}` +
      (result.success ? ' — core reported success but returned no token' : '');
    // Severity belongs to the CALLER's expectation, and this frame is shared by two of them. A
    // refusal the caller has a designed answer to is news; one it does not is an error. Still
    // logged either way — dropping the line would re-open bizapps-forms#140 on that path — but an
    // error-level line for an everyday outcome dilutes the very signal this file exists to create.
    if (result.errorCode && routineRefusalCodes.includes(result.errorCode)) {
      LogStatus(line);
    } else {
      LogError(line);
    }
  }
  return { outcome: 'answered', result: { ...result, status: response.status } };
}

/**
 * Whether core refused this because the caller is over its per-IP redeem budget.
 *
 * The STATUS is the signal — `express-rate-limit` answers 429 and core does not override it. The
 * body is only a fallback for a hop that rewrote the status, and it takes BOTH halves: `errorCode:
 * 'invalid'` alone is also what core sends for a malformed token, an unknown or revoked invite and
 * an inactive issuing user (`MagicLinkService.ts:197,246`, `magicLinkCore.ts:104`) — all HTTP 410.
 * Reading the code alone would tell someone holding a revoked link to wait a minute and try again.
 */
function isRateLimitRefusal(status: number, result: RedeemMagicLinkJsonResult | undefined): boolean {
  if (status === 429) {
    return true;
  }
  if (!result || result.success || result.errorCode !== 'invalid') {
    return false;
  }
  return (result.error ?? '').toLowerCase().includes('too many');
}

/**
 * How long until the caller's budget refills, from the refusal's own headers.
 *
 * `Retry-After` first (`express-rate-limit` sets it in whole seconds on every refusal), then the
 * draft-7 `RateLimit: limit=…, remaining=…, reset=…` core configures, which carries the same number
 * and is the one a proxy is least likely to drop.
 */
function retryAfterSecondsFrom(headers: Headers): number | undefined {
  const direct = usableRetrySeconds(headers.get('retry-after'));
  if (direct !== undefined) {
    return direct;
  }
  const reset = /(?:^|[;,\s])reset\s*=\s*(-?\d+)/i.exec(headers.get('ratelimit') ?? '');
  return usableRetrySeconds(reset?.[1]);
}

/**
 * A retry hint this door is willing to repeat: whole seconds, still ahead of us, not absurd.
 *
 * Anything else is treated as UNKNOWN rather than passed on. `Retry-After` also permits an
 * HTTP-date, and a `0` or a negative would invite an immediate retry that refuses again — a wait
 * the door cannot stand behind is worse than naming none.
 */
function usableRetrySeconds(raw: string | null | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw.trim());
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_RETRY_AFTER_SECONDS) {
    return undefined;
  }
  return seconds;
}

/** Narrow an unknown JSON body to the redeem-result shape without an unsafe cast. */
function isRedeemResult(value: unknown): value is RedeemMagicLinkJsonResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.success === 'boolean';
}

/**
 * Resolve a distribution slug to a redeemed anonymous session JWT, doing the magic-link redeem
 * server-side. Never throws — every failure maps to a typed {@link RedeemFailureReason} so the
 * route can render the matching error page and stay fail-safe. Each failure is logged where it
 * happens, by the frame that still holds the context; nothing is discarded on the way up.
 */
export async function redeemSlugToToken(deps: RedeemDeps, slug: string): Promise<RedeemOutcome> {
  if (!slug) {
    return { ok: false, reason: 'distribution-not-found' };
  }
  const found = await loadDistribution(deps, slug);
  // A read we could not perform is a database problem, not a link that does not exist. It renders
  // the same 502 "try again later" as every other read failure here, which is the honest answer.
  if (found.lookup === 'unreadable') {
    return { ok: false, reason: 'redeem-failed' };
  }
  if (found.lookup === 'absent') {
    return { ok: false, reason: 'distribution-not-found' };
  }
  const dist = found.row;
  const judged = judgeDistributionRow(dist, new Date());
  if (judged.verdict === 'refuse') {
    return { ok: false, reason: judged.reason, opensAt: judged.opensAt };
  }
  // Window and cap first, from the row already in hand; this one costs a read, so only a link
  // that is open and not full pays for it. When both apply, "opens on <date>" is what the holder
  // hears — the distribution's stated intent, and something they can act on.
  const published = await hasPublishedVersion(deps, dist);
  if (published === undefined) {
    return { ok: false, reason: 'redeem-failed' };
  }
  if (!published) {
    return { ok: false, reason: 'form-unpublished' };
  }
  const redeemed = await postRedeem(deps, judged.rawToken, slug);
  // We asked and never got a usable answer. Distinct from every refusal below, which is core
  // telling us something about the token (bizapps-forms#140).
  if (redeemed.outcome === 'unreachable') {
    return { ok: false, reason: 'redeem-unreachable' };
  }
  const result = redeemed.result;
  // Over-budget is not a broken redeem, and the two must not arrive at the page as one reason: the
  // cap is keyed by IP, so the respondent who hits it is behind a shared connection, not at fault
  // and not looking at an outage (bizapps-forms#139). `postRedeem` has already made that judgement
  // from the status and the body; this only routes it.
  if (result.rateLimited) {
    return { ok: false, reason: 'rate-limited', retryAfterSeconds: result.retryAfterSeconds };
  }
  // Core answered and we hold no session: a revoked token, an exhausted invite, or core reporting
  // success while returning none. `postRedeem` has already logged which.
  if (!result.success || !result.token) {
    return { ok: false, reason: 'redeem-refused' };
  }
  return { ok: true, token: result.token, distribution: dist };
}
