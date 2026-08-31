import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type ProvisionContext } from '../provision-runner.js';
import type { MagicLinkProvisioningConfig } from '../config.js';
import type {
  IAnonymousMagicLinkMinter,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
  RevokeAnonymousInviteResult,
} from '../minter.js';

const config: MagicLinkProvisioningConfig = Object.freeze({
  linkableChannels: new Set(['PublicLink', 'Embed', 'QR'] as const),
  defaultMaxUses: 1_000_000,
  fixedExpiryHours: undefined,
  applicationName: 'Forms',
  roleName: 'Form Respondent',
});

const contextUser = { ID: 'staff-1', Name: 'Staff' } as unknown as UserInfo;
const OLD_INVITE = 'invite-old';

/** A live, linkable distribution with no credential yet — the first-mint case. */
function ctx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return {
    distributionId: 'dist-1',
    channelType: 'PublicLink',
    status: 'Active',
    isActive: true,
    magicLinkInviteId: null,
    publicLinkToken: null,
    closeAt: null,
    ...overrides,
  };
}

/** A live link already holding a working credential. */
function livingCtx(overrides: Partial<ProvisionContext> = {}): ProvisionContext {
  return ctx({ magicLinkInviteId: OLD_INVITE, publicLinkToken: 'mj_ml_old', ...overrides });
}

interface FakeMinter {
  minter: IAnonymousMagicLinkMinter;
  mints: { params: MintAnonymousInviteParams; user: UserInfo }[];
  revokes: { inviteId: string; user: UserInfo }[];
}

/** Records every call and returns fixed results. */
function fakeMinter(
  mintResult: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' },
  revokeResult: RevokeAnonymousInviteResult = { success: true },
): FakeMinter {
  const mints: { params: MintAnonymousInviteParams; user: UserInfo }[] = [];
  const revokes: { inviteId: string; user: UserInfo }[] = [];
  return {
    mints,
    revokes,
    minter: {
      MintAnonymousInvite: async (params, user) => {
        mints.push({ params, user });
        return mintResult;
      },
      RevokeAnonymousInvite: async (inviteId, user) => {
        revokes.push({ inviteId, user });
        return revokeResult;
      },
    },
  };
}

