/**
 * "Edit logic for ⟨item⟩" — everything one question or section does, on one screen.
 *
 * WHY IT IS ONE SCREEN. Logic used to be authored a verb at a time behind a card picker: pick
 * "Show only if", author it, close, pick "Jump to page", author that. The commonest question an
 * author has — *what does this question actually do?* — could not be answered without opening two
 * dialogs and remembering the first. Here the show gate and the branching rules are visible
 * together, which is also the only way to see that they interact.
 *
 * WHY THE RULES ARE NUMBERED. `resolveFlow` takes the FIRST rule whose conditions pass, so order
 * is meaning, not presentation. Numbers and move-up/down say so; a bare list would let an author
 * write two rules and be surprised by which one won.
 *
 * Presentational: it holds no state of its own and writes nothing. The host owns the draft and
 * decides when it reaches the item, which is what keeps "nothing persists until Save" true.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import type { ConditionalGroup } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { ConditionalRuleEditorComponent } from './conditional-rule-editor.component';
import {
  defaultConditionSource,
  newCondition,
  type ConditionalSourceQuestion,
} from './condition-sources';
import {
  addJumpRule,
  canAddJumpRule,
  moveJumpRule,
  removeJumpRule,
  updateJumpRule,
  type JumpDraft,
  type LogicDraft,
} from './logic-draft';
import {
  groupedJumpTargets,
  storedTargetLabel,
  targetFromValue,
  targetValue,
  type JumpTargetGroup,
  type JumpTargetOption,
} from './jump-target-options';

const LOGIC_EDITOR_CSS = /* css */ `
.le { display: flex; flex-direction: column; gap: var(--mjf-section); }

.le-block { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }
.le-head { display: flex; align-items: center; gap: var(--mjf-gap-sm); flex-wrap: wrap; }
.le-title {
  margin: 0;
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}
.le-hint { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

/* One rule, framed, because "where does rule 1 end" is the question a flat stack cannot answer. */
.le-rule {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad);
  background: var(--mj-bg-surface-sunken);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius);
}
.le-rule-head { display: flex; align-items: center; gap: var(--mjf-gap-xs); }
.le-rule-n {
  flex: none;
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-secondary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius-pill);
}
.le-rule-spacer { flex: 1 1 auto; }
.le-icon-btn {
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.le-icon-btn:hover:not(:disabled) { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.le-icon-btn:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }
.le-icon-btn:disabled { opacity: 0.35; cursor: default; }

.le-then {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  flex-wrap: wrap;
  padding-top: var(--mjf-gap-sm);
  border-top: 1px solid var(--mjf-rule);
}
.le-then-label { flex: none; font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }
.le-then-select { flex: 1 1 260px; min-width: 0; }

.le-add {
  align-self: flex-start;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--mj-brand-primary);
  background: none;
  border: 1px dashed var(--mjf-rule);
  border-radius: var(--mjf-radius-sm);
}
.le-add:hover { background: var(--mj-bg-surface-hover); }
.le-add:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.le-seg { display: inline-flex; gap: 2px; padding: 2px; background: var(--mj-bg-surface-sunken); border-radius: var(--mjf-radius-pill); }
.le-seg button {
  font: inherit;
  font-size: var(--mjf-meta);
  padding: 4px 12px;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: none;
  border: none;
  border-radius: var(--mjf-radius-pill);
}
.le-seg button.is-on { color: var(--mj-text-primary); background: var(--mj-bg-surface); font-weight: 600; }
.le-seg button:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

@media (max-width: 640px) {
  .le-then { flex-direction: column; align-items: stretch; }
}
`;

