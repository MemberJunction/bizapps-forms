import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import {
  AUTHORED_AUTOMATION_FIELDS,
  buildPublishedAutomations,
  type AuthoredAutomationRow,
  type mjBizAppsFormsFormEntity,
  type mjBizAppsFormsFormStyleEntity,
  type mjBizAppsFormsFormVersionEntity,
  type PublishedFormAutomation,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
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
    const definition = buildPublishedDefinition(tree, style, versionId, automations);
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
   * Null and empty are deliberately different. Empty means "this form configures no automations",
   * which is a normal, publishable state that keeps the form on the legacy hook list. Null means
   * we do not know — and publishing an empty array on a failed read would silently disable
   * automations the form actually has, for every response until someone republished.
   */
  private async loadAutomations(formId: string): Promise<PublishedFormAutomation[] | null> {
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
   * The snapshot currently serving the public link, or null when nothing is published.
   *
   * The builder compares this against the draft to decide whether there is anything to
   * publish — see `publish-fingerprint.ts` for why that is a comparison and not a flag.
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
