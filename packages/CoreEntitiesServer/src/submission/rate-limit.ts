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
 * all import paths in the MJAPI process (per CLAUDE.md rule 6). It is the FIRST line
 * of defense in front of the per-distribution quota (which is the durable, DB-backed
 * cap). When MJ's LocalStorageProvider is Redis the windows are shared by every
 * instance on that Redis; otherwise — and during a Redis outage — each process keeps
 * its own.
 */
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { getPublicSubmitConfig } from './config.js';
import { RedisRateLimitStore } from './redis-rate-limit-store.js';

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

/**
 * How long a public request waits for Redis to answer a charge before it is charged to the
 * in-process store instead. MJ's ioredis client has `maxRetriesPerRequest: null` and an offline
 * queue, so a command sent just before the connection drops can wait until Redis comes back —
 * possibly forever — and the submit, autosave, redeem, upload or resume waiting on it would hang.
 * Two seconds is far above a healthy EVAL round trip and short enough that a respondent barely
 * notices. A reply that lands after the timeout still charges Redis, so a blip can count a hit
 * twice (Redis and memory): an over-count, never an under-count, which is the safe side.
 */
const REDIS_CHARGE_TIMEOUT_MS = 2_000;

/** The store the limiter charges, and — in shared mode — the provider whose connection it watches. */
interface PickedStore {
  store: RateLimitStore;
  redis?: RedisLocalStorageProvider;
}

export class FormsRateLimiter extends BaseSingleton<FormsRateLimiter> {
  /** Always kept: it is the memory-mode store and the shared mode's fallback during an outage. */
  private readonly memory = new MemoryRateLimitStore();
  /** Unset until the first charge picks; see {@link pickStore}. */
  private picked: PickedStore | undefined;
  /** True from a Redis outage's first fallback until the next charge Redis answers. */
  private inOutage = false;

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
   *
   * The first call picks the store (Redis when MJ's LocalStorageProvider is Redis, else memory). A
   * call that cannot reach Redis is charged to the in-process store instead, so an outage loosens
   * the caps to per-process rather than switching them off.
   */
  public async charge(gates: readonly RateLimitGate[], now: number = Date.now()): Promise<RateLimitResult> {
    const windowMs = getPublicSubmitConfig().rateLimitWindowMs;
    const picked = this.picked ?? this.pickStore();
    if (!picked.redis) {
      return picked.store.charge(gates, windowMs, now);
    }
    return this.chargeShared(picked.store, picked.redis, gates, windowMs, now);
  }

  /** Test-only: drop all recorded windows, and forget the picked store and any outage. */
  public resetForTests(): void {
    this.memory.reset();
    this.picked = undefined;
    this.inOutage = false;
  }

  /** Test-only: the store the first charge picked, or undefined before it. */
  public activeStoreForTests(): RateLimitStore | undefined {
    return this.picked?.store;
  }

  /**
   * Choose the store from MJ's LocalStorageProvider, and log the choice once.
   *
   * Lazy — on the first charge, never in the constructor — because MJ's server installs its Redis
   * provider (`SetLocalStorageProvider(new RedisLocalStorageProvider(...))`) only after engines
   * load. A limiter that chose at construction would see no Redis and stay per-process for good.
   */
  private pickStore(): PickedStore {
    const provider = this.readLocalStorageProvider();
    if (provider instanceof RedisLocalStorageProvider) {
      this.picked = { store: new RedisRateLimitStore(provider.Client), redis: provider };
      LogStatus('Forms rate limit: window counts are shared through Redis (RedisLocalStorageProvider).');
    } else {
      this.picked = { store: this.memory };
      LogStatus(describePerProcessPick(provider));
    }
    return this.picked;
  }

  /** MJ's LocalStorageProvider, or undefined when there is no metadata provider yet (early boot, unit tests). */
  private readLocalStorageProvider(): unknown {
    try {
      return Metadata.Provider?.LocalStorageProvider;
    } catch (error) {
      LogError(
        `Forms rate limit: could not read MJ's LocalStorageProvider (${errorMessage(error)}); window counts will be kept per process.`,
      );
      return undefined;
    }
  }

  /**
   * Charge Redis, or — while it is unreachable — the in-process store.
   *
   * During an outage the limit is per-process, which is what it was before Redis: each instance
   * caps on its own count. Looser than shared, but never off.
   */
  private async chargeShared(
    store: RateLimitStore,
    redis: RedisLocalStorageProvider,
    gates: readonly RateLimitGate[],
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult> {
    // Not sent at all while disconnected: MJ's ioredis client runs an offline queue with
    // maxRetriesPerRequest: null, so a command sent now would never settle and the request
    // awaiting it would hang.
    if (!redis.IsConnected) {
      this.recordFallback('Redis is disconnected');
      return this.memory.charge(gates, windowMs, now);
    }

    // Bounded: the IsConnected check above cannot cover a connection that drops after it, and the
    // offline queue would then hold this command until Redis reconnects. A timeout is an outage.
    let result: RateLimitResult;
    try {
      result = await withTimeout(store.charge(gates, windowMs, now), REDIS_CHARGE_TIMEOUT_MS, 'the Redis charge');
    } catch (error) {
      this.recordFallback(`the Redis charge failed: ${errorMessage(error)}`);
      return this.memory.charge(gates, windowMs, now);
    }
    this.recordRedisAnswered();
    return result;
  }

  /** Mark the outage, logging only its first fallback so a long outage cannot flood the log. */
  private recordFallback(reason: string): void {
    if (this.inOutage) {
      return;
    }
    this.inOutage = true;
    LogError(`Forms rate limit: ${reason}; window counts are kept per process until Redis answers again.`);
  }

  /** End the outage, if there was one, with a single recovery line. */
  private recordRedisAnswered(): void {
    if (!this.inOutage) {
      return;
    }
    this.inOutage = false;
    LogStatus('Forms rate limit: Redis recovered; window counts are shared through Redis again.');
  }
}

/**
 * The per-process pick's log line. A provider that says it is shared across processes but is not
 * a `RedisLocalStorageProvider` is named outright: the likely cause is a second copy of
 * `@memberjunction/redis-provider` making the `instanceof` miss, and this line is how an operator
 * finds out the caps are not shared.
 */
function describePerProcessPick(provider: unknown): string {
  const shared = (provider as { SharedAcrossProcesses?: unknown } | undefined)?.SharedAcrossProcesses === true;
  if (!shared) {
    return 'Forms rate limit: window counts are kept per process (no Redis LocalStorageProvider).';
  }
  const name = (provider as object).constructor?.name ?? 'unknown';
  return (
    `Forms rate limit: window counts are kept per process — the LocalStorageProvider (${name}) reports ` +
    'SharedAcrossProcesses but is not a RedisLocalStorageProvider from this copy of @memberjunction/redis-provider.'
  );
}

/**
 * `promise`'s outcome, or a rejection naming `what` once `ms` pass first. The timer is always
 * cleared and is unref'd, so it never keeps the process alive.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
