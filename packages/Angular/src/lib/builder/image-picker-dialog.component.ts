/**
 * "Add an image" — a modal offering the two ways to supply one: upload a file, or paste a link.
 *
 * A modal rather than a panel that expands in place, because the properties panel is ~300px wide
 * and a drop target that size is a slot, not a target. Given its own overlay the drop area can be
 * the size of the gesture it is asking for, and both routes fit side by side without either being
 * hidden behind a toggle.
 *
 * It follows the same shape as `FormPreviewModalComponent` — `:host { position: fixed; inset: 0 }`
 * over a backdrop — so there is one modal idiom in the builder rather than two.
 *
 * The component owns ACQUIRING an image: the dropzone, the upload, its progress and its failures.
 * {@link ImageFieldComponent} owns the resulting value. Splitting it there keeps the field small
 * wherever it appears (a plus, or a thumbnail with two actions) no matter how elaborate the
 * picking gets.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
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

const IMAGE_PICKER_CSS = /* css */ `
:host {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mjf-gap);
}

.ipd-backdrop {
  position: absolute;
  inset: 0;
  background: var(--mj-overlay-scrim, rgba(9, 17, 24, 0.55));
}

.ipd {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: min(620px, calc(100vh - 2 * var(--mjf-gap)));
  background: var(--mj-bg-surface);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius);
  box-shadow: var(--mj-shadow-lg, 0 24px 48px rgba(0, 0, 0, 0.28));
  overflow: hidden;
}

.ipd-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: 14px var(--mjf-gap);
  border-bottom: 1px solid var(--mjf-rule);
}
.ipd-title { flex: 1 1 auto; margin: 0; font-size: 1rem; font-weight: 600; color: var(--mj-text-primary); }
.ipd-close {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.ipd-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.ipd-close:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.ipd-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  padding: var(--mjf-gap);
}

.ipd-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 200px;
  padding: var(--mjf-gap);
  font: inherit;
  color: var(--mj-text-secondary);
  text-align: center;
  cursor: pointer;
  background: var(--mj-bg-surface-sunken);
  /* Not a --mj-border-* token: this edge carries the affordance, and every border token measures
     under 2:1 against this fill in one theme or the other. See --mjf-dropzone-edge. */
  border: 1px dashed var(--mjf-dropzone-edge);
  border-radius: var(--mjf-radius-sm);
  transition: border-color var(--mjf-ease), background var(--mjf-ease), color var(--mjf-ease);
}
.ipd-drop:hover:not(:disabled) { color: var(--mj-text-primary); border-color: var(--mj-brand-primary); }
.ipd-drop:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.ipd-drop:disabled { cursor: not-allowed; opacity: 0.55; }
.ipd-drop.is-dragging {
  border-style: solid;
  border-color: var(--mj-brand-primary);
  background: var(--mj-bg-surface-hover);
  color: var(--mj-text-primary);
}
.ipd-drop-icon { font-size: 22px; color: var(--mj-text-muted); }
.ipd-drop.is-dragging .ipd-drop-icon { color: var(--mj-brand-primary); }
.ipd-drop-lead { font-size: 1rem; font-weight: 600; color: var(--mj-text-primary); }
.ipd-drop-sub { font-size: var(--mjf-label); color: var(--mj-text-muted); }

.ipd-or {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  font-size: var(--mjf-label);
  color: var(--mj-text-muted);
}
.ipd-or::before,
.ipd-or::after { content: ''; flex: 1 1 auto; height: 1px; background: var(--mjf-rule); }

.ipd-link { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.ipd-link > .mjf-input { flex: 1 1 auto; min-width: 0; }

.ipd-bar { height: 6px; border-radius: 3px; background: var(--mj-bg-surface-sunken); overflow: hidden; }
.ipd-bar-fill { height: 100%; background: var(--mj-brand-primary); transition: width 0.15s linear; }
.ipd-uploading { font-size: var(--mjf-meta); color: var(--mj-text-secondary); text-align: center; }

.ipd-error { margin: 0; font-size: var(--mjf-meta); color: var(--mj-status-error-text); }
.ipd-file { display: none; }
`;

