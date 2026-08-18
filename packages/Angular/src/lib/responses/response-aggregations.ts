/**
 * Pure builders for the individual-response read-model.
 *
 * Deliberately free of Angular / RunView so they are trivially unit-testable: each takes
 * already-fetched rows plus the published questions and returns view-model shapes. The
 * data service does the I/O.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { renderAnswer, respondentLabel } from '../shared/answer-values';
import { toDate } from '../shared/runview-dates';
import type { ResponseListRow, ResponseAnswerView, ResponseDetail } from './response-models';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;

/**
 * Builds the response-list rows. Lists COMPLETE responses only — a Partial is an in-progress
 * autosave, not a submitted response, so it must not appear in the headline response list
 * (it is still reflected in the funnel/drop-off metric, which reads all answers).
 */
export function buildResponseRows(
  responses: ResponseRow[],
  answers: AnswerRow[],
): ResponseListRow[] {
  const answerCountByResponse = new Map<string, number>();
  for (const a of answers) {
    answerCountByResponse.set(a.ResponseID, (answerCountByResponse.get(a.ResponseID) ?? 0) + 1);
  }
  return responses
    .filter((r) => r.Status === 'Complete')
    .map((r) => ({
      responseId: r.ID,
      status: r.Status,
      startedAt: toDate(r.StartedAt),
      submittedAt: toDate(r.SubmittedAt),
      respondent: respondentLabel(r),
      answeredCount: answerCountByResponse.get(r.ID) ?? 0,
    }));
}

/** Builds a single response detail with labelled answers. */
export function buildResponseDetail(
  response: ResponseRow,
  answers: AnswerRow[],
  questions: PublishedFormQuestion[],
): ResponseDetail {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const answerViews: ResponseAnswerView[] = [];
  for (const a of answers) {
    const q = questionById.get(a.QuestionID);
    if (!q || q.type === 'Statement') {
      continue;
    }
    answerViews.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      displayValue: renderAnswer(q, a),
    });
  }
  return {
    responseId: response.ID,
    status: response.Status,
    startedAt: toDate(response.StartedAt),
    submittedAt: toDate(response.SubmittedAt),
    respondent: respondentLabel(response),
    answers: answerViews,
  };
}
