/**
 * The colour maths behind the Design tab's picker — hex in, HSV out, and back.
 *
 * HSV rather than RGB because it is the space the CONTROL is drawn in: a saturation/value plane
 * under a hue slider is how every picker an author has ever used is laid out, and it is the only
 * arrangement where "the same colour, lighter" is a straight move.
 */

/** Hue 0–360, saturation and value 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * The palette offered under the picker.
 *
 * Curated, not generated. Most authors want "a good colour", not a colour space to explore, and
 * one click beats a two-axis drag every time — so the fast path is a small set that already
 * works on both light and dark page backgrounds. Ten is deliberate: enough to find something,
 * few enough to take in at a glance without choosing becoming the task.
 */
// ui-gate: allow-literal-color(3) — a palette IS a list of colours; there is no token to use
// here, and laid out five to a line it mirrors the five-column grid the picker draws.
export const PRESET_SWATCHES: readonly string[] = [
  '#7ba428', '#3fc4b0', '#f4c430', '#f4681f', '#3b9ae1',
  '#e0559a', '#3d1a3d', '#0f5c4a', '#1b7fa8', '#152a63',
];

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Two-digit lowercase hex for one 0–255 channel. */
function channel(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
}

/**
 * The HSV coordinates of a `#rrggbb` colour.
 *
 * A greyscale colour has no hue to report, and answering 0 (red) would make the picker's ring
 * jump every time the author dragged value to the bottom. Unresolvable hue comes back as 0 only
 * because something must; callers that care keep the hue they already had — see the component's
 * `hue` signal, which is authoritative while the popover is open.
 */
export function hexToHsv(hex: string): Hsv {
  const full = normalizeHexInput(hex);
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/** The `#rrggbb` of an HSV triple. Out-of-range input is clamped rather than refused. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const sextant = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sextant];

  return `#${channel((r + m) * 255)}${channel((g + m) * 255)}${channel((b + m) * 255)}`;
}

/**
 * What the hex field should hold for what the author typed.
 *
 * Deliberately tolerant and deliberately NON-committal: it tidies (adds the `#`, lowercases,
 * expands `#abc`, drops characters that cannot appear in a hex code) but hands back partial
 * entries untouched. Rewriting the box on every keystroke is what makes a hex field impossible
 * to type into, so completeness is a separate question — see {@link isCompleteHex}.
 */
export function normalizeHexInput(value: string): string {
  const digits = value.trim().replace(/^#/, '').replace(/[^0-9a-f]/gi, '').slice(0, 6).toLowerCase();
  if (digits.length === 3) {
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`;
  }
  return `#${digits}`;
}

/** Whether a normalized entry is a full six-digit colour, and so safe to commit. */
export function isCompleteHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/.test(value);
}
