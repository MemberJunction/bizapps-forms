/**
 * Map the GraphQL transport (`FormAnswerInputType`, where `jsonValue` is a string)
 * to the contract's `FormAnswerInput` (where `jsonValue` is a parsed `JSONValue`).
 * Malformed JSON for an answer is dropped to `undefined` rather than thrown — the
 * downstream validator then treats the question as unanswered.
 */
import type { FormAnswerInput, JSONValue } from '@mj-biz-apps/forms-entities';
import type { FormAnswerInputType } from './graphql-types';

/** Parse an answer's `jsonValue` string into a {@link JSONValue}, or `undefined`. */
function parseJsonValue(raw: string | undefined): JSONValue | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as JSONValue;
  } catch {
    return undefined;
  }
}

/** Map one GraphQL answer to the contract shape. */
function toAnswerInput(input: FormAnswerInputType): FormAnswerInput {
  return {
    questionId: input.questionId,
    textValue: input.textValue,
    numericValue: input.numericValue,
    dateValue: input.dateValue,
    booleanValue: input.booleanValue,
    jsonValue: parseJsonValue(input.jsonValue),
    fileId: input.fileId,
  };
}

/** Map the full answer array. */
export function toAnswerInputs(inputs: FormAnswerInputType[]): FormAnswerInput[] {
  return inputs.map(toAnswerInput);
}
