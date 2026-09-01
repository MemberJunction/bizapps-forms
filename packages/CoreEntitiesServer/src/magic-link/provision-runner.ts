/**
 * Orchestration for the lifecycle of a distribution's anonymous magic-link
 * credential, decoupled from the BaseEntity so it is unit-testable without a DB or
 * entity metadata. The entity hook (`FormDistributionEntityServer`) is a thin
 * adapter that supplies this runner with the distribution's current state, the
 * context user, and one callback that writes the credential onto the record.
 *
 * It runs after EVERY save of a distribution and restores a single invariant —
 * see `provisioning-decision.ts`, which states it and decides what this save owes
 * it. This module is only the imperative half: call the minter, write the record,
 * and be honest in the log about anything that did not happen.
 */
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import type { MagicLinkProvisioningConfig } from './config.js';
import { decideProvisioning, resolveExpiry, type DistributionProvisioningState, type ProvisioningReason } from './provisioning-decision.js';
import type { IAnonymousMagicLinkMinter } from './minter.js';

/** Entity name of the distribution itself — the resource the invite is scoped to. */
export const DISTRIBUTION_ENTITY_NAME = 'MJ_BizApps_Forms: Form Distributions';

/** Inputs the runner needs from the saved distribution record. */
export interface ProvisionContext extends DistributionProvisioningState {
  /** The distribution's primary key (the scoped resource id). */
  distributionId: string;
}

/** A distribution's live credential: the invite row, and the raw token that redeems it. */
export interface MintedLink {
  /** The `MJ: Magic Link Invites` row ID → `FormDistribution.MagicLinkInviteID`. */
  inviteId: string;
  /** The raw redeemable token → `FormDistribution.PublicLinkToken`. */
  rawToken: string;
}

/**
 * Writes the distribution's credential, or clears it when given `null`.
 *
 * One callback rather than a store-and-a-clear pair, because the two are one
 * decision — "make this record's credential be exactly this" — and splitting them
 * is how a record ends up holding half of one and half of another. Returns the
 * save's success; the runner treats `false` as a reason to stop rather than press on.
 */
export type PersistCredential = (credential: MintedLink | null) => Promise<boolean>;

/** What a provisioning run did (for logging/assertions; never throws). */
export interface ProvisionOutcome {
  result:
    | 'noop'
    | 'minted'
    | 'revoked'
    | 'reissued'
    | 'expiry-updated'
    | 'expiry-update-failed'
    | 'revoke-failed'
    /** The minter refused: the invite is not scoped to this distribution. Will NOT self-heal. */
    | 'revoke-refused-not-ours'
    | 'unlink-failed'
    | 'skipped-no-minter'
    | 'skipped-no-user'
    | 'skipped-minter'
    | 'mint-failed'
    | 'store-failed';
  /** The invite the outcome is about: the new one after a mint, the old one after a revoke. */
  inviteId?: string;
  /** The decision's reason, on a `noop` — which of the do-nothing cases this was. */
  reason?: ProvisioningReason;
}

/**
 * Restore the credential invariant for a distribution that has just been saved.
 *
 * Fail-soft throughout: a missing minter / user, a minter skip, or a mint / revoke /
 * store failure is logged and returned — never thrown — so the caller's save stands.
 * The one thing it will not do is press on after a failure that would leave the
 * record inconsistent; each such stop is documented at its site.
 *
 * @param ctx               current distribution state
 * @param config            provisioning configuration
 * @param minter            the registered minter, or `undefined` when none is registered
 * @param contextUser       the internal staff user saving the record (the invite issuer)
 * @param persistCredential writes (or clears) the credential on the record
 */
