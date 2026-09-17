# @mj-biz-apps/forms-actions

## 0.11.0

### Minor Changes

- 7293c62: A `Time` question no longer makes the whole form unsubmittable, and the `date` column now reads back as what the respondent entered.

  Answering a `Time` question failed the entire submission with a bare `Invalid time value`, naming no field. `<input type="time">` emits `14:30`, the widget sent it verbatim, and persistence did `new Date('14:30')` — an Invalid Date that `toISOString()` throws on from inside `Save()`. Nothing between the two had an opinion: `validateAnswerFormat` had a `Date` case and no `Time` case, and a draft was held to upper bounds only. Every published form carrying a Time question was collecting nothing. Closes #116.

  **One module owns the format.** `contracts/answer-date.ts` is where the decision lives, and the widget, the validator, persistence, the conditional evaluator, the dashboard and the on-submit actions all read through it. A `Time` travels as the bare clock its control emits and is stored as that clock on the Unix epoch date in UTC — `14:30` → `1970-01-01T14:30:00Z` — so the whole column obeys one rule: **the UTC fields of the stored instant are what the respondent entered.** The epoch rather than the submission day, so two people who both answered `09:00` store the same value and compare equal in reporting. `Date` storage is byte-for-byte unchanged; this generalises the rule `Date` already followed.

  The server parses the clock rather than the widget composing an instant, because the server evaluates conditional rules on the wire value while the widget evaluates on the control's `14:30`. An ISO wire format would have the server see a date where the widget sees a time, so a rule on a Time question would fire in the browser and never on the server.

  **Strict on the wire, and this is the one behaviour change for a non-widget API client.** An ISO instant posted on a `Time` question is now refused with `Enter a valid time.` where it previously succeeded, because the evaluator would compare it on the date scale and a rule written against `14:30` could never match it. No client in this repo does that, and a browser cannot: `<input type="time">` sanitises every non-clock value to empty.

  **Every unstorable date answer is now refused by name.** Validation names the question in every mode, drafts included — a draft `Date` carrying garbage used to reach `Save()` and come back as the same unattributed `Invalid time value`. Persistence checks again, because validation judges only the column a question's _type_ routes to while a caller may post `dateValue` on a question of any type; that path now returns `Answer to "<prompt>" is not a valid date.` instead of a runtime error.

  **Reading a stored answer back.** `dateAnswerText` is the inverse of the parse, and the one reader every consumer should use: a `Time` gives back `14:30`, a `Date` gives back `2026-09-01`.

  - The response detail, the CSV export and the reporting surfaces show both halves as the respondent entered them. Previously a Time rendered as `1970-01-01T14:30:00.000Z` and a Date as `2026-09-01T00:00:00.000Z`.
  - On-submit Actions and AI Agents get `dateText` beside the raw `dateValue`. The instant stays for actions doing date arithmetic; the text is for anything putting the answer in front of a person, which otherwise had to know that a Time is stored on the epoch date and would render a confirmation email saying "1 Jan 1970".
  - The dashboard's time-of-day bands read UTC hours. Reading local hours filed a `14:30` answer under "Morning" for every viewer west of Greenwich.
  - The dashboard's month buckets read UTC too. A `Date` answer is stored as UTC midnight, so local fields gave the previous day — and while that only crosses a month boundary on the 1st, it did so silently: a `2026-09-01` answer was filed under "Aug 2026", and an epoch date under "Dec 1969". Both halves of the bucket move together (the sort key and the `toLocaleDateString` label), because correcting one alone yields a card that sorts under September and is captioned August. The label keeps the viewer's locale — only the timezone was ever wrong.

  Nothing here is localised, deliberately: a stored `Date` is UTC midnight, so a locale formatter renders the **previous day** anywhere west of Greenwich. A date answer carries no zone, so there is no zone in which to localise it, and the ISO calendar date also sorts as text and parses in a spreadsheet.

  **An automation gated on a `Time` question can fire.** Automation conditions are evaluated after persistence from the stored instant, which the evaluator reads on the date scale, while an authored rule value (`"12:00"`) is on the time scale — so every `equals`/`greaterThan`/`lessThan` on a Time question silently evaluated false with nothing logged. Automation answers are now read through the contract in `buildConditionAnswers`, which is the one place that holds the question and can tell a Time from a Date; entity binding still receives the instant, which is the right shape for a datetime column.

  **A `dateValue` of `null` no longer 500s the public write path.** The date branch gated on `!== undefined`, and a caller may legitimately send `null` for a column an answer does not use — so a text answer carrying an explicit `null` reached the parse and threw `TypeError` out of the anonymous mutation. It is the only branch that needs `!= null`, because it is the only one that parses rather than assigns.

  The smoke fixture's Time answer was an ISO instant, which the new format refuses; it now sends a clock reading, so the suites that submit a response keep working against forms carrying a Time question.

  No migration and no schema change: the storage shape of a value that could never be stored is not a change to any existing row.

  `minor` rather than `patch`, on three counts, and matching what sibling changesets use for the same kinds of change: the refused ISO instant is a documented behaviour break for a non-widget API client; `forms-entities` gains public exports (`calendarDateOf`, `dateAnswerText`); and `forms-actions` adds a **required** `dateText` member to the exported `AnswerWithType`, plus `TargetFields` replaces the bare name set `BindingTargetGateway.describeEntity` returned, which any external implementer of that gateway must follow.

