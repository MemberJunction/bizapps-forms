/**
 * Server-side magic-link redeem for the public respondent host route (`/f/:slug`).
 *
 * This closes the "link → login" gap the {@link RespondentHostMiddleware} header documents:
 * a respondent must reach `<mj-form>` holding the *redeemed* anonymous session JWT, never the
 * raw `PublicLinkToken` (the S1 resolvers call `GetUserFromPayload` and throw with no session).
 * Rather than wait for the core change that re-points `MagicLinkRouter.sendRedeemResult` at
 * `/f/:slug`, the route does the redeem itself, here, before rendering the host page:
 *
 *   1. Resolve `:slug` → the `FormDistribution` row and read its raw `PublicLinkToken`.
 *   2. POST that token to core's redeem endpoint with `format=json` so it returns the session
 *      JWT as JSON (instead of a 302 to Explorer).
 *   3. Hand the JWT to the host page via an escaped `data-token` attribute.
 *
 * Everything that touches the network or the DB is injected ({@link RedeemDeps}) so the flow is
 * unit-testable without a live server: tests pass a fake distribution loader and a stub `fetch`.
 */
import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormDistributionEntityType } from '@mj-biz-apps/forms-entities';

const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';

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
  | 'distribution-closed'
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
}

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

/** Escape a string literal for safe inclusion in a RunView `ExtraFilter`. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Distribution is open for redemption if active, not Closed, and within its open/close window. */
function distributionIsOpen(dist: mjBizAppsFormsFormDistributionEntityType, now: Date): boolean {
  if (!dist.IsActive || dist.Status === 'Closed') {
    return false;
  }
  if (dist.OpenAt && new Date(dist.OpenAt) > now) {
    return false;
  }
  if (dist.CloseAt && new Date(dist.CloseAt) < now) {
    return false;
  }
  return true;
}

/** Load the distribution row for a slug, or `undefined` if the read fails / no row matches. */
async function loadDistribution(
  deps: RedeemDeps,
  slug: string,
): Promise<mjBizAppsFormsFormDistributionEntityType | undefined> {
  const result = await deps.provider.RunView<mjBizAppsFormsFormDistributionEntityType>(
    {
      EntityName: FORM_DISTRIBUTION_ENTITY,
      ExtraFilter: `Slug=${sqlString(slug)}`,
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
  if (!distributionIsOpen(dist, new Date())) {
    return { ok: false, reason: 'distribution-closed' };
  }
  const rawToken = dist.PublicLinkToken;
  if (!rawToken) {
    return { ok: false, reason: 'no-token' };
  }

  const result = await postRedeem(deps, rawToken);
  if (!result || !result.success || !result.token) {
    return { ok: false, reason: 'redeem-failed' };
  }
  return { ok: true, token: result.token };
}
