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
import { FORMS_UI_CSS } from '../shared';
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
:host { display: block; }
.qe { display: flex; flex-direction: column; gap: var(--mjf-gap); }

.qe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mjf-gap-sm);
  padding-bottom: var(--mjf-gap);
  border-bottom: 1px solid var(--mjf-rule);
}
.qe-head-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }

/* Groups are separated by space, not by a rule per group. One divider under the
   panel title is enough structure; four more make a 340px column look like a form
   made of forms. */
.qe-section { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); padding-top: var(--mjf-gap-sm); }
.qe-section-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

.qe-required {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mjf-gap-sm);
  padding: 10px 12px;
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
}
.qe-required span { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }

.qe-options { display: flex; flex-direction: column; gap: 6px; }
.qe-option { display: flex; align-items: center; gap: 6px; }
.qe-option .mjf-input { flex: 1; }
.qe-opt-remove {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  border-radius: var(--mjf-radius-sm);
  border: none;
  background: transparent;
  color: var(--mj-text-muted);
  transition: background var(--mjf-ease), color var(--mjf-ease);
}
.qe-opt-remove:hover { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
.qe-opt-remove:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

/* Nothing selected. The panel is 340px of empty otherwise, and empty space with no
   explanation reads as a loading failure. */
.qe-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: 56px var(--mjf-card-pad);
  text-align: center;
}
.qe-empty i { font-size: 1.25rem; color: var(--mj-text-disabled); }
.qe-empty-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }
.qe-empty p { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); max-width: 30ch; }
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
  styles: [FORMS_UI_CSS, QUESTION_EDITOR_CSS],
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
