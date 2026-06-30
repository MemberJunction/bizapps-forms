/**
 * Custom GraphQL resolver for the anonymous public form API (seam S1).
 *
 * These are NET-NEW custom resolvers — NOT the generated CRUD (which requires an
 * authenticated session). They run under the anonymous magic-link `mj_scopes`
 * session (FORMS_BUILD_PLAN §4): `PublishedForm` reads under the read scope, and
 * `SubmitFormResponse` writes under the "Form Respondent" CanCreate-only scope.
 *
 * Discovered automatically by the server because the file matches the
 * `*Resolver.{js,ts}` glob registered in `RESOLVER_PATHS` (see `../index.ts`).
 */
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { AppContext, GetReadOnlyProvider, GetReadWriteProvider, ResolverBase } from '@memberjunction/server';
import type { UserInfo } from '@memberjunction/core';
import type { FieldError, FormSubmissionResult } from '@mj-biz-apps/forms-entities';
import { resolvePublishedDefinition } from './definition-loader.service';
import {
  FieldErrorType,
  FormSubmissionInputType,
  FormSubmissionResultType,
  PublishedFormType,
} from './graphql-types';
import { runSubmitPipeline, type PipelineSubmission } from './submit-pipeline';
import { toAnswerInputs } from './input-mapping';

@Resolver()
export class PublicFormResolver extends ResolverBase {
  /**
   * Load a published form by its public distribution slug. Read-only; runs under
   * the anonymous read scope.
   */
  @Query(() => PublishedFormType, { nullable: true })
  async PublishedForm(
    @Arg('distributionSlug', () => String) distributionSlug: string,
    @Ctx() { providers, userPayload }: AppContext,
  ): Promise<PublishedFormType | null> {
    const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
    const contextUser = this.requireUser(userPayload);

    const loaded = await resolvePublishedDefinition(provider, distributionSlug, contextUser);
    if (!loaded.ok || !loaded.value) {
      return null;
    }
    const { definition } = loaded.value;
    return Object.assign(new PublishedFormType(), {
      formId: definition.formId,
      formVersionId: definition.formVersionId,
      name: definition.name,
      description: definition.description,
      renderMode: definition.renderMode,
      settingsJSON: JSON.stringify(definition.settings),
      styleTokensJSON: JSON.stringify(definition.styleTokens),
      definitionJSON: JSON.stringify(definition),
    });
  }

  /**
   * Submit (or partial-save) a response through the hardening pipeline (Turnstile,
   * rate-limit, quota, dedupe, re-validation, Save, on-submit hooks). Runs under
   * the anonymous CanCreate-on-responses scope.
   */
  @Mutation(() => FormSubmissionResultType)
  async SubmitFormResponse(
    @Arg('input', () => FormSubmissionInputType) input: FormSubmissionInputType,
    @Ctx() { providers, userPayload }: AppContext,
  ): Promise<FormSubmissionResultType> {
    const provider = GetReadWriteProvider(providers);
    const contextUser = this.requireUser(userPayload);

    const submission: PipelineSubmission = {
      distributionSlug: input.distributionSlug,
      formVersionId: input.formVersionId,
      partial: input.partial,
      startedAt: input.startedAt,
      turnstileToken: input.turnstileToken,
      clientMeta: input.clientMeta ? { referrer: input.clientMeta.referrer, userAgent: input.clientMeta.userAgent } : undefined,
      answers: toAnswerInputs(input.answers),
    };

    const result = await runSubmitPipeline(
      { provider, contextUser, sessionId: userPayload.sessionId },
      submission,
    );
    return toResultType(result);
  }

  /** Resolve the anonymous session's UserInfo, throwing only if truly unauthenticated. */
  private requireUser(userPayload: AppContext['userPayload']): UserInfo {
    const user = this.GetUserFromPayload(userPayload);
    if (!user) {
      throw new Error('No active session for the public form request.');
    }
    return user;
  }
}

/** Map the pipeline's contract result to the GraphQL output type. */
function toResultType(result: FormSubmissionResult): FormSubmissionResultType {
  return Object.assign(new FormSubmissionResultType(), {
    success: result.success,
    responseId: result.responseId,
    status: result.status,
    confirmationMessage: result.confirmationMessage,
    redirectUrl: result.redirectUrl,
    errors: result.errors?.map(toFieldErrorType),
  });
}

/** Map one contract FieldError to its GraphQL type. */
function toFieldErrorType(error: FieldError): FieldErrorType {
  return Object.assign(new FieldErrorType(), { questionId: error.questionId, message: error.message });
}
