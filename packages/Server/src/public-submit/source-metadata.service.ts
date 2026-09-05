/**
 * Builds the `FormResponse.SourceMetadata` JSON blob and the rate-limit/dedupe
 * identity key for a public submission.
 *
 * Design note on "IP-hash", CORRECTED. This file used to say the client IP was simply
 * unavailable — `AppContext` surfaces no `req`, so the resolver cannot read it — and concluded
 * that the session id was therefore the identity to rate-limit on. The premise is true and the
 * conclusion did not follow: the session id is `UserPayload.sessionId`, which MJ populates from
 * the `x-session-id` request HEADER, so keying an abuse control on it let any caller pick their
 * own bucket by sending a new value. The IP is reachable without a core fork — MJ mounts
 * `BaseServerMiddleware.GetPreAuthMiddleware()` ahead of both auth and Apollo, so
 * `RequestIdentityMiddleware` resolves the peer there and carries it in a request-scoped store
 * (`http/request-identity.ts`) the resolver reads.
 *
 * So the two identities now have separate jobs, and the distinction is the point:
 *   - session id — correlation and dedupe/upsert. Caller-supplied, still useful for that.
 *   - IP hash    — the abuse ceilings, and nothing else.
 * Both are salted+hashed before they reach a bucket key or a data row. UA + referrer come from
 * the client-supplied `ClientMeta`.
 */
import { createHash } from 'node:crypto';
import { LogStatus } from '@memberjunction/core';
import type { ClientMeta, JSONObject } from '@mj-biz-apps/forms-entities';

/**
 * The built-in fallback salt — PUBLIC, since it ships in source. A deployment running on it gets
 * hashes anyone with this repo can recompute, which quietly weakens the "raw IPs/session ids are
 * never stored" privacy property to "stored behind a dictionary the world holds". Named so the
 * warning below (and `http/request-identity.ts`, which shares the salt) compare against the one
 * constant rather than a second spelling that could drift.
 */
export const DEFAULT_SESSION_HASH_SALT = 'mj-forms-source-metadata-v1';

let warnedAboutDefaultSalt = false;

/**
 * Say ONCE, loudly, when the privacy hashes are running on the built-in public salt.
 *
 * Mirrors {@link warnOnceIfAbuseKeyingDegraded}: the degraded mode is otherwise invisible —
 * hashing keeps working, rows keep filling, and the only symptom is that the stored hashes are
 * reversible by dictionary. Called at first USE (either hash side) rather than at boot, so a
 * process that never hashes anything never warns about it.
 */
export function warnOnceIfDefaultHashSalt(salt: string): void {
  if (salt !== DEFAULT_SESSION_HASH_SALT || warnedAboutDefaultSalt) {
    return;
  }
  warnedAboutDefaultSalt = true;
  LogStatus(
    '[Forms] WARNING: FORMS_SESSION_HASH_SALT is not set — session and IP privacy hashes are using ' +
      'the built-in PUBLIC default salt, so they can be recomputed by anyone with the source. ' +
      'Production deployments must set FORMS_SESSION_HASH_SALT to a private value.',
  );
}

/** Test-only: forget that the default-salt warning has been emitted. */
export function resetDefaultSaltWarningForTests(): void {
  warnedAboutDefaultSalt = false;
}

/** Salt for the one-way session hash; overridable via env, with a stable default. */
function sessionHashSalt(): string {
  const salt = process.env.FORMS_SESSION_HASH_SALT?.trim() || DEFAULT_SESSION_HASH_SALT;
  warnOnceIfDefaultHashSalt(salt);
  return salt;
}

/**
 * One-way SHA-256 of the anonymous session id (never store the raw id).
 *
 * The `sid:` tag is domain separation, and it is not decorative: {@link hashClientIp} shares this
 * salt and tags its own preimage `ip:`, so without a tag here a caller could send
 * `x-session-id: ip:203.0.113.7` and produce a session hash byte-identical to that address's IP
 * hash. Nothing compares the two today, which is exactly why it would have gone unnoticed until
 * something did.
 */
export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(`${sessionHashSalt()}:sid:${sessionId}`).digest('hex');
}

