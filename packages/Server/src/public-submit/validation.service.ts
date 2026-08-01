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
 * A `partial` (autosave) submission is held to step 3's UPPER BOUNDS only (`maxLength`, `max`).
 * It is a draft, and the widget autosaves on a debounce with no validity gate, so a half-typed
 * value is the normal case rather than an error — but "not finished" and "already too big" are
 * different claims. A value under `minLength`, an incomplete email or a value that does not yet
 * match a `pattern` are all states a respondent passes THROUGH; a value past `maxLength` is not
 * on its way anywhere. Exempting the ceilings too meant an author's `maxLength` bought nothing
 * on the autosave path.
 *
 * Note what this does NOT do: a question with no `validationRule` at all — the common case — is
 * still capped only by MJAPI's 50mb GraphQL body limit, on the draft path and the complete path
 * alike. Enforcing an author's ceiling is not the same as having a global one, and a global
 * answer-size cap is a product decision rather than something to smuggle in here.
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
  isAnswerSupplied,
  coerceAnswerToNumber,
  matchesValidationPattern,
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
  const answered = isAnswerSupplied(value);

  if (!answered) {
    if (question.isRequired && !partial) {
      errors.push({ questionId: question.id, message: `"${question.prompt}" is required.` });
    }
    return; // nothing to persist / validate for an unanswered, optional question
  }

  const invalid = validateValue(question, value, partial);
  if (invalid) {
    errors.push({ questionId: question.id, message: invalid });
    return;
  }
  if (input) {
    visible.push({ question, input });
  }
}

/**
 * Validate an answered value: the format its TYPE implies, then the declarative
 * {@link ValidationRule} the author supplied (if any).
 *
 * The type check runs unconditionally and is NOT a fallback for a missing rule. An `Email`
 * question with a `pattern` is still an email question, so the type floor holds and the
 * author's pattern narrows it further — a rule can constrain a type, never loosen it.
 * {@link validateAnswerFormat} is the same check the widget runs, imported rather than
 * reimplemented so the two cannot drift again.
 *
 * A `partial` (autosave) save is held ONLY to the upper bounds. Everything else — the type
 * format, `minLength`, `min`, `pattern` — describes a finished value, and a respondent passes
 * through all of those states on the way to a good answer: the widget autosaves on a 1500ms
 * debounce with no validity gate, so "someone@examp" is what typing an address looks like.
 * An upper bound is different in kind. A value already past `maxLength` is not on its way to
 * being valid; it is wrong now and every further keystroke makes it worse. See
 * {@link validateUpperBounds} for why that distinction is load-bearing here specifically.
 */
function validateValue(
  question: PublishedFormQuestion,
  value: AnswerValue,
  partial: boolean,
): string | undefined {
  const rule = question.validationRule;
  if (partial) {
    return rule ? validateUpperBounds(value, rule) : undefined;
  }
  const formatError = validateAnswerFormat(question.type, value);
  if (formatError) {
    return formatError;
  }
  if (!rule) {
    return undefined;
  }
  if (typeof value === 'string') {
    const stringError = validateString(value, rule);
    if (stringError) {
      return stringError;
    }
  }
  return validateNumericRange(value, rule);
}

/**
 * The subset of the rule a DRAFT is still answerable for: the ceilings.
 *
 * This is the anonymous public write path. `FormResponseAnswer.TextValue` is `NVARCHAR(MAX)`,
 * MJAPI's GraphQL body limit is 50mb, and the widget sets no `maxlength` attribute on its
 * inputs — so with autosave exempt from `maxLength`, an ordinary respondent pasting a very
 * large value had it persisted, no crafted request required. Ceilings are also the only rules
 * that can be judged on an unfinished value without being unfair about it.
 */
function validateUpperBounds(value: AnswerValue, rule: ValidationRule): string | undefined {
  if (typeof value === 'string' && rule.maxLength !== undefined && value.length > rule.maxLength) {
    return `Must be at most ${rule.maxLength} characters.`;
  }
  const num = coerceAnswerToNumber(value);
  if (num !== undefined && rule.max !== undefined && num > rule.max) {
    return `Must be at most ${rule.max}.`;
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
  if (rule.pattern !== undefined && !matchesValidationPattern(value, rule.pattern)) {
    return rule.patternMessage ?? 'Value is not in the expected format.';
  }
  return undefined;
}

/**
 * Numeric-answer rules: min, max — applied to any answer that IS a number, not only to one
 * that happened to arrive in the `numericValue` column.
 *
 * This used to branch on `typeof value === 'number'`, so a range was enforced on
 * `{ numericValue: 9999 }` and silently skipped on `{ textValue: "9999" }`. A text input
 * produces a string, the widget coerces it and enforces the range, and this module's own
 * docstring calls `textValue` a legitimate numeric spelling — so the two sides reached
 * opposite verdicts on the same answer based only on which column carried it.
 */
function validateNumericRange(value: AnswerValue, rule: ValidationRule): string | undefined {
  const num = coerceAnswerToNumber(value);
  if (num === undefined) {
    return undefined;
  }
  if (rule.min !== undefined && num < rule.min) {
    return `Must be at least ${rule.min}.`;
  }
  if (rule.max !== undefined && num > rule.max) {
    return `Must be at most ${rule.max}.`;
  }
  return undefined;
}
