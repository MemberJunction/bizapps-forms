import { describe, it, expect } from 'vitest';
import { DEFAULT_FORM_THEME, contrastRatio, parseCssColor } from '@mj-biz-apps/forms-entities';
import { THEME_TOKEN_NAMES, validateTheme } from './theme-tokens';

/** Measured contrast between two token values, for asserting the gate actually moved the needle. */
function ratio(a: string, b: string): number {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  expect(ca, `parse ${a}`).toBeTruthy();
  expect(cb, `parse ${b}`).toBeTruthy();
  return contrastRatio(ca!, cb!);
}

describe('validateTheme — vocabulary', () => {
  it('keeps every token the widget actually reads', () => {
    const authored = Object.fromEntries(THEME_TOKEN_NAMES.map((n) => [n, '#123456']));
    const result = validateTheme({ cssVariables: authored }, DEFAULT_FORM_THEME);
    expect(result.strippedTokens).toEqual([]);
    // Every authored token survives. The RESULT also carries the base's layout tokens, because
    // production merges the model's fragment over the form's current theme — asserting exact
    // equality here only worked while the spec called this with no base at all, which is a
    // signature production cannot use.
    for (const name of THEME_TOKEN_NAMES) {
      expect(Object.keys(result.cssVariables)).toContain(name);
    }
  });

  it('strips an invented token, and NAMES it', () => {
    // `applyStyleTokens` writes any `--` key onto the host, so an invented one is applied, read by
    // nothing, and indistinguishable in the database from a token that works.
    const result = validateTheme({
      cssVariables: { '--mjf-accent': '#0055aa', '--mjf-vibe': 'cosy', '--mjf-border-glow': '2px' },
    }, DEFAULT_FORM_THEME);
    expect(result.cssVariables['--mjf-vibe']).toBeUndefined();
    expect(result.strippedTokens.sort()).toEqual(['--mjf-border-glow', '--mjf-vibe']);
  });

  it('strips a blank value rather than persisting an empty custom property', () => {
    const result = validateTheme({ cssVariables: { '--mjf-accent': '   ' } }, DEFAULT_FORM_THEME);
    // Stripped from the RESPONSE, so what remains is the value the form already had — a blank must
    // not overwrite a real colour with an empty custom property.
    expect(result.cssVariables['--mjf-accent']).toBe(DEFAULT_FORM_THEME['--mjf-accent']);
    expect(result.strippedTokens).toEqual(['--mjf-accent']);
  });

  it('trims a value the model padded', () => {
    expect(validateTheme({ cssVariables: { '--mjf-accent': '  #0055aa ' } }, DEFAULT_FORM_THEME).cssVariables['--mjf-accent']).toBe(
      '#0055aa',
    );
  });
});

