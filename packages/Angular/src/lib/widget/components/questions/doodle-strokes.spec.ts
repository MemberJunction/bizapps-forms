import { describe, expect, it } from 'vitest';

import { MAX_RETAINED_STROKES, addStroke, type DoodleStroke } from './doodle-strokes';

const stroke = (n: number): DoodleStroke => ({
  color: 'rgb(0, 0, 0)',
  width: 2.5,
  points: [{ x: n, y: n }, { x: n + 1, y: n + 1 }],
});

const many = (count: number): readonly DoodleStroke[] => {
  let strokes: readonly DoodleStroke[] = [];
  for (let i = 0; i < count; i++) {
    strokes = addStroke(strokes, stroke(i)).strokes;
  }
  return strokes;
};

describe('addStroke — while there is room', () => {
  it('keeps the new stroke last, so undo takes it first', () => {
    const { strokes, evicted } = addStroke([stroke(1)], stroke(2));

    expect(strokes).toHaveLength(2);
    expect(strokes[1]).toEqual(stroke(2));
    expect(evicted).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    // The pad holds its strokes in a signal. Mutating in place would change the value under the
    // signal without notifying it, so `canUndo` and the repaint would disagree with the model.
    const before: readonly DoodleStroke[] = [stroke(1)];

    addStroke(before, stroke(2));

    expect(before).toHaveLength(1);
  });
});

describe('addStroke — at the cap', () => {
  /**
   * The cap bounds MEMORY, not the drawing. A long session on a phone must not accumulate points
   * without limit, but a respondent who has drawn two hundred strokes still has a two-hundred-
   * stroke picture — the oldest ones simply stop being reachable by undo.
   *
   * That distinction is the whole contract of `evicted`: the caller is handed what fell out so it
   * can BAKE it into the pad's base image before dropping it. Nothing may be silently lost.
   */
  it('holds at the cap rather than growing', () => {
    expect(many(MAX_RETAINED_STROKES + 20)).toHaveLength(MAX_RETAINED_STROKES);
  });

  it('hands back the oldest stroke so the caller can make it permanent', () => {
    const full = many(MAX_RETAINED_STROKES);

    const { strokes, evicted } = addStroke(full, stroke(999));

    expect(evicted).toEqual([full[0]]);
    expect(strokes).toHaveLength(MAX_RETAINED_STROKES);
    expect(strokes[0]).toEqual(full[1]);
    expect(strokes[strokes.length - 1]).toEqual(stroke(999));
  });

  it('evicts nothing at all until the cap is actually reached', () => {
    let evictedTotal = 0;
    let strokes: readonly DoodleStroke[] = [];
    for (let i = 0; i < MAX_RETAINED_STROKES; i++) {
      const result = addStroke(strokes, stroke(i));
      strokes = result.strokes;
      evictedTotal += result.evicted.length;
    }
    expect(evictedTotal).toBe(0);
  });

  it('evicts every stroke over the cap when handed an over-full list', () => {
    // Not reachable one stroke at a time, but the function must not silently keep the excess if a
    // caller ever hands it a longer list — a cap that only sometimes holds is not a cap.
    const overfull = Array.from({ length: MAX_RETAINED_STROKES + 3 }, (_, i) => stroke(i));

    const { strokes, evicted } = addStroke(overfull, stroke(999));

    expect(strokes).toHaveLength(MAX_RETAINED_STROKES);
    expect(evicted).toHaveLength(4);
    expect(evicted[0]).toEqual(overfull[0]);
  });
});

describe('the cap itself', () => {
  it('is a named constant, generous enough that no ordinary drawing meets it', () => {
    expect(MAX_RETAINED_STROKES).toBeGreaterThanOrEqual(50);
  });
});
