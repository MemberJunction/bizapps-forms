/**
 * Builds the `FormResponse.SourceMetadata` JSON blob and the rate-limit/dedupe
 * identity key for a public submission.
 *
 * Design note on "IP-hash": the MJ resolver `AppContext` does NOT surface the raw
 * HTTP request (no `req`/`req.ip`), so we cannot read the client IP inside the
 * resolver. Instead we use the anonymous magic-link **session id** (`mj_sid`,
 * carried on `UserPayload.sessionId`) — the per-session correlator MJ designed for
 * exactly this — as the privacy-preserving identity for rate-limiting, dedupe, and
 * audit. It is salted+hashed before storage so the raw session id never lands in a
 * data row. UA + referrer come from the client-supplied `ClientMeta`.
 */
import { createHash } from 'node:crypto';
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
