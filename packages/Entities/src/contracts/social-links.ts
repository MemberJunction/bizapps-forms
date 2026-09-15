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
  /** Font Awesome brand class, for surfaces inside the Explorer shell (the builder). */
  icon: string;
  /**
   * The brand mark as SVG path data, in a 0 0 24 24 box.
   *
   * The widget draws THIS rather than the icon font, because the respondent host page loads
   * no stylesheet at all — it is a standalone custom element, not the Explorer shell — so an
   * `<i class="fa-brands">` there renders as an empty square. The author saw icons in the
   * builder, where Font Awesome IS loaded, and respondents saw two blank tiles.
   *
   * A brand mark is also the worst possible candidate for a missing-glyph fallback: there is
   * no substitute character for the LinkedIn logo, so the icon either ships with the widget
   * or it does not exist. Inline paths keep the widget self-contained, which is the same
   * property that lets it be embedded in someone else's page.
   */
  svgPath: string;
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
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: 'fa-brands fa-linkedin-in',
    svgPath:
      'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05a4.2 4.2 0 0 1 3.75-2c4 0 4.4 2.6 4.4 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21H9z',
  },
  {
    id: 'x',
    label: 'X',
    icon: 'fa-brands fa-x-twitter',
    svgPath:
      'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.2 3h6.6l4.5 5.6zm-1.1 16h1.8L7.7 4.8H5.8z',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: 'fa-brands fa-facebook-f',
    svgPath:
      'M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.1A19 19 0 0 0 14.7 2C12 2 10.2 3.7 10.2 6.4v2.1H7.5V12h2.7v10H14V12h2.8l.4-3.5z',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'fa-brands fa-instagram',
    svgPath:
      'M12 2c2.7 0 3 0 4.1.1 1.1 0 1.8.2 2.4.5.7.2 1.2.6 1.7 1.1s.9 1 1.1 1.7c.3.6.4 1.3.5 2.4v8.4c0 1.1-.2 1.8-.5 2.4a4.6 4.6 0 0 1-2.8 2.8c-.6.3-1.3.4-2.4.5H7.9c-1.1 0-1.8-.2-2.4-.5a4.6 4.6 0 0 1-2.8-2.8c-.3-.6-.4-1.3-.5-2.4V7.9c0-1.1.2-1.8.5-2.4A4.6 4.6 0 0 1 5.5 2.7c.6-.3 1.3-.4 2.4-.5H12zm0 1.8c-2.7 0-3 0-4 .1-.9 0-1.3.2-1.7.3-.4.2-.7.4-1 .7s-.5.6-.7 1c-.1.4-.3.8-.3 1.7v8c0 .9.2 1.3.3 1.7.2.4.4.7.7 1s.6.5 1 .7c.4.1.8.3 1.7.3h8c.9 0 1.3-.2 1.7-.3.4-.2.7-.4 1-.7s.5-.6.7-1c.1-.4.3-.8.3-1.7V8c0-.9-.2-1.3-.3-1.7a2.8 2.8 0 0 0-1.7-1.7c-.4-.1-.8-.3-1.7-.3zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm5.2-3.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: 'fa-brands fa-youtube',
    svgPath:
      'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'fa-brands fa-tiktok',
    svgPath:
      'M16.6 2h-3.1v13.2a2.7 2.7 0 1 1-2.3-2.7v-3.1a5.8 5.8 0 1 0 5.4 5.8V8.9a6.8 6.8 0 0 0 4 1.3V7.1a3.9 3.9 0 0 1-4-4z',
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: 'fa-brands fa-github',
    svgPath:
      'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8 0-.7.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.2.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z',
  },
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
