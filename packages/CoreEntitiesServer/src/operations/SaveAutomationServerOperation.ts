/**
 * `Forms.SaveAutomation` — the server body of the CodeGen-emitted `FormsSaveAutomationOperation`.
 * Creates or updates one on-submit step, with the binding it runs, the built-ins seeded when this
 * turns the form's own steps on, and the form's authoritative mark — one transaction.
 * Shape: see `PublishFormServerOperation`. The draft's fields are checked by the engine, which an
 * Action or agent calling it directly needs just as much.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsSaveAutomationOperation,
  type FormsSaveAutomationInput,
  type FormsSaveAutomationOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAutomationEngine } from '../engines/FormAutomationEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.SaveAutomation')
export class SaveAutomationServerOperation extends FormsSaveAutomationOperation {
  protected override async Authorize(_input: FormsSaveAutomationInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsSaveAutomationInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsSaveAutomationOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    if (!input.Automation || typeof input.Automation !== 'object' || Array.isArray(input.Automation)) {
      throw new Error(`${this.OperationKey}: Automation is required.`);
    }
    if (input.Binding !== undefined && (input.Binding === null || typeof input.Binding !== 'object' || Array.isArray(input.Binding))) {
      throw new Error(`${this.OperationKey}: Binding must be an object when given.`);
    }
    const database = requireDatabaseProvider(provider, this.OperationKey);
    return FormAutomationEngine.Instance.SaveAutomation({ ...input, FormID: formId }, database, user);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadSaveAutomationOperation(): void {
  // intentionally empty
}
