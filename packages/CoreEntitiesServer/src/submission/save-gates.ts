/**
 * The gates a respondent save passes before anything is written — carried over from forms-server's
 * submit pipeline into `FormSubmissionEngine` unchanged in behaviour (#303 Task 8).
 *
 * Each is a separate, nameable question the engine asks in a fixed order (see the engine header):
 * is the payload well-formed, which rate buckets does it spend, is it a repeat of something already
 * sealed, which existing draft does it continue, would it breach the draft ceiling, and are its
 * files this respondent's own. None of them writes.
 */
import { LogError } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { FieldError, FormAnswerInput, PublishedFormScreen, ValidationMode } from '@mj-biz-apps/forms-entities';
import { evaluateProvenance, loadUploadLedger, provenanceIsStrict, type UploadLedgerRow } from '../uploads/upload-provenance.js';
import { getPublicSubmitConfig } from './config.js';
import { responseIsOurs } from './persistence.js';
import type { RateLimitGate } from './rate-limit.js';
import {
  countPartialResponses,
  findOwnedResponseById,
  findResponseById,
  findResumableResponseById,
  findScopedResponse,
  findSessionResponse,
} from './response-lookup.js';
import { RESUMABLE_RESPONSE_STATUSES, TERMINAL_RESPONSE_STATUSES, isTerminalResponseStatus } from './response-status.js';
import type { RespondentResponseStatus, RespondentSaveRequest, RespondentSaveResult } from './save-request.js';
import {
  abuseIdentity,
  autosaveRateLimitKey,
  completionCeilingKey,
  knockoutCeilingKey,
  rateLimitKey,
  saveCeilingKey,
  sessionIdentity,
} from './source-metadata.js';

/** Everything the gates read about the request beyond the save itself. */
export interface SaveGateContext {
  readonly provider: DatabaseProviderBase;
  /**
   * The ELEVATED reader — MJ's system user. The anonymous respondent can create responses but its
   * read grant is row-filtered to its own response, so dedupe, adoption and the counts run as this
   * principal, AFTER the operation's `Authorize` has admitted the caller.
   */
  readonly system: UserInfo;
  readonly sessionId: string;
  readonly clientIpHash?: string;
}

/** A refusal with one message, the shape every gate returns. */
export function refusal(message: string, errors?: FieldError[]): RespondentSaveResult {
  return { success: false, outcome: 'continue', errors: errors ?? [{ message }] };
}

/**
 * Explicit required-field validation of the request shape. Returns a clean refusal (never throws)
 * when a transport field is missing or malformed, so the widget always gets a rendered error — the
 * loud-failure backstop for contract drift between the widget, the operation and this engine.
 */
