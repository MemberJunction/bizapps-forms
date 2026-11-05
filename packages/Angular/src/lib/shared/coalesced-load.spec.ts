import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CoalescedLoad, LOAD_TIMEOUT_MS } from './coalesced-load';

/** A `run` whose every call the test settles by hand, in call order, with the signal it was given. */
function manualRun() {
  const calls: Array<{ resolve(): void; reject(reason: Error): void; signal: AbortSignal }> = [];
  const run = (signal: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      calls.push({ resolve, reject, signal });
    });
  return { run, calls };
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/** Whether `p` has settled yet, so a test can assert it has NOT. */
function tracked(p: Promise<unknown>): { done: () => boolean } {
  let done = false;
  void p.then(() => {
    done = true;
  });
  return { done: () => done };
}

describe('CoalescedLoad', () => {
  let logged: MockInstance<(...args: unknown[]) => void>;
  beforeEach(() => {
    // LogError writes to console.error; several paths here log on purpose.
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const loggedText = (): string => logged.mock.calls.map((args) => args.map(String).join(' ')).join('\n');

  it('refuses a blank label or a non-positive timeout up front', () => {
    expect(() => new CoalescedLoad(async () => undefined, { label: ' ' })).toThrow(/label/);
    expect(() => new CoalescedLoad(async () => undefined, { label: 'x', timeoutMs: 0 })).toThrow(/timeoutMs/);
  });

  it('join() starts a load when idle and joins the one in flight', async () => {
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list' });
    const first = load.join();
    const second = load.join();
    expect(calls).toHaveLength(1);
    calls[0].resolve();
    await Promise.all([first, second]);
    void load.join();
    expect(calls).toHaveLength(2);
    calls[1].resolve();
  });

  it('again() during a load queues exactly one follow-up, started only after the load settles', async () => {
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list' });
    void load.join();
    const a = load.again();
    const b = load.again();
    // A join after the request waits for the follow-up, not the stale load.
    const joined = load.join();
    await settle();
    expect(calls).toHaveLength(1);

    calls[0].resolve();
    await settle();
    expect(calls).toHaveLength(2);

    const all = tracked(Promise.all([a, b, joined]));
    await settle();
    expect(all.done()).toBe(false);
    calls[1].resolve();
    await Promise.all([a, b, joined]);
    expect(calls).toHaveLength(2);
  });

  it('again() while the follow-up itself runs queues a NEW follow-up rather than sharing the running one', async () => {
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list' });
    void load.join();
    const firstFollowUp = load.again();
    calls[0].resolve();
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    const secondFollowUp = load.again();
    await settle();
    // The running follow-up started before this ask, so it cannot satisfy it.
    expect(calls).toHaveLength(2);
    calls[1].resolve();
    await firstFollowUp;
    const second = tracked(secondFollowUp);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    expect(second.done()).toBe(false);
    calls[2].resolve();
    await secondFollowUp;
  });

  it('never rejects: a failed run is logged with its label and settles, and the follow-up still runs', async () => {
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list' });
    const first = load.join();
    const followUp = load.again();
    calls[0].reject(new Error('list read failed'));
    await expect(first).resolves.toBeUndefined();
    expect(loggedText()).toContain('test list failed');
    expect(loggedText()).toContain('list read failed');

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1].reject(new Error('follow-up read failed'));
    await expect(followUp).resolves.toBeUndefined();
    expect(loggedText()).toContain('follow-up read failed');
  });

  it('never rejects when run throws synchronously', async () => {
    const load = new CoalescedLoad(
      () => {
        throw new Error('threw before returning a promise');
      },
      { label: 'test list' },
    );
    await expect(load.again()).resolves.toBeUndefined();
    expect(loggedText()).toContain('threw before returning a promise');
  });

  it(`abandons a run that exceeds the timeout (default ${LOAD_TIMEOUT_MS} ms): logged, aborted, the queue moves on, its late result is ignored`, async () => {
    vi.useFakeTimers();
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list' });
    const hung = load.join();
    const followUp = load.again();
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    await expect(hung).resolves.toBeUndefined();
    expect(calls[0].signal.aborted).toBe(true);
    expect(loggedText()).toContain(`test list did not settle within ${LOAD_TIMEOUT_MS} ms`);
    // The queue moved on: the follow-up is running, and a join now waits for it.
    expect(calls).toHaveLength(2);
    expect(calls[1].signal.aborted).toBe(false);
    const joined = tracked(load.join());

    // The abandoned run settling late changes nothing: the follow-up is still the one in flight.
    calls[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(joined.done()).toBe(false);
    void load.join();
    expect(calls).toHaveLength(2);

    calls[1].resolve();
    await followUp;
  });

  it('logs a late failure of an abandoned run rather than dropping it', async () => {
    vi.useFakeTimers();
    const { run, calls } = manualRun();
    const load = new CoalescedLoad(run, { label: 'test list', timeoutMs: 50 });
    const hung = load.join();
    await vi.advanceTimersByTimeAsync(50);
    await hung;
    calls[0].reject(new Error('gave up eventually'));
    await vi.advanceTimersByTimeAsync(0);
    expect(loggedText()).toContain('test list failed after it was abandoned');
    expect(loggedText()).toContain('gave up eventually');
  });
});