export async function runProvisioning(
  ctx: ProvisionContext,
  config: MagicLinkProvisioningConfig,
  minter: IAnonymousMagicLinkMinter | undefined,
  contextUser: UserInfo | undefined,
  persistCredential: PersistCredential,
): Promise<ProvisionOutcome> {
  const decision = decideProvisioning(ctx, config);
  if (!decision.revoke && !decision.mint) {
    // Nothing to issue or withdraw. A credential we are KEEPING still has to stay
    // bounded by the link's own closing date, and that is the one part of it nobody's
    // save will fix later: revocation rides a save, but a closing date passes at
    // midnight with nobody watching, so the invite's own expiry is the only thing that
    // ends the credential on time. Which means it has to keep up with the date it
    // mirrors — an author moving or clearing `CloseAt` otherwise leaves a credential
    // expiring on the old one while the builder reports the link as live.
    return decision.reason === 'current'
      ? await realignExpiry(ctx, config, minter, contextUser)
      : { result: 'noop', reason: decision.reason };
  }

  if (!minter) {
    LogStatus(
      `[FormDistribution] Anonymous links unavailable for distribution ${ctx.distributionId} ` +
        `(wanted: ${decision.reason}): no magic-link minter registered. Enable core 'magicLink' ` +
        `(with role '${config.roleName}' grantable) to provision public form links. The distribution was saved.`,
    );
    return { result: 'skipped-no-minter' };
  }
  if (!contextUser) {
    LogError(
      `[FormDistribution] Cannot manage the magic-link credential for distribution ${ctx.distributionId} ` +
        `(wanted: ${decision.reason}): no context user.`,
    );
    return { result: 'skipped-no-user' };
  }

  if (decision.revoke) {
    // Two failures, deliberately told apart. `revoke-failed` means the credential MAY STILL BE
    // REDEEMABLE and the retry must be the revocation; `unlink-failed` means it is dead and the
    // record is merely still advertising it, where the retry is clearing two columns. Collapsing
    // them told every caller, log reader and test the more alarming of the two regardless, and it
    // is the reissue path's answer to "did the leaked token stop working?".
    const withdrawn = await withdrawCredential(ctx, minter, contextUser, persistCredential);
    if (withdrawn !== 'withdrawn') {
      return { result: withdrawn, inviteId: ctx.magicLinkInviteId ?? undefined };
    }
    if (!decision.mint) {
      LogStatus(
        `[FormDistribution] Revoked magic-link invite ${ctx.magicLinkInviteId} for distribution ` +
          `${ctx.distributionId} (${decision.reason}); the link now holds no credential.`,
      );
      return { result: 'revoked', inviteId: ctx.magicLinkInviteId ?? undefined };
    }
  }

  return issueCredential(ctx, config, minter, contextUser, persistCredential, decision.reason);
}

/**
 * Keep a credential we are not replacing bounded by the link it belongs to.
 *
 * Runs on every save of a live, credentialled distribution — which includes every public
 * submission, since submitting bumps `ResponseCount`. Each run LOADS THE INVITE ROW: one
 * core-entity read per save, on the anonymous hot path, and it is the price of the expiry
 * staying in step. It cannot be skipped on "nothing to re-bound" without reading the row,
 * because the distribution does not record the credential's expiry: when `CloseAt` was just
 * cleared the stored value is the OLD date, not the sentinel, and when a previous re-bound
 * failed this save is its retry. A review proposed skipping when `closeAt` is null and no
 * ceiling is set; that reintroduces the "Remove the expiry" defect (a link badged Live whose
 * token core refuses) and breaks the retry. So the read stays, and this says what it costs.
 *
 * Silent when nothing moved, which is what the minter's `{ changed: false }` reports after
 * the read. Missing minter or user is not an error here: there is nothing to correct that a
 * later save cannot correct, and this path must never turn an ordinary rename into a logged
 * failure.
 */
