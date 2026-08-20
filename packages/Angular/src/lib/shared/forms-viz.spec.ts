/**
 * The palette's documented properties, enforced.
 *
 * `forms-viz.ts` makes three measured claims — every hue clears 3:1 against every MJ
 * surface in both themes, no two NEIGHBOURING categories are perceptually close, and the
 * rotation covers all eight. Those are the reasons the palette is safe to use as-is in
 * dark mode and safe to put in adjacent bars. A comment asserting them rots the first time
 * someone tweaks a hex; these fail the build instead.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMS_VIZ_CSS,
  FORMS_VIZ_TOKENS,
  VIZ_SERIES_LENGTH,
  VIZ_SERIES_ROTATION,
  vizSeriesClass,
} from './forms-viz';

/** The hex a `--mjf-viz-N` token is defined as, read out of the CSS the component ships. */
function paletteHex(n: number): string {
  const m = new RegExp(`--mjf-viz-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(FORMS_VIZ_TOKENS);
  if (!m) throw new Error(`--mjf-viz-${n} is not defined as a hex literal`);
  return m[1];
}

const PALETTE = Array.from({ length: VIZ_SERIES_LENGTH }, (_, i) => paletteHex(i + 1));

/**
 * MJ's real surface values, resolved through `_tokens.scss`:
 * light `--mj-bg-surface` = neutral-0, light `--mj-bg-surface-sunken` = neutral-100,
 * dark `--mj-bg-surface` = neutral-800, dark `--mj-bg-surface-sunken` = neutral-950.
 * Sunken is the one that matters most — it is what every bar TRACK is filled with.
 */
const MJ_SURFACES: Record<string, string> = {
  'light surface': '#ffffff',
  'light sunken': '#f1f5f9',
  'dark surface': '#1e293b',
  'dark sunken': '#020617',
};

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** CIE76 ΔE — enough to tell "these two bars look the same" from "they do not". */
function deltaE(a: string, b: string): number {
  const toLab = (hex: string): [number, number, number] => {
    const [r, g, bl] = channels(hex).map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + bl * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe('the palette is usable as a fill on every MJ surface', () => {
  // WCAG 1.4.11: a graphic carrying meaning needs 3:1 against what it sits on. This is the
  // claim that lets the palette ship with NO dark-mode variant — if it stops holding, the
  // fix is a dark block in FORMS_VIZ_TOKENS, not a smaller number here.
  for (const [surface, bg] of Object.entries(MJ_SURFACES)) {
    it(`clears 3:1 against ${surface}`, () => {
      for (const [i, hex] of PALETTE.entries()) {
        expect(
          contrastRatio(hex, bg),
          `--mjf-viz-${i + 1} (${hex}) on ${surface} (${bg})`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('is never bright enough to be used as text on a light surface', () => {
    // Not a nice-to-have: this is why `forms-viz.ts` forbids `color:`. If a future hue DID
    // clear 4.5, the rule would still hold for the other seven, so the honest thing is to
    // keep the prohibition absolute and let this test say why.
    for (const hex of PALETTE) {
      expect(contrastRatio(hex, '#ffffff')).toBeLessThan(4.5);
    }
  });
});

describe('categories that sit next to each other look different', () => {
  it('keeps every neighbouring pair in the rotation perceptually apart', () => {
    // 65.2 is what the chosen order measures; 60 leaves room for a hue tweak without
    // pinning the test to one exact permutation. Palette order scores 28.5 and fails.
    for (let i = 0; i + 1 < VIZ_SERIES_ROTATION.length; i++) {
      const a = paletteHex(VIZ_SERIES_ROTATION[i]);
      const b = paletteHex(VIZ_SERIES_ROTATION[i + 1]);
      expect(
        deltaE(a, b),
        `rotation positions ${i} and ${i + 1} (--mjf-viz-${VIZ_SERIES_ROTATION[i]} vs --mjf-viz-${VIZ_SERIES_ROTATION[i + 1]})`,
      ).toBeGreaterThan(60);
    }
  });

  it('beats plain palette order, which is the reason it exists', () => {
    const minAdjacent = (order: readonly number[]): number =>
      Math.min(...order.slice(1).map((n, i) => deltaE(paletteHex(order[i]), paletteHex(n))));
    const paletteOrder = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(minAdjacent(VIZ_SERIES_ROTATION)).toBeGreaterThan(minAdjacent(paletteOrder) * 2);
  });
});

describe('assigning a colour to the nth category', () => {
  it('uses all eight hues before repeating any', () => {
    const first8 = Array.from({ length: 8 }, (_, i) => vizSeriesClass(i));
    expect(new Set(first8).size).toBe(8);
  });

  it('wraps rather than running out', () => {
    expect(vizSeriesClass(8)).toBe(vizSeriesClass(0));
    expect(vizSeriesClass(17)).toBe(vizSeriesClass(1));
  });

  it('rejects an index that is not a category position', () => {
    expect(() => vizSeriesClass(-1)).toThrow(/non-negative integer/);
    expect(() => vizSeriesClass(1.5)).toThrow(/non-negative integer/);
  });

  it('names a class the shipped CSS actually defines', () => {
    // The two halves live in separate exports; a class returned here but never given a
    // rule renders as the default grey and looks like a data bug, not a styling one.
    for (let i = 0; i < VIZ_SERIES_LENGTH; i++) {
      expect(FORMS_VIZ_CSS).toContain(`.${vizSeriesClass(i)} {`);
    }
  });
});

describe('the role aliases', () => {
  it('resolve to palette entries rather than to literals of their own', () => {
    for (const role of ['series', 'positive', 'negative', 'caution', 'neutral']) {
      expect(FORMS_VIZ_TOKENS).toMatch(
        new RegExp(`--mjf-viz-${role}:\\s*var\\(--mjf-viz-[1-8]\\)`),
      );
    }
  });

  it('has a class for each, so a chart can name meaning instead of a number', () => {
    for (const role of ['series', 'positive', 'negative', 'caution', 'neutral']) {
      expect(FORMS_VIZ_CSS).toMatch(new RegExp(`\\.mjf-viz-${role}\\s`));
    }
  });
});
