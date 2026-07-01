/**
 * Renders ONE question of any Phase-1 type and emits value changes. The control set
 * is intentionally native (`<input>`, `<textarea>`, `<select>`, buttons) for maximum
 * accessibility and mobile-keyboard fidelity, themed entirely by `--mjf-*` tokens.
 *
 * All 15 §5.3 types are handled here via `@switch`:
 *   ShortText · LongText · Email · Phone · Number · SingleChoice · MultiChoice ·
 *   Dropdown · Rating · NPS · YesNo · Date · Time · FileUpload · Statement.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { FormUploadService } from '../../api/form-upload.service';
import { autocompleteFor, inputModeFor, inputTypeFor } from './input-mode';

/** UI state of a FileUpload control. */
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

@Component({
  selector: 'mjf-form-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-question.component.html',
  styleUrls: ['./form-question.component.css'],
})
export class FormQuestionComponent {
  /** The published question to render. */
  public readonly question = input.required<PublishedFormQuestion>();
  /** Current value (controlled). */
  public readonly value = input<AnswerValue>(undefined);
  /** Validation message to show, or `null` when valid / untouched. */
  public readonly errorMessage = input<string | null>(null);
  /** Distribution slug — needed to scope a FileUpload's upload to the current form. */
  public readonly distributionSlug = input<string>('');
  /** Emits whenever the respondent changes the answer. */
  public readonly valueChange = output<AnswerValue>();

  private readonly uploader = inject(FormUploadService);

  /** FileUpload UI state (upload lifecycle for the current file). */
  protected readonly uploadStatus = signal<UploadStatus>('idle');
  /** Progress 0–1 while uploading, or `null` for an indeterminate phase. */
  protected readonly uploadProgress = signal<number | null>(null);
  /** Display name of the selected/uploaded file (the stored answer is the fileId). */
  protected readonly uploadFileName = signal<string>('');
  /** Inline, respondent-facing upload error, or `null`. */
  protected readonly uploadError = signal<string | null>(null);
  /** Whole-number progress percent for the aria-valuenow / label. */
  protected readonly uploadPercent = computed(() => {
    const p = this.uploadProgress();
    return p === null ? null : Math.round(p * 100);
  });

  protected readonly inputId = computed(() => `mjf-q-${this.question().id}`);
  protected readonly errorId = computed(() => `${this.inputId()}-error`);
  protected readonly helpId = computed(() => `${this.inputId()}-help`);
  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.question().helpText) {
      ids.push(this.helpId());
    }
    if (this.errorMessage()) {
      ids.push(this.errorId());
    }
    return ids.length ? ids.join(' ') : null;
  });

  protected readonly inputType = computed(() => inputTypeFor(this.question().type));
  protected readonly inputMode = computed(() => inputModeFor(this.question().type));
  protected readonly autocomplete = computed(() => autocompleteFor(this.question().type));

  protected readonly textValue = computed(() => {
    const v = this.value();
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  });

  protected readonly selectedValues = computed<string[]>(() => {
    const v = this.value();
    if (Array.isArray(v)) {
      return v.map((x) => String(x));
    }
    return [];
  });

  /** Rating scale max (default 5); NPS is fixed 0–10 handled in template. */
  protected readonly ratingMax = computed(() => {
    const raw = this.question().settings?.['max'];
    return typeof raw === 'number' && raw > 0 ? raw : 5;
  });
  protected readonly ratingScale = computed(() =>
    Array.from({ length: this.ratingMax() }, (_, i) => i + 1),
  );
  protected readonly npsScale = Array.from({ length: 11 }, (_, i) => i);

  protected readonly placeholder = computed(() => {
    const raw = this.question().settings?.['placeholder'];
    return typeof raw === 'string' ? raw : '';
  });
  protected readonly textRows = computed(() => {
    const raw = this.question().settings?.['rows'];
    return typeof raw === 'number' && raw > 0 ? raw : 4;
  });
  protected readonly fileAccept = computed(() => {
    const raw = this.question().settings?.['accept'];
    return typeof raw === 'string' ? raw : '';
  });

  protected readonly numericValue = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? v : null;
  });
  protected readonly booleanValue = computed(() => {
    const v = this.value();
    return typeof v === 'boolean' ? v : null;
  });

  protected onText(raw: string): void {
    this.valueChange.emit(raw === '' ? null : raw);
  }

  protected onNumber(raw: string): void {
    if (raw.trim() === '') {
      this.valueChange.emit(null);
      return;
    }
    const n = Number(raw);
    this.valueChange.emit(Number.isFinite(n) ? n : raw);
  }

  protected onSingleChoice(value: string): void {
    this.valueChange.emit(value);
  }

  protected onMultiToggle(value: string): void {
    const current = new Set(this.selectedValues());
    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }
    const next = [...current];
    this.valueChange.emit(next.length ? next : null);
  }

  protected isSelected(value: string): boolean {
    return this.selectedValues().includes(value);
  }

  protected onRating(score: number): void {
    this.valueChange.emit(this.numericValue() === score ? null : score);
  }

  protected onYesNo(value: boolean): void {
    this.valueChange.emit(this.booleanValue() === value ? null : value);
  }

  /** Last selected file, retained so the respondent can retry a failed upload. */
  private lastFile: File | null = null;

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0] ?? null;
    if (!file) {
      // Cleared the picker — drop the answer + any prior upload state.
      this.lastFile = null;
      this.resetUploadState();
      this.valueChange.emit(null);
      return;
    }
    this.lastFile = file;
    await this.uploadFile(file);
  }

  /** Re-run the upload for the previously-selected file after a failure. */
  protected async retryUpload(): Promise<void> {
    if (this.lastFile) {
      await this.uploadFile(this.lastFile);
    }
  }

  /**
   * Upload one file to the anonymous `/forms/upload` endpoint and store the returned
   * `fileId` as the answer. The answer is cleared while the upload is in flight so a
   * required FileUpload cannot be satisfied by a not-yet-stored file.
   */
  private async uploadFile(file: File): Promise<void> {
    this.uploadFileName.set(file.name);
    this.uploadError.set(null);
    this.uploadStatus.set('uploading');
    this.uploadProgress.set(0);
    // Clear any prior fileId until the new upload confirms.
    this.valueChange.emit(null);
    try {
      const result = await this.uploader.upload(
        file,
        this.distributionSlug(),
        this.question().id,
        (fraction) => this.uploadProgress.set(fraction),
      );
      this.uploadStatus.set('done');
      this.uploadProgress.set(1);
      this.valueChange.emit(result.fileId);
    } catch (err) {
      this.uploadStatus.set('error');
      this.uploadProgress.set(null);
      this.uploadError.set(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      this.valueChange.emit(null);
    }
  }

  private resetUploadState(): void {
    this.uploadStatus.set('idle');
    this.uploadProgress.set(null);
    this.uploadFileName.set('');
    this.uploadError.set(null);
  }
}
