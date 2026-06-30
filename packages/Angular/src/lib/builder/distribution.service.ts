import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import {
  shareUrl as buildShareUrl,
  embedSnippet as buildEmbedSnippet,
  slugify as buildSlug,
  randomSuffix,
} from './distribution-links';

/** The channel kinds the builder can mint (Phase 1: PublicLink / Embed / QR). */
export type DistributionChannel = mjBizAppsFormsFormDistributionEntityType['ChannelType'];

/** Inputs for creating a distribution. */
export interface CreateDistributionInput {
  formId: string;
  name: string;
  channelType: DistributionChannel;
  slug?: string;
  maxResponses?: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  captchaRequired?: boolean;
}

/**
 * Create + list FormDistribution records and derive the public artifacts (slug,
 * public URL, embed snippet). The magic-link wiring behind a distribution
 * (`MagicLinkInviteID`) is provisioned server-side by WP-B/WP-A; the builder mints
 * the distribution row and its slug, and surfaces the shareable artifacts.
 */
@Injectable()
export class DistributionService {
  private readonly md = new Metadata();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /** List all distributions for a form, newest first. */
  public async list(formId: string): Promise<mjBizAppsFormsFormDistributionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormDistributionEntity>(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Failed to load distributions: ${result.ErrorMessage}`);
      return [];
    }
    return result.Results ?? [];
  }

  /**
   * Create + save a new distribution, generating a unique slug when none supplied.
   *
   * Slug uniqueness is ultimately enforced by a DB unique index on
   * `FormDistribution.Slug` (authored in the WP-A/WP-B schema). The pre-probe here is
   * best-effort; the authoritative guard is `Save()` failing on the unique violation,
   * so we retry with a fresh suffix on failure rather than trusting the check alone.
   */
  public async create(
    input: CreateDistributionInput,
  ): Promise<mjBizAppsFormsFormDistributionEntity | undefined> {
    const base = input.slug ?? this.slugify(input.name);
    const dist = await this.md.GetEntityObject<mjBizAppsFormsFormDistributionEntity>(
      FORMS_ENTITY.FormDistribution,
      this.user,
    );
    dist.NewRecord();
    dist.FormID = input.formId;
    dist.Name = input.name;
    dist.ChannelType = input.channelType;
    dist.Status = 'Draft';
    dist.ResponseCount = 0;
    dist.IsActive = true;
    dist.CaptchaRequired = input.captchaRequired ?? true;
    dist.MaxResponses = input.maxResponses ?? null;
    dist.OpenAt = input.openAt ?? null;
    dist.CloseAt = input.closeAt ?? null;

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      dist.Slug = await this.candidateSlug(base, attempt);
      if (await dist.Save()) {
        return dist;
      }
      LogError(
        `Failed to save distribution (attempt ${attempt + 1}): ${dist.LatestResult?.CompleteMessage ?? 'unknown'}`,
      );
    }
    return undefined;
  }

  /** First attempt probes for a free slug; later attempts append a fresh random suffix. */
  private async candidateSlug(base: string, attempt: number): Promise<string> {
    if (attempt === 0) {
      return (await this.slugExists(base)) ? `${base}-${randomSuffix()}` : base;
    }
    return `${base}-${randomSuffix()}`;
  }

  /** Open a distribution for responses (Status -> Active). */
  public async open(dist: mjBizAppsFormsFormDistributionEntity): Promise<boolean> {
    return this.setStatus(dist, 'Active');
  }

  /** Close a distribution (Status -> Closed). */
  public async close(dist: mjBizAppsFormsFormDistributionEntity): Promise<boolean> {
    return this.setStatus(dist, 'Closed');
  }

  /** Persist a max-responses cap change. */
  public async setMaxResponses(
    dist: mjBizAppsFormsFormDistributionEntity,
    max: number | null,
  ): Promise<boolean> {
    dist.MaxResponses = max;
    return this.saveDist(dist, 'set max responses');
  }

  private async setStatus(
    dist: mjBizAppsFormsFormDistributionEntity,
    status: mjBizAppsFormsFormDistributionEntityType['Status'],
  ): Promise<boolean> {
    dist.Status = status;
    return this.saveDist(dist, `set status ${status}`);
  }

  private async saveDist(
    dist: mjBizAppsFormsFormDistributionEntity,
    action: string,
  ): Promise<boolean> {
    const ok = await dist.Save();
    if (!ok) {
      LogError(`Failed to ${action}: ${dist.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return ok;
  }

  /**
   * The shareable public URL for a distribution. Once its anonymous link has been
   * provisioned (a `PublicLinkToken` exists), this is the redeemable magic-link URL
   * (`/magic-link/redeem?token=...`) that establishes the scoped session; before
   * provisioning it falls back to the slug URL.
   */
  public publicUrl(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildShareUrl(dist.PublicLinkToken, dist.Slug ?? '', baseUrl);
  }

  /** An `<iframe>` embed snippet pointing at the distribution's shareable public URL. */
  public embedSnippet(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildEmbedSnippet(dist.PublicLinkToken, dist.Slug ?? '', baseUrl);
  }

  /** Slugify a name to a URL-friendly token. */
  public slugify(name: string): string {
    return buildSlug(name, randomSuffix);
  }

  /** Whether any distribution already uses this slug. Read failure => assume taken. */
  private async slugExists(slug: string): Promise<boolean> {
    const rv = new RunView();
    const result = await rv.RunView(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        ExtraFilter: `Slug='${slug.replace(/'/g, "''")}'`,
        ResultType: 'count_only',
      },
      this.user,
    );
    if (!result.Success) {
      return true;
    }
    return (result.TotalRowCount ?? 0) > 0;
  }
}