- 11a838e: Duplicated core metadata broke CodeGen for anyone who regenerated; one SQL escaper replaces sixteen.

  **The metadata (#64, #66).** `V202608191300` promises idempotency in its own header and delivers it for most of its length — the `Entity` block is fenced on a natural key, every `EntityField` insert is guarded `WHERE ID = '<guid>' OR (EntityID = … AND Name = …)`. Seventeen statements are guarded differently: `IF NOT EXISTS (… WHERE [ID] = '<guid>')` and nothing else. That asks whether _this row_ was inserted before, when the fact that makes an insert safe is whether _the thing it describes_ already exists, under whatever id the host minted for it. Any developer who ran `mj codegen` between `V202608182100` and `V202608191300` — the documented workflow — had those rows under CodeGen's ids, so all seventeen guards missed and all seventeen inserted a second copy. None of the affected tables carries a unique constraint on its natural key upstream, so it landed silently and the migration reported success.

  The cost is #66. CodeGen emits one `@FieldResolver` per `EntityRelationship` row, so the duplicated `Forms → Form Screens` row made the next regeneration emit `mjBizAppsFormsFormScreens_FormIDArray` twice and `forms-server` stopped compiling — which is why every `mj codegen` run on an affected host ended `ERROR running one or more AFTER commands`. The checked-in generated files predate the duplicate and still compiled, so the break appeared only on regeneration, looking like it belonged to whichever branch happened to regenerate.

  `V202608252300` converges by keep-list: for every row `V202608191300` ships, any _other_ row carrying the same natural key is removed, so a repaired host becomes row-for-row identical to a fresh install rather than merely un-duplicated. It is a strict no-op on a clean database and on a partially hand-cleaned one, and it cannot touch host-authored metadata — every delete requires a same-natural-key sibling from the keep-list. It then asserts its own end state, scoped to this app's entities.

  **Two findings beyond the issues.** `EntitySetting` was duplicated too (`FieldCategoryInfo` and `FieldCategoryIcons` on Form Screens) and was in neither issue's sweep; it is converged here. And the ID-only guard is not one migration's slip — it is the guard **CodeGen itself emits** for a relationship row, present in 51 statements across five migrations, four of which are pasted CodeGen output. The real fix is upstream in MJ; until then `scripts/check-distribution-seed.mjs` CHECK 4 refuses the shape at authoring time (watershed after the last shipped offender, like CHECK 3), and `smoke/metadata-integrity-path.mjs` rules on the end state in the database — the half no unit test can reach, since every existing gate reads checked-in files and this defect lives only in `__mj`.

  **The escaper (#67).** The shipped packages carried sixteen implementations of "double the single quotes" — seven named local functions spelled four ways, nine written inline. (Nine more live in `smoke/*.mjs` and stay there deliberately: those are stdlib-only scripts that run in order to test a build, so importing the built package would make the suite depend on the artifact under test.) They had already drifted into four different decisions: one N-prefixes the literal, one tolerated `null`, one escapes LIKE wildcards, the rest do neither. They are now one module in `@mj-biz-apps/forms-entities` (`escapeSqlString` / `quoteSqlString` / `sqlLiteral`), which every consumer package already depended on, so no new coupling was created — the coupling was what had kept the duplication alive.

  Purely a refactor: the SQL each call site emits is byte-identical, including the file-link gateway's `(value || '')` tolerance, which is load-bearing because that package compiles without `strictNullChecks`. Upgrading the plain-quoted sites to the N-prefixed form is a behaviour change — the prefix decides whether SQL Server compares a non-Latin value or a row of `?` — and is deliberately not part of this.

- 1bc7aa3: Ten new question types (Website, Checkbox, Legal, PictureChoice, OpinionScale, Ranking, Matrix, Address, ContactInfo, Doodle) and Welcome/Ending screens as a first-class `FormScreen` entity rather than as question types — a screen is never answered, produces no `FormResponseAnswer` and appears in no aggregation, so it renders as a phase of the widget shell instead of an item in the question list. Many endings are supported, each with its own condition and redirect, resolved by one function shared between the widget and the server.

  Question-type behaviour now comes from a single capability table in forms-entities, with `FormQuestionType` derived from it, replacing six duplicated switches across four packages — including a hand-copied type list in the server's snapshot parser that could not learn when the contract grew. Also adds per-page partial submit points.

  Two migrations: `V202608182100` widens `CK_FormQuestion_QuestionType` to 25 values and adds `FormScreen`, `FormQuestionOption.ImageURL`/`MatrixAxis` and `FormPage.IsPartialSubmitPoint`; `V202608182130` updates the AI Designer prompt to the full taxonomy. Apply both before deploying the code — the reverse order lets the builder offer types the CHECK constraint rejects.

  Fixes a builder save race in which two edits landing in the same tick silently lost the second (`BaseEntity.Save()` re-reads the record it saved, discarding anything written while it was in flight); saves are now coalesced per entity and flushed before publish. Also repairs the `AssertExtends` compile-time drift guards, which could never fail because a naked type parameter distributes over its union — every "fails the build on drift" guard in the repo had been passing vacuously, hiding a blueprint enum stuck at 15 types.

- 1b0f56a: Let a form say it runs NOTHING on submit, and stop the builder silently restoring the four built-in hooks (#47).

  **The overload.** Dispatch was decided by an inline `automations.length > 0` test in the submit pipeline, so an empty automation list meant two different things at once: "this form has never configured anything" (fall back to the four legacy hooks) and "this form deliberately runs nothing". Only the first was reachable. The repo said so in two places that contradicted each other — `snapshot-builder.ts` called an empty array "what keeps an already-published form on the legacy hook list", while `publish.service.ts` called it "this form configures no automations".

  **What it cost.** `Forms: Upsert Respondent Person` is one of the four. It creates a `MJ_BizApps_Common: Person` from the answers and stamps `FormResponse.RespondentPersonID`, and its dedupe covers only rows it created. An app that owns its own subject identity — bizapps-caliber binds an `Applicant` from the same answers — therefore produced a second `Person` for the same human on every submission, one Forms neither knows about nor points at. Nothing errored and nothing logged; the symptom arrived later, as a follow-up task and the record it is about referencing different people. There was no way to decline: no env knob (`FORMS_HOOKS_BLOCKING` only controls whether hooks are awaited), no per-form setting, and the 0.8.0 back-fill covers only forms that existed when it ran, so every form created afterwards is permanently on the legacy path.

  **The same defect, in the product.** `remove()` in the Automate tab had no last-row guard, so an author who deleted their final step published an empty array and silently got the confirmation email, follow-up task, respondent-Person upsert and answer scoring back. Adding **or removing** a step now marks the form authoritative permanently, and nothing anywhere returns a form to the legacy list. Marking on removal is what covers a form this builder did not configure in the first place — `V202608081400__Backfill_Legacy_Automations` gave every form predating 0.8.0 four automation rows and no mode, so its author can reach an empty list without ever having added anything.

  **Publishing reads the form back.** The mark is written through the Automate tab's own Form entity, and the builder's in-memory tree is loaded once when the builder opens, so publishing without leaving the builder used to snapshot the settings as they were BEFORE the change — right in the database, wrong in the snapshot, which is the only thing the server reads. `publish()` now re-reads `Form.Settings` and refuses the publish if that read fails or returns no row, the same guard the automation read already had. Publishing defaults in place of settings it could not confirm would be a silent downgrade well beyond the on-submit mode: those defaults are `anonymousAllowed: true` and `captchaRequired: false` with quota and close date dropped.

  **The fix.** `FormSettings.onSubmitMode` (`'Legacy' | 'Configured'`) is carried in the published snapshot, and the decision moves to `resolveOnSubmitDispatch` in `@mj-biz-apps/forms-entities` — one pure function instead of an inline test. `Configured` means the automation list is authoritative _including when it is empty_. **Absent keeps the exact inference the server has always made**, which is what makes this safe: every snapshot published before this field carries no mode and behaves identically, and a pipeline test now pins that so the compatibility cannot quietly erode. A `Configured` form with no automations also short-circuits before resolving the service principal and re-reading the response, so declining costs nothing on the hot path.

  It rides in `Form.Settings` rather than a new column because a column needs a CodeGen run to be usable and this shipped without a database; the field is optional and the settings blob is already parsed on both sides and mirrored into the snapshot. Promoting it to a real column with a CHECK constraint is worth doing when CodeGen next runs.

  **Authoring on-submit steps programmatically.** `Forms: Generate Form From Brief` and `Forms: Create Form From Template` take two new optional params, `OnSubmitMode` and `Automations`. Steps name their Action **by name** (ids differ per environment) and run in array order, so two can never share a `DisplayOrder`. An Action name this deployment does not have is a hard failure rather than a skipped step — the opposite of the builder's seeding, deliberately: seeding skips an unregistered built-in to reproduce the legacy runner, whereas a caller that named a step and silently did not get it has been lied to. A failed resolve refuses before writing anything, so a form is never left half-configured and marked authoritative.

  `V202608241800` adds the four `ActionParam` records. It is hand-written rather than generated — a seed push needs a database with MJ and both sibling apps — and each insert is guarded on both the id and the `(ActionID, Name)` pair, because `spCreateActionParam` is a bare INSERT and an unguarded collision halts the migration chain.

  **Documented.** `docs/on-submit-automations.md` covers what runs and when, how to configure or decline it, and names `Forms: Upsert Respondent Person` as the owner of respondent identity — consuming apps should read `FormResponse.RespondentPersonID` rather than deriving a second Person. MemberJunction/MJ#3825 (IS-A promotion) is what would make that fully reachable for a consumer whose record must _be_ a Person.

  **An unreadable mode never takes a form offline.** `onSubmitMode` is side-effect configuration, invisible to the respondent — the same class as `automations`, which the snapshot parser deliberately drops rather than allowing one corrupt entry to refuse the whole snapshot. This field did not follow that rule at first: any unrecognised value failed the strict settings parse, which failed the snapshot, which served every respondent "Form unavailable". It is now the one tolerant field in that schema and degrades to absent, which means "infer". The authoring paths stay strict, because a caller that asked for something we cannot honour should be told: `applyOnSubmitConfig` case-folds and then rejects what it cannot map, `formBlueprintSchema` is exact, and both reject `Legacy` supplied alongside automations — a combination that would otherwise write steps that silently never run.

  **No behaviour changes without an explicit opt-in.** Every existing form, published snapshot and caller is unaffected until it declares a mode. Verified against 33 real published snapshots: 28 dispatch as legacy and 5 as configured, identical to the inline test this replaces, with zero behaviour changes.

- 08dacd6: On-submit actions wrote every cross-app record as nulls, on any host but a dev box.

  `Forms: Upsert Respondent Person` reported `First Name cannot be null` for responses whose First name answer was sitting in the row. The extraction was never at fault: `FirstName` is `identity.firstName ?? email.split('@')[0]` and `LastName` is `identity.lastName ?? '(unknown)'`, so neither can be null whatever the answers say — and the real error named **both** of them.

  The cause is one line of typing. `MJ_BizApps_Common: People` and the three `MJ_BizApps_Tasks:` entities belong to sibling apps, so the actions could only name their classes through `import type` — which is erased at compile time. Nothing in the shipped package ever loaded the packages that own them, making them a phantom runtime dependency: correct only on a host that happened to load them for its own reasons. `apps/MJAPI/server.mjs` did, which is precisely why the failure never appeared in this repo's own harness and did everywhere else.

  It fails silently because `Metadata.GetEntityObject` does not throw for an unregistered entity — MJ's ClassFactory falls back to a plain `BaseEntity`, which has `Get`/`Set` but none of the generated typed accessors. `person.FirstName = 'Ada'` then defines a JS own-property the entity never reads. The discriminator, from one submit on a live stack: the upsert action wrote nulls at 17:13:43 while the entity-binding action wrote the _same_ answers to the _same_ entity correctly at 17:13:53 — because bindings go through `record.Set(field, value)`, which works on the fallback.

  `custom/register.ts` now imports both sibling entity packages at module scope, and `forms-server`'s index already side-effect-imports that barrel, so any host loading Forms gets the registrations. The manual loads in `apps/MJAPI/server.mjs` are removed rather than kept: leaving them would hide a regression in the package from the one stack that runs it.

  Two things guard it now. `register.spec.ts` asserts each of the four entity names resolves through its generated class, checking the prototype **chain** rather than the resolved class name so a sibling app adding its own subclass (bizapps-tasks already does, for `Tasks`) does not fail a change that keeps the typed accessors. And both actions now refuse up front, with `ENTITY_CLASS_UNREGISTERED` and a message naming the entity and what the fallback would do, rather than writing nulls — the check is on the class-factory registry, not `instanceof` on the returned object, so test fakes still exercise the real code path.

  `Forms: Create Followup Task` carried the identical defect for `Tasks`, `Task Links` and `Task Types`. It is fixed by the same change; it had been failing earlier for an unrelated reason, which is what kept it hidden.

- 912164c: The AI Designer stops proposing a question type the database rejects, and the release ships one consolidated metadata seed instead of a pile of per-PR deltas.

  **The shipped Designer prompt still said `Signature`.** #97 renamed the type to `Doodle` and `V202608301200` installed a CHECK constraint that accepts only the new spelling — but that migration is pure DDL, and the prompt lives in a metadata record no DDL touches. So a host installing from `migrations/` got a prompt proposing `Signature` and a constraint refusing it. The blueprint validator rejects the value before it ever reaches the database, and the Designer retries with the error fed back, up to `MAX_DESIGNER_ATTEMPTS` — wasted round-trips on every authored form rather than a visible failure, which is why nothing surfaced it. No repo-side check could: `check:release-seed` compares declared ids against shipped SQL, and this record's id already shipped in the v0.8 seed.

  **Two unreleased deltas are folded in and deleted.** `V202608182130` and `V202608241800` appear in no release tag, so neither reached a host and neither was append-only history yet. They are replaced by a single `Metadata_Sync` generated against the shipped chain — the cadence #105 established, and what `check:seed-cadence` has been red on.

  **Operators should expect this**: applying this migration corrects the Designer prompt in place, restores the Designer Template's own `Description` (it still advertised the Phase-1 taxonomy, which the prompt body it owns has not matched since #97), and adds the four `OnSubmit` `ActionParam` records. No form data is touched, and `V202608301200` already migrated any stored `Signature` questions to `Doodle`.

  Closes #111.

### Patch Changes

- 3fa29bf: Move MemberJunction to `6.1.0-edge.5`

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

- a064da2: **The shared on-submit context loader quotes its ids like everything else does.** `RunView` takes SQL text and offers no parameter binding, so every `ExtraFilter` in this repo goes through `quoteSqlString` — except the two in `form-response-context.ts`, which built their literals inline: `` `ResponseID='${responseId}'` `` and an `ID IN (…)` list assembled from `` `'${id}'` ``. Both are fed DB-sourced, validated GUIDs by today's only caller, so nothing was exploitable and nothing changes for a valid id; the output is identical.

  **It is where the next caller will be wrong.** This is the _shared_ loader on the on-submit automation path — `Upsert Respondent Person`, `Create Followup Task`, `Send Confirmation Email`, `Analyze Written Responses` and `Bind Response To Entity` all enter through it, and `submit-pipeline` calls it for every completed response. A future hook that resolves a question id from a template, a mapping, or an inbound payload inherits whichever convention this file happens to be using, and an escaping decision that holds only because of who calls it today is not a decision anyone can rely on. `quoteSqlString` is already imported throughout the repo and already the answer; there was no reason for two files to disagree about it.

  **Pinned by assertions on the filter text, not on the rows.** The loader's spec now records the `ExtraFilter` each read sends and asserts a quote is doubled rather than allowed to close the literal — in the id and in every element of the IN list. Asserting on the returned rows cannot tell an escaped literal from an interpolated one, because for a valid GUID they are the same rows; the filter string is the only place the difference is observable. Verified sensitive by reverting the change and watching all three assertions fail, one of them on the filter `ResponseID='resp-1' OR '1'='1'`.

- 75906b8: The CodeGen-append gate checks a main-bound ref against `next`, not against `main`

  A pull request into `main` is a release or a back-merge, and its base is `main` — hundreds of
  commits back. The gate's banner rule applies only to files the diff adds, so against that base every
  migration merged since the last release read as newly added, and the four that predate the gate
  relit. It is a required check with no bypass, so the release pull request would have opened and
  stalled. The base is now resolved from the branch the ref is aimed at; a hotfix committed straight
  onto `main` still owes its CodeGen output and still fails.

- d0ac9e2: `Prepare a release` pushes as the App again, not as `github-actions[bot]`

  `actions/checkout` defaults to `persist-credentials: true`, which writes an
  `http.https://github.com/.extraheader` entry carrying `GITHUB_TOKEN` into the local git config.
  That header matches every github.com remote — including the one whose URL carries the App token —
  and outranks URL credentials, so the release branch was pushed as `github-actions[bot]`. The job
  holds `contents: read` by design, so the push was refused with a 403 that named neither credentials
  nor the cause. The checkout no longer persists a credential. `publish.yml` is deliberately left
  alone: it pushes the release tag through `origin` and needs the persisted one.

- Updated dependencies [29789ba]
- Updated dependencies [925087e]
- Updated dependencies [7293c62]
- Updated dependencies [ff19377]
- Updated dependencies [ea001c3]
- Updated dependencies [3599074]
- Updated dependencies [11a838e]
- Updated dependencies [4831864]
- Updated dependencies [9eb264b]
- Updated dependencies [1bc7aa3]
- Updated dependencies [5935085]
- Updated dependencies [3a4b449]
- Updated dependencies [88143e7]
- Updated dependencies [d117a59]
- Updated dependencies [89ca16f]
- Updated dependencies [89f4c0a]
- Updated dependencies [3fa29bf]
- Updated dependencies [396d4b5]
- Updated dependencies [1b0f56a]
- Updated dependencies [126662f]
- Updated dependencies [30f73d3]
- Updated dependencies [3e67383]
- Updated dependencies [48c0f45]
- Updated dependencies [64b6385]
- Updated dependencies [8299fed]
- Updated dependencies [a8e8a1d]
- Updated dependencies [75906b8]
- Updated dependencies [d0ac9e2]
- Updated dependencies [42819f3]
- Updated dependencies [912164c]
- Updated dependencies [3de26d8]
  - @mj-biz-apps/forms-entities@0.11.0

## 0.10.0

### Minor Changes

- f01e810: Harden the `Form Respondent` role's entity grants, and make the 0.8.0 metadata seed installable
  on a database where that role already exists (#39).

  **Security.** The 0.8.0 seed created all nine of the role's permission rows with every row-level
  security filter column explicitly NULL. Because MJ publishes a generic `Create<Entity>` mutation
  for every entity and treats a null `CreateRLSFilterID` as exemption from create-time RLS, the
  `CanCreate` grant that exists only to satisfy forms-server's `checkRespondentScope` gate doubled
  as direct write access that never entered the submit pipeline — past Turnstile, the rate limiter,
  the `MaxResponses` quota, field validation and the distribution's open/close window, all of which
  live only there. And because one shared anonymous principal backs every respondent, the unfiltered
  reads were instance-wide: any respondent to any form could enumerate every `FormDistribution` row,
  `PublicLinkToken` included.

  A new migration attaches a deny-all create filter to both response grants and scope filters —
  keyed on the distribution the session's own magic-link invite names — to the Form Distributions and
  Form Versions reads. Nothing legitimate is lost: the scope check reads only the `CanCreate` flag,
  and every real response write is performed by the elevated system user.

  **Five grants removed, not filtered.** No anonymous code path has ever read Forms, Form Questions,
  Form Question Options, Form Pages or Form Styles — `resolvePublishedDefinition` reads only
  Distributions and Versions, and the published version's `DefinitionSnapshot` already embeds the
  questions, options, pages and style tokens. Those grants were removed. **If you have built
  anything that reads those entities under an anonymous respondent session, it will stop working**;
  it needs a scoped grant of its own.

  **Installability.** The seed's two `spCreateRole` calls were blind INSERTs against a table whose
  `Name` column is UNIQUE, so 0.8.0 halted the migration chain with `Msg 2627` on any database where
  `Form Respondent` already existed — which is every host that installed bizapps-caliber first. Both
  creates are now adopt-or-skip by name, and every reference to either Forms role resolves the id by
  name rather than assuming the canonical UUID.

  Co-installation with bizapps-caliber (≥ #220) is verified in both orders: Caliber's own
  postconditions test that a filter is present rather than whose it is, so it leaves these in place,
  and because the filter records are owned by this app a later Caliber uninstall can no longer return
  the grants to their unfiltered state.

  No API or TypeScript change: this ships entirely as migrations.

### Patch Changes

- Updated dependencies [f01e810]
  - @mj-biz-apps/forms-entities@0.10.0

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
