import { describe, expect, it } from 'vitest';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import { runAutomations } from '../automation-runner';
import type { PlannedAutomation } from '../../public-submit/automation-plan';

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
      awaitAsync: true,
    });

    // The halt exists to stop later work that depended on the failed step's result; an async
    // automation was never ordered against it in the first place.
    expect(ran).toContain('background');
  });

  it('does not wait for async automations by default', async () => {
    let resolveIt: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      resolveIt = resolve;
    });

    const results = await runAutomations({
      plan: [planned('background', { executionMode: 'Async' })],
      dispatch: () => blocked,
    });

    // The respondent is waiting on a confirmation; background work must not hold it up.
    expect(results).toEqual([]);
    resolveIt?.();
  });
});
