/**
 * The pure half of downloading a response file: where to ask, and what to say when it fails.
 *
 * Separated from the service because the service is unreachable in this suite — it uses
 * `inject()` and there is no Angular JIT in a node test environment — while these two decisions
 * are exactly the ones worth pinning. A wrong URL and a wrong sentence are the two ways this
 * feature disappoints someone, and neither needs a browser to check.
 */

/** Base path of MJAPI's response-file download route. Mirrors `Server/src/download/config.ts`. */
export const DOWNLOAD_PATH = '/forms/files';

/**
 * The URL to fetch one response file from.
 *
 * Built against the API ORIGIN, never `window.location.origin`: the builder runs inside Explorer,
 * which is a different origin from MJAPI, and using the browser's own origin is what once
 * produced an Explorer login page where a form should have been. Returns '' when the origin
 * cannot be resolved, so the caller reports a configuration problem rather than fetching from a
 * URL that means something else.
 */
export function downloadUrl(apiOrigin: string, fileId: string): string {
  const origin = apiOrigin.replace(/\/+$/, '');
  const id = fileId.trim();
  if (!origin || !id) {
    return '';
  }
  return `${origin}${DOWNLOAD_PATH}/${encodeURIComponent(id)}`;
}

/**
 * What to tell the reader when a download does not arrive.
 *
 * The server writes a usable sentence for every refusal it makes, so its message wins whenever
 * there is one. The fallbacks below distinguish the two cases a reader can act on differently:
 * something about this file (it is gone — stop retrying) and something about this moment (try
 * again). A bare status code helps nobody outside a spec.
 */
export function downloadErrorMessage(status: number, body: unknown): string {
  const fromServer = serverErrorText(body);
  if (fromServer) {
    return fromServer;
  }
  if (status === 401 || status === 403) {
    return 'Your session cannot read this file. Try reloading the page.';
  }
  if (status >= 400 && status < 500) {
    return 'That file is no longer available.';
  }
  return 'The download did not go through. Please try again.';
}

/** The `error` string from the route's JSON body, or null when there is not one. */
function serverErrorText(body: unknown): string | null {
  const parsed = typeof body === 'string' ? tryParse(body) : body;
  if (typeof parsed === 'object' && parsed !== null) {
    const error = (parsed as Record<string, unknown>)['error'];
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim();
    }
  }
  return null;
}

/** JSON.parse that answers null instead of throwing — a proxy's HTML error page is not JSON. */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
