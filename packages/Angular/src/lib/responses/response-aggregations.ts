/**
 * Pure builders for the individual-response read-model, over what the operations return.
 *
 * `Forms.ListResponses` and `Forms.GetResponseDetail` (#303) return STORED rows — the response, its
 * answers as the columns hold them, the files, runs and ledger rows — plus the definition snapshot
 * that labels them. Turning those into what a reader sees (prompts in page order, choice labels,
 * file names, durations) stays here in the client, in one place, through the contracts' answer
 * helpers the server uses too. Angular-free and I/O-free, so every rule is a unit test away.
 */
import { LogError } from '@memberjunction/core';
import {
  deriveRespondentLabel,
  foldQuestionId,
  renderAnswer,
  type FormsGetResponseDetailOutput,
  type FormsResponseAutomationEvent,
  type FormsResponseAutomationRun,
  type FormsResponseBindingRecord,
  type FormsResponseListRow,
  type FormsResponseUpload,
  type FormsStoredAnswer,
  type PublishedFormDefinition,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';
import { flattenQuestions } from '../shared/published-questions';
import { toDate } from '../shared/runview-dates';
import type {
  ResponseAnswerView,
  ResponseAutomationAttempt,
  ResponseAutomationEventView,
  ResponseBindingRecordView,
  ResponseDetail,
  ResponseFileView,
  ResponseListRow,
} from './response-models';
import { runOutputText } from '../shared/run-output-text';

/** Shown when a `FormUpload` row exists but carries no `FileName`. */
const UNNAMED_FILE = 'Unnamed file';

/** Shown when no `FormUpload` row matched the answer's `FileID` at all. */
const UNRESOLVED_FILE = 'File (details unavailable)';

/** One row of the response list. The server already derived who responded and what they answered. */
export function toResponseListRow(row: FormsResponseListRow): ResponseListRow {
  return {
    responseId: row.ResponseID,
    status: row.Status,
    startedAt: toDate(row.StartedAt),
    submittedAt: toDate(row.SubmittedAt),
    respondent: row.Respondent,
    answeredCount: row.AnsweredCount,
  };
}

/**
 * The questions of a definition snapshot, flattened in page order — or `null` when there is no
 * definition to label with: none was returned, or the text is not a definition.
 *
 * Null is not swallowed: a malformed snapshot is logged with `context` (which version, for which
 * response), and the caller shows that the answers could not be labelled rather than an empty list.
 */
export function parseDefinitionQuestions(json: string | null | undefined, context: string): PublishedFormQuestion[] | null {
  if (!json) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    LogError(`Forms: the definition snapshot for ${context} is not JSON (${err instanceof Error ? err.message : String(err)}); its answers are shown unlabelled.`);
    return null;
  }
  if (!isDefinitionShaped(parsed)) {
    LogError(`Forms: the definition snapshot for ${context} has no pages list; its answers are shown unlabelled.`);
    return null;
  }
  return flattenQuestions(parsed);
}

function isDefinitionShaped(value: unknown): value is PublishedFormDefinition {
  return typeof value === 'object' && value !== null && Array.isArray((value as { pages?: unknown }).pages);
}

/** One response's full detail: labelled answers, plus what the submission did. */
export function buildResponseDetail(output: FormsGetResponseDetailOutput): ResponseDetail {
  const { Response: response } = output;
  const questions = parseDefinitionQuestions(output.DefinitionJSON, `version ${output.LabelFormVersionID} labelling response ${response.ID}`);
  const { views, unlabelled } = buildAnswerViews(output.Answers, questions ?? [], output.Uploads);
  return {
    responseId: response.ID,
    status: response.Status,
    startedAt: toDate(response.StartedAt),
    submittedAt: toDate(response.SubmittedAt),
    respondent: deriveRespondentLabel(response.RespondentPerson, output.Answers, questions ?? []),
    answers: views,
    unlabelledAnswerCount: unlabelled,
    labelsMissing: questions === null,
    unavailableSections: output.UnavailableSections,
    automationRuns: output.AutomationRuns.map(toAutomationAttempt),
    automationEvents: output.AutomationEvents.map(toAutomationEventView),
    bindingRecords: output.BindingRecords.map(toBindingRecordView),
  };
}

/**
 * Labels each answer by its question, attaching — for file answers — the upload behind it.
 *
 * Driven by QUESTIONS, not by answers: `questions` arrive in page/display order, the answers in
 * whatever order the server read them — which is how a response once rendered "Last name" above
 * "First name". Ids are compared folded, because a server read hands back the database's GUID
 * casing, which need not be the snapshot's.
 *
 * An answer whose question is absent from `questions` is dropped (there is nothing truthful to label
 * it with) and COUNTED, so its omission is visible. Statements are display-only and never shown.
 */
