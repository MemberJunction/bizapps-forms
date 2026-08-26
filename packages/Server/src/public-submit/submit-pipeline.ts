/**
 * The public-submit hardening pipeline (FORMS_BUILD_PLAN §4 / S1), composed from
 * the small single-purpose services. Pure orchestration — it takes an already-
 * resolved per-request `provider` + anonymous `contextUser` + session id, so it is
 * fully unit-testable without a GraphQL server.
 *
 * Order (fail-closed at each gate):
 *   scope check -> resolve definition (+ resolve the knockout) -> rate-limit -> Turnstile
 *   -> dedupe -> quota -> server re-validation -> file provenance -> Save response+answers
 *   -> fire on-submit hooks.
 *
 * The knockout is resolved before every gate because it is pure and because three of them — the
 * completion rate ceiling, dedupe and the quota — police COMPLETIONS, which a knockout is not.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

import { getPublicSubmitConfig } from './config';
import { createStageTimer, formatTimings } from './stage-timer';
import {
  endingMessage,
  endingRedirectUrl,
  hasUnreachableAutomations,
  computeScore,
  resolveDisqualification,
  resolveEndingScreen,
  resolveVisibleQuestions,
  resolveOnSubmitDispatch,
  type AnswerValue,
  type FormAnswerInput,
  type FormSubmissionResult,
  type FieldError,
  type PublishedFormScreen,
} from '@mj-biz-apps/forms-entities';
import { resolvePublishedDefinition, type ResolvedDefinition } from './definition-loader.service';
import { fireOnSubmitHooks, type HookFireResult } from './on-submit-hooks.service';
import { persistSubmission } from './persistence.service';
import { distributionQuotaExceeded, formQuotaExceeded } from './quota.service';
import { FormsRateLimiter, rateLimitedMessage, type RateLimitGate } from './rate-limit.service';
import {
  countPartialResponses,
  findAdoptableResponseById,
  findOwnedResponseById,
  findResponseById,
  findSessionResponse,
} from './response-lookup.service';
import { InFlightLimiter } from '../http/in-flight-limiter';
import { checkRespondentScope } from './scope-check.service';
import { TERMINAL_RESPONSE_STATUSES, isTerminalResponseStatus } from './response-status';
import {
  abuseIdentity,
  buildSourceMetadata,
  completionCeilingKey,
  rateLimitKey,
  saveCeilingKey,
  warnOnceIfAbuseKeyingDegraded,
} from './source-metadata.service';
import { captchaRequired, verifyTurnstile } from './turnstile.service';
import { buildAnswerMap, validateSubmission } from './validation.service';
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
  /**
   * The caller's `x-session-id` request header, as `UserPayload.sessionId`.
   *
   * NOT `mj_sid` and not a JWT claim, whatever the name suggests — MJ reads it straight off the
   * request in `extractAuthInputs`. It is a correlator the caller chooses, blank for any client
   * that omits the header, and that is why it keys dedupe and the fine-grained per-session limit
   * but nothing that has to hold against someone trying.
   */
  sessionId: string;
  /**
   * Salted hash of the caller's resolved IP, from `RequestIdentityMiddleware` via
   * `currentRequestIdentity()`. The ONLY caller attribute here that the caller did not choose, so
   * it is what the abuse ceilings key on. Absent in unit tests and in a deployment that has not
   * mounted the middleware, in which case those ceilings are dropped rather than re-keyed onto
   * something weaker — see `rateLimitGatesFor`.
   */
  clientIpHash?: string;
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
/**
 * What to append to the submit log line when the pipeline refused.
 *
 * Without this a refusal logged its stage breakdown and nothing else, so the only way to learn
 * WHY was to notice which stage came last and read this file to see which gate returns before
 * its own `timer.mark`. That is a diagnosis the operator should never have to perform: five
 * refusals in one real session were indistinguishable from each other in the log, and the
 * respondent — who cannot fix anything — was the only party actually told what happened.
 *
 * The respondent's own message is reused verbatim rather than paraphrased, so the line an
 * operator reads and the sentence the respondent saw are the same text, and neither can drift
 * into describing a different refusal from the other.
 */
