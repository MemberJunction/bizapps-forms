import { describe, it, expect } from 'vitest';
import { generateQrMatrix, qrMatrixToSvg, textToQrSvg } from './qr-code';
import { decodeQr } from '../shared/testing/qr-decode';

describe('generateQrMatrix', () => {
  it('produces a square matrix whose size is 17 + 4*version', () => {
    const m = generateQrMatrix('https://forms.example.com/f/abc');
    // size must be of the form 21, 25, 29, ... (version 1+)
    expect((m.size - 17) % 4).toBe(0);
    expect(m.modules).toHaveLength(m.size);
    expect(m.modules[0]).toHaveLength(m.size);
  });

  it('places the three finder patterns (7x7 dark border, light separator)', () => {
    const m = generateQrMatrix('hello');
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, m.size - 7],
      [m.size - 7, 0],
    ];
    for (const [top, left] of corners) {
      // Outer ring corner is dark; the inner ring (1,1 offset) is light.
      expect(m.modules[top][left]).toBe(true);
      expect(m.modules[top + 1][left + 1]).toBe(false);
      // 3x3 core center is dark.
      expect(m.modules[top + 3][left + 3]).toBe(true);
    }
  });

  it('is deterministic for the same payload', () => {
    const a = generateQrMatrix('repeatable');
    const b = generateQrMatrix('repeatable');
    expect(a.modules).toEqual(b.modules);
  });

  it('grows the version as the payload grows', () => {
    const small = generateQrMatrix('a');
    const large = generateQrMatrix('x'.repeat(120));
    expect(large.size).toBeGreaterThan(small.size);
  });

  it('throws when the payload exceeds the supported capacity', () => {
    expect(() => generateQrMatrix('z'.repeat(400))).toThrow();
  });
});

describe('qrMatrixToSvg', () => {
  it('emits a self-contained svg with token colors and no external resource loads', () => {
    const svg = qrMatrixToSvg(generateQrMatrix('abc'));
    expect(svg.startsWith('<svg')).toBe(true);
    // Deliberately the QR-specific tokens, not the theme's text/surface pair: those two
    // swap in dark mode and produce an inverted, often-unscannable code.
    expect(svg).toContain('var(--mjf-qr-dark');
    expect(svg).toContain('var(--mjf-qr-light');
    expect(svg).not.toContain('--mj-text-primary');
    expect(svg).not.toContain('--mj-bg-surface');
    // No external resource loads (the only http reference is the SVG xmlns).
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('src=');
    expect(svg).not.toMatch(/url\(/);
  });

  it('textToQrSvg is a convenience wrapper', () => {
    expect(textToQrSvg('abc').startsWith('<svg')).toBe(true);
  });
});

/**
 * The tests above assert SHAPE — square, finder patterns present, deterministic, grows
 * with the payload. Every one of them passed while the generator was emitting codes that
 * no scanner could read, because mask 0 was being applied over the alignment pattern and
 * inverting it into a checkerboard. Shape is not the contract; scanning is.
 *
 * These two cover the contract from both sides: the data reads back, AND the fixed
 * geometry a scanner locks onto is intact.
 */
describe('the code a scanner actually sees', () => {
  const urls = [
    'hello',                                          // v1 — no alignment pattern at all
    'http://localhost:4000/f/careers-poster-qr',      // v3 — one alignment pattern
    'https://forms.example.com/f/ats-application',    // v4
    `https://forms.example.com/f/${'a'.repeat(60)}`,  // v6 — multi-block interleave
  ];

  it.each(urls)('round-trips %s through an independent decoder', (url) => {
    const decoded = decodeQr(generateQrMatrix(url));
    expect(decoded.text).toBe(url);
  });

  it.each(urls)('declares the mask it actually applied for %s', (url) => {
    // A code whose format bits disagree with its masking is unreadable even when the
    // data is perfect, and nothing else here would notice.
    expect(decodeQr(generateQrMatrix(url)).mask).toBe(0);
  });

  it('leaves every alignment pattern intact', () => {
    // The exact regression: alignment patterns are function modules, so the mask must
    // skip them. Version 3+ has one at (22,22); v1 has none, which is why a short test
    // payload hid this for the whole life of the feature.
    const m = generateQrMatrix('http://localhost:4000/f/careers-poster-qr');
    const centres = [22];
    for (const r of centres) {
      for (const c of centres) {
        const rows: string[] = [];
        for (let dr = -2; dr <= 2; dr++) {
          let line = '';
          for (let dc = -2; dc <= 2; dc++) line += m.modules[r + dr][c + dc] ? '#' : '.';
          rows.push(line);
        }
        expect(rows).toEqual(['#####', '#...#', '#.#.#', '#...#', '#####']);
      }
    }
  });

  it('keeps the dark module set — it is spec-fixed and must never be masked', () => {
    const m = generateQrMatrix('http://localhost:4000/f/careers-poster-qr');
    expect(m.modules[m.size - 8][8]).toBe(true);
  });
});
