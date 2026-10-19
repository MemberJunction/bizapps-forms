/**
 * `FormsAutomationDrainDriver` — the scheduled job type that sweeps the automation outbox (#303).
 * What a sweep does is `drainAutomationOutbox`, stood in for here and specced on its own; this is
 * what the scheduling engine sees of it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';

const drain = vi.hoisted(() => ({
  calls: [] as { request: { reason: string; responseId?: string; heartbeat?: () => Promise<void> }; user: unknown }[],
  next: async (): Promise<unknown> => ({ claimed: 3, completed: 2, retried: 1, deadLettered: 0, abandoned: 0, roundsCapped: false }),
}));
vi.mock('../drain.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../drain.js')>()),
  drainAutomationOutbox: async (request: { reason: string }, user: unknown) => {
    drain.calls.push({ request, user });
    return drain.next();
  },
}));

const { FormsAutomationDrainDriver, FORMS_AUTOMATION_DRAIN_DRIVER } = await import('../FormsAutomationDrainDriver.js');

const SYSTEM = { ID: 'system-1' } as unknown as UserInfo;

function context(heartbeat = vi.fn(async () => undefined)): ScheduledJobExecutionContext {
  return {
    Schedule: { Configuration: '{}' } as unknown as MJScheduledJobEntity,
    Run: {} as unknown as MJScheduledJobRunEntity,
    ContextUser: SYSTEM,
    heartbeat,
  };
}

beforeEach(() => {
  drain.calls.length = 0;
  drain.next = async () => ({ claimed: 3, completed: 2, retried: 1, deadLettered: 0, abandoned: 0, roundsCapped: false });
});

describe('FormsAutomationDrainDriver', () => {
  it('is what the scheduling engine resolves for its DriverClass', () => {
    const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseScheduledJob>(BaseScheduledJob, FORMS_AUTOMATION_DRAIN_DRIVER);

    expect(resolved).toBeInstanceOf(FormsAutomationDrainDriver);
    expect(resolved?.IsHighFrequencyByDesign).toBe(true);
  });

  it('drains every due event as the job\'s user, beating the lease between rounds, and reports the counts in Details', async () => {
    const heartbeat = vi.fn(async () => undefined);

    const result = await new FormsAutomationDrainDriver().Execute(context(heartbeat));

    expect(drain.calls).toHaveLength(1);
    expect(drain.calls[0].user).toBe(SYSTEM);
    expect(drain.calls[0].request.responseId).toBeUndefined();
    await drain.calls[0].request.heartbeat?.();
    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      Success: true,
      Details: { claimed: 3, completed: 2, retried: 1, deadLettered: 0, abandoned: 0, roundsCapped: false },
    });
  });

  it('fails the run only when the drain itself throws, with its message', async () => {
    drain.next = async () => {
      throw new Error('"MJ_BizApps_Forms: Form Automation Events" is not in this host\'s metadata');
    };

    const result = await new FormsAutomationDrainDriver().Execute(context());

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Form Automation Events');
  });

  it('accepts an empty Configuration and refuses anything else', () => {
    const driver = new FormsAutomationDrainDriver();

    expect(driver.ValidateConfiguration({ Configuration: '{}' } as unknown as MJScheduledJobEntity).Success).toBe(true);
    expect(driver.ValidateConfiguration({ Configuration: null } as unknown as MJScheduledJobEntity).Success).toBe(true);
    expect(driver.ValidateConfiguration({ Configuration: '{"BatchSize": 9}' } as unknown as MJScheduledJobEntity).Success).toBe(false);
  });
});
