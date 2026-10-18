/**
 * The automation drain (#303): what it decides for each `FormAutomationEvent` it claims. What
 * running the steps means is `FormAutomationEngine.RunForResponse`, stood in for here and specced on
 * its own; how events are claimed and settled atomically is `claim.ts` (and its DB spec). These
 * cases are the ones the retired `Forms.RunAutomations` handler was held to, re-pointed at the
 * outbox, plus the lease and round cap the outbox adds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { makeFakeProvider } from '../../../testing/index.js';
import type { ClaimedEvent, EventSettlement, OutboxStore } from '../claim.js';

const engine = vi.hoisted(() => ({
  calls: [] as { request: Record<string, unknown>; provider: unknown; user: unknown }[],
  closes: [] as { request: Record<string, unknown>; user: unknown }[],
  next: async (): Promise<unknown> => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: false }),
}));
vi.mock('../../../engines/FormAutomationEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../engines/FormAutomationEngine.js')>();
  return {
    ...actual,
    FormAutomationEngine: {
      Instance: {
        RunForResponse: async (request: Record<string, unknown>, provider: unknown, user: unknown) => {
          engine.calls.push({ request, provider, user });
          return engine.next();
        },
        CloseOpenRuns: async (request: Record<string, unknown>, _provider: unknown, user: unknown) => {
          engine.closes.push({ request, user });
          return ['step-a', 'step-b'];
        },
      },
    },
  };
});

const principal = vi.hoisted(() => ({ value: { ID: 'principal-1', Name: 'Forms Automation Service' } as unknown }));
vi.mock('../../service-principal.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../service-principal.js')>()),
  resolveAutomationPrincipal: () => principal.value,
}));

const logged = vi.hoisted(() => [] as string[]);
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.push(m),
  LogStatus: (m: string) => logged.push(m),
}));

const { drainAutomationOutbox, backoffSeconds, MAX_ATTEMPTS, MAX_CLAIM_ROUNDS, BACKOFF_MAX_SECONDS, LEASE_RENEW_SECONDS } = await import('../drain.js');
const { FormAutomationError } = await import('../../../engines/automation-errors.js');

const SYSTEM = { ID: 'system-1', Name: 'System' } as unknown as UserInfo;
const RESPONSE = '11111111-1111-4111-8111-111111111111';
const EVENT = 'EEEEEEEE-0000-4000-8000-00000000000E';

function claimed(overrides: Partial<ClaimedEvent> = {}): ClaimedEvent {
  return { ID: EVENT, FormResponseID: RESPONSE, Trigger: 'OnComplete', PartialSaveKey: null, AttemptCount: 2, IsReplay: false, ...overrides };
}

/** A store that hands out `batches` one claim at a time and records every settlement. */
function store(batches: ClaimedEvent[][], settleResult = true, renewResult: () => boolean = () => true) {
  const queue = [...batches];
  const renewals: string[] = [];
  const claims: { workerId: string; responseId?: string }[] = [];
  const settled: { eventId: string; workerId: string; settlement: EventSettlement }[] = [];
  const outbox: OutboxStore = {
    Claim: async (workerId, responseId) => {
      claims.push({ workerId, responseId });
      return queue.shift() ?? [];
    },
    Settle: async (eventId, workerId, settlement) => {
      settled.push({ eventId, workerId, settlement });
      return settleResult;
    },
    Renew: async (eventId) => {
      renewals.push(eventId);
      return renewResult();
    },
  };
  return { outbox, claims, settled, renewals };
}

/** A provider able to hand out isolated instances (distinct objects sharing its tables). */
function source() {
  const db = makeFakeProvider({});
  const instances: unknown[] = [];
  Object.assign(db.provider, {
    CreateIndependentInstance: async () => {
      const own = Object.create(db.provider) as DatabaseProviderBase;
      Object.assign(own, { ReleaseIndependentInstance: async () => undefined });
      instances.push(own);
      return own;
    },
  });
  return { provider: db.provider, instances };
}

