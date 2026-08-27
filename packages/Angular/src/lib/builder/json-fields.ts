import type {
  ConditionalRule,
  ValidationRule,
  FormSettings,
  FormStyleTokens,
  OnSubmitMode,
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

/**
 * Serialize an object for storage, or `null` when it carries nothing.
 *
 * "Carries nothing" counts DEFINED values only. `JSON.stringify({ show: undefined })` is
 * `'{}'`, so counting raw keys would store a phantom "this item has a rule" marker that every
 * reader then has to see through — the exact shape `withVerbGroup` deletes keys to avoid.
 */
function serializeObject(value: object | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const populated = Object.values(value).some((v) => v !== undefined);
  return populated ? JSON.stringify(value) : null;
}

export function parseConditionalRule(raw: string | null | undefined): ConditionalRule | undefined {
  return parseObject<ConditionalRule>(raw);
}

/**
 * Serialize a {@link ConditionalRule}, or `null` when it carries no verb.
 *
 * Deliberately verb-agnostic. This used to short-circuit on `!rule.show`, written when `show`
 * was the only verb there was — so once `require` and `jump` arrived, a rule carrying only one
 * of them serialized to `null` and was discarded on save: a page's jump never persisted, and
 * deleting an unrelated "Show only if" card from an item that also had a jump wiped the jump
 * with it. Any new verb is covered here by construction rather than by remembering to add it.
 */
export function serializeConditionalRule(rule: ConditionalRule | undefined): string | null {
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
    // A whitelist drops what it does not name, so omitting this would silently revert a form to
    // inferring its dispatch on the next save of ANY setting — see json-fields.spec.ts.
    //
    // Validated rather than copied, unlike every other field here. The rest are the author's own
    // free-form values; this one is a closed set the SERVER reads to decide what runs on submit,
    // and the builder writing a value nothing recognises would put it straight into the next
    // published snapshot.
    onSubmitMode: recognisedOnSubmitMode(parsed?.onSubmitMode),
  };
}

/**
 * The mode if it is one of the two the contract defines, otherwise absent.
 *
 * Absent means "infer", which is what every form did before the field existed — so dropping an
 * unreadable value costs nothing and keeps the stored data honest. Deliberately exact rather than
 * case-insensitive: accepting `configured` here would write a value back that only this parser
 * understands, which is the drift it exists to prevent.
 */
function recognisedOnSubmitMode(value: unknown): OnSubmitMode | undefined {
  return value === 'Legacy' || value === 'Configured' ? value : undefined;
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
