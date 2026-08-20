/**
 * The `--mjf-*` vocabulary an AI theme may write, and the accessibility gate it must clear.
 *
 * ── WHY AN ALLOW-LIST AND NOT "WHATEVER THE MODEL RETURNS". ──────────────────────────────────
 * `applyStyleTokens` writes any `--`-prefixed key onto the widget host, so an invented token name
 * is not rejected — it is applied, read by nothing, and looks in the database exactly like a token
 * that works. The Design tab then shows an author a theme with settings they cannot find. So the
 * vocabulary is closed: anything outside it is stripped before persist, and the strip is reported
 * rather than silent.
 *
 * The list is the one the Design tab itself edits (`style-tokens.ts` `BRAND_TOKENS`). It is
 * duplicated here rather than imported because forms-actions cannot depend on forms-ng — a server
 * package pulling in an Angular one — so {@link THEME_TOKEN_NAMES} is a deliberate copy, and the
 * `themeTokenNames` test in forms-ng asserts the two lists still agree.
 *
 * ── WHY CONTRAST IS FIXED, NOT RE-PROMPTED. ──────────────────────────────────────────────────
 * A model that produced an unreadable pair once will produce another one; asking again costs a
 * round trip and a token budget for a coin flip. The readable ink for a given background is
 * ARITHMETIC — the same arithmetic the widget already runs at render time — so the fix is
 * computed, not requested. It also means the persisted theme and the rendered theme agree, rather
 * than the widget silently overriding what the database says on every page load.
 */
import { z } from 'zod';
import { contrastRatio, parseCssColor, readableInk, toCssRgb } from '@mj-biz-apps/forms-entities';

/**
 * Every token an AI theme may set.
 *
 * Deliberately a subset of what the Design tab offers: type sizes, alignments and the background
 * image are layout decisions an author makes by looking at their form, not ones a model should
 * guess from a brief. What is here is colour and type FAMILY, which is what "make it feel warm"
 * actually means.
 */
