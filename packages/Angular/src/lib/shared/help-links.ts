/**
 * Where a stuck author goes next: the published help centre.
 *
 * One constant rather than the same origin pasted into five empty-state templates. The site moves
 * as a unit — a rename of the Pages site or of an article should be one edit here, not a hunt for a
 * string through templates nobody thinks to grep.
 *
 * ── THE URL SHAPE ──────────────────────────────────────────────────────────────────────────────
 * The help centre is a Docsify site served from `docs/help/`, so an article's URL is the site root,
 * then `#/`, then the article's path on disk with its `.md` dropped: `build/logic.md` is
 * `…/help/#/build/logic`. `docs/help/index.html` sets `relativePath: true`, which governs how links
 * INSIDE an article resolve; it does not change the route shape, so these stay as written.
 *
 * ── WHY THE PUBLISHED SITE AND NOT SOMETHING WE SERVE ──────────────────────────────────────────
 * The help centre ships as GitHub Pages out of `docs/`, not inside this package, so there is no
 * local copy for these to point at. The site and this package reach a host in the same release,
 * which is what makes them live the first time a user sees them; a developer running an unreleased
 * branch against an older published site can get a 404 on an article that has not shipped yet, and
 * that is the accepted cost of not bundling a second copy of the documentation into the widget.
 */
export const HELP_BASE_URL = 'https://memberjunction.github.io/bizapps-forms/help/';

/**
 * The articles the in-product empty states link to, keyed by the question the reader is asking at
 * the moment they see one. Anything added here wants an empty state (or equivalent dead end) that
 * actually links to it — an unreferenced entry is a link nobody can follow.
 */
export const HELP_LINKS = {
  /** "No forms yet" — how to get from nothing to a form that has taken a real answer. */
  firstForm: `${HELP_BASE_URL}#/get-started/first-form`,
  /** "Share this form" — what a share link is and what it lets someone do. */
  shareLink: `${HELP_BASE_URL}#/share/share-link`,
  /** "Do more with each submission" — what can happen when an answer arrives. */
  afterSubmit: `${HELP_BASE_URL}#/automate/after-submit`,
  /** "No rules yet" — showing, skipping and branching on what someone answered. */
  logic: `${HELP_BASE_URL}#/build/logic`,
  /** "Nothing to report on yet" — publishing, which is what a report is waiting on. */
  publish: `${HELP_BASE_URL}#/share/publish`,
} as const;
