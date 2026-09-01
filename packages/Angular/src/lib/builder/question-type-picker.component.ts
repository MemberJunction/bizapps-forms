/**
 * "Insert a question" — the modal an author picks a question type from, opened by the + in the
 * canvas gutter.
 *
 * A MODAL, following {@link ImagePickerDialogComponent} exactly: `:host { position: fixed;
 * inset: 0 }` over a backdrop, a head carrying the title and a close button, a scrolling body,
 * Escape to dismiss. That component in turn follows `FormPreviewModalComponent`, and the point of
 * all three matching is that the builder has ONE modal idiom rather than one per feature. An
 * earlier version of this was an anchored popover with its own shape and its own shadow, which
 * made it the only surface in the builder that opened like that.
 *
 * The gutter + still says WHERE — that is what it is for, and the seam it belongs to is held by
 * the caller. This dialog only answers WHAT.
 *
 * WIDE AND MULTI-COLUMN, so all twenty-five types are on screen at once. A tall narrow list put
 * five of seven groups below the fold, which turns "which type do I want" into scrolling and
 * remembering. The groups flow through CSS columns rather than a fixed grid, so a group is never
 * split down the middle and the layout reflows on its own as the catalog grows.
 *
 * The rows are ICON + LABEL and nothing else. They carried the catalog's `hint` too, which reads
 * as help on a list you are scanning: twenty-five rows each ending in a grey sentence is a wall,
 * and the label is what an author is actually looking for. The hint survives as a `title`.
 *
 * NO SEARCH. Every type is visible at once, so a filter could only hide rows already in view,
 * and it cost a mode, an empty state and a second list shape to keep. The left rail holds the
 * shortcut list alone — see `COMMON_TYPES`, a fixed curated set that says so, because nothing
 * here records what this author actually reaches for.
 *
 * THE HIGHLIGHT HAS ONE OWNER AT A TIME. The mouse highlights through CSS `:hover`, which cannot
 * get stuck because it is not state; the keyboard highlights through an index. The mouse used to
 * WRITE that index on `mouseenter`, and nothing cleared it — so a row stayed lit after the
 * pointer left, and two rows could be lit at once. Entering the list now clears the index back to
 * `NO_HIGHLIGHT` and leaves the pointer to `:hover`; the first arrow key takes it back.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';

import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../shared';
import { questionTypeColorClass } from './question-type-catalog';
import {
  commonTypes,
  movedHighlight,
  NO_HIGHLIGHT,
  pickerGroups,
  pickerTypes,
  type PickerGroup,
} from './question-type-picker-model';

const QUESTION_TYPE_PICKER_CSS = /* css */ `
:host {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mjf-gap);
}

.qtp-backdrop {
  position: absolute;
  inset: 0;
  background: var(--mj-overlay-scrim, rgba(9, 17, 24, 0.55));
}

.qtp {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1120px, 100%);
  max-height: min(760px, calc(100vh - 2 * var(--mjf-gap)));
  background: var(--mj-bg-surface);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius);
  box-shadow: var(--mj-shadow-lg, 0 24px 48px rgba(0, 0, 0, 0.28));
  overflow: hidden;
}

/* Focused to receive keys, not because the author aimed at it — a ring around the whole dialog
   would read as a selection they made. Every control inside keeps its own ring. */
.qtp:focus { outline: none; }

.qtp-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: 14px var(--mjf-gap);
  border-bottom: 1px solid var(--mjf-rule);
}
.qtp-title { flex: 1 1 auto; margin: 0; font-size: 1rem; font-weight: 600; color: var(--mj-text-primary); }
.qtp-close {
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.qtp-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.qtp-close:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.qtp-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  gap: var(--mjf-gap);
  padding: var(--mjf-gap);
  overflow: hidden;
}

/* The rail: how you get here fast. Search first, because it is the fastest route of all. */
.qtp-rail {
  flex: none;
  width: 232px;
  display: flex;
  flex-direction: column;
  gap: var(--mjf-stack);
  overflow-y: auto;
}
.qtp-rail-list { display: flex; flex-direction: column; gap: 8px; }

/* The grid: every group on screen at once. Columns rather than a fixed grid, so a group is never
   split across a boundary and the layout reflows on its own as the catalog grows. */
.qtp-main { flex: 1 1 auto; min-width: 0; overflow-y: auto; }
.qtp-columns { columns: 3; column-gap: var(--mjf-gap); }
.qtp-group { break-inside: avoid; margin: 0 0 var(--mjf-gap); }

.qtp-heading {
  margin: 0 0 8px;
  padding: 0 8px;
  font-size: var(--mjf-body);
  font-weight: 600;
  color: var(--mj-text-primary);
}

/* Icon and label only. A hint per row turns a list you scan into a wall you read. */
.qtp-row {
  width: 100%;
  min-height: var(--mjf-tap);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  font: inherit;
  font-size: var(--mjf-body);
  text-align: left;
  cursor: pointer;
  color: var(--mj-text-primary);
  background: transparent;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.qtp-row:hover,
.qtp-row.is-highlighted { background: var(--mj-bg-surface-hover); }
.qtp-row:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: -2px; }

/* The rail's rows are cards, so the shortcut reads as a distinct offer rather than as the grid
   repeated at the side. */
.qtp-row--card { border: 1px solid var(--mjf-rule); background: var(--mj-bg-surface); }
.qtp-row--card:hover { border-color: var(--mj-brand-primary); }

/* A tinted tile in the type's own group colour: the same hue that marks the type everywhere else
   in the builder, at a fill light enough to sit a glyph on. color-mix keeps it theme-correct in
   both light and dark without a second token per group. */
.qtp-tile {
  flex: none;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  border-radius: var(--mjf-radius-sm);
  background: color-mix(in srgb, var(--mjf-viz-fill) 14%, transparent);
}


@media (max-width: 900px) {
  .qtp-body { flex-direction: column; overflow-y: auto; }
  .qtp-rail { width: auto; }
  .qtp-columns { columns: 2; }
}
`;


