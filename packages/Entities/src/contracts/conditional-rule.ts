/**
 * S2 — ConditionalRule + Validation JSON contract.
 *
 * Stored on `FormPage.ConditionalRule` and `FormQuestion.ConditionalRule` /
 * `FormQuestion.ValidationRule`. The widget (WP-C) evaluates these client-side to
 * drive show/hide; the server (WP-B) re-validates the same rules on submit. Both
 * sides MUST share this schema and the {@link evaluateConditionalRule} evaluator so
 * visibility decisions never drift between client and server.
 *
 * Canonical shape (FORMS_BUILD_PLAN §6):
 * ```jsonc
 * { "show": { "all": [ { "questionId": "<id>", "op": "equals", "value": "Other" } ] } }
 * ```
 */
import type { JSONObject } from './json-value';

/**
 * Comparison operators supported by a single condition (FORMS_BUILD_PLAN §6).
 *
 * Eight, down from twelve (plans/RULES_SIMPLIFICATION_PLAN.md §2). `equalsIgnoreCase`,
 * `contains`, `startsWith` and `endsWith` are gone: all four only ever did something on a
 * FREE-TEXT answer, and a condition on free text is a rule that fires on whether the
 * respondent's spelling matched the author's. The author who wrote "First name equals Soham"
 * and typed "Soahm" in the runtime is the case that killed them — the affix operators make
 * that failure mode more likely, not less, because they read as fuzzy while matching exactly.
 * Conditions now belong on questions with a fixed answer set, where the value is picked.
 *
 * `isNotAnswered` is the one worth keeping in mind: without it, "show this only when the
 * respondent skipped that" is inexpressible — `notEquals` fails on an unanswered question (see
 * `scalarsEqual`), so no combination of the others can say it.
 */
export type ConditionalOperator =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'isAnswered'
  | 'isNotAnswered'
  | 'greaterThan'
  | 'lessThan';

/**
 * The value a condition compares against. Scalars for equality/ordering checks; arrays for
 * the membership operators (`in` / `notIn`). `isAnswered` ignores the value entirely (hence
 * `value?` on the condition).
 */
export type ConditionValue = string | number | boolean | string[] | number[];

/**
 * The runtime value a respondent has supplied for a question, as held in the answer
 * map passed to the evaluator. Mirrors the spread of `FormResponseAnswer` typed
 * columns: text, numeric, boolean, date, multi-select arrays — and, since composite
 * question types landed, the object shapes that occupy the `JSONValue` column
 * (`Address`, `ContactInfo`, `Matrix`). `undefined` / `null` mean "not answered".
 *
 * The object arm is what a composite answer looks like WHILE IT IS BEING FILLED IN, not only
 * once stored: the widget holds one entry per question, so an Address must be in the map as a
 * partially-typed object for the conditional evaluator to see it at all. Every comparison
 * operator below already returns `false` for a value it cannot compare, so an object answer
 * degrades to "no match" for `equals`/`greaterThan`/`in` rather than needing a branch in each
 * — the one operator that genuinely had to learn about it is {@link isAnswerSupplied}, which
 * decides whether the question counts as answered.
 */
export type AnswerValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | JSONObject
  | null
  | undefined;

/** What a condition reads: a question's answer (the default), or the running score (C4). */
export type ConditionSource = 'question' | 'score';

/**
 * A single leaf condition: "does `questionId`'s answer (or the score) satisfy `op` vs `value`?".
 *
 * `source` is absent for the original question-reading conditions — every stored rule predates
 * it — and `'score'` for a condition that reads the running total instead of an answer. A
 * score condition has no `questionId`; a question condition without one is malformed and never
 * fires (see {@link evaluateCondition}).
 */
export interface ConditionalCondition {
  source?: ConditionSource;
  /** The question whose answer is read. Required unless `source` is `'score'`. */
  questionId?: string;
  op: ConditionalOperator;
  /** Omitted for `isAnswered`; required for every other operator. */
  value?: ConditionValue;
}

/**
 * A boolean combination of conditions. Exactly one of `all` (AND) / `any` (OR) is
 * expected in practice, but both are permitted; see {@link evaluateGroup} for the
 * precise semantics when both or neither are present.
 */
