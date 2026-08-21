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
  MAX_BLUEPRINT_ENDINGS,
  MAX_BLUEPRINT_OPTIONS,
  MAX_BLUEPRINT_PAGES,
  MAX_BLUEPRINT_QUESTIONS_PER_PAGE,
} from './limits';
import {
  conditionalConditionSchema,
  conditionalGroupSchema,
  FORM_QUESTION_TYPES,
  questionTypeBehavior,
  validationRuleSchema,
  type ConditionalCondition,
  type ConditionalGroup,
  type FormQuestionType,
  type FormRenderMode,
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

// --- Key-referencing rules ------------------------------------------------------
//
// A blueprint's conditional rules have to name questions BEFORE those questions have ids —
// the Designer emits the whole form in one shot and the Builder mints the ids on the way in.
// So a blueprint names them by `key`, a short author-meaningful slug, and the Builder
// substitutes real ids as it persists.
//
// The rename is why these are separate types rather than the contract's `ConditionalRule`
// reused verbatim. Reusing it would have meant a blueprint rule and a persisted rule sharing a
// type while `questionId` silently held a key in one of them — and a key that reached the
// database unsubstituted produces a rule referencing nothing, which evaluates false forever and
// hides a question with no error anywhere. `questionKey` vs `questionId` makes forgetting the
// substitution a COMPILE error instead of a silent one.
//
// Everything except that one field is DERIVED from the contract's zod schemas rather than
// re-typed, so the operator list cannot drift the way the question-type enum once did.

/** One leaf condition, naming its question by blueprint key rather than by id. */
export const blueprintConditionSchema = conditionalConditionSchema
  .omit({ questionId: true })
  .extend({ questionKey: z.string().min(1) });

/** `all` (AND) / `any` (OR) over leaf conditions — the contract's combinators, keyed. */
export const blueprintConditionGroupSchema = z.object({
  all: z.array(blueprintConditionSchema).optional(),
  any: z.array(blueprintConditionSchema).optional(),
});

/** A blueprint visibility rule. Absent means "always visible", as in the contract. */
export const blueprintConditionalRuleSchema = z.object({
  show: blueprintConditionGroupSchema.optional(),
});

export type BlueprintCondition = z.infer<typeof blueprintConditionSchema>;
export type BlueprintConditionGroup = z.infer<typeof blueprintConditionGroupSchema>;
export type BlueprintConditionalRule = z.infer<typeof blueprintConditionalRuleSchema>;

/**
 * Every leaf condition in a rule, flattened across both combinators.
 *
 * Shared by the validator below and the Builder's key-to-id substitution so the two cannot
 * disagree about which conditions exist — a condition one of them walked and the other did not
 * is exactly a rule that validates and then persists broken.
 */
export function conditionsOf(rule: BlueprintConditionalRule | undefined): BlueprintCondition[] {
  if (!rule?.show) {
    return [];
  }
  return [...(rule.show.all ?? []), ...(rule.show.any ?? [])];
}

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
  /**
   * A request for a GENERATED image, as opposed to {@link blueprintOptionSchema}'s `imageURL`,
   * which references one that already exists.
   *
   * The two are not alternatives the Designer chooses between: it can describe a picture but
   * cannot know a URL, so in practice it only ever fills this one. The image stage turns the
   * prompt into bytes, stores them, and writes the resulting URL into the same column `imageURL`
   * feeds — which is why a blueprint carrying both is not a conflict, just a picture already made.
   */
  imagePrompt: z.string().min(1).optional(),
});

/**
 * A single question in the blueprint. `settings` carries per-type open config
 * (e.g. `{ "max": 5 }` for Rating, NPS label bounds) as JSON — never `any`.
 */
