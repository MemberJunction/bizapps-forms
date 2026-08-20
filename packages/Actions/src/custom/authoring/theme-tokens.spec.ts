import { describe, it, expect } from 'vitest';
import { contrastRatio, parseCssColor } from '@mj-biz-apps/forms-entities';
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
