/**
 * Guarantee that a themed form is still readable.
 *
 * A form author picks two colours in the Design tab — a page background and an ink — and nothing
 * has ever checked that the pair works. It did not matter while the questions sat on a white
 * card, because the card silently protected the text no matter what the page behind it was. The
 * moment the form became ONE surface (which is what an author asking for "a red form" means),
 * that accident went away and a blue-on-red theme measured 2.09:1 against a 4.5:1 requirement:
 * present, correctly themed, and unreadable.
 *
 * So the ink is checked, and replaced when it fails. Not overridden as a matter of taste — an ink
 * that clears the bar is used exactly as authored — but a form nobody can read is not a style,
 * and the respondent, who chose none of this, is the one who pays for it.
 */

/** An sRGB colour, 0–255 per channel. */
export type Rgb = readonly [number, number, number];

/** WCAG 2.1 AA for body text. */
const AA_BODY = 4.5;

/**
 * Parse the colour shapes `getComputedStyle` actually hands back.
 *
 * Both are needed and neither is optional: plain declarations resolve to `rgb(...)`, while
 * anything that passed through `color-mix()` — which is now most of the widget's palette —
 * resolves to `color(srgb ...)` with 0–1 floats.
 */
export function parseCssColor(value: string): Rgb | undefined {
  const text = value.trim();
  // Hex first, and not as an afterthought: it is what the Design tab stores, and the numeric
  // path below silently mis-reads it: a six-digit hex yields only two runs of digits, not
  // three, so the whole guard used to bail out on exactly the themes that needed it.
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1];
    const pair = (i: number): number =>
      digits.length === 3
        ? parseInt(digits[i] + digits[i], 16)
        : parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    return [pair(0), pair(1), pair(2)];
  }
  const numbers = text.match(/-?\d*\.?\d+/g);
  if (!numbers || numbers.length < 3) {
    return undefined;
  }
  const [r, g, b] = numbers.slice(0, 3).map(Number);
  const scale = text.includes('color(') ? 255 : 1;
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n * scale)));
  return [clamp(r), clamp(g), clamp(b)];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The ink to actually use on `background`.
 *
 * Returns `preferred` untouched when it already clears AA. Otherwise returns whichever of near
 * black / near white does better against the page — not the pure extremes, which read as harsh
 * against a saturated brand colour, but the same off-black and off-white the widget's own
 * defaults use.
 */
export function readableInk(background: Rgb, preferred: Rgb): Rgb {
  if (contrastRatio(background, preferred) >= AA_BODY) {
    return preferred;
  }
  const dark: Rgb = [26, 29, 33];
  const light: Rgb = [255, 255, 255];
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

/** Format for assignment to a CSS custom property. */
export function toCssRgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}
