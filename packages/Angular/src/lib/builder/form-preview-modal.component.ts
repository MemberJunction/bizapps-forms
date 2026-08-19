import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
// Import directly from the widget source modules (same package; no cross-package re-export).
import { MjFormComponent } from '../widget/mj-form.component';
import { normalizeApiConfig } from '../widget/api/forms-api.config';
import { formsWidgetProviders } from '../widget/widget-providers';
import { PREVIEW_DEVICES, stageHeight, stageWidth, type PreviewDevice } from './preview-devices';

/**
 * An inert connection config for the preview.
 *
 * The empty `graphqlUrl` is the whole point, not a placeholder: `formsWidgetProviders`
 * reads it to pick BOTH mocks, so a trial submission writes nothing and a FileUpload or
 * Signature answer is accepted in-memory rather than shipped anywhere. Omitting
 * `turnstileSiteKey` likewise keeps a captcha-required form from rendering a live
 * Cloudflare challenge at an author who is only previewing.
 */
const PREVIEW_API_CONFIG = normalizeApiConfig({ graphqlUrl: '' });

/**
 * Full-screen WYSIWYG preview of the real respondent form, built from the unpublished
 * draft ({@link buildPublishedDefinition}) and themed with the current (possibly unsaved)
 * style. It hosts the actual `<mj-form>` widget so both render modes, progress, validation
 * and the confirmation screen behave exactly as they will for respondents — the author can
 * fill it end-to-end before publishing.
 *
 * A scoped {@link FormsMockApiService} makes a preview "submit" harmless (no server write);
 * the widget renders from the `definition` input and never calls `loadPublishedForm`.
 */
