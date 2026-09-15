import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FORMS_UI_CSS, FORMS_VIZ_CSS, vizSeriesClass } from '../../shared';
import { percent } from '../reporting-view-model';
import type { ProfileDistribution, RespondentProfile } from '../services/respondent-profile';

/**
 * "Who responded" — the aggregate reading of a form's identity and attachment questions.
 *
 * This panel replaced four cards that listed people's names and email addresses. Those were
 * not analysis: three arbitrary values out of forty say nothing about the forty, the Responses
 * view already shows them properly against a real submission, and a dashboard is the wrong
 * place to leave personal data lying around. What this shows instead — how many people can be
 * contacted, how many are distinct, where their addresses are hosted — is both safe and the
 * thing a form owner was actually trying to find out.
 *
 * Every value here is a count or a rate. `buildRespondentProfile` guarantees no answer value
 * reaches this component; nothing in the template can undo that, because nothing is passed.
 */
@Component({
  selector: 'mj-forms-respondent-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rpf">
      @if (profile.metrics.length > 0) {
        <dl class="rpf-metrics mjf-card mjf-card--pad">
          @for (m of profile.metrics; track m.label) {
            <div class="rpf-metric">
              <dt>{{ m.label }}</dt>
              <dd>{{ m.value }}</dd>
              @if (m.fraction !== null) {
                <div class="rpf-meter mjf-viz-track" aria-hidden="true">
                  <div class="mjf-viz-bar mjf-viz-series" [style.width.%]="m.fraction * 100"></div>
                </div>
              }
              @if (m.detail) {
                <span class="rpf-detail">{{ m.detail }}</span>
              }
            </div>
          }
        </dl>
      }

      @if (profile.distributions.length > 0) {
        <div class="rpf-dists">
          @for (d of profile.distributions; track d.title) {
            <section class="mjf-card mjf-card--pad rpf-dist">
              <header class="rpf-dist-head">
                <h5 class="rpf-dist-title">{{ d.title }}</h5>
                <p class="rpf-dist-caption">{{ d.caption }}</p>
              </header>
              <ul class="rpf-bars">
                @for (b of d.buckets; track b.label; let i = $index) {
                  <li class="rpf-bar">
                    <div class="rpf-bar-head">
                      <span [class]="'mjf-viz-dot ' + colorFor(d, i)"></span>
                      <span class="rpf-bar-label">{{ b.label }}</span>
                      <span class="rpf-bar-count">{{ b.count }}</span>
                      <span class="rpf-bar-pct">{{ pct(b.fraction) }}</span>
                    </div>
                    <div class="rpf-bar-track mjf-viz-track">
                      <div [class]="'mjf-viz-bar ' + colorFor(d, i)" [style.width.%]="b.fraction * 100"></div>
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [
    FORMS_UI_CSS,
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .rpf { display: flex; flex-direction: column; gap: var(--mjf-gap); }

      .rpf-metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--mjf-stack);
        margin: 0;
      }
      .rpf-metric { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .rpf-metric dt { font-size: var(--mjf-label); color: var(--mj-text-muted); }
      .rpf-metric dd {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 650;
        line-height: 1.1;
        letter-spacing: var(--mj-tracking-tight, -0.02em);
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      /* A thin meter under the figure. Two numbers on this panel are counts and two are
         rates; the meter is what tells them apart at a glance. */
      .rpf-meter { height: 4px; margin-top: 3px; border-radius: var(--mjf-radius-pill); }
      .rpf-meter > .mjf-viz-bar { border-radius: var(--mjf-radius-pill); }
      .rpf-detail { font-size: var(--mjf-label); color: var(--mj-text-muted); }

      .rpf-dists {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: var(--mjf-gap);
        align-items: start;
      }
      .rpf-dist { display: flex; flex-direction: column; gap: var(--mjf-gap); }
      .rpf-dist-head { display: flex; flex-direction: column; gap: 3px; }
      .rpf-dist-title { margin: 0; font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); }
      .rpf-dist-caption { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); line-height: 1.45; }

      .rpf-bars { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
      .rpf-bar { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .rpf-bar-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .rpf-bar-head > .mjf-viz-dot { align-self: center; }
      .rpf-bar-label {
        flex: 1 1 auto;
        min-width: 0;
        font-size: var(--mjf-meta);
        color: var(--mj-text-primary);
        overflow-wrap: anywhere;
      }
      .rpf-bar-count { font-size: var(--mjf-meta); font-weight: 600; color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }
      .rpf-bar-pct { min-width: 38px; text-align: right; font-size: var(--mjf-label); color: var(--mj-text-muted); font-variant-numeric: tabular-nums; }
      .rpf-bar-track { height: 7px; border-radius: var(--mjf-radius-pill); }
      .rpf-bar-track > .mjf-viz-bar { border-radius: var(--mjf-radius-pill); }
    `,
  ],
})
export class FormsRespondentProfileComponent {
  @Input({ required: true }) profile!: RespondentProfile;

  /**
   * The "Other" bucket always takes the neutral grey, whatever position it lands in.
   *
   * It is a fold of everything that did not make the top six, not a category — giving it a
   * hue of its own would put it in the same visual class as `gmail.com` and invite reading it
   * as one more domain.
   */
  public colorFor(distribution: ProfileDistribution, index: number): string {
    const bucket = distribution.buckets[index];
    return bucket?.label.startsWith('Other (') ? 'mjf-viz-neutral' : vizSeriesClass(index);
  }

  public pct(fraction: number): string {
    return percent(fraction);
  }
}
