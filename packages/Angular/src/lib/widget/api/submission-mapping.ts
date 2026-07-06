/**
 * Pure mapping from the frozen `@mj-biz-apps/forms-entities` submission contract to the S1
 * GraphQL `FormSubmissionInputType` wire shape. Extracted from the transport service so it is
 * unit-testable and so the wire-shape field set is locked by a test (see submission-mapping.spec).
 *
 * The ONLY intentional divergence from the contract is `jsonValue`: the contract carries a
 * structured `JSONValue`, the SDL expects a JSON STRING, so it is stringified here. The
 * transport-only `responseId` (autosave upsert target) is folded in here too, keeping it out of
 * the frozen contract.
 */
import type { ClientMeta, FormAnswerInput, FormSubmissionInput } from '@mj-biz-apps/forms-entities';

/** `FormAnswerInputType` per WP-B's SDL: `jsonValue` is a JSON STRING, `dateValue` a String. */
export interface FormAnswerInputType {
  questionId: string;
  textValue?: string;
  numericValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
  jsonValue?: string;
  fileId?: string;
}

/** `FormSubmissionInputType` per WP-B's SDL (answers use {@link FormAnswerInputType}). */
export interface FormSubmissionInputType {
  distributionSlug: string;
  formVersionId: string;
  partial?: boolean;
  /** Prior partial's id, so the server UPSERTs the same response on autosave. */
  responseId?: string;
  startedAt?: string;
  turnstileToken?: string;
  clientMeta?: ClientMeta;
  answers: FormAnswerInputType[];
}

/** The exact, ordered set of top-level fields the server input type accepts. */
export const SUBMISSION_INPUT_FIELDS: readonly (keyof FormSubmissionInputType)[] = [
  'distributionSlug',
  'formVersionId',
  'partial',
  'responseId',
  'startedAt',
  'turnstileToken',
  'clientMeta',
  'answers',
] as const;

/** The exact set of fields a single answer accepts. */
export const ANSWER_INPUT_FIELDS: readonly (keyof FormAnswerInputType)[] = [
  'questionId',
  'textValue',
  'numericValue',
  'dateValue',
  'booleanValue',
  'jsonValue',
  'fileId',
] as const;

/** Map the contract submission onto the wire shape, folding in the transport upsert target. */
export function toInputType(
  input: FormSubmissionInput,
  existingResponseId?: string,
): FormSubmissionInputType {
  return {
    distributionSlug: input.distributionSlug,
    formVersionId: input.formVersionId,
    partial: input.partial,
    responseId: existingResponseId,
    startedAt: input.startedAt,
    turnstileToken: input.turnstileToken,
    clientMeta: input.clientMeta,
    answers: input.answers.map(toAnswerInputType),
  };
}

/** Map one contract answer onto the wire shape, stringifying `jsonValue`. */
export function toAnswerInputType(answer: FormAnswerInput): FormAnswerInputType {
  return {
    questionId: answer.questionId,
    textValue: answer.textValue,
    numericValue: answer.numericValue,
    dateValue: answer.dateValue,
    booleanValue: answer.booleanValue,
    jsonValue: answer.jsonValue === undefined ? undefined : JSON.stringify(answer.jsonValue),
    fileId: answer.fileId,
  };
}

// --- Compile-time contract lock (widget <-> S1 wire shape) -----------------
//
// Fails `ngc` if the wire shape drifts from the frozen `@mj-biz-apps/forms-entities` contract.
// Mirrors the server-side lock in Server/src/public-submit/graphql-types.ts so BOTH ends pin to
// the same contract. Two divergences are DELIBERATE: answer `jsonValue` is a JSON STRING here
// (contract: structured JSONValue), and `responseId` is transport-only (not in the contract).

/** Flatten intersections / Omit / mapped types to a plain object literal so `Exact` compares cleanly. */
type Id<T> = { [K in keyof T]: T[K] };

/** Invariant equality — catches renamed/added OPTIONAL fields (bidirectional `extends` won't). */
type Exact<A, B> = (<T>() => T extends Id<A> ? 1 : 2) extends <T>() => T extends Id<B> ? 1 : 2
  ? true
  : false;
type AssertExact<T extends true> = T;

type _LockAnswer = AssertExact<Exact<Omit<FormAnswerInput, 'jsonValue'>, Omit<FormAnswerInputType, 'jsonValue'>>>;
// jsonValue is a scalar union, not an object — assert it directly (Id<> is for object shapes).
type _LockAnswerJson = AssertExact<
  [FormAnswerInputType['jsonValue']] extends [string | undefined]
    ? ([string | undefined] extends [FormAnswerInputType['jsonValue']] ? true : false)
    : false
>;

// The submission lock excludes `answers` (locked separately by _LockAnswer — its element type
// intentionally diverges on jsonValue) and pins every OTHER field plus the transport `responseId`.
type _LockSubmission = AssertExact<
  Exact<
    Omit<FormSubmissionInput, 'answers'> & { responseId?: string },
    Omit<FormSubmissionInputType, 'answers'>
  >
>;
type _LockClientMeta = AssertExact<Exact<ClientMeta, NonNullable<FormSubmissionInputType['clientMeta']>>>;

/** Referenced so `noUnusedLocals` retains the locks above (they exist purely for the check). */
export type WidgetContractLocks = [_LockAnswer, _LockAnswerJson, _LockSubmission, _LockClientMeta];
