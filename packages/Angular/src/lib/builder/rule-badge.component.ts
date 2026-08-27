/**
 * One rule badge on the canvas, and the message behind it.
 *
 * The badge is the only place the builder says a rule has stopped working, so the message has to
 * be readable. It was a native `[title]` at three call sites, which
 * `setting-row.component.ts` had already rejected for the reason that matters most here: the
 * browser waits about a second before showing anything, so the honest reading of a hover that
 * does nothing is that the control is broken. On the badge that REPORTS a broken rule, that is
 * precisely the wrong impression — and it is the one an author actually reported.
 *
 * One component rather than a span repeated three times (a question, a section header, an ending
 * screen). The bubble is fiddly enough — overlap, pointer events, multi-line detail — that three
 * copies would have drifted, and the tooltip is the whole reason this exists.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FORMS_UI_CSS } from '../shared';
import type { RuleBadge } from './rules-inventory';

const RULE_BADGE_CSS = `
:host { display: inline-flex; position: relative; }

.rb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  /* Carried here from the canvas's own .fb-q-tags .mjf-badge rule: a parent's scoped styles do
     not reach inside a child component, so leaving it there would have quietly inflated every
     badge the moment this component took over rendering them. */
  padding: 1px 8px;
  font-size: 0.6875rem;
  /* Promises a tooltip, and now there is one to show. */
  cursor: help;
}
.rb i { font-size: 0.625rem; opacity: 0.8; }

.rb-tip {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  /* Sized to its text, capped so a long rule wraps instead of running off the canvas. The rail's
     pin-both-edges trick does not transfer: a badge sits in a wide canvas row, not a 300px
     column, so stretching to the row would give one sentence the width of the whole card. */
  width: max-content;
  max-width: 320px;
  padding: 8px 10px;
  font-size: var(--mjf-label);
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  /* detail joins one rule per line with a newline — an item may carry several. */
  white-space: pre-line;
  color: var(--mj-text-primary);
  background: var(--mj-bg-surface-elevated);
  border: 1px solid var(--mjf-rule);
  border-radius: var(--mjf-radius-sm);
  box-shadow: var(--mj-shadow-md);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--mjf-ease);
  /* The bubble overlaps the question BELOW it, so without this it swallows that row: the author
     moves the mouse down off the badge and their click lands on the tooltip instead of the
     question. setting-row hit exactly this, and its comment records how it was found. */
  pointer-events: none;
}

:host(:hover) .rb-tip { opacity: 1; visibility: visible; }
`;

@Component({
  selector: 'mjf-rule-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  styles: [FORMS_UI_CSS, RULE_BADGE_CSS],
  template: `
    @if (badge; as badge) {
      <span
        class="mjf-badge rb"
        [class.mjf-badge--warning]="badge.broken"
        [attr.aria-label]="badge.label + ': ' + badge.detail"
      >
        <i [class]="badge.icon" aria-hidden="true"></i> {{ badge.label }}
        <span class="rb-tip" role="tooltip">{{ badge.detail }}</span>
      </span>
    }
  `,
})
export class RuleBadgeComponent {
  /**
   * The badge to render — see `ruleBadgesFor`.
   *
   * Nullable rather than `required`, so a caller reading a badge map by id gets an empty render
   * instead of a template error on an item that carries no rules.
   */
  @Input() badge: RuleBadge | null = null;
}
