/**
 * Configuring the work-queue engine for Forms (spec #303 §5): `WorkQueueEngine.Instance.Config` must
 * have run before the submit path can publish. `LoadBizAppsFormsServer()` runs while the host is
 * still loading packages — before it has a database connection or a user — so the configuring
 * happens in a startup sink MJ runs once the provider is up, and the submit path calls the same
 * function before it publishes (it is idempotent).
 *
 * A host where it cannot work — no work-queue tables, no Forms topic pushed — must say so and keep
 * booting: the rest of Forms works, and an operator needs the reason, not a crash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { makeFakeProvider } from '../../testing/index.js';

const wq = vi.hoisted(() => ({
  configured: [] as unknown[][],
  configError: null as Error | null,
  topics: new Set(['forms.response-submitted']),
  subscriptions: new Set(['forms.run-automations']),
  host: null as null | { IsStarted: boolean; GetHealth: () => { Subscriptions: { Name: string; State: string; Reason: string | null }[] } },
}));
vi.mock('@memberjunction/work-queue-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/work-queue-engine')>()),
  WorkQueueHost: {
    get Active() {
      return wq.host;
    },
  },
  WorkQueueEngine: {
    Instance: {
      Config: async (...args: unknown[]) => {
        wq.configured.push(args);
        if (wq.configError) {
          throw wq.configError;
        }
      },
      GetTopicByName: (name: string) => (wq.topics.has(name) ? { Name: name } : undefined),
      GetSubscriptionByName: (name: string) => (wq.subscriptions.has(name) ? { Name: name } : undefined),
    },
  },
}));

const logged = vi.hoisted(() => ({ errors: [] as string[], statuses: [] as string[] }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (m: string) => logged.errors.push(m),
  LogStatus: (m: string) => logged.statuses.push(m),
}));

const { configureFormsWorkQueue, FormsWorkQueueStartup, watchRunAutomationsHost, RUN_AUTOMATIONS_HOST_POLLS } = await import('../forms-work-queue.js');

/** A started host whose health lists `subscriptions`. */
function hostWith(subscriptions: { Name: string; State: string; Reason?: string | null }[], started = true) {
  return { IsStarted: started, GetHealth: () => ({ Subscriptions: subscriptions.map((s) => ({ Reason: null, ...s })) }) };
}
const noWait = async (): Promise<void> => undefined;

const SYSTEM = { ID: 'system-1' } as unknown as UserInfo;

beforeEach(() => {
  wq.configured.length = 0;
  wq.configError = null;
  wq.topics = new Set(['forms.response-submitted']);
  wq.subscriptions = new Set(['forms.run-automations']);
  logged.errors.length = 0;
  logged.statuses.length = 0;
  wq.host = hostWith([{ Name: 'forms.run-automations', State: 'Running' }]);
});

describe('configureFormsWorkQueue', () => {
  it('configures the engine with the host user and provider, and reports it ready', async () => {
    const provider = makeFakeProvider({}).provider;

    expect(await configureFormsWorkQueue(SYSTEM, provider)).toBe(true);
    expect(wq.configured).toEqual([[false, SYSTEM, provider]]);
    expect(logged.errors).toEqual([]);
  });

  it('reports not ready, naming the metadata to push, when the Forms topic is not on this host', async () => {
    wq.topics.clear();

    expect(await configureFormsWorkQueue(SYSTEM, makeFakeProvider({}).provider)).toBe(false);
    expect(logged.errors.join('\n')).toMatch(/forms\.response-submitted/);
    expect(logged.errors.join('\n')).toMatch(/metadata/);
  });

  it('logs — and does not throw — when the engine cannot load (no work-queue tables on this core)', async () => {
    wq.configError = new Error("Entity 'MJ: Work Queue Topics' not found in metadata");

    await expect(configureFormsWorkQueue(SYSTEM, makeFakeProvider({}).provider)).resolves.toBe(false);
    expect(logged.errors.join('\n')).toMatch(/not found in metadata/);
  });

  it('says plainly when no host here runs the subscription — the automations will wait in the queue', async () => {
    wq.subscriptions.clear();

    expect(await configureFormsWorkQueue(SYSTEM, makeFakeProvider({}).provider)).toBe(false);
    expect(logged.errors.join('\n')).toMatch(/forms\.run-automations/);
  });
});

