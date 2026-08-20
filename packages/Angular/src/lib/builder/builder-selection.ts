/**
 * What the builder's properties panel is showing: one question, one screen, or nothing.
 *
 * This replaces a pair of fields — `selectedQuestionId` and `selectedScreenId` — whose mutual
 * exclusivity was documented in a comment and enforced by whoever remembered. Four places wrote
 * them and one forgot: adding a question from the palette while a Welcome screen was selected set
 * the question id, left the screen id standing, and since the template tests the screen first,
 * the author's new question was created and then hidden behind the screen they had been editing.
 * No error, no warning; it just looked like the palette had done nothing.
 *
 * A single value of a union kind cannot be in that state, so the fifth write site cannot repeat
 * the mistake. Kept free of Angular so the invariant is testable — the package's vitest runs in a
 * node environment where components cannot be instantiated.
 */

/** The panel's subject. Exactly one thing, or nothing. */
export type BuilderSelection =
  | { readonly kind: 'question'; readonly id: string }
  | { readonly kind: 'screen'; readonly id: string }
  | { readonly kind: 'none' };

/** The empty selection. A shared constant: it carries no identity worth allocating twice. */
export const NOTHING_SELECTED: BuilderSelection = { kind: 'none' };

/** Show this question, whatever was showing before. */
export function selectQuestion(id: string): BuilderSelection {
  return { kind: 'question', id };
}

/** Show this screen, whatever was showing before. */
export function selectScreen(id: string): BuilderSelection {
  return { kind: 'screen', id };
}

/** The selected question's id, or null when a screen (or nothing) is selected. */
export function questionId(selection: BuilderSelection): string | null {
  return selection.kind === 'question' ? selection.id : null;
}

/** The selected screen's id, or null when a question (or nothing) is selected. */
export function screenId(selection: BuilderSelection): string | null {
  return selection.kind === 'screen' ? selection.id : null;
}

/**
 * Drop the selection if it is this question — for when the question is deleted.
 *
 * Returns the SAME value when it does not match, so a caller can assign the result
 * unconditionally without churning change detection on every unrelated delete.
 */
export function clearIfQuestion(selection: BuilderSelection, deletedId: string): BuilderSelection {
  return questionId(selection) === deletedId ? NOTHING_SELECTED : selection;
}

/** Drop the selection if it is this screen — for when the screen is deleted. */
export function clearIfScreen(selection: BuilderSelection, deletedId: string): BuilderSelection {
  return screenId(selection) === deletedId ? NOTHING_SELECTED : selection;
}
