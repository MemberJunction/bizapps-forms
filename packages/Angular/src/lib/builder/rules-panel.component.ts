import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ConditionalGroup, ConditionalRule } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { ConditionalRuleEditorComponent } from './conditional-rule-editor.component';
import type { ConditionalSourceQuestion } from './condition-sources';
import {
  hasVerb,
  isGroupVerb,
  jumpRule,
  summarizeGroup,
  summarizeJump,
  verbGroup,
  withJumpRule,
  withVerbGroup,
  type JumpTargetPage,
  type RuleCardSpec,
  type RuleFlags,
  type RuleVerb,
} from './rules-panel-model';

const RULES_PANEL_CSS = /* css */ `
.rp { display: flex; flex-direction: column; gap: 10px; }
.rp-card { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg, 12px); background: var(--mj-bg-surface); }
.rp-head { display: flex; align-items: stretch; }
.rp-head-main { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit; min-width: 0; }
.rp-icon { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-surface-hover); color: var(--mj-brand-primary); font-size: 0.8125rem; }
.rp-titles { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-title { font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-primary); }
.rp-summary { font-size: 0.75rem; color: var(--mj-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-chevron { flex: none; font-size: 0.6875rem; color: var(--mj-text-muted); }
.rp-remove { flex: none; width: 34px; cursor: pointer; border: none; background: none; color: var(--mj-text-muted); border-left: 1px solid var(--mj-border-default); border-radius: 0 var(--mj-radius-lg, 12px) var(--mj-radius-lg, 12px) 0; }
.rp-remove:hover { color: var(--mj-status-error, var(--mj-color-error-600)); background: var(--mj-bg-surface-hover); }
.rp-body { padding: 0 12px 12px; }
.rp-hint { font-size: 0.75rem; color: var(--mj-text-muted); margin: 0 0 8px; }
.rp-add { align-self: flex-start; font: inherit; font-size: 0.8125rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; cursor: pointer; border-radius: var(--mj-radius-md, 8px); border: 1px dashed var(--mj-border-default); background: transparent; color: var(--mj-brand-primary); }
.rp-add:hover { background: var(--mj-bg-surface-hover); }
.rp-picker { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg, 12px); background: var(--mj-bg-surface); }
.rp-pick { display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; text-align: left; font: inherit; border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-surface); color: inherit; }
.rp-pick:hover { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover); }
.rp-pick-desc { font-size: 0.75rem; color: var(--mj-text-muted); white-space: normal; }
.rp-cancel { align-self: flex-end; font: inherit; font-size: 0.75rem; border: none; background: none; color: var(--mj-text-muted); cursor: pointer; padding: 4px 8px; }
.rp-cancel:hover { color: var(--mj-text-primary); }
.rp-jump { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; }
.rp-jump-label { font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-secondary); white-space: nowrap; }
.rp-jump-select { flex: 1; min-width: 0; font: inherit; font-size: 0.8125rem; padding: 6px 8px; border-radius: var(--mj-radius-md, 8px); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-primary); }
`;

/**
 * The rules panel (RULES_AND_BRANCHING_PLAN §3): the one place an item's rules are authored.
 *
 * Renders the item's rule cards; "+ Add rule" opens a card picker of the verbs the item still
 * supports; picking one opens an editable card hosting the shared condition-group editor. The
 * panel edits the parsed {@link ConditionalRule} and emits the whole updated object — the host
 * serializes and persists it, exactly as it did when each editor owned its own setting-row.
 */
@Component({
  selector: 'mjf-rules-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ConditionalRuleEditorComponent],
  templateUrl: './rules-panel.component.html',
  styles: [FORMS_UI_CSS, RULES_PANEL_CSS],
})
export class RulesPanelComponent {
  /**
   * Identity of the item whose rules are shown. Draft cards and open/picker state are
   * per-item, so a selection change must not leak one question's half-built card onto the
   * next — the same reset idiom as the screen editor's `requested` flags.
   */
  @Input()
  public set subjectId(value: string) {
    if (value !== this._subjectId) {
      this._subjectId = value;
      this.drafts = new Set<RuleVerb>();
      this.expanded = null;
      this.pickerOpen = false;
      this.jumpDraftGroup = undefined;
      this.jumpDraftTarget = null;
    }
  }
  public get subjectId(): string {
    return this._subjectId;
  }
  private _subjectId = '';

  /** The cards this item supports, in display order. */
  @Input() cards: ReadonlyArray<RuleCardSpec> = [];
  @Input() rule: ConditionalRule | undefined;
  @Input() sources: ConditionalSourceQuestion[] = [];
  /** Pages a jump card may target (later pages only) — required when `cards` offers `jump`. */
  @Input() jumpTargets: JumpTargetPage[] = [];
  /**
   * Sources a JUMP's conditions may read, when they differ from `sources`. A page's show rule
   * must not read the page's own questions (it would hide the page out from under the
   * respondent), but its jump legitimately does — leaving a page is decided by what was just
   * answered on it. Null means "same as sources".
   */
  @Input() jumpSources: ConditionalSourceQuestion[] | null = null;
  /** The screen's disqualification flag — feeds the `disqualify` card (ending screens only). */
  @Input() isDisqualification = false;
  @Output() ruleChange = new EventEmitter<ConditionalRule | undefined>();
  /** Emitted when the disqualify card is added (true) or removed (false). */
  @Output() disqualifyChange = new EventEmitter<boolean>();

  protected expanded: RuleVerb | null = null;
  protected pickerOpen = false;
  /**
   * Cards added this session whose group has no conditions yet. An empty group never persists
   * (the editor emits `undefined` for it), so without this marker a freshly-added card would
   * vanish on the next change-detection pass.
   */
  private drafts = new Set<RuleVerb>();
  /** The halves of a jump not yet persisted — a jump only persists once it has BOTH. */
  private jumpDraftGroup: ConditionalGroup | undefined;
  private jumpDraftTarget: string | null = null;

