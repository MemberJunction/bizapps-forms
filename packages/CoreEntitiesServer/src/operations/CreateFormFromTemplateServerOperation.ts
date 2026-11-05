/**
 * `Forms.CreateFormFromTemplate` — the server body of the CodeGen-emitted
 * `FormsCreateFormFromTemplateOperation`: a new Draft form from a saved template (`TemplateFormID`)
 * or a starter gallery key (`TemplateKey`). Shape: see `PublishFormServerOperation`.
 *
 * `Warnings` carries the references a saved template's copy could not carry over — a rule naming a
 * question the template no longer has — so the caller can put them in front of the author, the only
 * person who can fix them. A starter names nothing by id, so its list is always empty.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsCreateFormFromTemplateOperation,
  type FormsCreateFormFromTemplateInput,
  type FormsCreateFormFromTemplateOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine, type TemplateSource } from '../engines/FormAuthoringEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { optionalTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.CreateFormFromTemplate')
export class CreateFormFromTemplateServerOperation extends FormsCreateFormFromTemplateOperation {
  protected override async Authorize(_input: FormsCreateFormFromTemplateInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsCreateFormFromTemplateInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsCreateFormFromTemplateOutput> {
    const source = this.templateSource(input);
    const name = optionalTextInput(input?.Name, 'Name', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const created = await FormAuthoringEngine.Instance.CreateFromTemplate(source, database, user, { name });
    return { FormID: created.formId, Warnings: created.warnings };
  }

  /**
   * Exactly one source. The input type's union makes "both" and "neither" unrepresentable to a typed
   * caller, but the wire is JSON, so both are refused here — guessing which one was meant would
   * build the wrong form.
   */
  private templateSource(input: FormsCreateFormFromTemplateInput | null | undefined): TemplateSource {
    const templateFormId = optionalTextInput(input?.TemplateFormID, 'TemplateFormID', this.OperationKey);
    const templateKey = optionalTextInput(input?.TemplateKey, 'TemplateKey', this.OperationKey);
    if (templateFormId && !templateKey) {
      return { templateFormId };
    }
    if (templateKey && !templateFormId) {
      return { templateKey };
    }
    throw new Error(`${this.OperationKey}: exactly one of TemplateFormID or TemplateKey is required.`);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadCreateFormFromTemplateOperation(): void {
  // intentionally empty
}
