/**
 * `StageTimer` turns a request's named stages into a `Server-Timing` header, so a slow upload on a
 * real host can be read in the browser's DevTools — reading the body, resolving the form, writing to
 * storage, recording the file — without a profiler or a log grep.
 */
import { describe, expect, it } from 'vitest';

import { StageTimer } from '../stage-timer';

/** A clock the test moves by hand. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('StageTimer', () => {
  it('records each measured stage in order, as a Server-Timing header', async () => {
    const c = clock();
    const timer = new StageTimer(c.now);

    const body = await timer.measure('body', async () => {
      c.advance(12.34);
      return 'bytes';
    });
    await timer.measure('store', async () => c.advance(250));

    expect(body).toBe('bytes');
    expect(timer.header()).toBe('body;dur=12.3, store;dur=250.0');
  });

  it('still records a stage that throws, and lets the error through', async () => {
    const c = clock();
    const timer = new StageTimer(c.now);

    await expect(
      timer.measure('store', async () => {
        c.advance(5);
        throw new Error('bucket unreachable');
      }),
    ).rejects.toThrow('bucket unreachable');

    expect(timer.header()).toBe('store;dur=5.0');
  });

  it('adds a total from construction to the moment the header is read', () => {
    const c = clock();
    const timer = new StageTimer(c.now);
    c.advance(40);

    expect(timer.header({ total: true })).toBe('total;dur=40.0');
  });

  it('is empty when nothing was measured', () => {
    expect(new StageTimer(clock().now).header()).toBe('');
  });

  it('refuses a stage name that is not a header token, rather than writing a broken header', async () => {
    const timer = new StageTimer(clock().now);
    await expect(timer.measure('read body', async () => undefined)).rejects.toThrow(/not a valid Server-Timing name/);
  });
});
