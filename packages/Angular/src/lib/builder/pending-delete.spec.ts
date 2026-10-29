import { describe, expect, it, vi } from 'vitest';
import { PendingDelete, UNDO_WINDOW_MS, type DeleteTimers, type HeldDelete } from './pending-delete';

/** A clock the test advances by hand, so the 10 s window costs nothing. */
function fakeTimers(): DeleteTimers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    set: (fn, ms) => {
      const id = next++;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => {
      queue.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...queue]) {
        if (t.at <= now) {
          queue.delete(id);
          t.fn();
        }
      }
    },
    pending: () => queue.size,
  };
}

function held(label: string, ok = true): HeldDelete & { commit: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> } {
  return { label, commit: vi.fn(async () => ok), restore: vi.fn() };
}

describe('PendingDelete', () => {
  it('holds a delete for the undo window, then commits it once', async () => {
    const timers = fakeTimers();
    const pending = new PendingDelete(timers);
    const d = held('question “Email”');
    pending.hold(d);
    expect(pending.current()).toEqual({ label: 'question “Email”' });
    timers.advance(UNDO_WINDOW_MS - 1);
    expect(d.commit).not.toHaveBeenCalled();
    timers.advance(1);
    await Promise.resolve();
    expect(d.commit).toHaveBeenCalledTimes(1);
    expect(pending.current()).toBeNull();
    expect(d.restore).not.toHaveBeenCalled();
  });

  it('undo inside the window restores the item and never writes', () => {
    const timers = fakeTimers();
    const pending = new PendingDelete(timers);
    const d = held('screen');
    pending.hold(d);
    expect(pending.undo()).toBe(true);
    expect(d.restore).toHaveBeenCalledTimes(1);
    timers.advance(UNDO_WINDOW_MS * 2);
    expect(d.commit).not.toHaveBeenCalled();
    expect(pending.current()).toBeNull();
    expect(timers.pending()).toBe(0);
  });

  it('holding a second delete commits the first one straight away', () => {
    const pending = new PendingDelete(fakeTimers());
    const first = held('a');
    const second = held('b');
    pending.hold(first);
    pending.hold(second);
    expect(first.commit).toHaveBeenCalledTimes(1);
    expect(second.commit).not.toHaveBeenCalled();
    expect(pending.current()).toEqual({ label: 'b' });
  });

  it('release commits now and answers the outcome', async () => {
    const pending = new PendingDelete(fakeTimers());
    const d = held('a');
    pending.hold(d);
    await expect(pending.release()).resolves.toBe(true);
    expect(d.commit).toHaveBeenCalledTimes(1);
    expect(pending.release()).toBeNull();
  });

  it('a refused commit puts the item back', async () => {
    const pending = new PendingDelete(fakeTimers());
    const d = held('a', false);
    pending.hold(d);
    await expect(pending.release()).resolves.toBe(false);
    expect(d.restore).toHaveBeenCalledTimes(1);
  });

  it('a commit that throws puts the item back and reports false', async () => {
    const pending = new PendingDelete(fakeTimers());
    const d: HeldDelete = { label: 'a', restore: vi.fn(), commit: () => Promise.reject(new Error('network')) };
    pending.hold(d);
    await expect(pending.release()).resolves.toBe(false);
    expect(d.restore).toHaveBeenCalledTimes(1);
  });

  it('undo with nothing held does nothing', () => {
    expect(new PendingDelete(fakeTimers()).undo()).toBe(false);
  });

  it('release clears the timer so the delete is not committed twice', async () => {
    const timers = fakeTimers();
    const pending = new PendingDelete(timers);
    const d = held('a');
    pending.hold(d);
    await pending.release();
    timers.advance(UNDO_WINDOW_MS);
    expect(d.commit).toHaveBeenCalledTimes(1);
  });

  it('keeps answering for a commit already in flight, so a flush right after the window still waits for it', async () => {
    const timers = fakeTimers();
    const pending = new PendingDelete(timers);
    let land: (ok: boolean) => void = () => undefined;
    const d: HeldDelete = { label: 'a', restore: vi.fn(), commit: () => new Promise<boolean>((resolve) => (land = resolve)) };
    pending.hold(d);
    timers.advance(UNDO_WINDOW_MS);

    const flushed = pending.release();
    expect(flushed).not.toBeNull();
    let settled = false;
    void flushed?.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    land(true);
    await expect(flushed).resolves.toBe(true);
    expect(pending.release()).toBeNull();
  });
});

