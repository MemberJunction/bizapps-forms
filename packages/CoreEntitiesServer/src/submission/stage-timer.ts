/**
 * Where a public submit actually spends its time.
 *
 * A submit that "feels slow" is a report nobody can act on: the pipeline does eleven things
 * — scope check, slug resolution, captcha, rate limit, dedupe, quota, revalidation, partial
 * lookup, persistence, hooks — and any one of them could be the cost. Without a per-stage
 * breakdown the next step is guessing, and the usual guess (persistence) is frequently wrong;
 * a captcha round trip or a dedupe query against an unindexed column both outweigh it easily.
 *
 * Deliberately tiny and dependency-free. The clock is injected so the tests can assert exact
 * durations rather than sleeping and hoping, which is the only way a timing test is not flaky.
 */

/** One measured step. */
export interface StageTiming {
  name: string;
  ms: number;
}

/** A finished measurement of one request. */
export interface Timings {
  /** Wall-clock for the whole run, including time after the final mark. */
  total: number;
  stages: StageTiming[];
}

/** A running measurement. `mark` closes the stage that just ended. */
export interface StageTimer {
  mark(name: string): void;
  finish(): Timings;
}

/** Milliseconds since some fixed point; injected so tests can drive it. */
export type Clock = () => number;

const defaultClock: Clock = () => Date.now();

/**
 * Start timing a request.
 *
 * Each `mark` records the time since the PREVIOUS mark, not since the start — a breakdown of
 * running totals makes every stage after the slow one look slow too, which points at the
 * wrong code. `finish` may be called at any point, including from an early return, because
 * most refusals never reach the later stages.
 */
export function createStageTimer(clock: Clock = defaultClock): StageTimer {
  const started = clock();
  let last = started;
  const stages: StageTiming[] = [];
  return {
    mark(name: string): void {
      const now = clock();
      stages.push({ name, ms: now - last });
      last = now;
    },
    finish(): Timings {
      return { total: clock() - started, stages };
    },
  };
}

/**
 * One log line for a measured request.
 *
 * Names the slowest stage explicitly rather than leaving it to be eyeballed: the whole reason
 * to read this line is to find the step worth attention, and a list of eleven numbers buries
 * it. The full breakdown follows for anyone who wants it.
 */
export function formatTimings(timings: Timings): string {
  const breakdown = timings.stages.map((s) => `${s.name} ${s.ms}ms`).join(' · ');
  if (timings.stages.length === 0) {
    return `total ${timings.total}ms`;
  }
  const slowest = timings.stages.reduce((a, b) => (b.ms > a.ms ? b : a));
  return `total ${timings.total}ms — slowest: ${slowest.name} ${slowest.ms}ms — ${breakdown}`;
}
