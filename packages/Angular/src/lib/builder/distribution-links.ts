/**
 * Pure helpers for deriving the public artifacts of a distribution (public URL, redeem URL, embed
 * snippet). Kept free of Angular/MJ so they are trivially unit-testable and reusable by
 * {@link DistributionService}.
 *
 * The respondent-URL RULE is the contracts' (`share-link.ts` in `@mj-biz-apps/forms-entities`),
 * and the server's `FormDistributionEngine` uses the same function, so the two cannot disagree
 * about the URL's SHAPE. They can still differ in its BASE: this builder passes its configured API
 * origin, the server `MJAPI_PUBLIC_URL` — different behind a path-prefixing proxy or a split
 * internal/public address — and the server returns no URL at all when `MJAPI_PUBLIC_URL` is unset,
 * which is why the builder keeps composing one for display. Slugs are the server's alone now
 * (`Forms.IssueDistributionLink`), so the slug helpers that lived here are gone.
 */
import { respondentUrl } from '@mj-biz-apps/forms-entities';

/** Strip trailing slashes from a base URL so path joins are clean. */
function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** The slug-friendly respondent URL for a distribution (no anonymous session). */
export function publicUrl(slug: string, baseUrl: string): string {
  return respondentUrl(slug, baseUrl);
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
