import { describe, expect, it, vi } from 'vitest';
import type { ActionEngineServer } from '@memberjunction/actions';
import { fireOnSubmitHooks, ON_SUBMIT_ACTION_NAMES } from '../on-submit-hooks.service';
import { makeContextUser } from './fakes';

const hookContext = { responseId: 'r1', formId: 'f1', formVersionId: 'v1', distributionId: 'd1' };

/** Build a fake ActionEngineServer; `registered` is the set of action names that resolve. */
function makeFakeEngine(registered: Set<string>, runResult: { Success: boolean; Message?: string } = { Success: true }) {
  const config = vi.fn(async () => undefined);
  const runAction = vi.fn(async () => runResult);
  const getByName = vi.fn((name: string) => (registered.has(name) ? { Name: name } : undefined));
  const engine = { Config: config, RunAction: runAction, GetActionByName: getByName };
  return { engine: engine as unknown as ActionEngineServer, config, runAction, getByName };
}

describe('fireOnSubmitHooks', () => {
  it('skips-with-log when an action is not registered', async () => {
    const { engine, runAction } = makeFakeEngine(new Set());
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser());
    expect(results.every((r) => r.status === 'skipped-not-registered')).toBe(true);
    expect(runAction).not.toHaveBeenCalled();
  });

  it('fires each registered action and configures the engine once', async () => {
    const { engine, config, runAction } = makeFakeEngine(new Set(ON_SUBMIT_ACTION_NAMES));
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser());
    expect(config).toHaveBeenCalledOnce();
    expect(runAction).toHaveBeenCalledTimes(ON_SUBMIT_ACTION_NAMES.length);
    expect(results.every((r) => r.status === 'fired')).toBe(true);
  });

  it('marks a failing action as failed without throwing', async () => {
    const { engine } = makeFakeEngine(new Set(ON_SUBMIT_ACTION_NAMES), { Success: false, Message: 'nope' });
    const results = await fireOnSubmitHooks(hookContext, engine, makeContextUser());
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
    const { engine, config, runAction } = makeFakeEngine(new Set(ON_SUBMIT_ACTION_NAMES));

    const results = await fireOnSubmitHooks(hookContext, engine, null);

    expect(results.map((r) => r.status)).toEqual(ON_SUBMIT_ACTION_NAMES.map(() => 'skipped-no-principal'));
    // Not merely "no action ran": the engine is never even CONFIGURED, so nothing is elevated.
    expect(config).not.toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
  });

  it('reports one result per hook whichever way it skips, so a caller can always account for all of them', async () => {
    const { engine } = makeFakeEngine(new Set(ON_SUBMIT_ACTION_NAMES));

    const skipped = await fireOnSubmitHooks(hookContext, engine, null);

    expect(skipped).toHaveLength(ON_SUBMIT_ACTION_NAMES.length);
    expect(skipped.map((r) => r.name).sort()).toEqual([...ON_SUBMIT_ACTION_NAMES].sort());
  });
});
