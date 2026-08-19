/**
 * Renders ONE question of any type and emits value changes. The control set is intentionally
 * native (`<input>`, `<textarea>`, `<select>`, buttons) for maximum accessibility and
 * mobile-keyboard fidelity, themed entirely by `--mjf-*` tokens.
 *
 * All 25 types are handled here via `@switch`. Only the ones needing a bespoke control get a
 * `@case`; ShortText, Email, Phone, Website, Date and Time share the `@default` input, differing
 * only in the `type`/`inputmode`/`autocomplete` triple `input-mode.ts` derives.
 *
 * `Signature` is delegated to {@link SignaturePadComponent} and then travels the SAME upload
 * path a `FileUpload` answer does — it is a file answer whose file came from a canvas.
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
import { CdkDrag, CdkDragHandle, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';

import { optionLetter } from '../../../shared/option-letter';
import { moveItem } from '../../../shared/move-item';
import {
  ADDRESS_FIELDS,
  CONTACT_INFO_FIELDS,
  isAnswerableQuestionType,
  type AnswerValue,
  type PublishedFormQuestion,
  type PublishedFormQuestionOption,
} from '@mj-biz-apps/forms-entities';

import { NgTemplateOutlet } from '@angular/common';

import { FORMS_UPLOAD_SERVICE } from '../../api/form-upload.interface';
import {
  autocompleteFor,
  compositeAutocompleteFor,
  compositeInputTypeFor,
  compositeLabelFor,
  inputModeFor,
  inputTypeFor,
} from './input-mode';
import { SignaturePadComponent } from './signature-pad.component';

/** UI state of a FileUpload control. */
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

