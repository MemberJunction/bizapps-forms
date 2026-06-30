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
 */

/** Frozen configuration for the respondent host page. */
export interface RespondentHostConfig {
  enabled: boolean;
  graphqlUrl: string;
  widgetBundleUrl: string;
}

const DEFAULT_WIDGET_BUNDLE_URL = '/forms/widget/mj-form.js';

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
  });
  return cached;
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