export const blueprintQuestionSchema = z.object({
  /**
   * A short slug naming this question within the blueprint, e.g. `diet`.
   *
   * Only questions something REFERS to need one — the Designer is told to add a key when it
   * writes a rule, not to slug every question — so it is optional and usually absent. It exists
   * for exactly as long as the blueprint does; nothing persists it.
   */
  key: z.string().min(1).optional(),
  type: formQuestionTypeSchema,
  prompt: z.string().min(1),
  helpText: z.string().optional(),
  isRequired: z.boolean().optional(),
  /** Choice-style only; ignored (and warned) for other types. */
  options: z.array(blueprintOptionSchema).max(MAX_BLUEPRINT_OPTIONS).optional(),
  /** Per-type open settings, e.g. `{ "min": 0, "max": 10 }`. */
  settings: z.record(z.unknown()).optional(),
  /**
   * Declarative validation, persisted to `FormQuestion.ValidationRule`.
   *
   * `required` is deliberately NOT here — it is {@link blueprintQuestionSchema}'s `isRequired`,
   * matching the contract, so there is one place a question says it must be answered.
   */
  validationRule: validationRuleSchema.optional(),
  /** Show/hide logic. May only reference questions EARLIER in the form — see the validator. */
  conditionalRule: blueprintConditionalRuleSchema.optional(),
});

/** A page (section) of the blueprint, holding ordered questions. */
export const blueprintPageSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(blueprintQuestionSchema).min(1).max(MAX_BLUEPRINT_QUESTIONS_PER_PAGE),
  /** Page-level show/hide logic. May only reference questions on EARLIER pages. */
  conditionalRule: blueprintConditionalRuleSchema.optional(),
});

// --- Screens ---------------------------------------------------------------------
//
// Screens BRACKET the intake rather than sitting inside it — see `PublishedFormScreen` in the
// contract for why that makes them not-questions. The Designer authors them here so a generated
// form arrives with the same start-and-finish framing a hand-built one gets, instead of dropping
// the respondent straight onto question one and leaving them on a bare confirmation string.

/** What a Welcome and an Ending screen have in common. */
const blueprintScreenBaseSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  /** Button copy ("Start", "Done"). The widget supplies a default when absent. */
  buttonLabel: z.string().optional(),
  /** A generated hero image for this screen. See the option schema for how prompts become URLs. */
  imagePrompt: z.string().min(1).optional(),
});

/** The screen shown before intake begins. At most one per form (a filtered unique index). */
export const blueprintWelcomeScreenSchema = blueprintScreenBaseSchema;

/** A screen shown after a successful submit. Several are allowed; a rule picks between them. */
export const blueprintEndingScreenSchema = blueprintScreenBaseSchema.extend({
  /** Send the respondent here instead of showing the screen. */
  redirectURL: z.string().optional(),
  /**
   * Which responses get this ending. Unlike a page rule, an ending may reference ANY question:
   * it is resolved once the whole form is answered, so restricting it to a prefix would hide the
   * last page from the branch most likely to care about it.
   */
  conditionalRule: blueprintConditionalRuleSchema.optional(),
  /** The fallback shown when no conditional ending matched. The Builder guarantees exactly one. */
  isDefault: z.boolean().optional(),
});

export const blueprintScreensSchema = z.object({
  welcome: blueprintWelcomeScreenSchema.optional(),
  /**
   * Optional rather than defaulted to `[]`, so the inferred type has no input/output split and a
   * hand-written blueprint (the starter templates) does not have to spell out an empty list.
   */
  endings: z.array(blueprintEndingScreenSchema).max(MAX_BLUEPRINT_ENDINGS).optional(),
});

/**
 * What the Designer noticed about the brand, for the theme stage to turn into tokens.
 *
 * Deliberately NOT a palette. Asking one prompt to both read a brief and pick accessible colours
 * produced neither well; the theme stage owns colour, and this is the brief it works from.
 */
export const blueprintThemeSchema = z.object({
  /** e.g. `["warm", "professional"]` — the adjectives the theme prompt is given. */
  brandAdjectives: z.array(z.string().min(1)).optional(),
  /**
   * A brand site the author named. ACCEPTED AND NOT FETCHED.
   *
   * Fetching an author-supplied URL server-side is an SSRF vector, and this API also serves
   * anonymous traffic — so extraction needs its own hardening design (scheme allowlist, private-IP
   * blocklist, timeout, size cap) rather than a `fetch` bolted onto a theme prompt. Carrying the
   * field now means the blueprint does not change shape when that lands.
   */
  brandURL: z.string().optional(),
});

/** The full authoring blueprint the Designer emits and the Builder persists. */
export const formBlueprintObjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  renderMode: formRenderModeSchema.optional(),
  confirmationMessage: z.string().optional(),
  pages: z.array(blueprintPageSchema).min(1).max(MAX_BLUEPRINT_PAGES),
  screens: blueprintScreensSchema.optional(),
  theme: blueprintThemeSchema.optional(),
});

