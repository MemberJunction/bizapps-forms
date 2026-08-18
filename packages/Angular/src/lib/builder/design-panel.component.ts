import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  FormStyleTokens,
  PublishedFormDefinition,
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormStyleEntity,
} from '@mj-biz-apps/forms-entities';
// Import directly from the widget source modules (no cross-package re-export — CLAUDE.md rule 5).
import { applyStyleTokens } from '../widget/core/theming';
import { MjFormComponent } from '../widget/mj-form.component';
import { formsWidgetProviders } from '../widget/widget-providers';
import { normalizeApiConfig } from '../widget/api/forms-api.config';
import { DesignStateService } from './design-state.service';
import {
  BRAND_TOKENS,
  BUTTON_RADIUS_TOKEN,
  FONT_OPTIONS,
  RADIUS_STEPS,
  backgroundImageUrl,
  backgroundImageValue,
  readBrandToken,
  readButtonRadiusPx,
  cssColorToHex,
  toStyleTokens,
  typeAlignChoice,
  typeAlignValue,
  typeSizeScale,
  typeSizeValue,
  type TypeAlign,
  type TypeScale,
} from './style-tokens';
import { FORMS_UI_CSS } from '../shared';
import { DESIGN_PANEL_STYLES } from './design-panel.styles';

/**
 * The builder "Design" tab: edit this form's look directly, with a live preview beside it.
 *
 * There is no theme gallery. Picking from a list of presets made the common job — "make the
 * buttons our blue" — a three-step detour through choosing a preset, duplicating it so the
 * edit would not hit every other form, and only then editing. Authors design a form, not a
 * theme, so the controls edit the form's own style and `ensureOwnStyle` guarantees there is
 * one to edit (forking a shared preset on first touch rather than leaking the change).
 *
 * Every control writes a token the WIDGET honours — see the `--mjf-*` block in
 * `mj-form.component.css`. A control whose token nothing reads is a control that lies about
 * what publishing will do, so the two files are a matched pair.
 */
/** How long to wait after the last control change before writing to the database. */
const SAVE_DEBOUNCE_MS = 600;

@Component({
  selector: 'mjf-design-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MjFormComponent],
  // The sample IS the widget, so it needs the widget's providers. An empty graphqlUrl
  // selects the mock transport, which is what keeps a trial answer from writing anything.
  providers: [DesignStateService, ...formsWidgetProviders(normalizeApiConfig({ graphqlUrl: '' }))],
  templateUrl: './design-panel.component.html',
  styles: [FORMS_UI_CSS, DESIGN_PANEL_STYLES],
})
export class DesignPanelComponent implements AfterViewInit, OnDestroy {
  private readonly design = inject(DesignStateService);
  // OnPush: async mutations (after await) must markForCheck or the view never updates.
  private readonly cdr = inject(ChangeDetectorRef);

  /** The form being styled (StyleID is written here). */
  @Input({ required: true }) form!: mjBizAppsFormsFormEntity;

  /** Emitted after the form's StyleID changes so the parent can persist/refresh. */
  @Output() readonly styleApplied = new EventEmitter<string | null>();

  /**
   * The draft as a published-form definition, so the sample can be the REAL form.
   *
   * A hand-built mock of a couple of fake questions could not show what a theme does to
   * the form being designed — the author restyled a stand-in. The builder owns the tree, so
   * it builds this; the panel only re-themes it.
   */
  @Input() definition: PublishedFormDefinition | null = null;

  /** The `<mj-form>` element. Style tokens are set on it directly, the way the widget's
   *  own host is themed at load. */
  @ViewChild('previewHost', { read: ElementRef }) private previewHost?: ElementRef<HTMLElement>;

  /** Token names written to the sample last time, so a cleared one can be removed. */
  private appliedTokenNames: string[] = [];

  protected readonly fontOptions = FONT_OPTIONS;
  protected readonly radiusSteps = RADIUS_STEPS;
  protected readonly tabs = [
    { key: 'logo' as const, label: 'Logo' },
    { key: 'font' as const, label: 'Font' },
    { key: 'buttons' as const, label: 'Buttons' },
    { key: 'background' as const, label: 'Background' },
  ];
  protected readonly scales: ReadonlyArray<{ key: TypeScale; label: string }> = [
    { key: 'sm', label: 'Sm' },
    { key: 'md', label: 'Md' },
    { key: 'lg', label: 'Lg' },
  ];
  protected readonly alignments: ReadonlyArray<{ key: TypeAlign; label: string; icon: string }> = [
    { key: 'left', label: 'Align left', icon: 'fa-solid fa-align-left' },
    { key: 'center', label: 'Align centre', icon: 'fa-solid fa-align-center' },
  ];

  protected activeTab: 'logo' | 'font' | 'buttons' | 'background' = 'font';
  /**
   * Controls render only once seeded.
   *
   * The colour swatches are seeded from what the sample renders, which needs the sample in
   * the DOM — and `ngOnInit` runs before the view exists. Binding them beforehand fed
   * `<input type="color">` an empty string, which the browser rejects as an invalid value
   * and silently falls back to the darkest swatch — so every unset colour read as set.
   */
  protected ready = false;
  protected busy = false;
  protected loadError = '';
  protected saveState = '';

