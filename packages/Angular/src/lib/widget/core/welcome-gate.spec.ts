import { describe, it, expect, vi } from 'vitest';
import { gateWelcomeScreen, WELCOME_IMAGE_WAIT_MS, type WelcomeGateHooks } from './welcome-gate';
import type { ImageLoadEnv, LoadableImage } from './image-load';

function fakeEnv() {
  const images: LoadableImage[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const env: ImageLoadEnv = {
    createImage: () => {
      const img: LoadableImage = { src: '', fetchPriority: 'auto', decoding: 'auto', onload: null, onerror: null };
      images.push(img);
      return img;
    },
    setTimeout: (fn, ms) => { const h = next++; timers.set(h, { fn, ms }); return h; },
    clearTimeout: (h) => { timers.delete(h); },
  };
  const fireTimers = (): void => { const t = [...timers.values()]; timers.clear(); t.forEach((x) => x.fn()); };
  return { env, images, timers, fireTimers };
}
const hooks = (current = true): WelcomeGateHooks & { reveal: ReturnType<typeof vi.fn>; imagesSettled: ReturnType<typeof vi.fn> } => ({
  isCurrent: () => current,
  reveal: vi.fn(),
  imagesSettled: vi.fn(),
});

describe('gateWelcomeScreen', () => {
  it('waits three seconds at most', () => {
    expect(WELCOME_IMAGE_WAIT_MS).toBe(3000);
  });

  it('asks for every gated image at high priority, with the 3 s wait', () => {
    const { env, images, timers } = fakeEnv();
    gateWelcomeScreen(['/welcome', '/logo'], hooks(), env);
    expect(images.map((i) => [i.src, i.fetchPriority])).toEqual([['/welcome', 'high'], ['/logo', 'high']]);
    expect([...timers.values()].every((t) => t.ms === WELCOME_IMAGE_WAIT_MS)).toBe(true);
  });

  it('asks once for a url listed twice', () => {
    const { env, images } = fakeEnv();
    gateWelcomeScreen(['/same', '/same'], hooks(), env);
    expect(images).toHaveLength(1);
  });

  it('reveals only when the LAST image is ready, then reports them settled', () => {
    const { env, images } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen(['/welcome', '/logo'], h, env);
    images[0].onload?.(new Event('load'));
    expect(h.reveal).not.toHaveBeenCalled();
    images[1].onerror?.(new Event('error'));
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });

  it('a stalled image reveals at the wait limit, and settles only when it really finishes', () => {
    const { env, images, fireTimers } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen(['/welcome'], h, env);
    fireTimers();
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).not.toHaveBeenCalled();
    expect(images[0].src).toBe('/welcome'); // never aborted: the <img> about to render wants these bytes
    images[0].onload?.(new Event('load'));
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });

  it('a stale or destroyed load reveals nothing and starts nothing', () => {
    const { env, images } = fakeEnv();
    const h = hooks(false);
    gateWelcomeScreen(['/welcome'], h, env);
    images[0].onload?.(new Event('load'));
    expect(h.reveal).not.toHaveBeenCalled();
    expect(h.imagesSettled).not.toHaveBeenCalled();
  });

  it('with nothing to wait for, reveals and settles at once', () => {
    const { env } = fakeEnv();
    const h = hooks();
    gateWelcomeScreen([], h, env);
    expect(h.reveal).toHaveBeenCalledTimes(1);
    expect(h.imagesSettled).toHaveBeenCalledTimes(1);
  });
});
