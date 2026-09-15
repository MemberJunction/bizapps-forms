/**
 * Thin, token-themed progress bar. Reports completion as both a visual fill and an
 * accessible `progressbar` with `aria-valuenow`, satisfying the §2 "clear progress
 * signal" + WCAG requirements.
 *
 * It reports TWO facts, because they are genuinely two. `value` is how much of the form is filled
 * in; `ready` is whether it can be submitted right now. The bar used to carry both by jumping to
 * full the moment the required set was satisfied, which made "done filling in" and "allowed to
 * submit" the same pixel — and on a form with one required question among nine, a full bar sat
 * above eight blank ones (#88). Splitting them costs one boolean and lets each say only what it
 * means.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { progressPercent } from '../core/progress';

@Component({
  selector: 'mjf-form-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjf-progress"
      role="progressbar"
      aria-label="Form completion"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="100"
      [attr.aria-valuenow]="percent()"
    >
      <div class="mjf-progress__track">
        <div
          class="mjf-progress__fill"
          [class.is-gained]="gained()"
          [class.is-complete]="percent() === 100"
          [style.width.%]="percent()"
        ></div>
      </div>
      <span class="mjf-visually-hidden">{{ percent() }}% complete</span>
    </div>
    <!--
      OUTSIDE the progressbar, deliberately. \`role="progressbar"\` is children-presentational, so
      anything rendered inside it is dropped from the accessibility tree — the one place this line
      must not be, since a partly-filled bar is exactly what it is there to explain.
    -->
    @if (ready()) {
      <p class="mjf-progress__ready" aria-live="polite">You can submit now.</p>
    }
  `,
  styles: [
    `
      /* Two stacked children now, so the host has to be a block in its own right rather than
         relying on whichever parent happens to blockify it as a flex item. */
      :host {
        display: block;
      }
      .mjf-progress__track {
        height: 0.5rem;
        width: 100%;
        background: var(--mjf-progress-track);
        border-radius: var(--mjf-pill-radius);
        overflow: hidden;
      }
      .mjf-progress__fill {
        height: 100%;
        background: var(--mjf-progress-fill);
        border-radius: var(--mjf-pill-radius);
        /* Longer than a UI transition normally wants, and eased to decelerate: the point is for
           the eye to CATCH the movement. A bar that snaps to its new width has technically
           reported progress and shown the respondent nothing. */
        transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
      }

      /* The reward. Every gain gets an immediate, contingent acknowledgement, which is what
         makes a long form feel like it is going somewhere rather than like typing into a void.
         Deliberately a brief lightening rather than a colour change or a bounce: legible at a
         glance, and completely ignorable by the twentieth answer. */
      .mjf-progress__fill.is-gained {
        animation: mjf-progress-gain 0.6s ease-out;
      }

      @keyframes mjf-progress-gain {
        0% { filter: brightness(1); }
        30% { filter: brightness(1.45); }
        100% { filter: brightness(1); }
      }

      /* Arrival, and now a real one: every question on the path is filled in, and there is
         nothing left the bar could still be counting. */
      .mjf-progress__fill.is-complete {
        box-shadow: 0 0 8px color-mix(in srgb, var(--mjf-progress-fill) 60%, transparent);
      }

      /* The submit affordance in words. Small and muted on purpose: it is a reassurance that the
         unfilled remainder is optional, not a call to stop — the respondent may well keep going,
         and an emphatic banner would push them off a form they were still filling in. */
      .mjf-progress__ready {
        margin: 0.375rem 0 0;
        font-size: 0.8125rem;
        color: var(--mjf-page-ink-muted);
      }

      @media (prefers-reduced-motion: reduce) {
        .mjf-progress__fill { transition: none; }
        .mjf-progress__fill.is-gained { animation: none; }
      }
      .mjf-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
    `,
  ],
})
export class FormProgressComponent {
  /** Completion fraction 0–1. */
  public readonly value = input.required<number>();

  /**
   * True when the respondent can submit from where they are standing — everything visible
   * validates AND the submit control is the one in front of them and enabled.
   *
   * The caller decides that, because "where they are standing" is the render mode's own business:
   * a valid form on section one of four is not submittable yet, and saying so there would be a
   * promise the Next button does not keep.
   */
  public readonly ready = input<boolean>(false);
  /** Clamped and floored by `progress.ts`, which owns why 100 must not be reachable by rounding. */
  protected readonly percent = computed(() => progressPercent(this.value()));

  /** True for a moment after the bar GAINS, which is what drives the acknowledgement. */
  protected readonly gained = signal(false);

  private previous = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const now = this.percent();
      const rose = now > this.previous;
      this.previous = now;
      if (!rose) {
        // Losing ground is not something to celebrate — revealing a required follow-up can
        // legitimately push the bar back, and flashing for that would read as a reward for
        // going backwards.
        return;
      }
      // Restart the animation rather than letting a second gain land inside the first, which
      // would swallow the acknowledgement for fast typists — exactly the people filling in a
      // long form quickly.
      this.gained.set(false);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.gained.set(true), 0);
    });
    destroyRef.onDestroy(() => clearTimeout(this.timer));
  }
}
