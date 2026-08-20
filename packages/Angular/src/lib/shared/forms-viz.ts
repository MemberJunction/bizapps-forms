/**
 * The Forms data-visualisation palette — the one place a chart colour is decided.
 *
 * WHY IT IS SEPARATE FROM `forms-ui.ts`. Everything in the design layer resolves to an
 * `--mj-*` semantic token, because interface chrome must follow whatever theme the
 * Explorer is wearing. Chart colour is the opposite kind of decision: a category's hue
 * is DATA, not chrome. If "Very satisfied" changed colour with the theme, the reader
 * would have to re-learn the chart on every switch. So this is the one sanctioned place
 * in the authoring surfaces where a literal colour is the correct value, and it is
 * isolated here so that stays true of exactly eight lines.
 *
 * THE PALETTE IS FILL-ONLY. NEVER TEXT. Measured against the live MJ tokens
 * (`@memberjunction/ng-shared/_tokens.scss`):
 *
 *                       light surface   light sunken   dark surface   dark sunken
 *   worst of the eight      3.39            3.09           3.72           5.13
 *
 * Every entry clears the 3:1 that WCAG 1.4.11 asks of a non-text graphic against every
 * MJ surface in BOTH themes — which is why there is no dark-mode variant below and does
 * not need to be. Not one of them reaches the 4.5:1 that text needs on a light surface
 * (the best is 3.93). Put one of these on a `color:` and the label fails AA. Labels use
 * `--mj-text-*`; the swatch beside them carries the hue.
 *
 * COLOUR IS NEVER THE ONLY CHANNEL. Every chart that uses these prints the category name
 * and its count in text next to the mark (WCAG 1.4.1). The colour is there to bind label
 * to bar preattentively, not to encode anything on its own.
 *
 * USAGE. Include {@link FORMS_VIZ_CSS} in the component's `styles` alongside
 * `FORMS_UI_CSS`, put a `mjf-viz-*` class on the element, and read the fill from
 * `var(--mjf-viz-fill)`. One class sets one variable; the geometry stays in the chart.
 *
 *     <span class="bar-fill" [class]="'bar-fill ' + vizSeriesClass(i)"></span>
 *     .bar-fill { background: var(--mjf-viz-fill); }
 *
 * DO NOT IMPORT THIS FROM `lib/widget/`, for the same reason `forms-ui.ts` says not to:
 * the respondent widget is themed from `FormStyle.Tokens`, not from this cascade.
 */

/**
 * The eight categorical hues, plus the role aliases the charts actually name.
 *
 * The numbered entries are the palette as specified, in the order it was specified —
 * `--mjf-viz-3` is the third colour someone handed us, and stays that whatever the charts
 * do with it. The roles below are the layer that carries meaning, so a chart says
 * "positive" rather than "green" and re-pointing a role later is one line here.
 */
export const FORMS_VIZ_TOKENS = /* css */ `
:host {
  --mjf-viz-1: #378ADD;
  --mjf-viz-2: #1D9E75;
  --mjf-viz-3: #D85A30;
  --mjf-viz-4: #BA7517;
  --mjf-viz-5: #7F77DD;
  --mjf-viz-6: #D4537E;
  --mjf-viz-7: #639922;
  --mjf-viz-8: #888780;

  /* Roles. Used wherever a mark MEANS something, so the colour is not a rotation
     accident: a single-series bar is always the same blue, "complete" is always the
     same green, and a reader who learns one chart has learned all of them. */
  --mjf-viz-series: var(--mjf-viz-1);
  --mjf-viz-positive: var(--mjf-viz-2);
  --mjf-viz-negative: var(--mjf-viz-3);
  --mjf-viz-caution: var(--mjf-viz-4);
  --mjf-viz-neutral: var(--mjf-viz-8);

  /* What an unfilled bar sits on, and the fill an element gets when no mjf-viz-* class
     has set one — grey rather than a random hue, so a missed class reads as "no
     category" instead of quietly claiming to be the first one. */
  --mjf-viz-track: var(--mj-bg-surface-sunken);
  --mjf-viz-fill: var(--mjf-viz-neutral);
}
`;

/**
 * The class-to-variable plumbing, and the two marks small enough to be shared.
 *
 * Setting a variable rather than the property itself is what lets one class serve a bar
 * fill, a legend dot and a tinted rule without three class families.
 */
