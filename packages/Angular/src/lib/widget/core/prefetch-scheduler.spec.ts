import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrefetchHandle } from './image-prefetch';
import { PrefetchScheduler } from './prefetch-scheduler';
import type { WidgetForm } from './widget-form';

const URLS = ['https://h/a.png', 'https://h/b.png'];

/** A projection form whose one page holds a picture-choice question with the two images. */
function formWithImages(): WidgetForm {
  return {
    kind: 'projection',
    render: {
      pages: [
        {
          id: 'p',
          displayOrder: 1,
          questions: [
            {
              id: 'q',
              type: 'PictureChoice',
              prompt: 'Q',
              isRequired: false,
              displayOrder: 1,
              options: URLS.map((imageURL, i) => ({ id: `o${i}`, label: `O${i}`, value: `${i}`, displayOrder: i, imageURL })),
            },
          ],
        },
      ],
    },
  } as unknown as WidgetForm;
}

describe('PrefetchScheduler', () => {
  let cancel: ReturnType<typeof vi.fn>;
  let prefetch: ReturnType<typeof vi.fn<(urls: readonly string[]) => PrefetchHandle>>;
  let disposed: boolean;
  let scheduler: PrefetchScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    cancel = vi.fn();
    prefetch = vi.fn<(urls: readonly string[]) => PrefetchHandle>(() => ({ cancel }) as unknown as PrefetchHandle);
    disposed = false;
    scheduler = new PrefetchScheduler(prefetch, () => disposed);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(['loading', 'done', 'error', 'expired'] as const)(
    'Plan with an opening other than welcome or ready collects no URLs (%s)',
    (phase) => {
      scheduler.Plan(formWithImages(), phase, false);
      vi.runAllTimers();
      scheduler.Start();
      for (const call of prefetch.mock.calls) {
        expect(call[0]).toEqual([]);
      }
      expect(prefetch).not.toHaveBeenCalledWith(URLS);
    },
  );

  it('Plan with gated = true does not schedule', () => {
    scheduler.Plan(formWithImages(), 'welcome', true);
    vi.runAllTimers();
    expect(prefetch).not.toHaveBeenCalled();
    scheduler.Start();
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(URLS);
  });

  it('Plan ungated starts when idle', () => {
    scheduler.Plan(formWithImages(), 'ready', false);
    expect(prefetch).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(URLS);
  });

  it('prefers requestIdleCallback when present', () => {
    const idle = vi.fn<(cb: () => void) => void>();
    vi.stubGlobal('requestIdleCallback', idle);
    scheduler.Plan(formWithImages(), 'welcome', false);
    vi.runAllTimers();
    expect(prefetch).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledTimes(1);
    idle.mock.calls[0][0]();
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('a Cancel before the idle callback fires makes that callback a no-op', () => {
    scheduler.Plan(formWithImages(), 'ready', false);
    scheduler.Cancel();
    vi.runAllTimers();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('a stale idle callback from an earlier plan cannot start the new plan twice', () => {
    const idle = vi.fn<(cb: () => void) => void>();
    vi.stubGlobal('requestIdleCallback', idle);
    scheduler.Plan(formWithImages(), 'ready', false);
    scheduler.Cancel();
    scheduler.Plan(formWithImages(), 'ready', false);
    expect(idle).toHaveBeenCalledTimes(2);
    idle.mock.calls[0][0](); // the stale callback from the first plan
    expect(prefetch).not.toHaveBeenCalled();
    idle.mock.calls[1][0]();
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('Start after isDisposed() is true does not call prefetchImages', () => {
    scheduler.Plan(formWithImages(), 'welcome', true);
    disposed = true;
    scheduler.Start();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('Start twice calls prefetchImages once', () => {
    scheduler.Plan(formWithImages(), 'welcome', true);
    scheduler.Start();
    scheduler.Start();
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it('Cancel cancels the running queue and lets the next plan start again', () => {
    scheduler.Plan(formWithImages(), 'welcome', true);
    scheduler.Start();
    scheduler.Cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    scheduler.Plan(formWithImages(), 'welcome', true);
    scheduler.Start();
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
