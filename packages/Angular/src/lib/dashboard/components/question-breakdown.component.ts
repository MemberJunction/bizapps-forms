import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../../shared';
import { questionTypeMeta, questionTypeColorClass } from '../../builder/question-type-catalog';
import {
  answerRate,
  booleanSegments,
  consentRate,
  consentSegments,
  isOffListLabel,
  matrixGrid,
  npsSegments,
  percent,
  plural,
  type ProportionSegment,
} from '../reporting-view-model';
import type { QuestionBreakdown } from '../models/reporting.model';
import { FormsDistributionChartComponent } from './distribution-chart.component';
import { FormsProportionBarComponent } from './proportion-bar.component';

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
 * ONE CARD PER ROLE, NOT PER TYPE. What renders is chosen by the server's insight role, so a Checkbox
 * shows an acceptance rate rather than the fifty-fifty split its YesNo-shaped storage would
 * suggest, and a Date shows months rather than a column of formatted dates. Identity,
 * attachment and written-answer questions never reach this component at all — they have their
 * own panels, because a bar chart cannot say anything true about any of them.
 *
 * A MATRIX IS A GRID OF COUNTS. Each cell is how many answers chose that column for that row,
 * shaded by its share of the row. It used to list rendered answers ("Venue: Good; Food: Poor"),
 * which were three arbitrary respondents' answers rather than a summary, and which the server no
 * longer sends.
 */
/** The opacity of a Matrix cell that holds its whole row's answers. */
const MAX_CELL_TINT = 0.35;

@Component({
  selector: 'mj-forms-question-breakdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsDistributionChartComponent, FormsProportionBarComponent],
  template: `
    <article class="qb mjf-card">
      <header class="qb-head">
        <i [class]="'qb-glyph mjf-type-glyph ' + typeColorClass + ' ' + typeIcon" aria-hidden="true"></i>
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
            @if (matrix().rows.length === 0 || breakdown.answeredCount === 0) {
              <p class="qb-none">No answers yet.</p>
            } @else {
              <div class="qb-matrix-wrap">
                <table class="qb-matrix">
                  <thead>
                    <tr>
                      <th scope="col"><span class="qb-sr">Row</span></th>
                      @for (c of matrix().columns; track c) {
                        <th scope="col" [class.is-off]="isOffList(c)">{{ c }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of matrix().rows; track row.label) {
                      <tr>
                        <th scope="row" [class.is-off]="isOffList(row.label)">{{ row.label }}</th>
                        @for (n of row.counts; track $index) {
                          <td>
                            <span class="qb-cell-fill" [style.opacity]="cellTint(n, row.total)" aria-hidden="true"></span>
                            <span class="qb-cell-count">{{ n }}</span>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (matrixHasOffList()) {
                <p class="qb-note">“Other (not an option)” counts answers naming a row or column this question does not offer.</p>
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
      /* A bare glyph, not a filled plate. The square tile this replaced put a heavy
         coloured block at the top-left of every card in the grid, which read as a row of
         buttons; the hue alone identifies the question's group and lets the prompt be the
         thing the eye lands on. */
      .qb-glyph { flex: none; width: 18px; margin-top: 2px; text-align: center; font-size: 0.9375rem; }
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
      /* ui-gate: allow-disabled-token — decorative separator between two labelled values */
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

      /* The grid scrolls inside its card rather than widening the page on a phone. */
      .qb-matrix-wrap { overflow-x: auto; }
      .qb-matrix { width: 100%; border-collapse: collapse; font-size: var(--mjf-meta); }
      .qb-matrix th,
      .qb-matrix td { padding: 8px 10px; text-align: center; border-bottom: 1px solid var(--mjf-rule); }
      .qb-matrix thead th { font-size: var(--mjf-label); font-weight: 600; color: var(--mj-text-muted); }
      .qb-matrix tbody th { text-align: left; font-weight: 600; color: var(--mj-text-primary); overflow-wrap: anywhere; }
      .qb-matrix .is-off { font-style: italic; color: var(--mj-text-muted); }
      /* The count sits on a tint whose strength is the cell's share of its row, so where each
         row's answers concentrate is visible before a single number is read. */
      .qb-matrix td { position: relative; color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }
      .qb-cell-fill { position: absolute; inset: 3px; border-radius: var(--mjf-radius-sm); background: var(--mjf-viz-series); }
      .qb-cell-count { position: relative; font-weight: 600; }
      .qb-note { margin: var(--mjf-gap-sm) 0 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }
      .qb-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    `,
  ],
})
export class FormsQuestionBreakdownComponent {
  private readonly _breakdown = signal<QuestionBreakdown | null>(null);

  @Input({ required: true })
  set breakdown(value: QuestionBreakdown) {
    this._breakdown.set(value);
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

  public get typeLabel(): string {
    return questionTypeMeta(this.breakdown.type).label;
  }

  public get typeIcon(): string {
    return questionTypeMeta(this.breakdown.type).icon;
  }

  /** The question group's colour, shared with the builder's palette and type pills. */
  public get typeColorClass(): string {
    return questionTypeColorClass(this.breakdown.type);
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

  /** A Matrix question's cell counts as a grid. Empty for every other role. */
  public readonly matrix = computed(() => matrixGrid(this._breakdown()?.matrixCells ?? []));

  /** Whether the grid shows the off-list fold (and so a footnote explains it). */
  public readonly matrixHasOffList = computed(() => {
    const grid = this.matrix();
    return grid.columns.some(isOffListLabel) || grid.rows.some((r) => isOffListLabel(r.label));
  });

  /**
   * A cell's tint: its share of the row, scaled so the strongest cell stays light enough for the
   * count printed on it to keep its contrast in both themes.
   */
  public cellTint(count: number, rowTotal: number): number {
    return rowTotal > 0 ? (count / rowTotal) * MAX_CELL_TINT : 0;
  }

  public isOffList(label: string): boolean {
    return isOffListLabel(label);
  }

  public fmt(value: number | null): string {
    if (value === null) return '—';
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}
