import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  ConditionalCondition,
  ConditionalGroup,
  ConditionalOperator,
} from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import {
  OPERATOR_CHOICES,
  canAddCondition as groupHasRoom,
  SCORE_SOURCE_ID,
  coerceConditionValue,
  conditionForSource,
  defaultConditionSource,
  defaultOperatorFor,
  newCondition,
  operatorChoicesFor,
  operatorNeedsValue as operatorTakesValue,
  operatorOfferedFor,
  toggleMembership,
  valueEditorKind,
  valueInputMode,
  type ConditionalSourceKind,
  type ConditionalSourceOption,
  type ConditionalSourceQuestion,
  type OperatorChoice,
  type ValueEditorKind,
} from './condition-sources';

const CONDITIONAL_EDITOR_CSS = /* css */ `
.cre { display: flex; flex-direction: column; gap: var(--mjf-gap); }
.cre-empty { font-size: var(--mjf-meta); color: var(--mj-text-muted); margin: 0; }

/* Said where the picker would have been, on the row it belongs to — a note in the panel header
   would make the author hunt for which condition it meant. */
.cre-note {
  grid-area: note;
  margin: 0;
  font-size: var(--mjf-meta);
  color: var(--mj-text-muted);
}

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

/* One condition, on two lines: the question, then what must be true of its answer.
   Three controls abreast made the one that carries a full sentence — the question prompt —
   share a row with two that read as three words, so the sentence was the one that truncated.
   Named areas rather than column counts, because the value control is one of three different
   elements and the note appears only sometimes; auto-placement puts those wherever they land. */
.cre-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  grid-template-areas:
    "question question question"
    "op       value    remove"
    "note     note     note";
  gap: var(--mjf-gap-sm);
  align-items: center;
}
.cre-row + .cre-row { padding-top: var(--mjf-gap); border-top: 1px solid var(--mj-border-subtle); }
.cre-input { min-width: 0; }
.cre-question { grid-area: question; }
.cre-op { grid-area: op; }
.cre-value { grid-area: value; min-width: 0; }
.cre-remove {
  grid-area: remove;
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

.cre-checklist { grid-area: value; display: flex; flex-direction: column; gap: var(--mjf-gap-sm); min-width: 0; }
.cre-check { display: inline-flex; align-items: center; gap: var(--mjf-gap-sm); font-size: var(--mjf-meta); color: var(--mj-text-secondary); cursor: pointer; }
.cre-check input { accent-color: var(--mj-brand-primary); }

/* Narrower still and the operator takes a line of its own too: at phone width two controls
   sharing a row leave each about eight characters, which truncates "is greater than" and the
   answer it is being compared against in the same breath. */
@media (max-width: 640px) {
  .cre-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "question question"
      "op       op"
      "value    remove"
      "note     note";
  }
}
`;

/**
 * Friendly editor for ONE {@link ConditionalGroup} — a single combinator (`all` / `any`) over a
 * flat list of leaf conditions, no nesting, in line with FORMS_BUILD_PLAN §6.
 *
 * Verb-agnostic on purpose: the "Edit logic" dialog hosts one of these for the show gate and
 * one per jump rule, so this component knows nothing about which of them its group drives. It
 * owns no existence either — a rule is turned off by deleting it in the dialog, not here, which
 * is why there is no enable toggle.
 *
 * It does know which ITEM the rule belongs to ({@link subjectSourceId}), and only for one
 * reason: to open a NEW condition on the question the author is standing on rather than on the
 * first question of the form.
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

  /**
   * The item this rule belongs to — the question or page whose logic is being edited.
   *
   * It decides where a NEW row opens. The list alone cannot: a question's jump reads its own
   * answer, while its show gate reads someone else's, and both arrive here as an array in form
   * order. See {@link defaultConditionSource} for what happens when the subject is not on it.
   */
  @Input() subjectSourceId: string | null = null;

  @Input()
  set group(value: ConditionalGroup | undefined) {
    this._combinator = value?.any ? 'any' : 'all';
    const conditions = value?.any ?? value?.all ?? [];
    this._conditions = conditions.map((c) => ({ ...c }));
  }

  @Output() groupChange = new EventEmitter<ConditionalGroup | undefined>();

  protected _combinator: 'all' | 'any' = 'all';
  protected _conditions: ConditionalCondition[] = [];

  protected operatorNeedsValue(op: ConditionalOperator): boolean {
    return operatorTakesValue(op);
  }

  /** The source this condition reads, or `undefined` if it names one that no longer exists. */
  private sourceFor(condition: ConditionalCondition): ConditionalSourceQuestion | undefined {
    if (condition.source === 'score') {
      return this.sources.find((s) => s.id === SCORE_SOURCE_ID);
    }
    return this.sources.find((s) => s.id === condition.questionId);
  }

  /**
   * What kind of answer this condition reads. A condition naming a deleted question falls back
   * to `'text'`, the widest menu — the row is already broken and the author's next move is to
   * repoint it, so the last thing to do is also take their operator away.
   */
  protected sourceKind(condition: ConditionalCondition): ConditionalSourceKind {
    return this.sourceFor(condition)?.kind ?? 'text';
  }

  /** The operators this row may pick from — see {@link operatorChoicesFor} for the stale entry. */
  protected operatorsFor(condition: ConditionalCondition): ReadonlyArray<OperatorChoice> {
    return operatorChoicesFor(this.sourceKind(condition), condition.op);
  }

  /** Which editor this condition's value gets — see {@link valueEditorKind}. */
  protected kindFor(condition: ConditionalCondition): ValueEditorKind {
    return valueEditorKind(condition.op, this.sourceKind(condition));
  }

  /** The keyboard a free-text value box asks for — see {@link valueInputMode}. */
  protected inputModeFor(condition: ConditionalCondition): string | null {
    return valueInputMode(this.sourceKind(condition));
  }

  /**
   * Whether this row is pointed at a choice question whose options are not written yet.
   *
   * With free text unreachable for an option source, the picker would otherwise be a disabled
   * placeholder and nothing else — a dead end whose cause is one screen away and unstated.
   */
  protected needsOptions(condition: ConditionalCondition): boolean {
    const kind = this.sourceKind(condition);
    if (kind !== 'singleChoice' && kind !== 'multiSelect') {
      return false;
    }
    return operatorTakesValue(condition.op) && this.optionsFor(condition).length === 0;
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
    const source = defaultConditionSource(this.sources, this.subjectSourceId);
    if (!source) {
      // Nothing to read. A condition naming no question is filtered out of every emit, so
      // adding one puts a row on screen that can never become a rule.
      return;
    }
    this._conditions = [...this._conditions, newCondition(source)];
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
      //
      // And a new source may not offer the old OPERATOR either: repointing a text condition at
      // a multi-select would leave `equals` selected, which on an array answer can never match.
      // Keeping it would also blank the operator box, since it is no longer among the options.
      const kind = this.sources.find((s) => s.id === selectedId)?.kind ?? 'text';
      const op = operatorOfferedFor(c.op, kind) ? c.op : defaultOperatorFor(kind);
      return conditionForSource(selectedId, op, coerceConditionValue(op, ''));
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

