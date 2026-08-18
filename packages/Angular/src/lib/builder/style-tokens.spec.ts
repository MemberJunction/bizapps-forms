import { describe, it, expect } from 'vitest';
import {
  BRAND_TOKENS,
  BUTTON_RADIUS_TOKEN,
  serializeCssVariables,
  cssColorToHex,
  readBrandToken,
  withBrandToken,
  readButtonRadiusPx,
  withButtonRadiusPx,
} from './style-tokens';

const PRESET = JSON.stringify({
  '--mjf-accent': '#1f5d4c',
  '--mjf-accent-strong': '#164437',
  '--mj-text-primary': '#1a1815',
});

describe('readBrandToken', () => {
  it('reads an existing token', () => {
    expect(readBrandToken(PRESET, BRAND_TOKENS.primary)).toBe('#1f5d4c');
  });

  it('returns empty string for a missing token or blank/invalid JSON', () => {
    expect(readBrandToken(PRESET, '--nope')).toBe('');
    expect(readBrandToken(null, BRAND_TOKENS.primary)).toBe('');
    expect(readBrandToken('', BRAND_TOKENS.primary)).toBe('');
    expect(readBrandToken('{not json', BRAND_TOKENS.primary)).toBe('');
  });
});

describe('withBrandToken', () => {
  it('sets a token while preserving the others', () => {
    const next = withBrandToken(PRESET, BRAND_TOKENS.primary, '#ff0000');
    const map = JSON.parse(next);
    expect(map['--mjf-accent']).toBe('#ff0000');
    expect(map['--mjf-accent-strong']).toBe('#164437');
    expect(map['--mj-text-primary']).toBe('#1a1815');
  });

  it('trims whitespace on the written value', () => {
    const map = JSON.parse(withBrandToken(PRESET, BRAND_TOKENS.primary, '  #abc123  '));
    expect(map['--mjf-accent']).toBe('#abc123');
  });

  it('removes a token when the value is blank, leaving the rest intact', () => {
    const map = JSON.parse(withBrandToken(PRESET, BRAND_TOKENS.primary, '   '));
    expect('--mjf-accent' in map).toBe(false);
    expect(map['--mjf-accent-strong']).toBe('#164437');
  });

  it('starts from an empty map when CSSVariables is null', () => {
    const map = JSON.parse(withBrandToken(null, BRAND_TOKENS.primary, '#123456'));
    expect(map).toEqual({ '--mjf-accent': '#123456' });
  });

  it('is pure — round-trips through serializeCssVariables', () => {
    const map = { '--mjf-accent': '#111' };
    const serialized = serializeCssVariables(map);
    expect(JSON.parse(serialized)).toEqual(map);
  });

  it('writes the expanded tokens (page/card bg, fonts) added for the theme editor', () => {
    let css: string | null = null;
    css = withBrandToken(css, BRAND_TOKENS.pageBg, '#faf8f4');
    css = withBrandToken(css, BRAND_TOKENS.cardBg, '#ffffff');
    css = withBrandToken(css, BRAND_TOKENS.fontBody, "'Inter', sans-serif");
    const map = JSON.parse(css);
    expect(map['--mjf-page-bg']).toBe('#faf8f4');
    expect(map['--mjf-card-bg']).toBe('#ffffff');
    expect(map['--mjf-font-body']).toBe("'Inter', sans-serif");
  });
});

describe('button radius', () => {
  it('sets the button radius and nothing else', () => {
    // Deliberately narrow. This used to set card, input and choice radius too, so an
    // author rounding the buttons silently rounded every text field and card on the form.
    const map = JSON.parse(withButtonRadiusPx(PRESET, 16));
    expect(map[BUTTON_RADIUS_TOKEN]).toBe('16px');
    for (const collateral of ['--mjf-card-radius', '--mjf-input-radius', '--mjf-choice-radius']) {
      expect(map[collateral]).toBeUndefined();
    }
    expect(map['--mjf-accent']).toBe('#1f5d4c'); // other tokens preserved
  });

  it('reads the button radius back as a number, 0 when unset/invalid', () => {
    expect(readButtonRadiusPx(withButtonRadiusPx(PRESET, 22))).toBe(22);
    expect(readButtonRadiusPx(PRESET)).toBe(0);
    expect(readButtonRadiusPx(null)).toBe(0);
  });
});

describe('cssColorToHex', () => {
  it('passes six-digit hex through, lowercased', () => {
    expect(cssColorToHex('#AABBCC')).toBe('#aabbcc');
  });

  it('expands three-digit hex', () => {
    expect(cssColorToHex('#0af')).toBe('#00aaff');
  });

  it('converts the rgb() a browser reports for a plain colour', () => {
    expect(cssColorToHex('rgb(47, 91, 234)')).toBe('#2f5bea');
    expect(cssColorToHex('rgba(47, 91, 234, 0.5)')).toBe('#2f5bea');
  });

  it('converts the color(srgb ...) a browser reports for a color-mix()', () => {
    // Several widget defaults are color-mix values. Without this the swatch for a mixed
    // colour fell back to black and claimed the form was black.
    expect(cssColorToHex('color(srgb 0.88 0.9355 0.9656)')).toBe('#e0eff6');
    expect(cssColorToHex('color(srgb 0 0 0)')).toBe('#000000');
    expect(cssColorToHex('color(srgb 1 1 1)')).toBe('#ffffff');
  });

  it('clamps out-of-gamut components rather than emitting nonsense', () => {
    expect(cssColorToHex('color(srgb 1.4 -0.2 0.5)')).toBe('#ff0080');
  });

  it('returns empty for anything it cannot read, rather than inventing a colour', () => {
    // An unresolved custom property reports as its declared text; guessing here would show
    // the author a colour the form does not use.
    expect(cssColorToHex('var(--mjf-accent-soft)')).toBe('');
    expect(cssColorToHex('')).toBe('');
    expect(cssColorToHex('transparent')).toBe('');
  });
});
