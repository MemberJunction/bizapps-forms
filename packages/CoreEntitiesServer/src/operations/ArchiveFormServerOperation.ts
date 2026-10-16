/**
 * `Forms.ArchiveForm` — the server body of the CodeGen-emitted `FormsArchiveFormOperation`. Archives
 * a form: `Closed`, with every Active share link closed in the same transaction (by
 * `FormEntityServer`). The engine decides the status and the server subclass enforces it, so the
 * caller learns the result rather than choosing it. Shape: see `PublishFormServerOperation`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsArchiveFormOperation,
  type FormsFormLifecycleInput,
  type FormsFormLifecycleOutput,
} from '@mj-biz-apps/forms-entities';
import { FormAuthoringEngine } from '../engines/FormAuthoringEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.ArchiveForm')
export class ArchiveFormServerOperation extends FormsArchiveFormOperation {
  protected override async Authorize(_input: FormsFormLifecycleInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsFormLifecycleInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsFormLifecycleOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const result = await FormAuthoringEngine.Instance.Archive(formId, database, user);
    return { FormID: result.formId, Status: result.status };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadArchiveFormOperation(): void {
  // intentionally empty
}
