/**
 * The DEFAULT (non-injected) sealed-response revoke path — bizapps-forms#260 final-review F1.
 *
 * `submit-pipeline-revoke-on-seal.spec.ts` covers the injected `ctx.revokeInvites` seam, and every
 * one of its tests supplies that seam — so the pipeline's OWN default branch was never exercised.
 * That branch used to call `revokeResponseInvites` with no provider at all, so its `RunView` read
 * and the minter's write both ran through the process-global provider: able to race another unit of
 * work's open transaction (`Common.LogActivity`), the exact collision #260 closed for the on-submit
 * hook chain. `withIsolatedProvider` and `revokeResponseInvites` are both mocked so these tests pin
 * WHICH provider reaches the revoke, not what a real revoke does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';

/** What `withIsolatedProvider` hands the revoke in production — pinned so the assertions below can
 * tell it apart from a provider reached some other way (the process-global one, in particular). */
const fakeProvider = { name: 'isolated-revoke-provider' } as unknown as DatabaseProviderBase;

interface RevokeCall {
  responseId: string;
  options: { deviceOnly: boolean };
  contextUser: UserInfo;
  provider?: DatabaseProviderBase;
}
const revokeCalls: RevokeCall[] = [];
const revokeResponseInvites = vi.fn(
  async (
    responseId: string,
    options: { deviceOnly: boolean },
    contextUser: UserInfo,
    provider?: DatabaseProviderBase,
  ) => {
    revokeCalls.push({ responseId, options, contextUser, provider });
    return { revoked: 0, failed: 0 };
  },
);

/** Rejects when a test sets it, so the isolation-failure case can be exercised without a real
 * `CreateIndependentInstance`. Defaults to running `work` on `fakeProvider`. */
let isolationFailure: Error | undefined;
const withIsolatedProvider = vi.fn(
  async (_purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) => {
    if (isolationFailure) {
      throw isolationFailure;
    }
    return work(fakeProvider);
  },
);

const logError = vi.fn();

vi.mock('../../magic-link/resume-invites.service', () => ({
  revokeResponseInvites: (
    responseId: string,
    options: { deviceOnly: boolean },
    contextUser: UserInfo,
    provider?: DatabaseProviderBase,
  ) => revokeResponseInvites(responseId, options, contextUser, provider),
}));
vi.mock('../../automation/isolated-provider', () => ({
  withIsolatedProvider: (purpose: string, work: (provider: DatabaseProviderBase) => Promise<unknown>) =>
    withIsolatedProvider(purpose, work),
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogError: (...args: unknown[]) => logError(...args),
}));

import { runSubmitPipeline, resetSubmitInFlightForTests, type PipelineContext, type PipelineSubmission } from '../submit-pipeline';
import { resetPublicSubmitConfigForTests } from '../config';
import { FormsRateLimiter } from '../rate-limit.service';
import {
  makeContextUser,
  makeDefinition,
  makeDistribution,
  makeFakeProvider,
  makeVersion,
  respondentPermissions,
} from './fakes';

/** A plain, unconfigured (legacy-dispatch) context with hooks stubbed and NO `revokeInvites` —
 * the seam under test is the pipeline's own default, not an injected replacement for it. */
function contextWithNoRevokeSeam(): PipelineContext {
  const fake = makeFakeProvider({
    distribution: makeDistribution(),
    version: makeVersion(makeDefinition()),
    createPermissions: respondentPermissions(),
  });
  return {
    provider: fake.provider,
    contextUser: makeContextUser(),
    elevatedUser: makeContextUser(),
    sessionId: 'sess-abc',
    fireHooks: async () => [],
  };
}

function finalSubmission(): PipelineSubmission {
  return {
    distributionSlug: 'public-1',
    formVersionId: 'ver-1',
    answers: [{ questionId: 'q-name', textValue: 'Ada' }],
  };
}

beforeEach(() => {
  FormsRateLimiter.Instance.resetForTests();
  resetPublicSubmitConfigForTests();
  resetSubmitInFlightForTests();
  revokeCalls.length = 0;
  revokeResponseInvites.mockClear();
  withIsolatedProvider.mockClear();
  logError.mockClear();
  isolationFailure = undefined;
});

afterEach(() => {
  resetPublicSubmitConfigForTests();
});

describe('the default (non-injected) sealed-response revoke path', () => {
  it('runs the revoke on the isolated provider withIsolatedProvider hands it, never the global one', async () => {
    const ctx = contextWithNoRevokeSeam();

    const result = await runSubmitPipeline(ctx, finalSubmission());

    expect(result.success).toBe(true);
    expect(withIsolatedProvider).toHaveBeenCalledTimes(1);
    expect(String(withIsolatedProvider.mock.calls[0][0])).toContain(String(result.responseId));
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0]).toEqual({
      responseId: result.responseId,
      options: { deviceOnly: false },
      contextUser: ctx.elevatedUser,
      provider: fakeProvider,
    });
  });

  it('logs an isolation failure with the response id and does not fail the submission', async () => {
    isolationFailure = new Error('connection pool exhausted');
    const ctx = contextWithNoRevokeSeam();

    const result = await runSubmitPipeline(ctx, finalSubmission());

    // The response row is already written by this point — an unretired credential is an operator
    // problem, never a failed submission.
    expect(result.success).toBe(true);
    expect(revokeCalls).toHaveLength(0);
    const responseId = result.responseId;
    if (!responseId) {
      throw new Error('expected the submission to report a responseId');
    }
    const logged = logError.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes(responseId) && m.includes('connection pool exhausted'))).toBe(true);
  });
});
