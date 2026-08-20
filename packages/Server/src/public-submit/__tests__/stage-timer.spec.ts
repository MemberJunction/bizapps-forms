import { describe, expect, it } from 'vitest';

import { createStageTimer, formatTimings } from '../stage-timer';

/** A clock the test drives, so durations are exact rather than flaky. */
function fakeClock() {
  let now = 0;
  return { read: () => now, advance: (ms: number) => (now += ms) };
}

describe('createStageTimer', () => {
  it('measures each stage separately, not cumulatively', () => {
    // The point of the breakdown is to find the ONE slow step. Reporting running totals
    // makes every stage after the slow one look slow too.
    const clock = fakeClock();
    const timer = createStageTimer(clock.read);
    clock.advance(10);
    timer.mark('scope');
    clock.advance(250);
    timer.mark('resolve');
    clock.advance(5);
    timer.mark('persist');
    const result = timer.finish();
    expect(result.stages).toEqual([
      { name: 'scope', ms: 10 },
      { name: 'resolve', ms: 250 },
      { name: 'persist', ms: 5 },
    ]);
  });

  it('reports a total that accounts for the whole request, not just the marked stages', () => {
    const clock = fakeClock();
    const timer = createStageTimer(clock.read);
    clock.advance(30);
    timer.mark('a');
    clock.advance(70); // work after the last mark still counts
    expect(timer.finish().total).toBe(100);
  });

  it('survives a pipeline that returns early without marking everything', () => {
    // Most refusals (rate limit, quota, validation) leave the pipeline before the later
    // stages, and a timer that assumed a full run would throw on the unhappy path.
    const clock = fakeClock();
    const timer = createStageTimer(clock.read);
    clock.advance(5);
    timer.mark('scope');
    const result = timer.finish();
    expect(result.stages).toHaveLength(1);
    expect(result.total).toBe(5);
  });
});

describe('formatTimings', () => {
  it('leads with the slowest stage, because that is the only one anyone acts on', () => {
    const line = formatTimings({
      total: 265,
      stages: [
        { name: 'scope', ms: 10 },
        { name: 'resolve', ms: 250 },
        { name: 'persist', ms: 5 },
      ],
    });
    expect(line).toMatch(/265ms/);
    expect(line).toMatch(/slowest: resolve 250ms/);
  });

  it('says something sensible when nothing was marked', () => {
    expect(formatTimings({ total: 3, stages: [] })).toMatch(/3ms/);
  });
});
