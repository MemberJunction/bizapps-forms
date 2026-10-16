/**
 * The SHAPE an answer may arrive in — checked before any rule judges its value, by the widget and
 * the server alike (`validateAnswers` calls both functions here; `FormSubmissionEngine` also calls
 * {@link answersStructureRefusal} before anything recursive reads the payload). #303 Task 8.
 *
 * Two layers, and the order matters:
 *  1. {@link answersStructureRefusal} — size and nesting, with NO recursion and NO serialization
 *     until the nesting is known to be bounded. `JSON.parse` is iterative in V8 and accepts a
 *     20000-deep array from a 40 KB request; `JSON.stringify`, `Array.join` and every recursive
 *     reader after it overflow the stack on that value. So this walk is an explicit stack.
 *  2. {@link answerShapeProblem} — the column a question TYPE stores, and nothing else: one value
 *     per answer, in the column `answerColumnFor` names, of the structure that column holds for the
 *     type, and a number `FormResponseAnswer.NumericValue` (`decimal(18,4)`) can hold.
 *
 * What the widget sends is legitimate by construction (`widget/core/answer-value.ts` fills exactly
 * the one column a question's type stores — or `textValue` for a numeric answer that does not parse,
 * which the format rule then refuses as "Enter a number."), and its spec proves every type passes.
 *
 * Pure — no I/O, no Node APIs (the widget bundle runs this in a browser).
 */
import { answerColumnFor, type FormQuestionType, type QuestionAnswerColumn } from './question-types';
import type { FieldError, FormAnswerInput } from './submission';

/**
 * Global ceiling on ONE answer value, independent of any author-configured rule.
 *
 * A hard abuse bound, not a product knob: `FormResponseAnswer.TextValue` is `NVARCHAR(MAX)` and the
 * widget sets no `maxlength`, so without this the only limit on a question without a
 * `validationRule` was MJAPI's 50mb body cap. 64KB is far beyond any legitimate typed answer.
 * Enforced in EVERY mode — an autosaved draft persists a row just like a completion does.
 *
 * WHAT THIS DOES NOT BOUND: it is a cap per ANSWER. The unknown-question refusal limits a payload to
 * the form's own questions, but that count is author-controlled, so a 100-question form still admits
 * 100 x 64KB in a single save.
 */
export const MAX_ANSWER_VALUE_BYTES = 64 * 1024;

/**
 * The deepest a JSON answer may nest, counting each array or object as one level. The deepest
 * legitimate answer is a multi-select Matrix — a record of rows holding arrays of columns — which is
 * two; the bound leaves headroom without letting a caller build a value a recursive reader cannot walk.
 */
export const MAX_ANSWER_JSON_DEPTH = 4;

/**
 * The most parts any one array or object inside an answer may have — the options of a multi-choice
 * or a ranking, the rows of a matrix, the fields of an address. Far above any authored form.
 */
export const MAX_ANSWER_JSON_ITEMS = 1000;

/**
 * The magnitude `FormResponseAnswer.NumericValue` (`decimal(18,4)`) can NOT reach — an exclusive
 * bound. The column's largest value, 99999999999999.9999, is not a double: it rounds to exactly
 * 1e14, so a bound written as that literal and compared with `<=` admitted ±1e14, which overflows
 * the column at commit (fix round 3, re-review N1). Every double below 1e14 fits.
 */
export const DECIMAL_ANSWER_LIMIT = 1e14;

/** The column's true largest value, as TEXT — what the refusal prints (the double cannot say it). */
export const DECIMAL_ANSWER_BOUND_TEXT = '99999999999999.9999';

/** The decimal places `decimal(18,4)` keeps. More are REFUSED, never rounded: rounding stores a number the respondent did not give. */
export const DECIMAL_ANSWER_SCALE = 4;

/** What an answer that is not in its question's form is told — one sentence for every such shape. */
export const WRONG_SHAPE_MESSAGE = 'That answer is not in the form this question takes.';

/** What an answer filling several columns is told. */
export const SEVERAL_VALUES_MESSAGE = 'That answer carries more than one value.';

const TOO_DEEP_MESSAGE = 'That answer is nested too deeply.';
const TOO_MANY_PARTS_MESSAGE = 'That answer has too many parts.';

