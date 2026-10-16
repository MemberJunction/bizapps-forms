/**
 * The `Forms: Bind Response To Entity` action. The binding executor, ledger and gateway it drives
 * live in `@mj-biz-apps/forms-core-entities-server`, beside the automation code that also runs them,
 * and are imported from there by every caller — this barrel does not re-export them.
 */
export * from './bind-response-to-entity.action';
