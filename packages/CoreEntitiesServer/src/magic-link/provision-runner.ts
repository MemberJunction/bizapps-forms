/**
 * Orchestration for distribution magic-link provisioning, decoupled from the
 * BaseEntity so it is unit-testable without a DB or entity metadata. The entity
 * hook (`FormDistributionEntityServer`) is a thin adapter that supplies this
 * runner with the distribution's current state, the context user, and a
 * persist-callback that writes the minted invite id back onto the record.
 */
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import type { MagicLinkProvisioningConfig } from './config.js';
import { decideProvisioning, resolveExpiry, type DistributionProvisioningState } from './provisioning-decision.js';
import type { IAnonymousMagicLinkMinter } from './minter.js';

/** Entity name of the distribution itself — the resource the invite is scoped to. */
export const DISTRIBUTION_ENTITY_NAME = 'MJ_BizApps_Forms: Form Distributions';

/** Inputs the runner needs from the saved distribution record. */
export interface ProvisionContext extends DistributionProvisioningState {
  /** The distribution's primary key (the scoped resource id). */
  distributionId: string;
}

/** Outcome of a provisioning run (for logging/assertions; never throws). */
export interface ProvisionOutcome {
  /** What happened: minted+stored, or why it was skipped. */
  result: 'minted' | 'skipped-decision' | 'skipped-no-minter' | 'skipped-no-user' | 'skipped-minter' | 'mint-failed' | 'store-failed';
  /** The minted invite id, when `result==='minted'`. */
  inviteId?: string;
}

/**
 * Run the provisioning decision and, when warranted, mint + persist the invite.
 * Fail-soft throughout: a missing minter / user, a minter skip, or a mint/store
 * failure is logged and returned — never thrown — so the caller's save stands.
 *
 * @param ctx          current distribution state
 * @param config       provisioning configuration
 * @param minter       the registered minter, or `undefined` when none is registered
 * @param contextUser  the internal staff user saving the record (the invite issuer)
 * @param storeInviteId  persists the minted id back onto the record; returns its save success
 */
export async function runProvisioning(
  ctx: ProvisionContext,
  config: MagicLinkProvisioningConfig,
  minter: IAnonymousMagicLinkMinter | undefined,
  contextUser: UserInfo | undefined,
  storeInviteId: (inviteId: string) => Promise<boolean>,
): Promise<ProvisionOutcome> {
  const decision = decideProvisioning(ctx, config);
  if (!decision.shouldMint) {
    return { result: 'skipped-decision' };
  }

  if (!minter) {
    LogStatus(
      `[FormDistribution] Anonymous links unavailable for distribution ${ctx.distributionId}: ` +
        `no magic-link minter registered. Enable core 'magicLink' (with role '${config.roleName}' grantable) ` +
        `to provision public form links. MagicLinkInviteID left null; the distribution was saved.`,
    );
    return { result: 'skipped-no-minter' };
  }

  if (!contextUser) {
    LogError(`[FormDistribution] Cannot mint magic link for distribution ${ctx.distributionId}: no context user.`);
    return { result: 'skipped-no-user' };
  }

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
        `${mint.message ?? 'magic-link not enabled on this host'}. MagicLinkInviteID left null; the distribution was saved.`,
    );
    return { result: 'skipped-minter' };
  }

  if (!mint.success || !mint.inviteId) {
    LogError(
      `[FormDistribution] Magic-link mint failed for distribution ${ctx.distributionId}: ` +
        `${mint.message ?? 'unknown error'}. MagicLinkInviteID left null.`,
    );
    return { result: 'mint-failed' };
  }

  const stored = await storeInviteId(mint.inviteId);
  if (!stored) {
    LogError(
      `[FormDistribution] Minted invite ${mint.inviteId} but failed to store it on distribution ${ctx.distributionId}. ` +
        `The invite exists but is not linked.`,
    );
    return { result: 'store-failed', inviteId: mint.inviteId };
  }

  LogStatus(`[FormDistribution] Provisioned anonymous magic-link invite ${mint.inviteId} for distribution ${ctx.distributionId}.`);
  return { result: 'minted', inviteId: mint.inviteId };
}
