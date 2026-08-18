import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FORMS_UI_CSS } from '../../shared';
import type { FormSummaryStats } from '../models/reporting.model';

/** Top-line stat cards: total responses, completion rate, avg time, last submit. */
@Component({
  selector: 'mj-forms-summary-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mjf-section">
      <h3 class="mjf-section-title">Big picture</h3>
      <div class="stat-card mjf-card mjf-card--pad">
        <div class="stat">
          <span class="stat-value">{{ stats.totalResponses }}</span>
          <span class="stat-label">Responses</span>
          <span class="stat-sub">{{ stats.completeResponses }} complete · {{ stats.partialResponses }} partial</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ pct(stats.completionRate) }}</span>
          <span class="stat-label">Completion rate</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ durationLabel }}</span>
          <span class="stat-label">Avg. time to complete</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ lastLabel }}</span>
          <span class="stat-label">Last response</span>
        </div>
      </div>
    </section>
  `,
  styles: [
    FORMS_UI_CSS,
    `
      :host { display: block; }

      /* One card holding four figures, rather than four cards holding one each. The
         numbers are a single reading — "how is this form doing" — and boxing each one
         separately made a summary of four values fill the width like a dashboard of
         unrelated widgets. */
      .stat-card {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: var(--mjf-stack);
        align-items: start;
      }
      .stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .stat-value {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1.15;
        letter-spacing: var(--mj-tracking-tight, -0.02em);
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .stat-label { font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
      .stat-sub { margin-top: 2px; font-size: var(--mjf-label); color: var(--mj-text-muted); }
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
