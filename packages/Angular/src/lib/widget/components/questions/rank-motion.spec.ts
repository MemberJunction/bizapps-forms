import { describe, it, expect } from 'vitest';

import { flipDeltas, rankAnnouncement } from './rank-motion';

describe('flipDeltas', () => {
  it('gives each moved row the offset that puts it back where the eye last saw it', () => {
    // Two rows swapped: the one at y=0 is now at y=50, and vice versa.
    const before = new Map([['a', 0], ['b', 50]]);
    const after = new Map([['a', 50], ['b', 0]]);

    expect(flipDeltas(before, after)).toEqual(new Map([['a', -50], ['b', 50]]));
  });
});

describe('flipDeltas exclusions', () => {
  it('leaves still rows and newly-appeared rows alone, so nothing animates from nowhere', () => {
    const before = new Map([['a', 0], ['b', 50]]);
    const after = new Map([['a', 0], ['b', 50], ['c', 100]]);

    expect(flipDeltas(before, after).size).toBe(0);
  });
});

describe('rankAnnouncement', () => {
  it('says what moved and where it landed, since a screen reader sees no motion', () => {
    expect(rankAnnouncement('Speed', 0, 4)).toBe('Speed moved to position 1 of 4.');
  });
});