describe('validateTheme — readability', () => {
  it('corrects a deliberately unreadable ink to AA', () => {
    // Near-black ink on a near-black page: present, correctly themed, and unreadable — which is
    // exactly the class of theme this gate exists for.
    const result = validateTheme({
      // The card darkens with the page, as a real dark theme does. Without that the light default
      // card pulls the SAME ink back the other way and neither pair can be satisfied — a genuine
      // conflict, covered on its own below rather than smuggled into this case.
      cssVariables: { '--mjf-page-bg': '#1c1c1c', '--mjf-page-ink': '#2a2a2a', '--mjf-card-bg': '#242424' },
    }, DEFAULT_FORM_THEME);
    expect(result.repairedTokens).toContain('--mjf-page-ink');
    expect(ratio(result.cssVariables['--mjf-page-ink'], '#1c1c1c')).toBeGreaterThanOrEqual(4.5);
    expect(result.unreadablePairs).toEqual([]);
  });

  it('reports — rather than hides — a background no ink can be read on', () => {
    // `#777777` reaches 4.48:1 against white and 3.78:1 against off-black. Neither clears AA, and
    // moving only the ink cannot reach anything better. The honest outcome is the best available
    // ink plus a named failure, because the alternative fix is changing the colour the brief asked
    // for. Silently accepting it would be an accessibility failure nobody ever hears about.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#777777', '--mjf-page-ink': '#7a7a7a' },
    }, DEFAULT_FORM_THEME);
    expect(result.repairedTokens).toContain('--mjf-page-ink');
    expect(result.unreadablePairs).toContain('--mjf-page-ink on --mjf-page-bg');
    // The house accent also fails its 3:1 bar against a mid-grey page, and is reported too. That
    // is correct and not this test's subject — `toContain` rather than `toEqual` so a second
    // honest report does not read as a regression.
    //
    // No assertion here about WHICH ink it settles on. Two pairs write `--mjf-page-ink`, so the
    // final value is whichever pair ran last; pinning a ratio against the page would be pinning
    // that order. What matters, and what is asserted, is that it moved and that the failure is
    // named rather than hidden.
    expect(result.cssVariables['--mjf-page-ink']).not.toBe('#7a7a7a');
  });

  it('leaves a readable pair exactly as the model authored it', () => {
    // An ink that clears the bar is used as authored — the gate protects the respondent, it does
    // not impose taste.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#ffffff', '--mjf-page-ink': '#1a1d21' },
    }, DEFAULT_FORM_THEME);
    expect(result.repairedTokens).toEqual([]);
    expect(result.cssVariables['--mjf-page-ink']).toBe('#1a1d21');
  });

  it('fixes button label text on a saturated brand colour', () => {
    // The pairing most often got wrong: a strong accent looks confident and reads terribly.
    const result = validateTheme({
      cssVariables: { '--mjf-accent': '#ffcc00', '--mjf-on-accent': '#ffffff' },
    }, DEFAULT_FORM_THEME);
    expect(result.repairedTokens).toContain('--mjf-on-accent');
    expect(ratio(result.cssVariables['--mjf-on-accent'], '#ffcc00')).toBeGreaterThanOrEqual(4.5);
  });

  it('holds the accent to the LARGE-ELEMENT bar, not the body-text one', () => {
    // A button is not body text. Judging it at 4.5:1 would reject brand colours that are perfectly
    // visible, which is how an accessibility gate ends up being switched off.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#ffffff', '--mjf-accent': '#3aa76a' },
    }, DEFAULT_FORM_THEME);
    const measured = ratio('#3aa76a', '#ffffff');
    expect(measured).toBeGreaterThanOrEqual(3);
    expect(measured).toBeLessThan(4.5);
    expect(result.repairedTokens).not.toContain('--mjf-accent');
  });

  it('moves the ink and never the background', () => {
    // The background is the theme's identity — "make it warm" is a statement about it. Changing
    // the background to fix contrast contradicts the request; changing the ink honours it.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#8b0000', '--mjf-page-ink': '#7a0000' },
    }, DEFAULT_FORM_THEME);
    expect(result.cssVariables['--mjf-page-bg']).toBe('#8b0000');
    expect(result.cssVariables['--mjf-page-ink']).not.toBe('#7a0000');
  });

  it('does not second-guess a pair whose other half is missing from the base', () => {
    // Defensive, and the base has to be incomplete for it to arise — both production callers pass
    // a complete one. Written against `DEFAULT_FORM_THEME` this asserted the opposite of what
    // production does: the base supplies the page background, `#eeeeee` on it genuinely fails, and
    // repairing it is correct. The guard being tested is the one for a pair we cannot resolve.
    const result = validateTheme(
      { cssVariables: { '--mjf-page-ink': '#eeeeee' } },
      { '--mjf-accent': '#1b7fa8' },
    );
    expect(result.repairedTokens).toEqual([]);
    expect(result.unreadablePairs).toEqual([]);
    expect(result.cssVariables['--mjf-page-ink']).toBe('#eeeeee');
  });

  it('strips a colour it cannot MEASURE, so no pair escapes the check', () => {
    // The old title said it "ignores a value it cannot parse rather than replacing it with a
    // guess". Production does the opposite, deliberately: an unmeasurable colour is stripped and
    // the base value used, because leaving it in would remove that pair from a gate meant to cover
    // all of them — and the strip is REPORTED, so a prompt drifting toward `hsl()` is visible.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': 'var(--something-else)', '--mjf-page-ink': '#888888' },
    }, DEFAULT_FORM_THEME);

    expect(result.strippedTokens).toContain('--mjf-page-bg');
    expect(result.cssVariables['--mjf-page-bg']).toBe(DEFAULT_FORM_THEME['--mjf-page-bg']);
    // And the pair is then genuinely judged against that measurable background.
    expect(result.repairedTokens).toEqual(['--mjf-page-ink']);
  });

  it('leaves font stacks alone — they are not colours', () => {
    const stack = "'Inter', system-ui, sans-serif";
    const result = validateTheme({ cssVariables: { '--mjf-font-body': stack } }, DEFAULT_FORM_THEME);
    expect(result.cssVariables['--mjf-font-body']).toBe(stack);
    expect(result.repairedTokens).toEqual([]);
  });
});

