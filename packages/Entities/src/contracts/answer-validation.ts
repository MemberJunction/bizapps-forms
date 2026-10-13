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
 *  1. Refuse any answer larger than {@link MAX_ANSWER_VALUE_BYTES}, in every mode.
 *  2. Settle visibility over the answers ({@link settleVisibility}); questions that resolve hidden
 *     are DROPPED (their answers are discarded, and they cannot trip "required").
 *  3. For each visible question: enforce `isRequired`, then the format implied by the question's
 *     TYPE (shared `validateAnswerFormat`), then the author's `ValidationRule`.
 *  4. Refuse a `complete` submission that left nothing to persist and raised no other error, ON A
 *     FORM THAT ASKED SOMETHING (#124) — it would otherwise be sealed `Complete` and counted
 *     against both quotas. A form that asks nothing is completable, and always was.
 *
 * A `draft` (autosave) submission is held to step 3's UPPER BOUNDS only (`maxLength`, `max`) —
 * plus the one thing the row cannot physically hold, see {@link validateDraft}. It is a draft, and
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
  matchesValidationPattern,
  validateAnswerFormat,
  validateCompositeParts,
} from './answer-format';
import { answerColumnFor, isAnswerableQuestionType } from './question-types';
import type { PublishedFormPage, PublishedFormQuestion } from './form-definition';
import { NOTHING_TO_SUBMIT_MESSAGE, type FieldError, type FormAnswerInput } from './submission';
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
 * Global ceiling on ONE answer value, independent of any author-configured rule.
 *
 * A hard abuse bound, not a product knob: `FormResponseAnswer.TextValue` is `NVARCHAR(MAX)` and
 * the widget sets no `maxlength`, so without this the only limit on a question without a
 * `validationRule` was MJAPI's 50mb GraphQL body cap. 64KB is far beyond any legitimate typed
 * answer. Enforced in EVERY mode — an autosaved draft persists a row just like a completion does.
 * The widget now enforces it too, so a respondent is told under the field rather than by a
 * refused save.
 *
 * WHAT THIS DOES NOT BOUND, stated because the obvious reading is wrong: it is a cap per ANSWER,
 * and nothing here caps how many answers one payload may carry. The unknown-question refusal
 * limits them to the form's own question set, but that count is author-controlled, so a
 * 100-question form still admits 100 x 64KB in a single save.
 */
export const MAX_ANSWER_VALUE_BYTES = 64 * 1024;

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
   * Today forms-server's confirmation ending reads this map, but its knockout gate still reads a
   * raw `buildAnswerMap` of the payload; #303 Task 8 moves both onto `resolveResponseOutcome`.
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

  // Judged on the RAW inputs, before visibility drops any of them: an oversized value the walk
  // would discard still travelled and still describes a caller this save should refuse whole.
  collectOversizedAnswers(answers, errors);

  const inputByQuestion = new Map(answers.map((a) => [a.questionId, a] as const));
  const visibility = settleVisibility(definition, buildAnswerMap(answers));
  const visible: ValidatedAnswer[] = [];
  for (const question of visibility.answerable) {
    const input = inputByQuestion.get(question.id);
    const value = input ? answerValueOf(input) : undefined;
    if (isOversized(value)) {
      continue; // already reported above, once, against the raw input
    }
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
 * What a DRAFT is held to: the ceilings, plus anything the row cannot physically hold.
 *
 * The second clause is scoped to the `date` column, and only to it, because it is the one typed
 * column whose transport is wider than its storage: `dateValue` is a GraphQL `String`, `DateValue`
 * is a `DATETIMEOFFSET`. An unparseable date is also never a value "still being typed":
 * `<input type="date">` and `<input type="time">` emit nothing until the value is whole, so holding
 * a draft to it costs no respondent any progress (#116).
 */
function validateDraft(
  question: PublishedFormQuestion,
  value: AnswerValue,
  rule: ValidationRule | undefined,
): string | undefined {
  if (answerColumnFor(question.type) === 'date') {
    const unstorable = validateAnswerFormat(question, value);
    if (unstorable) {
      return unstorable;
    }
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

/**
 * What an oversized answer is told, derived from the bound rather than restating it, so raising
 * the ceiling cannot leave the respondent being told the old number.
 */
function oversizedAnswerMessage(): string {
  return `That answer is too large. Answers are limited to ${MAX_ANSWER_VALUE_BYTES / 1024}KB each.`;
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

/**
 * UTF-8 length of a string, counted by hand.
 *
 * Not `Buffer.byteLength`, which is what the server used: this module runs in the widget bundle,
 * which has no Node `Buffer`. A lone surrogate counts 3 bytes, which is what an encoder emits for
 * it (U+FFFD), so this agrees with `Buffer.byteLength` on every input.
 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Coerce a JSON array (multi-select) into the string[]/number[] the evaluator expects. */
function jsonArrayToScalarArray(arr: ReadonlyArray<unknown>): string[] | number[] {
  if (arr.every((v) => typeof v === 'number')) {
    return arr as number[];
  }
  return arr.map((v) => (typeof v === 'string' ? v : String(v)));
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

/** One error per answer whose value exceeds {@link MAX_ANSWER_VALUE_BYTES}. */
function collectOversizedAnswers(answers: readonly FormAnswerInput[], errors: FieldError[]): void {
  for (const answer of answers) {
    if (isOversized(answerValueOf(answer))) {
      errors.push({ questionId: answer.questionId, message: oversizedAnswerMessage() });
    }
  }
}
