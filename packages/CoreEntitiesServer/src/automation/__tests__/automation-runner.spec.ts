import { describe, expect, it } from 'vitest';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import { runAutomations } from '../automation-runner.js';
import type { PlannedAutomation } from '../automation-plan.js';

function planned(
  id: string,
  overrides: Partial<PublishedFormAutomation> = {},
  outcome: PlannedAutomation['outcome'] = 'run',
): PlannedAutomation {
  return {
    automation: {
      id,
      name: id,
      targetType: 'Action',
      actionId: 'act-1',
      trigger: 'OnComplete',
      executionMode: 'Sync',
      displayOrder: 1,
      continueOnError: true,
      isActive: true,
      ...overrides,
    },
    outcome,
  };
}

describe('runAutomations', () => {
  it('runs sync automations in plan order', async () => {
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [planned('first'), planned('second')],
      dispatch: async (a) => {
        ran.push(a.id);
      },
    });

    expect(ran).toEqual(['first', 'second']);
    expect(results.map((r) => r.status)).toEqual(['Succeeded', 'Succeeded']);
  });

  it('records a condition-skipped automation without dispatching it', async () => {
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [planned('skipped', {}, 'skipped-condition')],
      dispatch: async (a) => {
        ran.push(a.id);
      },
    });

    expect(ran).toEqual([]);
    expect(results[0].status).toBe('Skipped');
  });

  it('contains a throwing automation and keeps going', async () => {
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [planned('boom'), planned('after')],
      dispatch: async (a) => {
        ran.push(a.id);
        if (a.id === 'boom') {
          throw new Error('nope');
        }
      },
    });

    // The response is already saved by the time automations run; a failing side effect must not
    // be able to reach back and fail the submission.
    expect(ran).toEqual(['boom', 'after']);
    expect(results[0]).toMatchObject({ status: 'Failed', message: 'nope' });
    expect(results[1].status).toBe('Succeeded');
  });

  it('halts the remaining sync automations when one fails with continueOnError false', async () => {
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [planned('boom', { continueOnError: false }), planned('after')],
      dispatch: async (a) => {
        ran.push(a.id);
        if (a.id === 'boom') {
          throw new Error('nope');
        }
      },
    });

    expect(ran).toEqual(['boom']);
    expect(results[1].status).toBe('Skipped');
  });

  it('still runs async automations after a halting sync failure', async () => {
    const ran: string[] = [];

    await runAutomations({
      plan: [planned('boom', { continueOnError: false }), planned('background', { executionMode: 'Async' })],
      dispatch: async (a) => {
        ran.push(a.id);
        if (a.id === 'boom') {
          throw new Error('nope');
        }
      },
    });

    // The halt exists to stop later work that depended on the failed step's result; an async
    // automation was never ordered against it in the first place.
    expect(ran).toContain('background');
  });

  it('waits for async automations too: a delivery is not done until its background steps are', async () => {
    // The respondent no longer waits on any of this (the work queue runs it), and the provider an
    // async step runs on is released when the delivery settles — so returning early would cut the
    // step's work out from under it, the collision #260 fixed.
    let finished = false;
    const results = await runAutomations({
      plan: [planned('background', { executionMode: 'Async' })],
      dispatch: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        finished = true;
      },
    });

    expect(finished).toBe(true);
    expect(results).toEqual([{ automationId: 'background', name: 'background', status: 'Succeeded' }]);
  });

  it('runs every sync step before any async one starts', async () => {
    const events: string[] = [];

    await runAutomations({
      plan: [planned('sync-1'), planned('async-1', { executionMode: 'Async' }), planned('sync-2')],
      dispatch: async (a) => {
        events.push(`start:${a.id}`);
        await Promise.resolve();
        events.push(`end:${a.id}`);
      },
    });

    expect(events.indexOf('end:sync-2')).toBeLessThan(events.indexOf('start:async-1'));
  });

  it('reports a failure as retryable unless the dispatcher said otherwise', async () => {
    const results = await runAutomations({
      plan: [planned('blip'), planned('config')],
      dispatch: async (a) => {
        throw a.id === 'blip' ? new Error('connection reset') : Object.assign(new Error('no such action'), { retryable: false });
      },
    });

    expect(results.map((r) => [r.automationId, r.retryable])).toEqual([
      ['blip', true],
      ['config', false],
    ]);
  });

  it('records a step already terminal for this event as Skipped, without dispatching it — and dispatches an open one on its row', async () => {
    const ran: [string, string | undefined][] = [];

    const results = await runAutomations({
      plan: [
        { ...planned('done', {}, 'already-terminal'), priorStatus: 'Succeeded' },
        { ...planned('open'), openRunId: 'run-9' },
      ],
      dispatch: async (a, openRunId) => {
        ran.push([a.id, openRunId]);
      },
    });

    expect(ran).toEqual([['open', 'run-9']]);
    expect(results[0]).toMatchObject({ status: 'Skipped', message: expect.stringMatching(/already/i) });
  });

  it('a sync step that FAILED permanently for this event, and halts the rest, still halts them on a redelivery', async () => {
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [
        { ...planned('stopper', { continueOnError: false }, 'already-terminal'), priorStatus: 'Failed' },
        planned('after'),
      ],
      dispatch: async (a) => {
        ran.push(a.id);
      },
    });

    expect(ran).toEqual([]);
    expect(results[1]).toMatchObject({ status: 'Skipped', message: expect.stringMatching(/halt/i) });
  });

  it('dispatches nothing more once its signal aborts, and says why for each step it did not run', async () => {
    const controller = new AbortController();
    const ran: string[] = [];

    const results = await runAutomations({
      plan: [planned('first'), planned('second'), planned('background', { executionMode: 'Async' })],
      signal: controller.signal,
      dispatch: async (a) => {
        ran.push(a.id);
        controller.abort('Shutdown');
      },
    });

    expect(ran).toEqual(['first']);
    expect(results.slice(1).map((r) => [r.automationId, r.status, r.stopped])).toEqual([
      ['second', 'Skipped', true],
      ['background', 'Skipped', true],
    ]);
    expect(results[1].message).toMatch(/Shutdown/);
    expect(results[0].stopped).toBeUndefined();
  });
});
