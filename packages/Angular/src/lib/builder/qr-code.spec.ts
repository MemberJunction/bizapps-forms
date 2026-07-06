import { describe, it, expect } from 'vitest';
import { generateQrMatrix, qrMatrixToSvg, textToQrSvg } from './qr-code';

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
    expect(svg).toContain('var(--mj-text-primary');
    expect(svg).toContain('var(--mj-bg-surface');
    // No external resource loads (the only http reference is the SVG xmlns).
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('src=');
    expect(svg).not.toMatch(/url\(/);
  });

  it('textToQrSvg is a convenience wrapper', () => {
    expect(textToQrSvg('abc').startsWith('<svg')).toBe(true);
  });
});
