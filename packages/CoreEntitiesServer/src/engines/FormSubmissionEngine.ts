/**
 * `FormSubmissionEngine` — the respondent path (spec #303 §4, §5, §6): what an anonymous respondent
 * may see of a form (`GetRespondentForm`) and every save they make (`SaveResponse`). The two Remote
 * Operations `Forms.GetRespondentForm` / `Forms.SaveResponse` are thin wrappers over these; their
 * `Authorize` has already bound the caller's magic-link session to the link before anything here runs.
 *
 * SAVE PIPELINE (fail-closed at each gate; every refusal is a RESULT, never a throw):
 *   in-flight cap → shape → respondent scope (CanCreate, no accretion) → resolve the link (form
 *   Published, link Active and in its window, the version the widget rendered, a parseable snapshot)
 *   → embed origin → answer structure pre-scan (size, width, nesting; no recursion) → preliminary
 *   outcome (settled visibility, score, knockout, ending — `resolveResponseOutcome`) → rate limit
 *   (charged even for a payload the pre-scan refuses, which is refused right after) → Turnstile (final
 *   only) → scoped response / foreign hint → dedupe → quota pre-check → file provenance → outcome
 *   re-judged over the vouched answers → `validateAnswers` (incl. each answer's shape for its question
 *   type) → existing draft → draft ceiling
 *   → ONE TRANSACTION { form-level quota (locked) → response + answers + file links (persistence)
 *     → the distribution slot (atomic UPDATE) → the outbox event } → resume-link revocation and the
 *   automation drain (both detached, after commit) → the server-resolved ending.
 *
 * WHAT CHANGED FROM THE forms-server PIPELINE, and why:
 *  - The write is ONE transaction. It used to commit row by row ("There is no transaction here"), so
 *    a failure left a response whose counter never moved, and the counter was read-then-write, so
 *    two submits on the last slot both got in. Now the quota is a conditional UPDATE in the same
 *    transaction (`quota.ts`) and a failure anywhere leaves nothing.
 *  - On-submit automations are a `FormAutomationEvent` row committed WITH the response (an outbox),
 *    not a detached promise a killed process could lose. `FORMS_HOOKS_BLOCKING`, `fireHooksSafely` and
 *    the legacy `fireOnSubmitHooks` path are gone; the automation drain fires the legacy hooks for a
 *    final submit.
 *  - The knockout is judged on the SETTLED answers — the same set validation stores and the widget
 *    shows — not on the raw payload, so a knockout can no longer fire on an answer to a question the
 *    walk hid (which left `Disqualified` rows with zero answers).
 *  - The server ends the form. The respondent projection carries no ending screens or knockout
 *    conditions (#302), so the widget can no longer detect a knockout itself: a PARTIAL save whose
 *    settled answers trip one returns `ended` with the screen. It does NOT seal the row — an autosave
 *    carries values the respondent has not finished typing (`1` on its way to `18`), and a seal is
 *    permanent — so the row stays `Partial` and the client's FINAL submit, which a knockout sends
 *    without waiting for the respondent, is what seals it `Disqualified` (the old widget flow, now
 *    driven by the server's verdict).
 *  - The form itself must be Published (new): the link and version checks said nothing about an
 *    archived form.
 *
 * Reads that decide the caller's own link run as the respondent (its row filters bind them); reads
 * and writes of responses run as the system user, after `Authorize`, as before. The rate limiter and
 * the in-flight cap are per-process (spec out-of-scope: they stay that way, documented).
 */
