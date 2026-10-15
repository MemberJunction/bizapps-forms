/**
 * Provider threading for `revokeResponseInvites` (#265), moved here from forms-server's
 * `resume-invites.service.spec.ts` with the function (#303 Task 8).
 *
 * Every read and write must run on the CALLER's provider, never on the process-global one: that
 * provider can have another unit of work's transaction open on it (bizapps-forms#260/#265), and any
 * query issued through it joins that transaction and races its COMMIT. Proven by identity (`toBe`)
 * through both paths the helper reaches the database: the minter (`RevokeAnonymousInvite`, which
 * takes the provider as `host`) and a direct `new RunView(provider)`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseProviderBase, IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

const CONTEXT_USER = { ID: 'staff-user-id' } as unknown as UserInfo;

/** The provider every call in this spec must reach — identity-compared, never a lookalike. */
const isolated = { name: 'isolated' } as unknown as DatabaseProviderBase;

const { revokeSpy, recordedProviders, scripted } = vi.hoisted(() => ({
  revokeSpy: vi.fn(),
  recordedProviders: [] as unknown[],
  scripted: { success: true, results: [] as unknown[], errorMessage: '' },
}));

vi.mock('../minter.js', () => ({
  MagicLinkMinterRegistry: {
    Instance: {
      Minter: { RevokeAnonymousInvite: revokeSpy },
    },
  },
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
        Success: scripted.success,
        Results: scripted.results as T[],
        RowCount: scripted.results.length,
        TotalRowCount: scripted.results.length,
        ExecutionTime: 0,
        ErrorMessage: scripted.errorMessage,
      } as RunViewResult<T>;
    }
  }
  return { ...actual, RunView: FakeRunView };
});

import { revokeResponseInvites } from '../response-invite-revocation.js';

beforeEach(() => {
  revokeSpy.mockReset();
  recordedProviders.length = 0;
  scripted.success = true;
  scripted.results = [];
  scripted.errorMessage = '';
});

describe('revokeResponseInvites', () => {
  it('lists AND revokes through the caller\'s isolated provider', async () => {
    scripted.results = [{ ID: 'inv-1' }];
    revokeSpy.mockResolvedValue({ success: true, changed: true });

    await revokeResponseInvites('r1', { deviceOnly: true }, CONTEXT_USER, isolated);

    // The RunView listing the Active invites was constructed on `isolated`, not the global default.
    expect(recordedProviders).toContain(isolated);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    const [, , host] = revokeSpy.mock.calls[0] as [unknown, unknown, unknown];
    expect(host).toBe(isolated);
  });
});
