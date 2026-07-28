---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
---

Scope CodeGen output to the Forms schema so MJAPI can start (#10)

`forms-server@0.2.0` shipped generated GraphQL resolvers for its dependencies'
schemas (`__mj_BizAppsCommon`, `__mj_BizAppsTasks`) as well as its own. Because
MJ's server-bootstrap merges every installed package's `RESOLVER_PATHS` into a
single type-graphql schema, installing forms alongside `tasks-server` and
`common-server` — the only supported configuration, since both are hard
`mj-app.json` dependencies — made the schema build abort with
`Schema must contain uniquely named types but contains multiple types named
"mjBizAppsTasksTaskActivity_"`, and MJAPI would not start at all.

`mj.config.cjs` now excludes the sibling schemas from CodeGen, and the
foreign-schema entity subclasses, resolvers, and Angular form components have
been removed from the generated output. `forms-server` now contributes 50
generated classes instead of 195, with zero overlap against either sibling
package.

The two on-submit actions that legitimately use sibling entity types
(`Forms: Create Followup Task`, `Forms: Upsert Respondent Person`) now import
those types from `@mj-biz-apps/tasks-entities` / `@mj-biz-apps/common-entities`
— the packages that own them — rather than from `@mj-biz-apps/forms-entities`.
The imports are type-only and fully erased at build time, so those packages are
declared as `devDependencies` (to typecheck this repo) plus `peerDependencies`
matching the ranges `mj-app.json` already requires — installing `forms-actions`
pulls in no new runtime dependency.

A `npm run lint:generated` gate plus a CI workflow now fail the build if an
unscoped CodeGen run ever reintroduces foreign-schema artifacts, or if
`excludeSchemas` itself stops covering a sibling schema — the latter matters
because a committed tree stays clean until someone regenerates, so an
artifact-only check would report PASS right up until the bug returned.

Note: `@mj-biz-apps/forms-entities` no longer re-exports `mjBizAppsCommon*` /
`mjBizAppsTasks*` entity classes. Those exports were an artifact of this bug and
were never part of the intended API; import them from the owning packages instead.
