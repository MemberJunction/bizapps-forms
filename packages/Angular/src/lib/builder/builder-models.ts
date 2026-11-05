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
 * has no page, no display position among questions and no answer, so nothing that walks questions
 * can accidentally reach one.
 *
 * Structurally an `AuthoredFormTree` (`@mj-biz-apps/forms-entities/contracts`) — live entities
 * satisfy its row types — so the snapshot builder, the rule gate and the tree helpers
 * (`welcomeScreenOf`, `endScreensOf`, `allQuestions`) all take this tree as it is.
 */
export interface FormTree {
  form: mjBizAppsFormsFormEntity;
  pages: PageNode[];
  screens: mjBizAppsFormsFormScreenEntity[];
}
