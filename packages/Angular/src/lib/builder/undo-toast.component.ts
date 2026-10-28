import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UNDO_WINDOW_MS } from './pending-delete';

/**
 * "Deleted “Email” · Undo" — the builder's one undo affordance (UI audit F07).
 *
 * A live region, so a screen reader hears the delete happen and that it can be taken back; the
 * button is an ordinary tab stop rather than a focus trap, because the author was in the middle of
 * something else. The countdown bar is decoration: the window itself is `PendingDelete`'s timer,
 * and the bar is hidden under reduced motion. The parent re-creates the toast for each delete, so
 * the bar restarts with it.
 */
@Component({
  selector: 'mjf-undo-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ut" role="status" aria-live="polite">
      <span class="ut-text">Deleted {{ Label() }}</span>
      <button type="button" class="ut-undo" (click)="Undo.emit()">Undo</button>
      <span class="ut-bar" aria-hidden="true" [style.animation-duration.ms]="windowMs"></span>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        z-index: 1000;
        max-width: calc(100vw - 32px);
      }
      /* A raised surface in the page's own colours, so it follows light and dark like the
         builder around it; the border and shadow are what lift it off the canvas. */
      .ut {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 12px 10px 16px;
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        background: var(--mj-bg-surface-elevated);
        color: var(--mj-text-primary);
        box-shadow: var(--mj-shadow-lg);
        font-size: 14px;
      }
      .ut-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ut-undo {
        flex: none;
        min-height: 32px;
        padding: 4px 14px;
        border: 1px solid var(--mj-border-strong);
        border-radius: 6px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .ut-undo:hover { background: var(--mj-bg-surface-hover); }
      .ut-undo:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
      .ut-bar {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: 100%;
        background: var(--mj-brand-primary);
        transform-origin: left;
        animation-name: ut-countdown;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
      }
      @keyframes ut-countdown { to { transform: scaleX(0); } }
      @media (prefers-reduced-motion: reduce) { .ut-bar { display: none; } }
    `,
  ],
})
export class UndoToastComponent {
  /** What was deleted, already phrased: `question “Email”`. */
  public readonly Label = input.required<string>();
  public readonly Undo = output<void>();
  protected readonly windowMs = UNDO_WINDOW_MS;
}
