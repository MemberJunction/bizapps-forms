/**
 * The one salt behind BOTH privacy hashes, and the noise that says it is the public default.
 *
 * WHY IT LIVES IN `http/` RATHER THAN BESIDE EITHER HASH. Two modules need it: `request-identity.ts`
 * (the pre-auth transport seam, which hashes the peer IP) and `public-submit/source-metadata.service.ts`
 * (the feature, which hashes the session id). Putting it in the feature module and importing it back
 * into the transport one inverted the dependency — `public-submit/` already imports `http/` in two
 * places (`in-flight-limiter`, `request-identity`), so the reverse edge made a cycle one edit away
 * and dragged the feature layer into the pre-auth path. A shared fact used by both layers belongs in
 * the lower one.
 *
 * The two sides MUST agree on the literal. They share a salt deliberately — a deployment has one
 * secret to set and rotate rather than two, one of which it will forget — and that is only safe
 * because each side tags its own preimage (`ip:` there, `sid:` in source-metadata). A second
 * spelling of the default would silently orphan every hash written under the first.
 *
 * THE DEPLOYMENT KNOBS (both documented in `.env.example`):
 *  - `FORMS_SESSION_HASH_SALT`         the private salt itself. Unset, hashing falls back to the
 *                                      PUBLIC in-source default below, and the degradation is
 *                                      announced at ERROR level at EVERY boot
 *                                      ({@link enforceSessionHashSaltAtBoot}, called from the
 *                                      package index) and again at first hash use.
 *  - `FORMS_REQUIRE_SESSION_HASH_SALT` opt-in strictness: `true` makes a boot WITHOUT the salt
 *                                      fail outright instead of degrading. Off by default so
 *                                      existing deployments keep booting; production hosts
 *                                      should turn it on.
 */
import { LogError } from '@memberjunction/core';

/** Opt-in env flag: `true` refuses to boot when `FORMS_SESSION_HASH_SALT` is unset. */
export const REQUIRE_SESSION_HASH_SALT_ENV = 'FORMS_REQUIRE_SESSION_HASH_SALT';

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

/**
 * The one sentence both announcements share, so boot and first-use cannot drift into describing
 * two different problems. Logged at ERROR level on purpose: this is a weakened security property,
 * not a status line.
 */
const UNSET_SALT_MESSAGE =
  '[Forms] FORMS_SESSION_HASH_SALT is not set — session and IP privacy hashes are using the ' +
  'built-in PUBLIC default salt, so every stored privacy hash is DICTIONARY-RECOVERABLE: anyone ' +
  'with this repository can precompute the hash of any IP address or session id and match it ' +
  'against stored rows. Production deployments must set FORMS_SESSION_HASH_SALT to a private ' +
  'value, and may set FORMS_REQUIRE_SESSION_HASH_SALT=true to refuse to boot without one.';

let warnedAboutDefaultSalt = false;

/**
 * Say ONCE, at error level, when the privacy hashes are running on the built-in public salt.
 *
 * Mirrors `warnOnceIfAbuseKeyingDegraded`: the degraded mode is otherwise invisible — hashing keeps
 * working, rows keep filling, and the only symptom is that the stored hashes are reversible by
 * dictionary. Called at first USE (either hash side); once per process rather than per hash,
 * because a line on every request is a line nobody reads. The EVERY-BOOT announcement is
 * {@link enforceSessionHashSaltAtBoot}, which the package index calls at module load — this
 * first-use copy remains for a process that loads the hashing modules without the index.
 */
export function warnOnceIfDefaultHashSalt(salt: string): void {
  if (salt !== DEFAULT_SESSION_HASH_SALT || warnedAboutDefaultSalt) {
    return;
  }
  warnedAboutDefaultSalt = true;
  LogError(UNSET_SALT_MESSAGE);
}

/**
 * The boot-time half: announce the missing salt at ERROR level on EVERY boot, and — when the
 * deployment opted into `FORMS_REQUIRE_SESSION_HASH_SALT=true` — refuse to boot at all.
 *
 * Called from the package index at module load, so it runs each time the server starts rather
 * than once at the first hash, which on a quiet host could be hours after the operator stopped
 * reading the log. The throw is deliberate and opt-in: failing closed by default would brick
 * every existing deployment that has not set the salt, which is exactly the population the
 * every-boot error line exists to reach first.
 */
export function enforceSessionHashSaltAtBoot(env: Record<string, string | undefined> = process.env): void {
  if (env.FORMS_SESSION_HASH_SALT?.trim()) {
    return;
  }
  if ((env[REQUIRE_SESSION_HASH_SALT_ENV] ?? '').trim().toLowerCase() === 'true') {
    throw new Error(
      `[Forms] ${REQUIRE_SESSION_HASH_SALT_ENV}=true but FORMS_SESSION_HASH_SALT is not set. ` +
        'Refusing to boot: without a private salt every stored session/IP privacy hash is ' +
        'dictionary-recoverable. Set FORMS_SESSION_HASH_SALT to a private per-environment value, ' +
        `or unset ${REQUIRE_SESSION_HASH_SALT_ENV} to boot degraded on the public default salt.`,
    );
  }
  LogError(UNSET_SALT_MESSAGE);
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
