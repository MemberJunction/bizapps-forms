import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import { withBrandToken } from './style-tokens';

/** A field the branding-basics editor can persist onto a style. */
export interface BrandEdit {
  name?: string;
  logoURL?: string;
  /** Token name → color value; applied via {@link withBrandToken}. */
  tokens?: Record<string, string>;
}

/**
 * Loads the selectable {@link mjBizAppsFormsFormStyleEntity} presets, applies a style
 * to a form (sets `Form.StyleID`), duplicates a preset for safe editing, and persists
 * branding-basics edits — all through generated MJ entity types (never `.Get()/.Set()`),
 * every read `.Success`-checked and every `Save()` boolean-checked (CLAUDE.md).
 *
 * Instantiated per Design panel; owns no global state.
 */
@Injectable()
export class DesignStateService {
  private readonly md = new Metadata();

  private get user(): UserInfo {
    return this.md.CurrentUser;
  }

  /** Load all active styles, lowest DisplayRank first (the style-picker order). */
  public async loadStyles(): Promise<mjBizAppsFormsFormStyleEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<mjBizAppsFormsFormStyleEntity>(
      {
        EntityName: FORMS_ENTITY.FormStyle,
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'DisplayRank, Name',
        ResultType: 'entity_object',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(`Failed to load form styles: ${result.ErrorMessage}`);
      return [];
    }
    return result.Results ?? [];
  }

  /** Point a form at a style (or clear it). Persists `Form.StyleID`. */
  public async applyStyleToForm(
    form: mjBizAppsFormsFormEntity,
    styleId: string | null,
  ): Promise<boolean> {
    form.StyleID = styleId;
    return this.saveChecked(form, 'apply style to form');
  }

  /**
   * Duplicate a preset into a new, editable style (so shared presets stay pristine),
   * copying every branding column. Returns the saved copy or undefined on failure.
   */
  public async duplicateStyle(
    source: mjBizAppsFormsFormStyleEntity,
  ): Promise<mjBizAppsFormsFormStyleEntity | undefined> {
    const copy = await this.md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
      FORMS_ENTITY.FormStyle,
      this.user,
    );
    copy.NewRecord();
    copy.Name = `${source.Name} (copy)`;
    copy.Description = source.Description;
    copy.CSSVariables = source.CSSVariables;
    copy.CustomCSS = source.CustomCSS;
    copy.LogoURL = source.LogoURL;
    copy.DisplayRank = source.DisplayRank + 1;
    copy.IsActive = true;
    if (!(await this.saveChecked(copy, 'duplicate style'))) {
      return undefined;
    }
    return copy;
  }

  /** Persist branding-basics edits (name, logo, brand tokens) onto a style. */
  public async saveBranding(
    style: mjBizAppsFormsFormStyleEntity,
    edit: BrandEdit,
  ): Promise<boolean> {
    if (edit.name !== undefined) {
      style.Name = edit.name;
    }
    if (edit.logoURL !== undefined) {
      style.LogoURL = edit.logoURL.trim() || null;
    }
    for (const [token, value] of Object.entries(edit.tokens ?? {})) {
      style.CSSVariables = withBrandToken(style.CSSVariables, token, value);
    }
    return this.saveChecked(style, 'save branding');
  }

  private async saveChecked(
    entity: mjBizAppsFormsFormEntity | mjBizAppsFormsFormStyleEntity,
    action: string,
  ): Promise<boolean> {
    const ok = await entity.Save();
    if (!ok) {
      LogError(
        `Forms design panel failed to ${action}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
    return ok;
  }
}
