/**
 * Pure decision logic for distribution magic-link provisioning — no DB, no MJ
 * runtime, deterministic given its inputs, unit-testable with plain assertions.
 * The entity hook is the imperative shell that wires these decisions to the
 * minter and the entity record.
 */
import type { MagicLinkProvisioningConfig, DistributionChannelType } from './config.js';

/** The subset of `FormDistribution` state the provisioning decision needs. */
export interface DistributionProvisioningState {
  channelType: DistributionChannelType;
  status: 'Active' | 'Closed' | 'Draft';
  isActive: boolean;
  /** Current value of `MagicLinkInviteID` (null/empty when not yet minted). */
  magicLinkInviteId: string | null;
  /** The distribution's `CloseAt`, if set — drives expiry when no fixed expiry is configured. */
  closeAt: Date | null;
}

/** Why provisioning is or isn't warranted for the current save. */
export interface ProvisioningDecision {
  /** True when the hook should attempt to mint and store an invite. */
  shouldMint: boolean;
  /** Diagnostic reason (for the not-minting case), useful in logs/tests. */
  reason:
    | 'mint'
    | 'already-minted'
    | 'channel-not-linkable'
    | 'not-active-public-channel';
}

/** Non-empty (trimmed) string guard for the existing invite id. */
function hasInviteId(id: string | null): boolean {
  return typeof id === 'string' && id.trim().length > 0;
}

/**
 * Decide whether to mint a magic-link invite for this distribution save.
 *
 * Idempotent + scoped to active public/anonymous channels:
 *  - Skip when an invite already exists (`MagicLinkInviteID` set) — never re-mint.
 *  - Skip when the channel type is not in the configured linkable set (e.g. Email).
 *  - Skip unless the distribution is an active public/anonymous channel
 *    (`Status='Active'` AND `IsActive=true`) — a Draft/Closed/disabled distribution
 *    gets a link only once it actually goes live.
 */
export function decideProvisioning(
  state: DistributionProvisioningState,
  config: MagicLinkProvisioningConfig,
): ProvisioningDecision {
  if (hasInviteId(state.magicLinkInviteId)) {
    return { shouldMint: false, reason: 'already-minted' };
  }
  if (!config.linkableChannels.has(state.channelType)) {
    return { shouldMint: false, reason: 'channel-not-linkable' };
  }
  if (state.status !== 'Active' || !state.isActive) {
    return { shouldMint: false, reason: 'not-active-public-channel' };
  }
  return { shouldMint: true, reason: 'mint' };
}

/**
 * Resolve the invite's hard expiry for this distribution.
 *
 * Policy: a configured fixed expiry (hours-from-now) wins; otherwise the
 * distribution's `CloseAt` (when set) is the expiry; otherwise no expiry
 * (`null`) — an effectively-permanent public link, matching a high `maxUses`.
 */
export function resolveExpiry(
  closeAt: Date | null,
  fixedExpiryHours: number | undefined,
  now: Date,
): Date | null {
  if (typeof fixedExpiryHours === 'number' && fixedExpiryHours > 0) {
    return new Date(now.getTime() + fixedExpiryHours * 3600 * 1000);
  }
  if (closeAt instanceof Date && !Number.isNaN(closeAt.getTime())) {
    return closeAt;
  }
  return null;
}