export type BlueprintOption = z.infer<typeof blueprintOptionSchema>;
export type BlueprintQuestion = z.infer<typeof blueprintQuestionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type BlueprintWelcomeScreen = z.infer<typeof blueprintWelcomeScreenSchema>;
export type BlueprintEndingScreen = z.infer<typeof blueprintEndingScreenSchema>;
export type BlueprintScreens = z.infer<typeof blueprintScreensSchema>;
export type BlueprintTheme = z.infer<typeof blueprintThemeSchema>;
export type FormBlueprint = z.infer<typeof formBlueprintObjectSchema>;

/**
 * The blueprint schema callers should use: the object shape PLUS the cross-field key checks.
 *
 * Split from {@link formBlueprintObjectSchema} only because `superRefine` returns a `ZodEffects`,
 * which cannot be `.extend()`ed; the object form stays available for that and for `z.infer`.
 */
export const formBlueprintSchema = formBlueprintObjectSchema.superRefine(checkKeyIntegrity);

// --- Key integrity (cross-field validation) --------------------------------------
//
// A rule naming a key nothing declares, or naming a question the respondent has not reached yet,
// is not a schema error — every field is individually well-typed. It is a form that renders and
// then behaves wrongly: the rule evaluates against an answer that does not exist, comes out
// false, and hides a question forever with nothing logged. Catching it HERE means the Designer
// gets the specific complaint back in its retry prompt and can fix it, which is the entire
// reason the retry loop feeds `ValidationError` to the model.
//
// The ordering rules are not invented: they are the ones the builder's own editors already
// enforce (`form-builder.component.ts` `conditionalSources` / `endingConditionalSources`), so an
// AI-authored rule and a hand-authored one are legal in exactly the same cases.

/** Where a keyed question sits, in both page terms and whole-form document order. */
interface KeyPosition {
  pageIndex: number;
  /** Position across the whole form, pages then questions. */
  ordinal: number;
}

function checkKeyIntegrity(blueprint: FormBlueprint, ctx: z.RefinementCtx): void {
  const positions = indexQuestionKeys(blueprint, ctx);
  checkQuestionRules(blueprint, positions, ctx);
  checkPageRules(blueprint, positions, ctx);
  checkEndingRules(blueprint, positions, ctx);
}

/** Map every declared key to its position, reporting any key declared twice. */
function indexQuestionKeys(blueprint: FormBlueprint, ctx: z.RefinementCtx): Map<string, KeyPosition> {
  const positions = new Map<string, KeyPosition>();
  let ordinal = 0;
  blueprint.pages.forEach((page, pageIndex) => {
    page.questions.forEach((question, questionIndex) => {
      const current = ordinal++;
      if (!question.key) {
        return;
      }
      if (positions.has(question.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pages', pageIndex, 'questions', questionIndex, 'key'],
          message: `Duplicate question key "${question.key}". Keys must be unique across the form.`,
        });
        return;
      }
      positions.set(question.key, { pageIndex, ordinal: current });
    });
  });
  return positions;
}

/** A question may only be gated by questions asked before it. */
function checkQuestionRules(
  blueprint: FormBlueprint,
  positions: Map<string, KeyPosition>,
  ctx: z.RefinementCtx,
): void {
  let ordinal = 0;
  blueprint.pages.forEach((page, pageIndex) => {
    page.questions.forEach((question, questionIndex) => {
      const current = ordinal++;
      const path = ['pages', pageIndex, 'questions', questionIndex, 'conditionalRule'];
      for (const condition of conditionsOf(question.conditionalRule)) {
        const target = resolveKey(condition.questionKey, positions, path, ctx);
        if (target && target.ordinal >= current) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message:
              `Question "${question.prompt}" is shown based on "${condition.questionKey}", which ` +
              'comes later in the form. A rule may only reference an earlier question.',
          });
        }
      }
    });
  });
}

/** A page may only be gated by questions on earlier pages — never by its own. */
function checkPageRules(
  blueprint: FormBlueprint,
  positions: Map<string, KeyPosition>,
  ctx: z.RefinementCtx,
): void {
  blueprint.pages.forEach((page, pageIndex) => {
    const path = ['pages', pageIndex, 'conditionalRule'];
    for (const condition of conditionsOf(page.conditionalRule)) {
      const target = resolveKey(condition.questionKey, positions, path, ctx);
      if (target && target.pageIndex >= pageIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message:
            `Page ${pageIndex + 1} is shown based on "${condition.questionKey}", which is not on ` +
            'an earlier page. A page rule may only reference a question the respondent has passed.',
        });
      }
    }
  });
}

