/**
 * Form authoring blueprint — the structured, validated intermediate shape that the
 * AI Designer step emits and the deterministic Builder step persists.
 *
 * This mirrors the Designer→Builder split proven by MJ's Form Builder agent
 * (`@memberjunction/core-entities` `engines/interactive-forms.ts`): an LLM produces a
 * fully-formed JSON spec, then deterministic code validates it (zod) and writes the
 * rows. The LLM never touches the database; the Builder never guesses.
 *
 * The blueprint is deliberately NOT the published-snapshot shape
 * ({@link PublishedFormDefinition} in `@mj-biz-apps/forms-entities`) — a blueprint is
 * an *authoring draft* the builder UI then refines, whereas the snapshot is the
 * immutable published artifact. The question-type union below is, however, kept in
 * lock-step with the contract's `FormQuestionType` via the compile-time guard at the
 * bottom of this file.
 */
import { z } from 'zod';
import type { FormQuestionType, FormRenderMode } from '@mj-biz-apps/forms-entities';

/**
 * Phase-1 question taxonomy (FORMS_BUILD_PLAN §5.3). Identical set to the shared
 * contract's `FormQuestionType`; the guard at the bottom fails the build on drift.
 */
export const formQuestionTypeSchema = z.enum([
  'ShortText',
  'LongText',
  'Email',
  'Phone',
  'Number',
  'SingleChoice',
  'MultiChoice',
  'Dropdown',
  'Rating',
  'NPS',
  'YesNo',
  'Date',
  'Time',
  'FileUpload',
  'Statement',
]);

/** The choice-style question types that require (and are the only ones allowed) options. */
export const CHOICE_QUESTION_TYPES: ReadonlySet<FormQuestionType> = new Set<FormQuestionType>([
  'SingleChoice',
  'MultiChoice',
  'Dropdown',
]);

export const formRenderModeSchema = z.enum(['Scroll', 'OneQuestion']);

/** A selectable option for a choice-style question. */
export const blueprintOptionSchema = z.object({
  label: z.string().min(1),
  /** Stored value; defaults to `label` when the Designer omits it. */
  value: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * A single question in the blueprint. `settings` carries per-type open config
 * (e.g. `{ "max": 5 }` for Rating, NPS label bounds) as JSON — never `any`.
 */
export const blueprintQuestionSchema = z.object({
  type: formQuestionTypeSchema,
  prompt: z.string().min(1),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional(),
  /** Choice-style only; ignored (and warned) for other types. */
  options: z.array(blueprintOptionSchema).optional(),
  /** Per-type open settings, e.g. `{ "min": 0, "max": 10 }`. */
  settings: z.record(z.unknown()).optional(),
});

/** A page (section) of the blueprint, holding ordered questions. */
export const blueprintPageSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(blueprintQuestionSchema).min(1),
});

/** The full authoring blueprint the Designer emits and the Builder persists. */
export const formBlueprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  renderMode: formRenderModeSchema.optional(),
  confirmationMessage: z.string().optional(),
  pages: z.array(blueprintPageSchema).min(1),
});

export type BlueprintOption = z.infer<typeof blueprintOptionSchema>;
export type BlueprintQuestion = z.infer<typeof blueprintQuestionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type FormBlueprint = z.infer<typeof formBlueprintSchema>;

/**
 * Parse + validate a blueprint from raw LLM output (a JSON string or already-parsed
 * object). Throws a `ZodError` (or `SyntaxError`) on malformed input — the caller
 * treats a parse failure as a retryable Designer error, never as `any`.
 */
export function parseFormBlueprint(input: string | object): FormBlueprint {
  const raw: unknown = typeof input === 'string' ? JSON.parse(extractJSON(input)) : input;
  return formBlueprintSchema.parse(raw);
}

/**
 * LLMs frequently wrap JSON in prose or ```json fences. Pull out the first balanced
 * top-level object so `JSON.parse` sees clean input.
 */
export function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return candidate;
  }
  return candidate.slice(start, end + 1);
}

// --- Drift guard (compile-time) -------------------------------------------------
// Fails `tsc` if the blueprint question-type union ever diverges from the shared
// contract's `FormQuestionType` in either direction.
type AssertExtends<A, B> = A extends B ? (B extends A ? true : never) : never;
const _questionTypeMatch: AssertExtends<z.infer<typeof formQuestionTypeSchema>, FormQuestionType> = true;
const _renderModeMatch: AssertExtends<z.infer<typeof formRenderModeSchema>, FormRenderMode> = true;
void _questionTypeMatch;
void _renderModeMatch;
