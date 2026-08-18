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
 * reader. The detail view joins uploads and renders the real filename; the export pivot
 * has no such join and correctly emits nothing rather than a GUID column.
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

/** Respondent display label: person name, else anonymous session marker. */
export function respondentLabel(r: ResponseRow): string {
  return r.RespondentPerson || 'Anonymous';
}
