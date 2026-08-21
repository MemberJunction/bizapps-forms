/**
 * The respondent widget's icon set, drawn inline.
 *
 * WHY THE WIDGET CARRIES ITS OWN. This element is published as a custom element and mounted on
 * pages we do not control: the public `/f/:slug` host page, which loads ZERO stylesheets, and
 * third-party embeds, which load whatever they happen to load. An icon FONT is a promise the host
 * page has to keep, and it did not — every `<i class="fa-solid …">` in here was a 0×0 element
 * with no glyph on the real form while looking perfect in the builder's preview, because Explorer
 * pulls Font Awesome from cdnjs and the preview mounts this same component inside it. Geometry
 * shipped in the bundle needs nothing from the host, so the two surfaces now agree by
 * construction. `icon-font-free.spec.ts` keeps them that way.
 *
 * It also keeps the widget's request count at one: the public page fetches the bundle and nothing
 * else, which is worth protecting on a form filled in by anonymous respondents on mobile data.
 *
 * SIZED IN `em`, DELIBERATELY. Every icon this replaced was sized by the `font-size` of its own
 * CSS rule (the rating star's 1.5rem, the done screen's 2.5rem, the reorder button's inherited
 * 1rem). A `1em` box means all of those rules keep working untouched — the alternative was an
 * explicit size input threaded through eighteen call sites and a second place for sizes to live.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The icons the widget draws. A closed union rather than a string: the whole failure being fixed
 * here was an icon that silently rendered nothing, so a name that does not exist should not be
 * expressible.
 */
export type MjfIconName =
  | 'star'
  | 'circle-check'
  | 'triangle-exclamation'
  | 'spinner'
  | 'rotate-right'
  | 'cloud-arrow-up'
  | 'shield-halved'
  | 'image'
  | 'grip'
  | 'chevron-up'
  | 'chevron-down'
  | 'eraser';

/** One icon: its subpaths on a 24×24 grid, and whether it paints or strokes. */
export interface IconGlyph {
  readonly paths: readonly string[];
  /**
   * Filled rather than stroked. True only for the star, and for a reason the respondent can see:
   * a rating's whole affordance is that a chosen star is SOLID and an unchosen one is not, which
   * is `fill: currentColor` against the two `--mjf-rating-*` tokens. Every other icon here is a
   * line drawing, so one stroke weight keeps them looking like one set.
   */
  readonly filled?: true;
}

/**
 * The geometry, exported so `mjf-icon.spec.ts` can walk the real table.
 *
 * Exported rather than reachable only through a rendered component: the paths are the thing that
 * can be wrong, checking them needs no browser, and the first version of that spec re-read this
 * file with a regex and mistook a quoted icon NAME for a path. A test that parses its subject's
 * source is a second, worse copy of the subject.
 */