export interface ConditionalGroup {
  /** Every listed condition must pass (logical AND). */
  all?: ConditionalCondition[];
  /** At least one listed condition must pass (logical OR). */
  any?: ConditionalCondition[];
}

/** What a `Go to` rule can point at (QUESTION_LEVEL_LOGIC_PLAN §2). */
export type JumpTargetKind = 'question' | 'page' | 'ending' | 'submit';

/**
 * Where a fired jump sends the respondent — TAGGED, so no reader has to guess what an id
 * refers to.
 *
 * `question` and `page` skip forward within the form; `ending` finishes it and shows that
 * screen; `submit` finishes it and leaves the screen to `resolveEndingScreen`, which is what an
 * author wants when several endings compete on score. `submit` names nothing, hence the arm
 * without an `id`.
 *
 * What arriving at an ending MEANS is the screen's business, not the rule's: a screen flagged
 * `isDisqualification` records the response as `Disqualified` (no quota, no automations), and
 * every other screen records it as `Complete`. Keeping that on the screen is what let the
 * separate disqualify verb — and its `isArmedKnockout` guard — be deleted.
 */
export type JumpTarget =
  | { kind: 'question'; id: string }
  | { kind: 'page'; id: string }
  | { kind: 'ending'; id: string }
  | { kind: 'submit' };

/** A target that moves within the form — the ones a forward-order check applies to. */
export type NavigationTarget = Extract<JumpTarget, { kind: 'question' | 'page' }>;

/**
 * One forward jump: when `when` passes, go to `target`.
 *
 * Forward-only for the non-terminal kinds — a backward, self or unknown target is inert, never
 * an error — which is what makes jump cycles unrepresentable (RULES_AND_BRANCHING_PLAN §2.2).
 * Terminal targets have no ordering to violate.
 *
 * Rules authored before targets were tagged carry `{ when, toPageId }` instead. That shape is
 * normalized to `{ kind: 'page', id }` at the parse boundary and nowhere else: two shapes
 * reaching a resolver is how a resolver comes to prefer one of them by accident.
 */
export interface ConditionalJumpRule {
  when: ConditionalGroup;
  target: JumpTarget;
}

/**
 * Whether this target ENDS the form rather than moving within it.
 *
 * Named because three places need the distinction and each would otherwise spell it as its own
 * two-arm comparison: the flow resolver (stop walking), the widget (submit and show a screen)
 * and the server (seal the response).
 */
export function isTerminalTarget(
  target: JumpTarget,
): target is Extract<JumpTarget, { kind: 'ending' | 'submit' }> {
  return target.kind === 'ending' || target.kind === 'submit';
}

/**
 * A declarative rule object — one JSON column, two verbs (RULES_AND_BRANCHING_PLAN §2.1, as
 * narrowed by RULES_SIMPLIFICATION_PLAN §2).
 *
 * `show` (any item): visible only when the group passes; absent means "always visible".
 * `jump` (pages): forward skips, first match wins — see `resolveVisiblePages` in rule-verbs.ts.
 * Absent keys mean exactly the pre-verb behavior, so every already-published snapshot keeps
 * meaning what it meant.
 *
 * There was a third verb, `require`, which made an optional question required when a group
 * fired. It is gone: every question already carries a static Required toggle, so the verb was
 * a second answer to a question the form had already answered — two places to look, able to
 * disagree, with the toggle silently winning. The asterisk and `aria-required` in the widget
 * never knew about it either, so a conditionally-required question looked optional right up
 * until submit refused it. A rule that has to be a rule can say the same thing by showing the
 * question conditionally and marking it required. Legacy blobs carrying the key still parse —
 * zod strips it (see `legacy-rules.spec.ts`).
 */
export interface ConditionalRule {
  show?: ConditionalGroup;
  jump?: ConditionalJumpRule[];
}

