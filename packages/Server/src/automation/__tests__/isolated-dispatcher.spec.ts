/**
 * `isolatedDispatcher` chooses which provider each planned automation dispatches on: Sync stays
 * on the chain's own isolated instance, Async gets a scope of its own (bizapps-forms#260,
 * relocated — `runAutomations` fires Async automations without awaiting them, so one can still be
 * running after the chain's `withIsolatedProvider` scope releases the chain's instance).
 *
 * `dispatchAutomation` is mocked so these tests assert on WHICH provider reached it, never on what
 * a real dispatch does — that behaviour is covered by `dispatch-automation.spec.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { CanonicalAnswers } from '@mj-biz-apps/forms-entities';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import type { DispatchContext } from '../dispatch-automation';
import type { IsolatedProviderRunner } from '../isolated-provider';
import type { DispatchContextBuilder } from '../isolated-dispatcher';

const dispatchCalls: Array<{ automation: PublishedFormAutomation; ctx: DispatchContext }> = [];

vi.mock('../dispatch-automation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dispatch-automation')>();
  return {
    ...actual,
    dispatchAutomation: vi.fn(async (automation: PublishedFormAutomation, ctx: DispatchContext) => {
      dispatchCalls.push({ automation, ctx });
    }),
  };
});

const { isolatedDispatcher } = await import('../isolated-dispatcher');

function fakeProvider(tag: string): DatabaseProviderBase {
  return { tag } as unknown as DatabaseProviderBase;
}

function automation(overrides?: Partial<PublishedFormAutomation>): PublishedFormAutomation {
  return {
    id: 'auto-1',
    name: 'Test automation',
    targetType: 'Action',
    actionId: 'act-1',
    trigger: 'OnComplete',
    executionMode: 'Sync',
    displayOrder: 1,
    continueOnError: true,
    isActive: true,
    ...overrides,
  };
}

/** A minimal, realistic `DispatchContext` — every field but `provider` is fixed across the plan. */
function baseContext(_automation: PublishedFormAutomation, provider: DatabaseProviderBase): DispatchContext {
  return {
    responseId: 'resp-1',
    formId: 'form-1',
    formVersionId: 'ver-1',
    distributionId: 'dist-1',
    answers: new CanonicalAnswers([]),
    questionTypes: new Map(),
    principal: { Name: 'Forms Automation Service' } as unknown as UserInfo,
    allowedEntities: null,
    provider,
  };
}

beforeEach(() => {
  dispatchCalls.length = 0;
});

describe('isolatedDispatcher', () => {
  it('dispatches a Sync automation on the chain provider and never calls isolate', async () => {
    const chainProvider = fakeProvider('chain');
    let isolateCallCount = 0;
    // Typed as `IsolatedProviderRunner` (not `vi.fn()`) so it stays assignable to a generic
    // parameter — a `Mock<...>` wrapper flattens the generic signature into one concrete
    // instantiation and fails typecheck at the call site (see `on-submit-hooks.service.spec.ts`
    // for the same pattern already established in this package).
    const isolate: IsolatedProviderRunner = async () => {
      isolateCallCount += 1;
      throw new Error('isolate should never be called for a Sync automation');
    };
    const dispatch = isolatedDispatcher(chainProvider, 'resp-1', baseContext, isolate);

    await dispatch(automation({ executionMode: 'Sync' }));

    expect(isolateCallCount).toBe(0);
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].ctx.provider).toBe(chainProvider);
  });

  it("gives an Async automation its own isolated scope, named for the automation and the response, and dispatches it on that scope's provider — never the chain one", async () => {
    const chainProvider = fakeProvider('chain');
    const ownProvider = fakeProvider('own');
    const isolateCalls: string[] = [];
    const isolate: IsolatedProviderRunner = async (purpose, work) => {
      isolateCalls.push(purpose);
      return work(ownProvider);
    };
    const dispatch = isolatedDispatcher(chainProvider, 'resp-1', baseContext, isolate);

    await dispatch(automation({ id: 'auto-async-1', executionMode: 'Async' }));

    expect(isolateCalls).toHaveLength(1);
    expect(isolateCalls[0]).toContain('auto-async-1');
    expect(isolateCalls[0]).toContain('resp-1');
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].ctx.provider).toBe(ownProvider);
    expect(dispatchCalls[0].ctx.provider).not.toBe(chainProvider);
  });

  it('builds the dispatch context with the SAME provider it dispatches on, for both Sync and Async — never one built off the chain provider and patched afterward', async () => {
    // The regression this guards: `buildContext` used to be called ONCE with `chainProvider`
    // (even for an Async automation), and only `.provider` was overwritten afterward via a
    // spread. That is invisible to a builder that merely stores its provider argument — which is
    // all `baseContext` does — so this test uses a builder that RECORDS which provider it was
    // called with, the thing a spread-after-the-fact could never fix.
    const chainProvider = fakeProvider('chain');
    const ownProvider = fakeProvider('own');
    const seenProviders: DatabaseProviderBase[] = [];
    const recordingContext: DispatchContextBuilder = (a, provider) => {
      seenProviders.push(provider);
      return baseContext(a, provider);
    };
    const isolate: IsolatedProviderRunner = async (_purpose, work) => work(ownProvider);
    const dispatch = isolatedDispatcher(chainProvider, 'resp-1', recordingContext, isolate);

    await dispatch(automation({ executionMode: 'Sync' }));
    await dispatch(automation({ id: 'auto-async-1', executionMode: 'Async' }));

    // Exactly one buildContext call per automation — never a throwaway call against the wrong
    // provider — and each call receives the provider that automation actually dispatches on.
    expect(seenProviders).toEqual([chainProvider, ownProvider]);
  });

  it('propagates the rejection to the caller when isolate fails for an Async automation, without dispatching', async () => {
    const chainProvider = fakeProvider('chain');
    const isolate: IsolatedProviderRunner = async () => {
      throw new Error('pool exhausted');
    };
    const dispatch = isolatedDispatcher(chainProvider, 'resp-1', baseContext, isolate);

    // The runner's `runOne` is what catches and records this (automation-runner.spec.ts pins
    // that); this dispatcher must not swallow it itself, or `runOne` would record a silent
    // success for work that never ran.
    await expect(dispatch(automation({ executionMode: 'Async' }))).rejects.toThrow('pool exhausted');

    expect(dispatchCalls).toHaveLength(0);
  });
});
