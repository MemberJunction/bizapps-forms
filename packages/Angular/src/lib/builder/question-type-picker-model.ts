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
  type QuestionPaletteGroup,
  type QuestionTypeMeta,
} from './question-type-catalog';

/** One rendered block of the dialog: a heading, and the types under it. */
export interface PickerGroup {
  readonly heading: QuestionPaletteGroup;
  readonly types: readonly QuestionTypeMeta[];
}

/** The dialog's contents: the whole catalog, under the palette's own headings. */
export function pickerGroups(): PickerGroup[] {
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
 * "No row is highlighted" — the resting state, and what the list holds whenever the pointer is
 * inside it.
 *
 * The mouse owns the highlight through CSS `:hover`, which cannot get stuck because it is not
 * state. The keyboard owns it through this index. Letting both paint at once put two lit rows on
 * screen, and letting the mouse WRITE this index left a row lit after the pointer had gone —
 * which is the bug this constant exists to make unrepresentable.
 */
export const NO_HIGHLIGHT = -1;

/**
 * Where the highlight lands after an arrow key.
 *
 * Wraps, so a held arrow never dead-ends against either end of a twenty-five row list.
 *
 * FROM {@link NO_HIGHLIGHT} the first press lands at an END of the list — top for Down, bottom
 * for Up — rather than wherever the modulo of -1 happens to fall, which is neither end and looks
 * like the list moved on its own.
 *
 * An empty list highlights nothing at all: a marked row that is not on screen would let Enter
 * commit whatever later filled the slot.
 */
export function movedHighlight(current: number, delta: number, count: number): number {
  if (count <= 0) {
    return NO_HIGHLIGHT;
  }
  if (current === NO_HIGHLIGHT) {
    return delta > 0 ? 0 : count - 1;
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

/**
 * What the DIALOG does with a keypress — as opposed to what the focused control does with it.
 *
 * THE DEFECT THIS ENCODES AWAY, reproduced against the running builder: with a row
 * keyboard-highlighted, tabbing to the dialog's Close button and pressing Enter inserted a
 * question into the form. The panel's handler caught the Enter meant for Close and picked the
 * highlighted row. Trying to dismiss the dialog silently edited the form, which is the worst
 * shape a keyboard bug can take — the key that means "get me out of here" committed a write.
 *
 * The rule: THE PANEL HANDLES KEYS ONLY WHILE THE PANEL ITSELF HOLDS FOCUS. The moment focus is
 * on a control inside it, that control owns its keys — and for a `<button>` that means the
 * browser's own Enter and Space activation, which is why the rows need no key handling at all.
 * Space is never claimed here for the same reason; claiming it is how the rows came to do
 * nothing on Space while Enter did something wrong.
 *
 * TAB IS THE EXCEPTION and must be trapped wherever focus sits, because the thing it does
 * otherwise is walk out of the modal into the builder behind the overlay.
 */
export type PickerKeyAction =
  | 'move-down'
  | 'move-up'
  | 'activate'
  | 'trap-forward'
  | 'trap-back'
  | 'ignore';

export function pickerKeyAction(key: string, shiftKey: boolean, focusIsOnPanel: boolean): PickerKeyAction {
  if (key === 'Tab') {
    return shiftKey ? 'trap-back' : 'trap-forward';
  }
  if (!focusIsOnPanel) {
    return 'ignore';
  }
  if (key === 'ArrowDown') {
    return 'move-down';
  }
  if (key === 'ArrowUp') {
    return 'move-up';
  }
  return key === 'Enter' ? 'activate' : 'ignore';
}
