/**
 * Forms shared contract — the frozen cross-agent seams (PHASE1_DECOMPOSITION §S1/§S2).
 *
 * Downstream packages (forms-server, forms-ng, forms-actions) import the published-form
 * shape, the conditional-rule schema + evaluator, the submission transport types, and the
 * zod runtime validators FROM HERE. Do not fork these definitions.
 */
export * from './json-value';
export * from './conditional-rule';
export * from './question-types';
export * from './form-definition';
export * from './form-screens';
export * from './published-automation-builder';
export * from './answer-format';
export * from './social-links';
export * from './answer-canonical';
export * from './entity-binding';
export * from './entity-binding-merge';
export * from './legacy-automations';
export * from './submission';
export * from './starter-templates';
export * from './generation-progress';
export * from './readable-ink';
export * from './default-theme';
export * from './form-chat';
export * from './schemas';
