/**
 * Dependency-inversion seam for magic-link invite minting.
 *
 * WHY a seam (and not a direct call into MJ core's `MagicLinkService`):
 *  - `@memberjunction/server` does NOT re-export `MagicLinkService`, and its
 *    package `exports` map only exposes `.`, so the class cannot be imported
 *    from this package (deep imports throw `ERR_PACKAGE_PATH_NOT_EXPORTED`).
 *  - Even where reachable, `@memberjunction/server` is heavy (Apollo, the whole
 *    GraphQL stack, AI/action bundles) and validates DB config at import time —
 *    pulling it into this lightweight entity-subclass package would be wrong.
 *  - On the pinned MJ 5.43.0, `MagicLinkService.CreateInvite` cannot set the
 *    `IdentityMode='anonymous'` / `Kind='resource-share'` / resource-scope fields
 *    a Forms distribution link requires anyway.
 *
 * So this package (the entity-lifecycle layer) defines a minimal minting
 * CONTRACT and a registry; `@mj-biz-apps/forms-server` (which already depends on
 * `@memberjunction/server`) registers a concrete minter at bootstrap. The hook
 * calls whatever is registered, and gates gracefully when nothing is — which is
 * exactly the "host has not enabled magicLink" case. Any host could register a
 * different minting backend without touching this package.
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

/**
 * The contract a host registers to provision anonymous magic-link invites.
 * Implemented in `@mj-biz-apps/forms-server` over MJ core's magic-link tables.
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
