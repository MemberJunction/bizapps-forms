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
 * The last four landed with plans/RULES_AND_BRANCHING_PLAN.md Phase A3. `isNotAnswered` is the
 * one that matters most: before it, "show this only when the respondent skipped that" was
 * inexpressible — `notEquals` fails on an unanswered question (see `scalarsEqual`), so no
 * combination of the original eight could say it.
 */
export type ConditionalOperator =
  | 'equals'
  | 'notEquals'
  | 'equalsIgnoreCase'
  | 'in'
  | 'notIn'
  | 'isAnswered'
  | 'isNotAnswered'
  | 'greaterThan'
  | 'lessThan'
  | 'contains'
  | 'startsWith'
  | 'endsWith';

/**
 * The value a condition compares against. Scalars for equality/ordering/substring
 * checks; arrays for the membership operators (`in` / `notIn`). `isAnswered` ignores
 * the value entirely (hence `value?` on the condition).
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

/**
 * One forward jump: when `when` passes, skip ahead to the page `toPageId` (pages between are
 * hidden). Forward-only — a backward or unknown target is inert, never an error — which is
 * what makes jump cycles unrepresentable (RULES_AND_BRANCHING_PLAN §2.2).
 */
export interface ConditionalJumpRule {
  when: ConditionalGroup;
  toPageId: string;
}

/**
 * A declarative rule object — one JSON column, several verbs (RULES_AND_BRANCHING_PLAN §2.1).
 *
 * `show` (any item): visible only when the group passes; absent means "always visible".
 * `require` (questions): required when the group passes, on top of the static `isRequired` —
 * see `isRequiredNow` in rule-verbs.ts. `jump` (pages): forward skips, first match wins — see
 * `resolveVisiblePages` there. Absent keys mean exactly the pre-verb behavior, so every
 * already-published snapshot keeps meaning what it meant.
 */
export interface ConditionalRule {
  show?: ConditionalGroup;
  require?: ConditionalGroup;
  jump?: ConditionalJumpRule[];
}

/**
 * Caps on rule size (design principle: every unbounded shape gets an explicit limit).
 *
 * Enforced at the untrusted boundary — the zod schema REJECTS an over-cap rule (an explicit
 * publish-time failure, never a silent truncation that would weaken an `all` group) — and in
 * the editor, which stops offering "Add condition" at the cap. `resolveVisiblePages`
 * additionally ignores jump rules beyond the cap as a defense in depth for pre-validation
 * callers.
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
  switch (condition.op) {
    case 'isAnswered':
      return isAnswerSupplied(answer);
    case 'isNotAnswered':
      return !isAnswerSupplied(answer);
    case 'equals':
      return scalarsEqual(answer, condition.value);
    case 'notEquals':
      return !scalarsEqual(answer, condition.value);
    case 'equalsIgnoreCase':
      return scalarsEqualIgnoreCase(answer, condition.value);
    case 'in':
      return isMember(answer, condition.value);
    case 'notIn':
      return isAnswerSupplied(answer) && !isMember(answer, condition.value);
    case 'greaterThan':
      return compareOrdered(answer, condition.value) === 'greater';
    case 'lessThan':
      return compareOrdered(answer, condition.value) === 'less';
    case 'contains':
      return answerContains(answer, condition.value);
    case 'startsWith':
      return stringAffixMatch(answer, condition.value, 'start');
    case 'endsWith':
      return stringAffixMatch(answer, condition.value, 'end');
    default:
      return assertNever(condition.op);
  }
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
 * `equals`, but case-insensitive when both sides are strings. Any other pairing falls back to
 * {@link scalarsEqual} — numbers and booleans have no case, and treating them differently here
 * would make the two equals operators disagree on non-string answers for no reason an author
 * could see.
 */
function scalarsEqualIgnoreCase(answer: AnswerValue, value: ConditionValue | undefined): boolean {
  if (typeof answer === 'string' && typeof value === 'string') {
    return answer.toLowerCase() === value.toLowerCase();
  }
  return scalarsEqual(answer, value);
}

/**
 * `startsWith` / `endsWith`: prefix/suffix match for a STRING answer only — arrays and
 * composites are "no match", same posture as every other operator here.
 *
 * An empty comparison value never matches, deliberately: `''.startsWith('')` is true, so a
 * half-typed condition would otherwise flip from "never fires" to "always fires" the moment the
 * operator is picked — the silent inversion of what an unfinished rule should do.
 */
function stringAffixMatch(
  answer: AnswerValue,
  value: ConditionValue | undefined,
  where: 'start' | 'end',
): boolean {
  if (typeof answer !== 'string' || value === undefined || Array.isArray(value)) {
    return false;
  }
  const needle = String(value);
  if (needle.length === 0) {
    return false;
  }
  return where === 'start' ? answer.startsWith(needle) : answer.endsWith(needle);
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

/**
 * `contains`: substring match for a string answer, or membership for a multi-select
 * array answer. The condition value must be a scalar.
 */
function answerContains(answer: AnswerValue, value: ConditionValue | undefined): boolean {
  if (value === undefined || Array.isArray(value)) {
    return false;
  }
  if (typeof answer === 'string') {
    return answer.includes(String(value));
  }
  if (Array.isArray(answer)) {
    const needle: string | number | boolean = value;
    return (answer as Array<string | number>).some((a) => a === needle);
  }
  return false;
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
