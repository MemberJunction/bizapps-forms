/**
 * The limiter's window store is keyed partly on values a public caller influences, so its key
 * space is an attack surface of its own: a caller who mints a new key per request grows the map
 * for as long as they keep going. Windows expiring does not help — the timestamps inside a bucket
 * are pruned on access, but nothing ever removes the bucket.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

describe('FormsRateLimiter key space', () => {
  it('forgets the least recently charged bucket instead of growing without bound', () => {
    process.env.FORMS_RATELIMIT_MAX_KEYS = '4';
    resetPublicSubmitConfigForTests();
    const limiter = FormsRateLimiter.Instance;
    const gate = (key: string) => [{ key, max: 1 }];

    limiter.recordAll(gate('first-caller'));
    expect(limiter.wouldAllowAll(gate('first-caller')).allowed).toBe(false);

    // Four further callers, each minting its own bucket, push the first one out of the store.
    for (const key of ['caller-2', 'caller-3', 'caller-4', 'caller-5']) {
      limiter.recordAll(gate(key));
    }

    expect(limiter.wouldAllowAll(gate('first-caller')).allowed).toBe(true);
    expect(limiter.wouldAllowAll(gate('caller-5')).allowed).toBe(false);
    delete process.env.FORMS_RATELIMIT_MAX_KEYS;
  });
});
