import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type ProvisionContext } from '../provision-runner.js';
import type { MagicLinkProvisioningConfig } from '../config.js';
import type {
  AnonymousCredentialRef,
  IAnonymousMagicLinkMinter,
  InviteExpiryBounds,
  InviteWriteResult,
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
  revokes: { credential: AnonymousCredentialRef; user: UserInfo }[];
  expiries: { credential: AnonymousCredentialRef; bounds: InviteExpiryBounds; user: UserInfo }[];
}

/** Records every call and returns fixed results. */
function fakeMinter(
  mintResult: MintAnonymousInviteResult = { success: true, inviteId: 'invite-new', rawToken: 'mj_ml_new' },
  revokeResult: InviteWriteResult = { success: true, changed: true },
  expiryResult: InviteWriteResult = { success: true, changed: false },
): FakeMinter {
  const mints: { params: MintAnonymousInviteParams; user: UserInfo }[] = [];
  const revokes: { credential: AnonymousCredentialRef; user: UserInfo }[] = [];
  const expiries: { credential: AnonymousCredentialRef; bounds: InviteExpiryBounds; user: UserInfo }[] = [];
  return {
    mints,
    revokes,
    expiries,
    minter: {
      MintAnonymousInvite: async (params, user) => {
        mints.push({ params, user });
        return mintResult;
      },
      RevokeAnonymousInvite: async (credential, user) => {
        revokes.push({ credential, user });
        return revokeResult;
      },
      SetAnonymousInviteExpiry: async (credential, bounds, user) => {
        expiries.push({ credential, bounds, user });
        return expiryResult;
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

  it('does not mint or revoke when only the expiry needed re-bounding', async () => {
    const fake = fakeMinter(undefined, undefined, { success: true, changed: true });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(livingCtx(), config, fake.minter, contextUser, persist);
    expect(outcome).toEqual({ result: 'expiry-updated', inviteId: OLD_INVITE });
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

  it('reports a store failure, keeps the invite id, and revokes the invite it could not store', async () => {
    // A minted invite nothing references is a live orphan — the exact object #104 is about, and
    // until this it was produced by any failed store and merely logged. Fail toward NO credential.
    const fake = fakeMinter();
    const outcome = await runProvisioning(ctx(), config, fake.minter, contextUser, async () => false);
    expect(outcome).toEqual({ result: 'store-failed', inviteId: 'invite-new' });
    expect(fake.revokes).toEqual([
      { credential: { inviteId: 'invite-new', resourceId: 'dist-1' }, user: contextUser },
    ]);
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
    expect(fake.revokes).toEqual([
      { credential: { inviteId: OLD_INVITE, resourceId: 'dist-1' }, user: contextUser },
    ]);
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
    const fake = fakeMinter(undefined, { success: false, changed: false, message: 'row locked' });
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

  it('reports a failed UNLINK apart from a failed revoke — the two mean opposite things', async () => {
    // The credential here is dead: the revoke landed and only clearing the columns failed. Saying
    // `revoke-failed` told the caller the leaked token might still redeem, which is the more
    // alarming of the two answers and the wrong one — and it is exactly the question the builder's
    // reissue flow asks. The retry differs too: this one owes two column writes, not a revocation.
    //
    // A PAUSE, not a reissue: the reissue path no longer performs an unlink save at all (it was the
    // concurrency window), so the only place an unlink can fail is where a credential is being
    // withdrawn without replacement.
    const fake = fakeMinter();
    const outcome = await runProvisioning(
      livingCtx({ status: 'Closed' }),
      config,
      fake.minter,
      contextUser,
      async () => false,
    );
    expect(outcome).toEqual({ result: 'unlink-failed', inviteId: OLD_INVITE });
    expect(fake.mints).toHaveLength(0);
    expect(fake.revokes).toHaveLength(1);
  });

  it('still reports revoke-failed when the revocation itself did not land', async () => {
    const fake = fakeMinter(undefined, { success: false, changed: false, message: 'nope' });
    const outcome = await runProvisioning(
      livingCtx({ status: 'Closed' }),
      config,
      fake.minter,
      contextUser,
      async () => true,
    );
    expect(outcome).toEqual({ result: 'revoke-failed', inviteId: OLD_INVITE });
  });

  it('reports an ownership refusal as its own outcome, because a retry will never fix it', async () => {
    // `revoke-failed` means "try again on the next save". A NULL or foreign `ResourceID` — the
    // population the backfill migration deliberately leaves alone — is refused on EVERY save,
    // and a log that reads like a transient failure sends an operator waiting for a retry
    // that will never land. The token stays on the record and stays redeemable meanwhile.
    const fake = fakeMinter(undefined, { success: false, changed: false, refused: true, message: 'not ours' });
    const persist = vi.fn(async () => true);
    const outcome = await runProvisioning(livingCtx({ status: 'Closed' }), config, fake.minter, contextUser, persist);
    expect(outcome).toEqual({ result: 'revoke-refused-not-ours', inviteId: OLD_INVITE });
    expect(persist).not.toHaveBeenCalled();
  });

  it('hands the minter the owning resource, so an implementation CAN refuse a foreign invite', async () => {
    // Retitled deliberately. This used to be called "refuses to act on an invite scoped to a
    // DIFFERENT distribution", which is a security property this test does not have: the fake
    // minter never refuses anything, and deleting the whole ownership check from
    // `MagicLinkInviteMinter.writeToInvite` leaves it green. A title that advertises a guarantee
    // its assertions do not check is worse than no test — it is where someone stops looking.
    //
    // What it DOES guard is the seam: `resourceId` travels with every credential write, which is
    // the precondition for refusing. The refusal itself is tested where it lives
    // (`MagicLinkInviteMinter.spec.ts`, "the credential must belong to the link acting on it")
    // and end-to-end in `apps/MJAPI/credential-lifecycle-smoke.mjs`.
    const fake = fakeMinter();
    await runProvisioning(livingCtx({ status: 'Closed' }), config, fake.minter, contextUser, async () => true);
    expect(fake.revokes[0].credential).toEqual({ inviteId: OLD_INVITE, resourceId: 'dist-1' });
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

describe('runProvisioning — keeping the credential bounded by its link', () => {
  it('re-bounds a kept credential to the link CloseAt on every save', async () => {
    // The gap this closes: expiry used to be set at mint and never revisited, so moving
    // or clearing a closing date afterwards left the credential dying on the old one
    // while the builder reported the link as live.
    const closeAt = new Date('2026-10-01T00:00:00.000Z');
    const fake = fakeMinter();
    await runProvisioning(livingCtx({ closeAt }), config, fake.minter, contextUser, async () => true);
    expect(fake.expiries).toEqual([
      {
        credential: { inviteId: OLD_INVITE, resourceId: 'dist-1' },
        bounds: { closeAt, maxLifetimeHours: undefined },
        user: contextUser,
      },
    ]);
  });

  it('asks for the bound to be REMOVED when the closing date is cleared', async () => {
    // "Remove the expiry" is the builder's own fix for a link that has ended. Without
    // this the invite stays expired and the fix produces a Live badge on a dead link.
    const fake = fakeMinter();
    await runProvisioning(livingCtx(), config, fake.minter, contextUser, async () => true);
    expect(fake.expiries).toHaveLength(1);
    expect(fake.expiries[0].bounds).toEqual({ closeAt: null, maxLifetimeHours: undefined });
  });

  it('reports an unchanged expiry as a plain no-op, not as work done', async () => {
    const fake = fakeMinter();
    const outcome = await runProvisioning(livingCtx(), config, fake.minter, contextUser, async () => true);
    expect(outcome).toEqual({ result: 'noop', reason: 'current' });
  });

  it('reports a failed re-bound rather than letting the drift pass silently', async () => {
    const fake = fakeMinter(undefined, undefined, { success: false, changed: false, message: 'nope' });
    const outcome = await runProvisioning(livingCtx(), config, fake.minter, contextUser, async () => true);
    expect(outcome).toEqual({ result: 'expiry-update-failed', inviteId: OLD_INVITE });
  });

  it('hands the minter the link BOUNDS, and never a wall-clock instant it resolved itself', async () => {
    // The lesson the no-expiry sentinel already taught, one bound over. A host-wide
    // `FORMS_MAGICLINK_EXPIRY_HOURS` is a bound on the credential's LIFE, so it can only be
    // resolved against the instant that credential was ISSUED — which is a fact about the
    // invite row, not about this save. Resolved here, against `now`, it is a different
    // instant on every pass, so a pass that runs after EVERY save rewrites the row every
    // time and walks the expiry forward forever: a ceiling a host configured in order to
    // bound the credential ends up never bounding anything, which is the exact
    // "credential outlives the thing it authorises" shape bizapps-forms#104 is about.
    const ceilinged = { ...config, fixedExpiryHours: 24 };
    const closeAt = new Date('2026-10-01T00:00:00.000Z');
    const fake = fakeMinter();
    await runProvisioning(livingCtx({ closeAt }), ceilinged, fake.minter, contextUser, async () => true);
    expect(fake.expiries).toEqual([
      {
        credential: { inviteId: OLD_INVITE, resourceId: 'dist-1' },
        bounds: { closeAt, maxLifetimeHours: 24 },
        user: contextUser,
      },
    ]);
  });

  it('never re-bounds a credential it is about to revoke or replace', async () => {
    const paused = fakeMinter();
    await runProvisioning(livingCtx({ status: 'Closed' }), config, paused.minter, contextUser, async () => true);
    expect(paused.expiries).toHaveLength(0);

    const reissuing = fakeMinter();
    await runProvisioning(
      livingCtx({ publicLinkToken: null }),
      config,
      reissuing.minter,
      contextUser,
      async () => true,
    );
    expect(reissuing.expiries).toHaveLength(0);
  });

  it('stays quiet when there is no minter or no user to re-bound with', async () => {
    // An ordinary rename on a host without magic links must not log a failure.
    expect(
      await runProvisioning(livingCtx(), config, undefined, contextUser, async () => true),
    ).toEqual({ result: 'noop', reason: 'current' });
    const fake = fakeMinter();
    expect(
      await runProvisioning(livingCtx(), config, fake.minter, undefined, async () => true),
    ).toEqual({ result: 'noop', reason: 'current' });
    expect(fake.expiries).toHaveLength(0);
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
    expect(fake.revokes).toEqual([
      { credential: { inviteId: OLD_INVITE, resourceId: 'dist-1' }, user: contextUser },
    ]);
    expect(fake.mints).toHaveLength(1);
    // ONE save, carrying the new pair. There used to be two — clear, then write — and the
    // moment between them read as "live link, no credential" to any concurrent load, which
    // then minted a second invite and left the loser Active and unreferenced. The invariant
    // "never points at two credentials" holds trivially here: the old pair is replaced by the
    // new in a single write, and the old invite was revoked before that write.
    expect(persist.mock.calls).toEqual([[{ inviteId: 'invite-new', rawToken: 'mj_ml_new' }]]);
  });

  it('never persists an intermediate "no credential" state on the reissue path', async () => {
    // The concurrency window, stated as a property of the write sequence rather than by
    // racing two instances: no persist call carries null unless the mint has failed.
    const fake = fakeMinter();
    const persist = vi.fn(async () => true);
    await runProvisioning(livingCtx({ publicLinkToken: null }), config, fake.minter, contextUser, persist);
    expect(persist.mock.calls.some(([value]) => value === null)).toBe(false);
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
