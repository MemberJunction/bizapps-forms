import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import { FORMS_UI_CSS } from '../shared';
import { RulesPanelComponent } from './rules-panel.component';
import type { JumpTargetOption } from './jump-target-options';
import type { ConditionalSourceQuestion } from './condition-sources';
import { parseConditionalRule, serializeConditionalRule } from './json-fields';
import type { PageNode } from './builder-models';

const PAGE_EDITOR_CSS = /* css */ `
:host { display: block; }
.pe { display: flex; flex-direction: column; gap: 16px; }
.pe-head { display: flex; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--mj-border-default); }
.pe-head > i { color: var(--mj-brand-primary); font-size: 1rem; }
.pe-head-title { font-size: 0.8125rem; font-weight: 600; color: var(--mj-text-secondary); }
.pe-name { font-size: 0.9375rem; font-weight: 600; color: var(--mj-text-primary); margin: 0; }
.pe-hint { font-size: 0.75rem; color: var(--mj-text-muted); margin: 0; }
`;

/**
 * Properties panel for a PAGE (RULES_AND_BRANCHING_PLAN B2) — the authoring half of the
 * page-level `ConditionalRule` that the widget and the server have evaluated since S2 with no
 * way to write it. Title and description stay editable inline on the canvas, where they always
 * were; this panel owns what the canvas has no room for — the page's rules.
 */
@Component({
  selector: 'mjf-page-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RulesPanelComponent],
  styles: [FORMS_UI_CSS, PAGE_EDITOR_CSS],
  template: `
    @if (page; as p) {
      <div class="pe">
        <div class="pe-head">
          <i class="fa-solid fa-file-lines" aria-hidden="true"></i>
          <span class="pe-head-title">Page settings</span>
        </div>
        <p class="pe-name">{{ p.entity.Title || 'Page ' + pageNumber }}</p>
        <div>
          @if (conditionalSources.length > 0 || jumpConditionSources.length > 0) {
            <mjf-rules-panel
              [subjectId]="p.entity.ID"
              [rule]="conditionalRule"
              [sources]="conditionalSources"
              [jumpSources]="jumpConditionSources"
              [formSources]="formSources"
              [formTargets]="formTargets"
              [targets]="jumpTargets"
              [reachNotes]="reachNotes"
              [defaultEndingLabel]="defaultEndingLabel"
              itemNoun="section"
              (ruleChange)="onConditionalChange($event)"
            />
          } @else {
            <p class="pe-hint">
              A page's rules read answers to questions — add a question to this form and the
              rules appear here.
            </p>
          }
        </div>
      </div>
    }
  `,
})
export class PageEditorComponent {
  @Input() page: PageNode | null = null;
  /** 1-based position of the page, for the "Page N" fallback name. */
  @Input() pageNumber = 1;
  /** Questions on pages BEFORE this one — the only sources a page rule may read. */
  @Input() conditionalSources: ConditionalSourceQuestion[] = [];
  /** Pages AFTER this one — the only places a jump may land (forward-only by contract). */
  @Input() jumpTargets: JumpTargetOption[] = [];
  /** What each destination skips, keyed by option value — see `jump-reach.ts`. */
  @Input() reachNotes: ReadonlyMap<string, string> = new Map<string, string>();
  /** Sources a jump's conditions may read: earlier pages AND this page's own questions. */
  @Input() jumpConditionSources: ConditionalSourceQuestion[] = [];

  /**
   * Every answerable question on the form — what lets a stale condition row say WHY it is stale.
   * See `ConditionalRuleEditorComponent.formSources`.
   */
  @Input() formSources: ConditionalSourceQuestion[] = [];
  /** See `RulesPanelComponent.formTargets`. */
  @Input() formTargets: JumpTargetOption[] = [];
  /** The ending finishers land on, by name — stated in the logic dialog, never written there. */
  @Input() defaultEndingLabel: string | null = null;
  /** Emitted whenever the page entity changed (parent persists). */
  @Output() pageChanged = new EventEmitter<PageNode>();


  protected get conditionalRule(): ConditionalRule | undefined {
    return this.page ? parseConditionalRule(this.page.entity.ConditionalRule) : undefined;
  }

  protected onConditionalChange(rule: ConditionalRule | undefined): void {
    if (!this.page) {
      return;
    }
    this.page.entity.ConditionalRule = serializeConditionalRule(rule);
    this.pageChanged.emit(this.page);
  }
}
