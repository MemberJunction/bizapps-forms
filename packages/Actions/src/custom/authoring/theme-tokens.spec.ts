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
    const result = validateTheme({ cssVariables: authored });
    expect(result.strippedTokens).toEqual([]);
    expect(Object.keys(result.cssVariables).sort()).toEqual([...THEME_TOKEN_NAMES].sort());
  });

  it('strips an invented token, and NAMES it', () => {
    // `applyStyleTokens` writes any `--` key onto the host, so an invented one is applied, read by
    // nothing, and indistinguishable in the database from a token that works.
    const result = validateTheme({
      cssVariables: { '--mjf-accent': '#0055aa', '--mjf-vibe': 'cosy', '--mjf-border-glow': '2px' },
    });
    expect(result.cssVariables['--mjf-vibe']).toBeUndefined();
    expect(result.strippedTokens.sort()).toEqual(['--mjf-border-glow', '--mjf-vibe']);
  });

  it('strips a blank value rather than persisting an empty custom property', () => {
    const result = validateTheme({ cssVariables: { '--mjf-accent': '   ' } });
    expect(result.cssVariables['--mjf-accent']).toBeUndefined();
    expect(result.strippedTokens).toEqual(['--mjf-accent']);
  });

  it('trims a value the model padded', () => {
    expect(validateTheme({ cssVariables: { '--mjf-accent': '  #0055aa ' } }).cssVariables['--mjf-accent']).toBe(
      '#0055aa',
    );
  });
});

describe('validateTheme — readability', () => {
  it('corrects a deliberately unreadable ink to AA', () => {
    // Near-black ink on a near-black page: present, correctly themed, and unreadable — which is
    // exactly the class of theme this gate exists for.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#1c1c1c', '--mjf-page-ink': '#2a2a2a' },
    });
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
    });
    expect(result.repairedTokens).toContain('--mjf-page-ink');
    expect(result.unreadablePairs).toEqual(['--mjf-page-ink on --mjf-page-bg']);
    // Still improved to the best available, rather than left as authored.
    expect(ratio(result.cssVariables['--mjf-page-ink'], '#777777')).toBeGreaterThan(4);
  });

  it('leaves a readable pair exactly as the model authored it', () => {
    // An ink that clears the bar is used as authored — the gate protects the respondent, it does
    // not impose taste.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#ffffff', '--mjf-page-ink': '#1a1d21' },
    });
    expect(result.repairedTokens).toEqual([]);
    expect(result.cssVariables['--mjf-page-ink']).toBe('#1a1d21');
  });

  it('fixes button label text on a saturated brand colour', () => {
    // The pairing most often got wrong: a strong accent looks confident and reads terribly.
    const result = validateTheme({
      cssVariables: { '--mjf-accent': '#ffcc00', '--mjf-on-accent': '#ffffff' },
    });
    expect(result.repairedTokens).toContain('--mjf-on-accent');
    expect(ratio(result.cssVariables['--mjf-on-accent'], '#ffcc00')).toBeGreaterThanOrEqual(4.5);
  });

  it('holds the accent to the LARGE-ELEMENT bar, not the body-text one', () => {
    // A button is not body text. Judging it at 4.5:1 would reject brand colours that are perfectly
    // visible, which is how an accessibility gate ends up being switched off.
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#ffffff', '--mjf-accent': '#3aa76a' },
    });
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
    });
    expect(result.cssVariables['--mjf-page-bg']).toBe('#8b0000');
    expect(result.cssVariables['--mjf-page-ink']).not.toBe('#7a0000');
  });

  it('does not second-guess a pair whose other half the theme left unset', () => {
    // An unset token falls back to a widget default, and the widget's own render-time guard judges
    // the FULLY RESOLVED colours. Guessing from here means judging a pairing that may not render.
    const result = validateTheme({ cssVariables: { '--mjf-page-ink': '#eeeeee' } });
    expect(result.repairedTokens).toEqual([]);
    expect(result.unreadablePairs).toEqual([]);
    expect(result.cssVariables['--mjf-page-ink']).toBe('#eeeeee');
  });

  it('ignores a value it cannot parse rather than replacing it with a guess', () => {
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': 'var(--something-else)', '--mjf-page-ink': '#888888' },
    });
    expect(result.repairedTokens).toEqual([]);
  });

  it('leaves font stacks alone — they are not colours', () => {
    const stack = "'Inter', system-ui, sans-serif";
    const result = validateTheme({ cssVariables: { '--mjf-font-body': stack } });
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
    });
    expect(result.unreadablePairs).toEqual(['--mjf-on-accent on --mjf-accent']);
    expect(result.repairedTokens).toEqual([]);
    // And the authored value is left exactly as it was, rather than rewritten to an equal colour.
    expect(result.cssVariables['--mjf-on-accent']).toBe('rgb(255, 255, 255)');
  });

  it('still reports a genuine repair', () => {
    const result = validateTheme({
      cssVariables: { '--mjf-page-bg': '#1c1c1c', '--mjf-page-ink': '#2a2a2a' },
    });
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
