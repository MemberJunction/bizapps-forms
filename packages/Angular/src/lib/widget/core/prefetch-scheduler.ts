import { collectLaterImageUrls } from '@mj-biz-apps/forms-entities/contracts';

import type { PrefetchHandle } from './image-prefetch';
import type { WidgetForm } from './widget-form';
import type { WidgetPhase } from './submit-phase';

/**
 * Prefetch of later screens' images (core/image-prefetch.ts). One queue per load: `load()`
 * cancels it first, and `prefetchGeneration` makes an idle callback scheduled by an EARLIER load
 * a no-op. A welcome screen with an image starts it from the welcome gate's
 * `imagesSettled` (core/welcome-gate.ts); every other opening starts it when the browser is idle.
 */
export class PrefetchScheduler {
  private prefetch: PrefetchHandle | undefined;
  private prefetchUrls: string[] = [];
  private prefetchStarted = false;
  private prefetchGeneration = 0;

  /**
   * @param prefetch starts a queue for the given URLs
   * @param isDisposed read at `Start()` time: a `load()` still awaiting the network resumes after
   *   destroy and must start nothing
   */
  constructor(
    private readonly prefetchImages: (urls: readonly string[]) => PrefetchHandle,
    private readonly isDisposed: () => boolean,
  ) {}

  /**
   * Decide when this load's prefetch starts. A welcome screen with an image gets the network to
   * itself until the welcome gate's `imagesSettled` fires (or the respondent leaves it). In every other case (no welcome
   * screen, no welcome image, resumed past it), start when the browser is idle.
   *
   * Only while intake is still ahead. A resumed, already-submitted response opens on `done` (and a
   * failed or expired load on `error`/`expired`): the respondent can never see an option or an
   * ending image there, so downloading up to 12 of them would only compete with what is on screen.
   */
  public Plan(form: WidgetForm, opening: WidgetPhase, gated: boolean): void {
    if (opening !== 'welcome' && opening !== 'ready') {
      return;
    }
    // The live form's ending images are unknown until the server picks the ending, so only the
    // author's full draft prefetches them.
    this.prefetchUrls = collectLaterImageUrls({
      pages: form.render.pages,
      endScreens: form.kind === 'full' ? form.definition.endScreens : [],
    });
    if (gated) {
      return; // the welcome gate's imagesSettled starts it
    }
    this.schedulePrefetchWhenIdle();
  }

  private schedulePrefetchWhenIdle(): void {
    const generation = this.prefetchGeneration;
    const start = (): void => {
      if (generation === this.prefetchGeneration) {
        this.Start();
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(start);
    } else {
      setTimeout(start, 0); // Safari does not ship requestIdleCallback by default
    }
  }

  /** Start the queue: at most once per plan, and never after `isDisposed()` is true. */
  public Start(): void {
    if (this.isDisposed() || this.prefetchStarted) {
      return;
    }
    this.prefetchStarted = true;
    this.prefetch = this.prefetchImages(this.prefetchUrls);
  }

  public Cancel(): void {
    this.prefetchGeneration++;
    this.prefetch?.cancel();
    this.prefetch = undefined;
    this.prefetchStarted = false;
    this.prefetchUrls = [];
  }
}
