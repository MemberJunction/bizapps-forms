/**
 * Which resume route a request is for — the pure half of the three host routes (#138).
 *
 * Separated from the handlers so the matching can be tested without an HTTP server, and so the
 * middleware's own filter is one call rather than a regex repeated per route. The three routes hang
 * off the existing `/f/:slug` page, because the cookie is path-scoped to exactly that prefix and a
 * route outside it would never receive the pointer.
 */

/** What a matched resume request wants done. */
export type ResumeAction = 'resume' | 'remember' | 'forget';

/** A matched route: the action, and the form it is about. */
export interface ResumeRouteMatch {
  action: ResumeAction;
  slug: string;
}

/**
 * The three actions, by their path segment. A table rather than a switch so the matcher and any
 * future caller enumerate the same set.
 */
const ACTIONS: Record<string, ResumeAction> = {
  resume: 'resume',
  remember: 'remember',
  forget: 'forget',
};

/**
 * Match `POST /f/:slug/<action>`, or nothing.
 *
 * POST ONLY, and that is a rule rather than a convention: a GET that redeemed would let a mail
 * scanner, a link preview or a browser prefetch spend one of an invite's uses before its owner ever
 * clicked. The page route beside these stays side-effect-free for the same reason — it reads the
 * cookie's PRESENCE and never its value.
 *
 * The slug must be a single non-empty segment: `/f//resume` and `/f/a/b/resume` match nothing,
 * because neither names one form and both would otherwise reach a handler with a slug it could not
 * resolve.
 */
export function matchResumeRoute(method: string, path: string): ResumeRouteMatch | undefined {
  if (method !== 'POST') {
    return undefined;
  }
  const segments = path.split('/');
  // ['', 'f', '<slug>', '<action>']
  if (segments.length !== 4 || segments[0] !== '' || segments[1] !== 'f') {
    return undefined;
  }
  const slug = decodeSegment(segments[2]);
  const action = ACTIONS[segments[3]];
  if (!slug || !action) {
    return undefined;
  }
  return { action, slug };
}

/**
 * A path segment as the slug it encodes, or empty when it is not one.
 *
 * Decoded because the cookie's own `Path` is percent-encoded, so a slug that needed encoding
 * arrives encoded here too — matching the raw segment would then fail to find the distribution.
 */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}
