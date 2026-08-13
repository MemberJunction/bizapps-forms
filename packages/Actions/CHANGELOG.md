# @mj-biz-apps/forms-actions

## 0.9.0

### Minor Changes

- cc13065: Migrate the workspace from npm to pnpm, remove the MJAPI/MJExplorer dev harness, and
  settle the MemberJunction graph on a single 6.1.0-edge.2 copy.

  Two dependency corrections ship with this and affect consumers:

  - `@mj-biz-apps/forms-server` declared `type-graphql` nowhere while importing it in
    `PublicFormResolver` and `graphql-types`. It resolved off a hoisted transitive copy
    under npm, so an installer outside this monorepo had no guarantee of getting it. Now
    declared as a peer at `2.0.0-beta.3`, matching what `@memberjunction/server` ships.
  - `UserCache` moved from `@memberjunction/sqlserver-dataprovider` to
    `@memberjunction/generic-database-provider` in MJ #3734, which lands in 6.1.0-edge.2.
    That was `forms-server`'s only sqlserver-dataprovider usage, so the peer swaps over
    entirely rather than being added alongside.

### Patch Changes

- Updated dependencies [cc13065]
  - @mj-biz-apps/forms-entities@0.9.0

## 0.8.0

### Minor Changes

- be2f81b: Add the canonical answer contract, and stop dropping Date, File and Score answers on the way to on-submit hooks.

  **A shared collapse, because every consumer was inventing its own.** `FormResponseAnswer` spreads one answer across six typed columns of which exactly one is populated, so anything that wants "the answer to question X" has to collapse that spread. Three collapses already existed and disagreed: the on-submit hooks' loader read three of the six columns, Caliber's intake driver wrote its own `collapseAnswers`, and entity binding needs all six. `@mj-biz-apps/forms-entities` now exports the single definition — `collapseAnswer`, `CanonicalAnswers`, `foldQuestionId`, `isFileAnswer` — with the precedence `TextValue → NumericValue → DateValue → BooleanValue → JSONValue → FileID` that the existing consumers already settled on.

  **Absent is not empty, and the distinction is load-bearing.** A question that was never answered is absent — its key is not in the map. A question answered with `''`, `0` or `false` is present and carries that value. The per-field merge policies that consume this contract can only honour "never blank out" if they can tell "they left it alone" from "they cleared it", so collapsing the two would silently let a short form erase what a longer form collected. `Has()` is the presence test.

  **Question GUIDs are compared case-folded, on both sides.** SQL Server renders `uniqueidentifier` uppercase while the widget mints question ids lowercase, so an exact-string lookup misses every field and presents as "every mapped field is missing" rather than as a casing bug. That defect has now shipped twice — here (fixed in 0.4.0) and in Caliber's intake driver — so `CanonicalAnswers` folds on both write and read and offers no unfolded way in. Folding is applied at comparison time only; stored data is never rewritten.

  **Date, File and Score answers reach hooks for the first time.** `AnswerWithType` carried only text/numeric/boolean/json, so a response containing a resume and an appointment date presented to every on-submit hook as though neither question had been answered, with nothing to distinguish dropped from unanswered. It now projects `dateValue`, `fileId` and `score`, and `FormResponseContext` additionally exposes `canonicalAnswers` so consumers writing answers onward do not re-derive the collapse. File answers stay distinguishable from strings — only a file may be written to a `File`-FK column, and only a file needs an upload-provenance check, neither of which a bare GUID string can signal.

  **Fixes: a FileUpload answer was never persisted, and a required one made the form unsubmittable.** `answerValueOf` inspected every typed column except `fileId`, so `collectVisibleQuestion` classified a file answer as unanswered: on an optional question the answer was dropped before persistence, leaving `FormResponseAnswer.FileID` never written by the public submit path at all; on a required question the submit was rejected with `"<prompt>" is required.` even though the upload had already succeeded, so nothing the respondent could do would clear the error. Found while building the contract above — the collapse's `FileID` branch had no producer. A file answer now reads as a supplied answer (and so also satisfies `isAnswered` in conditional logic, which is what uploading a file means).

  **A failed answer read is no longer silent.** `loadFormResponseContext` returned `[]` both when a response genuinely had no answers and when the `RunView` failed. That pair is safe to conflate while consumers only read, and dangerous once they write: a transient read failure would present as "the respondent answered nothing" and a binding would create a record with every mapped field blank. The failure is now logged with the response id; callers still degrade to an empty list. The sibling question read got the same treatment, where the degradation is quieter still: without the questions, every answer falls back to `questionType: 'ShortText'` with an empty prompt, which no consumer can tell apart from a form genuinely built that way — and `Forms: Analyze Written Responses` treats ShortText as analyzable, so it would score every answer and persist the result.

  **The on-submit automation layer and entity binding.** `FormAutomation`, `FormAutomationRun`, `FormEntityBinding` and `FormEntityBindingRecord` land together with their generated entities, because the settled v1 scope is the full layer and `FormAutomation` carries `EntityBinding` as a target type from the start. The published snapshot now carries an `automations[]` array — automations execute from the snapshot, never from the live rows, so a response runs the configuration that its own form version was published with. `planAutomations` decides what runs and in what order (Sync before Async, then DisplayOrder, then authoring order); `runAutomations` carries that out, containing failures so a side effect can never fail a submission that is already saved. Entity binding ships its config vocabulary (field mappings, identity rule, per-field merge policy), a pure merge planner, and an executor whose MJ I/O sits behind a gateway so the decisions that quietly corrupt data are testable without a database.

  **Wired to the submit path, with the legacy list as the fallback.** `runSubmitPipeline` dispatches a form's configured automations when its published snapshot carries any, and fires the legacy hard-coded hook list otherwise. That fallback is what makes the switch safe to land before anything is republished: every snapshot published before this carries an empty array, so every existing form takes the legacy path and behaves exactly as it did. Publishing is what copies the authored `FormAutomation` rows into the snapshot — a binding that is configured but not republished does nothing, by design.

  **The service principal is required, and failing to resolve it is fail-closed.** Automations run under a seeded `Forms Automation Runner` identity, never under the anonymous respondent and never under a fallback system user. A deployment that has not provisioned it gets no automations and a clear log line, rather than privileged work running as somebody broader.

