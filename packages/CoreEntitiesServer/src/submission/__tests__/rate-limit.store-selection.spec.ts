/**
 * Which window store the limiter charges. MJ's server installs its Redis LocalStorageProvider
 * AFTER engines load, so the pick has to wait for the first charge: a limiter that chose at
 * construction would see no Redis and keep per-process counts for the life of the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryLocalStorageProvider, LogStatus, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { FormsRateLimiter, MemoryRateLimitStore } from '../rate-limit.js';
import { RedisRateLimitStore, type RateLimitRedisClient } from '../redis-rate-limit-store.js';

vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

/** A RedisLocalStorageProvider with no socket behind it: the client is whatever the spec passes. */
function fakeRedisProvider(client: RateLimitRedisClient): RedisLocalStorageProvider {
  const fake = Object.create(RedisLocalStorageProvider.prototype) as RedisLocalStorageProvider;
  Object.defineProperty(fake, 'Client', { get: () => client });
  Object.defineProperty(fake, 'IsConnected', { get: () => true });
  return fake;
}

function installLocalStorage(provider: unknown): void {
  Metadata.Provider = { LocalStorageProvider: provider } as unknown as IMetadataProvider;
}

const gate = [{ key: 'store-selection', max: 5 }];

describe('FormsRateLimiter store selection', () => {
  let previousProvider: IMetadataProvider;

  beforeEach(() => {
    previousProvider = Metadata.Provider;
    FormsRateLimiter.Instance.resetForTests();
    vi.mocked(LogStatus).mockClear();
  });

  afterEach(() => {
    Metadata.Provider = previousProvider;
    FormsRateLimiter.Instance.resetForTests();
  });

  it('keeps counts in memory when the LocalStorageProvider is not Redis', async () => {
    installLocalStorage(new InMemoryLocalStorageProvider());

    await FormsRateLimiter.Instance.charge(gate);

    expect(FormsRateLimiter.Instance.activeStoreForTests()).toBeInstanceOf(MemoryRateLimitStore);
  });

  it('shares counts through Redis when the LocalStorageProvider is a RedisLocalStorageProvider', async () => {
    const client = { eval: vi.fn(async () => -1) };
    installLocalStorage(fakeRedisProvider(client));

    await expect(FormsRateLimiter.Instance.charge(gate)).resolves.toEqual({ allowed: true });

    expect(FormsRateLimiter.Instance.activeStoreForTests()).toBeInstanceOf(RedisRateLimitStore);
    expect(client.eval).toHaveBeenCalledTimes(1);
  });

  it('picks on the first charge, so a provider installed after the limiter exists is still seen', async () => {
    const limiter = FormsRateLimiter.Instance;
    expect(limiter.activeStoreForTests()).toBeUndefined();

    const client = { eval: vi.fn(async () => -1) };
    installLocalStorage(fakeRedisProvider(client));
    await limiter.charge(gate);

    expect(limiter.activeStoreForTests()).toBeInstanceOf(RedisRateLimitStore);
  });

  it('keeps counts in memory, without throwing, when there is no metadata provider yet', async () => {
    Metadata.Provider = undefined as unknown as IMetadataProvider;

    await expect(FormsRateLimiter.Instance.charge(gate)).resolves.toEqual({ allowed: true });

    expect(FormsRateLimiter.Instance.activeStoreForTests()).toBeInstanceOf(MemoryRateLimitStore);
  });

  it('logs the pick once, not on every charge', async () => {
    installLocalStorage(new InMemoryLocalStorageProvider());

    await FormsRateLimiter.Instance.charge(gate);
    await FormsRateLimiter.Instance.charge(gate);

    expect(LogStatus).toHaveBeenCalledTimes(1);
    expect(vi.mocked(LogStatus).mock.calls[0][0]).toMatch(/per process/);
  });
});
