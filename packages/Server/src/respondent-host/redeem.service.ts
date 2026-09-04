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
import { LogError, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
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

/** Minimal shape of core's `RedeemMagicLinkResult` JSON (the fields this flow reads). */
export interface RedeemMagicLinkJsonResult {
  success: boolean;
  /** The minted RS256 anonymous session JWT (present only on success). */
  token?: string;
  error?: string;
  errorCode?: string;
}

/** Why a slug could not be turned into a redeemed session token. */
export type RedeemFailureReason =
  | 'distribution-not-found'
  | 'distribution-not-yet-open'
  | 'distribution-closed'
  | 'distribution-full'
  | 'form-unpublished'
  | 'no-token'
  | 'redeem-failed';

/** Outcome of {@link redeemSlugToToken}. Flat (non-discriminated) shape to match the package's
 * non-`strictNullChecks` compile, like the public-submit services. */
export interface RedeemOutcome {
  ok: boolean;
  /** The redeemed anonymous session JWT, on success. */
  token?: string;
  /** Why it failed, on failure. */
  reason?: RedeemFailureReason;
  /** When the link opens — set with `distribution-not-yet-open` only, so the page can say when. */
  opensAt?: Date;
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

/** Load the distribution row for a slug, or `undefined` if the read fails / no row matches. */
async function loadDistribution(
  deps: RedeemDeps,
  slug: string,
): Promise<mjBizAppsFormsFormDistributionEntityType | undefined> {
  const result = await deps.provider.RunView<mjBizAppsFormsFormDistributionEntityType>(
    {
      EntityName: FORM_DISTRIBUTION_ENTITY,
      ExtraFilter: `Slug=${quoteSqlString(slug)}`,
      ResultType: 'simple',
      MaxRows: 1,
    },
    deps.contextUser,
  );
  // RunView never throws — check Success.
  if (!result.Success) {
    return undefined;
  }
  return result.Results[0];
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
 * POST the raw token to core's redeem endpoint with `format=json` and return the parsed result.
 * Returns `undefined` on any transport/parse failure so the caller can fail-safe to an error page.
 */
async function postRedeem(
  deps: RedeemDeps,
  rawToken: string,
): Promise<RedeemMagicLinkJsonResult | undefined> {
  // Core reads `format` from the query string only; the body carries `{ token }` as JSON.
  // POST only — a GET with format=json is 405 by design.
  const url = `${deps.redeemUrl}?format=json`;
  let response: Response;
  try {
    response = await deps.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = await response.json();
    return isRedeemResult(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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
 * route can render the matching error page and stay fail-safe.
 */
export async function redeemSlugToToken(deps: RedeemDeps, slug: string): Promise<RedeemOutcome> {
  if (!slug) {
    return { ok: false, reason: 'distribution-not-found' };
  }
  const dist = await loadDistribution(deps, slug);
  if (!dist) {
    return { ok: false, reason: 'distribution-not-found' };
  }
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
  const result = await postRedeem(deps, judged.rawToken);
  if (!result || !result.success || !result.token) {
    return { ok: false, reason: 'redeem-failed' };
  }
  return { ok: true, token: result.token };
}
