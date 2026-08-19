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
import { socialPlatform, type PublishedFormScreen } from '@mj-biz-apps/forms-entities';

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

/* Icon only, no labels. This sits under a message that has already said everything; a row of
   wordmarks would compete with the ending copy for the one moment the form has nothing left to
   ask. Sized to the 44px tap target rather than to the glyph, because the ending screen is
   where a respondent is most likely to be on a phone and least likely to try twice. */
.mjf-screen__social {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.mjf-screen__social-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  font-size: 1.125rem;
  color: var(--mjf-page-ink-muted);
  text-decoration: none;
  border: 1px solid var(--mjf-page-edge);
  border-radius: 50%;
  transition: color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

/* Brand colour on hover, not at rest.
   At rest the row stays in the form's own palette so seven saturated logos do not shout over the
   ending message the author wrote — the icons are a footer, not the point of the screen. On hover
   the real brand appears, which is also the moment it does its job: confirming to the respondent
   which service they are about to open before they commit to the click. */
.mjf-screen__social-link:hover {
  color: var(--mjf-brand, var(--mjf-accent));
  border-color: var(--mjf-brand, var(--mjf-accent));
  background: color-mix(in srgb, var(--mjf-brand, var(--mjf-accent)) 10%, transparent);
  transform: translateY(-2px);
}

/* Each platform's own colour, from its published brand guidelines. X is deliberately near-black
   rather than the old Twitter blue. */
.mjf-screen__social-link.is-linkedin {
  --mjf-brand: #0a66c2;
}
.mjf-screen__social-link.is-x {
  --mjf-brand: #14171a;
}
.mjf-screen__social-link.is-facebook {
  --mjf-brand: #1877f2;
}
.mjf-screen__social-link.is-instagram {
  --mjf-brand: #e1306c;
}
.mjf-screen__social-link.is-youtube {
  --mjf-brand: #ff0000;
}
.mjf-screen__social-link.is-tiktok {
  --mjf-brand: #00f2ea;
}
.mjf-screen__social-link.is-github {
  --mjf-brand: #24292f;
}

.mjf-screen__social-link:focus-visible {
  outline: none;
  box-shadow: var(--mjf-focus-ring);
}

@media (prefers-reduced-motion: reduce) {
  .mjf-screen__social-link { transition: none; }
  .mjf-screen__social-link:hover { transform: none; }
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

      @if (socialLinks().length > 0) {
        <nav class="mjf-screen__social" aria-label="Follow us">
          @for (link of socialLinks(); track link.platform) {
            <a
              class="mjf-screen__social-link"
              [class]="'mjf-screen__social-link is-' + link.platform"
              [href]="link.url"
              target="_blank"
              rel="noopener noreferrer external"
              [attr.aria-label]="link.label"
              [attr.title]="link.label"
            ><i [class]="link.icon" aria-hidden="true"></i></a>
          }
        </nav>
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
   * The links to draw, each already paired with the icon and label for its platform.
   *
   * Resolved here rather than in the template so an unknown platform simply does not render —
   * the alternative is an empty circle on a published form, which is worse than an absent one.
   */
  protected readonly socialLinks = computed(() =>
    (this.screen().socialLinks ?? []).flatMap((link) => {
      const platform = socialPlatform(link.platform);
      return platform ? [{ ...link, icon: platform.icon, label: platform.label }] : [];
    }),
  );

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