/** An ending is resolved after everything is answered, so any key will do — it just has to exist. */
function checkEndingRules(
  blueprint: FormBlueprint,
  positions: Map<string, KeyPosition>,
  ctx: z.RefinementCtx,
): void {
  (blueprint.screens?.endings ?? []).forEach((ending, index) => {
    const path = ['screens', 'endings', index, 'conditionalRule'];
    for (const condition of conditionsOf(ending.conditionalRule)) {
      resolveKey(condition.questionKey, positions, path, ctx);
    }
  });
}

/** Resolve a referenced key, reporting an unknown one and returning undefined. */
function resolveKey(
  key: string,
  positions: Map<string, KeyPosition>,
  path: Array<string | number>,
  ctx: z.RefinementCtx,
): KeyPosition | undefined {
  const found = positions.get(key);
  if (!found) {
    const known = [...positions.keys()];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        `Conditional rule references question key "${key}", which no question declares. ` +
        (known.length > 0 ? `Declared keys: ${known.join(', ')}.` : 'No question declares a key.'),
    });
  }
  return found;
}

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
 * Parse one page's DETAIL — the second stage's output — against the keys the outline established.
 *
 * A detail page is an ordinary {@link blueprintPageSchema} page; nothing about its shape is
 * special. What is special is the context it is validated in: its rules reference keys declared
 * across the WHOLE form, most of which are not on this page, so the form-level key check cannot be
 * reused and a bare `blueprintPageSchema.parse` would accept a reference to nothing.
 *
 * `knownKeys` is the outline's full key set, and a reference to a key that never existed is the
 * first thing this catches.
 *
 * `ordering` is the second, and it exists because the reasoning that used to sit here was wrong.
 * It said the form-level ordering rules "are deliberately NOT re-applied: the detail pass refines
 * questions the outline already placed, so a rule that was legal in the outline stays legal". That
 * holds for PAGE rules. It does not hold for QUESTION rules, because the outline template emits
 * only `key`, `type` and `prompt` per question — question-level rules are authored ENTIRELY by the
 * detail pass, so there was no earlier legality for them to inherit and nothing checked them at
 * all on the staged route. A page-1 question gated on a page-3 answer validated, persisted, and
 * was hidden from every respondent forever with nothing logged. The single-shot route caught it;
 * the staged one, which is what the chat uses, did not.
 *
 * Optional so a caller with no outline to hand keeps the key check on its own.
 *
 * Throws a `ZodError` — the same currency the Designer retry loop already speaks, so a bad detail
 * page is retried with the specific complaint rather than failing the page.
 */

/**
 * Where this page sits, and where every key the outline declared sits.
 *
 * BOTH fields are load-bearing, and the reason is worth stating because it was got wrong twice.
 * `positions` gives the precise ordinal comparison for a question that HAS a key. `pageIndex` is
 * what makes the check work for one that does not — and that is the common case, because the
 * outline prompt hands out keys only to questions a rule REFERENCES, never to the questions doing
 * the referencing. A version of this judged keyed questions only, which made the whole check inert
 * on the normal path; `pageIndex` was then deleted as unused, when it was unread only because of
 * that. Unused is not the same as unneeded.
 */
export interface PageDetailOrdering {
  positions: ReadonlyMap<string, KeyPosition>;
  /** This page's index in the outline. */
  pageIndex: number;
}

/**
 * Every declared key and its position, without a refinement context.
 *
 * The same walk `indexQuestionKeys` does, minus the duplicate reporting — the outline has already
 * been validated by the time a detail page is parsed, so there is nothing left to report here.
 */
export function declaredKeyPositions(blueprint: FormBlueprint): Map<string, KeyPosition> {
  const positions = new Map<string, KeyPosition>();
  let ordinal = 0;
  blueprint.pages.forEach((page, pageIndex) => {
    page.questions.forEach((question) => {
      const current = ordinal++;
      if (question.key && !positions.has(question.key)) {
        positions.set(question.key, { pageIndex, ordinal: current });
      }
    });
  });
  return positions;
}

