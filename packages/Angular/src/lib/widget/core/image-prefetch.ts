/**
 * Warm the browser cache with images the respondent will see on LATER screens, so a question
 * page or an ending screen does not wait for its image after it appears. Measured 2026-09-28 on
 * Slow 4G: an ending image painted 6.0 s after its text, because nothing asked for it until then.
 *
 * Why this works: asset responses are `Cache-Control: public, max-age=31536000, immutable`, so an
 * `<img>` created later with the same URL is served from cache with no request.
 *
 * One image at a time, on purpose. On a slow connection, parallel downloads split the bandwidth
 * with whatever the respondent is doing now, including submitting. A failed image is skipped; the
 * real `<img>` on that screen deals with its own failure.
 *
 * A STALL ends the whole queue instead. An image still downloading after PREFETCH_TIMEOUT_MS means
 * prefetching cannot pay off on this link, and every later image would stall the same way. The
 * in-flight image is deliberately NOT aborted: assets are served with a weak ETag, so a partial
 * download cannot be resumed, and aborting would throw away bytes already fetched. Left alone, the
 * browser finishes it into the HTTP cache. Only `cancel()` aborts an in-flight image. The
 * time-out and no-abort rule itself lives in `image-load.ts`, shared with the welcome gate.
 */

import { browserImageEnv, preloadImage, type ImageLoadEnv, type ImagePreload, type LoadableImage } from './image-load';

/** Most images one form load will prefetch. */
export const MAX_PREFETCH_IMAGES = 12;
/** An image still downloading after this long stops the queue (see the module header). */
export const PREFETCH_TIMEOUT_MS = 15_000;

/** The slice of `HTMLImageElement` the queue uses; a real `Image` satisfies it. */
export type PrefetchImage = LoadableImage;

/** Everything browser-specific, injectable so the queue is testable in node. */
export interface PrefetchEnv extends ImageLoadEnv {
  /** True when the respondent's browser asked sites to save data. */
  saveData(): boolean;
}

export interface PrefetchHandle {
  /** Stop the queue and abort the in-flight image. Safe to call more than once. */
  cancel(): void;
}

/** `navigator.connection` is not in TypeScript's DOM lib (Chromium-only API). */
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };

const browserEnv: PrefetchEnv = {
  ...browserImageEnv,
  saveData: () => (navigator as NavigatorWithConnection).connection?.saveData === true,
};

/** Start prefetching `urls` in order. Returns a handle that stops it. */
export function prefetchImages(urls: readonly string[], env: PrefetchEnv = browserEnv): PrefetchHandle {
  let cancelled = false;
  let current: ImagePreload | null = null;

  const handle: PrefetchHandle = {
    cancel: () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      current?.cancel();
      current = null;
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
    current = preloadImage(
      url,
      {
        priority: 'low',
        waitMs: PREFETCH_TIMEOUT_MS,
        onReady: (outcome) => {
          if (cancelled) {
            return;
          }
          if (outcome === 'timed out') {
            // Stop the queue, but leave the download running so it lands in the HTTP cache.
            current = null;
            console.debug(
              `[Forms] Image prefetch stopped: ${url} took longer than ${PREFETCH_TIMEOUT_MS} ms; skipped ${queue.length - index} remaining`,
            );
            return;
          }
          if (outcome === 'failed') {
            console.debug(`[Forms] Image prefetch failed: ${url}`);
          }
          startNext();
        },
      },
      env,
    );
  };

  startNext();
  return handle;
}
