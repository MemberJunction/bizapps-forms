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
 *   - is fail-soft: a rejected save never blocks or interrupts the respondent. It is surfaced via
 *     `status` (`'error'`, never a throw out of the controller) AND retried on its own, on a
 *     capped backoff (`RETRY_DELAYS_MS`) — once the cap is spent the status just stays `'error'`;
 *     the next edit re-arms the normal debounce (not another backoff retry — `failedAttempts`
 *     resets only on a success), and a final submit carries every answer anyway.
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

/**
 * Backoff schedule for a save the server refused or a request that failed outright. Its length IS
 * the retry cap — the 4th failure in a row gets no further automatic retry.
 *
 * The LAST delay is one full server rate-limit window (`FORMS_RATELIMIT_WINDOW_MS`, default 60s),
 * because the widget cannot read the server's wait: a refusal carries only the "Please wait N
 * seconds" sentence. The server's window slides and a refusal charges nothing, so the bucket that
 * refused the previous attempt has freed by the time a full window has passed — the last retry
 * cannot land inside it. With 5/15/30s all three retries fell inside one window and the controller
 * gave up with the respondent's latest answers unsaved (gauntlet #272). An operator who widens the
 * window beyond the default loses that guarantee, not the retry.
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;

export class AutosaveController {
  private timer: number | null = null;
  private inFlight = false;
  /** The promise for the currently-running save, so callers can await it settling. */
  private inFlightSave: Promise<void> | null = null;
  /** A ping arrived while a save was in flight — save again once it settles. */
  private rearm = false;
  private disposed = false;
  private currentStatus: AutosaveStatus = 'idle';
  /** How many consecutive failures the backoff has already spent; reset to 0 on any success. */
  private failedAttempts = 0;

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
   * Never re-arms and never leaves a retry armed: a failed in-flight save is logged, never thrown
   * back at the caller (fail-soft), and the backoff retry it schedules is cancelled below — the
   * caller is about to send every answer itself.
   */
  public async settle(): Promise<void> {
    this.clearTimer();
    this.rearm = false;
    if (this.inFlightSave) {
      await this.inFlightSave;
      // A failed in-flight save may have scheduled a backoff retry (`runSave`'s catch/finally
      // runs `scheduleRetry()` before this await resolves, i.e. AFTER the clear above already
      // ran) — clear it again so settle() really does leave nothing armed.
      this.clearTimer();
      this.rearm = false;
    }
  }

  /**
   * Write the pending progress NOW, and resolve once it is on disk.
   *
   * The counterpart to {@link settle}, and the distinction is the whole point. `settle()` means
   * "quiesce" — it is called by the final submit, which is about to send every answer itself, so
   * discarding a queued autosave is exactly right there. A CHECKPOINT wants the opposite: it is
   * the only thing that will ever write those answers, so cancelling the debounce without
   * flushing it silently drops the progress the checkpoint exists to bank. Calling `settle()`
   * for that made a submit point strictly WORSE than no submit point at all — crossing one
   * cancelled the autosave that would otherwise have fired 1500ms later.
   *
   * A save already in flight is awaited first and then superseded by a fresh one, because that
   * save captured its payload before this progress existed. The two run in sequence, never
   * concurrently, so they cannot collide on the shared `clientResponseId`.
   *
   * Never throws — a checkpoint is background work like any other autosave (fail-soft).
   */
  public async flushNow(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.inFlightSave) {
      await this.inFlightSave;
    }
    // A ping landing during that await may have re-armed the debounce; this call supersedes it.
    this.clearTimer();
    this.rearm = false;
    if (this.disposed) {
      return;
    }
    this.flush();
    await this.inFlightSave;
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

  /**
   * The awaited body of one save; always resolves (fail-soft — the caller never sees a throw).
   *
   * The rearm/retry decision is made AFTER the try/finally, never inside it: `finally` runs on
   * every exit path including a later `return`, so folding either decision into it would make the
   * "did it succeed" outcome ambiguous by the time it ran. Keeping it out lets the two stay mutually
   * exclusive by construction — a ping that arrived mid-save always wins over a backoff retry.
   */
  private async runSave(): Promise<void> {
    let failed = false;
    try {
      await this.save();
      this.failedAttempts = 0;
      this.setStatus('saved');
    } catch (err) {
      failed = true;
      // Never swallow silently: a background autosave still failed, and this is the only place
      // that says so. `status` tells the UI; this gives whoever reads the console the cause.
      console.warn('[mj-forms] autosave failed', err);
      this.setStatus('error');
    } finally {
      this.inFlight = false;
      this.inFlightSave = null;
    }
    if (this.disposed) {
      return;
    }
    if (this.rearm) {
      this.rearm = false;
      this.setStatus('pending');
      this.arm();
    } else if (failed) {
      this.scheduleRetry();
    }
  }

  /**
   * Retry a failed save on {@link RETRY_DELAYS_MS}, capped at its length. Hitting the cap is not
   * an error path of its own — it is the explicitly-handled "stop automatically retrying" case:
   * `status` stays `'error'` and the answers since the last good save stay unsaved on the server
   * until the next edit re-arms the normal debounce or a final submit sends every answer. A
   * respondent who walks away at that point leaves them only in the tab; the last retry waiting a
   * full server window is what makes reaching the cap on a rate-limit refusal alone unlikely.
   */
  private scheduleRetry(): void {
    if (this.failedAttempts >= RETRY_DELAYS_MS.length) {
      return;
    }
    const delay = RETRY_DELAYS_MS[this.failedAttempts++];
    this.clearTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, delay);
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
