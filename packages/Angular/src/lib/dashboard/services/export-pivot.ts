/**
 * The response × question pivot behind the CSV/Excel export.
 *
 * Pure and Angular-free so the shape of the exported file is unit-testable — the service
 * around it only decides format and filename and hands the result to MJ's `ExportService`.
 */
import type {
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import type { ExportColumn, ExportData } from '@memberjunction/export-engine';
import { renderAnswer } from '../../shared/answer-values';
import type { ResponseListRow } from '../../responses/response-models';

type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/**
 * Suffix distinguishing a question's score column from its answer column. Question ids are
 * GUIDs, so this cannot collide with one.
 */
const SCORE_SUFFIX = '::score';

/** The fixed per-response columns that precede the question matrix. */
const RESPONSE_COLUMNS: ExportColumn[] = [
  { name: 'responseId', displayName: 'Response ID', dataType: 'string' },
  { name: 'status', displayName: 'Status', dataType: 'string' },
  { name: 'startedAt', displayName: 'Started At', dataType: 'date' },
  { name: 'submittedAt', displayName: 'Submitted At', dataType: 'date' },
  { name: 'respondent', displayName: 'Respondent', dataType: 'string' },
];

/**
 * The questions any response has an AI score for.
 *
 * Scoring is per-form configuration (the `Forms: Analyze Written Responses` automation
 * targets specific questions), so which questions are scored is discovered from the data
 * rather than declared. A form with no scoring gets no score columns at all — the export
 * does not grow an empty column per question just in case.
 */
export function scoredQuestionIds(answers: AnswerRow[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const a of answers) {
    if (a.Score !== null && a.Score !== undefined) {
      ids.add(a.QuestionID);
    }
  }
  return ids;
}

/** One column per question, each scored question followed immediately by its score. */
export function buildExportColumns(
  questions: PublishedFormQuestion[],
  scored: ReadonlySet<string>,
): ExportColumn[] {
  const cols = [...RESPONSE_COLUMNS];
  for (const q of questions) {
    cols.push({ name: q.id, displayName: q.prompt, dataType: 'string' });
    if (scored.has(q.id)) {
      cols.push({
        name: `${q.id}${SCORE_SUFFIX}`,
        displayName: `${q.prompt} — Score`,
        dataType: 'number',
      });
    }
  }
  return cols;
}

/**
 * One row per response, one cell per column.
 *
 * `ScoreRationale` is deliberately absent: it is a paragraph of model prose, and a column
 * of paragraphs makes the sheet unreadable for the analysis the export exists to support.
 * It is visible per-answer in the detail view, where there is room for it.
 */
export function buildExportMatrix(
  responses: ResponseListRow[],
  questions: PublishedFormQuestion[],
  answers: AnswerRow[],
  scored: ReadonlySet<string>,
): ExportData {
  const answersByResponse = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const arr = answersByResponse.get(a.ResponseID);
    if (arr) arr.push(a);
    else answersByResponse.set(a.ResponseID, [a]);
  }

  return responses.map((r) => {
    const answerByQuestion = new Map<string, AnswerRow>();
    for (const a of answersByResponse.get(r.responseId) ?? []) {
      answerByQuestion.set(a.QuestionID, a);
    }

    const row: Record<string, unknown> = {
      responseId: r.responseId,
      status: r.status,
      startedAt: r.startedAt,
      submittedAt: r.submittedAt,
      respondent: r.respondent,
    };
    for (const q of questions) {
      const a = answerByQuestion.get(q.id);
      row[q.id] = a ? renderAnswer(q, a) : '';
      if (scored.has(q.id)) {
        row[`${q.id}${SCORE_SUFFIX}`] = a?.Score ?? null;
      }
    }
    return row;
  });
}
