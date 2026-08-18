import { describe, it, expect } from 'vitest';
import { hashSessionId, rateLimitKey } from '../source-metadata.service';

/**
 * Pins the rate-limit key's session semantics.
 *
 * These are contract tests, not tests that drove the implementation. They exist because the
 * blank-session collapse below was real, undocumented, and silently defeated three of the
 * repo's own smoke scripts: with no `x-session-id` header every request hashed to one value,
 * so all of a script's submissions shared a single 5-per-60s bucket while appearing to use a
 * fresh session per submission.
 */
describe('rateLimitKey session semantics', () => {
  const DIST = 'dist-1';

  it('gives distinct sessions distinct buckets within one distribution', () => {
    expect(rateLimitKey({ sessionId: 'session-a', distributionId: DIST })).not.toBe(
      rateLimitKey({ sessionId: 'session-b', distributionId: DIST }),
    );
  });

  it('keeps one session in one bucket across submissions', () => {
    expect(rateLimitKey({ sessionId: 'session-a', distributionId: DIST })).toBe(
      rateLimitKey({ sessionId: 'session-a', distributionId: DIST }),
    );
  });

  it('does not let distinct distributions share a bucket', () => {
    expect(rateLimitKey({ sessionId: 'session-a', distributionId: 'dist-1' })).not.toBe(
      rateLimitKey({ sessionId: 'session-a', distributionId: 'dist-2' })    );
  });

  it('COLLAPSES every blank-session client onto one bucket per distribution', () => {
    // The documented, deliberate consequence — not a defect, but the thing to understand
    // before concluding anything from a rate-limit result. Two different headerless clients
    // are indistinguishable here, so they throttle each other.
    const a = rateLimitKey({ sessionId: '', distributionId: DIST });
    const b = rateLimitKey({ sessionId: '', distributionId: DIST });
    expect(a).toBe(b);
    expect(a).not.toBe(rateLimitKey({ sessionId: 'session-a', distributionId: DIST }));
  });

  it('never stores the raw session id in the key', () => {
    expect(rateLimitKey({ sessionId: 'secret-session', distributionId: DIST })).not.toContain(
      'secret-session',
    );
  });

  it('hashes a blank session to a stable value rather than an empty string', () => {
    // A key of `dist:` would collide with anything else that produced an empty segment.
    expect(hashSessionId('')).toMatch(/^[0-9a-f]{64}$/);
  });
});
