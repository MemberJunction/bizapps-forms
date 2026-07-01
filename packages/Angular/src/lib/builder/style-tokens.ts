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
} as const;

/** The four corner-radius tokens set together so the theme's rounding stays coherent. */
export const RADIUS_TOKENS = ['--mjf-card-radius', '--mjf-input-radius', '--mjf-choice-radius', '--mjf-btn-radius'] as const;

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

/** Read the theme's corner radius (from `--mjf-card-radius`) as a number of px; 0 if unset. */
export function readRadiusPx(cssVariablesRaw: string | null | undefined): number {
  const raw = parseStyleTokens(cssVariablesRaw)[RADIUS_TOKENS[0]] ?? '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Return an updated `CSSVariables` JSON with all four {@link RADIUS_TOKENS} set to `px`,
 * preserving every other token. Keeps card/input/choice/button rounding coherent. Pure.
 */
export function withRadiusPx(cssVariablesRaw: string | null | undefined, px: number): string {
  const map = parseStyleTokens(cssVariablesRaw);
  for (const token of RADIUS_TOKENS) {
    map[token] = `${px}px`;
  }
  return serializeCssVariables(map);
}
