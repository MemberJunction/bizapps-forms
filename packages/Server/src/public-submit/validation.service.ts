/**
 * Server-side re-validation of a submission against the published definition
 * (FORMS_BUILD_PLAN §6 / S2). The widget validates client-side; the server NEVER
 * trusts that and re-runs the same shared evaluator so visibility/required/format
 * decisions cannot be bypassed.
 *
 * Pipeline:
 *  0. Refuse any answer whose question id is in NO page of the definition — malformed input
 *     in every mode (#124). A hidden or display-only question is a KNOWN id and is not this.
 *  1. Build `Map<questionId, AnswerValue>` from the raw answer inputs.
 *  2. Evaluate page + question `ConditionalRule` with the shared
 *     {@link evaluateConditionalRule}; questions that resolve hidden are DROPPED
 *     (their answers are discarded, and they cannot trip "required").
 *  3. For each visible question: enforce `isRequired`, then the format implied by the
 *     question's TYPE (shared {@link validateAnswerFormat}), then the author's
 *     `ValidationRule` (length / numeric bounds / regex pattern).
 *  4. Refuse a `complete` submission that left nothing to persist and raised no other error
 *     (#124) — it would otherwise be sealed `Complete` and counted against both quotas.
 *
 * A `draft` (autosave) submission is held to step 3's UPPER BOUNDS only (`maxLength`, `max`).
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
  isAnswerableQuestionType,
  isAnswerSupplied,
  isRequiredSatisfied,
  resolveRenderedQuestions,
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
  /**
   * The comparable answer map the conditional rules were evaluated against.
   *
   * Surfaced so ending-screen resolution runs on exactly the values validation judged. Building
   * a second map from the same inputs would be a second implementation of `answerValueOf`'s
   * column precedence, and the two disagreeing would show a respondent the wrong thank-you page
   * — a quiet, un-loggable wrong answer rather than a failure anyone notices.
   */
  answerMap: ReadonlyMap<string, AnswerValue>;
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
  // A COMPOSITE answer (Address / ContactInfo / Matrix) is a JSON object, not an array. Without
  // this branch it falls straight past to `fileId`, returns `undefined`, and is read as
  // unanswered — which drops it before persistence and, when the question is required, rejects
  // the whole submit with a message the respondent cannot act on because they DID fill it in.
  // Exactly the failure documented for `fileId` below, one column over.
  if (input.jsonValue != null && typeof input.jsonValue === 'object') {
    return input.jsonValue;
  }
  // A file answer populates `fileId` and nothing else, so omitting it here made every FileUpload
  // answer read as unanswered: `collectVisibleQuestion` dropped it before persistence (leaving
  // `FormResponseAnswer.FileID` permanently null on the public submit path) and, when the question
  // was required, rejected the whole submit with `"<prompt>" is required.` — after the upload had
  // already succeeded, so nothing the respondent could do would clear it. Last in the precedence,
  // matching the stored-shape collapse in `@mj-biz-apps/forms-entities`, so the transport and the
  // storage readings of the same answer cannot disagree.
  if (input.fileId != null) {
    return input.fileId;
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
 * How much of the rulebook a submission is held to.
 *
 * This was a boolean called `partial`, and the pipeline passed `true` for two unrelated
 * situations: an autosaved draft, and a COMPLETED submission from a respondent a knockout rule
 * screened out. They make different claims. A draft is unfinished, so judging a half-typed
 * value would be unfair. A screened-out submission is finished — it seals the response row —
 * and the only thing it needs waived is `isRequired` on questions the flow never reached.
 * Waiving format along with it left the one path that writes a permanent row as the one path
 * where the author's validation was off.
 */
export type ValidationMode = 'complete' | 'draft' | 'screened-out';

/** Whether this mode enforces `isRequired`. Only a finished, qualifying submission does. */
function asksForEverything(mode: ValidationMode): boolean {
  return mode === 'complete';
}

/** What a respondent is told when their final submit would store nothing (#124). */
const NOTHING_TO_SUBMIT_MESSAGE = 'Please answer at least one question before submitting.';

/** What an answer naming a question this form does not have is told (#124). */
const UNKNOWN_QUESTION_MESSAGE = 'That answer does not belong to any question on this form.';

/**
 * Run full server-side validation. See {@link ValidationMode} for what each mode waives.
 */
export function validateSubmission(
  definition: PublishedFormDefinition,
  answers: FormAnswerInput[],
  mode: ValidationMode,
): ValidationOutcome {
  const answerMap = buildAnswerMap(answers);
  const inputByQuestion = new Map(answers.map((a) => [a.questionId, a] as const));
  const errors: FieldError[] = [];
  const visible: ValidatedAnswer[] = [];

  // An answer naming a question this version does not have is malformed input, in every mode —
  // the same class of defect as the shape guard's "missing its question id", detectable only
  // once the definition is loaded. It used to fall straight through the walk below, which visits
  // the definition's questions and looks the inputs up: an input nothing looks up was neither
  // an error nor an answer, so a submission matching NOTHING sailed on to be sealed `Complete`
  // and counted against the quota (#124). Refused whole rather than trimmed: within a pinned
  // version the question set is fixed, so only a client bug or a crafted request sends one, and
  // keeping the rest silently is exactly the "vanished without trace" that made the bug invisible.
  // Only ids in NO page are unknown. A question hidden by a rule or a display-only type is a
  // known id, and its answer is still dropped silently below — deliberately, since a widget
  // legitimately autosaves an answer before a later answer hides the question.
  collectUnknownAnswers(definition, answers, errors);

  // ONE forward walk decides what the respondent saw — page show rules, question show rules,
  // forward jumps and the terminal jump that ends the form, all folded together. Iterating
  // `resolveVisiblePages` and re-filtering each page's own list was the same answer only for
  // PAGE-level jumps: those remove a whole page, so the page resolver happens to drop them. A
  // question jump hides questions WITHIN a page the walk already entered, and a terminal jump
  // ends the form mid-page — a second pass over that page's list puts every one of them back.
  // The widget renders this same walk, so a question it never showed can no longer be required
  // here (plan invariant 2, which held for pages and silently did not hold for questions).
  for (const question of resolveRenderedQuestions(definition.pages, answerMap)) {
    collectVisibleQuestion(question, answerMap, inputByQuestion, mode, errors, visible);
  }

  // A finished submission that stores nothing is not a response, and must not become a
  // `Complete` row: both quotas count those — the distribution's `ResponseCount` and the form's
  // `COUNT(Status='Complete')` — so an empty one spends a slot a real respondent needed (#124).
  // Refused here, before anything is written, rather than written-and-not-counted, because the
  // form-level count would still see the row. Only on a real completion: a draft with nothing
  // typed yet is the normal autosave case, and a screened-out submission always carries the
  // answer that screened it. Only when nothing else is wrong: a required-field error already
  // says what is missing, more precisely than this can.
  if (asksForEverything(mode) && errors.length === 0 && visible.length === 0) {
    errors.push({ message: NOTHING_TO_SUBMIT_MESSAGE });
  }
  return { errors, answers: visible, answerMap };
}

/** Every question id the published version carries, rendered or not, answerable or not. */
function knownQuestionIds(definition: PublishedFormDefinition): Set<string> {
  const ids = new Set<string>();
  for (const page of definition.pages) {
    for (const question of page.questions) {
      ids.add(question.id);
    }
  }
  return ids;
}

/**
 * Append one error per answer whose question id is in no page of the definition.
 *
 * Matched EXACTLY — the same key {@link validateSubmission}'s `inputByQuestion` lookup uses — so
 * "known" means "would be matched", and an id that would silently miss the lookup cannot
 * masquerade as known here.
 */
function collectUnknownAnswers(
  definition: PublishedFormDefinition,
  answers: FormAnswerInput[],
  errors: FieldError[],
): void {
  const known = knownQuestionIds(definition);
  for (const answer of answers) {
    if (!known.has(answer.questionId)) {
      errors.push({ questionId: answer.questionId, message: UNKNOWN_QUESTION_MESSAGE });
    }
  }
}

/**
 * Enforce requiredness and format on one question the walk decided the respondent reached;
 * append findings.
 *
 * Visibility is NOT re-decided here — `resolveRenderedQuestions` already did it, jumps
 * included. This used to re-run the question's own `show` rule, which read as belt and braces
 * and was in fact the whole belt: it was the only visibility this function applied, so
 * everything the walk knew about jumps was discarded on the way in.
 */
function collectVisibleQuestion(
  question: PublishedFormQuestion,
  answerMap: Map<string, AnswerValue>,
  inputByQuestion: Map<string, FormAnswerInput>,
  mode: ValidationMode,
  errors: FieldError[],
  visible: ValidatedAnswer[],
): void {
  if (!isAnswerableQuestionType(question.type)) {
    return; // display-only, never an answer
  }

  const input = inputByQuestion.get(question.id);
  const value = input ? answerValueOf(input) : undefined;
  const answered = isAnswerSupplied(value);

  // Required is asked SEPARATELY from answered, because the two disagree on consent: an
  // unticked box is `false`, which is a supplied answer, so a required "I agree to the terms"
  // used to pass here as well as in the widget. A rule enforced only in the browser is not
  // enforced at all — this mutation is reachable without it. The visibility return above is
  // what keeps hidden ⇒ never required true (plan invariant 2).
  if (asksForEverything(mode) && question.isRequired && !isRequiredSatisfied(question.type, value)) {
    errors.push({ questionId: question.id, message: `"${question.prompt}" is required.` });
    return;
  }

  if (!answered) {
    return; // nothing to persist / validate for an unanswered, optional question
  }

  const invalid = validateValue(question, value, mode);
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
 * A `draft` (autosave) save is held ONLY to the upper bounds. Everything else — the type
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
  mode: ValidationMode,
): string | undefined {
  const rule = question.validationRule;
  if (mode === 'draft') {
    return rule ? validateUpperBounds(value, rule) : undefined;
  }
  // The whole question, not just its type: an option-based answer cannot be checked against
  // options it was never given. See `AnswerFormatQuestion`.
  const formatError = validateAnswerFormat(question, value);
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
 * produces a string, the widget coerces it and enforces the range, and the shared
 * `coerceAnswerToNumber` (forms-entities) documents `textValue` as a legitimate numeric
 * spelling — so the two sides reached opposite verdicts on the same answer based only on which
 * column carried it.
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
