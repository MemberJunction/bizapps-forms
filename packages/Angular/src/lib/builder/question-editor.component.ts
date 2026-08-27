import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  parseQuestionScoring,
  questionTypeBehavior,
  serializeQuestionScoring,
  type ConditionalRule,
  type JSONValue,
  type mjBizAppsFormsFormQuestionOptionEntity,
  type QuestionOptionMode,
  type QuestionScoring,
  type ValidationRule,
} from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../shared';
import type { QuestionNode } from './builder-models';
import { questionTypeMeta, questionTypeColorClass } from './question-type-catalog';
import {
  settingsFor,
  settingText,
  withSetting,
  type QuestionSettingField,
} from './question-settings';
import { RulesPanelComponent } from './rules-panel.component';
import {
  authoredAnswerOptions,
  type AuthoredAnswerOption,
  type ConditionalSourceQuestion,
} from './condition-sources';
import type { JumpTargetOption } from './jump-target-options';
import { ValidationRuleEditorComponent } from './validation-rule-editor.component';
import { ImageFieldComponent } from './image-field.component';
import { SettingRowComponent } from './setting-row.component';
import { isOptionalOpen, toggleOptional } from './optional-setting';
import { optionLetter } from '../shared/option-letter';
import {
  parseConditionalRule,
  parseQuestionSettings,
  parseValidationRule,
  serializeConditionalRule,
  serializeQuestionSettings,
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
.qe-points { display: flex; flex-direction: column; gap: 8px; }
.qe-points-row { display: flex; align-items: center; gap: 10px; }
.qe-points-label { flex: 1; min-width: 0; font-size: 0.8125rem; color: var(--mj-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qe-points-input { flex: none; width: 84px; text-align: right; }

.qe-section-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

.qe-options { display: flex; flex-direction: column; gap: 6px; }
.qe-option { display: flex; align-items: center; gap: 6px; }

/* The A/B/C badge. Its job is to give an option a name that is stable while the author is
   renaming things and reordering them, so it is keyed to POSITION and never to the label. */
.qe-opt-letter {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 5px;
  font-size: var(--mjf-label);
  font-weight: 600;
  color: var(--mj-brand-primary);
  background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius-sm);
}
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

.qe-option-block { display: flex; flex-direction: column; gap: 4px; }
/* Indented so the image control reads as belonging to the choice above it rather than as a
   separate option in the list. Its resting state is a single plus, so a list of ten choices is
   ten rows and ten pluses rather than ten stacked upload panels. */
.qe-option-img { display: block; margin-left: 34px; font-size: var(--mjf-label); }

.qe-hint { margin: 2px 0 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }

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
    RulesPanelComponent,
    ValidationRuleEditorComponent,
    ImageFieldComponent,
    SettingRowComponent,
  ],
  templateUrl: './question-editor.component.html',
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, QUESTION_EDITOR_CSS],
})
export class QuestionEditorComponent {
  @Input() node: QuestionNode | null = null;
  /**
   * The form being edited. A question only knows its page, not its form, so the id is threaded
   * in from the builder — the image uploader scopes an asset to a form and has nothing else to
   * derive it from.
   */
  @Input() formId = '';
  /** Questions preceding the selected one — valid sources for a conditional rule. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];

  /** Emitted whenever a field on the question entity changed (parent persists). */
  @Output() questionChanged = new EventEmitter<QuestionNode>();

  /**
   * An OPTION's own fields changed and that record needs saving.
   *
   * Separate from `questionChanged` because they are different records. Option edits used to
   * emit `questionChanged`, whose handler saves `node.entity` — the question — so the option was
   * never written at all. Nothing complained: the publish snapshot reads the in-memory entity, so
   * the change appeared to take until the builder was reloaded and it was simply gone.
   */
  @Output() optionChanged = new EventEmitter<mjBizAppsFormsFormQuestionOptionEntity>();
  /**
   * Emitted when an option is added (parent persists via the state service).
   *
   * Carries the axis so a Matrix can add a ROW or a COLUMN — the two are the same table with a
   * discriminator, and an "Add option" that could only make rows left the columns uneditable.
   */
  @Output() addOptionRequested = new EventEmitter<{
    node: QuestionNode;
    matrixAxis?: 'Row' | 'Column';
  }>();
  /** Emitted when an option should be removed. */
  @Output() removeOptionRequested = new EventEmitter<{ node: QuestionNode; optionIndex: number }>();

