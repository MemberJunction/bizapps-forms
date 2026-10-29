/**
 * `Forms.ListResponses` — the server body of the CodeGen-emitted `FormsListResponsesOperation`. One
 * page of a form's responses, read as the caller (row-level security decides which come back), with
 * the total across pages; with `IncludeAnswers`, each row's stored answers and the definition the
 * dashboard's export pivots onto (`FormReportingEngine.ListResponses`). Read-only. Shape: see
 * `PublishFormServerOperation`.
 *
 * `Authorize` is the response-reading rule (see `GetResponseSummaryServerOperation`). `MaxRows` above
 * the server's page size is lowered to it, not refused: "as many as you allow" is a fair request.
 */
import { BaseRemotableOperation, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { FormsListResponsesOperation, type FormsListResponsesInput, type FormsListResponsesOutput } from '@mj-biz-apps/forms-entities';
import { FormReportingEngine, RESPONSE_LIST_ORDERS, RESPONSE_STATUSES } from '../engines/FormReportingEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { authorizeResponseReading } from './form-authoring-authorization.js';
import { optionalChoiceInput, optionalTextInput, requireBooleanInput, requireTextInput, requireWholeNumberInput } from './operation-input.js';

@RegisterClass(BaseRemotableOperation, 'Forms.ListResponses')
export class ListResponsesServerOperation extends FormsListResponsesOperation {
  protected override async Authorize(_input: FormsListResponsesInput, user: UserInfo): Promise<boolean> {
    return authorizeResponseReading(this.OperationKey, user);
  }

  protected override async InternalExecute(input: FormsListResponsesInput, provider: IMetadataProvider, user: UserInfo): Promise<FormsListResponsesOutput> {
    const key = this.OperationKey;
    const request = {
      formId: requireTextInput(input?.FormID, 'FormID', key),
      formVersionId: optionalTextInput(input?.FormVersionID, 'FormVersionID', key),
      status: optionalChoiceInput(input?.Status, RESPONSE_STATUSES, 'Status', key),
      startRow: requireWholeNumberInput(input?.StartRow, 'StartRow', 0, key),
      maxRows: requireWholeNumberInput(input?.MaxRows, 'MaxRows', 1, key),
      orderBy: optionalChoiceInput(input?.OrderBy, RESPONSE_LIST_ORDERS, 'OrderBy', key),
      includeAnswers: requireBooleanInput(input?.IncludeAnswers, 'IncludeAnswers', key),
      search: optionalTextInput(input?.Search, 'Search', key),
    };
    const database = requireDatabaseProvider(provider, key);
    return FormReportingEngine.Instance.ListResponses(request, database, user);
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadListResponsesOperation(): void {
  // intentionally empty
}
