import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FunnelStep } from '../models/reporting.model';

/**
 * Page completion / drop-off funnel. Each step is a token-filled bar whose width
 * is its retention relative to the first step, with the per-step drop-off called
 * out. All colors are `--mj-*` tokens (dark-mode safe).
 */
@Component({
  selector: 'mj-forms-funnel-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (steps.length === 0) {
      <p class="empty">No pages to chart.</p>
    } @else {
      <ol class="funnel">
        @for (s of steps; track s.pageId; let idx = $index) {
          <li class="step">
            <div class="step-head">
              <span class="step-title">{{ idx + 1 }}. {{ s.title }}</span>
              <span class="step-count">{{ s.reached }} reached · {{ pct(s.retention) }} retained</span>
            </div>
            <div class="step-track">
              <div class="step-fill" [style.width.%]="s.retention * 100"></div>
            </div>
            @if (idx > 0 && s.dropOff > 0) {
              <span class="step-drop">
                <i class="fa-solid fa-arrow-trend-down"></i> {{ pct(s.dropOff) }} drop-off
              </span>
            }
          </li>
        }
      </ol>
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
      .funnel {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-3);
      }
      .step-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: var(--mj-space-2);
        margin-bottom: var(--mj-space-1);
      }
      .step-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .step-count {
        font-size: 12px;
        color: var(--mj-text-secondary);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .step-track {
        height: 22px;
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-sm);
        overflow: hidden;
      }
      .step-fill {
        height: 100%;
        background: var(--mj-color-brand-600);
        border-radius: var(--mj-radius-sm);
        min-width: 2px;
        transition: width 0.3s ease;
      }
      .step-drop {
        display: inline-block;
        margin-top: var(--mj-space-1);
        font-size: 11px;
        color: var(--mj-status-warning);
      }
    `,
  ],
})
export class FormsFunnelChartComponent {
  @Input() steps: FunnelStep[] = [];

  public pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
  }
}