async function drainOnce(batches: ClaimedEvent[][], opts: { settleResult?: boolean; responseId?: string } = {}) {
  const s = store(batches, opts.settleResult);
  const src = source();
  const report = await drainAutomationOutbox({ reason: 'spec', responseId: opts.responseId }, SYSTEM, { store: s.outbox, source: src.provider });
  return { ...s, ...src, report };
}

beforeEach(() => {
  engine.calls.length = 0;
  engine.closes.length = 0;
  engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: false });
  principal.value = { ID: 'principal-1', Name: 'Forms Automation Service' };
  logged.length = 0;
});

describe('an event that runs', () => {
  it('runs the response for its trigger, as the principal, read as the drain user, on an isolated instance — and settles Complete', async () => {
    const { report, settled, instances, claims } = await drainOnce([[claimed()]]);

    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0].request).toMatchObject({ responseId: RESPONSE, trigger: 'OnComplete', attempt: 2, eventId: EVENT, isReplay: false });
    expect(engine.calls[0].request.principal).toBe(principal.value);
    expect(engine.calls[0].user).toBe(SYSTEM);
    expect(instances).toContain(engine.calls[0].provider);
    expect(settled).toEqual([{ eventId: EVENT, workerId: claims[0].workerId, settlement: { status: 'Complete', lastError: null } }]);
    expect(report).toMatchObject({ claimed: 1, completed: 1, retried: 0, deadLettered: 0, abandoned: 0, roundsCapped: false });
  });

  it('runs a partial save for its own trigger', async () => {
    await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k' })]]);

    expect(engine.calls[0].request).toMatchObject({ trigger: 'OnPartial' });
  });

  it('narrows the claim to one response when it is the post-commit drain of that response', async () => {
    const { claims } = await drainOnce([[]], { responseId: RESPONSE });

    expect(claims[0].responseId).toBe(RESPONSE);
  });

  it('runs every event of a claimed batch, and claims again until the outbox has nothing due', async () => {
    const other = claimed({ ID: 'EEEEEEEE-0000-4000-8000-0000000000F0', FormResponseID: '22222222-2222-4222-8222-222222222222' });
    const { report, claims } = await drainOnce([[claimed(), other], [claimed({ ID: 'EEEEEEEE-0000-4000-8000-0000000000F1' })]]);

    expect(engine.calls).toHaveLength(3);
    expect(claims).toHaveLength(3);
    expect(report.completed).toBe(3);
  });
});

