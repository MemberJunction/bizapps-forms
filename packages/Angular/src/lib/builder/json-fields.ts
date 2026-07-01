import type {
  ConditionalRule,
  ValidationRule,
  FormSettings,
  FormStyleTokens,
} from '@mj-biz-apps/forms-entities';
import type { JSONValue } from '@mj-biz-apps/forms-entities';

/**
 * Typed parse/serialize helpers for the JSON-string columns the builder edits.
 *
 * Every JSON column on the Forms entities is `nvarchar(MAX)` holding a serialized
 * object. These helpers keep parsing in one place, never throw on malformed input
 * (they return the supplied fallback), and never widen to `any`.
 */

/** Parse a JSON-string column to an object, returning `undefined` on null/blank/invalid. */
function parseObject<T>(raw: string | null | undefined): T | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as T;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Serialize an object for storage, or `null` when the object is empty/absent. */
function serializeObject(value: object | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (Object.keys(value).length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

export function parseConditionalRule(raw: string | null | undefined): ConditionalRule | undefined {
  return parseObject<ConditionalRule>(raw);
}

export function serializeConditionalRule(rule: ConditionalRule | undefined): string | null {
  if (!rule || !rule.show) {
    return null;
  }
  return serializeObject(rule);
}

export function parseValidationRule(raw: string | null | undefined): ValidationRule | undefined {
  return parseObject<ValidationRule>(raw);
}

export function serializeValidationRule(rule: ValidationRule | undefined): string | null {
  return serializeObject(rule);
}

export function parseQuestionSettings(raw: string | null | undefined): Record<string, JSONValue> {
  return parseObject<Record<string, JSONValue>>(raw) ?? {};
}

export function serializeQuestionSettings(settings: Record<string, JSONValue>): string | null {
  return serializeObject(settings);
}

export function parseFormSettings(raw: string | null | undefined): FormSettings {
  const parsed = parseObject<Partial<FormSettings>>(raw);
  return {
    anonymousAllowed: parsed?.anonymousAllowed ?? true,
    captchaRequired: parsed?.captchaRequired ?? false,
    quota: parsed?.quota,
    opensAt: parsed?.opensAt,
    closesAt: parsed?.closesAt,
    confirmationMessage: parsed?.confirmationMessage,
    redirectUrl: parsed?.redirectUrl,
  };
}

export function serializeFormSettings(settings: FormSettings): string {
  return JSON.stringify(settings);
}

export function parseStyleTokens(raw: string | null | undefined): Record<string, string> {
  const parsed = parseObject<Record<string, unknown>>(raw);
  if (!parsed) {
    return {};
  }
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      tokens[key] = value;
    }
  }
  return tokens;
}

/** Build the resolved {@link FormStyleTokens} the published snapshot carries. */
export function buildStyleTokens(
  cssVariablesRaw: string | null | undefined,
  customCSS: string | null | undefined,
  logoURL: string | null | undefined,
): FormStyleTokens {
  const tokens: FormStyleTokens = {
    cssVariables: parseStyleTokens(cssVariablesRaw),
  };
  if (customCSS) {
    tokens.customCSS = customCSS;
  }
  if (logoURL) {
    tokens.logoURL = logoURL;
  }
  return tokens;
}
