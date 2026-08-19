/**
 * Social links on an ending screen.
 *
 * The last screen is the one place a form has the respondent's attention with nothing left to ask
 * of them, which is where "follow us" belongs. Authors were pasting raw URLs into the ending's
 * body, where they render as unclickable text.
 *
 * The platform list is a CLOSED SET rather than an author-supplied icon or name. Three reasons,
 * in order of how much they matter: the widget must always know which glyph to draw and cannot be
 * handed one it does not have; a fixed list is what lets the builder offer a row per platform
 * instead of a free-text pair the author has to get right; and an ending screen is rendered to
 * anonymous members of the public, so the fewer author-controlled strings that reach the DOM the
 * better.
 */

/** A platform the widget can render. Extending this is a deliberate, reviewed act. */
export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  /** Font Awesome brand class. The widget renders exactly this and nothing else. */
  icon: string;
}

export type SocialPlatformId =
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'github';

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin-in' },
  { id: 'x', label: 'X', icon: 'fa-brands fa-x-twitter' },
  { id: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook-f' },
  { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { id: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
  { id: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok' },
  { id: 'github', label: 'GitHub', icon: 'fa-brands fa-github' },
];

/** One authored link. */
export interface SocialLink {
  platform: SocialPlatformId;
  url: string;
}

/** The platform's presentation, or `undefined` if it is not one we can draw. */
export function socialPlatform(id: string): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.id === id);
}

/**
 * Read the stored JSON into links the widget can render.
 *
 * Never throws and never returns something unrenderable. Storage is a free-text column that has
 * been through an author, an importer and a snapshot, so it is treated as untrusted input:
 * anything unparseable, any unknown platform, and any URL that is not an ordinary web address is
 * dropped rather than propagated. That last one is not paranoia — these values become an `href`
 * on a page shown to anonymous members of the public, and `javascript:` is a URL.
 */
export function parseSocialLinks(raw: string | null | undefined): SocialLink[] {
  if (!raw || raw.trim() === '') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const links: SocialLink[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { platform, url } = entry as { platform?: unknown; url?: unknown };
    if (typeof platform !== 'string' || typeof url !== 'string' || !socialPlatform(platform)) {
      continue;
    }
    if (!isSafeWebUrl(url)) {
      continue;
    }
    links.push({ platform: platform as SocialPlatformId, url: url.trim() });
  }
  return links;
}

/** Write links back to storage. An empty list is stored as NULL, not as an empty array. */
export function serializeSocialLinks(links: readonly SocialLink[]): string | null {
  const usable = links.filter((l) => socialPlatform(l.platform) && isSafeWebUrl(l.url));
  return usable.length > 0 ? JSON.stringify(usable.map((l) => ({ ...l, url: l.url.trim() }))) : null;
}

/** An ordinary http(s) address — the only thing that may become an href on a public page. */
function isSafeWebUrl(text: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(text.trim());
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}