export const FORMS_VIZ_PRIMITIVES = /* css */ `
.mjf-viz-1 { --mjf-viz-fill: var(--mjf-viz-1); }
.mjf-viz-2 { --mjf-viz-fill: var(--mjf-viz-2); }
.mjf-viz-3 { --mjf-viz-fill: var(--mjf-viz-3); }
.mjf-viz-4 { --mjf-viz-fill: var(--mjf-viz-4); }
.mjf-viz-5 { --mjf-viz-fill: var(--mjf-viz-5); }
.mjf-viz-6 { --mjf-viz-fill: var(--mjf-viz-6); }
.mjf-viz-7 { --mjf-viz-fill: var(--mjf-viz-7); }
.mjf-viz-8 { --mjf-viz-fill: var(--mjf-viz-8); }

.mjf-viz-series   { --mjf-viz-fill: var(--mjf-viz-series); }
.mjf-viz-positive { --mjf-viz-fill: var(--mjf-viz-positive); }
.mjf-viz-negative { --mjf-viz-fill: var(--mjf-viz-negative); }
.mjf-viz-caution  { --mjf-viz-fill: var(--mjf-viz-caution); }
.mjf-viz-neutral  { --mjf-viz-fill: var(--mjf-viz-neutral); }

/* A question-type pill: tinted ground, coloured glyph, TOKEN text.

   The text colour is the whole design of this class. The pill carries a hue so a type is
   recognisable at a glance, but the label inside it stays on --mj-text-primary, because the
   palette is measured for GRAPHICS (3:1) and not for text (4.5:1) — putting the hue on the
   words would fail AA on every light surface. So the glyph takes the colour and the label
   takes a token, and both are legible.

   The tint is mixed against the SURFACE rather than being a fixed light shade: a fixed one
   would be a pale wash on a dark card and invisible. Mixing keeps it a constant 14% of
   whatever it sits on, in both themes. */
.mjf-type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: var(--mjf-label);
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  border-radius: var(--mjf-radius-pill);
  color: var(--mj-text-primary);
  background: color-mix(in srgb, var(--mjf-viz-fill) 14%, var(--mj-bg-surface));
  border: 1px solid color-mix(in srgb, var(--mjf-viz-fill) 28%, transparent);
}
.mjf-type-pill > i { color: var(--mjf-viz-fill); font-size: 0.875em; }

/* A bare coloured glyph — no plate, no tint, no border.

   The palette rail needs colour WITHOUT weight: 25 icons each in its own filled square turns
   a scannable list into a grid of buttons and buries the labels that actually name the
   types. The hue alone is enough to group them, because the group headings are already
   doing the structural work. */
.mjf-type-glyph { color: var(--mjf-viz-fill); }

/* A legend dot. Small marks lose hue fast, so this is the floor size at which these
   eight stay tellable apart; anything smaller wants a label doing the work instead. */
.mjf-viz-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mjf-viz-fill);
}

/* The track a proportional fill runs in. Geometry (height, radius) is the chart's
   business; this only owns the two colours and the clip. */
.mjf-viz-track {
  position: relative;
  overflow: hidden;
  background: var(--mjf-viz-track);
}
.mjf-viz-bar {
  height: 100%;
  background: var(--mjf-viz-fill);
  /* A bucket with a real but tiny count must still be visible — a 0.4% bar rounding to
     nothing reads as "nobody chose this", which is a different fact. */
  min-width: 3px;
  transition: width var(--mjf-ease);
}
@media (prefers-reduced-motion: reduce) {
  .mjf-viz-bar { transition: none; }
}
`;

/** Tokens + primitives: `styles: [FORMS_UI_CSS, FORMS_VIZ_CSS, OWN_CSS]`. */
export const FORMS_VIZ_CSS = `${FORMS_VIZ_TOKENS}\n${FORMS_VIZ_PRIMITIVES}`;

/** How many distinct categorical hues exist before the rotation repeats. */
export const VIZ_SERIES_LENGTH = 8;

/**
 * The order categories are assigned in — NOT 1..8.
 *
 * Two bars that touch are the pair a reader is most likely to confuse, so the rotation is
 * the permutation that maximises the smallest CIE76 ΔE between NEIGHBOURS. In palette
 * order the worst neighbours are `--mjf-viz-3` and `--mjf-viz-4` (orange beside amber) at
 * ΔE 28.5 — close enough that adjacent bars in a six-option distribution read as one. This
 * order lifts the worst neighbouring pair to ΔE 65.2, a 2.3× improvement, and every other
 * pair sits above 78.
 *
 * The palette itself is untouched: this reorders which hue a category REACHES FOR, not what
 * any `--mjf-viz-N` is.
 */
export const VIZ_SERIES_ROTATION: readonly number[] = [1, 4, 2, 6, 7, 5, 3, 8];

/**
 * The class for the nth category in a chart, wrapping after eight.
 *
 * Assignment is by POSITION, not by a hash of the label. Position guarantees no two
 * categories in the same chart collide, which is what the reader is actually looking at;
 * a hash would keep an option's colour stable across sessions but can hand two options in
 * one chart the same hue, and the sort order these charts use (count descending) already
 * moves options around as responses arrive. The label sits beside its swatch either way.
 *
 * Negative or non-integer input is a caller bug rather than a display state, so it is
 * rejected here instead of silently colouring something the first hue.
 */
export function vizSeriesClass(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`vizSeriesClass: index must be a non-negative integer, got ${index}`);
  }
  return `mjf-viz-${VIZ_SERIES_ROTATION[index % VIZ_SERIES_LENGTH]}`;
}
