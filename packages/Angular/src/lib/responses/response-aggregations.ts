/**
 * Pure builders for the individual-response read-model.
 *
 * Deliberately free of Angular / RunView so they are trivially unit-testable: each takes
 * already-fetched rows plus the published questions and returns view-model shapes. The
 * data service does the I/O, including resolving `TargetEntityID` through `Metadata` —
 * that lookup arrives here as a plain map so this file stays pure.
 */
import type {
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormResponseAnswerEntityType,
  mjBizAppsFormsFormUploadEntityType,
  mjBizAppsFormsFormAutomationRunEntityType,
  mjBizAppsFormsFormEntityBindingRecordEntityType,
  PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { renderAnswer, respondentLabel } from '../shared/answer-values';
import { toDate } from '../shared/runview-dates';
import type {
  ResponseListRow,
  ResponseAnswerView,
  ResponseAutomationRunView,
  ResponseBindingRecordView,
  ResponseDetail,
  ResponseFileView,
} from './response-models';

type ResponseRow = mjBizAppsFormsFormResponseEntityType;
type AnswerRow = mjBizAppsFormsFormResponseAnswerEntityType;
type UploadRow = mjBizAppsFormsFormUploadEntityType;
type AutomationRunRow = mjBizAppsFormsFormAutomationRunEntityType;
type BindingRecordRow = mjBizAppsFormsFormEntityBindingRecordEntityType;

/** Shown when a `FormUpload` row exists but carries no `FileName`. */
const UNNAMED_FILE = 'Unnamed file';

/** Everything one response's detail view is built from. */
export interface ResponseDetailInput {
  response: ResponseRow;
  answers: AnswerRow[];
  /** The published questions of the version this response was submitted against. */
  questions: PublishedFormQuestion[];
  /** Provenance rows for the files these answers reference. */
  uploads: UploadRow[];
  /** On-submit automation attempts triggered by this response. */
  automationRuns: AutomationRunRow[];
  /** Entity-binding ledger rows written by this response. */
  bindingRecords: BindingRecordRow[];
  /** `TargetEntityID` → entity display name, resolved by the caller from `Metadata`. */
  entityNameById: ReadonlyMap<string, string>;
}

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

/** Builds one response's full detail: labelled answers, plus what the submission did. */
export function buildResponseDetail(input: ResponseDetailInput): ResponseDetail {
  const { response } = input;
  return {
    responseId: response.ID,
    status: response.Status,
    startedAt: toDate(response.StartedAt),
    submittedAt: toDate(response.SubmittedAt),
    respondent: respondentLabel(response),
    answers: buildAnswerViews(input.answers, input.questions, input.uploads),
    automationRuns: input.automationRuns.map(toAutomationRunView),
    bindingRecords: input.bindingRecords.map((b) => toBindingRecordView(b, input.entityNameById)),
  };
}

/**
 * Labels each answer by its question, attaching the AI score and — for file answers — the
 * upload behind it.
 *
 * An answer whose question is absent from `questions` is dropped: it was submitted against
 * a version where the question still existed, and there is nothing truthful to label it
 * with. Statement questions are display-only and never have answers worth showing.
 */
function buildAnswerViews(
  answers: AnswerRow[],
  questions: PublishedFormQuestion[],
  uploads: UploadRow[],
): ResponseAnswerView[] {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const uploadByFileId = new Map(uploads.map((u) => [u.FileID, u]));
  const views: ResponseAnswerView[] = [];

  for (const a of answers) {
    const q = questionById.get(a.QuestionID);
    if (!q || q.type === 'Statement') {
      continue;
    }
    views.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      displayValue: renderAnswer(q, a),
      score: a.Score ?? null,
      scoreRationale: a.ScoreRationale ?? null,
      file: toFileView(a, uploadByFileId),
    });
  }
  return views;
}

/**
 * Resolves an answer's file, matching on the answer's `FileID`.
 *
 * `FileID` and NOT `ResponseDraftID` is the join key on purpose: a draft can accumulate
 * uploads the respondent replaced or abandoned, and those revoked/orphaned rows must never
 * surface as though they were this answer's file.
 */
function toFileView(
  a: AnswerRow,
  uploadByFileId: ReadonlyMap<string, UploadRow>,
): ResponseFileView | null {
  if (!a.FileID) {
    return null;
  }
  const upload = uploadByFileId.get(a.FileID);
  if (!upload) {
    return null;
  }
  return {
    fileId: upload.FileID,
    fileName: upload.FileName || UNNAMED_FILE,
    contentType: upload.ContentType,
    sizeBytes: upload.SizeBytes,
    isRevoked: upload.Status === 'Revoked',
  };
}

/** One automation attempt as the detail view shows it. */
function toAutomationRunView(run: AutomationRunRow): ResponseAutomationRunView {
  const startedAt = toDate(run.StartedAt);
  const completedAt = toDate(run.CompletedAt);
  return {
    runId: run.ID,
    automationName: run.FormAutomation,
    status: run.Status,
    attemptCount: run.AttemptCount,
    startedAt,
    completedAt,
    durationSeconds:
      startedAt && completedAt ? (completedAt.getTime() - startedAt.getTime()) / 1000 : null,
    errorMessage: run.ErrorMessage,
    outputSummary: run.OutputSummary,
    actionExecutionLogId: run.ActionExecutionLogID,
    aiAgentRunId: run.AIAgentRunID,
  };
}

/** One binding-ledger row as the detail view shows it. */
function toBindingRecordView(
  record: BindingRecordRow,
  entityNameById: ReadonlyMap<string, string>,
): ResponseBindingRecordView {
  return {
    bindingRecordId: record.ID,
    bindingName: record.Binding,
    targetEntityId: record.TargetEntityID,
    // TargetEntityID is deliberately not an FK, so there is no denormalised name to read —
    // the caller resolves it through Metadata. Null when it cannot: the row stays visible
    // (labelled by the id, which is debuggable) but the view offers no link, rather than a
    // link that would navigate to an entity name that does not exist.
    targetEntityName: entityNameById.get(record.TargetEntityID) ?? null,
    targetRecordId: record.TargetRecordID,
    outcome: record.Outcome,
    writtenFields: parseWrittenFields(record.WrittenFields),
  };
}

/**
 * Parses the ledger's `WrittenFields` JSON list. Malformed or non-array content yields an
 * empty list: this column is diagnostic, and a display view must not fail on it.
 */
function parseWrittenFields(json: string | null): string[] {
  if (!json) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}
