import { describe, it, expect, vi } from 'vitest';
import { ByteBudgetCache } from '../asset-byte-cache';

const bytes = (n: number, fill = 1): Buffer => Buffer.alloc(n, fill);

describe('ByteBudgetCache', () => {
  it('returns what was put', () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(10));
    expect(cache.Get('a')?.length).toBe(10);
  });

  it('never holds more than the budget, dropping the least recently used first', () => {
    const cache = new ByteBudgetCache(30, 20);
    cache.Put('a', bytes(10));
    cache.Put('b', bytes(10));
    cache.Get('a');
    cache.Put('c', bytes(15));
    expect(cache.Get('b')).toBeUndefined();
    expect(cache.Get('a')).toBeDefined();
    expect(cache.Get('c')).toBeDefined();
    expect(cache.TotalBytes).toBeLessThanOrEqual(30);
  });

  it('does not keep an object over the per-entry cap, and evicts nothing for it', () => {
    const cache = new ByteBudgetCache(100, 20);
    cache.Put('a', bytes(10));
    cache.Put('big', bytes(21));
    expect(cache.Get('big')).toBeUndefined();
    expect(cache.Get('a')).toBeDefined();
  });

  it('replacing a key does not double-count its bytes', () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(10));
    cache.Put('a', bytes(20));
    expect(cache.TotalBytes).toBe(20);
  });

  it('refuses limits that cannot hold anything', () => {
    expect(() => new ByteBudgetCache(10, 0)).toThrow();
    expect(() => new ByteBudgetCache(10, 20)).toThrow();
  });

  it('shares one load between concurrent misses for the same key', async () => {
    const cache = new ByteBudgetCache(100, 50);
    let release!: (b: Buffer) => void;
    const load = vi.fn(() => new Promise<Buffer>((resolve) => (release = resolve)));
    const first = cache.GetOrLoad('a', load);
    const second = cache.GetOrLoad('a', load);
    release(bytes(5));
    expect((await first).length).toBe(5);
    expect((await second).length).toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a failed load is not kept: every waiter sees the error and the next call loads again', async () => {
    const cache = new ByteBudgetCache(100, 50);
    const failing = vi.fn(async (): Promise<Buffer> => {
      throw new Error('provider down');
    });
    await expect(Promise.all([cache.GetOrLoad('a', failing), cache.GetOrLoad('a', failing)])).rejects.toThrow('provider down');
    expect(failing).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => bytes(3));
    expect((await cache.GetOrLoad('a', ok)).length).toBe(3);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('serves a kept key without calling the loader', async () => {
    const cache = new ByteBudgetCache(100, 50);
    cache.Put('a', bytes(4));
    const load = vi.fn(async () => bytes(9));
    expect((await cache.GetOrLoad('a', load)).length).toBe(4);
    expect(load).not.toHaveBeenCalled();
  });

  it('a load that finishes after Clear() does not remove a newer load for the same key', async () => {
    const cache = new ByteBudgetCache(100, 50);
    let failOld!: (e: Error) => void;
    const old = cache.GetOrLoad('a', () => new Promise<Buffer>((_r, reject) => (failOld = reject)));
    cache.Clear();
    let releaseNew!: (b: Buffer) => void;
    const newer = cache.GetOrLoad('a', () => new Promise<Buffer>((r) => (releaseNew = r)));
    failOld(new Error('stale load failed'));
    await expect(old).rejects.toThrow('stale load failed');
    const joined = vi.fn(async () => bytes(9));
    const third = cache.GetOrLoad('a', joined); // must join `newer`, not start a load
    releaseNew(bytes(2));
    expect((await newer).length).toBe(2);
    expect((await third).length).toBe(2);
    expect(joined).not.toHaveBeenCalled();
  });
});
