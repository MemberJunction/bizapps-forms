import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { FormQuestionType, ValidationRule } from '@mj-biz-apps/forms-entities';
import { BUILDER_CONTROL_STYLES } from './builder-styles';

const VALIDATION_EDITOR_CSS = /* css */ `
.vre { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.vre-full { grid-column: 1 / -1; }
.vre-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--mj-text-secondary); margin-bottom: 3px; }
.vre-empty { grid-column: 1 / -1; font-size: 0.8125rem; color: var(--mj-text-muted); margin: 0; }
`;

/**
 * Friendly editor for a {@link ValidationRule} (S2). Shows only the constraints that
 * make sense for the question's type: length + pattern for text-ish types, min/max
 * for numeric types. `required` is intentionally absent — it lives on the question's
 * IsRequired, not in the validation rule. Emits a fresh rule (or `undefined` when
 * empty) on every change.
 */
@Component({
  selector: 'mjf-validation-rule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './validation-rule-editor.component.html',
  styles: [BUILDER_CONTROL_STYLES, VALIDATION_EDITOR_CSS],
})
export class ValidationRuleEditorComponent {
  @Input() questionType: FormQuestionType = 'ShortText';

  @Input()
  set rule(value: ValidationRule | undefined) {
    this._rule = value ? { ...value } : {};
  }

  @Output() ruleChange = new EventEmitter<ValidationRule | undefined>();

  protected _rule: ValidationRule = {};

  protected get showLength(): boolean {
    return this.questionType === 'ShortText' || this.questionType === 'LongText';
  }

  protected get showRange(): boolean {
    return (
      this.questionType === 'Number' ||
      this.questionType === 'Rating' ||
      this.questionType === 'NPS'
    );
  }

  protected get showPattern(): boolean {
    return (
      this.questionType === 'ShortText' ||
      this.questionType === 'Phone' ||
      this.questionType === 'Email'
    );
  }

  protected get hasAnyControl(): boolean {
    return this.showLength || this.showRange || this.showPattern;
  }

  protected setNumber(field: 'minLength' | 'maxLength' | 'min' | 'max', raw: string): void {
    const next: ValidationRule = { ...this._rule };
    const parsed = raw.trim() === '' ? undefined : Number(raw);
    if (parsed === undefined || Number.isNaN(parsed)) {
      delete next[field];
    } else {
      next[field] = parsed;
    }
    this._rule = next;
    this.emit();
  }

  protected setPattern(raw: string): void {
    const next: ValidationRule = { ...this._rule };
    const trimmed = raw.trim();
    if (trimmed === '') {
      delete next.pattern;
    } else {
      next.pattern = trimmed;
    }
    this._rule = next;
    this.emit();
  }

  protected setPatternMessage(raw: string): void {
    const next: ValidationRule = { ...this._rule };
    const trimmed = raw.trim();
    if (trimmed === '') {
      delete next.patternMessage;
    } else {
      next.patternMessage = trimmed;
    }
    this._rule = next;
    this.emit();
  }

  private emit(): void {
    this.ruleChange.emit(Object.keys(this._rule).length === 0 ? undefined : { ...this._rule });
  }
}
