/**
 * The sliding-window limiter's per-call limit override — the seam the upload endpoint uses to reuse
 * this one store with its OWN max/window instead of the public-submit config.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FormsRateLimiter } from '../rate-limit.service';
import { resetPublicSubmitConfigForTests } from '../config';

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
});

describe('FormsRateLimiter.check overrides', () => {
  it('applies a caller-supplied max instead of the submit-config default', () => {
    const key = 'upload:1.2.3.4';
    const overrides = { max: 2, windowMs: 60_000 };
    const now = 1_000;
    expect(FormsRateLimiter.Instance.check(key, now, overrides).allowed).toBe(true);
    expect(FormsRateLimiter.Instance.check(key, now, overrides).allowed).toBe(true);
    // Third within the window is refused under the override of 2 — the default is 5.
    const refused = FormsRateLimiter.Instance.check(key, now, overrides);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it('rolls the override window forward so a later attempt is admitted again', () => {
    const key = 'upload:5.6.7.8';
    const overrides = { max: 1, windowMs: 1_000 };
    expect(FormsRateLimiter.Instance.check(key, 0, overrides).allowed).toBe(true);
    expect(FormsRateLimiter.Instance.check(key, 500, overrides).allowed).toBe(false);
    // Past the 1s window, the earlier hit has aged out.
    expect(FormsRateLimiter.Instance.check(key, 2_000, overrides).allowed).toBe(true);
  });
});
