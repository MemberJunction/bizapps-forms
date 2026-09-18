# @mj-biz-apps/forms-server

## 0.12.0

### Minor Changes

- ec8b090: Ship the search-API curation, so the sixteen Forms entities stop offering every table to user search.

  #232 curated which Forms entities and fields the MJ user search API may reach, but it did so in
  `metadata/entities/.entities.json` only — declarative JSON that `mj app install` never reads. The
  setting therefore existed on nobody's host. `V202609181845__v0.12.x__Metadata_Sync.sql` is this
  release's one consolidated seed and carries it.

  **What a host gets.** Search stays on for the two entities a person actually searches by name —
  Forms and Form Categories, each matching `Name` with a `BeginsWith` predicate and excluding its
  other columns — and goes off for the fourteen detail, run and response entities behind them. Before
  this, fourteen of the sixteen were searchable, including Form Responses and Form Response Answers.

  **`AutoUpdate*UserSearchAPI` is set to 0 on all sixteen, which is what holds the choice against
  CodeGen.** Setting it to 0 is MJ's own documented mechanism for that. Left at 1, CodeGen's Smart
  Field Identification may rewrite the flags — the entity-level one only when the entity is new to
  CodeGen, the field-level ones whenever the entity gains a column. It is a schema change that
  reopens the question, not every run.

  One generator artifact rides along and changes nothing: a `spUpdateUserView` writing the `All Forms`
  view back with the values it already has. Both earlier seeds carry one for the same reason.

  The seed was generated against a database built from `migrations/` alone at MJ 6.1.1, and proved by
  restoring that database untouched, applying the chain including the new file, and reading the
  sixteen entities and seven fields back.

### Patch Changes

