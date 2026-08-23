/**
 * In-memory sliding-window rate limiter for the public routes.
 *
 * Consulted through a SET of gates rather than one key, because a public submission has to
 * satisfy several caps at once and they are keyed differently on purpose: a per-session cap
 * (fine-grained, but keyed on a value the caller supplies, so it bounds a well-behaved client
 * and nothing else) and a per-IP ceiling (keyed on the resolved peer, so it is the one a caller
 * cannot rotate away from). Keeping them as gates in one call is what lets a rejection charge
 * NOTHING to any bucket — checking then recording key-by-key charged the first bucket for a
 * request the second was about to refuse.
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

/** One bucket to consult: which window, and the cap that applies to it. */
export interface RateLimitGate {
  key: string;
  max: number;
}

export class FormsRateLimiter extends BaseSingleton<FormsRateLimiter> {
  /** key -> ascending list of hit timestamps (ms epoch) within the window. */
  private readonly hits = new Map<string, number[]>();

  public static get Instance(): FormsRateLimiter {
    return super.getInstance<FormsRateLimiter>();
  }

  /**
   * Would every gate admit one more hit right now? A pure read — deciding and charging are
   * separate calls so a caller can consult several buckets and charge none of them.
   *
   * `retryAfterMs` is the longest wait across the gates that refused, because the caller has to
   * clear all of them, not the nearest one.
   */
  public wouldAllowAll(gates: readonly RateLimitGate[], now: number = Date.now()): RateLimitResult {
    const { rateLimitWindowMs } = getPublicSubmitConfig();
    let retryAfterMs: number | undefined;

    for (const gate of gates) {
      const recent = this.recentHits(gate.key, now);
      if (recent.length >= gate.max) {
        const wait = Math.max(0, recent[0] + rateLimitWindowMs - now);
        retryAfterMs = Math.max(retryAfterMs ?? 0, wait);
      }
    }

    return retryAfterMs === undefined ? { allowed: true } : { allowed: false, retryAfterMs };
  }

  /** Charge one hit to each gate's bucket, pruning that bucket's expired timestamps. */
  public recordAll(gates: readonly RateLimitGate[], now: number = Date.now()): void {
    for (const gate of gates) {
      const recent = this.recentHits(gate.key, now);
      recent.push(now);
      // delete-then-set moves the bucket to the end of the Map's insertion order, which is what
      // makes the eviction below least-recently-charged rather than oldest-ever-seen.
      this.hits.delete(gate.key);
      this.hits.set(gate.key, recent);
    }
    this.evictBeyondKeyCap();
  }

  /**
   * Drop the least recently charged buckets once the store exceeds its cap.
   *
   * Evicting a live bucket forgives whatever it had accumulated, which is the honest trade: the
   * alternative is a map a public caller can grow without bound by minting a key per request, and
   * an out-of-memory API refuses everyone rather than one caller. Under real load the cap is far
   * above the working set, so this only runs when something abnormal is happening.
   */
  private evictBeyondKeyCap(): void {
    const { rateLimitMaxKeys } = getPublicSubmitConfig();
    while (this.hits.size > rateLimitMaxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) {
        return;
      }
      this.hits.delete(oldest.value);
    }
  }

  /** This key's still-live timestamps, as a fresh array (never the stored one). */
  private recentHits(key: string, now: number): number[] {
    const windowStart = now - getPublicSubmitConfig().rateLimitWindowMs;
    return (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);
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
