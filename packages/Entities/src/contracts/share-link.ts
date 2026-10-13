/**
 * The shape of a share link's public address and of the slug in it — one rule for every writer.
 *
 * Two places compose a respondent URL: the server's `FormDistributionEngine` (from the host's public
 * API address, returned by every distribution verb) and the builder (from the API it is configured
 * to talk to, for links it lists). They must agree to the character, or the link an author copies
 * from one surface differs from the link another shows them. Two places also derive a slug until
 * the builder stops creating links itself. So the rule lives here, once.
 *
 * Exported from the package root only, not the `./contracts` barrel the respondent widget bundles:
 * no respondent ever builds a share link.
 */

/** Path segment the respondent host page is served under (`/f/:slug`, `RespondentHostMiddleware`). */
const RESPONDENT_PATH = '/f/';

/** The longest slug the derivation produces, and the longest one a caller may ask for. */
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