- c9366ea: The release runbook describes a pipeline that has now been run

  Four files still said the release had never been executed, which stopped being true on 2026-09-15
  when `v0.11.0` shipped through it. They now record that, the two defects the first run found
  (#225, #226), and what to expect next time. The "some packages published, others did not" row was
  the one actively misleading entry: npm's packument is eventually consistent and served a mixed view
  for about three minutes after `v0.11.0`, so following that advice would have triggered a needless
  re-run. It now says to wait and read the publish step's own output first.

- 899739b: Widen the MemberJunction compatibility range so Edge and 6.1.0 hosts can install MJ Forms.

  The `^6.1.1` peer range admitted no prerelease build at all — semver only accepts a
  prerelease when a comparator shares its exact major.minor.patch and carries a prerelease
  tag. A `6.1.0-edge.6` host therefore failed with ERESOLVE, which `mj app install` reports
  as an npm auth problem before finalizing the app as Disabled (#211). Plain `6.1.0` hosts
  were locked out too.

  Peers move to `^6.1.0-edge.6` and `mjVersionRange` to `>=6.1.0-edge.6 <7.0.0`. This is a strict
  widening: every host that could install before still can, plus 6.1.0 itself and 6.1.0 Edge
  builds from `edge.6` onward. The era boundary is unchanged — MJ's installer coerces a
  prerelease host to its base tuple, so a 7.0.0-edge.0 host still correctly fails the
  `<7.0.0` cap.

  The `edge.6` floor was verified by checking all 74 imported `@memberjunction/*` symbols
  against the real `6.1.0-edge.6` typings — an API-surface check, not a compile.

- Updated dependencies [ec8b090]
- Updated dependencies [c9366ea]
- Updated dependencies [899739b]
  - @mj-biz-apps/forms-entities@0.12.0
  - @mj-biz-apps/forms-actions@0.12.0
  - @mj-biz-apps/forms-ng@0.12.0
  - @mj-biz-apps/forms-core-entities-server@0.12.0

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

- bdddb6a: `Forms: Analyze Written Responses` could never record a run, so it never completed.

  The action runs an AI prompt under the automation service principal, and MJ's prompt engine writes one `MJ: AI Prompt Runs` row per execution — inserted when the run starts, updated on completion with the result and token counts. `Forms Automation Runner` held no permission on that entity, so every execution died at `BaseEntitySaveQueue.Insert(MJ: AI Prompt Runs)` and no answer was ever scored.

  Nothing surfaced. On-submit automations are best-effort by design — the response is persisted and the respondent answered before they run — so the failure reached a log line and stopped there. Found while QA-ing the live path: 17 consecutive failures against one form, a green submit every time, and no prompt-run row to show for any of them. Any host that enabled this automation has been silently dropping both the analysis and its audit trail; the missing audit trail is the worse half, because there is no record that the work did not happen.

  `V202608241700` grants the role Read + Create + Update on `MJ: AI Prompt Runs`, and no Delete. That is what the engine needs and it matches the `UI` and `Widget Guest` grants on the same entity; `Developer` and `Integration` additionally hold Delete, which a runner has no reason to and which would let it erase the evidence of its own executions. The grant is mirrored in `metadata/entity-permissions/.entity-permissions.json` under the same id the migration inserts, so a regenerated seed reproduces this row instead of minting a duplicate under a fresh GUID (`__mj.EntityPermission` has no unique constraint on `(EntityID, RoleID)`, so duplicates are silently additive).

  This is the first grant this repo ships on a core `__mj` entity. The prompt-run ledger is where MJ records that an AI call happened at all, so any principal permitted to run a prompt has to be able to write it — which is why `Integration` and `Widget Guest`, the other non-interactive roles, already hold it.

  **Note for operators:** on a host where this automation is enabled, it starts actually calling the model once this migration is applied. That is the point, but it is new spend where there was silently none — roughly 600 tokens per submission on a five-question form in local testing.

- d565ffd: The automation runner could not write its own audit trail, and Forms never wired the one it ships.

  Two defects that read as one. Every automation Forms dispatches runs an MJ Action, and the action engine writes one `MJ: Action Execution Logs` row per execution — inserted at start, updated at completion. `Forms Automation Runner` held no permission on that entity, so every dispatch logged `BaseEntitySaveQueue.Insert(MJ: Action Execution Logs) failed` for the service principal and carried on. The work still happened; only the record of it did not.

  `V202608242110` grants the role Read + Create + Update, no Delete — exactly what `Developer` holds on that entity. `Integration` additionally holds Delete, which a runner has no reason to and which would let it erase the evidence of its own executions.

  That grant alone did not restore the trail, and the second defect only became visible once it was applied. `FormAutomationRun.ActionExecutionLogID` and `.AIAgentRunID` have existed since `V202608072330`, and the responses dashboard reads both — but `dispatch-automation.ts` never wrote either. On the database this was found on, all 134 automation runs carried a null `ActionExecutionLogID`, **successes included**; with no log rows to point at, that looked like a consequence of the missing grant rather than a separate bug underneath it. Each target now returns a `DispatchOutcome` carrying its provenance id alongside the summary, and the run row is stamped with it — including on the failure path, via an error type that carries the outcome, because a failed run is where the reason lives and so the last row that should lose the pointer to it.

  Verified end to end on a live stack: before, 134 of 134 runs null and zero log rows for the principal; after, every Action-target run joins to its own execution log, and the entity-binding target correctly carries none (a binding writes a business record directly, with no MJ-side run — its identity-ledger row is its provenance).

  `V202608242100` ships alongside them, granting the same role Read + Create + Update on `MJ_BizApps_Common: People`. `Forms: Upsert Respondent Person` exists to match-or-create one of those, and `Forms: Bind Response To Entity` writes the same table; neither could on any host where an operator had not hand-inserted the row. That is how it was found — the grant was live in a dev database under an id present in no migration and no metadata file, the signature of a fix applied and never shipped. Both grants are mirrored in `metadata/entity-permissions/.entity-permissions.json` under the ids the migrations insert, so a regenerated seed reproduces them instead of minting duplicates (`__mj.EntityPermission` has no unique constraint on `(EntityID, RoleID)`, so duplicates are silently additive).

  **Note for operators:** the People grant makes `Forms: Upsert Respondent Person` start actually creating People on hosts where it has been silently failing. That is the point, but responses submitted before this will not be backfilled — they keep their null `RespondentPersonID`.

- 11a838e: Duplicated core metadata broke CodeGen for anyone who regenerated; one SQL escaper replaces sixteen.

  **The metadata (#64, #66).** `V202608191300` promises idempotency in its own header and delivers it for most of its length — the `Entity` block is fenced on a natural key, every `EntityField` insert is guarded `WHERE ID = '<guid>' OR (EntityID = … AND Name = …)`. Seventeen statements are guarded differently: `IF NOT EXISTS (… WHERE [ID] = '<guid>')` and nothing else. That asks whether _this row_ was inserted before, when the fact that makes an insert safe is whether _the thing it describes_ already exists, under whatever id the host minted for it. Any developer who ran `mj codegen` between `V202608182100` and `V202608191300` — the documented workflow — had those rows under CodeGen's ids, so all seventeen guards missed and all seventeen inserted a second copy. None of the affected tables carries a unique constraint on its natural key upstream, so it landed silently and the migration reported success.

  The cost is #66. CodeGen emits one `@FieldResolver` per `EntityRelationship` row, so the duplicated `Forms → Form Screens` row made the next regeneration emit `mjBizAppsFormsFormScreens_FormIDArray` twice and `forms-server` stopped compiling — which is why every `mj codegen` run on an affected host ended `ERROR running one or more AFTER commands`. The checked-in generated files predate the duplicate and still compiled, so the break appeared only on regeneration, looking like it belonged to whichever branch happened to regenerate.

  `V202608252300` converges by keep-list: for every row `V202608191300` ships, any _other_ row carrying the same natural key is removed, so a repaired host becomes row-for-row identical to a fresh install rather than merely un-duplicated. It is a strict no-op on a clean database and on a partially hand-cleaned one, and it cannot touch host-authored metadata — every delete requires a same-natural-key sibling from the keep-list. It then asserts its own end state, scoped to this app's entities.

  **Two findings beyond the issues.** `EntitySetting` was duplicated too (`FieldCategoryInfo` and `FieldCategoryIcons` on Form Screens) and was in neither issue's sweep; it is converged here. And the ID-only guard is not one migration's slip — it is the guard **CodeGen itself emits** for a relationship row, present in 51 statements across five migrations, four of which are pasted CodeGen output. The real fix is upstream in MJ; until then `scripts/check-distribution-seed.mjs` CHECK 4 refuses the shape at authoring time (watershed after the last shipped offender, like CHECK 3), and `smoke/metadata-integrity-path.mjs` rules on the end state in the database — the half no unit test can reach, since every existing gate reads checked-in files and this defect lives only in `__mj`.

  **The escaper (#67).** The shipped packages carried sixteen implementations of "double the single quotes" — seven named local functions spelled four ways, nine written inline. (Nine more live in `smoke/*.mjs` and stay there deliberately: those are stdlib-only scripts that run in order to test a build, so importing the built package would make the suite depend on the artifact under test.) They had already drifted into four different decisions: one N-prefixes the literal, one tolerated `null`, one escapes LIKE wildcards, the rest do neither. They are now one module in `@mj-biz-apps/forms-entities` (`escapeSqlString` / `quoteSqlString` / `sqlLiteral`), which every consumer package already depended on, so no new coupling was created — the coupling was what had kept the duplication alive.

  Purely a refactor: the SQL each call site emits is byte-identical, including the file-link gateway's `(value || '')` tolerance, which is load-bearing because that package compiles without `strictNullChecks`. Upgrading the plain-quoted sites to the N-prefixed form is a behaviour change — the prefix decides whether SQL Server compares a non-Latin value or a row of `?` — and is deliberately not part of this.

- 9d826a9: A disqualification says what screened them, and a blank session no longer shares one bucket

  Two follow-ons to #124, both on the public submit path.

  **A contentless `Disqualified` row is now readable as evidence.** A knockout's `when` group is
  evaluated against the raw answer map while the answers that get stored are the rendered ones, so a
  jump can fire on an answer to a question the walk hid — and that answer is dropped before
  persistence, leaving a `Disqualified` row with no answers at all. `validateSubmission` lets that row
  through deliberately, on the grounds that it records the screening rather than answers; `Status`
  alone does not, on a form with more than one knockout screen. The disqualifying screen's id is now
  stored in `SourceMetadata.disqualifiedByScreenId`, and only when the flow actually disqualified
  someone. No schema change: it joins `clientResponseId` in the blob that exists for facts with no
  column of their own.

  **Behaviour change to note: the per-session rate-limit gate is no longer charged to callers who
  sent no session.** MJ populates `sessionId` from the `x-session-id` header and leaves it blank for
  any client that omits one, so every header-less caller — curl, a bespoke integration, a test
  harness — hashed to a single key, and that key belonged to the tightest of the four buckets
  (5/min). One script could therefore spend it and the next unrelated caller was refused with "Too
  many submissions", a message about traffic that was never theirs. That is the shared kill switch
  the per-IP ceilings are keyed per-caller to avoid, and a gate that cannot tell two callers apart
  has no business refusing either. Those callers are now bounded by the per-address ceilings
  instead, which they cannot rotate. Clients that send a real session id — the widget, and every
  smoke script since `smoke/lib/session.mjs` — keep the exact bucket and cap they had. When no
  address resolves either, the gate is still charged: it degrades to a per-distribution circuit
  breaker, and one coarse bound beats none.

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

- b822223: Attach a respondent's uploads to the records people actually open.

  MJ 6.1.0-edge added a generic record-attachments panel that every generated form already
  mounts, and it reads one table: `__mj.FileEntityRecordLink`, filtered by EntityID and
  RecordID. Forms recorded a file in two other places — `FormResponseAnswer.FileID` and the
  `FormUpload` ledger — and wrote no link rows at all, so a résumé was stored, downloadable
  through `GET /forms/files/:id`, and invisible on both the form response and the applicant a
  binding created from it.

  One reconciler (`packages/Server/src/file-links/`) now makes a record's attachments match a
  response's file answers, called from `persistSubmission` for the response row and from the
  binding dispatch for the record a binding wrote. Because the binding executor is generic
  over target entities, ATS and every future target are covered with no per-app code.

  The link table has no unique constraint on (FileID, EntityID, RecordID) and no owner column,
  so both guarantees are the writer's: idempotency is a read (autosave, promotion and the
  recovery sweep all re-run these paths), and a link is removable only when its file has a
  `FormUpload` row for that response — which is what lets a replaced upload disappear while a
  file the response never uploaded stays put, whoever attached it. Attaching is gated on the same provenance verdict
  that gates writing a file id into a column, now computed once per binding and used for both.
  Both writes are best-effort and logged: the response and the bound record are already saved
  when they run.

  `V202608251800` grants `Forms Automation Runner` Read + Create + Delete on
  `MJ: File Entity Record Links`. Deliberately nothing on `MJ: Files`: the attachments panel's
  "Delete Completely" — which hard-deletes the file row and orphans its stored bytes
  (MemberJunction/MJ#4046) — needs CanDelete on both, and the migration asserts the second is
  absent. The submit path's system user already held what it needs.

  Verified live with a real upload, both legs, by `npm run smoke:file-links`.

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

- 12b51a6: The public-submit abuse ceilings are now keyed on the caller's resolved IP instead of a header they choose.

  The rate limiter keyed on `ctx.sessionId`, which is `UserPayload.sessionId` — populated by MJ from the client-settable `x-session-id` request header, not from a JWT claim. A caller who sent a new value per request landed in a fresh bucket every time, so the per-session cap never tripped. Turnstile and both quotas are opt-in, which left that cap as the only always-on gate on completions, and every accepted completion fires the on-submit automations: a confirmation email to an address the submission chose, an LLM run, entity upserts.

  The client IP is not available to a resolver — `AppContext` carries no request object — but MJ mounts `BaseServerMiddleware.GetPreAuthMiddleware()` ahead of both auth and Apollo, so the new `RequestIdentityMiddleware` resolves the peer there and carries it in an `AsyncLocalStorage` store the resolver reads. No core fork.

  Three gates now, consulted together by `FormsRateLimiter.charge()` so a request one refuses spends nothing in the others: the existing per-(session, distribution) limit, unchanged and documented as shaping rather than a ceiling; a per-(caller, distribution) ceiling (`FORMS_RATELIMIT_IP_MAX`, default 120); and a tighter completions-only ceiling (`FORMS_COMPLETION_MAX`, default 20), charged only on a final submit so autosaves cannot eat the budget that bounds the expensive work.

  Every ceiling is per caller **and** per distribution. A cap keyed on the distribution alone is a bucket every respondent of a form shares, so one caller saturating it takes the form offline for everyone — a rate-limit bypass traded for an outage. With no resolved IP the ceilings are dropped rather than re-keyed onto the session id, which MJ leaves blank for header-less clients and which would collapse every such caller into one shared bucket; the pre-existing per-session gate is left exactly as it was and the degraded mode is logged once per process.

  Also fixed, both reachable from the same attack: `FormsRateLimiter` pruned timestamps inside a bucket but never removed a bucket, so minting keys grew the map without bound — now capped by `FORMS_RATELIMIT_MAX_KEYS` (default 50000) and evicted least-recently-**used**, where a refusal counts as a use, so a saturated bucket is never the one forgiven. And `POST /forms/upload` had no frequency gate at all despite every call storing bytes and creating an `MJ: Files` row — now gated on the resolved IP before a byte is buffered (`FORMS_UPLOAD_IP_MAX`, default 30), answering 429 with `Retry-After`.

  Rate-limiting now runs **before** Turnstile. A Turnstile token is single-use, so verifying first meant a submission the limiter was about to refuse had already spent the respondent's token at Cloudflare, and their retry — the one thing available to someone who has been rate-limited — failed with a captcha error instead of the wait.

  **Deployment note:** set `FORMS_TRUSTED_PROXY_HOPS` in any environment where a load balancer or CDN fronts MJAPI (1 behind a single balancer, 2 behind a CDN in front of one). It is the number of trailing `X-Forwarded-For` entries written by infrastructure you operate, and therefore the only ones believed — reading the left-most entry would hand the bucket key back to the caller. Left unset behind a proxy, every respondent keys on the balancer's own address and the ceilings become form-wide caps. A malformed value fails the boot rather than degrading quietly, so a typo stops MJAPI from starting rather than silently disabling the ceilings.

  New config: `FORMS_TRUSTED_PROXY_HOPS`, `FORMS_RATELIMIT_IP_MAX`, `FORMS_COMPLETION_MAX`, `FORMS_RATELIMIT_MAX_KEYS`, `FORMS_UPLOAD_IP_MAX`. No schema change and no migration.

- efa88e6: **An anonymous respondent can no longer read the host's internals from the public form's GraphQL surface (#119).** Three independent leaks, all reachable with nothing but the session the public link itself mints for a stranger.

  Scoped to that surface on purpose. The anonymous upload endpoint still returns a storage provider's own exception text (`upload.service.ts:381`), and Apollo answers a context-creation failure before any plugin can see it; both are pre-existing, neither is touched here, and both are recorded rather than quietly folded in.

  **The driver's words, inside an HTTP 200.** `persistence.service.ts` returned `LatestResult.CompleteMessage` as a failure's `message`. That is MJ's _operator_ diagnostic, and the SQL provider fills it with the driver error plus the entire T-SQL batch — database name, schema, table, constraint, stored-procedure names, column types, and the respondent's own answer echoed back inside a `SET @TextValue = N'…'`. Five call sites returned it, the pipeline put it in `errors[]`, the resolver mapped it onto the typed result, and the widget rendered it verbatim. Because it rode inside a _successful_ GraphQL response, no Apollo setting and no `NODE_ENV` ever touched it: a production host leaked it identically.

  That text now goes to the log, through `LogError`, with the entity, the row id and the question it was about — and the respondent gets one authored sentence, `SAVE_FAILED_MESSAGE`. `LogError` rather than `LogStatus` is load-bearing: MJ silences `LogStatus` under `NODE_ENV=production`, so the pipeline's existing timing line does not exist on a production host. Before this change, a production host's only record of the failure was the provider's untethered dump with nothing tying it to a form, response or question.

  **Fixed at the source, not filtered at the edge.** The alternative was scrubbing `errors[].message` through a "does this look like SQL" filter. A denylist over free text guesses: it mangles an authored validation message that happens to contain a database-ish word, it fails open on the next unforeseen leak shape, and persistence would still be producing respondent-unsafe text for any future caller. Every string that can now reach `errors[]` is authored, so nothing downstream needs to know what SQL looks like.

  **An exception on the submit path.** `runSubmitPipeline`'s comments had promised "never a throw that would blank the widget" since the shape guard was written, but nothing enforced it past the gates. An exception from any stage escaped to Apollo, which puts the exception's own words into `errors[].message`. The pipeline now catches: the exception goes to the log with the slug, version and partial flag — never the answers — and the respondent gets `SUBMIT_FAILED_MESSAGE`.

  **The resolver's own work, which sits outside that boundary.** `SubmitFormResponse` resolves the provider, the context user, the answer mapping, the system user and the request identity _before_ entering the pipeline, and maps the result after; `PublishedForm` had no boundary at all. A throw in any of those reached Apollo the same way. Both methods now run through one `respondentSafe` helper that logs the exception with its stack and returns authored text, or `null` for a form that cannot be shown. Neither gap is reachable through the schema as it stands — `answers` is a non-null list, so graphql-js refuses a null before the resolver runs, and `resolvePublishedDefinition` returns a typed failure rather than throwing — so this closes the class rather than a demonstrated leak. The reasoning is the one `file-links.service.ts` already applies to its own read guard: a contract that holds only for the current implementation is not a contract, and the party on the other side of this one is a stranger holding a link.

  **Apollo's stack traces.** Apollo attaches `extensions.stacktrace` — absolute server paths, pinned dependency versions — to every error unless `NODE_ENV` is `production` or `test`, and MJ's `buildApolloServer` never overrides that default, so one malformed query returned thirteen frames to an anonymous caller. A new `StacktraceRedactionMiddleware` contributes one Apollo plugin through `GetApolloPlugins()`, the seam MJ documents for custom error formatting, and strips the key from every response.

  **Unconditional, deliberately.** Scoping the strip to anonymous sessions was the tempting half-measure. It would key a security control on the request context's shape — a cast from Apollo's `BaseContext`, then an `any`-typed user record — and fail **open**, with no compile error, if that shape ever drifted. Production behaviour is unchanged, since Apollo already omits stacks there. On a dev host, a thrown resolver error's stack is no longer in the browser's network tab; the resolver that threw is expected to have logged it, and the wire is not a log.

  **Two dev-only responses remain, and they are MJ core's.** An empty JSON body and a body that is not JSON are answered by Apollo's HTTP layer and Express's `body-parser` before the request pipeline exists, so no plugin can see them. Both are clean under `NODE_ENV=production`. Fixing them needs `includeStacktraceInErrorResponses` on core's `buildApolloServer` plus a JSON error handler on its GraphQL route; a host-wide Express error handler shipped from a Forms package would have a blast radius across every app on the host.

  **A new smoke suite, `pnpm run smoke:errors`.** It mints a real anonymous session from `/f/<slug>` and scans every byte of every response — a malformed query, an unparseable one, an out-of-scope read, two bad requests, a stale-version submit and a refused save — for stack frames, filesystem paths, `pkg@version` strings, and database, schema, constraint or procedure vocabulary. The two core residuals are reported as `warn` and named as core's, so a pass stays honest about what Forms owns and nobody learns to ignore a permanently red check. The foreign-key case needs a question that exists in a published snapshot with no `FormQuestion` row behind it; without one it _skips_ with the recipe rather than pretending. It answers every required question alongside that ghost — otherwise validation refuses the submission before persistence, the foreign key is never violated, and the check passes while exercising nothing.

  `minor` rather than `patch`, on two counts. The new middleware registers itself at server bootstrap through MJ's `ClassFactory`, so installing Forms now changes the error responses of **every** app on that host, not only Forms' own — the widest blast radius in this change, and intended. And the text of `errors[].message` on a failed save is a documented behaviour change for any non-widget API client that was reading it: a caller parsing the driver's message for a constraint name gets one authored sentence instead. (The package's public surface is unchanged: `SAVE_FAILED_MESSAGE`, `SUBMIT_FAILED_MESSAGE`, `respondentSafe` and `StacktraceRedactionMiddleware` are module-level exports for the tests and for `index.ts`'s registration import, not additions to `forms-server`'s entry point, which still exports only `CLASS_REGISTRATIONS`, `RESOLVER_PATHS` and `LoadBizAppsFormsServer`.)

  No migration, no CodeGen, no metadata.

- 28e56ee: Résumé/file-answer arc fixes (issue #49): the public upload endpoint now validates `questionId` against the published definition (must exist and be a FileUpload question) before any byte is stored, instead of failing deep in the provenance insert and orphaning the stored bytes; and the new `V202608181030` migration grants `Forms Automation Runner` read on `MJ_BizApps_Forms: Form Uploads`, without which bind-time provenance verification always failed closed and no file answer could ever be copied onto a bound entity.
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

- a4ae343: `/remember` recognises a resumed session as the owner of its own draft.

  Its guard restated the ownership rule instead of calling it, and left out the scope clause — so
  after a `/resume`, where the caller's JWT names the response rather than the link and the widget
  has minted a fresh `x-session-id`, an ordinary fill answered 403 and logged
  `refused to remember <id>: the caller does not own it` once per resumed sitting. Nothing the
  respondent could see: the client swallows the 403 and the device already holds a rotated pointer.
  What operators saw was a security-shaped alarm firing in proportion to how well the feature worked.

  The guard now calls `responseIsOurs`, so the equivalence its comment claimed is checked by the
  compiler. The link match the design review added stays, narrowed to the caller it was written for:
  a distribution-scoped JWT must still match the link the row came through, and an unknown link is
  still a refusal.

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

- **A shared distribution link now unfurls as the form it points at, instead of as a card reading "Form" (#120).** Every Forms link, everywhere, rendered `<title>Form</title>` with zero Open Graph tags — so a link pasted into Slack, Teams, email or a text message previewed as an untitled card indistinguishable from every other Forms link, at the exact moment a respondent decides whether to trust a page asking for their personal data. Nothing client-side corrected it either: no code set `document.title`, so the tab still read "Form" long after `<mj-form>` had mounted. The page now carries the form's name in `<title>` and `og:title`, and its description in `og:description` and `<meta name="description">`.

  **It was a wiring gap, not a design decision.** `renderRespondentHostPage` has accepted a `pageTitle` since it was written and defaulted it to `'Form'`; the route simply never passed one — even though it had already loaded the distribution row, whose view column `Form` _is_ the form's name. So the fix costs no new read for the name at all: the door hands the row it resolved up with the token (`RedeemOutcome.distribution`) rather than paying for a second identical `RunView` on the hottest unauthenticated path in the product.

  **The description costs exactly one primary-key read, and losing it never costs the respondent the form.** `loadFormIdentity` reads one column of `MJ_BizApps_Forms: Forms` by id. A read that fails, or returns no row, is logged with the slug and the form id — so the line traces back to a link — and the page degrades to name-only. The second line of an unfurl card is not worth withholding a form for, but it is not lost silently either. A blank or whitespace-only description is treated as absent rather than emitted as an empty tag.

  **The live `Form` row, not the published snapshot.** The snapshot's name and description are copies of these same two columns taken at publish time, and reading it means loading the `FormVersion` row and parsing the whole definition JSON for two strings — which the widget then loads again over GraphQL. The trade is deliberate and worth naming: the head describes the form as its author currently states it, so renaming a published form changes the unfurl card before the next publish changes the rendered form.

  **No `og:description` at all for a form that has none**, rather than an invented subtitle. A title-only card renders fine in Slack, Teams and iMessage; boilerplate like "Fill out this form" would be the generic-card defect in new clothes. `robots: noindex` is untouched — unfurlers are not search indexes, and this page still must not be indexed.

  **`/favicon.ico` answers `204` instead of `401`.** No route matched it, and `ConfigureExpressApp` routes register ahead of the unified auth middleware, so the browser's automatic request fell through to authenticated routes and returned `{"error":"Authentication required"}` — the only console error on a healthy respondent load, and auth-failure noise proportional to form traffic. There is no Forms icon asset to serve and inventing brand art is a product decision, so the answer is an explicit empty one that every browser and fetcher accepts. A `<link rel="icon" href="data:,">` alone was rejected because a direct fetch of `/favicon.ico` would still 401, and so would the error page. Worth knowing: the path is origin-wide, so every caller on that MJAPI origin now gets `204` there; the API never had an icon to serve. It is registered inside the host page's own `ConfigureExpressApp`, so `FORMS_RESPONDENT_HOST_ENABLED=false` removes it along with the page.

  Ships no migration and no metadata, so patch.

- e6f09f4: **A link whose form has not been published is now refused at the door, and a link that opens next week is told so instead of being declared gone (#118).** `GET /f/<slug>` already refused closed and full links _before_ minting an anonymous session — its own comment says the gate exists so the form does not invite work it already knows it cannot accept — and then admitted a link whose form had no `Published` version: `200 OK`, a full session JWT baked into the page, `PublishedForm: null`, and a "Try again" button that could never succeed. Three links were in that state in the dev database. Sharing a link before publishing is an ordinary authoring mistake, so the respondent now hears exactly that — **409**, "This form hasn't been published yet. If you were sent this link, its author still needs to publish the form." — with no retry affordance, and no credential handed out on an unauthenticated endpoint for a form that cannot be filled in.

  **"Not yet open" was being announced as "no longer accepting responses", which is the opposite of the truth.** The window rule deliberately collapsed five states into one boolean, and the error page mapped that one boolean to one sentence and a `410 Gone` — so a form scheduled to open on Monday told the holder the opportunity had passed, and told crawlers and monitors the resource had been permanently removed. That state now has its own answer: **503** with **`Retry-After`** set to the opening instant, and copy that names it — "This form isn't open yet. It opens on December 25, 2026 at 4:00 AM UTC." The time is rendered in UTC and labelled as such, because the error page is static by design and the server does not know the holder's time zone; an unambiguous instant beats a plausible-looking wrong local one.

  **The two gates still cannot drift apart, because neither grew a second copy of anything.** `distributionWindowRefusal` now reports _why_ a link is outside its window, and the boolean the submit gate acts on is derived from it — one rule, two views of it, with the submit gate's call site unchanged. "Published" likewise means one thing at both gates: the door's existence check uses `publishedVersionFilter`, the very filter the definition loader passes to its own version read. A link that opens but cannot accept a submission is the defect #81 closed; keeping both facts single-sourced is what stops it coming back one field over.

  **Order of judgement is deliberate: switched off, then no credential, then not yet open, then the cap, then published.** Everything but the last is free — the distribution row is already in hand — while the version read costs a round trip, so only a link that is genuinely servable pays for it, and a refused link still costs exactly one read. When a link is both unpublished and not yet open, the holder hears "opens on …": that is the distribution's stated intent and something they can act on, and if it is still unpublished when the day comes, it says so then.

  **The door refuses in the order the builder has always shown authors, and that order matters more than it looks.** A link the author switched off reports "closed" even with a future opening date — a human decision outranks a calendar one, and promising a reopening would be untrue. A link the host never minted a credential for reports "not ready" ahead of any calendar or cap reason, which is the builder's rule and its reasoning verbatim: telling someone their never-issued link is merely "Scheduled" sends them to edit a date when the real problem is that no token exists. Ranked the other way, a scheduled-but-never-issued link answered **503 "It opens on &lt;date&gt;" with a `Retry-After` naming that instant** — a machine-readable promise the same URL breaks the moment the date arrives, when it answers 409 instead. The one place the two still differ is a link that is past its closing date _and_ has no credential: the door calls that closed, the builder calls it pending. Both refuse, and neither promises anything.

  **The opening time is now disclosed on an unauthenticated endpoint, deliberately.** Naming when a form opens is the point — a respondent who is told "check back later" with no date has been told almost nothing — but it does mean the launch instant of an embargoed form is readable by anyone holding the slug, in the copy and in `Retry-After`. That is the trade this makes; a form whose _schedule_ is confidential should not be distributed by a public link at all, and there is no per-link toggle for it today.

  **A failed version read is a 502, never a 409.** If the read itself fails, the door fails closed as `redeem-failed` and logs the slug and form id. A database problem reported to a respondent as "the author hasn't published this yet" would send two people chasing the wrong thing.

  **The page no longer contradicts itself, in the tab or on the page.** Error pages carried a fixed `Form unavailable` title, so the browser tab, the bookmark and the link preview all asserted unavailability for a form that has merely not started, or is merely awaiting publication. Those two states now title themselves; the states that really are over keep the default. The body follows: a refusal that is not a failure renders in the page's ordinary ink with `role="status"` rather than in error red with `role="alert"`, so a screen reader is not interrupted with an alarm to be told a form opens on Thursday. Only a genuine failure is still styled and announced as one.

  **An opening time that is not in the future is treated as no opening time at all.** "It opens on X" is only true while X is still ahead of the reader, so that is now the test, rather than merely "is a Date" — which a missing value passes, since `new Date(null)` is the epoch rather than an invalid date. Without a usable time the door still refuses, it simply does not name one and sends no `Retry-After`; a `Retry-After` in the past is worse than none, because it invites an immediate retry that will refuse again.

  **Adding a refusal reason without deciding what a respondent sees is now a build failure.** The reason-to-view mapping shared its `default` arm with the generic 502, so a new reason compiled cleanly and shipped to respondents as "We could not open this form right now". The runtime fallback is unchanged — a value that arrives anyway must not crash the door — but the compiler now requires every reason to be answered.

- ae84bb7: **A share link sitting at `Status='Draft'` no longer opens for respondents while its author is being told it is off.** `Draft` is the `FormDistribution.Status` column's DEFAULT, and `distributionWindowClosed` asked `Status === 'Closed'` — so a Draft link was served in full by `GET /f/<slug>`, minted an anonymous session JWT, and accepted submissions, while the builder's Distribute tab badged that same link **"Paused"** over the sentence _"Turned off. Anyone opening it is told the form is not taking responses."_ It is the defect this module was extracted to prevent, arriving from the other direction: not a link that opens and cannot accept, but a link the author has taken out of service and that keeps taking responses anyway.

  `Status !== 'Active'` is what the rest of the codebase already said. The magic-link minter refuses to mint for anything but Active (`provisioning-decision.ts`), and the builder badge has always treated Active as the only live state — the window predicate was the sole outlier, and now all three agree.

  **"A Draft link has no token" was not the backstop it looked like.** The minter gates on Active but never _un_-mints, so a link that was Active once and is later set back to Draft still carries a working `PublicLinkToken` and sailed through the door on it. The state is reachable by every route that writes the column outside the builder's own create path — an import, a data fix, a seeded row seeded straight to the default.

  Both gates are pinned: the door refuses a Draft link and mints no token, and `resolvePublishedDefinition` refuses it with `distribution-closed` — the submit gate's window branch had no test of its own before this, so the two halves of the shared predicate could have drifted without a red test.

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

- 2561a06: **A link that has had all the responses it asked for now says so at the door (#81).** Setting a share link's response limit to the number it has already collected left `GET /f/<slug>` answering **200 with the whole form** — every field editable, file uploads accepted — and turning the respondent away only at `SubmitFormResponse`, on a screen their answers cannot be recovered from. Turning the _same_ link off gave the correct 410 "Form unavailable" before they typed anything, so two facts that both mean "this link is not taking responses" were handled in two different places, and the one that wastes the most of a respondent's time was the one handled last.

  The door was already the right shape; the cap was simply not one of the things it asked about. `redeemSlugToToken`'s guard checked `IsActive`, `Status`, `OpenAt` and `CloseAt` and stopped there, so a full link reached the redeem and got an anonymous session minted for it. That guard now answers **why** a link refuses rather than whether it is open, and the cap is one of the answers — so a quota-exhausted link is refused before any token exists, in the same decision and by the same code path as a closed one.

  **The two gates cannot drift apart**, because neither judges anything itself any more. The door reads the cap through `distributionQuotaExceeded`, the exact function the submit pipeline's quota gate calls, and both gates now read the open/close window through one shared `distributionWindowClosed` instead of the verbatim copy each was carrying. A link that opens but cannot accept a submission is the defect being closed here, so "the door and the submit gate agree" is an invariant rather than a coincidence to re-establish by hand in two files — and a window rule added to one and missed in the other would have been this same bug, one field over.

  **A full link and a closed link no longer read the same.** `distribution-full` maps to its own message — "This form has reached its response limit and is no longer accepting responses" — beside the closed link's "This form is no longer accepting responses". Both are 410; the resource really is gone either way. But "closed" invites the reader to come back or ask for it to be reopened, and a form that has had its fill has not been withdrawn — saying so is the difference between a respondent thinking they were unlucky and thinking something is broken. The builder's Distribute tab has badged this state "Limit reached" since share-state landed; the respondent-facing surface now agrees with it.

  **The submit-time check remains the authority**, and deliberately so. The door reads a snapshot, and two respondents can be holding the last slot at once — only the write side can settle that race, and it still does, with its own "(quota reached)" message. This change stops the form _inviting_ work it already knows it cannot accept; it does not decide who gets the last slot. For the same reason the submit path's distribution guard is left alone and now documents why: it runs for every submit including partial saves and knockouts, neither of which consumes a slot, so folding the cap in there would strand a respondent already mid-form.

  The boundary is pinned from both sides — a link at 6 of 6 refuses and mints no token, a link at 5 of 6 still opens — so an off-by-one in the cap cannot pass as a fix.

- fb0dda8: Two abuse bounds on the public form path that the per-caller rate ceilings structurally cannot provide.

  - **In-flight concurrency caps.** `FORMS_SUBMIT_MAX_IN_FLIGHT` (default 50) around the whole submit pipeline and `FORMS_UPLOAD_MAX_IN_FLIGHT` (default 10) on the upload route, via a shared `InFlightLimiter`. A sliding window limits how OFTEN a caller may act and says nothing about how many requests they may have executing at once, so a caller comfortably inside every ceiling can still exhaust sockets, pool connections and memory. Refused immediately with a 503 rather than queued — holding an anonymous request is the resource exhaustion this defends against wearing a politer hat — and the cap is checked before the per-caller window so a request shed for load is never charged to anyone's budget.

  - **A hard per-version cap on `Partial` rows** (`FORMS_MAX_PARTIALS_PER_VERSION`, default 10000). This is the only DURABLE bound of the set: the ceilings are sliding windows held in one process's memory, so a caller pacing themselves under all of them — or spread across addresses — accumulates rows for as long as they care to, and partial writes are otherwise ungated entirely (Turnstile and both quotas apply only to COMPLETE submissions). Only a partial submit that would CREATE a new row is capped; complete submits and updates to an existing partial are unaffected. Fail-closed on a count error, which autosave retries silently.

  Rebased onto the IP-keyed abuse ceilings. Two things this branch carried did not survive, both because they were superseded rather than wrong: the per-call `max`/`windowMs` override on `FormsRateLimiter.check()` (the limiter now takes a set of gates and each carries its own `max`, so a caller with different limits expresses them as a gate), and a second upload rate limit keyed on `req.ip` with its own `FORMS_UPLOAD_RATELIMIT_MAX`/`_WINDOW_MS` (the route already has one, keyed on the resolved peer IP under `FORMS_UPLOAD_IP_MAX`, which reads `X-Forwarded-For` only under an explicit trusted-hop count).

  The follow-up this branch flagged — "a true IP-based rate limit on the GraphQL submit route requires a transport-layer Express middleware, since the resolver `AppContext` cannot see `req.ip`" — has since shipped as `RequestIdentityMiddleware`. The rationale comments here have been rewritten accordingly: they argued that an in-flight cap was the only control a header-rotating attacker could not defeat, which was true when written and is no longer.

- cbc8440: A rate-limited form link now answers 429 with a retry hint instead of a 502 outage page.

  Core caps `/magic-link/redeem` at 20 per minute per IP and describes the refusal precisely — HTTP
  429, `Retry-After`, and a body naming the reason. The respondent host discarded all of it and
  rendered "We could not open this form right now", which claims the server is broken. Because the
  cap is keyed by IP, the people who hit it are a classroom, an office behind NAT or a conference
  wifi, not attackers. The host's own per-IP meter now gives the same sentence from the same place
  instead of a second spelling. A genuinely failed redeem — revoked token, endpoint unreachable —
  still renders the 502.

- c92eae4: **A failed redeem on `/f/:slug` now says which failure it was.** The server-side magic-link redeem discarded every reason it was given — two bare `catch {}` around the POST and its JSON parse, and a third discard where a _successful_ response carrying an explicit `errorCode` and message was collapsed into one enum member. An unreachable API, a proxy's HTML error page and a revoked token were the same 502 to the respondent and, more to the point, the same **nothing** in the log: not one line, at any level, about a request that had just failed. A tripped redemption rate limit was the same silence, and since #139 it already answers the respondent 429 — what it still lacked was the log line.

  That is the failure mode where it hurts most. `/f/:slug` is the anonymous public entry point, so a production failure arrives with no reproduction steps and no user to interview; the log is the whole diagnosis. Diagnosing one of these took a source read across two repositories to discover that core had been sending "Too many redemption attempts. Try again later." the entire time, and the door threw the sentence away unread.

  Each failure is now logged once, by the frame that still holds the context, with the slug, the endpoint that was called, the HTTP status, and whatever core actually said. Never the raw `PublicLinkToken` and never the minted session JWT — both are credentials, and a log line is durable, shipped onward and outlives the session. A test pins that, rather than trusting a reviewer to notice.

  `RedeemFailureReason` gains `redeem-unreachable` (we asked and never got a usable answer) beside `redeem-refused` (core answered and said no), so the difference survives up to the view. **Nothing a respondent sees changes**: both render the same 502 page as before, byte for byte. The one refusal a respondent can act on — a tripped rate limit — was already split out to its own 429 page by #139; these two are the ones nobody can act on, so they stay together and this fix cannot regress a respondent.

  Internally the reason list is now one exported value with the union derived from it. Three hand-maintained copies of that list lived in the error-view spec, and nothing failed when one fell out of step; adding a reason without giving it a view or a test is now a broken build and a red test. Closes #140.

- c8aba8d: The server-side redeem now tells core which respondent is asking, so core's per-IP redeem cap applies per respondent instead of once per deployment.

  `/f/:slug` redeems on the respondent's behalf: it POSTs the link's token to core's `/magic-link/redeem` from inside the MJAPI process. That POST carried `content-type` and `accept` and no client identity, and core keys that endpoint's 20-per-minute cap on `req.ip` — so every redeem in the install arrived from the same peer and shared one bucket. Measured on a branch harness: 25 different respondents opening the same form, each with their own Forms bucket, and the deployment was refused from the 16th onward, 20 requests into the window. A classroom, an office behind NAT or a conference wifi did not have to be involved; ordinary traffic across unrelated forms was enough.

  The redeem now forwards the already-resolved respondent address as a single `X-Forwarded-For` entry. Forms sets Express's `trust proxy` itself (`RequestIdentityMiddleware`), so core honours it with no change in MemberJunction, and core's magic-link redemption audit trail records the respondent instead of the loopback address. One entry, never appended to an inbound header: `proxy-addr` clamps to the left-most address, so the result is the same at every trusted hop count of 1 or more.

  **The redeem now addresses core on loopback, and that is what makes the above true.** It defaulted to `MJAPI_PUBLIC_URL + /magic-link/redeem` — the public origin, which that variable has to remain because the widget's GraphQL URL is derived from it and handed to the browser. So a call that is in fact process-local (core mounts its magic-link router on the same Express app) left the perimeter, resolved to your proxy and came back in; the proxy appended MJAPI's own egress to the `X-Forwarded-For` the door had just set, and `proxy-addr` at `trust proxy = 1` returns the **right-most** entry. Core saw one constant address for the whole deployment — the very thing this change exists to stop — in exactly the topology it targets, and only a loopback harness could show it working. The default is now `http://127.0.0.1:${GRAPHQL_PORT}/magic-link/redeem`; `FORMS_MAGICLINK_REDEEM_URL` still overrides it for a split deployment and is documented in `.env.example` for the first time.

  **Only an actual address is forwarded.** The resolved peer is a trimmed `X-Forwarded-For` entry, and this package's sanitisers (source-port stripping, IPv6 zone removal) sat behind the hashing path, which was harmless while the raw value never left the process. It leaves now, so the outbound header is filtered: a proxy-appended source port is stripped rather than handed to core as a bucket key that changes on every connection, and anything that is not an address — including a value too long for core's `NVARCHAR(64)` audit column, which would otherwise cost the redemption its audit row entirely — omits the header instead. Forms' own hashing and bucketing are unchanged.

  **Deployment note:** this is correct wherever `FORMS_TRUSTED_PROXY_HOPS` is set to the number of proxies you operate. At the default of 0 Express ignores the header and the bucket stays global — the same precondition every other Forms rate-limit ceiling already has.

  `FORMS_REDEEM_IP_MAX` defaults to 20, matching core's own redeem cap. Forms' gate fronts core's on the page route, where one `/f/:slug` open costs one core redeem: a looser number here is never reached there, because core refuses first, after Forms has already spent a DB read and an outbound POST on a request core was always going to reject. A returning respondent is the exception — the host page auto-POSTs `/f/:slug/resume` whenever a resume cookie is present, and that leg makes a second core redeem charged to its own `resume:` bucket (`RESUME_RATE_MAX = 30`) rather than to this meter, so for that respondent core's cap binds first, at half the opens this default implies. Closing that gap means charging the resume redeem to this same meter; this branch does not do it. Both redeem knobs are now documented in `.env.example`.

  **This also closes #191.** The `POST /f/:slug/resume` route never mounted the request-identity handler, so `currentRequestIdentity()` was always undefined there — which made the forwarded address empty on the resume leg AND degraded that route's rate limit to its `slug:` fallback, one shared bucket per form that one caller could exhaust for every respondent. Both symptoms had the same cause, and mounting the handler fixes both. The route now keys on the resolved peer, like the page route beside it.

- 6103dd0: Metadata seeding moves to MJ's release-time model, and the check that policed the old cadence is gone.

  The distribution gate's CHECK 1 compared `metadata/` against a checked-in hash manifest and inferred _"the shipped seed contains this record"_ from **the presence of a manifest key**. That inference is a silent pass in one direction. Remove a key and it correctly goes red; **add** one — or regenerate the manifest — without regenerating the seed and it goes **green while the record ships nowhere**. `bizapps-sales` hit exactly that: a manifest entry added in one commit, the only seed migration last touched many commits earlier, every step reporting success. Reproduced here at `dc891fd`: a new metadata directory plus `npm run seed:manifest` left the gate green while the record appeared in no migration. The script predicted its own failure, in the comment above `METADATA_IGNORED_FILES` — "teaches people that regenerating the manifest is how you make it quiet, which is precisely the habit that would let a real drift through".

  The cadence it enforced — one `Metadata_Sync` per feature PR, three of them here (`V202608081700`, `V202608182130`, `V202608241800` — the migrations that seed records declared under `metadata/`; the last of those was hand-written for want of a database, which is the same cadence by other means) — is the one MJ rules out (`MJ/metadata/CLAUDE.md` §1b and §10): PRs contribute declarative JSON only, and the build engineer generates **one consolidated sync migration per release** against a clean database. MJ itself has no manifest at all.

  So: **PRs now carry JSON only** — fields, `@lookup`/`@file`/`@parent`, a `uuidgen` `primaryKey`, no `sync` block, no hand-authored `*__Metadata_Sync.sql`. The manifest, `scripts/write-seed-manifest.mjs`, the `seed:manifest` script and CHECK 1 are removed, along with six spec cases, six mutants, and the copy of the whole `metadata/` tree the spec made into every one of its fixtures.

  What replaces the proxy is a check on the property: `npm run check:release-seed` walks every `primaryKey` UUID under `metadata/` and reports the ones that appear in no shipped `migrations/*.sql`. No database, no dependencies, and it reproduces the "what does the next seed owe" list from the repo instead of asking anyone to maintain one. It runs as **release readiness** — in `publish.yml`, before anything is published or tagged — and deliberately not on PRs, where the question has no answer. It refuses to report success if it collected no IDs at all, because "I examined nothing" and "everything is fine" were the same green last time.

  **CHECKS 2–5 are untouched.** They read the shipped SQL directly for unresolvable placeholders, a post-hardening seed re-granting the `Form Respondent` role unfiltered access, a core-metadata insert guarded on its own ID alone, and a schema sync reaching a schema this app does not own. They test properties rather than proxies, and nothing here affects them.

  No migration ships with this change. Of the three existing `Metadata_Sync` files, only `V202608081700` is in a release tag (`v0.8.0`/`v0.9.0`/`v0.10.0`) — that one is append-only history and is never rewritten. `V202608182130` and `V202608241800` are on `next` only: they have reached no host, so nothing depends on their having been applied, and they belong in the first consolidated release seed rather than shipping as per-PR deltas one last time.

  A second release-readiness check enforces that in two halves: `npm run check:seed-cadence` fails when more than one unreleased `Metadata_Sync` exists, **and** when `metadata/` has moved since the last release tag while the release ships none. That second half is the only check of the three that can see an _edited_ record — `V202608182130` ships the AI Designer prompt saying `Signature` while `metadata/` now says `Doodle`, the id is identical, and coverage is green over it. It stores nothing, so unlike the hash manifest it retires, there is nothing to regenerate to make it quiet. The first half fails when more than one unreleased `Metadata_Sync` exists — a release ships one consolidated seed, and "unreleased" is decided against git tags, not against the file being present. **It will be red on the first release after this merges**, naming those two files, until they are folded in. That is the check doing its job. The coverage check cannot see this: a per-PR delta satisfies "is this ID in a shipped migration?" perfectly while being exactly the cadence this change abolishes.

- d0a1bb8: **A sealed response tells its status to nobody but its owner.** `checkDuplicate` recognises an idempotent repeat of a final submit by resolving the caller's `responseId` through `findResponseById` — id, form version, and the `SourceMetadata.clientResponseId` proof — and, when the row it finds is terminal, answers `success: true` with that row's own `Status`. It asked nothing about who owned the row. So a caller holding a response id they did not own learned whether that response was `Complete` or `Disqualified`: not a liveness bit, but the difference between "this person submitted" and "this person was screened out". `Complete` and `Disqualified` even returned different copy, through different code paths.

  This is the residue of the takeover PR #94 closed, and it survived that PR for a structural reason: #94 put the ownership gate at the write seam and at the two loads that can return before a write, and `checkDuplicate` is neither. It runs earlier, in the pipeline, and is genuinely read-only — it returns without touching the row, so the write-seam gate never sees it.

  **The id is a capability, not an identity.** That is the rule the fix states outright. A client-minted `responseId` is 122 bits of randomness that proves possession, and possession is authority only over a row that has no owner — the genuinely headerless flow, where it is the only capability there is. A row whose `AnonymousSessionID` is set belongs to that session, and holding its id is not grounds for being told anything about it, up to and including whether it is finished.

  **Asked, not restated.** The rule already existed as `sessionMayAdopt` in `persistence.service`, one function behind the refusal every write passes through. It is now exported as `responseIsOurs` and the pipeline's dedupe asks it. The alternative — a session predicate bolted onto `findResponseById`'s SQL — would have been a second spelling of the same rule, in a different language, needing to stay in agreement with the fold the write side applies: exactly the split-brain that made the original gate opt-in. The lookups stay what PR #94 made them, candidate-proposers that decide nothing.

  **And it still refuses in exactly one place.** When the row is not the caller's, `checkDuplicate` does not refuse — it declines to recognise the submission as a repeat and falls through. Persistence then adopts the named id as the primary key, the insert collides with the row already sitting there, and the one ownership gate refuses it with the one message every ownership failure gets. A foreign sealed row and a foreign unsealed row now answer identically, because they take the same path; before, one was refused at the write and the other short-circuited to success, so a single probe told the caller which it was holding.

  **What the owner is entitled to is unchanged**, and this is the half a security fix can quietly break. A re-fired final submit still returns the original response id rather than writing a second terminal row — by id when the row has no owner or the caller is it, and by session when the widget re-`load()`s and arrives with a fresh `clientResponseId` (it mints one per `load()`). A respondent screened out on their first attempt is still told they were screened out on their retry, never that their response was recorded.

  **Two bounds, stated rather than discovered.** Both are recorded in the code as well as here.

  A re-fire that presents an **owned** row's id under a blank or different session used to be answered and is now refused. Issue #100 asked that "same client, same id, session blank or changed" keep short-circuiting, and it does for a row with no owner — but when the row has one, that request is the same one issue #78 established must be refused, and the two asks cannot both be honoured, because answering it _is_ the disclosure. The read now agrees with the write instead of contradicting it; that caller was already refused on every partial save and every write. No real widget reaches it: the session is minted per service instance and the client id per `load()`, so an id only ever travels with the session that created it.

  And a caller naming an id that belongs to **nobody** is still answered `success` — a row is created at that id and it is theirs — so "this id is taken by someone else" stays distinguishable from "this id is free". That is structural: the client mints the primary key, and an endpoint that lets a caller create a row at an id of their choosing cannot also hide whether that id is in use. It is unchanged by this fix (a foreign _unsealed_ row has answered that way since PR #94) and empty within these issues' own threat model, which assumes the caller has already observed the id in traffic. What is closed is everything _about the response_.

  `findResponseById`'s docstring also ended "Fail-open on a query error" while its only caller has always failed closed. The behaviour was right; the sentence is now too.

  **Two things the first live run of the smoke turned up**, neither of them in the shipped code. `session-ownership-path.mjs` asserts refusals — every security check in it is shaped `success === false` — and MJ's per-session rate limiter hashes a blank session to one bucket shared by every headerless caller, of which this script is necessarily four per run (the absent-header probe, the blank one, and the two headerless saves; HTTP strips a header value's surrounding whitespace, so blank and absent are the same request on the wire). A second run inside the same minute therefore exhausted the bucket and printed `ok REFUSED: attacker omits x-session-id` — the ownership gate credited for a refusal the limiter issued, on the very route issue #78 was reported on — while the message comparisons failed as though the status oracle were back. A limiter refusal now aborts the run with the wait and the reason instead of reaching an assertion. And the spec gains the case the new describe block was missing: a foreign sealed row probed with the header ABSENT rather than merely wrong. It is the route #78 actually arrived on, and a `responseIsOurs` that treated a blank CALLER the way it treats a blank OWNER — one `||`, and a plausible reading of "blank means unowned" — passed all 23 other tests in that file.

  No schema change, no migration, no new config, and no client change.

- 1b9cda6: **A response that has an owner keeps it.** `SubmitFormResponse` accepts a client-minted `responseId`, and which lookup resolved it was up to the caller. Sending `x-session-id` went through `findOwnedResponseById`, which filters on `AnonymousSessionID` and correctly refuses another session's row. Omitting the header went through `findAdoptableResponseById`, which had no session predicate at all — its docstring said so plainly ("ownership is proven by the id itself"). So the session gate was not a gate: it was opt-in, and a caller opted out by dropping a header. A `Partial` row belonging to someone else could be adopted, sealed `Complete`, have its `AnonymousSessionID` blanked, and have its answers replaced with the caller's.

  **The second route had no lookup in it at all**, which is why a check in front of the lookups could never have closed this. A caller presenting a _different_ session id matches neither lookup, falls through to CREATE — and persistence adopts the supplied client id as the primary key, so the insert collides with the row already sitting at it and the duplicate-key recovery picks that row up and writes to it, having performed no ownership check of its own. The header was therefore not a gate in either direction: omitting it worked, and forging it worked.

  **One gate, at the seam every write already passes through.** `applyResponseIdentity` is the only place `AnonymousSessionID` is written, and CREATE, UPDATE/PROMOTE and duplicate-key recovery all call it. A row whose stored `AnonymousSessionID` is non-empty may now only be written by that session; every other case is refused. A lookup added later inherits the check by construction rather than by remembering to repeat it, and the lookups go back to doing what they are good at — proposing a candidate row, not deciding who owns it.

  **Ownership is write-once.** An adopting write no longer assigns the caller's session over an owner it did not set. That assignment is what blanked `AnonymousSessionID` on the way past and turned a takeover into a permanent one: the row stopped recording the respondent who started it, so they could never resume it even after the fact.

  **The refusal tells the caller nothing they did not arrive with.** One message for every ownership failure — absent header, blank header, a different session, a session that owns some other response — so a refusal cannot be used to tell those cases apart, and it names neither the owner nor the fact that there is one. The write is refused rather than silently discarded, so the caller is no longer answered `success: true` for a submission that was not recorded. Each refusal logs the response id and form version for the operator, and neither session id.

  Ownership is settled the moment a pre-existing row is loaded, before the branch that short-circuits an already-sealed response to an idempotent no-op. That branch returns the row's id and status without writing anything, which is the right answer for the respondent who owns it and a status oracle for anybody else — so a decision about a read cannot wait for the write seam.

  `AnonymousSessionID` is also stored in the same normalized form the check reads it back in. Storing the raw header let the column hold a value that did not mean what it looked like: `x-session-id: '   '` stored three spaces, which reads back as "no owner" — a row that appears owned, is not, and is adoptable by anyone holding its id.

  Comparison is trimmed and case-folded, to agree with the SQL predicate it backs up: `AnonymousSessionID='…'` runs under SQL Server's case-insensitive default collation, so a stricter comparison here would have refused writes the lookup had just approved.

  **Nothing a real client does changes.** The widget mints its session id per instance and its client response id per form load, so a given response id is only ever presented alongside the session that created it. The genuinely headerless flow — where the row has no owner and the 122-bit client id in `SourceMetadata` is the only capability there is — keeps working exactly as before. No schema change, no migration, no new config, and no client change.

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

- a86755b: The `<mj-form>` widget bundle is served compressed, and its sourcemap is withheld on a host that declares itself production.

  Every first-time respondent downloaded the full 1.2 MB bundle with no `Content-Encoding`, even though MJAPI has had `compression()` mounted the whole time — the route was simply registered ahead of it. `WidgetBundleMiddleware` now contributes both routes from `GetPreAuthMiddleware()`, the slot the base class documents as running "after compression but before OAuth/REST/GraphQL routes", so MJ's own negotiation, threshold and level apply. Measured on a real host: 1,265,968 bytes → 348,785 gzip / 352,926 brotli (~28%), `Vary: Accept-Encoding` emitted, ETag preserved and `If-None-Match` still answering 304. The 8.5 MB sourcemap is now gated on `NODE_ENV`, overridable in either direction with `FORMS_WIDGET_SOURCEMAP_ENABLED`; when withheld the route stays registered and answers 404 with the reason in the body, never the 401 an unserved path falls through to. A host that sets neither variable still serves the map — that is the documented local-dev path — but now says so once at boot instead of doing it silently. Closes #121.

- Updated dependencies [29789ba]
- Updated dependencies [925087e]
- Updated dependencies [7204b2c]
- Updated dependencies [c606624]
- Updated dependencies [7293c62]
- Updated dependencies [0895960]
- Updated dependencies [2334704]
- Updated dependencies [ff19377]
- Updated dependencies [ea001c3]
- Updated dependencies [3599074]
- Updated dependencies [8b6c83a]
- Updated dependencies [11a838e]
- Updated dependencies [74a1888]
- Updated dependencies [4831864]
- Updated dependencies [9eb264b]
- Updated dependencies [1bc7aa3]
- Updated dependencies [5935085]
- Updated dependencies [ec7db93]
- Updated dependencies [edb79fd]
- Updated dependencies [3a4b449]
- Updated dependencies [fba3807]
- Updated dependencies [88143e7]
- Updated dependencies [d117a59]
- Updated dependencies [6331f88]
- Updated dependencies [d57cd04]
- Updated dependencies [89ca16f]
- Updated dependencies [89f4c0a]
- Updated dependencies [3fa29bf]
- Updated dependencies [2890a6a]
- Updated dependencies [396d4b5]
- Updated dependencies [1b0f56a]
- Updated dependencies [45d586d]
- Updated dependencies [511aaf7]
- Updated dependencies [816fbca]
- Updated dependencies [adb6b33]
- Updated dependencies [e68762c]
- Updated dependencies [126662f]
- Updated dependencies [47258af]
- Updated dependencies [a064da2]
- Updated dependencies [d2810cd]
- Updated dependencies [d973d74]
- Updated dependencies [a059481]
- Updated dependencies [30f73d3]
- Updated dependencies [3e67383]
- Updated dependencies [04692ce]
- Updated dependencies [48c0f45]
- Updated dependencies [08dacd6]
- Updated dependencies [64b6385]
- Updated dependencies [8299fed]
- Updated dependencies [a8e8a1d]
- Updated dependencies [75906b8]
- Updated dependencies [d0ac9e2]
- Updated dependencies [42819f3]
- Updated dependencies [912164c]
- Updated dependencies [3de26d8]
- Updated dependencies [52f1c63]
- Updated dependencies [5b48fe0]
  - @mj-biz-apps/forms-core-entities-server@0.11.0
  - @mj-biz-apps/forms-entities@0.11.0
  - @mj-biz-apps/forms-ng@0.11.0
  - @mj-biz-apps/forms-actions@0.11.0

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
  - @mj-biz-apps/forms-core-entities-server@0.10.0
  - @mj-biz-apps/forms-entities@0.10.0
  - @mj-biz-apps/forms-actions@0.10.0
  - @mj-biz-apps/forms-ng@0.10.0

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
  - @mj-biz-apps/forms-core-entities-server@0.9.0
  - @mj-biz-apps/forms-entities@0.9.0
  - @mj-biz-apps/forms-actions@0.9.0
  - @mj-biz-apps/forms-ng@0.9.0

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
  - @mj-biz-apps/forms-actions@0.8.0
  - @mj-biz-apps/forms-ng@0.8.0
  - @mj-biz-apps/forms-core-entities-server@0.8.0

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
  - @mj-biz-apps/forms-actions@0.7.0
  - @mj-biz-apps/forms-ng@0.7.0
  - @mj-biz-apps/forms-core-entities-server@0.7.0

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