/**
 * What an oversized answer is told, derived from the bound rather than restating it, so raising the
 * ceiling cannot leave the respondent being told the old number.
 */
export function oversizedAnswerMessage(): string {
  return `That answer is too large. Answers are limited to ${MAX_ANSWER_VALUE_BYTES / 1024}KB each.`;
}

/**
 * UTF-8 length of a string, counted by hand — not `Buffer.byteLength`: the widget bundle has no Node
 * `Buffer`. A lone surrogate counts 3 bytes, what an encoder emits for it (U+FFFD), so this agrees
 * with `Buffer.byteLength` on every input.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * One error per answer whose value is too deep, too wide or too large — the cheap pre-scan. Safe on
 * ANY parsed input: the nesting is walked with an explicit stack, and the value is serialized (to
 * measure it) only once its nesting is known to be within {@link MAX_ANSWER_JSON_DEPTH}.
 */
export function answersStructureRefusal(answers: readonly FormAnswerInput[]): FieldError[] {
  const errors: FieldError[] = [];
  for (const answer of answers) {
    const problem = answerStructureProblem(answer);
    if (problem) {
      errors.push({ questionId: answer.questionId, message: problem });
    }
  }
  return errors;
}

/** Why one answer is too deep, too wide or too large, or `undefined`. */
function answerStructureProblem(answer: FormAnswerInput): string | undefined {
  const json = answer.jsonValue;
  if (json !== null && json !== undefined && typeof json === 'object') {
    const nesting = nestingProblem(json);
    if (nesting) {
      return nesting;
    }
  }
  return answerBytes(answer) > MAX_ANSWER_VALUE_BYTES ? oversizedAnswerMessage() : undefined;
}

/**
 * Walk a parsed JSON value with an explicit stack — never recursion — and stop at the first container
 * past {@link MAX_ANSWER_JSON_DEPTH} or wider than {@link MAX_ANSWER_JSON_ITEMS}. The width is read
 * BEFORE a container's children are pushed, so the work is bounded by the caps, not by the input.
 */
