import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { FORMS_VIZ_CSS, vizSeriesClass } from '../../shared';
import { percent } from '../reporting-view-model';
import type { DistributionBucket } from '../models/reporting.model';

/**
 * How a choice question's answers split across its options.
 *
 * LABEL ABOVE THE BAR, not beside it. The previous layout gave the label a 30%-of-card
 * column, which truncated almost every real option ("Somewhat dissatisfied with the
 * onboarding experience" became "Somewhat dissatisfi…") and left the bar reading against
 * a label the reader could not finish. Giving the label the full width costs a row per
 * option and buys back the thing the chart is FOR.
 *
 * Bars are sorted by count, so the answer is the first thing on the card and the reader
 * never scans for it. Below a handful of options the whole list shows; beyond that it
 * collapses — a 40-option "which country" question is a scroll trap inside a card, and
 * its long tail is not what anyone opened the card to see.
 */
@Component({
  selector: 'mj-forms-distribution-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (buckets.length === 0) {
      <p class="dc-empty">No answers yet.</p>
    } @else {
      <ul class="dc-list" role="list">
        @for (b of visible(); track b.label; let i = $index) {
          <li class="dc-row">
            <div class="dc-head">
              <span [class]="'mjf-viz-dot ' + colorFor(i)"></span>
              <span class="dc-label">{{ b.label }}</span>
              <span class="dc-count">{{ b.count }}</span>
              <span class="dc-pct">{{ pct(b.fraction) }}</span>
            </div>
            <div class="dc-track mjf-viz-track">
              <div [class]="'mjf-viz-bar ' + colorFor(i)" [style.width.%]="b.fraction * 100"></div>
            </div>
          </li>
        }
      </ul>
      @if (hasMore()) {
        <button type="button" class="dc-more" (click)="toggle()">
          <i class="fa-solid" [class.fa-chevron-down]="!expanded()" [class.fa-chevron-up]="expanded()" aria-hidden="true"></i>
          {{ expanded() ? 'Show top ' + collapsedLimit : 'Show all ' + buckets.length + ' options' }}
        </button>
      }
    }
  `,
  styles: [
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .dc-empty { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      .dc-list { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; list-style: none; }
      .dc-row { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

      .dc-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      /* The dot is the only thing tying this row to its bar, so it holds its baseline
         against the text rather than centring on a line box it is smaller than. */
      .dc-head > .mjf-viz-dot { align-self: center; }
      .dc-label {
        flex: 1 1 auto;
        min-width: 0;
        font-size: var(--mjf-meta);
        color: var(--mj-text-primary);
        overflow-wrap: anywhere;
      }
      .dc-count { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }
      .dc-pct { min-width: 38px; text-align: right; font-size: var(--mjf-label); color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }

      .dc-track { height: 8px; border-radius: var(--mjf-radius-pill, 9999px); }
      .dc-track > .mjf-viz-bar { border-radius: var(--mjf-radius-pill, 9999px); }

      .dc-more {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 14px;
        padding: 6px 0;
        font: inherit;
        font-size: var(--mjf-label);
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .dc-more:hover { text-decoration: underline; }
      .dc-more:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }
    `,
  ],
})
export class FormsDistributionChartComponent {
  /** Beyond this many options the tail collapses behind a control. */
  public readonly collapsedLimit = 6;

  private readonly _buckets = signal<DistributionBucket[]>([]);
  @Input({ required: true })
  set buckets(value: DistributionBucket[]) {
    this._buckets.set(value ?? []);
  }
  get buckets(): DistributionBucket[] {
    return this._buckets();
  }

  public readonly expanded = signal(false);

  public readonly hasMore = computed(() => this._buckets().length > this.collapsedLimit);

  public readonly visible = computed(() =>
    this.expanded() || !this.hasMore()
      ? this._buckets()
      : this._buckets().slice(0, this.collapsedLimit),
  );

  public toggle(): void {
    this.expanded.update((v) => !v);
  }

  /**
   * Colour by position in the SORTED list, so the biggest bucket always gets the first
   * hue of the rotation and cards across the dashboard open the same way.
   */
  public colorFor(index: number): string {
    return vizSeriesClass(index);
  }

  public pct(fraction: number): string {
    return percent(fraction);
  }
}
