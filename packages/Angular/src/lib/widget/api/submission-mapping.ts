/**
 * Pure mapping from the widget's answers (the contracts' `FormAnswerInput`, camelCase, structured
 * `jsonValue`) to the `Forms.SaveResponse` wire input — the CodeGen-emitted `FormsSaveResponseInput`
 * (#303 Task 10c). Extracted from the component so it is unit-testable and so the field set is locked
 * by the compiler as well as by a spec (see submission-mapping.spec).
 *
 * The ONLY intentional value divergence is `jsonValue`: the contract carries a structured `JSONValue`,
 * the operation expects JSON TEXT, so it is stringified here.
 */
import type { FormsAnswerInput, FormsSaveResponseInput } from '@mj-biz-apps/forms-entities';
import type { ClientMeta, FormAnswerInput } from '@mj-biz-apps/forms-entities/contracts';

/** One save, as the widget assembles it — every field `Forms.SaveResponse` takes, in the widget's terms. */
export interface RespondentSave {
  distributionSlug: string;
  formVersionId: string;
  mode: FormsSaveResponseInput['Mode'];
  /** The stable client-minted id of this sitting's response — the upsert target and idempotency key. */
  clientResponseId: string;
  startedAt?: string;
  turnstileToken?: string;
  clientMeta?: ClientMeta;
  answers: FormAnswerInput[];
}

/** The wire key each contract answer field travels under. Typed so a field on either side cannot go unmapped. */
export const ANSWER_FIELD_ON_THE_WIRE = {
  questionId: 'QuestionID',
  textValue: 'TextValue',
  numericValue: 'NumericValue',
  dateValue: 'DateValue',
  booleanValue: 'BooleanValue',
  jsonValue: 'JSONValue',
  fileId: 'FileID',
} as const satisfies Record<keyof FormAnswerInput, keyof FormsAnswerInput>;

/** Map one save onto the operation's input. */
export function toSaveResponseInput(save: RespondentSave): FormsSaveResponseInput {
  const input: FormsSaveResponseInput = {
    Slug: save.distributionSlug,
    FormVersionID: save.formVersionId,
    Mode: save.mode,
    ClientResponseID: save.clientResponseId,
    Answers: save.answers.map(toWireAnswer),
  };
  if (save.startedAt !== undefined) {
    input.StartedAt = save.startedAt;
  }
  if (save.turnstileToken !== undefined) {
    input.TurnstileToken = save.turnstileToken;
  }
  if (save.clientMeta) {
    input.ClientMeta = { Referrer: save.clientMeta.referrer, UserAgent: save.clientMeta.userAgent };
  }
  return input;
}

/**
 * Map one contract answer onto the wire shape, stringifying `jsonValue`. Only the columns the answer
 * USES are written: the operation refuses an answer that fills a column its question type does not
 * store (`answerShapeProblem`), and an absent key is the plainest way to say "not this column".
 */
export function toWireAnswer(answer: FormAnswerInput): FormsAnswerInput {
  const wire: FormsAnswerInput = { QuestionID: answer.questionId };
  if (answer.textValue !== undefined) {
    wire.TextValue = answer.textValue;
  }
  if (answer.numericValue !== undefined) {
    wire.NumericValue = answer.numericValue;
  }
  if (answer.dateValue !== undefined) {
    wire.DateValue = answer.dateValue;
  }
  if (answer.booleanValue !== undefined) {
    wire.BooleanValue = answer.booleanValue;
  }
  if (answer.jsonValue !== undefined) {
    wire.JSONValue = answer.jsonValue === null ? null : JSON.stringify(answer.jsonValue);
  }
  if (answer.fileId !== undefined) {
    wire.FileID = answer.fileId;
  }
  return wire;
}

// --- Compile-time contract lock (widget <-> Forms.SaveResponse wire shape) -------------------------
//
// `ANSWER_FIELD_ON_THE_WIRE`'s `satisfies` already fails `ngc` when a CONTRACT answer field has no
// wire key. These fail it the other way: when the generated wire input gains a field the widget does
// not fill, and when a mapped column's value type drifts from the contract's.

/** Invariant equality on a tuple of types (the bare conditional distributes over unions). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertTrue<T extends true> = T;

type _EveryWireAnswerFieldMapped = AssertTrue<
  Same<keyof FormsAnswerInput, (typeof ANSWER_FIELD_ON_THE_WIRE)[keyof typeof ANSWER_FIELD_ON_THE_WIRE]>
>;
/** The answer columns that keep their value type on the wire (everything but the id and the JSON column). */
type ScalarAnswerField = Exclude<keyof FormAnswerInput, 'jsonValue' | 'questionId'>;
type _ScalarColumnsAgree = AssertTrue<
  Same<
    { [K in ScalarAnswerField]: FormAnswerInput[K] },
    { [K in ScalarAnswerField]: FormsAnswerInput[(typeof ANSWER_FIELD_ON_THE_WIRE)[K]] }
  >
>;
type _SaveFieldsCovered = AssertTrue<
  Same<keyof FormsSaveResponseInput, 'Slug' | 'FormVersionID' | 'Mode' | 'ClientResponseID' | 'StartedAt' | 'TurnstileToken' | 'ClientMeta' | 'Answers'>
>;

/** Referenced so `noUnusedLocals` retains the locks above (they exist purely for the check). */
export type WidgetContractLocks = [_EveryWireAnswerFieldMapped, _ScalarColumnsAgree, _SaveFieldsCovered];
