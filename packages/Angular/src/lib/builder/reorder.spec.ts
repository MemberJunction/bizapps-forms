import { describe, it, expect } from 'vitest';
import { isValidReorder } from './reorder';

describe('isValidReorder', () => {
  it('accepts an in-bounds move to a different index', () => {
    expect(isValidReorder(0, 2, 3)).toBe(true);
    expect(isValidReorder(2, 0, 3)).toBe(true);
  });

  it('rejects a no-op move (same index)', () => {
    expect(isValidReorder(1, 1, 3)).toBe(false);
  });

  it('rejects out-of-bounds source or target', () => {
    expect(isValidReorder(-1, 1, 3)).toBe(false);
    expect(isValidReorder(0, 3, 3)).toBe(false);
    expect(isValidReorder(3, 0, 3)).toBe(false);
  });

  it('rejects everything in an empty list', () => {
    expect(isValidReorder(0, 0, 0)).toBe(false);
  });

  it('rejects non-integer indices', () => {
    expect(isValidReorder(0.5, 1, 3)).toBe(false);
  });
});
