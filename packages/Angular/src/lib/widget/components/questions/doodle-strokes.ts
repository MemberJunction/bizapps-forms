/**
 * The doodle pad's drawing, as data rather than as pixels.
 *
 * WHY THIS EXISTS AT ALL. The pad used to draw straight onto the canvas bitmap — `lineTo` then
 * `stroke`, with a `hasInk` boolean as its entire state — which is fine right up until someone
 * asks for Undo. There is nothing to undo FROM: the bitmap knows what the drawing looks like and
 * nothing about how it got there. Retaining strokes is what makes the bitmap a RENDER of the
 * drawing instead of the drawing itself, and undo then costs one `slice` and one repaint.
 *
 * WHY IT IS A MODULE AND NOT FIELDS ON THE COMPONENT. This package's test environment is `node`:
 * a component that injects cannot be instantiated, so anything living inside one is checked by a
 * spec that reads its source. The cap and the eviction contract are exactly the kind of rule that
 * deserves a real test, so they live out here where one can be written — and the pad keeps a
 * single signal holding the list, rather than a second copy of the same fact.
 */

/** One sampled pointer position, in BITMAP coordinates (see the pad's `toBitmapPoint`). */
export interface DoodlePoint {
  readonly x: number;
  readonly y: number;
}

/** One finished pen stroke: where it went, and what it was drawn with. */
export interface DoodleStroke {
  /** A resolved CSS colour, as `getComputedStyle` handed it back. Never a `var()`. */
  readonly color: string;
  /** Canvas `lineWidth`, in bitmap pixels. */
  readonly width: number;
  readonly points: readonly DoodlePoint[];
}

/**
 * How many strokes stay reachable by Undo.
 *
 * A bound on MEMORY, not on the drawing. Every stroke retains its sampled points, and a pointer
 * on a phone samples generously, so an unbounded list is an unbounded allocation over a session
 * that can last as long as the respondent likes. Reaching the cap costs undo RANGE and nothing
 * else: the oldest stroke is baked into the pad's base image on its way out, so what is on screen
 * — and what gets exported and uploaded — is unchanged.
 *
 * 200 is chosen to be past the point of usefulness rather than near it. Undo is a correction
 * tool; nobody taps it two hundred times. It is far enough above any real drawing that the cap is
 * effectively invisible, and low enough that the worst case is bounded.
 */
export const MAX_RETAINED_STROKES = 200;

/** The retained strokes after an addition, plus whatever fell out of undo range doing it. */
export interface StrokeAddition {
  readonly strokes: readonly DoodleStroke[];
  /**
   * Strokes no longer reachable by undo, oldest first.
   *
   * The caller MUST render these into the pad's base image before dropping them. They have left
   * the undo history; they have not left the drawing.
   */
  readonly evicted: readonly DoodleStroke[];
}

/**
 * Append a finished stroke, evicting from the front so the retained list stays capped.
 *
 * Returns new arrays rather than mutating: the pad holds these in a signal, and mutating in place
 * changes the value without telling the signal, so the Undo button's disabled state and the
 * repaint would read a list the framework thinks has not changed.
 */
export function addStroke(strokes: readonly DoodleStroke[], stroke: DoodleStroke): StrokeAddition {
  const next = [...strokes, stroke];
  // `splice` rather than a shift-loop so an over-long input (which one stroke at a time cannot
  // produce, but a future caller could) is trimmed in one step instead of iterating.
  const overflow = next.length - MAX_RETAINED_STROKES;
  const evicted = overflow > 0 ? next.splice(0, overflow) : [];
  return { strokes: next, evicted };
}

/**
 * Render one stroke onto a context.
 *
 * The pad's ONLY drawing primitive, used for the live stroke, for repainting after an undo and
 * for baking an evicted stroke into the base image — so a stroke cannot look different depending
 * on which of those put it there.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: DoodleStroke): void {
  if (stroke.points.length === 0) {
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}