  /**
   * Debounce for the autosave.
   *
   * The rest of the builder persists immediately, and a separate "Save design" button made
   * this one tab the exception — you could restyle a form, publish, and find none of it had
   * gone out. Colour inputs fire continuously while dragging, though, so edits are batched
   * rather than written per frame.
   */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** The form's own style, created or forked on load. All edits land here. */
  private style: mjBizAppsFormsFormStyleEntity | null = null;

  // -- working values, bound to the controls --------------------------------

  protected logoUrl = '';
  protected fontBody = '';
  /**
   * Colour controls. Seeded from what the sample is ACTUALLY rendering rather than from a
   * copy of the widget's palette — a second copy of those defaults would be one more thing
   * to keep in step with `mj-form.component.css`, and would show the author a colour the
   * form does not use the moment the two drifted.
   */
  protected ink = '';
  protected accent = '';
  protected onAccent = '';
  protected answer = '';
  protected pageBg = '';
  protected bgImageUrl = '';
  protected titleSize: TypeScale = 'md';
  protected questionSize: TypeScale = 'md';
  protected titleAlign: TypeAlign = 'left';
  protected questionAlign: TypeAlign = 'left';
  protected radiusKey: (typeof RADIUS_STEPS)[number]['key'] = 'soft';

  public async ngOnInit(): Promise<void> {
    await this.reload();
  }

