/**
 * The widget's in-memory answer representation and the bridge to the S1 wire format.
 *
 * Internally each question's answer is held as an {@link AnswerValue} (the same union
 * the conditional-rule evaluator consumes), keyed by questionId. At submit time we
 * convert to the contract's {@link FormAnswerInput} typed-column shape.
 *
 * The routing below used to be a `switch` over question types listing the four non-text cases
 * and defaulting everything else to `textValue`. That default is why the switch had to go: a
 * new type is silently correct-looking and silently wrong — `Address` would have been
 * `String({line1: '…'})`, i.e. the literal `"[object Object]"`, persisted as a complete answer
 * with no error anywhere. `answerColumnFor` makes the column an explicit property of the type,
 * so a type with no column declared does not compile.
 */
import {
  answerColumnFor,
  isAnswerableQuestionType,
  type AnswerValue,
  type FormAnswerInput,
  type JSONValue,
  type PublishedFormQuestion,
  type QuestionAnswerColumn,
} from '@mj-biz-apps/forms-entities';

/** The live answer map: questionId -> current value. */
export type AnswerMap = Map<string, AnswerValue>;

/**
 * Convert the answer map into the wire `FormAnswerInput[]`, routing each value into
 * the correct typed column based on the question type. Unanswered questions and
 * display-only questions (`Statement`) are skipped.
 */
export function toAnswerInputs(
  questions: PublishedFormQuestion[],
  answers: AnswerMap,
): FormAnswerInput[] {
  const inputs: FormAnswerInput[] = [];
  for (const q of questions) {
    if (!isAnswerableQuestionType(q.type)) {
      continue;
    }
    const value = answers.get(q.id);
    if (!isSubmittable(value)) {
      continue;
    }
    inputs.push(toAnswerInput(q, value));
  }
  return inputs;
}

/**
 * Whether a held value is worth sending at all.
 *
 * Deliberately NOT {@link isAnswerSupplied} from the contract, which is the "does this count as
 * answered" test used by `isRequired` and conditional rules. This is a narrower question — "is
 * there anything here to persist" — and the two differ on exactly one case that matters: an
 * empty composite. A respondent who focuses an Address and leaves puts `{line1: '', city: ''}`
 * in the map, and sending that would write a `Complete` answer row full of empty strings, which
 * every downstream reader then has to treat as if it were an address.
 */
function isSubmittable(value: AnswerValue): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.values(value).some((v) => v !== null && v !== undefined && v !== '');
  }
  return true;
}

/** Map one question's value into the right typed column of a {@link FormAnswerInput}. */
function toAnswerInput(question: PublishedFormQuestion, value: AnswerValue): FormAnswerInput {
  const base: FormAnswerInput = { questionId: question.id };
  const column: QuestionAnswerColumn = answerColumnFor(question.type);
  switch (column) {
    case 'numeric':
      return { ...base, numericValue: typeof value === 'number' ? value : Number(value) };
    case 'boolean':
      return { ...base, booleanValue: Boolean(value) };
    case 'date':
      return { ...base, dateValue: String(value) };
    case 'json':
      return { ...base, jsonValue: toJsonValue(value) };
    case 'file':
      return { ...base, fileId: String(value) };
    case 'text':
      return { ...base, textValue: String(value) };
    default:
      return assertNeverColumn(column);
  }
}

/**
 * Coerce a held value into the JSON column's shape.
 *
 * A scalar reaching a JSON-column type is wrapped in an array rather than passed through,
 * because the only way it happens is a multi-select holding its single selection unwrapped —
 * a shape `MultiChoice` has produced since before this file existed. Composites are objects
 * already and pass through untouched.
 */
function toJsonValue(value: AnswerValue): JSONValue {
  if (Array.isArray(value)) {
    return value as JSONValue;
  }
  if (value !== null && typeof value === 'object') {
    return value as JSONValue;
  }
  return [String(value)];
}

/** Exhaustiveness guard: a new answer column must be routed here before it compiles. */
function assertNeverColumn(column: never): never {
  throw new Error(`Unhandled QuestionAnswerColumn: ${String(column)}`);
}
