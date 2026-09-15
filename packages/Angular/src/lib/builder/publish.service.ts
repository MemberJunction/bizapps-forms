import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, LogStatus, type BaseEntity, type UserInfo } from '@memberjunction/core';
import {
  AUTHORED_AUTOMATION_FIELDS,
  buildPublishedAutomations,
  type AuthoredAutomationRow,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormStyleEntity,
  type mjBizAppsFormsFormVersionEntity,
  quoteSqlString,
  type FormSettings,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { parseFormSettings } from './json-fields';
import type { FormTree } from './builder-models';
import { brokenRuleLines } from './rules-inventory';
import { buildPublishedDefinition } from './snapshot-builder';

/**
 * The versions serving this form's public link right now — one, once the publish swap and
 * `UQ_FormVersion_OnePublishedPerForm` have both been through a database.
 *
 * One predicate, one place: the publish swap has to retire exactly the rows the fingerprint
 * baseline reads, and two copies of the same `WHERE` is how those two answers drift apart.
 */
function liveVersionsFilter(formId: string): string {
  return `FormID=${quoteSqlString(formId)} AND Status='Published'`;
}

/**
 * Why a save failed, as a message worth showing an author. Never empty.
 *
 * `swapLiveVersion` reports its outcome by returning a message or null, so an empty
 * `CompleteMessage` would read as success — a rolled-back swap silently reporting a publish that
 * wrote nothing. `??` does not cover that: an empty string is neither null nor undefined.
 */
function saveFailureMessage(entity: BaseEntity): string {
  return entity.LatestResult?.CompleteMessage || 'unknown error';
}

/** Outcome of a publish attempt. */
export interface PublishResult {
  success: boolean;
  /**
   * The version row as written — for reading, not for saving. It is still attached to the
   * transaction group that wrote it, and MJ QUEUES a save on a bound entity instead of executing
   * it, so a `Save()` here would return true and write nothing. Re-load the row to mutate it.
   */
  version?: mjBizAppsFormsFormVersionEntity;
  versionNumber?: number;
  error?: string;
  /**
   * The broken rules this publish was refused over — absent unless that is why it was refused.
   *
   * Carried so the refusal can be RETRACTED. `error` is a sentence; this is the fact behind it,
   * and the distinction matters to whoever displays it: a refusal about rules stops being true
   * the moment the author fixes them, whereas "could not read the form's settings" is not
   * something editing a question says anything about. A caller that could not tell the two apart
   * would either strand the first on screen after it became false, or drop the second for a
   * reason that has nothing to do with it.
   *
   * Absent rather than empty on every other refusal: "no rule is broken" and "this refusal was
   * never about rules" are different answers, and `[]` reads as the first.
   */
  brokenRules?: readonly string[];
}

/**
 * How many broken rules a refusal names before it stops listing them.
 *
 * The message lands in one line of the toolbar's status text, so an uncapped list on a form with
 * thirty broken rules is a paragraph nobody reads — and the count, which is the part that says
 * how much work is waiting, would be buried in it. Three is enough to recognise the problem; the
 * canvas badges carry every one of them against the item it is about, which is where an author
 * goes to fix them anyway.
 */
const MAX_NAMED_BROKEN_RULES = 3;

/** Why the publish was refused, and which rules to go and fix. */
function brokenRuleRefusal(broken: readonly string[]): string {
  const named = broken.slice(0, MAX_NAMED_BROKEN_RULES);
  const unnamed = broken.length - named.length;
  const one = broken.length === 1;
  const count = one ? '1 broken rule' : `${broken.length} broken rules`;
  const rest = unnamed > 0 ? ` (and ${unnamed} more)` : '';
  return (
    `Publish refused — ${count} would ship with this form. ` +
    `${one ? 'Fix it' : 'Fix them'} and publish again: ${named.join('; ')}${rest}.`
  );
}

/**
 * Snapshots the current builder tree into an immutable {@link PublishedFormDefinition}
 * and writes it to a new {@link mjBizAppsFormsFormVersionEntity} (FORMS_BUILD_PLAN §5.1,
 * §9 builder task). This is the contract boundary the widget (WP-C) and submit endpoint
 * (WP-B) read back from `FormVersion.DefinitionSnapshot`.
 *
 * Publish steps:
 *  1. Build the PublishedFormDefinition from the live tree + the linked FormStyle.
 *  2. In ONE transaction: retire whichever version is Published now, and create the replacement
 *     FormVersion (VersionNumber = max+1, Status Published, PublishedAt now,
 *     DefinitionSnapshot = the JSON).
 *  3. Flip the Form's Status to Published.
 */
@Injectable()
export class PublishService {
  private readonly md = new Metadata();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /** Publish the tree as a new immutable version. */
  public async publish(tree: FormTree): Promise<PublishResult> {
    // Before anything is read or written: a form whose rules the builder is already flagging as
    // broken does not go live (issue #79). A dangling condition reads `undefined` at runtime, so
    // the item it guards is pinned shut — or pinned open — for every respondent, and the form
    // silently collects one fewer answer than its author believes it does.
    //
    // EVERY breakage `collectRuleEntries` reports, deliberately — not just the two shapes the
    // issue named. The badge on the canvas and this refusal have to be one decision or they will
    // drift, and an author looking at "Rule is broken" while Publish says the form is fine has
    // been told two things, one of which is a lie. The cost is real and accepted: a form that
    // published yesterday carrying, say, a screened-out ending nothing routes to is refused
    // today, and there is no publish-anyway. That is the point — a confirmation an author clicks
    // through ships exactly the snapshot this issue is about.
    const broken = brokenRuleLines(tree);
    if (broken.length > 0) {
      const error = brokenRuleRefusal(broken);
      // A status, not an error: nothing failed. The author's form is not ready, they are being
      // told which rules and why, and the failure result carries the same words back to them.
      LogStatus(`Forms publish: refused form ${tree.form.ID} — ${error}`);
      return { success: false, error, brokenRules: broken };
    }
    const style = await this.loadStyle(tree.form.StyleID);
    const automations = await this.loadAutomations(tree.form.ID);
    const settings = await this.loadStoredSettings(tree.form.ID);
    if (settings === null) {
      const error = 'Could not read the form\'s settings; nothing was published.';
      LogError(`Forms publish: ${error}`);
      return { success: false, error };
    }
    if (!automations) {
      // Publishing a snapshot with no automations when the form HAS automations would disable
      // every one of them silently, and the author's only signal would be side effects that stop
      // happening. Refusing the publish keeps the previous version — and its automations — live.
      const error = 'Could not read the form\'s automations; nothing was published.';
      LogError(`Forms publish: ${error}`);
      return { success: false, error };
    }
    const nextVersion = (await this.maxVersionNumber(tree.form.ID)) + 1;
    const incumbents = await this.loadPublishedVersions(tree.form.ID);
    if (!incumbents) {
      // Same reasoning as the automations and settings reads: we do not know what is live, so we
      // cannot retire it. Publishing anyway would either resurrect the several-live-versions bug
      // or — once UQ_FormVersion_OnePublishedPerForm exists — fail at the index with a message
      // about a constraint the author has never heard of.
      const error = 'Could not read the form\'s live version; nothing was published.';
      LogError(`Forms publish: ${error}`);
      return { success: false, error };
    }

    const version = await this.md.GetEntityObject<mjBizAppsFormsFormVersionEntity>(
      FORMS_ENTITY.FormVersion,
      this.user,
    );
    version.NewRecord();
    version.FormID = tree.form.ID;
    version.VersionNumber = nextVersion;
    version.Status = 'Published';
    version.PublishedAt = new Date();

    // MJ mints the uniqueidentifier PK client-side on NewRecord(), so the snapshot can
    // embed its own version id and be written by the SAME insert that creates the row (no broken
    // half-published row needing a follow-up save to complete it). An unpopulated PK leaves
    // formVersionId empty, which the reconcile below then fills in from the row the server wrote.
    const versionId = version.ID && version.ID.length > 0 ? version.ID : '';
    const definition = buildPublishedDefinition(tree, style, versionId, automations, undefined, settings);
    version.DefinitionSnapshot = JSON.stringify(definition);
    const swapError = await this.swapLiveVersion(incumbents, version);
    if (swapError) {
      // The whole swap rolled back, so say so. MJ reports a rolled-back group as a bare
      // "Transaction failed" on every member, which on its own reads to an author as though the
      // form might be in some indeterminate half-published state. It is not: the previous version
      // is still live and still serving.
      const error = `Nothing was published; the form is still serving its previous version. ${swapError}`;
      LogError(`Forms publish: failed to publish version ${nextVersion}: ${swapError}`);
      return { success: false, error };
    }

    // Reconcile if the server assigned a different ID than the client-minted one
    // (defensive: only re-saves when they actually diverge, so the common path is one save).
    // It needs a transaction group of its own: `version` is still bound to the one that just
    // committed, and MJ QUEUES a save on a bound entity rather than executing it — so re-saving
    // through the spent group would return true and write nothing, leaving the published snapshot
    // pointing at an id no row has.
    if (version.ID !== versionId) {
      definition.formVersionId = version.ID;
      version.DefinitionSnapshot = JSON.stringify(definition);
      const reconcile = await this.md.CreateTransactionGroup();
      version.TransactionGroup = reconcile;
      if (!(await version.Save()) || !(await reconcile.Submit())) {
        // The swap has already committed and cannot be undone from here, so this reports the same
        // way the form-status failure below does: the version IS live, and what failed is a
        // follow-up write. Saying "nothing was published" would be a lie that invites a republish,
        // which would mint yet another version over a form that already went live.
        LogError(`Forms publish: failed to reconcile snapshot id: ${saveFailureMessage(version)}`);
        return {
          success: false,
          version,
          versionNumber: nextVersion,
          error: 'Version published, but its snapshot could not be corrected. Publish again to replace it.',
        };
      }
    }

    if (!(await this.markFormPublished(tree.form))) {
      // Version is published; surface the form-status failure but don't roll back.
      return {
        success: false,
        version,
        versionNumber: nextVersion,
        error: 'Version published, but updating form status failed.',
      };
    }

    return { success: true, version, versionNumber: nextVersion };
  }

  /**
   * Retire the form's live version and publish `version` in its place, as ONE transaction.
   * Returns null when it committed, or the message to surface to the author.
   *
   * The order is load-bearing. `UQ_FormVersion_OnePublishedPerForm` makes "at most one Published
   * version per form" a property of the data rather than something each reader must remember with
   * an `ORDER BY VersionNumber DESC`, so the incumbent has to be demoted BEFORE the replacement
   * lands. That ordering is also why this is a transaction and not two saves: a retire that
   * committed on its own, followed by an insert that failed, would leave the form with no live
   * version at all and its public link answering `no-published-version`.
   *
   * A queued save returns true because the group defers it; only Submit() reports what the
   * database did. A save that returns FALSE was rejected before it joined the group, so the group
   * is abandoned unsubmitted and nothing is written — never half a swap. The atomicity claimed
   * here is the swap's, not the whole publish's: the snapshot-id reconcile and the form-status
   * flip are separate writes that run after this has already committed, and both report as such.
   */
  private async swapLiveVersion(
    incumbents: mjBizAppsFormsFormVersionEntity[],
    version: mjBizAppsFormsFormVersionEntity,
  ): Promise<string | null> {
    const swap = await this.md.CreateTransactionGroup();
    for (const incumbent of incumbents) {
      incumbent.Status = 'Retired';
      incumbent.TransactionGroup = swap;
      if (!(await incumbent.Save())) {
        return saveFailureMessage(incumbent);
      }
    }
    version.TransactionGroup = swap;
    if (!(await version.Save()) || !(await swap.Submit())) {
      return saveFailureMessage(version);
    }
    return null;
  }

  /**
   * The versions this publish must retire, or null when the read itself failed.
   *
   * Plural because the data has been able to hold several since the beginning — a form on the dev
   * database carried three simultaneously-Published versions — so a publish run against a database
   * that predates the backfill migration has to demote all of them, not just the newest.
   *
   * Null and empty are different, as they are for {@link loadAutomations}: empty means this form
   * has never been published, which is the normal first publish; null means we do not know what is
   * live, and {@link publish} refuses rather than guessing.
   */
  private async loadPublishedVersions(
    formId: string,
  ): Promise<mjBizAppsFormsFormVersionEntity[] | null> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormVersionEntity>(
      {
        EntityName: FORMS_ENTITY.FormVersion,
        ExtraFilter: liveVersionsFilter(formId),
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(
        `Forms publish: could not read the live versions of form ${formId}: ${result.ErrorMessage}`,
      );
      return null;
    }
    return result.Results ?? [];
  }

  private async loadStyle(
    styleId: string | null,
  ): Promise<mjBizAppsFormsFormStyleEntity | undefined> {
    if (!styleId) {
      return undefined;
    }
    const style = await this.md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
      FORMS_ENTITY.FormStyle,
      this.user,
    );
    if (!(await style.Load(styleId))) {
      LogError(`Forms publish: could not load FormStyle ${styleId}`);
      return undefined;
    }
    return style;
  }

  /**
   * Read the form's authored automations, or null when the read itself failed.
   *
   * Public because the BUILDER needs the same list publish uses: automations are part of the
   * published snapshot, so they are part of the draft the publish fingerprint compares. Reading
   * them through the same method is what keeps the "is there anything to publish?" answer and the
   * thing publish actually writes from drifting apart.
   *
   * Null and empty are deliberately different. Empty means "this form configures no automations",
   * which is a normal, publishable state that keeps the form on the legacy hook list. Null means
   * we do not know — and publishing an empty array on a failed read would silently disable
   * automations the form actually has, for every response until someone republished.
   */
  /**
   * Read `Form.Settings` from the database, or null when the read itself failed.
   *
   * NOT from `tree.form`. The builder loads its tree once and never refreshes it, while the
   * Automate tab writes settings through its own Form entity and has no output to announce it —
   * so an author who removed every automation and published without leaving the builder
   * snapshotted the settings as they were when the builder OPENED. The mode that removal had just
   * written was absent, the snapshot inferred `legacy`, and all four built-in hooks came back.
   *
   * Null means "we do not know" and refuses the publish, exactly as {@link loadAutomations} does.
   * Publishing settings we could not confirm is how a form silently loses its declared mode.
   */
  private async loadStoredSettings(formId: string): Promise<FormSettings | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ Settings: string | null }>(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `ID='${formId}'`,
        Fields: ['Settings'],
        ResultType: 'simple',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Forms publish: could not load settings for form ${formId}: ${result.ErrorMessage}`);
      return null;
    }
    // A read that SUCCEEDS and returns nothing is still "we do not know", not "this form has no
    // settings". The form demonstrably exists — its automations were read a moment ago and a
    // version row is about to be written against it — so an empty result is an anomaly, and
    // publishing the defaults in its place is a silent downgrade well beyond the on-submit mode:
    // `parseFormSettings(null)` yields anonymousAllowed=true and captchaRequired=false and drops
    // quota, opensAt, closesAt, confirmationMessage and redirectUrl. A private, captcha-gated,
    // capped form would publish as open, ungated and uncapped.
    //
    // A NULL `Settings` column on a row that IS returned is different, and genuinely means "never
    // written": that keeps the documented defaults.
    const row = result.Results?.[0];
    if (!row) {
      LogError(`Forms publish: form ${formId} returned no row when reading its settings; nothing was published.`);
      return null;
    }
    return parseFormSettings(row.Settings);
  }

  public async loadAutomations(formId: string): Promise<PublishedFormAutomation[] | null> {
    const rv = new RunView();
    const result = await rv.RunView<AuthoredAutomationRow>(
      {
        EntityName: FORMS_ENTITY.FormAutomation,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'DisplayOrder ASC',
        Fields: [...AUTHORED_AUTOMATION_FIELDS],
        ResultType: 'simple',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Forms publish: could not load automations for form ${formId}: ${result.ErrorMessage}`);
      return null;
    }
    return buildPublishedAutomations(result.Results ?? []);
  }

  /**
   * The snapshot currently serving the public link, or null when there is not one to read.
   *
   * The builder compares this against the draft to decide whether there is anything to
   * publish — see `publish-fingerprint.ts` for why that is a comparison and not a flag.
   *
   * Null does NOT mean "nothing is published". It means no baseline was obtained, which covers a
   * form that has never been published AND a read that failed, and the caller cannot tell them
   * apart. That is deliberate but it is also a trap: treating null as "up to date" is what made
   * the builder show a static "Published" badge, with no publish control, over a draft full of
   * edits that were never going live. `publishControlState` is where that is handled — anything
   * else consuming this must fail in the same direction.
   */
  public async latestPublishedSnapshot(formId: string): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ DefinitionSnapshot: string | null }>({
      EntityName: FORMS_ENTITY.FormVersion,
      ExtraFilter: liveVersionsFilter(formId),
      OrderBy: 'VersionNumber DESC',
      Fields: ['DefinitionSnapshot'],
      MaxRows: 1,
      ResultType: 'simple',
    });
    if (!result.Success) {
      LogError(
        `Forms publish: could not read the published snapshot for form ${formId}: ${result.ErrorMessage}`,
      );
      return null;
    }
    return result.Results?.[0]?.DefinitionSnapshot ?? null;
  }

  private async maxVersionNumber(formId: string): Promise<number> {
    const rv = new RunView();
    const result = await rv.RunView<{ VersionNumber: number }>(
      {
        EntityName: FORMS_ENTITY.FormVersion,
        ExtraFilter: `FormID='${formId}'`,
        OrderBy: 'VersionNumber DESC',
        Fields: ['VersionNumber'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      this.user,
    );
    if (!result.Success || !result.Results || result.Results.length === 0) {
      return 0;
    }
    return result.Results[0].VersionNumber ?? 0;
  }

  private async markFormPublished(form: mjBizAppsFormsFormEntity): Promise<boolean> {
    if (form.Status === 'Published') {
      return true;
    }
    form.Status = 'Published';
    const ok = await form.Save();
    if (!ok) {
      LogError(`Forms publish: failed to set form status: ${form.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    return ok;
  }
}
