/**
 * `@mj-biz-apps/forms-core-entities-server/testing` — test support for every server-side layer of
 * MJ Forms. Not part of the package's runtime entry: nothing in `../index.ts` imports this, so a
 * host loading the package never evaluates it.
 */
export * from './fake-provider.js';
