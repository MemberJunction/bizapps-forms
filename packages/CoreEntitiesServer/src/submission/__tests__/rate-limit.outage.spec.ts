/**
 * A Redis outage must not switch the public-route caps off. Each charge that cannot reach Redis is
 * charged to the in-process store instead — per-process limits, as before Redis — and the outage
 * is logged once when it starts and once when it ends, not on every request in between.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogError, LogStatus, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { FormsRateLimiter } from '../rate-limit.js';

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

/** What the fake Redis does: `connected` drives IsConnected, `failing` makes every eval throw. */
const redis = { connected: true, failing: false };
const send = vi.fn(async (): Promise<unknown> => {
  if (redis.failing) {
    throw new Error('ECONNRESET');
  }
  return -1;
});

function installFakeRedis(): void {
  const fake = Object.create(RedisLocalStorageProvider.prototype) as RedisLocalStorageProvider;
  Object.defineProperty(fake, 'Client', { get: () => ({ eval: send }) });
  Object.defineProperty(fake, 'IsConnected', { get: () => redis.connected });
  Metadata.Provider = { LocalStorageProvider: fake } as unknown as IMetadataProvider;
}

function recoveryLogs(): unknown[][] {
  return vi.mocked(LogStatus).mock.calls.filter(([message]) => /recovered/.test(String(message)));
}

const gate = [{ key: 'outage', max: 1 }];

describe('FormsRateLimiter during a Redis outage', () => {
  let previousProvider: IMetadataProvider;

  beforeEach(() => {
    previousProvider = Metadata.Provider;
    redis.connected = true;
    redis.failing = false;
    send.mockClear();
    vi.mocked(LogError).mockClear();
    vi.mocked(LogStatus).mockClear();
    FormsRateLimiter.Instance.resetForTests();
    installFakeRedis();
  });

  afterEach(() => {
    Metadata.Provider = previousProvider;
    FormsRateLimiter.Instance.resetForTests();
  });

  it('charges the in-process store for a call Redis fails, and logs the outage', async () => {
    redis.failing = true;

    await expect(FormsRateLimiter.Instance.charge(gate)).resolves.toEqual({ allowed: true });
    // Still failing: refused, because the memory store holds the first call's hit.
    const second = await FormsRateLimiter.Instance.charge(gate);

    expect(second.allowed).toBe(false);
    expect(LogError).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(LogError).mock.calls[0][0])).toMatch(/ECONNRESET/);
  });

  it('does not log again for further failures in the same outage', async () => {
    redis.failing = true;

    await FormsRateLimiter.Instance.charge(gate);
    await FormsRateLimiter.Instance.charge(gate);
    await FormsRateLimiter.Instance.charge(gate);

    expect(LogError).toHaveBeenCalledTimes(1);
  });

  it('goes back to Redis once it answers again, and logs the recovery once', async () => {
    redis.failing = true;
    await FormsRateLimiter.Instance.charge(gate);

    redis.failing = false;
    send.mockClear();
    send.mockResolvedValueOnce(2500);
    const answer = await FormsRateLimiter.Instance.charge(gate);
    await FormsRateLimiter.Instance.charge(gate);

    expect(send).toHaveBeenCalledTimes(2);
    expect(answer).toEqual({ allowed: false, retryAfterMs: 2500 });
    expect(recoveryLogs()).toHaveLength(1);
  });

  it('does not send to a disconnected client, and charges the in-process store instead', async () => {
    redis.connected = false;

    await expect(FormsRateLimiter.Instance.charge(gate)).resolves.toEqual({ allowed: true });
    const second = await FormsRateLimiter.Instance.charge(gate);

    expect(send).not.toHaveBeenCalled();
    expect(second.allowed).toBe(false);
    expect(LogError).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(LogError).mock.calls[0][0])).toMatch(/disconnected/);
  });
});