export function submissionShapeRefusal(request: RespondentSaveRequest): RespondentSaveResult | undefined {
  if (!request || typeof request !== 'object') {
    return refusal('Malformed submission.');
  }
  if (!isNonEmptyString(request.distributionSlug)) {
    return refusal('Missing form link (distributionSlug).');
  }
  if (!isNonEmptyString(request.formVersionId)) {
    return refusal('Missing form version (formVersionId).');
  }
  if (!Array.isArray(request.answers)) {
    return refusal('Missing answers.');
  }
  for (const answer of request.answers) {
    if (!answer || !isNonEmptyString(answer.questionId)) {
      return refusal('An answer is missing its question id.');
    }
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * How much of the rulebook this save is held to.
 *
 * A disqualified respondent legitimately stopped mid-form, so `isRequired` must not block the
 * terminal write that records the screening — but the answers they DID give are final, and are held
 * to their format. That distinction used to be a single boolean shared with autosave, which turned
 * format checking off on the one path that writes a permanent, never-revalidated row. `knockout` is
 * the screen a FINAL save seals; a partial save is a draft whatever its answers trip.
 */
export function validationModeFor(complete: boolean, knockout: PublishedFormScreen | undefined): ValidationMode {
  if (!complete) {
    return 'draft';
  }
  return knockout !== undefined ? 'screened-out' : 'complete';
}

/**
 * Which rate buckets this save must satisfy.
 *
 * Four, answering different questions. Only (a) is not an abuse control — it is keyed on a header the
 * caller chooses, so it shapes a real widget's behaviour and bounds nothing. The other three are keyed
 * on the resolved peer IP:
 *   (a) per (session, distribution) — charged only when the caller named a session (a blank session
 *       is every header-less caller at once), or when there is no address either, as the coarse
 *       per-distribution breaker. SPLIT by request kind (#271): a FINAL save (a completion or a
 *       knockout) spends `rateLimitMax`, an autosave `autosaveRateLimitMax`, so a respondent's own
 *       typing cannot spend the budget their Submit press needs.
 *   (b) per (caller, distribution), AUTOSAVES only — the ceiling on saves; it makes abuse cost
 *       ADDRESSES. Finals are bounded by (c) and (d) (gauntlet #272).
 *   (c) per (caller, distribution), completions only — tight, because a completion queues the
 *       on-submit automations (a confirmation email, an LLM run, entity upserts).
 *   (d) per (caller, distribution), KNOCKOUTS only — its own counter: a knockout runs none of (c)'s
 *       work, but each one leaves a PERMANENT row.
 */
export function rateLimitGatesFor(
  ctx: Pick<SaveGateContext, 'sessionId' | 'clientIpHash'>,
  distributionId: string,
  completion: boolean,
  knockout: boolean,
): RateLimitGate[] {
  const config = getPublicSubmitConfig();
  const identity = abuseIdentity(ctx.clientIpHash);
  const gates: RateLimitGate[] = [];
  if (sessionIdentity(ctx.sessionId) || !identity) {
    const session = { sessionId: ctx.sessionId, distributionId };
    gates.push(
      completion || knockout
        ? { key: rateLimitKey(session), max: config.rateLimitMax }
        : { key: autosaveRateLimitKey(session), max: config.autosaveRateLimitMax },
    );
  }
  if (!identity) {
    // No resolved IP, so (b), (c) and (d) have nothing to key on; omitted rather than keyed on
    // something weaker — see `abuseIdentity`.
    return gates;
  }
  if (!completion && !knockout) {
    gates.push({ key: saveCeilingKey(distributionId, identity), max: config.ipRateLimitMax });
  }
  if (completion) {
    gates.push({ key: completionCeilingKey(distributionId, identity), max: config.completionMax });
  }
  if (knockout) {
    gates.push({ key: knockoutCeilingKey(distributionId, identity), max: config.knockoutMax });
  }
  return gates;
}

/** A sealed row this caller already holds for the version, as the dedupe gate found it. */
export interface SealedRepeat {
  readonly row: { ID: string; Status: RespondentResponseStatus; SourceMetadata?: string | null };
}

/**
 * Detect a repeat of a save this caller has already had sealed, so the engine short-circuits to it.
 *
 * "Sealed" is any TERMINAL status — `Complete` or `Disqualified` — checked two ways, because the two
 * identities a caller carries have different lifetimes: the client response id is per-load, the
 * session outlives it. Either recognising the row is enough.
 *
 * WHOSE REPEAT IT IS is asked too (#100/#101): reporting a row's status is disclosure, and the id
 * alone proves nothing for a row that has an owner. The by-id branch asks `responseIsOurs` — THE
 * ownership rule — and a row that is not ours is simply not recognised; it carries on to the write,
 * where the one gate refuses it with the one message every ownership failure gets.
 *
 * A caller naming an id that belongs to NOBODY is answered as a fresh save, so "taken by someone
 * else" stays distinguishable from "free" — structural, because the client mints the primary key.
 *
 * Fail-CLOSED: a lookup error refuses the save rather than risk a second terminal row.
 */
export async function findSealedRepeat(
  ctx: SaveGateContext,
  formVersionId: string,
  clientResponseId: string | undefined,
  scopedResponseId: string | undefined,
): Promise<SealedRepeat | RespondentSaveResult | undefined> {
  if (clientResponseId) {
    const byId = await findResponseById(ctx.provider, { responseId: clientResponseId, formVersionId }, ctx.system);
    if (!byId.ok) {
      return refusal(STATUS_UNVERIFIED_MESSAGE);
    }
    if (
      byId.response &&
      responseIsOurs(byId.response, { sessionId: ctx.sessionId, scopedResponseId }) &&
      isTerminalResponseStatus(byId.response.Status)
    ) {
      return { row: byId.response };
    }
  }
  const existing = await findSessionResponse(
    ctx.provider,
    { formVersionId, sessionId: ctx.sessionId },
    TERMINAL_RESPONSE_STATUSES,
    ctx.system,
  );
  if (!existing.ok) {
    return refusal(STATUS_UNVERIFIED_MESSAGE);
  }
  return existing.response ? { row: existing.response } : undefined;
}

/** What a respondent is told when the dedupe lookup could not run. */
const STATUS_UNVERIFIED_MESSAGE = 'Could not verify submission status; please retry shortly.';

/**
 * Locate the draft this save should UPDATE or PROMOTE, honouring the widget's client response id.
 *
 *  0. THE SCOPED ROW WINS (#138): a resume session's JWT names its response; no version filter.
 *  1. A client id: the row this session owns, or — with no session — the row carrying the id in its
 *     `SourceMetadata` proof.
 *  2. Otherwise the plain session-key lookup.
 *
 * NOTHING HERE DECIDES OWNERSHIP (#78): it proposes a candidate, and persistence refuses one that
 * turns out to be foreign. Every lookup fails open to "no row", so persistence creates a fresh row
 * (or refuses, if the id is someone else's) rather than adopting an unverified one.
 */
export async function findExistingDraft(
  ctx: SaveGateContext,
  formVersionId: string,
  clientResponseId: string | undefined,
  scopedResponseId: string | undefined,
): Promise<{ response?: { ID: string } }> {
  if (scopedResponseId) {
    const scopedRow = await findScopedResponse(ctx.provider, { responseId: scopedResponseId }, ctx.system);
    if (scopedRow.ok && scopedRow.response) {
      return { response: scopedRow.response };
    }
    // Gone or already sealed: fall through — the write gate still decides what they may touch.
  }
  if (clientResponseId) {
    const owned = await findOwnedResponseById(
      ctx.provider,
      { responseId: clientResponseId, formVersionId, sessionId: ctx.sessionId },
      ctx.system,
    );
    if (owned.ok && owned.response) {
      return { response: owned.response };
    }
    if (!ctx.sessionId) {
      const resumable = await findResumableResponseById(ctx.provider, { responseId: clientResponseId, formVersionId }, ctx.system);
      if (resumable.ok && resumable.response) {
        return { response: resumable.response };
      }
    }
  }
  return findSessionResponse(ctx.provider, { formVersionId, sessionId: ctx.sessionId }, RESUMABLE_RESPONSE_STATUSES, ctx.system);
}

/**
 * Whether creating another row no quota bounds (a draft, or a knockout) for this version would breach
 * the hard ceiling — the only DURABLE bound on write abuse: the rate ceilings are per-window (and
 * per-process without Redis). Fail-CLOSED (a count error refuses); a disabled cap (<= 0) is a no-op.
 */
export async function draftCeilingRefusal(ctx: SaveGateContext, formVersionId: string): Promise<RespondentSaveResult | undefined> {
  const cap = getPublicSubmitConfig().maxPartialsPerVersion;
  if (cap <= 0) {
    return undefined;
  }
  const counted = await countPartialResponses(ctx.provider, { formVersionId }, ctx.system);
  if (!counted.ok) {
    return refusal('Could not save your progress right now. Please try again shortly.');
  }
  if (counted.count >= cap) {
    return refusal('This form is not accepting new drafts right now. Please try again later.');
  }
  return undefined;
}

/**
 * Reject (strict) or strip (lenient) any file answer whose upload cannot be vouched for.
 *
 * `__mj.File` has no owner column, so the foreign key proves only that the file exists — without this
 * a save could name any file in the instance. Read as the system user, on the request's provider:
 * the ledger is unreadable by the respondent on purpose. A failed LOOKUP fails the save rather than
 * waving the file through.
 *
 * Returns the answers to keep: in lenient mode an unverified file is DROPPED from the answer (a new
 * answer object — the caller's request is never mutated), and a required file question then fails
 * validation on its own terms.
 */
export async function vouchForFiles(
  ctx: SaveGateContext,
  distributionId: string,
  clientResponseId: string | undefined,
  answers: readonly FormAnswerInput[],
): Promise<{ errors: FieldError[]; answers: FormAnswerInput[] }> {
  const fileAnswers = answers.filter((a) => Boolean(a.fileId));
  if (fileAnswers.length === 0) {
    return { errors: [], answers: [...answers] };
  }
  const strict = provenanceIsStrict();
  let ledger: Map<string, UploadLedgerRow>;
  try {
    ledger = await loadUploadLedger(fileAnswers.map((a) => a.fileId as string), ctx.system, ctx.provider);
  } catch (error) {
    LogError(`[Forms] upload provenance lookup failed for distribution ${distributionId}: ${error instanceof Error ? error.message : String(error)}`);
    return { errors: [{ message: 'Your uploaded file could not be verified. Please try again.' }], answers: [...answers] };
  }
  const errors: FieldError[] = [];
  const kept = answers.map((answer) => {
    if (!answer.fileId) {
      return answer;
    }
    const verdict = evaluateProvenance(
      ledger.get(answer.fileId.trim().toLowerCase()),
      { fileId: answer.fileId, distributionId, clientResponseId, sessionId: ctx.sessionId },
      strict,
    );
    if (verdict.ok) {
      return answer;
    }
    if (strict) {
      errors.push({ questionId: answer.questionId, message: 'That file could not be verified as your upload.' });
      return answer;
    }
    LogError(`[Forms] stripped an unverified file answer (${verdict.failure}) on question ${answer.questionId}`);
    const { fileId: _dropped, ...rest } = answer;
    return rest;
  });
  return { errors, answers: kept };
}
