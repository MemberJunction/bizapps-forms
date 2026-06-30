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
  input,
  output,
} from '@angular/core';
import type { AnswerValue, PublishedFormQuestion } from '@mj-biz-apps/forms-entities';

import { autocompleteFor, inputModeFor, inputTypeFor } from './input-mode';

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
  /** Emits whenever the respondent changes the answer. */
  public readonly valueChange = output<AnswerValue>();

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

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // FileUpload answers carry the `MJ: Files` id. Real upload is wired by the host
    // app (it has the authenticated file-storage client); the widget emits the
    // selected file's name as a placeholder id until that handshake lands. Emitting
    // a non-empty string keeps required-validation honest in the demo path.
    this.valueChange.emit(file ? file.name : null);
  }
}
