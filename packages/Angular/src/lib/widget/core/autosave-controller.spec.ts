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
});
