/**
 * What a CONFIGURED form's automations do when the automation principal cannot read the response.
 *
 * `loadFormResponseContext` distinguishes a response that does not exist (`absent`) from one the
 * principal could not read (`failed`, #239) — almost always a missing grant on the `Forms
 * Automation Runner` role. The pipeline must run nothing on a failed load AND say why through
 * `LogError` with the underlying message; before #239 the two cases were one `null` and a missing
 * grant read as "response not found" in the log, which sent operators after the wrong bug.
 *
 * Only the seams around the pipeline are faked: the loader, the principal and the dispatcher. The
 * pipeline itself runs for real, with hooks awaited (`FORMS_HOOKS_BLOCKING`) so the assertions see
 * the outcome instead of racing a detached promise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { ActionDataProvider, FormResponseContextResult } from '@mj-biz-apps/forms-actions';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';

const loadFormResponseContext =
  vi.fn<(responseId: string, user: UserInfo, provider: ActionDataProvider) => Promise<FormResponseContextResult>>();
// What `withIsolatedProvider` hands the loader in production — a fake, so the assertion below can
// pin that it's THIS provider (bizapps-forms#260's whole point) reaching the loader, not a second
// one built some other way.
const fakeProvider = { name: 'fake-provider' } as unknown as DatabaseProviderBase;
// Rejects when a test sets it, so the isolation-failure case can be exercised without a real
// CreateIndependentInstance. Defaults to running `work` on `fakeProvider`, mirroring the real
// `withIsolatedProvider`'s contract from the caller's point of view.
let isolationFailure: Error | undefined;
const withIsolatedProvider = vi.fn(async (_purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) => {
  if (isolationFailure) {
    throw isolationFailure;
  }
  return work(fakeProvider);
});
const dispatchAutomation = vi.fn(async () => ({ success: true }));
const logError = vi.fn();

vi.mock('@mj-biz-apps/forms-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mj-biz-apps/forms-actions')>()),
  loadFormResponseContext: (responseId: string, user: UserInfo, provider: ActionDataProvider) =>
    loadFormResponseContext(responseId, user, provider),
}));
vi.mock('../../automation/service-principal', () => ({
  resolveAutomationPrincipal: () => ({ ID: 'principal-1', Name: 'Forms Automation Service', IsActive: true }),
}));
vi.mock('../../automation/dispatch-automation', () => ({
  dispatchAutomation: (...args: unknown[]) => dispatchAutomation(...(args as [])),
}));
vi.mock('../../automation/isolated-provider', () => ({
  withIsolatedProvider: (purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) =>
    withIsolatedProvider(purpose, work),
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (...args: unknown[]) => logError(...args),
}));

import { runSubmitPipeline, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { resetPublicSubmitConfigForTests } from '../config';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

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

function submission(): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada Lovelace' }],
  };
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
  return {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
  };
}

describe('configured automations when the response cannot be loaded as the principal', () => {
  beforeEach(() => {
    delete process.env.FORMS_TURNSTILE_SECRET;
    process.env.FORMS_HOOKS_BLOCKING = 'true';
    resetPublicSubmitConfigForTests();
    loadFormResponseContext.mockReset();
    dispatchAutomation.mockClear();
    logError.mockClear();
    withIsolatedProvider.mockClear();
    isolationFailure = undefined;
  });

  afterEach(() => {
    delete process.env.FORMS_HOOKS_BLOCKING;
    resetPublicSubmitConfigForTests();
  });

  it('runs nothing and logs the underlying read failure through LogError', async () => {
    const reason = "User forms-automation@localhost.invalid does not have read permissions on MJ_BizApps_Forms: Form Responses";
    loadFormResponseContext.mockResolvedValue({ status: 'failed', error: reason });

    const result = await runSubmitPipeline(configuredContext(), submission());

    // The respondent's submission is unaffected: automations are best-effort after the save.
    expect(result.success).toBe(true);
    expect(loadFormResponseContext).toHaveBeenCalledOnce();
    // Pin that the loader ran on the provider `withIsolatedProvider` handed it, not a fresh one —
    // id/principal are read back from the actual call rather than re-asserted, since only the
    // provider is this test's concern (bizapps-forms#260).
    const [id, principal] = loadFormResponseContext.mock.calls[0];
    expect(loadFormResponseContext).toHaveBeenCalledWith(id, principal, fakeProvider);
    expect(dispatchAutomation).not.toHaveBeenCalled();
    const logged = logError.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes('could not be loaded as the automation principal') && m.includes(reason))).toBe(true);
  });

  it('does not report an absent response as a load failure', async () => {
    loadFormResponseContext.mockResolvedValue({ status: 'absent' });

    const result = await runSubmitPipeline(configuredContext(), submission());

    expect(result.success).toBe(true);
    expect(dispatchAutomation).not.toHaveBeenCalled();
    expect(logError.mock.calls.map((c) => String(c[0])).some((m) => m.includes('could not be loaded'))).toBe(false);
  });

  it('dispatches nothing and never calls the loader when the isolated provider cannot be created', async () => {
    isolationFailure = new Error('connection pool exhausted');

    const result = await runSubmitPipeline(configuredContext(), submission());

    // Same contract as every other automation failure: the respondent's submission already
    // succeeded, so an isolation failure is best-effort and never reported to them.
    expect(result.success).toBe(true);
    expect(loadFormResponseContext).not.toHaveBeenCalled();
    expect(dispatchAutomation).not.toHaveBeenCalled();
    const responseId = result.responseId;
    if (!responseId) {
      throw new Error('expected the submission to report a responseId');
    }
    const logged = logError.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes(responseId) && m.includes('connection pool exhausted'))).toBe(true);
  });
});
