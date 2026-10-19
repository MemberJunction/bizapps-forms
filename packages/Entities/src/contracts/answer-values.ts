/**
 * How a STORED answer row is read: the values a choice answer holds, the one-line text a reader is
 * shown, whether the row holds anything at all, and who a response came from.
 *
 * A contract because both sides read stored answers the same way (#303 Task 9): the server derives
 * a response list row's respondent label and counts its answers (`FormReportingEngine`), and the
 * dashboard labels one response's answers in its detail view and its export. Two copies of "how is a
 * MultiChoice answer read" is the duplication that drifts, so forms-ng's own copy was deleted when the
 * dashboard moved onto the operations (#303 Task 10).
 *
 * Pure and I/O-free: the rows are `answer-canonical.ts`'s structural column bags, so a RunView row,
 * an entity object and a Remote Operation's stored-answer shape all fit.
 */
import { analysisKindFor, answerColumnFor, FORM_QUESTION_TYPES } from './question-types';
import type { FormQuestionType, QuestionAnalysisKind } from './question-types';
import type { PublishedFormQuestion } from './form-definition';
import { dateAnswerText } from './answer-date';
import { foldQuestionId, type StoredAnswerColumns, type StoredAnswerRow } from './answer-canonical';

/** The types whose contract analysis is `kind` — derived, so a new type cannot fall out of a hand list. */
function typesWithAnalysis(kind: QuestionAnalysisKind): ReadonlySet<FormQuestionType> {
  return new Set(FORM_QUESTION_TYPES.filter((t) => analysisKindFor(t) === kind));
}

// Pure, so a bundle that uses nothing here (the respondent widget) drops these with the functions.
const CHOICE_TYPES = /* @__PURE__ */ typesWithAnalysis('choice');
const NUMERIC_TYPES = /* @__PURE__ */ typesWithAnalysis('numeric');
const TEXT_TYPES = /* @__PURE__ */ typesWithAnalysis('text');
const COMPOSITE_TYPES = /* @__PURE__ */ typesWithAnalysis('composite');

/**
 * The values a choice answer selected: a JSON array's entries, else the text column.
 *
 * Null and blank entries are dropped rather than stringified — `String(null)` put a chart row
 * reading "null" in front of a reader — while `0` and `false` survive, being real option values.
 * JSON that is not an array (or not JSON) falls through to the text column.
 */
export function extractChoiceValues(answer: Pick<StoredAnswerColumns, 'TextValue' | 'JSONValue'>): string[] {
  const fromJson = jsonArrayValues(answer.JSONValue);
  if (fromJson) {
    return fromJson;
  }
  return answer.TextValue !== null && answer.TextValue !== undefined && answer.TextValue !== '' ? [answer.TextValue] : [];
}

/** A JSON array's non-blank entries, or `undefined` when the text is not a JSON array. */
function jsonArrayValues(raw: string | null | undefined): string[] | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON: the caller reads the text column instead, which is what a single choice stores.
    return undefined;
  }
  if (!Array.isArray(parsed)) {
    return undefined;
  }
  return parsed
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
}

/**
 * One readable line for an answer, label-mapping choices through the question's options.
 *
 * A file answer renders as the empty string, not its `FileID`: the file's name lives on the
 * `FormUpload` row, and a bare GUID is the one thing guaranteed to mean nothing to a reader.
 * Dates render as what the respondent entered (`dateAnswerText`), never as the stored instant.
 */
export function renderAnswer(question: PublishedFormQuestion, answer: StoredAnswerColumns): string {
  if (question.type === 'Legal') {
    // What the respondent clicked: "No" against a terms question reads as a missing answer.
    return answer.BooleanValue === true ? 'Accepted' : answer.BooleanValue === false ? 'Declined' : '';
  }
  const column = answerColumnFor(question.type);
  if (column === 'boolean') {
    return answer.BooleanValue === true ? 'Yes' : answer.BooleanValue === false ? 'No' : '';
  }
  if (question.type === 'Ranking' || CHOICE_TYPES.has(question.type)) {
    const labelByValue = new Map(question.options.map((o) => [o.value, o.label]));
    const labels = extractChoiceValues(answer).map((v) => labelByValue.get(v) ?? v);
    // Order IS a ranking's answer, so it is numbered.
    return question.type === 'Ranking' ? labels.map((label, i) => `${i + 1}. ${label}`).join(', ') : labels.join(', ');
  }
  if (NUMERIC_TYPES.has(question.type)) {
    return answer.NumericValue !== null && answer.NumericValue !== undefined ? String(answer.NumericValue) : '';
  }
  if (column === 'date') {
    const instant = toInstant(answer.DateValue);
    return instant ? dateAnswerText(question.type, instant) : '';
  }
  if (COMPOSITE_TYPES.has(question.type)) {
    return renderComposite(question, answer.JSONValue);
  }
  if (column === 'file') {
    return '';
  }
  if (TEXT_TYPES.has(question.type)) {
    return answer.TextValue ?? '';
  }
  return answer.TextValue ?? answer.JSONValue ?? '';
}

