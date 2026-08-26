import { describe, it, expect } from 'vitest';
import {
  NOTHING_SELECTED,
  clearIfPage,
  clearIfQuestion,
  clearIfScreen,
  pageId,
  screenId,
  selectPage,
  selectQuestion,
  selectScreen,
  questionId,
} from './builder-selection';

describe('what the properties panel is showing', () => {
  it('cannot be a question AND a screen at once', () => {
    // THE REGRESSION. Two mutually-exclusive fields with the invariant written only in a comment:
    // `addQuestion` set the question id and left a screen id standing, and because the template
    // checks the screen first, adding a question from the palette while a Welcome screen was
    // selected added it and then showed the author the screen instead. Nothing errored.
    const afterScreen = selectScreen('screen-1');
    const afterQuestion = selectQuestion('question-1');

    expect(questionId(afterQuestion)).toBe('question-1');
    expect(screenId(afterQuestion)).toBeNull();

    expect(screenId(afterScreen)).toBe('screen-1');
    expect(questionId(afterScreen)).toBeNull();
  });

  it('starts with nothing selected', () => {
    expect(questionId(NOTHING_SELECTED)).toBeNull();
    expect(screenId(NOTHING_SELECTED)).toBeNull();
  });

  it('clears when the selected question is deleted, and only then', () => {
    const selection = selectQuestion('q-1');
    expect(clearIfQuestion(selection, 'q-1')).toEqual(NOTHING_SELECTED);
    expect(clearIfQuestion(selection, 'q-2')).toBe(selection);
  });

  it('clears when the selected screen is deleted, and only then', () => {
    const selection = selectScreen('s-1');
    expect(clearIfScreen(selection, 's-1')).toEqual(NOTHING_SELECTED);
    expect(clearIfScreen(selection, 's-2')).toBe(selection);
  });

  it('does not let a deleted screen clear a selected question', () => {
    // The two clears must not be able to reach across kinds — deleting a screen while a question
    // is selected has to leave the author's question exactly where it was.
    const selection = selectQuestion('q-1');
    expect(clearIfScreen(selection, 'q-1')).toBe(selection);
  });

  it('a page selection is exclusive, like the others (B2)', () => {
    const afterPage = selectPage('p-1');
    expect(pageId(afterPage)).toBe('p-1');
    expect(questionId(afterPage)).toBeNull();
    expect(screenId(afterPage)).toBeNull();
    expect(pageId(selectQuestion('q-1'))).toBeNull();
    expect(pageId(NOTHING_SELECTED)).toBeNull();
  });

  it('clears when the selected page is deleted, and only then', () => {
    const selection = selectPage('p-1');
    expect(clearIfPage(selection, 'p-1')).toEqual(NOTHING_SELECTED);
    expect(clearIfPage(selection, 'p-2')).toBe(selection);
  });

  it('does not let a deleted page clear a selected question, nor vice versa', () => {
    expect(clearIfPage(selectQuestion('x-1'), 'x-1')).toEqual(selectQuestion('x-1'));
    expect(clearIfQuestion(selectPage('x-1'), 'x-1')).toEqual(selectPage('x-1'));
  });
});
