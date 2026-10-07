import { describe, it, expect, vi } from 'vitest';
import { preloadImage, type ImageLoadEnv, type LoadableImage } from './image-load';

function fakeEnv() {
  const images: LoadableImage[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const env: ImageLoadEnv = {
    createImage: () => {
      const img: LoadableImage = { src: '', fetchPriority: 'auto', decoding: 'auto', onload: null, onerror: null };
      images.push(img);
      return img;
    },
    setTimeout: (fn) => { const h = next++; timers.set(h, fn); return h; },
    clearTimeout: (h) => { timers.delete(h); },
  };
  const fireTimers = (): void => { const fns = [...timers.values()]; timers.clear(); fns.forEach((fn) => fn()); };
  return { env, images, timers, fireTimers };
}

describe('preloadImage', () => {
  it('requests the url at the given priority, decoded off the main thread', () => {
    const { env, images } = fakeEnv();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady: () => undefined }, env);
    expect(images[0]).toMatchObject({ src: '/a', fetchPriority: 'high', decoding: 'async' });
  });

  it('a load reports ready and settled synchronously, once, and clears its timer', () => {
    const { env, images, timers } = fakeEnv();
    const onReady = vi.fn();
    const onSettle = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady, onSettle }, env);
    images[0].onload?.(new Event('load'));
    expect(onReady).toHaveBeenCalledExactlyOnceWith('loaded');
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('loaded');
    expect(timers.size).toBe(0);
    expect(images[0].onload).toBeNull();
  });

  it('an error reports failed — a broken image never holds anything up', () => {
    const { env, images } = fakeEnv();
    const onReady = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady }, env);
    images[0].onerror?.(new Event('error'));
    expect(onReady).toHaveBeenCalledExactlyOnceWith('failed');
  });

  it('a time-out reports timed out without aborting; onSettle still hears the real outcome', () => {
    const { env, images, fireTimers } = fakeEnv();
    const onReady = vi.fn();
    const onSettle = vi.fn();
    preloadImage('/a', { priority: 'high', waitMs: 3000, onReady, onSettle }, env);
    fireTimers();
    expect(onReady).toHaveBeenCalledExactlyOnceWith('timed out');
    expect(images[0].src).toBe('/a');
    images[0].onload?.(new Event('load'));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('loaded');
  });

  it('without onSettle, a time-out stops listening but leaves the download running', () => {
    const { env, images, fireTimers } = fakeEnv();
    preloadImage('/a', { priority: 'low', waitMs: 15000, onReady: () => undefined }, env);
    fireTimers();
    expect(images[0].src).toBe('/a');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('cancel aborts, calls nothing, and is idempotent', () => {
    const { env, images, timers } = fakeEnv();
    const onReady = vi.fn();
    const p = preloadImage('/a', { priority: 'low', waitMs: 3000, onReady }, env);
    p.cancel();
    p.cancel();
    expect(images[0].src).toBe('');
    expect(images[0].onload).toBeNull();
    expect(timers.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });
});
