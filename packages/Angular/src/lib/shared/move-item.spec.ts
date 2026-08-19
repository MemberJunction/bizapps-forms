import { describe, it, expect } from 'vitest';
import { moveItem } from './move-item';

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('shifts everything between, rather than swapping the two ends', () => {
    // The distinction that matters. A swap would give ['d','b','c','a'] — the two ends traded
    // while the middle sat still, which is not what a hand dragging an item just did.
    expect(moveItem(list, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('moves an item backwards the same way', () => {
    expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('handles the adjacent case, where a move and a swap agree', () => {
    expect(moveItem(list, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('is a no-op when the item lands where it started', () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  it('treats an out-of-range index as a no-op, because a drag can end anywhere', () => {
    expect(moveItem(list, -1, 2)).toEqual(list);
    expect(moveItem(list, 0, 9)).toEqual(list);
    expect(moveItem(list, 9, 0)).toEqual(list);
  });

  it('never mutates the list it was given', () => {
    const original = [...list];
    moveItem(list, 0, 3);
    expect(list).toEqual(original);
  });

  it('keeps every item exactly once', () => {
    const result = moveItem(list, 1, 3);
    expect([...result].sort()).toEqual([...list].sort());
  });

  it('copes with a one-item and an empty list', () => {
    expect(moveItem(['only'], 0, 0)).toEqual(['only']);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});
