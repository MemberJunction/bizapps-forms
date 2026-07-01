import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { DistributionBucket } from '../models/reporting.model';

/**
 * Horizontal bar chart for a choice/boolean distribution. Pure CSS bars whose
 * fills come from `--mj-*` design tokens (no hardcoded colors → dark-mode safe).
 * Each bar's width is the bucket fraction; counts + percentages are labelled.
 */
@Component({
  selector: 'mj-forms-distribution-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (buckets.length === 0) {
      <p class="empty">No answers yet.</p>
    } @else {
      <ul class="bars" role="list">
        @for (b of buckets; track b.label) {
          <li class="bar-row">
            <span class="bar-label" [title]="b.label">{{ b.label }}</span>
            <span class="bar-track">
              <span
                class="bar-fill"
                [style.width.%]="b.fraction * 100"
                [attr.aria-label]="b.label + ': ' + b.count + ' (' + pct(b.fraction) + ')'">
              </span>
            </span>
            <span class="bar-value">{{ b.count }} ({{ pct(b.fraction) }})</span>
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .empty {
        color: var(--mj-text-muted);
        font-style: italic;
        margin: 0;
      }
      .bars {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2);
      }
      .bar-row {
        display: grid;
        grid-template-columns: minmax(80px, 30%) 1fr auto;
        align-items: center;
        gap: var(--mj-space-2-5);
      }
      .bar-label {
        font-size: 13px;
        color: var(--mj-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-track {
        position: relative;
        height: 18px;
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-sm);
        overflow: hidden;
      }
      .bar-fill {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--mj-brand-primary);
        border-radius: var(--mj-radius-sm);
        min-width: 2px;
        transition: width 0.3s ease;
      }
      .bar-value {
        font-size: 12px;
        color: var(--mj-text-secondary);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class FormsDistributionChartComponent {
  @Input() buckets: DistributionBucket[] = [];

  public pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
  }
}