  /** A pending edit must not be lost because the author switched tabs. */
  public ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      void this.save();
    }
  }

  /** Seed from the rendered sample, which does not exist until the view does. */
  public ngAfterViewInit(): void {
    this.applyPreview();
    this.syncFromStyle();
    this.ready = true;
    this.cdr.markForCheck();
    this.applyPreview();
  }

  /** Resolve this form's own style and populate the controls from it. */
  protected async reload(): Promise<void> {
    this.busy = true;
    this.loadError = '';
    this.cdr.markForCheck();

    const style = await this.design.ensureOwnStyle(this.form);
    this.busy = false;
    if (!style) {
      this.loadError = 'Could not load this form’s design. See the logs for details.';
      this.cdr.markForCheck();
      return;
    }
    this.style = style;
    if (this.form.StyleID !== style.ID) {
      this.styleApplied.emit(style.ID);
    }
    this.syncFromStyle();
    this.saveState = '';
    this.cdr.markForCheck();
    this.applyPreview();
  }

  /** Read every control's value out of the style's stored tokens. */
  private syncFromStyle(): void {
    const css = this.style?.CSSVariables ?? null;
    const read = (token: string, fallback: string): string => readBrandToken(css, token) || fallback;

    this.logoUrl = this.style?.LogoURL ?? '';
    this.fontBody = read(BRAND_TOKENS.fontBody, FONT_OPTIONS[0].stack);
    this.ink = read(BRAND_TOKENS.ink, this.renderedColor(BRAND_TOKENS.ink));
    this.accent = read(BRAND_TOKENS.primary, this.renderedColor(BRAND_TOKENS.primary));
    this.onAccent = read(BRAND_TOKENS.onAccent, this.renderedColor(BRAND_TOKENS.onAccent));
    this.answer = read(BRAND_TOKENS.answer, this.renderedColor(BRAND_TOKENS.answer));
    this.pageBg = read(BRAND_TOKENS.pageBg, this.renderedColor(BRAND_TOKENS.pageBg));
    this.bgImageUrl = backgroundImageUrl(readBrandToken(css, BRAND_TOKENS.pageBgImage));
    this.titleSize = typeSizeScale('title', readBrandToken(css, BRAND_TOKENS.titleSize));
    this.questionSize = typeSizeScale('question', readBrandToken(css, BRAND_TOKENS.questionSize));
    this.titleAlign = typeAlignChoice('title', readBrandToken(css, BRAND_TOKENS.titleAlign));
    this.questionAlign = typeAlignChoice('question', readBrandToken(css, BRAND_TOKENS.questionAlign));
    this.radiusKey = this.radiusKeyFor(readButtonRadiusPx(css));
  }

  /**
   * What the sample currently renders for a token, as hex.
   *
   * The preview frame resolves the same `var(--mjf-x, fallback)` chains the widget does, so
   * reading from it answers "what colour is this right now" without a second palette to
   * maintain. Empty when the element is not in the DOM yet or the value is not a colour;
   * the caller keeps its own empty state rather than being handed a guess.
   */
  private renderedColor(token: string): string {
    const host = this.previewHost?.nativeElement;
    if (!host) {
      return '';
    }
    // Resolved through a probe rather than read off the host directly: getPropertyValue on
    // a custom property returns its DECLARED TEXT, so a token defined as another var() or a
    // color-mix() comes back as the literal string "var(--mjf-accent-soft)" — unparseable,
    // and every such swatch fell back to black. Assigning it to a real colour property is
    // what makes the browser resolve it.
    const probe = host.ownerDocument.createElement('span');
    probe.style.display = 'none';
    probe.style.color = `var(${token})`;
    host.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return cssColorToHex(resolved);
  }

  /** Nearest offered radius step to a stored px value. */
  private radiusKeyFor(px: number): (typeof RADIUS_STEPS)[number]['key'] {
    return RADIUS_STEPS.reduce((best, step) =>
      Math.abs(step.px - px) < Math.abs(best.px - px) ? step : best,
    ).key;
  }

  // -- editing --------------------------------------------------------------

  /** Any control changed: re-theme the sample now, persist shortly after. */
  protected onEdit(): void {
    this.applyPreview();
    this.saveState = 'Saving…';
    this.cdr.markForCheck();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.save(), SAVE_DEBOUNCE_MS);
  }

  /**
   * Commit a hex code typed into the box beside a swatch.
   *
   * Only complete, well-formed values are applied. An author typing a six-digit code passes
   * through every incomplete prefix on the way, and treating those as edits would repaint
   * the sample mid-keystroke and persist the noise.
   */
  protected setHex(field: 'ink' | 'accent' | 'onAccent' | 'answer' | 'pageBg', value: string): void {
    const hex = cssColorToHex(value);
    if (!hex) {
      return;
    }
    this[field] = hex;
    this.onEdit();
  }

  /**
   * The picker offers one font, which sets BOTH stacks.
   *
   * Splitting body and display was an option nobody exercised and every author had to
   * answer twice. One choice, applied to both, matches what the control says it does.
   */
  protected setFont(stack: string): void {
    this.fontBody = stack;
    this.onEdit();
  }

  protected setRadius(key: (typeof RADIUS_STEPS)[number]['key']): void {
    this.radiusKey = key;
    this.onEdit();
  }

  /** Persist every control onto this form's style. Driven by the debounce, not a button. */
  private async save(): Promise<void> {
    this.saveTimer = null;
    if (!this.style || this.busy) {
      return;
    }
    this.busy = true;
    const ok = await this.design.saveBranding(this.style, {
      logoURL: this.logoUrl,
      tokens: this.editedTokenMap(),
      radiusPx: this.radiusPx(),
    });
    this.busy = false;
    this.saveState = ok ? 'Saved · publish to put it live' : 'Could not save — see logs';
    this.cdr.markForCheck();
    if (ok) {
      // The style rides in the published snapshot, so the builder's publish state changed.
      this.styleApplied.emit(this.style.ID);
    }
  }

  private radiusPx(): number {
    return RADIUS_STEPS.find((r) => r.key === this.radiusKey)?.px ?? 10;
  }

  /** Every control, as the `--mjf-*` token map the widget reads. */
  private editedTokenMap(): Record<string, string> {
    return {
      [BRAND_TOKENS.fontBody]: this.fontBody,
      [BRAND_TOKENS.fontDisplay]: this.fontBody,
      [BRAND_TOKENS.ink]: this.ink,
      [BRAND_TOKENS.primary]: this.accent,
      [BRAND_TOKENS.onAccent]: this.onAccent,
      [BRAND_TOKENS.answer]: this.answer,
      [BRAND_TOKENS.pageBg]: this.pageBg,
      [BRAND_TOKENS.pageBgImage]: backgroundImageValue(this.bgImageUrl),
      [BRAND_TOKENS.titleSize]: typeSizeValue('title', this.titleSize),
      [BRAND_TOKENS.questionSize]: typeSizeValue('question', this.questionSize),
      [BRAND_TOKENS.titleAlign]: typeAlignValue('title', this.titleAlign),
      [BRAND_TOKENS.questionAlign]: typeAlignValue('question', this.questionAlign),
    };
  }

  // -- preview --------------------------------------------------------------

  /** The saved style with the unsaved control values layered on top. */
  private buildPreviewTokens(): FormStyleTokens {
    const tokens = this.style ? toStyleTokens(this.style) : { cssVariables: {} };
    for (const [token, value] of Object.entries(this.editedTokenMap())) {
      if (value.trim()) {
        tokens.cssVariables[token] = value.trim();
      } else {
        delete tokens.cssVariables[token];
      }
    }
    tokens.cssVariables[BUTTON_RADIUS_TOKEN] = `${this.radiusPx()}px`;
    tokens.logoURL = this.logoUrl.trim() || undefined;
    return tokens;
  }

  /**
   * Re-theme the sample through the widget's own token applier.
   *
   * Tokens are cleared before being re-applied: `applyStyleTokens` only ever SETS inline
   * properties, so a value the author removed would otherwise stay on the element and the
   * sample would keep showing a colour the form no longer has.
   */
  private applyPreview(): void {
    const host = this.previewHost?.nativeElement;
    if (!host) {
      return;
    }
    for (const name of this.appliedTokenNames) {
      host.style.removeProperty(name);
    }
    const tokens = this.buildPreviewTokens();
    applyStyleTokens(host, tokens);
    this.appliedTokenNames = Object.keys(tokens.cssVariables ?? {});
  }
}
