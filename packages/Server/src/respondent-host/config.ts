/**
 * Environment-driven configuration for the public respondent host page (TASK 2).
 *
 * Read once and memoized. Defaults are safe for local dev (MJAPI on :4121, GraphQL at the
 * root path); production overrides via the MJAPI `.env`.
 *
 * Env vars:
 *  - `FORMS_RESPONDENT_HOST_ENABLED`  `false` to turn the page off. Default on.
 *  - `FORMS_GRAPHQL_URL`              Absolute GraphQL endpoint the widget submits to.
 *                                     Defaults to `MJAPI_PUBLIC_URL` + `GRAPHQL_ROOT_PATH`.
 *  - `FORMS_WIDGET_BUNDLE_URL`        URL of the built `<mj-form>` element bundle the page
 *                                     loads. Defaults to `/forms/widget/mj-form.js`
 *                                     (served once the widget bundle build is wired — see
 *                                     FORMS_BUILD_PLAN; until then set this to a CDN/built
 *                                     bundle URL).
 *  - `FORMS_MAGICLINK_REDEEM_URL`     Absolute URL of core's magic-link redeem endpoint the
 *                                     route POSTs the raw token to (server-side redeem). The
 *                                     mount path is fixed at `/magic-link/redeem` in MJ core, so
 *                                     this defaults to `MJAPI_PUBLIC_URL` + `/magic-link/redeem`.
 *  - `FORMS_DEVICE_RESUME_ENABLED`    `false` to turn same-device resume off for the whole host,
 *                                     whatever an individual link's AllowDeviceResume says. The
 *                                     per-link switch is the owner's; this one is the operator's.
 *  - `FORMS_DEVICE_RESUME_DAYS`       How long a device pointer lives, in days. Default 15. The
 *                                     window SLIDES: every resume rotates the token and starts a
 *                                     fresh one, so a respondent who keeps coming back keeps the
 *                                     draft. Capped by the link's own CloseAt either way.
 *  - `FORMS_RESUME_COOKIE_SECURE`     `false` to omit `Secure` from the pointer cookie, for a host
 *                                     serving the respondent page over plain http. Never set this
 *                                     on a TLS deployment: it puts a bearer token in clear.
 *  - `FORMS_RESUME_LINK_DAYS`         Emailed resume link lifetime, in days. Default 30. Fixed,
 *                                     not sliding — the re-send flow is what a respondent past it
 *                                     uses.
 *  - `FORMS_RESUME_LINK_MAX_USES`     Redemptions an emailed link allows. Default 25: several
 *                                     sittings, plus the mail scanners that open a link before its
 *                                     recipient does.
 *  - `FORMS_TURNSTILE_SITE_KEY`       Public Cloudflare Turnstile site key, passed to `<mj-form>`
 *                                     so captcha-required forms can render the challenge. Unset =
 *                                     no challenge rendered (a captcha-on form then shows the
 *                                     widget's config-gap message).
 */

/** Frozen configuration for the respondent host page. */
export interface RespondentHostConfig {
  enabled: boolean;
  graphqlUrl: string;
  widgetBundleUrl: string;
  /** Absolute URL of core's magic-link redeem endpoint (server-side redeem target). */
  magicLinkRedeemUrl: string;
  /** Public Turnstile site key baked into `<mj-form>` (undefined when captcha isn't configured). */
  turnstileSiteKey: string | undefined;
  /** Host-wide kill switch for same-device resume. The per-link switch is separate and narrower. */
  deviceResumeEnabled: boolean;
  /** Device pointer lifetime in days, capped by the link's CloseAt at mint time. */
  deviceResumeDays: number;
  /** Whether the pointer cookie carries `Secure`. Off only for an http host — see the env doc. */
  resumeCookieSecure: boolean;
  /** Emailed resume link lifetime in days. */
  resumeLinkDays: number;
  /** Redemptions an emailed resume link allows. */
  resumeLinkMaxUses: number;
}

/** Positive-number env read with a default; anything unusable falls back rather than disabling. */
function positiveNumberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DEFAULT_WIDGET_BUNDLE_URL = '/forms/widget/mj-form.js';
/** Core mounts the magic-link redeem route at this fixed path (not configurable in MJ 5.43.0). */
const MAGIC_LINK_REDEEM_PATH = '/magic-link/redeem';

let cached: RespondentHostConfig | undefined;

/** Read (and memoize) the respondent host configuration from the environment. */
export function getRespondentHostConfig(): RespondentHostConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    enabled: process.env.FORMS_RESPONDENT_HOST_ENABLED?.trim() !== 'false',
    graphqlUrl: resolveGraphqlUrl(),
    widgetBundleUrl: process.env.FORMS_WIDGET_BUNDLE_URL?.trim() || DEFAULT_WIDGET_BUNDLE_URL,
    magicLinkRedeemUrl: resolveMagicLinkRedeemUrl(),
    turnstileSiteKey: process.env.FORMS_TURNSTILE_SITE_KEY?.trim() || undefined,
    // On unless explicitly turned off, like the host page itself: a Forms install gets resume for
    // free, and an operator who does not want it says so once.
    deviceResumeEnabled: process.env.FORMS_DEVICE_RESUME_ENABLED?.trim() !== 'false',
    deviceResumeDays: positiveNumberFromEnv('FORMS_DEVICE_RESUME_DAYS', 15),
    resumeCookieSecure: process.env.FORMS_RESUME_COOKIE_SECURE?.trim() !== 'false',
    resumeLinkDays: positiveNumberFromEnv('FORMS_RESUME_LINK_DAYS', 30),
    resumeLinkMaxUses: positiveNumberFromEnv('FORMS_RESUME_LINK_MAX_USES', 25),
  });
  return cached;
}

/**
 * Resolve the magic-link redeem endpoint the route POSTs the raw token to. Prefers an explicit
 * `FORMS_MAGICLINK_REDEEM_URL`; otherwise composes it from the API's public URL + the fixed
 * `/magic-link/redeem` mount path (same MJAPI origin the GraphQL endpoint is derived from).
 */
function resolveMagicLinkRedeemUrl(): string {
  const explicit = process.env.FORMS_MAGICLINK_REDEEM_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const base = (process.env.MJAPI_PUBLIC_URL?.trim() || 'http://localhost:4121').replace(/\/$/, '');
  return `${base}${MAGIC_LINK_REDEEM_PATH}`;
}

/**
 * Resolve the GraphQL endpoint the widget posts to. Prefers an explicit `FORMS_GRAPHQL_URL`;
 * otherwise composes it from the API's public URL + the GraphQL root path (defaults match
 * the MJAPI dev config: `http://localhost:4121` + `/`).
 */
function resolveGraphqlUrl(): string {
  const explicit = process.env.FORMS_GRAPHQL_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const base = (process.env.MJAPI_PUBLIC_URL?.trim() || 'http://localhost:4121').replace(/\/$/, '');
  const rootPath = process.env.GRAPHQL_ROOT_PATH?.trim() || '/';
  const path = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;
  return `${base}${path === '/' ? '' : path}` || base;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetRespondentHostConfigForTests(): void {
  cached = undefined;
}
