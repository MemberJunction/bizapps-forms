import { describe, expect, it, vi } from 'vitest';
import type { ActionEngineServer } from '@memberjunction/actions';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { fireOnSubmitHooks, ON_SUBMIT_ACTION_NAMES } from '../on-submit-hooks.service';
import type { IsolatedProviderRunner } from '../../automation/isolated-provider';
import { makeContextUser } from './fakes';

const hookContext = { responseId: 'r1', formId: 'f1', formVersionId: 'v1', distributionId: 'd1' };

/** A pass-through isolate runner: runs `work` directly on a stand-in provider, no real isolation. */
const passthroughIsolate: IsolatedProviderRunner = async (_purpose, work) => work({} as DatabaseProviderBase);

/** Config for {@link makeFakeEngine}. `registered` defaults to every on-submit action resolving. */
interface FakeEngineConfig {
  registered?: Set<string>;
  runResult?: { Success: boolean; Message?: string };
  /** Override the whole RunAction behavior (e.g. to inspect `params.Provider`). */
  runAction?: (params: RunActionParams) => Promise<{ Success: boolean; Message?: string }>;
}

/** Build a fake ActionEngineServer; `registered` is the set of action names that resolve. */
function makeFakeEngine(config: FakeEngineConfig = {}) {
  const registered = config.registered ?? new Set(ON_SUBMIT_ACTION_NAMES);
  const runResult = config.runResult ?? { Success: true };
  const configFn = vi.fn(async () => undefined);
  const runAction = config.runAction ? vi.fn(config.runAction) : vi.fn(async () => runResult);
  const getByName = vi.fn((name: string) => (registered.has(name) ? { Name: name } : undefined));
  const engine = { Config: configFn, RunAction: runAction, GetActionByName: getByName };
  return { engine: engine as unknown as ActionEngineServer, config: configFn, runAction, getByName };
}

describe('fireOnSubmitHooks', () => {
  it('skips-with-log when an action is not registered', async () => {
    const { engine, runAction } = makeFakeEngine({ registered: new Set() });
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser(), passthroughIsolate);
    expect(results.every((r) => r.status === 'skipped-not-registered')).toBe(true);
    expect(runAction).not.toHaveBeenCalled();
  });

  it('fires each registered action and configures the engine once', async () => {
    const { engine, config, runAction } = makeFakeEngine({ registered: new Set(ON_SUBMIT_ACTION_NAMES) });
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser(), passthroughIsolate);
    expect(config).toHaveBeenCalledOnce();
    expect(runAction).toHaveBeenCalledTimes(ON_SUBMIT_ACTION_NAMES.length);
    expect(results.every((r) => r.status === 'fired')).toBe(true);
  });

  it('marks a failing action as failed without throwing', async () => {
    const { engine } = makeFakeEngine({
      registered: new Set(ON_SUBMIT_ACTION_NAMES),
      runResult: { Success: false, Message: 'nope' },
    });
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser(), passthroughIsolate);
    expect(results.every((r) => r.status === 'failed')).toBe(true);
  });

  it('skips every hook, fires nothing, and says so when no automation principal resolves', async () => {
    // FAIL-CLOSED. This path used to default to `UserCache.GetSystemUser()`, which silently
    // restored the broad grants the dedicated principal exists to avoid — at exactly the moment
    // nobody is watching, and on a fresh deployment where the seed had not been applied yet. A
    // skipped automation is visible and recoverable; an over-privileged one is not.
    //
    // Every pre-existing test above passes an explicit principal, so before this test the null
    // branch had no coverage at all.
    const { engine, config, runAction } = makeFakeEngine({ registered: new Set(ON_SUBMIT_ACTION_NAMES) });
    // Not a `vi.fn(passthroughIsolate)` spy: wrapping a generic function type in `vi.fn` erases
    // its generic parameter, so the wrapped value no longer satisfies `IsolatedProviderRunner`.
    let isolateCallCount = 0;
    const isolate: IsolatedProviderRunner = async (purpose, work) => {
      isolateCallCount += 1;
      return passthroughIsolate(purpose, work);
    };

    const results = await fireOnSubmitHooks(hookContext, engine, null, isolate);

    expect(results.map((r) => r.status)).toEqual(ON_SUBMIT_ACTION_NAMES.map(() => 'skipped-no-principal'));
    // Not merely "no action ran": the engine is never even CONFIGURED, so nothing is elevated,
    // and no isolated instance is opened for work that will never run.
    expect(config).not.toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
    expect(isolateCallCount).toBe(0);
  });

  it('reports one result per hook whichever way it skips, so a caller can always account for all of them', async () => {
    const { engine } = makeFakeEngine({ registered: new Set(ON_SUBMIT_ACTION_NAMES) });

    const skipped = await fireOnSubmitHooks(hookContext, engine, null);

    expect(skipped).toHaveLength(ON_SUBMIT_ACTION_NAMES.length);
    expect(skipped.map((r) => r.name).sort()).toEqual([...ON_SUBMIT_ACTION_NAMES].sort());
  });

  it('runs every hook on one isolated provider, so a transaction on the shared provider cannot reach them (#260)', async () => {
    const isolated = { name: 'isolated' } as unknown as DatabaseProviderBase;
    const seen: Array<DatabaseProviderBase | undefined> = [];
    const { engine } = makeFakeEngine({
      // Stands in for the shared provider while Common.LogActivity holds a transaction on it: any
      // hook that reaches for it fails the way the real ones did.
      runAction: async (p: RunActionParams) => {
        seen.push(p.Provider as DatabaseProviderBase | undefined);
        return p.Provider === isolated
          ? { Success: true }
          : { Success: false, Message: 'Requests can only be made in the LoggedIn state, not the SentClientRequest state' };
      },
    });
    let released = false;
    const isolate: IsolatedProviderRunner = async (_purpose, work) => {
      try {
        return await work(isolated);
      } finally {
        released = true;
      }
    };

    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser(), isolate);

    expect(results.every((r) => r.status === 'fired')).toBe(true);
    expect(seen).toHaveLength(ON_SUBMIT_ACTION_NAMES.length);
    expect(seen.every((p) => p === isolated)).toBe(true);
    expect(released).toBe(true);
  });

  it('runs no hook, and says why, when no isolated provider can be created', async () => {
    const { engine, runAction } = makeFakeEngine({});
    const isolate: IsolatedProviderRunner = async () => {
      throw new Error('pool exhausted');
    };

    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser(), isolate);

    expect(runAction).not.toHaveBeenCalled();
    expect(results).toEqual(
      ON_SUBMIT_ACTION_NAMES.map((name) => ({ name, status: 'failed', message: expect.stringContaining('pool exhausted') })),
    );
  });

  it('purpose names the response, so a failure in the log can be traced', async () => {
    const purposes: string[] = [];
    const isolate: IsolatedProviderRunner = async (purpose, work) => {
      purposes.push(purpose);
      return work({} as DatabaseProviderBase);
    };

    await fireOnSubmitHooks(hookContext, makeFakeEngine({}).engine, makeContextUser(), isolate);

    expect(purposes[0]).toContain(hookContext.responseId);
  });
});
