/**
 * In-memory sliding-window rate limiter for public submissions, keyed by the
 * per-(session, distribution) identity from {@link rateLimitKey}.
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

/**
 * Per-call window/max override. Absent fields fall back to the public-submit config, so existing
 * submit callers pass nothing and are unaffected; the upload endpoint passes its OWN limits to
 * reuse this one sliding-window store rather than duplicating the algorithm.
 */
export interface RateLimitOverrides {
  max?: number;
  windowMs?: number;
}

export class FormsRateLimiter extends BaseSingleton<FormsRateLimiter> {
  /** key -> ascending list of submission timestamps (ms epoch) within the window. */
  private readonly hits = new Map<string, number[]>();

  public static get Instance(): FormsRateLimiter {
    return super.getInstance<FormsRateLimiter>();
  }

  /**
   * Record an attempt for `key` and decide whether it is allowed under the configured (or
   * overridden) window/max. Prunes expired timestamps as it goes.
   *
   * `overrides` lets a different caller (the upload endpoint) reuse this one store with its own
   * limits; when absent the public-submit config applies, preserving every existing caller.
   */
  public check(key: string, now: number = Date.now(), overrides?: RateLimitOverrides): RateLimitResult {
    const cfg = getPublicSubmitConfig();
    const rateLimitMax = overrides?.max ?? cfg.rateLimitMax;
    const rateLimitWindowMs = overrides?.windowMs ?? cfg.rateLimitWindowMs;
    const windowStart = now - rateLimitWindowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);

    if (recent.length >= rateLimitMax) {
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

/**
 * What to tell a respondent who has been rate-limited.
 *
 * The limiter computes exactly how long the wait is, and the pipeline used to throw that
 * away in favour of "please retry shortly" — the one thing a person cannot act on. They
 * cannot tell whether shortly means two seconds or an hour, so they either abandon a form
 * they have already filled in or sit there retrying, which is precisely the traffic the
 * limit exists to suppress.
 *
 * Rounded UP: naming twelve seconds when twelve and a half remain sends them straight back
 * into the same refusal, which reads as the message being a lie.
 */
export function rateLimitedMessage(retryAfterMs: number | undefined): string {
  if (!retryAfterMs || retryAfterMs <= 0) {
    return 'Too many submissions. Please wait a moment and try again.';
  }
  const seconds = Math.ceil(retryAfterMs / 1000);
  return `Too many submissions. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.`;
}
