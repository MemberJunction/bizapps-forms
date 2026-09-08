/**
 * The boot-time warning that a deployment is hashing on the built-in PUBLIC salt.
 *
 * The degraded mode is otherwise invisible: hashing keeps working, rows keep filling, and the
 * only symptom is that every stored session/IP hash can be recomputed by anyone holding this
 * repo — which quietly turns "raw IPs are never stored" into "stored behind a dictionary the
 * world has". Once per process, not per hash: a line on every request is a line nobody reads.
 *
 * `resetDefaultSaltWarningForTests` exists precisely so these can run independently; before this
 * spec it was exported and never called.
 *
 * `LogStatus` is captured with `vi.mock` + `vi.hoisted`, NOT `vi.spyOn(core, 'LogStatus')`.
 * `vi.spyOn` on a module export passes locally and fails in CI, and the difference is invisible
 * from here: in this dev workspace `@memberjunction/core` resolves to MJ's LINKED SOURCE
 * (`MJ/packages/MJCore/dist/index.js`), which Vitest transforms into a namespace whose properties
 * can be redefined. On a clean install it resolves to the published tarball, which Vitest
 * externalises as real ESM — and an ESM namespace object is frozen, so the spy throws
 * `Cannot redefine property: LogStatus`. Replacing the module sidesteps the difference entirely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logStatus } = vi.hoisted(() => ({ logStatus: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogStatus: logStatus,
}));

import { hashSessionId } from '../source-metadata.service';
import { hashClientIp } from '../../http/request-identity';
import {
  DEFAULT_SESSION_HASH_SALT,
  resetDefaultSaltWarningForTests,
  warnOnceIfDefaultHashSalt,
} from '../../http/hash-salt';

/** Only the default-salt warning; other LogStatus traffic must not make a count pass. */
function saltWarnings(): string[] {
  return logStatus.mock.calls
    .map((c) => String(c[0]))
    .filter((line) => line.includes('FORMS_SESSION_HASH_SALT'));
}

beforeEach(() => {
  resetDefaultSaltWarningForTests();
  delete process.env.FORMS_SESSION_HASH_SALT;
  logStatus.mockClear();
});

afterEach(() => {
  delete process.env.FORMS_SESSION_HASH_SALT;
  resetDefaultSaltWarningForTests();
});

describe('warnOnceIfDefaultHashSalt', () => {
  it('warns when the salt is the shipped public default', () => {
    warnOnceIfDefaultHashSalt(DEFAULT_SESSION_HASH_SALT);

    expect(saltWarnings()).toHaveLength(1);
    expect(saltWarnings()[0]).toMatch(/production deployments must set/i);
  });

  it('warns only ONCE however many times it is asked', () => {
    for (let i = 0; i < 50; i += 1) {
      warnOnceIfDefaultHashSalt(DEFAULT_SESSION_HASH_SALT);
    }

    expect(saltWarnings()).toHaveLength(1);
  });

  it('says nothing when the deployment set its own salt', () => {
    warnOnceIfDefaultHashSalt('a-private-per-deployment-salt');

    expect(saltWarnings()).toHaveLength(0);
  });
});

describe('the warning reaches both hashing sides', () => {
  it('fires on the IP hash', () => {
    hashClientIp('203.0.113.9');

    expect(saltWarnings()).toHaveLength(1);
  });

  it('fires on the session hash', () => {
    hashSessionId('some-session-id');

    expect(saltWarnings()).toHaveLength(1);
  });

  it('still fires only once across BOTH sides — they share one salt and one warning', () => {
    hashClientIp('203.0.113.9');
    hashSessionId('some-session-id');

    expect(saltWarnings()).toHaveLength(1);
  });

  it('stays silent on both sides once a salt is configured', () => {
    process.env.FORMS_SESSION_HASH_SALT = 'a-private-per-deployment-salt';

    hashClientIp('203.0.113.9');
    hashSessionId('some-session-id');

    expect(saltWarnings()).toHaveLength(0);
  });
});

describe('the default salt value itself', () => {
  it('has not changed, so hashes stored by older builds still match', () => {
    // This is a DATA-COMPATIBILITY pin, not a style assertion. The salt feeds every stored
    // `SourceMetadata` hash and every abuse bucket key; changing the literal silently orphans
    // every hash already in the database and resets every live rate-limit bucket.
    expect(DEFAULT_SESSION_HASH_SALT).toBe('mj-forms-source-metadata-v1');
  });
});
