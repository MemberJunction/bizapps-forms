/**
 * A CONFIGURED form's automations, from the submit path: until the submit publishes to the work
 * queue (#303 Task 8) the pipeline runs them inline through `FormAutomationEngine.RunForResponse` —
 * the very call the `Forms.RunAutomations` handler makes, so the plan, the redelivery skip and the
 * per-step isolation have one implementation. What happens INSIDE the run (a response the principal
 * cannot read, a snapshot that cannot be parsed) is the engine's, specced in
 * forms-core-entities-server's `FormAutomationEngine.run.spec.ts`.
 *
 * What this pins is the pipeline's side of it: the run gets an isolated provider (bizapps-forms#260),
 * the automation principal, the elevated user to read with — and nothing it does can fail a
 * submission that is already saved. Hooks are awaited (`FORMS_HOOKS_BLOCKING`) so the assertions see
 * the outcome instead of racing a detached promise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';

const fakeIsolated = { name: 'isolated-provider' } as unknown as DatabaseProviderBase;
let isolationFailure: Error | undefined;
const withIsolatedProvider = vi.fn(async (_purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) => {
  if (isolationFailure) {
    throw isolationFailure;
  }
  return work(fakeIsolated);
});
const runForResponse = vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ dispatch: 'configured', results: [], legacy: [], retry: false, stopped: false }));
const PRINCIPAL = { ID: 'principal-1', Name: 'Forms Automation Service', IsActive: true };
let principal: typeof PRINCIPAL | null = PRINCIPAL;
const logError = vi.fn();

vi.mock('@mj-biz-apps/forms-core-entities-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mj-biz-apps/forms-core-entities-server')>();
  return {
    ...actual,
    resolveAutomationPrincipal: () => principal,
    withIsolatedProvider: (purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) => withIsolatedProvider(purpose, work),
    FormAutomationEngine: { Instance: { RunForResponse: (...args: unknown[]) => runForResponse(...args) } },
  };
});
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (...args: unknown[]) => logError(...args),
}));

import { runSubmitPipeline, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { resetPublicSubmitConfigForTests } from '../config';
import { FormAutomationError } from '@mj-biz-apps/forms-core-entities-server';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from '@mj-biz-apps/forms-core-entities-server/testing';

const AUTOMATION: PublishedFormAutomation = {
  id: 'auto-1',
  name: 'Followup',
  targetType: 'Action',
  actionId: 'action-1',
  trigger: 'OnComplete',
  executionMode: 'Sync',
  displayOrder: 0,
  continueOnError: true,
  isActive: true,
};

const ELEVATED = { ID: 'elevated-1', Name: 'System' } as unknown as UserInfo;

function submission(): PipelineSubmission {
  return { distributionSlug: 'public-1', formVersionId: 'ver-1', answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }] };
}

/** A configured form with one automation and NO injected firer, so the real configured path runs. */
function configuredContext(): PipelineContext {
  const definition = makeDefinition({
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!', onSubmitMode: 'Configured' },
    automations: [AUTOMATION],
  });
  const fake = makeFakeProvider({
    distribution: makeDistribution({ CaptchaRequired: false, MaxResponses: null, ResponseCount: 0 }),
    version: makeVersion(definition),
    createPermissions: respondentPermissions(),
  });
  return { provider: fake.provider, contextUser: makeContextUser(), elevatedUser: ELEVATED, sessionId: 'sess-abc' };
}

describe('configured automations from the submit path', () => {
  beforeEach(() => {
    delete process.env.FORMS_TURNSTILE_SECRET;
    process.env.FORMS_HOOKS_BLOCKING = 'true';
    resetPublicSubmitConfigForTests();
    runForResponse.mockClear();
    withIsolatedProvider.mockClear();
    logError.mockClear();
    isolationFailure = undefined;
    principal = PRINCIPAL;
  });

  afterEach(() => {
    delete process.env.FORMS_HOOKS_BLOCKING;
    resetPublicSubmitConfigForTests();
  });

  it('runs the response through the engine on an isolated provider, as the principal, reading as the elevated user', async () => {
    const result = await runSubmitPipeline(configuredContext(), submission());

    expect(result.success).toBe(true);
    expect(runForResponse).toHaveBeenCalledOnce();
    const [request, provider, reader] = runForResponse.mock.calls[0] as [Record<string, unknown>, unknown, unknown];
    expect(request).toMatchObject({ responseId: result.responseId, trigger: 'OnComplete' });
    expect(request.principal).toBe(PRINCIPAL);
    expect(provider).toBe(fakeIsolated);
    expect(reader).toBe(ELEVATED);
  });

  it('keeps the submission a success when the engine refuses, and leaves the logging to the engine', async () => {
    runForResponse.mockRejectedValueOnce(new FormAutomationError('Response x could not be read for its automations.', { fault: true }));

    const result = await runSubmitPipeline(configuredContext(), submission());

    expect(result.success).toBe(true);
    expect(logError.mock.calls.map((c) => String(c[0])).some((m) => m.includes('automations failed'))).toBe(false);
  });

  it('runs nothing — and says so, with the response — when no isolated provider can be created', async () => {
    isolationFailure = new Error('connection pool exhausted');

    const result = await runSubmitPipeline(configuredContext(), submission());

    expect(result.success).toBe(true);
    expect(runForResponse).not.toHaveBeenCalled();
    const logged = logError.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes(String(result.responseId)) && m.includes('connection pool exhausted'))).toBe(true);
  });

  it('runs nothing — never as anyone broader — when the automation principal is not provisioned', async () => {
    principal = null;

    const result = await runSubmitPipeline(configuredContext(), submission());

    expect(result.success).toBe(true);
    // The pipeline leases isolated providers for other work (retiring a sealed response's resume
    // links); none is leased for automations.
    expect(withIsolatedProvider.mock.calls.map(([purpose]) => purpose).filter((p) => p.includes('automations'))).toEqual([]);
    expect(runForResponse).not.toHaveBeenCalled();
  });
});