@Component({
  selector: 'mjf-image-picker-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, IMAGE_PICKER_CSS],
  template: `
    <div class="ipd-backdrop" (click)="closed.emit()"></div>

    <div class="ipd" role="dialog" aria-modal="true" [attr.aria-label]="'Add ' + subject">
      <div class="ipd-head">
        <h2 class="ipd-title">Add {{ subject }}</h2>
        <button type="button" class="ipd-close" aria-label="Close" (click)="closed.emit()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="ipd-body">
        @if (uploading) {
          <p class="ipd-uploading" aria-live="polite">Uploading {{ pendingName }}…</p>
          <div class="ipd-bar" role="progressbar" [attr.aria-valuenow]="percent" aria-valuemin="0" aria-valuemax="100">
            <div class="ipd-bar-fill" [style.width.%]="percent"></div>
          </div>
        } @else {
          <button
            #drop
            type="button"
            class="ipd-drop"
            [class.is-dragging]="dragging"
            [disabled]="!canUpload"
            [attr.title]="canUpload ? null : unavailableReason"
            [attr.aria-label]="'Upload an image: drag one here or press to browse. ' + formatsLabel + ', up to ' + sizeHint + '.'"
            (click)="browse()"
            (dragenter)="onDragEnter($event)"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
          >
            <i class="fa-solid fa-arrow-up-from-bracket ipd-drop-icon" aria-hidden="true"></i>
            <span class="ipd-drop-lead">{{ dragging ? 'Drop to upload' : 'Upload or drop an image here' }}</span>
            <span class="ipd-drop-sub">{{ formatsLabel }} · up to {{ sizeHint }}</span>
          </button>

          <div class="ipd-or"><span>or</span></div>

          <div class="ipd-link">
            <input
              #urlInput
              class="mjf-input"
              type="url"
              placeholder="Paste an image link"
              aria-label="Image link"
              (keydown.enter)="useLink(urlInput.value)"
            />
            <button type="button" class="mjf-btn mjf-btn--primary mjf-btn--sm" (click)="useLink(urlInput.value)">
              Add
            </button>
          </div>

          @if (!canUpload) {
            <p class="mjf-field-hint">{{ unavailableReason }}</p>
          }
        }

        @if (error) {
          <p class="ipd-error" role="alert">{{ error }}</p>
        }
      </div>
    </div>

    <input
      #fileInput
      class="ipd-file"
      type="file"
      [accept]="accept"
      aria-label="Choose an image"
      (change)="onFileChosen(fileInput)"
    />
  `,
})
export class ImagePickerDialogComponent {
  /** What is being illustrated, for the title and the accessible name. */
  @Input() subject = 'an image';
  /** The form the asset is scoped to. Without it only the link half works. */
  @Input() formId = '';

  /** A URL was chosen — uploaded or pasted. */
  @Output() readonly picked = new EventEmitter<string>();
  /** The author dismissed the dialog without choosing. */
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly assets = inject(FormAssetService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly sizeHint = MAX_SIZE_LABEL;
  protected readonly formatsLabel = ACCEPTED_FORMATS_LABEL;

  protected dragging = false;
  protected uploading = false;
  protected percent = 0;
  protected error = '';
  protected pendingName = '';
  private dragDepth = 0;

  /** Escape closes, which is what anyone expects of a modal and costs one line. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.uploading) {
      this.closed.emit();
    }
  }

  protected get canUpload(): boolean {
    return !!this.formId && this.assets.canUpload;
  }

  /** The link half still works without an upload session, so this explains rather than blocks. */
  protected get unavailableReason(): string {
    return this.formId
      ? 'Uploading needs a signed-in MemberJunction session. Pasting a link still works.'
      : 'Save the form before uploading. Pasting a link still works.';
  }

  protected browse(): void {
    this.error = '';
    this.fileInput?.nativeElement.click();
  }

  protected useLink(raw: string): void {
    const url = raw.trim();
    if (!url) {
      this.error = 'Paste a link, or upload a file above.';
      this.cdr.markForCheck();
      return;
    }
    this.picked.emit(url);
  }

  protected async onFileChosen(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Reset immediately so re-picking the SAME file fires `change` again; without this, an author
    // who fixes a rejected image and re-chooses it sees nothing happen.
    input.value = '';
    if (file) {
      await this.screenThenUpload(file);
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
    // Nested elements each fire enter/leave, so a boolean flag flickers off the moment the
    // pointer crosses onto a child. Counting keeps the highlight steady.
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
      await this.screenThenUpload(file);
    } else {
      this.error = 'That does not look like an image file.';
      this.cdr.markForCheck();
    }
  }

  /**
   * Screen locally, then upload. The type check duplicates the server's on purpose: refusing a
   * PDF here is instant, whereas the same refusal from the server costs a round trip and, for a
   * large file, a real wait. The server's check is the one that matters for correctness.
   */
  private async screenThenUpload(file: File): Promise<void> {
    if (!isAcceptedType(file.type)) {
      this.error = `${file.name} is not ${indefinite(ACCEPTED_FORMATS_LABEL)}.`;
      this.cdr.markForCheck();
      return;
    }
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
      this.picked.emit(asset.url);
    } catch (err) {
      // Kept on screen: an upload that fails silently leaves the author with no idea whether
      // anything happened.
      this.error = err instanceof Error ? err.message : 'Upload failed.';
    } finally {
      this.uploading = false;
      this.cdr.markForCheck();
    }
  }
}

/** "PNG, JPG, GIF or WebP" reads as a list; in a sentence it needs an article. */
function indefinite(formats: string): string {
  return `a ${formats.replace(' or ', ', a ')}`;
}
