/**
 * `Forms.GetResponseDetail` — the server body of the CodeGen-emitted
 * `FormsGetResponseDetailOperation`. One response, read as the caller, with its stored answers, the
 * files behind them, the automation runs it triggered (each with the outbox event that ran it)
 * and the records those wrote, plus the definition that labels the answers
 * (`FormReportingEngine.GetResponseDetail`). Read-only. Shape: see `PublishFormServerOperation`.
 *
 * `Authorize` is the response-reading rule (see `GetResponseSummaryServerOperation`): a respondent's
 * magic-link session is refused even for the response it submitted — its own answers come back
 * through `Forms.GetRespondentForm`'s resume path, never through this.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsGetResponseDetailOperation,
  type FormsGetResponseDetailInput,
  type FormsGetResponseDetailOutput,
} from '@mj-biz-apps/forms-entities';
import { FormReportingEngine } from '../engines/FormReportingEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeResponseReading } from './form-authoring-authorization.js';
import { optionalTextInput, requireTextInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.GetResponseDetail')
export class GetResponseDetailServerOperation extends FormsGetResponseDetailOperation {
  protected override async Authorize(_input: FormsGetResponseDetailInput, user: UserInfo): Promise<boolean> {
    return authorizeResponseReading(this.OperationKey, user);
  }

  protected override async InternalExecute(
    input: FormsGetResponseDetailInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsGetResponseDetailOutput> {
    const responseId = requireTextInput(input?.ResponseID, 'ResponseID', this.OperationKey);
    const labelFormVersionId = optionalTextInput(input?.LabelFormVersionID, 'LabelFormVersionID', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    return FormReportingEngine.Instance.GetResponseDetail({ responseId, labelFormVersionId }, database, user);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadGetResponseDetailOperation(): void {
  // intentionally empty
}
