/**
 * In-memory sliding-window rate limiter for public submissions. Keyed either by the
 * per-(session, distribution) identity from {@link rateLimitKey} or by the per-distribution
 * global identity from {@link distributionRateLimitKey}. The latter is keyed solely on the
 * server-resolved distribution id, so it caps total volume per form even when a caller rotates
 * the client-supplied `x-session-id` header to land in a fresh per-session bucket every request.
 *
 * Implemented as a `BaseSingleton` so a single shared window store exists across
 * all import paths in the MJAPI process (per CLAUDE.md rule 6). This is a
 * best-effort, single-process limiter — it is the FIRST line of defense in front
 * of the per-distribution quota (which is the durable, DB-backed cap). A
 * distributed deployment would back this with a shared store; that is out of
 * Phase-1 scope.
 */
import { BaseSingleton } from '@memberjunction/global';
import { getPublicSubmitConfig } from './config';

/** Result of a rate-limit check; `retryAfterMs` is set only when limited. */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export class FormsRateLimiter extends BaseSingleton<FormsRateLimiter> {
  /** key -> ascending list of submission timestamps (ms epoch) within the window. */
  private readonly hits = new Map<string, number[]>();

  public static get Instance(): FormsRateLimiter {
    return super.getInstance<FormsRateLimiter>();
  }

  /**
   * Record an attempt for `key` and decide whether it is allowed under the
   * configured window/max. Prunes expired timestamps as it goes.
   *
   * `maxOverride` lets a caller enforce a cap other than the default per-session
   * `rateLimitMax` against the same store — used for the per-distribution global cap.
   */
  public check(key: string, now: number = Date.now(), maxOverride?: number): RateLimitResult {
    const { rateLimitMax, rateLimitWindowMs } = getPublicSubmitConfig();
    const max = maxOverride ?? rateLimitMax;
    const windowStart = now - rateLimitWindowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);

    if (recent.length >= max) {
      const oldest = recent[0];
      this.hits.set(key, recent);
      return { allowed: false, retryAfterMs: Math.max(0, oldest + rateLimitWindowMs - now) };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  /** Test-only: drop all recorded windows. */
  public resetForTests(): void {
    this.hits.clear();
  }
}
