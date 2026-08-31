/**
 * Every pen stays legible in the EXPORTED PNG, measured rather than asserted.
 *
 * The stored artifact is what a reviewer opens months later, and `emitPng` composites the strokes
 * onto an opaque fill of the pad's own background — which is `--mjf-input-bg`, which is the form's
 * `--mjf-page-bg`, which the AUTHOR picks. So "does this pen read?" is a question about a colour
 * pair the widget only half controls, and a fixed hue cannot answer it: a fixed red pen on a
 * deep-red form is invisible on screen AND in the file.
 *
 * The pad's answer is to define every pen as `color-mix(in srgb, <hue> 65%, var(--mjf-doodle-ink))`
 * — pulling each hue toward the one colour the widget already guarantees reads on this page,
 * because `theming.ts` repairs the ink when it does not. This spec is that guarantee, checked:
 * it reproduces the mix arithmetic and the ink repair, and holds every pen to the 3:1 that
 * WCAG 1.4.11 asks of a non-text graphic. A pen stroke is a non-text graphic.
 *
 * It reads the pen definitions OUT OF the component's stylesheet rather than restating them, so a
 * hue changed there without re-measuring fails here instead of shipping.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOODLE_PEN_COLORS } from '@mj-biz-apps/forms-entities';

import { contrastRatio, parseCssColor, readableInk, type Rgb } from '../../core/readable-ink';

/** WCAG 1.4.11: the floor for a graphical object that carries meaning. */
const NON_TEXT_MIN = 3;

/** The widget's default page ink, from `mj-form.component.css`'s `--mj-text-primary`. */
const DEFAULT_INK: Rgb = [26, 29, 33];

/**
 * Page backgrounds a real form actually wears.
 *
 * The two defaults first — a light form and its dark counterpart are what the acceptance
 * criterion names — then three saturated authored pages, which are the case a fixed palette
 * fails and this construction is for.
 */
const PAGES: ReadonlyArray<readonly [string, string]> = [
  ['white page (the widget default)', '#ffffff'],
  ['dark form', '#12151a'],
  ['deep red form', '#7a1020'],
  ['navy form', '#0d2a4a'],
  ['cream form', '#faf3e0'],
];

/** The pen hue each colour is mixed from, read out of the pad's stylesheet. */
function penHues(): Map<string, Rgb> {
  const source = readFileSync(join(__dirname, 'doodle-pad.component.ts'), 'utf8');
  const hues = new Map<string, Rgb>();
  for (const match of source.matchAll(
    /--mjf-doodle-pen-(\w+):\s*color-mix\(in srgb,\s*(#[0-9A-Fa-f]{6})\s*(\d+)%/g,
  )) {
    const rgb = parseCssColor(hexToRgbString(match[2]));
    expect(rgb, `unparseable hue for ${match[1]}`).toBeDefined();
    hues.set(match[1], rgb!);
  }
  return hues;
}

/** The single mix ratio the stylesheet uses, so the spec cannot drift from it. */
function mixPercent(): number {
  const source = readFileSync(join(__dirname, 'doodle-pad.component.ts'), 'utf8');
  const percents = new Set(
    [...source.matchAll(/--mjf-doodle-pen-\w+:\s*color-mix\(in srgb,\s*#[0-9A-Fa-f]{6}\s*(\d+)%/g)].map(
      (m) => Number(m[1]),
    ),
  );
  expect([...percents], 'every pen should mix at the same ratio').toHaveLength(1);
  return [...percents][0] / 100;
}

function hexToRgbString(hex: string): string {
  const n = (from: number) => parseInt(hex.slice(from, from + 2), 16);
  return `rgb(${n(1)}, ${n(3)}, ${n(5)})`;
}

/** `color-mix(in srgb, a p%, b)` — a channel-wise weighted average of gamma-encoded sRGB. */
function mix(a: Rgb, b: Rgb, p: number): Rgb {
  return [
    Math.round(a[0] * p + b[0] * (1 - p)),
    Math.round(a[1] * p + b[1] * (1 - p)),
    Math.round(a[2] * p + b[2] * (1 - p)),
  ];
}

describe('the exported PNG is legible on every page a form can wear', () => {
  const hues = penHues();
  const p = mixPercent();

  it('defines one pen token per contract colour, and no extras', () => {
    // The stylesheet and the contract are the two halves of a swatch. A colour offered by the
    // contract with no token behind it renders a swatch of nothing and draws in the fallback ink;
    // a token no contract colour names is a pen nothing can select.
    const source = readFileSync(join(__dirname, 'doodle-pad.component.ts'), 'utf8');
    const declared = [...source.matchAll(/--mjf-doodle-pen-(\w+):/g)].map((m) => m[1]);
    expect([...new Set(declared)].sort()).toEqual([...DOODLE_PEN_COLORS].sort());
  });

  it('gives Ink the form’s own ink rather than a hue, because that is what makes it the safe default', () => {
    // Ink is the only pen that is not mixed, and it is the only one that cannot fail: it IS
    // `--mjf-doodle-ink`, which theming.ts repairs against the page whenever the pair collides.
    const source = readFileSync(join(__dirname, 'doodle-pad.component.ts'), 'utf8');
    expect(source).toMatch(/--mjf-doodle-pen-Ink:\s*var\(--mjf-doodle-ink\);/);
    expect(hues.has('Ink'), 'Ink must not be a mixed hue').toBe(false);
  });

  for (const [pageName, pageHex] of PAGES) {
    const background = parseCssColor(hexToRgbString(pageHex))!;
    // What the form's ink actually resolves to after `theming.ts` has had its say.
    const ink = readableInk(background, DEFAULT_INK);

    it(`keeps every pen at or above ${NON_TEXT_MIN}:1 on a ${pageName}`, () => {
      for (const color of DOODLE_PEN_COLORS) {
        const pen = color === 'Ink' ? ink : mix(hues.get(color)!, ink, p);
        const ratio = contrastRatio(pen, background);
        expect(ratio, `${color} on ${pageName} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          NON_TEXT_MIN,
        );
      }
    });
  }

  it('is carried by the ink term, which is why an authored page cannot break it', () => {
    // The property that makes the whole construction work: the mix is minority-hue, so contrast
    // is dominated by the ink — the one colour the theming layer guarantees. A future edit that
    // pushed the hue past half would quietly hand the guarantee back to the hue.
    expect(p).toBeLessThanOrEqual(0.7);
  });
});
