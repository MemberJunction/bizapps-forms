/**
 * The response × question pivot behind the CSV/Excel export.
 *
 * Pure and Angular-free so the shape of the exported file is unit-testable — the service
 * around it pages the rows in through `Forms.ListResponses` and hands the result to MJ's
 * `ExportService`.
 */
import { answerColumnFor, foldQuestionId, renderAnswer, type FormsResponseListRow, type FormsStoredAnswer, type PublishedFormQuestion } from '@mj-biz-apps/forms-entities';
import type { ExportColumn, ExportData } from '@memberjunction/export-engine';
import { toDate } from '../../shared/runview-dates';

/** The fixed per-response columns that precede the question matrix. */
const RESPONSE_COLUMNS: ExportColumn[] = [
  { name: 'responseId', displayName: 'Response ID', dataType: 'string' },
  { name: 'status', displayName: 'Status', dataType: 'string' },
  { name: 'startedAt', displayName: 'Started At', dataType: 'date' },
  { name: 'submittedAt', displayName: 'Submitted At', dataType: 'date' },
  { name: 'respondent', displayName: 'Respondent', dataType: 'string' },
];

/** One column per question, in form order, after the fixed per-response columns. */
export function buildExportColumns(questions: PublishedFormQuestion[]): ExportColumn[] {
  const cols = [...RESPONSE_COLUMNS];
  for (const q of questions) {
    cols.push({ name: q.id, displayName: q.prompt, dataType: 'string' });
  }
  return cols;
}

/**
 * The value a question's answer contributes to the export.
 *
 * Everything routes through `renderAnswer` except a file answer, which `renderAnswer`
 * deliberately blanks: in the UI a bare GUID means nothing, and the detail view has the
 * `FormUpload` join that turns it into a filename. The export has no such join — and here
 * the id is not noise but a JOINABLE KEY into `MJ: Files`, so blanking it would drop the
 * only evidence in the sheet that a file was submitted at all.
 */
function exportAnswerValue(q: PublishedFormQuestion, a: FormsStoredAnswer): string {
  // Keyed on the answer COLUMN, not the type name, so `Doodle` — a file answer produced by a
  // canvas rather than a picker — exports its joinable id like any other file instead of the
  // empty string `renderAnswer` gives it.
  if (answerColumnFor(q.type) === 'file') {
    return a.FileID ?? '';
  }
  return renderAnswer(q, a);
}

/**
 * One row per response, one cell per column, from the answers each row carries
 * (`Forms.ListResponses` with `IncludeAnswers`).
 *
 * Question ids are compared folded: the server reads hand back the database's GUID casing, which
 * need not be the definition snapshot's.
 *
 * The `Score` / `ScoreRationale` columns written by `Forms: Analyze Written Responses` are
 * deliberately absent (the operation does not even send them). That automation scores every
 * ShortText answer, so a form asking for a first name got "Score: 100" beside it in the sheet: a
 * number with no meaning sitting next to one that has some.
 */
export function buildExportMatrix(rows: readonly FormsResponseListRow[], questions: readonly PublishedFormQuestion[]): ExportData {
  return rows.map((r) => {
    const answerByQuestion = new Map((r.Answers ?? []).map((a) => [foldQuestionId(a.QuestionID), a]));
    const row: Record<string, unknown> = {
      responseId: r.ResponseID,
      status: r.Status,
      startedAt: toDate(r.StartedAt),
      submittedAt: toDate(r.SubmittedAt),
      respondent: r.Respondent,
    };
    for (const q of questions) {
      const a = answerByQuestion.get(foldQuestionId(q.id));
      row[q.id] = a ? exportAnswerValue(q, a) : '';
    }
    return row;
  });
}
