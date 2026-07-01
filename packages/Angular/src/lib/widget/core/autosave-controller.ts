/**
 * Headless autosave scheduler for the respondent widget.
 *
 * Debounces "progress" pings (page advance / answer edits) and, when they settle,
 * fires a single partial save through a caller-supplied `save` function. It:
 *   - coalesces bursts of pings into one save (not chatty),
 *   - never overlaps saves — a ping during an in-flight save re-arms afterwards,
 *   - threads the server-returned `responseId` back into the caller so every save
 *     UPSERTS the same partial response (cross-session resume is Phase 2 and NOT
 *     handled here — the id lives only for this widget instance),
 *   - is fail-soft: a rejected save is swallowed (surfaced only via `status`), so the
 *     respondent is never blocked or interrupted.
 *
 * Framework-free (takes injected `setTimeout`/`clearTimeout`) so it is unit-testable
 * with fake timers and no Angular. The component wires it to signals + the API.
 */

/** What the controller asks the host to do: persist the current partial, return its id. */
export type AutosaveFn = () => Promise<string | undefined>;

/** Observable status for a subtle "saving…/saved" indicator. */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Callback invoked whenever {@link AutosaveController.status} changes. */
export type AutosaveStatusListener = (status: AutosaveStatus) => void;

/** Injectable timer seam so tests can drive time deterministically. */
export interface TimerApi {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
}

const DEFAULT_DEBOUNCE_MS = 1500;

export class AutosaveController {
  private timer: number | null = null;
  private inFlight = false;
  /** The promise for the currently-running save, so callers can await it settling. */
  private inFlightSave: Promise<void> | null = null;
  /** A ping arrived while a save was in flight — save again once it settles. */
  private rearm = false;
  private disposed = false;
  private currentStatus: AutosaveStatus = 'idle';

  constructor(
    private readonly save: AutosaveFn,
    private readonly onStatus: AutosaveStatusListener = () => {},
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
    private readonly timers: TimerApi = globalTimers(),
  ) {}

  public get status(): AutosaveStatus {
    return this.currentStatus;
  }

  /** Register progress worth saving. Restarts the debounce window. */
  public ping(): void {
    if (this.disposed) {
      return;
    }
    if (this.inFlight) {
      // Don't overlap; remember to save again when the current save resolves.
      this.rearm = true;
      return;
    }
    this.setStatus('pending');
    this.arm();
  }

  /** Cancel any pending timer (e.g. on final submit, which persists everything). */
  public cancel(): void {
    this.clearTimer();
    this.rearm = false;
  }

  /**
   * Cancel the pending debounce AND await any save that is already in flight, so a caller
   * (the final submit) can guarantee no autosave write is still on the wire carrying the
   * same `clientResponseId`. This is what prevents the widget from firing two overlapping
   * writes with the same idempotency key (the source of the cosmetic PK-collision noise).
   * Never re-arms and never throws — a failed in-flight save is swallowed (fail-soft).
   */
  public async settle(): Promise<void> {
    this.clearTimer();
    this.rearm = false;
    if (this.inFlightSave) {
      await this.inFlightSave;
    }
  }

  /** Stop all activity; a controller is dead after this. */
  public dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private arm(): void {
    this.clearTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Perform one save now; re-arm if a ping arrived meanwhile. */
  private flush(): void {
    if (this.disposed || this.inFlight) {
      return;
    }
    this.inFlight = true;
    this.setStatus('saving');
    // Track the running save so settle() can await it (a submit must not overlap an
    // in-flight autosave sharing the same clientResponseId).
    this.inFlightSave = this.runSave();
    void this.inFlightSave;
  }

  /** The awaited body of one save; always resolves (fail-soft), then re-arms if needed. */
  private async runSave(): Promise<void> {
    try {
      await this.save();
      this.setStatus('saved');
    } catch {
      // Fail-soft: never surface a blocking error for a background autosave.
      this.setStatus('error');
    } finally {
      this.inFlight = false;
      this.inFlightSave = null;
      if (this.rearm && !this.disposed) {
        this.rearm = false;
        this.setStatus('pending');
        this.arm();
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: AutosaveStatus): void {
    this.currentStatus = status;
    this.onStatus(status);
  }
}

/** Bind the ambient timers, guarding against non-browser/SSR contexts. */
function globalTimers(): TimerApi {
  return {
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (h) => clearTimeout(h),
  };
}
