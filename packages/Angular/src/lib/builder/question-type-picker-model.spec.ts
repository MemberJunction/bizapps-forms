/**
 * What the insert popover lists, and how the keyboard moves through it.
 *
 * THE ONE DECISION WORTH RECORDING: the popover shows the SAME semantic groups as the left
 * palette — Contact, Text, Choice, Scale, Date, Upload, Structure — and not an alphabetical list.
 * Alphabetical was considered and is worse here, for two specific reasons rather than taste:
 *
 *  - `Checkbox` ("a single box to tick — consent, opt-in") and `Checkboxes` ("pick any number of
 *    options") would sit adjacent under C. They are different question types with near-identical
 *    names, and the only thing telling them apart would be the hint.
 *  - `Multiple choice`, `Checkboxes` and `Dropdown` are one authoring decision — how many can
 *    they pick, and how is it shown — and would scatter to M, C and D.
 *
 * An author reaches for "a choice question", not "something beginning with M". Reusing the
 * palette's groups also means the two surfaces teach one map of the catalog instead of two.
 *
 * THERE IS NO SEARCH. All twenty-five types are on screen at once in three columns, so a filter
 * would only ever hide things that are already visible — and it cost a mode, an empty state and
 * a second list shape to maintain.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMON_TYPES,
  commonTypes,
  movedHighlight,
  NO_HIGHLIGHT,
  pickerGroups,
  pickerKeyAction,
  pickerTypes,
} from './question-type-picker-model';
import { QUESTION_PALETTE_GROUPS } from './question-type-catalog';

describe('pickerGroups', () => {
  it('shows the palette’s own groups, in the palette’s own order, when nothing is typed', () => {
    expect(pickerGroups().map((g) => g.heading)).toEqual([...QUESTION_PALETTE_GROUPS]);
  });

  it('keeps a group’s types together', () => {
    const choice = pickerGroups().find((g) => g.heading === 'Choice');
    expect(choice?.types.map((t) => t.label)).toContain('Multiple choice');
    expect(choice?.types.map((t) => t.label)).toContain('Checkboxes');
    expect(choice?.types.map((t) => t.label)).toContain('Dropdown');
  });

});

describe('pickerTypes', () => {
  it('reads the groups in render order, which is what the arrow keys walk', () => {
    const groups = pickerGroups();
    expect(pickerTypes(groups)).toEqual(groups.flatMap((g) => g.types));
  });
});

describe('movedHighlight', () => {
  it('steps down the list', () => {
    expect(movedHighlight(0, 1, 5)).toBe(1);
  });

  it('wraps at the bottom, so a held arrow key never dead-ends', () => {
    expect(movedHighlight(4, 1, 5)).toBe(0);
  });

  it('wraps at the top', () => {
    expect(movedHighlight(0, -1, 5)).toBe(4);
  });

  it('has nothing to highlight in an empty list', () => {
    expect(movedHighlight(0, 1, 0)).toBe(NO_HIGHLIGHT);
  });

  it('starts at the top when arrowing down from nothing highlighted', () => {
    // NO_HIGHLIGHT is the resting state whenever the pointer is in the list — the mouse owns the
    // highlight then, through :hover, and two rows lit at once reads as a bug. The first arrow
    // key takes it back, and it has to land somewhere sensible rather than at the modulo's answer.
    expect(movedHighlight(NO_HIGHLIGHT, 1, 5)).toBe(0);
  });

  it('starts at the bottom when arrowing up from nothing highlighted', () => {
    // Plain modulo would give 3 here, which is neither end of the list.
    expect(movedHighlight(NO_HIGHLIGHT, -1, 5)).toBe(4);
  });
});

describe('commonTypes', () => {
  it('resolves every id in the shortcut list to a real catalog entry', () => {
    // The one failure worth guarding: a typo in COMMON_TYPES yields no meta, and the rail
    // silently renders one row fewer. Nothing else would notice.
    expect(commonTypes()).toHaveLength(COMMON_TYPES.length);
    expect(commonTypes().map((meta) => meta.type)).toEqual([...COMMON_TYPES]);
  });

  it('offers only types the full catalog also offers', () => {
    // The rail is a shortcut INTO the grid, not a second catalog. A type reachable only from the
    // rail would be invisible to anyone who searched for it first.
    const everything = pickerTypes(pickerGroups()).map((meta) => meta.type);
    for (const type of commonTypes()) {
      expect(everything).toContain(type.type);
    }
  });
});

describe('pickerKeyAction', () => {
  // THE DEFECT, reproduced against the running builder: with a row keyboard-highlighted, Tab to
  // the dialog's Close button and press Enter — and an "Untitled Email question" was inserted
  // into the form. The panel's keydown handler caught the Enter meant for Close and picked the
  // highlighted row instead. Trying to dismiss the dialog silently edited the form.
  //
  // The rule that makes that unrepresentable: the panel handles keys ONLY while the panel itself
  // holds focus. The moment focus is on a control inside it, that control owns its own keys —
  // which for a <button> means the browser's native Enter/Space activation.

  it('moves the highlight with the arrows while the panel holds focus', () => {
    expect(pickerKeyAction('ArrowDown', false, true)).toBe('move-down');
    expect(pickerKeyAction('ArrowUp', false, true)).toBe('move-up');
  });

  it('picks the highlighted row on Enter while the panel holds focus', () => {
    expect(pickerKeyAction('Enter', false, true)).toBe('activate');
  });

  it('keeps its hands off Enter once a control inside has focus', () => {
    // The reproduced bug. Close must close, not insert a question.
    expect(pickerKeyAction('Enter', false, false)).toBe('ignore');
  });

  it('keeps its hands off Space too', () => {
    // Space activates a focused <button> natively; intercepting it would break the other half of
    // keyboard activation, which is how the rows came to do nothing on Space at all.
    expect(pickerKeyAction(' ', false, false)).toBe('ignore');
    expect(pickerKeyAction(' ', false, true)).toBe('ignore');
  });

  it('keeps its hands off the arrows once a control inside has focus', () => {
    // Otherwise the index highlight moves while a focus ring sits somewhere else — two
    // indicators, the thing the one-owner rule exists to prevent.
    expect(pickerKeyAction('ArrowDown', false, false)).toBe('ignore');
  });

  it('traps Tab in both directions, wherever focus currently is', () => {
    // The trap is the one thing that must work regardless: without it Tab walks out of the modal
    // and into the builder behind the overlay.
    expect(pickerKeyAction('Tab', false, true)).toBe('trap-forward');
    expect(pickerKeyAction('Tab', true, true)).toBe('trap-back');
    expect(pickerKeyAction('Tab', false, false)).toBe('trap-forward');
    expect(pickerKeyAction('Tab', true, false)).toBe('trap-back');
  });

  it('ignores keys it has no business in', () => {
    expect(pickerKeyAction('a', false, true)).toBe('ignore');
  });
});
