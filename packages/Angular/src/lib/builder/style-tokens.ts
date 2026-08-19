/**
 * Branding-editor helpers over the `MJ_BizApps_Forms: Form Styles` entity.
 *
 * The entity stores `CSSVariables` as a JSON `--token: value` map. The Design panel's
 * branding-basics editor reads/writes individual brand tokens in that map so the live
 * preview and the published widget share the exact same token contract — no hardcoded
 * colors anywhere. Parsing/serialization reuse the existing {@link parseStyleTokens} /
 * {@link buildStyleTokens} helpers (DRY — no parallel JSON logic).
 *
 * These operate on the raw `CSSVariables` string (not the entity) so they stay pure and
 * unit-testable; the Design panel passes `style.CSSVariables`.
 */
import type { FormStyleTokens, mjBizAppsFormsFormStyleEntity } from '@mj-biz-apps/forms-entities';
import { parseStyleTokens, buildStyleTokens } from './json-fields';

/** Semantic token names the theme editor writes into `CSSVariables`. */
export const BRAND_TOKENS = {
  /** Primary brand color (buttons, active choice, progress fill). */
  primary: '--mjf-accent',
  /** Darker shade used for hover / pressed / strong states. */
  primaryStrong: '--mjf-accent-strong',
  /** Page background behind the form cards. */
  pageBg: '--mjf-page-bg',
  /** Card / field surface background. */
  cardBg: '--mjf-card-bg',
  /** Body font stack. */
  fontBody: '--mjf-font-body',
  /** Display / heading font stack. */
  fontDisplay: '--mjf-font-display',
  /** Colour of titles and question text. */
  ink: '--mjf-page-ink',
  /** Text drawn on top of the accent — i.e. button labels. */
  onAccent: '--mjf-on-accent',
  /** Fill of a selected answer choice. */
  answer: '--mjf-choice-selected-bg',
  /** Page background image, as a full CSS `url(...)` value or `none`. */
  pageBgImage: '--mjf-page-bg-image',
  /** Title/ending type size. */
  titleSize: '--mjf-title-size',
  /** Question type size. */
  questionSize: '--mjf-question-size',
  /** Title/ending alignment. */
  titleAlign: '--mjf-title-align',
  /** Question alignment. */
  questionAlign: '--mjf-question-align',
} as const;

/** The three type sizes the Design tab offers, per target. */
export type TypeScale = 'sm' | 'md' | 'lg';

/** The two alignments the Design tab offers. */
export type TypeAlign = 'left' | 'center';

/** Title/ending sizes. Titles carry the form's voice, so the steps are wide. */
const TITLE_SIZES: Record<TypeScale, string> = { sm: '1.375rem', md: '1.75rem', lg: '2.25rem' };

/** Question sizes. A tighter range — a question still has to read as a question. */
const QUESTION_SIZES: Record<TypeScale, string> = { sm: '0.9375rem', md: '1.0625rem', lg: '1.25rem' };

/**
 * Alignment values, per target, because the two are aligned by different CSS properties.
 *
 * The title is a block and uses `text-align`. The question label is a flex row (prompt plus
 * the required marker) where `text-align` does nothing, so it uses `justify-content` — which
 * needs flex keywords. Keeping both vocabularies here means the editor never has to know,
 * and the pair cannot drift apart in two components.
 */
const TITLE_ALIGN_VALUES: Record<TypeAlign, string> = { left: 'left', center: 'center' };
const QUESTION_ALIGN_VALUES: Record<TypeAlign, string> = { left: 'flex-start', center: 'center' };

/** The CSS value a type-size choice writes, for each of the two targets. */
export function typeSizeValue(target: 'title' | 'question', scale: TypeScale): string {
  return target === 'title' ? TITLE_SIZES[scale] : QUESTION_SIZES[scale];
}

/** Read back which size step a stored value corresponds to; defaults to `md`. */
export function typeSizeScale(target: 'title' | 'question', value: string): TypeScale {
  const table = target === 'title' ? TITLE_SIZES : QUESTION_SIZES;
  const match = (Object.keys(table) as TypeScale[]).find((k) => table[k] === value.trim());
  return match ?? 'md';
}

/** The CSS value an alignment choice writes, for each of the two targets. */
export function typeAlignValue(target: 'title' | 'question', align: TypeAlign): string {
  return target === 'title' ? TITLE_ALIGN_VALUES[align] : QUESTION_ALIGN_VALUES[align];
}

/**
 * Which alignment a stored value corresponds to.
 *
 * The fallback differs by target because the two surfaces have always LOOKED different: a
 * welcome or ending screen is a hero and has centred since it was written, questions are a
 * form and read left. Defaulting both to left put "left" in the control on a brand-new form
 * whose screens were visibly centred — the control disagreeing with the form is how an author
 * stops trusting it.
 */
const DEFAULT_ALIGN: Record<'title' | 'question', TypeAlign> = { title: 'center', question: 'left' };

export function typeAlignChoice(target: 'title' | 'question', value: string): TypeAlign {
  const table = target === 'title' ? TITLE_ALIGN_VALUES : QUESTION_ALIGN_VALUES;
  const trimmed = value.trim();
  if (trimmed === table.center) {
    return 'center';
  }
  if (trimmed === table.left) {
    return 'left';
  }
  return DEFAULT_ALIGN[target];
}

