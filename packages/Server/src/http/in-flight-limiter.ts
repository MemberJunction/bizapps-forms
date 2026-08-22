/**
 * A cap on SIMULTANEOUS in-flight anonymous requests — the control a rate-limit window
 * structurally cannot provide, and the one an attacker who rotates a client-controlled key
 * (a header, a session id) cannot defeat, because it reserves a real slot per request and
 * releases it only on COMPLETION.
 *
 * Why this matters HERE (bizapps-forms public path):
 *   - The anonymous submit resolver's `AppContext` cannot see `req.ip`, so its per-request
 *     limiter falls back to the client-supplied `x-session-id`. An attacker rotates that header
 *     per request → every request lands in a fresh sliding-window bucket → the window limiter
 *     never trips. An in-flight cap holds regardless of any header, because the bound is on the
 *     count of requests executing at once, not on any identity the caller can forge.
 *   - The upload middleware CAN see `req.ip`, but even an honest per-IP window collapses to one
 *     bucket for every client behind a load balancer (`@memberjunction/server` never sets
 *     express's `trust proxy`). An in-flight cap self-heals in milliseconds where a window cap
 *     would lock the whole shared key out for a full minute.
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
