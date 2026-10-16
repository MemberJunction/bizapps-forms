/**
 * `Forms.SaveResponse` — the server body of the CodeGen-emitted `FormsSaveResponseOperation` (spec
 * #303 §3): every respondent write, partial autosave and final submit alike.
 *
 * `Authorize` binds the caller's magic-link session to the slug's link (`authorizeRespondent`);
 * `InternalExecute` validates the wire input, maps it to the engine's request, calls
 * `FormSubmissionEngine.SaveResponse` once, and maps the result. A refusal the respondent can act on
 * (validation, captcha, quota, a closed link) is `Success: false` with `Errors`, each carrying the
 * `QuestionID` it is about; only a malformed request throws (`EXECUTION_ERROR`).
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
  FormsSaveResponseOperation,
  type FormsAnswerInput,
  type FormsRespondentEnding,
  type FormsSaveResponseInput,
  type FormsSaveResponseOutput,
} from '@mj-biz-apps/forms-entities';
import { FormSubmissionEngine } from '../engines/FormSubmissionEngine.js';
import { requireDatabaseProvider } from '../shared/database-provider.js';
import type { RespondentEnding, RespondentSaveResult, RespondentSaveMode } from '../submission/save-request.js';
import { optionalTextInput, requireTextInput } from './operation-input.js';
import { authorizeRespondent, readProviderOf } from './respondent-authorization.js';
import { answerColumnRefusal, respondentCallerFromRequest, toAnswerInput, toClientMeta } from './respondent-request.js';

const MODES: readonly RespondentSaveMode[] = ['partial', 'final'];

@RegisterClass(BaseRemotableOperation, 'Forms.SaveResponse')
export class SaveResponseServerOperation extends FormsSaveResponseOperation {
  /** The request's provider, for `Authorize` — see `GetRespondentFormServerOperation`. */
  private requestProvider: IMetadataProvider | undefined;

  public override async ExecuteServer(
    input: FormsSaveResponseInput,
    context: RemoteOpServerContext,
  ): Promise<RemoteOpResult<FormsSaveResponseOutput>> {
    this.requestProvider = context.provider;
    return super.ExecuteServer(input, context);
  }

  protected override async Authorize(input: FormsSaveResponseInput, user: UserInfo): Promise<boolean> {
    return authorizeRespondent(this.OperationKey, input?.Slug, user, readProviderOf(this.requestProvider));
  }

  protected override async InternalExecute(
    input: FormsSaveResponseInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<FormsSaveResponseOutput> {
    const key = this.OperationKey;
    const slug = requireTextInput(input?.Slug, 'Slug', key);
    const formVersionId = requireTextInput(input?.FormVersionID, 'FormVersionID', key);
    const clientResponseId = requireTextInput(input?.ClientResponseID, 'ClientResponseID', key);
    const mode = MODES.find((candidate) => candidate === input?.Mode);
    if (!mode) {
      throw new Error(`${key}: Mode must be one of ${MODES.join(', ')}.`);
    }
    const answers = requireAnswers(input?.Answers, key);
    const database = requireDatabaseProvider(provider, key);
    const result = await FormSubmissionEngine.Instance.SaveResponse(
      {
        distributionSlug: slug,
        formVersionId,
        mode,
        clientResponseId,
        startedAt: optionalTextInput(input.StartedAt, 'StartedAt', key),
        turnstileToken: optionalTextInput(input.TurnstileToken, 'TurnstileToken', key),
        clientMeta: toClientMeta(input.ClientMeta),
        answers: answers.map(toAnswerInput),
        caller: respondentCallerFromRequest(),
      },
      database,
      user,
    );
    return toOutput(result);
  }
}

/**
 * The answers array, each with a question id and every column of the type it stores — or a throw
 * naming what is wrong (and, for a mistyped column, which question).
 */
function requireAnswers(value: unknown, operationKey: string): FormsAnswerInput[] {
  if (!Array.isArray(value)) {
    throw new Error(`${operationKey}: Answers must be an array.`);
  }
  for (const answer of value as unknown[]) {
    if (!answer || typeof answer !== 'object' || typeof (answer as FormsAnswerInput).QuestionID !== 'string') {
      throw new Error(`${operationKey}: every answer needs a QuestionID.`);
    }
    const refusal = answerColumnRefusal(answer as FormsAnswerInput);
    if (refusal) {
      throw new Error(`${operationKey}: the answer to question ${(answer as FormsAnswerInput).QuestionID} is malformed: ${refusal}.`);
    }
  }
  return value as FormsAnswerInput[];
}

/** The engine's result in the generated output shape. */
function toOutput(result: RespondentSaveResult): FormsSaveResponseOutput {
  const output: FormsSaveResponseOutput = {
    Success: result.success,
    ResponseID: result.responseId ?? null,
    Status: result.status ?? null,
    Outcome: result.outcome,
    Errors: result.errors.map((error) => ({ QuestionID: error.questionId ?? null, Message: error.message })),
  };
  if (result.ending) {
    output.Ending = toEnding(result.ending);
  }
  if (result.confirmationMessage !== undefined) {
    output.ConfirmationMessage = result.confirmationMessage;
  }
  if (result.redirectUrl !== undefined) {
    output.RedirectURL = result.redirectUrl;
  }
  return output;
}

function toEnding(ending: RespondentEnding): FormsRespondentEnding {
  return {
    ID: ending.id,
    Title: ending.title,
    Body: ending.body ?? null,
    ButtonLabel: ending.buttonLabel ?? null,
    MediaURL: ending.mediaURL ?? null,
    RedirectURL: ending.redirectURL ?? null,
    SocialLinks: ending.socialLinks.map((link) => ({ Platform: link.platform, URL: link.url })),
    IsDisqualification: ending.isDisqualification,
  };
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadSaveResponseOperation(): void {
  // intentionally empty
}
