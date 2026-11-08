/**
 * The doodle pad's drawing as an undo history: what Clear and Undo do to it.
 *
 * Clear used to wipe the drawing for good — the one destructive control a respondent meets, next to
 * an Undo button that then had nothing to take back (UI audit F07). Clear now keeps what it wiped,
 * and an Undo straight after it puts the whole drawing back. Drawing anything new after a Clear
 * starts a fresh history, so Undo never resurrects a picture the respondent has since drawn over.
 *
 * Pure and generic over the base image and stroke types, so it is testable without a canvas.
 */

/** What Clear wiped, kept for one Undo. */
export interface ClearedDrawing<B, S> {
  base: B | null;
  strokes: readonly S[];
}

export interface PadHistory<B, S> {
  /** Flat pixels with no history: a restored drawing, plus strokes aged out of the cap. */
  base: B | null;
  /** This session's strokes, newest last. */
  strokes: readonly S[];
  /** The drawing the last Clear wiped, while Undo can still restore it. */
  cleared: ClearedDrawing<B, S> | null;
}

export const EMPTY_PAD: PadHistory<never, never> = { base: null, strokes: [], cleared: null };

/**
 * Empty the pad, keeping what was on it for Undo. Clearing an already-empty pad keeps the stash a
 * previous Clear left, so a double tap on Clear does not lose the drawing.
 */
export function clearPad<B, S>(pad: PadHistory<B, S>): PadHistory<B, S> {
  if (pad.base === null && pad.strokes.length === 0) {
    return pad;
  }
  return { base: null, strokes: [], cleared: { base: pad.base, strokes: pad.strokes } };
}

/**
 * Take back the last action: the last stroke, or — on a cleared pad — the Clear itself. Answers
 * `null` when there is nothing to take back, which includes a pad holding only its base image:
 * undo never erases a drawing from an earlier visit (see `DoodlePadComponent.undo`).
 */
export function undoPad<B, S>(pad: PadHistory<B, S>): PadHistory<B, S> | null {
  if (pad.strokes.length > 0) {
    return { ...pad, strokes: pad.strokes.slice(0, -1) };
  }
  if (pad.cleared && pad.base === null) {
    return { base: pad.cleared.base, strokes: pad.cleared.strokes, cleared: null };
  }
  return null;
}

/** The pad after a new stroke has been retained: a fresh history, so the Clear stash is dropped. */
export function afterStroke<B, S>(pad: PadHistory<B, S>, strokes: readonly S[]): PadHistory<B, S> {
  return { base: pad.base, strokes, cleared: null };
}

/** Whether Undo has anything to take back. */
export function canUndoPad<B, S>(pad: PadHistory<B, S>): boolean {
  return undoPad(pad) !== null;
}
