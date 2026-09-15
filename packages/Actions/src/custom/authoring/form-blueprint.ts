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
import {
  FORM_QUESTION_TYPES,
  questionTypeBehavior,
  type FormQuestionType,
  type FormRenderMode,
  type OnSubmitMode,
} from '@mj-biz-apps/forms-entities';

/**
 * The question taxonomy the AI Designer may emit — the shared contract's `FormQuestionType`,
 * derived rather than transcribed.
 *
 * It WAS transcribed, and the transcription went stale the moment the contract grew to 25 types:
 * a blueprint naming `OpinionScale` would fail validation with "invalid enum value", so the
 * Designer could not author any of the new types no matter what it was told. The compile-time
 * guard below was supposed to catch exactly that and could not — see the note beside it.
 *
 * The cast is the one zod requires: `z.enum` wants a non-empty tuple and cannot see that a
 * `readonly FormQuestionType[]` has at least one element. `FORM_QUESTION_TYPES` is built from the
 * behaviour table's keys, so it is non-empty by construction.
 */
const QUESTION_TYPE_VALUES = FORM_QUESTION_TYPES as readonly [FormQuestionType, ...FormQuestionType[]];

export const formQuestionTypeSchema = z.enum(QUESTION_TYPE_VALUES);

/**
 * The question types that require (and are the only ones allowed) options.
 *
 * Also derived: `Ranking` and `Matrix` carry options too, and the hand-listed set would have
 * rejected a Designer-authored ranking for supplying the options it cannot work without.
 */
export const CHOICE_QUESTION_TYPES: ReadonlySet<FormQuestionType> = new Set(
  FORM_QUESTION_TYPES.filter((t) => questionTypeBehavior(t).optionMode !== 'none'),
);

export const formRenderModeSchema = z.enum(['Scroll', 'OneQuestion']);

/** A selectable option for a choice-style question. */
export const blueprintOptionSchema = z.object({
  label: z.string().min(1),
  /** Stored value; defaults to `label` when the Designer omits it. */
  value: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
  /**
   * `PictureChoice` only: the image shown above the label.
   *
   * The Designer cannot invent a working image URL, so it will rarely fill this in — but a
   * blueprint that carries one (from a template, or a brief that named an asset) would otherwise
   * have it silently dropped at the schema boundary.
   */
  imageURL: z.string().optional(),
  /**
   * `Matrix` only: which axis this option belongs to.
   *
   * Without this the Designer cannot author a matrix AT ALL — every option would land as a row,
   * producing a grid with no columns, which renders as a table with nothing to click.
   */
  matrixAxis: z.enum(['Row', 'Column']).optional(),
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

/**
 * One on-submit step, named rather than identified.
 *
 * BY NAME, because an Action gets a different ID in every environment — a blueprint carrying
 * `ActionID` would author correctly on the machine it was written on and nowhere else. The Builder
 * resolves names to IDs at persist time and REFUSES a name it cannot resolve, which is the
 * opposite of what the builder UI's seeding does: seeding skips an unregistered built-in to
 * reproduce the legacy runner's behaviour, whereas a consumer that explicitly named a step and
 * silently did not get it has been lied to.
 *
 * Run order is the array's order. There is deliberately no `displayOrder` field: two steps sharing
 * one is a state an author can trivially reach and whose consequences (the tab and the server
 * tie-breaking differently, reorder arrows that write nothing) are invisible until production.
 */
export const blueprintAutomationSchema = z.object({
  /** The MJ Action name, e.g. `Forms: Send Confirmation Email`. */
  actionName: z.string().min(1),
  trigger: z.enum(['OnComplete', 'OnPartial', 'OnCompleteOrPartial']).optional(),
  executionMode: z.enum(['Sync', 'Async']).optional(),
  continueOnError: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** The full authoring blueprint the Designer emits and the Builder persists. */
export const formBlueprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  renderMode: formRenderModeSchema.optional(),
  confirmationMessage: z.string().optional(),
  /**
   * Whether this form's own automations are what run on submit — see `OnSubmitMode` in
   * `@mj-biz-apps/forms-entities`.
   *
   * Omitted is the historical inference and stays the default, because writing one here would
   * change what every AI- and template-authored form does on submit, all at once. Supplying
   * `Configured` with no `automations` is the supported way to run NOTHING: it is what a consumer
   * owning its own subject identity needs in order to decline `Forms: Upsert Respondent Person`
   * (bizapps-forms#47).
   */
  onSubmitMode: z.enum(['Legacy', 'Configured']).optional(),
  /**
   * The on-submit steps this form runs, in order. Supplying this implies `Configured`.
   *
   * An empty array is meaningful and distinct from omitting the field: `[]` says "run nothing",
   * absent says "say nothing, and let the server infer as it always has".
   */
  automations: z.array(blueprintAutomationSchema).optional(),
  pages: z.array(blueprintPageSchema).min(1),
}).superRefine((blueprint, ctx) => {
  // The invariant lives HERE rather than only in `applyOnSubmitConfig`, because this schema is the
  // boundary every blueprint crosses — LLM output through `parseFormBlueprint`, and any direct
  // caller of the exported `buildFormFromBlueprint`. Guarding one layer above left the state
  // reachable by anything that did not route through the two shipping actions.
  //
  // `Legacy` runs the built-in steps; `automations` names steps that then never run. A caller
  // asking for both is asking for something that cannot happen, and the failure is silent: rows
  // are written, the caller sees success, and at runtime the built-ins fire instead.
  if (blueprint.onSubmitMode === 'Legacy' && (blueprint.automations?.length ?? 0) > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['automations'],
      message:
        "onSubmitMode 'Legacy' runs the built-in on-submit steps, so these automations would be " +
        "written and never run. Use 'Configured' to run them, or omit them to keep the built-ins.",
    });
  }
});

/**
 * The mode to persist for a blueprint.
 *
 * An explicit declaration wins; otherwise, authoring any `automations` array — empty included —
 * is itself the declaration, because a consumer that listed its steps plainly means those steps
 * and not four others. Saying nothing persists nothing, which is what preserves the behaviour of
 * every form authored before this existed.
 */
export function blueprintOnSubmitMode(blueprint: FormBlueprint): OnSubmitMode | undefined {
  return blueprint.onSubmitMode ?? (blueprint.automations ? 'Configured' : undefined);
}

export type BlueprintOption = z.infer<typeof blueprintOptionSchema>;
export type BlueprintQuestion = z.infer<typeof blueprintQuestionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type BlueprintAutomation = z.infer<typeof blueprintAutomationSchema>;
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
// `[A] extends [B]`, not `A extends B`. A naked type parameter on the left of a conditional
// DISTRIBUTES over its union, so the bare form checked each member of A separately and collapsed
// the result back to `true` — it could not fail in either direction, and had not been failing
// while the blueprint's 15-type enum sat beside a 25-type contract. Wrapping both sides in
// one-tuples suppresses distribution and makes the comparison the whole-union one it reads as.
// Verified by construction: with the bare form neither a widened nor a narrowed union errors;
// with this form both do, and identical unions still pass.
type AssertExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _questionTypeMatch: AssertExtends<z.infer<typeof formQuestionTypeSchema>, FormQuestionType> = true;
const _renderModeMatch: AssertExtends<z.infer<typeof formRenderModeSchema>, FormRenderMode> = true;
void _questionTypeMatch;
void _renderModeMatch;
