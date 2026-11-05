/**
 * `Forms.RemoveAutomation` — the server body of the CodeGen-emitted `FormsRemoveAutomationOperation`.
 * Removes one on-submit step and keeps the binding it ran; the form stays marked as owning its steps.
 * Shape: see `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsRemoveAutomationOperation,
  type FormsRemoveAutomationInput,
  type FormsRemoveAutomationOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAutomationEngine } from '../engines/FormAutomationEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.RemoveAutomation')
export class RemoveAutomationServerOperation extends FormsRemoveAutomationOperation {
  protected override async Authorize(_input: FormsRemoveAutomationInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsRemoveAutomationInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsRemoveAutomationOutput> {
    const automationId = requireTextInput(input?.FormAutomationID, 'FormAutomationID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    return FormAutomationEngine.Instance.Remove(automationId, database, user);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadRemoveAutomationOperation(): void {
  // intentionally empty
}