/** The three corner-radius steps the Buttons tab offers, in px. */
export const RADIUS_STEPS: ReadonlyArray<{ key: 'sharp' | 'soft' | 'round'; px: number; label: string }> = [
  { key: 'sharp', px: 0, label: 'Square' },
  { key: 'soft', px: 10, label: 'Rounded' },
  { key: 'round', px: 999, label: 'Pill' },
];

/**
 * Wrap a background-image URL as a CSS value, or clear it.
 *
 * The token is consumed as `background-image`, so it needs a full `url(...)`, and the URL
 * needs quoting — an unquoted one breaks on any address containing parentheses. Returning
 * `none` rather than an empty string keeps the widget's own default from leaking back in
 * when an author deliberately removes the image.
 */
export function backgroundImageValue(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  return `url("${trimmed.replace(/"/g, '%22')}")`;
}

/** Read a background-image token back to the bare URL an input can edit. */
export function backgroundImageUrl(value: string): string {
  const match = /^url\(\s*"?(.*?)"?\s*\)$/.exec(value.trim());
  return match ? match[1].replace(/%22/g, '"') : '';
}

/**
 * The corner-radius token the Design tab's control writes.
 *
 * Buttons only, deliberately. This used to set card, input, choice and button radius
 * together "so the theme's rounding stays coherent" — but the control is labelled Corner
 * radius under a Buttons heading, so an author reaching for rounder buttons also got
 * rounder text fields and cards with no way to say otherwise. A control changes the thing
 * it names.
 */
export const BUTTON_RADIUS_TOKEN = '--mjf-btn-radius';

/** Curated font choices for the theme editor (label → CSS font-family stack). */
export const FONT_OPTIONS: ReadonlyArray<{ label: string; stack: string }> = [
  { label: 'System', stack: 'system-ui, sans-serif' },
  { label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  { label: 'Sora', stack: "'Sora', system-ui, sans-serif" },
  { label: 'Nunito', stack: "'Nunito', system-ui, sans-serif" },
  { label: 'Fraunces (serif)', stack: "'Fraunces', Georgia, serif" },
];

/** Serialize a `--token → value` map back to a `CSSVariables` JSON string. */
export function serializeCssVariables(map: Record<string, string>): string {
  return JSON.stringify(map, null, 2);
}

/** Build the runtime {@link FormStyleTokens} the preview + widget apply from a style entity. */
export function toStyleTokens(style: mjBizAppsFormsFormStyleEntity): FormStyleTokens {
  return buildStyleTokens(style.CSSVariables, style.CustomCSS, style.LogoURL);
}

/** Read a brand token's current value from a raw `CSSVariables` JSON (empty if unset). */
export function readBrandToken(cssVariablesRaw: string | null | undefined, token: string): string {
  return parseStyleTokens(cssVariablesRaw)[token] ?? '';
}

/**
 * Return an updated `CSSVariables` JSON with `token` set to `value` (or removed when
 * `value` is blank), preserving every other token. Pure — mutates nothing.
 */
export function withBrandToken(
  cssVariablesRaw: string | null | undefined,
  token: string,
  value: string,
): string {
  const map = parseStyleTokens(cssVariablesRaw);
  const trimmed = value.trim();
  if (trimmed) {
    map[token] = trimmed;
  } else {
    delete map[token];
  }
  return serializeCssVariables(map);
}

/** Read the theme's button corner radius as a number of px; 0 if unset. */
export function readButtonRadiusPx(cssVariablesRaw: string | null | undefined): number {
  const raw = parseStyleTokens(cssVariablesRaw)[BUTTON_RADIUS_TOKEN] ?? '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Return an updated `CSSVariables` JSON with the BUTTON radius set to `px`, preserving
 * every other token. Pure.
 */
export function withButtonRadiusPx(cssVariablesRaw: string | null | undefined, px: number): string {
  const map = parseStyleTokens(cssVariablesRaw);
  map[BUTTON_RADIUS_TOKEN] = `${px}px`;
  return serializeCssVariables(map);
}


/**
 * A computed CSS colour as the `#rrggbb` an `<input type="color">` requires.
 *
 * `getComputedStyle` reports colours as `rgb()` / `rgba()`, which a colour input rejects —
 * it silently falls back to black, so an unset swatch would claim the form renders black
 * text on a black background. Returns '' for anything it cannot read, letting the caller
 * decide rather than inventing a colour.
 */
export function cssColorToHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = /^#(.)(.)(.)$/.exec(trimmed) as RegExpExecArray;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const hex = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(trimmed);
  if (rgb) {
    return `#${hex(Number(rgb[1]))}${hex(Number(rgb[2]))}${hex(Number(rgb[3]))}`;
  }

  // `color(srgb r g b)`, with components in 0..1. This is what a browser reports for a
  // `color-mix()` — which several widget defaults are — so without this branch every
  // mix-derived swatch fell back to black and told the author the form was black.
  const srgb = /^color\(\s*srgb\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/i.exec(trimmed);
  if (srgb) {
    return `#${hex(Number(srgb[1]) * 255)}${hex(Number(srgb[2]) * 255)}${hex(Number(srgb[3]) * 255)}`;
  }

  return '';
}
