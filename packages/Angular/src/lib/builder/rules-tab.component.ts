/**
 * The Rules tab — every rule on the form, in one place, as sentences.
 *
 * WHY THIS EXISTS. Rules are authored one item at a time, in a panel attached to the question,
 * page or ending they belong to. That is the right place to write one and the wrong place to
 * understand a form: to learn what a form's logic did, an author had to click every item in
 * turn and hold the answers in their head. This tab is the answer to "what does this form
 * actually do?" — the question the per-item panels cannot be asked.
 *
 * It is a VIEW, not a second editor. Every row routes back to the item the rule belongs to,
 * where the one authoring surface opens. There is no write path in this file, which is what
 * keeps "the hub and the panel disagree" from ever becoming a bug that can exist.
 *
 * The design decisions are all one idea — recognition over recall:
 *  - a rule reads as a SENTENCE, not as three dropdown values an author must recompose;
 *  - rules are grouped by the page the respondent meets them on (a flat list of thirty is a
 *    wall, and page order is the order they run in);
 *  - a broken rule is flagged where it lives AND counted on the tab, because the failure it
 *    names is otherwise invisible — a condition on a deleted question evaluates false, so the
 *    item it guards is hidden from every respondent with nothing anywhere saying why;
 *  - the whole row is the target, at `--mjf-tap` height (Fitts), not a small "edit" link;
 *  - the empty state teaches what rules are for rather than reporting that there are none.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FORMS_UI_CSS } from '../shared';
import {
  brokenRuleCount,
  groupEntriesByPage,
  type RuleEntry,
  type RuleEntryGroup,
  type RuleGroupPage,
} from './rules-inventory';

const RULES_TAB_CSS = /* css */ `
:host { display: block; min-height: 0; overflow-y: auto; }

.rt { display: flex; flex-direction: column; gap: var(--mjf-section); padding: var(--mjf-gutter); }

.rt-head { display: flex; align-items: baseline; gap: var(--mjf-gap-sm); flex-wrap: wrap; }
.rt-title { margin: 0; font-size: var(--mjf-title); font-weight: 600; color: var(--mj-text-primary); }
.rt-count { font-size: var(--mjf-meta); color: var(--mj-text-muted); }

.rt-group { display: flex; flex-direction: column; gap: var(--mjf-gap-xs); }
.rt-group-label {
  margin: 0 0 var(--mjf-gap-xs);
  font-size: var(--mjf-label);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mj-text-muted);
}

/* The whole row is the target — a rule is a sentence, and the sentence is what you click. */
.rt-row {
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  width: 100%;
  min-height: var(--mjf-tap);
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius);
  transition: background var(--mjf-ease), border-color var(--mjf-ease);
}
.rt-row:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong, var(--mjf-rule)); }
.rt-row:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.rt-icon {
  flex: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-sunken);
  color: var(--mj-brand-primary);
  font-size: 0.8125rem;
}
.rt-sentence { flex: 1 1 auto; min-width: 0; font-size: var(--mjf-body); line-height: 1.5; }
.rt-go { flex: none; color: var(--mj-text-muted); font-size: 0.75rem; }

/* A broken rule is not styled as an error the author caused — it is a fact they need. */
.rt-row.is-broken { border-color: var(--mj-status-warning, var(--mjf-rule)); }
.rt-broken {
  margin: var(--mjf-gap-xs) 0 0;
  font-size: var(--mjf-meta);
  color: var(--mj-text-secondary);
}
.rt-broken-icon { color: var(--mj-status-warning, var(--mj-text-secondary)); margin-right: 4px; }

@media (max-width: 640px) {
  .rt { padding: var(--mjf-gap); }
  .rt-row { align-items: flex-start; }
  .rt-go { display: none; }
}
`;

@Component({
  selector: 'mjf-rules-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, RULES_TAB_CSS],
  template: `
    <div class="rt">
      <div class="rt-head">
        <h2 class="rt-title">Rules</h2>
        @if (entries.length > 0) {
          <span class="rt-count">{{ entries.length }} on this form</span>
          @if (brokenCount > 0) {
            <span class="mjf-badge mjf-badge--warning">
              {{ brokenCount }} need{{ brokenCount === 1 ? 's' : '' }} attention
            </span>
          }
        }
      </div>

      @if (entries.length === 0) {
        <!-- Teaching, not reporting. "No rules" tells an author what is true; this tells them
             what the feature is for, which is what someone looking at an empty tab needs. -->
        <div class="mjf-empty">
          <i class="fa-solid fa-code-branch mjf-empty-icon" aria-hidden="true"></i>
          <p class="mjf-empty-title">This form asks everyone the same questions</p>
          <p class="mjf-empty-body">
            Rules change that: show a question only when an earlier answer matches, skip ahead to a
            later page, or end the form early for someone who does not qualify. Add one from the
            RULES panel beside any question, page or ending screen.
          </p>
          <button type="button" class="mjf-btn mjf-btn--primary" (click)="addRequested.emit()">
            Go to Build
          </button>
        </div>
      }

      @for (group of groups; track group.pageId) {
        <section class="rt-group">
          <h3 class="rt-group-label">{{ group.label }}</h3>
          @for (entry of group.entries; track entry.id) {
            <button
              type="button"
              class="rt-row"
              [class.is-broken]="entry.broken.length > 0"
              (click)="openRequested.emit(entry)"
            >
              <span class="rt-icon"><i [class]="entry.icon" aria-hidden="true"></i></span>
              <span class="rt-sentence">
                {{ entry.sentence }}
                @if (entry.broken.length > 0) {
                  <span class="rt-broken">
                    <i class="fa-solid fa-triangle-exclamation rt-broken-icon" aria-hidden="true"></i>
                    This rule points at {{ entry.broken.join(' and ') }}, so it never matches.
                  </span>
                }
              </span>
              <i class="fa-solid fa-chevron-right rt-go" aria-hidden="true"></i>
            </button>
          }
        </section>
      }
    </div>
  `,
})
export class RulesTabComponent {
  /** Every rule on the form, already composed into sentences — see `rules-inventory.ts`. */
  @Input() entries: ReadonlyArray<RuleEntry> = [];
  /** The form's pages, in order, for the group headings. */
  @Input() pages: ReadonlyArray<RuleGroupPage> = [];

  /** A row was clicked: take the author to the item this rule belongs to. */
  @Output() readonly openRequested = new EventEmitter<RuleEntry>();
  /** The empty state's call to action. */
  @Output() readonly addRequested = new EventEmitter<void>();

  protected get groups(): RuleEntryGroup[] {
    return groupEntriesByPage(this.entries, this.pages);
  }

  protected get brokenCount(): number {
    return brokenRuleCount(this.entries);
  }
}