function refusalSuffix(result: FormSubmissionResult): string {
  if (result.success) {
    return '';
  }
  const reason = result.errors?.[0]?.message?.trim();
  return ` — REFUSED: ${reason || 'no reason given'}`;
}

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
 * `answers` is optional only for callers that genuinely have none. The IDEMPOTENT-RESUBMIT paths
 * used to be such callers, on the reasoning that re-deriving the stored row's answers would cost
 * a round trip — but the retry carries those answers in its own payload, so the round trip was
 * never needed and the ending was simply being resolved against an empty map. That silently
 * downgraded every conditionally-routed form: a retry (the first submit succeeded, its network
 * response was lost) returned the DEFAULT ending's message and redirect, which is the one screen
 * the author decided this respondent should not see. Since the retry is the only thing the
 * respondent ever sees in that scenario, "they already followed the right redirect" is exactly
 * what did not happen.
 */
/**
 * The running score for these answers (C4): computed over exactly the questions the respondent
 * could reach and see, so a hidden or jumped-over question's stale answer scores nothing. The
 * widget folds over the same set from the same function, which is what makes "the same basis"
 * a fact rather than a convention two files have to keep agreeing on.
 */
function scoreFor(resolved: ResolvedDefinition, answers: ReadonlyMap<string, AnswerValue>): number {
  return computeScore(resolveVisibleQuestions(resolved.definition.pages, answers), answers);
}

function confirmationFields(
  resolved: ResolvedDefinition,
  answers?: ReadonlyMap<string, AnswerValue>,
): Pick<FormSubmissionResult, 'confirmationMessage' | 'redirectUrl'> {
  const { settings, endScreens } = resolved.definition;
  const map = answers ?? new Map<string, AnswerValue>();
  const ending = resolveEndingScreen(endScreens ?? [], map, { score: scoreFor(resolved, map) });
  const redirectUrl = endingRedirectUrl(ending, settings);
  return {
    // A redirect and a confirmation message are alternatives, not companions: sending both lets
    // a client that ignores the redirect show a message meant for a page nobody lands on.
    confirmationMessage: redirectUrl ? undefined : endingMessage(ending, settings),
    redirectUrl,
  };
}

/**
 * Process-wide in-flight cap on the submit pipeline, lazily built from config.
 *
 * Bounds CONCURRENT work, which the rate ceilings below do not: they limit how often a caller may
 * act, not how many requests they may have in flight at once, so a caller inside every ceiling can
 * still exhaust sockets and pool connections. Orthogonal to the per-caller ceilings rather than a
 * replacement for them — see {@link InFlightLimiter}, whose header-rotation rationale is obsolete
 * now that the ceilings key on the resolved peer IP. Module-level so the bound is one number for
 * the whole process.
 */
let submitInFlight: InFlightLimiter | undefined;
function submitInFlightLimiter(): InFlightLimiter {
  if (!submitInFlight) {
    submitInFlight = new InFlightLimiter(getPublicSubmitConfig().maxInFlight);
  }
  return submitInFlight;
}

/** Test-only: drop the memoized limiter so a fresh config takes effect. */
export function resetSubmitInFlightForTests(): void {
  submitInFlight = undefined;
}

/**
 * Run the full pipeline behind the process-wide in-flight cap.
 *
 * The cap wraps the WHOLE pipeline in a `finally` so its slot releases on every exit — refusal or
 * success. Over capacity we refuse immediately with a clean result (never a throw that would blank
 * the widget), because holding the request would be the resource exhaustion this defends against.
 */
export async function runSubmitPipeline(
  ctx: PipelineContext,
  submission: PipelineSubmission,
): Promise<FormSubmissionResult> {
  if (!submitInFlightLimiter().TryEnter()) {
    return fail('The form is receiving a lot of traffic right now. Please try again in a moment.');
  }
  try {
    return await runSubmitPipelineInner(ctx, submission);
  } finally {
    submitInFlightLimiter().Exit();
  }
}