@Component({
  selector: 'mjf-question-type-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, QUESTION_TYPE_PICKER_CSS],
  template: `
    <div class="qtp-backdrop" (click)="Dismissed.emit()"></div>

    <!-- tabindex + focus on open: the arrow keys and Enter are handled here, and a keydown only
         reaches this element by bubbling from whatever holds focus. It also puts focus INSIDE the
         modal, rather than leaving it on the canvas behind the overlay. -->
    <div
      #panel
      class="qtp"
      role="dialog"
      aria-modal="true"
      aria-label="Insert a question"
      tabindex="-1"
      (keydown)="onKeydown($event)"
    >
      <div class="qtp-head">
        <h2 class="qtp-title">Insert a question</h2>
        <button type="button" class="qtp-close" aria-label="Close" (click)="Dismissed.emit()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="qtp-body">
        <div class="qtp-rail">
            <div class="qtp-rail-list">
              <p class="qtp-heading">Common</p>
              @for (meta of common; track meta.type) {
                <button
                  type="button"
                  class="qtp-row qtp-row--card"
                  [title]="meta.hint"
                  (mousedown)="$event.preventDefault(); pick(meta.type)"
                >
                  <span [class]="'qtp-tile ' + colorClassFor(meta.type)">
                    <i [class]="'mjf-type-glyph ' + meta.icon" aria-hidden="true"></i>
                  </span>
                  <span>{{ meta.label }}</span>
                </button>
              }
            </div>
        </div>

        <div class="qtp-main">
          <!-- Entering the list hands the highlight to the pointer: the index goes back to
               NO_HIGHLIGHT and :hover takes over, so nothing stays lit once the pointer leaves. -->
          <div class="qtp-columns" role="listbox" aria-label="Question types" (mouseenter)="releaseHighlight()">
            @for (group of groups; track group.heading) {
              <div class="qtp-group">
                <p class="qtp-heading">{{ group.heading }}</p>
                @for (meta of group.types; track meta.type) {
                  <button
                    type="button"
                    class="qtp-row"
                    role="option"
                    [class.is-highlighted]="indexOf(meta.type) === highlighted"
                    [attr.aria-selected]="indexOf(meta.type) === highlighted"
                    [title]="meta.hint"
                    (mousedown)="$event.preventDefault(); pick(meta.type)"
                  >
                    <span [class]="'qtp-tile ' + colorClassFor(meta.type)">
                      <i [class]="'mjf-type-glyph ' + meta.icon" aria-hidden="true"></i>
                    </span>
                    <span>{{ meta.label }}</span>
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class QuestionTypePickerComponent implements AfterViewInit {
  /** The author chose a type; the caller inserts it at the seam this dialog was opened from. */
  @Output() Picked = new EventEmitter<FormQuestionType>();

  /** Escape, the close button, or the backdrop. The caller closes; nothing here decides that. */
  @Output() Dismissed = new EventEmitter<void>();

  @ViewChild('panel') private panel?: ElementRef<HTMLElement>;

  protected highlighted = NO_HIGHLIGHT;

  private readonly cdr = inject(ChangeDetectorRef);

  /** The mjf-viz-* class carrying a type's group colour — the palette's own mapping. */
  protected readonly colorClassFor = questionTypeColorClass;

  ngAfterViewInit(): void {
    this.panel?.nativeElement.focus();
  }

  /** Escape closes, which is what anyone expects of a modal — matching the image picker. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.Dismissed.emit();
  }

  /** The rail's shortcut list — a fixed set, see COMMON_TYPES. */
  protected readonly common = commonTypes();

  protected get groups(): PickerGroup[] {
    return pickerGroups();
  }

  /** Hand the highlight back to the pointer — see the note on NO_HIGHLIGHT. */
  protected releaseHighlight(): void {
    if (this.highlighted !== NO_HIGHLIGHT) {
      this.highlighted = NO_HIGHLIGHT;
      this.cdr.markForCheck();
    }
  }

  /** Position of a type in the flattened list — what the highlight and the arrow keys index. */
  protected indexOf(type: FormQuestionType): number {
    return pickerTypes(this.groups).findIndex((meta) => meta.type === type);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const types = pickerTypes(this.groups);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlighted = movedHighlight(this.highlighted, event.key === 'ArrowDown' ? 1 : -1, types.length);
      this.cdr.markForCheck();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = types[this.highlighted];
      if (chosen) {
        this.pick(chosen.type);
      }
    }
  }

  protected pick(type: FormQuestionType): void {
    this.Picked.emit(type);
  }
}
