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
 * SEARCH FLATTENS, deliberately: once you are typing, ranking beats structure, and the headings
 * become noise between you and the two things that matched.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMON_TYPES,
  commonTypes,
  movedHighlight,
  pickerGroups,
  pickerTypes,
  SEARCH_HEADING,
} from './question-type-picker-model';
import { QUESTION_PALETTE_GROUPS } from './question-type-catalog';

describe('pickerGroups', () => {
  it('shows the palette’s own groups, in the palette’s own order, when nothing is typed', () => {
    expect(pickerGroups('').map((g) => g.heading)).toEqual([...QUESTION_PALETTE_GROUPS]);
  });

  it('keeps a group’s types together', () => {
    const choice = pickerGroups('').find((g) => g.heading === 'Choice');
    expect(choice?.types.map((t) => t.label)).toContain('Multiple choice');
    expect(choice?.types.map((t) => t.label)).toContain('Checkboxes');
    expect(choice?.types.map((t) => t.label)).toContain('Dropdown');
  });

  it('flattens to one list once the author starts typing', () => {
    // One group, not seven: the headings are noise between a query and the rows that matched.
    // The list is WIDER than the labels that match — "email" also finds Contact info, whose hint
    // is "Name, email, phone and company in one block". That is the hint search doing its job,
    // not a leak: an author typing "email" may well want the block that collects one.
    const groups = pickerGroups('email');
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe(SEARCH_HEADING);
    expect(groups[0].types.map((t) => t.label)).toContain('Email');
  });

  it('searches the hint as well as the name, so a description finds the type', () => {
    // `searchQuestionTypes` already matches label, hint and type name. "pick one" is the hint on
    // Multiple choice and appears in no label — the case that proves the hint is searched.
    const labels = pickerGroups('pick one').flatMap((g) => g.types.map((t) => t.label));
    expect(labels).toContain('Multiple choice');
  });

  it('shows nothing rather than everything when the query matches no type', () => {
    // Falling back to the full catalog on a failed search is the worst arm: it looks like the
    // search silently did not run, and the author picks the wrong type off a list they think
    // was filtered.
    expect(pickerGroups('zzzz')).toEqual([]);
  });
});

describe('pickerTypes', () => {
  it('reads the groups in render order, which is what the arrow keys walk', () => {
    const groups = pickerGroups('');
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
    // The failed-search state. Returning 0 would highlight a row that is not on screen, and
    // Enter would then pick whatever later filled that slot.
    expect(movedHighlight(0, 1, 0)).toBe(-1);
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
    const everything = pickerTypes(pickerGroups('')).map((meta) => meta.type);
    for (const type of commonTypes()) {
      expect(everything).toContain(type.type);
    }
  });
});