function buildAnswerViews(
  answers: readonly FormsStoredAnswer[],
  questions: readonly PublishedFormQuestion[],
  uploads: readonly FormsResponseUpload[],
): { views: ResponseAnswerView[]; unlabelled: number } {
  const answerByQuestion = new Map(answers.map((a) => [foldQuestionId(a.QuestionID), a]));
  const uploadByFileId = new Map(uploads.map((u) => [u.FileID.toLowerCase(), u]));
  const views: ResponseAnswerView[] = [];

  for (const q of questions) {
    if (q.type === 'Statement') {
      continue;
    }
    const a = answerByQuestion.get(foldQuestionId(q.id));
    if (!a) {
      // Not answered — skipped, conditionally hidden, or added after this submission.
      continue;
    }
    views.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      displayValue: renderAnswer(q, a),
      file: toFileView(a, uploadByFileId),
    });
  }

  const knownIds = new Set(questions.filter((q) => q.type !== 'Statement').map((q) => foldQuestionId(q.id)));
  const unlabelled = answers.filter((a) => !knownIds.has(foldQuestionId(a.QuestionID))).length;
  return { views, unlabelled };
}

/**
 * The file behind an answer, matched on the answer's `FileID`.
 *
 * `FileID` and NOT the draft is the join key on purpose: a draft can accumulate uploads the
 * respondent replaced or abandoned, and those revoked/orphaned rows must never surface as this
 * answer's file. A `FileID` whose provenance row did not come back is an UNRESOLVED view, not null:
 * the respondent did attach something, and an empty answer would be a lie nobody could detect.
 */
function toFileView(a: FormsStoredAnswer, uploadByFileId: ReadonlyMap<string, FormsResponseUpload>): ResponseFileView | null {
  if (!a.FileID) {
    return null;
  }
  const upload = uploadByFileId.get(a.FileID.toLowerCase());
  if (!upload) {
    return { fileId: a.FileID, fileName: UNRESOLVED_FILE, contentType: null, sizeBytes: null, isRevoked: false, isResolved: false };
  }
  return {
    fileId: upload.FileID,
    fileName: upload.FileName || UNNAMED_FILE,
    contentType: upload.ContentType,
    sizeBytes: upload.SizeBytes,
    isRevoked: upload.Status === 'Revoked',
    isResolved: true,
  };
}

/** One automation step as the detail view shows it. */
function toAutomationAttempt(run: FormsResponseAutomationRun): ResponseAutomationAttempt {
  const startedAt = toDate(run.StartedAt);
  const completedAt = toDate(run.CompletedAt);
  return {
    runId: run.ID,
    automationName: run.FormAutomation,
    status: run.Status,
    deliveryAttempt: run.AttemptCount,
    automationEventId: run.FormAutomationEventID,
    startedAt,
    completedAt,
    durationSeconds: startedAt && completedAt ? (completedAt.getTime() - startedAt.getTime()) / 1000 : null,
    errorMessage: run.ErrorMessage,
    outputSummary: runOutputText(run.OutputSummary),
    actionExecutionLogId: run.ActionExecutionLogID,
    aiAgentRunId: run.AIAgentRunID,
  };
}

/** One automation event as the detail view shows it. */
function toAutomationEventView(event: FormsResponseAutomationEvent): ResponseAutomationEventView {
  return {
    eventId: event.ID,
    trigger: event.Trigger,
    status: event.Status,
    attemptCount: event.AttemptCount,
    lastError: event.LastError,
    completedAt: toDate(event.CompletedAt),
  };
}

/**
 * One binding-ledger row as the detail view shows it. `TargetEntityName` is resolved on the server
 * (the column is deliberately not a foreign key); null keeps the row visible, labelled by the id,
 * with no link to an entity name that does not exist.
 */
function toBindingRecordView(record: FormsResponseBindingRecord): ResponseBindingRecordView {
  return {
    bindingRecordId: record.ID,
    bindingName: record.Binding,
    targetEntityId: record.TargetEntityID,
    targetEntityName: record.TargetEntityName,
    targetRecordId: record.TargetRecordID,
    outcome: record.Outcome,
    writtenFields: parseWrittenFields(record.WrittenFields, record.ID),
  };
}

/**
 * The ledger's `WrittenFields` JSON list. Malformed content yields an empty list — the column is
 * diagnostic and a display view must not fail on it — but is LOGGED with the row id, because a
 * ledger that cannot say what it wrote is a real defect upstream.
 */
function parseWrittenFields(json: string | null, bindingRecordId: string): string[] {
  if (!json) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v));
    }
    LogError(`Form Entity Binding Record ${bindingRecordId}: WrittenFields is valid JSON but not an array; treating as no fields written.`);
    return [];
  } catch (err) {
    LogError(
      `Form Entity Binding Record ${bindingRecordId}: WrittenFields is not parseable JSON ` +
        `(${err instanceof Error ? err.message : 'unknown error'}); treating as no fields written.`,
    );
    return [];
  }
}