async function realignExpiry(
  ctx: ProvisionContext,
  config: MagicLinkProvisioningConfig,
  minter: IAnonymousMagicLinkMinter | undefined,
  contextUser: UserInfo | undefined,
): Promise<ProvisionOutcome> {
  const inviteId = ctx.magicLinkInviteId?.trim();
  if (!inviteId || !minter || !contextUser) {
    return { result: 'noop', reason: 'current' };
  }

  // The BOUNDS, not a resolved instant. `fixedExpiryHours` is a duration, and the instant it
  // runs from is when the credential was ISSUED — a fact about the invite row, which only the
  // minter holds. Resolving it here would mean anchoring it to `now`, and since this pass runs
  // after EVERY save that answer moves every time: the row would be rewritten on each save and
  // the expiry walked forward forever, so a host ceiling meant to bound the credential would
  // never bound anything. Same lesson as the no-expiry sentinel, one bound over.
  const outcome = await minter.SetAnonymousInviteExpiry(
    { inviteId, resourceId: ctx.distributionId },
    { closeAt: ctx.closeAt, maxLifetimeHours: config.fixedExpiryHours },
    contextUser,
  );
  if (!outcome.success) {
    LogError(
      `[FormDistribution] Could not re-bound magic-link invite ${inviteId} for distribution ` +
        `${ctx.distributionId}: ${outcome.message ?? 'unknown error'}. Its credential may outlive, ` +
        `or die before, the link's closing date; the next save of this distribution retries.`,
    );
    return { result: 'expiry-update-failed', inviteId };
  }
  if (!outcome.changed) {
    return { result: 'noop', reason: 'current' };
  }
  LogStatus(
    `[FormDistribution] Re-bounded magic-link invite ${inviteId} for distribution ` +
      `${ctx.distributionId} to the bounds its link now carries.`,
  );
  return { result: 'expiry-updated', inviteId };
}

/**
 * Kill the linked invite and unlink it.
 *
 * Reports which of three things happened, because two of them are opposites: `revoke-failed`
 * leaves a credential that MAY STILL REDEEM, while `unlink-failed` means it is dead and only the
 * record's copy of it is stale. Both leave the invite id in place so the next save retries.
 *
 * The order matters and is the whole point: revoke FIRST, unlink only on success.
 * Unlinking a credential we could not kill orphans a live invite that no distribution
 * references, so no later save can find it to try again and the builder shows a link
 * with nothing wrong with it. Leaving it linked instead means the next save of this
 * distribution retries, and the #90 application gates keep refusing the link meanwhile.
 */
async function withdrawCredential(
  ctx: ProvisionContext,
  minter: IAnonymousMagicLinkMinter,
  contextUser: UserInfo,
  persistCredential: PersistCredential,
): Promise<'withdrawn' | 'revoke-failed' | 'revoke-refused-not-ours' | 'unlink-failed'> {
  const inviteId = ctx.magicLinkInviteId?.trim();
  if (!inviteId) {
    // Unreachable via decideProvisioning, which only asks for a revoke when one is
    // linked. Guarded rather than asserted so a future caller cannot make it silent.
    LogError(
      `[FormDistribution] Asked to revoke the credential of distribution ${ctx.distributionId}, ` +
        `which has no MagicLinkInviteID. Nothing was revoked.`,
    );
    return 'revoke-failed';
  }

  const revoked = await minter.RevokeAnonymousInvite(
    { inviteId, resourceId: ctx.distributionId },
    contextUser,
  );
  if (!revoked.success) {
    if (revoked.refused) {
      LogError(
        `[FormDistribution] Refused to revoke magic-link invite ${inviteId} for distribution ` +
          `${ctx.distributionId}: ${revoked.message ?? 'not scoped to this distribution'}. This will NOT ` +
          `self-heal on a later save — the invite's ResourceID does not name this distribution. Its ` +
          `token may still redeem. Reissue the link, or correct the row by hand.`,
      );
      return 'revoke-refused-not-ours';
    }
    LogError(
      `[FormDistribution] Could not revoke magic-link invite ${inviteId} for distribution ` +
        `${ctx.distributionId}: ${revoked.message ?? 'unknown error'}. The credential is left LINKED ` +
        `and may still be redeemable; the next save of this distribution retries the revocation.`,
    );
    return 'revoke-failed';
  }

  if (!(await persistCredential(null))) {
    LogError(
      `[FormDistribution] Revoked magic-link invite ${inviteId} but could not clear it from ` +
        `distribution ${ctx.distributionId}. The invite is dead; the distribution still points at it ` +
        `and will read as issued until the next save clears it.`,
    );
    return 'unlink-failed';
  }
  return 'withdrawn';
}

