/**
 * The Forms entity names server code reads and writes — one map, so an engine, an entity server
 * subclass and an operation cannot spell one differently (the `MJ_BizApps_Forms: ` prefix comes from
 * `mj.config.cjs` and is easy to get subtly wrong by hand).
 *
 * Every engine imports this rather than declaring its own map; the subclasses' exported
 * `*_ENTITY_NAME` constants are taken from it too.
 */
export const FORMS_ENTITY = {
  Form: 'MJ_BizApps_Forms: Forms',
  FormVersion: 'MJ_BizApps_Forms: Form Versions',
  FormPage: 'MJ_BizApps_Forms: Form Pages',
  FormQuestion: 'MJ_BizApps_Forms: Form Questions',
  FormQuestionOption: 'MJ_BizApps_Forms: Form Question Options',
  FormScreen: 'MJ_BizApps_Forms: Form Screens',
  FormStyle: 'MJ_BizApps_Forms: Form Styles',
  FormAutomation: 'MJ_BizApps_Forms: Form Automations',
  FormEntityBinding: 'MJ_BizApps_Forms: Form Entity Bindings',
  FormDistribution: 'MJ_BizApps_Forms: Form Distributions',
} as const;
