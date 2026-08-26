/**
 * The centered card a rule is authored in — chrome only.
 *
 * The rules panel lives in the builder's properties rail, which is ~300px wide. A condition is a
 * question picker, an operator picker and a value, and a rule is several of those plus an any/all
 * toggle and, for a jump, a target page. At rail width every one of those controls is a slot
 * rather than a control, which is the same complaint `ImagePickerDialogComponent` was built to
 * answer, and this follows its shape deliberately — `:host { position: fixed; inset: 0 }` over a
 * backdrop — so there is one modal idiom in the builder rather than three.
 *
 * It knows NOTHING about rules: the body is projected, and every verb decision stays in
 * {@link RulesPanelComponent}. That is what keeps the two from drifting as verbs are added — a
 * dialog that switched on the verb would be a second place to teach about `jump`.
 *
 * Wider than the image picker (720px vs 520px) because a condition row is horizontal — question,
 * operator, value side by side — where a dropzone is a square.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FORMS_UI_CSS } from '../shared';

const RULE_DIALOG_CSS = /* css */ `
:host {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mjf-gap);
}

.red-backdrop {
  position: absolute;
  inset: 0;
  background: var(--mj-overlay-scrim, rgba(9, 17, 24, 0.55));
}

.red {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(680px, calc(100vh - 2 * var(--mjf-gap)));
  background: var(--mj-bg-surface);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius);
  box-shadow: var(--mj-shadow-lg, 0 24px 48px rgba(0, 0, 0, 0.28));
  overflow: hidden;
}

.red-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  border-bottom: 1px solid var(--mjf-rule);
}
.red-head-icon {
  flex: none;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--mjf-radius-sm);
  background: var(--mj-bg-surface-hover);
  color: var(--mj-brand-primary);
  font-size: 0.9375rem;
}
.red-headings { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.red-title { margin: 0; font-size: 1.0625rem; font-weight: 600; color: var(--mj-text-primary); }
.red-sub { margin: 0; font-size: var(--mjf-meta); line-height: 1.45; color: var(--mj-text-muted); }

.red-close {
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
.red-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
.red-close:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.red-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--mjf-card-pad);
}

.red-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
  border-top: 1px solid var(--mjf-rule);
  background: var(--mj-bg-surface-sunken);
}

/* The unsaved-changes warning, in the footer rather than as a second modal: stacking one
   dialog on another buries the thing being asked about, and the author needs to see the rule
   they are about to lose while deciding. */
.red-warn { flex: 1 1 auto; margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
.red-spacer { flex: 1 1 auto; }
.red-ghost {
  flex: none;
  font: inherit;
  font-size: var(--mjf-meta);
  font-weight: 600;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--mj-text-secondary);
  background: none;
  border: none;
  border-radius: var(--mjf-radius-sm);
}
.red-ghost:hover { color: var(--mj-text-primary); background: var(--mj-bg-surface-hover); }
.red-ghost:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

/* A phone gets the whole viewport: a centered card with side padding wastes the only axis a
   condition row needs, and the body already scrolls. */
@media (max-width: 640px) {
  :host { padding: 0; }
  .red { width: 100%; max-height: 100vh; height: 100%; border: none; border-radius: 0; }
}
`;

@Component({
  selector: 'mjf-rule-editor-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, RULE_DIALOG_CSS],
  template: `
    <div class="red-backdrop" (click)="closeRequested.emit()"></div>

    <div class="red" role="dialog" aria-modal="true" [attr.aria-label]="title">
      <div class="red-head">
        @if (icon) {
          <span class="red-head-icon"><i [class]="icon" aria-hidden="true"></i></span>
        }
        <div class="red-headings">
          <h2 class="red-title">{{ title }}</h2>
          @if (subtitle) {
            <p class="red-sub">{{ subtitle }}</p>
          }
        </div>
        <button type="button" class="red-close" aria-label="Close" (click)="closeRequested.emit()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="red-body">
        <ng-content />
      </div>

      <!-- Confirm LEFT, cancel RIGHT, per the repo's dialog convention — in both states.
           Done is disabled rather than hidden while there is nothing to save: a button that
           vanishes leaves an author looking for it, where a dim one says "not yet". -->
      <div class="red-foot">
        @if (confirming) {
          <p class="red-warn" role="alert">Discard your changes?</p>
          <button type="button" class="mjf-btn mjf-btn--danger" (click)="discarded.emit()">Discard</button>
          <button type="button" class="red-ghost" (click)="resumed.emit()">Keep editing</button>
        } @else {
          <button
            type="button"
            class="mjf-btn mjf-btn--primary"
            [disabled]="!canConfirm"
            (click)="confirmed.emit()"
          >Done</button>
          <span class="red-spacer"></span>
          <button type="button" class="red-ghost" (click)="closeRequested.emit()">Cancel</button>
        }
      </div>
    </div>
  `,
})
export class RuleEditorDialogComponent {
  /** The dialog's heading, and its accessible name. */
  @Input() title = '';
  /** One line under the heading — what this rule does. */
  @Input() subtitle = '';
  /** Font Awesome classes shown beside the heading. */
  @Input() icon = '';
  /** Whether Done can be pressed — the host decides what "finished" means. */
  @Input() canConfirm = true;
  /** Show the discard warning in place of the normal footer. */
  @Input() confirming = false;

  /**
   * The author tried to dismiss — backdrop, ✕, Escape or Cancel.
   *
   * Deliberately a REQUEST, not a `closed` fact: the host owns whether unsaved work makes this
   * worth interrupting, and a dialog that announced its own closure could not be talked out of
   * it. Escape while the warning is up answers the warning rather than re-asking it.
   */
  @Output() readonly closeRequested = new EventEmitter<void>();
  /** Done — the host may commit. */
  @Output() readonly confirmed = new EventEmitter<void>();
  /** The warning was answered: throw the work away. */
  @Output() readonly discarded = new EventEmitter<void>();
  /** The warning was answered: go back to editing. */
  @Output() readonly resumed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.confirming) {
      this.resumed.emit();
      return;
    }
    this.closeRequested.emit();
  }
}
