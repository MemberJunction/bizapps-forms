import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutosaveController } from './autosave-controller';

describe('AutosaveController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces a burst of pings into a single save', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 1000);

    c.ping();
    c.ping();
    c.ping();
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save until the debounce window elapses', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save, () => {}, 1000);

    c.ping();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports status transitions idle→pending→saving→saved', async () => {
    const statuses: string[] = [];
    const c = new AutosaveController(() => Promise.resolve('r1'), (s) => statuses.push(s), 500);

    c.ping();
    await vi.advanceTimersByTimeAsync(500);
    await vi.runAllTimersAsync();

    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('is fail-soft: a rejected save reports error, not a throw', async () => {
    const statuses: string[] = [];
    const c = new AutosaveController(
      () => Promise.reject(new Error('network')),
      (s) => statuses.push(s),
      500,
    );

    c.ping();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toContain('error');
    expect(c.status).toBe('error');
  });

  it('re-arms a save requested while one is in flight instead of overlapping', async () => {
    let resolveFirst!: (id: string) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<string>((res) => (resolveFirst = res)))
      .mockResolvedValue('r2');
    const c = new AutosaveController(save, () => {}, 100);

    c.ping();
    await vi.advanceTimersByTimeAsync(100); // fires first save (now in flight)
    expect(save).toHaveBeenCalledTimes(1);

    c.ping(); // during in-flight → should re-arm, not start a 2nd save yet
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirst('r1');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100); // re-armed debounce elapses → 2nd save
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('cancel() aborts a pending save', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 500);

    c.ping();
    c.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });

  it('settle() awaits an in-flight save so a submit never overlaps it', async () => {
    let resolveSave!: (id: string) => void;
    const order: string[] = [];
    const save = vi.fn().mockImplementation(
      () => new Promise<string>((res) => (resolveSave = (id) => { order.push('save-done'); res(id); })),
    );
    const c = new AutosaveController(save, () => {}, 100);

    c.ping();
    await vi.advanceTimersByTimeAsync(100); // save is now in flight
    expect(save).toHaveBeenCalledTimes(1);

    const settled = c.settle().then(() => order.push('settle-resolved'));
    // settle() must NOT resolve while the save is still in flight.
    await Promise.resolve();
    expect(order).toEqual([]);

    resolveSave('r1');
    await settled;
    // settle resolved only AFTER the in-flight save completed.
    expect(order).toEqual(['save-done', 'settle-resolved']);
  });

  it('settle() cancels a pending (not-yet-fired) save and resolves immediately', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 500);

    c.ping();
    await c.settle();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });

  it('settle() is fail-soft: a rejected in-flight save does not reject settle()', async () => {
    let rejectSave!: (e: Error) => void;
    const save = vi.fn().mockImplementation(() => new Promise<string>((_res, rej) => (rejectSave = rej)));
    const c = new AutosaveController(save, () => {}, 100);

    c.ping();
    await vi.advanceTimersByTimeAsync(100);
    const settled = c.settle();
    rejectSave(new Error('network'));
    await expect(settled).resolves.toBeUndefined();
  });

  it('dispose() stops future pings from saving', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 500);

    c.dispose();
    c.ping();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
  it('flushNow() writes the pending progress instead of cancelling it', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 1000);

    // A submit-point checkpoint: progress was just registered, and the checkpoint promises to
    // bank it NOW rather than at the end of the debounce window.
    c.ping();
    await c.flushNow();

    expect(save).toHaveBeenCalledTimes(1);
  });
  it('flushNow() leaves no debounce behind to fire a second write', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 1000);

    c.ping();
    await c.flushNow();
    await vi.advanceTimersByTimeAsync(5000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushNow() supersedes an in-flight save rather than reporting it as the checkpoint', async () => {
    // The in-flight save captured its payload before this progress existed, so awaiting it alone
    // would bank a checkpoint that does not contain the answers the checkpoint was crossed for.
    let resolveFirst!: (id: string) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<string>((res) => (resolveFirst = res)))
      .mockResolvedValue('r2');
    const c = new AutosaveController(save, () => {}, 100);

    c.ping();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    const flushed = c.flushNow();
    resolveFirst('r1');
    await flushed;

    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flushNow() is fail-soft: a rejected save does not reject the checkpoint', async () => {
    const c = new AutosaveController(() => Promise.reject(new Error('network')), () => {}, 100);

    c.ping();
    await expect(c.flushNow()).resolves.toBeUndefined();
    expect(c.status).toBe('error');
  });

  it('flushNow() after dispose() writes nothing', async () => {
    const save = vi.fn().mockResolvedValue('r1');
    const c = new AutosaveController(save, () => {}, 100);

    c.ping();
    c.dispose();
    await c.flushNow();

    expect(save).not.toHaveBeenCalled();
  });

  describe('capped retry after a refused/failed save (bizapps-forms#271)', () => {
    it('retries on the backoff — 5s, then 15s, then 60s — and not a 4th time', async () => {
      const save = vi.fn().mockRejectedValue(new Error('Too many submissions'));
      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0); // let the rejection settle and the 1st retry get scheduled
      expect(save).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(59_999);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(3); // the last retry waits a full 60s window, not 30s
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(4); // 3rd retry — the cap (RETRY_DELAYS_MS.length) is spent

      // No 4th retry: the cap is explicit, not "retry forever".
      await vi.advanceTimersByTimeAsync(120_000);
      expect(save).toHaveBeenCalledTimes(4);
      expect(c.status).toBe('error');
    });

    // Gauntlet #272 (F2). The widget cannot read the server's wait — the result carries only the
    // "Please wait N seconds" sentence — so the schedule itself must outlast the window. Modelled on
    // the server's real limiter: a 60s SLIDING window whose refusals charge nothing
    // (rate-limit.service.ts `charge`). With the old 5/15/30s schedule every retry fell inside the
    // window that refused it and the controller gave up with the respondent's last edits unsaved.
    it('lands the refused progress once the server window frees, with no further edit', async () => {
      const WINDOW_MS = 60_000;
      const MAX = 2;
      const admitted: number[] = [];
      const save = vi.fn(async () => {
        const now = Date.now();
        const recent = admitted.filter((t) => t > now - WINDOW_MS);
        if (recent.length >= MAX) {
          throw new Error('Autosave refused: Too many submissions.');
        }
        admitted.push(now);
        return 'r1';
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const c = new AutosaveController(save, () => {}, 1500);

      // Four edits 2.5s apart, then the respondent stops typing (the UR1 run in the gauntlet).
      for (let i = 0; i < 4; i++) {
        c.ping();
        await vi.advanceTimersByTimeAsync(2_500);
      }
      await vi.advanceTimersByTimeAsync(180_000);

      expect(c.status).toBe('saved');
      expect(admitted).toHaveLength(3); // two before the refusals, one after the window freed
    });

    it('resets the retry count on a success, so a later failure retries at 5s again', async () => {
      const save = vi
        .fn()
        .mockRejectedValueOnce(new Error('rate limited')) // initial save fails
        .mockRejectedValueOnce(new Error('rate limited')) // 1st retry (5s) fails
        .mockResolvedValueOnce('r1') // 2nd retry (15s) succeeds — resets failedAttempts
        .mockRejectedValueOnce(new Error('rate limited')); // next failure, after the reset

      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000); // 1st retry, fails
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(15_000); // 2nd retry, succeeds
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(3);
      expect(c.status).toBe('saved');

      // A fresh ping fails again. If the count had NOT reset, the next retry would be scheduled
      // at 60s (index 2); confirm it is at 5s (index 0) instead.
      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(4);
      expect(c.status).toBe('error');

      await vi.advanceTimersByTimeAsync(4_999);
      expect(save).toHaveBeenCalledTimes(4); // not yet at 5s

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(5); // retried at 5s — the count did reset
    });

    it('a ping during a pending retry replaces it with the normal debounce, not the backoff', async () => {
      const save = vi.fn().mockRejectedValueOnce(new Error('rate limited')).mockResolvedValue('r1');
      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(1); // failed; a 5s retry is now pending (fires at t=5500)

      await vi.advanceTimersByTimeAsync(4_000); // t=4500 — retry still 1s away
      c.ping(); // fresh progress arrives; must cancel the retry and arm the normal debounce (500ms)
      expect(save).toHaveBeenCalledTimes(1);

      // The debounce (500ms) elapses before the old retry's remaining 1000ms would have.
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(2);

      // Nothing further fires at what would have been the old retry's t=5500 mark.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it('cancel() cancels a pending retry — no further save fires', async () => {
      const save = vi.fn().mockRejectedValue(new Error('rate limited'));
      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(1);

      c.cancel();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('settle() cancels a pending retry — no further save fires', async () => {
      const save = vi.fn().mockRejectedValue(new Error('rate limited'));
      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(1);

      await c.settle();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('settle() leaves no retry armed when the in-flight save it is awaiting fails (bizapps-forms#271)', async () => {
      // settle() clears the timer and `rearm` BEFORE awaiting the in-flight save. If that save
      // then fails WHILE settle() is awaiting it, `runSave()`'s catch/finally runs
      // scheduleRetry() — arming a fresh backoff timer — before the awaited promise resolves,
      // i.e. AFTER settle()'s own clear already ran. A settle() that does not re-clear after the
      // await returns with that retry still live, so a caller who called settle() specifically to
      // guarantee nothing is still on the wire (e.g. `endEarly()`) gets a save 5s later anyway.
      let rejectSave!: (e: Error) => void;
      const save = vi.fn().mockImplementation(() => new Promise<string>((_res, rej) => (rejectSave = rej)));
      const c = new AutosaveController(save, () => {}, 100);

      c.ping();
      await vi.advanceTimersByTimeAsync(100); // save is now in flight
      expect(save).toHaveBeenCalledTimes(1);

      const settled = c.settle(); // starts awaiting the in-flight save
      rejectSave(new Error('network')); // the save fails while settle() is still awaiting it
      await settled;
      expect(c.status).toBe('error');

      // A 5s (then 15s, then 60s) backoff retry must NOT be armed after settle() returns.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('dispose() cancels a pending retry — no further save fires', async () => {
      const save = vi.fn().mockRejectedValue(new Error('rate limited'));
      const c = new AutosaveController(save, () => {}, 500);

      c.ping();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(0);
      expect(save).toHaveBeenCalledTimes(1);

      c.dispose();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });
});
