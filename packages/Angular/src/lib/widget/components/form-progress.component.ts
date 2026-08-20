/**
 * Thin, token-themed progress bar. Reports completion as both a visual fill and an
 * accessible `progressbar` with `aria-valuenow`, satisfying the §2 "clear progress
 * signal" + WCAG requirements.
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
  `,
  styles: [
    `
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

      /* Arrival. The one moment worth marking more strongly, because it is the only one that
         changes what the respondent can DO: everything required is answered. */
      .mjf-progress__fill.is-complete {
        box-shadow: 0 0 8px color-mix(in srgb, var(--mjf-progress-fill) 60%, transparent);
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
  protected readonly percent = computed(() => Math.round(Math.min(1, Math.max(0, this.value())) * 100));

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
