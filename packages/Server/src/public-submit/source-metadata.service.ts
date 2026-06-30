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
  /** Anonymous session id (`mj_sid`) from the magic-link UserPayload. */
  sessionId: string;
  distributionId: string;
  clientMeta?: ClientMeta;
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
