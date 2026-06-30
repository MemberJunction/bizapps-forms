/**
 * Server-side lifecycle hook for `MJ_BizApps_Forms: Form Distributions`.
 *
 * Mints an anonymous, multi-use, resource-scoped magic-link invite the first
 * time a distribution becomes an active public/anonymous channel, and stores the
 * resulting invite ID on `MagicLinkInviteID`. Fires from `Save()`, so it runs
 * however the distribution is created/activated — builder, AI, import, or API.
 *
 * Registered via `@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Distributions')`
 * so MJ's class factory instantiates THIS subclass server-side. The minting is
 * delegated through the `MagicLinkMinterRegistry` seam (see minter.ts); when no
 * host minter is registered (host has not enabled core `magicLink`), the hook
 * logs a clear warning and leaves `MagicLinkInviteID` null WITHOUT failing the
 * save. The orchestration lives in `runProvisioning` (provision-runner.ts) so it
 * is unit-testable without a DB; this class is the thin BaseEntity adapter.
 *
 * See FORMS_BUILD_PLAN §4 item 4.
 */
import { BaseEntity, LogError, type EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { getMagicLinkProvisioningConfig } from './config.js';
import { MagicLinkMinterRegistry } from './minter.js';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME } from './provision-runner.js';

@RegisterClass(BaseEntity, DISTRIBUTION_ENTITY_NAME)
export class FormDistributionEntityServer extends mjBizAppsFormsFormDistributionEntity {
  /**
   * Persists the distribution, then (post-save) provisions its anonymous
   * magic-link invite when warranted. Provisioning never blocks the save:
   * a missing minter or a mint failure is logged, and the distribution stands.
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    const saved = await super.Save(options);
    if (!saved) {
      return false;
    }

    try {
      await runProvisioning(
        {
          distributionId: this.ID,
          channelType: this.ChannelType,
          status: this.Status,
          isActive: this.IsActive,
          magicLinkInviteId: this.MagicLinkInviteID,
          closeAt: this.CloseAt,
        },
        getMagicLinkProvisioningConfig(),
        MagicLinkMinterRegistry.Instance.Minter,
        this.ContextCurrentUser,
        (inviteId) => this.persistInviteId(inviteId),
      );
    } catch (e) {
      // Defensive: the runner is fail-soft, but a thrown error must never undo a
      // successful distribution save.
      LogError(
        `[FormDistributionEntityServer] Provisioning threw for distribution ${this.ID}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    return true;
  }

  /**
   * Writes the freshly minted invite ID back onto this record with a targeted
   * second save. The re-entry is idempotent: the now-set `MagicLinkInviteID`
   * makes the provisioning decision short-circuit on the recursive `Save()`,
   * so no re-mint occurs.
   */
  private async persistInviteId(inviteId: string): Promise<boolean> {
    this.MagicLinkInviteID = inviteId;
    if (!(await this.Save())) {
      LogError(
        `[FormDistributionEntityServer] Failed to store invite ${inviteId} on distribution ${this.ID}: ` +
          `${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
      return false;
    }
    return true;
  }
}
