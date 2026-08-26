import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  ConditionalCondition,
  ConditionalGroup,
  ConditionalOperator,
  ConditionValue,
} from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import {
  OPERATOR_CHOICES,
  canAddCondition as groupHasRoom,
  SCORE_SOURCE_ID,
  coerceConditionValue,
  operatorNeedsValue as operatorTakesValue,
  toggleMembership,
  valueEditorKind,
  type ConditionalSourceOption,
  type ConditionalSourceQuestion,
  type ValueEditorKind,
} from './condition-sources';

const CONDITIONAL_EDITOR_CSS = /* css */ `
.cre { display: flex; flex-direction: column; gap: var(--mjf-gap); }
.cre-empty { font-size: var(--mjf-meta); color: var(--mj-text-muted); margin: 0; }

/* The conditions live in their own framed group, the way the reference designs box "If" apart
   from "Then": it says where the rule starts and stops, which a bare stack of selects does not. */
.cre-group {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  padding: var(--mjf-card-pad);
  background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
}

.cre-combinator { display: flex; align-items: center; gap: var(--mjf-gap-sm); font-size: var(--mjf-meta); color: var(--mj-text-secondary); flex-wrap: wrap; }
.cre-seg { font: inherit; font-size: var(--mjf-meta); font-weight: 600; min-height: 30px; padding: 4px 14px; cursor: pointer; border-radius: var(--mjf-radius-pill); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-secondary); }
.cre-seg.is-on { background: var(--mj-brand-primary); color: var(--mj-brand-on-primary, var(--mj-text-inverse)); border-color: var(--mj-brand-primary); }
.cre-seg:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }

/* One condition per row on a wide dialog, stacked on a narrow one. The three controls are
   given real widths rather than an equal split: the question prompt is the long one, and
   truncating it to match the operator is what made the rail version unreadable. */
.cre-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.6fr) auto;
  gap: var(--mjf-gap-sm);
  align-items: center;
}
.cre-row + .cre-row { padding-top: var(--mjf-gap); border-top: 1px solid var(--mj-border-subtle); }
.cre-input { min-width: 0; }
.cre-value { min-width: 0; }
.cre-remove {
  flex: none;
  width: var(--mjf-tap);
  height: var(--mjf-tap);
  cursor: pointer;
  border-radius: var(--mjf-radius-sm);
  border: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface);
  color: var(--mj-text-muted);
}
.cre-remove:hover { background: var(--mj-bg-surface-hover); color: var(--mj-status-error, var(--mj-color-error-600)); }
.cre-remove:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.cre-add {
  align-self: flex-start;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  min-height: var(--mjf-tap);
  padding: 8px 14px;
  cursor: pointer;
  border-radius: var(--mjf-radius-sm);
  border: 1px dashed var(--mj-border-default);
  background: transparent;
  color: var(--mj-brand-primary);
}
.cre-add:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-brand-primary); }
.cre-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }

.cre-checklist { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); min-width: 0; }
.cre-check { display: inline-flex; align-items: center; gap: var(--mjf-gap-sm); font-size: var(--mjf-meta); color: var(--mj-text-secondary); cursor: pointer; }
.cre-check input { accent-color: var(--mj-brand-primary); }

/* Below the dialog's two-column comfort the row becomes a stack: three side-by-side selects at
   phone width are the cramped layout this whole change exists to escape. */
@media (max-width: 640px) {
  .cre-row { grid-template-columns: minmax(0, 1fr) auto; }
  .cre-row > .cre-input:first-child { grid-column: 1 / -1; }
  .cre-row + .cre-row { padding-top: var(--mjf-gap); }
}
`;

/**
 * Friendly editor for ONE {@link ConditionalGroup} — a single combinator (`all` / `any`) over a
 * flat list of leaf conditions, no nesting, in line with FORMS_BUILD_PLAN §6.
 *
 * Verb-agnostic on purpose (RULES_AND_BRANCHING_PLAN §3): the rules panel hosts one of these
 * inside every rule card — "Show only if", and in later phases "Require if" and the rest — so
 * this component knows nothing about which verb its group drives, and the card owns existence
 * (there is no enable toggle here; removing the card is how a rule is turned off).
 *
 * The editor never mutates the input; it rebuilds the group and emits it (or `undefined` while
 * no condition names a question), so change detection stays predictable and an unfinished rule
 * never persists.
 */
@Component({
  selector: 'mjf-conditional-rule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './conditional-rule-editor.component.html',
  styles: [FORMS_UI_CSS, CONDITIONAL_EDITOR_CSS],
})
export class ConditionalRuleEditorComponent {
  /** Questions that may be referenced (typically those preceding the current one). */
  @Input() sources: ConditionalSourceQuestion[] = [];

  @Input()
  set group(value: ConditionalGroup | undefined) {
    this._combinator = value?.any ? 'any' : 'all';
    const conditions = value?.any ?? value?.all ?? [];
    this._conditions = conditions.map((c) => ({ ...c }));
  }

  @Output() groupChange = new EventEmitter<ConditionalGroup | undefined>();

