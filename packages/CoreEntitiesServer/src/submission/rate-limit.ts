/**
 * In-memory sliding-window rate limiter for the public routes.
 *
 * Consulted through a SET of gates in ONE call, because a public submission has to satisfy
 * several caps at once and they are keyed differently on purpose: a per-session cap
 * (fine-grained, but keyed on a value the caller supplies, so it bounds a well-behaved client
 * and nothing else) and a per-IP ceiling (keyed on the resolved peer, so it is the one a caller
 * cannot rotate away from). One call is what lets a refusal charge NOTHING to any bucket while
 * still marking all of them as in use — two obligations a caller consulting the gates by hand
 * would have to remember, and would eventually forget.
 *
 * Implemented as a `BaseSingleton` so a single shared window store exists across
 * all import paths in the MJAPI process (per CLAUDE.md rule 6). This is a
 * best-effort, single-process limiter — it is the FIRST line of defense in front
 * of the per-distribution quota (which is the durable, DB-backed cap). A
 * distributed deployment would back this with a shared store; that is out of
 * Phase-1 scope.
 */
import { BaseSingleton } from '@memberjunction/global';
import { getPublicSubmitConfig } from './config.js';

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

/**
 * Where the sliding windows live. ONE atomic consult-then-charge: every gate is consulted before
 * any is charged, a refusal charges nothing (but keeps the consulted buckets alive), and
 * `retryAfterMs` is the longest wait across the gates that refused.
 */
export interface RateLimitStore {
  charge(gates: readonly RateLimitGate[], windowMs: number, now: number): Promise<RateLimitResult>;
}

/** The in-process store: a Map of per-key hit timestamps, bounded by `rateLimitMaxKeys`. */
export class MemoryRateLimitStore implements RateLimitStore {
  /** key -> ascending list of hit timestamps (ms epoch) within the window. */
  private readonly hits = new Map<string, number[]>();

  // Async to satisfy the store seam; the body is synchronous, so nothing can interleave between
  // the consult and the charge and the pair stays atomic within this process.
  public async charge(gates: readonly RateLimitGate[], windowMs: number, now: number): Promise<RateLimitResult> {
    let retryAfterMs: number | undefined;

    for (const gate of gates) {
      const recent = this.recentHits(gate.key, windowMs, now);
      if (recent.length >= gate.max) {
        retryAfterMs = Math.max(retryAfterMs ?? 0, Math.max(0, recent[0] + windowMs - now));
      }
    }

    if (retryAfterMs !== undefined) {
      // Refused. Charge nothing — but mark every bucket as still in use, because a caller being
      // turned away is the caller we most need to keep remembering. Without this the only thing
      // keeping a bucket alive would be a SUCCESSFUL charge, so a saturated bucket would go stale
      // faster than an idle one and the key cap below would evict it — handing a caller a fresh
      // budget precisely for having exhausted the last one.
      for (const gate of gates) {
        this.markInUse(gate.key, windowMs, now);
      }
      return { allowed: false, retryAfterMs };
    }

    for (const gate of gates) {
      const recent = this.recentHits(gate.key, windowMs, now);
      recent.push(now);
      this.store(gate.key, recent);
    }
    this.evictBeyondKeyCap();
    return { allowed: true };
  }

  /** Drop all recorded windows. */
  public reset(): void {
    this.hits.clear();
  }

  /**
   * Refresh a bucket's place in the eviction order without charging it.
   *
   * Only refreshes a bucket that already exists: a gate with no history has nothing worth
   * remembering, and creating an empty entry for it would let a caller grow the store through
   * requests that were refused for some other reason entirely.
   */
  private markInUse(key: string, windowMs: number, now: number): void {
    if (this.hits.has(key)) {
      this.store(key, this.recentHits(key, windowMs, now));
    }
  }

  /**
   * Write a bucket back, moving it to the end of the Map's insertion order.
   *
   * The delete-then-set is what makes that order a USAGE order, which is what
   * {@link evictBeyondKeyCap} reads.
   */
  private store(key: string, stamps: number[]): void {
    this.hits.delete(key);
    this.hits.set(key, stamps);
  }

  /**
   * Drop the least recently used buckets once the store exceeds its cap.
   *
   * Eviction forgives whatever a bucket had accumulated, so the ORDER is the security property:
   * buckets go least-recently-USED, and every consult counts as a use — including a refusal. A
   * caller still being turned away therefore stays at the back of this queue for as long as they
   * keep trying, and what falls out is the buckets nobody has touched since.
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
  private recentHits(key: string, windowMs: number, now: number): number[] {
    const windowStart = now - windowMs;
    return (this.hits.get(key) ?? []).filter((ts) => ts > windowStart);
  }
}

export class FormsRateLimiter extends BaseSingleton<FormsRateLimiter> {
  private readonly memory = new MemoryRateLimitStore();

  public static get Instance(): FormsRateLimiter {
    return super.getInstance<FormsRateLimiter>();
  }

  /**
   * Consult every gate and, if all of them admit, charge one hit to each.
   *
   * ONE call rather than a check followed by a charge, because the two must not be separable.
   * Every gate has to be consulted before ANY is charged — otherwise a request the second gate
   * refuses has already spent the respondent's budget in the first — and a refusal has to keep
   * the buckets it consulted alive, which a caller who merely "checked" would forget to do. Both
   * obligations live in the store, so no call site can get them wrong.
   *
   * `retryAfterMs` is the longest wait across the gates that refused: the caller has to clear all
   * of them, not the nearest one.
   */
  public async charge(gates: readonly RateLimitGate[], now: number = Date.now()): Promise<RateLimitResult> {
    return this.memory.charge(gates, getPublicSubmitConfig().rateLimitWindowMs, now);
  }

  /** Test-only: drop all recorded windows. */
  public resetForTests(): void {
    this.memory.reset();
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