export const THEME_TOKEN_NAMES = [
  '--mjf-accent',
  '--mjf-accent-strong',
  '--mjf-page-bg',
  '--mjf-card-bg',
  '--mjf-page-ink',
  '--mjf-on-accent',
  '--mjf-choice-selected-bg',
  '--mjf-font-body',
  '--mjf-font-display',
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

const THEME_TOKEN_SET: ReadonlySet<string> = new Set(THEME_TOKEN_NAMES);

/**
 * The shape a theme prompt returns.
 *
 * A record rather than an object with nine optional keys, because the strip below is what
 * enforces the vocabulary and a nine-key schema would just say the same thing twice. Values are
 * strings: a CSS colour or a font stack, passed through as authored.
 */
export const themeResponseSchema = z.object({
  cssVariables: z.record(z.string()),
});

export type ThemeResponse = z.infer<typeof themeResponseSchema>;

/** A validated theme, and everything that had to be changed to get there. */
export interface ThemeOutcome {
  cssVariables: Record<string, string>;
  /**
   * Token names the model invented, dropped. Reported so an operator can see a prompt drifting
   * from its vocabulary instead of quietly producing thinner themes over time.
   */
  strippedTokens: string[];
  /**
   * Tokens whose value was replaced to reach the bar. Named, for the same reason.
   *
   * A repair is NOT a degradation — the theme is better afterwards, not worse — so it is logged
   * rather than surfaced to the author. What an operator wants to see is a prompt that keeps
   * needing repairing, which a log makes visible over time and a per-run message would not.
   */
  repairedTokens: string[];
  /**
   * Pairs that STILL fail after the best available repair, as `ink on background`.
   *
   * Some backgrounds admit no readable ink at all. Mid-grey is the textbook case: `#777777`
   * reaches 4.48:1 against white and 3.78:1 against off-black, so neither extreme clears AA and
   * there is no third option that moving only the ink can reach.
   *
   * Reported rather than fixed, because the fix would be to change the BACKGROUND — the one thing
   * the brief actually asked for. An author who wanted a grey form should be told their text will
   * be hard to read, not handed a different colour without being asked. Naming it is what turns a
   * silent accessibility failure into something the completion message can carry.
   */
  unreadablePairs: string[];
}

/**
 * Turn a raw theme response into tokens that are safe to persist.
 *
 * Two passes, in this order and not the other: strip first, because a token outside the vocabulary
 * should not be contrast-checked (nothing will ever render it), and repairing before stripping
 * would spend the arithmetic on values about to be discarded.
 */
export function validateTheme(response: ThemeResponse): ThemeOutcome {
  const { kept, strippedTokens } = stripUnknownTokens(response.cssVariables);
  const { cssVariables, repairedTokens, unreadablePairs } = enforceReadability(kept);
  return { cssVariables, strippedTokens, repairedTokens, unreadablePairs };
}

/** Keep only the tokens the widget actually reads. */
function stripUnknownTokens(raw: Record<string, string>): {
  kept: Record<string, string>;
  strippedTokens: string[];
} {
  const kept: Record<string, string> = {};
  const strippedTokens: string[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (THEME_TOKEN_SET.has(name) && typeof value === 'string' && value.trim().length > 0) {
      kept[name] = value.trim();
    } else {
      strippedTokens.push(name);
    }
  }
  return { kept, strippedTokens };
}

/** WCAG 2.1 AA for body text. */
const AA_BODY = 4.5;

/** WCAG 1.4.11 for a large UI element (a button, a progress fill) against what surrounds it. */
const NON_TEXT_MIN = 3;

/**
 * The pairs that have to be readable, and against what.
 *
 * Only pairs BOTH of whose halves the theme sets are checked. A token the model left alone falls
 * back to the widget's own default, which the widget's own render-time guard already handles with
 * the fully-resolved colours — and those are the only correct ones to judge. Second-guessing an
 * unset token from here means judging a pairing that may not be the one that renders.
 */
const INK_PAIRS: ReadonlyArray<{ ink: ThemeTokenName; on: ThemeTokenName; min: number }> = [
  { ink: '--mjf-page-ink', on: '--mjf-page-bg', min: AA_BODY },
  { ink: '--mjf-page-ink', on: '--mjf-card-bg', min: AA_BODY },
  // Button labels sit on the accent, so this is body text on a brand colour — the pairing most
  // often got wrong, because a saturated brand colour looks confident and reads terribly.
  { ink: '--mjf-on-accent', on: '--mjf-accent', min: AA_BODY },
  // The accent is a large element rather than text: it only has to be distinguishable.
  { ink: '--mjf-accent', on: '--mjf-page-bg', min: NON_TEXT_MIN },
];

/**
 * Replace any ink that cannot be read on its background with the best one available.
 *
 * The INK moves, never the background. A background is the theme's identity — "make it warm" is a
 * statement about the background — whereas an ink is a consequence of it, so changing the ink
 * honours the request and changing the background contradicts it.
 *
 * "Best available" and not "guaranteed to pass": {@link readableInk} picks whichever of off-black
 * and off-white reads better, and on a mid-grey background neither clears AA. That is a property
 * of the background, not a bug here, and it is the same answer the widget reaches at render time —
 * being stricter on the server would mean the database and the screen disagreed about the theme.
 * The pair is recorded in {@link ThemeOutcome.unreadablePairs} instead.
 */
function enforceReadability(tokens: Record<string, string>): {
  cssVariables: Record<string, string>;
  repairedTokens: string[];
  unreadablePairs: string[];
} {
  const cssVariables = { ...tokens };
  const repairedTokens: string[] = [];
  const unreadablePairs: string[] = [];

  for (const pair of INK_PAIRS) {
    const background = parseCssColor(cssVariables[pair.on] ?? '');
    const ink = parseCssColor(cssVariables[pair.ink] ?? '');
    if (!background || !ink || contrastRatio(background, ink) >= pair.min) {
      continue;
    }
    // The off-black or off-white that reads best on this background — the same two values the
    // widget's defaults use, so a repaired theme still looks like a theme rather than a failure.
    const repaired = readableInk(background, ink);
    cssVariables[pair.ink] = toCssRgb(repaired);
    if (!repairedTokens.includes(pair.ink)) {
      repairedTokens.push(pair.ink);
    }
    if (contrastRatio(background, repaired) < pair.min) {
      unreadablePairs.push(`${pair.ink} on ${pair.on}`);
    }
  }
  return { cssVariables, repairedTokens, unreadablePairs };
}
