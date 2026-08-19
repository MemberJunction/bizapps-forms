import { describe, it, expect } from 'vitest';

import { contrastRatio, parseCssColor, readableInk } from './readable-ink';

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
