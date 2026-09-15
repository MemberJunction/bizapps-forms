import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FORMS_VIZ_CSS } from '../../shared';
import { percent, type ProportionSegment } from '../reporting-view-model';

/**
 * One whole, split into named parts — completion vs abandonment, NPS bands.
 *
 * A stacked bar rather than a percentage, because the reader's real question is never the
 * ratio on its own: 60% complete means something different on 5 responses than on 500, and
 * a single figure hides which one they are looking at. The bar shows the ratio, the legend
 * shows the counts, and the two together answer it in one glance.
 *
 * The bar itself is `aria-hidden` and the legend is a real list. Giving the track an
 * `aria-label` summarising the same segments the legend already states makes a screen
 * reader announce every number twice; the legend is the accessible rendering.
 */
@Component({
  selector: 'mj-forms-proportion-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (segments.length > 0) {
      <div class="pb">
        <div class="pb-track mjf-viz-track" aria-hidden="true">
          @for (s of segments; track s.label) {
            <span [class]="'pb-seg ' + s.vizClass" [style.flex-basis.%]="s.fraction * 100"></span>
          }
        </div>
        <ul class="pb-legend">
          @for (s of segments; track s.label) {
            <li class="pb-legend-item">
              <span [class]="'mjf-viz-dot ' + s.vizClass"></span>
              <span class="pb-legend-label">{{ s.label }}</span>
              <span class="pb-legend-value">{{ s.count }}</span>
              <span class="pb-legend-pct">{{ pct(s.fraction) }}</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: [
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .pb { display: flex; flex-direction: column; gap: 10px; }

      .pb-track {
        display: flex;
        gap: 2px;
        height: 10px;
        border-radius: var(--mjf-radius-pill, 9999px);
      }
      /* Shrinkable, so the 2px separators come out of the segments rather than
         overflowing the track and clipping the last one. */
      .pb-seg { flex: 0 1 auto; min-width: 3px; background: var(--mjf-viz-fill); }
      .pb-seg:first-child { border-radius: var(--mjf-radius-pill, 9999px) 0 0 var(--mjf-radius-pill, 9999px); }
      .pb-seg:last-child { border-radius: 0 var(--mjf-radius-pill, 9999px) var(--mjf-radius-pill, 9999px) 0; }
      .pb-seg:only-child { border-radius: var(--mjf-radius-pill, 9999px); }

      .pb-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 20px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .pb-legend-item { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .pb-legend-label { font-size: var(--mjf-meta); color: var(--mj-text-secondary); }
      .pb-legend-value { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }
      .pb-legend-pct { font-size: var(--mjf-label); color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class FormsProportionBarComponent {
  @Input({ required: true }) segments: ProportionSegment[] = [];

  public pct(fraction: number): string {
    return percent(fraction);
  }
}
