/**
 * A cap on SIMULTANEOUS in-flight anonymous requests — a bound on CONCURRENCY, which no
 * sliding window provides at any setting.
 *
 * REVISED. This was written when the public limiter keyed on the client-supplied `x-session-id`,
 * and argued that an in-flight cap was the only control an attacker could not rotate around. That
 * premise no longer holds: `RequestIdentityMiddleware` resolves the peer IP pre-auth and the
 * ceilings key on it, so they are header-proof on their own. The cap is not redundant, but its
 * job is narrower and worth stating correctly rather than leaving the old claim to mislead:
 *
 *   - A window limits how OFTEN a caller may act; it says nothing about how many requests they
 *     may have executing at once. A caller comfortably inside every rate ceiling can still open
 *     hundreds of concurrent requests and exhaust sockets, pool connections and memory. That is
 *     the gap this closes, and it is orthogonal to identity.
 *   - It degrades gracefully under genuine load, from any source — a traffic spike, a retry
 *     storm, a misbehaving integration — none of which is abuse and none of which a per-caller
 *     ceiling addresses.
 *   - It self-heals in milliseconds as work drains, where a window refusal stands for the rest
 *     of its period.
 *
 * Mirrors the same class in the sibling `bizapps-caliber` repo (InterviewHostMiddleware). Not a
 * queue, deliberately: queueing an anonymous request holds a socket + a slot for a caller who may
 * never read the response — the resource exhaustion this defends against wearing a politer hat.
 * Over capacity we refuse immediately and say so.
 */

/** Generous default: this bounds concurrent work, not throughput — any real flow is nowhere near it. */
export const DEFAULT_MAX_IN_FLIGHT = 25;

export class InFlightLimiter {
  private inFlight = 0;

  public constructor(private readonly limit: number = DEFAULT_MAX_IN_FLIGHT) {}

  /** How many callers currently hold a slot. Exposed for the boot log and for tests. */
  public get InFlight(): number {
    return this.inFlight;
  }

  /** Take a slot, or refuse. Every `true` MUST be paired with an `Exit()` in a `finally`. */
  public TryEnter(): boolean {
    if (this.inFlight >= this.limit) {
      return false;
    }
    this.inFlight++;
    return true;
  }

  /**
   * Release a slot.
   *
   * Floored at zero rather than trusting callers to be balanced. `Exit` lives in a `finally`, and
   * a future error path that manages to call it twice would otherwise mint permanent extra
   * capacity — a leak invisible until the day the cap is the thing standing between the service
   * and a flood, at which point it silently is not.
   */
  public Exit(): void {
    if (this.inFlight > 0) {
      this.inFlight--;
    }
  }
}
