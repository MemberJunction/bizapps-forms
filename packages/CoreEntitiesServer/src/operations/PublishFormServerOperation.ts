/**
 * `Forms.PublishForm` — the server body of the CodeGen-emitted `FormsPublishFormOperation`.
 *
 * The shape every Forms operation copies (spec #303 §2): `Authorize` applies the one authoring rule
 * (`authorizeFormAuthoring`); `InternalExecute` validates its input, throwing a `Forms.<Name>: …`
 * message (MJ returns a throw as `ResultCode: 'EXECUTION_ERROR'` with that `ErrorMessage`), calls
 * exactly ONE engine method, and maps the result to the generated output type. No domain logic
 * here: the same call from an Action or an agent goes straight to the engine and gets the same
 * result.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsPublishFormOperation,
  type FormsPublishFormInput,
  type FormsPublishFormOutput,
} from '@mj-biz-apps/forms-entities';
import { FormPublishingEngine } from '../engines/FormPublishingEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeFormAuthoring } from './form-authoring-authorization.js';
import { requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.PublishForm')
export class PublishFormServerOperation extends FormsPublishFormOperation {
  protected override async Authorize(_input: FormsPublishFormInput, user: UserInfo): Promise<boolean> {
    return authorizeFormAuthoring(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsPublishFormInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsPublishFormOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const published = await FormPublishingEngine.Instance.Publish(formId, database, user);
    return {
      FormVersionID: published.formVersionId,
      VersionNumber: published.versionNumber,
      RetiredVersionIDs: published.retiredVersionIds,
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadPublishFormOperation(): void {
  // intentionally empty
}
