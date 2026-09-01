/**
 * What the insert popover lists, and how the keyboard moves through it.
 *
 * The popover is the second way into the question-type catalog — the left palette is the first —
 * so the one thing it must not do is present that catalog differently. It shows the SAME groups
 * in the SAME order, with the same icons and hints, because two orderings of twenty-five items
 * in one screen is a map the author has to learn twice.
 *
 * ALPHABETICAL WAS THE OTHER OPTION and is worse here for two concrete reasons, not for taste:
 * `Checkbox` and `Checkboxes` would sit adjacent under C, near-identical names on genuinely
 * different types with only the hint to separate them; and `Multiple choice`, `Checkboxes` and
 * `Dropdown` — one authoring decision — would scatter to M, C and D. Authors reach for "a choice
 * question", not for a letter.
 */
import type { FormQuestionType } from '@mj-biz-apps/forms-entities';
import {
  QUESTION_PALETTE_GROUPS,
  questionTypeMeta,
  questionTypesInGroup,
  searchQuestionTypes,
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';

/** One rendered block of the popover: a heading, and the types under it. */
export interface PickerGroup {
  /** The palette group's name, or {@link SEARCH_HEADING} once the list is a ranked one. */
  readonly heading: QuestionPaletteGroup | typeof SEARCH_HEADING;
  readonly types: readonly QuestionTypeMeta[];
}

/** The single heading a filtered list sits under. */
export const SEARCH_HEADING = 'Matches';

/**
 * The popover's contents for the current query.
 *
 * SEARCH FLATTENS. Once the author is typing, ranking beats structure and the headings are noise
 * between them and the two rows that matched — so a query collapses the seven groups into one
 * list, in `searchQuestionTypes`' own order (which matches label, hint AND type name, so "pick
 * one" finds Multiple choice through its hint).
 *
 * A query matching nothing returns NO groups, rather than falling back to the whole catalog. The
 * fallback reads as a search that silently did not run, and the author then picks off a list they
 * believe was filtered.
 */
export function pickerGroups(query: string): PickerGroup[] {
  if (query.trim().length > 0) {
    const matches = searchQuestionTypes(query);
    return matches.length > 0 ? [{ heading: SEARCH_HEADING, types: matches }] : [];
  }
  return QUESTION_PALETTE_GROUPS.map((heading) => ({ heading, types: questionTypesInGroup(heading) })).filter(
    (group) => group.types.length > 0,
  );
}

/**
 * The groups read as one list, in render order — what the arrow keys walk.
 *
 * Derived from the groups rather than recomputed from the catalog, so the highlight cannot get
 * out of step with what is on screen.
 */
export function pickerTypes(groups: readonly PickerGroup[]): QuestionTypeMeta[] {
  return groups.flatMap((group) => [...group.types]);
}

/**
 * Where the highlight lands after an arrow key.
 *
 * Wraps, so a held arrow never dead-ends against either end of a twenty-five row list.
 *
 * An EMPTY list highlights nothing — `-1`, not `0`. Zero would mark a row that is not on screen
 * (the failed-search state has none), and Enter would then commit whatever later filled the slot.
 */
export function movedHighlight(current: number, delta: number, count: number): number {
  if (count <= 0) {
    return -1;
  }
  return (((current + delta) % count) + count) % count;
}

/**
 * The shortcut list in the dialog's left rail.
 *
 * A FIXED, CURATED SET — not "recommended", and deliberately not called that. We have no usage
 * signal to recommend from: nothing records which types this author reaches for, and a label
 * implying personalisation over a hardcoded array is a claim the product cannot back. These four
 * are the ones almost every form has, and the rail exists to save a scan of the grid for them.
 *
 * Every entry is also in the grid. The rail is a shortcut INTO the catalog, never a second
 * catalog — a type reachable only from here would be invisible to anyone who searched first.
 */
export const COMMON_TYPES: readonly FormQuestionType[] = ['ShortText', 'SingleChoice', 'Email', 'LongText'];

/** {@link COMMON_TYPES} as catalog entries, in the order listed. */
export function commonTypes(): QuestionTypeMeta[] {
  return COMMON_TYPES.map((type) => questionTypeMeta(type));
}