function nestingProblem(root: object): string | undefined {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 1 }];
  while (stack.length > 0) {
    const { value, depth } = stack.pop() as { value: unknown; depth: number };
    if (value === null || typeof value !== 'object') {
      continue;
    }
    if (depth > MAX_ANSWER_JSON_DEPTH) {
      return TOO_DEEP_MESSAGE;
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    if (children.length > MAX_ANSWER_JSON_ITEMS) {
      return TOO_MANY_PARTS_MESSAGE;
    }
    for (const child of children) {
      if (child !== null && typeof child === 'object') {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return undefined;
}

/**
 * The UTF-8 size of everything an answer carries — or, as soon as it is certainly over the cap, any
 * number over it. Call only once its nesting is bounded.
 *
 * Short-circuited (fix round 3, re-review N3): a string's UTF-8 length is never less than its UTF-16
 * `.length`, so a string longer than the cap is over it without counting a byte. Counting first made
 * a 50 MB answer cost ~5x its own `JSON.parse` in event-loop time, on a path a caller can repeat.
 */
function answerBytes(answer: FormAnswerInput): number {
  const texts: string[] = [];
  for (const text of [answer.textValue, answer.dateValue, answer.fileId]) {
    if (typeof text === 'string') {
      texts.push(text);
    }
  }
  if (answer.jsonValue !== null && answer.jsonValue !== undefined) {
    if (typeof answer.jsonValue === 'string') {
      texts.push(answer.jsonValue);
    } else if (leafTextLength(answer.jsonValue) > MAX_ANSWER_VALUE_BYTES) {
      // Its strings alone are over the cap: refused without serializing them.
      return MAX_ANSWER_VALUE_BYTES + 1;
    } else {
      texts.push(JSON.stringify(answer.jsonValue) ?? '');
    }
  }
  let bytes = 0;
  for (const text of texts) {
    if (bytes + text.length > MAX_ANSWER_VALUE_BYTES) {
      return MAX_ANSWER_VALUE_BYTES + 1;
    }
    bytes += utf8ByteLength(text);
  }
  return bytes;
}

/**
 * The total `.length` of every string inside a JSON value — keys included — walked with an explicit
 * stack. A lower bound on its serialized size, so it can refuse an oversized value before
 * `JSON.stringify` copies it. Call only once its nesting is bounded.
 */
function leafTextLength(root: unknown): number {
  let length = 0;
  const stack: unknown[] = [root];
  while (stack.length > 0 && length <= MAX_ANSWER_VALUE_BYTES) {
    const value = stack.pop();
    if (typeof value === 'string') {
      length += value.length;
    } else if (Array.isArray(value)) {
      stack.push(...value);
    } else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        length += key.length;
        stack.push(child);
      }
    }
  }
  return length;
}

/** Each wire field and the column it is. */
const COLUMN_OF: readonly (readonly [keyof FormAnswerInput, QuestionAnswerColumn])[] = [
  ['textValue', 'text'],
  ['numericValue', 'numeric'],
  ['dateValue', 'date'],
  ['booleanValue', 'boolean'],
  ['jsonValue', 'json'],
  ['fileId', 'file'],
];

/**
 * Why this answer is not in the form its question's TYPE stores, or `undefined` when it is (an
 * answer with no value at all is not this rule's business — requiredness is).
 *
 * Call only on an answer {@link answersStructureRefusal} admitted.
 */
export function answerShapeProblem(type: FormQuestionType, answer: FormAnswerInput): string | undefined {
  const filled = COLUMN_OF.filter(([field]) => answer[field] !== null && answer[field] !== undefined);
  if (filled.length > 1) {
    return SEVERAL_VALUES_MESSAGE;
  }
  if (filled.length === 0) {
    return undefined;
  }
  const [field, column] = filled[0];
  const stores = answerColumnFor(type);
  // A numeric question may carry TEXT: the widget sends a held value that does not parse as the text
  // it is (never `Number(' ')` = 0), and the format rule refuses it as "Enter a number." — the
  // message the respondent can act on, rather than this one.
  if (column !== stores && !(stores === 'numeric' && column === 'text')) {
    return WRONG_SHAPE_MESSAGE;
  }
  const value = answer[field];
  switch (column) {
    case 'numeric':
      return numericStorageProblem(value);
    case 'json':
      return jsonShapeOk(type, value) ? undefined : WRONG_SHAPE_MESSAGE;
    case 'boolean':
      return typeof value === 'boolean' ? undefined : WRONG_SHAPE_MESSAGE;
    default:
      return typeof value === 'string' ? undefined : WRONG_SHAPE_MESSAGE;
  }
}

/**
 * Why `FormResponseAnswer.NumericValue` (`decimal(18,4)`) cannot hold this number exactly, or
 * `undefined` when it can. A value it cannot hold used to overflow inside the save transaction and
 * reach the respondent as a generic failure naming no question.
 *
 * Exported because it is ONE rule with two callers: the wire shape check here, and the per-field
 * verdict the widget shows under a field and gates Submit on (`validateAnswer`) — so the widget can
 * never call valid a number the server refuses (fix round 3, re-review N2).
 */
export function numericStorageProblem(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= DECIMAL_ANSWER_LIMIT) {
    return `Enter a number between -${DECIMAL_ANSWER_BOUND_TEXT} and ${DECIMAL_ANSWER_BOUND_TEXT}.`;
  }
  // Exact when the value has at most four decimals: `toFixed` rounds to four, and only a value that
  // already had four or fewer reads back unchanged.
  return Number(value.toFixed(DECIMAL_ANSWER_SCALE)) === value ? undefined : `Use at most ${DECIMAL_ANSWER_SCALE} decimal places.`;
}

/** The structure the JSON column holds for each type that stores JSON. */
function jsonShapeOk(type: FormQuestionType, value: unknown): boolean {
  switch (type) {
    case 'MultiChoice':
    case 'Ranking':
      return isStringArray(value);
    case 'Matrix':
      // A row → its column, or (a multi-select row) → its columns.
      return isPlainRecord(value) && Object.values(value).every((cell) => typeof cell === 'string' || isStringArray(cell));
    case 'Address':
    case 'ContactInfo':
      // A part the respondent left empty may arrive as null.
      return isPlainRecord(value) && Object.values(value).every((part) => typeof part === 'string' || part === null);
    default:
      // No other type stores JSON (`answerColumnFor`), so nothing else reaches here.
      return false;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
