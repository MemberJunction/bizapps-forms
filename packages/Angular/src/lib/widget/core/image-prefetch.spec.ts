import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_PREFETCH_IMAGES,
  PREFETCH_TIMEOUT_MS,
  prefetchImages,
  type PrefetchEnv,
  type PrefetchImage,
} from './image-prefetch';

/** A fake image: records what the queue set, and lets the test fire load/error by hand. */
class FakeImage implements PrefetchImage {
  public src = '';
  public fetchPriority: 'high' | 'low' | 'auto' = 'auto';
  public decoding: 'async' | 'sync' | 'auto' = 'auto';
  public onload: ((ev: Event) => void) | null = null;
  public onerror: ((ev: Event) => void) | null = null;
  public load(): void { this.onload?.(new Event('load')); }
  public fail(): void { this.onerror?.(new Event('error')); }
}

function fakeEnv(opts: { saveData?: boolean } = {}) {
  const images: FakeImage[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const env: PrefetchEnv = {
    createImage: () => { const img = new FakeImage(); images.push(img); return img; },
    setTimeout: (fn, _ms) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    saveData: () => opts.saveData === true,
  };
  const fireTimers = (): void => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  return { env, images, timers, fireTimers };
}

const urls = (n: number): string[] => Array.from({ length: n }, (_, i) => `/forms/asset/img-${i}`);

describe('prefetchImages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requests one image at a time, in order, at low priority', () => {
    const { env, images } = fakeEnv();
    prefetchImages(urls(3), env);
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/forms/asset/img-0');
    expect(images[0].fetchPriority).toBe('low');
    expect(images[0].decoding).toBe('async');
    images[0].load();
    expect(images.map((i) => i.src)).toEqual(['/forms/asset/img-0', '/forms/asset/img-1']);
    images[1].load();
    images[2].load();
    expect(images).toHaveLength(3);
  });

  it(`stops at ${MAX_PREFETCH_IMAGES} images and says how many it skipped`, () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv();
    prefetchImages(urls(MAX_PREFETCH_IMAGES + 1), env);
    for (let i = 0; i < MAX_PREFETCH_IMAGES + 1 && images[i]; i++) {
      images[i].load();
    }
    expect(images).toHaveLength(MAX_PREFETCH_IMAGES);
    expect(debug).toHaveBeenCalledWith(`[Forms] Image prefetch capped at ${MAX_PREFETCH_IMAGES}; skipped 1`);
  });

  it('moves on when an image fails, and logs the URL', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv();
    prefetchImages(urls(2), env);
    images[0].fail();
    expect(images).toHaveLength(2);
    expect(debug).toHaveBeenCalledWith('[Forms] Image prefetch failed: /forms/asset/img-0');
  });

  it(`stops the whole queue when an image stalls for ${PREFETCH_TIMEOUT_MS} ms, without aborting it`, () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images, fireTimers } = fakeEnv();
    prefetchImages(urls(3), env);
    fireTimers();
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/forms/asset/img-0'); // left to finish into the HTTP cache
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(debug).toHaveBeenCalledWith(
      `[Forms] Image prefetch stopped: /forms/asset/img-0 took longer than ${PREFETCH_TIMEOUT_MS} ms; skipped 2 remaining`,
    );
  });

  it('a late load after the timeout starts nothing', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images, fireTimers } = fakeEnv();
    prefetchImages(urls(3), env);
    fireTimers();
    images[0].load();
    expect(images).toHaveLength(1);
  });

  it('cancel() after progress starts no more images and clears the in-flight one', () => {
    const { env, images } = fakeEnv();
    const handle = prefetchImages(urls(4), env);
    images[0].load();
    images[1].load();
    expect(images).toHaveLength(3);
    handle.cancel();
    expect(images[2].src).toBe('');
    images[2].load();
    expect(images).toHaveLength(3);
  });

  it('requests nothing when the browser asked to save data', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { env, images } = fakeEnv({ saveData: true });
    prefetchImages(urls(3), env);
    expect(images).toHaveLength(0);
    expect(debug).toHaveBeenCalledWith('[Forms] Image prefetch skipped: the browser asked to save data');
  });

  it('cancel() stops the queue, clears the timer and the in-flight image, and is idempotent', () => {
    const { env, images, timers } = fakeEnv();
    const handle = prefetchImages(urls(3), env);
    handle.cancel();
    expect(images[0].src).toBe('');
    expect(timers.size).toBe(0);
    images[0].load();
    expect(images).toHaveLength(1);
    expect(() => handle.cancel()).not.toThrow();
  });

  it('does nothing for an empty list', () => {
    const { env, images } = fakeEnv();
    prefetchImages([], env).cancel();
    expect(images).toHaveLength(0);
  });
});
