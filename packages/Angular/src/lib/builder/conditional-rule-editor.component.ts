import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  ConditionalCondition,
  ConditionalOperator,
  ConditionalRule,
  ConditionValue,
} from '@mj-biz-apps/forms-entities';
import { BUILDER_CONTROL_STYLES } from './builder-styles';

const CONDITIONAL_EDITOR_CSS = /* css */ `
.cre { display: flex; flex-direction: column; gap: 10px; }
.cre-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-secondary); cursor: pointer; }
.cre-empty { font-size: 0.8125rem; color: var(--mj-text-muted); margin: 0; }
.cre-combinator { display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; color: var(--mj-text-secondary); flex-wrap: wrap; }
.cre-seg { font: inherit; font-size: 0.8125rem; padding: 3px 10px; cursor: pointer; border-radius: var(--mj-radius-full, 999px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-secondary); }
.cre-seg.is-on { background: var(--mj-brand-primary); color: var(--mj-brand-on-primary, var(--mj-text-inverse)); border-color: var(--mj-brand-primary); }
.cre-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cre-input { flex: 1 1 120px; min-width: 0; }
.cre-value { flex: 1 1 120px; }
.cre-remove { flex: none; width: 32px; height: 32px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-muted); }
.cre-remove:hover { background: var(--mj-bg-surface-hover); color: var(--mj-status-error, var(--mj-color-error-600)); }
.cre-add { align-self: flex-start; font: inherit; font-size: 0.8125rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px dashed var(--mj-border-default); background: transparent; color: var(--mj-brand-primary); }
.cre-add:hover { background: var(--mj-bg-surface-hover); }
`;

/** A question the rule can reference (preceding questions only). */
export interface ConditionalSourceQuestion {
  id: string;
  prompt: string;
}

interface OperatorOption {
  op: ConditionalOperator;
  label: string;
  /** Whether this operator needs a comparison value entered. */
  needsValue: boolean;
}

const OPERATORS: ReadonlyArray<OperatorOption> = [
  { op: 'equals', label: 'equals', needsValue: true },
  { op: 'notEquals', label: 'does not equal', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'in', label: 'is one of', needsValue: true },
  { op: 'notIn', label: 'is not one of', needsValue: true },
  { op: 'greaterThan', label: 'is greater than', needsValue: true },
  { op: 'lessThan', label: 'is less than', needsValue: true },
  { op: 'isAnswered', label: 'is answered', needsValue: false },
];

/**
 * Friendly editor for a {@link ConditionalRule} `show` group (S2). Emits a new rule
 * object on every change; the parent persists it. Phase-1 supports a single
 * combinator (`all` / `any`) over a flat list of leaf conditions — no nesting, in
 * line with FORMS_BUILD_PLAN §6.
 *
 * The editor never mutates the input; it rebuilds the rule and emits it, so change
 * detection stays predictable.
 */
@Component({
  selector: 'mjf-conditional-rule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './conditional-rule-editor.component.html',
  styles: [BUILDER_CONTROL_STYLES, CONDITIONAL_EDITOR_CSS],
})
export class ConditionalRuleEditorComponent {
  /** Questions that may be referenced (typically those preceding the current one). */
  @Input() sources: ConditionalSourceQuestion[] = [];

  @Input()
  set rule(value: ConditionalRule | undefined) {
    this._enabled = !!value?.show;
    this._combinator = value?.show?.any ? 'any' : 'all';
    const group = value?.show?.any ?? value?.show?.all ?? [];
    this._conditions = group.map((c) => ({ ...c }));
  }

  @Output() ruleChange = new EventEmitter<ConditionalRule | undefined>();

  protected readonly operators = OPERATORS;
  protected _enabled = false;
  protected _combinator: 'all' | 'any' = 'all';
  protected _conditions: ConditionalCondition[] = [];

  protected operatorNeedsValue(op: ConditionalOperator): boolean {
    return OPERATORS.find((o) => o.op === op)?.needsValue ?? true;
  }

  protected toggleEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (enabled && this._conditions.length === 0) {
      this.addCondition();
    }
    this.emit();
  }

  protected setCombinator(combinator: 'all' | 'any'): void {
    this._combinator = combinator;
    this.emit();
  }

  protected addCondition(): void {
    const firstSource = this.sources[0];
    this._conditions = [
      ...this._conditions,
      { questionId: firstSource?.id ?? '', op: 'equals', value: '' },
    ];
    this.emit();
  }

  protected removeCondition(index: number): void {
    this._conditions = this._conditions.filter((_, i) => i !== index);
    if (this._conditions.length === 0) {
      this._enabled = false;
    }
    this.emit();
  }

  protected setQuestion(index: number, questionId: string): void {
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, questionId } : c,
    );
    this.emit();
  }

  protected setOperator(index: number, raw: string): void {
    const op = this.toOperator(raw);
    if (!op) {
      return;
    }
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, op } : c,
    );
    this.emit();
  }

  /** Narrow a raw <select> value to a known operator (it always is, from our own list). */
  private toOperator(raw: string): ConditionalOperator | undefined {
    return OPERATORS.find((o) => o.op === raw)?.op;
  }

  protected setValue(index: number, raw: string): void {
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, value: this.coerceValue(c.op, raw) } : c,
    );
    this.emit();
  }

  protected valueAsString(condition: ConditionalCondition): string {
    if (condition.value === undefined) {
      return '';
    }
    if (Array.isArray(condition.value)) {
      return condition.value.join(', ');
    }
    return String(condition.value);
  }

  /** `in` / `notIn` take a comma-separated list; everything else a scalar string. */
  private coerceValue(op: ConditionalOperator, raw: string): ConditionValue {
    if (op === 'in' || op === 'notIn') {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return raw;
  }

  private emit(): void {
    if (!this._enabled || this._conditions.length === 0) {
      this.ruleChange.emit(undefined);
      return;
    }
    const conditions = this._conditions
      .filter((c) => c.questionId.length > 0)
      .map((c) => this.normaliseCondition(c));
    if (conditions.length === 0) {
      this.ruleChange.emit(undefined);
      return;
    }
    const rule: ConditionalRule = {
      show: this._combinator === 'any' ? { any: conditions } : { all: conditions },
    };
    this.ruleChange.emit(rule);
  }

  /** Drop the value entirely for value-less operators (e.g. `isAnswered`). */
  private normaliseCondition(c: ConditionalCondition): ConditionalCondition {
    if (!this.operatorNeedsValue(c.op)) {
      return { questionId: c.questionId, op: c.op };
    }
    return { questionId: c.questionId, op: c.op, value: c.value };
  }
}
