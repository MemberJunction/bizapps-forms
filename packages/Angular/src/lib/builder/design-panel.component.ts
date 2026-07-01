import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
// Import directly from the widget source module (no cross-package re-export — CLAUDE.md rule 5).
import { applyStyleTokens } from '../widget/core/theming';
import { DesignStateService } from './design-state.service';
import { BRAND_TOKENS, readBrandToken, toStyleTokens } from './style-tokens';
import { BUILDER_CONTROL_STYLES } from './builder-styles';
import { DESIGN_PANEL_STYLES } from './design-panel.styles';

/**
 * The builder "Design" panel (FORMS_BUILD_PLAN §9 polish). Lets the author:
 *   1. pick which existing {@link mjBizAppsFormsFormStyleEntity} applies to the form
 *      (sets `Form.StyleID`),
 *   2. see a LIVE PREVIEW of a sample form with the selected style's tokens applied
 *      (reusing {@link applyStyleTokens} — the same code path the published widget uses),
 *   3. edit a style's branding basics (name, primary/accent color, logo), preferring a
 *      "duplicate this preset then edit" flow so shared presets aren't mutated.
 *
 * v1 scope: select a FormStyle + create/edit FormStyle rows with existing columns only.
 * Per-form (not per-style) overrides would need new `Form` columns — deferred, not done.
 */
@Component({
  selector: 'mjf-design-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  providers: [DesignStateService],
  templateUrl: './design-panel.component.html',
  styles: [BUILDER_CONTROL_STYLES, DESIGN_PANEL_STYLES],
})
export class DesignPanelComponent {
  private readonly design = inject(DesignStateService);

  /** The form being styled (StyleID is written here). */
  @Input({ required: true }) form!: mjBizAppsFormsFormEntity;

  /** Emitted after the form's StyleID changes so the parent can persist/refresh. */
  @Output() readonly styleApplied = new EventEmitter<string | null>();

  @ViewChild('previewHost') private previewHost?: ElementRef<HTMLElement>;

  protected styles: mjBizAppsFormsFormStyleEntity[] = [];
  protected selected: mjBizAppsFormsFormStyleEntity | null = null;
  protected busy = false;
  protected status = '';

  /** Branding-editor working values (bound to inputs; committed on save). */
  protected brandName = '';
  protected brandLogo = '';
  protected brandPrimary = '';
  protected brandAccent = '';

  public async ngOnInit(): Promise<void> {
    this.busy = true;
    this.styles = await this.design.loadStyles();
    this.selected = this.styles.find((s) => s.ID === this.form.StyleID) ?? this.styles[0] ?? null;
    this.syncBrandFields();
    this.busy = false;
    this.applyPreview();
  }

  // -- selection ------------------------------------------------------------

  protected isSelected(style: mjBizAppsFormsFormStyleEntity): boolean {
    return this.selected?.ID === style.ID;
  }

  protected isApplied(style: mjBizAppsFormsFormStyleEntity): boolean {
    return this.form.StyleID === style.ID;
  }

  protected select(style: mjBizAppsFormsFormStyleEntity): void {
    this.selected = style;
    this.syncBrandFields();
    this.applyPreview();
  }

  /** Persist the selected style onto the form (`Form.StyleID`). */
  protected async applyToForm(): Promise<void> {
    if (!this.selected || this.busy) {
      return;
    }
    this.busy = true;
    const ok = await this.design.applyStyleToForm(this.form, this.selected.ID);
    this.busy = false;
    if (ok) {
      this.status = `Applied “${this.selected.Name}” to this form.`;
      this.styleApplied.emit(this.selected.ID);
    } else {
      this.status = 'Could not apply the style — see logs.';
    }
  }

  // -- branding edit --------------------------------------------------------

  private syncBrandFields(): void {
    this.brandName = this.selected?.Name ?? '';
    this.brandLogo = this.selected?.LogoURL ?? '';
    const css = this.selected?.CSSVariables ?? null;
    this.brandPrimary = readBrandToken(css, BRAND_TOKENS.primary);
    this.brandAccent = readBrandToken(css, BRAND_TOKENS.primaryStrong);
  }

  /** Duplicate the selected preset so edits don't touch the shared original. */
  protected async duplicateSelected(): Promise<void> {
    if (!this.selected || this.busy) {
      return;
    }
    this.busy = true;
    const copy = await this.design.duplicateStyle(this.selected);
    this.busy = false;
    if (copy) {
      this.styles = [...this.styles, copy];
      this.selected = copy;
      this.syncBrandFields();
      this.status = `Created an editable copy “${copy.Name}”.`;
      this.applyPreview();
    } else {
      this.status = 'Could not duplicate the style — see logs.';
    }
  }

  /** Live-preview the in-progress branding edits without saving. */
  protected onBrandInput(): void {
    this.applyPreview();
  }

  /** Persist branding-basics edits onto the (ideally duplicated) style. */
  protected async saveBranding(): Promise<void> {
    if (!this.selected || this.busy) {
      return;
    }
    this.busy = true;
    const ok = await this.design.saveBranding(this.selected, {
      name: this.brandName,
      logoURL: this.brandLogo,
      tokens: {
        [BRAND_TOKENS.primary]: this.brandPrimary,
        [BRAND_TOKENS.primaryStrong]: this.brandAccent,
      },
    });
    this.busy = false;
    this.status = ok ? 'Branding saved.' : 'Could not save branding — see logs.';
    this.applyPreview();
  }

  // -- live preview ---------------------------------------------------------

  /**
   * Apply the selected style's tokens (with any unsaved brand edits layered on) to the
   * preview host via {@link applyStyleTokens} — the identical code the widget runs, so
   * the preview is faithful.
   */
  private applyPreview(): void {
    const host = this.previewHost?.nativeElement;
    if (!host || !this.selected) {
      return;
    }
    const tokens = toStyleTokens(this.selected);
    if (this.brandPrimary.trim()) {
      tokens.cssVariables[BRAND_TOKENS.primary] = this.brandPrimary.trim();
    }
    if (this.brandAccent.trim()) {
      tokens.cssVariables[BRAND_TOKENS.primaryStrong] = this.brandAccent.trim();
    }
    tokens.logoURL = this.brandLogo.trim() || tokens.logoURL;
    applyStyleTokens(host, tokens);
  }
}
