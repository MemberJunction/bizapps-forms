import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from './entity-names';
import { withBrandToken, withRadiusPx } from './style-tokens';

/** A field the theme editor can persist onto a style. */
export interface BrandEdit {
  name?: string;
  logoURL?: string;
  /** Token name → value (color / font stack); applied via {@link withBrandToken}. */
  tokens?: Record<string, string>;
  /** Corner radius in px, applied across the four radius tokens via {@link withRadiusPx}. */
  radiusPx?: number;
}

/** Result of loading the theme presets — lets the panel show a load error vs. genuinely empty. */
export interface StyleLoadResult {
  success: boolean;
  styles: mjBizAppsFormsFormStyleEntity[];
  error?: string;
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

  /**
   * Load the selectable theme presets (active, `DisplayRank > 0`) lowest-rank first, PLUS
   * the form's currently-assigned style if it isn't a preset (per-form clones are saved at
   * `DisplayRank = 0` so they don't clutter the gallery — see {@link duplicateStyle}). The
   * result distinguishes a load failure from a genuinely empty gallery.
   */
  public async loadStyles(assignedStyleId?: string | null): Promise<StyleLoadResult> {
    const gallery = 'IsActive = 1 AND DisplayRank > 0';
    const filter = assignedStyleId ? `(${gallery}) OR ID='${assignedStyleId}'` : gallery;
    try {
      const rv = new RunView();
      const result = await rv.RunView<mjBizAppsFormsFormStyleEntity>(
        {
          EntityName: FORMS_ENTITY.FormStyle,
          ExtraFilter: filter,
          OrderBy: 'DisplayRank, Name',
          ResultType: 'entity_object',
        },
        this.user,
      );
      if (!result.Success) {
        LogError(`Failed to load form styles (filter: ${filter}): ${result.ErrorMessage}`);
        return { success: false, styles: [], error: result.ErrorMessage ?? 'Unknown error loading themes.' };
      }
      return { success: true, styles: result.Results ?? [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`Exception loading form styles (filter: ${filter}): ${message}`);
      return { success: false, styles: [], error: message };
    }
  }

  /** Load a single style by id (e.g. a form's assigned style, for previewing). */
  public async loadStyleById(styleId: string): Promise<mjBizAppsFormsFormStyleEntity | null> {
    const style = await this.md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
      FORMS_ENTITY.FormStyle,
      this.user,
    );
    return (await style.Load(styleId)) ? style : null;
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
    // DisplayRank 0 = a per-form custom style: kept out of the shared preset gallery
    // (loadStyles shows rank > 0), surfaced only as the form's assigned style.
    copy.DisplayRank = 0;
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
    if (edit.radiusPx !== undefined) {
      style.CSSVariables = withRadiusPx(style.CSSVariables, edit.radiusPx);
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
