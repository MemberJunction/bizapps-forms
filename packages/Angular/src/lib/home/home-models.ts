import type { mjBizAppsFormsFormEntityType } from '@mj-biz-apps/forms-entities';

/**
 * Read-models for the Forms home/studio surface (the first-class Explorer
 * "Forms" tab — FORMS_BUILD_PLAN §3.2).
 *
 * The *shapes* are hand-written on purpose: the home grid is read-only and loaded
 * via `RunView` with `ResultType: 'simple'`, so a small projection keeps this
 * surface from depending on the full entity class. The *field types* still come
 * from CodeGen (see `FormStatus`) — decoupling the shape is a projection; retyping
 * a value-list union by hand is a copy that silently goes stale.
 */

/** Entity names (PHASE1_DECOMPOSITION entity-name table). */
export const HOME_ENTITY = {
  forms: 'MJ_BizApps_Forms: Forms',
  categories: 'MJ_BizApps_Forms: Form Categories',
  responses: 'MJ_BizApps_Forms: Form Responses',
  actions: 'MJ: Actions',
} as const;

/** Action names (registered by WP-C; see packages/Actions custom/authoring + templates). */
export const HOME_ACTION = {
  generateFromBrief: 'Forms: Generate Form From Brief',
  createFromTemplate: 'Forms: Create Form From Template',
} as const;

/**
 * The lifecycle states a form can be in. Derived from the entity rather than
 * re-typed by hand: the union is CodeGen output from the column's CHECK
 * constraint, so a hand-copied copy silently stops tracking it the next time a
 * migration widens the list.
 */
export type FormStatus = mjBizAppsFormsFormEntityType['Status'];

/** A single row in the Forms home grid. */
export interface FormSummaryRow {
  id: string;
  name: string;
  status: FormStatus;
  categoryName: string | null;
  updatedAt: Date | null;
  responseCount: number;
}

/** Raw `Forms` columns pulled by the simple RunView (subset we display). */
export interface FormSimpleRecord {
  ID: string;
  Name: string;
  Status: FormStatus;
  CategoryID: string | null;
  __mj_UpdatedAt: Date | string | null;
}

/** Raw `Form Categories` columns for name resolution. */
export interface FormCategorySimpleRecord {
  ID: string;
  Name: string;
}

/** Raw `Form Responses` columns for per-form counts. */
export interface FormResponseSimpleRecord {
  FormID: string;
}
