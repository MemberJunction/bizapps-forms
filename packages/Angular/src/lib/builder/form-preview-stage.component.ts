import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { FormStyleTokens, PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
// Import directly from the widget source modules (same package; no cross-package re-export).
import { MjFormComponent } from '../widget/mj-form.component';
import { normalizeApiConfig } from '../widget/api/forms-api.config';
import { formsWidgetProviders } from '../widget/widget-providers';
import { sameScreen, type ShownScreen } from '../widget/core/shown-screen';
import { PREVIEW_DEVICES, stageHeight, stageWidth, type PreviewDevice } from './preview-devices';
import { PREVIEW_STAGE_STYLES } from './form-preview-stage.styles';
import { screenChips } from './screen-strip';

/**
 * An inert connection config for any preview of the real widget.
 *
 * The empty `graphqlUrl` is the whole point, not a placeholder: `formsWidgetProviders`
 * reads it to pick BOTH mocks, so a trial submission writes nothing and a FileUpload or
 * Signature answer is accepted in-memory rather than shipped anywhere. Omitting
 * `turnstileSiteKey` likewise keeps a captcha-required form from rendering a live
 * Cloudflare challenge at an author who is only previewing.
 */
const PREVIEW_API_CONFIG = normalizeApiConfig({ graphqlUrl: '' });

/** Matches the 1rem margin on .ps-stage--framed. */
const FRAME_GUTTER_PX = 16;

/**
 * The one way this app previews a form: a measured device stage hosting the real `<mj-form>`.
 *
 * There are two places an author looks at their form before publishing — the Preview modal and
 * the Design tab — and they were two different renderings of it. The modal had the device
 * switcher, the sunken desk, the fixed-height frame that makes "below the fold" mean something;
 * the Design tab dropped a bare `<mj-form>` into a white pane and, because that pane's CSS set
 * `display: block` on it, broke the widget's own flex chain so welcome and ending screens
 * stopped centring. An author styled a layout in Design that Preview then contradicted.
 *
 * Hosts differ only in the chrome AROUND the stage, so that is the only thing they supply:
 * project a title into `[preview-bar-start]` and a close button into `[preview-bar-end]` and the
 * modal's single toolbar is unchanged, while the Design tab projects nothing and gets the same
 * device controls for free. The widget providers live here too, so neither host can render a
 * preview wired to a live transport by forgetting them.
 *
 * Two control clusters, split by what they answer. The top bar is about the CONTAINER — which
 * device am I looking through — and the bottom strip is about the CONTENT — which of the form's
 * screens am I looking at. Keeping them at opposite edges means an author never has to
 * disambiguate two rows of buttons that do unrelated things, and laying the screens out in
 * respondent order along the bottom borrows the storyboard reading every deck and video tool
 * has already taught them.
 */
@Component({
  selector: 'mjf-form-preview-stage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MjFormComponent],
  providers: formsWidgetProviders(PREVIEW_API_CONFIG),
  template: `
    <div class="ps-bar">
      <ng-content select="[preview-bar-start]"></ng-content>

      <div class="ps-devices" role="group" aria-label="Preview width">
        @for (d of devices; track d.id) {
          <button
            type="button"
            class="ps-device"
            [class.is-on]="device().id === d.id"
            [attr.aria-pressed]="device().id === d.id"
            [attr.aria-label]="d.label + ' preview'"
            [attr.title]="d.label + (d.width ? ' — ' + d.width + 'px' : '')"
            (click)="chooseDevice(d)"
          ><i [class]="d.icon" aria-hidden="true"></i></button>
        }
      </div>

      <span class="ps-width" aria-live="polite">
        {{ device().label }} · {{ stagePx() }} × {{ stageHeightPx() }}@if (isNarrowed()) { <span class="ps-narrowed">shrunk to fit</span> }
      </span>

      <ng-content select="[preview-bar-end]"></ng-content>
    </div>

    <div class="ps-desk" #desk>
      <div
        class="ps-stage"
        [class.ps-stage--framed]="device().id !== 'desktop'"
        [style.width.px]="stagePx()"
        [style.height.px]="stageHeightPx()"
      >
        <mj-form #form [definition]="definition()"></mj-form>
      </div>
    </div>

    @if (chips().length > 1) {
      <div class="ps-screens" role="group" aria-label="Screen to preview">
        @for (c of chips(); track c.label + (c.screen.kind === 'ending' ? c.screen.screenId ?? '' : c.screen.kind)) {
          <button
            type="button"
            class="ps-screen"
            [class.is-on]="isShowing(c.screen)"
            [attr.aria-pressed]="isShowing(c.screen)"
            [attr.title]="c.hint"
            (click)="showScreen(c.screen)"
          >
            <i [class]="c.icon" aria-hidden="true"></i>
            <span class="ps-screen__label">{{ c.label }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: [PREVIEW_STAGE_STYLES],
})
export class FormPreviewStageComponent implements AfterViewInit, OnDestroy {
  /** The draft definition to render (from `buildPublishedDefinition`). */
  public readonly definition = input.required<PublishedFormDefinition>();

  // Decorator queries for the two ELEMENTS, which are only ever read imperatively (measuring
  // the desk, handing the form's host to the Design tab's themer). `viewChild()`'s string
  // overload does not take `read`, and forcing it there would cost the ElementRef's type
  // parameter — an `any` nativeElement in exchange for reactivity nothing needs.
  @ViewChild('desk') private desk?: ElementRef<HTMLElement>;
  @ViewChild('form', { read: ElementRef }) private formRef?: ElementRef<HTMLElement>;

  /** The widget itself, as a signal: the strip's highlight is derived from its live state. */
  private readonly form = viewChild(MjFormComponent);

  /**
   * The strip's buttons, and which one is lit.
   *
   * `showing` is read off the WIDGET rather than off a selection this component stores. The
   * strip therefore stays right when the form moves without being asked — a respondent
   * pressing Start, a submit landing on its ending — which a remembered selection could not,
   * and it means clicking a chip is a command with no state to fall out of step with.
   */
  protected readonly chips = computed(() => screenChips(this.definition()));
  protected readonly showing = computed<ShownScreen | null>(() => this.form()?.shownScreen() ?? null);

  protected readonly devices = PREVIEW_DEVICES;
  protected readonly device = signal<PreviewDevice>(PREVIEW_DEVICES[0]);

  /** Room the desk currently offers. Measured, never assumed — see {@link watchAvailableSize}. */
  private readonly available = signal(0);
  private readonly availableHeight = signal(0);
  private observer?: ResizeObserver;

  /**
   * The `<mj-form>` element, for a host that themes or probes it directly.
   *
   * Deliberately the element rather than a `styleTokens` input: the Design tab both WRITES
   * tokens onto it (through the widget's own `applyStyleTokens`, so preview and publish cannot
   * theme by different rules) and READS back what they resolve to, which is how the colour
   * swatches avoid keeping a second copy of the widget's palette.
   */
  public formElement(): HTMLElement | undefined {
    return this.formRef?.nativeElement;
  }

  protected isShowing(screen: ShownScreen): boolean {
    return sameScreen(this.showing(), screen);
  }

  protected showScreen(screen: ShownScreen): void {
    this.form()?.showScreen(screen);
  }

  /** Re-style the previewed form from a design host's working values. */
  public applyPreviewStyle(tokens: FormStyleTokens): void {
    this.form()?.applyPreviewStyle(tokens);
  }

  /** The width the stage is actually rendered at, and the number shown in the bar. */
  protected stagePx(): number {
    return Math.round(stageWidth(this.device(), this.available()));
  }

  protected stageHeightPx(): number {
    return Math.round(stageHeight(this.device(), this.availableHeight()));
  }

  /** True when the window could not give the chosen device its full size. */
  protected isNarrowed(): boolean {
    const d = this.device();
    return (
      (d.width !== undefined && this.stagePx() < d.width) ||
      (d.height !== undefined && this.stageHeightPx() < d.height)
    );
  }

  protected chooseDevice(device: PreviewDevice): void {
    this.device.set(device);
  }

  public ngAfterViewInit(): void {
    this.watchAvailableSize();
  }

  public ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /**
   * Keep {@link available} equal to the desk's real inner size.
   *
   * Measured with a ResizeObserver rather than read once, or taken from `window.innerWidth`:
   * the desk is not the window (it loses the surrounding chrome and any scrollbar), and the
   * author resizing the browser, collapsing a panel or opening devtools mid-preview must not be
   * left looking at a frame that quietly overflows. The observer is what makes the width readout
   * honest at every size instead of only at the one it was opened at.
   */
  private watchAvailableSize(): void {
    const host = this.desk?.nativeElement;
    if (!host) {
      return;
    }
    this.measure(host.clientWidth, host.clientHeight);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) {
        this.measure(box.width, box.height);
      }
    });
    this.observer.observe(host);
  }

  /**
   * A framed device sits in a 1rem gutter top and bottom, so the room it can occupy is smaller
   * than the desk. Subtracting it here rather than in CSS keeps the readout equal to the frame
   * the author is looking at.
   */
  private measure(width: number, height: number): void {
    this.available.set(width);
    this.availableHeight.set(Math.max(0, height - FRAME_GUTTER_PX * 2));
  }
}