/**
 * Caps on rule size (design principle: every unbounded shape gets an explicit limit).
 *
 * Three enforcement points, and it is worth being precise about which one catches what,
 * because an earlier version of this comment claimed two that did not exist:
 *
 *  - The EDITOR stops offering "Add condition" at `MAX_CONDITIONS_PER_GROUP` (`canAddCondition`
 *    in the builder's condition-sources). This is the only one that acts before a rule is
 *    stored, and it is what makes an over-cap group unauthorable through the UI. The rules
 *    panel authors a single jump per page, so `MAX_JUMP_RULES` has no UI to enforce.
 *  - The ZOD schema rejects an over-cap rule, but it runs on the SERVER's snapshot parse, not
 *    on the builder's publish path (which uses the permissive JSON parser). So it is a boundary
 *    check on untrusted input, NOT the publish-time failure an author would see.
 *  - `resolveVisiblePages` ignores jump rules beyond the cap, defense in depth for callers that
 *    never went through either.
 *
 * Known residual, out of this change's blast radius: a rule hand-authored or AI-authored over
 * the cap still parses to `undefined` server-side (the snapshot parser logs and tolerates it),
 * and an absent `show` group means VISIBLE — so such a rule fails open on the item it guards.
 * Closing that means deciding what an unreadable rule should mean form-wide, which is a
 * broader change than adding these caps was.
 */
export const MAX_CONDITIONS_PER_GROUP = 20;
export const MAX_JUMP_RULES = 10;

/**
 * Context beyond the answers that a condition may read — today just the running score.
 *
 * Supplied only where the pipeline has actually computed a score (ending resolution and
 * on-submit automations, both after visibility settled). Where it is not supplied, a score
 * condition simply never fires — it does NOT default to zero, because "score unknown here"
 * and "scored zero" are different claims and only the second may satisfy a band.
 */
export interface EvalExtras {
  score?: number;
}

// ---------------------------------------------------------------------------
// Evaluator — pure, no I/O, no side effects. Shared by widget + server.
// ---------------------------------------------------------------------------

/**
 * Decide whether a page/question governed by `rule` should be visible, given the
 * current answers (keyed by questionId).
 *
 * Default is `true`: a missing rule, or a rule with no `show` group, is always
 * visible. This is the single source of truth for visibility on both client and
 * server — do not reimplement it.
 */
export function evaluateConditionalRule(
  rule: ConditionalRule | undefined,
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): boolean {
  if (!rule || !rule.show) {
    return true;
  }
  return evaluateGroup(rule.show, answers, extras);
}

/**
 * Evaluate a single group. `all` conditions are AND-ed; `any` conditions are OR-ed;
 * when both are present, both must hold. An empty/absent group is vacuously true.
 */
export function evaluateGroup(
  group: ConditionalGroup,
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): boolean {
  const allPass =
    group.all === undefined || group.all.every((c) => evaluateCondition(c, answers, extras));
  const anyPass =
    group.any === undefined || group.any.length === 0 || group.any.some((c) => evaluateCondition(c, answers, extras));
  return allPass && anyPass;
}

/** Evaluate one leaf condition against the supplied answers (and score, where provided). */
export function evaluateCondition(
  condition: ConditionalCondition,
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): boolean {
  const answer = conditionOperand(condition, answers, extras);
  if (answer === NOT_EVALUABLE) {
    return false;
  }
  const value = conditionComparand(condition);
  switch (condition.op) {
    case 'isAnswered':
      return isAnswerSupplied(answer);
    case 'isNotAnswered':
      return !isAnswerSupplied(answer);
    case 'equals':
      return scalarsEqual(answer, value);
    case 'notEquals':
      return !scalarsEqual(answer, value);
    case 'in':
      return isMember(answer, value);
    case 'notIn':
      return isAnswerSupplied(answer) && !isMember(answer, value);
    case 'greaterThan':
      return compareOrdered(answer, value) === 'greater';
    case 'lessThan':
      return compareOrdered(answer, value) === 'less';
    default:
      return assertNever(condition.op);
  }
}

