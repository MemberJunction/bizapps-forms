/**
 * `Forms.RequestPublishApproval` — the server body of the CodeGen-emitted
 * `FormsRequestPublishApprovalOperation`, for a form whose `RequiresPublishApproval` is on.
 *
 * Same shape as `Forms.PublishForm`: authoring authorization, input validation, one engine call.
 * The engine writes the version `InReview` and starts the workflow that asks the form's approver
 * role ({@link FormPublishReview}); the version goes live when the approver approves it.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsRequestPublishApprovalOperation,
  type FormsRequestPublishApprovalInput,
  type FormsRequestPublishApprovalOutput,
} from '@mj-biz-apps/forms-entities';
import { FormPublishReview } from '../engines/FormPublishReview.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.RequestPublishApproval')
export class RequestPublishApprovalServerOperation extends FormsRequestPublishApprovalOperation {
  protected override async Authorize(_input: FormsRequestPublishApprovalInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsRequestPublishApprovalInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsRequestPublishApprovalOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const requested = await FormPublishReview.Instance.RequestApproval(formId, database, user);
    return {
      FormVersionID: requested.formVersionId,
      VersionNumber: requested.versionNumber,
      WorkflowTaskID: requested.workflowTaskId,
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadRequestPublishApprovalOperation(): void {
  // intentionally empty
}
