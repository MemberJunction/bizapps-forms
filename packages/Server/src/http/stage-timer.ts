/**
 * Named-stage timing for one request, reported as a `Server-Timing` header.
 *
 * Why it exists: on 2026-11-04 a respondent reported a slow résumé upload. On the dev host the
 * route answered in ~40 ms at every size up to 10 MB, so the time had to be going somewhere a
 * dev host does not have — a cloud storage write is the leading suspect, since the route buffers
 * the whole body and then sends it a second time to the provider. Guessing which stage to optimise
 * is how the wrong one gets optimised; this lets the browser's DevTools show it on the real host.
 *
 * Durations only. No stage name carries a file name, a path or a provider: the route is public.
 */

/** A `Server-Timing` metric name must be an HTTP token. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export class StageTimer {
  private readonly stages: { name: string; ms: number }[] = [];

  private readonly startedAt: number;

  /** `now` is injectable so tests can drive the clock; defaults to the high-resolution clock. */
  public constructor(private readonly now: () => number = () => performance.now()) {
    this.startedAt = now();
  }

  /**
   * Run `work`, record how long it took under `name`, and return its result. A stage that throws
   * is still recorded — a slow failure is exactly what the header is for — and the error goes on.
   */
  public async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (!TOKEN.test(name)) {
      throw new Error(`StageTimer: "${name}" is not a valid Server-Timing name (letters, digits and -_. only).`);
    }
    const start = this.now();
    try {
      return await work();
    } finally {
      this.stages.push({ name, ms: this.now() - start });
    }
  }

  /** The header value: every recorded stage in order, then `total` when asked. Empty when nothing ran. */
  public header(options: { total?: boolean } = {}): string {
    const entries = this.stages.map((s) => `${s.name};dur=${s.ms.toFixed(1)}`);
    if (options.total) {
      entries.push(`total;dur=${(this.now() - this.startedAt).toFixed(1)}`);
    }
    return entries.join(', ');
  }
}
