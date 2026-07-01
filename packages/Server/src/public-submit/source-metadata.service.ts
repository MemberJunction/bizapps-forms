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
   * Anonymous session correlator. NOTE (investigated 2026-07): this is
   * `UserPayload.sessionId`, which MJ core populates from the `x-session-id` HTTP request
   * header (`@memberjunction/server` context.js `extractAuthInputs`), NOT from a JWT
   * `mj_sid` claim. The widget's plain-`fetch` transport does not send that header, so this
   * is routinely blank for public submissions — which is exactly why the client-generated
   * response id (below) is the authoritative dedupe/upsert key.
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
