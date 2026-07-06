/**
 * Pure helpers for deriving the public artifacts of a distribution (slug, public
 * URL, redeem URL, embed snippet). Kept free of Angular/MJ so they are trivially
 * unit-testable and reusable by {@link DistributionService}.
 */

/** Strip trailing slashes from a base URL so path joins are clean. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** The slug-friendly respondent URL for a distribution (no anonymous session). */
export function publicUrl(slug: string, baseUrl: string): string {
  return `${trimBase(baseUrl)}/f/${encodeURIComponent(slug)}`;
}

/**
 * The low-level core redeem URL for a raw token. NOTE: a browser hitting this is
 * 302-redirected by MJ core to the Explorer shell (`magicLink.explorerUrl`) with the
 * JWT in the fragment — WRONG for an anonymous respondent. So this is NOT the shared
 * link; the shareable link is {@link shareUrl} (`/f/:slug`), whose route performs the
 * redeem server-side and renders the shell-free widget. Kept only as a primitive.
 */
export function redeemUrl(token: string, baseUrl: string): string {
  return `${trimBase(baseUrl)}/magic-link/redeem?token=${encodeURIComponent(token)}`;
}

/**
 * The shareable public URL for a distribution: ALWAYS the `/f/:slug` host page. That
 * route resolves the distribution's `PublicLinkToken` and redeems it server-side, then
 * renders the anonymous `<mj-form>` widget — so the shared link must never be the raw
 * `/magic-link/redeem?token=` URL (which bounces to the Explorer login shell).
 */
export function shareUrl(slug: string, baseUrl: string): string {
  return publicUrl(slug, baseUrl);
}

/** An `<iframe>` embed snippet pointing at the shareable `/f/:slug` public URL. */
export function embedSnippet(slug: string, baseUrl: string): string {
  const url = shareUrl(slug, baseUrl);
  return (
    `<iframe src="${url}" title="Form" loading="lazy" ` +
    `style="width:100%;border:0;min-height:600px" allow="clipboard-write"></iframe>`
  );
}

/** Slugify a name to a URL-friendly token, falling back to a random token. */
export function slugify(name: string, randomSuffix: () => string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : `form-${randomSuffix()}`;
}

/** Default random suffix generator (5 base-36 chars). */
export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}
