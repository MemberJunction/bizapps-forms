import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../../shared';
import {
  completionSegments,
  formatDuration,
  plural,
  relativeTime,
  type ProportionSegment,
} from '../reporting-view-model';
import type { FormSummaryStats } from '../models/reporting.model';
import { FormsProportionBarComponent } from './proportion-bar.component';

/**
 * The band that answers "how is this form doing" before the reader scrolls.
 *
 * ONE NUMBER IS BIG. The previous version set four figures in the same 2rem type, which
 * is four anchors and therefore none: the eye had to read all of them to find out which
 * mattered. Responses collected is the fact the page exists to deliver, so it is the only
 * one at display size and everything else supports it (von Restorff — a single isolated
 * element is what gets remembered, and isolation is destroyed by repeating it).
 *
 * COMPLETION IS A BAR, NOT A PERCENTAGE. "68%" is unreadable without the denominator; the
 * bar carries the ratio and its legend carries the counts, so five responses never masquerade
 * as a trend. See `completionSegments`.
 *
 * RECENCY IS RELATIVE. "2 hours ago" is the difference between a form that is collecting and
 * one that quietly stopped; a bare date makes the reader do that subtraction themselves. The
 * live dot appears only while the last response is recent enough for the answer to be "yes,
 * right now".
 */
@Component({
  selector: 'mj-forms-summary-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsProportionBarComponent],
  template: `
    <div class="ss mjf-card mjf-card--pad">
      <div class="ss-hero">
        <span class="ss-hero-value">{{ stats.totalResponses }}</span>
        <span class="ss-hero-label">{{ stats.totalResponses === 1 ? 'response' : 'responses' }}</span>
        @if (stats.partialResponses > 0) {
          <span class="ss-hero-sub">{{ inProgressLabel }}</span>
        }
      </div>

      <div class="ss-split">
        @if (segments.length > 0) {
          <span class="mjf-eyebrow">Completion</span>
          <mj-forms-proportion-bar [segments]="segments"></mj-forms-proportion-bar>
        } @else {
          <span class="mjf-eyebrow">Completion</span>
          <p class="ss-none">Nobody has started this form yet.</p>
        }
      </div>

      <dl class="ss-facts">
        <div class="ss-fact">
          <dt>Typical time to complete</dt>
          <dd>{{ durationLabel }}</dd>
        </div>
        <div class="ss-fact">
          <dt>Last response</dt>
          <dd class="ss-last">
            @if (isLive) {
              <span class="ss-live" aria-hidden="true"></span>
            }
            {{ lastLabel }}
          </dd>
        </div>
      </dl>
    </div>
  `,
  styles: [
    FORMS_UI_CSS,
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      /* Hero | completion | facts. The completion column takes the slack because it is
         the only one whose meaning improves with width. */
      .ss {
        display: grid;
        grid-template-columns: auto minmax(220px, 1fr) auto;
        align-items: center;
        gap: var(--mjf-stack);
      }

      .ss-hero { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ss-hero-value {
        font-size: 3.25rem;
        font-weight: 650;
        line-height: 1;
        letter-spacing: var(--mj-tracking-tight, -0.03em);
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .ss-hero-label { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-secondary); }
      .ss-hero-sub { font-size: var(--mjf-label); color: var(--mj-text-muted); }

      .ss-split { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .ss-none { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      /* A vertical rule rather than a card of its own — these two are footnotes to the
         hero, and boxing them would promote them to its equals. */
      .ss-facts {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin: 0;
        padding-left: var(--mjf-stack);
        border-left: 1px solid var(--mjf-rule);
      }
      .ss-fact { display: flex; flex-direction: column; gap: 2px; }
      .ss-fact dt { font-size: var(--mjf-label); color: var(--mj-text-muted); }
      .ss-fact dd { margin: 0; font-size: var(--mjf-body); font-weight: 600; color: var(--mj-text-primary); white-space: nowrap; }

      .ss-last { display: flex; align-items: center; gap: 7px; }
      .ss-live {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--mjf-viz-positive);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--mjf-viz-positive) 22%, transparent);
      }

      @media (max-width: 900px) {
        .ss { grid-template-columns: 1fr; gap: var(--mjf-gap); align-items: stretch; }
        .ss-facts {
          flex-direction: row;
          gap: var(--mjf-stack);
          padding: var(--mjf-gap) 0 0;
          border-left: none;
          border-top: 1px solid var(--mjf-rule);
        }
      }
    `,
  ],
})
export class FormsSummaryStatsComponent {
  @Input({ required: true }) stats!: FormSummaryStats;

  /**
   * The clock the relative label is measured against — set by the dashboard when the data
   * was loaded, so "2 hours ago" means two hours before the numbers beside it, not two
   * hours before the component happened to re-render.
   */
  @Input({ required: true }) now!: Date;

  /** How recent the last response must be for the form to read as still collecting. */
  private static readonly LIVE_WINDOW_MS = 60 * 60 * 1000;

  public get segments(): ProportionSegment[] {
    return completionSegments(this.stats);
  }

  public get inProgressLabel(): string {
    return `${plural(this.stats.partialResponses, 'other')} started but unfinished`;
  }

  public get durationLabel(): string {
    return formatDuration(this.stats.typicalCompletionSeconds);
  }

  public get lastLabel(): string {
    return relativeTime(this.stats.lastSubmittedAt, this.now);
  }

  public get isLive(): boolean {
    const last = this.stats.lastSubmittedAt;
    if (!last) return false;
    const age = this.now.getTime() - last.getTime();
    return age >= 0 && age < FormsSummaryStatsComponent.LIVE_WINDOW_MS;
  }
}
