/**
 * The public-submit hardening pipeline (FORMS_BUILD_PLAN §4 / S1), composed from
 * the small single-purpose services. Pure orchestration — it takes an already-
 * resolved per-request `provider` + anonymous `contextUser` + session id, so it is
 * fully unit-testable without a GraphQL server.
 *
 * Order (fail-closed at each gate):
 *   scope check -> resolve definition -> Turnstile -> rate-limit -> quota
 *   -> server re-validation -> Save response+answers -> fire on-submit hooks.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type {
  FormAnswerInput,
  FormSubmissionResult,
  FieldError,
} from '@mj-biz-apps/forms-entities';
import { resolvePublishedDefinition, type ResolvedDefinition } from './definition-loader.service';
import { fireOnSubmitHooks, type HookFireResult } from './on-submit-hooks.service';
import { persistSubmission } from './persistence.service';
import { distributionQuotaExceeded, formQuotaExceeded } from './quota.service';
import { FormsRateLimiter } from './rate-limit.service';
import { checkRespondentScope } from './scope-check.service';
import { buildSourceMetadata, rateLimitKey } from './source-metadata.service';
import { captchaRequired, verifyTurnstile } from './turnstile.service';
import { validateSubmission } from './validation.service';

/** Normalized submission input the pipeline consumes (resolver maps GraphQL -> this). */
export interface PipelineSubmission {
  distributionSlug: string;
  formVersionId: string;
  partial?: boolean;
  startedAt?: string;
  turnstileToken?: string;
  clientMeta?: { referrer?: string; userAgent?: string };
  answers: FormAnswerInput[];
}

/** Everything the pipeline needs from the request context. */
export interface PipelineContext {
  provider: DatabaseProviderBase;
  contextUser: UserInfo;
  /** Anonymous magic-link session id (mj_sid) from the UserPayload. */
  sessionId: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable hook firing for tests; defaults to the real ActionEngine path. */
  fireHooks?: (
    ctx: { responseId: string; formId: string; formVersionId: string; distributionId: string },
    contextUser: UserInfo,
  ) => Promise<HookFireResult[]>;
}

/** Convenience for a single-error failure result. */
function fail(message: string, errors?: FieldError[]): FormSubmissionResult {
  return { success: false, status: undefined, errors: errors ?? [{ message }] };
}

/** The post-submit confirmation/redirect lifted from the form settings. */
function confirmationFields(resolved: ResolvedDefinition): Pick<FormSubmissionResult, 'confirmationMessage' | 'redirectUrl'> {
  const { settings } = resolved.definition;
  return {
    confirmationMessage: settings.redirectUrl ? undefined : settings.confirmationMessage,
    redirectUrl: settings.redirectUrl,
  };
}

/** Run the full pipeline and produce the client-facing result. */
export async function runSubmitPipeline(
  ctx: PipelineContext,
  submission: PipelineSubmission,
): Promise<FormSubmissionResult> {
  // 1. Anonymous scope: CanCreate on responses only (no privilege accretion).
  const scope = checkRespondentScope(ctx.provider, ctx.contextUser);
  if (!scope.allowed) {
    return fail(scope.reason ?? 'Not authorized.');
  }

  // 2. Resolve slug -> distribution -> published version -> definition.
  const loaded = await resolvePublishedDefinition(ctx.provider, submission.distributionSlug, ctx.contextUser, {
    expectedVersionId: submission.formVersionId,
  });
  if (!loaded.ok || !loaded.value) {
    return fail(`Form unavailable (${loaded.failure}).`);
  }
  const resolved = loaded.value;
  const complete = submission.partial !== true;

  // 3. Turnstile (per form/distribution toggle).
  const needCaptcha = captchaRequired(resolved.definition.settings.captchaRequired, resolved.distribution.CaptchaRequired);
  const turnstile = await verifyTurnstile(needCaptcha, submission.turnstileToken, ctx.fetchImpl);
  if (!turnstile.success) {
    return fail(`Captcha verification failed (${turnstile.errorCode}).`);
  }

  // 4. Rate-limit (per session + distribution).
  const limit = FormsRateLimiter.Instance.check(
    rateLimitKey({ sessionId: ctx.sessionId, distributionId: resolved.distribution.ID }),
  );
  if (!limit.allowed) {
    return fail('Too many submissions; please retry shortly.');
  }

  // 5. Quota (distribution cap + optional form cap) — only enforced on completion.
  if (complete) {
    const quotaResult = await checkQuotas(ctx, resolved);
    if (quotaResult) {
      return quotaResult;
    }
  }

  // 6. Server-side re-validation (conditional visibility + required + format).
  const validation = validateSubmission(resolved.definition, submission.answers, !complete);
  if (validation.errors.length > 0) {
    return { success: false, errors: validation.errors };
  }

  // 7. Persist response + answers.
  const persisted = await persistSubmission(
    ctx.provider,
    {
      formId: resolved.definition.formId,
      formVersionId: resolved.version.ID,
      distributionId: resolved.distribution.ID,
      complete,
      startedAt: submission.startedAt,
      sessionId: ctx.sessionId,
      sourceMetadata: buildSourceMetadata({
        sessionId: ctx.sessionId,
        distributionId: resolved.distribution.ID,
        clientMeta: submission.clientMeta,
      }),
      answers: validation.answers,
    },
    ctx.contextUser,
  );
  if (!persisted.ok) {
    return fail(persisted.message);
  }

  // 8. Fire on-submit hooks (complete only; best-effort, never fails the submit).
  if (complete) {
    await fireHooksSafely(ctx, resolved, persisted.responseId);
  }

  return {
    success: true,
    responseId: persisted.responseId,
    status: persisted.status,
    ...confirmationFields(resolved),
  };
}

/** Run both quota checks; returns a failure result if either is exceeded, else undefined. */
async function checkQuotas(ctx: PipelineContext, resolved: ResolvedDefinition): Promise<FormSubmissionResult | undefined> {
  if (distributionQuotaExceeded(resolved.distribution)) {
    return fail('This form is no longer accepting responses (quota reached).');
  }
  const formCapped = await formQuotaExceeded(
    ctx.provider,
    resolved.definition.formId,
    resolved.definition.settings,
    ctx.contextUser,
  );
  if (formCapped) {
    return fail('This form is no longer accepting responses (quota reached).');
  }
  return undefined;
}

/** Invoke the (injectable) hook firer; swallow any error so the submit still succeeds. */
async function fireHooksSafely(ctx: PipelineContext, resolved: ResolvedDefinition, responseId: string): Promise<void> {
  const fire = ctx.fireHooks ?? fireOnSubmitHooks;
  try {
    await fire(
      {
        responseId,
        formId: resolved.definition.formId,
        formVersionId: resolved.version.ID,
        distributionId: resolved.distribution.ID,
      },
      ctx.contextUser,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[forms] on-submit hooks failed for response ${responseId}: ${message}`);
  }
}
