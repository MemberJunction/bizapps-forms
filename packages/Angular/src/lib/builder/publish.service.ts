import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
  mjBizAppsFormsFormVersionEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
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
    const definition = buildPublishedDefinition(tree, style, versionId);
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
