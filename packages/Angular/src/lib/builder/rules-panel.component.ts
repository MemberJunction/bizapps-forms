/**
 * The RULES rail beside a question, section or ending screen: what this item's logic DOES, in
 * one line per rule, with one way in to change it.
 *
 * It used to be a card picker — pick "Show only if", author it, close, pick "Jump to page",
 * author that — which made "what does this question do?" a question you answered by opening two
 * dialogs and remembering the first. There is now one dialog, {@link LogicEditorComponent}, and
 * this rail is the summary of it.
 *
 * NOTHING PERSISTS UNTIL SAVE. Everything typed lives in `draft`; the item is written once, on
 * Save. That is not a nicety — the previous design wrote on the way IN, so picking a card and
 * closing without authoring anything left an empty rule behind, and picking the disqualify card
 * left a screen that screened everyone out with no condition to arm it. Closing with unsaved
 * work asks; closing with none closes silently, where "none" is value equality rather than
 * touched-ness, so typing a value and typing it back is not a change.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';
import { LogicEditorComponent } from './logic-editor.component';
import type { ConditionalSourceQuestion } from './condition-sources';
import {
  isLogicDraftDirty,
  logicDraftOf,
  ruleFromLogicDraft,
  type LogicDraft,
} from './logic-draft';
import type { JumpTargetOption } from './jump-target-options';
import { describeCondition } from './rules-panel-model';
import { storedTargetLabel } from './jump-target-options';

const RULES_PANEL_CSS = /* css */ `
.rp { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }

.rp-bar { display: flex; align-items: center; gap: var(--mjf-gap-sm); }
.rp-bar-title { flex: 1 1 auto; margin: 0; font-size: var(--mjf-label); font-weight: 700; letter-spacing: 0.06em; color: var(--mj-text-muted); }
.rp-empty { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }

.rp-add {
  flex: none;
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font: inherit;
  font-size: var(--mjf-label);
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--mjf-radius-sm);
  border: 1px solid var(--mj-border-default);
  background: var(--mj-bg-surface);
  color: var(--mj-brand-primary);
}
.rp-add:hover { background: var(--mj-bg-surface-hover); }
.rp-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

/* One line per rule. The whole row opens the editor — the sentence is what an author is looking
   at, so the sentence is what they should be able to click. */
.rp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: var(--mjf-tap);
  padding: 8px 10px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mj-border-default);
  border-radius: var(--mjf-radius);
}
.rp-row:hover { background: var(--mj-bg-surface-hover); }
.rp-row:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }
.rp-icon {
  flex: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-hover);
  color: var(--mj-brand-primary);
  font-size: 0.75rem;
}
.rp-text { flex: 1 1 auto; min-width: 0; font-size: var(--mjf-label); line-height: 1.45; }
`;

@Component({
  selector: 'mjf-rules-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RuleEditorDialogComponent, LogicEditorComponent],
  styles: [FORMS_UI_CSS, RULES_PANEL_CSS],
  templateUrl: './rules-panel.component.html',
})
export class RulesPanelComponent {
  /** Identifies the item being edited; a change closes any open dialog. */
  @Input()
  set subjectId(value: string | null) {
    if (value !== this._subjectId) {
      this._subjectId = value;
      this.closeDialog();
    }
  }
  private _subjectId: string | null = null;

  /** The item under edit, for the dialog: what a new condition opens on. */
  protected get subjectSourceId(): string | null {
    return this._subjectId;
  }

  @Input() rule: ConditionalRule | undefined;
  /** What the SHOW gate may read — earlier questions only. */
  @Input() sources: ConditionalSourceQuestion[] = [];
  /**
   * What a jump's conditions may read.
   *
   * Not the same set as {@link sources}, and the difference is real: a page's SHOW rule must not
   * read its own questions (it would hide the page out from under a respondent mid-fill), but
   * its jump legitimately does — leaving a page is decided by what was just answered on it.
   * Null means "same as sources".
   */
  @Input() jumpSources: ConditionalSourceQuestion[] | null = null;
  /** Forward destinations, already filtered by the host. */
  @Input() targets: JumpTargetOption[] = [];
  /** Ending screens have no "after this" — they ARE the after. */
  @Input() allowJumps = true;
  @Input() itemNoun = 'question';

