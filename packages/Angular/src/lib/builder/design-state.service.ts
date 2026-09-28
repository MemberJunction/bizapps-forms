import { Injectable } from '@angular/core';
import { Metadata, RunView, LogError, type UserInfo } from '@memberjunction/core';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../shared/entity-names';
import { serializeCssVariables, withBrandToken, withButtonRadiusPx } from './style-tokens';

/** A field the theme editor can persist onto a style. */
export interface BrandEdit {
  name?: string;
  logoURL?: string;
  /** Token name → value (color / font stack); applied via {@link withBrandToken}. */
  tokens?: Record<string, string>;
  /** Button corner radius in px, applied via {@link withButtonRadiusPx}. Buttons only. */
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
    name: string = uniqueStyleName(`${source.Name} (copy)`),
  ): Promise<mjBizAppsFormsFormStyleEntity | undefined> {
    const copy = await this.md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
      FORMS_ENTITY.FormStyle,
      this.user,
    );
    copy.NewRecord();
    copy.Name = name;
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

  /**
   * The style this form may safely be edited through, creating one if needed.
   *
   * The Design tab edits tokens directly now, with no preset gallery in between, so it must
   * never write to a style another form is also using — one author restyling their form
   * would silently restyle everyone else's. `DisplayRank = 0` marks a style MEANT for a single
   * form (`duplicateStyle` sets it, and `loadStyles` hides rank-0 rows from the gallery), but the
   * marker alone does not make it so: a template clone copies `StyleID` verbatim, leaving the
   * original, the template and every form made from it on one rank-0 row. So a rank-0 style is
   * edited in place only when no other form points at it. Anything else — a shared preset, a
   * rank-0 style another form also uses, or no style at all — is forked first.
   */
  public async ensureOwnStyle(
    form: mjBizAppsFormsFormEntity,
  ): Promise<mjBizAppsFormsFormStyleEntity | undefined> {
    if (form.StyleID) {
      const current = await this.loadStyleById(form.StyleID);
      if (current && current.DisplayRank === 0 && (await this.isUsedOnlyBy(current.ID, form.ID))) {
        return current;
      }
      if (current) {
        const fork = await this.duplicateStyle(current, uniqueStyleName(`${form.Name} theme`));
        if (!fork) {
          return undefined;
        }
        return (await this.applyStyleToForm(form, fork.ID)) ? fork : undefined;
      }
    }

    const created = await this.md.GetEntityObject<mjBizAppsFormsFormStyleEntity>(
      FORMS_ENTITY.FormStyle,
      this.user,
    );
    created.NewRecord();
    created.Name = uniqueStyleName(`${form.Name} theme`);
    created.Description = 'Design for this form.';
    created.CSSVariables = serializeCssVariables({});
    created.DisplayRank = 0;
    created.IsActive = true;
    if (!(await this.saveChecked(created, 'create the form style'))) {
      return undefined;
    }
    return (await this.applyStyleToForm(form, created.ID)) ? created : undefined;
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
      style.CSSVariables = withButtonRadiusPx(style.CSSVariables, edit.radiusPx);
    }
    return this.saveChecked(style, 'save branding');
  }

  /**
   * Whether no form other than `formId` points at `styleId` — the one fact `DisplayRank` cannot
   * tell us. A failed read is not a "no": it answers `false`, so the caller forks, which costs a
   * spare style row, rather than edits a row that may be restyling someone else's form.
   */
  private async isUsedOnlyBy(styleId: string, formId: string): Promise<boolean> {
    const result = await new RunView().RunView<{ ID: string }>(
      {
        EntityName: FORMS_ENTITY.Form,
        ExtraFilter: `StyleID='${styleId}' AND ID<>'${formId}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      this.user,
    );
    if (!result.Success) {
      LogError(
        `Forms design panel could not check whether style ${styleId} is shared before editing it for ` +
          `form ${formId}; forking it instead: ${result.ErrorMessage}`,
      );
      return false;
    }
    return result.Results.length === 0;
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

/** `FormStyle.Name` is `NVARCHAR(255)`; MJ's `BaseEntity.Validate` refuses anything longer. */
const STYLE_NAME_MAX_LENGTH = 255;

/**
 * A style name no other row already holds. `FormStyle.Name` is UNIQUE and a form's name is not —
 * every new form starts as "Untitled form" — so a name derived from the form alone made the second
 * same-named form's Design tab fail to load. The suffix is random rather than the form's id because
 * one form can fork more than once (its style later shared by a clone), and a per-form style's name
 * is shown only in raw record views, never in the Design tab. The base is shortened to keep the
 * whole name inside the column: `Form.Name` may itself be 255 characters, and a name that does not
 * fit fails the save exactly as a duplicate does.
 */
function uniqueStyleName(base: string): string {
  const suffix = ` (${crypto.randomUUID().slice(0, 8)})`;
  return `${base.slice(0, STYLE_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
}
