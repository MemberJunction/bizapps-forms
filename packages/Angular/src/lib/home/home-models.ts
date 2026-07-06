/**
 * Read-models for the Forms home/studio surface (the first-class Explorer
 * "Forms" tab — FORMS_BUILD_PLAN §3.2).
 *
 * These are deliberately decoupled from the generated `mjBizAppsForms*` entity
 * types: the home grid is read-only and loaded via `RunView` with
 * `ResultType: 'simple'`, so a small hand-written shape keeps this work
 * independent of CodeGen output while staying strongly typed (no `any`).
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

/** A single row in the Forms home grid. */
export interface FormSummaryRow {
  id: string;
  name: string;
  status: string;
  categoryName: string | null;
  updatedAt: Date | null;
  responseCount: number;
}

/** Raw `Forms` columns pulled by the simple RunView (subset we display). */
export interface FormSimpleRecord {
  ID: string;
  Name: string;
  Status: string;
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

/** A starter template the user can scaffold from. */
export interface StarterTemplateChoice {
  key: string;
  label: string;
  icon: string;
}

/**
 * Curated starter gallery shown in the "From template" picker. Keys MUST match
 * the keys the `Forms: Create Form From Template` action knows (WP-C
 * starter-templates.ts: contact, rsvp, nps, lead-capture, application).
 */
export const STARTER_TEMPLATES: readonly StarterTemplateChoice[] = [
  { key: 'contact', label: 'Contact form', icon: 'fa-solid fa-envelope' },
  { key: 'rsvp', label: 'Event RSVP', icon: 'fa-solid fa-calendar-check' },
  { key: 'nps', label: 'NPS / feedback', icon: 'fa-solid fa-gauge-high' },
  { key: 'lead-capture', label: 'Lead capture', icon: 'fa-solid fa-magnet' },
  { key: 'application', label: 'Application', icon: 'fa-solid fa-file-signature' },
] as const;
