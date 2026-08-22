/**
 * Unit tests for the shared {@link InFlightLimiter} — the header-proof concurrency cap that both
 * the anonymous submit pipeline and the upload endpoint use to bound simultaneous work.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_IN_FLIGHT, InFlightLimiter } from '../in-flight-limiter';

describe('InFlightLimiter', () => {
  it('admits callers up to the limit, then refuses', () => {
    const limiter = new InFlightLimiter(2);
    expect(limiter.TryEnter()).toBe(true);
    expect(limiter.TryEnter()).toBe(true);
    // Third caller over a limit of two is refused — this is the bound a rotated header cannot defeat.
    expect(limiter.TryEnter()).toBe(false);
    expect(limiter.InFlight).toBe(2);
  });

  it('frees a slot on Exit so a later caller can enter', () => {
    const limiter = new InFlightLimiter(1);
    expect(limiter.TryEnter()).toBe(true);
    expect(limiter.TryEnter()).toBe(false);
    limiter.Exit();
    expect(limiter.InFlight).toBe(0);
    // Releases on completion, so an honest burst waits and retries into free capacity.
    expect(limiter.TryEnter()).toBe(true);
  });

  it('floors in-flight at zero so an unbalanced double-Exit cannot mint extra capacity', () => {
    const limiter = new InFlightLimiter(1);
    limiter.Exit();
    limiter.Exit();
    expect(limiter.InFlight).toBe(0);
    // One slot only — the stray Exits did not create a second.
    expect(limiter.TryEnter()).toBe(true);
    expect(limiter.TryEnter()).toBe(false);
  });

  it('defaults to a generous cap that never trips on real single-caller flows', () => {
    const limiter = new InFlightLimiter();
    for (let i = 0; i < DEFAULT_MAX_IN_FLIGHT; i++) {
      expect(limiter.TryEnter()).toBe(true);
    }
    expect(limiter.TryEnter()).toBe(false);
  });
});
