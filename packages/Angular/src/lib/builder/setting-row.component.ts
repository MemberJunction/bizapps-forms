/**
 * One line of the properties panel: a name on the left, its control on the right, and — when the
 * control is on — its editor underneath.
 *
 * The panel used to be a stack of boxed fields, every optional setting permanently expanded
 * whether or not the author had any use for it. A question with a placeholder, a validation rule
 * and a conditional rule showed three editors at once, so the two things most questions actually
 * need (its wording and whether it is required) were pushed below the fold by machinery most
 * questions never touch.
 *
 * A row states that the setting EXISTS and defers what it looks like until someone wants it. The
 * whole panel then reads as a list of capabilities rather than a form to fill in, and the depth
 * is there for the author who needs it without charging everyone else for it.
 *
 * Presentation only — no state, no persistence. The host owns whether the row is on, because the
 * host is what knows how "on" is stored: a boolean column for one setting, the presence of a
 * value for another.
 */
import { ChangeDetectionStrategy, Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

const SETTING_ROW_CSS = /* css */ `
:host { display: block; }

.sr {
  /* The bubble's containing block, so it can span the row rather than trail off the panel. */
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--mjf-gap-sm);
  min-height: 44px;
  padding: 6px 0;
}
.sr-label {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--mjf-meta);
  font-weight: 600;
  color: var(--mj-text-primary);
}
/* The help marker and its bubble.

   It was a native title attribute first, which is technically a tooltip and practically a dead
   icon: the browser waits about a second before showing anything, so the honest reading of a
   hover that does nothing is that the control is broken. This one appears immediately, and being
   focusable it also answers for a keyboard, which a title attribute never did. */
.sr-help {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 12px;
  color: var(--mj-text-muted);
  cursor: help;
  background: none;
  border: none;
  border-radius: 50%;
}
.sr-help:hover { color: var(--mj-text-primary); }
.sr-help:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 1px; }

.sr-tip {
  position: absolute;
  top: calc(100% - 2px);
  /* Spans the ROW, not the icon. Anchored to the icon it trailed off the right-hand edge and was
     clipped — the properties panel is only ~300px wide and is a scroll container, so a bubble
     that grows from wherever the icon happens to sit will always run out of room for some label
     or other. Pinning both edges to the row makes the width a property of the panel instead. */
  left: 0;
  right: 0;
  z-index: 30;
  padding: 8px 10px;
  font-size: var(--mjf-label);
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface-elevated);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius-sm);
  box-shadow: var(--mj-shadow-md);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--mjf-ease);
  /* The bubble overlaps the row BELOW it, so without this it swallows that row's toggle: the
     author moves the mouse down from the help icon, the click lands on the tooltip, and the
     switch does not flip. Caught by an automation run refusing to hover the next icon because
     "subtree intercepts pointer events" — a person would just have found the toggle dead. */
  pointer-events: none;
}
.sr-help:hover .sr-tip,
.sr-help:focus-visible .sr-tip {
  opacity: 1;
  visibility: visible;
}
.sr-control { flex: none; display: flex; align-items: center; gap: 6px; }

/* The editor the row reveals. Sits directly under its row so it reads as belonging to it rather
   than as the next setting along. */
.sr-body { padding: 0 0 12px; }
`;

@Component({
  selector: 'mjf-setting-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [SETTING_ROW_CSS],
  template: `
    <div class="sr-group">
      <div class="sr">
        <span class="sr-label" [id]="labelId">
          {{ label }}
          @if (hint) {
            <button type="button" class="sr-help" [attr.aria-label]="label + ': ' + hint">
              <i class="fa-regular fa-circle-question" aria-hidden="true"></i>
              <span class="sr-tip" role="tooltip">{{ hint }}</span>
            </button>
          }
        </span>
        <span class="sr-control">
          <ng-content select="[slot=control]" />
        </span>
      </div>

      @if (open) {
        <div class="sr-body">
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class SettingRowComponent {
  @Input({ required: true }) label = '';
  /** Shown on a help icon beside the label. Omit when the label already says it. */
  @Input() hint = '';
  /** Whether the row's editor is showing. The host decides; this only renders the decision. */
  @Input({ transform: booleanAttribute }) open = false;
  /** DOM id for the label, so a host control can point at it with aria-labelledby. */
  @Input() labelId = '';
}
