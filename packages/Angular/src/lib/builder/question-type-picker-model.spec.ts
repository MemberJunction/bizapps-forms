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
