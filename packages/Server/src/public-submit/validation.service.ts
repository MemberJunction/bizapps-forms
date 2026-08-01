/**
 * Server-side re-validation of a submission against the published definition
 * (FORMS_BUILD_PLAN §6 / S2). The widget validates client-side; the server NEVER
 * trusts that and re-runs the same shared evaluator so visibility/required/format
 * decisions cannot be bypassed.
 *
 * Pipeline:
 *  1. Build `Map<questionId, AnswerValue>` from the raw answer inputs.
 *  2. Evaluate page + question `ConditionalRule` with the shared
 *     {@link evaluateConditionalRule}; questions that resolve hidden are DROPPED
 *     (their answers are discarded, and they cannot trip "required").
 *  3. For each visible question: enforce `isRequired`, then the format implied by the
 *     question's TYPE (shared {@link validateAnswerFormat}), then the author's
 *     `ValidationRule` (length / numeric bounds / regex pattern).
 *
 * A `partial` (autosave) submission skips ALL of step 3's value checks, not just `isRequired`:
 * it is a draft, and the widget autosaves on a debounce with no validity gate, so half-typed
 * values are the normal case rather than an error. Only the real submit is held to the rules.
 *
 * Step 3's type check was missing until 2026-08-01, and this comment claimed it was there. The
 * widget enforced it, the server did not, so an `Email` question authored without a `pattern`
 * accepted anything posted straight at the mutation — `not-an-email` persisted as a `Complete`
 * response. The check now comes from the shared contract both sides import, which is what makes
 * "the server re-runs the same rules" a fact rather than an intention.
 *
 * Returns the set of visible answers to persist plus any field errors. Pure — no I/O.
 */
