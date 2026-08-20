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
import { LogError } from '@memberjunction/core';
import { deriveRespondent, renderAnswer } from '../shared/answer-values';
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

/** Shown when no `FormUpload` row matched the answer's `FileID` at all. */
const UNRESOLVED_FILE = 'File (details unavailable)';

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
  /** Sections whose read failed; they arrive empty and are reported as missing, not empty. */
  unavailableSections?: string[];
}

/**
 * Builds the response-list rows. Lists COMPLETE responses only — a Partial is an in-progress
 * autosave, not a submitted response, so it must not appear in the headline response list
 * (it is still reflected in the funnel/drop-off metric, which reads all answers).
 */
/**
 * Whether an answer row actually holds an answer.
 *
 * Every answerable question a respondent reaches can leave a row behind, blank ones
 * included, so counting rows reports questions SEEN rather than questions answered — and
 * the column it feeds is headed "Answered", the only per-response completeness signal the
 * list gives a reader.
 *
 * Tests each typed column for EMPTINESS, never for falsiness. A numeric `0`, a `false`
 * boolean and an empty-string-but-present text answer are not the same thing: the first two
 * are real answers a respondent chose, and reading them as blank would under-count exactly
 * the responses that answered "no" or "none".
 */
function storedSomething(a: AnswerRow): boolean {
  if (a.TextValue !== null && a.TextValue !== undefined && a.TextValue.trim() !== '') return true;
  if (a.NumericValue !== null && a.NumericValue !== undefined) return true;
  if (a.BooleanValue !== null && a.BooleanValue !== undefined) return true;
  if (a.DateValue !== null && a.DateValue !== undefined) return true;
  if (a.FileID !== null && a.FileID !== undefined && a.FileID !== '') return true;
  if (a.JSONValue !== null && a.JSONValue !== undefined && a.JSONValue.trim() !== '') return true;
  return false;
}

export function buildResponseRows(
  responses: ResponseRow[],
  answers: AnswerRow[],
  questions: PublishedFormQuestion[] = [],
): ResponseListRow[] {
  const answersByResponse = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const bucket = answersByResponse.get(a.ResponseID);
    if (bucket) bucket.push(a);
    else answersByResponse.set(a.ResponseID, [a]);
  }
  return responses
    .filter((r) => r.Status === 'Complete')
    .map((r) => {
      const own = answersByResponse.get(r.ID) ?? [];
      return {
        responseId: r.ID,
        status: r.Status,
        startedAt: toDate(r.StartedAt),
        submittedAt: toDate(r.SubmittedAt),
        // `questions` defaults to empty so a caller with no snapshot still gets rows —
        // it just falls back to the Person name, or to "Anonymous", as before.
        respondent: deriveRespondent(r, own, questions),
        answeredCount: own.filter(storedSomething).length,
      };
    });
}

/** Builds one response's full detail: labelled answers, plus what the submission did. */
export function buildResponseDetail(input: ResponseDetailInput): ResponseDetail {
  const { response } = input;
  const { views, unlabelled } = buildAnswerViews(input.answers, input.questions, input.uploads);
  return {
    responseId: response.ID,
    status: response.Status,
    startedAt: toDate(response.StartedAt),
    submittedAt: toDate(response.SubmittedAt),
    respondent: deriveRespondent(response, input.answers, input.questions),
    answers: views,
    unlabelledAnswerCount: unlabelled,
    unavailableSections: input.unavailableSections ?? [],
    automationRuns: input.automationRuns.map(toAutomationRunView),
    bindingRecords: input.bindingRecords.map((b) => toBindingRecordView(b, input.entityNameById)),
  };
}

/**
 * Labels each answer by its question, attaching — for file answers — the upload behind it.
 *
 * An answer whose question is absent from `questions` is dropped: it was submitted against
 * a version where the question still existed, and there is nothing truthful to label it
 * with. Statement questions are display-only and never have answers worth showing.
 */
function buildAnswerViews(
  answers: AnswerRow[],
  questions: PublishedFormQuestion[],
  uploads: UploadRow[],
): { views: ResponseAnswerView[]; unlabelled: number } {
  const answerByQuestion = new Map(answers.map((a) => [a.QuestionID, a]));
  const uploadByFileId = new Map(uploads.map((u) => [u.FileID, u]));
  const views: ResponseAnswerView[] = [];

  // Driven by QUESTIONS, not by answers. `questions` arrives flattened in page/display
  // order, whereas `answers` arrives in whatever order the view returned — which is how a
  // response rendered "Last name" above "First name". Reading a transcript out of order
  // is not a cosmetic problem: it silently misrepresents what the respondent filled in.
  for (const q of questions) {
    if (q.type === 'Statement') {
      // Display-only prose; a Statement never carries an answer worth showing.
      continue;
    }
    const a = answerByQuestion.get(q.id);
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

  // Real answers we cannot name: counted, not forgotten. Statements are excluded because a
  // stray answer against one is display-only noise, not lost respondent input.
  const knownIds = new Set(questions.filter((q) => q.type !== 'Statement').map((q) => q.id));
  const unlabelled = answers.filter((a) => !knownIds.has(a.QuestionID)).length;

  return { views, unlabelled };
}

/**
 * Resolves an answer's file, matching on the answer's `FileID`.
 *
 * `FileID` and NOT `ResponseDraftID` is the join key on purpose: a draft can accumulate
 * uploads the respondent replaced or abandoned, and those revoked/orphaned rows must never
 * surface as though they were this answer's file.
 *
 * Null means "this answer has no file". A `FileID` whose provenance row did not come back
 * returns an UNRESOLVED view, not null: the respondent did attach something, and rendering
 * that as an empty answer would be a lie the reader has no way to detect.
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
    return {
      fileId: a.FileID,
      fileName: UNRESOLVED_FILE,
      contentType: null,
      sizeBytes: null,
      isRevoked: false,
      isResolved: false,
    };
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
    writtenFields: parseWrittenFields(record.WrittenFields, record.ID),
  };
}

/**
 * Parses the ledger's `WrittenFields` JSON list.
 *
 * Malformed content yields an empty list rather than throwing — this column is diagnostic
 * and a display view must not fail on it — but it is LOGGED with the row id, because a
 * ledger that cannot say what it wrote is a real defect upstream, and silently returning
 * `[]` would make it look like the execution simply wrote nothing.
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
    LogError(
      `Form Entity Binding Record ${bindingRecordId}: WrittenFields is valid JSON but not ` +
        `an array; treating as no fields written.`,
    );
    return [];
  } catch (err) {
    LogError(
      `Form Entity Binding Record ${bindingRecordId}: WrittenFields is not parseable JSON ` +
        `(${err instanceof Error ? err.message : 'unknown error'}); treating as no fields written.`,
    );
    return [];
  }
}
