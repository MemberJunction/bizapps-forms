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
import { LogError, LogStatus } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

import { getPublicSubmitConfig } from './config';
import { createStageTimer, formatTimings } from './stage-timer';
import {
  endingMessage,
  endingRedirectUrl,
  resolveEndingScreen,
  type AnswerValue,
  type FormAnswerInput,
  type FormSubmissionResult,
  type FieldError,
} from '@mj-biz-apps/forms-entities';
import { resolvePublishedDefinition, type ResolvedDefinition } from './definition-loader.service';
import { fireOnSubmitHooks, type HookFireResult } from './on-submit-hooks.service';
import { persistSubmission } from './persistence.service';
import { distributionQuotaExceeded, formQuotaExceeded } from './quota.service';
import { FormsRateLimiter, rateLimitedMessage } from './rate-limit.service';
import {
  findAdoptableResponseById,
  findOwnedResponseById,
  findResponseById,
  findSessionResponse,
} from './response-lookup.service';
import { checkRespondentScope } from './scope-check.service';
import { buildSourceMetadata, rateLimitKey } from './source-metadata.service';
import { captchaRequired, verifyTurnstile } from './turnstile.service';
import { validateSubmission } from './validation.service';
import {
  evaluateProvenance,
  loadUploadLedger,
  provenanceIsStrict,
  type UploadLedgerRow,
} from '../upload/upload-provenance.service';
import { loadFormResponseContext } from '@mj-biz-apps/forms-actions';
import { planAutomations } from './automation-plan';
import { runAutomations } from '../automation/automation-runner';
import { dispatchAutomation } from '../automation/dispatch-automation';
import { buildConditionAnswers } from '../automation/condition-answers';
import { allowedBindingEntities } from '../automation/allowed-entities';
import { resolveAutomationPrincipal } from '../automation/service-principal';

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
   * The widget's stable, client-generated response id (v4 UUID), sent on every autosave AND the
   * final submit. It is the PRIMARY idempotency key: on first save it becomes the FormResponse
   * primary key, and every repeat upserts THAT row — so autosave + submit collapse to ONE row
   * even when the anonymous session id is blank (the routine public-submit case).
   *
   * Adopting an EXISTING row is guarded so a guessed/leaked id can never hijack another's partial:
   * with a session, the row must be owned by it (`findOwnedResponseById`); with no session, the
   * row must carry the same id in its SourceMetadata proof (`findAdoptableResponseById`).
   */
  clientResponseId?: string;
}

/** Everything the pipeline needs from the request context. */
export interface PipelineContext {
  provider: DatabaseProviderBase;
  /**
   * The anonymous magic-link principal. Used ONLY as the authorization GATE
   * (`checkRespondentScope`) and for reading the (anon-readable) published definition — it has
   * CanCreate-on-responses and cannot READ Form Responses.
   */
  contextUser: UserInfo;
  /**
   * Elevated service principal (MJ system user) that performs the Form Response reads AND writes:
   * dedupe/adoption lookups, quota counts, and the response/answer persistence. The anonymous
   * respondent scope can't read responses (no privilege accretion), so those operations run here
   * AFTER the anon scope check has authorized the request. See ON_SUBMIT_AUTOMATION_SPEC §7.
   */
  elevatedUser: UserInfo;
  /** Anonymous magic-link session id (mj_sid) from the UserPayload. */
  sessionId: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Injectable hook firing for tests; defaults to the real ActionEngine path. Hooks run under
   * the system user (resolved inside {@link fireOnSubmitHooks}), NOT the anonymous respondent,
   * so no context user is threaded here.
   */
  fireHooks?: (
    ctx: { responseId: string; formId: string; formVersionId: string; distributionId: string },
  ) => Promise<HookFireResult[]>;
}

/** Convenience for a single-error failure result. */
function fail(message: string, errors?: FieldError[]): FormSubmissionResult {
  return { success: false, status: undefined, errors: errors ?? [{ message }] };
}

