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
function exportAnswerValue(q: PublishedFormQuestion, a: AnswerRow): string {
  if (q.type === 'FileUpload') {
    return a.FileID ?? '';
  }
  return renderAnswer(q, a);
}

/**
 * One row per response, one cell per column.
 *
 * The `Score` / `ScoreRationale` columns written by `Forms: Analyze Written Responses` are
 * deliberately absent. That automation scores every ShortText answer, so a form asking for
 * a first name got "Soham — Score: 100" in the sheet: a number with no meaning sitting
 * next to one that has some. The columns still exist on the entity, so re-adding them is a
 * display decision, not a data-recovery job.
 */
export function buildExportMatrix(
  responses: ResponseListRow[],
  questions: PublishedFormQuestion[],
  answers: AnswerRow[],
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
      row[q.id] = a ? exportAnswerValue(q, a) : '';
    }
    return row;
  });
}
