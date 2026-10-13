/**
 * Validating a respondent's answers against the published definition — ONE implementation, run by
 * the widget before it sends and by the server before it stores.
 *
 * This was two: the widget's `validateQuestion` and the server's `validateSubmission`. They shared
 * the format checks (`validateAnswerFormat`) but restated everything around them, and drifted — the
 * same `minLength` read "Use at least 3 characters." under the field and "Must be at least 3
 * characters." in the server's refusal, and the server derived visibility in one pass where the
 * widget iterated to a fixed point, so it could require a question the widget never rendered. Both
 * sides now call {@link validateAnswer} (one field, as the respondent types) and
 * {@link validateAnswers} (the whole payload).
 *
 * Pipeline of {@link validateAnswers}:
 *  0. Refuse any answer whose question id is in NO page of the definition — malformed input in
 *     every mode (#124). A hidden or display-only question is a KNOWN id and is not this.
 *  1. Refuse, in every mode and before anything reads a value, an answer that is too large, too deep
 *     or too wide, or not in the form its question's type stores (`answer-shape.ts`). A payload that
 *     fails this is refused whole: nothing below runs.
 *  2. Settle visibility over the answers ({@link settleVisibility}); questions that resolve hidden
 *     are DROPPED (their answers are discarded, and they cannot trip "required").
 *  3. For each visible question: enforce `isRequired`, then the format implied by the question's
 *     TYPE (shared `validateAnswerFormat`), then the author's `ValidationRule`.
 *  4. Refuse a `complete` submission that left nothing to persist and raised no other error, ON A
 *     FORM THAT ASKED SOMETHING (#124) — it would otherwise be sealed `Complete` and counted
 *     against both quotas. A form that asks nothing is completable, and always was.
 *
 * A `draft` (autosave) submission is held to step 3's UPPER BOUNDS only (`maxLength`, `max`) —
 * plus what its column cannot hold (an unparseable date, a non-number), see {@link validateDraft}. It is a draft, and
 * the widget autosaves on a debounce with no validity gate, so a half-typed value is the normal
 * case rather than an error — but "not finished" and "already too big" are different claims.
 *
 * The type check in step 3 was missing on the server until 2026-08-01 while the old comment
 * claimed it was there: an `Email` question with no `pattern` accepted anything posted straight at
 * the mutation. One implementation is what makes "the server re-runs the same rules" a fact.
 *
 * Pure — no I/O, no Node APIs (the widget bundle runs this in a browser).
 */
import { isAnswerSupplied, type AnswerValue, type ValidationRule } from './conditional-rule';
import {
  coerceAnswerToNumber,
  isRequiredSatisfied,
  NOT_A_NUMBER_MESSAGE,
  matchesValidationPattern,
  validateAnswerFormat,
  validateCompositeParts,
} from './answer-format';
import { answerColumnFor, isAnswerableQuestionType } from './question-types';
import type { PublishedFormPage, PublishedFormQuestion } from './form-definition';
import { NOTHING_TO_SUBMIT_MESSAGE, type FieldError, type FormAnswerInput } from './submission';
import {
  answerShapeProblem,
  answersStructureRefusal,
  MAX_ANSWER_VALUE_BYTES,
  numericStorageProblem,
  oversizedAnswerMessage,
  utf8ByteLength,
} from './answer-shape';
import { settleVisibility, type SettledVisibility } from './visibility';

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

/**
 * What an answer naming a question this form does not have is told (#124).
 *
 * Only the server ever says it in practice — the widget builds its payload from the definition's
 * own ids — but it lives here with every other message so there is one place that says what a
 * respondent can be told.
 */
export const UNKNOWN_QUESTION_MESSAGE = 'That answer does not belong to any question on this form.';

/** What a respondent is told about one answer. */
export interface AnswerProblem {
  readonly message: string;
  /**
   * For composite questions (Address / ContactInfo): which SUB-FIELD each problem belongs to, so
   * the widget can put every message beneath the input that caused it.
   *
   * Absent — not empty — when the failure belongs to the question as a whole (required, or a value
   * that is not a record at all); the widget then shows the one message under the group.
   */
  readonly parts?: Readonly<Record<string, string>>;
}

/** A validated, visible answer paired with its question for persistence. */
export interface ValidatedAnswer {
  question: PublishedFormQuestion;
  input: FormAnswerInput;
}

