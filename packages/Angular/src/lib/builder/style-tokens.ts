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

/** Semantic token names the branding-basics editor writes into `CSSVariables`. */
export const BRAND_TOKENS = {
  /** Primary brand color (buttons, active choice, progress fill). */
  primary: '--mjf-accent',
  /** Darker shade used for hover / pressed / strong states. */
  primaryStrong: '--mjf-accent-strong',
} as const;

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
