/**
 * Hold the welcome screen until its images are ready (#291).
 *
 * A welcome screen used to render its text at once and its image whenever the image arrived —
 * seconds later on Box-backed storage — pushing the text down when it did. The form's logo, which
 * sits above the welcome screen, had the same problem. So `<mj-form>` stays on its loading screen
 * while these load, and shows the welcome screen whole when the LAST of them is ready, or after
 * WELCOME_IMAGE_WAIT_MS, whichever comes first. A broken image counts as ready: it must never hold
 * the form hostage. Nothing is ever aborted — the real `<img>` is about to ask for the same URL.
 *
 * `imagesSettled` is separate from `reveal` so the later-screen prefetch still waits for the
 * welcome download itself, not just for the wait to run out.
 */
import { browserImageEnv, preloadImage, type ImageLoadEnv, type ImageOutcome } from './image-load';

/** The longest a respondent looks at the loader before the welcome screen shows anyway. */
export const WELCOME_IMAGE_WAIT_MS = 3000;

export interface WelcomeGateHooks {
  /** False once this load is stale (a newer load() ran) or the widget was destroyed. */
  isCurrent(): boolean;
  /**
   * Stop waiting and show the welcome screen. Called at most once. `failed` names the images that
   * reported an error by then (not ones still downloading at the wait limit), so the shell can drop a
   * logo it would otherwise render, watch fail again, and remove — moving the screen it just showed.
   */
  reveal(failed: ReadonlySet<string>): void;
  /** Every gated image has finished (loaded or failed): later screens may use the network. Called at most once. */
  imagesSettled(): void;
}

export function gateWelcomeScreen(urls: readonly string[], hooks: WelcomeGateHooks, env: ImageLoadEnv = browserImageEnv): void {
  const unique = [...new Set(urls)];
  let waitingReady = unique.length;
  let waitingSettled = unique.length;
  const failed = new Set<string>();
  const readyOne = (): void => {
    if (--waitingReady === 0 && hooks.isCurrent()) hooks.reveal(failed);
  };
  const settledOne = (): void => {
    if (--waitingSettled === 0 && hooks.isCurrent()) hooks.imagesSettled();
  };
  if (unique.length === 0) {
    waitingReady = waitingSettled = 1;
    readyOne();
    settledOne();
    return;
  }
  for (const url of unique) {
    const onReady = (outcome: ImageOutcome | 'timed out'): void => {
      if (outcome === 'failed') failed.add(url);
      readyOne();
    };
    preloadImage(url, { priority: 'high', waitMs: WELCOME_IMAGE_WAIT_MS, onReady, onSettle: settledOne }, env);
  }
}
