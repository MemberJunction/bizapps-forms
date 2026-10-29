import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The hover shade of the widget's primary button (`--mjf-accent-strong`).
 *
 * It used to be mixed TOWARD the button text, which lowers contrast by construction: MJ's default
 * blue under white text fell from 4.9:1 to 4.0:1 under the pointer, below AA. The rule now mixes
 * toward the pole OPPOSITE the text (black under light text, white under dark text), so the button
 * always moves away from its text whichever pair the author picked.
 *
 * Vitest runs in node, so the CSS is read as text and the colour maths below mirrors it.
 */
const css = readFileSync(join(__dirname, 'mj-form.component.css'), 'utf8');

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const delin = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055);
const luminance = (c: Rgb): number => {
  const [r, g, b] = c.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
function toOklab(c: Rgb): Rgb {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, delin(v)))) as Rgb;
}

/** What the CSS computes: the accent mixed 12% (in oklab) toward black under light text, white under dark. */
function hoverShade(accent: Rgb, onAccent: Rgb): Rgb {
  const [L, a, b] = toOklab(accent);
  const awayFromText = Math.round(1 - toOklab(onAccent)[0]);
  return fromOklab([L * 0.88 + awayFromText * 0.12, a * 0.88, b * 0.88]);
}

describe('widget primary button hover', () => {
  it('declares the plain accent, and the away-from-text shade only where the browser can compute it', () => {
    const decls = [...css.matchAll(/--mjf-accent-strong:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(decls).toEqual([
      'var(--mjf-accent)',
      'color-mix(in oklab, var(--mjf-accent) 88%, oklch(from var(--mjf-on-accent) round(nearest, calc(1 - l), 1) 0 0))',
    ]);
    // Behind @supports, not a second declaration: a custom property accepts any value when parsed,
    // so an unsupported one wins the cascade and fails only at computed time — the hover background
    // went transparent, white text on the page. The review of this branch caught that.
    const supported = css.match(/@supports \(color: oklch\(from red round\(nearest, calc\(1 - l\), 1\) 0 0\)\) \{([\s\S]*?)\n\}/);
    expect(supported?.[1]).toContain('--mjf-accent-strong: color-mix(');
  });

  it('no longer mixes the accent toward its own text colour', () => {
    expect(css).not.toContain('color-mix(in srgb, var(--mjf-accent) 88%, var(--mjf-on-accent))');
  });

  const pairs: [string, string][] = [
    ['#2f5bea', '#ffffff'], // the widget's own default
    ['#0076b6', '#ffffff'], // MJ blue
    ['#7a1f2b', '#ffffff'], // maroon
    ['#111111', '#ffffff'], // black button
    ['#1d7a46', '#ffffff'], // green
    ['#f2c94c', '#111111'], // yellow with dark text
    ['#ffffff', '#1a1a1a'], // white button with dark text
    ['#9ad1f5', '#0b2540'], // pale blue with navy text
  ];
  it.each(pairs)('hover on %s with %s text never lowers contrast', (accent, text) => {
    const [a, t] = [hex(accent), hex(text)];
    expect(contrast(hoverShade(a, t), t)).toBeGreaterThanOrEqual(contrast(a, t) - 0.01);
  });
});