export const MJF_ICON_GLYPHS: Readonly<Record<MjfIconName, IconGlyph>> = {
  star: {
    paths: ['M12 2.8l2.83 5.73 6.33.92-4.58 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.84 9.45l6.33-.92z'],
    filled: true,
  },
  'circle-check': {
    paths: ['M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6z', 'M8.1 12.3l2.7 2.7 5.1-5.6'],
  },
  'triangle-exclamation': {
    paths: ['M12 4.2L3.1 19.4h17.8z', 'M12 9.4v4.2', 'M12 16.7h.01'],
  },
  // Three quarters of a circle, so the gap makes the rotation legible. A full ring would spin
  // without appearing to move.
  spinner: { paths: ['M12 3.2a8.8 8.8 0 1 0 8.8 8.8'] },
  'rotate-right': {
    paths: ['M20.4 12a8.4 8.4 0 1 1-2.46-5.94', 'M20.4 4.2v4.2h-4.2'],
  },
  'cloud-arrow-up': {
    paths: [
      'M6.8 17h10.4a3.4 3.4 0 0 0 0-6.8 5.2 5.2 0 0 0-10-1.4 3.6 3.6 0 0 0-.4 8.2z',
      'M12 14.6V8.8',
      'M9.6 11.2L12 8.8l2.4 2.4',
    ],
  },
  'shield-halved': {
    paths: ['M12 3.2l7.2 2.9v5.4c0 4.3-3 7.7-7.2 9.3-4.2-1.6-7.2-5-7.2-9.3V6.1z', 'M12 3.2v18.6'],
  },
  image: {
    paths: ['M4.6 5.4h14.8v13.2H4.6z', 'M5.6 16.6l3.8-4 3.2 3 2.6-2.2 3.2 3.2', 'M8.8 9.4h.01'],
  },
  // Three bars. The icon it replaces was six dots, which at this size is a smudge; a bar stack is
  // the drag affordance people already read, and it survives being 16px on a phone. Drawn wide
  // (11 of 24) because the first version spanned 7×6 and read as a smudge of its own — the
  // "large enough to read" assertion in the spec is what caught that.
  grip: { paths: ['M6.5 8h11', 'M6.5 12h11', 'M6.5 16h11'] },
  'chevron-up': { paths: ['M6.2 14.4l5.8-5.8 5.8 5.8'] },
  'chevron-down': { paths: ['M6.2 9.6l5.8 5.8 5.8-5.8'] },
  eraser: {
    paths: ['M8.8 19.4l-4.2-4.2 8.4-8.4 4.2 4.2-8.4 8.4z', 'M10.9 8.7l4.2 4.2', 'M6.4 21.4h13'],
  },
};

@Component({
  selector: 'mjf-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Every icon this replaced was `aria-hidden` at its call site, and every one of them sits either
  // beside its own text or inside a control that carries an aria-label. Hiding the whole host here
  // keeps that true by default rather than at eighteen call sites, one of which would be forgotten.
  host: { 'aria-hidden': 'true' },
  template: `
    <svg
      class="mjf-icon"
      [class.mjf-icon--filled]="glyph().filled"
      [class.mjf-icon--spin]="spin()"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      @for (d of glyph().paths; track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        /* Never let an icon be the thing that stretches inside a flex row — several of these sit
           beside text in one. */
        flex: none;
      }
      .mjf-icon {
        width: 1em;
        height: 1em;
        /* Sits an icon on the text baseline where one shares a line with words. */
        vertical-align: -0.125em;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .mjf-icon--filled {
        fill: currentColor;
        stroke: none;
      }
      .mjf-icon--spin {
        animation: mjf-icon-spin 1s linear infinite;
        /* Rotate about the middle of the box, not the SVG user-space origin. */
        transform-origin: 50% 50%;
      }
      @keyframes mjf-icon-spin {
        to {
          transform: rotate(360deg);
        }
      }
      /* A spinner is a progress signal, so it keeps turning under reduced-motion — just slowly
         enough not to be the thing that triggers someone. Removing it outright would leave a
         static three-quarter ring claiming work is happening. */
      @media (prefers-reduced-motion: reduce) {
        .mjf-icon--spin {
          animation-duration: 3s;
        }
      }
    `,
  ],
})
export class MjfIconComponent {
  readonly name = input.required<MjfIconName>();
  /** Turn continuously. For the one icon that reports work in progress. */
  readonly spin = input(false);

  protected readonly glyph = computed<IconGlyph>(() => {
    const glyph = MJF_ICON_GLYPHS[this.name()];
    if (!glyph) {
      // Fail loudly rather than render an empty box. An empty box is precisely the bug this
      // component exists to remove, and it is invisible in review — the union type makes an
      // unknown name a compile error, so reaching here means a name was built at runtime.
      throw new Error(`mjf-icon: unknown icon name ${JSON.stringify(this.name())}`);
    }
    return glyph;
  });
}

/** The icon names, for tests that need to walk the whole set. */
export const MJF_ICON_NAMES: readonly MjfIconName[] = Object.keys(MJF_ICON_GLYPHS) as MjfIconName[];
