/**
 * One image on a form: a plus that opens the picker, or a thumbnail once there is one.
 *
 * Used for a Welcome screen's picture, an Ending's, the logo, the page background and each
 * Picture-choice option. Its interface is `value` in, `valueChange` out — exactly what the plain
 * URL input it replaced offered — so every host swapped one for the other.
 *
 * ── How it got to a plus, because the shape is the point ────────────────────────────────────
 * First it was a URL box beside an "Upload" button: two competing affordances for one job, and a
 * button labelled Upload next to a text box reads as "submit the URL I just typed".
 *
 * Then a dropzone with a link toggle underneath — better, but a large permanent block in a 300px
 * properties panel, and one per Picture-choice option turned that panel into a column of grey
 * rectangles.
 *
 * Now: a plus. Acquiring an image is a modal ({@link ImagePickerDialogComponent}) so the drop
 * target can be the size of the gesture it asks for, and both routes — upload or link — sit in it
 * together. What stays here is only the VALUE and the two things you can do to an existing one.
 */
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { FORMS_UI_CSS } from '../shared';
import { ImagePickerDialogComponent } from './image-picker-dialog.component';

const IMAGE_FIELD_CSS = /* css */ `
:host { display: block; }
.imf { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.imf-head {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  min-height: 32px;
}
.imf-head-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-primary);
}
.imf-add {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), color var(--mjf-ease);
}
.imf-add:hover { color: var(--mj-brand-primary); border-color: var(--mj-brand-primary); }
.imf-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }

.imf-filled { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.imf-thumb {
  flex: none;
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
  /* Decoration, not an affordance: it keeps a pale image on a pale panel from having no edge. */
  border: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface);
}
.imf-meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.imf-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-primary);
}
.imf-actions { display: flex; gap: 2px; }

.imf-error { margin: 0; font-size: var(--mjf-label); color: var(--mj-status-error-text); }
`;

@Component({
  selector: 'mjf-image-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ImagePickerDialogComponent],
  styles: [FORMS_UI_CSS, IMAGE_FIELD_CSS],
  template: `
    <div class="imf">
      @if (value.trim()) {
        <div class="imf-filled">
          <img class="imf-thumb" [src]="value" alt="" (error)="onPreviewError()" />
          <div class="imf-meta">
            <span class="imf-name" [title]="value">{{ displayName }}</span>
            <div class="imf-actions">
              <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="openPicker()">
                <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Replace
              </button>
              <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="clear()">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove
              </button>
            </div>
          </div>
        </div>
      } @else {
        <div class="imf-head">
          @if (label) {
            <span class="imf-head-label">{{ label }}</span>
          }
          <button
            type="button"
            class="imf-add"
            [attr.aria-haspopup]="'dialog'"
            [attr.aria-label]="'Add ' + accessibleName"
            (click)="openPicker()"
          >
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      }

      @if (error) {
        <p class="imf-error" role="alert">{{ error }}</p>
      }
      @if (hint && !error) {
        <span class="mjf-field-hint">{{ hint }}</span>
      }
    </div>

    @if (picking) {
      <mjf-image-picker-dialog
        [subject]="accessibleName"
        [formId]="formId"
        (picked)="commit($event)"
        (closed)="picking = false"
      />
    }
  `,
})
export class ImageFieldComponent {
  /** Current image URL. Empty string means "no image". */
  @Input() value = '';
  /**
   * The form these bytes belong to. Without it the picker's upload half is disabled — the server
   * scopes an asset to a form and there is no sensible guess to make on the author's behalf.
   */
  @Input() formId = '';
  /** Shown beside the plus. Omit inside a list where the surrounding row already names it. */
  @Input() label = '';
  @Input() hint = '';
  /** Accessible name when there is no visible label (e.g. inside an option row). */
  @Input() ariaLabel = 'an image';
  /** Kept for hosts that place this in a dense list; the resting state is compact either way. */
  @Input({ transform: booleanAttribute }) compact = false;

  /** Emitted whenever the URL changes — by upload, by link, or by clearing. */
  @Output() readonly valueChange = new EventEmitter<string>();

  private readonly cdr = inject(ChangeDetectorRef);

  protected picking = false;
  protected error = '';

  protected get accessibleName(): string {
    return this.label ? this.label.toLowerCase() : this.ariaLabel;
  }

  /** What the filled row says: the tail of the URL, which is the file's name for an upload. */
  protected get displayName(): string {
    const trimmed = this.value.trim();
    return trimmed.split('?')[0].split('/').pop() || trimmed;
  }

  protected openPicker(): void {
    this.error = '';
    this.picking = true;
    this.cdr.markForCheck();
  }

  protected clear(): void {
    this.commit('');
  }

  /** Report a URL that will not load — otherwise the preview is just a broken-image icon. */
  protected onPreviewError(): void {
    if (this.value.trim()) {
      this.error = 'That image could not be loaded. Check the link.';
      this.cdr.markForCheck();
    }
  }

  protected commit(next: string): void {
    this.error = '';
    this.picking = false;
    this.value = next.trim();
    this.valueChange.emit(this.value);
    this.cdr.markForCheck();
  }
}
