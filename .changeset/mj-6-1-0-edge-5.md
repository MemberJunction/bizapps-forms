---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-core-entities-server': patch
'@mj-biz-apps/forms-ng': patch
---

Move MemberJunction to `6.1.0-edge.5`

`6.1.0-edge.5` is the current `edge` dist-tag, three releases past the `6.1.0-edge.2` this repo was
pinned at. All 54 `@memberjunction/*` specifiers move together — the exact `dependencies` in
`apps/MJAPI`, the exact root `devDependencies` and `pnpm.overrides`, and the caret `peerDependencies`
floors in all five packages. They move as one because a single stale pin forks the dependency graph,
and under pnpm that surfaces as a build failure rather than a silent duplicate.

`mj-app.json`'s `mjVersionRange` moves to `>=6.1.0-edge.5 <7.0.0`. **This is the part a host has to
act on**: `mj app install` validates that range against the installed MJ, so a host still on
`6.1.0-edge.4` or below is now refused rather than installed into. Hosts already running our sibling
Open Apps are unaffected — `bizapps-common` and `bizapps-tasks`, both hard dependencies of Forms,
declare the same floor.

Nothing in Forms' own source needed to change: a forced rebuild against edge.5 compiled all five
packages with no type errors, and all 2,952 tests pass. No respondent-facing or API-facing behaviour
differs.
