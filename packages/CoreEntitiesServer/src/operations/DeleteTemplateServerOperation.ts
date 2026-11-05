/**
 * `Forms.DeleteTemplate` — the server body of the CodeGen-emitted `FormsDeleteTemplateOperation`.
 * Permanently deletes a saved template and everything under it, in one unit of work; the engine
 * refuses a working form and a template anything is attached to. Shape: see
 * `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsDeleteTemplateOperation,
  type FormsDeleteTemplateInput,
  type FormsDeleteTemplateOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine } from '../engines/FormAuthoringEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.DeleteTemplate')
export class DeleteTemplateServerOperation extends FormsDeleteTemplateOperation {
  protected override async Authorize(_input: FormsDeleteTemplateInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsDeleteTemplateInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsDeleteTemplateOutput> {
    const templateId = requireTextInput(input?.TemplateFormID, 'TemplateFormID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const deleted = await FormAuthoringEngine.Instance.DeleteTemplate(templateId, database, user);
    return {
      TemplateFormID: deleted.templateFormId,
      PageCount: deleted.pageCount,
      QuestionCount: deleted.questionCount,
      OptionCount: deleted.optionCount,
      ScreenCount: deleted.screenCount,
      AutomationCount: deleted.automationCount,
      BindingCount: deleted.bindingCount,
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadDeleteTemplateOperation(): void {
  // intentionally empty
}
