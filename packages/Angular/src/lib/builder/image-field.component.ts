/**
 * One image on a form: drop it, browse for it, or point at a URL.
 *
 * This exists because the same control was needed in five unrelated places — a Welcome screen's
 * picture, an Ending's, a Picture-choice option, the logo, the page background — and each had
 * grown its own bare URL input. Five inputs meant five chances to disagree about what a blank
 * field means and what an author sees while an upload runs. The interface here is `value` in,
 * `valueChange` out: exactly what a plain `<input>` offered, so every host swapped one for the
 * other and got uploading for free.
 *
 * ── Why a dropzone and not a box-plus-button ────────────────────────────────────────────────
 * The first version put a URL field and an Upload button side by side. That is two competing
 * affordances for one job with no hierarchy between them, and worse, a button labelled "Upload"
 * sitting next to a text box reads as "submit the URL I just typed". It is ambiguous at exactly
 * the moment the author is deciding what to do.
 *
 * So the surface now states one primary action — put an image here — and keeps the URL as a
 * secondary path that appears only when asked for. Uploading is what most authors want, because
 * the picture is on their computer; a URL is the escape hatch for one that is already hosted,
 * and it stays, because an author pointing at a CDN should not be made to download and re-upload.
 *
 * The other things a modern picker owes the author, all of which the old one lacked: drag and
 * drop, the accepted formats and size limit stated BEFORE a file is chosen rather than as a
 * rejection afterwards, and a visibly different look for idle / dragging / uploading / filled /
 * failed. The dropzone is a real `<button>`, so it is reachable and operable by keyboard.
 */