/**
 * Explicit required-field validation of the incoming submission shape. Returns a clean failure
 * RESULT (never throws) when a required transport field is missing/malformed, so the widget
 * always gets a rendered error rather than a blank screen. This is the loud-failure backstop for
 * contract drift between the widget mapping, the GraphQL DTO, and this pipeline.
 */
export function validateSubmissionShape(submission: PipelineSubmission): FormSubmissionResult | undefined {
  if (!submission || typeof submission !== 'object') {
    return fail('Malformed submission.');
  }
  if (!isNonEmptyString(submission.distributionSlug)) {
    return fail('Missing form link (distributionSlug).');
  }
  if (!isNonEmptyString(submission.formVersionId)) {
    return fail('Missing form version (formVersionId).');
  }
  if (!Array.isArray(submission.answers)) {
    return fail('Missing answers.');
  }
  for (const answer of submission.answers) {
    if (!answer || !isNonEmptyString(answer.questionId)) {
      return fail('An answer is missing its question id.');
    }
  }
  return undefined;
}

/** True for a present, non-blank string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The post-submit confirmation/redirect for this response.
 *
 * `answers` is optional because the two IDEMPOTENT-RESUBMIT paths reach here without them: they
 * short-circuit on finding an already-Complete row, and re-deriving that row's answers would
 * cost a round trip to tell a client something it has already been told. Without answers there
 * is no conditional ending to resolve, so those paths get the default ending or the form-wide
 * settings — the same thing the respondent saw the first time unless a conditional ending was
 * configured, and in that case the redirect they already followed is the one that mattered.
 */
function confirmationFields(
  resolved: ResolvedDefinition,
  answers?: ReadonlyMap<string, AnswerValue>,
): Pick<FormSubmissionResult, 'confirmationMessage' | 'redirectUrl'> {
  const { settings, endScreens } = resolved.definition;
  const ending = resolveEndingScreen(endScreens ?? [], answers ?? new Map());
  const redirectUrl = endingRedirectUrl(ending, settings);
  return {
    // A redirect and a confirmation message are alternatives, not companions: sending both lets
    // a client that ignores the redirect show a message meant for a page nobody lands on.
    confirmationMessage: redirectUrl ? undefined : endingMessage(ending, settings),
    redirectUrl,
  };
}

