import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ConditionalRule, ValidationRule } from '@mj-biz-apps/forms-entities';
import { BUILDER_CONTROL_STYLES } from './builder-styles';
import type { QuestionNode } from './builder-models';
import { questionTypeHasOptions, questionTypeMeta } from './question-type-catalog';
import {
  ConditionalRuleEditorComponent,
  type ConditionalSourceQuestion,
} from './conditional-rule-editor.component';
import { ValidationRuleEditorComponent } from './validation-rule-editor.component';
import {
  parseConditionalRule,
  parseValidationRule,
  serializeConditionalRule,
  serializeValidationRule,
} from './json-fields';

const QUESTION_EDITOR_CSS = /* css */ `
.qe { display: flex; flex-direction: column; gap: 4px; }
.qe-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.qe-section { border-top: 1px solid var(--mj-border-subtle); padding-top: 14px; margin-top: 6px; }
.qe-section-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); margin: 0 0 10px; }
.qe-required { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.qe-required span { font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-secondary); }
.qe-options { display: flex; flex-direction: column; gap: 6px; }
.qe-option { display: flex; align-items: center; gap: 6px; }
.qe-option .mjf-input { flex: 1; }
.qe-opt-remove { flex: none; width: 30px; height: 30px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-muted); }
.qe-opt-remove:hover { background: var(--mj-bg-surface-hover); color: var(--mj-status-error, var(--mj-color-error-600)); }
.qe-empty { font-size: 0.875rem; color: var(--mj-text-muted); padding: 24px 0; text-align: center; }
`;

/**
 * The right-hand properties panel for the selected question. Edits prompt, help
 * text, required, options (for choice types), the conditional-show rule and the
 * validation rule. All edits are written onto the live entity object and announced
 * via {@link questionChanged}; the parent persists.
 */
@Component({
  selector: 'mjf-question-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ConditionalRuleEditorComponent,
    ValidationRuleEditorComponent,
  ],
  templateUrl: './question-editor.component.html',
  styles: [BUILDER_CONTROL_STYLES, QUESTION_EDITOR_CSS],
})
export class QuestionEditorComponent {
  @Input() node: QuestionNode | null = null;
  /** Questions preceding the selected one — valid sources for a conditional rule. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];

  /** Emitted whenever a field on the question entity changed (parent persists). */
  @Output() questionChanged = new EventEmitter<QuestionNode>();
  /** Emitted when an option is added (parent persists via the state service). */
  @Output() addOptionRequested = new EventEmitter<QuestionNode>();
  /** Emitted when an option should be removed. */
  @Output() removeOptionRequested = new EventEmitter<{ node: QuestionNode; optionIndex: number }>();

  protected get hasOptions(): boolean {
    return this.node ? questionTypeHasOptions(this.node.entity.QuestionType) : false;
  }

  protected get typeLabel(): string {
    return this.node ? questionTypeMeta(this.node.entity.QuestionType).label : '';
  }

  protected get typeIcon(): string {
    return this.node ? questionTypeMeta(this.node.entity.QuestionType).icon : '';
  }

  protected get conditionalRule(): ConditionalRule | undefined {
    return this.node ? parseConditionalRule(this.node.entity.ConditionalRule) : undefined;
  }

  protected get validationRule(): ValidationRule | undefined {
    return this.node ? parseValidationRule(this.node.entity.ValidationRule) : undefined;
  }

  protected setPrompt(value: string): void {
    if (!this.node) return;
    this.node.entity.Prompt = value;
    this.questionChanged.emit(this.node);
  }

  protected setHelpText(value: string): void {
    if (!this.node) return;
    this.node.entity.HelpText = value.trim() === '' ? null : value;
    this.questionChanged.emit(this.node);
  }

  protected toggleRequired(): void {
    if (!this.node) return;
    this.node.entity.IsRequired = !this.node.entity.IsRequired;
    this.questionChanged.emit(this.node);
  }

  protected setOptionLabel(index: number, value: string): void {
    if (!this.node) return;
    this.node.options[index].Label = value;
    this.questionChanged.emit(this.node);
  }

  protected addOption(): void {
    if (!this.node) return;
    this.addOptionRequested.emit(this.node);
  }

  protected removeOption(index: number): void {
    if (!this.node) return;
    this.removeOptionRequested.emit({ node: this.node, optionIndex: index });
  }

  protected onConditionalChange(rule: ConditionalRule | undefined): void {
    if (!this.node) return;
    this.node.entity.ConditionalRule = serializeConditionalRule(rule);
    this.questionChanged.emit(this.node);
  }

  protected onValidationChange(rule: ValidationRule | undefined): void {
    if (!this.node) return;
    this.node.entity.ValidationRule = serializeValidationRule(rule);
    this.questionChanged.emit(this.node);
  }
}
