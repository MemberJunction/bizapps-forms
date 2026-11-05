/**
 * The Redis store is what makes the public-route caps hold across MJAPI instances, so its
 * guarantees are pinned against a REAL Redis, not a fake: the consult-and-charge is a Lua script,
 * and the properties that matter (nothing charged on a refusal, two hits in one millisecond
 * counting twice, the window boundary) live in that script, where only Redis can run them.
 *
 * Without `FORMS_TEST_REDIS_URL` the real-Redis block is skipped in a developer's shell, and FAILS
 * when `CI` is set (the guard test below); CI provides the URL. The few behaviours that never reach
 * Redis run everywhere, against a fake client.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { RATE_LIMIT_KEY_PREFIX, RedisRateLimitStore } from '../redis-rate-limit-store.js';

const url = process.env.FORMS_TEST_REDIS_URL;

describe('RedisRateLimitStore without Redis', () => {
  it('admits an empty gate set without calling Redis', async () => {
    const send = vi.fn(async () => -1);
    const store = new RedisRateLimitStore({ eval: send });

    await expect(store.charge([], 1000, 0)).resolves.toEqual({ allowed: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('throws when the script replies with something that is not a number', async () => {
    // The limiter falls back to its in-process store on a throw. Reading a garbled reply as
    // "allowed" would instead silently switch the cap off.
    const store = new RedisRateLimitStore({ eval: async () => 'OK' });

    await expect(store.charge([{ key: 'k', max: 1 }], 1000, 0)).rejects.toThrow(/OK/);
  });

  it('sends the window as an integer, because PEXPIRE rejects a fraction after the ZADD has run', async () => {
    // A fractional FORMS_RATELIMIT_WINDOW_MS would otherwise leave a key with no TTL.
    const send = vi.fn(async () => -1);
    const store = new RedisRateLimitStore({ eval: send });

    await store.charge([{ key: 'k', max: 1 }], 1500.5, 0);

    // eval(script, numKeys, ...keys, now, windowMs, member, ...maxes) with one key: window is arg 4.
    const windowArg = (send.mock.calls[0] as unknown[])[4];
    expect(windowArg).toBe(1501);
    expect(Number.isInteger(windowArg)).toBe(true);
  });

  it('lets an error from Redis propagate', async () => {
    const store = new RedisRateLimitStore({
      eval: async () => {
        throw new Error('connection refused');
      },
    });

    await expect(store.charge([{ key: 'k', max: 1 }], 1000, 0)).rejects.toThrow('connection refused');
  });
});

// In CI a missing URL must fail, not skip: a skipped Lua-script spec reads as green while testing
// nothing (turbo's strict env mode strips the variable unless turbo.json's `test` task declares it).
it.runIf(Boolean(process.env.CI) && !url)('FORMS_TEST_REDIS_URL must be set in CI', () => {
  throw new Error('FORMS_TEST_REDIS_URL is not set in CI, so the real-Redis rate-limit spec would be skipped.');
});

describe.skipIf(!url)('RedisRateLimitStore against a real Redis', () => {
  let provider: RedisLocalStorageProvider | undefined;

  /** The connected ioredis client; only reachable inside a test, after `beforeAll`. */
  const client = () => {
    if (!provider) {
      throw new Error('Redis provider was not created — beforeAll did not run');
    }
    return provider.Client;
  };

  /** A gate on a key no other test (or earlier run) has touched. */
  const freshGate = (max: number) => ({ key: `spec:${randomUUID()}`, max });
  const bucket = (key: string) => `${RATE_LIMIT_KEY_PREFIX}${key}`;

  beforeAll(() => {
    if (url) {
      provider = new RedisLocalStorageProvider({ url, enablePubSub: false });
    }
  });

  afterAll(async () => {
    try {
      await provider?.Disconnect();
    } finally {
      provider = undefined;
    }
  });

  it('refuses a gate at its max and charges nothing', async () => {
    const store = new RedisRateLimitStore(client());
    const gate = freshGate(2);

    expect(await store.charge([gate], 10_000, 1000)).toEqual({ allowed: true });
    expect(await store.charge([gate], 10_000, 1001)).toEqual({ allowed: true });
    const third = await store.charge([gate], 10_000, 1002);

    expect(third.allowed).toBe(false);
    expect(await client().zcard(bucket(gate.key))).toBe(2);
  });

  it('charges nothing when only the second of two gates is over its max', async () => {
    const store = new RedisRateLimitStore(client());
    const a = freshGate(5);
    const b = freshGate(1);
    await store.charge([b], 10_000, 1000);

    const result = await store.charge([a, b], 10_000, 1001);

    expect(result.allowed).toBe(false);
    expect(await client().zcard(bucket(a.key))).toBe(0);
    expect(await client().zcard(bucket(b.key))).toBe(1);
  });

  it('retryAfterMs is the longest wait across refused gates', async () => {
    const store = new RedisRateLimitStore(client());
    const a = freshGate(1);
    const b = freshGate(1);
    await store.charge([a], 10_000, 1000);
    await store.charge([b], 10_000, 5000);

    // A clears at 1000 + 10000 = 11000 (5000 away); B at 5000 + 10000 = 15000 (9000 away).
    expect(await store.charge([a, b], 10_000, 6000)).toEqual({ allowed: false, retryAfterMs: 9000 });
  });

  it('a hit older than the window no longer counts', async () => {
    const store = new RedisRateLimitStore(client());
    const gate = freshGate(1);
    await store.charge([gate], 1000, 0);

    // Exactly one window later the old hit is out — the same boundary as the memory store's
    // `ts > now - window` — so this one is admitted, and then it is the one that counts.
    expect(await store.charge([gate], 1000, 1000)).toEqual({ allowed: true });
    expect(await store.charge([gate], 1000, 1500)).toEqual({ allowed: false, retryAfterMs: 500 });
  });

  it('a bucket key has a TTL of at most the window', async () => {
    const store = new RedisRateLimitStore(client());
    const gate = freshGate(3);
    await store.charge([gate], 5000, Date.now());

    const ttl = await client().pttl(bucket(gate.key));

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5000);
  });

  it('two stores sharing one Redis see one combined count', async () => {
    // Two instances of the store stand in for two MJAPI instances: the count lives in Redis,
    // not in either store.
    const first = new RedisRateLimitStore(client());
    const second = new RedisRateLimitStore(client());
    const gate = freshGate(2);

    expect((await first.charge([gate], 10_000, 1000)).allowed).toBe(true);
    expect((await second.charge([gate], 10_000, 1001)).allowed).toBe(true);

    expect((await first.charge([gate], 10_000, 1002)).allowed).toBe(false);
    expect((await second.charge([gate], 10_000, 1002)).allowed).toBe(false);
  });

  it('two charges at the same now count twice', async () => {
    const store = new RedisRateLimitStore(client());
    const gate = freshGate(2);

    await store.charge([gate], 10_000, 1000);
    await store.charge([gate], 10_000, 1000);

    expect(await client().zcard(bucket(gate.key))).toBe(2);
    expect((await store.charge([gate], 10_000, 1000)).allowed).toBe(false);
  });
});