/** The full pipeline body — see {@link runSubmitPipeline} for the in-flight cap that wraps it. */
async function runSubmitPipelineInner(
  ctx: PipelineContext,
  submission: PipelineSubmission,
): Promise<FormSubmissionResult> {
  // Timed end to end. "The submit is slow" is a report nobody can act on across eleven
  // stages, and the intuitive culprit (persistence) is often not the one — a captcha round
  // trip or a dedupe query can each outweigh the write. `report` is called on EVERY exit,
  // including refusals, because a slow rejection is still a slow request.
  const timer = createStageTimer();
  const report = <T extends FormSubmissionResult>(result: T): T => {
    LogStatus(`[Forms] submit ${formatTimings(timer.finish())}${refusalSuffix(result)}`);
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

  // Resolve the knockout HERE, before any gate charges anything. It is a pure function of the
  // definition and the submitted answers, so nothing forces it to wait for I/O — and two gates
  // below need to know: the completion rate ceiling and the response quota both exist to bound
  // COMPLETIONS, which a knockout is not. Charged after the fact, a burst of knockouts from one
  // address spent the tight completion bucket (20/min, justified by the automations a knockout
  // explicitly never fires) and locked real completions out behind a NAT.
  const preliminaryMap = buildAnswerMap(submission.answers);
  const knockout = resolveDisqualification(resolved.definition.endScreens ?? [], preliminaryMap, {
    score: scoreFor(resolved, preliminaryMap),
  });

  timer.mark('resolve-form');

  // 3. Rate-limit. `charge` consults every bucket before spending any of them, so a request one
  //    gate refuses does not silently eat the respondent's budget in another.
  warnOnceIfAbuseKeyingDegraded(ctx.clientIpHash);
  const gates = rateLimitGatesFor(ctx, resolved.distribution.ID, complete && knockout === undefined);
  const limit = FormsRateLimiter.Instance.charge(gates);
  if (!limit.allowed) {
    return report(fail(rateLimitedMessage(limit.retryAfterMs)));
  }

  timer.mark('rate-limit');

  // 4. Turnstile (per form/distribution toggle) — FINAL submits only.
  //
  //     A partial is exempt because a Turnstile token is single-use. The widget therefore
  //     withholds it from autosaves (see `buildSubmission`), keeping it for the submit that
  //     actually needs it — and verifying anyway meant every autosave and every submit-point
  //     checkpoint on a captcha-enabled form was rejected. Autosave is fail-soft, so nothing
  //     surfaced: the respondent simply had no saved progress, on exactly the forms whose authors
  //     cared enough to turn a captcha on.
  //
  //     This is not a bypass. A partial can only ever write a `Partial` row; promoting one to
  //     `Complete` runs this pipeline again with `partial` unset, and that pass is gated here. The
  //     rate limiter ABOVE is what bounds partial writes, and it runs for every save either way.
  //
  //     Ordered after the rate limit for the same single-use reason. Verifying first meant a
  //     submission the limiter was about to refuse had already spent its token at Cloudflare, so
  //     the respondent's retry — the one thing they can actually do about a rate limit — came
  //     back "Captcha verification failed" instead of the wait. It also let a caller who was
  //     being refused anyway keep costing us an outbound round trip per attempt.
  const needCaptcha =
    complete && captchaRequired(resolved.definition.settings.captchaRequired, resolved.distribution.CaptchaRequired);
  const turnstile = await verifyTurnstile(needCaptcha, submission.turnstileToken, ctx.fetchImpl);
  if (!turnstile.success) {
    return report(fail(`Captcha verification failed (${turnstile.errorCode}).`));
  }

  timer.mark('captcha');

  // 5. Disqualification (C3) — evaluated on EVERY save. The widget's own detection is advisory;
  //    THIS is the enforcement (the mutation is reachable without the widget, and a client that
  //    "forgets" it was disqualified must still be disqualified). Evaluated on the raw answer
  //    map: a knockout answer disqualifies whether or not later visibility would have kept it.
  //
  //    FIRST among the gates, deliberately, because it is pure — no I/O — and because the two
  //    gates below both exist to police COMPLETIONS, which a knockout is not. Running them first
  //    meant a full form answered "no" by an ineligible respondent came back "no longer
  //    accepting responses" and wrote nothing, so the one fact worth keeping about that person
  //    — that they were screened out — was the fact we discarded.
  //    A knockout SEALS the response only on a finished submission. The rule is evaluated on
  //    whatever the request carries, and an autosave carries a value the respondent is still
  //    typing: `1` on the way to `18`, under `age lessThan 18`, fired the rule and — because
  //    sealed is sealed — left them unable to ever correct it, since dedupe hands the terminal
  //    row straight back. A partial therefore records the answer and stays `Partial`.
  //
  //    This costs nothing in enforcement, which is the only reason the server evaluates this at
  //    all: the FINAL submit is the pass a client cannot avoid, and it still seals. A caller that
  //    "forgets" it was disqualified is disqualified the moment it tries to finish.
  const disqualifiedBy = complete ? knockout : undefined;
  const terminalCompletion = complete && disqualifiedBy === undefined;

  // 6. Dedupe (Task 1) — only on a completion. If this session (or this client response id)
  //    already reached a TERMINAL status for this form, short-circuit rather than writing a
  //    second row. Terminal is `Complete` OR `Disqualified`: both mean nothing more is coming,
  //    and treating only the first as terminal let a retried knockout fall through to the quota
  //    gate below and be refused on an attempt that had already succeeded.
  //    FAIL-CLOSED: a lookup-query error rejects the resubmit (never silently duplicates).
  if (complete) {
    const dedupe = await checkDuplicate(ctx, resolved, submission, disqualifiedBy);
    if (dedupe) {
      return report(dedupe);
    }
  }

  timer.mark('dedupe');

  // 7. Quota (distribution cap + optional form cap) — enforced only on a submission that would
  //    actually consume a slot. A disqualification never increments `ResponseCount`
  //    (`countsCompletion` in persistence.service), so holding one to the cap refuses a response
  //    that cannot fill it. A QUALIFYING respondent is still refused, which is the whole point
  //    of the cap.
  if (terminalCompletion) {
    const quotaResult = await checkQuotas(ctx, resolved);
    if (quotaResult) {
      return report(quotaResult);
    }
  }

  timer.mark('quota');

  // 8. Server-side re-validation (conditional visibility + required + format). A disqualified
  //    respondent legitimately stopped mid-form, so required questions they never reached must
  //    not block the terminal write — validation runs in partial mode for them.
  const validation = validateSubmission(
    resolved.definition,
    submission.answers,
    !complete || disqualifiedBy !== undefined,
  );
  if (validation.errors.length > 0) {
    return report({ success: false, errors: validation.errors });
  }

  // 8b. Every file answer must be one this respondent actually uploaded. `__mj.File` has no owner
  //     column, so the foreign key proves only that the file exists — without this a submission
  //     can name any file in the instance and it becomes their answer. Checked before persistence,
  //     so a foreign id never reaches the database, and on partial saves too, so it is caught at
  //     first sight rather than at promotion.
  const provenance = await checkFileProvenance(ctx, resolved, submission);
  if (provenance.errors.length > 0) {
    return report({ success: false, errors: provenance.errors });
  }

  timer.mark('validate');

  // 9. Find this session's in-flight Partial row so a partial autosave UPDATES it in place
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

  // 9b. Hard ceiling on rows this version has accumulated that NO QUOTA bounds — the durable
  //     bound on write abuse. It applies to any save that would CREATE a row the quota will not
  //     count: an autosave, and a knockout. A save UPDATING an existing row adds none, and a
  //     qualifying completion is the quota's business, not this one.
  //
  //     The condition used to be `!complete`, from when a final submit always meant a completion.
  //     A DISQUALIFYING final submit is neither: `terminalCompletion` is false so the quota skips
  //     it, and `!complete` was false so this skipped it too — leaving an anonymous caller who
  //     answers a knockout able to create rows through every gate, with no session and no client
  //     id. Both halves of that are closed here and in `countPartialResponses`.
  //
  //     This is the only DURABLE bound of the three: the ceilings above are per-window and
  //     per-process, so a caller pacing themselves under all of them — or spread across addresses
  //     — still accumulates rows without limit. This one counts what is actually in the table.
  //     Fail-CLOSED (a count error refuses the save) — autosave is fail-soft, so the widget
  //     simply retries.
  //
  //     A knockout IS refused once the ceiling is reached, and that is deliberate: it creates a
  //     row like any other, so exempting it would reopen the hole above. The respondent still
  //     sees their screen — the client's verdict does not wait on this save — but a saturated
  //     form records nothing new, which is what a ceiling is for.
  if (!existingPartial.response && !terminalCompletion) {
    const capped = await partialCapExceeded(ctx, resolved);
    if (capped) {
      return report(capped);
    }
  }

  timer.mark('partial-cap');

  // 10. Persist response + answers (CREATE, UPDATE partial, or PROMOTE partial→complete).
  const persisted = await persistSubmission(
    ctx.provider,
    {
      formId: resolved.definition.formId,
      formVersionId: resolved.version.ID,
      distributionId: resolved.distribution.ID,
      complete,
      disqualified: disqualifiedBy !== undefined,
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

  // 11. Fire on-submit hooks (complete only; best-effort, never fails the submit). Skipped when
  //     persistence reports a `deduped` no-op — a concurrent request already Completed this row
  //     and fired its hooks, so re-firing here would double-run on-submit automations.
  // Disqualified responses fire NO automations: OnComplete promised a completion this was not,
  // and side effects on a screened-out respondent (confirmation emails, entity upserts) are the
  // loud, hard-to-undo way to be wrong about a knockout.
  if (complete && !persisted.deduped && disqualifiedBy === undefined) {
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
    ...(disqualifiedBy !== undefined
      ? disqualificationFields(disqualifiedBy)
      : confirmationFields(resolved, validation.answerMap)),
  });
}

/**
 * What a repeat of an already-disqualified submission is shown.
 *
 * The knockout screen when this attempt still trips the same rule (the normal case — the same
 * answers were re-sent), and the neutral fallback when it does not, because we cannot honestly
 * name a screen these answers no longer match. Never the form's confirmation message: the row
 * is `Disqualified`, and "thanks, your response has been recorded" is untrue of it.
 */
function terminalRepeatFields(
  disqualifiedBy: PublishedFormScreen | undefined,
): Pick<FormSubmissionResult, 'confirmationMessage' | 'redirectUrl'> {
  return disqualifiedBy ? disqualificationFields(disqualifiedBy) : { confirmationMessage: 'Thanks for your time.' };
}

/**
 * What a disqualified respondent is shown: the knockout screen's own copy and redirect ONLY.
 * Deliberately not {@link confirmationFields} — the form-wide confirmation message and redirect
 * are promises made to people who completed, and "thanks, your response has been recorded" to
 * someone who was screened out is a lie on both counts.
 */
function disqualificationFields(
  screen: PublishedFormScreen,
): Pick<FormSubmissionResult, 'confirmationMessage' | 'redirectUrl'> {
  const redirectUrl = screen.redirectURL?.trim() || undefined;
  const copy = [screen.title, screen.body].filter((t) => !!t?.trim()).join('\n\n');
  return {
    confirmationMessage: redirectUrl ? undefined : copy || 'Thanks for your time.',
    redirectUrl,
  };
}

/**
 * Which buckets this submission has to satisfy.
 *
 * Three, answering different questions, and only two of them are abuse controls:
 *   (a) per (session, distribution) — the fine-grained limit for a client that identifies itself
 *       honestly. Keyed on the `x-session-id` header, which the caller chooses, so a caller who
 *       wants a fresh bucket simply sends a new value. Useful for shaping a real widget's
 *       behaviour, worthless as a ceiling — and treating it as one was the defect.
 *   (b) per (caller, distribution) — keyed on the resolved peer IP, which the caller cannot
 *       rotate. This is the ceiling. It does not make abuse impossible; it makes it cost
 *       ADDRESSES, which is the only currency a public endpoint can charge.
 *   (c) per (caller, distribution), completions only — the same identity against a much tighter
 *       cap, because a completion fires the on-submit automations (a confirmation email to an
 *       address the submission chose, an LLM run, entity upserts) and an autosave does not. One
 *       counter over both could only be tight enough to interrupt someone still typing, or loose
 *       enough to leave the expensive path effectively unlimited.
 */
function rateLimitGatesFor(ctx: PipelineContext, distributionId: string, complete: boolean): RateLimitGate[] {
  const config = getPublicSubmitConfig();
  const gates: RateLimitGate[] = [
    { key: rateLimitKey({ sessionId: ctx.sessionId, distributionId }), max: config.rateLimitMax },
  ];
  const identity = abuseIdentity(ctx.clientIpHash);
  if (!identity) {
    // No resolved IP, so (b) and (c) have nothing to key on. They are omitted rather than keyed
    // on something weaker — see `abuseIdentity`. Gate (a) is untouched, so this is exactly the
    // behaviour that shipped before the ceilings existed, and the warning above has said so.
    return gates;
  }
  gates.push({ key: saveCeilingKey(distributionId, identity), max: config.ipRateLimitMax });
  if (complete) {
    gates.push({ key: completionCeilingKey(distributionId, identity), max: config.completionMax });
  }
  return gates;
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
    ['Partial'],
    ctx.elevatedUser,
  );
}

/**
 * Detect a repeat of a submission this caller has already had sealed, and short-circuit to it.
 *
 * "Sealed" is any TERMINAL status — `Complete` or `Disqualified` — checked two ways, because the
 * two identities a caller carries have different lifetimes. The client response id is per-load
 * (the widget mints a fresh one every time, and a caller reaching this mutation directly sends
 * whatever it likes); the session outlives it. Either one recognising the row is enough, and the
 * result reports the row's OWN status and copy rather than a generic confirmation — a respondent
 * whose first attempt was screened out must not be told on their retry that it was recorded.
 *
 * Fail-CLOSED on a lookup error: a resubmit is refused rather than risking a second row.
 */
async function checkDuplicate(
  ctx: PipelineContext,
  resolved: ResolvedDefinition,
  submission: PipelineSubmission,
  disqualifiedBy: PublishedFormScreen | undefined,
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
    if (byId.response && isTerminalResponseStatus(byId.response.Status)) {
      return {
        success: true,
        responseId: byId.response.ID,
        status: byId.response.Status,
        // The repeat is shown what the original outcome was, not a generic thank-you: a
        // respondent whose first attempt was screened out must not be told on their retry that
        // their response has been recorded.
        ...(byId.response.Status === 'Disqualified'
          ? terminalRepeatFields(disqualifiedBy)
          : confirmationFields(resolved, buildAnswerMap(submission.answers))),
      };
    }
  }

  // Every TERMINAL status, not just `Complete`. The client response id is not stable — the
  // widget mints a fresh one on every load, and a caller reaching the mutation directly can send
  // whatever they like — so the session is the only thing tying a retry back to the row it
  // already has. Looking only for `Complete` meant a session sealed as `Disqualified` was not
  // recognised as sealed at all, and the pipeline ran on to write a second terminal row for it.
  const existing = await findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    TERMINAL_RESPONSE_STATUSES,
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
      // The row's OWN status and copy, for the same reason the by-id branch above uses them: a
      // session sealed by a knockout must not be told its response has been recorded.
      status: existing.response.Status,
      ...(existing.response.Status === 'Disqualified'
        ? terminalRepeatFields(disqualifiedBy)
        : confirmationFields(resolved, buildAnswerMap(submission.answers))),
    };
  }
  return undefined;
}