  @Output() ruleChange = new EventEmitter<ConditionalRule | undefined>();

  protected dialogOpen = false;
  /** Whether the footer is asking about unsaved work rather than offering Save. */
  protected confirmingDiscard = false;

  /** The working copy the dialog edits. Written to the item on Save, dropped on anything else. */
  protected draft: LogicDraft = { show: undefined, jumps: [] };
  /** What the item held when the dialog opened — what `isLogicDraftDirty` compares against. */
  private baseline: LogicDraft = { show: undefined, jumps: [] };

  protected get jumpSourceList(): ConditionalSourceQuestion[] {
    return this.jumpSources ?? this.sources;
  }

  /**
   * Whether this item carries any rule — what the header button and the empty state both read.
   *
   * Deliberately "is the rail showing any rows?" rather than "is `rule` non-empty": a rule blob
   * can be a phantom (`{}`, or a `show` group whose conditions were all dropped as unfinished),
   * and an item whose rail lists nothing must not be offered a pencil.
   */
  protected get hasRules(): boolean {
    return this.summaryRows.length > 0;
  }

  /** One line per rule the item actually carries — the rail's whole content. */
  protected get summaryRows(): Array<{ icon: string; text: string }> {
    const rows: Array<{ icon: string; text: string }> = [];
    const show = this.rule?.show;
    if (show) {
      rows.push({ icon: 'fa-solid fa-eye', text: `Show only when ${this.conditions(show, this.sources)}` });
    }
    for (const jump of this.rule?.jump ?? []) {
      rows.push({
        icon: 'fa-solid fa-arrow-turn-down',
        text:
          `If ${this.conditions(jump.when, this.jumpSourceList)}, go to ` +
          storedTargetLabel(jump.target, this.targets),
      });
    }
    return rows;
  }

  /**
   * A group's conditions as prose, joined by its own combinator.
   *
   * Built on `describeCondition`, the same renderer the Rules tab uses, so the rail and the hub
   * cannot word the same rule differently. Truncated after two, because this is one line in a
   * ~300px column; the hub is where a rule is read in full.
   */
  private conditions(
    group: ConditionalRule['show'],
    sources: ConditionalSourceQuestion[],
  ): string {
    const list = group?.any ?? group?.all ?? [];
    if (list.length === 0) {
      return 'always';
    }
    const joiner = group?.any ? ' or ' : ' and ';
    const head = list.slice(0, 2).map((c) => describeCondition(c, sources)).join(joiner);
    return list.length > 2 ? `${head} · +${list.length - 2} more` : head;
  }

  protected openDialog(): void {
    // Read the item ONCE, here. Everything after this edits the copy.
    this.draft = logicDraftOf(this.rule);
    this.baseline = logicDraftOf(this.rule);
    this.confirmingDiscard = false;
    this.dialogOpen = true;
  }

  protected onDraftChange(draft: LogicDraft): void {
    this.draft = draft;
  }

  /**
   * A dismissal — backdrop, ✕, Escape or Cancel.
   *
   * Asks only when there is something to lose. "Something" is value equality against the
   * baseline, so adding an empty rule row and deleting it again closes silently, and so does
   * editing a value back to what it was.
   */
  protected requestClose(): void {
    if (isLogicDraftDirty(this.draft, this.baseline)) {
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

  /** Save: write the draft onto the item. */
  protected commit(): void {
    this.ruleChange.emit(ruleFromLogicDraft(this.draft));
    this.closeDialog();
  }

  private closeDialog(): void {
    this.dialogOpen = false;
    this.confirmingDiscard = false;
    this.draft = { show: undefined, jumps: [] };
    this.baseline = { show: undefined, jumps: [] };
  }
}
