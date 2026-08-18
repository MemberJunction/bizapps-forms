/**
 * One image on a form: upload from this computer, or paste a URL.
 *
 * This exists because the same control was needed in four unrelated places — a screen's picture,
 * a picture-choice option, the logo, the page background — and each of them had grown its own
 * bare URL input. Four inputs meant four chances to disagree about what a blank field means,
 * what an author sees while an upload runs, and whether the preview is a thumbnail or a banner.
 * Now they disagree about nothing: the interface is `value` in, `valueChange` out, which is
 * exactly what a plain `<input>` offered, so every host swapped one for the other and got
 * uploading for free.
 *
 * The URL box stays. Uploading is the addition, not the replacement — a form that already points
 * at a CDN image should keep pointing at it, and an author who has a URL should not be made to
 * download it and upload it back.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { FORMS_UI_CSS } from '../shared';
import { FormAssetService } from './form-asset.service';

const IMAGE_FIELD_CSS = /* css */ `
:host { display: block; }
.imf { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.imf-row { display: flex; align-items: center; gap: var(--mjf-gap-sm); min-width: 0; }
.imf-row > .mjf-input { flex: 1 1 auto; min-width: 0; }

.imf-preview {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-gap-sm);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
}
.imf-preview img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  flex: none;
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface);
}
.imf-preview-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--mjf-label);
  color: var(--mj-text-muted);
}

.imf-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--mj-bg-surface-sunken);
  overflow: hidden;
}
.imf-bar-fill {
  height: 100%;
  background: var(--mj-brand-primary);
  transition: width 0.15s linear;
}

.imf-error { margin: 0; font-size: var(--mjf-label); color: var(--mj-status-error-text); }
.imf-file { display: none; }
`;

@Component({
  selector: 'mjf-image-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, IMAGE_FIELD_CSS],
  template: `
    <div class="imf">
      @if (label) {
        <label class="mjf-field-label" [attr.for]="inputId">{{ label }}</label>
      }

      <div class="imf-row">
        <input
          #urlInput
          class="mjf-input"
          type="url"
          [id]="inputId"
          [value]="value"
          [placeholder]="placeholder"
          [attr.aria-label]="label ? null : ariaLabel"
          (change)="commit(urlInput.value)"
        />
        <button
          type="button"
          class="mjf-btn mjf-btn--ghost mjf-btn--sm"
          [disabled]="uploading || !canUpload"
          [attr.title]="canUpload ? null : 'Uploading needs a signed-in MemberJunction session.'"
          (click)="pickFile()"
        >
          <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>

      <input
        #fileInput
        class="imf-file"
        type="file"
        [accept]="accept"
        [attr.aria-label]="'Choose an image for ' + (label || 'this form')"
        (change)="onFileChosen(fileInput)"
      />

      @if (uploading) {
        <div class="imf-bar" role="progressbar" [attr.aria-valuenow]="percent" aria-valuemin="0" aria-valuemax="100">
          <div class="imf-bar-fill" [style.width.%]="percent"></div>
        </div>
      }

      @if (error) {
        <p class="imf-error" role="alert">{{ error }}</p>
      }

      @if (value.trim() && !uploading) {
        <div class="imf-preview">
          <img [src]="value" alt="" (error)="onPreviewError()" />
          <span class="imf-preview-name">{{ previewLabel }}</span>
          <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="clear()">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove
          </button>
        </div>
      }

      @if (hint && !error) {
        <span class="mjf-field-hint">{{ hint }}</span>
      }
    </div>
  `,
})
export class ImageFieldComponent {
  /** Current image URL. Empty string means "no image". */
  @Input() value = '';
  /**
   * The form these bytes belong to. Uploading is disabled without it, because the server scopes
   * an asset to a form and there is no sensible guess to make on the author's behalf.
   */
  @Input() formId = '';
  @Input() label = '';
  @Input() hint = '';
  @Input() placeholder = 'https://example.com/image.png';
  /** Used as the accessible name when there is no visible label (e.g. inside an option row). */
  @Input() ariaLabel = 'Image URL';
  /** DOM id for the URL box, so a host label can point at it. */
  @Input() inputId = '';

  /** Emitted whenever the URL changes — by paste, by upload, or by clearing. */
  @Output() readonly valueChange = new EventEmitter<string>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly assets = inject(FormAssetService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected uploading = false;
  protected percent = 0;
  protected error = '';
  /** File name of the most recent upload, shown instead of a long storage URL. */
  private uploadedName = '';

  /**
   * The `accept` filter mirrors the server's default allowlist rather than a bare `image/*`.
   * Offering the author a TIFF the endpoint will reject is a worse experience than not offering
   * it: the rejection arrives after the upload, having spent their time and bandwidth.
   */
  protected readonly accept = 'image/png,image/jpeg,image/gif,image/webp';

  protected get canUpload(): boolean {
    return !!this.formId && this.assets.canUpload;
  }

  /** What the preview row says: the uploaded file's name, else the tail of the URL. */
  protected get previewLabel(): string {
    if (this.uploadedName) {
      return this.uploadedName;
    }
    const trimmed = this.value.trim();
    const lastSegment = trimmed.split('?')[0].split('/').pop();
    return lastSegment || trimmed;
  }

  protected pickFile(): void {
    this.error = '';
    this.fileInput?.nativeElement.click();
  }

  protected async onFileChosen(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Reset immediately so re-picking the SAME file fires `change` again; without this, an
    // author who fixes a rejected image and re-chooses it sees nothing happen.
    input.value = '';
    if (!file) {
      return;
    }
    await this.uploadFile(file);
  }

  private async uploadFile(file: File): Promise<void> {
    this.uploading = true;
    this.percent = 0;
    this.error = '';
    this.cdr.markForCheck();
    try {
      const asset = await this.assets.upload(file, this.formId, (fraction) => {
        this.percent = fraction === null ? 0 : Math.round(fraction * 100);
        this.cdr.markForCheck();
      });
      this.uploadedName = asset.name || file.name;
      this.commit(asset.url);
    } catch (err) {
      // Surfaced inline and kept: an upload that fails silently leaves the author staring at an
      // unchanged field with no idea whether anything happened.
      this.error = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      this.uploading = false;
      this.cdr.markForCheck();
    }
  }

  protected clear(): void {
    this.uploadedName = '';
    this.commit('');
  }

  /** Report a URL that will not load — otherwise the preview is just a broken-image icon. */
  protected onPreviewError(): void {
    if (this.value.trim()) {
      this.error = 'That image could not be loaded. Check the URL.';
      this.cdr.markForCheck();
    }
  }

  protected commit(next: string): void {
    this.error = '';
    this.value = next;
    this.valueChange.emit(next);
    this.cdr.markForCheck();
  }
}
