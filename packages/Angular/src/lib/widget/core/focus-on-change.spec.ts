/**
 * When the widget's renderers move focus to the current section or question.
 *
 * They moved it on the FIRST render unconditionally, which took focus from whatever control held
 * it: in the builder, opening the Design tab from the keyboard dropped focus from the tab strip
 * into the preview, so the arrow keys stopped working (found live while verifying UI audit F12).
 * The first render must still focus when nothing else holds focus — after the welcome screen's
 * Start button is clicked and removed, focus is on the body, and the first question has to get it.
 */
import { describe, expect, it } from 'vitest';
import { focusOnChange } from './focus-on-change';

describe('focusOnChange', () => {
  it('first item: moves focus when nothing else holds it (after Start, focus is on the body)', () => {
    expect(focusOnChange()('page-1', false)).toBe(true);
  });

  it('first item: leaves focus on a control outside the form that already holds it', () => {
    expect(focusOnChange()('page-1', true)).toBe(false);
  });

  it('moves focus when the item changes, wherever focus is', () => {
    const shouldFocus = focusOnChange();
    shouldFocus('page-1', true);
    expect(shouldFocus('page-2', false)).toBe(true);
    expect(shouldFocus('page-1', true)).toBe(true);
  });

  it('does not move focus again for the same item, so editing an answer never yanks it', () => {
    const shouldFocus = focusOnChange();
    shouldFocus('page-1', false);
    expect(shouldFocus('page-1', false)).toBe(false);
  });

  it('each renderer keeps its own history', () => {
    const a = focusOnChange();
    const b = focusOnChange();
    a('page-1', false);
    expect(b('page-1', false)).toBe(true);
  });
});
