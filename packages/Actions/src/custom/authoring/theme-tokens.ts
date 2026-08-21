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
/**
 * The tokens whose value must be a colour this codebase can actually measure.
 *
 * Everything else in the vocabulary is a font stack, which is a string and is passed through as
 * authored. Split out because the contrast gate can only judge what {@link parseCssColor} reads,
 * and a value it cannot read used to make the gate SKIP that pair in silence.
 */
export const THEME_COLOR_TOKEN_NAMES = [
  '--mjf-accent',
  '--mjf-accent-strong',
  '--mjf-page-bg',
  '--mjf-card-bg',
  '--mjf-page-ink',
  '--mjf-on-accent',
  '--mjf-choice-selected-bg',
] as const;

const THEME_COLOR_TOKEN_SET: ReadonlySet<string> = new Set(THEME_COLOR_TOKEN_NAMES);

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
 * Turn a raw theme response into the complete palette that is safe to persist.
 *
 * ── IT JUDGES WHAT WILL RENDER, NOT WHAT THE MODEL SENT. ─────────────────────────────────────
 * `base` is the palette the response is laid over — the house defaults for a new form, the form's
 * CURRENT tokens for a restyle — and the merge happens BEFORE the contrast gate rather than after
 * it. That ordering is the whole point, and getting it the other way round is a defect this code
 * shipped with: the gate ran on the model's fragment, `enforceReadability` skips any pair whose
 * halves are not both present, and the theme prompt explicitly invites a partial answer ("leave
 * one out and the form uses its own sensible default"). So a model that set only the background
 * had its ink pair skipped, the house ink shipped on top of it at 1.45:1, and `unreadablePairs`
 * came back empty. The widget's render-time guard could not catch it either, because the merge
 * writes all fourteen tokens and the guard declines to touch a colour an author chose.
 *
 * Passing `base` also makes a restyle non-destructive. Merging over the house palette meant a
 * one-token change ("make the buttons darker") reset every other colour the author had tuned.
 *
 * Three passes, in this order: strip first, because a token outside the vocabulary should not be
 * contrast-checked (nothing will ever render it); merge second, so the gate sees the real
 * colours; repair last.
 */
export function validateTheme(
  response: ThemeResponse,
  base: Readonly<Record<string, string>>,
): ThemeOutcome {
  const { kept, strippedTokens } = stripUnknownTokens(response.cssVariables);
  // The strip already removed everything outside THEME_TOKEN_NAMES, and that list carries no
  // layout tokens, so a spread cannot let the model reach sizing or alignment through here.
  const { cssVariables, repairedTokens, unreadablePairs } = enforceReadability({ ...base, ...kept });
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
    const trimmed = typeof value === 'string' ? value.trim() : '';
    // A colour token whose value cannot be MEASURED is dropped like an invented token name is.
    // `parseCssColor` reads hex and rgb(); it misreads `hsl(210 50% 40%)` as the RGB triple
    // 210,50,40, and returns undefined for `navy` or `var(--brand)` — which made
    // `enforceReadability` skip that pair entirely. Since the gate now judges the whole merged
    // palette, one unreadable value would silently remove a pair from a check that is supposed to
    // cover all of them. Stripping falls back to the house default, which IS measurable, and the
    // strip is reported so a prompt drifting toward `hsl()` is visible rather than invisible.
    const usable =
      THEME_TOKEN_SET.has(name) &&
      trimmed.length > 0 &&
      (!THEME_COLOR_TOKEN_SET.has(name) || parseCssColor(trimmed) !== undefined);
    if (usable) {
      kept[name] = trimmed;
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
 * The pairs that have to be readable, against what, and which half may be moved to get there.
 *
 * `repair: null` means BOTH halves are identity colours and neither may be touched — the pair is
 * reported and left alone. That is the accent-on-page pair, and giving it a repair target was a
 * defect: the accent was listed as the "ink" and duly replaced with near-black, which discarded
 * the brand colour the brief asked for, left `--mjf-accent-strong` at its old hue so hover became
 * a different colour, and silently broke the on-accent pair that had been checked against the OLD
 * accent two entries earlier and passed. Button labels sit on the accent, so the accent is a
 * background, and the invariant below already said backgrounds do not move.
 *
 * With that entry non-repairing, no pair mutates a token another pair reads as a background.
 *
 * ORDER IS STILL LOAD-BEARING, and this comment used to claim it was not. Backgrounds do not move,
 * but the first two entries share a REPAIR TARGET — both write `--mjf-page-ink` — so the later one
 * silently overwrites the earlier one's result. That is why `enforceReadability` ends with a
 * verification pass over the finished map instead of trusting what each iteration concluded: the
 * order still decides which ink you end up with, and the final pass decides what you are TOLD.
 */
const INK_PAIRS: ReadonlyArray<{
  foreground: ThemeTokenName;
  background: ThemeTokenName;
  min: number;
  repair: ThemeTokenName | null;
}> = [
  { foreground: '--mjf-page-ink', background: '--mjf-page-bg', min: AA_BODY, repair: '--mjf-page-ink' },
  { foreground: '--mjf-page-ink', background: '--mjf-card-bg', min: AA_BODY, repair: '--mjf-page-ink' },
  // Button labels sit on the accent, so this is body text on a brand colour — the pairing most
  // often got wrong, because a saturated brand colour looks confident and reads terribly.
  { foreground: '--mjf-on-accent', background: '--mjf-accent', min: AA_BODY, repair: '--mjf-on-accent' },
  // The accent is a large element rather than text: it only has to be distinguishable. Nothing
  // here may move — see above.
  { foreground: '--mjf-accent', background: '--mjf-page-bg', min: NON_TEXT_MIN, repair: null },
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
    const background = parseCssColor(cssVariables[pair.background] ?? '');
    const foreground = parseCssColor(cssVariables[pair.foreground] ?? '');
    if (!background || !foreground || contrastRatio(background, foreground) >= pair.min) {
      continue;
    }
    const name = `${pair.foreground} on ${pair.background}`;
    if (!pair.repair) {
      // Nothing here may move, so the only honest response is to say so.
      unreadablePairs.push(name);
      continue;
    }
    // The off-black or off-white that reads best on this background — the same two values the
    // widget's defaults use, so a repaired theme still looks like a theme rather than a failure.
    const repaired = readableInk(background, foreground);
    // Only counted as a repair when the value ACTUALLY changed. `readableInk` returns the best of
    // near-black and near-white, which on a mid-tone background is sometimes the colour already
    // there — reporting that as "corrected 1 token" claims work that did not happen, and the log
    // line exists precisely so somebody can trust the count.
    const changed =
      repaired[0] !== foreground[0] || repaired[1] !== foreground[1] || repaired[2] !== foreground[2];
    if (changed) {
      cssVariables[pair.repair] = toCssRgb(repaired);
      if (!repairedTokens.includes(pair.repair)) {
        repairedTokens.push(pair.repair);
      }
    }
    if (contrastRatio(background, repaired) < pair.min) {
      unreadablePairs.push(name);
    }
  }

  // A FINAL PASS OVER THE FINISHED MAP, because a repair is not necessarily still true when the
  // loop ends. Two pairs share `--mjf-page-ink` as their repair target: the page pair moves it to
  // suit the page background, then the card pair moves the SAME token back to suit the card, and
  // the page pair never re-checks. A dark page with the default light card produced exactly that —
  // ink at 1.05:1 on the page, `unreadablePairs` empty, and the author told the theme applied.
  //
  // This does not attempt to satisfy both; one ink cannot serve two backgrounds that far apart,
  // and inventing a third value is not this gate's job. It reports what the form will actually
  // render, which is the difference between a hard theme and a lie about an easy one.
  for (const pair of INK_PAIRS) {
    const background = parseCssColor(cssVariables[pair.background] ?? '');
    const foreground = parseCssColor(cssVariables[pair.foreground] ?? '');
    if (!background || !foreground || contrastRatio(background, foreground) >= pair.min) {
      continue;
    }
    const name = `${pair.foreground} on ${pair.background}`;
    if (!unreadablePairs.includes(name)) {
      unreadablePairs.push(name);
    }
  }
  return { cssVariables, repairedTokens, unreadablePairs };
}
