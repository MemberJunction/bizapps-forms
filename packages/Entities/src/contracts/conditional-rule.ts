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

/** Comparison operators supported by a single condition (FORMS_BUILD_PLAN §6). */
export type ConditionalOperator =
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn'
  | 'isAnswered'
  | 'greaterThan'
  | 'lessThan'
  | 'contains';

/**
 * The value a condition compares against. Scalars for equality/ordering/substring
 * checks; arrays for the membership operators (`in` / `notIn`). `isAnswered` ignores
 * the value entirely (hence `value?` on the condition).
 */
export type ConditionValue = string | number | boolean | string[] | number[];

/**
 * The runtime value a respondent has supplied for a question, as held in the answer
 * map passed to the evaluator. Mirrors the spread of `FormResponseAnswer` typed
 * columns: text, numeric, boolean, date, and multi-select arrays. `undefined` /
 * `null` mean "not answered".
 */
export type AnswerValue = string | number | boolean | string[] | number[] | null | undefined;

/** A single leaf condition: "does `questionId`'s answer satisfy `op` vs `value`?". */
export interface ConditionalCondition {
  questionId: string;
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
 * A declarative visibility rule. Phase 1 supports `show`: the page/question is shown
 * only when the group evaluates true. Absence of a rule (or of `show`) means
 * "always visible".
 */
export interface ConditionalRule {
  show?: ConditionalGroup;
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
  answers: Map<string, AnswerValue>,
): boolean {
  if (!rule || !rule.show) {
    return true;
  }
  return evaluateGroup(rule.show, answers);
}

/**
 * Evaluate a single group. `all` conditions are AND-ed; `any` conditions are OR-ed;
 * when both are present, both must hold. An empty/absent group is vacuously true.
 */
export function evaluateGroup(group: ConditionalGroup, answers: Map<string, AnswerValue>): boolean {
  const allPass =
    group.all === undefined || group.all.every((c) => evaluateCondition(c, answers));
  const anyPass =
    group.any === undefined || group.any.length === 0 || group.any.some((c) => evaluateCondition(c, answers));
  return allPass && anyPass;
}

/** Evaluate one leaf condition against the supplied answers. */
export function evaluateCondition(
  condition: ConditionalCondition,
  answers: Map<string, AnswerValue>,
): boolean {
  const answer = answers.get(condition.questionId);
  switch (condition.op) {
    case 'isAnswered':
      return isAnswered(answer);
    case 'equals':
      return scalarsEqual(answer, condition.value);
    case 'notEquals':
      return !scalarsEqual(answer, condition.value);
    case 'in':
      return isMember(answer, condition.value);
    case 'notIn':
      return isAnswered(answer) && !isMember(answer, condition.value);
    case 'greaterThan':
      return compareNumeric(answer, condition.value) === 'greater';
    case 'lessThan':
      return compareNumeric(answer, condition.value) === 'less';
    case 'contains':
      return answerContains(answer, condition.value);
    default:
      return assertNever(condition.op);
  }
}

// ---------------------------------------------------------------------------
// Operator helpers (each small + pure).
// ---------------------------------------------------------------------------

/** "Answered" = not null/undefined, and not an empty string or empty array. */
function isAnswered(answer: AnswerValue): boolean {
  if (answer === null || answer === undefined) {
    return false;
  }
  if (typeof answer === 'string') {
    return answer.length > 0;
  }
  if (Array.isArray(answer)) {
    return answer.length > 0;
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

/** Numeric comparison result, or `undefined` when either side is non-numeric. */
function compareNumeric(
  answer: AnswerValue,
  value: ConditionValue | undefined,
): 'greater' | 'less' | 'equal' | undefined {
  const a = toNumber(answer);
  const b = toNumber(value);
  if (a === undefined || b === undefined) {
    return undefined;
  }
  if (a > b) {
    return 'greater';
  }
  if (a < b) {
    return 'less';
  }
  return 'equal';
}

/** Coerce an answer/condition value to a finite number, or `undefined`. */
function toNumber(value: AnswerValue | ConditionValue | undefined): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
