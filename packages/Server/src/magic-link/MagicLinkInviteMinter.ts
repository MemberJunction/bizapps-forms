/**
 * Concrete anonymous-magic-link minter for the Forms host (MJAPI).
 *
 * Registered into the `MagicLinkMinterRegistry` seam at server bootstrap so the
 * `FormDistributionEntityServer` lifecycle hook (in `@mj-biz-apps/forms-core-entities-server`)
 * can provision invites WITHOUT that lightweight package depending on the heavy
 * `@memberjunction/server`.
 *
 * WHY this mints by writing the core `MJ: Magic Link Invites` entity directly,
 * rather than calling `MagicLinkService.CreateInvite`:
 *  - On the pinned MJ 5.43.0, `MagicLinkService` is neither root-exported nor
 *    reachable through the package `exports` map, so it cannot be imported.
 *  - Its `CreateInvite` cannot set `IdentityMode='anonymous'` / `Kind='resource-share'`
 *    / `ResourceID` — exactly the fields an anonymous, distribution-scoped public
 *    link requires. The redeem path (which IS shipped) reads those columns off the
 *    invite at redemption time.
 * So we reproduce the (small, well-specified) create path here over the same
 * entity + token format the shipped redeem path expects.
 */
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { configInfo } from '@memberjunction/server';
import type { MJMagicLinkInviteEntity, MJResourceTypeEntity } from '@memberjunction/core-entities';
import type {
  IAnonymousMagicLinkMinter,
  MintAnonymousInviteParams,
  MintAnonymousInviteResult,
} from '@mj-biz-apps/forms-core-entities-server';
import { generateRawToken, hashToken } from './token.js';

const INVITE_ENTITY = 'MJ: Magic Link Invites';
const RESOURCE_TYPE_ENTITY = 'MJ: Resource Types';

/** Default expiry (years) for an effectively-permanent public link when none is supplied. */
const DEFAULT_NO_EXPIRY_YEARS = 100;

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
   * Resolve the invite expiry. A supplied date is used verbatim; otherwise the
   * link is effectively permanent (the column is non-nullable, so we set a far-future
   * sentinel) to match a high `maxUses` public URL.
   */
  private resolveExpiresAt(expiresAt: Date | null | undefined): Date {
    if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) {
      return expiresAt;
    }
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + DEFAULT_NO_EXPIRY_YEARS);
    return farFuture;
  }
}