  private get flags(): RuleFlags {
    return { disqualification: this.isDisqualification };
  }

  private isOn(verb: RuleVerb): boolean {
    return hasVerb(this.rule, verb, this.flags) || this.drafts.has(verb);
  }

  /** Cards rendered: every verb the rule carries, plus this session's drafts, in spec order. */
  protected get shownCards(): RuleCardSpec[] {
    return this.cards.filter((c) => this.isOn(c.verb));
  }

  /** Cards the picker still offers — minus any excluded by an active card. */
  protected get availableCards(): RuleCardSpec[] {
    return this.cards.filter(
      (c) => !this.isOn(c.verb) && !(c.excludes ?? []).some((verb) => this.isOn(verb)),
    );
  }

  protected groupFor(verb: RuleVerb): ConditionalGroup | undefined {
    if (verb === 'jump') {
      return jumpRule(this.rule)?.when ?? this.jumpDraftGroup;
    }
    if (verb === 'disqualify') {
      // The disqualify card edits the screen's own show group; the flag changes its meaning.
      return verbGroup(this.rule, 'show');
    }
    return isGroupVerb(verb) ? verbGroup(this.rule, verb) : undefined;
  }

  protected summaryFor(verb: RuleVerb): string {
    if (verb === 'jump') {
      return summarizeJump(this.rule, this.jumpSourceList, this.jumpTargets);
    }
    return summarizeGroup(this.groupFor(verb), this.sources);
  }

  private setDisqualifyGroup(group: ConditionalGroup | undefined): void {
    if (group === undefined) {
      this.drafts.add('disqualify');
    } else {
      this.drafts.delete('disqualify');
    }
    this.ruleChange.emit(withVerbGroup(this.rule, 'show', group));
  }

  /** The sources the jump card's condition editor offers. */
  protected get jumpSourceList(): ConditionalSourceQuestion[] {
    return this.jumpSources ?? this.sources;
  }

  /** The condition sources for one card — jump reads a wider set than the group verbs. */
  protected sourcesFor(verb: RuleVerb): ConditionalSourceQuestion[] {
    return verb === 'jump' ? this.jumpSourceList : this.sources;
  }

  /** The jump card's chosen target — persisted first, else this session's draft. */
  protected jumpTargetId(): string {
    return jumpRule(this.rule)?.toPageId ?? this.jumpDraftTarget ?? '';
  }

  protected setJumpTarget(id: string): void {
    this.jumpDraftTarget = id.length > 0 ? id : null;
    this.emitJump(this.groupFor('jump'), this.jumpDraftTarget ?? undefined);
  }

  protected onJumpGroupChange(group: ConditionalGroup | undefined): void {
    this.jumpDraftGroup = group;
    const target = this.jumpTargetId();
    this.emitJump(group, target.length > 0 ? target : undefined);
  }

  /** Persist the jump when it has both halves; otherwise keep the card as a draft. */
  private emitJump(group: ConditionalGroup | undefined, toPageId: string | undefined): void {
    if (group !== undefined && toPageId !== undefined) {
      this.drafts.delete('jump');
      this.ruleChange.emit(withJumpRule(this.rule, { when: group, toPageId }));
      return;
    }
    this.drafts.add('jump');
    this.ruleChange.emit(withJumpRule(this.rule, undefined));
  }

  protected isExpanded(verb: RuleVerb): boolean {
    return this.expanded === verb;
  }

  protected toggleExpanded(verb: RuleVerb): void {
    this.expanded = this.expanded === verb ? null : verb;
  }

  protected openPicker(): void {
    this.pickerOpen = true;
  }

  protected closePicker(): void {
    this.pickerOpen = false;
  }

  protected addCard(verb: RuleVerb): void {
    this.drafts.add(verb);
    this.expanded = verb;
    this.pickerOpen = false;
    if (verb === 'disqualify') {
      this.disqualifyChange.emit(true);
    }
  }

  protected removeCard(verb: RuleVerb): void {
    this.drafts.delete(verb);
    if (this.expanded === verb) {
      this.expanded = null;
    }
    if (verb === 'disqualify') {
      // Removing the card removes BOTH halves — the flag and the group authored for it.
      this.disqualifyChange.emit(false);
      if (verbGroup(this.rule, 'show') !== undefined) {
        this.ruleChange.emit(withVerbGroup(this.rule, 'show', undefined));
      }
      return;
    }
    if (verb === 'jump') {
      this.jumpDraftGroup = undefined;
      this.jumpDraftTarget = null;
      if (hasVerb(this.rule, 'jump')) {
        this.ruleChange.emit(withJumpRule(this.rule, undefined));
      }
      return;
    }
    if (isGroupVerb(verb) && verbGroup(this.rule, verb) !== undefined) {
      this.ruleChange.emit(withVerbGroup(this.rule, verb, undefined));
    }
  }

  protected onGroupChange(verb: RuleVerb, group: ConditionalGroup | undefined): void {
    if (verb === 'jump') {
      this.onJumpGroupChange(group);
      return;
    }
    if (verb === 'disqualify') {
      this.setDisqualifyGroup(group);
      return;
    }
    if (!isGroupVerb(verb)) {
      return;
    }
    // While the group is empty the card is a draft (nothing persists); once it names a
    // question it is real and the draft marker drops away.
    if (group === undefined) {
      this.drafts.add(verb);
    } else {
      this.drafts.delete(verb);
    }
    this.ruleChange.emit(withVerbGroup(this.rule, verb, group));
  }
}