/** The verdict on a whole payload: either errors, or the visible answers to save. */
export interface AnswersValidation {
  errors: FieldError[];
  answers: ValidatedAnswer[];
  /**
   * The answers the rules were evaluated against — the payload's answers restricted to the
   * settled visible set.
   *
   * Surfaced so ending-screen resolution can run on exactly the values validation judged. Building
   * a second map from the same inputs would be a second implementation of `answerValueOf`'s
   * column precedence, and the two disagreeing would show a respondent the wrong thank-you page.
   *
   * `FormSubmissionEngine` resolves the outcome with `resolveResponseOutcome`, which settles the
   * same answers the same way, so the knockout, the score and the stored answers are one set.
   */
  answerMap: ReadonlyMap<string, AnswerValue>;
  /** The settled visibility, including whether the form's rules settled at all. */
  visibility: SettledVisibility;
}

/**
 * Derive the comparable {@link AnswerValue} from a wire answer. Mirrors the typed-column spread of
 * `FormResponseAnswer`.
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
  if (input.jsonValue != null && typeof input.jsonValue === 'object') {
    return input.jsonValue;
  }
  // A file answer populates `fileId` and nothing else, so omitting it here made every FileUpload
  // answer read as unanswered and, when the question was required, rejected the whole submit after
  // the upload had already succeeded. Last in the precedence, matching the stored-shape collapse,
  // so the transport and the storage readings of the same answer cannot disagree.
  if (input.fileId != null) {
    return input.fileId;
  }
  return undefined;
}

/** Build the questionId -> AnswerValue map the conditional evaluator consumes. */
export function buildAnswerMap(answers: readonly FormAnswerInput[]): Map<string, AnswerValue> {
  const map = new Map<string, AnswerValue>();
  for (const a of answers) {
    map.set(a.questionId, answerValueOf(a));
  }
  return map;
}

/**
 * The verdict on ONE answer to a question the respondent can see — what the widget shows under
 * the field, and what {@link validateAnswers} reports for it. `undefined` when it is acceptable.
 *
 * Only call for VISIBLE questions: a hidden question is never required and never validated, and
 * deciding visibility is {@link settleVisibility}'s job, not this function's.
 */
export function validateAnswer(
  question: PublishedFormQuestion,
  value: AnswerValue,
  mode: ValidationMode,
): AnswerProblem | undefined {
  if (!isAnswerableQuestionType(question.type)) {
    return undefined; // display-only, never an answer
  }
  if (isOversized(value)) {
    return { message: oversizedAnswerMessage() };
  }
  return judgeAnswer(question, value, mode);
}

/**
 * Validate a whole payload. See {@link ValidationMode} for what each mode waives.
 *
 * Takes only the pages, so a published definition and a respondent projection both qualify.
 */
export function validateAnswers(
  definition: { readonly pages: readonly PublishedFormPage[] },
  answers: readonly FormAnswerInput[],
  mode: ValidationMode,
): AnswersValidation {
  const errors: FieldError[] = [];

  // An answer naming a question this version does not have is malformed input, in every mode. It
  // used to fall straight through the walk below, which visits the definition's questions and
  // looks the inputs up: an input nothing looks up was neither an error nor an answer, so a
  // submission matching NOTHING sailed on to be sealed `Complete` (#124). Refused whole rather
  // than trimmed: within a pinned version the question set is fixed, so only a client bug or a
  // crafted request sends one. Only ids in NO page are unknown — a question hidden by a rule is a
  // known id, and its answer is dropped silently below, since a widget legitimately autosaves an
  // answer before a later answer hides the question.
  collectUnknownAnswers(definition, answers, errors);

  // The SHAPE before anything reads a value (`answer-shape.ts`), on the RAW inputs, before visibility
  // drops any of them: a value the walk would discard still travelled, and describes a caller this
  // save refuses whole. Size and nesting first, with no recursion — nothing below may walk a value
  // that has not passed it — then the column each question's type stores. A payload that fails
  // either is malformed in every mode, so nothing else is judged (#303 Task 8 fix round 2).
  errors.push(...answersStructureRefusal(answers));
  if (errors.length === 0) {
    collectMisshapenAnswers(definition, answers, errors);
  }
  if (errors.length > 0) {
    return { errors, answers: [], answerMap: new Map(), visibility: UNJUDGED };
  }

  const inputByQuestion = new Map(answers.map((a) => [a.questionId, a] as const));
  const visibility = settleVisibility(definition, buildAnswerMap(answers));
  const visible: ValidatedAnswer[] = [];
  for (const question of visibility.answerable) {
    const input = inputByQuestion.get(question.id);
    const value = input ? answerValueOf(input) : undefined;
    const problem = judgeAnswer(question, value, mode);
    if (problem) {
      errors.push({ questionId: question.id, message: problem.message });
    } else if (input && isAnswerSupplied(value)) {
      visible.push({ question, input });
    }
  }

  // A finished submission that stores nothing is not a response, and must not become a `Complete`
  // row: both quotas count those, so an empty one spends a slot a real respondent needed (#124).
  //
  // Three conditions, and each excludes a submission that is legitimately empty:
  //  - `complete` mode only — a draft with nothing typed yet is the normal autosave case, and a
  //    `screened-out` row records the SCREENING, not answers, so "stores nothing" is not a reason
  //    to refuse it;
  //  - no other error — a required-field error already says what is missing, more precisely;
  //  - the form asked something on this path — an acknowledgement form of pure `Statement` copy,
  //    or one whose every answerable question is hidden, is completable by everyone.
  if (mode === 'complete' && errors.length === 0 && visible.length === 0 && visibility.answerable.length > 0) {
    errors.push({ message: NOTHING_TO_SUBMIT_MESSAGE });
  }
  return { errors, answers: visible, answerMap: visibility.answers, visibility };
}

