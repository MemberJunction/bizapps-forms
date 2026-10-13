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
}));
vi.mock('@memberjunction/work-queue-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/work-queue-engine')>()),
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

const { configureFormsWorkQueue, FormsWorkQueueStartup } = await import('../forms-work-queue.js');

const SYSTEM = { ID: 'system-1' } as unknown as UserInfo;

beforeEach(() => {
  wq.configured.length = 0;
  wq.configError = null;
  wq.topics = new Set(['forms.response-submitted']);
  wq.subscriptions = new Set(['forms.run-automations']);
  logged.errors.length = 0;
  logged.statuses.length = 0;
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
