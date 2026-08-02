# @mj-biz-apps/forms-server

## 0.6.0

### Minor Changes

- bedb515: Serve the widget bundle from install paths containing a dot segment (#24)

  `WidgetBundleMiddleware` called `res.sendFile(filePath, cb)` without a `dotfiles` option.
  Express's `send` defaults it to `'ignore'` and its `containsDotFile` check walks **every**
  segment of the absolute path — not just the basename — whenever no `root` is given. Any
  install under a dot directory therefore 404'd inside `send` and surfaced as a 500 for a file
  that was plainly there. Verified against a live MJAPI: the same bundle bytes served 200 from
  `/opt/app/...` and 500 from `.worktrees/app/...`, and `dotfiles: 'allow'` restored 200.

  The paths that hit it are ordinary, not exotic — a git worktree under `.worktrees/` or
  `.claude/`, a release layout like `/opt/.releases/current`, anything under `~/.local/share/`,
  and several CI runner and PaaS layouts.

  It failed silently in the one place an operator would look. Boot still logged
  `[Forms] Widget bundle served at <path>`, the file existed, and the version was correct — so
  the only symptom was a respondent seeing a blank form, indistinguishable from the #20 symptom
  that had just been fixed.

  The sourcemap route shared the defect through the same helper, so devtools got a 500 on
  exactly the asset that makes a minified production fault readable. One fix covers both.

  `'allow'` carries no traversal risk here: `filePath` comes from `getWidgetBundleConfig()` —
  an operator-set env var, `require.resolve`, or a monorepo constant — and never from the
  request, and the route serves exactly two fixed files.

  **`FORMS_WIDGET_BUNDLE_PATH` is now validated instead of trusted.** Adversarial review found
  two more shapes of the same "file is plainly there, route still fails" defect, reached through
  the one resolver whose value a human types. Both passed `existsSync` and were handed straight
  to `send`:

  - A **relative** path made `res.sendFile` throw a `TypeError` _synchronously_, before the error
    callback it was given exists — so nothing was logged under `[Forms]` and the respondent got
    express's default HTML error page, carrying a stack trace under a non-production `NODE_ENV`.
  - An **unnormalised** path (`$APP_ROOT/../shared/widget/mj-form.js`, which is how deploy
    scripts compose paths) kept its `..`, which `send` rejects with 403 and this route turns into
    a 500.

  `resolveFromEnv()` now requires an absolute path, normalises it, and **logs** a rejected
  override rather than silently falling through to the next resolver — an operator who set the
  variable deliberately should not have to infer from a blank form that it was ignored.

  This is the reason for a **minor** rather than a patch: a `FORMS_WIDGET_BUNDLE_PATH` value that
  was previously accepted by `existsSync` and passed through can now be rejected. No path that
  actually _worked_ stops working — the rejected shapes are exactly the ones that produced a 500
  or an HTML error page — but the configuration contract is narrower than it was, so it does not
  belong in a patch.

  Also adds route-level tests that stand the middleware up on a real express server and assert
  over real HTTP. The existing unit tests could not reach this bug class at all: path
  _resolution_ was always correct, it was path _serving_ that failed.

### Patch Changes

- @mj-biz-apps/forms-actions@0.6.0
- @mj-biz-apps/forms-ng@0.6.0
- @mj-biz-apps/forms-core-entities-server@0.6.0
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
  - @mj-biz-apps/forms-ng@0.5.0
  - @mj-biz-apps/forms-entities@0.5.0
  - @mj-biz-apps/forms-core-entities-server@0.5.0
  - @mj-biz-apps/forms-actions@0.5.0

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
  - @mj-biz-apps/forms-actions@0.4.0
  - @mj-biz-apps/forms-ng@0.4.0
  - @mj-biz-apps/forms-core-entities-server@0.4.0

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
