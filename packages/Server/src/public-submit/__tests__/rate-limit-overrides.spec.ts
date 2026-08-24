/**
 * Two properties of the sliding-window limiter that its callers depend on: a gate applies the max
 * IT declares rather than the submit default, and the window really does roll forward.
 *
 * Originally written against a per-call `overrides` argument on `check()`. That seam is gone —
 * `charge()` takes a set of gates and each one carries its own `max`, so a caller with different
 * limits expresses them as a gate rather than as an override, and the upload route does exactly
 * that. The behaviour these tests pin is unchanged; only the way a caller asks for it is.
 *
 * The per-call `windowMs` override did not survive. The window is deployment-wide on purpose
 * (`FORMS_RATELIMIT_WINDOW_MS`): how long we remember a caller should not differ between two
 * routes the same respondent uses in one sitting. This exercises the knob instead.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  delete process.env.FORMS_RATELIMIT_WINDOW_MS;
  resetPublicSubmitConfigForTests();
});

describe('FormsRateLimiter gate limits', () => {
  it('applies the max a gate declares instead of the submit-config default', () => {
    const gate = [{ key: 'upload:1.2.3.4', max: 2 }];
    const now = 1_000;

    expect(FormsRateLimiter.Instance.charge(gate, now).allowed).toBe(true);
    expect(FormsRateLimiter.Instance.charge(gate, now).allowed).toBe(true);
    // Third within the window is refused under the gate's max of 2 — the submit default is 5.
    const refused = FormsRateLimiter.Instance.charge(gate, now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it('rolls the window forward so a later attempt is admitted again', () => {
    process.env.FORMS_RATELIMIT_WINDOW_MS = '1000';
    resetPublicSubmitConfigForTests();
    const gate = [{ key: 'upload:5.6.7.8', max: 1 }];

    expect(FormsRateLimiter.Instance.charge(gate, 0).allowed).toBe(true);
    expect(FormsRateLimiter.Instance.charge(gate, 500).allowed).toBe(false);
    // Past the 1s window, the earlier hit has aged out.
    expect(FormsRateLimiter.Instance.charge(gate, 2_000).allowed).toBe(true);
  });
});
