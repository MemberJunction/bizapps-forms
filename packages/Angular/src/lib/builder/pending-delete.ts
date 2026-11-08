import { LogError } from '@memberjunction/core';
import { signal, type Signal } from '@angular/core';

/**
 * A builder delete that has left the screen but not yet the database, so it can still be undone.
 *
 * WHY HOLD RATHER THAN UNDELETE. Deleting a question used to write at once, with no confirm and no
 * undo (UI audit F07). Undo-by-recreating would mint new ids, and every logic rule, jump target and
 * entity-binding mapping that names the old id would then point at nothing. Holding the write keeps
 * every id: the item is removed from the tree immediately, and the delete is saved only when the
 * undo window passes — or sooner, whenever anything else needs the database to be current (see
 * {@link release}). A tab killed inside the window loses the delete, not the item: the safe way to
 * fail.
 *
 * One delete is held at a time. Holding another commits the first, so Undo always means "the thing
 * I just deleted" and the toast never has to describe two.
 */
export interface HeldDelete {
  /** How the toast names it: `question “Email”`. */
  label: string;
  /** Put the item back where it was in the tree. Called on Undo, and when the commit is refused. */
  restore: () => void;
  /** Write the delete. Resolves false when refused; the committer reports why. */
  commit: () => Promise<boolean>;
}

/** The clock, passed in so tests advance it by hand. */
export interface DeleteTimers {
  set(fn: () => void, ms: number): number;
  clear(handle: number): void;
}

/** How long Undo stays on offer. */
export const UNDO_WINDOW_MS = 10_000;

/** `globalThis`, not `window`, so a spec's fake timers drive it in the node test environment. */
const browserTimers: DeleteTimers = {
  set: (fn, ms) => Number(globalThis.setTimeout(fn, ms)),
  clear: (handle) => globalThis.clearTimeout(handle),
};

export class PendingDelete {
  private held: HeldDelete | null = null;
  private timer: number | null = null;
  /** The commit of a delete already released, until it settles; a flush in that gap waits for it. */
  private inFlight: Promise<boolean> | null = null;
  private readonly _current = signal<{ label: string } | null>(null);

  /** What the toast shows, or null when nothing is held. */
  public readonly current: Signal<{ label: string } | null> = this._current.asReadonly();

  constructor(
    private readonly timers: DeleteTimers = browserTimers,
    private readonly windowMs: number = UNDO_WINDOW_MS,
  ) {}

  /** Hold a delete whose item the caller has already taken out of the tree. Commits any held one first. */
  public hold(next: HeldDelete): void {
    void this.release();
    this.held = next;
    this._current.set({ label: next.label });
    this.timer = this.timers.set(() => void this.release(), this.windowMs);
  }

  /** Take back the held delete. False when nothing is held. */
  public undo(): boolean {
    const held = this.take();
    if (!held) {
      return false;
    }
    held.restore();
    return true;
  }

  /**
   * Commit the held delete now. Null when nothing is held, else the commit's outcome; a refused or
   * failed commit puts the item back, so the tree never shows a deletion the database did not make.
   *
   * Synchronous up to the commit call, on purpose: a caller that queues its own save straight after
   * (the builder's structural queue) is guaranteed the delete was queued first.
   *
   * With nothing held but a commit still running (the window just passed), answers THAT commit: a
   * publish in that gap must wait for the delete to land, not snapshot the row it is removing.
   */
  public release(): Promise<boolean> | null {
    const held = this.take();
    if (!held) {
      return this.inFlight;
    }
    const committing = held.commit().then(
      (ok) => {
        if (!ok) {
          held.restore();
        }
        return ok;
      },
      (err: unknown) => {
        LogError(`Forms builder could not delete ${held.label}: ${err instanceof Error ? err.message : String(err)}`);
        held.restore();
        return false;
      },
    );
    this.inFlight = committing;
    void committing.then(() => {
      if (this.inFlight === committing) {
        this.inFlight = null;
      }
    });
    return committing;
  }

  private take(): HeldDelete | null {
    const held = this.held;
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    this.held = null;
    this._current.set(null);
    return held;
  }
}