/** Inputs available to the resolver for building source metadata. */
export interface SourceMetadataInputs {
  /**
   * Anonymous session correlator. This is `UserPayload.sessionId`, which MJ core populates
   * from the `x-session-id` HTTP request header (`@memberjunction/server` context.js
   * `extractAuthInputs`), NOT from a JWT `mj_sid` claim.
   *
   * CORRECTED 2026-08-18. This comment previously said "the widget's plain-`fetch` transport
   * does not send that header, so this is routinely blank for public submissions". The
   * widget DOES send it: `FormsGraphQLApiService.execute()` sets `x-session-id` to a
   * per-widget-instance id on every request including the submit mutation, and that service
   * is the wired-up transport (`widget/register-element.ts`). Confirmed against the dev DB —
   * the response rows that came from the real widget carry DISTINCT session hashes.
   *
   * It is still blank for any client that does not send the header (curl, a bespoke
   * integration, and — until they were fixed — this repo's own smoke scripts), so it remains
   * unsafe to rely on for correctness. That is why the client-generated response id (below)
   * is the authoritative dedupe/upsert key. The distinction matters: "the widget doesn't send
   * it" and "some clients don't send it" imply very different threat models, and the first
   * one was false.
   */
  sessionId: string;
  distributionId: string;
  clientMeta?: ClientMeta;
  /**
   * The widget's stable client response id. Recorded so a row created under a BLANK session
   * can still be safely re-adopted by that id on later autosaves (the id is a 122-bit random
   * UUID — unguessable — so possessing it is proof of ownership when no session exists).
   */
  clientResponseId?: string;
  /**
   * The ending screen that screened this respondent out, when one did.
   *
   * Recorded because a `Disqualified` row can be EMPTY. A knockout's `when` group is evaluated
   * against the RAW answer map while the answers that get stored are the rendered ones, so a jump
   * fires on an answer to a question the walk hid and that answer is dropped on the way to
   * persistence — measured: a `Disqualified` row with 0 answers. `validateSubmission` lets that
   * row through deliberately, on the stated grounds that it records the SCREENING rather than
   * answers; `Status` alone does not, on a form carrying more than one knockout screen. Without
   * this the row cannot say what screened them, which is the only question anyone reading a
   * disqualification record has.
   *
   * In the blob rather than a column because that is what this blob is for — a fact about one
   * submission with nowhere else to live, exactly like `clientResponseId` above. A column would
   * be the better home the day these are queried in bulk, and that day is a migration.
   */
  disqualifiedByScreenId?: string;
}

/**
 * The composite key used for per-(session, distribution) rate-limiting and dedupe.
 * Distinct distributions of the same form do not share a bucket.
 *
 * CONSEQUENCE OF A BLANK SESSION, worth knowing before you read a rate-limit result: an
 * empty `sessionId` hashes to one fixed value, so EVERY headerless client submitting to a
 * given distribution shares a single bucket. Real respondents are unaffected (the widget
 * sends a per-instance id), but any script or integration that omits `x-session-id` will
 * rate-limit itself and, worse, appear to be testing per-session behaviour while doing
 * nothing of the kind. `smoke/lib/session.mjs` exists because of exactly that.
 */
export function rateLimitKey(inputs: Pick<SourceMetadataInputs, 'sessionId' | 'distributionId'>): string {
  return `${inputs.distributionId}:${hashSessionId(inputs.sessionId)}`;
}

/**
 * The identity an abuse ceiling is keyed on: the one thing about a caller they did not choose.
 *
 * `undefined` when there is no resolved IP, and the ceilings are then simply not applied. There
 * IS another identifier to hand — `sessionId` — and falling back to it was the obvious thing to
 * do, but it is wrong twice over. It comes from the `x-session-id` header, so a caller wanting a
 * fresh bucket just asks for one, which is the defect these ceilings exist to close. Worse, MJ
 * leaves it BLANK for any client that omits the header, so every such caller would hash to one
 * value and share a single bucket — one of them could then refuse the form for all of them. A
 * ceiling that cannot tell callers apart is not a weaker ceiling, it is a denial-of-service with
 * extra steps. Declining to limit leaves the pre-existing per-session gate exactly as it was.
 *
 * Callers must announce the degraded mode rather than take it quietly — see
 * {@link warnOnceIfAbuseKeyingDegraded}.
 */
export function abuseIdentity(clientIpHash: string | undefined): string | undefined {
  const ipHash = clientIpHash?.trim();
  return ipHash ? `ip:${ipHash}` : undefined;
}

/**
 * The session a per-session gate may key on, or `undefined` when the caller named nobody.
 *
 * The distinction {@link abuseIdentity} draws for the ceilings, applied to the gate that predates
 * them. MJ populates `sessionId` from the `x-session-id` header and leaves it BLANK for every
 * client that omits one, so all of those callers hash to a single key — and that key belongs to
 * the TIGHTEST of the four buckets. Sharing it does not throttle abuse: it lets any one of those
 * callers spend the budget and refuse the form for all the others, with a message about traffic
 * that was never theirs. That is the failure `abuseIdentity` exists to decline to create, and the
 * one this gate had been quietly creating all along.
 *
 * Returned RAW rather than trimmed, so a caller who sends a real id keeps the exact bucket they
 * had before this predicate existed and the only behaviour that changes is the blank one.
 */