import { LogError, LogStatus, RunInEntityTransaction, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
  answersStructureRefusal,
  buildAnswerMap,
  CanonicalAnswers,
  CAPTCHA_NOT_CONFIGURED_MESSAGE,
  type AnswerValue,
  resolveEndingScreen,
  resolveResponseOutcome,
  validateAnswers,
  type FormSettings,
  type PublishedFormScreen,
  type RespondentFormDefinition,
  type ResumeSnapshot,
} from '@mj-biz-apps/forms-entities';
import { checkEmbedOrigin, FOREIGN_ORIGIN_MESSAGE } from '../shared/embed-origin.js';
import { InFlightLimiter } from '../shared/in-flight-limiter.js';
import { withIsolatedProvider } from '../shared/isolated-provider.js';
import { revokeResponseInvites } from '../magic-link/response-invite-revocation.js';
import { getPublicSubmitConfig } from '../submission/config.js';
import { FOREIGN_RESPONSE_MESSAGE, isValidUuid, persistSubmission, type PersistenceResult } from '../submission/persistence.js';
import { resolvePublishedDefinition, type ResolvedDefinition } from '../submission/published-link.js';
import { partialSaveKey, queuedTrigger } from '../submission/queued-automations.js';
import { consumeDistributionSlot, distributionQuotaExceeded, formQuotaReached } from '../submission/quota.js';
import { FormsRateLimiter, rateLimitedMessage } from '../submission/rate-limit.js';
import { checkRespondentScope } from '../submission/respondent-scope.js';
import { completionEnding, disqualificationEnding, sealedScreeningEnding, type EndingFields } from '../submission/respondent-ending.js';
import { respondentDefinitionFor } from '../submission/respondent-payload.js';
import { isTerminalResponseStatus } from '../submission/response-status.js';
import { loadResumeSnapshot, loadStoredAnswerRows } from '../submission/resume-snapshot.js';
import { buildConditionAnswers } from '../automation/condition-answers.js';
import {
  draftCeilingRefusal,
  findExistingDraft,
  findSealedRepeat,
  type SealedRepeat,
  rateLimitGatesFor,
  refusal,
  submissionShapeRefusal,
  validationModeFor,
  vouchForFiles,
  type SaveGateContext,
} from '../submission/save-gates.js';
import type { RespondentCaller, RespondentSaveRequest, RespondentSaveResult } from '../submission/save-request.js';
import { resolveScopedResponseId, scopeNamesDistribution } from '../submission/scoped-response.js';
import { buildSourceMetadata, warnOnceIfAbuseKeyingDegraded } from '../submission/source-metadata.js';
import { createStageTimer, formatTimings } from '../submission/stage-timer.js';
import { captchaRequired, TURNSTILE_NOT_CONFIGURED, verifyTurnstile } from '../submission/turnstile.js';
import { OUTBOX_RESPONSE_SUBMITTED, type ResponseSubmittedQueue } from '../automation/outbox/enqueue.js';
import type { ResponseSubmittedPayload, ResponseSubmittedTrigger } from '../automation/outbox/response-submitted-event.js';
import { drainAutomationOutbox } from '../automation/outbox/drain.js';
import { requireEntityTransactions } from './engine-guards.js';

/**
 * What the respondent is told when the system failed rather than refused. Authored, and deliberately
 * says nothing about what happened: the exception's own words are for the log (#119).
 */
export const SUBMIT_FAILED_MESSAGE = 'Something went wrong while submitting your response. Please try again.';

/** What a respondent is told when no form can be shown for the link — the same for every reason. */
export const FORM_UNAVAILABLE_MESSAGE = 'This form is not available.';

/** The quota refusal — the pre-check and the atomic UPDATE say the same sentence. */
export const QUOTA_REACHED_MESSAGE = 'This form is no longer accepting responses (quota reached).';

/** The in-flight refusal. */
const BUSY_MESSAGE = 'The form is receiving a lot of traffic right now. Please try again in a moment.';

/** Test seams. Production passes none of them. */
export interface SubmissionSeams {
  /** The elevated reader/writer; defaults to MJ's system user. */
  readonly systemUser?: UserInfo;
  /** Turnstile's HTTP call; defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** The outbox the save queues its automations in; defaults to the `FormAutomationEvent` table. */
  readonly queue?: ResponseSubmittedQueue;
  /** Resume-link revocation after a seal; defaults to the minter on an isolated provider. */
  readonly revokeInvites?: (args: { responseId: string; deviceOnly: boolean }) => Promise<void>;
  /** The post-commit drain of the response; defaults to `drainAutomationOutbox` on an isolated provider. */
  readonly kick?: (responseId: string) => void;
  /** "Now", for the link's window. */
  readonly now?: Date;
}

/** What `GetRespondentForm` returns: the projection, and the per-session extras. */
export interface RespondentFormView {
  readonly formVersionId: string;
  /** The ALLOWLIST projection (`toRespondentDefinition`) with the link's captcha demand folded in. */
  readonly definition: RespondentFormDefinition;
  /** The draft this session is scoped to, when it is a resume session. */
  readonly resume?: ResumeSnapshot;
  readonly captchaRequired: boolean;
}

/**
 * The form cannot be shown to this caller. One fixed sentence for every reason — a closed link, an
 * archived form, a foreign embedding page, a failure — so a caller learns nothing about which; the
 * reason goes to the log. `fault` tells the operator whether it was a refusal or the system.
 */
export class RespondentFormUnavailableError extends Error {
  public readonly fault: boolean;

  constructor(fault: boolean) {
    super(FORM_UNAVAILABLE_MESSAGE);
    this.name = 'RespondentFormUnavailableError';
    this.fault = fault;
  }
}

/** A refusal raised inside the save's transaction, so the transaction rolls back before it is answered. */
class SaveRefusal extends Error {
  constructor(public readonly respondentMessage: string) {
    super(respondentMessage);
    this.name = 'SaveRefusal';
  }
}

