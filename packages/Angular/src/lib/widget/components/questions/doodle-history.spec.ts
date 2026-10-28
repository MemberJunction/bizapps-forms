import { describe, expect, it } from 'vitest';
import { afterStroke, clearPad, EMPTY_PAD, undoPad, type PadHistory } from './doodle-history';

/** Strokes and the base image are opaque to the history, so strings stand in for both. */
const drawn = (base: string | null, ...strokes: string[]): PadHistory<string, string> => ({ base, strokes, cleared: null });

describe('doodle pad history: Clear can be undone', () => {
  it('clear empties the pad and keeps what it wiped', () => {
    const after = clearPad(drawn('restored', 's1', 's2'));
    expect(after).toEqual({ base: null, strokes: [], cleared: { base: 'restored', strokes: ['s1', 's2'] } });
  });

  it('undo right after clear brings the whole drawing back', () => {
    expect(undoPad(clearPad(drawn('restored', 's1', 's2')))).toEqual(drawn('restored', 's1', 's2'));
  });

  it('undo after that takes back strokes as before', () => {
    const back = undoPad(clearPad(drawn(null, 's1', 's2')));
    expect(back && undoPad(back)).toEqual(drawn(null, 's1'));
  });

  it('drawing after a clear starts a new history, so undo no longer restores the old drawing', () => {
    const redrawn = afterStroke(clearPad(drawn(null, 's1')), ['n1']);
    expect(redrawn.cleared).toBeNull();
    expect(undoPad({ ...redrawn, strokes: [] })).toBeNull();
  });

  it('clearing an empty pad keeps nothing to restore', () => {
    expect(clearPad(EMPTY_PAD)).toEqual(EMPTY_PAD);
  });

  it('a second clear keeps the stash from the first', () => {
    const once = clearPad(drawn(null, 's1'));
    expect(clearPad(once)).toEqual(once);
  });

  it('undo on an empty pad with nothing cleared is a no-op', () => {
    expect(undoPad(EMPTY_PAD)).toBeNull();
  });

  it('undo stops at the base image, as it always has', () => {
    expect(undoPad(drawn('restored'))).toBeNull();
  });
});
