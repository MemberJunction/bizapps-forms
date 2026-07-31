# @mj-biz-apps/forms-server

## 0.3.0

### Minor Changes

- 6830bde: Repair the anonymous submit path, raise the MemberJunction floor to 5.50.0, and scope CodeGen with an allow-list.

  **A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.50.0` and the packages' peer ranges moved to `^5.50.0`. A host below that can no longer install Forms. The old `>=5.43.0` floor was never real: `bizapps-common` and `bizapps-tasks` both require `>=5.44.0` and are hard dependencies, so Forms promised a configuration that could not exist.

  **The anonymous submit path could never succeed in 0.2.x.** Two independent defects, either of which alone breaks every public submission — the one thing the product exists to do.

  - The published-version check compared GUIDs case-sensitively. The snapshot embeds the client-minted (lowercase) id; SQL Server returns it uppercased; the widget echoes the snapshot's spelling back. Every submission was rejected with `version-mismatch`.
  - The scroll form ran the browser's native submit. The component is standalone and does not import `FormsModule`, so `(ngSubmit)` bound to nothing, the page navigated away, and the in-flight mutation was aborted — which also hid the error above, so the form appeared to silently reset and discard the respondent's answers.

  **On-submit hooks reported failures with no cause.** `createPerson`, `createTask` and `createTaskLink` collapsed MJ's per-field validation detail into a bare `null`, so a real defect surfaced as `"Failed to create Person record."` and nothing else. They now carry the provider's explanation, and a fourth silent `null` for an entity missing from metadata says which entity and why.

  **CodeGen is now scoped by an `includeSchemas` allow-list.** A deny-list can only name schemas known in advance; a real deployment holds Open Apps this repo has never heard of, and generating their artifacts here is what took MJAPI down in #10. Anything unnamed is now out of scope by construction. The generated output is byte-identical to the deny-list run, so this is behaviour-preserving.

  Also fixes contamination the #10 fix missed (`apps/MJAPI/schema.graphql` carried 392 foreign-schema references), extends the regression gate to catch it, adds the root `build:widget` script the server's own error message told operators to run, and ships a `.env.example` so the repo can be stood up at all.

### Patch Changes

- Updated dependencies [6830bde]
  - @mj-biz-apps/forms-core-entities-server@0.3.0
  - @mj-biz-apps/forms-entities@0.3.0
  - @mj-biz-apps/forms-actions@0.3.0
  - @mj-biz-apps/forms-ng@0.3.0

## 0.2.1

### Patch Changes

- 234286f: Scope CodeGen output to the Forms schema so MJAPI can start (#10)

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

- Updated dependencies [234286f]
  - @mj-biz-apps/forms-entities@0.2.1
  - @mj-biz-apps/forms-actions@0.2.1
  - @mj-biz-apps/forms-ng@0.2.1
  - @mj-biz-apps/forms-core-entities-server@0.2.1

## 0.2.0

### Minor Changes

- 8fbf9fb: Phase 1: anonymous forms, submit hardening, AI authoring and reporting

  Adds the first working slice of MJ Forms:

  - public submit endpoint with anonymous magic-link scope enforcement (create-only on response entities) and anti-abuse hardening: Cloudflare Turnstile (per-form, fail-closed), rate limiting, distribution and form quotas, and duplicate-submission recovery
  - the `<mj-form>` respondent widget as a shell-free Angular custom element, with scroll and one-question render modes, design-token theming, conditional logic, file upload and debounced partial-save
  - server-side `/f/:slug` magic-link redeem and widget bundle serving
  - metadata-driven AI form authoring from a plain-language brief, plus 5 starter templates
  - 4 on-submit actions: person upsert, confirmation email, follow-up task, and written-response analysis
  - reporting dashboard with summaries, per-question breakdowns, net promoter score, funnel, response views and CSV or Excel export

### Patch Changes

- Updated dependencies [8fbf9fb]
  - @mj-biz-apps/forms-entities@0.2.0
  - @mj-biz-apps/forms-actions@0.2.0
  - @mj-biz-apps/forms-ng@0.2.0
  - @mj-biz-apps/forms-core-entities-server@0.2.0
