import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../../shared';
import { questionTypeMeta } from '../../builder/question-type-catalog';
import {
  answerRate,
  booleanSegments,
  consentRate,
  consentSegments,
  npsSegments,
  percent,
  plural,
  type ProportionSegment,
} from '../reporting-view-model';
import type { QuestionBreakdown } from '../models/reporting.model';
import { FormsDistributionChartComponent } from './distribution-chart.component';
import { FormsProportionBarComponent } from './proportion-bar.component';

/** Free-text answers shown before the card offers the rest. */
const VERBATIM_PREVIEW = 3;

/**
 * One question's answers, however that question is best summarised.
 *
 * WHAT THE CARD SAYS BEFORE ITS CHART. The header carries the question's own icon and its
 * builder-facing type name — `questionTypeMeta`, the same catalog the Build tab labels the
 * palette from, so the dashboard and the builder never call the same thing two names — plus
 * the SKIP RATE, which is the signal this surface previously had no way to show. Every bar
 * below is a fraction of the people who answered; if two thirds of respondents skipped the
 * question, nothing in the chart can tell you, and the healthy-looking split is measuring a
 * self-selected third.
 *
 * ONE CARD PER ROLE, NOT PER TYPE. What renders is chosen by `insightRoleFor`, so a Checkbox
 * shows an acceptance rate rather than the fifty-fifty split its YesNo-shaped storage would
 * suggest, and a Date shows months rather than a column of formatted dates. Identity,
 * attachment and written-answer questions never reach this component at all — they have their
 * own panels, because a bar chart cannot say anything true about any of them.
 */
