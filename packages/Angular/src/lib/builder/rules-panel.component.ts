import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ConditionalGroup, ConditionalRule } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { ConditionalRuleEditorComponent } from './conditional-rule-editor.component';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';
import type { ConditionalSourceQuestion } from './condition-sources';
import {
  cardSpec,
  hasVerb,
  isDraftCommittable,
  isDraftDirty,
  isGroupVerb,
  jumpRule,
  summarizeGroup,
  summarizeJump,
  verbGroup,
  withJumpRule,
  withVerbGroup,
  type JumpTargetPage,
  type RuleCardSpec,
  type RuleDraft,
  type RuleVerb,
} from './rules-panel-model';

const RULES_PANEL_CSS = /* css */ `
.rp { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }
.rp-card { border: 1px solid var(--mj-border-default); border-radius: var(--mjf-radius); background: var(--mj-bg-surface); }
.rp-head { display: flex; align-items: stretch; }
.rp-head-main { flex: 1; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit; min-width: 0; }
.rp-icon { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--mjf-radius-sm); background: var(--mj-bg-surface-hover); color: var(--mj-brand-primary); font-size: 0.8125rem; }
.rp-titles { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rp-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); }
.rp-summary { font-size: var(--mjf-label); color: var(--mj-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-remove { flex: none; width: 34px; cursor: pointer; border: none; background: none; color: var(--mj-text-muted); border-left: 1px solid var(--mj-border-default); border-radius: 0 var(--mjf-radius) var(--mjf-radius) 0; }
.rp-remove:hover { color: var(--mj-status-error, var(--mj-color-error-600)); background: var(--mj-bg-surface-hover); }
.rp-bar { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.rp-bar-title { flex: 1 1 auto; margin: 0; font-size: var(--mjf-label); font-weight: 700; letter-spacing: 0.06em; color: var(--mj-text-muted); }
.rp-empty { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }
.rp-edit { flex: none; font-size: 0.6875rem; color: var(--mj-text-muted); }
.rp-add { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0; font-size: 0.8125rem; cursor: pointer; border-radius: var(--mjf-radius-sm); border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-brand-primary); }
.rp-add:hover { background: var(--mj-bg-surface-hover); }
.rp-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

/* ---- inside the dialog: room, which is the whole reason it is a dialog ---- */

/* auto-fit so two cards sit side by side on a desktop dialog and stack on a phone. */
.rp-picks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--mjf-gap); }
.rp-pick { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mjf-gap-sm); padding: var(--mjf-card-pad); cursor: pointer; text-align: left; font: inherit; border: 1px solid var(--mj-border-default); border-radius: var(--mjf-radius); background: var(--mj-bg-surface); color: inherit; transition: border-color var(--mjf-ease), background var(--mjf-ease); }
.rp-pick:hover { border-color: var(--mj-brand-primary); background: var(--mj-bg-surface-hover); }
.rp-pick:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; }
.rp-pick .rp-icon { width: 36px; height: 36px; font-size: 0.9375rem; }
.rp-pick .rp-title { font-size: var(--mjf-body); }
.rp-pick-desc { font-size: var(--mjf-meta); line-height: 1.5; color: var(--mj-text-muted); white-space: normal; }

/* A labelled row, the way the reference designs put "If" / "Then" beside their controls: the
   label column says what the row DOES, which a bare select cannot. */
.rp-jump {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap);
  margin: 0 0 var(--mjf-gap);
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  flex-wrap: wrap;
}
.rp-jump-label { flex: none; font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); white-space: nowrap; }
.rp-jump-select { flex: 1 1 200px; min-width: 0; }
`;

/**
 * What the rule dialog is showing, or null when it is closed.
 *
 * One value where there were two fields — `expanded: RuleVerb | null` and `pickerOpen: boolean`.
 * Those could describe "a card is open AND the picker is open", a state the single modal cannot
 * render and which no caller wanted; a union of one value cannot be in it. Same move, and the
 * same reason, as `BuilderSelection` replacing a pair of mutually exclusive ids.
 */
type RuleDialog = { readonly mode: 'pick' } | { readonly mode: 'edit'; readonly verb: RuleVerb };