describe('validateTheme — "repaired" means the value actually changed', () => {
  it('does not claim a repair when the best available ink is the one already there', () => {
    // A real generation hit this: white on a mid-tone terracotta fails AA, and the best available
    // ink IS white — so the pair is unreadable but nothing was corrected. Counting it as a repair
    // made the log say "corrected 1 token" when it corrected none.
    const result = validateTheme({
      cssVariables: { '--mjf-accent': '#C85A43', '--mjf-on-accent': 'rgb(255, 255, 255)' },
    }, DEFAULT_FORM_THEME);
    expect(result.unreadablePairs).toEqual(['--mjf-on-accent on --mjf-accent']);
    expect(result.repairedTokens).toEqual([]);
    // And the authored value is left exactly as it was, rather than rewritten to an equal colour.
    expect(result.cssVariables['--mjf-on-accent']).toBe('rgb(255, 255, 255)');
  });

  it('still reports a genuine repair', () => {
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#1c1c1c', '--mjf-page-ink': '#2a2a2a' },
    }, DEFAULT_FORM_THEME);
    expect(result.repairedTokens).toEqual(['--mjf-page-ink']);
  });
});

describe('validateTheme — it judges what will actually render', () => {
  /**
   * THE BUG THIS GUARDS. The gate ran on the fragment the model returned, while what got persisted
   * was that fragment merged over the house palette. `enforceReadability` skips any pair whose two
   * halves are not both present, so a model that set only the background — which the theme prompt
   * explicitly invites ("leave one out and the form uses its own sensible default") — had its ink
   * pair skipped entirely. The house ink then shipped on top of the model's background at 1.45:1,
   * with `unreadablePairs` empty and the author told the theme applied.
   *
   * The widget's render-time guard could not save it either: the merge writes all fourteen tokens,
   * so every AI form marks page-ink as author-chosen and `inkRepair` declines to touch it.
   */
  it('catches an ink it never set colliding with a background it did', () => {
    const result = validateTheme(
      { cssVariables: { '--mjf-page-bg': '#111827', '--mjf-card-bg': '#111827' } },
      DEFAULT_FORM_THEME,
    );

    // The house ink is #373530 — 1.45:1 on #111827. Something has to have happened to it.
    expect(result.cssVariables['--mjf-page-ink']).not.toBe(DEFAULT_FORM_THEME['--mjf-page-ink']);
    expect(ratio(result.cssVariables['--mjf-page-ink'], '#111827')).toBeGreaterThanOrEqual(4.5);
  });

  it('returns the whole palette, so the caller persists exactly what was judged', () => {
    // The two-step — validate the fragment, merge afterwards — is what let the gate and the
    // persisted value disagree. There is no second step now.
    const result = validateTheme({ cssVariables: { '--mjf-accent': '#0055aa' } }, DEFAULT_FORM_THEME);
    for (const name of Object.keys(DEFAULT_FORM_THEME)) {
      expect(result.cssVariables[name], name).toBeDefined();
    }
    expect(result.cssVariables['--mjf-accent']).toBe('#0055aa');
  });

  it('judges a restyle against the tokens the form already has', () => {
    // A restyle merges over the FORM's palette, not the house one, so a token the author tuned in
    // the Design tab is what the model's change is checked against — and what survives it.
    // A complete dark palette, as the Design tab would have left it. `--mjf-card-bg` is set too:
    // leaving it at the house white while darkening the page is itself a contrast failure, and the
    // gate correctly repairs that — which is the whole point of judging the merged map.
    const authored = {
      ...DEFAULT_FORM_THEME,
      '--mjf-page-bg': '#101010',
      '--mjf-card-bg': '#181818',
      '--mjf-page-ink': '#f5f5f5',
    };
    const result = validateTheme({ cssVariables: { '--mjf-accent': '#4477dd' } }, authored);
    expect(result.cssVariables['--mjf-page-bg']).toBe('#101010');
    expect(result.cssVariables['--mjf-card-bg']).toBe('#181818');
    expect(result.cssVariables['--mjf-page-ink']).toBe('#f5f5f5');
    expect(result.cssVariables['--mjf-accent']).toBe('#4477dd');
    expect(result.repairedTokens).toEqual([]);
  });
});

