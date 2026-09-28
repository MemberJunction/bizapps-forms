/**
 * Host-independent references to authoring assets (#270).
 *
 * An uploaded image used to be stored as the ABSOLUTE URL of whichever MJAPI took the upload, so a
 * form authored on `localhost` against a shared database, a domain change, a staging→prod copy or
 * a second API instance all left published forms pointing respondents at a host they cannot reach
 * — silently, and unrepairably, because a published snapshot is immutable.
 *
 * The stored form is now the path `/forms/asset/<fileId>`, and a renderer resolves it against the
 * API origin IT is talking to. Recognition is by PATH, on any host, which is what repairs every
 * snapshot published before this change without a migration: `http://localhost:4000/forms/asset/<id>`
 * is read as the same reference as `/forms/asset/<id>`.
 *
 * The one assumption that buys: a URL whose path is exactly `/forms/asset/<guid>` names an asset of
 * the MJ Forms install serving the form. A pasted image from a DIFFERENT Forms install would be
 * re-pointed here and 404. That is judged acceptable — the route is ours, the id is a GUID, and the
 * alternative is leaving every localhost-authored form broken.
 *
 * Pure and dependency-free on purpose: the respondent widget uses it, and the widget must not reach
 * the Explorer shell.
 */
import type { FormStyleTokens, PublishedFormDefinition, PublishedFormScreen } from '@mj-biz-apps/forms-entities/contracts';

export const ASSET_ROUTE = '/forms/asset';

const ASSET_PATH = /^\/forms\/asset\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
/** Base used only to let `URL` parse a relative reference; never appears in any output. */
const PLACEHOLDER_BASE = 'http://placeholder.invalid';

/** The file id when `value` is one of our asset references (any host, any case), else undefined. */
function assetIdOf(value: string): string | undefined {
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

/** Relativise `value` to `/forms/asset/<id>` if it's ours (any host); otherwise return it unchanged. */
export function toAssetRef(value: string): string {
  const id = assetIdOf(value);
  return id ? `${ASSET_ROUTE}/${id}` : value;
}

/** Make `value` absolute on `apiOrigin` if it's ours; unchanged if it's not ours or `apiOrigin` is ''. */
export function resolveAssetUrl(value: string, apiOrigin: string): string {
  const id = assetIdOf(value);
  const origin = apiOrigin.trim().replace(/\/+$/, '');
  return id && origin ? `${origin}${ASSET_ROUTE}/${id}` : value;
}

/** The origin of an absolute http(s) URL, or '' when `url` isn't one (relative, empty, unparseable). */
export function originOf(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return '';
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

const CSS_URL = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi;

/** Rewrite every `url(...)` reference in a CSS string through `map`, preserving its quoting style. */
export function mapCssUrls(css: string, map: (url: string) => string): string {
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
    welcomeScreen: def.welcomeScreen ? mapScreen(def.welcomeScreen, map) : def.welcomeScreen,
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
  return mapDefinitionAssets(def, (url) => resolveAssetUrl(url, originOf(graphqlUrl)));
}

/** Same resolution as {@link resolveDefinitionForRender}, for a bare `FormStyleTokens` (preview styling). */
export function resolveStyleTokensForRender(tokens: FormStyleTokens, graphqlUrl: string): FormStyleTokens {
  return mapStyleTokenAssets(tokens, (url) => resolveAssetUrl(url, originOf(graphqlUrl)));
}
