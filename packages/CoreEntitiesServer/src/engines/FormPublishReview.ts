/**
 * Publish approval as a workflow: the review a form with `RequiresPublishApproval` goes through.
 *
 * Asking for approval ({@link FormPublishReview.RequestApproval}) writes the version `InReview` and
 * submits a two-step task graph in the same transaction:
 *
 *  1. **review** — a Human step raised through bizapps-tasks (`provider: 'BizAppsTasks'`): an approval
 *     task assigned to the form's approver role and linked to the version. bizapps-tasks completes
 *     the step when a member of the role decides, writing the decision under `approval`.
 *  2. **settle** — the `Forms: Settle Publish Review` action, which calls
 *     {@link FormPublishReview.SettleReview}. It runs after the review whatever happened to it
 *     (`onError: 'continue'`), so a review that expires still settles the version, as Rejected,
 *     rather than leaving it waiting forever and blocking the next request.
 *
 * Settling reads the decision from the workflow's own review step, never from its input: the action
 * can be invoked by anyone allowed to run it, and the step is completed only by bizapps-tasks when
 * the approver decides (MJ's `TaskGraph.CompleteWaitingStep` refuses provider-raised Human steps).
 * The workflow it reads is the one stored on the version, a column only the publishing engine writes.
 */
import { LogStatus, type DatabaseProviderBase, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { TaskGraphService } from '@memberjunction/task-graph';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names.js';
import { isGuid } from '../shared/guid.js';
import {
  FormPublishError,
  FormPublishingEngine,
  type FormReviewDecision,
  type FormReviewRequestResult,
  type FormReviewSettleResult,
  type FormReviewStart,
} from './FormPublishingEngine.js';

/** The human-task provider bizapps-tasks registers. */
export const PUBLISH_REVIEW_PROVIDER = 'BizAppsTasks';
/** The action the workflow's second step runs. */
export const SETTLE_PUBLISH_REVIEW_ACTION = 'Forms: Settle Publish Review';
/** Where bizapps-tasks writes the decision in the workflow payload. */
export const PUBLISH_REVIEW_OUTPUT_KEY = 'approval';
/** bizapps-tasks' approval task type. */
export const PUBLISH_REVIEW_TASK_TYPE = 'APPROVAL_REQUEST';
/** How long the approver has before the review expires and the version is rejected. */
export const PUBLISH_REVIEW_EXPIRES_IN_HOURS = 24 * 14;

const REVIEW_STEP = 'review';
const SETTLE_STEP = 'settle';
const ROLES_ENTITY = 'MJ: Roles';
const TASKS_ENTITY = 'MJ: Tasks';

/** Settling a review whose approver has not decided yet: nothing is written. */
export interface PublishReviewPending {
  settled: false;
  reason: string;
}

/** What {@link FormPublishReview.SettleReview} did. */
export type PublishReviewSettlement = PublishReviewPending | ({ settled: true } & FormReviewSettleResult);

/** The review step as settling reads it. */
export interface PublishReviewStepRow {
  ID: string;
  Status: string;
  OutputPayload: string | null;
  ErrorMessage: string | null;
}

/** The version as settling reads it. */
interface ReviewedVersionRow {
  ID: string;
  Status: string;
  ApprovalWorkflowTaskID: string | null;
}

/**
 * Pure: the two-step graph that asks `review.approverRoleId` to approve the version, then settles it.
 * Every value is a literal — nothing reads the payload — so what the approver is asked cannot be
 * steered by anything upstream.
 */
export function BuildPublishReviewSpec(review: FormReviewStart): TaskGraphSpec {
  const title = `Approve publishing "${review.formName}" (version ${review.versionNumber})`;
  return {
    workflowName: `Publish approval: ${review.formName} v${review.versionNumber}`,
    reasoning: 'This form requires approval before a new version goes live.',
    durable: true,
    continuation: 'none',
    tasks: [
      {
        ...TaskNode.Human(
          { tempId: REVIEW_STEP, name: title, description: 'The approver reviews the version and approves or rejects it.', dependsOn: [] },
          {
            provider: PUBLISH_REVIEW_PROVIDER,
            instructions: `Review version ${review.versionNumber} of the form "${review.formName}" and approve or reject publishing it.`,
            expiresInHours: PUBLISH_REVIEW_EXPIRES_IN_HOURS,
            providerConfiguration: {
              taskType: PUBLISH_REVIEW_TASK_TYPE,
              title,
              assignees: [{ entity: ROLES_ENTITY, recordID: review.approverRoleId }],
              linkedRecord: { entity: FORMS_ENTITY.FormVersion, recordID: review.formVersionId },
              outputKey: PUBLISH_REVIEW_OUTPUT_KEY,
            },
          },
        ),
        // A review that fails (it expired, or could not be raised) still settles the version.
        policy: { onError: 'continue' },
      },
      TaskNode.Action(
        { tempId: SETTLE_STEP, name: 'Settle the review', description: 'Publish or reject the version, as decided.', dependsOn: [REVIEW_STEP] },
        { actionName: SETTLE_PUBLISH_REVIEW_ACTION, inputMapping: JSON.stringify({ FormVersionID: review.formVersionId }) },
      ),
    ],
  };
}

/**
 * Pure: the decision a settled review step records, or why it does not settle the version yet.
 * A step that failed (expired, never raised) rejects; a completed step's `approval` must say
 * `Approved: true` to publish — anything else, including a malformed payload, rejects.
 */
export function ReadReviewDecision(step: PublishReviewStepRow | undefined): FormReviewDecision | PublishReviewPending {
  if (!step) {
    return { settled: false, reason: 'The workflow has no review step.' };
  }
  if (step.Status === 'Failed') {
    return { approved: false, notes: `The approval request did not complete: ${step.ErrorMessage || 'it failed or expired'}.` };
  }
  if (step.Status !== 'Complete') {
    return { settled: false, reason: `The approver has not decided yet (the review is ${step.Status}).` };
  }
  const approval = parseApproval(step.OutputPayload);
  return {
    approved: approval?.Approved === true,
    notes: typeof approval?.Notes === 'string' && approval.Notes.trim() ? approval.Notes.trim() : null,
  };
}

function parseApproval(outputPayload: string | null): { Approved?: unknown; Notes?: unknown } | null {
  if (!outputPayload) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(outputPayload);
    if (payload && typeof payload === 'object' && PUBLISH_REVIEW_OUTPUT_KEY in payload) {
      const approval = (payload as Record<string, unknown>)[PUBLISH_REVIEW_OUTPUT_KEY];
      return approval && typeof approval === 'object' ? (approval as { Approved?: unknown; Notes?: unknown }) : null;
    }
  } catch {
    // An unreadable payload is not an approval; the caller rejects.
  }
  return null;
}

