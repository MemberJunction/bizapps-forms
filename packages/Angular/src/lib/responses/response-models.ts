/**
 * View-model types for the individual-response surface.
 *
 * Shared by all three mounts (reporting dashboard tab, builder tab, Form Response
 * entity-form override) — moved out of the dashboard's `reporting.model.ts` so that
 * nothing outside `lib/dashboard/` has to depend on the dashboard to render a response.
 * Built from what `Forms.ListResponses` and `Forms.GetResponseDetail` return; nothing here is
 * persisted.
 */
import type {
  FormQuestionType,
  FormsResponseAutomationEvent,
  FormsResponseAutomationRun,
  FormsResponseBindingRecord,
  FormsResponseListRow,
} from '@mj-biz-apps/forms-entities';

/**
 * A response's status, derived from the operation's output type rather than re-typed.
 *
 * The union is the `FormResponse.Status` CHECK values as `Forms.ListResponses` declares them, so a
 * hand-copied `'Complete' | 'Partial'` cannot silently stop tracking it
 * (`.claude/rules/typescript-style.md`).
 */
export type ResponseStatus = FormsResponseListRow['Status'];

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
  /** The uploaded file, when this is a file answer whose upload row resolved. */
  file: ResponseFileView | null;
}

/**
 * One on-submit automation step triggered by this submission.
 *
 * Not named "…Run View": DW3 of #303 greps this surface for MJ's read-API class name to prove it does
 * no reads of its own, and a type spelled like it would match.
 */
export interface ResponseAutomationAttempt {
  runId: string;
  /** The automation's name, from the run view's denormalised field. */
  automationName: string;
  status: FormsResponseAutomationRun['Status'];
  /**
   * Which attempt at the submission's automation event last ran this step, 1-based — NOT how many
   * times it ran. A retry raises it; an operator's replay starts a new count at 1 (#303).
   */
  deliveryAttempt: number;
  /**
   * The automation event (`FormAutomationEvent`) whose run ran this step: what an operator looks
   * the attempt up by. Null for steps written before the column existed.
   */
  automationEventId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Wall-clock seconds; null while the run is still in flight or never started. */
  durationSeconds: number | null;
  errorMessage: string | null;
  /** What the step said, in words: decoded from the stored JSON, record ids removed (`runOutputText`). */
  outputSummary: string | null;
  /** `MJ: Action Execution Logs` id, when an Action ran. */
  actionExecutionLogId: string | null;
  /** `MJ: AI Agent Runs` id, when an Agent ran. */
  aiAgentRunId: string | null;
}

/**
 * One automation event (`FormAutomationEvent`, an outbox row a save queued) this response owes or
 * has run. A `DeadLetter` one is a final submit whose automations gave up, and the only status an
 * author can replay (`Forms.ReplayAutomationEvent`, #311).
 */
export interface ResponseAutomationEventView {
  eventId: string;
  trigger: FormsResponseAutomationEvent['Trigger'];
  status: FormsResponseAutomationEvent['Status'];
  /** How many times a drain has attempted it. */
  attemptCount: number;
  /** Why the last attempt failed; null when none did. */
  lastError: string | null;
  /** When it settled; null while it is still open. */
  completedAt: Date | null;
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
  outcome: FormsResponseBindingRecord['Outcome'];
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
  /**
   * Answers present on the response that could NOT be labelled, because the version being
   * labelled from has no such question — a question deleted since, or a version whose
   * definition snapshot is unavailable entirely.
   *
   * Those answers are omitted from {@link answers} (there is nothing truthful to label them
   * with) but the COUNT is surfaced so their omission is visible. Dropping them silently
   * renders as "this person answered nothing", which the reader has no way to detect.
   */
  unlabelledAnswerCount: number;
  /**
   * True when the version labelling the answers has no readable definition, so NO answer could be
   * labelled. The view says so: an empty transcript would otherwise read as "they answered nothing".
   */
  labelsMissing: boolean;
  /**
   * Human-readable names of the sections that could not be read (e.g. because the user's
   * role lacks Read on that entity), so the view can say a section is MISSING rather than
   * EMPTY. Those are opposite claims and the reader cannot tell them apart otherwise.
   */
  unavailableSections: string[];
  /** What the submission triggered. Empty when it triggered nothing. */
  automationRuns: ResponseAutomationAttempt[];
  /** The automation events its saves queued, oldest first. Empty when they queued none. */
  automationEvents: ResponseAutomationEventView[];
  /** What business records it wrote. Empty when it wrote none. */
  bindingRecords: ResponseBindingRecordView[];
}

/** A record the detail view can deep-link to, in whatever the host's navigation idiom is. */
export interface ResponseRecordLink {
  entityName: string;
  recordId: string;
}

/** Where the open response sits in the whole (searched) list, for the detail's "Response 3 of 217". */
export interface DetailPosition {
  /** 1-based, across every page. */
  index: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
}
