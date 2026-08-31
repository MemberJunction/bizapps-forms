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
    const revoked = await withdrawCredential(ctx, minter, contextUser, persistCredential);
    if (!revoked) {
      return { result: 'revoke-failed', inviteId: ctx.magicLinkInviteId ?? undefined };
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
 * Runs on every save of a live, credentialled distribution — the common case — so it
 * has to be cheap and silent when nothing moved, which is what the minter's
 * `{ changed: false }` reports. Missing minter or user is not an error here: there is
 * nothing to correct that a later save cannot correct, and this path must never turn
 * an ordinary rename into a logged failure.
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

  const outcome = await minter.SetAnonymousInviteExpiry(
    inviteId,
    resolveExpiry(ctx.closeAt, config.fixedExpiryHours, new Date()),
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
      `${ctx.distributionId} to follow its closing date.`,
  );
  return { result: 'expiry-updated', inviteId };
}

/**
 * Kill the linked invite and unlink it. Returns false — leaving the record pointing
 * at the credential — whenever the credential might still be live.
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
): Promise<boolean> {
  const inviteId = ctx.magicLinkInviteId?.trim();
  if (!inviteId) {
    // Unreachable via decideProvisioning, which only asks for a revoke when one is
    // linked. Guarded rather than asserted so a future caller cannot make it silent.
    LogError(
      `[FormDistribution] Asked to revoke the credential of distribution ${ctx.distributionId}, ` +
        `which has no MagicLinkInviteID. Nothing was revoked.`,
    );
    return false;
  }

  const revoked = await minter.RevokeAnonymousInvite(inviteId, contextUser);
  if (!revoked.success) {
    LogError(
      `[FormDistribution] Could not revoke magic-link invite ${inviteId} for distribution ` +
        `${ctx.distributionId}: ${revoked.message ?? 'unknown error'}. The credential is left LINKED ` +
        `and may still be redeemable; the next save of this distribution retries the revocation.`,
    );
    return false;
  }

  if (!(await persistCredential(null))) {
    LogError(
      `[FormDistribution] Revoked magic-link invite ${inviteId} but could not clear it from ` +
        `distribution ${ctx.distributionId}. The invite is dead; the distribution still points at it ` +
        `and will read as issued until the next save clears it.`,
    );
    return false;
  }
  return true;
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
