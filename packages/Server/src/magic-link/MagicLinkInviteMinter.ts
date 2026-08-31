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
 */
import { Metadata, LogError, RunView, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { configInfo } from '@memberjunction/server';
import type { MJMagicLinkInviteEntity, MJResourceTypeEntity } from '@memberjunction/core-entities';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  IAnonymousMagicLinkMinter,
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

/** Whether two instants are the same, treating an unparseable stored value as "different". */
function sameInstant(a: Date | null | undefined, b: Date): boolean {
  const left = a instanceof Date ? a.getTime() : Number.NaN;
  return Number.isFinite(left) && left === b.getTime();
}

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
   * The postcondition is "this invite cannot be redeemed", so an invite that is
   * already `Revoked`, or whose row has genuinely been deleted, is a success that
   * writes nothing. Reporting failure there would wedge the distribution: its hook
   * refuses to unlink a credential it could not kill, and would retry forever.
   */
  public async RevokeAnonymousInvite(
    inviteId: string,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult> {
    return this.writeToInvite(inviteId, contextUser, 'revoke', (invite) => {
      if (invite.Status === 'Revoked') {
        return { done: true, message: `Invite ${invite.ID} was already revoked.` };
      }
      // Status alone, deliberately: it is the first thing `evaluateInvite` checks and
      // the consume UPDATE's `Status='Active'` guard already excludes it, so also
      // collapsing `ExpiresAt` would be a second write buying no additional refusal —
      // while destroying the record of when the credential was originally to expire.
      invite.Status = 'Revoked';
      return { done: false };
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
    inviteId: string,
    expiresAt: Date | null,
    contextUser: UserInfo,
  ): Promise<InviteWriteResult> {
    const target = this.resolveExpiresAt(expiresAt);
    return this.writeToInvite(inviteId, contextUser, 'set the expiry of', (invite) => {
      if (invite.Status !== 'Active') {
        return { done: true, message: `Invite ${invite.ID} is ${invite.Status}; expiry left as it was.` };
      }
      if (sameInstant(invite.ExpiresAt, target)) {
        return { done: true };
      }
      invite.ExpiresAt = target;
      return { done: false };
    });
  }

  /**
   * Load one invite and apply `change` to it, saving only if `change` asked for a write.
   *
   * The shared body of revoke and re-bound, which are the same five steps around one
   * different line. `change` returns `done: true` to mean "the postcondition already
   * holds, write nothing" — the no-op success both callers rely on.
   *
   * A failed `Load` is NOT assumed to mean "deleted". `Load()` returns false for a row
   * that is gone AND for a read that failed, and the two demand opposite answers: gone
   * is a success the caller acts on by unlinking, while a failed read reported as
   * success unlinks a credential that is still live — the orphan this whole design
   * exists to prevent. So the ambiguous case is resolved by asking whether the row is
   * there, and anything short of a confident "no" is reported as a failure to retry.
   */
  private async writeToInvite(
    inviteId: string,
    contextUser: UserInfo,
    verb: string,
    change: (invite: MJMagicLinkInviteEntity) => { done: boolean; message?: string },
  ): Promise<InviteWriteResult> {
    const id = inviteId?.trim();
    if (!id) {
      return { success: false, changed: false, message: 'No invite id supplied.' };
    }

    try {
      const md = new Metadata();
      const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, contextUser);
      if (!(await invite.Load(id))) {
        return await this.reportUnloadableInvite(id, contextUser, verb);
      }

      const outcome = change(invite);
      if (outcome.done) {
        return { success: true, changed: false, message: outcome.message };
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
    const found = await rv.RunView(
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

    const resourceTypeId = await this.resolveResourceTypeId(params.resourceTypeName, creatingUser);
    const expiresAt = this.resolveExpiresAt(params.expiresAt);

    const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, creatingUser);
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
        ExtraFilter: `EntityID = '${entity.ID}'`,
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
    return NO_EXPIRY_SENTINEL;
  }
}