describe('the outcome', () => {
  it('retries a step that failed in a way that might not repeat, after a backoff, with a fixed sentence', async () => {
    engine.next = async () => ({
      dispatch: 'configured',
      results: [{ name: 'Send email', status: 'Failed', retryable: true }],
      legacy: [],
      retry: true,
      stopped: false,
      stale: false,
    });

    const { settled, report } = await drainOnce([[claimed({ AttemptCount: 3 })]]);

    expect(settled[0].settlement).toEqual({ status: 'Pending', retryAfterSeconds: 8, lastError: 'Step(s) "Send email" failed in a way another attempt may fix.' });
    expect(report.retried).toBe(1);
  });

  it('retries a run that was stopped before every step started', async () => {
    engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: true, stopped: true, stale: false });

    const { settled } = await drainOnce([[claimed()]]);

    expect(settled[0].settlement).toMatchObject({ status: 'Pending', lastError: 'The run was stopped before every step had started.' });
  });

  it('dead-letters what no retry can fix, closing the event\'s open rows first', async () => {
    engine.next = async () => {
      throw new FormAutomationError('Response 1111 does not exist, so it has no automations to run.');
    };

    const { settled, report } = await drainOnce([[claimed()]]);

    expect(engine.closes).toEqual([
      { request: { responseId: RESPONSE, eventId: EVENT, closedAs: 'DeadLettered', reason: 'Response 1111 does not exist, so it has no automations to run.' }, user: SYSTEM },
    ]);
    expect(settled[0].settlement).toEqual({ status: 'DeadLetter', lastError: 'Response 1111 does not exist, so it has no automations to run.' });
    expect(report.deadLettered).toBe(1);
  });

  it('retries what might clear (a failed read) with the engine\'s sentence — never provider text', async () => {
    engine.next = async () => {
      throw new FormAutomationError('The response could not be read; the server log has the detail.', { retryable: true });
    };

    const { settled } = await drainOnce([[claimed()]]);

    expect(settled[0].settlement).toMatchObject({ status: 'Pending', lastError: 'The response could not be read; the server log has the detail.' });
    expect(engine.closes).toEqual([]);
  });

  it('retries an unexpected failure, and logs it with the response', async () => {
    engine.next = async () => {
      throw new Error('ECONNRESET socket hang up');
    };

    const { settled } = await drainOnce([[claimed()]]);

    expect(settled[0].settlement).toMatchObject({ status: 'Pending', lastError: 'The automations could not be run on this attempt; the server log has the detail.' });
    expect(logged.some((l) => l.includes(RESPONSE) && l.includes('ECONNRESET'))).toBe(true);
  });

  it('retries — never runs as anyone else — while the automation principal cannot be resolved', async () => {
    principal.value = null;

    const { settled } = await drainOnce([[claimed()]]);

    expect(engine.calls).toEqual([]);
    expect(settled[0].settlement).toMatchObject({
      status: 'Pending',
      lastError: 'The Forms automation principal is not provisioned on this host, so no step may run yet.',
    });
  });

  it('a stale partial-save event (its response already Complete) completes, closing nothing', async () => {
    engine.next = async () => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: true });

    const { settled } = await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k' })]]);

    expect(settled[0].settlement.status).toBe('Complete');
    expect(engine.closes).toEqual([]);
  });
});

describe('giving up', () => {
  const failing = async () => ({
    dispatch: 'configured',
    results: [{ name: 'Send email', status: 'Failed', retryable: true }],
    legacy: [],
    retry: true,
    stopped: false,
    stale: false,
  });

  it(`on the LAST attempt (${5}), a run that would retry is dead-lettered instead, and its open rows are closed with the reason`, async () => {
    engine.next = failing;

    const { settled } = await drainOnce([[claimed({ AttemptCount: MAX_ATTEMPTS })]]);

    const reason = `Gave up after ${MAX_ATTEMPTS} attempts: Step(s) "Send email" failed in a way another attempt may fix.`;
    expect(engine.closes[0].request).toMatchObject({ closedAs: 'DeadLettered', reason });
    expect(settled[0].settlement).toEqual({ status: 'DeadLetter', lastError: reason });
  });

  it('a retry before the last attempt closes nothing — the open rows are what the next attempt reuses', async () => {
    engine.next = failing;

    await drainOnce([[claimed({ AttemptCount: MAX_ATTEMPTS - 1 })]]);

    expect(engine.closes).toEqual([]);
  });

  it('a principal that is still missing on the last attempt dead-letters, closing the open rows', async () => {
    principal.value = null;

    const { settled } = await drainOnce([[claimed({ AttemptCount: MAX_ATTEMPTS })]]);

    expect(engine.closes).toHaveLength(1);
    expect(settled[0].settlement.status).toBe('DeadLetter');
  });
});

