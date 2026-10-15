/**
 * `Forms.GetRespondentForm` — the server body of the CodeGen-emitted `FormsGetRespondentFormOperation`
 * (spec #303 §3, §6): what an anonymous respondent loads to render a form.
 *
 * `Authorize` binds the caller's magic-link session to the slug's link (`authorizeRespondent`);
 * `InternalExecute` validates the slug, calls `FormSubmissionEngine.GetRespondentForm` once, and
 * serialises its result. `DefinitionJSON` is the contracts' ALLOWLIST projection — no scoring, no
 * ending screens, no score or knockout conditions, no automations, quota or redirect (#302).
 *
 * Every refusal and every failure reaches the caller as ONE fixed sentence (the engine's
 * `RespondentFormUnavailableError`); the reason is in the log.
 */
import {
  BaseRemotableOperation,
  type IMetadataProvider,
  type RemoteOpResult,
  type RemoteOpServerContext,
  type UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
  FormsGetRespondentFormOperation,
  type FormsGetRespondentFormInput,
  type FormsGetRespondentFormOutput,
} from '@mj-biz-apps/forms-entities';
import { FormSubmissionEngine } from '../engines/FormSubmissionEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import { requireTextInput } from './operation-input.js';
import { authorizeRespondent, readProviderOf } from './respondent-authorization.js';
import { respondentCallerFromRequest } from './respondent-request.js';

@RegisterClass(BaseRemotableOperation, 'Forms.GetRespondentForm')
export class GetRespondentFormServerOperation extends FormsGetRespondentFormOperation {
  /**
   * The request's provider, for `Authorize`, which MJ hands none. MJ creates one operation instance
   * per invocation (`DispatchRemoteOperationInProcess`), and `ExecuteServer` calls `Authorize`
   * before its first `await`, so the value `Authorize` reads is the one set by its own invocation.
   */
  private requestProvider: IMetadataProvider | undefined;

  public override async ExecuteServer(
    input: FormsGetRespondentFormInput,
    context: RemoteOpServerContext,
  ): Promise<RemoteOpResult<FormsGetRespondentFormOutput>> {
    this.requestProvider = context.provider;
    return super.ExecuteServer(input, context);
  }

  protected override async Authorize(input: FormsGetRespondentFormInput, user: UserInfo): Promise<boolean> {
    return authorizeRespondent(this.OperationKey, input?.Slug, user, readProviderOf(this.requestProvider));
  }

  protected override async InternalExecute(
    input: FormsGetRespondentFormInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsGetRespondentFormOutput> {
    const slug = requireTextInput(input?.Slug, 'Slug', this.OperationKey);
    const database = requireDatabaseProvider(provider, this.OperationKey);
    const view = await FormSubmissionEngine.Instance.GetRespondentForm(slug, respondentCallerFromRequest(), database, user);
    return {
      FormVersionID: view.formVersionId,
      DefinitionJSON: JSON.stringify(view.definition),
      ResumeJSON: view.resume ? JSON.stringify(view.resume) : null,
      CaptchaRequired: view.captchaRequired,
    };
  }
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadGetRespondentFormOperation(): void {
  // intentionally empty
}