@Component({
  selector: 'mj-forms-question-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsDistributionChartComponent, FormsProportionBarComponent],
  template: `
    <article class="qb mjf-card">
      <header class="qb-head">
        <span class="mjf-tile qb-tile" aria-hidden="true"><i [class]="typeIcon"></i></span>
        <div class="qb-headings">
          <h3 class="qb-prompt">{{ breakdown.prompt }}</h3>
          <p class="qb-meta">
            <span>{{ typeLabel }}</span>
            <span class="qb-dot" aria-hidden="true">·</span>
            <span>{{ answeredLabel }}</span>
            @if (skipLabel) {
              <span class="qb-dot" aria-hidden="true">·</span>
              <span class="qb-skip">{{ skipLabel }}</span>
            }
          </p>
        </div>
      </header>

      <div class="qb-body">
        @switch (breakdown.role) {
          @case ('choice') {
            <mj-forms-distribution-chart [buckets]="breakdown.buckets"></mj-forms-distribution-chart>
          }
          @case ('temporal') {
            <!-- Ordered: months and parts of the day are a sequence, so they keep one
                 colour and are never sorted or truncated by count. -->
            <mj-forms-distribution-chart
              [buckets]="breakdown.buckets"
              [ordered]="true"></mj-forms-distribution-chart>
          }
          @case ('sentiment') {
            @if (yesNo.length > 0) {
              <mj-forms-proportion-bar [segments]="yesNo"></mj-forms-proportion-bar>
            } @else {
              <p class="qb-none">No answers yet.</p>
            }
          }
          @case ('consent') {
            @if (acceptedLabel) {
              <div class="qb-consent">
                <div class="qb-headline">
                  <span class="qb-headline-value">{{ acceptedLabel }}</span>
                  <span class="qb-headline-caption">accepted</span>
                </div>
                <mj-forms-proportion-bar [segments]="consent"></mj-forms-proportion-bar>
              </div>
            } @else {
              <p class="qb-none">Nobody has answered this yet.</p>
            }
          }
          @case ('scale') {
            @if (breakdown.numeric; as n) {
              @if (n.npsScore !== null) {
                <div class="qb-nps">
                  <div class="qb-headline">
                    <span class="qb-headline-value">{{ n.npsScore }}</span>
                    <span class="qb-headline-caption">Net promoter score, −100 to 100</span>
                  </div>
                  <mj-forms-proportion-bar [segments]="nps"></mj-forms-proportion-bar>
                </div>
              } @else if (n.answered === 0) {
                <p class="qb-none">No answers yet.</p>
              } @else {
                <dl class="qb-agg">
                  <div><dt>Average</dt><dd>{{ fmt(n.average) }}</dd></div>
                  <div><dt>Lowest</dt><dd>{{ fmt(n.min) }}</dd></div>
                  <div><dt>Highest</dt><dd>{{ fmt(n.max) }}</dd></div>
                </dl>
              }
            }
          }
          @case ('composite') {
            @if (breakdown.textAnswers.length === 0) {
              <p class="qb-none">No answers yet.</p>
            } @else {
              <ul class="qb-verbatims">
                @for (t of visibleText(); track $index) {
                  <li>{{ t }}</li>
                }
              </ul>
              @if (hiddenTextCount() > 0 || expanded()) {
                <button type="button" class="qb-more" (click)="toggle()">
                  <i class="fa-solid" [class.fa-chevron-down]="!expanded()" [class.fa-chevron-up]="expanded()" aria-hidden="true"></i>
                  {{ expanded() ? 'Show fewer' : 'Show all ' + breakdown.textAnswers.length }}
                </button>
              }
            }
          }
        }
      </div>
    </article>
  `,
  styles: [
    FORMS_UI_CSS,
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .qb { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

      .qb-head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
        border-bottom: 1px solid var(--mjf-rule);
        background: var(--mj-bg-surface-sunken);
      }
      .qb-tile { width: 32px; height: 32px; font-size: 0.8125rem; }
      .qb-headings { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .qb-prompt {
        margin: 0;
        font-size: var(--mjf-body);
        font-weight: 600;
        line-height: 1.35;
        color: var(--mj-text-primary);
        overflow-wrap: anywhere;
      }
      .qb-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 5px;
        margin: 0;
        font-size: var(--mjf-label);
        color: var(--mj-text-muted);
      }
      .qb-dot { color: var(--mj-text-disabled); }
      /* Muted like the rest of the line. A skip rate is context, not an alarm — colouring
         it would put a warning on every optional question in the form. */
      .qb-skip { font-weight: 600; }

      .qb-body { flex: 1 1 auto; padding: var(--mjf-card-pad); min-width: 0; }
      .qb-none { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      .qb-nps,
      .qb-consent { display: flex; flex-direction: column; gap: var(--mjf-gap); }
      /* One headline treatment for the two cards whose answer IS a single figure — an NPS
         score and an acceptance rate. Both are read before the bar under them. */
      .qb-headline { display: flex; flex-direction: column; gap: 2px; }
      .qb-headline-value {
        font-size: 2.5rem;
        font-weight: 650;
        line-height: 1;
        letter-spacing: var(--mj-tracking-tight, -0.03em);
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .qb-headline-caption { font-size: var(--mjf-label); color: var(--mj-text-muted); }

      .qb-agg { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mjf-gap-sm); margin: 0; }
      .qb-agg > div {
        padding: 10px 12px;
        border-radius: var(--mjf-radius-sm);
        background: var(--mj-bg-surface-sunken);
      }
      .qb-agg dt { font-size: var(--mjf-label); color: var(--mj-text-muted); }
      .qb-agg dd {
        margin: 2px 0 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }

      .qb-verbatims { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); margin: 0; padding: 0; list-style: none; }
      /* A quoted answer, marked as one by a rule down its left edge rather than by
         quotation marks the respondent did not write. */
      .qb-verbatims li {
        padding: 8px 12px;
        font-size: var(--mjf-meta);
        line-height: 1.5;
        color: var(--mj-text-primary);
        background: var(--mj-bg-surface-sunken);
        border-left: 2px solid var(--mjf-viz-series);
        border-radius: 0 var(--mjf-radius-sm) var(--mjf-radius-sm) 0;
        overflow-wrap: anywhere;
      }

      .qb-more {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: var(--mjf-gap-sm);
        padding: 6px 0;
        font: inherit;
        font-size: var(--mjf-label);
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .qb-more:hover { text-decoration: underline; }
      .qb-more:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }
    `,
  ],
})
export class FormsQuestionBreakdownComponent {
  private readonly _breakdown = signal<QuestionBreakdown | null>(null);

  @Input({ required: true })
  set breakdown(value: QuestionBreakdown) {
    this._breakdown.set(value);
    // A card reused for a different question must not inherit the previous one's
    // disclosure state and open on a wall of somebody else's answers.
    this.expanded.set(false);
  }
  get breakdown(): QuestionBreakdown {
    const value = this._breakdown();
    if (!value) {
      throw new Error('FormsQuestionBreakdownComponent: [breakdown] is required.');
    }
    return value;
  }

  /**
   * How many responses the form has, used to work out how many skipped this question.
   * Zero means "not known", and the skip line is omitted rather than guessed at.
   */
  @Input() totalResponses = 0;

  public readonly expanded = signal(false);

  public get typeLabel(): string {
    return questionTypeMeta(this.breakdown.type).label;
  }

  public get typeIcon(): string {
    return questionTypeMeta(this.breakdown.type).icon;
  }

  public get answeredLabel(): string {
    return `${plural(this.breakdown.answeredCount, 'answer')}`;
  }

  /** "12% skipped", or empty when there is no honest denominator to say it against. */
  public get skipLabel(): string {
    const rate = answerRate(this.breakdown.answeredCount, this.totalResponses);
    if (rate === null || rate >= 1) return '';
    return `${percent(1 - rate)} skipped`;
  }

  public get yesNo(): ProportionSegment[] {
    return booleanSegments(this.breakdown.buckets);
  }

  public get consent(): ProportionSegment[] {
    return consentSegments(this.breakdown.buckets);
  }

  /** "94%", or empty when nobody answered and there is no rate to state. */
  public get acceptedLabel(): string {
    const rate = consentRate(this.breakdown.buckets);
    return rate === null ? '' : percent(rate);
  }

  public get nps(): ProportionSegment[] {
    const segments = this.breakdown.numeric?.npsSegments;
    return segments ? npsSegments(segments) : [];
  }

  public readonly visibleText = computed(() => {
    const all = this._breakdown()?.textAnswers ?? [];
    return this.expanded() ? all : all.slice(0, VERBATIM_PREVIEW);
  });

  public readonly hiddenTextCount = computed(() =>
    Math.max(0, (this._breakdown()?.textAnswers.length ?? 0) - VERBATIM_PREVIEW),
  );

  public toggle(): void {
    this.expanded.update((v) => !v);
  }

  public fmt(value: number | null): string {
    if (value === null) return '—';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}
