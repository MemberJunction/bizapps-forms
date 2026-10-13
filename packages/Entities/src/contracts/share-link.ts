/**
 * The shape of a share link's public address and of the slug in it — one rule for every writer.
 *
 * Two places compose a respondent URL: the server's `FormDistributionEngine` (against
 * `MJAPI_PUBLIC_URL`, returned by every distribution verb) and the builder (against the origin of the
 * API it is configured to talk to, for links it lists). This function fixes the SHAPE both produce —
 * `<base>/f/<encoded slug>` — so they cannot disagree about it. It does not make them agree: the two
 * bases differ on a host behind a path-prefixing proxy, where the internal API address differs from
 * the public one, or where `MJAPI_PUBLIC_URL` is unset — the server then returns no URL, which is why
 * the builder keeps composing its own for display. Slugs are derived on the server only; the builder
 * creates links through `Forms.IssueDistributionLink`. So the rule lives here, once.
 *
 * Exported from the package root only, not the `./contracts` barrel the respondent widget bundles:
 * no respondent ever builds a share link.
 */

/** Path segment the respondent host page is served under (`/f/:slug`, `RespondentHostMiddleware`). */
const RESPONDENT_PATH = '/f/';

/**
 * The longest slug Forms produces — derived ({@link slugify}) or de-duplicated ({@link suffixedSlug})
 * — and the longest one a caller may ask for, so any slug Forms hands out is also a valid request.
 */
export const SLUG_MAX_LENGTH = 60;

/** Lowercase words of letters and digits joined by single hyphens. */
const SLUG_GRAMMAR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The address a respondent opens: the `/f/:slug` host page, which redeems the link's anonymous
 * credential server-side and renders the shell-free widget. Never the raw
 * `/magic-link/redeem?token=` URL — that bounces a browser to the Explorer login shell.
 *
 * `base` is the API's public base (origin plus any reverse-proxy path prefix); trailing slashes are
 * dropped so the join is clean.
 */
export function respondentUrl(slug: string, base: string): string {
  return `${base.replace(/\/+$/, '')}${RESPONDENT_PATH}${encodeURIComponent(slug)}`;
}

/**
 * Turn a link name into a slug: lowercase, ASCII letters and digits, single hyphens, at most
 * {@link SLUG_MAX_LENGTH} characters, never starting or ending with a hyphen. A name with nothing
 * usable in it becomes `form-<random>`.
 */
export function slugify(name: string, randomSuffix: () => string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    // The cut can land on a separator; a slug ending in '-' fails its own grammar.
    .replace(/-+$/, '');
  return base.length > 0 ? base : `form-${randomSuffix()}`;
}

/** A short random token for a slug (5 base-36 characters). Not a secret: the slug is public. */
export function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 7).padEnd(5, '0');
}

/**
 * `base` made distinct with `-<suffix>`, trimming `base` first so the result still fits
 * {@link SLUG_MAX_LENGTH} and the grammar (a trim that lands on a hyphen drops it).
 */
export function suffixedSlug(base: string, suffix: string): string {
  const room = SLUG_MAX_LENGTH - suffix.length - 1;
  return `${base.slice(0, room).replace(/-+$/, '')}-${suffix}`;
}

/** Why `slug` is not a usable slug, or `null` when it is. */
export function slugRefusal(slug: string): string | null {
  if (slug.length <= SLUG_MAX_LENGTH && SLUG_GRAMMAR.test(slug)) {
    return null;
  }
  return (
    `"${slug.slice(0, SLUG_MAX_LENGTH + 10)}" is not a usable slug: use lowercase letters and digits joined by single ` +
    `hyphens, at most ${SLUG_MAX_LENGTH} characters.`
  );
}

/**
 * Is this link open to responses — the state the Distribute tab's switch is labelled with?
 *
 * `Status = 'Active'` AND `IsActive`, both. That is the pair the server's provisioning requires
 * before it warrants a credential, and the pair `Forms.OpenDistribution` writes. Reading either half
 * alone answers a different question while wearing the same label: the builder's switch once drew a
 * link at `Status = 'Active', IsActive = 0` as ON beside a "Paused" badge, and its click handler,
 * reading the same half-predicate, concluded the link was open and CLOSED it.
 *
 * ONE definition for the builder and `FormDistributionEngine`, which each carried a copy.
 */
export function isOpenToResponses(link: { Status: string; IsActive: boolean }): boolean {
  return link.IsActive === true && link.Status === 'Active';
}
