/**
 * Environment-driven configuration for the public respondent host page (TASK 2).
 *
 * Read once and memoized. Nothing here names a port: where a public URL is not configured, the
 * GraphQL endpoint handed to the browser is derived from each page request's own origin
 * ({@link getGraphqlUrlForRequest}). Production sets it via the MJAPI `.env`.
 *
 * Env vars:
 *  - `FORMS_RESPONDENT_HOST_ENABLED`  `false` to turn the page off. Default on.
 *  - `FORMS_GRAPHQL_URL`              Absolute GraphQL endpoint the widget submits to.
 *                                     Defaults to `MJAPI_PUBLIC_URL` + `GRAPHQL_ROOT_PATH`, and
 *                                     with neither set, to the page request's own origin +
 *                                     `GRAPHQL_ROOT_PATH` (announced at boot — wrong behind a
 *                                     proxy that rewrites Host).
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
  /**
   * The CONFIGURED GraphQL endpoint (`FORMS_GRAPHQL_URL`, else `MJAPI_PUBLIC_URL` + root path), or
   * `undefined` when neither is set. Never read this to address the browser — ask
   * {@link getGraphqlUrlForRequest}, which knows what to do when it is undefined.
   */
  graphqlUrl: string | undefined;
  /** `GRAPHQL_ROOT_PATH` normalised for appending to an origin: `''` for the root, else `/path`. */
  graphqlPath: string;
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
    graphqlUrl: resolveConfiguredGraphqlUrl(),
    graphqlPath: resolveGraphqlPath(),
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
 * Resolve the magic-link redeem endpoint the route POSTs the raw token to.
 *
 * DEFAULTS TO LOOPBACK ON OUR OWN PORT, and that is the whole point of this function. The redeem is
 * a process-LOCAL call: core mounts its magic-link router on the very same Express app this route
 * is served from (`MJServer/src/index.ts`, `app.use(MAGIC_LINK_MOUNT_PATH, ...)` at the app root).
 *
 * It used to be composed from `MJAPI_PUBLIC_URL`, which is the externally-reachable origin — and
 * that variable cannot simply be repointed inward, because {@link resolveConfiguredGraphqlUrl}
 * derives from it too and that value is handed to the RESPONDENT'S BROWSER in the host page. So
 * behind a real proxy the call left the perimeter, resolved back to the proxy, and re-entered —
 * and a reverse proxy APPENDS its peer to `X-Forwarded-For`. `proxy-addr` at `trust proxy = 1` then returns the
 * right-most entry, which is MJAPI's own egress address: one constant for the whole deployment.
 * The respondent address the door forwards was overwritten before core ever read it, so the per-IP
 * bucket this app works to give each respondent silently collapsed back into one — and only in the
 * deployments that have a proxy at all, never on a loopback dev harness, which is where it is
 * measured.
 *
 * Loopback cannot traverse a proxy, so no hop can be appended and there is nothing left to get
 * right. The address is NUMERIC rather than `localhost` so no resolver can send it anywhere else.
 * A split deployment — core genuinely in another process — sets `FORMS_MAGICLINK_REDEEM_URL`, which
 * is still honoured and is now documented in `.env.example`.
 */
function resolveMagicLinkRedeemUrl(): string {
  const explicit = process.env.FORMS_MAGICLINK_REDEEM_URL?.trim();
  if (explicit) {
    return explicit;
  }
  // The port core actually binds: MJServer reads GRAPHQL_PORT and falls back to 4000.
  const port = process.env.GRAPHQL_PORT?.trim() || '4000';
  return `http://127.0.0.1:${port}${MAGIC_LINK_REDEEM_PATH}`;
}

/**
 * The GraphQL endpoint the operator configured: an explicit `FORMS_GRAPHQL_URL`, else the API's
 * public URL + the GraphQL root path. `undefined` when neither is set — deliberately NOT a
 * localhost default. That default (`http://localhost:4121`) was handed to every respondent's
 * browser on any host that had not set `MJAPI_PUBLIC_URL`, so on MJ's own host (:4000) or a branch
 * harness every submit went to a server that was not there, or to another checkout's (#238).
 */
function resolveConfiguredGraphqlUrl(): string | undefined {
  const explicit = process.env.FORMS_GRAPHQL_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const publicUrl = process.env.MJAPI_PUBLIC_URL?.trim();
  return publicUrl ? joinGraphqlPath(publicUrl, resolveGraphqlPath()) : undefined;
}

/** `GRAPHQL_ROOT_PATH` as a suffix for an origin: `''` for the root, else a leading-slash path. */
function resolveGraphqlPath(): string {
  const rootPath = process.env.GRAPHQL_ROOT_PATH?.trim() || '/';
  const path = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;
  return path === '/' ? '' : path;
}

function joinGraphqlPath(base: string, graphqlPath: string): string {
  return `${base.replace(/\/+$/, '')}${graphqlPath}`;
}

/**
 * The GraphQL endpoint to hand the browser that requested one host page.
 *
 * The configured URL wins when there is one: behind a proxy that rewrites Host, only the operator
 * knows the public address. Otherwise it is the origin this request arrived on, because the page
 * at `/f/:slug` is served by the very process that serves GraphQL. Absolute rather than relative
 * on purpose: the widget derives its upload URL from this value, and a bare `/` there becomes the
 * protocol-relative `//forms/upload`, i.e. a request to a host named `forms`.
 *
 * Throws when it has neither, rather than inventing an address. The route turns that into its
 * ordinary 500 page and logs this message.
 */
export function getGraphqlUrlForRequest(
  cfg: Pick<RespondentHostConfig, 'graphqlUrl' | 'graphqlPath'>,
  requestOrigin: string | undefined,
): string {
  if (cfg.graphqlUrl) {
    return cfg.graphqlUrl;
  }
  if (!requestOrigin) {
    throw new Error(
      'Cannot address GraphQL for the respondent page: FORMS_GRAPHQL_URL and MJAPI_PUBLIC_URL are ' +
        'unset and the request carried no Host header to derive an origin from.',
    );
  }
  return joinGraphqlPath(requestOrigin, cfg.graphqlPath);
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetRespondentHostConfigForTests(): void {
  cached = undefined;
}
