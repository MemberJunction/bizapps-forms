/**
 * `Forms.CloneForm` — the server body of the CodeGen-emitted `FormsCloneFormOperation`: copy a form
 * into a new Draft form, or (`AsTemplate`) into a template. "Save as template" is this operation
 * with `AsTemplate: true`; the template-name check runs inside the engine's transaction, so no
 * caller can skip it. Shape: see `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { FormsCloneFormOperation, type FormsCloneFormInput, type FormsCloneFormOutput } from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine } from '../engines/FormAuthoringEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { optionalNullableTextInput, optionalTextInput, requireBooleanInput, requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.CloneForm')
export class CloneFormServerOperation extends FormsCloneFormOperation {
  protected override async Authorize(_input: FormsCloneFormInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsCloneFormInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsCloneFormOutput> {
    const sourceFormId = requireTextInput(input?.SourceFormID, 'SourceFormID', this.OperationKey);
    const asTemplate = requireBooleanInput(input?.AsTemplate, 'AsTemplate', this.OperationKey);
    const name = optionalTextInput(input?.Name, 'Name', this.OperationKey);
    const description = optionalNullableTextInput(input?.Description, 'Description', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const copied = await FormAuthoringEngine.Instance.Clone(sourceFormId, database, user, { asTemplate, name, description });
    return {
      FormID: copied.formId,
      TemplateSourceFormID: copied.templateSourceFormId,
      PageCount: copied.pageCount,
      QuestionCount: copied.questionCount,
      OptionCount: copied.optionCount,
      ScreenCount: copied.screenCount,
      AutomationCount: copied.automationCount,
      BindingCount: copied.bindingCount,
      Warnings: copied.warnings,
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadCloneFormOperation(): void {
  // intentionally empty
}
