/**
 * View-model types for the individual-response surface.
 *
 * Shared by all three mounts (reporting dashboard tab, builder tab, Form Response
 * entity-form override) — moved out of the dashboard's `reporting.model.ts` so that
 * nothing outside `lib/dashboard/` has to depend on the dashboard to render a response.
 * Nothing here is persisted; it is purely a read-model.
 */
import type {
  FormQuestionType,
  mjBizAppsFormsFormAutomationRunEntityType,
  mjBizAppsFormsFormEntityBindingRecordEntityType,
  mjBizAppsFormsFormResponseEntityType,
} from '@mj-biz-apps/forms-entities';

/**
 * A response's status, derived from the entity rather than re-typed.
 *
 * The union is CodeGen output from the column's CHECK constraint, so a hand-copied
 * `'Complete' | 'Partial'` silently stops tracking it the moment a migration widens the
 * constraint (`.claude/rules/typescript-style.md`).
 */
export type ResponseStatus = mjBizAppsFormsFormResponseEntityType['Status'];

/** A row in the individual-response list/grid. */
export interface ResponseListRow {
  responseId: string;
  status: ResponseStatus;
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answeredCount: number;
}

/**
 * The stored file behind a FileUpload answer, joined from its `FormUpload` provenance row.
 *
 * The answer itself only holds a `FileID`; the name, type and size live on the upload row,
 * which is why an unjoined detail view could only ever show a GUID.
 */
export interface ResponseFileView {
  /** The `MJ: Files` record id — what a deep link opens. */
  fileId: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  /** True when the provenance row is `Revoked`; the file is no longer retrievable. */
  isRevoked: boolean;
  /**
   * False when no `FormUpload` row matched the answer's `FileID` — the name, type and size
   * are unknown, but the file id still is, so the deep link remains valid.
   *
   * This state must stay VISIBLE. An answer that blanks to `—` because its provenance row
   * was garbage-collected (or is unreadable for this user) reads as "they attached
   * nothing", which is the opposite of the truth.
   */
  isResolved: boolean;
}

/** One labelled answer in the individual-response detail view. */
export interface ResponseAnswerView {
  questionId: string;
  prompt: string;
  type: FormQuestionType;
  /** Human-readable rendering of the answer. */
  displayValue: string;
  /** AI score written by `Forms: Analyze Written Responses`; null when unscored. */
  score: number | null;
  /** The model's stated reason for the score; null when unscored. */
  scoreRationale: string | null;
  /** The uploaded file, when this is a file answer whose upload row resolved. */
  file: ResponseFileView | null;
}

/** One on-submit automation attempt triggered by this submission. */
export interface ResponseAutomationRunView {
  runId: string;
  /** The automation's name, from the run view's denormalised field. */
  automationName: string;
  status: mjBizAppsFormsFormAutomationRunEntityType['Status'];
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Wall-clock seconds; null while the run is still in flight or never started. */
  durationSeconds: number | null;
  errorMessage: string | null;
  outputSummary: string | null;
  /** `MJ: Action Execution Logs` id, when an Action ran. */
  actionExecutionLogId: string | null;
  /** `MJ: AI Agent Runs` id, when an Agent ran. */
  aiAgentRunId: string | null;
}

/** One business record this submission created or merged into. */
export interface ResponseBindingRecordView {
  bindingRecordId: string;
  /** The binding's name, from the ledger view's denormalised field. */
  bindingName: string;
  targetEntityId: string;
  /**
   * The CANONICAL entity name resolved from `Metadata` — what a deep link needs, so a
   * display name will not do. Null when metadata has no entry for the id, in which case
   * the row still renders (labelled by the id) but offers no link to follow.
   */
  targetEntityName: string | null;
  targetRecordId: string | null;
  outcome: mjBizAppsFormsFormEntityBindingRecordEntityType['Outcome'];
  /** Field names actually written by this execution; empty when none or unparseable. */
  writtenFields: string[];
}

/** The full individual-response detail view-model. */
export interface ResponseDetail {
  responseId: string;
  status: ResponseStatus;
  startedAt: Date | null;
  submittedAt: Date | null;
  respondent: string;
  answers: ResponseAnswerView[];
  /** What the submission triggered. Empty when it triggered nothing. */
  automationRuns: ResponseAutomationRunView[];
  /** What business records it wrote. Empty when it wrote none. */
  bindingRecords: ResponseBindingRecordView[];
}

/** A record the detail view can deep-link to, in whatever the host's navigation idiom is. */
export interface ResponseRecordLink {
  entityName: string;
  recordId: string;
}