- c30ac35: Ship the metadata seed, so a clean `mj app install` produces a Forms install that actually works.

  **MJ Forms has never shipped a metadata seed migration, for any release.** `mj-app.json` names a
  `metadata` directory, but MJ's manifest schema is explicit that `metadata.directory` is a
  dev-time pointer the install engine **never reads** — seeding happens exclusively through
  `migrations/`. Everything `mj sync push` created therefore existed only on the machine that ran it.
  A clean install produced a Forms deployment with no `Form Respondent` role, no `CanCreate` grant on
  the response entities, no styles, categories, application, nav, dashboards or AI authoring — which
  is to say the anonymous submit path, the product, could not run. Every step reported success. The
  mechanical cause was a missing `sqlLogging.formatAsMigration` block in `metadata/.mj-sync.json`,
  without which a push writes to the database and leaves no artifact; both sibling Open Apps
  (`bizapps-common`, `bizapps-tasks`) ship one and Forms did not.

  `V202608081700__v0.8.x__Metadata_Sync.sql` now carries all 82 records. It was generated against a
  database whose Forms metadata had been emptied, so every statement is a CREATE, and it was verified
  by emptying that database again and replaying **the migration** rather than the push.

  **The generator's output cannot ship verbatim, and this is the trap to remember.** MetadataSync
  writes core stored-procedure calls with `${flyway:defaultSchema}` because in MJ's own repository the
  default schema _is_ the core schema. Here it is `__mj_BizAppsForms`, so all 67 core calls would have
  executed as `__mj_BizAppsForms.spCreateRole` — an object that does not exist — on every install.
  They are rewritten to `${mjSchema}`; the 20 Forms-schema calls go the other way, literal to
  placeholder.

  **On-submit automations now work out of the box.** The seed ships the `Forms Automation Service`
  principal together with a new `metadata/user-roles/` grant linking it to `Forms Automation Runner`.
  The two must ship together: `resolveAutomationPrincipal()` resolves by name, so the user without the
  grant is worse than neither — it turns "automations skipped, principal absent" into a principal that
  resolves and then fails on permissions at the first read. Grants on binding **target** entities
  remain unshipped; that set is the real ceiling on what a form author can reach through a binding and
  stays the deployment's decision. Two defects in the users metadata are fixed on the way: its `Title`
  was 72 characters against a 50-character limit, so the record could never have saved at all.

  **`${commonSchema}` no longer ships.** `mj migrate` builds Skyway's placeholder map from this repo's
  `mj.config.cjs`, but `mj app install` builds it from the _host's_, which has never heard of us — and
  Skyway deliberately leaves an unknown `${…}` untouched instead of failing. The literal string
  therefore survived into the `@ExcludedSchemaNames` argument of five CodeGen sweeps in two
  migrations, silently disabling the `__mj_BizAppsCommon` exclusion so a Forms migration would rewrite
  a sibling app's entity metadata — the same contamination class as issue #10. The placeholder is
  replaced with literal schema names and removed from `mj.config.cjs` so CodeGen cannot re-emit it.

  **`mj app remove` now retires this app's rows from the shared core schema**
  (`migrations-teardown/V001`, declared via `migrations.teardownDirectory`). Dropping
  `__mj_BizAppsForms` cannot reach the roles, actions, prompts, templates and dashboards the seed
  writes into `__mj`, and leaving them behind makes the next install collide on their fixed UUIDs. The
  engine is ported from `bizapps-caliber` and discovers dependents from `sys.foreign_keys` at apply
  time rather than trusting a build-time ordering. Two fixes were needed for Forms: remove runs the
  teardown _before_ dropping the app schema, so `FormAutomation` rows still reference the Actions being
  retired — leaving them blocks the delete on `FK_FormAutomation_Action`, and releasing the reference
  violates `CK_FormAutomation_SingleTarget`. Either way the single transaction rolls back and an
  installation that had ever configured one automation could not be removed at all. Own-schema
  references are now doomed rather than released, and the FK walk spans both schemas so
  `FormAutomationRun` follows its parent.

  **`SchemaInfo.EntityNamePrefix` is now declared in the database**
  (`V202608081800__v0.8.x__Seed_SchemaInfo_EntityNamePrefix.sql`). CodeGen resolves the prefix from
  `mj.config.cjs` first and `SchemaInfo` second; a host has the latter and not the former, so any
  Forms entity a host's CodeGen run adds would be named without `MJ_BizApps_Forms: ` while
  `@mj-biz-apps/forms-entities` registers the prefixed name — a silent registration miss. This is
  `bizapps-caliber`'s #119, inoculated against here before it could bite.

  **`npm run lint:distribution` guards both defect classes** — metadata that has drifted from the
  shipped seed, and any placeholder in shipped SQL that `mj app install` cannot resolve — with
  self-tests proving the gate fires, and a `distribution-gate.yml` workflow running it on every push
  and pull request touching metadata, migrations or the manifest.

