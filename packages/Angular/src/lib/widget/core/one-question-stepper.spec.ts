import { describe, it, expect } from 'vitest';
import { clampCursor } from './one-question-stepper';

describe('clampCursor', () => {
  it('clamps into [0, total-1]', () => {
    expect(clampCursor(-3, 5)).toBe(0);
    expect(clampCursor(0, 5)).toBe(0);
    expect(clampCursor(2, 5)).toBe(2);
    expect(clampCursor(4, 5)).toBe(4);
    expect(clampCursor(99, 5)).toBe(4);
  });

  it('clamps to 0 when there are no steps', () => {
    expect(clampCursor(0, 0)).toBe(0);
    expect(clampCursor(3, 0)).toBe(0);
    expect(clampCursor(-1, 0)).toBe(0);
  });

  // Regression for the OneQuestion render-mode bug. The component stores the cursor in a
  // signal and re-clamps it through clampCursor whenever the visible-question path resizes.
  // Modelling that write-back here proves the cursor does NOT jump ahead after the path
  // shrinks (hiding questions below it) and then grows back.
  it('does not jump ahead after the path shrinks then grows (write-back semantics)', () => {
    // Cursor on the 5th of 5 questions.
    let cursor = clampCursor(4, 5);
    expect(cursor).toBe(4);

    // Conditional logic hides 3 questions -> 2 visible. The component writes the clamp back.
    cursor = clampCursor(cursor, 2);
    expect(cursor).toBe(1); // last of 2

    // Path grows back to 5. Because the clamp was written back (cursor is now 1, not 4),
    // the respondent stays on step 2 instead of bouncing to the stale step 5.
    cursor = clampCursor(cursor, 5);
    expect(cursor).toBe(1);
  });
});