/**
 * A question on a detail page may only be gated by an answer given before it.
 *
 * ORDER COMES FROM THE OUTLINE, NEVER FROM THE DETAIL ARRAY. `refineQuestion` does not touch
 * `DisplayOrder`, and stubs are loaded `OrderBy: 'DisplayOrder'` — so what a respondent actually
 * sees is the order the OUTLINE established, whatever order the model happened to return the
 * detail in. An earlier version of this check used the detail array index and was wrong in both
 * directions on a reordered page: it refused legal rules (burning every retry, then degrading the
 * page to bare stubs) and accepted the illegal ones it exists to catch.
 *
 * TWO TIERS, because most questions carrying a rule have no key. The outline prompt gives a key
 * ONLY to questions something references, so the question doing the referencing is normally
 * keyless and has no ordinal here:
 *
 *   - KEYED: compare ordinals. Exact, and catches a same-page reference to a later sibling.
 *   - KEYLESS: compare PAGES. Its ordinal is unknown but its page is not — it is the page being
 *     detailed — so a reference to a LATER page is provably unreachable and refused.
 *
 * WHAT IS STILL NOT CHECKED, deliberately: a keyless question referencing a key on its OWN page.
 * That may be legal or not and nothing here can tell, so refusing would cost the author the whole
 * page on a guess. The form-level validator covers it on the single-shot route.
 */
function checkDetailQuestionOrder(
  page: BlueprintPage,
  ordering: PageDetailOrdering,
  ctx: z.RefinementCtx,
): void {
  page.questions.forEach((question, questionIndex) => {
    const mine = question.key ? ordering.positions.get(question.key) : undefined;
    for (const condition of conditionsOf(question.conditionalRule)) {
      const target = ordering.positions.get(condition.questionKey);
      // An unknown key is the `knownKeys` check's business, not this one.
      if (!target) {
        continue;
      }
      const reachable = mine
        ? target.ordinal < mine.ordinal
        : target.pageIndex <= ordering.pageIndex;
      if (reachable) {
        continue;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', questionIndex, 'conditionalRule'],
        message:
          `Question "${question.prompt}" is shown based on "${condition.questionKey}", which is ` +
          'not asked earlier in the form. A rule may only reference an earlier question.',
      });
    }
  });
}

export function parsePageDetail(
  input: string | object,
  knownKeys: ReadonlySet<string>,
  ordering?: PageDetailOrdering,
): BlueprintPage {
  const raw: unknown = typeof input === 'string' ? JSON.parse(extractJSON(input)) : input;
  return blueprintPageSchema
    .superRefine((page, ctx) => {
      const rules = [page.conditionalRule, ...page.questions.map((q) => q.conditionalRule)];
      for (const rule of rules) {
        for (const condition of conditionsOf(rule)) {
          if (!knownKeys.has(condition.questionKey)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['conditionalRule'],
              message:
                `Conditional rule references question key "${condition.questionKey}", which is not ` +
                `part of this form. Available keys: ${[...knownKeys].join(', ') || '(none)'}.`,
            });
          }
        }
      }
      if (ordering) {
        checkDetailQuestionOrder(page, ordering, ctx);
      }
    })
    .parse(raw);
}

/** Every question key the blueprint declares, for {@link parsePageDetail} to validate against. */
export function declaredKeys(blueprint: FormBlueprint): Set<string> {
  const keys = new Set<string>();
  for (const page of blueprint.pages) {
    for (const question of page.questions) {
      if (question.key) {
        keys.add(question.key);
      }
    }
  }
  return keys;
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

// The key-referencing rule types are the contract's rule types with ONE field renamed. The two
// guards below say exactly that, so a field added to either side breaks the build here rather
// than being silently dropped when the Builder substitutes ids: a new `ConditionalCondition`
// field would never reach the database, and a new blueprint-only field would never be read.
// `blueprintConditionSchema` derives its operator union from the contract, so operators are
// already covered by construction — these guards are about SHAPE.
const _conditionShapeMatch: AssertExtends<
  Exclude<keyof BlueprintCondition, 'questionKey'>,
  Exclude<keyof ConditionalCondition, 'questionId'>
> = true;
const _groupShapeMatch: AssertExtends<keyof BlueprintConditionGroup, keyof ConditionalGroup> = true;
void _conditionShapeMatch;
void _groupShapeMatch;
