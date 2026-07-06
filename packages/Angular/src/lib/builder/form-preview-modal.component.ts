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
// Import directly from the widget source modules (same package; no cross-package re-export).
import { MjFormComponent } from '../widget/mj-form.component';
import { FORMS_API_SERVICE } from '../widget/api/forms-api.interface';
import { FormsMockApiService } from '../widget/api/forms-api.mock.service';

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
  providers: [{ provide: FORMS_API_SERVICE, useClass: FormsMockApiService }],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="pv-backdrop" (click)="close()"></div>
    <div class="pv-dialog" role="dialog" aria-modal="true" [attr.aria-label]="'Preview of ' + definition.name">
      <header class="pv-bar">
        <span class="pv-title"><i class="fa-solid fa-eye" aria-hidden="true"></i> Preview — {{ definition.name }}</span>
        <button #closeBtn type="button" class="pv-close" (click)="close()" aria-label="Close preview">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>
      <div class="pv-body">
        <mj-form [definition]="definition"></mj-form>
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
      .pv-dialog {
        position: relative;
        display: flex;
        flex-direction: column;
        width: min(720px, 100%);
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
      .pv-body {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
      }
      @media (max-width: 640px) {
        .pv-dialog {
          width: 100%;
        }
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
