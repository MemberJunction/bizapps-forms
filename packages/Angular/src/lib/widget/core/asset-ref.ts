/**
 * Host-independent references to authoring assets (#270).
 *
 * An uploaded image used to be stored as the ABSOLUTE URL of whichever MJAPI took the upload, so a
 * form authored on `localhost` against a shared database, a domain change, a staging→prod copy or
 * a second API instance all left published forms pointing respondents at a host they cannot reach
 * — silently, and unrepairably, because a published snapshot is immutable.
 *
 * The stored form is now the path `/forms/asset/<fileId>`, RELATIVE TO THE API BASE — not the bare
 * origin — because MJAPI can itself be deployed behind a path prefix (e.g. a reverse proxy serving
 * it at `https://h/api/graphql`). A renderer resolves the stored path against `apiBaseOf(graphqlUrl)`,
 * which carries that prefix forward. Recognition is by PATH SUFFIX, under any host and any prefix,
 * which is what repairs every snapshot published before this change without a migration:
 * `http://localhost:4000/forms/asset/<id>` and `https://h/api/forms/asset/<id>` are both read as the
 * same reference as `/forms/asset/<id>`.
 *
 * The one assumption that buys: a URL whose path ENDS in `/forms/asset/<guid>` (whatever comes
 * before it) names an asset of the MJ Forms install serving the form. A pasted image from a
 * DIFFERENT Forms install would be re-pointed here and 404. That is judged acceptable — the route
 * is ours, the id is a GUID, and the alternative is leaving every localhost-authored form broken.
 *
 * WHICH PREFIX IS SUPPORTED. MJServer mounts every Forms route (`/forms/*`, and core's
 * `/magic-link/redeem`) at its app ROOT; only GraphQL moves under `GRAPHQL_ROOT_PATH`. So the rule
 * here — the same one `deriveUploadUrl` in `../api/forms-api.config.ts` already uses for respondent
 * uploads — is "Forms routes live at the api-url minus a trailing `/graphql`". That holds for a
 * reverse-proxy path prefix carried in `MJAPI_PUBLIC_URL` (the proxy strips it before MJAPI sees the
 * request, so everything lives under it), and for a `GRAPHQL_ROOT_PATH` of `/` or exactly
 * `/graphql`. It does NOT hold for any other `GRAPHQL_ROOT_PATH` (e.g. `/api`, or `/api/graphql`,
 * which strips to `/api`): that moves GraphQL alone, so `/api/forms/asset/<id>` 404s. That configuration is unsupported, and forms-server warns
 * about it at boot (`graphqlRootPathWarning` in `respondent-host/config.ts`).
 *
 * Pure and dependency-free on purpose: the respondent widget uses it, and the widget must not reach
 * the Explorer shell.
 */
import type { FormStyleTokens, PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities/contracts';

/**
 * Mirrors `ASSET_ROUTE` in forms-server's `src/asset/config.ts`, which mounts the route. Duplicated
 * on purpose: sharing one constant would need a dependency between the two packages, and the
 * widget must stay free of server code. Change both together.
 */
export const ASSET_ROUTE = '/forms/asset';

// No leading `^`: the route is recognised as a PATH SUFFIX so a prefix MJAPI is deployed behind
// (e.g. `/api`) doesn't stop it being ours — see the module header.
const ASSET_PATH = /\/forms\/asset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
/** Base used only to let `URL` parse a relative reference; never appears in any output. */
const PLACEHOLDER_BASE = 'http://placeholder.invalid';

/** The file id when `value` is one of our asset references (any host, any prefix, any case), else undefined. */
function assetIdOf(value: string): string | undefined {
  // Typed `string`, but a stored snapshot is whatever `JSON.parse` returned: a non-string here is
  // corrupt data, which is not ours to recognise — and must not throw out of a render or a diff.
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') && !/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(trimmed, PLACEHOLDER_BASE);
  } catch {
    return undefined;
  }
  if (url.search || url.hash) {
    // A query string or fragment means this isn't the bare asset reference we minted — treat it
    // as a URL we don't own rather than guess at what the extra part means.
    return undefined;
  }
  return ASSET_PATH.exec(url.pathname)?.[1];
}

/** Relativise `value` to `/forms/asset/<id>` if it's ours (any host/prefix); otherwise return it unchanged. */
export function toAssetRef(value: string): string {
  const id = assetIdOf(value);
  return id ? `${ASSET_ROUTE}/${id}` : value;
}

/** Make `value` absolute on `apiBase` if it's ours; unchanged if it's not ours or `apiBase` is ''. */
export function resolveAssetUrl(value: string, apiBase: string): string {
  const id = assetIdOf(value);
  const base = apiBase.trim().replace(/\/+$/, '');
  return id && base ? `${base}${ASSET_ROUTE}/${id}` : value;
}

