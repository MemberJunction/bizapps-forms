/**
 * Canonical Forms entity names (PHASE1_DECOMPOSITION entity-name table). These are
 * the EXACT strings passed to `provider.GetEntityObject<T>(name, contextUser)` and
 * `provider.EntityByName(name)`. Centralized so the resolver, persistence, and
 * scope-check services never drift on a literal.
 */
export const FORM_ENTITY = 'MJ_BizApps_Forms: Forms';
export const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';
export const FORM_STYLE_ENTITY = 'MJ_BizApps_Forms: Form Styles';
export const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
export const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
export const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';

/**
 * Definition entities the anonymous respondent session must NOT be able to create
 * (read-only for it). Create access on any of these is privilege accretion.
 */
export const FORM_DEFINITION_NO_CREATE_ENTITIES: readonly string[] = [
  FORM_ENTITY,
  FORM_VERSION_ENTITY,
  FORM_DISTRIBUTION_ENTITY,
];