/** Run the full pipeline and produce the client-facing result. */
export async function runSubmitPipeline(
  ctx: PipelineContext,
  submission: PipelineSubmission,
): Promise<FormSubmissionResult> {
  // Timed end to end. "The submit is slow" is a report nobody can act on across eleven
  // stages, and the intuitive culprit (persistence) is often not the one — a captcha round
  // trip or a dedupe query can each outweigh the write. `report` is called on EVERY exit,
  // including refusals, because a slow rejection is still a slow request.
  const timer = createStageTimer();
  const report = <T>(result: T): T => {
    LogStatus(`[Forms] submit ${formatTimings(timer.finish())}`);
    return result;
  };

  // 0. Shape guard: the required transport fields must be present and well-formed. A drift or a
  //    malformed client payload fails LOUDLY here with a clear result — never a throw that would
  //    yield a blank screen, and never a silent partial write.
  const shape = validateSubmissionShape(submission);
  if (shape) {
    return report(shape);
  }
  timer.mark('shape');

  // 1. Anonymous scope: CanCreate on responses only (no privilege accretion).
  const scope = checkRespondentScope(ctx.provider, ctx.contextUser);
  if (!scope.allowed) {
    return report(fail(scope.reason ?? 'Not authorized.'));
  }

  timer.mark('scope');

  // 2. Resolve slug -> distribution -> published version -> definition.
  const loaded = await resolvePublishedDefinition(ctx.provider, submission.distributionSlug, ctx.contextUser, {
    expectedVersionId: submission.formVersionId,
  });
  if (!loaded.ok || !loaded.value) {
    return report(fail(`Form unavailable (${loaded.failure}).`));
  }
  const resolved = loaded.value;
  const complete = submission.partial !== true;

  timer.mark('resolve-form');

  // 3. Turnstile (per form/distribution toggle).
  const needCaptcha = captchaRequired(resolved.definition.settings.captchaRequired, resolved.distribution.CaptchaRequired);
  const turnstile = await verifyTurnstile(needCaptcha, submission.turnstileToken, ctx.fetchImpl);
  if (!turnstile.success) {
    return report(fail(`Captcha verification failed (${turnstile.errorCode}).`));
  }

  timer.mark('captcha');

  // 4. Rate-limit (per session + distribution).
  const limit = FormsRateLimiter.Instance.check(
    rateLimitKey({ sessionId: ctx.sessionId, distributionId: resolved.distribution.ID }),
  );
  if (!limit.allowed) {
    return report(fail(rateLimitedMessage(limit.retryAfterMs)));
  }

  timer.mark('rate-limit');

  // 5. Dedupe (Task 1) — only on completion. If this session (or this client response id)
  //    already Completed this form, short-circuit rather than writing a second row.
  //    FAIL-CLOSED: a lookup-query error rejects the resubmit (never silently duplicates).
  if (complete) {
    const dedupe = await checkDuplicate(ctx, resolved, submission);
    if (dedupe) {
      return report(dedupe);
    }
  }

  timer.mark('dedupe');

  // 6. Quota (distribution cap + optional form cap) — only enforced on completion.
  if (complete) {
    const quotaResult = await checkQuotas(ctx, resolved);
    if (quotaResult) {
      return report(quotaResult);
    }
  }

  timer.mark('quota');

  // 7. Server-side re-validation (conditional visibility + required + format).
  const validation = validateSubmission(resolved.definition, submission.answers, !complete);
  if (validation.errors.length > 0) {
    return report({ success: false, errors: validation.errors });
  }

  // 7b. Every file answer must be one this respondent actually uploaded. `__mj.File` has no owner
  //     column, so the foreign key proves only that the file exists — without this a submission
  //     can name any file in the instance and it becomes their answer. Checked before persistence,
  //     so a foreign id never reaches the database, and on partial saves too, so it is caught at
  //     first sight rather than at promotion.
  const provenance = await checkFileProvenance(ctx, resolved, submission);
  if (provenance.errors.length > 0) {
    return report({ success: false, errors: provenance.errors });
  }

  timer.mark('validate');

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

  timer.mark('find-partial');

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
        clientResponseId: submission.clientResponseId,
      }),
      answers: validation.answers,
      existingResponseId: existingPartial.response?.ID,
      clientResponseId: submission.clientResponseId,
    },
    ctx.elevatedUser,
  );
  if (!persisted.ok) {
    return report(fail(persisted.message));
  }

  timer.mark('persist');

  // 10. Fire on-submit hooks (complete only; best-effort, never fails the submit). Skipped when
  //     persistence reports a `deduped` no-op — a concurrent request already Completed this row
  //     and fired its hooks, so re-firing here would double-run on-submit automations.
  if (complete && !persisted.deduped) {
    // DETACHED, deliberately. The response row and its answers are already written by the
    // time we get here, and nothing the respondent is shown comes from a hook — the
    // confirmation is built from the definition. Awaiting the automation chain made every
    // respondent wait for work that is not theirs: measured on a real form, hooks were
    // 8070ms of an 8348ms submit, with persistence at 239ms. That is not a slow database,
    // it is a respondent paying for someone else's integration.
    //
    // The trade is real and worth naming: a hook now runs AFTER the response is sent, so a
    // process killed in that window loses it. That was already true of any hook that failed
    // — the catch has always swallowed them as best-effort — so the change is to when they
    // run, not to whether they are guaranteed. Anything needing an at-least-once guarantee
    // wants a queue, not an awaited call inside a request.
    const hooks = fireHooksSafely(ctx, resolved, persisted.responseId);
    if (getPublicSubmitConfig().hooksBlocking) {
      await hooks;
    } else {
      void hooks.then(
        () => LogStatus(`[Forms] hooks finished for response ${persisted.responseId}`),
        // fireHooksSafely already catches; this is the belt to its braces, because an
        // unhandled rejection on a detached promise takes the API process down with it.
        (err: unknown) => LogError(`[Forms] detached hooks threw for ${persisted.responseId}: ${String(err)}`),
      );
    }
  }

  timer.mark('hooks');

  return report({
    success: true,
    responseId: persisted.responseId,
    status: persisted.status,
    ...confirmationFields(resolved, validation.answerMap),
  });
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
    // 1a. Session present: adopt the client id only if the row is owned by THIS session.
    const owned = await findOwnedResponseById(
      ctx.provider,
      {
        responseId: submission.clientResponseId,
        formVersionId: resolved.version.ID,
        sessionId: ctx.sessionId,
      },
      ctx.elevatedUser,
    );
    if (owned.ok && owned.response) {
      return { response: owned.response };
    }
    // 1b. No usable session (the routine public-submit case — sessionId is blank): adopt the
    //     row keyed by the client id itself, gated on the SourceMetadata client-id proof so a
    //     guessed PK can never be adopted. THIS is what makes autosave upsert work with a blank
    //     session (the original duplicate-row bug).
    if (!ctx.sessionId) {
      const adoptable = await findAdoptableResponseById(
        ctx.provider,
        { responseId: submission.clientResponseId, formVersionId: resolved.version.ID },
        ctx.elevatedUser,
      );
      if (adoptable.ok && adoptable.response) {
        return { response: adoptable.response };
      }
    }
    // Hint did not resolve to an adoptable row (foreign id, wrong version, already Complete, or
    // lookup error): ignore it and fall through to the session-key lookup.
  }
  return findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    'Partial',
    ctx.elevatedUser,
  );
}

