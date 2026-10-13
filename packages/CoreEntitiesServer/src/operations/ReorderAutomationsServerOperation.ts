/**
 * `Forms.ReorderAutomations` — the server body of the CodeGen-emitted
 * `FormsReorderAutomationsOperation`. Rewrites the run order of every step of a form in one
 * transaction; an order placing an Async step ahead of a Sync one is refused.
 * Shape: see `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsReorderAutomationsOperation,
  type FormsReorderAutomationsInput,
  type FormsReorderAutomationsOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAutomationEngine } from '../engines/FormAutomationEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.ReorderAutomations')
export class ReorderAutomationsServerOperation extends FormsReorderAutomationsOperation {
  protected override async Authorize(_input: FormsReorderAutomationsInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsReorderAutomationsInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsReorderAutomationsOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const ordered: unknown = input.OrderedAutomationIDs;
    if (!isIdList(ordered)) {
      throw new Error(`${this.OperationKey}: OrderedAutomationIDs must be a list of step ids.`);
    }
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const automations = await FormAutomationEngine.Instance.Reorder(formId, ordered, database, user);
    return { Automations: automations };
  }
}

/** A JSON array of non-blank strings — the wire is JSON, typed by the generated interface but not checked by it. */
function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id.trim() !== '');
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadReorderAutomationsOperation(): void {
  // intentionally empty
}