/** Everything one save needs after its gates — the work of the transaction. */
interface CommitPlan {
  readonly gate: SaveGateContext;
  readonly resolved: ResolvedDefinition;
  readonly request: RespondentSaveRequest;
  readonly complete: boolean;
  readonly knockout: PublishedFormScreen | undefined;
  readonly terminalCompletion: boolean;
  readonly validated: ReturnType<typeof validateAnswers>;
  readonly existingResponseId: string | undefined;
  readonly scopedResponseId: string | undefined;
  readonly trigger: ResponseSubmittedTrigger | null;
  readonly queue: ResponseSubmittedQueue;
}

export class FormSubmissionEngine extends BaseSingleton<FormSubmissionEngine> {
  /**
   * Process-wide in-flight cap on `SaveResponse`. Bounds CONCURRENT work, which the rate ceilings do
   * not (they limit how often a caller acts, not how many requests they hold open). Per-process by
   * design (spec out-of-scope). Lazily built so a test can reset the config first.
   */
  private inFlight: InFlightLimiter | undefined;

  public static get Instance(): FormSubmissionEngine {
    return super.getInstance<FormSubmissionEngine>();
  }

  /** Test-only: drop the memoized in-flight limiter so a fresh config takes effect. */
  public ResetInFlightForTests(): void {
    this.inFlight = undefined;
  }

  // --- GetRespondentForm --------------------------------------------------------------------------

