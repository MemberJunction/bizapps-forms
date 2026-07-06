/**
 * The widget's in-memory answer representation and the bridge to the S1 wire format.
 *
 * Internally each question's answer is held as an {@link AnswerValue} (the same union
 * the conditional-rule evaluator consumes), keyed by questionId. At submit time we
 * convert to the contract's {@link FormAnswerInput} typed-column shape.
 */
import type { AnswerValue, FormAnswerInput, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

/** The live answer map: questionId -> current value. */
export type AnswerMap = Map<string, AnswerValue>;

/**
 * Convert the answer map into the wire `FormAnswerInput[]`, routing each value into
 * the correct typed column based on the question type. Unanswered questions and
 * display-only `Statement` questions are skipped.
 */
export function toAnswerInputs(
  questions: PublishedFormQuestion[],
  answers: AnswerMap,
): FormAnswerInput[] {
  const inputs: FormAnswerInput[] = [];
  for (const q of questions) {
    if (q.type === 'Statement') {
      continue;
    }
    const value = answers.get(q.id);
    if (value === null || value === undefined || value === '') {
      continue;
    }
    inputs.push(toAnswerInput(q, value));
  }
  return inputs;
}

/** Map one question's value into the right typed column of a {@link FormAnswerInput}. */
function toAnswerInput(question: PublishedFormQuestion, value: AnswerValue): FormAnswerInput {
  const base: FormAnswerInput = { questionId: question.id };
  switch (question.type) {
    case 'Number':
    case 'Rating':
    case 'NPS':
      return { ...base, numericValue: typeof value === 'number' ? value : Number(value) };
    case 'YesNo':
      return { ...base, booleanValue: Boolean(value) };
    case 'Date':
    case 'Time':
      return { ...base, dateValue: String(value) };
    case 'MultiChoice':
      return { ...base, jsonValue: Array.isArray(value) ? value : [String(value)] };
    case 'FileUpload':
      return { ...base, fileId: String(value) };
    default:
      return { ...base, textValue: String(value) };
  }
}
