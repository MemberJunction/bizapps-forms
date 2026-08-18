/**
 * Per-session correlator for the smoke scripts, mirroring what the real widget sends.
 *
 * WHY THIS EXISTS. MJ core reads the `x-session-id` request header into
 * `UserPayload.sessionId`; the Forms submit pipeline hashes that into the rate-limit key
 * (`rateLimitKey` → `distributionId:sha256(salt + sessionId)`) and stores it as
 * `FormResponse.AnonymousSessionID`. The widget sends a distinct per-instance id
 * (`FormsGraphQLApiService.sessionId`), so real respondents each get their own bucket.
 *
 * The smoke scripts sent no such header. Every request therefore hashed to the SAME
 * constant — `sha256('mj-forms-source-metadata-v1:')` — so all of a script's submissions
 * shared one rate-limit bucket of 5-per-60s, no matter how many times it called
 * `newSession()`. `automation-semantics-path` issues 8 submissions and so could never pass;
 * `binding-path` issues exactly 5 and passed only when nothing else had touched the bucket
 * in the preceding minute. Verified against the dev DB: 214 of 225 response rows carry that
 * one constant hash, while the 11 rows that came from the real widget carry 11 distinct ones.
 *
 * A script that cannot reproduce the client's session semantics is not testing the
 * rate-limit behaviour it appears to exercise — the failure mode `.claude/rules/testing.md`
 * calls out: "a fixture that reproduces the thing under test is not a test of it."
 *
 * Keyed by the anonymous session token so that one logical session keeps one id across
 * calls (which the provenance test depends on: the uploading session must still be able to
 * submit), while a fresh `newSession()` gets a fresh one. The token itself is NEVER sent as
 * the id — it is a credential, and this header is telemetry.
 */
import { randomUUID } from 'node:crypto';

/** token -> stable, non-credential session id for that session. */
const sessionIds = new Map();

/**
 * The `x-session-id` value for a given anonymous session token. Stable per token, distinct
 * across tokens. Pass the result as the `x-session-id` header on every request a script makes.
 */
export function sessionIdFor(token) {
  const key = token ?? '';
  let id = sessionIds.get(key);
  if (!id) {
    id = randomUUID();
    sessionIds.set(key, id);
  }
  return id;
}