@Component({
  selector: 'mjf-form-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MjFormComponent],
  providers: formsWidgetProviders(PREVIEW_API_CONFIG),
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="pv-backdrop" (click)="close()"></div>
    <div class="pv-dialog" role="dialog" aria-modal="true" [attr.aria-label]="'Preview of ' + definition.name">
      <header class="pv-bar">
        <span class="pv-title"><i class="fa-solid fa-eye" aria-hidden="true"></i> Preview — {{ definition.name }}</span>

        <div class="pv-devices" role="group" aria-label="Preview width">
          @for (d of devices; track d.id) {
            <button
              type="button"
              class="pv-device"
              [class.is-on]="device().id === d.id"
              [attr.aria-pressed]="device().id === d.id"
              [attr.aria-label]="d.label + ' preview'"
              [attr.title]="d.label + (d.width ? ' — ' + d.width + 'px' : '')"
              (click)="chooseDevice(d)"
            ><i [class]="d.icon" aria-hidden="true"></i></button>
          }
        </div>

        <span class="pv-width" aria-live="polite">
          {{ device().label }} · {{ stagePx() }} × {{ stageHeightPx() }}@if (isNarrowed()) { <span class="pv-narrowed">shrunk to fit</span> }
        </span>

        <button #closeBtn type="button" class="pv-close" (click)="close()" aria-label="Close preview">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      <div class="pv-body" #body>
        <div
          class="pv-stage"
          [class.pv-stage--framed]="device().id !== 'desktop'"
          [style.width.px]="stagePx()"
          [style.height.px]="stageHeightPx()"
        >
          <mj-form [definition]="definition"></mj-form>
        </div>
      </div>
    </div>
  `,
  styles: [
    /* css */ `
      :host {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: stretch;
        justify-content: center;
      }
      .pv-backdrop {
        position: absolute;
        inset: 0;
        background: color-mix(in srgb, var(--mj-text-primary) 60%, transparent);
        backdrop-filter: blur(2px);
      }
      /* Full window, not a 720px column. The dialog is now the DESK the device sits on, so the
         author gets the real desktop width at the desktop setting instead of a permanent
         tablet-ish slice that matched no device anyone owns. */
      .pv-dialog {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-height: 100%;
        margin: 0 auto;
        background: var(--mj-bg-page, var(--mj-bg-surface));
        box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--mj-text-primary) 45%, transparent);
      }
      .pv-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        font-family: var(--mj-font-family);
      }
      .pv-title {
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .pv-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
        transition: var(--mj-transition-base);
      }
      .pv-close:hover {
        background: var(--mj-bg-surface-hover);
        color: var(--mj-text-primary);
      }
      /* Sunken, so a framed device reads as an object ON a surface rather than a box drawn in
         the same plane. This is the whole reason the device sizes are legible at a glance. */
      .pv-body {
        flex: 1 1 auto;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: var(--mj-bg-surface-sunken);
      }

      /* A VIEWPORT, not a panel: fixed box, scrolling inside. That is the whole difference
         between previewing a phone and previewing a very narrow desktop — the fold only exists
         if the frame stops somewhere. */
      .pv-stage {
        flex: none;
        overflow-y: auto;
        overflow-x: hidden;
        background: var(--mj-bg-page, var(--mj-bg-surface));
        transition: width 0.18s cubic-bezier(0.2, 0, 0, 1),
          height 0.18s cubic-bezier(0.2, 0, 0, 1);
      }

      /* Only the narrowed sizes get a frame. Desktop fills the desk, and drawing a border
         around something edge-to-edge marks nothing. */
      .pv-stage--framed {
        margin: 1rem 0;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        box-shadow: 0 18px 40px -22px color-mix(in srgb, var(--mj-text-primary) 55%, transparent);
        /* Deliberately no overflow shorthand here, however much rounded corners look like they
           want one: the shorthand resets overflow-y as well, which silently turned the device
           frame into a fixed window showing only the top of the form with no way to reach the
           rest. The base rule clips to the radius just as well AND scrolls. */
      }

      /* Without this the widget is content-height inside a fixed-height frame, so a welcome
         screen rendered as a short band at the top with the desk showing through beneath it. */
      .pv-stage > mj-form {
        min-height: 100%;
        box-sizing: border-box;
      }

      .pv-devices {
        display: inline-flex;
        gap: 0.25rem;
        padding: 0.25rem;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-sunken);
      }
      /* Big enough that the glyph reads as a monitor, a tablet and a phone at a glance. At 2rem
         the three silhouettes were near-identical rounded rectangles and the control looked like
         three unlabelled buttons rather than a size switch. */
      .pv-device {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.5rem;
        font-size: 1.125rem;
        border: none;
        border-radius: var(--mj-radius-sm);
        background: transparent;
        color: var(--mj-text-secondary);
        cursor: pointer;
        transition: var(--mj-transition-base);
      }
      .pv-device:hover { color: var(--mj-text-primary); }
      .pv-device:focus-visible {
        outline: 2px solid var(--mj-brand-primary);
        outline-offset: 1px;
      }
      /* The lifted-tile treatment rather than a colour swap: at 2rem an icon is too small to
         carry a state on its own colour alone, and against a sunken track a raised surface reads
         as pressed from across the room. */
      .pv-device.is-on {
        background: var(--mj-bg-surface);
        color: var(--mj-brand-primary);
        box-shadow: var(--mj-shadow-sm);
      }

      .pv-width {
        margin-left: auto;
        font-size: 0.8125rem;
        color: var(--mj-text-muted);
        white-space: nowrap;
      }
      /* Said out loud rather than left to be discovered: the frame is not the width the author
         asked for, and a silently cropped tablet is exactly the wrong thing to trust. */
      .pv-narrowed {
        margin-left: 0.375rem;
        padding: 0.0625rem 0.375rem;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      @media (prefers-reduced-motion: reduce) {
        .pv-stage { transition: none; }
      }
    `,
  ],
})
export class FormPreviewModalComponent implements AfterViewInit, OnDestroy {
  /** The draft definition to render (from `buildPublishedDefinition`). */
  @Input({ required: true }) definition!: PublishedFormDefinition;

  /** Emitted when the author dismisses the preview (backdrop, close button, or ESC). */
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('body') private body?: ElementRef<HTMLElement>;

  protected readonly devices = PREVIEW_DEVICES;
  protected readonly device = signal<PreviewDevice>(PREVIEW_DEVICES[0]);

  /** Room the desk currently offers. Measured, never assumed — see {@link watchAvailableWidth}. */
  private readonly available = signal(0);
  private readonly availableHeight = signal(0);
  private observer?: ResizeObserver;

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
    // Move focus into the dialog for keyboard users.
    this.closeBtn?.nativeElement.focus();
    this.watchAvailableWidth();
  }

  public ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /**
   * Keep {@link available} equal to the desk's real inner width.
   *
   * Measured with a ResizeObserver rather than read once, or taken from `window.innerWidth`:
   * the desk is not the window (it loses the dialog chrome and any scrollbar), and the author
   * resizing the browser or opening a devtools panel mid-preview must not be left looking at a
   * frame that quietly overflows. The observer is what makes the width readout honest at every
   * size instead of only at the one it was opened at.
   */
  private watchAvailableWidth(): void {
    const host = this.body?.nativeElement;
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

  protected close(): void {
    this.closed.emit();
  }
}

/** Matches the 1rem margin on .pv-stage--framed. */
const FRAME_GUTTER_PX = 16;
