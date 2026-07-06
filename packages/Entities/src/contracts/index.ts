/**
 * Forms shared contract — the frozen cross-agent seams (PHASE1_DECOMPOSITION §S1/§S2).
 *
 * Downstream packages (forms-server, forms-ng, forms-actions) import the published-form
 * shape, the conditional-rule schema + evaluator, the submission transport types, and the
 * zod runtime validators FROM HERE. Do not fork these definitions.
 */
export * from './json-value';
export * from './conditional-rule';
export * from './form-definition';
export * from './submission';
export * from './schemas';
