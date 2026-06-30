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
 * The REDEEMABLE public URL: hitting it redeems the distribution's anonymous
 * magic-link token and establishes the scoped session before showing the form.
 * This is the link that actually works when shared — it carries the raw token.
 */
export function redeemUrl(token: string, baseUrl: string): string {
  return `${trimBase(baseUrl)}/magic-link/redeem?token=${encodeURIComponent(token)}`;
}

/**
 * The shareable public URL for a distribution: the redeemable token URL when the
 * link has been provisioned (a token exists), otherwise the slug URL as a
 * pre-provisioning placeholder. Token-driven, never a hardcoded host.
 */
export function shareUrl(token: string | null | undefined, slug: string, baseUrl: string): string {
  return token ? redeemUrl(token, baseUrl) : publicUrl(slug, baseUrl);
}

/** An `<iframe>` embed snippet pointing at the shareable public URL. */
export function embedSnippet(token: string | null | undefined, slug: string, baseUrl: string): string {
  const url = shareUrl(token, slug, baseUrl);
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
