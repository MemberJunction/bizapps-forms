/**
 * Warm the browser cache with images the respondent will see on LATER screens, so a question
 * page or an ending screen does not wait for its image after it appears. Measured 2026-09-28 on
 * Slow 4G: an ending image painted 6.0 s after its text, because nothing asked for it until then.
 *
 * Why this works: asset responses are `Cache-Control: public, max-age=31536000, immutable`, so an
 * `<img>` created later with the same URL is served from cache with no request.
 *
 * One image at a time, on purpose. On a slow connection, parallel downloads split the bandwidth
 * with whatever the respondent is doing now, including submitting. A failed or stalled image is
 * skipped; the real `<img>` on that screen deals with its own failure.
 */

/** Most images one form load will prefetch. */
export const MAX_PREFETCH_IMAGES = 12;
/** An image still downloading after this long is abandoned so the queue keeps moving. */
export const PREFETCH_TIMEOUT_MS = 15_000;

/** The slice of `HTMLImageElement` the queue uses; a real `Image` satisfies it. */
export interface PrefetchImage {
  src: string;
  fetchPriority: 'high' | 'low' | 'auto';
  decoding: 'async' | 'sync' | 'auto';
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

/** Everything browser-specific, injectable so the queue is testable in node. */
export interface PrefetchEnv {
  createImage(): PrefetchImage;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
  /** True when the respondent's browser asked sites to save data. */
  saveData(): boolean;
}

export interface PrefetchHandle {
  /** Stop the queue and abandon the in-flight image. Safe to call more than once. */
  cancel(): void;
}

/** `navigator.connection` is not in TypeScript's DOM lib (Chromium-only API). */
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };

const browserEnv: PrefetchEnv = {
  createImage: () => new Image(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  saveData: () => (navigator as NavigatorWithConnection).connection?.saveData === true,
};

/** Start prefetching `urls` in order. Returns a handle that stops it. */
export function prefetchImages(urls: readonly string[], env: PrefetchEnv = browserEnv): PrefetchHandle {
  let cancelled = false;
  let current: PrefetchImage | null = null;
  let timer: number | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      env.clearTimeout(timer);
      timer = null;
    }
  };
  const handle: PrefetchHandle = {
    cancel: () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      clearTimer();
      if (current) {
        current.onload = null;
        current.onerror = null;
        current.src = '';
        current = null;
      }
    },
  };

  if (urls.length === 0) {
    return handle;
  }
  if (env.saveData()) {
    console.debug('[Forms] Image prefetch skipped: the browser asked to save data');
    return handle;
  }
  const queue = urls.slice(0, MAX_PREFETCH_IMAGES);
  if (urls.length > MAX_PREFETCH_IMAGES) {
    console.debug(`[Forms] Image prefetch capped at ${MAX_PREFETCH_IMAGES}; skipped ${urls.length - MAX_PREFETCH_IMAGES}`);
  }

  let index = 0;
  const startNext = (): void => {
    if (cancelled || index >= queue.length) {
      current = null;
      return;
    }
    const url = queue[index++];
    const img = env.createImage();
    current = img;
    let settled = false;
    const settle = (outcome: 'loaded' | 'failed' | 'timed out'): void => {
      if (settled || cancelled) {
        return;
      }
      settled = true;
      clearTimer();
      img.onload = null;
      img.onerror = null;
      if (outcome === 'failed') {
        console.debug(`[Forms] Image prefetch failed: ${url}`);
      } else if (outcome === 'timed out') {
        img.src = ''; // after the handlers are detached, so the abort's own error event is ignored
        console.debug(`[Forms] Image prefetch timed out after ${PREFETCH_TIMEOUT_MS} ms: ${url}`);
      }
      startNext();
    };
    img.onload = () => settle('loaded');
    img.onerror = () => settle('failed');
    timer = env.setTimeout(() => settle('timed out'), PREFETCH_TIMEOUT_MS);
    img.fetchPriority = 'low';
    img.decoding = 'async';
    img.src = url;
  };

  startNext();
  return handle;
}
