/**
 * Provider threading through the device-resume dependency adapter (#265).
 *
 * `makeDeviceResumeDeps` is the seam between the pure route bodies (`device-resume.service.ts`) and
 * the database — every dependency that touches it must run on `ResumeDepsContext.acquireProvider()`'s
 * instance, never on the process-global provider a concurrent unit of work (Common.LogActivity)
 * could hold a transaction open on. This spec proves that threading by identity (`toBe`), and that a
 * failed `acquireProvider()` is never swallowed into a falsy/"disabled" outcome — it must reject, so
 * `/resume` cannot mistake an isolation failure for proof that a pointer is dead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseProviderBase, IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import type { ResumeDepsContext } from '../resume-deps';

/** The provider every dependency in this spec must reach — identity-compared. */
const isolated = { name: 'isolated' } as unknown as DatabaseProviderBase;
const SYSTEM_USER = { ID: 'system-user-id' } as unknown as UserInfo;

const { mintSpy, revokeSpy, inviteForSpy, revokeInviteSpy, recordedProviders, scripted } = vi.hoisted(() => ({
  mintSpy: vi.fn(),
  revokeSpy: vi.fn(),
  inviteForSpy: vi.fn(),
  revokeInviteSpy: vi.fn(),
  recordedProviders: [] as unknown[],
  scripted: { rows: [] as unknown[] },
}));

vi.mock('../../magic-link/resume-invites.service', () => ({
  mintResponseInvite: mintSpy,
  revokeResponseInvites: revokeSpy,
  findInviteByRawToken: inviteForSpy,
  revokeInviteById: revokeInviteSpy,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  /** Records the constructor argument it was built with — the seam for provider threading. */
  class FakeRunView {
    constructor(provider?: IRunViewProvider | null) {
      recordedProviders.push(provider);
    }
    async RunView<T>(_params: RunViewParams, _user?: UserInfo): Promise<RunViewResult<T>> {
      return {
        Success: true,
        Results: scripted.rows as T[],
        RowCount: scripted.rows.length,
        TotalRowCount: scripted.rows.length,
        ExecutionTime: 0,
        ErrorMessage: '',
      } as RunViewResult<T>;
    }
  }
  return { ...actual, RunView: FakeRunView };
});

import { makeDeviceResumeDeps } from '../resume-deps';

function buildCtx(acquireProvider: () => Promise<DatabaseProviderBase>): ResumeDepsContext {
  return { systemUser: SYSTEM_USER, slug: 's', callerKey: 'k', acquireProvider };
}

beforeEach(() => {
  mintSpy.mockReset().mockResolvedValue({ ok: true });
  revokeSpy.mockReset().mockResolvedValue({ revoked: 0, failed: 0 });
  inviteForSpy.mockReset().mockResolvedValue({ ok: true });
  revokeInviteSpy.mockReset().mockResolvedValue(undefined);
  recordedProviders.length = 0;
  scripted.rows = [];
});

describe('makeDeviceResumeDeps — each DB-touching dependency runs on the request\'s isolated provider', () => {
  const acquireIsolated = vi.fn(async () => isolated);

  it('loadDistribution reads through it', async () => {
    scripted.rows = [
      { ID: 'd1', Slug: 's', AllowDeviceResume: true, CloseAt: null, Status: 'Active', IsActive: true, OpenAt: null, MaxResponses: null, ResponseCount: 0 },
    ];
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.loadDistribution('s');

    expect(recordedProviders).toEqual([isolated]);
  });

  it('loadResponse reads through it', async () => {
    scripted.rows = [{ ID: 'r1', Status: 'Partial', AnonymousSessionID: 'sid', FormDistributionID: null }];
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.loadResponse('r1');

    expect(recordedProviders).toEqual([isolated]);
  });

  it('mint mints through it', async () => {
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.mint({ responseId: 'r1', closeAt: null });

    expect(mintSpy).toHaveBeenCalledTimes(1);
    expect(mintSpy.mock.calls[0][2]).toBe(isolated);
  });

  it('revoke revokes through it', async () => {
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.revoke({ responseId: 'r1', deviceOnly: true });

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy.mock.calls[0][3]).toBe(isolated);
  });

  it('inviteFor looks up through it', async () => {
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.inviteFor('mj_ml_token');

    expect(inviteForSpy).toHaveBeenCalledTimes(1);
    expect(inviteForSpy.mock.calls[0][2]).toBe(isolated);
  });

  it('revokeInvite revokes through it', async () => {
    const deps = makeDeviceResumeDeps(buildCtx(acquireIsolated));

    await deps.revokeInvite({ inviteId: 'inv-1', responseId: 'r1' });

    expect(revokeInviteSpy).toHaveBeenCalledTimes(1);
    expect(revokeInviteSpy.mock.calls[0][3]).toBe(isolated);
  });
});

describe('makeDeviceResumeDeps — an isolation failure is never swallowed', () => {
  it('propagates acquireProvider()\'s rejection and never calls the helper', async () => {
    const outage = new Error('isolated provider outage');
    const acquireFails = vi.fn(async (): Promise<DatabaseProviderBase> => {
      throw outage;
    });
    const deps = makeDeviceResumeDeps(buildCtx(acquireFails));

    // Catching this here (turning it into `{ ok: false }`) is exactly the defect #265 rules out:
    // `/resume` would read that as "no live pointer" and clear a cookie a real outage says nothing
    // about. The dependency must reject, and the ROUTE decides what a rejection means.
    await expect(deps.inviteFor('mj_ml_token')).rejects.toBe(outage);
    expect(inviteForSpy).not.toHaveBeenCalled();
  });
});