describe('a partial save never dead-letters', () => {
  it('on its last attempt: closes its open rows as abandoned, logs ONE error line with the response and steps, and settles Abandoned', async () => {
    engine.next = async () => ({ dispatch: 'configured', results: [{ name: 'Sync', status: 'Failed', retryable: true }], legacy: [], retry: true, stopped: false, stale: false });

    const { settled, report } = await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k', AttemptCount: MAX_ATTEMPTS })]]);

    expect(engine.closes[0].request).toMatchObject({ closedAs: 'Abandoned' });
    expect(settled[0].settlement.status).toBe('Abandoned');
    const lines = logged.filter((l) => l.includes('abandoned'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(RESPONSE);
    expect(lines[0]).toContain('step-a, step-b');
    expect(report.abandoned).toBe(1);
  });

  it('before its last attempt it still retries', async () => {
    engine.next = async () => ({ dispatch: 'configured', results: [{ name: 'Sync', status: 'Failed', retryable: true }], legacy: [], retry: true, stopped: false, stale: false });

    const { settled } = await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k', AttemptCount: 1 })]]);

    expect(settled[0].settlement.status).toBe('Pending');
  });

  it('a partial that no retry could fix is abandoned too, rather than dead-lettered', async () => {
    engine.next = async () => {
      throw new FormAutomationError('The snapshot cannot be read.');
    };

    const { settled } = await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k' })]]);

    expect(settled[0].settlement.status).toBe('Abandoned');
  });
});

describe('a replay, a reclaimed lease, a lost lease', () => {
  it('tells the engine it is a replay, so the rows its own dead letter closed are run again', async () => {
    await drainOnce([[claimed({ IsReplay: true })]]);

    expect(engine.calls[0].request).toMatchObject({ isReplay: true });
  });

  it('reclaims an expired lease and re-runs with the same eventId — the run rows of that event are what stop a step repeating', async () => {
    await drainOnce([[claimed({ AttemptCount: 1 })], [claimed({ AttemptCount: 2 })]]);

    expect(engine.calls.map((c) => [c.request.eventId, c.request.attempt])).toEqual([
      [EVENT, 1],
      [EVENT, 2],
    ]);
  });

  it('a lost lease settles nothing more and is logged with the event and response', async () => {
    const { report } = await drainOnce([[claimed()]], { settleResult: false });

    expect(report.completed).toBe(0);
    expect(logged.some((l) => l.includes(EVENT) && l.includes(RESPONSE) && l.includes('lease'))).toBe(true);
  });
});

describe('an event that never settled', () => {
  it('is given up on, not run again, once a reclaim takes it past the attempt cap — a run that kills its drain cannot loop forever', async () => {
    const { settled } = await drainOnce([[claimed({ AttemptCount: MAX_ATTEMPTS + 1 })]]);

    expect(engine.calls).toEqual([]);
    expect(engine.closes[0].request).toMatchObject({ closedAs: 'DeadLettered' });
    expect(settled[0].settlement.status).toBe('DeadLetter');
    expect(settled[0].settlement.lastError).toMatch(new RegExp(`after ${MAX_ATTEMPTS + 1} attempts.*never settled`));
  });

  it('abandons, rather than dead-letters, a partial that never settled', async () => {
    const { settled } = await drainOnce([[claimed({ Trigger: 'OnPartial', PartialSaveKey: 'k', AttemptCount: MAX_ATTEMPTS + 1 })]]);

    expect(engine.calls).toEqual([]);
    expect(settled[0].settlement.status).toBe('Abandoned');
  });
});

describe('the lease, while a run is in flight', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A run that stays in flight until the test releases it, recording the abort signal it was given. */
  function longRun() {
    let release!: () => void;
    const done = new Promise<void>((r) => (release = r));
    let signal: AbortSignal | undefined;
    engine.next = async () => {
      signal = engine.calls[engine.calls.length - 1].request.signal as AbortSignal;
      await done;
      return { dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false, stale: false };
    };
    return { release, signal: () => signal };
  }

  it('is renewed while a step is still running, so another drain does not take the event and run the step twice', async () => {
    vi.useFakeTimers();
    const run = longRun();
    const s = store([[claimed()]]);
    const src = source();
    const drained = drainAutomationOutbox({ reason: 'spec' }, SYSTEM, { store: s.outbox, source: src.provider });

    await vi.advanceTimersByTimeAsync(LEASE_RENEW_SECONDS * 1000 * 3 + 10);
    expect(s.renewals).toEqual([EVENT, EVENT, EVENT]);
    expect(run.signal()?.aborted).toBe(false);

    run.release();
    await drained;
    await vi.advanceTimersByTimeAsync(LEASE_RENEW_SECONDS * 1000 * 2);
    expect(s.renewals).toHaveLength(3);
  });

  it('stops starting steps once the lease is lost to another drain', async () => {
    vi.useFakeTimers();
    const run = longRun();
    const s = store([[claimed()]], true, () => false);
    const src = source();
    const drained = drainAutomationOutbox({ reason: 'spec' }, SYSTEM, { store: s.outbox, source: src.provider });

    await vi.advanceTimersByTimeAsync(LEASE_RENEW_SECONDS * 1000 + 10);
    expect(run.signal()?.aborted).toBe(true);
    expect(logged.some((l) => l.includes(EVENT) && l.includes('lease'))).toBe(true);

    run.release();
    await drained;
  });

  it('on its last attempt, a run whose lease another drain took closes no rows and settles nothing — they are the new holder\'s', async () => {
    vi.useFakeTimers();
    const run = longRun();
    engine.next = (
      (inner) => async () => ({ ...((await inner()) as Record<string, unknown>), stopped: true })
    )(engine.next);
    const s = store([[claimed({ AttemptCount: MAX_ATTEMPTS })]], true, () => false);
    const src = source();
    const drained = drainAutomationOutbox({ reason: 'spec' }, SYSTEM, { store: s.outbox, source: src.provider });

    await vi.advanceTimersByTimeAsync(LEASE_RENEW_SECONDS * 1000 + 10);
    run.release();
    const report = await drained;

    expect(engine.closes).toEqual([]);
    expect(s.settled).toEqual([]);
    expect(report).toMatchObject({ claimed: 1, completed: 0, retried: 0, deadLettered: 0, abandoned: 0 });
  });

  it('a renewal still in flight when the run settles logs no lost lease — the event settled, nobody took it', async () => {
    vi.useFakeTimers();
    const run = longRun();
    let answerRenewal!: (held: boolean) => void;
    const s = store([[claimed()]]);
    s.outbox.Renew = () => new Promise<boolean>((resolve) => (answerRenewal = resolve));
    const src = source();
    const drained = drainAutomationOutbox({ reason: 'spec' }, SYSTEM, { store: s.outbox, source: src.provider });

    await vi.advanceTimersByTimeAsync(LEASE_RENEW_SECONDS * 1000 + 10);
    run.release();
    await drained;
    answerRenewal(false);
    await vi.advanceTimersByTimeAsync(0);

    expect(s.settled.map((x) => x.settlement.status)).toEqual(['Complete']);
    expect(logged.filter((l) => l.includes('lease'))).toEqual([]);
  });
});

describe('bounds', () => {
  it('stops after MAX_CLAIM_ROUNDS and reports roundsCapped', async () => {
    const rounds = Array.from({ length: MAX_CLAIM_ROUNDS + 3 }, (_, i) => [claimed({ ID: `EEEEEEEE-0000-4000-8000-${String(i).padStart(12, '0')}` })]);

    const { report, claims } = await drainOnce(rounds);

    expect(claims).toHaveLength(MAX_CLAIM_ROUNDS);
    expect(report.roundsCapped).toBe(true);
    expect(logged.some((l) => l.includes(`${MAX_CLAIM_ROUNDS}`))).toBe(true);
  });

  it('backs off exponentially from 2 s and caps at BACKOFF_MAX_SECONDS', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([2, 4, 8, 16]);
    expect(backoffSeconds(30)).toBe(BACKOFF_MAX_SECONDS);
  });
});