import {
  evaluateConditionalRule,
  validateAnswerFormat,
  type AnswerValue,
  type FieldError,
  type FormAnswerInput,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities';

/** A validated, visible answer paired with its question for persistence. */
export interface ValidatedAnswer {
  question: PublishedFormQuestion;
  input: FormAnswerInput;
}

/** Result of re-validation: either errors, or the visible answers to save. */
export interface ValidationOutcome {
  errors: FieldError[];
  answers: ValidatedAnswer[];
}

/**
 * Derive the comparable {@link AnswerValue} for the conditional evaluator from a raw
 * answer input. Mirrors the typed-column spread of `FormResponseAnswer`.
 */
export function answerValueOf(input: FormAnswerInput): AnswerValue {
  // Use `!= null` (not `!== undefined`): the GraphQL transport coerces every OMITTED typed field
  // to `null` on the server, so a MultiChoice answer arrives as `{ textValue: null, jsonValue: [...] }`.
  // A `!== undefined` check would return that `null` and mask the real (jsonValue) answer, making a
  // required multi-select read as empty and rejecting the whole submit. `!= null` skips the empty
  // typed columns and falls through to the populated one. (0 and false are still returned.)
  if (input.textValue != null) {
    return input.textValue;
  }
  if (input.numericValue != null) {
    return input.numericValue;
  }
  if (input.booleanValue != null) {
    return input.booleanValue;
  }
  if (input.dateValue != null) {
    return input.dateValue;
  }
  if (Array.isArray(input.jsonValue)) {
    return jsonArrayToScalarArray(input.jsonValue);
  }
  return undefined;
}

/** Coerce a JSON array (multi-select) into the string[]/number[] the evaluator expects. */
function jsonArrayToScalarArray(arr: ReadonlyArray<unknown>): string[] | number[] {
  if (arr.every((v) => typeof v === 'number')) {
    return arr as number[];
  }
  return arr.map((v) => (typeof v === 'string' ? v : String(v)));
}

/** Build the questionId -> AnswerValue map the conditional evaluator consumes. */
export function buildAnswerMap(answers: FormAnswerInput[]): Map<string, AnswerValue> {
  const map = new Map<string, AnswerValue>();
  for (const a of answers) {
    map.set(a.questionId, answerValueOf(a));
  }
  return map;
}

/** "Answered" = a non-empty value present (matches the conditional evaluator's notion). */
function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
 * Run full server-side validation. `partial` submissions skip the `isRequired`
 * check (the respondent has not finished) but still validate any supplied answers.
 */
export function validateSubmission(
  definition: PublishedFormDefinition,
  answers: FormAnswerInput[],
  partial: boolean,
): ValidationOutcome {
  const answerMap = buildAnswerMap(answers);
  const inputByQuestion = new Map(answers.map((a) => [a.questionId, a] as const));
  const errors: FieldError[] = [];
  const visible: ValidatedAnswer[] = [];

  for (const page of definition.pages) {
    if (!evaluateConditionalRule(page.conditionalRule, answerMap)) {
      continue;
    }
    for (const question of page.questions) {
      collectVisibleQuestion(question, answerMap, inputByQuestion, partial, errors, visible);
    }
  }
  return { errors, answers: visible };
}

/** Evaluate one question's visibility, requiredness, and format; append findings. */
function collectVisibleQuestion(
  question: PublishedFormQuestion,
  answerMap: Map<string, AnswerValue>,
  inputByQuestion: Map<string, FormAnswerInput>,
  partial: boolean,
  errors: FieldError[],
  visible: ValidatedAnswer[],
): void {
  if (question.type === 'Statement') {
    return; // display-only, never an answer
  }
  if (!evaluateConditionalRule(question.conditionalRule, answerMap)) {
    return; // hidden => its answer is dropped and required does not apply
  }

  const input = inputByQuestion.get(question.id);
  const value = input ? answerValueOf(input) : undefined;
  const answered = isAnswered(value);

  if (!answered) {
    if (question.isRequired && !partial) {
      errors.push({ questionId: question.id, message: `"${question.prompt}" is required.` });
    }
    return; // nothing to persist / validate for an unanswered, optional question
  }

  // A partial save is a snapshot of work in progress, not a claim that the work is done — the
  // same reason `isRequired` is skipped above. The widget autosaves on a 1500ms debounce with
  // no validity gate, so a respondent who pauses while typing an address autosaves something
  // like "someone@examp"; holding that to the finished value's standard throws away their
  // progress for the most ordinary thing they can do, which is type slowly. The real submit
  // (`partial === false`) enforces format and rule, and a partial can never reach `Complete`.
  if (!partial) {
    const invalid = validateValue(question, value);
    if (invalid) {
      errors.push({ questionId: question.id, message: invalid });
      return;
    }
  }
  if (input) {
    visible.push({ question, input });
  }
}

/**
 * Validate an answered value: first the format its TYPE implies, then the declarative
 * {@link ValidationRule} the author supplied (if any).
 *
 * The type check runs unconditionally and is NOT a fallback for a missing rule. An `Email`
 * question with a `pattern` is still an email question, so the type floor holds and the
 * author's pattern narrows it further — a rule can constrain a type, never loosen it.
 * {@link validateAnswerFormat} is the same check the widget runs, imported rather than
 * reimplemented so the two cannot drift again.
 */
function validateValue(question: PublishedFormQuestion, value: AnswerValue): string | undefined {
  const formatError = validateAnswerFormat(question.type, value);
  if (formatError) {
    return formatError;
  }
  const rule = question.validationRule;
  if (!rule) {
    return undefined;
  }
  if (typeof value === 'string') {
    return validateString(value, rule);
  }
  if (typeof value === 'number') {
    return validateNumber(value, rule);
  }
  return undefined;
}

/** String-answer rules: minLength, maxLength, pattern. */
function validateString(value: string, rule: ValidationRule): string | undefined {
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    return `Must be at least ${rule.minLength} characters.`;
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    return `Must be at most ${rule.maxLength} characters.`;
  }
  if (rule.pattern !== undefined && !matchesPattern(value, rule.pattern)) {
    return rule.patternMessage ?? 'Value is not in the expected format.';
  }
  return undefined;
}

/** Numeric-answer rules: min, max. */
function validateNumber(value: number, rule: ValidationRule): string | undefined {
  if (rule.min !== undefined && value < rule.min) {
    return `Must be at least ${rule.min}.`;
  }
  if (rule.max !== undefined && value > rule.max) {
    return `Must be at most ${rule.max}.`;
  }
  return undefined;
}

/** Full-match regex test; an invalid pattern source is treated as "no match". */
function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return false;
  }
}
