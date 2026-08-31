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
import type {
  IAnonymousMagicLinkMinter,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
  RevokeAnonymousInviteResult,
} from '@mj-biz-apps/forms-core-entities-server';
import { generateRawToken, hashToken } from './token.js';

const INVITE_ENTITY = 'MJ: Magic Link Invites';
const RESOURCE_TYPE_ENTITY = 'MJ: Resource Types';

/**
 * Horizon (years) written into `ExpiresAt` for a link with no closing date.
 *
 * This is a SENTINEL for "no expiry", not a limit: core's `MagicLinkInvite.ExpiresAt`
 * is NOT NULL, so "never" has no representation and something must be written. It is
 * deliberately far enough out to be unmistakably a sentinel rather than a policy
 * someone chose. Two things make that safe rather than the century-long credential
 * bizapps-forms#104 opened with: the credential now dies with the link (revoked the
 * moment the distribution stops being live), and a deployment that wants a real
 * ceiling sets `FORMS_MAGICLINK_EXPIRY_HOURS`, which is combined with the link's own
 * `CloseAt` by taking the earlier of the two.
 *
 * A short default was considered and rejected: nothing on the distribution records
 * the credential's expiry, so a link would go dead while the builder still badged it
 * "Live" — a confidently-wrong surface, which is the failure mode `share-state.ts`
 * exists to prevent. Bounding it honestly needs a column and a badge, not a smaller
 * number here.
 */
const NO_EXPIRY_SENTINEL_YEARS = 100;

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
   * already `Revoked`, or whose row has been deleted, is a success that writes
   * nothing. Reporting failure there would wedge the distribution: its hook refuses
   * to unlink a credential it could not kill, and would retry forever.
   */
  public async RevokeAnonymousInvite(
    inviteId: string,
    contextUser: UserInfo,
  ): Promise<RevokeAnonymousInviteResult> {
    const id = inviteId?.trim();
    if (!id) {
      return { success: false, message: 'No invite id supplied.' };
    }

    try {
      const md = new Metadata();
      const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>(INVITE_ENTITY, contextUser);
      if (!(await invite.Load(id))) {
        return { success: true, message: `Invite ${id} no longer exists; nothing to revoke.` };
      }
      if (invite.Status === 'Revoked') {
        return { success: true, message: `Invite ${id} was already revoked.` };
      }

      // Status alone, deliberately: it is the first thing `evaluateInvite` checks and
      // the consume UPDATE's `Status='Active'` guard already excludes it, so also
      // collapsing `ExpiresAt` would be a second write buying no additional refusal —
      // while destroying the record of when the credential was originally to expire.
      invite.Status = 'Revoked';
      if (!(await invite.Save())) {
        return {
          success: false,
          message: `Failed to revoke magic-link invite ${id}: ${
            invite.LatestResult?.CompleteMessage ?? 'unknown error'
          }`,
        };
      }
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`[MagicLinkInviteMinter] Revoke failed for invite ${id}: ${message}`);
      return { success: false, message };
    }
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
   * otherwise the far-future sentinel stands in for "no expiry", which the NOT NULL
   * column cannot express — see {@link NO_EXPIRY_SENTINEL_YEARS}.
   */
  private resolveExpiresAt(expiresAt: Date | null | undefined): Date {
    if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
      return expiresAt;
    }
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + NO_EXPIRY_SENTINEL_YEARS);
    return farFuture;
  }
}
