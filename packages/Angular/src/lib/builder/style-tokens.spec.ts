import { describe, it, expect } from 'vitest';
import {
  BRAND_TOKENS,
  RADIUS_TOKENS,
  serializeCssVariables,
  readBrandToken,
  withBrandToken,
  readRadiusPx,
  withRadiusPx,
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

describe('radius tokens', () => {
  it('sets all four radius tokens together to keep rounding coherent', () => {
    const map = JSON.parse(withRadiusPx(PRESET, 16));
    for (const token of RADIUS_TOKENS) {
      expect(map[token]).toBe('16px');
    }
    expect(map['--mjf-accent']).toBe('#1f5d4c'); // other tokens preserved
  });

  it('reads the card radius back as a number, 0 when unset/invalid', () => {
    expect(readRadiusPx(withRadiusPx(PRESET, 22))).toBe(22);
    expect(readRadiusPx(PRESET)).toBe(0);
    expect(readRadiusPx(null)).toBe(0);
  });
});
