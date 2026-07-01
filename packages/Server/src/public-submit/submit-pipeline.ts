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
import { findOwnedResponseById, findSessionResponse } from './response-lookup.service';
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
  /**
   * Transport-level autosave hint from the widget: the FormResponse it believes it is already
   * editing this session. It is a hint ONLY — it is honored strictly after being verified to
   * belong to the CURRENT anonymous session (see the ownership guard in the pipeline); an
   * unverifiable / foreign id is ignored and the session-key lookup takes over. This is what
   * lets one session hijacking another's partial (via a guessed/leaked id) fail closed.
   */
  clientResponseId?: string;
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

  // 5. Dedupe (Task 1) — only on completion. If this session already Completed this form,
  //    short-circuit rather than writing a second row. FAIL-CLOSED: a lookup-query error
  //    rejects the resubmit (never silently creates a duplicate).
  if (complete) {
    const dedupe = await checkDuplicate(ctx, resolved);
    if (dedupe) {
      return dedupe;
    }
  }

  // 6. Quota (distribution cap + optional form cap) — only enforced on completion.
  if (complete) {
    const quotaResult = await checkQuotas(ctx, resolved);
    if (quotaResult) {
      return quotaResult;
    }
  }

  // 7. Server-side re-validation (conditional visibility + required + format).
  const validation = validateSubmission(resolved.definition, submission.answers, !complete);
  if (validation.errors.length > 0) {
    return { success: false, errors: validation.errors };
  }

  // 8. Find this session's in-flight Partial row so a partial autosave UPDATES it in place
  //    (idempotent — no duplicate Partial rows) and a final submit PROMOTES it to Complete
  //    instead of creating a second row (Task 4). A lookup error here is non-fatal: we fall
  //    back to creating a fresh row (the dedupe gate above already guards double-Completes).
  //
  //    SCOPE BOUNDARY (Task 4 / plan §5.2): this is same-session upsert/promotion ONLY.
  //    Cross-session / link-based RESUME is Phase 2 — we key strictly on the current
  //    AnonymousSessionID and never adopt another session's row. We DO return the responseId
  //    so a same-session widget can continue editing its partial.
  const existingPartial = await resolveExistingPartial(ctx, resolved, submission);

  // 9. Persist response + answers (CREATE, UPDATE partial, or PROMOTE partial→complete).
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
      existingResponseId: existingPartial.response?.ID,
    },
    ctx.contextUser,
  );
  if (!persisted.ok) {
    return fail(persisted.message);
  }

  // 10. Fire on-submit hooks (complete only; best-effort, never fails the submit).
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

/**
 * Locate the Partial row this submit should UPDATE/PROMOTE, honoring the widget's client-supplied
 * `responseId` autosave hint ONLY when it is proven to belong to the CURRENT anonymous session.
 *
 * Two-step, ownership-first:
 *   1. If the client sent a `responseId`, adopt it iff `findOwnedResponseById` confirms it matches
 *      on (ID, AnonymousSessionID, FormVersionID) and is still Partial. A foreign/guessed id comes
 *      back empty here and is silently dropped — one session can never hijack another's partial.
 *   2. Otherwise (no hint, or the hint did not resolve to an owned row), fall back to the plain
 *      session-key lookup — the pre-existing same-session behavior.
 *
 * Both lookups fail-open: a query error yields "no owned row", so persistence creates a fresh row
 * rather than ever adopting an unverified one.
 */
async function resolveExistingPartial(
  ctx: PipelineContext,
  resolved: ResolvedDefinition,
  submission: PipelineSubmission,
): Promise<{ response?: { ID: string } }> {
  if (submission.clientResponseId) {
    const owned = await findOwnedResponseById(
      ctx.provider,
      {
        responseId: submission.clientResponseId,
        formVersionId: resolved.version.ID,
        sessionId: ctx.sessionId,
      },
      ctx.contextUser,
    );
    if (owned.ok && owned.response) {
      return { response: owned.response };
    }
    // Hint did not resolve to a row owned by THIS session (foreign id, wrong version, already
    // Complete, or lookup error): ignore it and fall through to the session-key lookup.
  }
  return findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    'Partial',
    ctx.contextUser,
  );
}

/**
 * Detect a duplicate FINAL submission for this (session, published version). Returns a
 * success-shaped "already submitted" result (carrying the existing responseId) when a prior
 * Complete row exists, so the client sees a clean idempotent outcome rather than an error or
 * a second row. Returns a hard failure if the dedupe lookup itself errored (fail-closed).
 */
async function checkDuplicate(ctx: PipelineContext, resolved: ResolvedDefinition): Promise<FormSubmissionResult | undefined> {
  const existing = await findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    'Complete',
    ctx.contextUser,
  );
  if (!existing.ok) {
    // Lookup failed — do NOT risk creating a duplicate. Reject and let the client retry.
    return fail('Could not verify submission status; please retry shortly.');
  }
  if (existing.response) {
    // Idempotent resubmit: surface the ORIGINAL response id + Complete status (and the same
    // confirmation) so the client treats it as a successful (already-recorded) submission,
    // without creating a second row. (No dedicated `duplicate` flag is added to the shared
    // FormSubmissionResult contract — that lives in @mj-biz-apps/forms-entities, outside this
    // change's scope; the existing responseId + Complete status is the client-visible signal.)
    return {
      success: true,
      responseId: existing.response.ID,
      status: 'Complete',
      ...confirmationFields(resolved),
    };
  }
  return undefined;
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
