import { describe, it, expect } from 'vitest';

import { contrastRatio, inkRepair, parseCssColor, readableInk } from './readable-ink';

describe('parseCssColor', () => {
  it('reads the two shapes getComputedStyle actually returns', () => {
    expect(parseCssColor('rgb(160, 39, 39)')).toEqual([160, 39, 39]);
    expect(parseCssColor('color(srgb 0.360784 0.414275 0.651608)')).toEqual([92, 106, 166]);
  });

  it('reads hex, which is what the Design tab actually stores', () => {
    expect(parseCssColor('#a02727')).toEqual([160, 39, 39]);
    expect(parseCssColor('#A02727')).toEqual([160, 39, 39]);
    expect(parseCssColor('#abc')).toEqual([170, 187, 204]);
  });
});

describe('readableInk', () => {
  it('keeps the author ink when it is legible', () => {
    // Near-black on white: nothing to fix.
    expect(readableInk([255, 255, 255], [26, 29, 33])).toEqual([26, 29, 33]);
  });

  it('rescues an illegible pairing', () => {
    // The real case: the author picked blue ink and a deep red page. 2.09:1.
    const fixed = readableInk([160, 39, 39], [60, 137, 226]);

    expect(contrastRatio([160, 39, 39], fixed)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('inkRepair', () => {
  const white = [255, 255, 255] as const;
  const red = [255, 0, 0] as const;

  it('never touches a colour the author chose, however unreadable', () => {
    // Red on white is 4.0:1 — under AA, and exactly what an author picking a brand red gets.
    // Silently swapping it for near-black is indistinguishable from the control being broken,
    // which is precisely how it was reported. A deliberate choice is honoured and flagged, not
    // overridden; see the contrast warning in the Design panel.
    expect(contrastRatio(white, red)).toBeLessThan(4.5);
    expect(inkRepair(white, red, true)).toBeNull();
  });

  it('repairs an unreadable ink the author never set', () => {
    // The case the guard exists for: the author themed the BACKGROUND — the deep red from the
    // real form — the ink is still the widget's near-black default, and the pair collides at
    // 1.9:1. Nobody chose that, so repairing it overrides no one.
    const maroon = [139, 26, 26] as const;
    const defaultInk = [26, 29, 33] as const;
    expect(contrastRatio(maroon, defaultInk)).toBeLessThan(4.5);
    expect(inkRepair(maroon, defaultInk, false)).toEqual([255, 255, 255]);
  });

  it('leaves a default ink alone when it already passes', () => {
    expect(inkRepair(white, [26, 29, 33], false)).toBeNull();
  });
});
