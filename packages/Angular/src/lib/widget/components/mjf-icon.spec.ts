/**
 * The icon geometry itself.
 *
 * `icon-font-free.spec.ts` proves no icon depends on a stylesheet the host page might not have.
 * That is one level above the defect it replaced: geometry that ships in the bundle and still
 * draws nothing — a path with a typo, or one whose coordinates land outside the 24×24 viewBox —
 * is invisible in exactly the same way and sails past that guard. These assertions sit at the
 * level of the thing that can actually be wrong.
 *
 * It reads the exported table directly. The first version re-read the component's source with a
 * regex and mistook the quoted key `'rotate-right'` for a path, which is what a test that
 * duplicates its subject invites.
 */
import { describe, expect, it } from 'vitest';
import { MJF_ICON_GLYPHS, MJF_ICON_NAMES } from './mjf-icon.component';

/** An inclusive box, in SVG user space. */
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Where an elliptical arc's centre is, per SVG F.6.5 (endpoint → centre parameterisation).
 *
 * Needed because an arc's extent is set by its CENTRE, not its endpoints. The first version of
 * this walker took the endpoint ± the radius, which reported the perfectly-centred circle in
 * `circle-check` as reaching y = 29.6 and failed three good paths. Every arc here has no x-axis
 * rotation, which is the only reason this is short.
 */
function arcCentre(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, largeArc: number, sweep: number,
): { cx: number; cy: number; rx: number; ry: number } {
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  // An arc whose radii cannot span its endpoints is scaled up until it can, rather than dropped.
  const lambda = (dx2 * dx2) / (rx * rx) + (dy2 * dy2) / (ry * ry);
  const scale = lambda > 1 ? Math.sqrt(lambda) : 1;
  const RX = rx * scale;
  const RY = ry * scale;
  const numerator = RX * RX * RY * RY - RX * RX * dy2 * dy2 - RY * RY * dx2 * dx2;
  const denominator = RX * RX * dy2 * dy2 + RY * RY * dx2 * dx2;
  const coefficient =
    (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, numerator) / denominator);
  return {
    cx: (coefficient * RX * dy2) / RY + (x1 + x2) / 2,
    cy: (-coefficient * RY * dx2) / RX + (y1 + y2) / 2,
    rx: RX,
    ry: RY,
  };
}

/**
 * The box a path can paint in.
 *
 * Handles the commands these icons use. Anything else THROWS — and the token pattern matches any
 * letter so that an unhandled command reaches that throw. The first version matched only the
 * letters it knew, which meant the shield's `c` was not tokenised at all: its six numbers were
 * silently fed to the preceding `v` as if they belonged to it, and the walker reported a bogus
 * stray instead of saying it had met something it did not understand. Skipping quietly is exactly
 * how a checker certifies geometry it never looked at.
 *
 * Bézier control points are included rather than the true curve extent. A Bézier is contained by
 * the convex hull of its control points, so that over-approximates — which is the safe direction:
 * it can complain about a good path, never bless a bad one.
 */
function pathBox(d: string): Box {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const see = (x: number, y: number): void => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;
  let command = '';
  const num = (): number => {
    const raw = tokens[i++];
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`expected a number in "${d}", got ${JSON.stringify(raw)}`);
    }
    return value;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) {
      command = tokens[i++];
    } else if (command === 'M') {
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }
    const rel = command === command.toLowerCase();
    const baseX = rel ? x : 0;
    const baseY = rel ? y : 0;
    switch (command.toUpperCase()) {
      case 'M':
      case 'L': {
        x = baseX + num();
        y = baseY + num();
        if (command.toUpperCase() === 'M') {
          startX = x;
          startY = y;
        }
        break;
      }
      case 'H': {
        x = baseX + num();
        break;
      }
      case 'V': {
        y = baseY + num();
        break;
      }
      case 'C': {
        for (let point = 0; point < 2; point++) {
          see(baseX + num(), baseY + num());
        }
        x = baseX + num();
        y = baseY + num();
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        num(); // x-axis-rotation; zero throughout this set
        const largeArc = num();
        const sweep = num();
        const fromX = x;
        const fromY = y;
        x = baseX + num();
        y = baseY + num();
        const arc = arcCentre(fromX, fromY, x, y, rx, ry, largeArc, sweep);
        see(arc.cx - arc.rx, arc.cy - arc.ry);
        see(arc.cx + arc.rx, arc.cy + arc.ry);
        break;
      }
      case 'Z': {
        x = startX;
        y = startY;
        break;
      }
      default:
        throw new Error(`unhandled path command ${JSON.stringify(command)} in "${d}"`);
    }
    see(x, y);
  }
  return box;
}