@Component({
  selector: 'mjf-logic-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ConditionalRuleEditorComponent],
  styles: [FORMS_UI_CSS, LOGIC_EDITOR_CSS],
  template: `
    <div class="le">
      <section class="le-block">
        <div class="le-head">
          <h3 class="le-title">Show this {{ itemNoun }}</h3>
          <div class="le-seg" role="group" aria-label="When to show this item">
            <button type="button" [class.is-on]="!showsConditionally" (click)="setAlwaysShown(true)">Always</button>
            <button type="button" [class.is-on]="showsConditionally" (click)="setAlwaysShown(false)">Only when…</button>
          </div>
        </div>
        @if (showsConditionally) {
          <mjf-conditional-rule-editor
            [group]="draft.show"
            [sources]="sources"
            [subjectSourceId]="subjectSourceId"
            (groupChange)="onShowChange($event)"
          />
        }
      </section>

      @if (allowJumps) {
        <section class="le-block">
          <div class="le-head">
            <h3 class="le-title">Then, after this {{ itemNoun }}</h3>
          </div>
          <p class="le-hint">
            Rules are checked in order and the first match wins. If none match, the respondent
            carries on to the next question.
          </p>

          @for (rule of draft.jumps; track $index) {
            <div class="le-rule">
              <div class="le-rule-head">
                <span class="le-rule-n">{{ $index + 1 }}</span>
                <span class="le-rule-spacer"></span>
                <button
                  type="button"
                  class="le-icon-btn"
                  [disabled]="$index === 0"
                  [attr.aria-label]="'Move rule ' + ($index + 1) + ' earlier'"
                  (click)="move($index, -1)"
                ><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                <button
                  type="button"
                  class="le-icon-btn"
                  [disabled]="$index === draft.jumps.length - 1"
                  [attr.aria-label]="'Move rule ' + ($index + 1) + ' later'"
                  (click)="move($index, 1)"
                ><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
                <button
                  type="button"
                  class="le-icon-btn"
                  [attr.aria-label]="'Delete rule ' + ($index + 1)"
                  (click)="remove($index)"
                ><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
              </div>

              <mjf-conditional-rule-editor
                [group]="rule.when"
                [sources]="jumpSources"
                [subjectSourceId]="subjectSourceId"
                (groupChange)="onWhenChange($index, $event)"
              />

              <div class="le-then">
                <span class="le-then-label">Then go to</span>
                <select
                  #targetSelect
                  class="mjf-select le-then-select"
                  [value]="valueFor(rule)"
                  (change)="onTargetChange($index, targetSelect.value)"
                  [attr.aria-label]="'Destination for rule ' + ($index + 1)"
                >
                  <option value="" disabled [selected]="!rule.target">Choose where to go&hellip;</option>
                  <!-- [selected] per option, not just the select's [value]: Angular writes that
                       value before these optgroups exist, so it is discarded and the browser
                       selects the first destination instead — a saved rule read as going
                       somewhere it does not go. -->
                  @for (group of groupedTargets; track group.group) {
                    <optgroup [label]="group.group">
                      @for (option of group.options; track option.value) {
                        <option [value]="option.value" [selected]="option.value === valueFor(rule)">{{ option.label }}</option>
                      }
                    </optgroup>
                  }
                  <!-- A stored target the picker no longer offers. Without this entry the select
                       renders BLANK on a rule that reads perfectly well in the database. -->
                  @if (staleTarget(rule); as stale) {
                    <option [value]="stale.value" [selected]="true">{{ stale.label }}</option>
                  }
                </select>
              </div>
            </div>
          }

          @if (canAddRule) {
            <button type="button" class="le-add" (click)="add()">
              <i class="fa-solid fa-plus" aria-hidden="true"></i> Add rule
            </button>
          } @else {
            <p class="le-hint">That is the most rules one {{ itemNoun }} can carry.</p>
          }
        </section>
      }
    </div>
  `,
})
export class LogicEditorComponent {
  @Input() draft: LogicDraft = { show: undefined, jumps: [] };
  /** Sources the SHOW gate may read — earlier questions only. */
  @Input() sources: ConditionalSourceQuestion[] = [];
  /** Sources a jump's conditions may read — includes this item's own answers. */
  @Input() jumpSources: ConditionalSourceQuestion[] = [];
  /** Forward destinations, already filtered by the host. */
  @Input() targets: JumpTargetOption[] = [];
  /** Ending screens have no "after this" — they ARE the after. */
  @Input() allowJumps = true;
  /** "question" or "section", for copy that reads naturally either way. */
  @Input() itemNoun = 'question';
  /** The item being edited — what a new condition opens on. See {@link seedGroup}. */
  @Input() subjectSourceId: string | null = null;

