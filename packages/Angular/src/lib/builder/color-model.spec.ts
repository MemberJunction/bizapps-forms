import { describe, expect, it } from 'vitest';

import { PRESET_SWATCHES, hexToHsv, hsvToHex, isCompleteHex, normalizeHexInput } from './color-model';

describe('hexToHsv / hsvToHex', () => {
  it('round-trips every preset the picker offers', () => {
    // A picker whose own swatches drift when you open and close it is worse than no picker.
    for (const hex of PRESET_SWATCHES) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('reads the primaries at full saturation and value', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
  });

  it('keeps the hue of a greyscale colour rather than snapping it to red', () => {
    // Dragging value to zero must not throw the hue away, or the ring jumps back to red and the
    // author loses the colour they were half-way through choosing.
    const black = hexToHsv('#000000');
    expect(black.v).toBe(0);
    expect(hsvToHex({ ...black, v: 1, s: 1 })).toBe('#ff0000');
  });

  it('clamps out-of-range input instead of emitting a broken hex', () => {
    expect(hsvToHex({ h: 400, s: 2, v: -1 })).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('normalizeHexInput', () => {
  it('accepts what people actually type', () => {
    expect(normalizeHexInput('152A63')).toBe('#152a63');
    expect(normalizeHexInput('#152A63')).toBe('#152a63');
    expect(normalizeHexInput('  #abc  ')).toBe('#aabbcc');
  });

  it('keeps a partial entry as typed so the field does not fight the typist', () => {
    // Every six-digit code passes through five incomplete prefixes on the way. Rewriting the
    // box mid-keystroke is what makes a hex field impossible to type into.
    expect(normalizeHexInput('#15')).toBe('#15');
    expect(isCompleteHex('#15')).toBe(false);
    expect(isCompleteHex('#152a63')).toBe(true);
  });

  it('drops characters that cannot be part of a hex code', () => {
    expect(normalizeHexInput('#12zz34')).toBe('#1234');
  });
});