describe('runProvisioning — minting', () => {
  it('mints and stores when warranted, passing the correct invite params', async () => {
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);

    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, persist);

    expect(outcome).toEqual({ result: 'minted', inviteId: 'invite-new' });
    expect(persist).toHaveBeenCalledExactlyOnceWith({ inviteId: 'invite-new', rawToken: 'mj_ml_new' });
    expect(fake.revokes).toHaveLength(0);
    expect(fake.mints).toHaveLength(1);
    expect(fake.mints[0].user).toBe(contextUser);
    expect(fake.mints[0].params).toEqual({
      applicationName: 'Forms',
      roleName: 'Form Respondent',
      resourceTypeName: DISTRIBUTION_ENTITY_NAME,
      resourceId: 'dist-1',
      maxUses: 1_000_000,
      expiresAt: null,
    });
  });

  it('bounds the invite by CloseAt when one is set', async () => {
    const closeAt = new Date('2026-09-01T00:00:00.000Z');
    const fake = fakeMinter();
    await runProvisioning(ctx({ closeAt }), config, fake.minter, contextUser, async () => true);
    expect(fake.mints[0].params.expiresAt).toBe(closeAt);
  });

  it('leaves a live link with a working credential entirely untouched', async () => {
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(livingCtx(), config, fake.minter, contextUser, persist);
    expect(outcome).toEqual({ result: 'noop', reason: 'current' });
    expect(fake.mints).toHaveLength(0);
    expect(fake.revokes).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it('refuses a mint that produced no raw token, and stores nothing', async () => {
    // A tokenless invite is a dead `/f/:slug` link, and "linked invite, no token" is
    // the reissue signal — so writing one would churn a fresh credential on every save.
    const fake = fakeMinter({ success: true, inviteId: 'invite-new' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, persist);
    expect(outcome.result).toBe('mint-failed');
    expect(persist).not.toHaveBeenCalled();
  });

  it('gates gracefully when NO minter is registered (host has not enabled magicLink)', async () => {
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, undefined, contextUser, persist);
    expect(outcome.result).toBe('skipped-no-minter');
    expect(persist).not.toHaveBeenCalled();
  });

  it('gates gracefully when the minter itself skips (magicLink disabled at mint time)', async () => {
    const fake = fakeMinter({ success: false, skipped: true, message: 'magicLink off' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, persist);
    expect(outcome.result).toBe('skipped-minter');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports a mint failure without storing anything', async () => {
    const fake = fakeMinter({ success: false, message: 'boom' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, persist);
    expect(outcome.result).toBe('mint-failed');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports a store failure but keeps the invite id', async () => {
    const fake = fakeMinter();
    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, async () => false);
    expect(outcome).toEqual({ result: 'store-failed', inviteId: 'invite-new' });
  });

  it('skips when there is no context user', async () => {
    const fake = fakeMinter();
    const outcome = await runProvisioning(ctx(), config, fake.minter, undefined, async () => true);
    expect(outcome.result).toBe('skipped-no-user');
    expect(fake.mints).toHaveLength(0);
    expect(fake.revokes).toHaveLength(0);
  });

  it('does nothing at all for a distribution that neither holds nor warrants a credential', async () => {
    const fake = fakeMinter();
    for (const override of [{ status: 'Draft' as const }, { isActive: false }, { channelType: 'Email' as const }]) {
      const outcome = await runProvisioning(ctx(override), config, fake.minter, contextUser, async () => true);
      expect(outcome).toEqual({ result: 'noop', reason: 'not-eligible' });
    }
    expect(fake.mints).toHaveLength(0);
    expect(fake.revokes).toHaveLength(0);
  });
});

describe('runProvisioning — revoking', () => {
  it('revokes and unlinks the credential when the link leaves Active', async () => {
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);

    const outcome = await runProvisioning(
      livingCtx({ status: 'Closed' }),
      config,
      fake.minter,
      contextUser,
      persist,
    );

    expect(outcome).toEqual({ result: 'revoked', inviteId: OLD_INVITE });
    expect(fake.revokes).toEqual([{ inviteId: OLD_INVITE, user: contextUser }]);
    expect(persist).toHaveBeenCalledExactlyOnceWith(null);
    expect(fake.mints).toHaveLength(0);
  });

  it('revokes for every way of leaving Active, and for an unlinkable channel', async () => {
    for (const override of [
      { status: 'Draft' as const },
      { status: 'Closed' as const },
      { isActive: false },
      { channelType: 'Email' as const },
    ]) {
      const fake = fakeMinter();
      const outcome = await runProvisioning(
        livingCtx(override),
        config,
        fake.minter,
        contextUser,
        async () => true,
      );
      expect(outcome.result, JSON.stringify(override)).toBe('revoked');
      expect(fake.revokes).toHaveLength(1);
    }
  });

  it('keeps the credential LINKED when the revoke fails, so the next save retries it', async () => {
    // Unlinking a credential we could not kill would orphan a live invite with nothing
    // pointing at it — unrevokable by any later save, and invisible in the builder.
    const fake = fakeMinter(undefined, { success: false, message: 'row locked' });
    const persist = vi.fn(async () => true);

    const outcome = await runProvisioning(
      livingCtx({ isActive: false }),
      config,
      fake.minter,
      contextUser,
      persist,
    );

    expect(outcome).toEqual({ result: 'revoke-failed', inviteId: OLD_INVITE });
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not mint a replacement when unlinking the revoked credential failed', async () => {
    const fake = fakeMinter();
    const outcome = await runProvisioning(
      livingCtx({ publicLinkToken: null }),
      config,
      fake.minter,
      contextUser,
      async () => false,
    );
    expect(outcome).toEqual({ result: 'revoke-failed', inviteId: OLD_INVITE });
    expect(fake.mints).toHaveLength(0);
  });

  it('revokes a stale credential even on a paused link that has already lost its token', async () => {
    const fake = fakeMinter();
    const outcome = await runProvisioning(
      livingCtx({ status: 'Closed', publicLinkToken: null }),
      config,
      fake.minter,
      contextUser,
      async () => true,
    );
    expect(outcome.result).toBe('revoked');
    expect(fake.mints).toHaveLength(0);
  });
});

describe('runProvisioning — reissuing', () => {
  it('revokes the old credential and mints a fresh one when a live link loses its token', async () => {
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);

    const outcome = await runProvisioning(
      livingCtx({ publicLinkToken: null }),
      config,
      fake.minter,
      contextUser,
      persist,
    );

    expect(outcome).toEqual({ result: 'reissued', inviteId: 'invite-new' });
    expect(fake.revokes).toEqual([{ inviteId: OLD_INVITE, user: contextUser }]);
    expect(fake.mints).toHaveLength(1);
    // Cleared first, then written: the record never points at two credentials at once.
    expect(persist.mock.calls).toEqual([[null], [{ inviteId: 'invite-new', rawToken: 'mj_ml_new' }]]);
  });

  it('reissues under the same distribution — the slug is never part of the credential', async () => {
    const fake = fakeMinter();
    await runProvisioning(livingCtx({ publicLinkToken: null }), config, fake.minter, contextUser, async () => true);
    expect(fake.mints[0].params.resourceId).toBe('dist-1');
  });

  it('leaves the link credential-less when the replacement mint fails after a successful revoke', async () => {
    // Fail-safe direction: no credential beats a stale one. The builder shows "Not ready"
    // and its "Issue the link" fix mints again.
    const fake = fakeMinter({ success: false, message: 'boom' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(
      livingCtx({ publicLinkToken: null }),
      config,
      fake.minter,
      contextUser,
      persist,
    );
    expect(outcome.result).toBe('mint-failed');
    expect(persist).toHaveBeenCalledExactlyOnceWith(null);
  });
});
