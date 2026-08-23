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

/** Salt for the one-way session hash; overridable via env, with a stable default. */
function sessionHashSalt(): string {
  return process.env.FORMS_SESSION_HASH_SALT?.trim() || 'mj-forms-source-metadata-v1';
}

/** One-way SHA-256 of the anonymous session id (never store the raw id). */
export function hashSessionId(sessionId: string): string {
  return createHash('sha256').update(`${sessionHashSalt()}:${sessionId}`).digest('hex');
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
 * Prefers the resolved client IP hash. `sessionId` is the fallback and NOT an equivalent — it
 * comes from the `x-session-id` header, so a caller who wants a fresh bucket simply asks for one.
 * The fallback exists so this stays correct in unit tests and in any deployment that has not
 * mounted `RequestIdentityMiddleware`; the pipeline says so out loud rather than degrading
 * quietly (see `warnOnceIfAbuseKeyingDegraded`).
 */
export function abuseIdentity(inputs: { clientIpHash?: string; sessionId: string }): string {
  const ipHash = inputs.clientIpHash?.trim();
  return ipHash ? `ip:${ipHash}` : `sid:${hashSessionId(inputs.sessionId)}`;
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
  const ua = inputs.clientMeta?.userAgent?.trim();
  if (ua) {
    meta.userAgent = ua;
  }
  const referrer = inputs.clientMeta?.referrer?.trim();
  if (referrer) {
    meta.referrer = referrer;
  }
  return meta;
}
