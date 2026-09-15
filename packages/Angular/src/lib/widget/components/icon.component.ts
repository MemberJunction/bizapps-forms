/**
 * `<mjf-icon name="star" />` — an icon the widget draws itself.
 *
 * Inline SVG from {@link WIDGET_ICON_GLYPHS}, sized `1em` square and filled with
 * `currentColor`, so it sits in text and takes its colour exactly the way the Font Awesome
 * `<i>` it replaces did — but with no font to load. That is the whole point: the respondent
 * host page loads no stylesheet, and an icon that needs one measured 0 × 0 there while the
 * same form looked right in the builder preview (#115).
 *
 * Every icon in the widget is decorative — the accessible name always comes from an
 * `aria-label` or the adjacent text — so the host is `aria-hidden` unconditionally rather than
 * trusting each call site to remember.
 */
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { WIDGET_ICON_GLYPHS, type WidgetIconName } from './icon-glyphs';

/**
 * `vertical-align: -0.125em` is Font Awesome's own baseline offset for a 1em glyph, kept so an
 * icon beside a word sits where it did before. `flex: none` stops a flex parent (button rows,
 * status lines) from squeezing the box to zero — the one way a sized element can still vanish.
 */
const ICON_COMPONENT_CSS = `
:host {
  display: inline-flex;
  flex: none;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentColor;
}
:host(.mjf-icon--spin) {
  animation: mjf-icon-spin 1s linear infinite;
}
@keyframes mjf-icon-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  :host(.mjf-icon--spin) { animation-duration: 2s; }
}
`;

@Component({
  selector: 'mjf-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ICON_COMPONENT_CSS],
  host: {
    'aria-hidden': 'true',
    '[class.mjf-icon--spin]': 'spin()',
  },
  template: `<svg [attr.viewBox]="glyph().viewBox"><path [attr.d]="glyph().path" /></svg>`,
})
export class IconComponent {
  /** Which glyph to draw. A name outside the catalogue is a compile error under strictTemplates. */
  public readonly name = input.required<WidgetIconName>();

  /** Rotate continuously — the in-flight marker on the upload and drawing-save status lines. */
  public readonly spin = input(false, { transform: booleanAttribute });

  protected readonly glyph = computed(() => WIDGET_ICON_GLYPHS[this.name()]);
}
