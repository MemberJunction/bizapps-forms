import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import {
  AUTHORED_AUTOMATION_FIELDS,
  buildPublishedAutomations,
  type AuthoredAutomationRow,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormStyleEntity,
  type mjBizAppsFormsFormVersionEntity,
  type FormSettings,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { parseFormSettings } from './json-fields';
import type { FormTree } from './builder-models';
import { buildPublishedDefinition } from './snapshot-builder';

/** Outcome of a publish attempt. */
export interface PublishResult {
  success: boolean;
  version?: mjBizAppsFormsFormVersionEntity;
  versionNumber?: number;
  error?: string;
}

/**
 * Snapshots the current builder tree into an immutable {@link PublishedFormDefinition}
 * and writes it to a new {@link mjBizAppsFormsFormVersionEntity} (FORMS_BUILD_PLAN §5.1,
 * §9 builder task). This is the contract boundary the widget (WP-C) and submit endpoint
 * (WP-B) read back from `FormVersion.DefinitionSnapshot`.
 *
 * Publish steps:
 *  1. Build the PublishedFormDefinition from the live tree + the linked FormStyle.
 *  2. Create a FormVersion (VersionNumber = max+1, Status Published, PublishedAt now,
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
    // embed its own version id and be written in a SINGLE atomic save (no broken
    // half-published row if a second save were to fail). If the PK is not yet
    // populated, fall back to the form id reference so formVersionId is never blank.
    const versionId = version.ID && version.ID.length > 0 ? version.ID : '';
    const definition = buildPublishedDefinition(tree, style, versionId, automations, undefined, settings);
    version.DefinitionSnapshot = JSON.stringify(definition);
    if (!(await version.Save())) {
      const error = version.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`Forms publish: failed to create version: ${error}`);
      return { success: false, error };
    }

    // Reconcile if the server assigned a different ID than the client-minted one
    // (defensive: only re-saves when they actually diverge, so the common path is one save).
    if (version.ID !== versionId) {
      definition.formVersionId = version.ID;
      version.DefinitionSnapshot = JSON.stringify(definition);
      if (!(await version.Save())) {
        const error = version.LatestResult?.CompleteMessage ?? 'unknown error';
        LogError(`Forms publish: failed to reconcile snapshot id: ${error}`);
        return { success: false, error };
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
      ExtraFilter: `FormID='${formId}' AND Status='Published'`,
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
