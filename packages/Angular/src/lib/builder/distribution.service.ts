import { Injectable } from '@angular/core';
import { EntitySaveOptions, Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import {
  shareUrl as buildShareUrl,
  embedSnippet as buildEmbedSnippet,
  slugify as buildSlug,
  randomSuffix,
} from './distribution-links';
import { SHARE_LINK_FIELDS, type ShareLinkFacts } from './share-state';

/** The channel kinds the builder can mint (Phase 1: PublicLink / Embed / QR). */
export type DistributionChannel = mjBizAppsFormsFormDistributionEntityType['ChannelType'];

/**
 * The channel every share link is created under.
 *
 * The builder no longer asks. `ChannelType` reads like a property of the link, but it is
 * really a server switch: `FORMS_MAGICLINK_CHANNELS` decides which channels get an
 * anonymous magic-link token minted, and the three the UI used to offer — PublicLink,
 * Embed, QR — are all in the default allow-list and therefore behave identically. Nothing
 * else in the product reads the column. So the question bought the author nothing and cost
 * them a decision they had no basis to make, taken before they had seen a single artifact
 * and impossible to change afterwards.
 *
 * `Email` is the one value that genuinely differs — it is deliberately NOT in the default
 * allow-list, because an email campaign is individually addressed rather than an anonymous
 * public link — which is why this default is a constant rather than a parameter. Creating
 * links under a channel that gets no token would produce exactly the dead link this fixes.
 */
const DEFAULT_CHANNEL: DistributionChannel = 'PublicLink';

/** Inputs for creating a distribution. */
export interface CreateDistributionInput {
  formId: string;
  name: string;
  /** Defaults to {@link DEFAULT_CHANNEL}; see why the builder does not ask. */
  channelType?: DistributionChannel;
  slug?: string;
  maxResponses?: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  captchaRequired?: boolean;
}

/**
 * The outcome of a write, carrying the reason when it fails.
 *
 * `Save()` and `Delete()` return a bare boolean, and the surface above needs the message
 * to put in front of the person: this service used to log the failure and hand back
 * `false`, so a rejected save looked exactly like a control that did nothing. A cap the
 * database refused would silently revert on the next reload with no explanation.
 */
export interface MutationOutcome {
  ok: boolean;
  /** Present only when `ok` is false. Safe to show in the UI. */
  error?: string;
}

/**
 * The outcome of a read.
 *
 * A failed load is NOT an empty list. Collapsing the two — which is what returning `[]`
 * on error does — renders "not shared anywhere yet" over a form that may have live links
 * in the wild, and invites the author to create a duplicate.
 */
export type DistributionListResult =
  | { ok: true; items: mjBizAppsFormsFormDistributionEntity[] }
  | { ok: false; error: string };

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
  public async list(formId: string): Promise<DistributionListResult> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormDistributionEntity>(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        // Same escaping as every other filter this service builds. It was raw interpolation,
        // which is a second spelling of one decision and the one that is wrong when it matters.
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      const error = result.ErrorMessage ?? 'unknown error';
      LogError(`Failed to load distributions for form ${formId}: ${error}`);
      return { ok: false, error };
    }
    return { ok: true, items: result.Results ?? [] };
  }

  /**
   * Just enough of a form's share links to say whether a respondent could reach it.
   *
   * Deliberately NOT {@link list}. That one hands back `entity_object` rows because the
   * Distribute tab edits them; a caller that only wants to KNOW something has no business
   * holding five savable records, and this read runs on every builder load rather than only
   * when someone opens the tab. Seven named columns, `ResultType: 'simple'`.
   *
   * `null` — never `[]` — when the read cannot be performed, for the reason
   * {@link DistributionListResult} exists: "this form has no share links" is a real state
   * with its own message, and a failed read is not it. Collapsing the two would send an
   * author off to create a link that already exists.
   */
  public async shareLinkFacts(formId: string): Promise<ShareLinkFacts[] | null> {
    if (!formId) {
      // Not a data state — a caller asking about a form that has never been saved. Answering
      // "no share links" would be a confident lie about a form that does not exist yet.
      LogError('Refusing to read share links: no form id was supplied.');
      return null;
    }
    const rv = new RunView();
    const result = await rv.RunView<ShareLinkFacts>(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        // Owned by `share-state.ts`, not restated here: the field list and the facts the state
        // machine reads have to be the same set, and only one of the two places can be right.
        Fields: [...SHARE_LINK_FIELDS],
        ResultType: 'simple',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(
        `Failed to read share links for form ${formId}: ${result.ErrorMessage ?? 'unknown error'}`,
      );
      return null;
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
    dist.ChannelType = input.channelType ?? DEFAULT_CHANNEL;
    // Create live, not Draft. A distribution is created to be shared, and the anonymous
    // magic-link token is only minted by the server-side lifecycle hook once the record
    // is Active (see provisioning-decision.ts). Leaving it Draft produces a public link
    // (`/f/:slug`) that 409s ("not ready yet") because no token was ever minted — a
    // footgun. Staff can Close it anytime; this just makes the link work on creation.
    dist.Status = 'Active';
    dist.ResponseCount = 0;
    dist.IsActive = true;
    // Captcha is OPT-IN: default off so public forms work out of the box. Turnstile is
    // fail-closed (a submit is rejected if captcha is on but no Turnstile secret is
    // configured), so defaulting on would silently break every submission until an admin
    // wires Cloudflare Turnstile. Matches the form-level `captchaRequired` default (false).
    dist.CaptchaRequired = input.captchaRequired ?? false;
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
  public async open(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.setStatus(dist, 'Active');
  }

  /** Close a distribution (Status -> Closed). */
  public async close(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.setStatus(dist, 'Closed');
  }

  /** Persist a max-responses cap change. `null` clears the cap. */
  public async setMaxResponses(
    dist: mjBizAppsFormsFormDistributionEntity,
    max: number | null,
  ): Promise<MutationOutcome> {
    dist.MaxResponses = max;
    return this.saveDist(dist, 'set the response limit');
  }

  /**
   * Ask the server to issue this link's public web address.
   *
   * There is no "mint" API to call: the token is minted by a `Save()` lifecycle hook on
   * the server-side `FormDistributionEntityServer` subclass, and only when the record is
   * an active, linkable channel. So this makes the record eligible and saves it, which is
   * both the trigger and the repair — a link created while the server could not mint (the
   * hook's package not loaded, or magic links switched off) sits there with a null token
   * forever otherwise, because nothing re-tries on its own.
   *
   * Success here means the SAVE succeeded, not that a token appeared. The hook is
   * deliberately fail-soft — it logs and leaves the record standing rather than failing
   * the save — so the caller has to re-read the record to find out, which is why this is
   * paired with a reload at the call site.
   */
  public async issueLink(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    dist.Status = 'Active';
    dist.IsActive = true;
    // IgnoreDirtyState is the whole reason this works. A record that is ALREADY active is
    // unchanged by the two lines above, and `Save()` skips a clean record outright
    // (baseEntity.ts: `if (options.IgnoreDirtyState || initialDirtyState || ...)`), so the
    // server-side hook would never run and this button would silently do nothing — in
    // precisely the common case, an active link the server failed to mint a token for.
    const options = new EntitySaveOptions();
    options.IgnoreDirtyState = true;
    return this.saveDist(dist, 'issue a link for this share link', options);
  }

  /** Rename a distribution. The caller is responsible for trimming and rejecting blanks. */
  public async setName(
    dist: mjBizAppsFormsFormDistributionEntity,
    name: string,
  ): Promise<MutationOutcome> {
    dist.Name = name;
    return this.saveDist(dist, 'rename this share link');
  }

  /**
   * Persist the open/close window. Either side may be `null`, meaning "no bound".
   *
   * Both go in one save because they are one decision: writing them separately makes a
   * window briefly inverted (a close date before the open date) between two round trips,
   * and that intermediate state is the one the server would read if it looked.
   */
  public async setSchedule(
    dist: mjBizAppsFormsFormDistributionEntity,
    openAt: Date | null,
    closeAt: Date | null,
  ): Promise<MutationOutcome> {
    dist.OpenAt = openAt;
    dist.CloseAt = closeAt;
    return this.saveDist(dist, 'set the schedule');
  }

  /**
   * Delete a distribution permanently.
   *
   * Fails rather than cascades when anything references it — `FormUpload.DistributionID`
   * is a required FK, so a link people have already uploaded files through cannot be
   * removed. That refusal is the right outcome and the message says so; the caller offers
   * pausing instead, which stops responses without breaking a URL already in the wild.
   */
  public async remove(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    const ok = await dist.Delete();
    if (ok) {
      return { ok: true };
    }
    const error = dist.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Failed to delete distribution ${dist.ID}: ${error}`);
    return { ok: false, error };
  }

  private async setStatus(
    dist: mjBizAppsFormsFormDistributionEntity,
    status: mjBizAppsFormsFormDistributionEntityType['Status'],
  ): Promise<MutationOutcome> {
    dist.Status = status;
    return this.saveDist(dist, status === 'Active' ? 'reopen this share link' : 'pause this share link');
  }

  private async saveDist(
    dist: mjBizAppsFormsFormDistributionEntity,
    action: string,
    options?: EntitySaveOptions,
  ): Promise<MutationOutcome> {
    if (await dist.Save(options)) {
      return { ok: true };
    }
    const error = dist.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Failed to ${action} (distribution ${dist.ID}): ${error}`);
    // A refused save leaves the rejected value sitting on the in-memory record, and every
    // surface above renders from that record — so a limit the database bounced went on
    // being displayed as though it had been stored, until something forced a reload.
    // Revert puts the record back to its last saved state, making the screen honest again.
    dist.Revert();
    return { ok: false, error: `Could not ${action}. ${error}` };
  }

  /**
   * The shareable public URL for a distribution: the `/f/:slug` host page, which
   * redeems the distribution's anonymous magic-link token server-side and renders the
   * shell-free widget. (NOT the raw `/magic-link/redeem?token=` URL — that bounces a
   * browser to the Explorer login shell.)
   */
  public publicUrl(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildShareUrl(dist.Slug ?? '', baseUrl);
  }

  /** An `<iframe>` embed snippet pointing at the distribution's `/f/:slug` public URL. */
  public embedSnippet(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildEmbedSnippet(dist.Slug ?? '', baseUrl);
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
        ExtraFilter: `Slug=${quoteSqlString(slug)}`,
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
