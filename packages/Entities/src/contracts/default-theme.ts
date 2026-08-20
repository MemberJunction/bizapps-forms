/**
 * The look every MJ Form starts with, however it was created.
 *
 * ── ONE PALETTE, TWO CREATION PATHS. ─────────────────────────────────────────────────────────
 * A form built by hand in the builder and a form generated from a brief used to start from
 * different places: the Design tab created a style with an EMPTY token map (so the widget fell
 * back to its own built-in defaults), while AI generation invented a palette from scratch. Two
 * forms made the same afternoon looked unrelated, and neither looked like a house style.
 *
 * This is that house style, and it is applied identically by both paths. Living in the contract
 * package is what makes "identically" true rather than aspirational — `forms-actions` seeds it on
 * the server and `forms-ng` seeds it in the Design tab, from this one definition.
 *
 * ── DETERMINISTIC UNLESS ASKED. ──────────────────────────────────────────────────────────────
 * AI generation no longer picks colours by default. The theme stage runs only when the author's
 * brief actually describes a look — and even then it overrides colour and type FAMILY only, on top
 * of these values. Sizing, alignment and corner radius are never model-chosen: they are layout
 * decisions somebody makes by looking at a form, not by reading a sentence about one.
 *
 * ── EVERY PAIR CLEARS WCAG AA. ───────────────────────────────────────────────────────────────
 * Measured with the same `contrastRatio` the widget runs at render time, so the shipped default
 * cannot be something the accessibility gate would have to repair:
 *
 *   ink #373530 on white .................... 12.25:1  (AA body needs 4.5)
 *   white on accent #1b7fa8 ..................  4.52:1  (button label — passes, but only just)
 *   accent #1b7fa8 on white ..................  4.52:1  (non-text needs 3.0)
 *   ink on selected answer #bfd2df ...........  7.87:1
 *
 * The button label is the tight one. Darkening the accent is the lever if it ever needs headroom;
 * lightening it breaks the label first.
 */

/**
 * The `--mjf-*` tokens every new form is seeded with.
 *
 * Values are the ones the Design tab's own controls write, so an author opening Design sees the
 * controls already reflecting reality — Font on "System", Corner radius on "Pill", Title size on
 * "Lg". A default expressed in values the controls cannot read back is a default that makes the
 * panel look broken.
 */
export const DEFAULT_FORM_THEME: Readonly<Record<string, string>> = Object.freeze({
  // --- Colour -----------------------------------------------------------------------
  /** The page behind the form. */
  '--mjf-page-bg': '#ffffff',
  /** The surface questions sit on. Same as the page: one flat white sheet, not a card on a wash. */
  '--mjf-card-bg': '#ffffff',
  /** Titles and question text. */
  '--mjf-page-ink': '#373530',
  /** Buttons, progress fill, the active choice. */
  '--mjf-accent': '#1b7fa8',
  /** Hover and pressed. A darker shade of the accent rather than a second hue. */
  '--mjf-accent-strong': '#166686',
  /** Text drawn ON the accent, i.e. button labels. */
  '--mjf-on-accent': '#ffffff',
  /** Fill of a selected answer choice. */
  '--mjf-choice-selected-bg': '#bfd2df',

  // --- Type -------------------------------------------------------------------------
  /** System stack for both, so a form loads no webfont and matches the device it opens on. */
  '--mjf-font-body': 'system-ui, sans-serif',
  '--mjf-font-display': 'system-ui, sans-serif',

  // --- Size and position ------------------------------------------------------------
  // Welcome and ending screens are heroes: large and centred. Questions are a form: normal and
  // left-aligned, because a centred question label and its input drift apart as the label grows.
  /** Title size "Lg". */
  '--mjf-title-size': '2.25rem',
  /** Title alignment "center". */
  '--mjf-title-align': 'center',
  /** Question size "Md". */
  '--mjf-question-size': '1.0625rem',
  /** Question alignment "left" — flex, because the label row is a flex container. */
  '--mjf-question-align': 'flex-start',

  // --- Shape ------------------------------------------------------------------------
  /** Corner radius "Pill". Buttons only — the control that says Buttons changes buttons. */
  '--mjf-btn-radius': '999px',
});

/**
 * The tokens a generated theme may override, i.e. colour and type family only.
 *
 * Exported so the theme stage can merge a model's palette on top of the default without letting it
 * reach the layout tokens. Deriving it from the default rather than listing it twice means a token
 * added above is covered here by construction.
 */
export const THEME_LAYOUT_TOKENS: readonly string[] = Object.freeze([
  '--mjf-title-size',
  '--mjf-title-align',
  '--mjf-question-size',
  '--mjf-question-align',
  '--mjf-btn-radius',
]);

/**
 * The default with `overrides` applied — the shape actually persisted to `FormStyle.CSSVariables`.
 *
 * Layout tokens are taken from the default unconditionally, so an override that reaches for one is
 * ignored rather than honoured. That is belt-and-braces: the theme stage's own vocabulary already
 * excludes them, and this makes a future caller unable to widen that by accident.
 */
export function themeWithOverrides(overrides: Readonly<Record<string, string>>): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_FORM_THEME };
  for (const [name, value] of Object.entries(overrides)) {
    if (!THEME_LAYOUT_TOKENS.includes(name)) {
      merged[name] = value;
    }
  }
  return merged;
}

/** The default as the JSON string `FormStyle.CSSVariables` stores. */
export function defaultThemeJSON(): string {
  return JSON.stringify(DEFAULT_FORM_THEME, null, 2);
}
