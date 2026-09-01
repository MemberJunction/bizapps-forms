/**
 * Concrete anonymous-magic-link credential provider for the Forms host (MJAPI):
 * mints a distribution's invite, and revokes it again.
 *
 * Registered into the `MagicLinkMinterRegistry` seam at server bootstrap so the
 * `FormDistributionEntityServer` lifecycle hook (in `@mj-biz-apps/forms-core-entities-server`)
 * can manage invites WITHOUT that lightweight package depending on the heavy
 * `@memberjunction/server`.
 *
 * WHY this works the core `MJ: Magic Link Invites` entity directly rather than
 * calling a `MagicLinkService` method:
 *  - `MagicLinkService` is neither root-exported nor reachable through the package
 *    `exports` map (`{".": "./dist/index.js"}`), so it cannot be imported. Checked
 *    again on the current `6.1.0-edge` pin; it was already true on 5.43.0.
 *  - Its `CreateInvite` cannot set `IdentityMode='anonymous'` / `Kind='resource-share'`
 *    / `ResourceID` — exactly the fields an anonymous, distribution-scoped public
 *    link requires. The redeem path (which IS shipped) reads those columns off the
 *    invite at redemption time.
 *  - There is no revoke method at all. What core DOES ship is the mechanism:
 *    `MagicLinkInvite.Status='Revoked'`, whose own column description calls it "the
 *    primary revocation mechanism", which `evaluateInvite` rejects with errorCode
 *    `revoked` ahead of every other check, and which the atomic consume UPDATE
 *    excludes by matching only `Status='Active'`. So revoking here is a status
 *    write against core's own state machine, not a bespoke scheme beside it.
 *
 * So we reproduce the (small, well-specified) create path here over the same
 * entity + token format the shipped redeem path expects.
 *
 * WHOSE rights those writes carry is a separate question with its own answer: not the caller's.
 * See {@link MagicLinkInviteMinter.resolveWriter} — bizapps-forms#114.
 */
