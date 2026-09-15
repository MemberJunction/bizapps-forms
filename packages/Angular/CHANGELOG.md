# @mj-biz-apps/forms-ng

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

- 45d586d: **A form has exactly one default ending, and keeps it.** `FormScreen.IsDefault` shipped as an independent switch on each ending screen, under a builder label promising "every form needs exactly one" that nothing anywhere kept — not the application, and not the database, where the sibling `UQ_FormScreen_OneWelcomePerForm` constrains Welcome screens for a comparable reason. A form could carry two defaults or none and still look correct in the builder: `resolveEndingScreen` simply takes the first in display order, so a second flagged screen held a setting the author had turned on that did nothing.

  **Both halves of the invariant, because only one of them is an index.** A filtered unique index refuses a second default. Nothing at the database level notices a form that has _none_, and "none" is what deleting the default ending used to leave behind — the surviving ending then rendered "Never shown — add a condition" while `resolveEndingScreen` was in fact falling through to it and showing it to every respondent. The builder and the runtime disagreed about the same screen, in opposite directions. `deleteScreen` now takes the tree and repairs the vacancy, and `addScreen` asks whether the form _has_ a default rather than whether it has any endings — the two differ exactly where it matters, on a form whose only ending is screened out.

  **Moving it is ordered, not debounced.** Changing the default is two writes to two records, and the index makes their order load-bearing: setting the new one before clearing the old leaves the form momentarily holding two, and the database refuses the write — which an author experiences as a switch that flipped itself back, reported against the wrong screen. `BuilderStateService.setDefaultEnding` clears first, awaits, then sets. The per-entity debounce could not have guaranteed that; it keys a timer per object with no ordering between them.

  **And it survives a refusal.** Moving the default is two writes, so it can get halfway: the clear lands, the set is refused, and the form is left holding _no_ default — the one broken state the index will never report, produced by the method whose entire job is that there is exactly one. The old default is now put back, in the database and in memory, and a refused _clear_ no longer drops the flag in the builder while the row still holds it. Deleting a screen behaves the same way: the delete still reports success, because the screen really was deleted and saying otherwise would offer an undo that cannot happen, but a promotion that did not stick no longer leaves the builder showing a catch-all the database never recorded. All of these writes go through the per-entity save chain rather than around it, so making a screen the default while its title edit is still settling can no longer run two saves of one row at once — the case that silently loses whichever landed first.

  **A choice, not a toggle.** The switch only turns on — a form with no catch-all is not a state worth offering — and the default and screened-out flags now exclude each other in both directions, since a screened-out ending takes no part in ending resolution at all. The migration repairs existing data first: too many (keeping the lowest display order, which is the screen the runtime already resolved to, so no respondent's ending moves), flagged-but-ineligible, and too few.

- 511aaf7: **Publishing retires the version it replaces.** `FormVersion.Status` has allowed `Retired` since the baseline and no code path had ever written it: publishing minted a new `Published` version and left every earlier one `Published` too. Forms accumulated them — three simultaneously-live versions on one dev form, 75 `Published` rows and 0 `Retired` across the database — and nothing broke, because all three readers disambiguate with `ORDER BY VersionNumber DESC`. That is the defect, not the mitigation: the invariant was asserted (`loadPublishedVersion`'s docstring says "the **single** Published version for a form") and enforced nowhere, so it held only as long as every future query, report and integration remembered an ordering that has nothing to do with what it is asking. One that filters on `Status='Published'` and forgets gets an arbitrary historical version, and looks correct in testing on a form that has only ever been published once.

  **One transaction, retire first.** The new migration backfills existing data — highest version number stays `Published`, the rest are demoted — and then adds `UQ_FormVersion_OnePublishedPerForm`, a filtered unique index that makes a second live version unrepresentable regardless of which client, integration or hand-written `UPDATE` attempts it. The index is also what fixes the order: the incumbent has to be demoted _before_ the replacement lands. So `PublishService` does both in a single MJ transaction group, because a retire that committed on its own ahead of an insert that then failed would leave the form with **no** live version and its public link answering `no-published-version`. A publish that cannot read what is currently live is refused rather than guessed at, exactly as an unreadable automations or settings read already was.

  **Responses are untouched.** Every `FormResponse` pins its own `FormVersionID`, and the response-detail and reporting readers load that version by id with no `Status` filter — so answers submitted against a version that is now `Retired` still resolve and still report.

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

- 912164c: The AI Designer stops proposing a question type the database rejects, and the release ships one consolidated metadata seed instead of a pile of per-PR deltas.

  **The shipped Designer prompt still said `Signature`.** #97 renamed the type to `Doodle` and `V202608301200` installed a CHECK constraint that accepts only the new spelling — but that migration is pure DDL, and the prompt lives in a metadata record no DDL touches. So a host installing from `migrations/` got a prompt proposing `Signature` and a constraint refusing it. The blueprint validator rejects the value before it ever reaches the database, and the Designer retries with the error fed back, up to `MAX_DESIGNER_ATTEMPTS` — wasted round-trips on every authored form rather than a visible failure, which is why nothing surfaced it. No repo-side check could: `check:release-seed` compares declared ids against shipped SQL, and this record's id already shipped in the v0.8 seed.

  **Two unreleased deltas are folded in and deleted.** `V202608182130` and `V202608241800` appear in no release tag, so neither reached a host and neither was append-only history yet. They are replaced by a single `Metadata_Sync` generated against the shipped chain — the cadence #105 established, and what `check:seed-cadence` has been red on.

  **Operators should expect this**: applying this migration corrects the Designer prompt in place, restores the Designer Template's own `Description` (it still advertised the Phase-1 taxonomy, which the prompt body it owns has not matched since #97), and adds the four `OnSubmit` `ActionParam` records. No form data is touched, and `V202608301200` already migrated any stored `Signature` questions to `Doodle`.

  Closes #111.

- 52f1c63: Every image on a form can now be uploaded from the author's computer instead of only pasted as a URL: the Welcome screen's picture, each Ending's, the logo, the page background, and each Picture-choice option. All five were bare URL boxes, which quietly assumed the author already had the image hosted somewhere public.

  Two new MJAPI routes. `POST /forms/asset` is authenticated and gated on Update permission for `MJ_BizApps_Forms: Forms` — which is also what rejects an anonymous respondent session, since the Form Respondent role holds CanCreate on the two response entities and nothing else. `GET /forms/asset/:id` is deliberately anonymous, because a published form's welcome image has to render for a respondent with no session, possibly on a different origin.

  That read route's guard is storage location, not identity: only objects whose provider key sits under the constant `forms-assets/` prefix are servable, so it can never be turned into an unauthenticated reader for the files respondents attach to their answers (those live under `forms-uploads/`). The prefix is not configurable for exactly that reason, and `FORMS_UPLOAD_PATH_PREFIX` is now refused if it would land respondent uploads inside the public tree. Unknown ids and non-asset ids get the same 404 so the route is not an oracle for which `MJ: Files` records exist.

  No schema change: assets are ordinary `MJ: Files` records written through `FileStorageEngine`, and the stored value is still just a URL, so the published snapshot, the widget and the response pipeline needed no changes at all.

  **Deployment note:** uploading requires a configured `MJ: File Storage Account`. An instance with none (MJ seeds storage _providers_ but no account) returns a 503 naming that as the cause and pointing at the URL box as the workaround. The respondent `FileUpload` question already had this same prerequisite.

  New config: `FORMS_ASSET_ENABLED`, `FORMS_ASSET_MAX_BYTES` (default 5 MiB), `FORMS_ASSET_ALLOWED_TYPES` (default PNG/JPEG/GIF/WebP — SVG is excluded because it is a scriptable document served from the API origin; an operator can opt in), `FORMS_ASSET_STORAGE_ACCOUNT`.

### Patch Changes

- 7204b2c: A share link's captcha requirement now reaches the widget that has to satisfy it, and the Distribute panel can set it.

  The submit gate demands a captcha when **either** the form's `settings.captchaRequired` or the share link's `FormDistribution.CaptchaRequired` is on — `captchaRequired(a, b)` is an OR, and `submit-pipeline` stage 4 has always called it with both. `PublishedForm` answered with only the first. So a link with the column on rendered no challenge, collected no token, and had every completed submission refused with `Captcha verification failed (missing-token).` — with Turnstile fully configured, and nothing on screen the respondent could do about it. The flag was enforced at submit and never sent to the thing that had to satisfy it.

  `publicFormPayload` now applies that same `captchaRequired` before serializing. To the **definition**, not to `settings` alone: the widget's transport selects `definitionJSON` and parses that into the whole definition, so writing `settingsJSON` only would have satisfied a shape check and changed nothing a respondent sees. Its new parameter is required rather than optional, so a later call site cannot quietly reintroduce the half-answer. No widget change was needed — it already renders the challenge when the definition asks for one, and already shows the config-gap message when a captcha is required but no site key is configured.

  The Distribute settings panel gains a captcha switch per share link, beside "Open to responses". Its hint states the cost rather than describing the feature, because Turnstile is fail-closed and the host's environment is invisible from the builder: enabling it needs server-side Turnstile keys, and without them every submission through the link is refused. Until now the column was reachable only from a raw entity form, so an author could not see — let alone undo — a setting that made their form unsubmittable.

  Turning the switch off does not turn a captcha off for a form that requires one itself; the server still ORs the two.

  `.env.example` now documents `FORMS_TURNSTILE_SITE_KEY` alongside the secret. It listed only the secret, which is the half that verifies a token — not the half that lets the widget draw a challenge to produce one. An operator who set only the secret got a form that showed every respondent the configuration message instead of a submit, and the entry that would have told them why was missing. The surrounding note also called Turnstile per-distribution; it is demanded by the form's own setting OR the link's, which is the OR this change finally honours on both sides.

  `patch`: no migration and no metadata. The column default was already corrected to `0` in `V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql`, which named this gap as the remaining half. Closes #151.

- c606624: `@angular/cdk` is a compatibility claim again, so Forms installs on a host that is not on exactly 21.1.3.

  `forms-ng` declared `"@angular/cdk": "21.1.3"` in `peerDependencies` — exact, the only exact `@angular/*` peer in the repo, sitting next to five caret ranges. The CDK version line moves independently of `@angular/core`, so a stock MJ `6.1.0-edge.6` host is on `@angular/cdk@21.2.14` through no fault of its own. npm refuses the tree with `ERESOLVE`, and `mj app install` finishes its database work — schema created, all migrations applied, app recorded — and then finalizes Forms as **Disabled**, telling the operator to log in to npm or fix their `.npmrc`. Neither was ever involved.

  **This is not a regression the release introduces.** Every published version from `0.5.0` through `0.10.0` carries the same exact peer, so any host that has installed Forms on a 6.1 line newer than CDK 21.1.3 is sitting at `Disabled` right now, and was told the cause was npm auth. `mj app upgrade` reproduces it on an existing installation: a host that went into the upgrade `Active` comes out `Disabled` at **exit code 0**, under a green `✔ Upgraded mj-bizapps-forms to v<version>`. The signal is there but it sits below that success line — an unconditional `Warning: [Packages] npm install failed …` and a summary ending `The app was finalized as Disabled` — which is exactly the shape an unattended or scripted upgrade discards while keeping the zero exit status.

  **The blast radius reached past Forms.** npm's refusal names two ways past it — `--force` and `--legacy-peer-deps` — and both install a tree npm has just said is wrong. `--legacy-peer-deps` is the one operators reach for, and it disables npm's peer auto-install for the entire tree. A sibling app's required peers then silently fail to install, and it surfaces much later as a bare module-resolution error in the Explorer naming a package nobody was looking at. One exact peer in Forms could take a host's Explorer down through an app Forms does not ship.

  **If your Forms app is `Disabled` today**, upgrading is not enough on its own. The upgrade writes `Active` as soon as its npm step succeeds, but it never switches the host's `dynamicPackages` entries back on — only `mj app enable` does that — so the status goes green while the app still does not load. Re-run `npm install` in the host directory (it will now succeed without flags), then `mj app enable mj-bizapps-forms`. `docs/install.md` §7 has the full recovery, including how to tell this apart from a genuine npm auth failure.

  A CI gate now reads every `peerDependencies` block and refuses an exact version, because nothing in this repo could see one before: `packages/Angular` anchors `@angular/cdk` at exactly `21.1.3` in its `devDependencies`, which satisfies the exact peer and a caret equally, so no resolver or test here can tell the two spellings apart. Only a host — which brings its own `@angular/cdk` and has no anchor — ever puts the claim under load, which is how it shipped six times. That gate answers whether a peer is _written_ as an exact version, which is what this bug was. It does not answer the wider question of whether a real host's installed version can actually satisfy the range — and the `@memberjunction/*` peers a few lines above the corrected one are exactly where those two questions come apart, because a caret anchored to a prerelease stops matching the moment the upstream line moves off its patch tuple.

- 0895960: **An empty section can add its first question.** The canvas had a button to add a section, a
  welcome screen and an ending, and none to add a question. "Add content" existed and worked — it was
  rendered in a place a new form could never reach: inside the question loop, behind
  `@if (node.entity.ID === selectedQuestionId)`. Both conditions are unsatisfiable on a section with
  no questions, and the empty state was a message with no control in it, so the canvas answered the
  one request it exists for by pointing at a different pane. Counted from the DOM of a newly created
  form: zero add-content buttons; add one question and there is one. Closes #147.

  It is the same button, the same popover and the same write path, rendered in the empty state at
  seam 0 — no new state and no third insert path. `insertQuestionAt` already clamped with
  `Math.min(seam.index, page.questions.length)`, so index 0 on an empty page was exact rather than
  merely safe, and renumbering still goes through `persistQuestionOrder`, the call the drag path
  makes. Index 0 is also unreachable from the per-question bar, which always opens `$index + 1`, so
  the two openers cannot collide.

  **The selection gate is not violated; it does not apply.** Gating the per-question bar on selection
  replaced a hover-revealed gutter `+`, because hover does not exist on a touch screen. An empty
  section has nothing to select, so an ungated control there follows that reasoning instead of making
  an exception to it.

  **This was never only a first-run condition.** A section whose last question is deleted lands in
  exactly the same dead end, and it is the same block that fixes both.

  `.fb-canvas-empty` loses its own dashed frame: `.fb-screen-add` _is_ the dashed treatment, so the
  frame became a second border 14px outside the first. It was standing in for "nothing here yet" —
  the control now says that, and says what to do about it. The icon and the copy stay, because the
  control alone does not say why the section is blank.

  **Three things review added on top of the original change.**

  _The insert now leaves focus on the question it created._ `QuestionTypePickerComponent` restores
  focus to whatever opened it, which is right for a dismissal — Escape, the backdrop and the close
  button all land back on the control. It cannot be right for an insert, because every insert path
  removes its own opener: the empty state unmounts once the section is no longer empty, and a
  per-question bar unmounts once selection moves to the new question. `focus()` on a detached node is
  a silent no-op, so focus fell to `<body>` and a keyboard author restarted from the top of the page.
  Measured identical on **both** openers before it was treated as a defect, so it is not something the
  empty-state control introduced — the pre-existing per-question path is fixed by the same change.
  The canvas now focuses the card it just selected, keyed on a new `data-question-id` rather than on
  the `.is-selected` styling class, via `afterNextRender` because the card does not exist yet. This is
  the one new method, and the picker is left opener-independent.

  _The empty state's own icon rule was capturing the new button's glyph._ `.fb-canvas-empty i` was
  written when the block held one decorative illustration and nothing else, so "any descendant" and
  "my own illustration" named the same set. A control in the block ends that: a rule that targets an
  element beats a value it would otherwise inherit, so the plus rendered at 1.5rem in
  `--mj-text-disabled` — the token reserved for things you cannot click — on an enabled control 8px
  taller than the identical button two rows below it, and deaf to that button's hover colour. Both
  rules are now scoped with the child combinator (`> i`, `> p`), so the trap is gone rather than
  patched; `.fb-canvas-empty .fb-screen-add` stays a descendant rule on purpose, because it targets a
  class and cannot capture something that merely happens to be nested.

  _The control is centred in this one context._ Every canvas add-button computes
  `justify-content: normal` and left-labels itself, which is right where they start a list. Inside the
  empty state the button closes a centred column — a centred illustration and centred copy — so it is
  centred there and only there. The three canvas buttons are unchanged.

- 2334704: **The anonymous respondent boundary loses five ways to be abused, and the sixth stops leaking server configuration.** These came out of an adversarial security review whose overall verdict was that the boundary is defence-in-depth done properly — deny-all create RLS, one ownership rule at the write seam, hash-only tokens, hardened uploads. What follows is the residue.

  **A `javascript:` ending redirect no longer executes on the site that embeds the form.** An ending screen's `redirectURL` is author-controlled and the widget follows it with `window.location.assign` — but the widget runs inside _someone else's_ page, a careers site or a customer's portal. So a `javascript:` URL there was never a redirect: it was script execution in that third party's origin, reachable from one compromised builder account and landing somewhere our code otherwise never reaches. Only `http:` and `https:` are followed now. Relative URLs still work, because they cannot carry a scheme and only the client knows the base to resolve them against.

  The check exists on **both** sides on purpose, and neither half is redundant. The server validates at the two mutation chokepoints, which is the only protection a bespoke client consuming `SubmitFormResponse` directly ever gets. The widget validates independently, because it also follows `outcome.screen.redirectURL` read straight from the published definition without asking the server — on that path the client-side check is the only one there is. Both parse with the WHATWG URL parser, which strips tabs, newlines and leading control characters and lower-cases the scheme before deciding anything, so `JAVASCRIPT:`, `java<TAB>script:` and a leading-space variant are all recognised rather than mistaken for relative paths.

  **`GET /f/:slug` is metered.** Every hit did real work before any gate: a slug lookup as the system user, plus a server-side POST to core's magic-link redeem that increments the invite's `UseCount` and mints an RS256 session JWT. Unmetered, that is write-amplification, free slug enumeration, and a way to burn a legitimate link's `MaxUses` from outside. It now sits behind the same two gates the upload route uses — a process-wide in-flight cap (`FORMS_REDEEM_MAX_IN_FLIGHT`, default 25) and a per-IP window (`FORMS_REDEEM_IP_MAX`, default 20 per `FORMS_RATELIMIT_WINDOW_MS`) — answering 503 and 429 respectively through the existing styled error views, with `Retry-After`. The in-flight cap is consulted first so a request shed for load is never charged to anyone's budget, and a refusal costs no invite budget at all.

  **That per-IP gate needs the route to carry its own identity handler, and this is the part worth remembering.** The ceiling keys on the peer IP resolved by `RequestIdentityMiddleware`, which contributes a _pre-auth_ handler. But this route registers through `ConfigureExpressApp`, which MJServer invokes inside its middleware-collection loop — before it mounts a single pre-auth handler. Express dispatches layers in registration order, so the globally mounted identity handler is added _after_ this route and never runs for it. `currentRequestIdentity()` then returns undefined, `abuseIdentity` returns undefined, and the limiter takes its deliberate "cannot identify the caller, admit everything" branch on every request: a gate that reports itself installed and admits everyone, at any setting. The route therefore mounts `requestIdentityHandler()` on itself. Routes reached through `GetPostAuthMiddleware` (the upload endpoint) or the Apollo handler are mounted later and need nothing — which is exactly why the upload route was never affected.

  **Legacy on-submit hooks stopped running as the full system user.** Every pre-automation form fired Upsert Person, Analyze, Confirmation Email and Follow-up Task at system privilege from anonymous input, because this path defaulted to `UserCache.GetSystemUser()` while the configured-automation path beside it already resolved the scoped `Forms Automation Service` principal. The two paths now agree, and this one fails **closed**: no resolvable principal means the hooks are skipped with a logged warning and the submission still succeeds. The tempting fallback — use the system user if the configured one is missing — silently restores the broad grants the dedicated principal exists to avoid, at exactly the moment nobody is watching.

  **Respondent payloads have ceilings the author cannot lower.** `FormResponseAnswer.TextValue` is `NVARCHAR(MAX)` and the widget sets no `maxlength`, so a question with no `validationRule` — the common case — was bounded only by MJAPI's 50mb GraphQL body limit. Every answer value is now held to 64KB, measured in UTF-8 **bytes** rather than UTF-16 code units, in every validation mode: an autosaved draft persists a row exactly like a completion does, so a ceiling that waived drafts would bound nothing worth bounding. `userAgent` and `referrer` are truncated to 2KB rather than rejected — the metadata is diagnostic and the answers are not, and refusing a whole submission over a padded user-agent string would cost the irreplaceable part.

  **A deployment running on the built-in hash salt is told once, loudly.** The default ships in this repo, so hashes computed with it can be recomputed by anyone holding the source — which quietly weakens "raw IPs and session ids are never stored" into "stored behind a dictionary the world has". The warning fires on first use rather than at boot, so a process that never hashes anything never warns about it. The default salt's value is unchanged, so every hash already stored still matches.

  **`PublishedForm` stops handing anonymous respondents the automation config.** Action and agent ids, trigger conditions and knockout wiring are server configuration; the widget renders pages, screens and settings and never reads `automations` from the public definition — the server re-resolves them from its own snapshot at submit time. The key is emptied rather than deleted so the parsed shape still satisfies `PublishedFormDefinition`, which the widget casts to without checking.

  Found and deliberately **not** changed here, as maintainer decisions rather than oversights: anonymous input can still update pre-existing CRM records matched on an unverified email, on-submit agents still read respondent answers as untrusted-but-undelimited input, and internal read access to responses remains flat across the host instance.

- 8b6c83a: The Design tab's colour presets are three complete themes, one per row, instead of ten unrelated swatches.

  The picker offered ten arbitrary brights, which quietly asked the author to be a colour designer. A form is themed by exactly two decisions — `--mjf-page-bg` and `--mjf-page-ink` — from which the card, every border, muted text, the progress track and the selected-answer tint are all `color-mix`ed in `mj-form.component.css`, plus an accent. Ten colours with no roles did not match how any of that works.

  The palette is now three rows of exactly those three roles: **page background · font colour · accent**, taken from the light-warm, warm and dark ends of the seeded `FormStyle` set (Editorial, Warm, Midnight). The picker's grid goes from five columns to three so a row reads as one theme; at five, the triples wrapped and the themes dissolved back into loose colours.

  Picking straight down a row yields a form that already coheres. Picking across rows still works, and is how someone builds their own.

- 74a1888: A question can be dragged from any section of the builder into any other section. Each section
  rendered its own unconnected `cdkDropList`, so CDK had no candidate target outside the list the
  drag started in and every cross-section drop was silently refused — no move, no message. The
  lists are now one `cdkDropListGroup`; the drop branches on which list it came from, writes
  `PageID` and renumbers `DisplayOrder` on both sections, and raises the same warning band an
  in-section drag raises when the move breaks a rule. Undo returns the question to its original
  section, not merely to its original index.
- ec7db93: Add a Form Categories hierarchy tree panel (ParentID) and mark ParentID as a hierarchy field in metadata.
- edb79fd: **The eight grouped question types tell a screen reader what they are asking.**
  SingleChoice, MultiChoice, Rating, NPS, YesNo, PictureChoice, OpinionScale and Legal render a
  `role="radiogroup"` / `role="group"` container whose `aria-labelledby` pointed at `inputId()` — the
  id of the _control_. A native control (`<input>`, `<select>`, `<textarea>`, the Checkbox button)
  carries that id on itself, so the shared `<label for>` resolves and the field is named; a group of
  buttons has no element carrying it, and the shared `<label>` had a `for` but never an `id`. So all
  eight references pointed at nothing and every group computed an empty accessible name: Chrome's
  accessibility tree showed a bare `radiogroup:`, and on Legal an unnamed Yes/No — a consent control
  whose question was inaudible. It failed WCAG 1.3.1 and 4.1.2 against the plan's AA bar.

  The shared `<label>` now carries `labelId()` (`${inputId()}-label`) and the eight groups are named
  by it, so grouped and native controls compute the same accessible name from the same element and
  cannot drift apart. Eight controls that had no name now read as `radiogroup "Rating"`,
  `group "Multi choice"`, `radiogroup "Legal consent"`; the seventeen that already had one are
  untouched. No CSS, no DOM restructuring, and no change to any rendered geometry.

  `aria-describedby` was **not** affected, despite what issue #117 says: `describedBy()` joins
  `helpId()` / `errorId()` / `statusId()`, each bound as `[id]` on its own element, and all of them
  resolved before this change. Help text and validation errors already reached assistive tech.

  A wiring spec (`aria-idrefs.wiring.spec.ts`) now walks every branch of the question-type switch and
  requires each ARIA idref to resolve to an id bound **in that branch or the shared region**. The
  branch scoping is the point: `inputId()` was bound as `[id]` elsewhere in the template throughout
  the bug, so a plain "is this id bound anywhere?" check was true the whole time the groups were
  unnamed.

  Ranking and Matrix still have no accessible name — the same shape, deliberately out of scope here,
  and the spec pins the current set so fixing them has to be an explicit decision rather than a
  silent drift.

- fba3807: A six-digit hex code can be typed into the Design tab's colour picker again.

  One function both sanitised each keystroke and expanded shorthand, and a three-character string is
  both a prefix and a shorthand. So `#1a2b3c` was rewritten to `#11aa22` at the third character,
  emitted as the author's colour, and the remaining keystrokes were dropped by the six-digit cap —
  pasting worked only because it never passed through a three-character state.

  `sanitizeHexInput` now runs per keystroke and never expands; `normalizeHexInput` keeps its
  behaviour and runs on blur and Enter, so `#abc` still becomes `#aabbcc` at commit. Clearing the
  field also leaves it empty instead of putting the `#` back.

- 6331f88: **A range no answer could satisfy is refused where it is authored (#80).** A `Number` question
  accepted a minimum of 500 beside a maximum of 120 with no warning and no inline error, persisted it
  to `FormQuestion.ValidationRule` as `{"min":500,"max":120}`, and shipped it. Both validators — the
  widget's and the server's — apply the bounds in sequence, so every possible answer failed one of
  them: the respondent entering `100` was told "Must be at least 500." and the respondent entering
  `500` was told "Must be at most 120.", two mutually exclusive instructions with nothing anywhere
  saying the form itself was broken. On a required question the form could not be submitted at all.

  **The pair is one decision, so it is checked as one.** The validation-rule editor no longer emits a
  rule whose bounds contradict each other; it holds both numbers on screen, names the conflict, and
  says the rule is not being saved until one of them moves. Equal bounds stay valid — "exactly 5" is a
  rule authors write on purpose — and clearing either box is never refused, which is what keeps an
  open-ended range legal and gives an inherited contradiction a way out. The check is derived from the
  rule rather than recorded when an edit is refused, so a form that already holds an impossible range
  — authored before this existed, or written by mj-sync metadata or the AI builder — states its
  problem the moment its question is opened instead of sitting there looking correct.

  **Both bounded pairs, not just the reported one.** `minLength`/`maxLength` traps a text respondent
  through the same sequential validators that `min`/`max` traps a number respondent; the invariant
  belongs to a bounded question, not to a number question. `rangeConflict` in `validation-bounds.ts` is
  pure and about the rule rather than about the editor, so a publish-time preflight can consult the
  same two numbers rather than growing a second opinion about them.

  **And the host stopped taking back what the editor is holding.** `QuestionEditorComponent`'s
  `validationRule` getter parsed the stored JSON on every read, handing the editor a fresh object on
  every change-detection pass and resetting it each time. That was invisible while the editor emitted
  everything it was given, and would have erased the number the author is being asked to fix the
  moment it legitimately withholds one. It is now the same object while the question and its stored
  rule are unchanged.

- d57cd04: **The length bounds are now offered wherever they are enforced (#80 follow-up).** The validation
  editor showed `Min length` / `Max length` only on `ShortText` and `LongText`, but both validators
  apply `minLength`/`maxLength` to any answer that is a string — which `QUESTION_TYPE_BEHAVIOR` says
  is every `answerColumn: 'text'` type, `Email`, `Phone` and `Website` included. An Email question
  carrying `{"minLength":10,"maxLength":5}` therefore rejected every address a respondent could
  type — `a@b.co` was told to use at least 10 characters, `long@example.com` to use at most 5 — while
  the editor showed no boxes for the pair and the new conflict check never looked at it, because it
  asks only about pairs on screen.

  Worse, the editor **re-emitted** that invisible pair: every edit ships the whole rule, so an author
  adjusting the pattern on such a question silently re-persisted the contradiction they could not
  see. That is the same "a pattern edit carries the impossible pair out with it" failure the whole-rule
  refusal was written to prevent, on the types the refusal did not cover.

  `showLength` is now derived from the behaviour table rather than hardcoded: `answerable` and
  `answerColumn === 'text'` and `optionMode === 'none'`. Shown and enforced coincide, so the conflict
  check reaches every pair that can actually trap a respondent, and the author always has the two
  boxes the refusal asks them to reconcile — reporting a conflict in a pair with no controls would be
  a lockout whose only escape is deleting the whole rule.

  Numeric types keep no length boxes: their answers are not strings, so the pair genuinely never
  fires there. Choice types (`SingleChoice`, `Dropdown`, `PictureChoice`) are excluded too — they
  store text, but the answer is an option the author wrote, so a length bound on it is not a rule
  anybody authors.

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

- 2890a6a: MJ is pinned at `6.1.1`, the certification candidate on `lts-6.1`, and the Angular platform that moved with 6.1.0 comes along.

  `6.1.1` — not `6.1.0`, and not another `-edge.N` — is the version stage owners are certifying against. It carries the two blockers found the day 6.1.0 went out: a fresh install boots again (MemberJunction/MJ#4477 — CodeGen stopped writing `entity_subclasses.ts` when a database had no non-core entities yet, so MJAPI could not import it), and an upgrade from a database that actually used Reports gets through the Report/Workflow retirement migration (MemberJunction/MJ#4483). 55 `@memberjunction/*` pins across seven manifests and `mj-app.json`'s range move together, and `pnpm-lock.yaml` is regenerated so CI's `pnpm install --frozen-lockfile` has something to agree with — it held 3,159 `edge.5` references and would have failed the build before compiling a line.

  **The Angular rev is not cosmetic and not optional.** MJ 6.1.0's `ng-*` packages raised their peer floor to `^21.2.22`, which `21.1.3` cannot satisfy, so the install began reporting `unmet peer @angular/cdk@^21.2.14`. Three version lines move, and they are not the same number: the core family to `21.2.22`, `@angular/cdk` to `21.2.14`, and the build tooling to `21.2.23`. Collapsing them into one number is what #211 was. **6.1.1 itself moves no Angular pin** — its `@angular/*` requirements are byte-identical to 6.1.0's — so nothing here changed for the patch; the rev is 6.1.0's, landing in the same release.

  **The pin that actually binds is `pnpm.overrides`, not the `devDependencies` anchor.** Bumping only the anchor left the regenerated lockfile still resolving `@angular/core@21.1.3` while `@angular/cdk` moved on its own — and CDK moved only because it is the one package the override list omits. Overrides and anchors have to move together; the lockfile now holds zero `21.1.3` references.

  **No migration ships with this, and that is a measured answer rather than an assumption.** A clean room built from only what the repos ship — core at `v6.1.1`, then bizapps-common, bizapps-tasks, then ours — leaves CodeGen with nothing to say: no `CREATE OR ALTER VIEW` or `PROCEDURE` for `__mj_BizAppsForms`, no metadata rows, no capture file at all. The run was done twice over, once with the workspace's MJ-source CLI and once with the published `@memberjunction/cli@6.1.1`, and both converged. The unshipped-metadata defects the 6.1.0 run surfaced are fixed and merged separately (#201, #219), and #220 now asks this question on every PR that can break it.

  **6.1.1 adds no core migration**, which is worth saying out loud because it makes the usual upgrade signal go quiet: it amends the retirement migration in place instead. A database already past that version keeps its frontier exactly where it was — here `202609132006`, which is also `v6.1.1`'s own top migration — and never re-reads the amended file, so there is no checksum conflict and no fix to receive. The runbook and `CLAUDE.md` now say to judge the frontier against the target tag rather than against movement.

- 816fbca: A palette click adds its question to the section the author selected, and the canvas says which section that is.

  The builder has highlighted a clicked section header since page selection shipped, but the rule that picked the destination for a new question read only the question selection — so it fell through to "the last section" every time, and the builder marked one section while writing to another. On a clean two-section form the author would create a section, click a question type and watch it land somewhere else. Closes #148.

  **One rule, in one place, under test.** `targetPageFor(selection, pages)` is now a pure module (`new-question-target.ts`) rather than a private method on a component this package's node-environment vitest cannot instantiate — the same reason `builder-selection.ts` exists. Order: the selected section, then the selected question's section, then the last section.

  **The destination stopped being invisible state.** The section that will take the question announces it on its header — _Adding here_ when the author pointed at it, _Adding to the last section_ when they pointed at a welcome or ending screen, which belongs to no section. With nothing selected there is no intent to confirm, so nothing is announced and the last section still takes it. The header renders only above a multi-section form, so a one-section form gains no new chrome, and default placement is still append-to-bottom.

- adb6b33: **The progress bar reads 100% only when the form is actually filled in.** `computeProgress` short-circuited to full the moment every _required_ question was satisfied, so on a nine-question form with one required email, answering that email alone painted a solid, completely full bar above eight visibly blank questions — `aria-valuenow="100"` with one of six fields filled. Respondents act on a full bar; the goal-gradient reasoning the file was written around is exactly why they stop at one, so optional questions the author deliberately asked got skipped because the UI had already signalled completion. The weighted proportion now runs all the way to the end: required questions still count for three optional ones, so the bar leans toward the path that gates the submit and every single answer still moves it, but neither half can finish it alone.

  **And 100% is terminal again.** Because full was reachable early, it could be followed by more work — or by the bar _falling_, from a claimed 100% to 50%, when a respondent changed an answer that revealed a required follow-up. A control that runs backwards out of a state it called finished has taught the respondent it cannot be trusted. A bar over a branching form can still move down when switching branches grows the path (Typeform's has the same property, and the alternative — clamping to a high-water mark — would hold 100% over a required question nobody has answered, which is the same lie in a different direction). What it no longer does is fall out of a completion it never earned.

  **"You can submit now" got its own signal instead of borrowing the bar's top end.** Submittable and complete are different facts: a ContactInfo block counts as answered on any one of its five fields, and a form of one required question among nine is submittable while eight are blank. `FormProgressComponent` takes a `ready` input and renders a short line beside the bar, and each render mode decides it for itself — the last step, the control live, and the whole visible form valid — because a valid form on section one of four is not submittable yet and saying so there would promise something the Next button does not keep. The line sits outside the `role="progressbar"` element, which is children-presentational and would otherwise drop it from the accessibility tree.

  **The painted layer keeps the same promise.** The bar's integer percentage was `Math.round`, which reports 100 from 99.5% up — so a long form, or one with a partly filled composite among many optional questions, could paint a full bar, glow its arrival state and publish `aria-valuenow="100"` with questions still blank. That is the same defect one layer down, on the exact yardstick the bug was measured with. `progressPercent` floors instead, and lives beside `computeProgress` so the number and its rendering keep one rule; 100 is now reachable only from a value of exactly 1, which the weighted quotient produces exactly when every question is answered.

  **A form with nothing to answer shows no bar.** `computeProgress([])` stays 1 — vacuously, there is no unanswered question left, which keeps the function total — but a progress bar over an empty set reports either "done" or "not started" and both are noise above "This form has no questions to display". Both renderers suppress it, and the OneQuestion renderer's live region stops announcing "1 of 0" with it.

- e68762c: **Publish refuses a form whose rules the builder is already calling broken.** The canvas has badged a dangling rule for a while, and says exactly what is wrong with it — _references a question that no longer exists_, or _references a question that is answered later than this rule runs, so the rule reads a blank_. Publish read none of that. Clicking it with the badge on screen returned "Published version 1", baked the dangling `questionId` into `FormVersion.DefinitionSnapshot`, and the public link then rendered one question fewer than the author believes the form has: the guarded item's condition can never be satisfied, so nobody is ever shown it, and the dashboard reports it as _0 answers · 100% skipped_ — indistinguishable from respondents choosing not to answer.

  **One decision, in one place.** The badge and the gate are now the same read. `ruleInventoryFormOf` is the single adapter from the builder's loaded tree into the shape the rule inventory walks — it used to be a getter on the builder component, which is precisely how publish came to have its own opinion of the form — and `brokenRuleLines` is what both the refusal and (via `collectRuleEntries`) the badges consume. A breakage class the inventory learns later blocks a publish without either being touched, and neither can start disagreeing with the other.

  **The gate is on the service, not the button.** `PublishService.publish` is the only code in the app that writes a Published `FormVersion`, so refusing there covers every caller rather than only the one click — and the refusal names the rules, so an author is told what to fix rather than that something is wrong.

  **The refusal does not outlive the rules it names.** Found smoke-testing the gate: with the refusal on screen the author fixes every broken rule, the badges go green and the control returns to "Published" — and the toolbar still read _Publish refused — 4 broken rules would ship with this form_, beside the pill saying the form was live. That is the same two-answers-one-form failure this gate exists to remove, so the message enforcing it must not re-introduce it. `PublishResult` now carries the `brokenRules` it refused over — absent on every other refusal, because "could not read the form's settings" is not something fixing a rule repairs — and the builder retires the refusal from `markDirty()`, the clock the reorder band already uses, asked of `brokenRuleLines`: the same function the refusal was assembled from, so a message and its retraction cannot answer differently.

- 47258af: **"Live on its public link" is now said only when there is one.** The builder header's Published chip carried a fixed sentence — _Everything in this form is live on its public link_ — hung off `Form.Status` and nothing else. Publishing writes a `FormVersion`; it does not write a `FormDistribution`, and without one of those there is no URL for anything to be live on. So the moment an author pressed Publish, the header congratulated them on a public link that did not exist, with the Distribute tab one click away still showing its empty state and offering to create the first one. The form was reachable by nobody. (#83)

  **Reachability is the predicate the server already gates on, not a column.** `formReach` folds the form's share links through the existing `shareState`, so the header agrees with the Distribute tab by construction: a link at its response cap, past its closing date, waiting on a start date, switched off, or never issued a token counts as unreachable here for the same reason the server refuses a submission through it. That covers the inverse case the issue also asked about — a published form whose only link has been closed no longer claims to be live either — and it covers the four other ways to be closed that nobody had thought to ask about.

  **The chip says it, not just the tooltip.** A `title` needs a hover and a phone has none, so an author on the surface this app is built for would never have seen the correction. An unreachable published form now reads "Published, not shared" or "Published, not collecting" in warning tone — the two are kept apart because their cures are, one wanting a link created and the other an existing link reopened — and the chip is a button that lands on the Distribute tab, so the state names its own remedy and then performs it, the way a share link's own badge already does. The two publish-button tooltips that made the same promise one state earlier ("Publish this form to make its public link live") no longer promise a link either.

  **A read it could not perform is not an empty list.** `DistributionService.shareLinkFacts` returns `null` rather than `[]` when the `RunView` fails, and `null` is its own kind — "Published, link unchecked", never a second invitation to create a link beside one we simply could not see. It does not get the reassuring green check either: an unverified claim rendered as a verified one is this same bug wearing a different hat, so a failed read points at the Distribute tab, which is where the load failure is actually explained. The columns that read requests are derived from `ShareLinkFacts` through an exhaustive map, so a gate that starts reading a new column cannot silently be handed `undefined` for it.

  **And it stays true while the builder sits open.** The links are re-read on any `FormDistribution` save or delete raised anywhere in the app, so creating the first link on the Distribute tab flips the header back without a reload — the inverse mistake, and just as wrong. The publish control also became one persistent live region rather than three that replace one another, because a region inserted with its content already in it is announced by nothing — which is how the state most worth hearing about went unannounced.

- d2810cd: **The builder's "Import questions" paste box is gone.** The Build tab's palette rail carried a dashed button above the question-type groups; it opened a dialog whose parser turned pasted lines into pages, questions and options and appended them to the form. The rail now offers search and the question-type groups, and nothing else. Retired at the product owner's call: the palette is the supported way to add questions, and a second, punctuation-driven path to the same outcome was a path an author had to learn separately in order to get a worse result. **No released version ever carried it** — it was built and removed inside the same unreleased window, so no upgrade loses a feature it had.

  **Removed rather than deprecated, because it had nothing to keep reading.** The feature was entirely client-side and owned no data model of its own — no column, no migration, no stored shape a published form still parses. Its parser was pure and its dialog was never exported from the package's public surface (`builder/index.ts` exported neither `ImportQuestionsComponent` nor anything from `question-import`, and the shipped `.d.ts` confirms it), so no consumer of `@mj-biz-apps/forms-ng` loses an import. What it wrote while it existed was ordinary `FormPage` / `FormQuestion` / `FormQuestionOption` rows, indistinguishable from anything the palette creates, so no form built with it changes behaviour. Deprecating a UI affordance that leaves nothing behind only postpones the deletion while keeping the second path on screen.

  **The palette header lost a level of nesting with it.** `.fb-palette-tools` existed to stack the search box above the Import button. With the button gone it wrapped a single child, which left its `display`, `flex-direction` and `gap` inert and only its bottom margin doing real work — a wrapper element whose whole remaining job was a margin its only child could carry itself. The margin moved onto `.fb-palette-search` and the wrapper went. Rendering is unchanged: both boxes are full-width block-level flex containers in the same formatting context, and the `.fb-palette-group` they sit above declares no top margin for the collapse behaviour to differ over.

  The parser's 16-test vitest suite is deleted with the code it covered rather than skipped, since a skipped suite for a deleted feature is a standing invitation to resurrect it.

- d973d74: **A question card offers only the reorder arrows that would move something.** Both arrows were bound `[disabled]="busy"` and nothing else, so _Move up_ on the first question of a section and _Move down_ on the last were focusable, tabbable, clickable controls that could never do anything. No data was ever at risk — `reorderQuestion` refuses an out-of-bounds move, and `DisplayOrder` stayed contiguous — but it refused in silence, which is the part that costs: a keyboard or screen-reader user was offered a control, reached it in the tab order, activated it, and got no feedback explaining why nothing happened. Every other reorder pair in the package already disabled at its bounds — the logic editor's jump rules, the automation tab's steps, the widget's Ranking question. The builder's question card was the one that did not.

  **The arrow and the guard are now one decision.** `canMoveQuestion` is the same `isValidReorder` that `reorderQuestion` refuses on, so the affordance cannot disagree with the outcome: an arrow is enabled exactly when the move it offers would land. Re-deriving "where the ends of the list are" in the template would have been a second copy of that decision, free to drift from the one that actually decides — and the drift shows up as either a dead control or a question that cannot be moved at all. The guard stays where it is regardless: drag-drop enters the same path through `dropQuestion`, which has no attribute to be disabled by.

  The boundary is the **section's** — a page, in the model's own vocabulary — because that is the only boundary reordering has: every path indexes `page.questions`, and nothing moves a question to another section. A section holding a single question correctly disables both arrows.

- a059481: **The respondent widget draws its own icons, so a shared form link stops rendering every icon at 0 × 0.**
  The widget used Font Awesome `<i class="fa-…">` glyphs, which paint nothing until a host page loads
  the icon font. The builder preview runs inside Explorer, which loads it; the public `/f/:slug` page is
  deliberately shell-free and loads no stylesheet at all — so Ranking's grip and chevrons, the Rating
  stars, the FileUpload paperclip and Doodle's Undo/Clear all measured zero on a live link while the same
  form looked right in preview. Rating was the worst of it: selection is expressed as a colour flip on the
  glyph, so clicking a star gave a respondent no feedback whatsoever.

  All 22 icon sites now render `<mjf-icon name="…">` — an inline SVG from a typed 15-glyph catalogue,
  `1em` square, `fill: currentColor`, `aria-hidden` on the host. The icon travels inside the widget bundle
  (+6.4 kB), so it renders identically in Explorer, on the host page, and in a `<script>` embed on someone
  else's site, with no font, no stylesheet and no third-party origin. A name outside the catalogue is a
  compile error under `strictTemplates`.

  Also: Ranking's reorder arrows go from 36 px to 44 px, the WCAG 2.5.5 tap-target minimum — they are
  the only reorder path for anyone who cannot drag. Because those arrows are the tallest thing in a
  row, they also set the row's height, so the drag placeholder now takes its box from the same
  declared tap target instead of its own `3rem` literal; that literal had been leaving a hole 10 px
  shorter than the row it replaced, and 18 px after the arrows grew.

  Ships no migration and no metadata, so patch.

- 04692ce: An expired session tells the respondent what happened and how to start again (#123).

  The anonymous session a `/f/:slug` link mints lasts a fixed time (MJ's `sessionTokenTtlHours`,
  8 h by default) and has no refresh token. Once it lapsed, every request the widget made was a
  401 — and a respondent who had left a long form open was shown the bare string
  `Forms API request failed: HTTP 401`, under a progress bar still saying "You can submit now.",
  with a Submit that could only ever fail again and an autosave that had been failing silently
  since the moment the token died. Nothing said what had happened, and nothing offered the one
  thing that works.

  The transport now reads the server's typed `JWT_EXPIRED` code and reports it as a
  `SessionExpiredError` — the one failure the seam reports by type, because it is different in
  kind: not "try again" but "this token is dead". The widget answers it with a terminal `expired`
  phase: the autosave is disposed, submit is withdrawn (which also silences the ready line), the
  form is made `inert` beneath a notice that says the session timed out, that nothing was
  submitted, and that the answers will need entering again, with one action — Start again —
  that reloads the page. Reload is the recovery because `GET /f/:slug` mints a fresh session on
  every fetch; the widget obtains no token of its own, and the operator's TTL stays a bound.

  Whichever request meets the expiry first — an autosave on the next keystroke, the final submit,
  or a retried load — ends the fill the same way, so the respondent hears about it as soon as the
  widget does rather than after answering thirty more questions. Answers autosaved before expiry
  survive as a `Partial` response; there is no cross-session resume, so a fresh session starts
  blank, and the notice says so rather than implying otherwise.

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

- 5b48fe0: State the form's catch-all ending in the Edit logic dialog (#74).

  The dialog's jump hint ends with "if none match, the respondent carries on to the next
  question", which invites "…and then what?". It now answers: one read-only line naming the ending
  everyone who finishes lands on, or saying plainly that nothing catches them and they will see
  the form's confirmation message.

  Deliberately a sentence, not a picker. #74 and QUESTION_LEVEL_LOGIC_PLAN.md §6 specify an "All
  other cases go to" control, and one was built and rejected in review: the catch-all is already
  authored on the Endings strip, made exclusive in v0.12, so a second writer inside a PER-QUESTION
  dialog needed a caption admitting it changed the setting for every other question too. A control
  that needs that caption has already failed. Stating the fact answers the question without adding
  a second place that writes it.

  Also fixes a latent freeze on the Endings strip: `setDefaultEnding` throws on an id naming no
  eligible ending, and the builder's handler had no `try/finally`, so a refused move would have
  left `busy` true and every guarded action in the builder inert.

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