  /**
   * Rows the author has switched on but not yet filled in.
   *
   * None of these three settings has a boolean column — a question either holds a validation
   * rule or it does not — so "on" is derived from the value, and this covers the gap between
   * switching a row on and typing into it. Reset when the selected question changes, since the
   * next question's emptiness is not this question's.
   */
  /**
   * Sources a jump's conditions may read — this question's OWN answer included.
   *
   * Not the same set as {@link conditionalSources}: a question's SHOW rule must not read its own
   * answer (it would hide the field the respondent is typing into), but "if THIS answer is X, go
   * to Y" is the whole point of a branching rule.
   */
  @Input() jumpConditionSources: ConditionalSourceQuestion[] = [];
  /** Forward destinations for this question's rules — later questions, later sections, endings. */
  @Input() jumpTargets: JumpTargetOption[] = [];
  /** What each destination skips, keyed by option value — see `jump-reach.ts`. */
  @Input() reachNotes: ReadonlyMap<string, string> = new Map<string, string>();

  private requested = { validation: false, placeholder: false, scoring: false };

  @Input()
  public set selectedId(id: string) {
    if (id !== this.lastSelectedId) {
      this.lastSelectedId = id;
      this.requested = { validation: false, placeholder: false, scoring: false };
    }
  }
  private lastSelectedId = '';

  protected get validationOpen(): boolean {
    return isOptionalOpen(!!this.validationRule, this.requested.validation);
  }

  protected get placeholderOpen(): boolean {
    return isOptionalOpen(this.settingValue(this.placeholderField).trim() !== '', this.requested.placeholder);
  }

  protected toggleValidation(): void {
    const next = toggleOptional(!!this.validationRule, this.requested.validation);
    this.requested.validation = next.requested;
    if (next.clear) {
      this.onValidationChange(undefined);
    }
  }

  protected togglePlaceholder(): void {
    const field = this.placeholderField;
    const next = toggleOptional(this.settingValue(field).trim() !== '', this.requested.placeholder);
    this.requested.placeholder = next.requested;
    if (next.clear) {
      this.setSetting(field, '');
    }
  }

  /** The placeholder setting for this type, or a blank stand-in when the type has none. */
  protected get placeholderField(): QuestionSettingField {
    return (
      this.settingFields.find((f) => f.key === 'placeholder') ?? {
        key: 'placeholder',
        label: 'Placeholder',
        kind: 'text',
      }
    );
  }

  protected get hasPlaceholder(): boolean {
    return this.settingFields.some((f) => f.key === 'placeholder');
  }

  /** Every setting EXCEPT the placeholder, which has its own row. */
  protected get otherSettingFields(): readonly QuestionSettingField[] {
    return this.settingFields.filter((f) => f.key !== 'placeholder');
  }

  /** The badge beside an option in the list: A, B, C … */
  protected letterFor(index: number): string {
    return optionLetter(index);
  }

  /**
   * Whether "multiple answers" is a meaningful question about this type.
   *
   * Only the two types that are the same control with a different arity: a Dropdown is a
   * different control and a Ranking already takes every option, so offering the switch there
   * would be offering to turn one type into another.
   */
  protected get canBeMultiAnswer(): boolean {
    const type = this.node?.entity.QuestionType;
    return type === 'SingleChoice' || type === 'MultiChoice';
  }

  protected get isMultiAnswer(): boolean {
    return this.node?.entity.QuestionType === 'MultiChoice';
  }

  /**
   * Flip between one answer and several.
   *
   * This changes the question's TYPE, which is also where the answer is stored — a single choice
   * lands in the text column, several land in JSON. Harmless while the form is being built and
   * disruptive afterwards, which is what the row's hint says.
   */
  protected toggleMultiAnswer(): void {
    if (!this.node || !this.canBeMultiAnswer) {
      return;
    }
    this.node.entity.QuestionType = this.isMultiAnswer ? 'SingleChoice' : 'MultiChoice';
    this.questionChanged.emit(this.node);
  }

  /** How this type's options work: none, plain values, images, or a matrix's two axes. */
  protected get optionMode(): QuestionOptionMode {
    return this.node ? questionTypeBehavior(this.node.entity.QuestionType).optionMode : 'none';
  }

  protected get hasOptions(): boolean {
    return this.optionMode !== 'none';
  }

  /** Matrix rows. An option with no axis counts as a row — see the contract's `MatrixAxis`. */
  protected get matrixRows(): mjBizAppsFormsFormQuestionOptionEntity[] {
    return (this.node?.options ?? []).filter((o) => (o.MatrixAxis ?? 'Row') === 'Row');
  }