/**
 * The API BASE a renderer should resolve asset references against: the origin of `graphqlUrl`
 * PLUS whatever path prefix it's deployed under, with a trailing `/graphql` segment (MJAPI's
 * GraphQL endpoint, case-insensitive, optional trailing slash) and any trailing slash removed.
 * `''` when `graphqlUrl` isn't an absolute http(s) URL (empty, relative, unparseable).
 *
 * This mirrors `deriveUploadUrl` in `../api/forms-api.config.ts`, which keeps the same prefix when
 * deriving the upload endpoint from `graphqlUrl` — the origin alone is wrong for the same reason
 * there: an MJAPI reverse-proxied at `/api` serves assets at `/api/forms/asset/<id>`, not at the
 * bare origin.
 *
 * The constraint that buys (see the module header): a path prefix is assumed to be where ALL of
 * MJAPI lives, which is true of a reverse-proxy prefix in `MJAPI_PUBLIC_URL` and false of a
 * `GRAPHQL_ROOT_PATH` other than `/` or exactly `/graphql` — MJServer moves only GraphQL
 * there, leaving `/forms/*` at the root. That second configuration is unsupported, not handled.
 */
export function apiBaseOf(graphqlUrl: string): string {
  const trimmed = graphqlUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }
  const path = url.pathname.replace(/\/graphql\/?$/i, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

const CSS_URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;

/** Rewrite every `url(...)` reference in a CSS string through `map`, preserving its quoting style. */
export function mapCssUrls(css: string, map: (url: string) => string): string {
  // Same runtime guard as `assetIdOf`: stored token JSON is untyped, and a non-string CSS value is
  // left exactly as found rather than throwing out of `replace`.
  if (typeof css !== 'string') {
    return css;
  }
  return css.replace(CSS_URL, (whole, quote: string, inner: string) => {
    const mapped = map(inner);
    return mapped === inner ? whole : `url(${quote}${mapped}${quote})`;
  });
}

/** Map `tokens.logoURL` (if present) and every asset url() inside `cssVariables`/`customCSS`. */
export function mapStyleTokenAssets(tokens: FormStyleTokens, map: (url: string) => string): FormStyleTokens {
  const cssVariables: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens.cssVariables)) {
    cssVariables[key] = mapCssUrls(value, map);
  }
  const mapped: FormStyleTokens = { ...tokens, cssVariables };
  if (tokens.customCSS) {
    mapped.customCSS = mapCssUrls(tokens.customCSS, map);
  }
  if (tokens.logoURL) {
    mapped.logoURL = map(tokens.logoURL);
  }
  return mapped;
}

/** Map a welcome/ending screen's `mediaURL`, if present, leaving it absent when it was absent. */
function mapScreen(screen: PublishedFormScreen, map: (url: string) => string): PublishedFormScreen {
  return screen.mediaURL ? { ...screen, mediaURL: map(screen.mediaURL) } : screen;
}

/**
 * Rewrite every asset reference reachable from a published form definition through `map` — the
 * welcome/ending screens' `mediaURL`, every `PictureChoice` option's `imageURL`, and the style
 * tokens (logo + CSS asset urls). Never mutates `def`; fields absent on input stay absent.
 */
export function mapDefinitionAssets(
  def: PublishedFormDefinition,
  map: (url: string) => string,
): PublishedFormDefinition {
  return {
    ...def,
    // Conditional spread, not `welcomeScreen: def.welcomeScreen ? ... : def.welcomeScreen`: the
    // ternary's else-branch still WRITES the key (as `undefined`), which is exactly the leaked
    // implementation detail the rest of this module goes out of its way to avoid.
    ...(def.welcomeScreen ? { welcomeScreen: mapScreen(def.welcomeScreen, map) } : {}),
    endScreens: def.endScreens.map((screen) => mapScreen(screen, map)),
    styleTokens: mapStyleTokenAssets(def.styleTokens, map),
    pages: def.pages.map((page) => ({
      ...page,
      questions: page.questions.map((question) => ({
        ...question,
        options: question.options.map((option) =>
          option.imageURL ? { ...option, imageURL: map(option.imageURL) } : option,
        ),
      })),
    })),
  };
}

/**
 * Resolve every asset reference in a published form definition against the API origin a renderer
 * is actually talking to. This is the seam `MjFormComponent.load()` calls at render time: the
 * GraphQL endpoint a widget instance is configured with is the one host guaranteed to be
 * reachable from this browser and to serve these bytes, which the upload-time host is not.
 */
export function resolveDefinitionForRender(
  def: PublishedFormDefinition,
  graphqlUrl: string,
): PublishedFormDefinition {
  // Computed once up front, not inside the per-URL closure: it's the same value for every asset
  // reference in the definition, and `apiBaseOf` re-parsing `graphqlUrl` on every call would be
  // repeated, pointless work for a value that never changes across the walk.
  const apiBase = apiBaseOf(graphqlUrl);
  return mapDefinitionAssets(def, (url) => resolveAssetUrl(url, apiBase));
}

/** Same resolution as {@link resolveDefinitionForRender}, for a bare `FormStyleTokens` (preview styling). */
export function resolveStyleTokensForRender(tokens: FormStyleTokens, graphqlUrl: string): FormStyleTokens {
  const apiBase = apiBaseOf(graphqlUrl);
  return mapStyleTokenAssets(tokens, (url) => resolveAssetUrl(url, apiBase));
}
