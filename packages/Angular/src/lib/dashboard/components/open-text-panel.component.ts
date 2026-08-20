import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FORMS_UI_CSS, FORMS_VIZ_CSS } from '../../shared';
import { percent } from '../reporting-view-model';
import type { OpenTextInsight } from '../services/open-text-insights';

/**
 * "What they wrote" — written questions summarised, never quoted.
 *
 * This is the panel that replaced four cards previewing three arbitrary answers each. The
 * preview was the worst of both worlds: too few answers to be a sample, too many to be
 * anonymous, and — because ShortText is as often a name or a reference code as it is an
 * opinion — frequently a list of real people at the top of a dashboard.
 *
 * What is here instead answers questions the verbatims could not. RESPONSE RATE says whether
 * the question worked at all, which is invisible when you are looking only at the answers
 * that exist. TYPICAL LENGTH separates "everyone typed n/a" from "people wrote paragraphs".
 * THEMES are the only thing on the Insights view that summarises what people actually said.
 *
 * A row leads to the Responses view rather than expanding, because reading answers is a task
 * that wants a person and a submission time attached to each one.
 */
@Component({
  selector: 'mj-forms-open-text-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="otp">
      @for (q of insights; track q.questionId) {
        <article class="mjf-card otp-item">
          <header class="otp-head">
            <div class="otp-headings">
              <h5 class="otp-prompt">{{ q.prompt }}</h5>
              <p class="otp-meta">
                <span>{{ q.typeLabel }}</span>
                <span class="otp-dot" aria-hidden="true">·</span>
                <span>{{ q.answered }} answered</span>
                @if (q.skipped > 0) {
                  <span class="otp-dot" aria-hidden="true">·</span>
                  <span>{{ q.skipped }} skipped</span>
                }
                @if (q.medianLength !== null) {
                  <span class="otp-dot" aria-hidden="true">·</span>
                  <span>{{ q.medianLength }} characters typically</span>
                }
              </p>
            </div>
            @if (q.responseRate !== null) {
              <div class="otp-rate">
                <span class="otp-rate-value">{{ pct(q.responseRate) }}</span>
                <span class="otp-rate-label">answered</span>
              </div>
            }
          </header>

          <div class="otp-body">
            @if (q.themes.length > 0) {
              <div class="otp-themes">
                <span class="mjf-eyebrow">Recurring words</span>
                <ul class="otp-theme-list">
                  @for (t of q.themes; track t.term) {
                    <li class="otp-theme" [attr.title]="t.term + ' — in ' + t.answers + ' answers'">
                      <span class="otp-theme-term">{{ t.term }}</span>
                      <span class="otp-theme-count">{{ t.answers }}</span>
                    </li>
                  }
                </ul>
                <!-- Stated plainly rather than implied. Word frequency is a place to start
                     reading, not a conclusion, and it only understands English. -->
                <p class="otp-caveat">
                  Common English words are filtered out. A starting point for reading, not a summary.
                </p>
              </div>
            } @else if (q.answered === 0) {
              <p class="otp-none">Nobody has answered this question.</p>
            } @else if (!q.themesApply) {
              <!-- Said out loud. "No themes" and "we do not look for themes here" render
                   identically as an absence and mean opposite things. -->
              <p class="otp-none">
                Short-answer fields often hold names and reference codes, so recurring words
                are not extracted from them.
              </p>
            } @else {
              <p class="otp-none">
                No word appears in more than one answer, so there is no pattern to show yet.
              </p>
            }

            @if (q.answered > 0) {
              <button type="button" class="otp-read" (click)="ReadAnswers.emit()">
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                Read the answers under Responses
              </button>
            }
          </div>
        </article>
      }
    </div>
  `,
  styles: [
    FORMS_UI_CSS,
    FORMS_VIZ_CSS,
    `
      :host { display: block; }

      .otp { display: flex; flex-direction: column; gap: var(--mjf-gap); }
      .otp-item { display: flex; flex-direction: column; overflow: hidden; }

      .otp-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--mjf-gap);
        padding: var(--mjf-card-pad-sm) var(--mjf-card-pad);
        border-bottom: 1px solid var(--mjf-rule);
        background: var(--mj-bg-surface-sunken);
      }
      .otp-headings { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .otp-prompt {
        margin: 0;
        font-size: var(--mjf-body);
        font-weight: 600;
        line-height: 1.35;
        color: var(--mj-text-primary);
        overflow-wrap: anywhere;
      }
      .otp-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 5px;
        margin: 0;
        font-size: var(--mjf-label);
        color: var(--mj-text-muted);
      }
      .otp-dot { color: var(--mj-text-disabled); }

      .otp-rate { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
      .otp-rate-value {
        font-size: 1.25rem;
        font-weight: 650;
        line-height: 1;
        color: var(--mj-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .otp-rate-label { font-size: var(--mjf-label); color: var(--mj-text-muted); }

      .otp-body { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); padding: var(--mjf-card-pad); }
      .otp-themes { display: flex; flex-direction: column; gap: var(--mjf-gap-sm); }
      .otp-none { margin: 0; font-size: var(--mjf-meta); color: var(--mj-text-muted); }

      .otp-theme-list { display: flex; flex-wrap: wrap; gap: var(--mjf-gap-sm); margin: 0; padding: 0; list-style: none; }
      /* Chips rather than bars. These are terms with counts, not a distribution — nothing
         sums to a whole, so a bar chart would imply a total that does not exist. */
      .otp-theme {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 4px 10px;
        border-radius: var(--mjf-radius-pill);
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-subtle);
      }
      .otp-theme-term { font-size: var(--mjf-meta); color: var(--mj-text-primary); }
      .otp-theme-count {
        font-size: var(--mjf-label);
        font-weight: 600;
        color: var(--mj-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .otp-caveat { margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }

      .otp-read {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 0;
        font: inherit;
        font-size: var(--mjf-label);
        font-weight: 600;
        color: var(--mj-brand-primary);
        background: none;
        border: none;
        cursor: pointer;
      }
      .otp-read:hover { text-decoration: underline; }
      .otp-read:focus-visible { outline: 2px solid var(--mjf-focus-ring); outline-offset: 2px; border-radius: var(--mjf-radius-sm); }
    `,
  ],
})
export class FormsOpenTextPanelComponent {
  @Input({ required: true }) insights: OpenTextInsight[] = [];

  /** Asks the host to switch to the Responses view, where the answers actually live. */
  @Output() ReadAnswers = new EventEmitter<void>();

  public pct(fraction: number): string {
    return percent(fraction);
  }
}
