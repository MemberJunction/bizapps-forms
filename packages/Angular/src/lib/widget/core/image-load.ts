/**
 * Load one image off-DOM into the browser's cache, and say when it is ready (#291).
 *
 * The widget's one place for this, with two callers of different patience:
 * - the welcome gate (`welcome-gate.ts`) waits up to 3 s, at high priority, before showing the
 *   welcome screen, and wants to know when the download really finishes so the prefetch can start;
 * - the prefetch queue (`image-prefetch.ts`) waits up to 15 s per later-screen image, low priority.
 * Both stop WAITING at the limit but let the download finish: assets carry a weak ETag and no Range
 * support, so an aborted download cannot resume, while a finished one lands in the HTTP cache
 * (`immutable`) where the real `<img>` finds it. Only `cancel()` aborts.
 *
 * Callbacks, not promises, on purpose: the queue advances synchronously inside `onload`, and its
 * spec pins that ordering.
 */
export type ImageOutcome = 'loaded' | 'failed';

export interface LoadableImage {
  src: string;
  fetchPriority: 'high' | 'low' | 'auto';
  decoding: 'async' | 'sync' | 'auto';
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export interface ImageLoadEnv {
  createImage(): LoadableImage;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface PreloadOptions {
  priority: 'high' | 'low';
  waitMs: number;
  onReady(outcome: ImageOutcome | 'timed out'): void;
  onSettle?(outcome: ImageOutcome): void;
}

export interface ImagePreload {
  cancel(): void;
}

export const browserImageEnv: ImageLoadEnv = {
  createImage: () => new Image(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export function preloadImage(url: string, options: PreloadOptions, env: ImageLoadEnv = browserImageEnv): ImagePreload {
  const img = env.createImage();
  let readyReported = false;
  let finished = false;
  let timer: number | null = null;

  const detach = (): void => {
    finished = true;
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
    img.onload = null;
    img.onerror = null;
  };
  const settle = (outcome: ImageOutcome): void => {
    if (finished) return;
    detach();
    if (!readyReported) {
      readyReported = true;
      options.onReady(outcome);
    }
    options.onSettle?.(outcome);
  };

  img.onload = () => settle('loaded');
  img.onerror = () => settle('failed');
  timer = env.setTimeout(() => {
    timer = null;
    if (finished || readyReported) return;
    readyReported = true;
    if (!options.onSettle) detach(); // nobody wants the outcome: stop listening, keep downloading
    options.onReady('timed out');
  }, options.waitMs);
  img.fetchPriority = options.priority;
  img.decoding = 'async';
  img.src = url;

  return {
    cancel: () => {
      if (finished) return;
      detach();
      img.src = '';
    },
  };
}
