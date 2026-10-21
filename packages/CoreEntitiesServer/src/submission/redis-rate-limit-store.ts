/**
 * The shared rate-limit store: the same sliding windows as {@link MemoryRateLimitStore}, kept in
 * Redis so every MJAPI instance charges one count instead of each keeping its own.
 */
import { randomUUID } from 'node:crypto';
import type { RateLimitGate, RateLimitResult, RateLimitStore } from './rate-limit.js';

/** Every bucket key is this prefix followed by the gate key, verbatim. */
export const RATE_LIMIT_KEY_PREFIX = 'forms:ratelimit:';

/**
 * The narrow slice of a Redis client this store uses. ioredis's `Redis` (what
 * `RedisLocalStorageProvider.Client` returns) satisfies it structurally, so this package needs no
 * dependency on ioredis — and a spec can hand in a fake.
 */
export interface RateLimitRedisClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Consult every bucket, then charge every bucket or none — in ONE script, because Redis runs a
 * script atomically: no other instance's charge can land between this call's consult and its
 * charge, which two round trips could not promise.
 *
 * KEYS[i] = bucket key; ARGV[1] = now, ARGV[2] = windowMs, ARGV[3] = this hit's member,
 * ARGV[3 + i] = the max for KEYS[i]. Each bucket is a sorted set scored by hit time.
 *
 * Returns -1 when admitted, otherwise the longest wait in ms across the buckets that refused.
 */
const CHARGE_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local longestWait = -1

for i, key in ipairs(KEYS) do
  -- Inclusive bound: a hit exactly one window old is out, matching the memory store's
  -- ts > now - window filter.
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local count = redis.call('ZCARD', key)
  if count >= tonumber(ARGV[3 + i]) then
    local wait = 0
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest[2] then
      wait = tonumber(oldest[2]) + window - now
    end
    if wait < 0 then
      wait = 0
    end
    if wait > longestWait then
      longestWait = wait
    end
  end
end

if longestWait >= 0 then
  return math.floor(longestWait)
end

for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
end
return -1
`;

/**
 * A {@link RateLimitStore} in Redis, shared by every instance pointed at the same server.
 *
 * Guarantees what the memory store does, across instances: every gate is consulted before any is
 * charged, a refusal charges nothing to any bucket, and `retryAfterMs` is the longest wait across
 * the gates that refused — all in one atomic script. A bucket is a sorted set at
 * `forms:ratelimit:<gate key>` holding one member per hit, scored by the hit's time.
 *
 * The clock is the caller's `now`, not Redis's: every instance stamps hits with its own clock, so
 * instances sharing a Redis must agree on the time to well within a window, or one instance's
 * hits expire early (or late) in another's view.
 *
 * There is no key cap here, unlike the memory store: each charge sets the bucket's TTL to the
 * window, so a bucket nobody charges retires itself, and Redis's own memory limits govern the rest.
 * A refusal does not refresh that TTL — the hits it was refused over are still in the window, and
 * the bucket lives exactly as long as they count.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: RateLimitRedisClient) {}

  public async charge(gates: readonly RateLimitGate[], windowMs: number, now: number): Promise<RateLimitResult> {
    if (gates.length === 0) {
      return { allowed: true };
    }

    // The member carries a nonce, not just the timestamp: a sorted set holds each member once, so
    // two hits in the same millisecond — from two instances, or one busy one — would merge into
    // a single hit and undercount.
    const member = `${now}:${randomUUID()}`;
    const keys = gates.map((gate) => `${RATE_LIMIT_KEY_PREFIX}${gate.key}`);
    const maxes = gates.map((gate) => gate.max);

    // Rounded up to a whole millisecond: the script ends in PEXPIRE, which rejects a fraction —
    // after the ZADD has already run, with no rollback, leaving a key with no TTL and failing every
    // later charge. A window of 1500.5 ms becomes 1501 (never shorter than configured).
    const windowArg = Math.ceil(windowMs);

    const reply = await this.client.eval(CHARGE_SCRIPT, keys.length, ...keys, now, windowArg, member, ...maxes);

    if (reply === -1) {
      return { allowed: true };
    }
    if (typeof reply === 'number' && Number.isInteger(reply) && reply >= 0) {
      return { allowed: false, retryAfterMs: reply };
    }
    // Thrown rather than read as either answer: the limiter treats a throw as a Redis outage and
    // falls back to its in-process store, whereas guessing "allowed" would switch the cap off.
    throw new Error(
      `RedisRateLimitStore: the charge script for ${keys.length} gate(s) returned ${JSON.stringify(reply)}; expected -1 or a wait in ms`,
    );
  }
}