/** A `Date` from a stored date cell, or `null` when absent or unparseable. */
function toInstant(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * A composite (Address / ContactInfo / Matrix) as one line. A Matrix maps its row keys and cell
 * values through the option labels: they are option VALUES, the author's internal identifiers.
 */
function renderComposite(question: PublishedFormQuestion, raw: string | null | undefined): string {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return '';
  }
  const labelByValue = new Map(question.options.map((o) => [o.value, o.label]));
  const label = (value: unknown): string => labelByValue.get(String(value)) ?? String(value);
  const parts: string[] = [];
  for (const [key, cell] of Object.entries(parsed)) {
    const value = Array.isArray(cell) ? cell.map(label).join(' / ') : label(cell);
    if (value.trim() === '') {
      continue;
    }
    parts.push(question.type === 'Matrix' ? `${label(key)}: ${value}` : value);
  }
  return parts.join(question.type === 'Matrix' ? '; ' : ', ');
}

/** A stored JSON object, or `undefined` when absent, malformed or not an object. */
export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed composite reads as no object; callers render or count it as nothing. The row
    // itself is untouched, and the response's detail still lists it.
    return undefined;
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
}

/**
 * Whether a stored row holds an answer at all. A respondent who reaches a question can leave a
 * blank row behind, so counting rows counts questions SEEN. Each column is tested for emptiness,
 * never falsiness: `0` and `false` are answers someone chose.
 */
export function answerHoldsValue(answer: StoredAnswerColumns): boolean {
  return (
    hasText(answer.TextValue) ||
    (answer.NumericValue !== null && answer.NumericValue !== undefined) ||
    (answer.BooleanValue !== null && answer.BooleanValue !== undefined) ||
    (answer.DateValue !== null && answer.DateValue !== undefined) ||
    (answer.FileID !== null && answer.FileID !== undefined && answer.FileID !== '') ||
    hasText(answer.JSONValue)
  );
}

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== '';
}

/**
 * Prompts that name the respondent, most specific first. The snapshot carries no "this is the
 * respondent's name" marker, so until a response is bound to a Person the prompt is the signal.
 */
const NAME_PROMPTS: readonly { re: RegExp; part: 'full' | 'first' | 'last' }[] = [
  { re: /\b(full|display)\s*name\b|^name$|\byour name\b/i, part: 'full' },
  { re: /\b(first|given|fore)\s*name\b/i, part: 'first' },
  { re: /\b(last|family|sur)\s*name\b|\bsurname\b/i, part: 'last' },
];

/**
 * Who a response came from: the linked Person's name, else a name the form collected, else its
 * email answer, else "Anonymous" — which is a statement about identity, not about authentication.
 * The first question matching each name part wins, so an earlier question beats a later duplicate.
 */
export function deriveRespondentLabel(
  personName: string | null | undefined,
  answers: readonly StoredAnswerRow[],
  questions: readonly PublishedFormQuestion[],
): string {
  if (personName) {
    return personName;
  }
  // Folded: a server read hands back the database's GUID casing, which need not be the snapshot's.
  const answerByQuestion = new Map(answers.map((a) => [foldQuestionId(a.QuestionID), a]));
  const parts: Partial<Record<'full' | 'first' | 'last', string>> = {};
  let email = '';
  for (const question of questions) {
    const answer = answerByQuestion.get(foldQuestionId(question.id));
    const value = answer ? renderAnswer(question, answer).trim() : '';
    if (!value) {
      continue;
    }
    if (!email && question.type === 'Email') {
      email = value;
      continue;
    }
    const match = NAME_PROMPTS.find((n) => n.re.test(question.prompt));
    if (match && !parts[match.part]) {
      parts[match.part] = value;
    }
  }
  const name = parts.full || [parts.first, parts.last].filter(Boolean).join(' ');
  return name || email || 'Anonymous';
}
