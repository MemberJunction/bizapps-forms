import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
  mjBizAppsFormsFormScreenEntity,
} from '@mj-biz-apps/forms-entities';

/**
 * In-memory editable model the builder manipulates. Each node wraps the live MJ
 * BaseEntity (so we save through generated types, never `.Get()/.Set()`), plus the
 * loaded children. The builder edits the entity objects directly and persists them
 * via {@link BuilderStateService}.
 */

/** A question with its loaded options, ordered by DisplayOrder. */
export interface QuestionNode {
  entity: mjBizAppsFormsFormQuestionEntity;
  options: mjBizAppsFormsFormQuestionOptionEntity[];
}

/** A page with its loaded questions, ordered by DisplayOrder. */
export interface PageNode {
  entity: mjBizAppsFormsFormPageEntity;
  questions: QuestionNode[];
}

/**
 * The full loaded form tree the builder operates over.
 *
 * `screens` sits BESIDE `pages`, not inside it, which is the whole modelling decision: a screen
 * has no page, no display position among questions and no answer. Every helper below that walks
 * questions therefore cannot accidentally reach one.
 */
export interface FormTree {
  form: mjBizAppsFormsFormEntity;
  pages: PageNode[];
  screens: mjBizAppsFormsFormScreenEntity[];
}

/** The single Welcome screen, if the form has one. */
export function welcomeScreenOf(tree: FormTree): mjBizAppsFormsFormScreenEntity | undefined {
  return tree.screens.find((s) => s.ScreenType === 'Welcome');
}

/** The Ending screens in display order. */
export function endScreensOf(tree: FormTree): mjBizAppsFormsFormScreenEntity[] {
  return tree.screens
    .filter((s) => s.ScreenType === 'Ending')
    .sort((a, b) => a.DisplayOrder - b.DisplayOrder);
}

/** Flatten every question across all pages in page-then-question display order. */
export function allQuestions(tree: FormTree): QuestionNode[] {
  const result: QuestionNode[] = [];
  for (const page of tree.pages) {
    for (const q of page.questions) {
      result.push(q);
    }
  }
  return result;
}

/** Find the page that owns a question, or undefined. */
export function pageOfQuestion(tree: FormTree, questionId: string): PageNode | undefined {
  return tree.pages.find((p) => p.questions.some((q) => q.entity.ID === questionId));
}