/**
 * The value side of a condition, normalized for its source.
 *
 * A `source: 'score'` condition compares against a number — the running total always is one —
 * but the editor's value input is a text box, so it stores `"70"`. `70 === '70'` is false, which
 * made every equality-family operator on the score wrong in both directions: `equals` could
 * never fire, and `notEquals` fired for everyone, with nothing anywhere to say so. Ordering
 * escaped only because {@link compareOrdered} already coerced numeric strings.
 *
 * Normalized HERE, not in the editor, because rules also arrive from mj-sync metadata and the
 * AI form builder — neither of which goes near the editor — and because one conversion at the
 * single point of evaluation cannot drift from the several places that author rules. A value
 * that is not a number stays exactly as written, so authorable nonsense ("score equals banana")
 * remains inert rather than coercing to `NaN` and firing by accident.
 *
 * Question conditions are returned untouched: `'5'` and `5` are genuinely different answers to
 * a question, and collapsing them would change the meaning of every rule already published.
 */
function conditionComparand(condition: ConditionalCondition): ConditionValue | undefined {
  const value = condition.value;
  if (condition.source !== 'score' || value === undefined) {
    return value;
  }
  if (!Array.isArray(value)) {
    return asScoreNumber(value) ?? value;
  }
  // All-or-nothing for a membership list: one unparseable entry means the author wrote something
  // this rule cannot mean, and a half-converted list would quietly match on the half that parsed.
  const numbers: number[] = [];
  for (const entry of value) {
    const parsed = asScoreNumber(entry);
    if (parsed === undefined) {
      return value;
    }
    numbers.push(parsed);
  }
  return numbers;
}

/** One score comparand as a number, or `undefined` when it has no finite numeric reading. */
function asScoreNumber(value: string | number | boolean): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Sentinel for "this condition cannot be evaluated at all" — distinct from every real
 * {@link AnswerValue}, including `undefined` (which legitimately means "unanswered" and is
 * what `isNotAnswered` exists to match).
 */
const NOT_EVALUABLE: unique symbol = Symbol('condition not evaluable');

/**
 * The value a condition's operator runs against: the named question's answer, or the running
 * score for a `source: 'score'` condition.
 *
 * Two malformed/unavailable shapes are refused outright rather than degraded to `undefined`:
 * a question condition with no `questionId` (degrading it would make `isNotAnswered` fire on a
 * condition that names nothing), and a score condition evaluated where no score was computed
 * (see {@link EvalExtras} — "unknown" must not pass for "zero").
 */
function conditionOperand(
  condition: ConditionalCondition,
  answers: ReadonlyMap<string, AnswerValue>,
  extras: EvalExtras | undefined,
): AnswerValue | typeof NOT_EVALUABLE {
  if (condition.source === 'score') {
    return extras?.score === undefined ? NOT_EVALUABLE : extras.score;
  }
  if (condition.questionId === undefined || condition.questionId.length === 0) {
    return NOT_EVALUABLE;
  }
  return answers.get(condition.questionId);
}

// ---------------------------------------------------------------------------
// Operator helpers (each small + pure).
// ---------------------------------------------------------------------------

/**
 * "Answered" = not null/undefined, and not a blank string or empty array.
 *
 * THE one definition of "answered" in the system. Four hand-written copies predated this branch —
 * here, the server's `validateSubmission`, the widget's `hasValue`, and the widget's progress-bar
 * `hasAnswer` — and they had already drifted: this one tested `answer.length > 0` while the other
 * three tested `value.trim().length > 0`. (A fifth briefly existed: `validateAnswerFormat` added
 * its own before all of them were folded in here.)
 *
 * A respondent typing a single space therefore satisfied an `isAnswered` conditional — revealing
 * whatever branch depended on it — while every validator read the same keystroke as blank, so the
 * answer was neither persisted nor able to satisfy `isRequired`. One keystroke made a question
 * answered and unanswered at once. Whitespace is not an answer; every caller now agrees on that
 * by construction rather than by coincidence.
 *
 * Note `0` and `false` ARE answers — only nullish, blank-string and empty-array are not.
 */