export function sessionIdentity(sessionId: string): string | undefined {
  return sessionId.trim() ? sessionId : undefined;
}

let warnedAboutDegradedKeying = false;

/**
 * Say ONCE, loudly, when the abuse ceilings are running on the session fallback.
 *
 * Without this the degraded mode is invisible: the pipeline keeps working, the limits keep
 * appearing to fire, and the only symptom is that they can be walked around — which is exactly
 * the state this whole seam was built to end. Once per process, not per request, because a line
 * on every submission is a line nobody reads.
 */
export function warnOnceIfAbuseKeyingDegraded(clientIpHash: string | undefined): void {
  if (clientIpHash?.trim() || warnedAboutDegradedKeying) {
    return;
  }
  warnedAboutDegradedKeying = true;
  LogStatus(
    '[Forms] WARNING: no resolved client IP for a public submission — abuse ceilings are falling ' +
      'back to the client-supplied session id, which a caller can rotate. Confirm ' +
      'RequestIdentityMiddleware is registered (it ships in @mj-biz-apps/forms-server).',
  );
}

/** Test-only: forget that the warning has been emitted. */
export function resetAbuseKeyingWarningForTests(): void {
  warnedAboutDegradedKeying = false;
}

/**
 * Ceiling on SAVES (partial autosaves included) for one caller on one distribution.
 *
 * Scoped to the distribution as well as the caller so that abusing one form cannot throttle the
 * same person's submission to an unrelated one, and prefixed so it can never collide with the
 * composite per-session key above (which is `<distId>:<hash>`).
 */
export function saveCeilingKey(distributionId: string, identity: string): string {
  return `save:${distributionId}:${identity}`;
}

/**
 * Ceiling on COMPLETIONS for one caller on one distribution — a distinct bucket from
 * {@link saveCeilingKey}, charged only when a submission is final, so a respondent's autosaves
 * can never consume the budget that bounds the expensive on-submit work.
 */
export function completionCeilingKey(distributionId: string, identity: string): string {
  return `done:${distributionId}:${identity}`;
}

/**
 * Bucket for DISQUALIFYING submits, per (caller, distribution).
 *
 * Its own bucket, deliberately. Sharing the completion one let a burst of ineligible respondents
 * behind a single address lock real completions out of a form — that bucket is tight because a
 * completion fires automations a knockout never fires. But leaving knockouts unthrottled was the
 * opposite mistake: each one writes a PERMANENT row, so the durable row ceiling fell an order of
 * magnitude faster than it was sized for. Its own bucket is the only answer that is neither.
 */
export function knockoutCeilingKey(distributionId: string, identity: string): string {
  return `knockout:${distributionId}:${identity}`;
}

/**
 * Ceiling on one client-supplied metadata string (userAgent, referrer) before storage.
 *
 * Both arrive verbatim from `ClientMeta` — a payload any caller writes — and land in the
 * `SourceMetadata` JSON blob on every response row. Real values are a few hundred characters;
 * without a cap a hostile caller could pad each row with megabytes of "user agent". Truncated
 * rather than rejected because the metadata is diagnostic, never load-bearing: a clipped value
 * still identifies the browser, and refusing the whole submission over it would cost answers.
 */
export const MAX_CLIENT_META_CHARS = 2048;

/** Trimmed and capped at {@link MAX_CLIENT_META_CHARS}; undefined when empty. */
function cappedClientMeta(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value ? value.slice(0, MAX_CLIENT_META_CHARS) : undefined;
}

/**
 * Assemble the structured `SourceMetadata` payload persisted on the FormResponse.
 * Only non-empty fields are included so the stored JSON stays compact.
 */
export function buildSourceMetadata(inputs: SourceMetadataInputs): JSONObject {
  const meta: JSONObject = {
    sessionHash: hashSessionId(inputs.sessionId),
    distributionId: inputs.distributionId,
  };
  const clientResponseId = inputs.clientResponseId?.trim();
  if (clientResponseId) {
    meta.clientResponseId = clientResponseId;
  }
  const disqualifiedByScreenId = inputs.disqualifiedByScreenId?.trim();
  if (disqualifiedByScreenId) {
    meta.disqualifiedByScreenId = disqualifiedByScreenId;
  }
  const ua = cappedClientMeta(inputs.clientMeta?.userAgent);
  if (ua) {
    meta.userAgent = ua;
  }
  const referrer = cappedClientMeta(inputs.clientMeta?.referrer);
  if (referrer) {
    meta.referrer = referrer;
  }
  return meta;
}