/**
 * Mint a fresh credential and write it onto the record.
 *
 * @param reason the decision's own word for why. `reissue` is the one mint that follows
 *               a revocation in the same run, and so the one that invalidates a token
 *               somebody may be holding — worth saying in both the outcome and the log.
 */
async function issueCredential(
  ctx: ProvisionContext,
  config: MagicLinkProvisioningConfig,
  minter: IAnonymousMagicLinkMinter,
  contextUser: UserInfo,
  persistCredential: PersistCredential,
  reason: ProvisioningReason,
): Promise<ProvisionOutcome> {
  const replacing = reason === 'reissue';
  const mint = await minter.MintAnonymousInvite(
    {
      applicationName: config.applicationName,
      roleName: config.roleName,
      resourceTypeName: DISTRIBUTION_ENTITY_NAME,
      resourceId: ctx.distributionId,
      maxUses: config.defaultMaxUses,
      // Resolved HERE, and only here, because a mint is the one moment when the credential's
      // issue instant and `now` are the same thing. Every later pass hands the minter the
      // rule instead — see {@link realignExpiry}.
      //
      // "The same thing" to within a few milliseconds: this is the JS clock, while the row's
      // `__mj_CreatedAt` — the anchor every later pass resolves against — is stamped by the
      // database. So a ceilinged credential's expiry is corrected once, on its first subsequent
      // save, onto the row's own instant, and then never moves again. Settling on the more
      // authoritative of the two anchors is the right direction, and paying for it eagerly here
      // would cost the same extra write with more code.
      expiresAt: resolveExpiry(ctx.closeAt, config.fixedExpiryHours, new Date()),
    },
    contextUser,
  );

  if (mint.skipped) {
    LogStatus(
      `[FormDistribution] Anonymous link skipped for distribution ${ctx.distributionId}: ` +
        `${mint.message ?? 'magic-link not enabled on this host'}. The distribution holds no credential; it was saved.`,
    );
    return { result: 'skipped-minter' };
  }

  // A mint without a raw token is a failure, not a partial success: `/f/:slug` redeems
  // `PublicLinkToken`, so the link would be dead, and "invite linked, no token" is the
  // reissue signal — writing it would re-mint on every subsequent save.
  if (!mint.success || !mint.inviteId || !mint.rawToken) {
    LogError(
      `[FormDistribution] Magic-link mint failed for distribution ${ctx.distributionId}: ` +
        `${mint.message ?? (mint.success ? 'the minter returned no raw token' : 'unknown error')}. ` +
        `The distribution holds no credential.`,
    );
    return { result: 'mint-failed' };
  }

  if (!(await persistCredential({ inviteId: mint.inviteId, rawToken: mint.rawToken }))) {
    LogError(
      `[FormDistribution] Minted invite ${mint.inviteId} but failed to store it on distribution ` +
        `${ctx.distributionId}. The invite exists but is not linked.`,
    );
    return { result: 'store-failed', inviteId: mint.inviteId };
  }

  LogStatus(
    `[FormDistribution] ${replacing ? 'Reissued' : 'Provisioned'} anonymous magic-link invite ` +
      `${mint.inviteId} for distribution ${ctx.distributionId}.`,
  );
  return { result: replacing ? 'reissued' : 'minted', inviteId: mint.inviteId };
}
