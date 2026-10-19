/**
 * The one salt behind BOTH privacy hashes, and the one warning that says it is the public default.
 *
 * WHERE IT LIVES. Two modules need it, in two packages: forms-server's `http/request-identity.ts`
 * (the pre-auth transport seam, which hashes the peer IP) and this package's
 * `submission/source-metadata.ts` (the respondent path, which hashes the session id). It lives here,
 * in the lower layer both can import — forms-server depends on this package, never the reverse — so
 * neither owns a fact the other needs. (It was in forms-server's `http/` until #303 Task 8 moved the
 * submit pipeline into this package.)
 *
 * The two sides MUST agree on the literal. They share a salt deliberately — a deployment has one
 * secret to set and rotate rather than two, one of which it will forget — and that is only safe
 * because each side tags its own preimage (`ip:` there, `sid:` in source-metadata). A second
 * spelling of the default would silently orphan every hash written under the first.
 */
import { LogStatus } from '@memberjunction/core';

/**
 * The built-in fallback salt — PUBLIC, since it ships in source.
 *
 * A deployment running on it gets hashes anyone with this repo can recompute, which quietly
 * weakens the "raw IPs and session ids are never stored" privacy property to "stored behind a
 * dictionary the world holds".
 *
 * Its VALUE is a compatibility constant, not a style choice: it feeds every stored `SourceMetadata`
 * hash and every abuse-bucket key, so changing the literal orphans every hash already in the
 * database and resets every live rate-limit bucket.
 */
export const DEFAULT_SESSION_HASH_SALT = 'mj-forms-source-metadata-v1';

let warnedAboutDefaultSalt = false;

/**
 * Say ONCE, loudly, when the privacy hashes are running on the built-in public salt.
 *
 * Mirrors `warnOnceIfAbuseKeyingDegraded`: the degraded mode is otherwise invisible — hashing keeps
 * working, rows keep filling, and the only symptom is that the stored hashes are reversible by
 * dictionary. Called at first USE (either hash side) rather than at boot, so a process that never
 * hashes anything never warns about it, and once per process rather than per hash, because a line
 * on every request is a line nobody reads.
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

/**
 * The configured salt, or the public default — warning once on the way past if it is the default.
 *
 * Both hash sides call THIS rather than each reading the environment variable themselves, so the
 * "which env var, what default, warn about it" decision exists once.
 */
export function sessionHashSalt(): string {
  const salt = process.env.FORMS_SESSION_HASH_SALT?.trim() || DEFAULT_SESSION_HASH_SALT;
  warnOnceIfDefaultHashSalt(salt);
  return salt;
}

/** Test-only: forget that the default-salt warning has been emitted. */
export function resetDefaultSaltWarningForTests(): void {
  warnedAboutDefaultSalt = false;
}
