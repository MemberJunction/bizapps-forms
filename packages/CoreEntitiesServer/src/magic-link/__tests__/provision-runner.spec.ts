import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type ProvisionContext } from '../provision-runner.js';
import type { MagicLinkProvisioningConfig } from '../config.js';
import type {
  IAnonymousMagicLinkMinter,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
} from '../minter.js';

const config: MagicLinkProvisioningConfig = Object.freeze({
  linkableChannels: new Set(['PublicLink', 'Embed', 'QR'] as const),
  defaultMaxUses: 1_000_000,
  fixedExpiryHours: undefined,
  applicationName: 'Forms',
  roleName: 'Form Respondent',
});

const contextUser = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;

function ctx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    distributionId: 'dist-1',
    channelType: 'PublicLink',
    status: 'Active',
    isActive: true,
    magicLinkInviteId: null,
    closeAt: null,
    ...overrides,
  };
}

/** A minter that records the params it was called with and returns a fixed result. */
function recordingMinter(result: MintAnonymousInviteResult): {
  minter: IAnonymousMagicLinkMinter;
  calls: { params: MintAnonymousInviteParams; user: UserInfo }[];
} {
  const calls: { params: MintAnonymousInviteParams; user: UserInfo }[] = [];
  const minter: IAnonymousMagicLinkMinter = {
    MintAnonymousInvite: async (params, user) => {
      calls.push({ params, user });
      return result;
    },
  };
  return { minter, calls };
}

describe('runProvisioning', () => {
  it('mints and stores when warranted, passing the correct CreateInvite params', async () => {
    const { minter, calls } = recordingMinter({
      success: true,
      inviteId: 'invite-99',
      rawToken: 'mj_ml_raw99',
    });
    const store = vi.fn(async () => true);

    const outcome = await runProvisioning(ctx(), config, minter, contextUser, store);

    expect(outcome).toEqual({ result: 'minted', inviteId: 'invite-99' });
    // The runner hands the store BOTH the invite id and the raw public-link token.
    expect(store).toHaveBeenCalledExactlyOnceWith({ inviteId: 'invite-99', rawToken: 'mj_ml_raw99' });
    expect(calls).toHaveLength(1);
    expect(calls[0].user).toBe(contextUser);
    expect(calls[0].params).toEqual({
      applicationName: 'Forms',
      roleName: 'Form Respondent',
      resourceTypeName: DISTRIBUTION_ENTITY_NAME,
      resourceId: 'dist-1',
      maxUses: 1_000_000,
      expiresAt: null, // no fixed expiry + no CloseAt => permanent
    });
  });

  it('passes CloseAt as the expiry when set and no fixed expiry configured', async () => {
    const closeAt = new Date('2026-09-01T00:00:00.000Z');
    const { minter, calls } = recordingMinter({ success: true, inviteId: 'invite-1' });
    await runProvisioning(ctx({ closeAt }), config, minter, contextUser, async () => true);
    expect(calls[0].params.expiresAt).toBe(closeAt);
  });

  it('is idempotent: does not mint when an invite already exists', async () => {
    const { minter, calls } = recordingMinter({ success: true, inviteId: 'x' });
    const store = vi.fn(async () => true);
    const outcome = await runProvisioning(
      ctx({ magicLinkInviteId: 'already-here' }),
      config,
      minter,
      contextUser,
      store,
    );
    expect(outcome.result).toBe('skipped-decision');
    expect(calls).toHaveLength(0);
    expect(store).not.toHaveBeenCalled();
  });

  it('does not mint for the Email channel', async () => {
    const { minter, calls } = recordingMinter({ success: true, inviteId: 'x' });
    const outcome = await runProvisioning(ctx({ channelType: 'Email' }), config, minter, contextUser, async () => true);
    expect(outcome.result).toBe('skipped-decision');
    expect(calls).toHaveLength(0);
  });

  it('does not mint a draft/inactive distribution', async () => {
    const { minter } = recordingMinter({ success: true, inviteId: 'x' });
    expect((await runProvisioning(ctx({ status: 'Draft' }), config, minter, contextUser, async () => true)).result).toBe(
      'skipped-decision',
    );
    expect((await runProvisioning(ctx({ isActive: false }), config, minter, contextUser, async () => true)).result).toBe(
      'skipped-decision',
    );
  });

  it('gates gracefully when NO minter is registered (host has not enabled magicLink)', async () => {
    const store = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, undefined, contextUser, store);
    expect(outcome.result).toBe('skipped-no-minter');
    expect(store).not.toHaveBeenCalled();
  });

  it('gates gracefully when the minter itself skips (magicLink disabled at mint time)', async () => {
    const { minter } = recordingMinter({ success: false, skipped: true, message: 'magicLink off' });
    const store = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, minter, contextUser, store);
    expect(outcome.result).toBe('skipped-minter');
    expect(store).not.toHaveBeenCalled();
  });

  it('reports a mint failure without storing anything', async () => {
    const { minter } = recordingMinter({ success: false, message: 'boom' });
    const store = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, minter, contextUser, store);
    expect(outcome.result).toBe('mint-failed');
    expect(store).not.toHaveBeenCalled();
  });

  it('reports a store failure but keeps the invite id', async () => {
    const { minter } = recordingMinter({ success: true, inviteId: 'invite-7' });
    const store = vi.fn(async () => false);
    const outcome = await runProvisioning(ctx(), config, minter, contextUser, store);
    expect(outcome).toEqual({ result: 'store-failed', inviteId: 'invite-7' });
  });

  it('skips when there is no context user', async () => {
    const { minter, calls } = recordingMinter({ success: true, inviteId: 'x' });
    const outcome = await runProvisioning(ctx(), config, minter, undefined, async () => true);
    expect(outcome.result).toBe('skipped-no-user');
    expect(calls).toHaveLength(0);
  });
});
