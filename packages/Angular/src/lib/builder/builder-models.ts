import type {
  mjBizAppsFormsFormEntity,
  mjBizAppsFormsFormPageEntity,
  mjBizAppsFormsFormQuestionEntity,
  mjBizAppsFormsFormQuestionOptionEntity,
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

/** The full loaded form tree the builder operates over. */
export interface FormTree {
  form: mjBizAppsFormsFormEntity;
  pages: PageNode[];
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
