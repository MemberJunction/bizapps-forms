# @mj-biz-apps/forms-entities

## 0.11.0

### Minor Changes

- 29789ba: A respondent can reopen a half-finished form, and the server — not a replayable browser header — decides whose draft it is.

  Autosave has always banked progress as `Partial` rows, and nobody could ever get one back. The two things that let the server find that row again, the `x-session-id` header and the widget's `clientResponseId`, are minted per widget instance and die with the tab; every load of `/f/:slug` redeems a fresh anonymous session; and the `Form Respondent` role held no read at all on the two response entities, so no operation could return a draft's answers even in principle. A respondent who closed the tab was a stranger to their own work. Folded into the same change: ownership of a draft was decided by a header anyone could replay — naming a `responseId` under a fresh session while replaying somebody else's `x-session-id` succeeded, and overwrote their answers. Progresses #138.

  **The resume credential is a magic link whose resource is the response.** Not a new table, not a second token format, not a new endpoint family: a `MagicLinkInvite` with `IdentityMode='anonymous'`, `Kind='resource-share'` and `ResourceID` set to the `FormResponse`. Redeeming it mints an ordinary Form Respondent session scoped to that one row, so reading the draft becomes row-level security and continuing it becomes one extra clause in the ownership rule that already existed. Every property that makes core's magic links safe — hash-only storage, atomic use counting, expiry, revocation, an audit trail — arrives with it rather than being re-implemented next to it.

  **The read filter and the write rule now test the same fact.** `responseIsOurs` takes a caller identity (`{ sessionId, scopedResponseId }`) instead of a bare header string, and answers yes when the row is unowned, when the caller is its owner, or when the caller's _verified_ session scope names the row. That third clause is what makes resume possible at all — a second sitting mints a new `x-session-id`, so the row's owner column names a session that no longer exists anywhere — and it is deliberately the same predicate the database applies: the new `MJ Forms: Respondent Own Response` filter is `ID = {{ScopeResourceID}}`, and so, in TypeScript, is this. The two cannot disagree about which row a session may touch.

  **`PublishedForm` gained one nullable field, `resumeJSON`.** It carries the draft a scoped session may continue — the row's id, its status, the version it was created on and its stored answers — and it is null for an ordinary public-link session, whose scope is a distribution id and therefore matches no response row under the filter. The read runs under the ANONYMOUS context user rather than the elevated one, which is the point: the database is the gate, so a misconfigured grant yields no resume rather than somebody else's answers. The frozen `FormSubmissionInput` / `FormSubmissionResult` contracts are untouched.

  **The scoped row now wins explicitly, and that fixes a bug nobody had noticed.** A resumed save missed all three of the pipeline's existing lookups — every one pins `FormVersionID`, and the owner column still names the first sitting — fell through to CREATE at the row's own id, collided on the primary key, and was rescued by the duplicate-key recovery. That path works, and depending on it would have been wrong twice: it decides whether a failure was a collision by running a regex over the driver's error text, and it issues a failed INSERT on every autosave. It also silently broke the per-version draft ceiling, which counts a save as a NEW draft whenever no existing partial was resolved — so a resumed autosave, which adds no row, was refused outright on a saturated form. There is now one branch at the top of `resolveExistingPartial`: if the caller carries a response scope, that row is the row, on any version.

  **A draft survives its form being republished.** The scoped lookup drops the version filter deliberately, so a typo-fix republish under an open draft no longer strands it; the first save afterwards re-stamps the current version and reconciles answers by question id. The widget puts back only the answers whose question still exists and whose stored value round-trips into its control, and says how many it could not — because the alternative is invisible in the worst way: a value a control silently rejects leaves the field blank, and a value in the wrong column fails server-side validation on every autosave from then on, with autosave being fail-soft and nothing on screen saying so.

  **Same-device resume, without putting anything but a pointer in the browser.** After the first acknowledged partial save the page asks the host to remember the draft; the host mints a single-use invite and returns its raw token in an `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/f/<slug>`. No answers on disk, no `localStorage` anywhere, and the GraphQL endpoint never receives the cookie at all. Every resume rotates the token, so a stolen pointer becomes a visible failure at the owner's next reopen rather than a silent, lasting read. Three routes carry it — `POST /f/:slug/{resume,remember,forget}` — with the page's boot script doing all the cookie-side work: the widget stays a host-agnostic custom element that knows nothing about any of it, which is also why an embedded widget (a page with no boot script) behaves exactly as it did before.

  **Two defects found in design review, fixed before the code was written.** _A second tab must not orphan the real draft._ Both tabs POST `/resume` with the same single-use pointer; core's compare-and-swap lets one win and the other gets `410 consumed`. Clearing the cookie on that refusal — which is what "clear on any failure" would do — discards the pointer the WINNER has just rotated, because there is one cookie jar per browser profile. The loser then starts a second draft, the next reopen resumes that one, and the real draft is orphaned. So a consumed pointer never clears the cookie, is reported as "this form is already open in another tab", and `/remember` additionally refuses to replace a pointer that names a different, still-live draft. _And `/remember` cannot mint on a bare response id._ The only ownership proof a first sitting has is the `x-session-id` header, which lives inside the widget's API service and was invisible to the page — so the widget now announces both correlators, and the route refuses without the session id and without a distribution that matches the caller's own scope.

  **Sealing a response retires the links that could reopen it.** The design originally left an emailed invite Active so a submitted response stayed readable; review flipped it, and rightly — an Active bearer sitting in an inbox for another 30 days is disclosure the moment that mail is forwarded. Every terminal status revokes, `Disqualified` included. Revocation is by RESOURCE rather than by token, which also deleted a follow-up the design had logged against MJ core: every invite for a response carries it in `ResourceID`, so listing them and using the minter's existing `RevokeAnonymousInvite` needs no core change. `/forget` is narrower on purpose — it revokes only invites with no email, because the person pressing "Not you? Start over" on a shared device is by definition not the owner, and letting a stranger kill the owner's emailed link would lock them out of their own draft.

  **Two columns and four row filters ship in one migration.** `FormResponse.FormDistributionID` (a real FK, stamped once on create, because a row filter must not put authorization on a JSON blob) and `FormDistribution.AllowDeviceResume` (the owner's switch, default on, for kiosks and shared devices). Two new filters grant the anonymous role a scope-filtered READ on the two response entities — the first time it has held one — and the two existing filters gain a clause so a resumed session can reach the distribution and version its own draft belongs to. Every predicate is parenthesised, because MJ ANDs a row filter onto the caller's own and an unparenthesised `OR` binds wrong. The migration asserts its own end state: both grants present and filtered, and no unfiltered grant left on any Forms entity for that role.

  **Operators should expect this**: nothing changes for a form until the migration is applied. After it, links get same-device resume by default; turn it off per link with `AllowDeviceResume`, or host-wide with `FORMS_DEVICE_RESUME_ENABLED=false`. `FORMS_DEVICE_RESUME_DAYS` (15) sizes the pointer, and `FORMS_RESUME_COOKIE_SECURE=false` exists only for a host serving the respondent page over plain http. A submitted response's resume links are revoked at submit, so a link opened afterwards will refuse rather than show the sealed answers.

  **Still to come on this issue**: the emailed resume link (`RequestResumeLink` and its interstitial), which lets a respondent continue on a different device. The server-side identity, the read path and the ownership rule it needs are all in this release; what is missing is the mutation, the message and the page that redeems it.

- 925087e: A share link can name the sites that may show it

  Forms had no origin control of any kind. `grep -rn "AllowedOrigins" packages migrations` returned nothing, and `grep -rni "cors|access-control-allow-origin"` over `packages/Server/src` returned nothing outside tests. The only lever reaching a Forms request was MJ core's host-wide `cors.allowedOrigins` — default `['*']`, shared by every app on the host, and incapable of saying "this link may be embedded on customer A's domain". The product ruling is that the widget embeds on customer-controlled third-party sites, which makes the **distribution** the authorization unit: it is the thing a customer is actually handed.

  `FormDistribution.AllowedOrigins` now holds a JSON array of full browser origins. Leave it empty and nothing changes — every existing link stays embeddable anywhere, which is what keeps live embeds working. Name a site and the link is fail-closed from that moment: an absent or unmatched origin is a refusal, never a warning, because an allowlist that admits on no-match is decorative.

  **Enforced at the two doors an embed actually goes through, which are not the two you would guess.** The embed snippet this product generates is an `<iframe>`, so the framed document's origin is _ours_. Measured in a real browser: a `fetch` from the top-level customer page reports `http://127.0.0.1:8917`, and the same `fetch` issued from inside the embedded widget reports `http://localhost:4000` — the API's own origin. Two consequences follow, and the whole design is built on them.

  `Content-Security-Policy: frame-ancestors` on `GET /f/:slug` is the only control that can see the customer's origin, because the browser evaluates it against the framing ancestor. That is the real embed control. No `X-Frame-Options` beside it: it cannot express a list (`ALLOW-FROM` is unsupported in every current browser) and `SAMEORIGIN` would refuse the very embeds this feature exists to permit.

  The public API therefore can never see a legitimate embed's customer origin, so `SubmitFormResponse`, `PublishedForm` and the anonymous `POST /forms/upload` admit the author's list **plus this API's own origin** (`MJAPI_PUBLIC_URL`). The upload route is easy to miss — it is Express middleware rather than a GraphQL resolver — but it is reached by the same widget, on the same public path, with the same anonymous session, so leaving it open would have let a refused caller still store bytes and mint an `MJ: Files` row. What that refuses is a caller that is neither — a leaked link replayed from somebody else's page. Before this change, `Origin: https://evil.example` on `SubmitFormResponse` returned `success: true` and wrote a `FormResponse` row.

  On `SubmitFormResponse` the gate sits after the distribution is resolved and **before** the rate limiter, because its verdict is a fact about the link rather than about the caller, and the pipeline's rule is that a request one gate refuses does not eat the respondent's budget in another. A mis-embedded page would otherwise burn a real respondent's window on refusals they cannot influence. **`POST /forms/upload` is the exception**, and deliberately so: its per-caller window is charged in the Express middleware before the body is read, because this gate needs the distribution and the slug that identifies it only arrives in the multipart body. Gating on origin first would mean buffering an untrusted body before any frequency control applied — inverting the storage-DoS protection that charge point exists to provide — so an origin refusal on the upload route does cost the caller one upload slot.

  **The grammar is `bizapps-caliber`'s, unchanged**, which is issue #203's third acceptance criterion: a full origin — scheme, host, optional port — matched exactly, `http` only for loopback, and no wildcards. `*.acme.com` is _refused_, not accepted-and-ignored: on shared hosting it admits `evil.acme.com`, and an author who writes it, is told nothing, and believes they restricted something is worse off than one with no allowlist at all. An author needing three subdomains names three origins. Only the container differs from Caliber — an array, not a keyed object — because Caliber's keys exist so an inheriting step can tombstone an inherited origin, and a Forms distribution is a leaf that inherits from nothing.

  An authored value that parses to nothing usable — invalid JSON, or a list in which every entry fails the grammar — refuses everything rather than falling back to unrestricted. A _partially_ bad list keeps its good entries, because dropping one entry can only ever narrow an allowlist; the authoring path refuses the whole edit instead, so that drop never happens silently.

  The Distribute panel's Embed view gains the editor, directly under the snippet an author is copying into the third-party page. It states the cost rather than naming the column, and it states **both halves**: once you list a site, only the sites you list can show the form inside their own pages — and the link itself is still open, so anyone holding it can open it directly and answer from anywhere. `frame-ancestors` governs framing, not top-level navigation; an author told only the first half would believe they had locked the form down, which is the exact failure this feature's own design calls worse than having no allowlist at all. `CloseAt`, `MaxResponses` and the active switch are what bound the link.

  `minor`: ships `V202609121200__v0.12.x__Distribution_Allowed_Origins.sql`, so a host must migrate and run CodeGen. Closes #203.

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

- ea001c3: **A clean install of MJ Forms gets past `Rules_And_Branching` again (#155).** `V202608252340` shipped
  CodeGen's raw output, and CodeGen writes an entity id as whatever literal the database it introspected
  happened to hold — here `A1F8CC58-B040-429C-B695-70DB0E9E7327` for `MJ_BizApps_Forms: Form Screens`.
  No shipped SQL creates that row. `V202608182100` added the `FormScreen` table with no `__mj` metadata
  behind it, and `V202608191300` repaired that with an `Entity` INSERT guarded on the natural key, so a
  fresh database gets its literal `6313B0B1-37E8-432F-AEB6-F35F218C5D22` while a host that had already
  run CodeGen by hand keeps whatever id it minted. Neither is `A1F8CC58`. So every install built from
  this repo alone stopped at this file — `The INSERT statement conflicted with the FOREIGN KEY
constraint "FK_EntityField_Entity"` — and the six migrations after it never ran. The failure was the
  whole chain, not one field.

  **The id is resolved by natural key now**, re-resolved in each batch that needs it because T-SQL
  variables do not survive a `GO`, and with a `THROW` when the lookup returns nothing. That is the
  shape `V202608191400` already uses for this same entity. Whichever id a host holds, the lookup finds
  it, and no second literal is left to be wrong on the next database. The NULL check is not ceremony:
  `spDeleteUnneededEntityFields` reads an empty `@EntityIDs` as _unscoped_ and then sweeps every entity
  in every schema its exclude list does not name, so an unresolved id passed through would turn a
  one-entity heal into a database-wide delete.

  The file was edited in place rather than repaired by a later migration, which `migrations/README.md`
  permits on exactly this test — a file that cannot apply at all leaves nothing after it able to run,
  so a repair migration could never have reached the hosts that need it. It is unreleased in any case
  (the last tag, `v0.10.0`, stops at `V202608131600`), and a host that did apply it is unaffected:
  Skyway resolves applied migrations by version and never checksum-validates. No record changed, only
  how the entity id is resolved, so `metadata/` is untouched and there is nothing to do on upgrade.
  `npm run lint:distribution` now refuses a shipped migration that uses a GUID as an `EntityID` when no
  shipped SQL seeds that GUID, which is the half that stops the commonest form of this recurring. It
  narrows the class rather than closing it — the check's docblock names the three shapes it still
  cannot see — so it is a gate, not a guarantee.

- 11a838e: Duplicated core metadata broke CodeGen for anyone who regenerated; one SQL escaper replaces sixteen.

  **The metadata (#64, #66).** `V202608191300` promises idempotency in its own header and delivers it for most of its length — the `Entity` block is fenced on a natural key, every `EntityField` insert is guarded `WHERE ID = '<guid>' OR (EntityID = … AND Name = …)`. Seventeen statements are guarded differently: `IF NOT EXISTS (… WHERE [ID] = '<guid>')` and nothing else. That asks whether _this row_ was inserted before, when the fact that makes an insert safe is whether _the thing it describes_ already exists, under whatever id the host minted for it. Any developer who ran `mj codegen` between `V202608182100` and `V202608191300` — the documented workflow — had those rows under CodeGen's ids, so all seventeen guards missed and all seventeen inserted a second copy. None of the affected tables carries a unique constraint on its natural key upstream, so it landed silently and the migration reported success.

  The cost is #66. CodeGen emits one `@FieldResolver` per `EntityRelationship` row, so the duplicated `Forms → Form Screens` row made the next regeneration emit `mjBizAppsFormsFormScreens_FormIDArray` twice and `forms-server` stopped compiling — which is why every `mj codegen` run on an affected host ended `ERROR running one or more AFTER commands`. The checked-in generated files predate the duplicate and still compiled, so the break appeared only on regeneration, looking like it belonged to whichever branch happened to regenerate.

  `V202608252300` converges by keep-list: for every row `V202608191300` ships, any _other_ row carrying the same natural key is removed, so a repaired host becomes row-for-row identical to a fresh install rather than merely un-duplicated. It is a strict no-op on a clean database and on a partially hand-cleaned one, and it cannot touch host-authored metadata — every delete requires a same-natural-key sibling from the keep-list. It then asserts its own end state, scoped to this app's entities.

  **Two findings beyond the issues.** `EntitySetting` was duplicated too (`FieldCategoryInfo` and `FieldCategoryIcons` on Form Screens) and was in neither issue's sweep; it is converged here. And the ID-only guard is not one migration's slip — it is the guard **CodeGen itself emits** for a relationship row, present in 51 statements across five migrations, four of which are pasted CodeGen output. The real fix is upstream in MJ; until then `scripts/check-distribution-seed.mjs` CHECK 4 refuses the shape at authoring time (watershed after the last shipped offender, like CHECK 3), and `smoke/metadata-integrity-path.mjs` rules on the end state in the database — the half no unit test can reach, since every existing gate reads checked-in files and this defect lives only in `__mj`.

  **The escaper (#67).** The shipped packages carried sixteen implementations of "double the single quotes" — seven named local functions spelled four ways, nine written inline. (Nine more live in `smoke/*.mjs` and stay there deliberately: those are stdlib-only scripts that run in order to test a build, so importing the built package would make the suite depend on the artifact under test.) They had already drifted into four different decisions: one N-prefixes the literal, one tolerated `null`, one escapes LIKE wildcards, the rest do neither. They are now one module in `@mj-biz-apps/forms-entities` (`escapeSqlString` / `quoteSqlString` / `sqlLiteral`), which every consumer package already depended on, so no new coupling was created — the coupling was what had kept the duplication alive.

  Purely a refactor: the SQL each call site emits is byte-identical, including the file-link gateway's `(value || '')` tolerance, which is load-bearing because that package compiles without `strictNullChecks`. Upgrading the plain-quoted sites to the N-prefixed form is a behaviour change — the prefix decides whether SQL Server compares a non-Latin value or a row of `?` — and is deliberately not part of this.

- 4831864: The `Signature` question type is now `Doodle`, and stops presenting itself as a signature (#97).

  The control was always a canvas that captures a freehand drawing, exports a PNG and stores it as an ordinary file answer. It has none of the apparatus a real e-signature needs — no identity verification, no content hash, no signing certificate, no audit trail of a signing event — so the name was a promise the feature could not keep, and customers would reasonably have relied on it. It ships as a drawing tool instead; real e-signature is separate work through a signing provider.

  **No released version ever carried `Signature`, so no upgrader is losing anything.** The type arrived with the still-unreleased element-parity work, whose changeset is renamed here in step; the published `CHANGELOG`s stop at 0.10.0 and never mention it. What the rename does have to survive is a **dev or staging database** where forms were already built and published against it, and that is what the migration is for.

  **`V202608301200` is not optional and cannot ship after the code.** `QuestionType` is persisted in `FormQuestion`, constrained by `CK_FormQuestion_QuestionType`, mirrored into the designer dropdown's `EntityFieldValue` row, and — the dangerous one — frozen into `FormVersion.DefinitionSnapshot`, which is what the public link is served from. `snapshot-parser` fails closed at three levels: a question at an unknown type makes its page `undefined`, and a page makes the whole definition `undefined`. So one unmigrated `"type":"Signature"` does not degrade to a missing field, it takes the entire published form off its public link along with every other question on it. The migration drops the constraint, moves the rows, puts the constraint back, rewrites the snapshot token and updates the dropdown row, in that order because each step blocks the next.

  **Deploying: migrate, then start. Two consequences of that, both load-bearing.**

  The migration is **forward-only** — `isFormQuestionType` is a `hasOwnProperty` test against a table that no longer holds `Signature`, so old code cannot read a migrated database any more than new code can read an unmigrated one. Both directions have been observed, not reasoned about.

  - **Stop the old process before migrating, not after.** Migrating while an old instance still serves takes that instance's forms down for as long as it runs, and it does so silently — `PublishedForm` returns `null` with no GraphQL error, so the widget shows "This form is not available." and nothing is logged. A rolling or blue-green deploy, or a second API against the same database, is therefore not safe here without an expand/contract release first.
  - **Do not roll the code back on its own.** There is no down migration, so reverting the deploy puts old code in front of migrated data and reproduces exactly the outage above — the reflex that usually makes a bad deploy safer makes this one worse. A rollback has to take the database with it.

  The snapshot rewrite targets the exact `"type":"Signature"` token and nothing else: the same JSON holds respondent-facing prompts that contain the word (`"Untitled Signature question"` is the builder's own default), and a blanket replace would rewrite an author's question text. That token has exactly one spelling because publish writes the snapshot with `JSON.stringify`, which is also why `isFormQuestionType` deliberately does **not** keep `Signature` alive as an alias — an alias with no behaviour row turns a clean fail-closed into a thrown `Unknown FormQuestionType`, and one with a row is not a rename at all.

  **The AI Designer prompt change ships as metadata, not as a migration** (#105). The prompt enumerates the allowed `type` values and is updated here in `metadata/templates/templates/forms-form-designer.template.md`. An earlier revision of this branch also hand-authored a `V202608301210__…__Metadata_Sync_Doodle_Taxonomy.sql` to push it, which is the per-PR cadence `MJ/metadata/CLAUDE.md` §1b rules out; that file is gone. The edit reaches hosts through the release's one consolidated seed, which `mj sync push` emits against a clean database — and because this is an edit to an **existing** record's `@file:` body (the template's id already ships in `V202608182130`), the push picks it up as an `spUpdate*` by construction.

  Until that release seed, a host still running the old prompt will sometimes propose `Signature`. That costs a **retry, not a failure**: `llm-form-designer.ts` loops to `MAX_DESIGNER_ATTEMPTS` and feeds the validation error and the previous attempt back into the prompt, which the template has a `{% if ValidationError %}` branch for. `V202608301200` — the CHECK-constraint rename — is ordinary DDL, is not a metadata sync, and stays.

  **`packages/Entities/src/generated/entity_subclasses.ts` was hand-edited**, which the repo otherwise forbids: the CHECK constraint is the value list CodeGen turns into the generated `QuestionType` union, and the rename does not compile until that union moves. It reproduces what CodeGen emits from the migrated schema — 'Doodle' sorted between 'Date' and 'Dropdown', because `syncEntityFieldValues` renumbers every `Sequence` from the sorted constraint list. **Run `npm run mj:codegen` after applying the migration and confirm the file does not change.** `question-types.spec.ts` pairs the contract to the generated file, so a CodeGen run against an unmigrated database fails the suite rather than silently reverting the rename.

- 9eb264b: Undo, stroke width and pen colour on the doodle pad (#98).

  **Undo is the one with design consequence.** The pad had no stroke model: `onPointerMove` drew straight onto the canvas bitmap and the only state kept was a `hasInk` boolean, so there was nothing to undo _from_. Strokes are now retained as data — points, colour, width — and the bitmap is a render of them rather than the drawing itself. The live pointer path still draws incrementally (repainting the model on every pointer sample would make a long drawing progressively laggier on a phone); only undo and cap-eviction repaint.

  Three properties that were easy to get wrong, and are now guarded:

  - **Undo stops at a restored image.** The pad is controlled and repaints from the stored PNG whenever it binds to a subject. A PNG is flat pixels with no history, so a restored drawing cannot be un-drawn stroke by stroke — undo reaches back through this session's strokes only. Erasing the restored image instead would mean Undo silently destroying earlier work the respondent cannot see it about to destroy; Clear is the control that removes everything, and it says so.
  - **Every undo re-exports and re-uploads.** The response carries the _file_; leaving it showing the stroke just removed would put the artifact and the screen quietly out of step, with no way for the respondent to notice. Undoing back to a genuinely empty pad drops the answer exactly as Clear does, so no orphan file is left behind. An undo also supersedes in-flight exports and repaints through the existing `PadCaptures` generation stamp, for the same reasons a new stroke and Clear do.
  - **`MAX_RETAINED_STROKES` caps memory, not the drawing.** A stroke aging out of undo range is baked into the pad's base image on its way out, so it stays on screen and in every export; reaching the cap costs undo _range_ and nothing else. `addStroke` hands the caller what fell out precisely so that cannot be forgotten.

  **Pens.** Six named colours and three named widths — named rather than a free picker and a slider, because three values are three things to test and three large tap targets, where a slider is a continuum nobody hits precisely on a touchscreen. `Medium` is 2.5, the width the pad already hardcoded, so a question with no pen settings draws exactly as it did.

  Every coloured pen is `color-mix(in srgb, <hue> 65%, var(--mjf-doodle-ink))`. A fixed hue cannot be guaranteed legible when the _author_ picks the page colour, and `emitPng` composites onto that same colour, so an invisible pen is an invisible stored artifact. Mixing toward the page ink pulls each hue toward the one colour the theming layer already guarantees reads on this page — the construction `--mjf-status-error` already uses. `doodle-pen-contrast.spec.ts` reads the hues out of the stylesheet, reproduces the mix and the ink repair, and holds every pen to the 3:1 WCAG asks of a non-text graphic across five real page colours; the known floor (a mid-luminance page) is documented where the pens are defined.

  **Author settings** live in the open `Settings` blob as `penColor`, `penWidth` and `penControls`, edited through a new `choice` setting kind that renders the contract's own option list — so the panel cannot offer a value the widget would silently fall back on. `doodlePen` validates each key independently on the way in, because `Settings` is reachable by paste and by API: an unknown colour or a nonsense width becomes the default rather than a broken pad, and one bad key does not discard the author's other choices. With no settings present the pad behaves exactly as before — theme ink, medium stroke, no controls shown. Undo and Clear are always available.

  Nothing downstream changes: the answer is still a PNG through the same upload path, still stored as `FileID`.

- 1bc7aa3: Ten new question types (Website, Checkbox, Legal, PictureChoice, OpinionScale, Ranking, Matrix, Address, ContactInfo, Doodle) and Welcome/Ending screens as a first-class `FormScreen` entity rather than as question types — a screen is never answered, produces no `FormResponseAnswer` and appears in no aggregation, so it renders as a phase of the widget shell instead of an item in the question list. Many endings are supported, each with its own condition and redirect, resolved by one function shared between the widget and the server.

  Question-type behaviour now comes from a single capability table in forms-entities, with `FormQuestionType` derived from it, replacing six duplicated switches across four packages — including a hand-copied type list in the server's snapshot parser that could not learn when the contract grew. Also adds per-page partial submit points.

  Two migrations: `V202608182100` widens `CK_FormQuestion_QuestionType` to 25 values and adds `FormScreen`, `FormQuestionOption.ImageURL`/`MatrixAxis` and `FormPage.IsPartialSubmitPoint`; `V202608182130` updates the AI Designer prompt to the full taxonomy. Apply both before deploying the code — the reverse order lets the builder offer types the CHECK constraint rejects.

  Fixes a builder save race in which two edits landing in the same tick silently lost the second (`BaseEntity.Save()` re-reads the record it saved, discarding anything written while it was in flight); saves are now coalesced per entity and flushed before publish. Also repairs the `AssertExtends` compile-time drift guards, which could never fail because a naked type parameter distributes over its union — every "fails the build on drift" guard in the repo had been passing vacuously, hiding a blueprint enum stuck at 15 types.

- 5935085: Refuse a public submission that names no question or would store nothing (#124)

  A submission whose answers matched no question in the published form came back `success: true`,
  wrote a `FormResponse` with `Status = 'Complete'` and zero answers, and incremented the
  distribution's `ResponseCount` — so two empty submissions filled a `MaxResponses = 2` link and the
  door then turned real respondents away with HTTP 410.

  Both rules now land in `validateSubmission`, ahead of every write:

  - An answer whose question id is in no page of the published definition is a field error naming
    that id, in every mode. A mixed set is refused whole; a repeated unknown id is reported once.
  - A `complete` submission that would store nothing, **on a form that asked something**, is refused
    with a form-level message. A form that asks nothing — an acknowledgement form of pure `Statement`
    copy, or one whose every answerable question is hidden on this path — stays completable.

  Behaviour change to note: a respondent who answers nothing on a form of only optional questions now
  sees a banner instead of the thank-you screen. The widget refuses that submit locally, so they are
  told without a round trip, and both sides now read one shared `NOTHING_TO_SUBMIT_MESSAGE` from
  `@mj-biz-apps/forms-entities`.

- 88143e7: Adopt MJ 6.1's `IsHierarchy` opt-in so Form Categories and Forms stay readable

  MJ 6.1.0-edge.3 put base-view `Root*` hierarchy columns behind an `EntityField.Configuration` seed.
  Forms never shipped one, so the first `mj codegen` on any host dropped `RootParentID` from
  `vwFormCategories` and `RootTemplateSourceFormID` from `vwForms` while their `EntityField` rows
  stayed — making every read of both entities fail with `Invalid column name`, which a grid renders as
  "no data" rather than an error.

  `FormCategory.ParentID` is seeded as a hierarchy and gains the full column set
  (`RootParentID`, `ParentIDDepth`, `ParentIDPath`, `ParentIDIsLeaf`, `ParentIDChildCount`).
  `Form.TemplateSourceFormID` is seeded as **not** a hierarchy — it is a one-hop provenance pointer —
  so `RootTemplateSourceFormID` is removed from `vwForms` and from the generated `FormEntity`.

  **Also in this release, because the regeneration carries it: the child-array GraphQL fields are
  gone.** `forms-server` previously contributed 25 `@FieldResolver`s and 50 `<Parent>_<Child>IDArray`
  fields to the host schema — `mjBizAppsFormsForms_CategoryIDArray`,
  `mjBizAppsFormsFormAutomationRuns_FormAutomationIDArray` and so on. MJ's CodeGen stopped emitting
  them (`CodeGenLib/src/Misc/graphql_server_codegen.ts`): they resolved with a per-parent `SELECT *`,
  which is an N+1. Regenerating against the pinned MJ therefore removes all 50 fields and all 25
  resolvers from the schema this package contributes.

  Nothing in this repo queried them, but they were part of the published GraphQL surface, so a client
  selecting one must move to `RunView` (or `DeclareRelatedRecords`) for the same data — MJ's own
  stated replacement.

  **One exported method is renamed.** `mjBizAppsFormsFormEntity.ValidateTemplateStatusRestriction`
  becomes `ValidateStatusForTemplates`. The body is unchanged — a template may not be `Published` —
  but the name is part of `@mj-biz-apps/forms-entities`' published surface, so an external caller
  invoking it by the old name no longer compiles. CodeGen derives the name from the CHECK
  constraint's shipped metadata, and no alias is possible without hand-editing generated output,
  which this same change now refuses. Call the new name.

  **Two further generated behaviours change, neither of them cosmetic.** The 25 relationship grids
  across the twelve regenerated forms now pass the FK join field to `NewRecordValues(entity, field)`,
  so creating a record from, say, a Form's Distributions grid pre-fills the parent link instead of
  leaving it blank. And the Form Screen form's content section is re-keyed from `content` to
  `screenContent` (and renamed `Content` → `Screen Content`, which the shipped metadata already
  says). Section expansion state and panel height are persisted per `(entity, sectionKey)` through
  `UserInfoEngine`, so a user who had collapsed or resized that section gets the default back once —
  their stored preference sits under the old key. It resets once and then persists normally.
  (The `ShowToolbar` flip in the same templates is _not_ in this list: MJ's `EffectiveShowToolbar`
  already forced the toolbar on inside a related-entity panel, so those 25 sites change nothing at
  runtime.)

  `minor` is the level because this change ships a migration and metadata, which is what
  `.claude/rules/changesets.md` keys the decision on — not because of the public-surface changes
  above. Those are listed so nobody has to discover them from a diff.

- 89ca16f: A share link's magic-link credential is now withdrawn when the link is, and can be reissued without changing the URL.

  The credential outlived the thing it authorised. A distribution's `MagicLinkInvite` was minted once and then never written again — pausing, closing or setting a link back to Draft stopped **Forms** honouring it and left the invite `Active`, `ExpiresAt` roughly a century out, `MaxUses` a million, with no way to rotate a token whose URL had leaked short of deleting the distribution and losing the slug. Nothing was exploitable: the session JWT is scoped to its own distribution, and after #90 all three Forms gates refuse a link that is not `Active`. What was wrong is that the protection was one layer deep, and that layer had failed twice in a fortnight in the same file (#81, and the `Status='Draft'` case in #90). Closes #104.

  **One invariant, on the writer-agnostic seam.** A distribution that is a live, linkable public channel holds exactly one live credential; anything else holds none. `decideProvisioning` is now a function of the distribution's current state rather than of a mint-once flag, and `FormDistributionEntityServer` restores it after every `Save()` — so a link closed by an Action, an import or the public submit path revokes too, with no transition to detect and no old value to read. A raw SQL `UPDATE` reaches no entity object and so triggers nothing at the moment it runs; what the state function buys there is that the next save of that row restores the invariant regardless, where a transition function would have missed it permanently. Revocation writes MJ core's own `MagicLinkInvite.Status='Revoked'`, which `evaluateInvite` rejects ahead of every other check and the atomic consume `UPDATE` excludes by matching only `Status='Active'`; core ships that state machine but no method to drive it, so the seam that already owned minting (`IAnonymousMagicLinkMinter`) gained `RevokeAnonymousInvite` beside it.

  **Reissue needed no new mechanism.** "Holds a credential" means the invite id AND the raw token, so clearing `PublicLinkToken` on a live link reads as "holds none, warrants one" — the old invite is revoked and a replacement minted in the same save, under the unchanged slug. That is the builder's new **Reissue link** control, and equally an import's or a data fix's. A link that stays `Active` throughout is not touched at all: no churn, and existing URLs keep working, because `/f/:slug` resolves the token at request time rather than carrying it.

  **Two failure directions, chosen deliberately.** A revocation that fails leaves the credential LINKED and retries on the next save — unlinking one we could not kill would orphan a live invite nothing references. A mint that fails leaves the link credential-less, which the builder badges "Not ready" with its existing one-click fix. And a mint that returns no raw token is now a failure rather than a partial success, because a tokenless invite is a dead `/f/:slug` link that would also re-trigger the reissue path on every save.

  **The expiry now keeps up with the date it mirrors.** It was set at mint and never revisited, so moving or clearing a link's closing date afterwards left the credential expiring on the old one — and the builder's own "Remove the expiry" fix produced a link badged Live whose token core refused. Every save of a live, credentialled link re-bounds its invite, writing only when the value actually moved. That pass is the reason the no-expiry sentinel is now a fixed instant (`9999-12-31`) rather than `now + 100 years`: a relative sentinel never compares equal to itself, so the pass could not tell "already unbounded" from "needs changing" and would have walked every unbounded invite's expiry forward on every save. The fixed one also reads as what it is, where `2126-08-28` looked like a century somebody had chosen.

  `resolveExpiry` takes the EARLIER of the link's `CloseAt` and any host-wide `FORMS_MAGICLINK_EXPIRY_HOURS` ceiling; the ceiling used to win outright, which let a 30-day ceiling keep a credential alive for a link that shut on Friday. A short _default_ was considered and rejected: nothing on the distribution records the credential's expiry, so a link would go dead while the builder still badged it Live — the credential dying with the link is what removes the century's sting, not a smaller number. `MaxUses` stays at 1,000,000 for the same reason and it is now written down where the constant lives: it counts page opens rather than submissions, `MaxResponses` is the real quota and is enforced at submit, and any lower cap would lock respondents out invisibly.

  Deleting a distribution revokes its credential too. Without that the invariant survived every state change except the one that ends the record — and delete-and-recreate was the pre-#104 recourse for a leaked link, so it is the path most likely to be used on a credential someone wants dead. The delete runs first and the revocation follows it, because refusal is the common case here (`FormUpload.DistributionID` is a required FK) and revoking first would kill a live link's credential every time a delete was bounced.

  In the builder, `Paused` now outranks `Not ready` in the share-state cascade, because a paused link legitimately has no token by design; leading with "Not ready · Issue the link" would offer a button as the cure for a switch the author turned off themselves. Pausing, reopening, issuing and reissuing all re-read the record afterwards, since each makes the server write the credential in a second save this client never sees.

  **The credential columns are server-owned, and now enforced as such.** Both ride the generated GraphQL update input and MJ's client sends every writable field, so a builder tab holding a record from before a rotation wrote the OLD pair back on its next ordinary save — silently reverting the rotation, leaving the link badged Live on a token that no longer redeems and the replacement invite `Active` with nothing referencing it. `MagicLinkInviteID` is now never honoured from a client, `PublicLinkToken` may only be CLEARED (which is the reissue request), and a credential supplied on CREATE is stripped. The minter additionally refuses any invite whose `ResourceID` is not the distribution asking — the scope the mint already recorded — so a hand-run `UPDATE` cannot point one link at another's invite and have it revoked by the next save, including the save the public submit path performs under the elevated system user.

  **The host lifetime ceiling is anchored to the credential's issue instant.** `FORMS_MAGICLINK_EXPIRY_HOURS` is a duration, and the re-bounding pass resolved it against `now` — a different answer on every save, so it rewrote the invite every time and walked the expiry forward forever, leaving a ceiling that bounded nothing. `SetAnonymousInviteExpiry` now takes the BOUNDS rather than an instant and resolves them against the invite's own `__mj_CreatedAt`, which only the implementation holding that row can do. Measured against a live server: 3.8 seconds of drift over three unrelated saves before, a single 3 ms settle onto the row's instant and then nothing after.

  **A failed unlink is reported apart from a failed revoke** in the runner's outcome and its log, because for the reissue flow they are opposites: one means the leaked token may still redeem, the other that it is dead and only the record's copy is stale. The BUILDER cannot tell them apart, and no longer pretends to — the two leave identical columns, so every surface built on the record says only that the withdrawal is not confirmed. That is the strongest claim those facts support, and it is true in both.

  **A second review round found four more, each pinned with a failing test first.**

  _The backfill trusted the pointer it was written to distrust._ All three of `V202608302210`'s `UPDATE`s joined `MagicLinkInvite` to `FormDistribution` on `MagicLinkInviteID` alone — the writable, FK-less column whose untrustworthiness is the entire argument for the minter's `ResourceID` check, on exactly the population that predates the hook enforcing it. A closed distribution pointing at a live one's invite had that live credential revoked and only the closed row's columns cleared, leaving the live link holding both halves of a dead credential: `decideProvisioning` reads that as `current` and never re-mints, `shareState` badges it "Live", and no later save repairs it. A permanently dead public link caused by the repair. Reproduced against a real database, fixed by re-deriving the scope from `MagicLinkInvite.ResourceID` in all three statements, and re-verified on the four cases the migration exists for.

  _The "Open to responses" switch read half the question and then acted on the other half._ Its on/off state came from `Status === 'Active'`, but open means `Status='Active'` AND `IsActive` — the pair the server requires and `openForResponses` writes. On the exact row shape `openForResponses` was written to repair, the switch rendered ON beside a "Paused" badge and its handler, sharing the half-predicate, decided the link was already open and CLOSED it. The predicate is now one exported function, `isOpenToResponses`, which the badge, the switch and the handler all ask. A test was asserting the defect — it permitted exactly two `link.Status` reads "where it is the actual control" — which is how this survived; the allowance is gone.

  _A paused link claimed its token had been withdrawn without checking._ Revocation is fail-soft by design — the save returns `true` whether or not the invite could be written — so a green close and a still-redeemable token are indistinguishable from the client, and at the time this was written a host that did not grant Update on `MJ: Magic Link Invites` got the second every time (fixed below, #114). The badge asserted the first anyway. The record carries the answer, because the server leaves the credential linked precisely so the next save retries: `credentialMayStillRedeem` names that signal, the paused detail now says which case it is, and turning a link off warns when the withdrawal did not land, the way issuing and reissuing already warned when a mint did not.

  _Three tests were asserting against signatures that do not exist._ Every package excludes `**/__tests__/**` from `tsc`, and vitest transpiles without type-checking, so a spec calling `RevokeAnonymousInvite('   ', user)` — the pre-`AnonymousCredentialRef` signature — compiled, ran, and passed for the wrong reason. Two more were mis-typed the same way. Fixed. The missing gate was first filed rather than added, on the claim that closing it repo-wide needed "five" pre-existing errors fixed in unrelated specs; the real number, measured, was **seventy** (Entities 3, Server 32, Angular 35, none in the two packages this branch is about). Both the errors and the gate ship in this release — see below.

  **Closing a link no longer requires the person closing it to be a Developer (#114).** `MJ: Magic Link Invites` is a CORE entity, and no Forms seed touches its permissions — on a stock database only `Developer` and `Integration` hold Create/Read/Update. Every credential write is driven by an ordinary save of a `FormDistribution`, and until now they ran as whoever saved it. So on the ordinary least-privilege shape — an author with full rights on the links they own and nothing on core's magic-link table — `BaseEntity.Load` threw on Read before the revoke was even attempted, provisioning is fail-soft by design, and pausing a link returned green with the token still redeeming. The defect #104 exists to remove, surviving intact on precisely the deployments careful enough to build a narrow role. Minting failed the same way one permission over, so such a host could not publish a working link at all.

  The fix is not a wider grant. The invite is the APPLICATION's row: not one field on it comes from the caller, and the caller's authority has already been spent — and checked by MJ — proving they may write the distribution it belongs to. Requiring a second permission on an unrelated core entity is an implementation detail leaking into the operator's access model, where it corresponds to no decision they actually make; and a grant broad enough to work would let any form author revoke another app's magic links, since the shipped seed carries no row scoping on that entity. So `MagicLinkInviteMinter` now resolves the identity it writes under exactly the way MJ core's own `MagicLinkService` does for the same table — `magicLink.contextUserForProvisioning`, then `userHandling.contextUserForNewUserCreation`, then an Owner — and falls back to the caller when none of those resolve, which is what it did before and therefore never worse. The ROW still records the author in `CreatedByUserID`: that is the audit trail, and core's redeem path fails closed on it, refusing every outstanding invite of a deactivated inviter.

  `pnpm run smoke:credentials:least-privilege` is the proof. It seeds the author such a host would have, drives the ordinary builder operations as that user against a real booted server, and asks core to redeem the token afterwards — with the same operations run as System beside each one, so a failure names the principal rather than the mechanism. Sixteen assertions; before the fix the four that matter were red, including a paused link whose token still redeemed with HTTP 200.

  **Version bump is `minor` because this ships two migrations**, neither of which changes the schema.

  `V202608302200` is documentation only, and `@mj-biz-apps/forms-entities` is in the bump list for it: the corrected description reaches TypeScript through CodeGen, so both `entity_subclasses.ts` and the GraphQL `@Field` description in `generated.ts` change with it. Without that bump the migration would fix the database while the published packages went on telling an integrator that clearing `PublicLinkToken` means nothing — the two-copies-out-of-step condition this migration exists to end, one layer up.

  `V202608302200` corrects what the database says. It corrects `FormDistribution.PublicLinkToken`'s column description, which asserted the exact behaviour being replaced ("Written once after a successful mint and left unchanged thereafter") and is the one place a non-builder writer would look to learn that clearing it now means "reissue".

  `V202608302210` retires the credentials minted before a link could lose one, in three guarded, idempotent `UPDATE`s. The lifecycle hook restores the invariant on every _save_, and nobody saves a link they closed last month — so without this, every already-paused and never-published link on an existing install keeps a redeemable invite until something happens to touch its row. `Active` invites whose distribution is not open for responses go to `Revoked`; those distributions have both credential columns cleared; and a live link whose closing date is already set has its invite's expiry pulled back to it. Invites already `Consumed` or `Expired` are left alone, because overwriting how they ended would claim an operator action that never happened — and the clearing step is restricted to links that are not open for responses, because a LIVE link pointing at a revoked invite is an operator's deliberate kill (core calls that status "the primary revocation mechanism", and before this release it was the only way to stop a leaked Forms link without losing its slug). Clearing those columns would have revived it: the hook reads a live link holding no credential as "mint one".

  **One configuration change becomes destructive, and it did not used to be.** `FORMS_MAGICLINK_CHANNELS` was a mint GATE: narrowing it stopped new links of that channel getting a credential and left existing ones alone. It is now read by a state function, so a channel dropped from the list is a channel whose live links are no longer warranted — and the next save of each revokes its credential, including the save the public submit path performs to bump `ResponseCount`. That is the correct reading of the invariant and it is what makes the config meaningful rather than advisory, but it means narrowing the list retires working links rather than merely declining to make new ones. Widen-only is the safe direction; narrowing wants the same care as pausing the links by hand.

  **One population the backfill deliberately does NOT reach: invites whose distribution was already deleted.** `V202608302210` joins `FormDistribution`, so a credential whose link no longer exists is never matched — and that is exactly the corpus delete-and-recreate produced before this release, when deleting was the only way to kill a leaked link. Running the new end-to-end smoke against the shared development database found sixteen such rows, the newest predating this branch, every one still `Active` with a century-long expiry and nothing in any UI that shows them.

  They are left alone on purpose rather than by oversight. Nothing in SQL can tell a Forms orphan from another app's: `MagicLinkInvite.ResourceID` names a row that is gone, and `ResourceTypeID` — the column that would identify the owning entity — is NULL on every `Kind='resource-share'` invite on that host, because the minter resolves it best-effort and no `ResourceType` row is registered for Form Distributions. A cleanup step matching orphaned resource-share invites would therefore revoke `bizapps-common`'s and `bizapps-tasks`' credentials too, on any host that shares the schema. That is precisely the "re-derive the scope, never trust a bare pointer" rule the commit above this one exists to enforce, so the backfill honours it rather than making an exception for its own convenience.

  The exposure is small and worth stating exactly: such an invite still redeems, but the session it mints is scoped to a distribution id that resolves to nothing, so every Forms gate refuses it. It is a standing grant of the restricted `Form Respondent` role with nothing reachable behind it — not a route into anybody's data, and not something this release can close without a way to prove ownership. Registering a `ResourceType` for Form Distributions would give future invites that proof; it is metadata, which is release work, and is filed rather than smuggled in here.

  **Operators should expect this**: a link that is currently paused or closed will be issued a NEW token the next time it is turned back on, and its previous token stops working on upgrade. A live link that already has a closing date will have its credential's expiry pulled back to that date. A live link whose invite was revoked by hand is left exactly as it is. The web address is unchanged in every case, so nothing already printed or embedded breaks.

- 89f4c0a: **A misconfigured host is told so at boot, once, by setting name — not by a respondent, repeatedly (#122).** Two host settings Forms cannot install for itself stayed silent until a respondent paid for them. `FormDistribution.CaptchaRequired` defaulted to **1**, and the submit gate is an OR of that column and the form's own setting, so a link row created without naming the column — a direct INSERT, an import, an API caller relying on entity defaults — demanded a captcha the form never asked for; on a host with no Turnstile keys every final submit to it was then refused with _"Captcha verification failed (turnstile-not-configured)"_, after the respondent had typed everything, wording a server misconfiguration as their failure. And MJ core's default magic-link provisioning user is a literal placeholder that resolves to nobody, so every link open logged `[MagicLink] Configured provisioning user 'not.set@nowhere.com' not found; falling back to an Owner.` and provisioned the respondent's anonymous account under whichever user happened to be an Owner.

  `V202609011500` makes captcha **opt-in**: the column default becomes 0 in all three places CodeGen had copied it to — the constraint, `spCreateFormDistribution`'s `ISNULL(@CaptchaRequired, 1)`, and `__mj.EntityField.DefaultValue` (the one `BaseEntity.NewRecord()` applies) — written by hand and idempotently, because the only generated code that changes is a doc comment and a CodeGen run would have carried whatever else the generating database held. Existing rows are deliberately untouched. The builder UI cannot produce a 1 — it writes the column explicitly and has no captcha control — so a stored 1 came from somewhere else: a direct INSERT or import, an entity-layer caller, Explorer's generated entity form, or an embedder passing `captchaRequired` to `createDistribution`. A deliberate one of those is indistinguishable from a writer that relied on the old default, and switching a captcha off for whoever chose it is the worse error. The new boot check names any active link that still requires a captcha on a Turnstile-less host, so such rows are reported rather than silently left. Links created through the builder were never affected in the first place.

  The boot-time readiness check now reports every problem at once under the prefix the README already tells operators to grep for: `magicLink` and the role as before, plus a provisioning user that is unset or matches no `User.Name` (core matches on Name, not email, whatever its config comment says — the message says which, and offers the host's system user), plus Turnstile keys that are half-configured, or absent on a host where an active link or a published form requires a captcha (one bounded read at startup, never a throw). A captcha-required submit that still reaches a Turnstile-less host is refused as what it is: the respondent reads _"This form requires a security check that has not been set up on this server. Please contact the form owner."_, the operator gets an error line naming `FORMS_TURNSTILE_SECRET` and the link. The transport was never a 500 — the pipeline already answered 200 with `success:false` — so what changed is the copy and the silence.

  That sentence is now a single shared constant, `CAPTCHA_NOT_CONFIGURED_MESSAGE`, exported from `@mj-biz-apps/forms-entities` and used by both surfaces: the server's refusal and the widget's own "captcha is on but no site key reached me" message. It has to be one string rather than two, because the widget also _classifies_ the refusal by its text — `isTurnstileError` decides whether to clear the spent single-use Turnstile token and re-arm the challenge, and the transport carries no error code for it to read instead. While each side spelled the sentence for itself, that classification held only by the accident of both spellings containing the word "captcha", and re-wording the server's copy to stop blaming the respondent silently broke it. Matching one shared constant by identity is what stops the next re-wording doing the same.

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

- 30f73d3: Rules & branching (`plans/RULES_AND_BRANCHING_PLAN.md` Phase C, as narrowed by `plans/RULES_SIMPLIFICATION_PLAN.md` and `plans/done/QUESTION_LEVEL_LOGIC_PLAN.md`): `jump` on questions and sections, per-option scoring, and screened-out endings, on top of the existing `show` verb — authored in one **Edit logic** dialog per item, which shows the show gate and the ordered list of "if … then go to …" rules together.

  **One sentence, two verbs.** A rule says "when ⟨answers match⟩ → show this" or "when ⟨answers match⟩ → go to ⟨a question, a section, an ending, or Submit⟩". Two things that were briefly in this release are not in it. The conditional `require` verb is gone: every question already carries a Required toggle, so the verb was a second answer to a question the editor had already asked, the toggle silently won when the two disagreed, and the widget's asterisk and `aria-required` never knew about it — a conditionally-required question looked optional right up until submit refused it. And four operators are gone (`equalsIgnoreCase`, `contains`, `startsWith`, `endsWith`), leaving eight: all four only ever did anything on free text, where a rule fires on whether the respondent's spelling matched the author's. Conditions belong on questions with a fixed answer set, where the value is picked rather than typed.

  No migration: both live inside JSON columns. A stored rule carrying `require` still parses and the key is stripped (zod `z.object` drops unknown keys). A stored rule using a removed operator does NOT parse, and the server's existing posture applies — `parseOptionalConditional` logs loudly, names the item, and treats it as unruled, which for a `show` rule means visible to everyone. Nothing shipped uses either.

  **One evaluator, two consumers.** Every verb is a pure function in `forms-entities` (`rule-verbs.ts`, `scoring.ts`, `form-screens.ts`) that the widget and the server both call: `evaluateConditionalRule`, `resolveVisiblePages`, `resolveRenderedQuestions`, `resolveVisibleQuestions`, `resolveTermination`, `resolveFormOutcome`, `computeScore`, `resolveEndingScreen`. That is not tidiness — the two ends must agree on which questions are on screen, or the server rejects a submission by naming a field the respondent was never shown, and every retry sends the identical payload. The widget's rendered question set is now a fixed point of "restrict the answers to this set, then re-derive from them", so the server's single pass reproduces it. Capped at five passes with an explicit warning rather than looped to convergence, because `isNotAnswered` makes visibility non-monotone: removing an answer can reveal a question, and a form whose rules have no stable answer is a real thing to say out loud.

  **A knockout is not a completion.** `FormResponse.Status` gains `Disqualified`, deliberately kept out of `Complete`: it is terminal (the row is sealed, the session is not resumable) but it counts toward no quota, fires no `OnComplete` automation, and gets no `SubmittedAt`. The three call sites that had each decided "terminal" for themselves — the dedupe lookup, the pipeline, and persistence — now read one exhaustive mapped type in `response-status.ts`, so widening the CHECK constraint fails the build until the new status is classified. They had already drifted: persistence knew about `Disqualified` and neither dedupe path did, so one knockout could be written twice for one session.

  **Two authoring bugs found on the way, both silent.** `serializeConditionalRule` returned `null` unless the rule had a `show` group, so a jump-only rule was discarded on save with no error. And the form-clone service copied neither `IsDisqualification` nor `IsPartialSubmitPoint`, so duplicating a form quietly dropped its screening — `form-clone-columns.spec.ts` now derives each entity's settable columns from the generated subclasses and fails when a `copy*` method omits one, with an exclusion list that has to carry a reason.

  **A destination, not a verb.** Disqualification stopped being a rule and became a property of an ending screen (`IsDisqualification`), reached like any other destination: a rule says "go to ⟨that ending⟩", and whether reaching it screens the respondent out is the screen's business. What went with it was a whole mechanism — an ending's `show` group used to mean two different things depending on the flag, so an empty group meant "disqualify everyone", which needed an armed/unarmed guard nobody could see in the UI. One forward walk over the form now resolves visibility, branching and termination together, which is what makes a cycle unrepresentable rather than merely discouraged.

  **Two authoring defects in the dialog itself.** A `<select>` bound with `[value]` and filled by `@for` is compiled as _write the value, then create the options_ — the write does not stick to an empty list, and the browser then selects the first option on its own. Every stored rule therefore rendered pointing at the first question on the form, the first operator, and the first destination, whichever ones it actually named; `[selected]` on each option fixes it, because that is written in the option's own update pass. And a new rule now opens on the item it belongs to instead of the top of the form — a question's jump reads its own answer, which is the shape of nearly every branching rule.

  **A condition reads on two lines.** The question gets a line of its own, the operator and the value the line below it. Three controls abreast put the one carrying a full sentence — the question prompt — on the same row as two that read as three words, so the prompt was what truncated. Narrower than a phone, the operator and value stack too.

  **The dialog is three quarters of the viewport.** It was a 720px card, which on a large display reads as a tooltip while the rule list inside it scrolls. It is now `min(92vw, max(75vw, 720px))` by `min(92vh, max(75vh, 560px))`: a proportion where there is room for one, the old fixed size as a floor so a small laptop is not punished by a rule written for a large monitor, a 92% cap so the floor can never exceed the window, and the whole screen below 640px. Measured across twelve viewports from 2560×1440 to 375×667 — 75% from 1024px up, nothing overflowing at any size.

  **Unfinished conditions are dropped on save, not stored.** A row with a question and an operator but no value reads as `equals ""`, which no answer matches — so an abandoned edit would have hidden the item from everyone. A row left with no conditions at all is dropped for the opposite reason: it fires for everyone. `0` and `false` are values, and survive.

  **A condition's value is picked wherever the answer set is known.** A `Rating` stores the number `5`, a `YesNo` stores `true`, and both offered a free-text box to compare against — so an author could type "excellent" at a five-star question and save it. Only AUTHORED options ever signalled "this answer set is known" (`optionMode`), which left every type whose set comes from the type itself falling through to free text. `impliedAnswerValues` in forms-entities now names those sets — a rating's `1..max`, NPS's fixed `0–10`, an opinion scale's `min..max`, a boolean's `true`/`false` — so the editor offers a picker, and what it stores is the value the answer is stored as, not its spelling. The remaining open answers each get the control that matches them: `type="number"` for a `Number`, `type="date"` for a `Date`, `type="time"` for a `Time`. An `inputmode` hint was never enough — it suggests a keyboard and accepts letters anyway.

  **Some answers cannot be compared at all, and now say so.** `Address`, `ContactInfo` and `Matrix` answer with an object; `FileUpload` and `Doodle` with a file id nobody has read; `Ranking` with EVERY option in the order they were put, which makes "includes any of" true for anyone who ranked anything. All five offered `equals` and `does not equal` against a text box, where `equals` is false for everyone and `does not equal` — its negation — is true for everyone. They now offer the answered-pair and nothing else, so the value control disappears on its own. Ranking needed a new fact to see it: its behaviour row was byte-identical to `MultiChoice`'s, so `QuestionTypeBehavior` gains `ordered`. And a `Statement` is no longer offered as a source at all — it collects no answer, never reaches the answer map, and every operator on it was a constant.

  **`equals` now reads either spelling of the same answer.** `scalarsEqual` was strict `===`, so a rule holding `'5'` against a Rating's `5` could never fire while `notEquals` fired for everyone — wrong in both directions at once, and on a `show` gate the wrong direction is "visible to all". The editor storing typed values fixes new rules; this fixes the three authoring paths that never touch the editor (mj-sync metadata, the AI form builder, everything authored before). The tolerance is one scale wide: `1` is not `true`, `0` is not `false`, and a date is not its own epoch milliseconds. **Rules already live change behaviour** — a `does not equal "5"` that has been firing for every respondent will stop firing for those who answered 5. That is the correction, not a regression, and it is worth knowing before deploying.

  **A time of day can be ordered.** `<input type="time">` gives `"14:30"`, which `Number()` reads as `NaN` and the ISO-date pattern does not match, so `greaterThan`/`lessThan` on a `Time` question were offered in the editor and could not fire for any answer ever. `toComparable` gains a clock scale (minutes since midnight), tagged separately so `"14:30"` orders against another time and against nothing else. An impossible reading like `25:00` stays non-comparable rather than ordering as if someone could have answered it.

  **Two things stopped being derived twice.** The widget kept its own five-star default and its own count-to-eleven NPS range, which the condition editor now has to agree with exactly — a rule naming a sixth star on a five-star question can never fire, and neither screen would say why. Both read `ratingScaleMax` / `numericScalePoints` from the contract, the way `OpinionScale` already did, and every implied set is capped so a pasted `{"max": 1000000}` cannot render a million stars or a million `<option>`s. Separately, the builder's six source lists — a page's show gate and its jump, a question's, an ending's, and the Rules tab's — each mapped the tree themselves; they now share one `sourcesOf`, which is what makes an exclusion possible to state once.

  **Rules read back in the author's words.** A summary said "Consent equals true" (nobody clicked "true") and "Ticket type equals vip" (the identity the form stores, often an id). Both now read the label — "equals Yes", "equals VIP" — with a value the source cannot explain shown verbatim, which is how a rule pointing at a deleted option stays visibly odd. The question picker gained the same honesty as the value picker's "(deleted option)": a condition naming a source the list no longer carries renders a disabled "(question no longer available)" rather than falling back to the first option and reading as a rule about the top of the form.

  **The Rules tab is gone; the canvas carries what it said.** A hub listing every rule on the form read well and was in the wrong place: everything it said about a question belonged beside that question, and an author had to know the tab existed before they could learn a question was conditional at all. Items that carry rules now wear a badge on the canvas — **Conditional**, **Branches**, or **Rule is broken** — with the hub's own sentences as its tooltip, in order, which is where order belongs on an item carrying several `Go to` rules. Questions and pages get badges (a page rule hides every question on it and nothing on the canvas said so); an ending already announces itself as conditional and now also says when its condition has stopped working. `rules-inventory.ts` is unchanged in purpose and still composes the sentences; `groupEntriesByPage` and `brokenRuleCount` went with the tab, having no other reader, and `RulesTabComponent` is no longer exported.

  The one thing that had to survive the tab is its warning. A condition naming a question that was since deleted evaluates false, so the item it guards is hidden from every respondent — permanently, silently, with the form still looking correct in the builder. A broken badge says so **instead of** saying what the rule does, because what the rule was meant to do stopped being the useful fact about it, and it says it in words rather than in colour alone.

  **Deploy the migration first.** `V202608252340` adds `FormScreen.IsDisqualification`, widens `CK_FormResponse_Status` to three values, and carries the CodeGen output for both. In the reverse order the failures are quiet rather than loud: the `EntityField` row is missing, so `BaseEntity` drops `IsDisqualification` on every save and an author can toggle screening, save successfully, and publish a form that never screens anyone — while a submit that does try to seal `Disqualified` is rejected by the old CHECK constraint.

  **One walk, or three consumers guessing.** Three places had to agree on which questions a respondent saw, and two of them were re-deriving it from pages alone: the server's `validateSubmission` iterated `resolveVisiblePages` and re-filtered each page's own list, and the widget's scroll renderer filtered a page's questions on their `show` rules. That is the right answer for a PAGE jump — a skipped page disappears from the page resolver — and the wrong answer for every question-level one, which hides questions WITHIN a page the walk already entered. So a `Go to` skipping a required question left the server demanding a field the respondent never saw (unrecoverable on the anonymous path: every retry sends the identical payload), and in scroll mode the skipped question stayed on screen, asterisk and all, while being dropped from the payload and skipped by validation. Both now read `resolveRenderedQuestions`, and the runtime derives pages, rendered questions and the submitted set from one settled answer map instead of three separate derivations that agreed most of the time.

  **A section's `Go to` fires when the respondent LEAVES it.** It used to fire on arrival, which made the commonest authoring self-defeating: the builder offers a section's own questions as sources for its jump conditions — leaving a section is decided by what was just answered on it — so the only answer that could satisfy the condition belonged to a question the jump then skipped. The section rendered as an empty header, the trigger's own answer was never transmitted, and the widget's fixed point could not settle (dropping the trigger un-fires the jump, which puts the questions back), so it hit its cap, warned, and left the two sides deriving different question sets from the same answers. A page now occupies two stops in the walk — entered and left — and is keyed to the first as a jump destination, so a jump aimed at a section still lands before its questions.

  **Who ends the response: the respondent, or the rule.** `endedEarly` says the flow is over; it was also being read as "so send it now", and those are different claims. In scroll mode a commit is a BLUR, so a `Go to → Submit` — an author's way of saying "stop asking, they are done" — transmitted a completed response the moment the respondent clicked out of a text box, and left the form. Only a screening seals itself now (`endsWithoutSubmit`), which is the whole point of a knockout: it is done TO an ineligible respondent so they do not fill in the rest first. Every other finish waits for Submit. That exposed a second bug it had been hiding — the manual-submit path resolved the ending with `resolveEndingScreen`, which bands by condition and knows nothing about a jump's named target, so the same rule would have shown one screen when it sealed itself and another when the respondent pressed the button. Both paths read one resolver.

  **Three modes, not one boolean.** The server's `partial` flag was passed `true` for two unrelated things: an autosaved draft, and a completed submission from someone a knockout screened out. A draft is unfinished, so judging its half-typed values is unfair; a screened-out submission is finished, seals a permanent row, and only needs `isRequired` waived on questions the flow never reached. Waiving format along with it left the one path that writes a never-revalidated row as the one path with the author's validation switched off. `ValidationMode` is now `'complete' | 'draft' | 'screened-out'`.

  **An ending a rule points at is not "never shown".** The endings list derived its label from the screen alone — default, or has a condition, or unreachable — which was right when a condition on the screen was the only route. A `Go to` can now name an ending directly, so a screen wired up as a rule's destination was labelled dead and told to add a condition; on a screened-out screen that advice is worse than unnecessary, since `resolveEndingScreen` excludes those and never reads the condition at all. `endingReachFor` reports the actual route — **Default ending**, **Conditional ending**, **Reached by a rule**, **Screened out** — and warns only when nothing reaches the screen, naming the gap that is actually there.

  **Scroll mode advances one section at a time.** It stacked every visible section on one surface with a single Submit, which left branching with nowhere to go: a `Go to` could only make questions vanish from a page the respondent was already reading, above the cursor as often as below it, taking whatever they had typed with them. A section is a step now — Back / Next, a "Section 2 of 4" count, and Submit only on the last one — so a jump has a real destination and the questions it skips are never reached rather than removed. A one-section form is one step, which is exactly the form as it always looked. Advancing validates only the section being LEFT: a respondent on section one has not reached section three, and showing them its errors answers a question nobody asked. Three details that are easy to get wrong and were: the captcha gate disables only the FINAL step's control (applied to every Next it strands a respondent on section one, unable to reach the challenge); the final Submit re-validates the whole visible form and navigates back to the section holding the first problem, because `focus()` on a field that is no longer in the DOM does nothing and the form then refuses to submit for no visible reason; and a section whose questions are all hidden is not a step at all, since as one item in a long scroll an empty heading was merely odd and as a whole screen it is a dead end.

  **A component output named `submit`, on a component that renders a `<form>`.** Angular 21's `listenerInternal` gives a component host element BOTH a DOM listener and an output subscription (`if (tNode.type & 3) { listenToDomEvent(...) }`, then `if (processOutputs) { listenToOutput(...) }`). Native `submit` bubbles, so the inner form's event reached `<mjf-form-scroll>` and invoked the parent's submit handler with no output ever emitted — and `preventDefault()` does nothing about propagation. It was invisible while Submit was the only button, because the parent received the event twice and its re-entrancy guard swallowed the duplicate; the moment that button became Next, the bubbled event WAS the submission. `onSubmit` now stops propagation, which is also required on its own account: this widget ships as a custom element dropped into other people's pages, and a `submit` escaping it can trip that page's own form handling.

  **A rule now says what it costs, where you choose it.** "If First name is Soham, go to Submit" reads as a shortcut and behaves as a deletion: four questions are never asked, two of which the author marked required, and nothing said so — the first party to find out was the respondent, and the second was the author a testing round later, reading it as a bug in requiredness rather than as the rule doing exactly what they wrote. The Edit logic dialog now carries a line under the destination ("Skips 3 questions, 1 of them required"), and the same fact reaches the canvas badge's tooltip. `jump-reach.ts` computes it once for both surfaces, mirroring `flattenStops` — including that a section's rule fires where the section is LEFT, so it never skips its own questions.

  **Two ways a rule can be dead, both silent, both now flagged.** A destination that is no longer AHEAD of its rule is inert — the resolver treats backward, self and unknown targets that way by design, which is what makes jump cycles unrepresentable. It cannot be authored, because the picker only ever offers forward targets; it is arrived at by REORDERING, after which the rule reads perfectly in the dialog and never runs. And a `Go to` with no conditions is now REFUSED rather than obeyed: `evaluateGroup({})` is vacuously true, which is right for a `show` gate (no condition, always visible) and catastrophic for a jump, where it means "send everybody past this, always". The builder already drops a conditionless row rather than storing one, so a stored one has come from mj-sync metadata, an AI-authored rule or hand-written JSON — none of which pass through that check. This is the hazard the deleted `isArmedKnockout` guard existed for; that guard went when disqualification stopped being a rule verb, but the vacuous-truth problem moved to the only verb still reading a group as a trigger. Ignoring is the recoverable direction: the form asks everything, which someone notices, rather than silently asking less.

  **A response is never stored without its answers.** `saveResponseWithAnswers` saved the parent row FIRST — which is what flips `Status` to `Complete` and stamps `SubmittedAt` — then deleted every answer the response already had, then inserted the new ones one at a time, aborting on the first failure, with no transaction anywhere. That left a window the whole length of the rewrite in which the row was sealed and its answers were gone: a failure inside it produced a response claiming to be a finished submission, counted against the quota, holding neither the answers it had nor the ones it was sent — and nothing retried, because the dedupe gate refuses a resubmit against a row that is already terminal. Reproduced deterministically before the fix (three banked answers deleted, zero inserted, row saved `Complete`). Two changes: answers are now reconciled in place — each incoming answer overwrites the row already holding that question, and only the rows the submission no longer carries are deleted, LAST, once everything else is safely written — and the row is SEALED only after that, so until then it stays a resumable draft the respondent's retry can land on. The same change removes the rewrite-everything churn: an autosave carrying one answer performed N deletes and N inserts against a form of N questions, on a debounce, per respondent.

  **Questions that vanish say why.** Section stepping fixed the cross-section case; what was left is a `Go to` pointing INSIDE the section on screen, which removes the questions between it and its target while the respondent is looking at them — instantly, unexplained, reading as a glitch rather than as logic. A run of skipped questions now leaves one quiet line where it was: _"3 questions skipped based on your answer to “First name”"_, naming the cause because the cause is also the fix. Which absences earn a word is the point of `section-content.ts` and it is not "every question missing from the page": one hidden by its own `show` rule was never on screen, so nothing was taken away, and announcing it would narrate the form's structure on every follow-up that did not apply. Attribution is deliberately timid — a run is blamed on the question before it, which is where a within-section jump fires, but a jump from an earlier section can land mid-page and leave a run whose predecessor carries no rule at all, so the attribution is dropped rather than pinned on a bystander. The marker fades in (the questions it replaces are removed outright, so only the arrival can be softened) and holds still under `prefers-reduced-motion`; it carries no `role="alert"`, since it is context rather than an error and would otherwise interrupt a screen reader on every keystroke that changes the run.

  **One file question announced another's upload.** `FormQuestionComponent` kept the upload lifecycle in six private fields — status, progress, file name, error, the retained retry `File`, and the supersede stamp — which quietly assumed one instance per question for the life of the form. Neither render mode works that way. OneQuestion renders the whole deck through ONE reused instance (`@if (current(); as q)` never goes falsy, so Angular re-binds rather than rebuilds), and Scroll's `@for` tracked on `$index`, so leaving a section recycled each question component onto whatever question held the same position in the next one. The state therefore outlived the question it described: on a form with a transcript upload at position 4 of section one and a resume upload at position 4 of section two, arriving at section two showed _"transcript.txt uploaded"_ against the resume — a slot the respondent had never filled, on a form where the honest move is then to skip it and submit without a resume. Confirmed against a live form in both directions. It was also called harmless to the stored data on the grounds that answers are bound by question id — true of the Scroll form it was checked on, and NOT true in general; see the next paragraph, which is the half that claim missed. Upload state now lives in `FormUploadStore`, keyed by question id and provided once per widget (per widget, not a `BaseSingleton` — several forms can be embedded on one host page). Keying removes the whole class of mistake instead of guarding against it: a component asking for its own question cannot be handed another's, however the framework reuses it, and the confirmation now survives navigation, which no per-instance field can do once the instance is destroyed. The supersede rules moved with it and got real unit tests for the first time, having previously been checkable only as regexes over the component source. `@for` also tracks on question identity now, so the recycling does not happen in the first place.

  **…and the answer for that upload was routed by the view.** Keying the confirmation by question id fixed the display and left the answer travelling a different road: `uploadFile` awaited the upload and then called `valueChange.emit(fileId)`. An `output()` is routed by the VIEW — `(valueChange)="onValueChange(q, $event)"` writes to whichever question the template is bound to at the moment it fires — and after an `await` that is not reliably the question the upload was for. In OneQuestion one component instance serves the whole deck, so a respondent who picks a file for an optional question and presses Next before it lands has that file id written as the NEXT question's answer, on top of whatever they had put there: silent corruption, both questions reading plausibly, on the anonymous path. In Scroll the opposite — leaving a section destroys the component, an emit from a destroyed `output()` is dropped, and the store goes on showing "resume.pdf uploaded" for an answer that was never stored. The store now commits the answer itself, under the token's own question id, so the view is not on the path at all: `succeed(token, fileId)`, `fail(token, message)` and `clear(questionId)` write through a narrow `UploadAnswerSink` that `FormRuntime` satisfies structurally, `begin` clears the question while its upload is in flight, and the component emits nothing from the upload path. The supersede guard and the answer write are now ONE decision rather than two that had to agree — the booleans `succeed`/`fail` returned, which every caller had to remember to check, are gone. Committing through a plain class is also what made this testable: the suite is node-only with no DOM, so the previous fix could only be guarded by regexes over component source, whereas `upload-store.spec.ts` now drives a real `FormRuntime` and asserts the answer lands on the question the upload was made for.

- 48c0f45: Ship the metadata a host only ever got from CodeGen

  A host installs MJ Forms by running migrations, and never runs CodeGen against
  `__mj_BizAppsForms`. Three artifacts around `FormResponse.FormDistributionID`
  were therefore missing on every installed host: the Form Distributions → Form
  Responses relationship (so the related-records collection did not render on the
  Form Distribution form — the section resolved to empty view params), the
  related-entity name-field map, and the
  curated `Category` on the four fields V202609121200 added — two of which
  (`AllowDeviceResume`, `AllowedOrigins`) are on Form Distributions, not Form
  Responses.

  The gate that should have caught the original defect now checks the partial
  case: a migration that adds a column must ship the `EntityField` row naming it,
  and one that adds a foreign key must ship its `EntityRelationship` row.

- 64b6385: The Forms application now appears in the Explorer app launcher.

  The curated `Forms` application shipped `DefaultForNewUser: false`, so it was never added to any host user's `__mj.UserApplication` list — the list the launcher renders. The builder, both dashboards and the seven browsable admin entities were unreachable on every host, fresh or upgraded, and the only Forms-shaped entry an operator could find was the auto-generated `__mj_BizAppsForms` schema shell.

  This fix ships as two writes, because the flag alone repairs only users whose application list is empty. `V202609131200` sets the flag for users created later and backfills `UserApplication` rows for the users who exist today. Users with no rows at all are deliberately left alone so MJ's client self-heal still provisions their full default set.

  Forms also ships two `ApplicationRole` rows (Developer, UI), and `UserInfoEngine.UserHasApplicationAccess` is closed-by-default once any `ApplicationRole` rows exist for an application — so on a host where a user's roles include neither one, the backfilled row still renders nothing for them.

- 8299fed: Ship the `QuestionType` picklist sequences the Signature→Doodle rename deferred to a CodeGen run that
  never happens on a host (#219).

  `V202608301200` renamed the picklist row and deliberately skipped its `Sequence`, on the premise that
  CodeGen would re-derive the whole field "on its next run". There is no next run on a host:
  `mj app install` writes this app's schema into `excludeSchemas`, and CodeGen's constraint-sync query
  filters on exactly that list. The rename moved the value from alphabetical slot 20 to slot 5, so
  every metadata-driven `QuestionType` value list — most visibly Explorer's generated Form Question
  record form — rendered `Doodle` where `Signature` used to sit, with 15 other values off by one,
  permanently, on every host. (The Forms builder's own palette is hand-authored and was unaffected.)

  A new migration writes all 25 rows to the order CodeGen derives, keyed on the field's natural key
  with a `THROW` when it does not resolve. `question-types.spec.ts` now replays the shipped migrations
  and fails if that order ever drifts again.

- 912164c: The AI Designer stops proposing a question type the database rejects, and the release ships one consolidated metadata seed instead of a pile of per-PR deltas.

  **The shipped Designer prompt still said `Signature`.** #97 renamed the type to `Doodle` and `V202608301200` installed a CHECK constraint that accepts only the new spelling — but that migration is pure DDL, and the prompt lives in a metadata record no DDL touches. So a host installing from `migrations/` got a prompt proposing `Signature` and a constraint refusing it. The blueprint validator rejects the value before it ever reaches the database, and the Designer retries with the error fed back, up to `MAX_DESIGNER_ATTEMPTS` — wasted round-trips on every authored form rather than a visible failure, which is why nothing surfaced it. No repo-side check could: `check:release-seed` compares declared ids against shipped SQL, and this record's id already shipped in the v0.8 seed.

  **Two unreleased deltas are folded in and deleted.** `V202608182130` and `V202608241800` appear in no release tag, so neither reached a host and neither was append-only history yet. They are replaced by a single `Metadata_Sync` generated against the shipped chain — the cadence #105 established, and what `check:seed-cadence` has been red on.

  **Operators should expect this**: applying this migration corrects the Designer prompt in place, restores the Designer Template's own `Description` (it still advertised the Phase-1 taxonomy, which the prompt body it owns has not matched since #97), and adds the four `OnSubmit` `ActionParam` records. No form data is touched, and `V202608301200` already migrated any stored `Signature` questions to `Doodle`.

  Closes #111.

### Patch Changes

- ff19377: CI is blocking: every gate now reports on every PR, and both branch rulesets require the seven gate
  jobs with "branch must be up to date with base". Adds a local pre-commit gate that runs `lint:ui`
  and `typecheck` before a `git commit` or `git push`. Ships no migration and no metadata, so patch.
- 3599074: Ship the CodeGen-append convention as a rule and a gate. `plans/DISTRIBUTION_SEED_PLAN.md` no longer
  blesses a second convention; `.claude/rules/migrations-codegen.md` loads when a migration is touched;
  `npm run lint:codegen-append` fails a tracked `CodeGen_Run_*.sql` and a schema-DDL migration that
  ships no CodeGen output.
- 3a4b449: `build-and-test` ran for 15 minutes; 85% of it was the guard-mutation gate, and two thirds of the
  whole job was one number: `packages/Server`'s suite costs 37.5s on a CI runner and the gate ran it
  16 times. Almost none of that was testing — Server's 996 tests take 800ms and the rest is vitest
  collecting 78 spec files, of which one or two can observe an edit to one source file. Every mutant
  now declares the spec file(s) it is killed by and runs only those, as does each suite's baseline.
  Measured on one machine, the gate goes 205s to 67s with all 35 guards still KILLED by the same
  tests. Ships no migration and no metadata, so patch.
- d117a59: Add a host-truth convergence check: build a database from only the migrations this repo ships, run
  CodeGen against it, and fail if CodeGen wants to change anything. Every existing gate reads the
  repository; this one reads the artefact, which is why #201 and #219 both reached every host. Runs
  nightly and on pull requests that touch the migration inputs. Ships no migration and no metadata.
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

- 396d4b5: **Nullability is now type-checked on the server side, and the check has already paid for itself.** `packages/Server` compiled with `strictNullChecks` off, so `new Date(dist.OpenAt)` on a `Date | null` column was not an error — it was the **epoch**, and the respondent-host door rendered "It opens on January 1, 1970" with a 1970 `Retry-After`. Fourteen fixes later the flag is on, and it immediately caught the same class of defect one layer over: the door was passing a `string | null` credential to a function taking `string`, guarded only by a comment saying another function had already refused a null one. That is now structural rather than asserted — the function that checks the credential hands it back, so there is nothing left to trust.

  **The flag lives in the no-emit gate, not in the build, and the reason is worth knowing before someone moves it.** Both were tried. In the build config everything compiles, type-checks and passes the whole suite — and the API then dies at startup with `NoExplicitTypeError: Unable to infer GraphQL type ... for 'StartedAt'`. `emitDecoratorMetadata` writes `Date` for a `StartedAt?: Date | null` field with the flag off and `Object` with it on, and type-graphql reads that emitted type at runtime to build the schema. The field is CodeGen output nobody may hand-edit, so the emit must not change; checking without emitting has neither problem. The rationale is in `packages/Server/tsconfig.typecheck.json` so the next person to try it finds the answer before the outage.

  **Two result types stopped being able to represent impossible states.** `PersistenceResult` had every field optional, so a success with no `responseId` and a failure with no message were both expressible and callers had to guard for states that cannot happen; it is now a discriminated union where a failure carries a message and a success carries an id and a status. The door's row verdict is the same shape. Both discriminate on a **string** rather than a boolean, deliberately: TypeScript narrows a boolean-literal discriminant only under `strictNullChecks`, which the build config cannot have, while a string discriminant narrows under both.

  **The contract locks between the transport DTOs and the entity contracts hold again, and one of them was quietly under-specifying.** The `Exact<>` locks compare declared types, and a decorated class does not declare its members identically to the interface it mirrors even when every field resolves the same — so they reported a divergence that did not exist. Both sides are normalised through a mapped type now, which compares shapes rather than declarations and still fails when a field's type genuinely differs. Separately, the `jsonValue` pin claimed `string | undefined` when the field has always been `string | null | undefined`; the explicit `null` is load-bearing, because a client sending one is what put `null.trim()` on the anonymous public write path twice.

  **Which reason wins when a share link is several kinds of unusable at once is now one table both surfaces are tested against.** A link can be switched off _and_ scheduled, or never issued a credential _and_ over its cap, and two places answer that: the builder's badge tells the author what to fix, the door tells the holder why the link will not open. They are supposed to agree, and a review asserted they did after checking one pair of states — which was false for a second pair, and shipped a `Retry-After` promising an instant at which the link still would not work. `LINK_PRECEDENCE_CASES` now states all fourteen states once; each package tests its own half and neither imports the other. The single place the two deliberately differ is a declared field on the case, carrying its reason, and a test asserts that every declared divergence really is one — so a case that quietly starts agreeing loses its note instead of keeping a stale explanation of a difference that is no longer there.

- 126662f: The publish pipeline no longer pushes to `main` or `next`.

  Required status checks are evaluated against the check runs present on the SHA being _introduced_. A
  direct push introduces a SHA the remote has never seen, so no check run can exist for it and the push
  is rejected permanently with `GH013` — which is where every release would have stopped since CI became
  blocking. `[skip ci]` made the rejection permanent but was never the deciding fact: `changes.yml`
  carries only a `pull_request` trigger, so `changes_and_migrations` could not report on a pushed commit
  in any case.

  The version bump now rides the `next` → `main` release pull request, where all seven checks run
  normally, and `publish.yml` is reduced to build, validate, publish, and push a tag — tags being
  outside both rulesets, which are `target: branch`. `mj-app.json`'s derived fields move into
  `scripts/sync-app-version.mjs`, which `pnpm run version` writes and the workflow verifies with
  `--check`, and the schema-change version policy now reads the shipped artifacts (did `migrations/`
  move since the last tag, and did the version move by more than a patch?) rather than changeset files
  that are gone by the time a release runs.

  `scripts/check-release-pushes.mjs` fails any workflow or script that reintroduces a protected-branch
  push — a defect that is otherwise invisible until the next release. It scans `.github/workflows/`,
  `.github/scripts/`, `scripts/` and `ci/`, and recognises the shell and simple-git spellings a real
  one takes, quoted and force refspecs and git global options included.

  A release run is also now re-runnable. `scripts/release-plan.mjs` asks separately whether any
  package is missing from npm and whether the `vX.Y.Z` tag is absent, and each answer gates its own
  step — so a re-run after a partial failure publishes the remaining packages, or tags a version that
  published but never got its tag, instead of reading one package's presence on npm as "released" and
  reporting a green no-op.

  Fixes #177.

- 3e67383: Replay-safe Rules & Branching migration: DDL only, then inlined R\_\_RefreshMetadata, then CodeGen emit captured on a blank-install DB so EntityField IDs match. Also fix invalid JSON in entity-field-hierarchy-configurations.json.
- a8e8a1d: The release cuts and opens its own pull requests again. `#177` removed every push to a protected
  branch — correctly, because a required status check can never be satisfied by a SHA the remote has
  not seen — and replaced the automation with a runbook that was never once executed; nothing has
  shipped since `v0.10.0`. A new _Prepare a release_ dispatch now cuts `release/vX.Y.Z`, bumps, and
  opens the PR into `main`, and `publish.yml` opens the `main` → `next` back-merge PR it used to ask a
  human to open. Both are written by a GitHub App, which is required only because GitHub does not start
  workflow runs from `GITHUB_TOKEN`-authored events; it writes solely to branches no ruleset covers, so
  both rulesets keep `bypass_actors: []` and `lint:release-pushes` stays green. Adds
  `npm run release:plan`, a read-only readiness report, and `verify-release-app-token`, a read-only
  credential probe. Ships no migration and no metadata, so patch.
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

- 42819f3: The respondent page and the public asset read are transferred compressed, like everything else MJAPI sends.

  MJServer mounts `compression()` at `index.ts:1129`, long after it collects the routes contributed through `ConfigureExpressApp` at `index.ts:824`, and Express dispatches layers in registration order — so both routes finished their responses before the compressor could wrap `res.write`. `GET /f/:slug` went out as ~9 KB of uncompressed HTML to every respondent who opened a shared link, however much gzip and brotli their browser had offered, on the phones and cellular connections this product is built for. It compresses to about 47% of that. This is the same defect #121 fixed for the widget bundle; both routes were scoped out of that change on purpose and are finished here.

  **Both routes moved to `GetPreAuthMiddleware`, the slot the base class documents as running "after compression but before OAuth/REST/GraphQL routes".** A handler in that slot has no route pattern, so each route now matches its own path — and the rules Express's router applied are not obvious ones to re-derive: the literal is case-insensitive, exactly one trailing slash is tolerated, and the `:param` arrives percent-decoded. Those rules live in one place (`http/route-match.ts`) shared by all three routes that need them, pinned to a table probed case by case against a live Express app, because a move that quietly narrows a public URL sends a respondent to MJAPI's authenticated routes and a bare 401 that nothing explains.

  **The asset half saves nothing on a default host, and is taken anyway.** `FORMS_ASSET_ALLOWED_TYPES` defaults to PNG, JPEG, GIF and WebP; `mime-db` marks all four incompressible, so `compression.filter` was never going to encode them in either slot. The defect is the registration slot rather than the payload — an operator who adds `image/svg+xml` to the allowlist would otherwise inherit the bug with no sign of it, and leaving one route in the broken slot would preserve the trap for whoever next asks why the respondent path is slow.

  **Operators should expect one behaviour change beyond the bytes.** Pre-auth contributions are mounted as one ordered chain, so these routes are no longer ahead of every other pre-auth handler — they are behind them, including MJ's global `RateLimitMiddleware` (off by default). A host that switches rate limiting on will see the respondent page and form images counted, where they were previously exempt. That is the right posture for public unauthenticated routes, but a respondent refused there sees an error page or a broken image rather than a rate-limit explanation.

  Also fixed, same root cause: `POST /f/:slug/resume` never saw the globally mounted request-identity handler either, so its rate limit keyed on the form's slug instead of the caller — one bucket every respondent of a link shared, which a single caller could spend. It now keys on the resolved peer, as the page route already did.

- 3de26d8: The pre-commit gate no longer trusts either half of a check's verdict without evidence. A turbo
  install missing its platform binary exits non-zero without running anything, which read as a failing
  `typecheck` and denied a green commit; and a `--filter` or scan root that matches nothing exits zero
  having checked nothing, which read as a green tree in silence. Each check now declares both the
  marker it prints once it has reached a verdict and the marker proving that verdict covered any work,
  and a claim without its evidence asks instead of deciding. Ships no migration and no metadata, so
  patch.

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

## 0.7.0

### Minor Changes

- 4080fac: Make Forms installable on PostgreSQL, without a CodeGen run.

  **A minor rather than a patch, because a new install target ships.** `migrations-pg/` previously held nothing but a README saying it was empty until the SQL Server migrations existed. It now carries the two converted DDL/metadata migrations plus one `.pgonly.sql` capture of CodeGen's PostgreSQL objects, so a PostgreSQL host can install Forms the way a consumer actually installs an Open App — `mj app install`, not `mj codegen`. No SQL Server behaviour changes: `migrations/` is untouched.

  **Verified on a virgin PostgreSQL 16.11** — the oldest major supported, deliberately, not the newest — with MJ core and bizapps-common installed first (Forms hard-FKs `__mj_BizAppsCommon.Person`). Result: 10 tables, 10 base views, 30 CRUD functions, 10 triggers, 10 entities, 121 fields, 39 permissions, 13 relationships; a subsequent `mj codegen` produces a 0-line diff across metadata, `pg_get_viewdef`/`functiondef`/`triggerdef` and column defaults; a 19-assertion functional test (`scripts/pg-objectmodel-test.mjs`) passes; MJAPI boots against it. Runbook and measured numbers in `migrations-pg/docs/PG_INSTALL_VERIFICATION.md`.

  **The CodeGen objects are captured from the catalog, not from CodeGen's SQL log.** That log records only entities whose metadata changed, and these migrations already carry the metadata — so CodeGen logged almost nothing while still building every object. Without the capture an install has tables and registered entities but no base views and no CRUD functions, i.e. nothing the API can read or write through.

  **`mj.config.cjs` gains lower-case twins** for `schemaPlaceholders`, `includeSchemas` and `NameRulesBySchema`. PostgreSQL folds unquoted identifiers, so CodeGen reads the schema back as `__mj_bizappsforms` while these rules match case-sensitively; the generic `__mj` rule then matches that name's _prefix_ and emits `${mjSchema}_bizappsforms`, a schema that does not exist. The same pass names `__mj_BizAppsCommon` explicitly, which had no rule at all and was being rewritten by the generic rule in the shipped T-SQL (harmlessly there, since `mjSchema` is `__mj` — but it is a reference this repo does not own).

  Several converter gaps in CLI 5.51.0 are worked around here and worth reporting upstream: `--bake-codegen` emitted no CodeGen objects; BIT→BOOLEAN literals were not coerced (1,590 rewritten by looking each target column's type up in `information_schema`); the schema qualifier came out quoted in `CREATE TABLE` and unquoted in `ALTER TABLE`; cross-schema `REFERENCES` kept a mixed-case schema name that no unquoted schema matches; and the four CodeGen reconciliation `EXECUTE`s were reported unhandled despite existing natively on PostgreSQL — they are ported as `SELECT`s because they rewrite placeholder field `Sequence` values into real ordinals.

## 0.6.0

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

## 0.4.0

### Minor Changes

- f88839f: Raise the MemberJunction floor to 5.51.0, and make the release workflow's schema-change rule enforceable.

  **A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.51.0` and all five packages' peer ranges moved to `^5.51.0`. A host below that can no longer install Forms. Nothing in 5.51.0 is _required_ by Forms — this is a routine rev to the current `latest` to keep the delta to MJ small — but the raised requirement is what consumers see, and this repo treats a raised install requirement as a minor.

  **Upgrading is a database operation, not just a pin bump.** 5.51.x ships two core `__mj` migrations, so `npx mj migrate -t v5.51.0` is required per environment. A partially-migrated core still installs, builds, tests and boots cleanly; the failure surfaces later as `Entity <name> not found in metadata` from an unrelated feature. Verified end to end on the dev database: frontier advanced, entity count held at 422, MJAPI startup clean, and the anonymous respondent path passes all 8 smoke assertions.

  **The release workflow's migration rule could only ever abort a release, never enforce one.** `changeset version` reads solely `.changeset/*.md` and knows nothing about `migrations/`, so raising the predicted bump moved the expectation away from what would actually happen — the mismatch guard then failed the release reporting a predictor error instead of naming the missing changeset. The rule is now an explicit policy gate that runs on every path that can cut a release, including `workflow_dispatch`, which previously skipped it and shipped a patch carrying a schema change.

  Also fixes the E404 fast path in the npm placeholder check, which never fired because it read `$?` after an `if` — always 0 — so a genuinely missing package burned every retry before being reported.

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