  /**
   * What a respondent may see of the form behind `slug`: the allowlisted projection (#302), the
   * resume snapshot when the session is scoped to a draft, and the captcha flag.
   *
   * The same gates the save runs at the READ — a widget that will not be allowed to submit must not
   * be allowed to render either, and a foreign page must not receive the definition on the way.
   *
   * Throws {@link RespondentFormUnavailableError} (one fixed sentence) for every refusal and every
   * failure; the reason is logged with the slug.
   */
  public async GetRespondentForm(
    slug: string,
    caller: RespondentCaller,
    provider: DatabaseProviderBase,
    user: UserInfo,
    seams: SubmissionSeams = {},
  ): Promise<RespondentFormView> {
    try {
      return await this.respondentForm(slug, caller, provider, user, seams);
    } catch (err) {
      if (err instanceof RespondentFormUnavailableError) {
        throw err;
      }
      LogError(`[Forms] GetRespondentForm(${slug}) threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      throw new RespondentFormUnavailableError(true);
    }
  }

  private async respondentForm(
    slug: string,
    caller: RespondentCaller,
    provider: DatabaseProviderBase,
    user: UserInfo,
    seams: SubmissionSeams,
  ): Promise<RespondentFormView> {
    const system = this.systemUserFor(seams);
    const loaded = await resolvePublishedDefinition(provider, slug, user, system, { now: seams.now });
    if (!loaded.ok || !loaded.value) {
      LogStatus(`[Forms] GetRespondentForm(${slug}) refused: ${loaded.failure}.`);
      throw new RespondentFormUnavailableError(false);
    }
    const { definition, distribution, version } = loaded.value;
    const embedOrigin = checkEmbedOrigin(distribution.AllowedOrigins, caller.origin);
    if (!embedOrigin.allowed) {
      LogError(`[Forms] GetRespondentForm refused for ${slug}: ${embedOrigin.reason ?? 'origin not allowed'}`);
      throw new RespondentFormUnavailableError(false);
    }
    // A resume session and a public-link session reach this identically; only what their scope
    // claim names differs, and only a claim that is NOT this distribution can name a response — so an
    // ordinary public link pays for no read. Read as the RESPONDENT: the row filter
    // (`Respondent Own Response`) is the gate on whose answers come back.
    const scope = user.MagicLinkScope?.ResourceID;
    const resume = scope && !scopeNamesDistribution(scope, distribution.ID) ? await loadResumeSnapshot(provider, scope, user) : undefined;
    const projected = respondentDefinitionFor(definition, distribution.CaptchaRequired);
    return {
      formVersionId: version.ID,
      definition: projected,
      resume,
      captchaRequired: projected.captchaRequired,
    };
  }

  // --- SaveResponse -------------------------------------------------------------------------------

  /**
   * Save a response: an autosave (`partial`) or the final submit (`final`). See the file header for
   * the pipeline.
   *
   * NEVER THROWS. A refusal is a result; a stage that throws (a bug, a driver error, the queue
   * refusing a message) is logged with the slug and version — never the answers — and answered with
   * {@link SUBMIT_FAILED_MESSAGE}, because a thrown message reaches the respondent verbatim (#119).
   * The in-flight slot is released on every exit.
   */
  public async SaveResponse(
    request: RespondentSaveRequest,
    provider: DatabaseProviderBase,
    user: UserInfo,
    seams: SubmissionSeams = {},
  ): Promise<RespondentSaveResult> {
    const limiter = this.inFlightLimiter();
    if (!limiter.TryEnter()) {
      return refusal(BUSY_MESSAGE);
    }
    try {
      return await this.saveResponse(request, provider, user, seams);
    } catch (err) {
      LogError(
        `[Forms] save for ${request?.distributionSlug} (version ${request?.formVersionId}, mode ${request?.mode}) threw: ` +
          (err instanceof Error ? (err.stack ?? err.message) : String(err)),
      );
      return refusal(SUBMIT_FAILED_MESSAGE);
    } finally {
      limiter.Exit();
    }
  }

  private inFlightLimiter(): InFlightLimiter {
    this.inFlight ??= new InFlightLimiter(getPublicSubmitConfig().maxInFlight);
    return this.inFlight;
  }

  /** The save body — see {@link SaveResponse} for the boundary around it. */
  private async saveResponse(
    request: RespondentSaveRequest,
    provider: DatabaseProviderBase,
    user: UserInfo,
    seams: SubmissionSeams,
  ): Promise<RespondentSaveResult> {
    // Timed end to end, refusals included: "the submit is slow" is a report nobody can act on across
    // a dozen stages. An exception unwinds past `report` to the boundary, which logs the stack instead.
    const timer = createStageTimer();
    const report = (result: RespondentSaveResult): RespondentSaveResult => {
      LogStatus(`[Forms] submit ${formatTimings(timer.finish())}${refusalSuffix(result)}`);
      return result;
    };

    const shape = submissionShapeRefusal(request);
    if (shape) {
      return report(shape);
    }
    timer.mark('shape');

    // CanCreate on the response entities and on nothing that defines a form — the respondent role's
    // exact grant, so a mis-scoped session is refused however its roles were assembled. The
    // operation's `Authorize` decided WHICH link this session may use; this decides that it is a
    // respondent session at all.
    const scope = checkRespondentScope(provider, user);
    if (!scope.allowed) {
      return report(refusal(scope.reason ?? 'Not authorized.'));
    }
    timer.mark('scope');

    const system = this.systemUserFor(seams);
    const loaded = await resolvePublishedDefinition(provider, request.distributionSlug, user, system, {
      expectedVersionId: request.formVersionId,
      now: seams.now,
    });
    if (!loaded.ok || !loaded.value) {
      // One sentence for every reason (closed, archived, a stale version, unreadable), as the read
      // answers; which one goes to the log, never to a caller probing the link (review minor 4).
      LogStatus(`[Forms] save refused for ${request.distributionSlug}: ${loaded.failure}.`);
      return report(refusal(FORM_UNAVAILABLE_MESSAGE));
    }
    const resolved = loaded.value;
    const complete = request.mode === 'final';
    timer.mark('resolve-form');

    // Embed origin — after the link resolves (the policy is a column on it) and before the rate
    // limiter (a fact about the LINK must not spend a respondent's budget). One sentence for every
    // reason, so a prober cannot map the allowlist.
    const embedOrigin = checkEmbedOrigin(resolved.distribution.AllowedOrigins, request.caller.origin);
    if (!embedOrigin.allowed) {
      LogError(`[Forms] save refused for ${request.distributionSlug}: ${embedOrigin.reason ?? 'origin not allowed'}`);
      return report(refusal(FOREIGN_ORIGIN_MESSAGE));
    }
    timer.mark('embed-origin');

    // The cheap pre-scan, BEFORE anything recursive reads the answers (fix round 2): size, width and
    // nesting, walked with an explicit stack. A 20000-deep array is a 40 KB request that overflows
    // every recursive reader below it — the verdict's `buildAnswerMap` first — so it is refused here,
    // as a refusal (one status line), never as a crash.
    const malformed = answersStructureRefusal(request.answers);
    // The verdict needs those readers, so a malformed payload is classified without one: it charges
    // the bucket its mode would (a completion or an autosave) — the abuse is COUNTED — then is refused.
    // Resolved before any gate charges anything otherwise, because three of them (the completion
    // ceiling, dedupe and the quota) police COMPLETIONS, which a knockout is not; re-judged below over
    // the answers provenance lets through, which is what is stored (review minor 7).
    const preliminary =
      malformed.length > 0 ? malformedVerdict(complete) : verdictFor(resolved.definition, request.answers, complete);

    // Every bucket is consulted before any is charged, so a refusal spends nothing anywhere.
    warnOnceIfAbuseKeyingDegraded(request.caller.ipHash);
    const gate: SaveGateContext = {
      provider,
      system,
      sessionId: request.caller.sessionId,
      clientIpHash: request.caller.ipHash,
    };
    const limit = FormsRateLimiter.Instance.charge(
      rateLimitGatesFor(gate, resolved.distribution.ID, preliminary.terminalCompletion, preliminary.knockout !== undefined),
    );
    if (!limit.allowed) {
      return report(refusal(rateLimitedMessage(limit.retryAfterMs)));
    }
    timer.mark('rate-limit');
    if (malformed.length > 0) {
      return report({ success: false, outcome: 'continue', errors: malformed });
    }

    // Turnstile on a FINAL save only: a token is single-use, so the widget withholds it from
    // autosaves; a partial writes only a draft (even one a knockout ends — the final seals it, and
    // runs this gate), and the completion that matters runs this gate. Ordered after the rate limit so a refused request does
    // not spend the respondent's token.
    const needCaptcha = complete && captchaRequired(resolved.definition.settings.captchaRequired, resolved.distribution.CaptchaRequired);
    const turnstile = await verifyTurnstile(needCaptcha, request.turnstileToken, seams.fetchImpl);
    if (!turnstile.success && turnstile.errorCode === TURNSTILE_NOT_CONFIGURED) {
      LogError(
        `[Forms] submit to '${request.distributionSlug}' requires a captcha but FORMS_TURNSTILE_SECRET is not set on this host. ` +
          'Set FORMS_TURNSTILE_SECRET and FORMS_TURNSTILE_SITE_KEY, or turn the captcha off on that form or link.',
      );
      return report(refusal(CAPTCHA_NOT_CONFIGURED_MESSAGE));
    }
    if (!turnstile.success) {
      return report(refusal(`Captcha verification failed (${turnstile.errorCode}).`));
    }
    timer.mark('captcha');

    // WHOSE session this is, settled ONCE (#138): the verified scope claim, never a header.
    const scoped = await resolveScopedResponseId(
      provider,
      { scopeResourceId: user.MagicLinkScope?.ResourceID, distributionId: resolved.distribution.ID },
      system,
    );
    const scopedResponseId = scoped.responseId;
    // A scoped session naming SOMEBODY ELSE'S response id is refused with the one ownership sentence.
    if (scopedResponseId && request.clientResponseId && request.clientResponseId.trim().toLowerCase() !== scopedResponseId.trim().toLowerCase()) {
      return report(refusal(FOREIGN_RESPONSE_MESSAGE));
    }

    // Dedupe — a final save, when this caller already holds a sealed row for this version:
    // short-circuit to it rather than write a second.
    if (complete) {
      const repeat = await findSealedRepeat(gate, resolved.version.ID, request.clientResponseId, scopedResponseId);
      if (repeat && 'success' in repeat) {
        return report(repeat);
      }
      if (repeat) {
        // The ending the ROW earned — never one this request's answers would earn: a sealed session
        // could otherwise re-send finals with any answers, unvalidated and writing nothing, and read
        // back the gated ending (a redirect included) each would get (#302).
        const stored = await storedEndingFor(repeat.row, resolved.definition, gate.provider, system);
        if (!stored) {
          return report(refusal(SUBMIT_FAILED_MESSAGE));
        }
        return report({ success: true, responseId: repeat.row.ID, status: repeat.row.Status, outcome: 'ended', errors: [], ...stored });
      }
    }
    timer.mark('dedupe');

    // The cheap early refusal for a link that is already full; the decision under concurrency is the
    // atomic UPDATE inside the transaction.
    if (preliminary.terminalCompletion && distributionQuotaExceeded(resolved.distribution)) {
      return report(refusal(QUOTA_REACHED_MESSAGE));
    }
    timer.mark('quota');

    const vouched = await vouchForFiles(gate, resolved.distribution.ID, request.clientResponseId, request.answers);
    if (vouched.errors.length > 0) {
      return report({ success: false, outcome: 'continue', errors: vouched.errors });
    }
    // The verdict that writes and answers: over the answers that will be STORED. In lenient
    // provenance mode a stripped file is not an answer, so it must not fire a knockout, score, or
    // pick an ending either.
    const { knockout, partialKnockout, screenedOut, completionScreen, terminalCompletion } = verdictFor(
      resolved.definition,
      vouched.answers,
      complete,
    );
    const validated = validateAnswers(resolved.definition, vouched.answers, validationModeFor(complete, knockout));
    if (!validated.visibility.settled) {
      LogStatus(
        `[Forms] version ${resolved.version.ID}: visibility did not settle within its pass cap; ` +
          'the form has show rules that depend on each other with no stable answer.',
      );
    }
    if (validated.errors.length > 0) {
      return report({ success: false, outcome: 'continue', errors: validated.errors });
    }
    timer.mark('validate');

    const existing = await findExistingDraft(gate, resolved.version.ID, request.clientResponseId, scopedResponseId);
    timer.mark('find-partial');
    // The durable bound on rows no quota counts: a save that would CREATE a draft or a knockout row.
    if (!existing.response && !terminalCompletion) {
      const capped = await draftCeilingRefusal(gate, resolved.version.ID);
      if (capped) {
        return report(capped);
      }
    }
    timer.mark('partial-cap');

    // A save the knockout ends owes no automations — sealed, or about to be sealed by the final.
    const trigger = queuedTrigger(resolved.definition, screenedOut ? 'knockout' : complete ? 'completion' : 'partial');
    const queue = seams.queue ?? OUTBOX_RESPONSE_SUBMITTED;

    const committed = await this.commit({
      gate,
      resolved,
      request,
      complete,
      knockout,
      terminalCompletion,
      validated,
      existingResponseId: existing.response?.ID,
      scopedResponseId,
      trigger,
      queue,
    });
    if ('refused' in committed) {
      return report(refusal(committed.refused));
    }
    timer.mark('persist');

    // A sealed response's resume links die with it — every terminal status, detached and best-effort
    // after the commit (the response stands either way). Skipped on `deduped`: the request that
    // sealed the row did this.
    if (isTerminalResponseStatus(committed.status) && !committed.deduped) {
      void this.revokeSealedResponseInvites(committed.responseId, provider, system, seams);
    }
    timer.mark('revoke');

    // The response's automations run now, from this process — detached, after the commit, never
    // awaited: the respondent does not wait on them, and the 30-second sweep is only the safety net.
    if (committed.queuedEvent) {
      (seams.kick ?? ((responseId: string) => drainAfterCommit(responseId, provider, system)))(committed.responseId);
    }

    // The copy follows the PERSISTED status, not this request's verdict: a concurrent save may have
    // sealed the row differently, and a mismatched status/copy pair is resolved by the widget in
    // whichever direction it happens to look. A save that met an already-sealed row (`deduped` — an
    // autosave naming it, or a final that raced the seal) wrote nothing, so it is answered exactly
    // as the final-mode short-circuit above is: with the ending the ROW stored (#302).
    const ending =
      committed.deduped && isTerminalResponseStatus(committed.status)
        ? await storedEndingFor({ ID: committed.responseId, Status: committed.status, SourceMetadata: committed.sourceMetadata }, resolved.definition, provider, system)
        : endingFor(committed.status, resolved.definition.settings, completionScreen, knockout ?? partialKnockout);
    if (!ending) {
      return report(refusal(SUBMIT_FAILED_MESSAGE));
    }
    const ended = isTerminalResponseStatus(committed.status) || (partialKnockout !== undefined && committed.status === 'Partial');
    return report({
      success: true,
      responseId: committed.responseId,
      status: committed.status,
      outcome: ended ? 'ended' : 'continue',
      errors: [],
      ...ending,
    });
  }

  /**
   * The transaction: the form-level quota, the response and its answers and file links, the
   * distribution slot, and the outbox event — all of it or none of it. A refusal inside
   * (a quota, a foreign row) throws {@link SaveRefusal} so the rollback happens before it is answered.
   */
  private async commit(plan: CommitPlan): Promise<CommittedSave | { refused: string }> {
    const { gate, resolved, request } = plan;
    requireEntityTransactions(gate.provider, `Saving a response to ${request.distributionSlug}`);
    try {
      return await RunInEntityTransaction(gate.provider, async () => {
        const ownResponseId = plan.existingResponseId ?? (isValidUuid(request.clientResponseId) ? request.clientResponseId : undefined);
        if (plan.terminalCompletion && (await formQuotaReached(gate.provider, resolved.definition.formId, resolved.definition.settings, gate.system, ownResponseId))) {
          throw new SaveRefusal(QUOTA_REACHED_MESSAGE);
        }
        const persisted = await persistSubmission(
          gate.provider,
          {
            formId: resolved.definition.formId,
            formVersionId: resolved.version.ID,
            distributionId: resolved.distribution.ID,
            complete: plan.complete,
            disqualified: plan.knockout !== undefined,
            startedAt: request.startedAt,
            sessionId: gate.sessionId,
            sourceMetadata: buildSourceMetadata({
              sessionId: gate.sessionId,
              distributionId: resolved.distribution.ID,
              clientMeta: request.clientMeta,
              clientResponseId: request.clientResponseId,
              // The screen, not merely the fact: on the zero-answer knockout path this is the row's
              // entire content.
              disqualifiedByScreenId: plan.knockout?.id,
            }),
            answers: plan.validated.answers,
            existingResponseId: plan.existingResponseId,
            scopedResponseId: plan.scopedResponseId,
            clientResponseId: request.clientResponseId,
          },
          gate.system,
        );
        if (persisted.outcome === 'failed') {
          throw new SaveRefusal(persisted.message);
        }
        // The quota DECISION: one conditional UPDATE, serialised by the database on the row.
        if (persisted.completedNow && !(await consumeDistributionSlot(gate.provider, resolved.distribution.ID, gate.system))) {
          throw new SaveRefusal(QUOTA_REACHED_MESSAGE);
        }
        const payload = messageFor(plan, persisted);
        if (payload) {
          await plan.queue.Publish(payload, gate.provider, gate.system);
        }
        return { ...persisted, queuedEvent: payload !== null };
      });
    } catch (err) {
      if (err instanceof SaveRefusal) {
        return { refused: err.respondentMessage };
      }
      throw err;
    }
  }

  /**
   * Retire every live invite that could reopen a sealed response, on its own isolated provider —
   * never the request's, whose transaction is done, and never the process-global one (#260). Never
   * awaited: a response already committed must not fail, or slow down, because a credential could
   * not be retired. The failure goes to the log with the response id, never a token.
   */
  private async revokeSealedResponseInvites(
    responseId: string,
    provider: DatabaseProviderBase,
    system: UserInfo,
    seams: SubmissionSeams,
  ): Promise<void> {
    try {
      if (seams.revokeInvites) {
        await seams.revokeInvites({ responseId, deviceOnly: false });
        return;
      }
      await withIsolatedProvider(
        `revoke resume links of sealed response ${responseId}`,
        (isolated) => revokeResponseInvites(responseId, { deviceOnly: false }, system, isolated),
        provider,
      );
    } catch (err) {
      LogError(`[Forms] could not retire the resume links of sealed response ${responseId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The elevated principal: MJ's system user, or a refusal to run without one. */
  private systemUserFor(seams: SubmissionSeams): UserInfo {
    const system = seams.systemUser ?? UserCache.Instance.GetSystemUser();
    if (!system) {
      throw new Error('MJ has no system user on this host, so a respondent save has no principal to read and write as.');
    }
    return system;
  }
}

/** What the answers decide about a save before anything is written. */
interface SaveVerdict {
  /** The knockout screen these answers reach, on any save. */
  readonly screenedOut: PublishedFormScreen | undefined;
  /** The knockout a FINAL save seals (see the header: a partial one never seals). */
  readonly knockout: PublishedFormScreen | undefined;
  /** The knockout a PARTIAL save is answered `ended` with, staying a draft. */
  readonly partialKnockout: PublishedFormScreen | undefined;
  /**
   * The ending a COMPLETION of these answers gets — the outcome's own screen, or, when the answers
   * reach a knockout, the ordinary ending they would otherwise reach. Read only when the row turns
   * out `Complete` (a concurrent request sealed it first): it must never be knockout copy, whatever
   * kind of save this is (review minor 3).
   */
  readonly completionScreen: PublishedFormScreen | undefined;
  /** A final save that reaches no knockout: the one that takes a quota slot and owes OnComplete. */
  readonly terminalCompletion: boolean;
}

/**
 * The whole verdict in one call, shared with the author's Preview so the two cannot disagree:
 * visibility settled to a fixed point, the score over the settled answerable questions, and the
 * outcome over the SETTLED answers (`resolveResponseOutcome`). Pure.
 */
function verdictFor(
  definition: ResolvedDefinition['definition'],
  answers: RespondentSaveRequest['answers'],
  complete: boolean,
): SaveVerdict {
  return verdictOver(definition, buildAnswerMap(answers), complete);
}

/** {@link verdictFor} over an answer map — the request's, or the one a sealed row stored. */
function verdictOver(definition: ResolvedDefinition['definition'], answers: ReadonlyMap<string, AnswerValue>, complete: boolean): SaveVerdict {
  const outcome = resolveResponseOutcome(definition, answers);
  const screenedOut = outcome.outcome.disqualified ? outcome.outcome.screen : undefined;
  return {
    screenedOut,
    knockout: complete ? screenedOut : undefined,
    partialKnockout: complete ? undefined : screenedOut,
    completionScreen: screenedOut
      ? resolveEndingScreen(definition.endScreens ?? [], outcome.visibility.answers, { score: outcome.score })
      : outcome.outcome.screen,
    terminalCompletion: complete && screenedOut === undefined,
  };
}

/**
 * What a recognised repeat of a sealed response is shown: the ending its STORED state earned.
 *  - `Disqualified`: the knockout screen the row was sealed on (`SourceMetadata.disqualifiedByScreenId`
 *    — a zero-answer knockout stores no answers, so the screen id is the row's whole verdict);
 *  - `Complete`: the completion ending its stored answers resolve to, by the same rule a fresh save
 *    uses, so an honest retry after a dropped network response lands where the first submit did.
 * `null` when the stored answers cannot be read: the caller refuses rather than guess.
 */
async function storedEndingFor(
  row: SealedRepeat['row'],
  definition: ResolvedDefinition['definition'],
  provider: DatabaseProviderBase,
  system: UserInfo,
): Promise<EndingFields | null> {
  if (row.Status === 'Disqualified') {
    const screenId = disqualifiedScreenIdOf(row);
    return sealedScreeningEnding((definition.endScreens ?? []).find((screen) => screen.id === screenId));
  }
  const stored = await loadStoredAnswerRows(provider, row.ID, system);
  if (!stored) {
    LogError(`[Forms] the stored answers of sealed response ${row.ID} could not be read, so its repeat submit is refused.`);
    return null;
  }
  const verdict = verdictOver(definition, buildConditionAnswers(definition, new CanonicalAnswers(stored)), true);
  return endingFor(row.Status, definition.settings, verdict.completionScreen, undefined);
}

/** The knockout screen a Disqualified row was sealed on, from its SourceMetadata; `undefined` if none is recorded. */
function disqualifiedScreenIdOf(row: SealedRepeat['row']): string | undefined {
  if (!row.SourceMetadata) {
    return undefined;
  }
  try {
    const meta = JSON.parse(row.SourceMetadata) as { disqualifiedByScreenId?: unknown };
    return typeof meta.disqualifiedByScreenId === 'string' ? meta.disqualifiedByScreenId : undefined;
  } catch (err) {
    LogError(`[Forms] sealed response ${row.ID} has unreadable SourceMetadata (${err instanceof Error ? err.message : String(err)}); its repeat shows the neutral screening sentence.`);
    return undefined;
  }
}

/** The verdict a payload the pre-scan refused is charged as: no knockout is known, only the mode. */
function malformedVerdict(complete: boolean): SaveVerdict {
  return { screenedOut: undefined, knockout: undefined, partialKnockout: undefined, completionScreen: undefined, terminalCompletion: complete };
}

/** A committed save, and whether it queued an outbox event (what the post-commit drain runs). */
type CommittedSave = Extract<PersistenceResult, { outcome: 'saved' }> & { queuedEvent: boolean };

/**
 * Drain one response's automation events on an isolated provider, detached. A failure is logged with
 * the response id and nothing else happens: the event stays in the outbox, and the sweep runs it.
 */
function drainAfterCommit(responseId: string, provider: DatabaseProviderBase, system: UserInfo): void {
  void drainAutomationOutbox({ reason: `post-commit of response ${responseId}`, responseId }, system, { source: provider }).catch((err: unknown) => {
    LogError(
      `[Forms] the automations of response ${responseId} did not run after its save (the sweep will run them): ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

/** The outbox event this save owes, given what persistence actually did — or none. */
function messageFor(plan: CommitPlan, persisted: Extract<PersistenceResult, { outcome: 'saved' }>): ResponseSubmittedPayload | null {
  if (!plan.trigger || persisted.deduped) {
    return null;
  }
  const base = {
    ResponseID: persisted.responseId,
    FormVersionID: plan.resolved.version.ID,
    FormDistributionID: plan.resolved.distribution.ID,
  };
  if (plan.trigger === 'OnComplete') {
    // Only a write that newly completed the row: a re-completion was queued when it first completed.
    return persisted.completedNow ? { ...base, Trigger: 'OnComplete', PartialSaveKey: null } : null;
  }
  return persisted.status === 'Partial' ? { ...base, Trigger: 'OnPartial', PartialSaveKey: partialSaveKey(plan.validated.answers) } : null;
}

/**
 * What the respondent is shown for a row in `status` — it follows the ROW, never this request's
 * verdict alone. A recognised repeat and a fresh save use this one rule:
 *  - `Disqualified`: the knockout screen this save tripped, else the neutral sentence — never the
 *    form's confirmation ("your response has been recorded" is untrue of a screening);
 *  - `Complete`: the completion's ending, even when THESE answers trip a knockout and a concurrent
 *    request sealed the row first — pairing a `Complete` status with a knockout's copy is a pair the
 *    widget resolves in whichever direction it looks;
 *  - a draft: nothing — unless these answers trip a knockout, when it is that screen (the form ends,
 *    and the client's final submit seals the row).
 */
function endingFor(
  status: RespondentSaveResult['status'],
  settings: Pick<FormSettings, 'confirmationMessage' | 'redirectUrl'>,
  completionScreen: PublishedFormScreen | undefined,
  knockout: PublishedFormScreen | undefined,
): EndingFields {
  if (status === 'Disqualified') {
    return sealedScreeningEnding(knockout);
  }
  if (status === 'Complete') {
    return completionEnding(completionScreen, settings);
  }
  // A draft whose answers trip a knockout: the screen the form ends on, for the client to show and
  // seal with its final submit. Any other draft has not ended.
  return knockout ? disqualificationEnding(knockout) : {};
}

/**
 * What to append to the save's log line when it was refused — the respondent's own sentence,
 * verbatim, so the operator's line and what the respondent saw cannot describe different refusals.
 */
function refusalSuffix(result: RespondentSaveResult): string {
  if (result.success) {
    return '';
  }
  const reason = result.errors?.[0]?.message?.trim();
  return ` — REFUSED: ${reason || 'no reason given'}`;
}