/**
 * Whether creating another `Partial` row for this version would breach the hard ceiling.
 *
 * Returns a failure result to short-circuit the pipeline, or undefined to proceed. Counts under the
 * elevated principal (the anonymous respondent cannot read responses) and fails CLOSED — a count
 * error refuses the partial rather than risk an unbounded-write hole. A disabled cap (<= 0) is a
 * no-op, so an operator can turn it off deliberately.
 */
async function partialCapExceeded(
  ctx: PipelineContext,
  resolved: ResolvedDefinition,
): Promise<FormSubmissionResult | undefined> {
  const cap = getPublicSubmitConfig().maxPartialsPerVersion;
  if (cap <= 0) {
    return undefined;
  }
  const counted = await countPartialResponses(ctx.provider, { formVersionId: resolved.version.ID }, ctx.elevatedUser);
  if (!counted.ok) {
    return fail('Could not save your progress right now. Please try again shortly.');
  }
  if (counted.count >= cap) {
    return fail('This form is not accepting new drafts right now. Please try again later.');
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
  // been re-published: a snapshot published before automations existed carries an empty
  // `automations` array, so it takes the legacy path and behaves exactly as it did.
  //
  // The decision itself lives in `resolveOnSubmitDispatch` rather than inline here, because
  // inline it was an `automations.length > 0` test that could not tell "has never configured
  // anything" from "deliberately runs nothing" — the two were the same snapshot. That cost a
  // consumer owning its own subject identity a duplicate `Person` row on every submission
  // (bizapps-forms#47), and it silently restored all four legacy hooks for any author who removed
  // their last step in the builder.
  const dispatch = resolveOnSubmitDispatch(resolved.definition);
  if (dispatch.kind === 'configured') {
    if (dispatch.automations.length === 0) {
      // Declared authoritative and empty: nothing runs. Returning HERE rather than letting
      // `runConfiguredAutomations` discover an empty plan also skips resolving the service
      // principal and reading the response back — real work, on the hot path, for a form that has
      // told us it wants none of it.
      return;
    }
    if (!ctx.fireHooks) {
      await runConfiguredAutomations(resolved, responseId);
      return;
    }
    // A test injected a firer. Fall through to it, as this path always has: `runConfiguredAutomations`
    // needs a database and a service principal, so the injected firer is what a pipeline test can
    // actually observe.
  }

  if (hasUnreachableAutomations(resolved.definition)) {
    console.warn(
      `[forms] form ${resolved.definition.formId} declares onSubmitMode='Legacy' but carries ` +
        `${resolved.definition.automations.length} automation(s); those will not run.`,
    );
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
    const plan = planAutomations(resolved.definition.automations, {
      complete: true,
      answers,
      score: scoreFor(resolved, answers),
    });

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