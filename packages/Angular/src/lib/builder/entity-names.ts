/**
 * Canonical Forms entity names (PHASE1_DECOMPOSITION entity-name table).
 *
 * Always pass these EXACT strings to `Metadata.GetEntityObject<T>(name, contextUser)`
 * and `RunView({ EntityName })`. Centralised here so the builder never hard-codes a
 * stray string literal that could drift from the metadata.
 */
export const FORMS_ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormCategory: 'MJ_BizApps_Forms: Form Categories',
  FormStyle: 'MJ_BizApps_Forms: Form Styles',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormResponse: 'MJ_BizApps_Forms: Form Responses',
  FormResponseAnswer: 'MJ_BizApps_Forms: Form Response Answers',
  FormDistribution: 'MJ_BizApps_Forms: Form Distributions',
} as const;