- de1998f: Upgrade MemberJunction to 6.1.0-edge.1 (task-graph line) and regenerate CodeGen
  output against the 6.1 generator: GraphQL reverse-relationship resolver fields
  lose the redundant schema prefix (mjBizAppsFormsMJ*BizApps_Forms_Forms*… →
  mjBizAppsFormsForms\_…), shrinking apps/MJAPI/schema.graphql accordingly.

### Patch Changes

- Updated dependencies [be2f81b]
- Updated dependencies [c30ac35]
- Updated dependencies [de1998f]
  - @mj-biz-apps/forms-entities@0.8.0

## 0.7.0

### Minor Changes

- 4080fac: Make Forms installable on PostgreSQL, without a CodeGen run.

  **A minor rather than a patch, because a new install target ships.** `migrations-pg/` previously held nothing but a README saying it was empty until the SQL Server migrations existed. It now carries the two converted DDL/metadata migrations plus one `.pgonly.sql` capture of CodeGen's PostgreSQL objects, so a PostgreSQL host can install Forms the way a consumer actually installs an Open App — `mj app install`, not `mj codegen`. No SQL Server behaviour changes: `migrations/` is untouched.

  **Verified on a virgin PostgreSQL 16.11** — the oldest major supported, deliberately, not the newest — with MJ core and bizapps-common installed first (Forms hard-FKs `__mj_BizAppsCommon.Person`). Result: 10 tables, 10 base views, 30 CRUD functions, 10 triggers, 10 entities, 121 fields, 39 permissions, 13 relationships; a subsequent `mj codegen` produces a 0-line diff across metadata, `pg_get_viewdef`/`functiondef`/`triggerdef` and column defaults; a 19-assertion functional test (`scripts/pg-objectmodel-test.mjs`) passes; MJAPI boots against it. Runbook and measured numbers in `migrations-pg/docs/PG_INSTALL_VERIFICATION.md`.

  **The CodeGen objects are captured from the catalog, not from CodeGen's SQL log.** That log records only entities whose metadata changed, and these migrations already carry the metadata — so CodeGen logged almost nothing while still building every object. Without the capture an install has tables and registered entities but no base views and no CRUD functions, i.e. nothing the API can read or write through.

  **`mj.config.cjs` gains lower-case twins** for `schemaPlaceholders`, `includeSchemas` and `NameRulesBySchema`. PostgreSQL folds unquoted identifiers, so CodeGen reads the schema back as `__mj_bizappsforms` while these rules match case-sensitively; the generic `__mj` rule then matches that name's _prefix_ and emits `${mjSchema}_bizappsforms`, a schema that does not exist. The same pass names `__mj_BizAppsCommon` explicitly, which had no rule at all and was being rewritten by the generic rule in the shipped T-SQL (harmlessly there, since `mjSchema` is `__mj` — but it is a reference this repo does not own).

  Several converter gaps in CLI 5.51.0 are worked around here and worth reporting upstream: `--bake-codegen` emitted no CodeGen objects; BIT→BOOLEAN literals were not coerced (1,590 rewritten by looking each target column's type up in `information_schema`); the schema qualifier came out quoted in `CREATE TABLE` and unquoted in `ALTER TABLE`; cross-schema `REFERENCES` kept a mixed-case schema name that no unquoted schema matches; and the four CodeGen reconciliation `EXECUTE`s were reported unhandled despite existing natively on PostgreSQL — they are ported as `SELECT`s because they rewrite placeholder field `Sequence` values into real ordinals.

### Patch Changes

- Updated dependencies [4080fac]
  - @mj-biz-apps/forms-entities@0.7.0

## 0.6.0

### Patch Changes

- @mj-biz-apps/forms-entities@0.6.0

## 0.5.0

### Minor Changes

- 287cfc7: Ship the `<mj-form>` widget bundle, and make client and server agree on what a valid answer is

  **The bundle (#20).** No published `forms-ng` tarball has ever contained
  `dist/widget/mj-form.js` — verified by downloading all five on npm (`0.0.0`, `0.2.0`, `0.2.1`,
  `0.3.0`, `0.4.0`) and listing their contents. `0.0.0` predates the widget, so the four releases
  from `0.2.0` on shipped the AOT-compiled `dist/widget-entry.js` with nothing that bundles it:
  `/forms/widget/mj-form.js` 404'd, the custom element never upgraded, and no public form ever
  rendered. The bundler was never broken — it lived in a separate `build:widget` script that no CI
  path invoked. `build` now runs both halves (`ngc && node scripts/build-widget.mjs`).

  It survived all four because turbo declares `outputs: ["dist/**"]`: anyone who ran `build:widget`
  by hand had the artifact captured into the build cache as if `build` had produced it, so local
  builds looked correct forever after while cold-cached CI never made it.
  `.github/scripts/validate-widget-bundle.sh` now asserts against the pack manifest — presence,
  plausible size, zero unlinked `ngDeclare` sites, and that the element registers — and runs on
  every PR as well as before publish.

  **One definition of "answered".** The predicate was hand-written in four places, and they had
  already drifted: the conditional evaluator tested `answer.length > 0` while all three validators
  tested `value.trim().length > 0`. A respondent who typed a single space into an optional question
  therefore satisfied an `isAnswered` conditional — revealing whatever branch depended on it —
  while that same question simultaneously reported as unanswered. `isAnswerSupplied` in
  `@mj-biz-apps/forms-entities` is now the only copy, and whitespace is not an answer.

  **Type-derived format validation.** `Email`, `Number`, `Rating` and `NPS` questions authored
  without an explicit `validationRule` were validated by the widget but not by the server, so a
  direct POST at `SubmitFormResponse` persisted `not-an-email` into an `Email` question as a
  `Complete` response — while the service's own docstring claimed format could not be bypassed.
  `Phone` and `Date` were validated by _neither_ side; the widget's type switch fell through to
  `default: return VALID` for both. The check now lives in `@mj-biz-apps/forms-entities`
  (`validateAnswerFormat`) and both sides call it. An explicit `ValidationRule` still applies on
  top and can narrow a type further.

  Two gaps in that check are closed with it. `Date` accepted any non-string outright, so answering
  a `Date` question with `numericValue` skipped validation entirely and stored a number on a date
  question — `dateValue` is a plain GraphQL `String` with no date scalar behind it, so nothing
  upstream had vetted it either. And `Number` accepted anything `Number()` could convert, which
  includes `0x10`, `0b101` and `0o17`; those passed as valid and were then persisted as the literal
  text typed, which nothing downstream reads back as a number.

  A numeric `min`/`max` is now enforced on any answer that IS a number, not only on one that
  arrived in the `numericValue` column. The rule path branched on `typeof value`, so
  `{ numericValue: 9999 }` was rejected against `max: 100` and `{ textValue: "9999" }` was
  accepted — while the widget coerced the string and rejected both. The builder only offers
  `min`/`max` on numeric question types, and the widget sends those as `numericValue`, so reaching
  this needed a direct call at the mutation rather than the ordinary UI — which is exactly the
  traffic a public anonymous endpoint has to assume.

  **An unsubmittable form.** `matchesValidationPattern` is now shared too. The widget treated an
  author `pattern` that would not compile as valid (never block the respondent) and the server
  treated it as invalid, so a form carrying a malformed regex showed no error while being filled in
  and then refused every submit with a field error no input could clear. Both sides now fail open;
  the type floor still applies underneath, and the respondent is not the one who made the mistake.

  **Autosave drafts.** A `partial` (autosave) save is no longer held to finished-value rules — a
  half-typed email or a value still under `minLength` no longer fails the debounced autosave and
  discards the respondent's progress. Upper bounds (`maxLength`, `max`) ARE still enforced on a
  draft: "not finished yet" and "already too big" are different claims, and exempting the ceilings
  meant an author's `maxLength` bought nothing on the autosave path — which matters here because
  `TextValue` is `NVARCHAR(MAX)` and the widget sets no `maxlength` attribute. A question with no
  `validationRule` at all is still bounded only by MJAPI's 50mb body limit, on both paths; a global
  answer-size cap would be a product decision, not a bug fix.

  **When the widget shows an error.** A question is now marked "touched" when focus leaves it,
  not when the respondent types in it. This is a consequence of the validation work above: with
  `Phone` newly validated and `isPhone` wanting seven digits, marking touched on every keystroke
  rendered "Enter a valid phone number." on keystrokes one through six of every phone number — and
  that message carries `role="alert"`, so a screen reader re-announced it each time. Errors still
  appear on blur, on trying to advance in one-question mode, and on submit (which marks every
  visible question touched). Moving focus BETWEEN two controls of the same question — option to
  option in a `MultiChoice`, `SingleChoice`, `Rating`, `NPS` or `YesNo` — does not count as leaving
  it, so choice questions no longer flash "required" while the respondent is reading the options.

  **Widget sourcemap.** The bundle is built with `minify: true, sourcemap: true` and ends with
  `//# sourceMappingURL=mj-form.js.map`, but nothing served that path, so it fell through to
  MJAPI's authenticated routes and answered 401 on every devtools session. `/forms/widget/
mj-form.js.map` is now served beside the bundle, and answers 404 rather than 401 when the build
  emitted no map.

  This rejects submissions that previously succeeded — any answer that does not fit its question's
  type. Already-published forms are covered without re-publishing, because the check derives from
  `question.type` rather than from the stored rule.

  **Host readiness.** `checkRespondentReadiness` no longer requires the deployment-global
  `magicLink.restrictedRoleName` to equal `Form Respondent`. Core treats that value only as the
  default for invites that name no role, and Forms' minter always names one — so the requirement
  made every stock host report unready (core defaults it to `Magic Link Baseline`) and meant two
  Open Apps could never both be ready on one MJAPI instance. The real requirement, that the role be
  grantable, is unchanged, and now compares names the way core's `isRoleGrantable` does:
  case- and whitespace-insensitively. The check reads the role from the same `FORMS_MAGICLINK_ROLE`
  config the minter uses, so it cannot drift from what is minted.

### Patch Changes

- Updated dependencies [287cfc7]
  - @mj-biz-apps/forms-entities@0.5.0

## 0.4.0

### Minor Changes

- f88839f: Raise the MemberJunction floor to 5.51.0, and make the release workflow's schema-change rule enforceable.

  **A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.51.0` and all five packages' peer ranges moved to `^5.51.0`. A host below that can no longer install Forms. Nothing in 5.51.0 is _required_ by Forms — this is a routine rev to the current `latest` to keep the delta to MJ small — but the raised requirement is what consumers see, and this repo treats a raised install requirement as a minor.

  **Upgrading is a database operation, not just a pin bump.** 5.51.x ships two core `__mj` migrations, so `npx mj migrate -t v5.51.0` is required per environment. A partially-migrated core still installs, builds, tests and boots cleanly; the failure surfaces later as `Entity <name> not found in metadata` from an unrelated feature. Verified end to end on the dev database: frontier advanced, entity count held at 422, MJAPI startup clean, and the anonymous respondent path passes all 8 smoke assertions.

  **The release workflow's migration rule could only ever abort a release, never enforce one.** `changeset version` reads solely `.changeset/*.md` and knows nothing about `migrations/`, so raising the predicted bump moved the expectation away from what would actually happen — the mismatch guard then failed the release reporting a predictor error instead of naming the missing changeset. The rule is now an explicit policy gate that runs on every path that can cut a release, including `workflow_dispatch`, which previously skipped it and shipped a patch carrying a schema change.

  Also fixes the E404 fast path in the npm placeholder check, which never fired because it read `$?` after an `if` — always 0 — so a genuinely missing package burned every retry before being reported.

### Patch Changes

- Updated dependencies [f88839f]
  - @mj-biz-apps/forms-entities@0.4.0

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
  - @mj-biz-apps/forms-entities@0.3.0

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