  protected get matrixColumns(): mjBizAppsFormsFormQuestionOptionEntity[] {
    return (this.node?.options ?? []).filter((o) => o.MatrixAxis === 'Column');
  }

  /** The per-type settings this question offers. Empty for types with none. */
  protected get settingFields(): readonly QuestionSettingField[] {
    return this.node ? settingsFor(this.node.entity.QuestionType) : [];
  }

  protected settingValue(field: QuestionSettingField): string {
    return this.node ? settingText(this.currentSettings(), field.key) : '';
  }

  protected setSetting(field: QuestionSettingField, raw: string): void {
    if (!this.node) return;
    const next = withSetting(this.currentSettings(), field, raw);
    this.node.entity.Settings = serializeQuestionSettings(next);
    this.questionChanged.emit(this.node);
  }

  private currentSettings(): Record<string, JSONValue> {
    return this.node ? parseQuestionSettings(this.node.entity.Settings) : {};
  }

  /** Index of an option within `node.options`, which is what the mutation handlers key on. */
  protected indexOfOption(option: mjBizAppsFormsFormQuestionOptionEntity): number {
    return this.node ? this.node.options.indexOf(option) : -1;
  }

  protected setOptionImage(option: mjBizAppsFormsFormQuestionOptionEntity, url: string): void {
    if (!this.node) return;
    option.ImageURL = url.trim() === '' ? null : url;
    this.optionChanged.emit(option);
  }

  protected get typeLabel(): string {
    return this.node ? questionTypeMeta(this.node.entity.QuestionType).label : '';
  }

  protected get typeIcon(): string {
    return this.node ? questionTypeMeta(this.node.entity.QuestionType).icon : '';
  }

  /** The group colour for the edited question's type; empty when nothing is selected. */
  protected get typeColorClass(): string {
    return this.node ? questionTypeColorClass(this.node.entity.QuestionType) : '';
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
    const option = this.node.options[index];
    option.Label = value;
    this.optionChanged.emit(option);
  }

  protected addOption(matrixAxis?: 'Row' | 'Column'): void {
    if (!this.node) return;
    this.addOptionRequested.emit({ node: this.node, matrixAxis });
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

  // -- scoring (C4) -----------------------------------------------------------

  /**
   * The choices points can be assigned to — the PUBLISHED option identities, because points are
   * keyed by the value a published form actually stores as the answer (`Value ?? Label`,
   * uniquified).
   *
   * Reads {@link authoredAnswerOptions} rather than the condition source's option list, which
   * it used to share. They have since parted company: a condition source also carries the
   * options a TYPE implies — a rating's stars, a yes/no's two answers — so that a comparison
   * value is picked rather than typed. Scoring wants none of those. Sharing the list would
   * have put a points box against every star on every rating on every form, unasked.
   */
  protected get scoringChoices(): AuthoredAnswerOption[] {
    if (!this.node) return [];
    return authoredAnswerOptions(this.node.entity, this.node.options);
  }

  protected get scoring(): QuestionScoring | undefined {
    return this.node ? parseQuestionScoring(this.node.entity.ScoringConfig) : undefined;
  }

  protected get scoringOpen(): boolean {
    return isOptionalOpen(!!this.scoring, this.requested.scoring);
  }

  protected toggleScoring(): void {
    const next = toggleOptional(!!this.scoring, this.requested.scoring);
    this.requested.scoring = next.requested;
    if (next.clear) {
      this.writeScoring(undefined);
    }
  }

  protected pointsFor(optionValue: string): string {
    const points = this.scoring?.points;
    if (!points || !Object.prototype.hasOwnProperty.call(points, optionValue)) {
      return '';
    }
    return String(points[optionValue]);
  }

  protected setPoints(optionValue: string, raw: string): void {
    const parsed = raw.trim() === '' ? undefined : Number(raw);
    const points: Record<string, number> = { ...(this.scoring?.points ?? {}) };
    if (parsed === undefined || !Number.isFinite(parsed)) {
      delete points[optionValue];
    } else {
      points[optionValue] = parsed;
    }
    this.writeScoring(Object.keys(points).length > 0 ? { points } : undefined);
  }

  /** Merge-preserving write: sibling ScoringConfig content (an LLM-judge prompt) survives. */
  private writeScoring(scoring: QuestionScoring | undefined): void {
    if (!this.node) return;
    this.node.entity.ScoringConfig = serializeQuestionScoring(this.node.entity.ScoringConfig, scoring);
    this.questionChanged.emit(this.node);
  }
}