/**
 * Detect a duplicate FINAL submission for this (session, published version). Returns a
 * success-shaped "already submitted" result (carrying the existing responseId) when a prior
 * Complete row exists, so the client sees a clean idempotent outcome rather than an error or
 * a second row. Returns a hard failure if the dedupe lookup itself errored (fail-closed).
 */
async function checkDuplicate(
  ctx: PipelineContext,
  resolved: ResolvedDefinition,
  submission: PipelineSubmission,
): Promise<FormSubmissionResult | undefined> {
  // First, an idempotent repeat of THIS client's final submit: the same client response id
  // already promoted to Complete. Keyed on the id (+ SourceMetadata proof), so it works even
  // with a blank session — a re-fired submit returns the original id instead of duplicating.
  if (submission.clientResponseId) {
    const byId = await findResponseById(
      ctx.provider,
      { responseId: submission.clientResponseId, formVersionId: resolved.version.ID },
      ctx.elevatedUser,
    );
    if (!byId.ok) {
      return fail('Could not verify submission status; please retry shortly.');
    }
    if (byId.response && byId.response.Status === 'Complete') {
      return {
        success: true,
        responseId: byId.response.ID,
        status: 'Complete',
        ...confirmationFields(resolved),
      };
    }
  }

  const existing = await findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    'Complete',
    ctx.elevatedUser,
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
    ctx.elevatedUser,
  );
  if (formCapped) {
    return fail('This form is no longer accepting responses (quota reached).');
  }
  return undefined;
}

