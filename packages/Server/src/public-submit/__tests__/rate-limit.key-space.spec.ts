/**
 * The limiter's window store is keyed partly on values a public caller influences, so its key
 * space is an attack surface of its own: a caller who mints a new key per request grows the map
 * for as long as they keep going. It therefore has a cap — and the cap is only safe if it evicts
 * the RIGHT buckets. Evicting a bucket forgives whatever it had accumulated, so an eviction
 * policy that reaches for the buckets currently over their cap hands the budget back to exactly
 * the caller it was withholding it from.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

/** One gate for `key`, admitting a single hit per window. */
const gate = (key: string) => [{ key, max: 1 }];

describe('FormsRateLimiter key space', () => {
  it('keeps refusing a caller who keeps trying, however much other traffic churns', () => {
    // A refused request charges nothing, so it cannot be the thing that keeps a bucket alive.
    // If only successful charges did, the buckets that go stale first would be precisely the
    // saturated ones — and evicting them is a free budget reset for anyone willing to keep
    // hammering. This is the attacker's actual behaviour: refused, and trying again.
    process.env.FORMS_RATELIMIT_MAX_KEYS = '4';
    resetPublicSubmitConfigForTests();
    const limiter = FormsRateLimiter.Instance;

    expect(limiter.charge(gate('persistent-caller')).allowed).toBe(true);
    expect(limiter.charge(gate('persistent-caller')).allowed).toBe(false);

    for (const other of ['caller-2', 'caller-3', 'caller-4', 'caller-5', 'caller-6']) {
      limiter.charge(gate(other));
      limiter.charge(gate('persistent-caller')); // refused, and still trying
    }

    expect(limiter.charge(gate('persistent-caller')).allowed).toBe(false);
    delete process.env.FORMS_RATELIMIT_MAX_KEYS;
  });

  it('bounds the store by dropping buckets nobody is using any more', () => {
    process.env.FORMS_RATELIMIT_MAX_KEYS = '4';
    resetPublicSubmitConfigForTests();
    const limiter = FormsRateLimiter.Instance;

    limiter.charge(gate('abandoned-caller'));
    for (const other of ['caller-2', 'caller-3', 'caller-4', 'caller-5']) {
      limiter.charge(gate(other));
    }

    // Nothing has touched `abandoned-caller` since, so it is the one the cap gives up.
    expect(limiter.charge(gate('abandoned-caller')).allowed).toBe(true);
    delete process.env.FORMS_RATELIMIT_MAX_KEYS;
  });
});
