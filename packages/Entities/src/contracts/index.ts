/**
 * Forms shared contract — the frozen cross-agent seams (PHASE1_DECOMPOSITION §S1/§S2).
 *
 * Downstream packages (forms-server, forms-ng, forms-actions) import the published-form
 * shape, the conditional-rule schema + evaluator, the submission transport types, and the
 * zod runtime validators FROM HERE. Do not fork these definitions.
 */
export * from './json-value';
export * from './link-precedence';
export * from './conditional-rule';
export * from './rule-verbs';
export * from './scoring';
export * from './question-types';
export * from './doodle-pen';
export * from './form-definition';
export * from './form-screens';
export * from './published-automation-builder';
export * from './on-submit-dispatch';
export * from './answer-format';
export * from './answer-date';
export * from './social-links';
export * from './answer-canonical';
export * from './entity-binding';
export * from './entity-binding-merge';
export * from './legacy-automations';
export * from './submission';
export * from './resume';
export * from './starter-templates';
export * from './schemas';
export * from './sql-literal';
