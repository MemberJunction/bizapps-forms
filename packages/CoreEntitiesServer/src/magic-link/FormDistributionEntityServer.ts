/**
 * Server-side lifecycle hook for `MJ_BizApps_Forms: Form Distributions`.
 *
 * Owns the whole life of a distribution's anonymous magic-link credential: it mints
 * one when the distribution becomes a live public/anonymous channel, revokes it when
 * the distribution stops being one, and reissues it on request. Because it fires from
 * `Save()`, it applies to EVERY writer — builder, AI, Action, import, direct API — so
 * a link taken out of service by any of them has its credential withdrawn too. That
 * writer-agnosticism is the point of putting this here rather than in the builder
 * (bizapps-forms#104); the invariant it enforces is stated once, in
 * `provisioning-decision.ts`.
 *
 * Registered via `@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Distributions')`
 * so MJ's class factory instantiates THIS subclass server-side. The work is delegated
 * through the `MagicLinkMinterRegistry` seam (see minter.ts); when no host minter is
 * registered (host has not enabled core `magicLink`), the hook logs a clear warning
 * and leaves the record alone WITHOUT failing the save. The orchestration lives in
 * `runProvisioning` (provision-runner.ts) so it is unit-testable without a DB; this
 * class is the thin BaseEntity adapter.
 *
 * See FORMS_BUILD_PLAN §4 item 4.
 */
import { BaseEntity, LogError, type EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { getMagicLinkProvisioningConfig } from './config.js';
import { MagicLinkMinterRegistry } from './minter.js';
import { runProvisioning, DISTRIBUTION_ENTITY_NAME, type MintedLink } from './provision-runner.js';

@RegisterClass(BaseEntity, DISTRIBUTION_ENTITY_NAME)
export class FormDistributionEntityServer extends mjBizAppsFormsFormDistributionEntity {
  /**
   * True while this instance is writing the credential back onto itself.
   *
   * {@link persistCredential} calls `Save()`, which re-enters this override. With one
   * action that recursion terminated by luck — the freshly-set invite id made the
   * decision short-circuit. There are three actions now, and one of them (reissue)
   * is triggered BY a cleared column, so "prove each path settles" is no longer a
   * cheap thing to keep true. An explicit guard costs one boolean and makes the
   * nesting depth provably one, per the repo's cap-every-unbounded-loop rule.
   */
  private credentialWriteInFlight = false;

  /**
   * Persists the distribution, then (post-save) restores its magic-link credential
   * invariant. Provisioning never blocks the save: a missing minter or any failure
   * is logged, and the distribution stands.
   *
   * Post-save rather than pre-save because the decision has to be about the state
   * that actually landed. A revocation driven by values that then failed to save
   * would kill a live link's credential over a write that never happened.
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    const saved = await super.Save(options);
    if (!saved || this.credentialWriteInFlight) {
      return saved;
    }

    this.credentialWriteInFlight = true;
    try {
      await runProvisioning(
        {
          distributionId: this.ID,
          channelType: this.ChannelType,
          status: this.Status,
          isActive: this.IsActive,
          magicLinkInviteId: this.MagicLinkInviteID,
          publicLinkToken: this.PublicLinkToken,
          closeAt: this.CloseAt,
        },
        getMagicLinkProvisioningConfig(),
        MagicLinkMinterRegistry.Instance.Minter,
        this.ContextCurrentUser,
        (credential) => this.persistCredential(credential),
      );
    } catch (e) {
      // Defensive: the runner is fail-soft, but a thrown error must never undo a
      // successful distribution save.
      LogError(
        `[FormDistributionEntityServer] Provisioning threw for distribution ${this.ID}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      this.credentialWriteInFlight = false;
    }

    return true;
  }

  /**
   * Make this record's credential be exactly `credential` — or none, given `null` —
   * with a single targeted second save.
   *
   * Both columns are written unconditionally, together. The old version wrote the raw
   * token only into an empty column, to keep a live link's redeem URL stable; that
   * stability is now a property of the DECISION (a live link with a working credential
   * is never touched at all — see `decideProvisioning`) rather than of this write, and
   * leaving the guard here would have been actively wrong: a reissue would have stored
   * the new invite id beside the old token, serving a raw token the new invite cannot
   * redeem. The pair is one value; it moves as one.
   */
  private async persistCredential(credential: MintedLink | null): Promise<boolean> {
    this.MagicLinkInviteID = credential?.inviteId ?? null;
    this.PublicLinkToken = credential?.rawToken ?? null;
    if (!(await this.Save())) {
      const what = credential ? `store invite ${credential.inviteId} on` : 'clear the credential of';
      LogError(
        `[FormDistributionEntityServer] Failed to ${what} distribution ${this.ID}: ` +
          `${this.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
      return false;
    }
    return true;
  }
}
