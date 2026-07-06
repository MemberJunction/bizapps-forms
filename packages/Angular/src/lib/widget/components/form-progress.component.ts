/**
 * Thin, token-themed progress bar. Reports completion as both a visual fill and an
 * accessible `progressbar` with `aria-valuenow`, satisfying the §2 "clear progress
 * signal" + WCAG requirements.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
        <div class="mjf-progress__fill" [style.width.%]="percent()"></div>
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
        transition: width 0.25s ease;
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
}