/**
 * Requiredness, then format, then the author's rule — for a value already known to fit the cap.
 *
 * Required is asked SEPARATELY from answered, because the two disagree on consent: an unticked box
 * is `false`, which is a supplied answer, so a required "I agree to the terms" used to pass.
 */
function judgeAnswer(
  question: PublishedFormQuestion,
  value: AnswerValue,
  mode: ValidationMode,
): AnswerProblem | undefined {
  if (mode === 'complete' && question.isRequired && !isRequiredSatisfied(question.type, value)) {
    return { message: requiredMessage(question) };
  }
  if (!isAnswerSupplied(value)) {
    return undefined; // nothing to validate on an unanswered, optional question
  }
  // In EVERY mode, and here — the per-field verdict the widget shows and gates Submit on — as well as
  // in the whole-payload shape check: a number `decimal(18,4)` cannot hold is refused by both, with
  // the same words, or the widget calls valid what the server refuses (fix round 3, re-review N2).
  // Only a NUMBER: a numeric spelling sent as text is stored as text, and the format rule judges it.
  if (typeof value === 'number' && answerColumnFor(question.type) === 'numeric') {
    const unstorable = numericStorageProblem(value);
    if (unstorable) {
      return { message: unstorable };
    }
  }
  if (mode === 'draft') {
    const message = validateDraft(question, value, question.validationRule);
    return message ? { message } : undefined;
  }
  // The whole question, not just its type: an option-based answer cannot be checked against
  // options it was never given. A rule can constrain a type, never loosen it — the type floor
  // holds and the author's rule narrows it further.
  const formatError = validateAnswerFormat(question, value);
  if (formatError) {
    // The summary IS these parts joined, so asking for both cannot produce a disagreement.
    const parts = validateCompositeParts(question.type, value);
    return Object.keys(parts).length > 0 ? { message: formatError, parts } : { message: formatError };
  }
  const ruleError = validateRule(value, question.validationRule);
  return ruleError ? { message: ruleError } : undefined;
}

/**
 * The required message, respondent-facing — the widget shows it under the field.
 *
 * A consent box gets its own sentence because "required" is the wrong word for a box that must be
 * ticked: the respondent HAS answered it (`false`), they have just not agreed.
 */
function requiredMessage(question: PublishedFormQuestion): string {
  return question.type === 'Checkbox' || question.type === 'Legal'
    ? 'Please tick this box to continue.'
    : 'This question is required.';
}

/**
 * What a DRAFT is held to: the ceilings, plus anything its question's column cannot hold.
 *
 * Two columns, and only these two, because they are the typed columns a value can reach that is not
 * of their type:
 *  - `date`: `dateValue` is wire text, `DateValue` a `DATETIMEOFFSET`. An unparseable date is never
 *    a value "still being typed" — `<input type="date">`/`type="time"` emit nothing until the value
 *    is whole — so holding a draft to it costs no respondent any progress (#116).
 *  - `numeric` (#303 Task 8): a non-number on a Number, Rating or NPS question reached storage as a
 *    `TextValue` no completion would accept and no numeric reader can use. A number control emits
 *    nothing until its value parses, so the same reasoning holds. Only "is it a number" is asked
 *    here; ranges stay the completion's business (and `max` the ceiling below).
 */
function validateDraft(
  question: PublishedFormQuestion,
  value: AnswerValue,
  rule: ValidationRule | undefined,
): string | undefined {
  const column = answerColumnFor(question.type);
  if (column === 'date') {
    const unstorable = validateAnswerFormat(question, value);
    if (unstorable) {
      return unstorable;
    }
  }
  if (column === 'numeric' && coerceAnswerToNumber(value) === undefined) {
    return NOT_A_NUMBER_MESSAGE;
  }
  return rule ? validateUpperBounds(value, rule) : undefined;
}


/**
 * The subset of the rule a DRAFT is still answerable for: the ceilings. A value already past
 * `maxLength` is not on its way to being valid; every further keystroke makes it worse.
 */