describe('FormsWorkQueueStartup — the sink MJ runs once the database is up', () => {
  it('configures the work queue with what the startup manager hands it', async () => {
    const provider = makeFakeProvider({}).provider;

    await FormsWorkQueueStartup.Instance.HandleStartup(SYSTEM, provider);

    expect(wq.configured).toEqual([[false, SYSTEM, provider]]);
  });

  it('skips, saying why, on a host that hands it no database provider (a client)', async () => {
    await FormsWorkQueueStartup.Instance.HandleStartup(SYSTEM, undefined);

    expect(wq.configured).toEqual([]);
    expect(logged.statuses.join('\n')).toMatch(/no database provider/i);
  });
});

/**
 * Controller ruling (#303 Task 8 fix round 1): a host that publishes submissions but runs no
 * `forms.run-automations` consumer must say so LOUDLY — once, naming what to configure — because
 * nothing else on that host will: the automations simply wait in the queue. The work-queue host
 * starts after the startup sinks run, so the watch polls for it, a bounded number of times.
 */
describe('watchRunAutomationsHost', () => {
  it('logs no error when this host runs the subscription', async () => {
    expect(await watchRunAutomationsHost({ wait: noWait })).toBe('running');
    expect(logged.errors).toEqual([]);
  });

  it('waits for a host that starts late, then finds it running', async () => {
    wq.host = null;
    let polls = 0;
    const wait = async (): Promise<void> => {
      polls += 1;
      if (polls === 2) {
        wq.host = hostWith([{ Name: 'forms.run-automations', State: 'Running' }]);
      }
    };
    expect(await watchRunAutomationsHost({ wait })).toBe('running');
    expect(logged.errors).toEqual([]);
  });

  // Re-review N1: MJ's `WorkQueueHost.Start()` marks the host started and Active BEFORE its first
  // reconcile, which plans the subscriptions, finishes — so for a moment a correctly configured host
  // reports no subscriptions at all. That window is "not loaded yet", never "not configured".
  it('keeps polling through the started-but-not-yet-reconciled window, then finds it running', async () => {
    const host = { IsStarted: true, subscriptions: [] as { Name: string; State: string; Reason: string | null }[], GetHealth: () => ({ Subscriptions: host.subscriptions }) };
    wq.host = host;
    let polls = 0;
    const wait = async (): Promise<void> => {
      polls += 1;
      if (polls === 3) {
        host.subscriptions = [{ Name: 'forms.run-automations', State: 'Running', Reason: null }];
      }
    };
    expect(await watchRunAutomationsHost({ wait })).toBe('running');
    expect(logged.errors).toEqual([]);
  });

  it('logs ONE error, at its poll cap, when a started host never loads any subscription', async () => {
    wq.host = hostWith([]);
    let polls = 0;
    expect(await watchRunAutomationsHost({ wait: async () => void (polls += 1) })).toBe('not-running');
    expect(polls).toBe(RUN_AUTOMATIONS_HOST_POLLS - 1);
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toMatch(/workQueue\.subscriptions/);
  });

  it('logs ONE error naming what to configure when no work-queue host ever starts, after its bounded polls', async () => {
    wq.host = null;
    let polls = 0;
    expect(await watchRunAutomationsHost({ wait: async () => void (polls += 1) })).toBe('not-enabled');
    expect(polls).toBe(RUN_AUTOMATIONS_HOST_POLLS - 1);
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toMatch(/workQueue\.enabled/);
    expect(logged.errors[0]).toMatch(/forms\.run-automations/);
  });

  it("logs ONE error when the host runs work queues but not Forms' subscription", async () => {
    wq.host = hostWith([{ Name: 'some.other', State: 'Running' }]);
    expect(await watchRunAutomationsHost({ wait: noWait })).toBe('not-running');
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toMatch(/workQueue\.subscriptions/);
  });

  it('logs ONE error naming the state and reason when the subscription is not Running', async () => {
    wq.host = hostWith([{ Name: 'forms.run-automations', State: 'HandlerNotRegistered', Reason: 'no handler Forms.RunAutomations' }]);
    expect(await watchRunAutomationsHost({ wait: noWait })).toBe('not-running');
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toMatch(/HandlerNotRegistered/);
    expect(logged.errors[0]).toMatch(/no handler Forms\.RunAutomations/);
  });
});

