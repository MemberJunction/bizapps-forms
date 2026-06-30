/**
 * Pure helpers for deriving the public artifacts of a distribution (slug, public
 * URL, embed snippet). Kept free of Angular/MJ so they are trivially unit-testable
 * and reusable by {@link DistributionService}.
 */

/** The public respondent URL for a slug, using the configured public base. */
export function publicUrl(slug: string, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/f/${encodeURIComponent(slug)}`;
}

/** An `<iframe>` embed snippet pointing at the public URL. */
export function embedSnippet(slug: string, baseUrl: string): string {
  const url = publicUrl(slug, baseUrl);
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
