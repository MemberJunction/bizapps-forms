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
  resolveFormOutcome,
  resolveEndingScreen,
  SCREENED_OUT_MESSAGE,
  resolveVisibleQuestions,
  resolveOnSubmitDispatch,
  type AnswerValue,
  type FormAnswerInput,
  type FormSubmissionResult,
  type FieldError,
  type mjBizAppsFormsFormResponseEntityType,
  type PublishedFormScreen,
} from '@mj-biz-apps/forms-entities';
import { resolvePublishedDefinition, type ResolvedDefinition } from './definition-loader.service';
import { fireOnSubmitHooks, type HookFireResult } from './on-submit-hooks.service';
import { persistSubmission, responseIsOurs } from './persistence.service';
import { distributionQuotaExceeded, formQuotaExceeded } from './quota.service';
import { FormsRateLimiter, rateLimitedMessage, type RateLimitGate } from './rate-limit.service';
import {
  countPartialResponses,
  findResumableResponseById,
  findOwnedResponseById,
  findResponseById,
  findSessionResponse,
} from './response-lookup.service';
import { InFlightLimiter } from '../http/in-flight-limiter';
import { checkRespondentScope } from './scope-check.service';
import {
  RESUMABLE_RESPONSE_STATUSES,
  TERMINAL_RESPONSE_STATUSES,
  isTerminalResponseStatus,
} from './response-status';
import {
  abuseIdentity,
  buildSourceMetadata,
  completionCeilingKey,
  knockoutCeilingKey,
  rateLimitKey,
  saveCeilingKey,
  warnOnceIfAbuseKeyingDegraded,
} from './source-metadata.service';
import { captchaRequired, verifyTurnstile } from './turnstile.service';
import { buildAnswerMap, validateSubmission, type ValidationMode } from './validation.service';
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
   * Adopting an EXISTING row is guarded at the WRITE so a guessed/leaked id can never hijack
   * another's partial: `applyResponseIdentity` (persistence.service) refuses any row whose stored
   * `AnonymousSessionID` is non-empty and is not this caller's. The lookups below only narrow
   * which row is a candidate — putting the guard in them made it opt-in, because a caller chose
   * which lookup ran by deciding whether to send `x-session-id` (issue #78).
   *
   * So this id is a CAPABILITY, not an identity, and only for a row that has no owner. Holding it
   * is not grounds for being told anything about a row that has one — not even whether it is
   * finished — which is what `checkDuplicate` now asks `responseIsOurs` before it answers
   * (issues #100/#101).
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
/**
 * How much of the rulebook this submission is held to.
 *
 * A disqualified respondent legitimately stopped mid-form, so `isRequired` must not block the
 * terminal write that records the screening — but the answers they DID give are final, and are
 * held to their format. That distinction used to be a single boolean shared with autosave, which
 * turned format checking off on the one path that writes a permanent, never-revalidated row.
 */
export function validationModeFor(
  complete: boolean,
  disqualifiedBy: PublishedFormScreen | undefined,
): ValidationMode {
  if (!complete) {
    return 'draft';
  }
  return disqualifiedBy !== undefined ? 'screened-out' : 'complete';
}

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
  // The flow's whole verdict in one call, shared with the widget so the two cannot disagree
  // about it. `disqualified` is what every gate below keys off; an ending jump to an UNFLAGGED
  // screen is an ordinary completion and deliberately indistinguishable from one here — quota
  // counts it, automations fire, and only the screen the respondent sees differs.
  const outcome = resolveFormOutcome(
    resolved.definition.pages,
    resolved.definition.endScreens ?? [],
    preliminaryMap,
    { score: scoreFor(resolved, preliminaryMap) },
  );
  const knockout = outcome.disqualified ? outcome.screen : undefined;
  // Computed ONCE, here, and read by every gate below that distinguishes the two. It was derived
  // twice — the rate-limit gate said `complete && knockout === undefined` and the quota said
  // `terminalCompletion` — which is the same decision written in two places, so a later change to
  // one would have silently disagreed with the other.
  const terminalCompletion = complete && knockout === undefined;

  timer.mark('resolve-form');

  // 3. Rate-limit. `charge` consults every bucket before spending any of them, so a request one
  //    gate refuses does not silently eat the respondent's budget in another.
  warnOnceIfAbuseKeyingDegraded(ctx.clientIpHash);
  const gates = rateLimitGatesFor(ctx, resolved.distribution.ID, terminalCompletion, complete && knockout !== undefined);
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
  //    Resolved ABOVE, before any gate charges anything — see the block after the definition
  //    loads. The order matters and the reason is not obvious: three of the gates (the completion
  //    rate ceiling, dedupe and the quota) exist to police COMPLETIONS, which a knockout is not.
  const disqualifiedBy = complete ? knockout : undefined;

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

  // 8. Server-side re-validation (conditional visibility + required + format). Which mode, and
  //    why, is `validationModeFor`.
  const validation = validateSubmission(resolved.definition, submission.answers, validationModeFor(complete, disqualifiedBy));
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
  // `terminalCompletion`, not a third spelling of it. This gate governs the irreversible side
  // effects a knockout must never fire, and it was deriving the same decision the rate-limit and
  // quota gates derive — a fourth reading of "is this a real completion" is a fourth place for a
  // later change to disagree.
  if (terminalCompletion && !persisted.deduped) {
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

  // The copy follows the PERSISTED status, not this request's own verdict. They can disagree: the
  // row may have been sealed `Disqualified` by a concurrent save whose answers tripped a rule
  // these answers do not, in which case `persistSubmission` returns the row's status while
  // `disqualifiedBy` here is undefined. Reporting a `Disqualified` status alongside the QUALIFIED
  // confirmation and redirect sent the screened-out respondent to the qualified destination —
  // which is precisely the defect the widget was fixed for twice, arriving instead down the
  // server's race path. `checkDuplicate` already branches on the row's own status; this was the
  // one site that never adopted the pattern.
  return report({
    success: true,
    responseId: persisted.responseId,
    status: persisted.status,
    // ONE rule: the response describes the ROW. Not this request's verdict, and not a mixture.
    //
    // A previous version added `|| disqualifiedBy !== undefined` to cover the mirror race — a
    // concurrent submit sealing the row `Complete` while THESE answers trip a knockout — and that
    // made things worse rather than safer. It paired a `Complete` status with the knockout's copy,
    // and the widget keys screened-out-ness on the STATUS alone: it therefore ignored the copy,
    // resolved a qualified ending screen, and could follow that screen's redirect. A mismatched
    // pair is not a safer pair; it is one the reader downstream resolves in whichever direction it
    // happens to look.
    //
    // The row is the record. If a concurrent request completed this response, it IS complete, and
    // saying so is accurate however these answers would have been judged on their own.
    ...(persisted.status === 'Disqualified'
      ? terminalRepeatFields(disqualifiedBy)
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
  return disqualifiedBy ? disqualificationFields(disqualifiedBy) : { confirmationMessage: SCREENED_OUT_MESSAGE };
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
    confirmationMessage: redirectUrl ? undefined : copy || SCREENED_OUT_MESSAGE,
    redirectUrl,
  };
}

/**
 * Which buckets this submission has to satisfy.
 *
 * Four, answering different questions. Only (a) is not an abuse control — it is keyed on a header
 * the caller chooses, so it shapes a real widget's behaviour and bounds nothing. The other three
 * are keyed on the resolved peer IP, and they are listed here in the order the body pushes them:
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
 *   (d) per (caller, distribution), DISQUALIFYING submits only — its own counter, for the reason
 *       spelled out at the push site below.
 */
function rateLimitGatesFor(
  ctx: PipelineContext,
  distributionId: string,
  complete: boolean,
  knockout: boolean,
): RateLimitGate[] {
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
  // A knockout charges (d) and NOT (c): it fires none of the work (c) is tight for, so sharing
  // that bucket let ineligible respondents crowd out real completions — but each knockout leaves
  // a permanent row, so no bucket at all made the durable row ceiling fall far faster than it is
  // sized for. Its own counter is the only reading that is neither of those.
  if (knockout) {
    gates.push({ key: knockoutCeilingKey(distributionId, identity), max: config.knockoutMax });
  }
  return gates;
}

/**
 * Locate the Partial row this submit should UPDATE/PROMOTE, honoring the widget's client-supplied
 * `responseId` autosave hint.
 *
 * Two-step:
 *   1. If the client sent a `responseId`, prefer the row `findOwnedResponseById` confirms matches
 *      on (ID, AnonymousSessionID, FormVersionID) and is still Partial; with no session to key on,
 *      fall back to the SourceMetadata client-id proof.
 *   2. Otherwise (no hint, or the hint resolved to nothing), fall back to the plain session-key
 *      lookup — the pre-existing same-session behavior.
 *
 * NOTHING HERE DECIDES OWNERSHIP, and it is important that it does not try (issue #78). This
 * function only proposes a candidate; `persistSubmission` refuses to write any row owned by
 * another session, so a candidate that turns out to be foreign is refused rather than adopted.
 * Enforcing it here instead meant the check applied only to the branch a caller chose to take —
 * and a caller who matched no branch at all still collided into the row on its primary key.
 *
 * Both lookups fail-open: a query error yields "no row", so persistence creates a fresh row (or
 * refuses, if the id is already taken by someone else) rather than adopting an unverified one.
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
    // 1b. No usable session (the routine public-submit case — sessionId is blank): propose the
    //     row keyed by the client id itself, narrowed by the SourceMetadata client-id proof so a
    //     merely-guessed PK matches nothing. THIS is what makes autosave upsert work with a blank
    //     session (the original duplicate-row bug). It is NOT the ownership check — persistence
    //     refuses the write if the row proposed here turns out to have an owner (issue #78).
    if (!ctx.sessionId) {
      const resumable = await findResumableResponseById(
        ctx.provider,
        { responseId: submission.clientResponseId, formVersionId: resolved.version.ID },
        ctx.elevatedUser,
      );
      if (resumable.ok && resumable.response) {
        return { response: resumable.response };
      }
    }
    // Hint did not resolve to a resumable row (unknown id, wrong version, already sealed, or a
    // lookup error): ignore it and fall through to the session-key lookup.
  }
  return findSessionResponse(
    ctx.provider,
    { formVersionId: resolved.version.ID, sessionId: ctx.sessionId },
    RESUMABLE_RESPONSE_STATUSES,
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
 * WHOSE REPEAT IT IS, though, is a question this has to ask (#100/#101). Reporting a row's status
 * is disclosure, and the id is not on its own proof of anything: it is a capability only for a row
 * that has no owner. The session branch narrows to the caller's own rows in SQL and needs nothing
 * more; the by-id branch does not, so it asks `responseIsOurs` — THE ownership rule, imported from
 * the persistence seam that enforces it rather than restated here as a second predicate.
 *
 * WHAT A STRANGER CAN STILL LEARN, recorded so it is a bound somebody chose. A caller naming an id
 * that belongs to NOBODY is answered `success` — a row is created at that id, and it is theirs —
 * so "this id is taken by someone else" stays distinguishable from "this id is free". That is
 * structural: the client mints the primary key, and an endpoint that lets a caller create a row at
 * an id of their choosing cannot also hide whether that id is in use. It is empty within the
 * threat model these issues assume, where the caller has already observed the id in traffic. What
 * is closed is everything ABOUT the response — sealed or not, `Complete` or `Disqualified`.
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
    // Ownership BEFORE the terminal test — `reconcileDuplicate` orders it the same way, and for
    // the same reason: the branch below reports the row's status while writing nothing, so a
    // foreign row reaching it is disclosure the write seam never sees (#100/#101).
    //
    // A row that is not ours is simply NOT A REPEAT WE RECOGNISE, and we do not refuse it here.
    // The submission carries on to persistence, collides on the primary key it named, and the one
    // gate refuses it with the one message every ownership failure gets. Refusing here would add a
    // second place that says no; declining to recognise adds none.
    //
    // THE COST, so it is a decision and not a surprise: a re-fire that presents an owned row's id
    // under a blank or different session used to be answered here and is now refused. That caller
    // is already refused everywhere else (issue #78 — an absent credential must not be more
    // permissive than a wrong one), so this makes the read agree with the write rather than
    // introducing a new refusal. No real widget reaches it: the session and the client id are
    // minted together, so an id is only ever presented alongside the session that created it.
    if (
      byId.response &&
      responseIsOurs(byId.response, ctx.sessionId) &&
      isTerminalResponseStatus(byId.response.Status)
    ) {
      return recognisedRepeat(resolved, byId.response, submission, disqualifiedBy);
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
    return recognisedRepeat(resolved, existing.response, submission, disqualifiedBy);
  }
  return undefined;
}

/**
 * What a recognised repeat is answered: the ROW's own id, status and copy.
 *
 * Both branches of {@link checkDuplicate} built this object, identically, and the duplication was
 * load-bearing rather than cosmetic — the two copies each carried their own comment explaining the
 * `Disqualified` case, so a change to what a repeat may be told had two places to reach and the
 * gate that decides WHOSE repeat it is now has one shape to protect.
 *
 * The status is not always `Complete`: a session sealed by a knockout must be told it was screened
 * out rather than congratulated, which is why the copy follows the row's status and not the form's
 * confirmation. (No dedicated `duplicate` flag is added to the shared `FormSubmissionResult` — that
 * contract lives in @mj-biz-apps/forms-entities; the responseId plus the row's status is the
 * client-visible signal.)
 */
function recognisedRepeat(
  resolved: ResolvedDefinition,
  row: Pick<mjBizAppsFormsFormResponseEntityType, 'ID' | 'Status'>,
  submission: PipelineSubmission,
  disqualifiedBy: PublishedFormScreen | undefined,
): FormSubmissionResult {
  return {
    success: true,
    responseId: row.ID,
    status: row.Status,
    ...(row.Status === 'Disqualified'
      ? terminalRepeatFields(disqualifiedBy)
      : confirmationFields(resolved, buildAnswerMap(submission.answers))),
  };
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