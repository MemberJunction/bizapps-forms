import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { QuestionBreakdown } from '../models/reporting.model';
import { FormsDistributionChartComponent } from './distribution-chart.component';

/**
 * Renders one question's breakdown card, switching by kind:
 * - distribution/boolean → bar chart
 * - numeric → aggregates (with NPS score + segments when applicable)
 * - freeText → verbatim list
 */
@Component({
  selector: 'mj-forms-question-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsDistributionChartComponent],
  template: `
    <article class="card">
      <header class="card-head">
        <h3 class="prompt">{{ breakdown.prompt }}</h3>
        <span class="meta">{{ typeLabel }} · {{ breakdown.answeredCount }} answered</span>
      </header>

      @switch (breakdown.kind) {
        @case ('distribution') {
          <mj-forms-distribution-chart [buckets]="breakdown.buckets"></mj-forms-distribution-chart>
        }
        @case ('boolean') {
          <mj-forms-distribution-chart [buckets]="breakdown.buckets"></mj-forms-distribution-chart>
        }
        @case ('numeric') {
          @if (breakdown.numeric; as n) {
            <div class="numeric">
              @if (n.npsScore !== null) {
                <div class="nps">
                  <span class="nps-score">{{ n.npsScore }}</span>
                  <span class="nps-label">NPS</span>
                  @if (n.npsSegments; as seg) {
                    <span class="nps-seg">
                      {{ seg.promoters }} promoters · {{ seg.passives }} passives · {{ seg.detractors }} detractors
                    </span>
                  }
                </div>
              }
              <dl class="agg">
                <div><dt>Average</dt><dd>{{ fmt(n.average) }}</dd></div>
                <div><dt>Min</dt><dd>{{ fmt(n.min) }}</dd></div>
                <div><dt>Max</dt><dd>{{ fmt(n.max) }}</dd></div>
                <div><dt>Answered</dt><dd>{{ n.answered }}</dd></div>
              </dl>
            </div>
          }
        }
        @case ('freeText') {
          @if (breakdown.textAnswers.length === 0) {
            <p class="empty">No answers yet.</p>
          } @else {
            <ul class="text-list">
              @for (t of breakdown.textAnswers; track $index) {
                <li>{{ t }}</li>
              }
            </ul>
          }
        }
      }
    </article>
  `,
  styles: [
    `
      .card {
        padding: var(--mj-space-4);
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
        box-shadow: var(--mj-shadow-sm);
      }
      .card-head {
        margin-bottom: var(--mj-space-3);
      }
      .prompt {
        margin: 0 0 var(--mj-space-1);
        font-size: 15px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .meta {
        font-size: 12px;
        color: var(--mj-text-muted);
      }
      .empty {
        color: var(--mj-text-muted);
        font-style: italic;
        margin: 0;
      }
      .nps {
        display: flex;
        align-items: baseline;
        gap: var(--mj-space-2);
        flex-wrap: wrap;
        margin-bottom: var(--mj-space-3);
      }
      .nps-score {
        font-size: 28px;
        font-weight: 700;
        color: var(--mj-brand-primary);
        font-variant-numeric: tabular-nums;
      }
      .nps-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--mj-text-secondary);
      }
      .nps-seg {
        font-size: 12px;
        color: var(--mj-text-muted);
      }
      .agg {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: var(--mj-space-2);
        margin: 0;
      }
      .agg div {
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-sm);
        padding: var(--mj-space-2);
      }
      .agg dt {
        font-size: 11px;
        color: var(--mj-text-muted);
        text-transform: uppercase;
      }
      .agg dd {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .text-list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 240px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-1-5);
      }
      .text-list li {
        font-size: 13px;
        color: var(--mj-text-primary);
        padding: var(--mj-space-2);
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-sm);
      }
    `,
  ],
})
export class FormsQuestionBreakdownComponent {
  @Input({ required: true }) breakdown!: QuestionBreakdown;

  public get typeLabel(): string {
    return this.breakdown.type;
  }

  public fmt(value: number | null): string {
    if (value === null) return '—';
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}