describe('validateTheme — the accent is a background, so it never moves', () => {
  /**
   * THE BUG THIS GUARDS. The accent/page pair listed `--mjf-accent` as its INK, so a pale accent
   * on a pale page was "repaired" to near-black — discarding the brand colour the brief asked for,
   * leaving `--mjf-accent-strong` pastel so hover became a different colour, and silently breaking
   * the on-accent pair that had already been checked against the OLD accent and passed.
   *
   * The function's own invariant is "the INK moves, never the background", and button labels sit
   * on the accent, so the accent is a background. It is reported now, not repaired.
   */
  it('leaves a low-contrast accent alone and says so', () => {
    const pastel = {
      '--mjf-page-bg': '#FFF8F0',
      '--mjf-card-bg': '#FFFFFF',
      '--mjf-page-ink': '#3A2A1E',
      '--mjf-accent': '#F7C8A0',
      '--mjf-accent-strong': '#E8A87C',
      '--mjf-on-accent': '#3A2A1E',
    };
    expect(ratio('#F7C8A0', '#FFF8F0')).toBeLessThan(3);

    const result = validateTheme({ cssVariables: pastel }, DEFAULT_FORM_THEME);

    expect(result.cssVariables['--mjf-accent']).toBe('#F7C8A0');
    expect(result.repairedTokens).not.toContain('--mjf-accent');
    expect(result.unreadablePairs.join(' ')).toContain('--mjf-accent');
  });

  it('keeps the button label readable on the accent it kept', () => {
    // The pair that the old repair silently broke: on-accent was judged against the accent, passed,
    // and was then left sitting on a completely different colour.
    const pastel = {
      '--mjf-page-bg': '#FFF8F0',
      '--mjf-accent': '#F7C8A0',
      '--mjf-on-accent': '#3A2A1E',
    };
    const result = validateTheme({ cssVariables: pastel }, DEFAULT_FORM_THEME);
    expect(
      ratio(result.cssVariables['--mjf-on-accent'], result.cssVariables['--mjf-accent']),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('validateTheme — a colour it cannot read is stripped, not skipped', () => {
  /**
   * THE BUG THIS GUARDS. `parseCssColor` handles hex and falls back to "take the first three
   * numbers", so `hsl(210 50% 40%)` is read as the RGB triple 210,50,40 — a confident wrong
   * verdict — and `navy` or `var(--brand)` yields fewer than three numbers, comes back undefined,
   * and makes `enforceReadability` SKIP that pair entirely. The theme schema is
   * `z.record(z.string())`, so nothing stopped any of them arriving.
   *
   * Skipping got much worse when the gate started judging the merged palette: one unreadable value
   * silently removes a pair from a check that is now supposed to cover every pair. A value the
   * gate cannot judge is stripped instead, so the house default applies and the pair IS checked —
   * and the strip is reported, which is how an operator sees a prompt drifting.
   */
  it('strips a named colour and falls back to the house value', () => {
    const result = validateTheme({ cssVariables: { '--mjf-page-bg': 'navy' } }, DEFAULT_FORM_THEME);
    expect(result.strippedTokens).toContain('--mjf-page-bg');
    expect(result.cssVariables['--mjf-page-bg']).toBe(DEFAULT_FORM_THEME['--mjf-page-bg']);
  });

  it('strips an hsl() it would otherwise misread as rgb', () => {
    const result = validateTheme(
      { cssVariables: { '--mjf-accent': 'hsl(210 50% 40%)' } },
      DEFAULT_FORM_THEME,
    );
    expect(result.strippedTokens).toContain('--mjf-accent');
  });

  it('keeps rgb() and hex, which it reads correctly', () => {
    const result = validateTheme(
      { cssVariables: { '--mjf-accent': 'rgb(26, 29, 33)', '--mjf-card-bg': '#FFF' } },
      DEFAULT_FORM_THEME,
    );
    expect(result.strippedTokens).toEqual([]);
    expect(result.cssVariables['--mjf-accent']).toBe('rgb(26, 29, 33)');
  });

  it('leaves font stacks alone — they are not colours', () => {
    const result = validateTheme(
      { cssVariables: { '--mjf-font-body': "'Inter', system-ui, sans-serif" } },
      DEFAULT_FORM_THEME,
    );
    expect(result.strippedTokens).toEqual([]);
    expect(result.cssVariables['--mjf-font-body']).toBe("'Inter', system-ui, sans-serif");
  });
});

describe('validateTheme — the non-text bar is 3:1, not 4.5:1', () => {
  /**
   * WCAG 1.4.11 holds a non-text element — a button fill, a focus ring — to 3:1, while body text
   * is held to 4.5:1. `--mjf-accent` on the page is the non-text pair, and nothing pinned which
   * bar it uses: raising the constant to 4.5 left every test in this file green, which would have
   * started reporting perfectly conformant brand colours as unreadable.
   */
  it('accepts an accent between 3:1 and 4.5:1 against the page', () => {
    // #767676 on white is 4.54:1; #949494 is 3.06:1 — over the non-text bar, under the text one.
    const result = validateTheme(
      { cssVariables: { '--mjf-accent': '#949494', '--mjf-page-bg': '#ffffff' } },
      { '--mjf-page-ink': '#1a1d21' },
    );

    expect(result.unreadablePairs).not.toContain('--mjf-accent on --mjf-page-bg');
  });

  it('reports an accent that cannot even clear the non-text bar', () => {
    // #d8d8d8 on white is 1.37:1 — a button nobody can find.
    const result = validateTheme(
      { cssVariables: { '--mjf-accent': '#d8d8d8', '--mjf-page-bg': '#ffffff' } },
      { '--mjf-page-ink': '#1a1d21' },
    );

    expect(result.unreadablePairs).toContain('--mjf-accent on --mjf-page-bg');
  });
});

describe('validateTheme — two pairs that repair the same token', () => {
  /**
   * `--mjf-page-ink` is the repair target of BOTH the page pair and the card pair. The page pair
   * moves it to suit a dark page, the card pair moves it back to suit the light card, and the page
   * pair never re-checks — so the form rendered body text at 1.05:1 while the author was told the
   * theme applied cleanly. Reporting it is the fix; one ink genuinely cannot serve two backgrounds
   * that far apart, and inventing a third value is not this gate's job.
   */
  it('reports the pair that the LAST repair broke, rather than the one it fixed', () => {
    const result = validateTheme(
      { cssVariables: { '--mjf-page-bg': '#111827' } },
      DEFAULT_FORM_THEME,
    );

    expect(result.unreadablePairs).toContain('--mjf-page-ink on --mjf-page-bg');
  });

  it('still says nothing is unreadable when one ink genuinely serves both', () => {
    // A light page and the default light card: one dark ink reads on both, nothing to report.
    const result = validateTheme(
      { cssVariables: { '--mjf-page-bg': '#ffffff' } },
      DEFAULT_FORM_THEME,
    );

    expect(result.unreadablePairs).toEqual([]);
  });
});
