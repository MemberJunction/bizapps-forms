/**
 * Dependency-inversion seam for the lifecycle of a distribution's anonymous
 * magic-link credential — minting it, and revoking it again.
 *
 * WHY a seam (and not a direct call into MJ core's `MagicLinkService`):
 *  - `@memberjunction/server` does NOT re-export `MagicLinkService`, and its
 *    package `exports` map only exposes `.`, so the class cannot be imported
 *    from this package (deep imports throw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
 *    Re-checked on the current `6.1.0-edge` pin — still true.
 *  - Even where reachable, `@memberjunction/server` is heavy (Apollo, the whole
 *    GraphQL stack, AI/action bundles) and validates DB config at import time —
 *    pulling it into this lightweight entity-subclass package would be wrong.
 *  - `MagicLinkService.CreateInvite` cannot set the `IdentityMode='anonymous'` /
 *    `Kind='resource-share'` / resource-scope fields a Forms distribution link
 *    requires anyway, and MJ ships no revoke method at all (see the revoke side
 *    of the contract below).
 *
 * So this package (the entity-lifecycle layer) defines a minimal CONTRACT and a
 * registry; `@mj-biz-apps/forms-server` (which already depends on
 * `@memberjunction/server`) registers a concrete implementation at bootstrap. The
 * hook calls whatever is registered, and gates gracefully when nothing is — which
 * is exactly the "host has not enabled magicLink" case. Any host could register a
 * different backend without touching this package, and gets both halves of the
 * lifecycle by implementing one interface: a backend that can issue a credential
 * but not withdraw it is the defect bizapps-forms#104 was filed about.
 */
import { BaseSingleton } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';

/** What the hook asks the minter to provision. Generic over any resource. */
export interface MintAnonymousInviteParams {
  /** Application the anonymous session is scoped to (the minter resolves the ID from this name). */
  applicationName: string;
  /** Restricted role the invite grants (e.g. "Form Respondent"). Must be magic-link grantable on the host. */
  roleName: string;
  /** Resource-share scope: the entity name of the scoped resource (e.g. the distribution entity). */
  resourceTypeName: string;
  /** Resource-share scope: the primary key (stringified) of the scoped resource. */
  resourceId: string;
  /** Maximum redemptions. A public URL uses a high value (effectively unlimited). */
  maxUses: number;
  /** Hard expiry; `null`/`undefined` means the minter applies its own default (typically none / very long). */
  expiresAt?: Date | null;
}

/** Outcome of a mint attempt. `skipped` is the graceful-gate signal (NOT an error). */
export interface MintAnonymousInviteResult {
  /** True when an invite row was created. */
  success: boolean;
  /** The created `MJ: Magic Link Invites` row ID — stored on `FormDistribution.MagicLinkInviteID`. */
  inviteId?: string;
  /**
   * The RAW redeemable magic-link token (the secret half of the link). The invite
   * row persists only its SHA-256 hash; this raw value travels in the result so the
   * caller can store it on `FormDistribution.PublicLinkToken` and build the shareable
   * public redeem URL. A public form link is low-secrecy by design (the URL is meant
   * to be shared), so persisting the raw token on the distribution is intentional —
   * the raw token is NOT stored on the invite row.
   *
   * REQUIRED on a successful mint. It is optional in the type only because the
   * failure shape shares it; a `success:true` result without one is treated as a
   * mint FAILURE by the runner. Two reasons: `/f/:slug` reads `PublicLinkToken` to
   * redeem, so a tokenless invite is a dead link however healthy the row looks; and
   * "linked invite, no token" is the reissue signal, so the hook must never be able
   * to produce that state itself.
   */
  rawToken?: string;
  /**
   * True when minting was deliberately skipped because the host has not enabled
   * magic links (or the minter is otherwise unavailable). The caller must NOT
   * treat this as a failure: it leaves `MagicLinkInviteID` null and logs a warning.
   */
  skipped?: boolean;
  /** Human-readable reason for a skip or failure. */
  message?: string;
}

/** Outcome of a revocation attempt. */
export interface RevokeAnonymousInviteResult {
  /**
   * True when the invite is no longer redeemable. An invite that was ALREADY dead
   * — revoked earlier, or whose row has since been deleted — is a success: the
   * caller's postcondition is "this credential cannot be redeemed", not "this call
   * changed a row". Reporting failure there would wedge the distribution, because
   * the caller refuses to unlink a credential it could not kill.
   */
  success: boolean;
  /** Human-readable reason for a failure, or a note on a no-op success. */
  message?: string;
}

/**
 * The contract a host registers to provision AND withdraw anonymous magic-link
 * invites. Implemented in `@mj-biz-apps/forms-server` over MJ core's magic-link
 * tables. Both halves belong to one implementation on purpose: whatever backend
 * issues a credential is the only thing that knows how to kill it.
 */
export interface IAnonymousMagicLinkMinter {
  /**
   * Mints an anonymous, resource-scoped, multi-use invite and returns its ID.
   * Implementations MUST return `{ success:false, skipped:true }` (never throw)
   * when the host has not enabled magic links, so a distribution still saves.
   *
   * @param params       what to scope/grant the invite to
   * @param creatingUser the internal staff user saving the distribution (becomes the invite's issuer)
   */
  MintAnonymousInvite(
    params: MintAnonymousInviteParams,
    creatingUser: UserInfo,
  ): Promise<MintAnonymousInviteResult>;

  /**
   * Makes a previously minted invite permanently unredeemable.
   *
   * There is no `skipped` here, and that asymmetry is deliberate. Minting is
   * gated on the host having magic links switched on; revoking must work
   * regardless, because "the host turned magic links off" is precisely a moment
   * when live credentials should stop being live. Implementations MUST NOT throw:
   * a failure is reported so the caller can leave the credential LINKED and retry
   * on the next save, rather than orphaning a live invite nothing points at.
   *
   * @param inviteId    the invite to withdraw (`FormDistribution.MagicLinkInviteID`)
   * @param contextUser the internal staff user whose save triggered the revocation
   */
  RevokeAnonymousInvite(inviteId: string, contextUser: UserInfo): Promise<RevokeAnonymousInviteResult>;
}

/**
 * Process-wide registry holding the host's minter, if any. A `BaseSingleton`
 * per CLAUDE.md rule 6. The hook reads `Instance.Minter`; `undefined` means no
 * host registered one → the hook gates gracefully.
 */
export class MagicLinkMinterRegistry extends BaseSingleton<MagicLinkMinterRegistry> {
  private _minter: IAnonymousMagicLinkMinter | undefined;

  public static get Instance(): MagicLinkMinterRegistry {
    return super.getInstance<MagicLinkMinterRegistry>();
  }

  /** The registered minter, or `undefined` when no host has registered one. */
  public get Minter(): IAnonymousMagicLinkMinter | undefined {
    return this._minter;
  }

  /** Registers (or replaces) the host's minter. Called once at server bootstrap. */
  public Register(minter: IAnonymousMagicLinkMinter): void {
    this._minter = minter;
  }

  /** Test-only: clears the registered minter. */
  public ClearForTests(): void {
    this._minter = undefined;
  }
}