function validateUpperBounds(value: AnswerValue, rule: ValidationRule): string | undefined {
  if (typeof value === 'string' && rule.maxLength !== undefined && value.length > rule.maxLength) {
    return maxLengthMessage(rule.maxLength);
  }
  const num = coerceAnswerToNumber(value);
  if (num !== undefined && rule.max !== undefined && num > rule.max) {
    return maxMessage(rule.max);
  }
  return undefined;
}

/**
 * The declarative {@link ValidationRule}: length and pattern on a string, then range on any answer
 * that IS a number — not only one that arrived in the `numericValue` column. A text input produces
 * a string and `coerceAnswerToNumber` documents `textValue` as a legitimate numeric spelling, so
 * branching on `typeof value === 'number'` reached opposite verdicts on the same answer depending
 * on which column carried it.
 */
function validateRule(value: AnswerValue, rule: ValidationRule | undefined): string | undefined {
  if (!rule) {
    return undefined;
  }
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return `Use at least ${rule.minLength} characters.`;
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return maxLengthMessage(rule.maxLength);
    }
    if (rule.pattern !== undefined && !matchesValidationPattern(value, rule.pattern)) {
      return rule.patternMessage ?? 'Value is not in the expected format.';
    }
  }
  const num = coerceAnswerToNumber(value);
  if (num === undefined) {
    return undefined;
  }
  if (rule.min !== undefined && num < rule.min) {
    return `Must be at least ${rule.min}.`;
  }
  if (rule.max !== undefined && num > rule.max) {
    return maxMessage(rule.max);
  }
  return undefined;
}

// The two ceilings are said by the draft path and the complete path alike; one spelling each.
function maxLengthMessage(maxLength: number): string {
  return `Use at most ${maxLength} characters.`;
}

function maxMessage(max: number): string {
  return `Must be at most ${max}.`;
}

function isOversized(value: AnswerValue): boolean {
  return answerValueBytes(value) > MAX_ANSWER_VALUE_BYTES;
}

/** How many UTF-8 bytes one answer value occupies (JSON-serialized for non-string shapes). */
function answerValueBytes(value: AnswerValue): number {
  if (value === undefined) {
    return 0;
  }
  return utf8ByteLength(typeof value === 'string' ? value : (JSON.stringify(value) ?? ''));
}

/** Coerce a JSON array (multi-select) into the string[]/number[] the evaluator expects. */
function jsonArrayToScalarArray(arr: ReadonlyArray<unknown>): string[] | number[] {
  if (arr.every((v) => typeof v === 'number')) {
    return arr as number[];
  }
  return arr.map((v) => (typeof v === 'string' ? v : String(v)));
}

/** The visibility of a payload refused before it was judged: nothing renders from it. */
const UNJUDGED: SettledVisibility = { settled: true, passes: 0, answers: new Map(), rendered: [], answerable: [] };

/** One error per answer to a KNOWN question whose shape its question's type does not store. */
function collectMisshapenAnswers(
  definition: { readonly pages: readonly PublishedFormPage[] },
  answers: readonly FormAnswerInput[],
  errors: FieldError[],
): void {
  const typeOf = new Map(definition.pages.flatMap((page) => page.questions.map((question) => [question.id, question.type] as const)));
  for (const answer of answers) {
    const type = typeOf.get(answer.questionId);
    const problem = type === undefined ? undefined : answerShapeProblem(type, answer);
    if (problem) {
      errors.push({ questionId: answer.questionId, message: problem });
    }
  }
}

/** Every question id the published version carries, rendered or not, answerable or not. */
function knownQuestionIds(definition: { readonly pages: readonly PublishedFormPage[] }): Set<string> {
  const ids = new Set<string>();
  for (const page of definition.pages) {
    for (const question of page.questions) {
      ids.add(question.id);
    }
  }
  return ids;
}

/**
 * One error per unknown QUESTION ID — not per answer naming one. Matched exactly, the same key the
 * walk looks inputs up by, so "known" means "would be matched". De-duplicated because the widget
 * joins every message into one banner, and the same sentence twice reads as a bug.
 */
function collectUnknownAnswers(
  definition: { readonly pages: readonly PublishedFormPage[] },
  answers: readonly FormAnswerInput[],
  errors: FieldError[],
): void {
  const known = knownQuestionIds(definition);
  const reported = new Set<string>();
  for (const answer of answers) {
    if (!known.has(answer.questionId) && !reported.has(answer.questionId)) {
      reported.add(answer.questionId);
      errors.push({ questionId: answer.questionId, message: UNKNOWN_QUESTION_MESSAGE });
    }
  }
}
