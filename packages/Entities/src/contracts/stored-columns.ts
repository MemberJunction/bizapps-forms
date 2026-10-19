/**
 * Reading the JSON-string columns an author's draft stores, through the zod schemas.
 *
 * Every rule-bearing column on the Forms entities is a nullable `NVARCHAR(MAX)` holding a
 * serialized object. Two readers need them and they want different things from a bad one:
 *
 *  - PUBLISH must refuse. A rule the schema rejects used to be cast through as if it were valid,
 *    frozen into the immutable snapshot, and then dropped by the server's parser at read time —
 *    which for a show rule means the item it guarded became visible to EVERY respondent.
 *  - The BUILDER must keep working, and tell the author. A badge reading "this rule cannot be
 *    read" on the item is useful; an editor that throws on render is not.
 *
 * So these return a RESULT rather than throwing or defaulting: `ok: false` carries the reason,
 * and each caller decides — the snapshot builder throws with the item named, the rule inventory
 * turns it into a broken-rule line, an editor shows the item as having no rule. One reader, so
 * "is this column valid" has one answer everywhere.
 *
 * An EMPTY column (null, blank) is not an error: it is "no rule", and reads as `ok: true` with an
 * `undefined` value.
 */
import { conditionalRuleSchema, formSettingsSchema, validationRuleSchema } from './schemas';
import type { ConditionalRule, ValidationRule } from './conditional-rule';
import type { FormSettings, FormStyleTokens } from './form-definition';
import type { JSONValue } from './json-value';
import type { ZodError, ZodType, ZodTypeDef } from 'zod';

/** The outcome of reading one stored column. */
export type StoredColumnRead<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

/**
 * The settings a form with no stored `Settings` has.
 *
 * Applied UNDER whatever is stored, field by field, so a row written before a field existed reads
 * the field's default rather than failing the schema. These two are the only required fields of
 * {@link FormSettings}; every other one is optional and absent means "not configured".
 */
export const DEFAULT_FORM_SETTINGS: Readonly<Pick<FormSettings, 'anonymousAllowed' | 'captchaRequired'>> = {
  anonymousAllowed: true,
  captchaRequired: false,
};

/** Read a `ConditionalRule` column. Empty reads as `undefined`. */
export function readStoredConditionalRule(
  raw: string | null | undefined,
): StoredColumnRead<ConditionalRule | undefined> {
  return readOptionalObject(raw, conditionalRuleSchema);
}

/** Read a `ValidationRule` column. Empty reads as `undefined`. */
export function readStoredValidationRule(
  raw: string | null | undefined,
): StoredColumnRead<ValidationRule | undefined> {
  return readOptionalObject(raw, validationRuleSchema);
}

/**
 * Read a `Form.Settings` column. Empty reads as the defaults; a stored object is laid over them.
 */
export function readStoredFormSettings(raw: string | null | undefined): StoredColumnRead<FormSettings> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) {
    return parsed;
  }
  return validate({ ...DEFAULT_FORM_SETTINGS, ...(parsed.value ?? {}) }, formSettingsSchema);
}

/**
 * Read a question's free-form `Settings` column (scale bounds, placeholders, …).
 *
 * Tolerant, unlike the readers above, and deliberately so: there is no schema for this column —
 * each question type reads its own keys and ignores the rest — so the only thing that can be
 * wrong with it is that it is not a JSON object at all, and every reader of it treats "no
 * settings" as "the type's defaults". Returns `{}` in that case.
 */
export function parseQuestionSettings(raw: string | null | undefined): Record<string, JSONValue> {
  const parsed = parseJsonObject(raw);
  return parsed.ok && parsed.value ? (parsed.value as Record<string, JSONValue>) : {};
}

/**
 * A style's `CSSVariables` column as a token map, keeping string values only.
 *
 * Tolerant for the same reason as {@link parseQuestionSettings}: a token is a CSS custom property
 * value, a non-string one cannot be applied, and dropping it leaves the theme's default in place.
 */
export function parseStyleTokens(raw: string | null | undefined): Record<string, string> {
  const parsed = parseJsonObject(raw);
  const tokens: Record<string, string> = {};
  if (!parsed.ok || !parsed.value) {
    return tokens;
  }
  for (const [key, value] of Object.entries(parsed.value)) {
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

function readOptionalObject<T>(
  raw: string | null | undefined,
  schema: ZodType<T, ZodTypeDef, unknown>,
): StoredColumnRead<T | undefined> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) {
    return parsed;
  }
  return parsed.value === undefined ? { ok: true, value: undefined } : validate(parsed.value, schema);
}

/**
 * The column as a plain object, `undefined` when empty, or why it is not one.
 *
 * `JSON.parse` is the only thing here that throws, and the catch turns it into the failure
 * result with the parser's own message — nothing is swallowed, the caller decides what to do.
 */
function parseJsonObject(raw: string | null | undefined): StoredColumnRead<Record<string, unknown> | undefined> {
  const trimmed = raw?.trim() ?? '';
  if (trimmed.length === 0) {
    return { ok: true, value: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, reason: `not valid JSON (${err instanceof Error ? err.message : String(err)})` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not a JSON object' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function validate<T>(value: object, schema: ZodType<T, ZodTypeDef, unknown>): StoredColumnRead<T> {
  const result = schema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, reason: describeZodError(result.error) };
}

/** The first issue, with its path — enough for an author to find the condition that is wrong. */
function describeZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'does not match the schema';
  }
  const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
}