import {
  booleanAttribute,
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

import { FORMS_UI_CSS } from '../shared';
import { FormAssetService } from './form-asset.service';
import {
  ACCEPTED_FORMATS_LABEL,
  ACCEPT_ATTRIBUTE,
  MAX_SIZE_LABEL,
  isAcceptedType,
} from './image-formats';


const IMAGE_FIELD_CSS = /* css */ `
:host { display: block; }
.imf { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

/* ── The dropzone: the one primary action ─────────────────────────────────────── */
.imf-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 18px 12px;
  font: inherit;
  color: var(--mj-text-secondary);
  text-align: center;
  cursor: pointer;
  background: var(--mj-bg-surface-sunken);
  border: 1px dashed var(--mj-border-default);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), background var(--mjf-ease), color var(--mjf-ease);
}
.imf-drop:hover:not(:disabled) { border-color: var(--mj-brand-primary); color: var(--mj-text-primary); }
.imf-drop:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.imf-drop:disabled { cursor: not-allowed; opacity: 0.55; }

/* Dragging over. Solid + branded, so "let go here" is unmistakable. */
.imf-drop.is-dragging {
  border-style: solid;
  border-color: var(--mj-brand-primary);
  background: var(--mj-bg-surface-hover);
  color: var(--mj-text-primary);
}

.imf-drop-icon { font-size: 18px; color: var(--mj-text-muted); }
.imf-drop.is-dragging .imf-drop-icon { color: var(--mj-brand-primary); }
.imf-drop-lead { font-size: var(--mjf-meta); font-weight: 600; }
.imf-drop-sub { font-size: var(--mjf-label); color: var(--mj-text-muted); }

/* Compact: one row, for an option list where a stack of full dropzones would be absurd. */
.imf-drop--compact {
  flex-direction: row;
  justify-content: flex-start;
  gap: var(--mjf-gap-sm);
  padding: 8px 10px;
  text-align: left;
}
.imf-drop--compact .imf-drop-icon { font-size: 14px; }

/* ── Filled: the image itself is the control ──────────────────────────────────── */
.imf-filled {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-gap-sm);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
}
.imf-thumb {
  flex: none;
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 4px;
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

/* ── Uploading ────────────────────────────────────────────────────────────────── */
.imf-bar { height: 4px; border-radius: 2px; background: var(--mj-bg-surface-sunken); overflow: hidden; }
.imf-bar-fill { height: 100%; background: var(--mj-brand-primary); transition: width 0.15s linear; }

/* ── Link mode + messages ─────────────────────────────────────────────────────── */
.imf-link-row { display: flex; align-items: center; gap: 6px; }
.imf-link-row > .mjf-input { flex: 1 1 auto; min-width: 0; }

.imf-switch {
  align-self: flex-start;
  padding: 0;
  font: inherit;
  font-size: var(--mjf-label);
  color: var(--mj-text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  background: none;
  border: none;
  cursor: pointer;
}
.imf-switch:hover { color: var(--mj-text-primary); }
.imf-switch:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: 2px; }

.imf-error { margin: 0; font-size: var(--mjf-label); color: var(--mj-status-error-text); }
.imf-drop.has-error { border-color: var(--mj-status-error-border); }
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
        <span class="mjf-field-label" [id]="labelId">{{ label }}</span>
      }

      @if (uploading) {
        <!-- Uploading: the dropzone becomes the progress indicator rather than a second widget
             appearing below it, so the control does not change height mid-action. -->
        <div class="imf-drop" [class.imf-drop--compact]="compact" aria-live="polite">
          <span class="imf-drop-lead">Uploading {{ pendingName }}…</span>
          <div class="imf-bar" role="progressbar" [attr.aria-valuenow]="percent" aria-valuemin="0" aria-valuemax="100">
            <div class="imf-bar-fill" [style.width.%]="percent"></div>
          </div>
        </div>
      } @else if (value.trim()) {
        <div class="imf-filled">
          <img class="imf-thumb" [src]="value" alt="" (error)="onPreviewError()" />
          <div class="imf-meta">
            <span class="imf-name" [title]="value">{{ displayName }}</span>
            <div class="imf-actions">
              <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="browse()">
                <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Replace
              </button>
              <button type="button" class="mjf-btn mjf-btn--quiet mjf-btn--sm" (click)="clear()">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i> Remove
              </button>
            </div>
          </div>
        </div>
      } @else if (linkMode) {
        <div class="imf-link-row">
          <input
            #urlInput
            class="mjf-input"
            type="url"
            [attr.aria-label]="accessibleName + ' URL'"
            placeholder="https://example.com/image.png"
            (change)="commit(urlInput.value)"
            (keydown.enter)="commit(urlInput.value)"
          />
        </div>
        <button type="button" class="imf-switch" (click)="linkMode = false">Upload a file instead</button>
      } @else {
        <button
          type="button"
          class="imf-drop"
          [class.imf-drop--compact]="compact"
          [class.is-dragging]="dragging"
          [class.has-error]="!!error"
          [disabled]="!canUpload"
          [attr.aria-label]="dropzoneLabel"
          [attr.title]="canUpload ? null : uploadUnavailableReason"
          (click)="browse()"
          (dragenter)="onDragEnter($event)"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
        >
          <i class="fa-solid fa-image imf-drop-icon" aria-hidden="true"></i>
          @if (compact) {
            <span class="imf-drop-lead">{{ dragging ? 'Drop to add' : 'Add an image' }}</span>
          } @else {
            <span class="imf-drop-lead">{{ dragging ? 'Drop to upload' : 'Drag an image here, or browse' }}</span>
            <span class="imf-drop-sub">{{ formatsLabel }} · up to {{ sizeHint }}</span>
          }
        </button>
        <button type="button" class="imf-switch" (click)="linkMode = true">Use a link instead</button>
      }

      <input
        #fileInput
        class="imf-file"
        type="file"
        [accept]="accept"
        [attr.aria-label]="'Choose an image for ' + accessibleName"
        (change)="onFileChosen(fileInput)"
      />

      @if (error) {
        <p class="imf-error" role="alert">{{ error }}</p>
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
   * The form these bytes belong to. Uploading is disabled without it: the server scopes an asset
   * to a form and there is no sensible guess to make on the author's behalf.
   */
  @Input() formId = '';
  @Input() label = '';
  @Input() hint = '';
  /** Accessible name when there is no visible label (e.g. inside an option row). */
  @Input() ariaLabel = 'Image';
  /**
   * One-row layout, for a repeated control like a picture-choice option.
   *
   * `booleanAttribute` so it behaves like a native boolean attribute — bare `compact` in a
   * template means true. Without the transform it silently binds the empty STRING, which is
   * falsy, so the flag reads as off and the layout quietly stays wrong.
   */
  @Input({ transform: booleanAttribute }) compact = false;

  /** Emitted whenever the URL changes — by upload, by link, or by clearing. */
  @Output() readonly valueChange = new EventEmitter<string>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly assets = inject(FormAssetService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly sizeHint = MAX_SIZE_LABEL;
  protected readonly formatsLabel = ACCEPTED_FORMATS_LABEL;
  protected readonly labelId = `imf-label-${Math.random().toString(36).slice(2, 9)}`;

  protected linkMode = false;
  protected dragging = false;
  protected uploading = false;
  protected percent = 0;
  protected error = '';
  /** Name of the file currently uploading, and of the last one that succeeded. */
  protected pendingName = '';
  private uploadedName = '';

  /**
   * Nested elements each fire dragenter/dragleave, so a boolean flag flickers off the moment the
   * pointer crosses onto a child. Counting entries and exits is what keeps the highlight steady.
   */
  private dragDepth = 0;

  protected get canUpload(): boolean {
    return !!this.formId && this.assets.canUpload;
  }

  protected get uploadUnavailableReason(): string {
    return this.formId
      ? 'Uploading needs a signed-in MemberJunction session. Use a link instead.'
      : 'Save the form before uploading an image.';
  }

  protected get accessibleName(): string {
    return this.label || this.ariaLabel;
  }

  protected get dropzoneLabel(): string {
    return `${this.accessibleName}: drag an image here or press to browse. ${ACCEPTED_FORMATS_LABEL}, up to ${MAX_SIZE_LABEL}.`;
  }

  /** What the filled row says: the uploaded file's name, else the tail of the URL. */
  protected get displayName(): string {
    if (this.uploadedName) {
      return this.uploadedName;
    }
    const trimmed = this.value.trim();
    return trimmed.split('?')[0].split('/').pop() || trimmed;
  }

  protected browse(): void {
    this.error = '';
    this.fileInput?.nativeElement.click();
  }

  protected async onFileChosen(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Reset immediately so re-picking the SAME file fires `change` again; without this, an author
    // who fixes a rejected image and re-chooses it sees nothing happen.
    input.value = '';
    if (file) {
      await this.accept_(file);
    }
  }

  protected onDragEnter(event: DragEvent): void {
    if (!this.canUpload) {
      return;
    }
    event.preventDefault();
    this.dragDepth++;
    this.dragging = true;
    this.cdr.markForCheck();
  }

  /** Without preventDefault on dragover the browser never fires `drop`. */
  protected onDragOver(event: DragEvent): void {
    if (this.canUpload) {
      event.preventDefault();
    }
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0 && this.dragging) {
      this.dragging = false;
      this.cdr.markForCheck();
    }
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging = false;
    if (!this.canUpload) {
      this.cdr.markForCheck();
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await this.accept_(file);
    } else {
      // Dragging a selection or a link rather than a file. Saying so beats the control appearing
      // to do nothing at all.
      this.error = 'That does not look like an image file.';
      this.cdr.markForCheck();
    }
  }

  /**
   * Screen the file locally, then upload.
   *
   * The type check duplicates one the server also performs, deliberately: refusing a PDF here is
   * instant, whereas the same refusal from the server costs a round trip and, for a large file,
   * a real wait. The SERVER's check is the one that matters for correctness — this one only
   * saves the author time.
   */
  private async accept_(file: File): Promise<void> {
    if (!isAcceptedType(file.type)) {
      this.error = `${file.name} is not ${indefinite(ACCEPTED_FORMATS_LABEL)}.`;
      this.cdr.markForCheck();
      return;
    }
    await this.upload(file);
  }

  private async upload(file: File): Promise<void> {
    this.uploading = true;
    this.pendingName = file.name;
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
      // unchanged control with no idea whether anything happened.
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
    const trimmed = next.trim();
    this.error = '';
    this.linkMode = false;
    this.value = trimmed;
    this.valueChange.emit(trimmed);
    this.cdr.markForCheck();
  }
}

/** "PNG, JPG, GIF or WebP" reads as a list; in a sentence it needs an article. */
function indefinite(formats: string): string {
  return `a ${formats.replace(' or ', ', a ')}`;
}
