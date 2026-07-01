import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  FormStyleTokens,
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
// Import directly from the widget source module (no cross-package re-export — CLAUDE.md rule 5).
import { applyStyleTokens } from '../widget/core/theming';
import { DesignStateService } from './design-state.service';
import { BRAND_TOKENS, FONT_OPTIONS, readBrandToken, readRadiusPx, toStyleTokens } from './style-tokens';
import { BUILDER_CONTROL_STYLES } from './builder-styles';
import { DESIGN_PANEL_STYLES } from './design-panel.styles';

/**
 * The builder "Design" panel (FORMS_BUILD_PLAN §9 polish). Lets the author:
 *   1. pick which existing {@link mjBizAppsFormsFormStyleEntity} applies to the form
 *      (sets `Form.StyleID`),
 *   2. see a LIVE token preview and edit an expanded set of theme controls (colors,
 *      fonts, corner radius, logo) — all written into `FormStyle.CSSVariables`,
 *   3. open a full, fillable **Preview** of the real form via `previewRequested` (the
 *      parent builder owns the tree + modal).
 *
 * v1 scope: select a FormStyle + create/edit FormStyle rows with existing columns only.
 * Per-form (not per-style) overrides would need new `Form` columns — deferred.
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
  // OnPush: async mutations (after await) must markForCheck or the view never updates.
  private readonly cdr = inject(ChangeDetectorRef);

  /** The form being styled (StyleID is written here). */
  @Input({ required: true }) form!: mjBizAppsFormsFormEntity;

  /** Emitted after the form's StyleID changes so the parent can persist/refresh. */
  @Output() readonly styleApplied = new EventEmitter<string | null>();

  /** Emitted with the current (edited) theme tokens so the parent opens the fill-it preview. */
  @Output() readonly previewRequested = new EventEmitter<FormStyleTokens>();

  @ViewChild('previewHost') private previewHost?: ElementRef<HTMLElement>;

  protected readonly fontOptions = FONT_OPTIONS;

  protected styles: mjBizAppsFormsFormStyleEntity[] = [];
  protected selected: mjBizAppsFormsFormStyleEntity | null = null;
  protected busy = false;
  protected loadError = '';
  protected status = '';

  /** Theme-editor working values (bound to inputs; committed on save). */
  protected brandName = '';
  protected brandLogo = '';
  protected brandPrimary = '';
  protected brandAccent = '';
  protected brandPageBg = '';
  protected brandCardBg = '';
  protected fontBody = '';
  protected fontDisplay = '';
  protected radiusPx = 12;

  public async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** (Re)load the theme presets + the form's assigned style; surfaces load failures. */
  protected async reload(): Promise<void> {
    this.busy = true;
    this.loadError = '';
    const result = await this.design.loadStyles(this.form.StyleID);
    this.busy = false;
    if (!result.success) {
      this.loadError = result.error ?? 'Could not load themes.';
      this.cdr.markForCheck();
      return;
    }
    this.styles = result.styles;
    this.selected = this.styles.find((s) => s.ID === this.form.StyleID) ?? this.styles[0] ?? null;
    this.syncBrandFields();
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
  }

  /** Ask the parent builder to open the full, fillable preview with the current theme. */
  protected requestPreview(): void {
    this.previewRequested.emit(this.buildPreviewTokens());
  }

  // -- theme edit -----------------------------------------------------------

  private syncBrandFields(): void {
    this.brandName = this.selected?.Name ?? '';
    this.brandLogo = this.selected?.LogoURL ?? '';
    const css = this.selected?.CSSVariables ?? null;
    this.brandPrimary = readBrandToken(css, BRAND_TOKENS.primary);
    this.brandAccent = readBrandToken(css, BRAND_TOKENS.primaryStrong);
    this.brandPageBg = readBrandToken(css, BRAND_TOKENS.pageBg);
    this.brandCardBg = readBrandToken(css, BRAND_TOKENS.cardBg);
    this.fontBody = readBrandToken(css, BRAND_TOKENS.fontBody);
    this.fontDisplay = readBrandToken(css, BRAND_TOKENS.fontDisplay);
    this.radiusPx = readRadiusPx(css) || 12;
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
      this.cdr.markForCheck();
      this.applyPreview();
    } else {
      this.status = 'Could not duplicate the style — see logs.';
      this.cdr.markForCheck();
    }
  }

  /** Live-preview the in-progress edits without saving. */
  protected onBrandInput(): void {
    this.applyPreview();
  }

  /** Persist theme edits onto the (ideally duplicated) style. */
  protected async saveBranding(): Promise<void> {
    if (!this.selected || this.busy) {
      return;
    }
    this.busy = true;
    const ok = await this.design.saveBranding(this.selected, {
      name: this.brandName,
      logoURL: this.brandLogo,
      tokens: this.editedTokenMap(),
      radiusPx: this.radiusPx,
    });
    this.busy = false;
    this.status = ok ? 'Theme saved.' : 'Could not save theme — see logs.';
    this.cdr.markForCheck();
    this.applyPreview();
  }

  /** The non-radius token edits, keyed by token name (blank values clear the token). */
  private editedTokenMap(): Record<string, string> {
    return {
      [BRAND_TOKENS.primary]: this.brandPrimary,
      [BRAND_TOKENS.primaryStrong]: this.brandAccent,
      [BRAND_TOKENS.pageBg]: this.brandPageBg,
      [BRAND_TOKENS.cardBg]: this.brandCardBg,
      [BRAND_TOKENS.fontBody]: this.fontBody,
      [BRAND_TOKENS.fontDisplay]: this.fontDisplay,
    };
  }

  // -- preview --------------------------------------------------------------

  /** Build the runtime tokens for the selected style with unsaved edits layered on. */
  private buildPreviewTokens(): FormStyleTokens {
    const tokens = this.selected ? toStyleTokens(this.selected) : { cssVariables: {} };
    for (const [token, value] of Object.entries(this.editedTokenMap())) {
      if (value.trim()) {
        tokens.cssVariables[token] = value.trim();
      }
    }
    for (const radiusToken of ['--mjf-card-radius', '--mjf-input-radius', '--mjf-choice-radius', '--mjf-btn-radius']) {
      tokens.cssVariables[radiusToken] = `${this.radiusPx}px`;
    }
    tokens.logoURL = this.brandLogo.trim() || tokens.logoURL;
    return tokens;
  }

  /** Apply the current theme (with unsaved edits) to the inline sample via the widget's applier. */
  private applyPreview(): void {
    const host = this.previewHost?.nativeElement;
    if (!host || !this.selected) {
      return;
    }
    applyStyleTokens(host, this.buildPreviewTokens());
  }
}