describe('the path walker', () => {
  it('tracks relative commands rather than reading raw numbers', () => {
    // A walker that mis-read offsets would report every path as in-bounds and this suite would
    // certify nothing. `v-6` reaches y = 10, not y = -6.
    expect(pathBox('M4 5l3 2z')).toEqual({ minX: 4, minY: 5, maxX: 7, maxY: 7 });
    expect(pathBox('M12 16v-6')).toEqual({ minX: 12, minY: 10, maxX: 12, maxY: 16 });
  });

  it('puts a circle-shaped arc pair around its own centre', () => {
    // The regression that mattered: a circle centred at (12,12) with r=8.8 spans 3.2..20.8 on
    // both axes. Endpoint-plus-radius reported 29.6 and failed a good path.
    const box = pathBox('M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6z');
    // Compared loosely on purpose: the centre parameterisation goes through a square root, so
    // 3.2 arrives as 3.1999999999999993. An exact match here would be a test of float layout.
    expect(box.minX).toBeCloseTo(3.2, 6);
    expect(box.minY).toBeCloseTo(3.2, 6);
    expect(box.maxX).toBeCloseTo(20.8, 6);
    expect(box.maxY).toBeCloseTo(20.8, 6);
  });

  it('throws on a command it does not handle instead of skipping it', () => {
    // `c` used to be dropped by the token pattern, so its numbers were fed to the previous
    // command and the walker invented a stray. Any letter now reaches the throw.
    expect(() => pathBox('M0 0Q1 1 2 2')).toThrow(/unhandled path command/);
    expect(() => pathBox('M0 0T5 5')).toThrow(/unhandled path command/);
  });

  it('bounds a cubic by its control points', () => {
    expect(pathBox('M0 0C2 10 8 10 10 0')).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('every widget icon has geometry that can actually be seen', () => {
  it('gives every name at least one path', () => {
    expect(MJF_ICON_NAMES.length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(MJF_ICON_GLYPHS).length).toBe(MJF_ICON_NAMES.length);
    for (const [name, glyph] of Object.entries(MJF_ICON_GLYPHS)) {
      expect(glyph.paths.length, `${name} has no paths`).toBeGreaterThan(0);
      for (const d of glyph.paths) {
        expect(d, `${name} has an empty path`).not.toBe('');
        expect(d, `${name} has a path that does not start with a move`).toMatch(/^M/);
      }
    }
  });

  it('keeps every path inside the 24x24 viewBox', () => {
    const strays: string[] = [];
    for (const [name, glyph] of Object.entries(MJF_ICON_GLYPHS)) {
      for (const d of glyph.paths) {
        const box = pathBox(d);
        // A round stroke cap sits half a stroke-width past its endpoint, so a path that reaches
        // the very edge is intentional rather than a typo. Beyond that slack it is off-canvas.
        if (box.minX < -1.5 || box.minY < -1.5 || box.maxX > 25.5 || box.maxY > 25.5) {
          strays.push(`${name}: ${JSON.stringify(box)} in "${d}"`);
        }
      }
    }
    expect(strays, `these paint outside the viewBox:\n${strays.join('\n')}`).toEqual([]);
  });

  it('draws every icon large enough to read', () => {
    // A path can be in-bounds and still be a dot in the corner — a typo that collapses geometry
    // produces exactly that, and it looks identical to a missing glyph on screen. Judged over the
    // whole icon, because single subpaths are legitimately tiny (the `h.01` dots).
    const tiny: string[] = [];
    for (const [name, glyph] of Object.entries(MJF_ICON_GLYPHS)) {
      const boxes = glyph.paths.map(pathBox);
      const width = Math.max(...boxes.map((b) => b.maxX)) - Math.min(...boxes.map((b) => b.minX));
      const height = Math.max(...boxes.map((b) => b.maxY)) - Math.min(...boxes.map((b) => b.minY));
      if (Math.max(width, height) < 10) {
        tiny.push(`${name}: ${width.toFixed(1)}x${height.toFixed(1)}`);
      }
    }
    expect(tiny, `these are too small to read at 1em:\n${tiny.join('\n')}`).toEqual([]);
  });

  it('fills the star and strokes everything else', () => {
    // Not a style preference — the rating's affordance IS fill, and the component documents that
    // as the single exception. A second filled icon makes that comment wrong.
    const filled = Object.entries(MJF_ICON_GLYPHS)
      .filter(([, glyph]) => glyph.filled)
      .map(([name]) => name);
    expect(filled).toEqual(['star']);
  });
});
