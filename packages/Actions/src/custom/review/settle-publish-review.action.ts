/**
 * Workflow action: **Forms: Settle Publish Review**.
 *
 * The second step of a form's publish-approval workflow (`FormPublishReview`): once the approver has
 * decided, publish the reviewed version or reject it. A thin boundary over
 * `FormPublishReview.SettleReview`, which reads the decision from the workflow's own review step —
 * never from this action's input — so running the action by hand cannot approve anything.
 *
 * Idempotent: a version already settled reports what it was settled as and writes nothing, so the
 * workflow can retry the step safely.
 *
 * Input params: `FormVersionID` (string, required) — the version under review.
 * Output params: `Outcome` — `Published` or `Rejected`.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { FormPublishReview, requireDatabaseProvider, resolveActionProvider } from '@mj-biz-apps/forms-core-entities-server';
import { getStringParam, setOutputParam } from '../shared/action-params';

export const SETTLE_PUBLISH_REVIEW_ACTION_NAME = 'Forms: Settle Publish Review';

@RegisterClass(BaseAction, SETTLE_PUBLISH_REVIEW_ACTION_NAME)
export class SettlePublishReviewAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const formVersionId = getStringParam(params, 'FormVersionID');
    if (!formVersionId) {
      return { Success: false, ResultCode: 'MISSING_PARAMETERS', Message: 'FormVersionID parameter is required.' };
    }
    try {
      const database = requireDatabaseProvider(resolveActionProvider(params), SETTLE_PUBLISH_REVIEW_ACTION_NAME);
      const settlement = await FormPublishReview.Instance.SettleReview(formVersionId, database, params.ContextUser);
      if (!settlement.settled) {
        return { Success: false, ResultCode: 'NOT_DECIDED', Message: settlement.reason };
      }
      setOutputParam(params, 'Outcome', settlement.outcome);
      const again = settlement.alreadySettled ? ' (already settled)' : '';
      return { Success: true, ResultCode: 'SUCCESS', Message: `Form version ${formVersionId}: ${settlement.outcome}${again}.`, Params: params.Params };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { Success: false, ResultCode: 'FAILED', Message: `Could not settle the review of form version ${formVersionId}: ${message}` };
    }
  }
}
