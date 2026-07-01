/**
 * Runtime (zod) schemas for the JSON-from-DB blobs that the server parses from
 * UNTRUSTED input: `ConditionalRule`, `ValidationRule`, and `FormSettings`. The
 * widget can trust the snapshot it loads, but the server must validate anything it
 * reads out of stored JSON columns / request bodies before acting on it.
 *
 * The hand-written TypeScript interfaces remain the source of truth; the
 * `satisfies`-style type guards at the bottom of this file fail the build if a zod
 * schema ever drifts from its interface.
 */
import { z } from 'zod';
import type { ConditionalCondition, ConditionalGroup, ConditionalOperator, ConditionalRule, ValidationRule } from './conditional-rule';
import type { FormSettings } from './form-definition';

// --- ConditionalRule -------------------------------------------------------

const conditionalOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'in',
  'notIn',
  'isAnswered',
  'greaterThan',
  'lessThan',
  'contains',
]);

const conditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);

export const conditionalConditionSchema = z.object({
  questionId: z.string(),
  op: conditionalOperatorSchema,
  value: conditionValueSchema.optional(),
});

export const conditionalGroupSchema = z.object({
  all: z.array(conditionalConditionSchema).optional(),
  any: z.array(conditionalConditionSchema).optional(),
});

export const conditionalRuleSchema = z.object({
  show: conditionalGroupSchema.optional(),
});

// --- ValidationRule --------------------------------------------------------

export const validationRuleSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  patternMessage: z.string().optional(),
});

// --- FormSettings ----------------------------------------------------------

export const formSettingsSchema = z.object({
  anonymousAllowed: z.boolean(),
  captchaRequired: z.boolean(),
  quota: z.number().optional(),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  confirmationMessage: z.string().optional(),
  redirectUrl: z.string().optional(),
});

// --- Parse helpers ---------------------------------------------------------

/**
 * Parse a `ConditionalRule` from either a JSON string or an already-parsed object,
 * validating it against {@link conditionalRuleSchema}. Throws a `ZodError` (or a
 * `SyntaxError` from `JSON.parse`) on malformed input — callers on the server should
 * treat a parse failure as "no rule / reject", never as `any`.
 */
export function parseConditionalRule(json: string | object): ConditionalRule {
  return conditionalRuleSchema.parse(coerceJSON(json));
}

/** Parse a `ValidationRule` from a JSON string or object (validated). */
export function parseValidationRule(json: string | object): ValidationRule {
  return validationRuleSchema.parse(coerceJSON(json));
}

/** Parse a `FormSettings` blob from a JSON string or object (validated). */
export function parseFormSettings(json: string | object): FormSettings {
  return formSettingsSchema.parse(coerceJSON(json));
}

/**
 * Normalize a string-or-object input to a parsed value for zod to validate. The
 * result is deliberately untyped here (zod assigns the type on `.parse()`); we do
 * not annotate it, since the only safe thing to do with raw `JSON.parse` output is
 * hand it straight to a validator.
 */
function coerceJSON(json: string | object): object {
  return typeof json === 'string' ? JSON.parse(json) : json;
}

// --- Drift guards (compile-time) -------------------------------------------
// These assignments do nothing at runtime but fail `tsc` if a zod schema's
// inferred type diverges from the hand-written interface in either direction.

type AssertExtends<A, B> = A extends B ? (B extends A ? true : never) : never;

const _operatorMatch: AssertExtends<z.infer<typeof conditionalOperatorSchema>, ConditionalOperator> = true;
const _conditionMatch: AssertExtends<z.infer<typeof conditionalConditionSchema>, ConditionalCondition> = true;
const _groupMatch: AssertExtends<z.infer<typeof conditionalGroupSchema>, ConditionalGroup> = true;
const _ruleMatch: AssertExtends<z.infer<typeof conditionalRuleSchema>, ConditionalRule> = true;
const _validationMatch: AssertExtends<z.infer<typeof validationRuleSchema>, ValidationRule> = true;
const _settingsMatch: AssertExtends<z.infer<typeof formSettingsSchema>, FormSettings> = true;

// Reference the guards so `noUnusedLocals` (if enabled) stays satisfied.
void _operatorMatch;
void _conditionMatch;
void _groupMatch;
void _ruleMatch;
void _validationMatch;
void _settingsMatch;