  @Output() readonly draftChange = new EventEmitter<LogicDraft>();

  protected get showsConditionally(): boolean {
    return this.draft.show !== undefined;
  }

  protected get canAddRule(): boolean {
    return canAddJumpRule(this.draft);
  }

  protected get groupedTargets(): Array<{ group: JumpTargetGroup; options: JumpTargetOption[] }> {
    return groupedJumpTargets(this.targets);
  }

  /**
   * Switching to "Always" drops the group rather than remembering it.
   *
   * A hidden group that comes back when the toggle is flipped is a rule the author cannot see
   * and did not ask to keep; the draft is discardable anyway, so the cost of re-authoring is one
   * Cancel away.
   */
  protected setAlwaysShown(always: boolean): void {
    this.emit({
      ...this.draft,
      show: always ? undefined : (this.draft.show ?? this.seedGroup(this.sources)),
    });
  }

  /**
   * The condition a new rule opens on — one row, already pointed at the right question.
   *
   * An empty group is what a rule used to start as, and it read as a question with no answer:
   * the author was shown a destination picker and an "Add condition" button, and had to work
   * out for themselves which question the rule they had just asked for was about. The item is
   * nearly always the answer, so it is the one offered — see {@link defaultConditionSource} for
   * the show-gate case, where the item is not among its own sources.
   *
   * With nothing readable the seed stays empty rather than becoming a condition naming no
   * question: the editor filters those out of every emit, so a seeded one would be a row on
   * screen that can never become a rule.
   */
  private seedGroup(sources: ConditionalSourceQuestion[]): ConditionalGroup {
    const source = defaultConditionSource(sources, this.subjectSourceId);
    return source ? { all: [newCondition(source)] } : {};
  }

  protected onShowChange(group: ConditionalGroup | undefined): void {
    this.emit({ ...this.draft, show: group ?? {} });
  }

  protected onWhenChange(index: number, group: ConditionalGroup | undefined): void {
    this.emit(updateJumpRule(this.draft, index, { when: group ?? {} }));
  }

  protected onTargetChange(index: number, raw: string): void {
    const target = targetFromValue(raw);
    if (target === undefined) {
      return; // a value this build does not understand must not become a target
    }
    this.emit(updateJumpRule(this.draft, index, { target }));
  }

  protected add(): void {
    // Seeded from the JUMP sources, which include this item itself: "if THIS answer is X" is
    // the shape of nearly every branching rule, and it is exactly what the show gate's list
    // (which stops one question earlier) cannot express.
    this.emit(addJumpRule(this.draft, this.seedGroup(this.jumpSources)));
  }

  protected remove(index: number): void {
    this.emit(removeJumpRule(this.draft, index));
  }

  protected move(index: number, delta: -1 | 1): void {
    this.emit(moveJumpRule(this.draft, index, delta));
  }

  protected valueFor(rule: JumpDraft): string {
    return rule.target ? targetValue(rule.target) : '';
  }

  /** The stored-but-unoffered target entry, or null — see the template comment. */
  protected staleTarget(rule: JumpDraft): { value: string; label: string } | null {
    if (!rule.target) {
      return null;
    }
    const value = targetValue(rule.target);
    if (this.targets.some((o) => o.value === value)) {
      return null;
    }
    return { value, label: storedTargetLabel(rule.target, this.targets) };
  }

  private emit(next: LogicDraft): void {
    this.draft = next;
    this.draftChange.emit(next);
  }
}
