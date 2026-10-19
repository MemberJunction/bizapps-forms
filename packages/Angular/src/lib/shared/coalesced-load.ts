import { LogError } from '@memberjunction/core';
import { failureMessage } from './failure-message';

/**
 * How long one load may run before it is abandoned so the queue behind it can move on. A page load
 * here is a list read plus at most one report; a minute is far past any healthy one, and short
 * enough that a hung request does not freeze the page's Refresh for the rest of the session.
 */
export const LOAD_TIMEOUT_MS = 60_000;

export interface CoalescedLoadOptions {
  /** What is loading, for the log ("Forms home list"). Required: every logged failure names it. */
  label: string;
  /** Overrides {@link LOAD_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * One page-level load that several callers can join or re-request, without two copies ever
 * running at once.
 *
 * MJ's dashboard host calls `Refresh()` on the dashboard it creates while the dashboard's own
 * `ngOnInit` load is in flight, and a reader can press the host's refresh mid-load. Joining every
 * caller to the load in flight (the first fix) read once but DROPPED a Refresh that arrived during
 * it: that caller asked for data read after its request and got data read before it. Starting a
 * second load instead overlapped two reads that settle in network order. So there are two asks:
 *
 * - {@link join} — "make sure a load has happened or is happening" (the mount-time load).
 * - {@link again} — "read again, starting after now" (a Refresh, a reload after a write).
 *
 * Contract:
 * - **At most one run at a time, and at most one queued.** The queue is a single slot: every
 *   `again()` while a run is in flight shares the one follow-up, so a burst of asks costs one
 *   extra read, never an unbounded backlog. An `again()` while the follow-up itself runs queues a
 *   new one (the running one started before the ask).
 * - **Never rejects.** A failed `run` (rejected or thrown) is logged with the label and its promise
 *   settles, so fire-and-forget callers (`void load.again()`) cannot leak an unhandled rejection.
 *   A `run` that must tell the reader does so itself (the dashboards show the alert and emit
 *   `Error`); this class only guarantees the queue keeps moving.
 * - **Bounded.** A `run` that has not settled within the timeout is abandoned: logged, its
 *   `AbortSignal` aborted (with the reason), and the queue moves on. Whatever it does after that is
 *   ignored here; a late failure is still logged. The `run` must check `signal.aborted` after each
 *   await and apply nothing once aborted, since a newer read owns the page by then.
 */
export class CoalescedLoad {
  /** The load running now, if any. */
  private current: Promise<void> | null = null;
  /** The single follow-up queued behind `current` by {@link again}, if any. */
  private queued: Promise<void> | null = null;
  private readonly label: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly run: (signal: AbortSignal) => Promise<void>,
    options: CoalescedLoadOptions,
  ) {
    if (!options.label.trim()) {
      throw new Error('CoalescedLoad: a label is required, so its failures can be told apart in the log.');
    }
    const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS;
    if (!(timeoutMs > 0)) {
      throw new Error(`CoalescedLoad "${options.label}": timeoutMs must be positive, got ${timeoutMs}.`);
    }
    this.label = options.label;
    this.timeoutMs = timeoutMs;
  }

  /** The newest load asked for (the queued follow-up, else the one running), or a new one when idle. */
  public join(): Promise<void> {
    return this.queued ?? this.current ?? this.start();
  }

  /** A load that starts after this call: now when idle, else the single follow-up behind the one running. */
  public again(): Promise<void> {
    if (!this.current) {
      return this.start();
    }
    if (!this.queued) {
      // `current` never rejects (see `settled`), so this always goes on to run the follow-up.
      this.queued = this.current.then(() => {
        this.queued = null;
        return this.start();
      });
    }
    return this.queued;
  }

  private start(): Promise<void> {
    const load = this.settled(new AbortController()).finally(() => {
      if (this.current === load) {
        this.current = null;
      }
    });
    this.current = load;
    return load;
  }

  /** Runs once; resolves when the run settles or is abandoned at the timeout, and never rejects. */
  private settled(controller: AbortController): Promise<void> {
    return new Promise<void>((resolve) => {
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        const reason = new Error(`${this.label} did not settle within ${this.timeoutMs} ms; abandoned so the next load can run.`);
        LogError(reason.message);
        // Abort before resolving, so the run's own abort handling (ending its loading state) lands
        // before a queued follow-up starts a new one.
        controller.abort(reason);
        resolve();
      }, this.timeoutMs);
      const onFailure = (err: unknown): void => {
        if (finished) {
          LogError(failureMessage(err, `${this.label} failed after it was abandoned.`));
          return;
        }
        finished = true;
        clearTimeout(timer);
        LogError(failureMessage(err, `${this.label} failed.`));
        resolve();
      };
      let running: Promise<void>;
      try {
        running = this.run(controller.signal);
      } catch (err) {
        onFailure(err);
        return;
      }
      running.then(() => {
        if (finished) return; // abandoned: its late success changes nothing
        finished = true;
        clearTimeout(timer);
        resolve();
      }, onFailure);
    });
  }
}
