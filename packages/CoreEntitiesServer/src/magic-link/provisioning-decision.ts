/**
 * Pure decision logic for distribution magic-link provisioning — no DB, no MJ
 * runtime, deterministic given its inputs, unit-testable with plain assertions.
 * The entity hook is the imperative shell that wires these decisions to the
 * minter and the entity record.
 *
 * THE INVARIANT, stated once so nothing has to restate it:
 *
 *   A distribution that is a live, linkable public channel holds exactly one live
 *   magic-link credential. Anything else holds none.
 *
 * Everything below is that sentence, mechanised. It is deliberately a function of
 * the distribution's CURRENT state rather than of a transition, which is what makes
 * it writer-agnostic (bizapps-forms#104): a link closed by the builder, an Action, an
 * import or a hand-run `UPDATE` all reach the same verdict, and there is no old value
 * to read, no dirty-field check to get wrong, and no way for a save to be missed.
 * Being a state function also makes it idempotent — running it twice changes nothing
 * the first run did not already settle.
 */
import type { MagicLinkProvisioningConfig, DistributionChannelType } from './config.js';

/** The subset of `FormDistribution` state the provisioning decision needs. */
export interface DistributionProvisioningState {
  channelType: DistributionChannelType;
  status: 'Active' | 'Closed' | 'Draft';
  isActive: boolean;
  /** Current value of `MagicLinkInviteID` (null/empty when no invite is linked). */
  magicLinkInviteId: string | null;
  /**
   * Current value of `PublicLinkToken` — the raw half of the credential the `/f/:slug`
   * host page redeems. Empty means the linked invite (if any) is unusable, which on a
   * LIVE link is how a reissue is asked for; see {@link decideProvisioning}.
   */
  publicLinkToken: string | null;
  /** The distribution's `CloseAt`, if set — bounds the credential's life. */
  closeAt: Date | null;
}

/** Why the decision came out the way it did. Diagnostic; drives logs and tests. */
export type ProvisioningReason =
  /** No credential, and the link warrants one. */
  | 'mint'
  /** Live link whose token was cleared: kill the old credential and issue a fresh one. */
  | 'reissue'
  /** Credential outliving a link that is no longer taking responses. */
  | 'revoke-deactivated'
  /** Credential outliving a channel that is no longer an anonymous public link. */
  | 'revoke-channel-not-linkable'
  /** Live link, working credential — the steady state, and the common case. */
  | 'current'
  /** No credential and none warranted. */
  | 'not-eligible';

/** What this save must do to restore the invariant. */
export interface ProvisioningDecision {
  /** Revoke the linked invite and unlink it from the distribution. */
  revoke: boolean;
  /** Mint a fresh invite (after the revoke, when both are set — that is a reissue). */
  mint: boolean;
  reason: ProvisioningReason;
}

/** Non-empty (trimmed) string guard — a blank column is not a value. */
function hasValue(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Whether this distribution is the kind of thing that should hold an anonymous
 * credential at all: a linkable channel, switched on, and open for responses.
 */
function warrantsCredential(
  state: DistributionProvisioningState,
  config: MagicLinkProvisioningConfig,
): boolean {
  return (
    config.linkableChannels.has(state.channelType) && state.status === 'Active' && state.isActive
  );
}

/**
 * Decide what this save owes the invariant above.
 *
 * Read it as a two-by-two over "does it hold a credential" and "should it":
 *
 *  | holds | warrants | outcome                                                   |
 *  |-------|----------|-----------------------------------------------------------|
 *  | no    | no       | nothing (`not-eligible`)                                   |
 *  | no    | yes      | mint (`mint`)                                             |
 *  | yes   | no       | revoke (`revoke-deactivated` / `revoke-channel-not-linkable`) |
 *  | yes   | yes      | nothing (`current`)                                       |
 *
 * "Holds a credential" means BOTH halves are present — the invite id AND the raw
 * token. That is not pedantry: the shared artifact is `/f/:slug`, which resolves
 * `PublicLinkToken` at request time, so a link whose token is gone is already dead
 * whatever the invite row says. Making the pair the unit of state buys the reissue
 * path for free — clearing `PublicLinkToken` on a live link reads as "holds no
 * credential, warrants one", which revokes the old invite and mints a replacement
 * under the unchanged slug. One writer-agnostic signal, no extra column, no second
 * enforcement point, and it self-heals a half-provisioned record rather than
 * stranding it.
 */
export function decideProvisioning(
  state: DistributionProvisioningState,
  config: MagicLinkProvisioningConfig,
): ProvisioningDecision {
  const linked = hasValue(state.magicLinkInviteId);
  const usable = linked && hasValue(state.publicLinkToken);
  const warranted = warrantsCredential(state, config);

  if (usable) {
    return warranted
      ? { revoke: false, mint: false, reason: 'current' }
      : { revoke: true, mint: false, reason: revocationReason(state, config) };
  }
  if (!warranted) {
    // Nothing usable to keep. Revoke a dead-but-linked invite; otherwise stand down.
    return linked
      ? { revoke: true, mint: false, reason: revocationReason(state, config) }
      : { revoke: false, mint: false, reason: 'not-eligible' };
  }
  return linked
    ? { revoke: true, mint: true, reason: 'reissue' }
    : { revoke: false, mint: true, reason: 'mint' };
}

/** Which half of "no longer a live public link" a revocation is answering. */
function revocationReason(
  state: DistributionProvisioningState,
  config: MagicLinkProvisioningConfig,
): ProvisioningReason {
  return config.linkableChannels.has(state.channelType)
    ? 'revoke-deactivated'
    : 'revoke-channel-not-linkable';
}

/**
 * Resolve the invite's hard expiry for this distribution.
 *
 * Both inputs are UPPER BOUNDS on how long the credential may live — a host-wide
 * ceiling (`FORMS_MAGICLINK_EXPIRY_HOURS`) and the link's own closing date — so the
 * EARLIER of the two is the only correct combination. The fixed ceiling used to win
 * outright, which let a 30-day host ceiling keep a credential alive for a link that
 * shut on Friday: the exact "credential outlives the thing it authorises" shape
 * bizapps-forms#104 is about, one field over.
 *
 * `null` means no expiry from here; the minter decides what to write, since the core
 * `MagicLinkInvite.ExpiresAt` column is NOT NULL and cannot record "never".
 */
export function resolveExpiry(
  closeAt: Date | null,
  fixedExpiryHours: number | undefined,
  now: Date,
): Date | null {
  const bounds: Date[] = [];
  if (typeof fixedExpiryHours === 'number' && fixedExpiryHours > 0) {
    bounds.push(new Date(now.getTime() + fixedExpiryHours * 3600 * 1000));
  }
  if (closeAt instanceof Date && !Number.isNaN(closeAt.getTime())) {
    bounds.push(closeAt);
  }
  if (bounds.length === 0) {
    return null;
  }
  return bounds.reduce((earliest, candidate) =>
    candidate.getTime() < earliest.getTime() ? candidate : earliest,
  );
}
