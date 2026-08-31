/**
 * What pen a `Doodle` question draws with, and which of those choices the respondent gets.
 *
 * WHY THIS IS IN THE CONTRACT AND NOT IN THE WIDGET. Two consumers need the same list for
 * different reasons: the widget renders the swatches and hands the canvas a line width, and the
 * builder offers the author a dropdown of exactly what the widget will accept. Written twice
 * they drift, and the drift is silent in the worst direction — the builder offers a colour the
 * pad falls back on, so the author picks one and the respondent draws in another.
 *
 * WHAT IS *NOT* HERE, deliberately: the CSS each colour resolves to. That is presentation, it
 * belongs to the pad's own stylesheet, and it cannot live in a package with no stylesheet to put
 * it in — the same split `question-types.ts` keeps from `question-type-catalog.ts`.
 *
 * EVERYTHING BELOW READS UNTRUSTED INPUT. These values come out of `FormQuestion.Settings`, an
 * open JSON blob reachable by paste, by scripted import and by a mistyped API call. There is no
 * schema between that blob and a respondent's screen, so the rule is absolute: an unrecognised
 * value is the DEFAULT, never an error and never a broken pad. A doodle question whose settings
 * are nonsense still renders a pad someone can draw on.
 */
import type { JSONValue } from './json-value';

/**
 * The pens on offer, in swatch order.
 *
 * `Ink` first because it is the default and the only one of the six that is not a hue: it follows
 * the form's own `--mjf-page-ink`, which the theming layer already guarantees is readable on the
 * page. The other five are hues, and the pad mixes each toward that same ink so none of them can
 * vanish against a themed background — see the pad's stylesheet for the measurements.
 *
 * Kept SHORT on purpose. This is a picker a respondent uses one-handed on a phone; a
 * twenty-swatch palette is a worse control than a six-swatch one, and every extra hue is another
 * colour whose contrast has to hold on every form anyone ever themes.
 */
export const DOODLE_PEN_COLORS = ['Ink', 'Blue', 'Green', 'Amber', 'Red', 'Violet'] as const;

/** One pen colour. */
export type DoodlePenColor = (typeof DOODLE_PEN_COLORS)[number];

/**
 * Named stroke widths and the canvas `lineWidth` each resolves to.
 *
 * Named rather than a free slider: three values are three things to test and three large tap
 * targets, where a slider is a continuum nobody can hit precisely on a touchscreen and a range
 * whose ends have to be defended anyway.
 *
 * `Medium` is 2.5 because that is the number the pad hardcoded before this existed. A question
 * with no pen settings has to draw exactly as it did, and this constant is what says so.
 */
export const DOODLE_PEN_WIDTHS = { Fine: 1.25, Medium: 2.5, Broad: 5 } as const;

/** One named stroke width. */
export type DoodlePenWidth = keyof typeof DOODLE_PEN_WIDTHS;

/**
 * The width names in offer order, thin to thick.
 *
 * DERIVED from the table rather than listed again, for the reason `FORM_QUESTION_TYPES` is: a
 * hand-written copy has no way to learn that the table grew, so a fourth width would compile
 * cleanly and simply never appear in the picker or the author's dropdown. `Object.keys` loses the
 * literal key types, so the cast restores what the table already proves — the same one place a
 * cast is warranted there.
 */
export const DOODLE_PEN_WIDTH_NAMES: readonly DoodlePenWidth[] = Object.keys(
  DOODLE_PEN_WIDTHS,
) as DoodlePenWidth[];

/**
 * Which pen controls the respondent may use, as the author stores it.
 *
 * ONE setting rather than two booleans, because it is one decision with four outcomes and the
 * author reads one row instead of two. `''` first and default: a pad with no controls is what
 * every existing Doodle question already is, so the absent key and the empty key mean the same
 * thing — which is also `question-settings.ts`'s rule that a blank value deletes the key.
 */
export const DOODLE_PEN_CONTROL_CHOICES = ['', 'Colour', 'Width', 'Colour and width'] as const;

/** What the author stored in `penControls`. */
export type DoodlePenControls = (typeof DOODLE_PEN_CONTROL_CHOICES)[number];

/** The pen a doodle question draws with, and what the respondent may change about it. */
export interface DoodlePen {
  /** The pen a stroke starts with. */
  readonly color: DoodlePenColor;
  /** The width a stroke starts with. */
  readonly width: DoodlePenWidth;
  /** Whether the respondent is shown the colour swatches. */
  readonly offerColor: boolean;
  /** Whether the respondent is shown the width buttons. */
  readonly offerWidth: boolean;
}

/**
 * What a question with no pen settings draws with — today's pad, stated once.
 *
 * Exported because the BUILDER needs it too: its dropdowns label the blank option with the
 * default's name ("Medium"), and a hand-copied name there would eventually say Medium while the
 * pad drew Fine. The panel would then be lying about behaviour, which is worse than offering
 * nothing.
 */
export const DOODLE_PEN_DEFAULTS: DoodlePen = { color: 'Ink', width: 'Medium', offerColor: false, offerWidth: false };

/**
 * Read a doodle question's pen configuration out of its `Settings` blob.
 *
 * Each key falls back independently: a blob with a good colour and a nonsense width keeps the
 * colour. Rejecting the whole blob on one bad key would silently revert every other choice the
 * author made, which is a worse answer to a typo than ignoring the typo.
 */
export function doodlePen(settings?: Record<string, JSONValue>): DoodlePen {
  if (!settings) {
    return DOODLE_PEN_DEFAULTS;
  }
  const controls = asMember(settings['penControls'], DOODLE_PEN_CONTROL_CHOICES) ?? '';
  return {
    color: asMember(settings['penColor'], DOODLE_PEN_COLORS) ?? DOODLE_PEN_DEFAULTS.color,
    width: asMember(settings['penWidth'], DOODLE_PEN_WIDTH_NAMES) ?? DOODLE_PEN_DEFAULTS.width,
    offerColor: controls === 'Colour' || controls === 'Colour and width',
    offerWidth: controls === 'Width' || controls === 'Colour and width',
  };
}

/**
 * `value` if it is one of `allowed`, otherwise `undefined`.
 *
 * An `includes` over the tuple rather than a lookup on an object, so a JSON value that happens to
 * name an inherited property (`'constructor'`, `'__proto__'`) cannot certify itself — the same
 * trap `isFormQuestionType` documents, and this input is just as attacker-shaped.
 */
function asMember<T extends string>(value: JSONValue | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
