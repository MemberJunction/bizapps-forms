/**
 * How a stored answer row maps to values and to human-readable text.
 *
 * Extracted from the reporting dashboard's aggregations when the responses surface was
 * shared three ways (dashboard tab / builder tab / entity-form override): both the
 * per-question breakdowns and the per-response detail need the same value extraction and
 * the same label mapping, and two copies of "how do we read a MultiChoice answer" is
 * exactly the duplication that drifts.
 *
 * Angular-free and I/O-free on purpose — everything here is unit-testable in isolation.
 */
import type {
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormResponseEntityType,
  PublishedFormQuestion,
  FormQuestionType,
} from '@mj-biz-apps/forms-entities';
import { toDate } from './runview-dates';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;
type ResponseRow = mjBizAppsFormsFormResponseEntityType;

/** Question types whose answers are visualised as a choice distribution. */
export const CHOICE_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'SingleChoice',
  'MultiChoice',
  'Dropdown',
]);

/** Question types aggregated numerically. */
export const NUMERIC_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'Number',
  'Rating',
  'NPS',
]);

/** Free-text-style types listed verbatim. */
export const TEXT_TYPES: ReadonlySet<FormQuestionType> = new Set([
  'ShortText',
  'LongText',
  'Email',
  'Phone',
]);

/** Extracts selected values from an answer (single value or multi JSON array). */
export function extractChoiceValues(a: AnswerRow): string[] {
  if (a.JSONValue) {
    try {
      const parsed: unknown = JSON.parse(a.JSONValue);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v));
      }
    } catch {
      // fall through to TextValue
    }
  }
  if (a.TextValue !== null && a.TextValue !== undefined && a.TextValue !== '') {
    return [a.TextValue];
  }
  return [];
}

/**
 * Renders an answer to a human-readable string, label-mapping choices.
 *
 * A `FileUpload` answer renders as the empty string, NOT as its `FileID`. The file's name,
 * type and size live on the `FormUpload` provenance row, not on the answer, so a raw GUID
 * is the one thing this function can produce that is guaranteed to mean nothing to a
 * reader. The detail view joins uploads and renders the real filename.
 *
 * The EXPORT does not use this for a file answer — see `exportAnswerValue` in
 * `dashboard/services/export-pivot.ts`. A spreadsheet has no join to make, and there the id
 * is the joinable key into `MJ: Files`, so the export emits it deliberately.
 */
export function renderAnswer(q: PublishedFormQuestion, a: AnswerRow): string {
  if (q.type === 'YesNo') {
    return a.BooleanValue === true ? 'Yes' : a.BooleanValue === false ? 'No' : '';
  }
  if (CHOICE_TYPES.has(q.type)) {
    const labelByValue = new Map(q.options.map((o) => [o.value, o.label]));
    return extractChoiceValues(a)
      .map((v) => labelByValue.get(v) ?? v)
      .join(', ');
  }
  if (NUMERIC_TYPES.has(q.type)) {
    return a.NumericValue !== null && a.NumericValue !== undefined ? String(a.NumericValue) : '';
  }
  if (q.type === 'Date' || q.type === 'Time') {
    const d = toDate(a.DateValue);
    return d ? d.toISOString() : '';
  }
  if (q.type === 'FileUpload') {
    return '';
  }
  if (TEXT_TYPES.has(q.type)) {
    return a.TextValue ?? '';
  }
  return a.TextValue ?? a.JSONValue ?? '';
}

/**
 * Prompts that identify a respondent by name, most specific first.
 *
 * Matched against the question prompt because the published snapshot carries no
 * "this field is the respondent's name" marker — `PublishedFormQuestion` has id, type,
 * prompt and settings, and nothing semantic. The On Submit tab's entity binding is where
 * an author states that mapping properly; until a response has been bound to a Person,
 * the prompt is the only signal available.
 */
const NAME_PROMPTS: readonly { re: RegExp; part: 'full' | 'first' | 'last' }[] = [
  { re: /\b(full|display)\s*name\b|^name$|\byour name\b/i, part: 'full' },
  { re: /\b(first|given|fore)\s*name\b/i, part: 'first' },
  { re: /\b(last|family|sur)\s*name\b|\bsurname\b/i, part: 'last' },
];

/**
 * Respondent display label from the linked Person only.
 *
 * Prefer {@link deriveRespondent} wherever the response's answers are in hand: a public
 * form has no Person row, so this returns "Anonymous" for every submission — including
 * ones that asked for and got a name and an email address.
 */
export function respondentLabel(r: ResponseRow): string {
  return r.RespondentPerson || 'Anonymous';
}

/**
 * Who submitted this response: the linked Person if there is one, else whatever the form
 * itself collected, else genuinely anonymous.
 *
 * "Anonymous" is a statement about identity, not about authentication. A respondent who
 * typed their name and email into the form is not anonymous to the person reading the
 * response, and labelling them that way hides data the form already holds. It stays
 * accurate for a form that asked for neither.
 */
export function deriveRespondent(
  r: ResponseRow,
  answers: readonly AnswerRow[],
  questions: readonly PublishedFormQuestion[],
): string {
  if (r.RespondentPerson) {
    return r.RespondentPerson;
  }

  const answerByQuestion = new Map(answers.map((a) => [a.QuestionID, a]));
  const parts: Partial<Record<'full' | 'first' | 'last', string>> = {};
  let email = '';

  for (const q of questions) {
    const value = (() => {
      const a = answerByQuestion.get(q.id);
      return a ? renderAnswer(q, a).trim() : '';
    })();
    if (!value) continue;

    if (!email && q.type === 'Email') {
      email = value;
      continue;
    }
    // First match wins per part, so an earlier question beats a later duplicate.
    const match = NAME_PROMPTS.find((n) => n.re.test(q.prompt));
    if (match && !parts[match.part]) {
      parts[match.part] = value;
    }
  }

  const name = parts.full || [parts.first, parts.last].filter(Boolean).join(' ');
  return name || email || 'Anonymous';
}
