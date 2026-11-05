/**
 * `runLegacyOnSubmitHooks` — the four legacy on-submit actions, now fired only by the
 * `Forms.RunAutomations` handler on a final-submit message (#303 Task 8).
 *
 * Ported from forms-server's `on-submit-hooks.service.spec.ts` when the submit path's wrapper around
 * this function (`fireOnSubmitHooks`: the principal lookup and the isolated provider) was deleted with
 * the inline hook path. The wrapper's own duties now belong to the handler and `FormAutomationEngine`
 * (principal fail-closed, a fresh provider per delivery) and are specced there; what is kept here is
 * the runner's behaviour, which nothing else pins.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ActionEngineServer } from '@memberjunction/actions';
import type { RunActionParams } from '@memberjunction/actions-base';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { LEGACY_ON_SUBMIT_ACTION_NAMES } from '@mj-biz-apps/forms-entities';
import { runLegacyOnSubmitHooks } from '../legacy-hooks.js';

const hookContext = { responseId: 'r1', formId: 'f1', formVersionId: 'v1', distributionId: 'd1' };
const principal = { ID: 'principal-1' } as unknown as UserInfo;
const provider = { name: 'delivery-provider' } as unknown as DatabaseProviderBase;

interface FakeEngineConfig {
  registered?: Set<string>;
  runResult?: { Success: boolean; Message?: string };
  runAction?: (params: RunActionParams) => Promise<{ Success: boolean; Message?: string }>;
}

function makeFakeEngine(config: FakeEngineConfig = {}) {
  const registered = config.registered ?? new Set<string>(LEGACY_ON_SUBMIT_ACTION_NAMES);
  const runResult = config.runResult ?? { Success: true };
  const runAction = config.runAction ? vi.fn(config.runAction) : vi.fn(async () => runResult);
  const getByName = vi.fn((name: string) => (registered.has(name) ? { Name: name } : undefined));
  const engine = { Config: vi.fn(async () => undefined), RunAction: runAction, GetActionByName: getByName };
  return { engine: engine as unknown as ActionEngineServer, runAction };
}

describe('runLegacyOnSubmitHooks', () => {
  it('skips an action that is not registered, and runs nothing for it', async () => {
    const { engine, runAction } = makeFakeEngine({ registered: new Set() });
    const results = await runLegacyOnSubmitHooks(hookContext, principal, provider, engine);
    expect(results.every((r) => r.status === 'skipped-not-registered')).toBe(true);
    expect(runAction).not.toHaveBeenCalled();
  });

  it('fires each registered action, in the legacy order, one result per hook', async () => {
    const { engine, runAction } = makeFakeEngine();
    const results = await runLegacyOnSubmitHooks(hookContext, principal, provider, engine);
    expect(runAction).toHaveBeenCalledTimes(LEGACY_ON_SUBMIT_ACTION_NAMES.length);
    expect(results.map((r) => r.name)).toEqual([...LEGACY_ON_SUBMIT_ACTION_NAMES]);
    expect(results.every((r) => r.status === 'fired')).toBe(true);
  });

  it('marks a failing action as failed without throwing', async () => {
    const { engine } = makeFakeEngine({ runResult: { Success: false, Message: 'nope' } });
    const results = await runLegacyOnSubmitHooks(hookContext, principal, provider, engine);
    expect(results.every((r) => r.status === 'failed')).toBe(true);
  });

  it("does not let one hook's lookup failure cancel the hooks after it (F2)", async () => {
    const runAction = vi.fn(async () => ({ Success: true }));
    const getByName = vi.fn((name: string) => {
      if (name === LEGACY_ON_SUBMIT_ACTION_NAMES[1]) {
        throw new Error('metadata engine not configured');
      }
      return { Name: name };
    });
    const engine = { Config: vi.fn(async () => undefined), RunAction: runAction, GetActionByName: getByName } as unknown as ActionEngineServer;

    const results = await runLegacyOnSubmitHooks(hookContext, principal, provider, engine);

    expect(results.map((r) => r.status)).toEqual(['fired', 'failed', 'fired', 'fired']);
    expect(results[1].message).toContain('metadata engine not configured');
    expect(runAction).toHaveBeenCalledTimes(3);
  });

  it("runs every hook on the provider it was handed, as the given principal (#260)", async () => {
    const seen: RunActionParams[] = [];
    const { engine } = makeFakeEngine({
      runAction: async (params) => {
        seen.push(params);
        return { Success: true };
      },
    });

    await runLegacyOnSubmitHooks(hookContext, principal, provider, engine);

    expect(seen).toHaveLength(LEGACY_ON_SUBMIT_ACTION_NAMES.length);
    expect(seen.every((p) => p.Provider === provider && p.ContextUser === principal)).toBe(true);
  });
});
