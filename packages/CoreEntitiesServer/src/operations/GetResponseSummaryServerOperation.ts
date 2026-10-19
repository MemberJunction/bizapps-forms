/**
 * `Forms.GetResponseSummary` — the server body of the CodeGen-emitted
 * `FormsGetResponseSummaryOperation`. Every section of the reporting dashboard for a form, computed
 * on the server as aggregates (`FormReportingEngine.GetResponseSummary`). Read-only. Shape: see
 * `PublishFormServerOperation`.
 *
 * `Authorize` is the response-reading rule — no anonymous or magic-link session, and Read on the form,
 * its versions, its responses and their answers — plus a refusal of any caller whose reads of
 * responses or answers carry a row filter, which the system user would otherwise drop. It matters
 * more here than anywhere: the engine runs the reporting queries as the SYSTEM user. Both refusals
 * are `FORBIDDEN`. The engine applies both again (an in-process caller skips `Authorize`). An API key
 * additionally needs `forms:read`.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsGetResponseSummaryOperation,
  type FormsGetResponseSummaryInput,
  type FormsGetResponseSummaryOutput,
} from '@mj-biz-apps/forms-entities';
import { FormReportingEngine } from '../engines/FormReportingEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeResponseSummary } from './form-authoring-authorization.js';
import { optionalTextInput, requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.GetResponseSummary')
export class GetResponseSummaryServerOperation extends FormsGetResponseSummaryOperation {
  protected override async Authorize(_input: FormsGetResponseSummaryInput, user: UserInfo): Promise<boolean> {
    return authorizeResponseSummary(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsGetResponseSummaryInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsGetResponseSummaryOutput> {
    const formId = requireTextInput(input?.FormID, 'FormID', this.OperationKey);
    const formVersionId = optionalTextInput(input?.FormVersionID, 'FormVersionID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    return FormReportingEngine.Instance.GetResponseSummary({ formId, formVersionId }, database, user);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadGetResponseSummaryOperation(): void {
  // intentionally empty
}