  protected readonly operators = OPERATOR_CHOICES;
  protected _combinator: 'all' | 'any' = 'all';
  protected _conditions: ConditionalCondition[] = [];

  protected operatorNeedsValue(op: ConditionalOperator): boolean {
    return operatorTakesValue(op);
  }

  /** Which editor this condition's value gets — see {@link valueEditorKind}. */
  protected kindFor(condition: ConditionalCondition): ValueEditorKind {
    return valueEditorKind(condition.op, this.optionsFor(condition).length > 0);
  }

  /** The selectable options of this condition's source question ([] for free-input sources). */
  protected optionsFor(condition: ConditionalCondition): ConditionalSourceOption[] {
    if (condition.source === 'score') {
      return [];
    }
    return this.sources.find((s) => s.id === condition.questionId)?.options ?? [];
  }

  /**
   * A stored scalar value no longer among the source's options — surfaced as an extra select
   * entry so the picker shows the truth instead of silently blanking, and the rule keeps its
   * (now never-matching) value until the author changes it.
   */
  protected staleValue(condition: ConditionalCondition): string | null {
    if (Array.isArray(condition.value)) {
      return null;
    }
    const current = this.valueAsString(condition);
    if (current.length === 0) {
      return null;
    }
    return this.optionsFor(condition).some((o) => o.value === current) ? null : current;
  }

  protected isChecked(condition: ConditionalCondition, optionValue: string): boolean {
    if (!Array.isArray(condition.value)) {
      return false;
    }
    return condition.value.some((v) => String(v) === optionValue);
  }

  protected toggleValue(index: number, optionValue: string, checked: boolean): void {
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, value: toggleMembership(c.value, optionValue, checked) } : c,
    );
    this.emit();
  }

  protected setCombinator(combinator: 'all' | 'any'): void {
    this._combinator = combinator;
    this.emit();
  }

  /** Whether the "Add condition" button is offered — see {@link groupHasRoom}. */
  protected get canAddCondition(): boolean {
    return groupHasRoom(this._conditions.length);
  }

  protected addCondition(): void {
    if (!this.canAddCondition) {
      return; // the button is hidden at the cap; this is the guard for every other route in
    }
    this._conditions = [
      ...this._conditions,
      conditionForSource(this.sources[0]?.id ?? '', 'equals', ''),
    ];
    this.emit();
  }

  /** What the question <select> shows for a condition — the score sentinel for score reads. */
  protected questionSelectValue(condition: ConditionalCondition): string {
    return condition.source === 'score' ? SCORE_SOURCE_ID : (condition.questionId ?? '');
  }

  protected removeCondition(index: number): void {
    this._conditions = this._conditions.filter((_, i) => i !== index);
    this.emit();
  }

  protected setQuestion(index: number, selectedId: string): void {
    this._conditions = this._conditions.map((c, i) => {
      if (i !== index || this.questionSelectValue(c) === selectedId) {
        return c;
      }
      // A new source means a new value domain — carrying the old value across would leave the
      // picker showing one question's option against another question's answers.
      return conditionForSource(selectedId, c.op, coerceConditionValue(c.op, ''));
    });
    this.emit();
  }

  protected setOperator(index: number, raw: string): void {
    const op = this.toOperator(raw);
    if (!op) {
      return;
    }
    // Re-coerce the value for the new operator, so switching scalar <-> membership does not
    // strand an array value on `equals` (which compares it as never-matching).
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, op, value: coerceConditionValue(op, this.valueAsString(c)) } : c,
    );
    this.emit();
  }

  /** Narrow a raw <select> value to a known operator (it always is, from our own list). */
  private toOperator(raw: string): ConditionalOperator | undefined {
    return OPERATOR_CHOICES.find((o) => o.op === raw)?.op;
  }

  protected setValue(index: number, raw: string): void {
    this._conditions = this._conditions.map((c, i) =>
      i === index ? { ...c, value: coerceConditionValue(c.op, raw) } : c,
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

  private emit(): void {
    const conditions = this._conditions
      .filter((c) => c.source === 'score' || (c.questionId ?? '').length > 0)
      .map((c) => this.normaliseCondition(c));
    if (conditions.length === 0) {
      this.groupChange.emit(undefined);
      return;
    }
    this.groupChange.emit(
      this._combinator === 'any' ? { any: conditions } : { all: conditions },
    );
  }

  /** Drop the value for value-less operators, and every key the condition's source doesn't use. */
  private normaliseCondition(c: ConditionalCondition): ConditionalCondition {
    const base: ConditionalCondition =
      c.source === 'score' ? { source: 'score', op: c.op } : { questionId: c.questionId, op: c.op };
    if (!this.operatorNeedsValue(c.op)) {
      return base;
    }
    return { ...base, value: c.value };
  }
}

/** Build a fresh condition for a selected source — the score sentinel or a question id. */
function conditionForSource(
  selectedId: string,
  op: ConditionalOperator,
  value: ConditionValue,
): ConditionalCondition {
  if (selectedId === SCORE_SOURCE_ID) {
    return { source: 'score', op, value };
  }
  return { questionId: selectedId, op, value };
}
