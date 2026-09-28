/**
 * Provider threading for the four resume-invite helpers (#265).
 *
 * Every read and write these helpers perform must run on the CALLER's provider, never on the
 * process-global one — see the header comment on `revokeResponseInvites` for why. This spec proves
 * only that threading, by identity (`toBe`), through both paths a helper can reach the database:
 * the minter (`MintAnonymousInvite`/`RevokeAnonymousInvite`, which take the provider as `host`) and
 * a direct `new RunView(provider)`. It is not a re-test of the helpers' existing behaviour (message
 * formatting, the "never throws" contract, etc.) — none of that changed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseProviderBase, IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

const CONTEXT_USER = { ID: 'staff-user-id' } as unknown as UserInfo;

/** The provider every call in this spec must reach — identity-compared, never a lookalike. */
const isolated = { name: 'isolated' } as unknown as DatabaseProviderBase;

const { mintSpy, revokeSpy, recordedProviders, scripted } = vi.hoisted(() => ({
  mintSpy: vi.fn(),
  revokeSpy: vi.fn(),
  recordedProviders: [] as unknown[],
  scripted: { success: true, results: [] as unknown[], errorMessage: '' },
}));

vi.mock('@mj-biz-apps/forms-core-entities-server', () => ({
  MagicLinkMinterRegistry: {
    Instance: {
      Minter: { MintAnonymousInvite: mintSpy, RevokeAnonymousInvite: revokeSpy },
    },
  },
  getMagicLinkProvisioningConfig: () => ({ applicationName: 'MJ Forms', roleName: 'Form Respondent' }),
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

import { findInviteByRawToken, mintResponseInvite, revokeInviteById, revokeResponseInvites } from '../resume-invites.service';

beforeEach(() => {
  mintSpy.mockReset();
  revokeSpy.mockReset();
  recordedProviders.length = 0;
  scripted.success = true;
  scripted.results = [];
  scripted.errorMessage = '';
});

describe('mintResponseInvite', () => {
  it('hands the minter the caller\'s isolated provider as `host`', async () => {
    mintSpy.mockResolvedValue({ success: true, inviteId: 'inv-1', rawToken: 'mj_ml_new' });

    await mintResponseInvite({ responseId: 'r1', channel: 'device', lifetimeDays: 15, maxUses: 1 }, CONTEXT_USER, isolated);

    expect(mintSpy).toHaveBeenCalledTimes(1);
    const [, contextUser, host] = mintSpy.mock.calls[0] as [unknown, UserInfo, unknown];
    expect(host).toBe(isolated);
    expect(contextUser).toBe(CONTEXT_USER);
  });
});

describe('revokeInviteById', () => {
  it('hands the minter the caller\'s isolated provider as `host`', async () => {
    revokeSpy.mockResolvedValue({ success: true, changed: true });

    await revokeInviteById('inv-1', 'r1', CONTEXT_USER, isolated);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    const [, , host] = revokeSpy.mock.calls[0] as [unknown, unknown, unknown];
    expect(host).toBe(isolated);
  });
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

describe('findInviteByRawToken', () => {
  it('looks the token up through the caller\'s isolated provider', async () => {
    scripted.results = [{ ID: 'inv-1', ResourceID: 'r1', Status: 'Active' }];

    await findInviteByRawToken('mj_ml_token', CONTEXT_USER, isolated);

    expect(recordedProviders).toContain(isolated);
    expect(recordedProviders).not.toContain(undefined);
  });
});