import { Metadata, LogError, RunView, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { configInfo } from '@memberjunction/server';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { MJMagicLinkInviteEntity, MJResourceTypeEntity } from '@memberjunction/core-entities';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { resolveExpiry } from '@mj-biz-apps/forms-core-entities-server';
import type {
  AnonymousCredentialRef,
  IAnonymousMagicLinkMinter,
  InviteExpiryBounds,
  InviteWriteResult,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
} from '@mj-biz-apps/forms-core-entities-server';
import { generateRawToken, hashToken } from './token.js';

const INVITE_ENTITY = 'MJ: Magic Link Invites';
const RESOURCE_TYPE_ENTITY = 'MJ: Resource Types';

/**
 * The instant written into `ExpiresAt` for a link with no closing date.
 *
 * A SENTINEL for "no expiry", not a limit: core's `MagicLinkInvite.ExpiresAt` is NOT
 * NULL, so "never" has no representation and something must be written. Two things
 * make that safe rather than the century-long credential bizapps-forms#104 opened
 * with: the credential now dies with the link (revoked the moment the distribution
 * stops being live), and a deployment that wants a real ceiling sets
 * `FORMS_MAGICLINK_EXPIRY_HOURS`, which is combined with the link's own `CloseAt` by
 * taking the earlier of the two.
 *
 * FIXED, not `now + N years`, and that is load-bearing rather than cosmetic. A
 * relative sentinel is a different value on every call, so the re-bounding pass could
 * never tell "already unbounded" from "needs changing" and would rewrite every
 * unbounded invite on every save, walking its expiry forward forever. One canonical
 * instant makes the comparison exact. It also reads as what it is: `9999-12-31` is
 * unmistakably a sentinel, where the `2126-08-28` this replaces looked like a century
 * someone had chosen. `datetimeoffset` holds it exactly.
 *
 * A short default was considered and rejected: nothing on the distribution records the
 * credential's expiry, so a link would go dead while the builder still badged it
 * "Live" — a confidently-wrong surface, which is the failure mode `share-state.ts`
 * exists to prevent. Bounding it honestly needs a column and a badge, not a smaller
 * number here.
 */
const NO_EXPIRY_SENTINEL = new Date('9999-12-31T00:00:00.000Z');

/**
 * A fixed instant standing in for an anchor that is not needed on the branch being taken.
 *
 * Deliberately not `new Date()`: the whole point of resolving a lifetime ceiling against the
 * credential's issue time is that no wall clock reaches the calculation, and a `now` fallback
 * would quietly reintroduce exactly that. Any path that would actually READ this has already
 * been refused.
 */
const EPOCH = new Date(0);

/**
 * Whether two instants are the same, treating an unparseable stored value as "different".
 *
 * Reads the stored side through {@link asInstant}, for the same reason that function exists: the
 * store may hand `ExpiresAt` back as a string, and a comparison that only accepts a `Date` would
 * never settle — rewriting the row on every save, the "walks forward forever" failure in a new guise.
 */
function sameInstant(a: Date | string | null | undefined, b: Date): boolean {
  const left = asInstant(a);
  return left !== null && left.getTime() === b.getTime();
}

/**
 * A usable `Date` from a value the store may hand back as a `Date` or as a string, or `null`
 * when it is neither. Used for the invite's issue instant, which anchors a host lifetime
 * ceiling; anything unreadable must fail loudly rather than fall back to the wall clock.
 */
function asInstant(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * What a per-invite change decided.
 *
 * Three outcomes rather than two booleans, because the third is genuinely different and used
 * to be unrepresentable: `settled` and `refuse` both write nothing, and reporting `refuse` as
 * a success would tell the caller a postcondition holds when nobody checked.
 */
type InviteChangeVerdict =
  /** Apply the mutation `change` just made and save. */
  | { verdict: 'write' }
  /** The postcondition already holds; write nothing and report success. */
  | { verdict: 'settled'; message?: string }
  /** Could not decide safely; write nothing and report failure so the next save retries. */
  | { verdict: 'refuse'; message: string };

export class MagicLinkInviteMinter implements IAnonymousMagicLinkMinter {
  public async MintAnonymousInvite(
    params: MintAnonymousInviteParams,
    creatingUser: UserInfo,
  ): Promise<MintAnonymousInviteResult> {
    // GRACEFUL GATE: if the host has not enabled core magic links, skip silently
    // (the hook leaves MagicLinkInviteID null and logs that anonymous links are off).
    if (configInfo.magicLink?.enabled !== true) {
      return {
        success: false,
        skipped: true,
        message: "core 'magicLink' is not enabled on this MJ instance",
      };
    }

    try {
      return await this.createInviteRecord(params, creatingUser);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`[MagicLinkInviteMinter] Mint failed for resource ${params.resourceId}: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Make an invite permanently unredeemable by moving it to core's `Revoked` status.
   *
   * NOT gated on `configInfo.magicLink.enabled`, unlike minting. A host switching
   * magic links off is a moment when live credentials should stop being live, and
   * the write is a plain entity save that needs nothing from the magic-link runtime.
   *
   * The postcondition is "this invite cannot be redeemed", so an invite in any
   * terminal status, or whose row has genuinely been deleted, is a success that
   * writes nothing. Reporting failure there would wedge the distribution: its hook
   * refuses to unlink a credential it could not kill, and would retry forever.
   */
  public async RevokeAnonymousInvite(
    credential: AnonymousCredentialRef,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult> {
    return this.writeToInvite(credential, contextUser, 'revoke', (invite) => {
      if (invite.Status !== 'Active') {
        // Any status other than Active is already unredeemable — `evaluateInvite` refuses all of
        // them — so the postcondition holds and nothing is written. Overwriting a `Consumed` or
        // `Expired` row with `Revoked` would claim an operator action that never happened, which
        // is the rule the backfill migration and `SetAnonymousInviteExpiry` already follow.
        return { verdict: 'settled', message: `Invite ${invite.ID} is ${invite.Status}; already unredeemable.` };
      }
      // Status alone, deliberately: it is the first thing `evaluateInvite` checks and
      // the consume UPDATE's `Status='Active'` guard already excludes it, so also
      // collapsing `ExpiresAt` would be a second write buying no additional refusal —
      // while destroying the record of when the credential was originally to expire.
      invite.Status = 'Revoked';
      return { verdict: 'write' };
    });
  }

  /**
   * Re-bound a live invite's hard expiry so it keeps following the link's closing date.
   *
   * Only an `Active` invite is touched. A `Revoked`, `Consumed` or `Expired` row records
   * how that credential ended, and moving its expiry afterwards would rewrite history for
   * no gain — none of those statuses is redeemable whatever `ExpiresAt` says.
   */
  public async SetAnonymousInviteExpiry(
    credential: AnonymousCredentialRef,
    bounds: InviteExpiryBounds,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult> {
    return this.writeToInvite(credential, contextUser, 'set the expiry of', (invite) => {
      if (invite.Status !== 'Active') {
        return { verdict: 'settled', message: `Invite ${invite.ID} is ${invite.Status}; expiry left as it was.` };
      }
      // The ceiling is a DURATION, so it names an instant only relative to when this credential
      // was issued — which is why the bounds arrive as a rule and are resolved here, against the
      // row. Anchoring to `now` instead would make this a different answer on every call, and
      // this runs after every save of a live link: the row would be rewritten each time and the
      // expiry walked forward forever, so a configured ceiling would bound nothing at all.
      const issuedAt = asInstant(invite.__mj_CreatedAt);
      if (bounds.maxLifetimeHours !== undefined && !issuedAt) {
        return {
          verdict: 'refuse',
          message:
            `Invite ${invite.ID} has no readable issue time, so the host lifetime ceiling ` +
            `cannot be anchored; its expiry was left as it was.`,
        };
      }
      // `issuedAt` is read only on the ceiling branch, which the guard above has already
      // refused without one. The epoch stands in so no wall clock can reach this call.
      const target = this.resolveExpiresAt(
        resolveExpiry(bounds.closeAt, bounds.maxLifetimeHours, issuedAt ?? EPOCH),
      );
      if (sameInstant(invite.ExpiresAt, target)) {
        return { verdict: 'settled' };
      }
      invite.ExpiresAt = target;
      return { verdict: 'write' };
    });
  }

  /**
   * The identity this host writes core's magic-link rows under.
   *
   * NOT the caller, and that is the whole of bizapps-forms#114. `MJ: Magic Link Invites` is a CORE
   * entity whose permissions no Forms seed touches — on a stock database only Developer and
   * Integration hold Create/Read/Update — yet every write below is driven by an ordinary save of a
   * Form Distribution. Run as the saver, the feature therefore worked only for form authors who
   * happened to be Developers: on the ordinary least-privilege shape (full rights on the links they
   * own, nothing on core's table) `Load` threw on Read before the revoke was attempted, and because
   * provisioning is fail-soft by design the pause returned green with the token still redeeming —
   * the exact defect bizapps-forms#104 exists to remove, surviving on precisely the deployments
   * careful enough to build a narrow role. Minting failed the same way, one permission over.
   *
   * The alternative — seed the missing grant — was rejected. Forms does not own which role a host
   * gives its authors, so the grant would have to be attached per deployment (a step whose omission
   * fails silently, exactly as today) or handed to everyone; and the entity is shared, with no row
   * scoping in the default seed, so a grant wide enough to work would let any form author revoke
   * another app's invites. More fundamentally it is a leak: an operator deciding "may Alice publish
   * forms?" grants rights on forms, and nothing in that decision says anything about core's
   * magic-link table. The permission requirement corresponds to no decision they actually make.
   *
   * Elevating is safe here because the caller's authority has already been spent and checked: MJ
   * refused the distribution save unless they could write it, the invite is scoped to that
   * distribution, {@link writeToInvite} refuses any invite whose `ResourceID` says otherwise, and
   * not one field on a minted row comes from the caller — application, role, identity mode, kind
   * and resource are all fixed by the code. The elevated surface is exactly "manage the credential
   * of a link I am allowed to write", which is what saving a live public link already means.
   *
   * Resolution follows MJ core's own `MagicLinkService.resolveProvisioningContextUser` key for key
   * and in the same order, so Forms and core agree about who owns the table they share.
   */
  private resolveWriter(caller: UserInfo): UserInfo {
    const configured = configInfo.magicLink?.contextUserForProvisioning;
    const candidate = configured || configInfo.userHandling?.contextUserForNewUserCreation;
    if (candidate) {
      const named = UserCache.Instance.UserByName(candidate);
      if (named) {
        return named;
      }
      if (configured) {
        // Only a name the operator set FOR MAGIC LINKS is worth a line here. MJ's stock config
        // ships `not.set@nowhere.com` in `userHandling.contextUserForNewUserCreation`, so treating
        // that one as an error would log on every save of every live link on a default host —
        // including every public response, which re-bounds the credential's expiry.
        LogError(
          `[MagicLinkInviteMinter] Configured provisioning user '${configured}' not found; falling back to an Owner.`,
        );
      }
    }
    const owner = UserCache.Users.find((u) => u.Type?.trim().toLowerCase() === 'owner');
    if (owner) {
      return owner;
    }
    // Last resort: the caller's own rights, which is what this did before it did anything. The
    // fail-safe direction is toward LESS privilege, so the fallback narrows rather than widens —
    // deliberately the opposite conclusion from `automation/service-principal.ts`, which refuses to
    // fall back at all, and for the same reason: there the fallback would have been the system user.
    LogError(
      `[MagicLinkInviteMinter] No provisioning identity resolved (no configured user and no Owner in ` +
        `the user cache); writing invites as the caller ${caller.Name}, whose rights on ` +
        `'${INVITE_ENTITY}' may not be sufficient.`,
    );
    return caller;
  }

  /**
   * Load one invite and apply `change` to it, saving only if `change` asked for a write.
   *
   * The shared body of revoke and re-bound, which are the same five steps around one
   * different line.
   *
   * `change` returns one of three verdicts — see {@link InviteChangeVerdict}. `settled` is the
   * no-op success both callers rely on; `refuse` is a decision it could not make safely, which
   * must not be dressed up as a postcondition that holds.
   *
   * A failed `Load` is NOT assumed to mean "deleted". `Load()` returns false for a row
   * that is gone AND for a read that failed, and the two demand opposite answers: gone
   * is a success the caller acts on by unlinking, while a failed read reported as
   * success unlinks a credential that is still live — the orphan this whole design
   * exists to prevent. So the ambiguous case is resolved by asking whether the row is
   * there, and anything short of a confident "no" is reported as a failure to retry.
   */
  private async writeToInvite(
    credential: AnonymousCredentialRef,
    contextUser: UserInfo,
    verb: string,
    change: (invite: MJMagicLinkInviteEntity) => InviteChangeVerdict,
  ): Promise<InviteWriteResult> {
    const id = credential?.inviteId?.trim();
    if (!id) {
      return { success: false, changed: false, message: 'No invite id supplied.' };
    }

    try {
      // Inside the try: the contract on this method is that it never throws, and resolving the
      // principal reads process state that a caller cannot vet.
      const writer = this.resolveWriter(contextUser);
      const md = new Metadata();
      const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, writer);
      if (!(await invite.Load(id))) {
        return await this.reportUnloadableInvite(id, writer, verb);
      }

      // OWNERSHIP, before any write. The id arrives from `FormDistribution.MagicLinkInviteID`,
      // a column with no foreign key that rides the generated GraphQL update input — so it is
      // whatever a writer put there, and these writes run under the elevated system user on the
      // public submit path. The mint recorded the scope on the invite itself; reading it back is
      // what stops one distribution revoking or re-bounding another's live credential. Refused
      // rather than silently skipped: the caller must not read this as "the postcondition holds".
      if (!UUIDsEqual(invite.ResourceID ?? '', credential.resourceId)) {
        const message =
          `Invite ${id} is scoped to resource ${String(invite.ResourceID)}, not ${credential.resourceId}; ` +
          `refusing to ${verb} it.`;
        LogError(`[MagicLinkInviteMinter] ${message}`);
        return { success: false, changed: false, refused: true, message };
      }

      const outcome = change(invite);
      if (outcome.verdict === 'settled') {
        return { success: true, changed: false, message: outcome.message };
      }
      if (outcome.verdict === 'refuse') {
        LogError(`[MagicLinkInviteMinter] Could not ${verb} invite ${id}: ${outcome.message}`);
        return { success: false, changed: false, message: outcome.message };
      }
      if (!(await invite.Save())) {
        return {
          success: false,
          changed: false,
          message: `Failed to ${verb} magic-link invite ${id}: ${
            invite.LatestResult?.CompleteMessage ?? 'unknown error'
          }`,
        };
      }
      return { success: true, changed: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`[MagicLinkInviteMinter] Could not ${verb} invite ${id}: ${message}`);
      return { success: false, changed: false, message };
    }
  }

  /**
   * Decide what a failed `Load` meant: a row that is genuinely gone (success — there is
   * no credential left to act on) or a read that did not work (failure — retry later).
   * Only a successful count of zero is confident enough to call it gone.
   */
  private async reportUnloadableInvite(
    id: string,
    contextUser: UserInfo,
    verb: string,
  ): Promise<InviteWriteResult> {
    const rv = new RunView();
    const found = await rv.RunView<MJMagicLinkInviteEntity>(
      {
        EntityName: INVITE_ENTITY,
        ExtraFilter: `ID=${quoteSqlString(id)}`,
        ResultType: 'count_only',
      },
      contextUser,
    );
    if (found.Success && (found.TotalRowCount ?? 0) === 0) {
      return { success: true, changed: false, message: `Invite ${id} no longer exists.` };
    }
    const why = found.Success
      ? 'the row exists but could not be loaded'
      : `checking whether it still exists also failed: ${found.ErrorMessage ?? 'unknown error'}`;
    LogError(`[MagicLinkInviteMinter] Could not ${verb} invite ${id} — ${why}.`);
    return { success: false, changed: false, message: `Could not read magic-link invite ${id}: ${why}.` };
  }

  /** Resolve app + role + resource scope, then persist the anonymous invite row. */
  private async createInviteRecord(
    params: MintAnonymousInviteParams,
    creatingUser: UserInfo,
  ): Promise<MintAnonymousInviteResult> {
    const md = new Metadata();
    // Every read and the write itself run as the host's provisioning identity; only the ROW names
    // the author — see {@link resolveWriter} and `CreatedByUserID` below.
    const writer = this.resolveWriter(creatingUser);

    const applicationId = this.resolveApplicationId(md, params.applicationName);
    if (!applicationId) {
      return { success: false, message: `Application '${params.applicationName}' not found.` };
    }

    const roleId = this.resolveRoleId(md, params.roleName);
    if (!roleId) {
      return {
        success: false,
        skipped: true,
        message:
          `restricted role '${params.roleName}' not found — seed it and add it to ` +
          `magicLink.grantableRoleNames before anonymous links can be provisioned`,
      };
    }

    const resourceTypeId = await this.resolveResourceTypeId(params.resourceTypeName, writer);
    const expiresAt = this.resolveExpiresAt(params.expiresAt);

    const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, writer);
    invite.NewRecord();
    const rawToken = generateRawToken();
    invite.TokenHash = hashToken(rawToken);
    invite.ApplicationID = applicationId;
    invite.RoleID = roleId;
    invite.IdentityMode = 'anonymous';
    invite.Kind = 'resource-share';
    invite.ResourceID = params.resourceId;
    if (resourceTypeId) {
      invite.ResourceTypeID = resourceTypeId;
    }
    invite.MaxUses = params.maxUses;
    invite.UseCount = 0;
    invite.ExpiresAt = expiresAt;
    invite.Status = 'Active';
    // The AUTHOR, never the writer. This is not an authorization field, and two things depend on it
    // staying the person: it is the audit trail for who published the link, and core's redeem path
    // fails CLOSED on it — `isInviterActive` refuses every outstanding invite of a deactivated
    // inviter, which stamping a service identity here would quietly retire.
    invite.CreatedByUserID = creatingUser.ID;

    if (!(await invite.Save())) {
      return {
        success: false,
        message: `Failed to save magic-link invite: ${invite.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      };
    }

    return { success: true, inviteId: invite.ID, rawToken };
  }

  /** Resolve the Application ID by name (case-insensitive). */
  private resolveApplicationId(md: Metadata, applicationName: string): string | undefined {
    const target = applicationName.trim().toLowerCase();
    return md.Applications.find((a) => a.Name.trim().toLowerCase() === target)?.ID;
  }

  /** Resolve the Role ID by name (case-insensitive). */
  private resolveRoleId(md: Metadata, roleName: string): string | undefined {
    const target = roleName.trim().toLowerCase();
    return md.Roles.find((r) => r.Name.trim().toLowerCase() === target)?.ID;
  }

  /**
   * Resolve the ResourceType for the scoped entity, if one is registered. Best-effort:
   * `ResourceTypeID` is nullable on the invite and the per-session scope rides
   * `ResourceID`; a missing resource type does not block minting.
   */
  private async resolveResourceTypeId(
    resourceEntityName: string,
    contextUser: UserInfo,
  ): Promise<string | null> {
    const md = new Metadata();
    const entity = md.EntityByName(resourceEntityName);
    if (!entity) {
      return null;
    }
    const rv = new RunView();
    const result = await rv.RunView<MJResourceTypeEntity>(
      {
        EntityName: RESOURCE_TYPE_ENTITY,
        ExtraFilter: `EntityID = ${quoteSqlString(entity.ID)}`,
        ResultType: 'simple',
        Fields: ['ID', 'EntityID'],
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success || !result.Results || result.Results.length === 0) {
      return null;
    }
    const match = result.Results.find((rt) => !!rt.EntityID && UUIDsEqual(rt.EntityID, entity.ID));
    return match?.ID ?? null;
  }


  /**
   * Resolve the invite expiry. A supplied date is used verbatim (the caller has
   * already taken the earlier of the link's `CloseAt` and any host-wide ceiling);
   * otherwise the sentinel stands in for "no expiry", which the NOT NULL column
   * cannot express — see {@link NO_EXPIRY_SENTINEL}.
   */
  private resolveExpiresAt(expiresAt: Date | null | undefined): Date {
    if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
      return expiresAt;
    }
    // A copy, not the constant. `Date` is mutable and this value is assigned onto an entity that
    // other code may normalise in place; handing out the module-level instance would let one such
    // write move the sentinel for the whole process, and every "already unbounded" comparison
    // with it. The VALUE is what is fixed, not the object.
    return new Date(NO_EXPIRY_SENTINEL.getTime());
  }
}
