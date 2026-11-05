import { signal, type Signal } from '@angular/core';

/** Tick period of the elapsed-time signal, in ms. */
const TICK_MS = 250;

/**
 * Times one in-flight submit for the respondent widget: drives the escalating wait message
 * and reports the client-measured round trip to the console.
 */
export class SubmitTimer {
  /**
   * How long the in-flight submit has been running, in ms. Zero when nothing is submitting.
   *
   * Ticked rather than derived because the message has to change while nothing else does —
   * the whole point is that the respondent sees the page acknowledge a wait it cannot
   * shorten. The interval is cleared on every exit path, including failure.
   */
  private readonly elapsed = signal(0);
  private ticker: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  public readonly Elapsed: Signal<number> = this.elapsed.asReadonly();

  /**
   * Drive the escalating wait message.
   *
   * A plain interval rather than anything cleverer because the only requirement is that the
   * text changes while the page is otherwise frozen; the cost is one timer for the length of
   * one request, cleared by `Stop()`, which the caller runs in a `finally` so a thrown submit cannot
   * leave it running.
   */
  public Start(): void {
    this.elapsed.set(0);
    this.startedAt = Date.now();
    this.Stop();
    this.ticker = setInterval(() => this.elapsed.set(Date.now() - this.startedAt), TICK_MS);
  }

  public Stop(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.elapsed.set(0);
  }

  /**
   * Report where a submit spent its time, in the respondent's own console.
   *
   * Round-trip measured from the client, because that is the number the respondent actually
   * experiences — a server that finishes in 40ms is still a four-second submit if the request
   * spent the rest of it in flight, and only the client can see the difference. The server
   * logs its own per-stage breakdown under the same heading, so the two read together.
   */
  public LogOutcome(ok: boolean): void {
    const ms = Date.now() - this.startedAt;
    // eslint-disable-next-line no-console -- diagnostic output is the entire purpose here
    console.info(
      `[mj-form] submit ${ok ? 'completed' : 'failed'} in ${ms}ms (client round trip; see the API log for the server-side stage breakdown)`,
    );
  }
}
