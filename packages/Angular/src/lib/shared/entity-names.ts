/**
 * Canonical Forms entity names (PHASE1_DECOMPOSITION entity-name table).
 *
 * Always pass these EXACT strings to `Metadata.GetEntityObject<T>(name, contextUser)`
 * and `RunView({ EntityName })`. Centralised here so no surface hard-codes a stray
 * string literal that could drift from the metadata.
 *
 * Lives in `lib/shared/` rather than under one feature area: the builder, the reporting
 * dashboard and the responses surface all need it, and a second copy is how two tables
 * of the same names drift apart. (This file and the dashboard service each carried one
 * until the responses extraction folded them together.)
 */
export const FORMS_ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormCategory: 'MJ_BizApps_Forms: Form Categories',
  FormStyle: 'MJ_BizApps_Forms: Form Styles',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormScreen: 'MJ_BizApps_Forms: Form Screens',
  FormResponse: 'MJ_BizApps_Forms: Form Responses',
  FormResponseAnswer: 'MJ_BizApps_Forms: Form Response Answers',
  FormDistribution: 'MJ_BizApps_Forms: Form Distributions',
  FormAutomation: 'MJ_BizApps_Forms: Form Automations',
  FormAutomationRun: 'MJ_BizApps_Forms: Form Automation Runs',
  FormEntityBindingRecord: 'MJ_BizApps_Forms: Form Entity Binding Records',
  FormUpload: 'MJ_BizApps_Forms: Form Uploads',
} as const;

/**
 * MJ core entity names the responses surface deep-links into. Not Forms entities — these
 * are the records a submission *produced* (its stored file, the action/agent run behind an
 * automation attempt), and the detail view links out to them.
 */
export const MJ_CORE_ENTITY = {
  File: 'MJ: Files',
  ActionExecutionLog: 'MJ: Action Execution Logs',
  AIAgentRun: 'MJ: AI Agent Runs',
} as const;
