import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { FormSummaryStats } from '../models/reporting.model';

/** Top-line stat cards: total responses, completion rate, avg time, last submit. */
@Component({
  selector: 'mj-forms-summary-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-icon"><i class="fa-solid fa-inbox"></i></span>
        <span class="stat-value">{{ stats.totalResponses }}</span>
        <span class="stat-label">Responses</span>
        <span class="stat-sub">{{ stats.completeResponses }} complete · {{ stats.partialResponses }} partial</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon"><i class="fa-solid fa-circle-check"></i></span>
        <span class="stat-value">{{ pct(stats.completionRate) }}</span>
        <span class="stat-label">Completion rate</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon"><i class="fa-solid fa-clock"></i></span>
        <span class="stat-value">{{ durationLabel }}</span>
        <span class="stat-label">Avg. time to complete</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon"><i class="fa-solid fa-calendar-day"></i></span>
        <span class="stat-value">{{ lastLabel }}</span>
        <span class="stat-label">Last response</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--mj-space-3);
      }
      .stat-card {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-1);
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
        box-shadow: var(--mj-shadow-sm);
      }
      .stat-icon {
        color: var(--mj-brand-primary);
        font-size: 16px;
      }
      .stat-value {
        font-size: 26px;
        font-weight: 700;
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .stat-label {
        font-size: 12px;
        color: var(--mj-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .stat-sub {
        font-size: 12px;
        color: var(--mj-text-muted);
      }
    `,
  ],
})
export class FormsSummaryStatsComponent {
  @Input({ required: true }) stats!: FormSummaryStats;

  public pct(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
  }

  public get durationLabel(): string {
    const secs = this.stats.averageCompletionSeconds;
    if (secs === null) return '—';
    if (secs < 60) return `${Math.round(secs)}s`;
    const mins = secs / 60;
    if (mins < 60) return `${mins.toFixed(1)}m`;
    return `${(mins / 60).toFixed(1)}h`;
  }

  public get lastLabel(): string {
    const d = this.stats.lastSubmittedAt;
    if (!d) return '—';
    return d.toLocaleDateString();
  }
}