/**
 * The rules panel (RULES_AND_BRANCHING_PLAN §3): the list of an item's rules, and the way in to
 * authoring one.
 *
 * The panel itself is a HEADER plus one summary row per rule — it is ~300px wide in the builder's
 * properties rail, which is enough to say "Ticket type equals VIP" and not enough to author it.
 * The header's `+` and a click on any row both open {@link RuleEditorDialogComponent}, a centered
 * modal, and every condition control lives there.
 *
 * NOTHING IS WRITTEN UNTIL DONE. The dialog edits a {@link RuleDraft} — a working copy — and the
 * item's own rule is untouched until the author commits. That is what makes Cancel mean anything:
 * while edits were emitted per keystroke, opening a card and closing it left an empty rule behind
 * (a card reading "No conditions yet" that nobody asked for), and there was no state in which
 * "discard" could have done something. It also retires the `drafts` marker set this panel used to
 * carry, which existed only to keep such a card visible until it had conditions.
 *
 * The panel keeps all the verb knowledge either way: the dialog is projected chrome, so adding a
 * verb touches this component and the card specs, never the modal.
 */
@Component({
  selector: 'mjf-rules-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ConditionalRuleEditorComponent, RuleEditorDialogComponent],
  templateUrl: './rules-panel.component.html',
  styles: [FORMS_UI_CSS, RULES_PANEL_CSS],
})
export class RulesPanelComponent {
  /**
   * Identity of the item whose rules are shown. The dialog and its draft are per-item, so a
   * selection change must not leave one question's half-built rule open over the next — it would
   * be editing the previous item's group against this one's condition sources.
   */
  @Input()
  public set subjectId(value: string) {
    if (value !== this._subjectId) {
      this._subjectId = value;
      this.dialog = null;
      this.confirmingDiscard = false;
      this.clearDraft();
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
  @Output() ruleChange = new EventEmitter<ConditionalRule | undefined>();

  protected dialog: RuleDialog | null = null;
  /** Whether the footer is asking about unsaved work rather than offering Done. */
  protected confirmingDiscard = false;

  /** The working copy the dialog edits. Committed on Done, dropped on anything else. */
  protected draftGroup: ConditionalGroup | undefined;
  protected draftJumpTarget: string | null = null;
  /** What the item held when the dialog opened — what `isDraftDirty` compares against. */
  private baseline: RuleDraft | null = null;

  private isOn(verb: RuleVerb): boolean {
    return hasVerb(this.rule, verb);
  }

  /** Cards rendered: every verb the item's persisted rule carries, in spec order. */
  protected get shownCards(): RuleCardSpec[] {
    return this.cards.filter((c) => this.isOn(c.verb));
  }

  /**
   * Cards the picker still offers — every verb the item does not already carry.
   *
   * There used to be an `excludes` pass here as well, because an ending's show group meant one
   * thing under the disqualify card and another under the show card. Screening out is a `Go to`
   * rule and a screen toggle now, so no two cards read the same group and nothing needs
   * excluding.
   */
  protected get availableCards(): RuleCardSpec[] {
    return this.cards.filter((c) => !this.isOn(c.verb));
  }

  /** The group the ITEM holds for a verb — what a collapsed card summarizes. */
  private persistedGroup(verb: RuleVerb): ConditionalGroup | undefined {
    if (verb === 'jump') {
      return jumpRule(this.rule)?.when;
    }
    return isGroupVerb(verb) ? verbGroup(this.rule, verb) : undefined;
  }

  protected summaryFor(verb: RuleVerb): string {
    if (verb === 'jump') {
      return summarizeJump(this.rule, this.jumpSourceList, this.jumpTargets);
    }
    return summarizeGroup(this.persistedGroup(verb), this.sources);
  }

  /** The sources the jump card's condition editor offers. */
  protected get jumpSourceList(): ConditionalSourceQuestion[] {
    return this.jumpSources ?? this.sources;
  }

  /** The condition sources for one card — jump reads a wider set than the group verbs. */
  protected sourcesFor(verb: RuleVerb): ConditionalSourceQuestion[] {
    return verb === 'jump' ? this.jumpSourceList : this.sources;
  }

  /* --------------------------------------------------------------- the dialog */

  /** The spec of the verb being edited — the dialog's heading, icon and hint all come from it. */
  private get editingSpec(): RuleCardSpec | undefined {
    return this.dialog?.mode === 'edit' ? cardSpec(this.dialog.verb, this.cards) : undefined;
  }

  protected get dialogTitle(): string {
    return this.editingSpec?.title ?? 'Add a rule';
  }

  protected get dialogSubtitle(): string {
    return this.editingSpec?.description ?? 'Rules decide when this appears and where it leads.';
  }

  protected get dialogIcon(): string {
    return this.editingSpec?.icon ?? 'fa-solid fa-code-branch';
  }

  protected openPicker(): void {
    this.clearDraft();
    this.confirmingDiscard = false;
    this.dialog = { mode: 'pick' };
  }

  /** Open an existing rule for editing. */
  protected editCard(verb: RuleVerb): void {
    this.openDraft(verb);
  }

  protected addCard(verb: RuleVerb): void {
    // Straight from the picker into the editor, in the dialog already on screen: picking a verb
    // is choosing what to author, not the authoring. Nothing is emitted here — not even the
    // disqualification flag, which is a column on the screen and used to be flipped on the way
    // in, leaving a screen that screened everyone out with no condition to arm it.
    this.openDraft(verb);
  }

  private openDraft(verb: RuleVerb): void {
    const group = this.persistedGroup(verb);
    // The panel authors PAGE jumps only for now, so a stored target of any other kind has no
    // control to show and opens as empty rather than being silently rewritten.
    const stored = verb === 'jump' ? jumpRule(this.rule)?.target : undefined;
    const target = stored?.kind === 'page' ? stored.id : null;
    this.draftGroup = group;
    this.draftJumpTarget = target;
    this.baseline = { verb, group, jumpTargetId: target };
    this.confirmingDiscard = false;
    this.dialog = { mode: 'edit', verb };
  }

  private clearDraft(): void {
    this.draftGroup = undefined;
    this.draftJumpTarget = null;
    this.baseline = null;
  }

  private closeDialog(): void {
    this.dialog = null;
    this.confirmingDiscard = false;
    this.clearDraft();
  }

  /** The draft as the pure helpers see it, or null when no rule is open. */
  private get currentDraft(): RuleDraft | null {
    const open = this.dialog;
    if (open?.mode !== 'edit') {
      return null;
    }
    return { verb: open.verb, group: this.draftGroup, jumpTargetId: this.draftJumpTarget };
  }

  /** Whether Done would persist anything. */
  protected get canCommit(): boolean {
    const draft = this.currentDraft;
    return draft !== null && isDraftCommittable(draft);
  }

  protected onGroupChange(group: ConditionalGroup | undefined): void {
    this.draftGroup = group;
  }

  protected setJumpTarget(id: string): void {
    this.draftJumpTarget = id.length > 0 ? id : null;
  }

  /**
   * A dismissal — backdrop, ✕, Escape or Cancel. Asks only when something would be lost: a
   * warning that fires on an untouched card is a warning people learn to click straight through.
   */
  protected requestClose(): void {
    const draft = this.currentDraft;
    if (draft === null || this.baseline === null || this.dialog?.mode !== 'edit') {
      this.closeDialog();
      return;
    }
    if (isDraftDirty(draft, this.baseline)) {
      this.confirmingDiscard = true;
      return;
    }
    this.closeDialog();
  }

  /** Throw the working copy away. The item was never written to, so there is nothing to undo. */
  protected discardDraft(): void {
    this.closeDialog();
  }

  protected resumeEditing(): void {
    this.confirmingDiscard = false;
  }

  /** Done: write the draft onto the item. */
  protected commit(): void {
    const open = this.dialog;
    if (open?.mode !== 'edit' || !this.canCommit) {
      return;
    }
    this.ruleChange.emit(this.committedRule(open.verb));
    this.closeDialog();
  }

  /** The rule the item ends up with once this draft lands. */
  private committedRule(verb: RuleVerb): ConditionalRule | undefined {
    const group = this.draftGroup;
    if (verb === 'jump') {
      const target = this.draftJumpTarget ?? '';
      return group !== undefined && target.length > 0
        ? withJumpRule(this.rule, { when: group, target: { kind: 'page', id: target } })
        : withJumpRule(this.rule, undefined);
    }
    return withVerbGroup(this.rule, verb, group);
  }

  protected removeCard(verb: RuleVerb): void {
    if (this.dialog?.mode === 'edit' && this.dialog.verb === verb) {
      this.dialog = null;
      this.confirmingDiscard = false;
      this.clearDraft();
    }
    if (verb === 'jump') {
      if (hasVerb(this.rule, 'jump')) {
        this.ruleChange.emit(withJumpRule(this.rule, undefined));
      }
      return;
    }
    if (isGroupVerb(verb) && verbGroup(this.rule, verb) !== undefined) {
      this.ruleChange.emit(withVerbGroup(this.rule, verb, undefined));
    }
  }
}
