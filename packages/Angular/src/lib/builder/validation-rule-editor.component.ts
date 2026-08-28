import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { FormQuestionType, ValidationRule } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { rangeConflict } from './validation-bounds';

const VALIDATION_EDITOR_CSS = /* css */ `
.vre { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.vre-full { grid-column: 1 / -1; }
.vre-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--mj-text-secondary); margin-bottom: 3px; }
.vre-empty { grid-column: 1 / -1; font-size: 0.8125rem; color: var(--mj-text-muted); margin: 0; }
.vre-conflict { grid-column: 1 / -1; }
.vre-conflict p { margin: 0; }
`;

/**
 * Friendly editor for a {@link ValidationRule} (S2). Shows only the constraints that
 * make sense for the question's type: length + pattern for text-ish types, min/max
 * for numeric types. `required` is intentionally absent — it lives on the question's
 * IsRequired, not in the validation rule.
 *
 * Emits a fresh rule (or `undefined` when empty) on every change, with ONE exception: a pair of
 * bounds that no answer could satisfy is held on screen and never handed upstream. See
 * {@link emit} and `validation-bounds.ts`.
 */
@Component({
  selector: 'mjf-validation-rule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './validation-rule-editor.component.html',
  styles: [FORMS_UI_CSS, VALIDATION_EDITOR_CSS],
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

  /**
   * Why the two bounds on screen can never both be satisfied, or `null` when they can.
   *
   * Derived from the rule rather than recorded when an edit is refused, so it speaks for a
   * contradiction the author has just typed AND for one they have inherited: a form authored
   * before this check existed, or written by mj-sync metadata or the AI builder, states its
   * problem the moment its question is opened instead of sitting there looking correct.
   *
   * No question type shows both pairs — length is the text types, range is the numeric ones — so
   * this reports at most one thing. It still asks about both rather than picking one from the
   * type, because a pair that stopped being shown is a pair nobody can fix, and reporting the
   * one on screen is the only advice worth giving.
   */
  protected get conflict(): string | null {
    return (
      (this.showLength ? rangeConflict(this._rule, 'length') : null) ??
      (this.showRange ? rangeConflict(this._rule, 'value') : null)
    );
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

  /**
   * Hand the rule upstream — unless its bounds contradict each other.
   *
   * Refusing HERE rather than in {@link setNumber} covers every path out of this editor: a
   * pattern typed while a length pair is impossible would otherwise carry that pair along with
   * it, and `minLength`/`maxLength`/`pattern` all live on one ShortText question. Nothing is
   * swallowed silently — {@link conflict} is on screen for as long as the refusal lasts, and the
   * message says the rule is not being saved until the pair is fixed.
   *
   * What the author typed stays in `_rule`, unemitted, so the two boxes still show the numbers
   * they are being asked to reconcile. That only holds because the host's `[rule]` binding is
   * stable while the stored rule is unchanged — see `QuestionEditorComponent.validationRule`.
   */
  private emit(): void {
    if (this.conflict !== null) {
      return;
    }
    this.ruleChange.emit(Object.keys(this._rule).length === 0 ? undefined : { ...this._rule });
  }
}
