import { describe, expect, it } from 'vitest';

import {
  PRESET_SWATCHES,
  hexToHsv,
  hsvToHex,
  isCompleteHex,
  normalizeHexInput,
  sanitizeHexInput,
} from './color-model';

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

describe('sanitizeHexInput', () => {
  it('keeps a partial entry as typed so the field does not fight the typist', () => {
    // Every six-digit code passes through five incomplete prefixes on the way. Rewriting the
    // box mid-keystroke is what makes a hex field impossible to type into.
    expect(sanitizeHexInput('#15')).toBe('#15');
    // Three characters is the prefix that used to be rewritten: '#1a2' became '#11aa22', which
    // was emitted as a colour and then swallowed the three keystrokes still to come. A prefix is
    // not shorthand while it is still being typed — only the caller knows which one it is.
    expect(sanitizeHexInput('#1a2')).toBe('#1a2');
    expect(isCompleteHex('#1a2')).toBe(false);
  });

  it('lets a six-digit code be typed one character at a time', () => {
    // Issue #154's reproduction table, as an assertion. The box must read back exactly what was
    // typed at every keystroke, and the colour must leave exactly once, at the sixth digit.
    const keystrokes = ['#', '#1', '#1a', '#1a2', '#1a2b', '#1a2b3', '#1a2b3c'];
    expect(keystrokes.map(sanitizeHexInput)).toEqual(keystrokes);

    const emitted = keystrokes.map(sanitizeHexInput).filter(isCompleteHex);
    // Typing and pasting land on the same colour — the whole point of the split.
    expect(emitted).toEqual([normalizeHexInput('#1a2b3c')]);
  });

  it('leaves an emptied field empty instead of putting the # back', () => {
    // normalizeHexInput answers '#' here, so clearing the box re-inserted a character the author
    // had just deleted, and the next '#' they typed made '##'.
    expect(sanitizeHexInput('')).toBe('');
    expect(sanitizeHexInput('   ')).toBe('');
    expect(sanitizeHexInput('#')).toBe('#');
    expect(sanitizeHexInput('##')).toBe('#');
  });

  it('drops what cannot be part of a hex code, and stops at six digits', () => {
    expect(sanitizeHexInput('#12zz34')).toBe('#1234');
    expect(sanitizeHexInput('152A63')).toBe('#152a63');
    expect(sanitizeHexInput('#1a2b3c4d')).toBe('#1a2b3c');
  });
});

describe('normalizeHexInput — the commit-time half', () => {
  it('accepts what people actually type', () => {
    expect(normalizeHexInput('152A63')).toBe('#152a63');
    expect(normalizeHexInput('#152A63')).toBe('#152a63');
    expect(normalizeHexInput('  #abc  ')).toBe('#aabbcc');
  });

  it('resolves shorthand, which is why it may only run once the entry is finished', () => {
    // The same three characters, two meanings. This is the fork the old single function could not
    // see, because the answer is not in the string — it is in which caller is asking.
    expect(sanitizeHexInput('#abc')).toBe('#abc');
    expect(normalizeHexInput('#abc')).toBe('#aabbcc');
  });

  it('leaves an unfinishable partial incomplete, so the caller can snap it back', () => {
    expect(normalizeHexInput('#15')).toBe('#15');
    expect(isCompleteHex('#15')).toBe(false);
    expect(isCompleteHex('#152a63')).toBe(true);
  });

  it('drops characters that cannot be part of a hex code', () => {
    expect(normalizeHexInput('#12zz34')).toBe('#1234');
  });
});