@Component({
  selector: 'mjf-form-question',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SignaturePadComponent, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder],
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
  /**
   * The response id this form is filling in, passed through to uploads.
   *
   * It is what ties an uploaded file to this respondent's submission; the anonymous session id is
   * blank in ordinary public-link flows and cannot do that job.
   */
  public readonly responseId = input<string>('');
  /** Emits whenever the respondent changes the answer. */
  public readonly valueChange = output<AnswerValue>();

  private readonly uploader = inject(FORMS_UPLOAD_SERVICE);

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

  /**
   * The A/B/C badge for the option at this position.
   *
   * Position, never the label or the value: the badge is a way to refer to a choice out loud
   * ("pick C"), so it has to agree with what the author sees in the builder, and both sides read
   * the options in the same published order.
   */
  protected letterAt(index: number): string {
    return optionLetter(index);
  }
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

  /** False only for `Statement`, which renders as content instead of as a control. */
  protected readonly isAnswerable = computed(() => isAnswerableQuestionType(this.question().type));

  // --- OpinionScale --------------------------------------------------------
  //
  // Distinct from Rating (stars, always 1..N) in the two ways that matter to a respondent: it
  // can start at 0, and it carries a word at each end so "7" means something. Both are settings
  // rather than new columns, which is what `PublishedFormQuestion.settings` is for.

  protected readonly scaleMin = computed(() => {
    const raw = this.question().settings?.['min'];
    return typeof raw === 'number' ? Math.trunc(raw) : 1;
  });
  protected readonly scaleMax = computed(() => {
    const raw = this.question().settings?.['max'];
    const max = typeof raw === 'number' ? Math.trunc(raw) : 10;
    // A max at or below min would render an empty scale — nothing to click, no way to answer a
    // required question, and no error explaining why.
    return max > this.scaleMin() ? max : this.scaleMin() + 1;
  });
  protected readonly scalePoints = computed(() => {
    const min = this.scaleMin();
    return Array.from({ length: this.scaleMax() - min + 1 }, (_, i) => min + i);
  });
  protected readonly scaleLabelMin = computed(() => this.settingText('labelMin'));
  protected readonly scaleLabelMax = computed(() => this.settingText('labelMax'));

  // --- Legal ---------------------------------------------------------------

  /** The terms a `Legal` question asks the respondent to accept. */
  protected readonly legalTerms = computed(() => this.settingText('terms'));

  // --- Composites (Address / ContactInfo) ----------------------------------

  protected readonly compositeFields = computed<readonly string[]>(() =>
    this.question().type === 'Address' ? ADDRESS_FIELDS : CONTACT_INFO_FIELDS,
  );

  /** The composite answer as a flat string map, ignoring anything that is not a string. */
  protected readonly compositeValue = computed<Record<string, string>>(() => {
    const v = this.value();
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(v)) {
      if (typeof raw === 'string') {
        out[key] = raw;
      }
    }
    return out;
  });

  protected compositeLabel(field: string): string {
    return compositeLabelFor(field);
  }
  protected compositeAutocomplete(field: string): string {
    return compositeAutocompleteFor(field);
  }
  protected compositeInputType(field: string): string {
    return compositeInputTypeFor(field);
  }
  protected compositePart(field: string): string {
    return this.compositeValue()[field] ?? '';
  }

  /**
   * Update one part of a composite, emitting the whole object.
   *
   * Blank parts are DROPPED rather than kept as empty strings, so a respondent who tabs through
   * an optional address without typing leaves no answer at all. Keeping them would emit
   * `{line1:'', city:''}` — an object `isAnswerSupplied` correctly calls unanswered, but which
   * every reader downstream still has to receive, store and skip.
   */
  protected onComposite(field: string, raw: string): void {
    const next: Record<string, string> = { ...this.compositeValue(), [field]: raw };
    for (const key of Object.keys(next)) {
      if (next[key].trim() === '') {
        delete next[key];
      }
    }
    this.valueChange.emit(Object.keys(next).length > 0 ? next : null);
  }

  // --- Ranking -------------------------------------------------------------

  /**
   * Options in their current ranked order.
   *
   * Unranked options keep their authored position at the end, so an untouched Ranking still
   * renders a sensible list while its ANSWER stays null — which is what lets `isRequired` mean
   * "you must actually rank these" rather than being satisfied by the default order.
   */
  protected readonly rankedOptions = computed<PublishedFormQuestionOption[]>(() => {
    const remaining = new Map(this.question().options.map((o) => [o.value, o]));
    const ordered: PublishedFormQuestionOption[] = [];
    for (const value of this.selectedValues()) {
      const option = remaining.get(value);
      if (option) {
        ordered.push(option);
        remaining.delete(value);
      }
    }
    for (const option of this.question().options) {
      if (remaining.has(option.value)) {
        ordered.push(option);
      }
    }
    return ordered;
  });

  /** Move one option up (-1) or down (+1) the ranking, emitting the full new order. */
  /**
   * A dragged item was dropped. Distinct from {@link moveRank}: a button SWAPS with its
   * neighbour, a drag LIFTS an item out and puts it down, shifting everything in between.
   */
  protected onRankDrop(from: number, to: number): void {
    const order = moveItem(this.rankedOptions().map((o) => o.value), from, to);
    this.valueChange.emit(order);
  }

  protected moveRank(index: number, delta: number): void {
    const order = this.rankedOptions().map((o) => o.value);
    const target = index + delta;
    if (target < 0 || target >= order.length) {
      return;
    }
    [order[index], order[target]] = [order[target], order[index]];
    this.valueChange.emit(order);
  }

  // --- Matrix --------------------------------------------------------------
  //
  // Rows and columns share the option list, discriminated by `matrixAxis`. An option with no
  // axis is a Row, which is what makes a Matrix authored before the axis existed — or by an
  // importer that does not set it — degrade to a plain list of rows rather than to nothing.

  protected readonly matrixRows = computed(() =>
    this.question().options.filter((o) => (o.matrixAxis ?? 'Row') === 'Row'),
  );
  protected readonly matrixColumns = computed(() =>
    this.question().options.filter((o) => o.matrixAxis === 'Column'),
  );

  private readonly matrixValue = computed<Record<string, string>>(() => {
    const v = this.value();
    if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [row, picked] of Object.entries(v)) {
      if (typeof picked === 'string') {
        out[row] = picked;
      } else if (Array.isArray(picked) && typeof picked[0] === 'string') {
        // Tolerate the multi-select spelling: a form switched from multi to single after
        // collecting answers must still show what those respondents chose.
        out[row] = picked[0];
      }
    }
    return out;
  });

  protected isMatrixSelected(row: string, column: string): boolean {
    return this.matrixValue()[row] === column;
  }

  /** Select (or clear) one row's column. */
  protected onMatrix(row: string, column: string): void {
    const next: Record<string, string> = { ...this.matrixValue() };
    if (next[row] === column) {
      delete next[row];
    } else {
      next[row] = column;
    }
    this.valueChange.emit(Object.keys(next).length > 0 ? next : null);
  }

  // --- Signature -----------------------------------------------------------

  /** A drawn signature takes the ordinary file-answer path from here. */
  protected async onSignatureDrawn(file: File): Promise<void> {
    this.lastFile = file;
    await this.uploadFile(file);
  }

  protected onSignatureCleared(): void {
    this.lastFile = null;
    this.resetUploadState();
    this.valueChange.emit(null);
  }

  /** Read a string setting off the question, or '' when unset or the wrong type. */
  private settingText(key: string): string {
    const raw = this.question().settings?.[key];
    return typeof raw === 'string' ? raw : '';
  }

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
        this.responseId() || undefined,
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