/** Invoke the (injectable) hook firer; swallow any error so the submit still succeeds. */
async function fireHooksSafely(ctx: PipelineContext, resolved: ResolvedDefinition, responseId: string): Promise<void> {
  // A form that configures its own automations runs those; one that does not keeps the legacy
  // hard-coded hook list. That fallback is what makes this switch safe to land before any form has
  // been re-published: every existing snapshot carries an empty `automations` array, so every
  // existing form takes the legacy path and behaves exactly as it did. The constant list can only
  // be deleted once a back-fill has given every form equivalent automations AND a parity test has
  // shown the two produce the same effects.
  if (resolved.definition.automations.length > 0 && !ctx.fireHooks) {
    await runConfiguredAutomations(resolved, responseId);
    return;
  }

  // Default firer runs under the system user internally; the anonymous ctx.contextUser is
  // intentionally NOT passed (on-submit automations are privileged — see fireOnSubmitHooks).
  const fire = ctx.fireHooks ?? ((hookCtx) => fireOnSubmitHooks(hookCtx));
  try {
    await fire({
      responseId,
      formId: resolved.definition.formId,
      formVersionId: resolved.version.ID,
      distributionId: resolved.distribution.ID,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[forms] on-submit hooks failed for response ${responseId}: ${message}`);
  }
}

/**
 * Reject (strict) or strip (lenient) any file answer whose upload cannot be vouched for.
 *
 * Runs under the elevated principal because the ledger is deliberately unreadable by the anonymous
 * respondent — a session that could read it could enumerate other people's uploads, and one that
 * could write it could forge the very evidence being checked.
 *
 * A failed LOOKUP fails the submission rather than waving the file through. That is the
 * uncomfortable direction on purpose: the alternative is that a database blip turns into silently
 * accepting unverified files, which is precisely the state this check exists to end.
 */
async function checkFileProvenance(
  ctx: PipelineContext,
  resolved: ResolvedDefinition,
  submission: PipelineSubmission,
): Promise<{ errors: FieldError[] }> {
  const fileAnswers = submission.answers.filter((a) => Boolean(a.fileId));
  if (fileAnswers.length === 0) {
    return { errors: [] };
  }

  const strict = provenanceIsStrict();
  let ledger: Map<string, UploadLedgerRow>;
  try {
    ledger = await loadUploadLedger(
      fileAnswers.map((a) => a.fileId as string),
      ctx.elevatedUser,
    );
  } catch (error) {
    console.warn(`[forms] upload provenance lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      errors: [{ message: 'Your uploaded file could not be verified. Please try again.' }],
    };
  }

  const errors: FieldError[] = [];
  for (const answer of fileAnswers) {
    const verdict = evaluateProvenance(ledger.get((answer.fileId as string).trim().toLowerCase()), {
      fileId: answer.fileId as string,
      distributionId: resolved.distribution.ID,
      clientResponseId: submission.clientResponseId,
      sessionId: ctx.sessionId,
    }, strict);
    if (verdict.ok) {
      continue;
    }
    if (strict) {
      errors.push({ questionId: answer.questionId, message: 'That file could not be verified as your upload.' });
    } else {
      // Lenient: drop the file rather than persist an unverified one. The rest of the answer still
      // saves, and a required file question then fails validation on its own terms.
      delete (answer as { fileId?: string }).fileId;
      console.warn(`[forms] stripped unverified file answer (${verdict.failure}) on question ${answer.questionId}`);
    }
  }
  return { errors };
}

/**
 * Run the automations a form actually configured.
 *
 * Refuses to run anything when the service principal cannot be resolved, rather than falling back
 * to a broader identity. A deployment that has not provisioned the principal gets no automations
 * and a clear log line; quietly running privileged work as the system user instead would restore
 * exactly the broad grants the dedicated principal exists to avoid, at the moment nobody is
 * looking. Wrapped whole, because a submission that is already saved must never fail here.
 */
async function runConfiguredAutomations(resolved: ResolvedDefinition, responseId: string): Promise<void> {
  try {
    const principal = resolveAutomationPrincipal();
    if (!principal) {
      return;
    }
    const context = await loadFormResponseContext(responseId, principal);
    if (!context) {
      console.warn(`[forms] automations skipped: response ${responseId} could not be read back.`);
      return;
    }

    const answers = buildConditionAnswers(resolved.definition, context.canonicalAnswers);
    const plan = planAutomations(resolved.definition.automations, { complete: true, answers });

    await runAutomations({
      plan,
      dispatch: (automation) =>
        dispatchAutomation(automation, {
          responseId,
          formId: resolved.definition.formId,
          formVersionId: resolved.version.ID,
          distributionId: resolved.distribution.ID,
          answers: context.canonicalAnswers,
          principal,
          allowedEntities: allowedBindingEntities(),
        }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[forms] automations failed for response ${responseId}: ${message}`);
  }
}