export function isAnswerSupplied(answer: AnswerValue): boolean {
  if (answer === null || answer === undefined) {
    return false;
  }
  if (typeof answer === 'string') {
    return answer.trim().length > 0;
  }
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }
  if (typeof answer === 'object') {
    // A composite (Address / ContactInfo / Matrix) is answered once ANY part carries a value.
    // Recursing rather than testing key count is what makes a half-typed address count as
    // answered while `{ line1: '', city: '' }` — which is what an untouched Address control
    // emits on every keystroke elsewhere in the form — correctly does not.
    return Object.values(answer).some((v) => isAnswerSupplied(v as AnswerValue));
  }
  return true;
}

/** Strict scalar equality after normalizing both sides to a comparable primitive. */
function scalarsEqual(answer: AnswerValue, value: ConditionValue | undefined): boolean {
  if (value === undefined || Array.isArray(answer) || Array.isArray(value)) {
    return false;
  }
  return answer === value;
}

/**
 * Membership test for `in` / `notIn`. The condition value is the array of allowed
 * options; a scalar answer passes if it is one of them, and an array answer passes
 * if it intersects them.
 */
function isMember(answer: AnswerValue, value: ConditionValue | undefined): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  const allowed: ReadonlyArray<string | number> = value;
  if (Array.isArray(answer)) {
    return answer.some((a) => allowed.includes(a));
  }
  if (typeof answer === 'string' || typeof answer === 'number') {
    return allowed.includes(answer);
  }
  return false;
}

/**
 * Ordered comparison for `greaterThan` / `lessThan`, or `undefined` when either side is
 * non-comparable OR the two sides are different kinds.
 *
 * Dates are the reason this is kind-tagged. A Date question's answer travels as an ISO string
 * (`answer-value.ts` `dateValue: String(value)`), and `Number('2026-08-25')` is `NaN` — so
 * before this existed, greaterThan/lessThan on a Date question could NEVER fire, while `equals`
 * on the same question worked, making the field look supported. ISO strings now coerce through
 * `Date.parse`. The kinds must MATCH: without that, the number `5` would compare against a
 * date's epoch-milliseconds and fire a nonsense rule ("Start Date greater than 5") that no
 * author meant.
 */
function compareOrdered(
  answer: AnswerValue,
  value: ConditionValue | undefined,
): 'greater' | 'less' | 'equal' | undefined {
  const a = toComparable(answer);
  const b = toComparable(value);
  if (a === undefined || b === undefined || a.kind !== b.kind) {
    return undefined;
  }
  if (a.n > b.n) {
    return 'greater';
  }
  if (a.n < b.n) {
    return 'less';
  }
  return 'equal';
}

/** A value reduced to something orderable, tagged with which scale it lives on. */
interface Comparable {
  kind: 'number' | 'date';
  n: number;
}

/** ISO-8601 calendar-date prefix (`2026-08-25`, `2026-08-25T10:00`, …). */
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Coerce an answer/condition value to a {@link Comparable}, or `undefined`.
 *
 * Numeric strings stay numbers (`'42'` compares as 42, as it always did); only strings shaped
 * like an ISO date take the `Date.parse` path, so free text like `'March 3'` — which
 * `Date.parse` would happily guess at — stays non-comparable rather than firing by locale
 * accident.
 */
function toComparable(value: AnswerValue | ConditionValue | undefined): Comparable | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'number', n: value } : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return { kind: 'number', n: parsed };
    }
    if (ISO_DATE_PREFIX.test(trimmed)) {
      const ms = Date.parse(trimmed);
      return Number.isFinite(ms) ? { kind: 'date', n: ms } : undefined;
    }
  }
  return undefined;
}

/** Exhaustiveness guard for the operator switch. */
function assertNever(op: never): never {
  throw new Error(`Unhandled ConditionalOperator: ${String(op)}`);
}

// ---------------------------------------------------------------------------
// Validation rule (declarative; each side runs its own validator).
// ---------------------------------------------------------------------------

/**
 * Declarative per-question validation, stored on `FormQuestion.ValidationRule`.
 * `required` is intentionally NOT here — it lives on the question
 * (`PublishedFormQuestion.isRequired`).
 */
export interface ValidationRule {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** A regular-expression source string the answer must fully match. */
  pattern?: string;
  /** Human-readable message shown when `pattern` fails. */
  patternMessage?: string;
}
