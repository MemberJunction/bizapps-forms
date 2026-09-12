/**
 * What `app.get(route, …)` claimed, as functions a plain `app.use` handler can call.
 *
 * A route moved out of Express's router into a pre-auth handler (#121, #181) loses path-to-regexp,
 * and with it three behaviours the app's defaults gave it for free: `case sensitive routing` and
 * `strict routing` are both OFF, and a `:param` arrives percent-decoded. Re-deriving those rules at
 * each call site is how a move quietly narrows what a public URL answers — a mis-cased link then
 * falls through to MJAPI's authenticated routes and returns a 401 nobody can explain.
 *
 * Deliberately no WIDER than the router was either, which is why neither function is a general
 * path normaliser: exactly one trailing slash is dropped (`…/abc//` stays unclaimed, as it was) and
 * the literal part is never percent-decoded (`/favicon%2Eico` stays unclaimed, as it was).
 *
 * Verified against a live Express 5.2.1 app case by case — see the design doc's parity table and
 * `__tests__/route-match.spec.ts`, which is that table.
 */

/**
 * Drop at most ONE trailing slash.
 *
 * That is the whole of Express's non-strict tolerance: `/f/abc/` is `/f/abc`, and `/f/abc//` is
 * neither. A loop here would be the easy mistake — it would claim URLs the router refused.
 */
function withoutOneTrailingSlash(requestPath: string): string {
  return requestPath.endsWith('/') ? requestPath.slice(0, -1) : requestPath;
}

/** Does `requestPath` name `route`, on the terms `app.get(route, …)` used? */
export function matchesExactRoute(requestPath: string, route: string): boolean {
  return withoutOneTrailingSlash(requestPath).toLowerCase() === route.toLowerCase();
}

/**
 * The single decoded segment under `prefix` — the `:param` of `app.get(`${prefix}/:param`, …)` —
 * or `undefined` when this request is not that route.
 *
 * `prefix` is a literal path with no trailing slash (`/f`, `/forms/asset`). The segment must be
 * exactly one non-empty path segment, so `/f/`, `/f/a/b` and `/f/abc//` all decline, as they did.
 *
 * THE ONE DIVERGENCE: a segment that cannot be percent-decoded declines here, where the router
 * threw a `URIError` that Express turned into a 400. It is a deliberate, documented choice — a
 * malformed escape names no distribution and no real link produces one, and `resume-routes.ts`
 * already made exactly this choice for the sibling routes, so the package has one rule rather
 * than two. See the design doc §4.2.
 */
export function matchSingleSegmentRoute(requestPath: string, prefix: string): string | undefined {
  const path = withoutOneTrailingSlash(requestPath);
  if (path.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase() || path[prefix.length] !== '/') {
    return undefined;
  }
  const segment = path.slice(prefix.length + 1);
  if (segment.length === 0 || segment.includes('/')) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
