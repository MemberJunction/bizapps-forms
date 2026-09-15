import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';
import { FormPreviewStageComponent } from './form-preview-stage.component';

/**
 * Full-screen WYSIWYG preview of the real respondent form, built from the unpublished
 * draft ({@link buildPublishedDefinition}) and themed with the current (possibly unsaved)
 * style.
 *
 * This component is now only the WINDOW: the backdrop, the title, ESC-to-close and focus. The
 * form itself — the device stage, the measured frame, the mock transports that make a trial
 * submission harmless — is {@link FormPreviewStageComponent}, shared with the Design tab so the
 * two cannot show an author different things. The bar looks unchanged because the title and
 * close button are projected into the stage's own toolbar.
 */
@Component({
  selector: 'mjf-form-preview-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormPreviewStageComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="pv-backdrop" (click)="close()"></div>
    <div class="pv-dialog" role="dialog" aria-modal="true" [attr.aria-label]="'Preview of ' + definition.name">
      <mjf-form-preview-stage [definition]="definition">
        <span preview-bar-start class="pv-title">
          <i class="fa-solid fa-eye" aria-hidden="true"></i> Preview — {{ definition.name }}
        </span>

        <button #closeBtn preview-bar-end type="button" class="pv-close" (click)="close()" aria-label="Close preview">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </mjf-form-preview-stage>
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
      .pv-title {
        font-weight: 600;
        color: var(--mj-text-primary);
        font-family: var(--mj-font-family);
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
    `,
  ],
})
export class FormPreviewModalComponent implements AfterViewInit {
  /** The draft definition to render (from `buildPublishedDefinition`). */
  @Input({ required: true }) definition!: PublishedFormDefinition;

  /** Emitted when the author dismisses the preview (backdrop, close button, or ESC). */
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;

  public ngAfterViewInit(): void {
    // Move focus into the dialog for keyboard users.
    this.closeBtn?.nativeElement.focus();
  }

  protected close(): void {
    this.closed.emit();
  }
}
