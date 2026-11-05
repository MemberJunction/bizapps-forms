import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type BaseRemotableOperation } from '@memberjunction/core';
import {
  ALLOWED_ORIGIN_GRAMMAR,
  authorAllowedOrigins,
  FormsCloseDistributionOperation,
  FormsGetDistributionClaimsOperation,
  FormsIssueDistributionLinkOperation,
  FormsOpenDistributionOperation,
  FormsReissueDistributionLinkOperation,
  quoteSqlString,
  serializeAllowedOrigins,
  type FormsDistributionLinkOutput,
  type FormsDistributionVerbInput,
} from '@mj-biz-apps/forms-entities';
import type {
  mjBizAppsFormsFormDistributionEntity,
  mjBizAppsFormsFormDistributionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { runOperation } from '../shared/remote-operation';
import { toClaimsResult, type ClaimsResult } from './distribution-claims';
import { shareUrl as buildShareUrl, embedSnippet as buildEmbedSnippet } from './distribution-links';
import { SHARE_LINK_FIELDS, type ShareLinkFacts } from './share-state';

/** The channel kinds a share link can be created under. */
export type DistributionChannel = mjBizAppsFormsFormDistributionEntityType['ChannelType'];

/**
 * Inputs for creating a share link. Only the form is required: the server derives the name, the
 * slug (and its uniqueness), the channel (`PublicLink`) and the defaults for the rest.
 */
export interface CreateDistributionInput {
  formId: string;
  name?: string;
  channelType?: DistributionChannel;
  slug?: string;
  maxResponses?: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  captchaRequired?: boolean;
}

/** A created share link, or why it was not created. */
export type CreateDistributionResult =
  | { ok: true; distributionId: string; respondentUrl: string | null }
  | { ok: false; error: string };

/**
 * The outcome of a write, carrying the reason when it fails.
 *
 * `Save()` and `Delete()` return a bare boolean, and the surface above needs the message
 * to put in front of the person: a rejected save used to look exactly like a control that did
 * nothing, and a cap the database refused would silently revert on the next reload.
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
 * The Distribute tab's reads and writes over a form's share links (`FormDistribution` rows).
 *
 * TWO KINDS OF WRITE, split on purpose (spec #303 §3, §4):
 *
 * - The link's LIFECYCLE — create, open, close, reissue — is a Remote Operation each
 *   (`Forms.IssueDistributionLink`, `Forms.OpenDistribution`, `Forms.CloseDistribution`,
 *   `Forms.ReissueDistributionLink`). Each one changes the access credential, which the server's
 *   provisioning hook writes in the same transaction, and slug generation with its uniqueness
 *   retry lives there too. So an Action or an agent gets the same link this tab does, and the
 *   client's copy of the row is stale by design afterwards: the caller re-reads it.
 * - A link's SETTINGS — name, cap, schedule, captcha, allowed sites — are plain one-row saves on
 *   the entity, refused or accepted by `FormDistributionEntityServer`'s own validation.
 */
@Injectable()
export class DistributionService {
  private readonly md = new Metadata();

  /**
   * Which other apps claim this form's share-link slugs (`Forms.GetDistributionClaims`). A failed
   * check is reported as `{ ok: false }`, never as "no claims" — see {@link ClaimsResult}.
   */
  public async claims(formId: string): Promise<ClaimsResult> {
    const outcome = await runOperation(
      new FormsGetDistributionClaimsOperation(),
      { FormID: formId },
      `checking share-link claims for form ${formId}`,
    );
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    const result = toClaimsResult(outcome.output);
    if (!result.ok) {
      LogError(`Share-link claims for form ${formId} could not be read: ${result.error}`);
    }
    return result;
  }

  /** List all distributions for a form, newest first. */
  public async list(formId: string): Promise<DistributionListResult> {
    const result = await new RunView().RunView<mjBizAppsFormsFormDistributionEntity>(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object',
      },
      this.md.CurrentUser,
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
   * Deliberately NOT {@link list}: a caller that only wants to KNOW something has no business
   * holding savable records, and this read runs on every builder load. `null` — never `[]` — when
   * the read cannot be performed, because "this form has no share links" is a real state with
   * its own message, and a failed read is not it.
   */
  public async shareLinkFacts(formId: string): Promise<ShareLinkFacts[] | null> {
    if (!formId) {
      // Not a data state — a caller asking about a form that has never been saved.
      LogError('Refusing to read share links: no form id was supplied.');
      return null;
    }
    const result = await new RunView().RunView<ShareLinkFacts>(
      {
        EntityName: FORMS_ENTITY.FormDistribution,
        ExtraFilter: `FormID=${quoteSqlString(formId)}`,
        // Owned by `share-state.ts`, not restated here: the field list and the facts the state
        // machine reads have to be the same set.
        Fields: [...SHARE_LINK_FIELDS],
        ResultType: 'simple',
      },
      this.md.CurrentUser,
    );
    if (!result.Success) {
      LogError(`Failed to read share links for form ${formId}: ${result.ErrorMessage ?? 'unknown error'}`);
      return null;
    }
    return result.Results ?? [];
  }

  /**
   * Create a share link and open it (`Forms.IssueDistributionLink`). The server picks a free slug
   * (retrying on a collision) and mints the link's credential in the same transaction; the
   * caller re-reads the list to show it.
   */
  public async create(input: CreateDistributionInput): Promise<CreateDistributionResult> {
    const outcome = await runOperation(
      new FormsIssueDistributionLinkOperation(),
      {
        FormID: input.formId,
        Name: input.name,
        ChannelType: input.channelType,
        Slug: input.slug,
        MaxResponses: input.maxResponses ?? null,
        OpenAt: input.openAt ? input.openAt.toISOString() : null,
        CloseAt: input.closeAt ? input.closeAt.toISOString() : null,
        CaptchaRequired: input.captchaRequired,
      },
      `creating a share link for form ${input.formId}`,
      [FORMS_ENTITY.FormDistribution],
    );
    return outcome.ok
      ? { ok: true, distributionId: outcome.output.FormDistributionID, respondentUrl: outcome.output.RespondentURL }
      : { ok: false, error: `Could not create a share link. ${outcome.error}` };
  }

  /**
   * Open a link to responses (`Forms.OpenDistribution`): `Status = 'Active'` and `IsActive`, with
   * a fresh credential minted, since closing revoked the previous one. The slug is untouched, so
   * every shared URL keeps working. The caller re-reads the record afterwards.
   */
  public open(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.runVerb(new FormsOpenDistributionOperation(), dist, 'reopen this share link');
  }

  /**
   * Ask the server to issue this link's public web address — the repair for a link created
   * while the server could not mint its credential. It is the same operation as {@link open}:
   * opening re-checks the credential even on a row already open.
   */
  public issueLink(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.runVerb(new FormsOpenDistributionOperation(), dist, 'issue a link for this share link');
  }

  /**
   * Close a link to responses (`Forms.CloseDistribution`); its credential is revoked in the same
   * save. The caller re-reads the record afterwards.
   */
  public close(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.runVerb(new FormsCloseDistributionOperation(), dist, 'pause this share link');
  }

  /**
   * Give this link a brand-new access token, keeping its web address
   * (`Forms.ReissueDistributionLink`) — the recourse for a leaked or over-shared credential that
   * does not break the posters, QR codes and embeds already in the wild.
   */
  public reissueLink(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    return this.runVerb(new FormsReissueDistributionLinkOperation(), dist, 'reissue this link');
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
   * Turn this link's captcha requirement on or off.
   *
   * Turnstile is fail-closed: with this on and no server-side Turnstile secret configured, every
   * completed submission through this link is refused, and nothing visible from the builder says
   * whether the host has keys. The server ORs this with the form's own `settings.captchaRequired`,
   * so turning it OFF here does not turn a captcha off for a form that asks for one itself.
   */
  public async setCaptchaRequired(
    dist: mjBizAppsFormsFormDistributionEntity,
    required: boolean,
  ): Promise<MutationOutcome> {
    dist.CaptchaRequired = required;
    return this.saveDist(dist, required ? 'turn on the captcha' : 'turn off the captcha');
  }

  /**
   * Replace the list of sites permitted to show this link.
   *
   * Refuses the WHOLE edit when any entry fails the grammar, and saves nothing — accepting the good
   * entries and dropping the bad one would let an author who wrote `*.acme.com` believe they
   * restricted something. The refusals come back separately so the offending string can be named
   * where it was typed. The server's entity validation enforces the same grammar; this check is
   * the one that can name the entry before a round trip.
   *
   * An empty box clears the column to NULL, which means unrestricted. Once ANY site is named the
   * link is fail-closed: a link already pasted into a page nobody listed stops working, which is
   * why the hint beside the box says so.
   */
  public async setAllowedOrigins(
    dist: mjBizAppsFormsFormDistributionEntity,
    authored: string,
  ): Promise<MutationOutcome & { rejected: string[] }> {
    const { origins, rejected } = authorAllowedOrigins(authored);
    if (rejected.length > 0) {
      // Deliberately before any write: the record must be left exactly as it was, so a refusal
      // cannot leave a half-applied list behind for the next save to pick up.
      return {
        ok: false,
        error: `Not a usable site address: ${rejected.join(', ')}. Each one must be ${ALLOWED_ORIGIN_GRAMMAR}`,
        rejected,
      };
    }
    dist.AllowedOrigins = serializeAllowedOrigins(origins);
    return {
      ...(await this.saveDist(dist, 'change which sites may show this form')),
      rejected: [],
    };
  }

  /** Rename a distribution. The caller is responsible for trimming and rejecting blanks. */
  public async setName(dist: mjBizAppsFormsFormDistributionEntity, name: string): Promise<MutationOutcome> {
    dist.Name = name;
    return this.saveDist(dist, 'rename this share link');
  }

  /**
   * Persist the open/close window. Either side may be `null`, meaning "no bound". Both go in one
   * save because they are one decision: writing them separately makes a window briefly inverted
   * between two round trips.
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
   * Fails rather than cascades when anything references it — `FormUpload.DistributionID` is a
   * required FK, so a link people have already uploaded files through cannot be removed. The
   * caller offers pausing instead, which stops responses without breaking a URL in the wild.
   */
  public async remove(dist: mjBizAppsFormsFormDistributionEntity): Promise<MutationOutcome> {
    if (await dist.Delete()) {
      return { ok: true };
    }
    const error = dist.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Failed to delete distribution ${dist.ID}: ${error}`);
    return { ok: false, error };
  }

  /** One lifecycle verb on one link, as a {@link MutationOutcome}. */
  private async runVerb(
    operation: BaseRemotableOperation<FormsDistributionVerbInput, FormsDistributionLinkOutput>,
    dist: mjBizAppsFormsFormDistributionEntity,
    action: string,
  ): Promise<MutationOutcome> {
    const outcome = await runOperation(
      operation,
      { FormDistributionID: dist.ID },
      `${action} (distribution ${dist.ID})`,
      [FORMS_ENTITY.FormDistribution],
    );
    return outcome.ok ? { ok: true } : { ok: false, error: `Could not ${action}. ${outcome.error}` };
  }

  private async saveDist(dist: mjBizAppsFormsFormDistributionEntity, action: string): Promise<MutationOutcome> {
    if (await dist.Save()) {
      return { ok: true };
    }
    const error = dist.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`Failed to ${action} (distribution ${dist.ID}): ${error}`);
    // A refused save leaves the rejected value sitting on the in-memory record, and every surface
    // above renders from that record — Revert puts it back to its last saved state.
    dist.Revert();
    return { ok: false, error: `Could not ${action}. ${error}` };
  }

  /**
   * The shareable public URL for a distribution: the `/f/:slug` host page, composed against the
   * builder's own API base. Kept even though every verb returns the server's `RespondentURL`,
   * because the server returns none when `MJAPI_PUBLIC_URL` is unset — and a link list with no
   * addresses on such a host would be useless.
   */
  public publicUrl(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildShareUrl(dist.Slug ?? '', baseUrl);
  }

  /** An `<iframe>` embed snippet pointing at the distribution's `/f/:slug` public URL. */
  public embedSnippet(dist: mjBizAppsFormsFormDistributionEntity, baseUrl: string): string {
    return buildEmbedSnippet(dist.Slug ?? '', baseUrl);
  }
}
