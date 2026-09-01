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

/**
 * Outcome of a write against an existing invite (revocation, or a change of expiry).
 *
 * One shape for both because both answer the same two questions and would otherwise
 * be the same three fields written twice. `success` is about the POSTCONDITION, not
 * about whether a row moved: an invite that was already revoked, or whose expiry is
 * already correct, is `{ success: true, changed: false }`. That distinction matters
 * to the caller — it refuses to unlink a credential it could not kill, so reporting
 * failure for an invite that is already dead would wedge the distribution forever.
 */
export interface InviteWriteResult {
  /** True when the invite now holds the requested state, whether or not this call changed it. */
  success: boolean;
  /** True only when a row was actually written. Diagnostic; drives the "nothing to do" log. */
  changed: boolean;
  /** Human-readable reason for a failure, or a note on a no-op success. */
  message?: string;
}

/**
 * WHICH credential, and what it must belong to.
 *
 * The resource travels with the invite id on every write, because the id alone is not a
 * capability anyone should act on. `FormDistribution.MagicLinkInviteID` carries no foreign key
 * and rides the generated GraphQL update input, so the value reaching a revoke or a re-bound is
 * whatever some writer put in the column — and these writes run under an elevated user on the
 * public submit path. Pairing the two lets the implementation check the invite's own
 * `ResourceID`, which the mint already wrote, and refuse to touch a credential that belongs to a
 * different link. Without it, pointing one distribution at another's invite is enough to kill
 * that link's credential on the next save of yours.
 */
export interface AnonymousCredentialRef {
  /** The `MJ: Magic Link Invites` row to act on (`FormDistribution.MagicLinkInviteID`). */
  inviteId: string;
  /** The resource this invite must be scoped to — the distribution's primary key. */
  resourceId: string;
}

/**
 * The bounds a credential's life must stay inside.
 *
 * The RULE rather than a resolved instant, and that distinction is load-bearing. `closeAt`
 * is a fixed date, but `maxLifetimeHours` is a DURATION, and a duration is only an instant
 * once you say what it runs from: the moment the credential was ISSUED. That instant is a
 * fact about the invite row, so only the implementation holding that row can resolve it.
 * A caller that resolved the ceiling itself would have to anchor it to the wall clock, and
 * since this is asked after EVERY save of a live link the answer would differ every time —
 * rewriting the row on every save and walking the expiry forward forever, so a ceiling a
 * host configured in order to bound the credential would never bound anything. Handing over
 * the rule instead of the answer is what makes that unrepresentable.
 */
export interface InviteExpiryBounds {
  /** The link's own closing date, or `null` when it has none. */
  closeAt: Date | null;
  /** Host-wide ceiling on a credential's life, in hours FROM ISSUE; `undefined` for none. */
  maxLifetimeHours: number | undefined;
}

/**
 * The contract a host registers to manage the life of an anonymous magic-link
 * credential: issue it, re-bound it, withdraw it. Implemented in
 * `@mj-biz-apps/forms-server` over MJ core's magic-link tables. All three belong to
 * one implementation on purpose: whatever backend issues a credential is the only
 * thing that knows how to change or kill it.
 *
 * The `contextUser` every method takes is WHO ASKED — the staff user whose save triggered this —
 * and not necessarily the identity the implementation performs the write under. The credential is
 * the application's own record rather than the caller's, and the caller's authority has already
 * been spent proving they may write the distribution it belongs to; requiring a second permission
 * on the backend's storage would make the feature work only for whichever roles a host happens to
 * have granted there. The shipped implementation elevates for exactly that reason
 * (bizapps-forms#114); callers must not read `contextUser` as a promise about rights.
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
   * Implementations MUST refuse an invite that is not scoped to `credential.resourceId`.
   *
   * @param credential  the invite to withdraw, and the resource it must belong to
   * @param contextUser the internal staff user whose save triggered the revocation
   */
  RevokeAnonymousInvite(
    credential: AnonymousCredentialRef,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult>;

  /**
   * Re-bounds a live invite's hard expiry to whatever `bounds` now imply — the earlier of
   * the link's closing date and the host lifetime ceiling, or no bound at all when neither
   * applies.
   *
   * This exists because the expiry is the ONE part of the credential that has to
   * survive nobody saving anything: revocation happens on a distribution's save, and
   * a link whose closing date passes at midnight is not saved by anyone. Baking the
   * date into the invite is what makes it die on time — and that is exactly why it
   * must be kept in step afterwards. An author who moves a closing date, or clears
   * one, is otherwise left with a credential expiring on the old date while the
   * builder reports the link as live.
   *
   * Implementations MUST be idempotent and MUST NOT throw: an invite already inside
   * `bounds` is `{ success: true, changed: false }`, and a caller runs this after every save
   * of a distribution that keeps its credential. That idempotence is exactly why
   * {@link InviteExpiryBounds} is the rule rather than an instant — see the note there.
   *
   * Implementations MUST refuse an invite that is not scoped to `credential.resourceId`.
   *
   * @param credential  the invite to re-bound, and the resource it must belong to
   * @param bounds      how long this credential may now live; `{ closeAt: null,
   *                    maxLifetimeHours: undefined }` means "no bound", which the
   *                    implementation renders however its store expresses that
   * @param contextUser the internal staff user whose save triggered the change
   */
  SetAnonymousInviteExpiry(
    credential: AnonymousCredentialRef,
    bounds: InviteExpiryBounds,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult>;
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
