/**
 * Renders one Welcome or Ending screen.
 *
 * Both kinds render the same way — image, headline, body, one button — so they share a
 * component and differ only in what the button does: a Welcome screen starts the intake, an
 * Ending screen is terminal and shows no button at all unless the author gave it a label.
 *
 * Deliberately dumb. It has no answers, no validation, no runtime and no API service; the
 * shell decides WHICH screen this is and what happens next. That is the whole point of pulling
 * screens out of the intake — the thing that renders a thank-you page should not be able to
 * reach a respondent's answers.
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PublishedFormScreen } from '@mj-biz-apps/forms-entities';

const FORM_SCREEN_CSS = /* css */ `
/* A welcome or ending screen is a HERO, not a paragraph: it owns the whole surface and centres
   in it. It used to be a short content-height block pinned to the top, which on a full-window
   preview (and on a phone) left most of the screen empty below it and read as a page that had
   failed to load rather than a deliberate opening.

   flex all the way down, never a percentage height: a percentage would resolve against an auto
   parent as zero, and this element also runs embedded on pages that give it no height at all.
   Growing to fill is something flex does when there IS room and ignores when there is not. */
:host {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.mjf-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.5rem 1.25rem;
  text-align: center;
}

.mjf-screen__media {
  max-width: min(100%, 22rem);
  height: auto;
  border-radius: var(--mjf-card-radius);
}

.mjf-screen__title {
  margin: 0;
  font-family: var(--mjf-font-display);
  /* cqi, not vw: this is the opening line of the form and it should scale with the space the
     WIDGET has, not the browser window. On vw a phone-width embed in a desktop page sized its
     title off the desktop, which is the same mistake the layout media queries were making. */
  font-size: clamp(1.75rem, 6cqi, 2.75rem);
  line-height: 1.2;
  color: var(--mjf-page-ink);
}

.mjf-screen__body {
  margin: 0;
  max-width: 46ch;
  white-space: pre-wrap;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--mjf-page-ink-soft);
}

.mjf-screen__cta {
  margin-top: 0.75rem;
  min-height: 3.25rem;
  padding: 0.9375rem 2.75rem;
  cursor: pointer;
  font: inherit;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--mjf-on-accent);
  background: var(--mjf-accent);
  border: none;
  border-radius: var(--mjf-btn-radius, var(--mjf-input-radius));
  transition: background 0.15s ease;
}

.mjf-screen__cta:hover { background: var(--mjf-accent-strong); }
.mjf-screen__cta:focus-visible { outline: none; box-shadow: var(--mjf-focus-ring); }

.mjf-screen__done-icon {
  font-size: 2.5rem;
  color: var(--mjf-accent);
}
`;

@Component({
  selector: 'mjf-form-screen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [FORM_SCREEN_CSS],
  template: `
    @let s = screen();
    <div class="mjf-screen" [attr.role]="isWelcome() ? null : 'status'" [attr.aria-live]="isWelcome() ? null : 'polite'">
      @if (s.mediaURL) {
        <img class="mjf-screen__media" [src]="s.mediaURL" alt="" />
      } @else if (!isWelcome()) {
        <i class="fa-solid fa-circle-check mjf-screen__done-icon" aria-hidden="true"></i>
      }

      <h1 class="mjf-screen__title">{{ s.title }}</h1>

      @if (s.body) {
        <p class="mjf-screen__body">{{ s.body }}</p>
      }

      @if (buttonLabel(); as label) {
        <button type="button" class="mjf-screen__cta" (click)="activated.emit()">{{ label }}</button>
      }
    </div>
  `,
})
export class FormScreenComponent {
  /** The screen to render. */
  public readonly screen = input.required<PublishedFormScreen>();
  /** The button was pressed. Only a Welcome screen normally emits this. */
  public readonly activated = output<void>();

  protected readonly isWelcome = computed(() => this.screen().screenType === 'Welcome');

  /**
   * The button's label, or '' to render no button.
   *
   * A Welcome screen ALWAYS gets one — it is the only way past it, so falling back to "Start"
   * rather than to nothing is the difference between a form and a dead end. An Ending screen
   * gets one only when the author wrote a label, because a terminal screen with a button that
   * does nothing is worse than no button.
   */
  protected readonly buttonLabel = computed(() => {
    const authored = this.screen().buttonLabel?.trim();
    if (authored) {
      return authored;
    }
    return this.isWelcome() ? 'Start' : '';
  });
}
