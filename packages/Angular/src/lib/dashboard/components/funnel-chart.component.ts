import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FORMS_VIZ_CSS } from '../../shared';
import { dropOffSeverity, percent, type DropOffSeverity } from '../reporting-view-model';
import type { FunnelStep } from '../models/reporting.model';

/**
 * Where people stop filling the form in.
 *
 * Two decisions carry this chart:
 *
 * THE LOSS IS DRAWN BETWEEN THE STEPS, not attached to the one after it. A step's
 * `dropOff` is the share lost on the way TO it, so hanging that figure under its own title
 * says "this page lost 40%" about the page people never reached. The gap between two rows
 * is where the leak is, and it is where the number now sits — threaded onto the connector
 * line that makes the pages read as a sequence rather than as an unordered pile of bars
 * (the same device the Automate tab's step rail uses, for the same reason).
 *
 * ONLY A SEVERE LOSS IS COLOURED. Every step loses somebody. Marking all of them in
 * warning orange taught the reader to skip the colour by the third row, which is precisely
 * when the one that mattered arrived. Ordinary attrition states its figure in plain muted
 * text; `dropOffSeverity` decides where the threshold is.
 */
@Component({
  selector: 'mj-forms-funnel-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (steps.length === 0) {
      <p class="fn-empty">This form has a single page, so there is no drop-off to chart.</p>
    } @else {
      <ol class="fn">
        @for (s of steps; track s.pageId; let i = $index; let last = $last) {
          <li class="fn-step">
            <span class="fn-index" aria-hidden="true">{{ i + 1 }}</span>
            <div class="fn-body">
              <div class="fn-head">
                <span class="fn-title">{{ s.title }}</span>
                <span class="fn-count">
                  <strong>{{ s.reached }}</strong> reached
                  <span class="fn-retain">{{ pct(s.retention) }}</span>
                </span>
              </div>
              <div class="fn-track mjf-viz-track">
                <div class="mjf-viz-bar mjf-viz-series" [style.width.%]="s.retention * 100"></div>
              </div>
            </div>
          </li>
          @if (!last) {
            <li [class]="'fn-gap is-' + severityAfter(i)">
              @if (severityAfter(i) !== 'none') {
                <span class="fn-gap-note">
                  <i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i>
                  {{ pct(steps[i + 1].dropOff) }} left here
                </span>
              }
            </li>
          }
        }
      </ol>
    }
  `,
  styles: [
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .fn-empty { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      .fn { margin: 0; padding: 0; list-style: none; }

      .fn-step { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }

      .fn-index {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        font-size: var(--mjf-label);
        font-weight: 700;
        color: var(--mj-text-secondary);
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mjf-rule);
        font-variant-numeric: tabular-nums;
      }

      .fn-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 7px; padding-bottom: 2px; }

      .fn-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
      .fn-title { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); overflow-wrap: anywhere; }
      .fn-count { flex: none; font-size: var(--mjf-label); color: var(--mj-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
      .fn-count strong { color: var(--mj-text-primary); font-size: var(--mjf-meta); }
      .fn-retain { margin-left: 8px; }

      .fn-track { height: 10px; border-radius: var(--mjf-radius-pill, 9999px); }
      .fn-track > .mjf-viz-bar { border-radius: var(--mjf-radius-pill, 9999px); }

      /* The connector. Aligned to the centre of the 26px index disc (13px) so the line
         threads the numbers exactly; the gap row owns its own height so the leak note has
         somewhere to sit even when there is no note to show. */
      .fn-gap {
        position: relative;
        display: flex;
        align-items: center;
        min-height: 22px;
        padding: 2px 0 2px 40px;
      }
      .fn-gap::before {
        content: '';
        position: absolute;
        left: 13px;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--mjf-rule);
      }
      .fn-gap-note {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: var(--mjf-label);
        color: var(--mj-text-muted);
        font-variant-numeric: tabular-nums;
      }
      /* Colour is spent only on the losses worth acting on, and the connector thickens
         with it so the leak is findable while scrolling past, not just readable. */
      .fn-gap.is-severe .fn-gap-note { color: var(--mj-status-warning-text); font-weight: 600; }
      .fn-gap.is-severe::before { width: 3px; left: 12px; background: var(--mjf-viz-negative); }
    `,
  ],
})
export class FormsFunnelChartComponent {
  @Input() steps: FunnelStep[] = [];

  /** How loudly to call out the loss between step `index` and the one after it. */
  public severityAfter(index: number): DropOffSeverity {
    const next = this.steps[index + 1];
    return next ? dropOffSeverity(next.dropOff) : 'none';
  }

  public pct(fraction: number): string {
    return percent(fraction);
  }
}
