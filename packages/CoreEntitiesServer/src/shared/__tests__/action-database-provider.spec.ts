/**
 * {@link withActionDatabaseProvider} — the provider an action's TRANSACTIONAL work runs on (#303).
 *
 * A caller-supplied provider (the on-submit chain, a request) is used as-is. With none — which is
 * how MJ's agent runner invokes every Action — the work gets an isolated instance of its own
 * (`CreateIndependentInstance`, what `@memberjunction/server`'s `CreateIsolatedProvider` does),
 * released afterwards, so its transaction never runs on the process-global provider.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';
import { makeFakeProvider } from '../../testing/index.js';

const globalState = vi.hoisted(() => ({ provider: null as unknown, errors: [] as string[] }));
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    static get Provider(): unknown {
      return globalState.provider;
    }
  }
  return { ...actual, Metadata, LogError: (m: string) => globalState.errors.push(m) };
});
const { withActionDatabaseProvider } = await import('../action-provider.js');

/** A process-global provider that hands out `isolated` and records the release. */
function globalHanding(isolated: DatabaseProviderBase) {
  const released: unknown[] = [];
  Object.assign(isolated, {
    ReleaseIndependentInstance: async () => {
      released.push(isolated);
    },
  });
  const global = { CreateIndependentInstance: vi.fn(async () => isolated) };
  globalState.provider = global;
  return { global, released };
}

beforeEach(() => {
  globalState.provider = null;
  globalState.errors.length = 0;
});

describe('withActionDatabaseProvider', () => {
  it('runs on the caller\'s provider when one is supplied, and creates nothing', async () => {
    const own = makeFakeProvider({}).provider;
    const { global } = globalHanding(makeFakeProvider({}).provider);

    const used = await withActionDatabaseProvider({ Provider: own }, 'Forms: X', async (p) => p);

    expect(used).toBe(own);
    expect(global.CreateIndependentInstance).not.toHaveBeenCalled();
  });

  it('with no provider supplied, runs on an ISOLATED instance — never the global one — and releases it', async () => {
    const isolated = makeFakeProvider({}).provider;
    const { global, released } = globalHanding(isolated);

    const used = await withActionDatabaseProvider({}, 'Forms: X', async (p) => p);

    expect(used).toBe(isolated);
    expect(used).not.toBe(global);
    expect(released).toEqual([isolated]);
  });

  it('releases the isolated instance when the work throws, and rethrows the work\'s error', async () => {
    const isolated = makeFakeProvider({}).provider;
    const { released } = globalHanding(isolated);

    await expect(
      withActionDatabaseProvider({}, 'Forms: X', async () => {
        throw new Error('build failed');
      }),
    ).rejects.toThrow('build failed');
    expect(released).toEqual([isolated]);
  });

  it('refuses, naming the caller, when no isolated instance can be created — it never falls back to the global provider', async () => {
    globalState.provider = { RunView: async () => ({}) } as unknown as IMetadataProvider;

    await expect(withActionDatabaseProvider({}, 'Forms: X', async (p) => p)).rejects.toThrow(
      /Forms: X: the process provider cannot create an isolated instance/,
    );
  });

  it('refuses a supplied provider that cannot even run views, naming the caller', async () => {
    const metadataOnly = { EntityByName: () => undefined } as unknown as IMetadataProvider;

    await expect(withActionDatabaseProvider({ Provider: metadataOnly }, 'Forms: X', async (p) => p)).rejects.toThrow(
      /^Forms: X: RunActionParams\.Provider must also implement RunView/,
    );
  });

  it('refuses a supplied provider that is not a server database provider', async () => {
    const client = { RunView: async () => ({}), RunViews: async () => [] } as unknown as IMetadataProvider;

    await expect(withActionDatabaseProvider({ Provider: client }, 'Forms: X', async (p) => p)).rejects.toThrow(
      /Forms: X needs a server database provider/,
    );
  });

  it('logs, with the caller, a release that fails — and still returns the work\'s result', async () => {
    const isolated = makeFakeProvider({}).provider;
    globalHanding(isolated);
    Object.assign(isolated, {
      ReleaseIndependentInstance: async () => {
        throw new Error('pool closed');
      },
    });

    expect(await withActionDatabaseProvider({}, 'Forms: X', async () => 'built')).toBe('built');
    expect(globalState.errors.join('\n')).toMatch(/Forms: X.*pool closed/);
  });
});
