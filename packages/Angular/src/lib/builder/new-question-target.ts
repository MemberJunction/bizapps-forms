import type { BuilderSelection } from './builder-selection';
import type { PageNode } from './builder-models';

/**
 * Where a palette click puts its question, and what the canvas says about it.
 *
 * THE DEFECT THIS EXISTS FOR (#148). The rule used to be a private method that read the question
 * selection and nothing else, so clicking a section header highlighted one section and wrote to
 * another: `BuilderSelection` grew a `page` kind, the canvas rendered it as `is-selected`, and the
 * rule that picks the destination never learned to consult it. A private method on a component
 * also cannot be tested — this package's vitest runs in a node environment where the builder, with
 * its `inject()` and `templateUrl`, cannot be instantiated — which is the same reason
 * `builder-selection.ts` is a module rather than a pair of fields on the component.
 *
 * THE NOTICE TRAVELS WITH THE PAGE, deliberately. "Which section takes it" and "what do we tell
 * the author" are one decision, not two: the last-section fallback is only acceptable while it is
 * visible, and answering the two halves in two places is precisely how the highlight and the
 * destination came to disagree.
 */
export interface NewQuestionTarget {
  readonly page: PageNode;
  /** What the target section's header announces, or null to announce nothing. */
  readonly notice: string | null;
}

/** The author pointed at this section — directly, or at a question inside it. */
export const ADDING_HERE = 'Adding here';

/** The author pointed at something that is not a section, so the last one takes it. */
export const ADDING_TO_LAST = 'Adding to the last section';

/**
 * The section a new question from the palette belongs to.
 *
 * Order: the selected section, then the selected question's section, then the last section. Null
 * only when there is no section to put anything in, which is a palette click the caller drops.
 */
export function targetPageFor(
  selection: BuilderSelection,
  pages: readonly PageNode[],
): NewQuestionTarget | null {
  if (pages.length === 0) {
    return null;
  }
  const chosen = chosenPage(selection, pages);
  if (chosen) {
    return { page: chosen, notice: ADDING_HERE };
  }
  // A selection that points at no section still gets an answer — it just gets told which one.
  // Nothing selected is the one case with no author intent to confirm, so it says nothing.
  return {
    page: pages[pages.length - 1],
    notice: selection.kind === 'none' ? null : ADDING_TO_LAST,
  };
}

/** The section the selection points at, or undefined when it points at none. */
function chosenPage(selection: BuilderSelection, pages: readonly PageNode[]): PageNode | undefined {
  switch (selection.kind) {
    case 'page':
      return pages.find((p) => p.entity.ID === selection.id);
    case 'question':
      return pages.find((p) => p.questions.some((q) => q.entity.ID === selection.id));
    case 'screen':
    case 'none':
      // A screen belongs to no page, so there is nothing here to choose; the caller announces it.
      return undefined;
  }
}