function isPending(value: FormReviewDecision | PublishReviewPending): value is PublishReviewPending {
  return 'settled' in value;
}

export class FormPublishReview extends BaseSingleton<FormPublishReview> {
  public static get Instance(): FormPublishReview {
    return super.getInstance<FormPublishReview>();
  }

  /** Ask the form's approver role to approve publishing its current draft. */
  public async RequestApproval(formId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormReviewRequestResult> {
    return FormPublishingEngine.Instance.SubmitForReview(formId, provider, user, (review) => this.startWorkflow(review, provider, user));
  }

  /**
   * Settle a version's review from the decision its workflow recorded. Returns `settled: false`,
   * writing nothing, while the approver has not decided.
   */
  public async SettleReview(formVersionId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<PublishReviewSettlement> {
    const id = formVersionId?.trim() ?? '';
    if (!isGuid(id)) {
      throw new FormPublishError('A valid form version ID is required to settle a review.');
    }
    const version = await readReviewedVersion(id, provider, user);
    if (version.Status === 'Published' || version.Status === 'Rejected') {
      return { settled: true, formVersionId: id, outcome: version.Status, alreadySettled: true, retiredVersionIds: [] };
    }
    if (!version.ApprovalWorkflowTaskID) {
      throw new FormPublishError(`Form version ${id} has no approval workflow, so there is no decision to settle it with.`);
    }
    const decision = ReadReviewDecision(await readReviewStep(version.ApprovalWorkflowTaskID, provider, user));
    if (isPending(decision)) {
      return decision;
    }
    const result = await FormPublishingEngine.Instance.SettleReview(id, decision, provider, user);
    LogStatus(`[FormPublishReview] form version ${id}: review settled as ${result.outcome}.`);
    return { settled: true, ...result };
  }

  private async startWorkflow(review: FormReviewStart, provider: DatabaseProviderBase, user: UserInfo): Promise<string> {
    const result = await new TaskGraphService().Submit(BuildPublishReviewSpec(review), {
      EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
      ContextUser: user,
      Provider: provider,
    });
    if (!result.Success || !result.ParentTaskID) {
      throw new FormPublishError('The approval request could not be started, so nothing was requested.', {
        fault: true,
        logDetail: result.ErrorMessage ?? 'TaskGraphService.Submit returned no workflow',
      });
    }
    return result.ParentTaskID;
  }
}

async function readReviewedVersion(id: string, provider: DatabaseProviderBase, user: UserInfo): Promise<ReviewedVersionRow> {
  const result = await provider.RunView<ReviewedVersionRow>(
    {
      EntityName: FORMS_ENTITY.FormVersion,
      ExtraFilter: `ID=${quoteSqlString(id)}`,
      Fields: ['ID', 'Status', 'ApprovalWorkflowTaskID'],
      ResultType: 'simple',
      BypassCache: true,
    },
    user,
  );
  const [row] = rowsOrRefuse(result, `form version ${id}`);
  if (!row) {
    throw new FormPublishError(`Form version ${id} does not exist.`);
  }
  return row;
}

async function readReviewStep(workflowTaskId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<PublishReviewStepRow | undefined> {
  const result = await provider.RunView<PublishReviewStepRow>(
    {
      EntityName: TASKS_ENTITY,
      ExtraFilter: `ParentID=${quoteSqlString(workflowTaskId)} AND StepType='Human'`,
      Fields: ['ID', 'Status', 'OutputPayload', 'ErrorMessage'],
      ResultType: 'simple',
      BypassCache: true,
      MaxRows: 2,
    },
    user,
  );
  const rows = rowsOrRefuse(result, `the review step of workflow ${workflowTaskId}`);
  if (rows.length > 1) {
    throw new FormPublishError(`Workflow ${workflowTaskId} has more than one review step; it is not a publish approval.`, { fault: true });
  }
  return rows[0];
}

function rowsOrRefuse<T>(result: RunViewResult<T>, what: string): T[] {
  if (!result.Success) {
    throw new FormPublishError(`Could not read ${what}; the review was not settled.`, { fault: true, logDetail: result.ErrorMessage });
  }
  return result.Results ?? [];
}
