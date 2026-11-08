# Smoke-test findings fix plan (2026-10-26)

Source: `SMOKE_TEST_2026-10-26.md` (findings F1, F3–F14). Branch: `fix/smoke-2026-10-26-findings`
in the worktree `.claude/worktrees/fix+smoke-2026-10-26-findings`, cut from `origin/next` @
`cfb5e7f`. One branch, one PR into `next`. Every task below was reproduced and its design agreed
with Soham on 2026-10-26; nothing starts until he says "go".

## Execution protocol (read first)

**Method: `superpowers:subagent-driven-development`.** The coordinator (the session Soham is
talking to) dispatches one fresh implementer subagent per task, then a task review subagent
(spec compliance + code quality), and a whole-branch review at the end. The implementer gets the
task's section below verbatim plus the conventions here — never the session history.

**Serial, not parallel.** All tasks share one worktree, one `dist/`, one dev database and one
`:4131` harness. Two implementers building at once collide on turbo output and on fixtures, so
tasks run one at a time, in this order (highest impact first, shared files grouped):
F9 (Task 8) → F1 (Task 1) → F4 (Task 3) → F5 (Task 4) → F6 (Task 5) → F12 (Task 11) →
F13 (Task 12) → F14 (Task 13) → F7 (Task 6) → F8 (Task 7) → F10 (Task 9) → F11 (Task 10) →
Task 14 (whole branch). Task 2 (F3) is already applied on the dev DB.

**Per task, the implementer must:**
1. Write the failing test(s) first (`superpowers:test-driven-development`), run them red, then
   implement, then green. `vitest` here does not typecheck — run `pnpm run typecheck` too.
2. Build the touched package(s) (`cd packages/<Pkg> && pnpm run build`) and run that package's
   `pnpm test`. For `forms-ng` widget changes also `pnpm run build:widget`.
3. Run the task's **Smoke test** exactly as written and paste the evidence (log lines, SQL rows,
   network entries) into the task's **Verification** line. "Done" without evidence is not done.
4. Leave no debug code, no stale comment, no `any`, no `.Get()/.Set()`, no hand edit under
   `generated/`. Follow `.claude/rules/*.md` and the design principles (deep modules, no swallowed
   errors, comments carry the why).
5. **No commits.** Soham commits. Report the changed file list instead.

**Conventions the implementer needs:**
- **Harness on its own port** (`docs/local-host.md` §"Running the API harness"): once,
  `ln -s ../../.env apps/MJAPI/.env` (gitignored). Then from `apps/MJAPI`:
  `GRAPHQL_PORT=4131 MJAPI_PUBLIC_URL=http://localhost:4131 node server.mjs > <log> 2>&1 &`
  (`GRAPHQL_PORT`, not `PORT` — core binds `GRAPHQL_PORT`, default 4000, which is MJ's own host;
  both variables are read at import time). The widget bundle it serves is resolved from THIS
  worktree's build, so every widget smoke runs on `http://localhost:4131/f/<slug>`. Kill it by
  PID, never by process name. `:4000`/`:4201` are MJ's host serving the MAIN checkout — never
  restart them.
- **Explorer-hosted checks (Tasks 9, 10, 11's detail view):** Explorer builds `forms-ng` from the
  MAIN checkout, so this worktree's Angular changes are not visible there. The implementer's gate
  is the unit/wiring spec; the Explorer walk-through is written as steps for Soham, who runs it
  after staging the dist (coordinator asks him when the task reaches that point). Never fabricate
  an Explorer result.
- **SQL helper:** write this once to the scratchpad as `sql.mjs` and run
  `node sql.mjs "<sql>"` (or `DBN=MJ_Smoke_1026 node sql.mjs …` to target the sandbox):
  ```js
  import sql from '/Users/sohamdesai/Projects/mj-dev/node_modules/.pnpm/mssql@12.7.0/node_modules/mssql/index.js';
  import fs from 'fs';
  const env = Object.fromEntries(fs.readFileSync('<worktree>/.env','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i), l.slice(i+1).replace(/^'|'$/g,'')]}));
  const pool = await sql.connect({server:env.DB_HOST, port:+env.DB_PORT, database: process.env.DBN || env.DB_DATABASE, user:env.DB_USERNAME, password:env.DB_PASSWORD, options:{trustServerCertificate:true, encrypt:false}});
  try { const r = await pool.request().query(process.argv[2]); for (const rs of r.recordsets) console.table(rs); } finally { await pool.close(); }
  ```
  Dev DB `MJ_ATS_Dev` is Soham's own (writes are fine; say what was written). Integration specs
  run ONLY against `DB_DATABASE=MJ_Smoke_1026` (RCSI is ON there; leave it ON).
- **Browser:** Playwright MCP tools (one shared browser). Offline = `browser_run_code_unsafe`
  with `await page.context().setOffline(true)` (and `false` to restore). File upload: create
  `.playwright-mcp/smoke-upload.txt` in the worktree root (the directory is gitignored; the MCP
  accepts only files inside the repo) and pass that path to `browser_file_upload`.
- **Staff operations without a browser:** `smoke/lib/operations.mjs` `republishForm(base, formId)`
  runs `Forms.PublishForm` as the system user through `x-mj-api-key` (`MJ_API_KEY` from `.env`);
  `requireOperation(base, { systemKey }, '<Forms.Op>', input)` runs any other Remote Operation.
- vitest: resolve it by path (`node -p "require.resolve('vitest/vitest.mjs')"`), the `.bin` shim
  fails here. Smoke scripts need `node --env-file=.env`.
- Changeset: ONE file for this PR, written in Task 14 (no task writes its own), level **`minor`**
  (Task 12 ships a migration and Task 13 ships metadata; the fixed group makes the level
  release-wide — the changesets already on `next` are `minor` too), listing every package touched
  by full name: `@mj-biz-apps/forms-core-entities-server`, `@mj-biz-apps/forms-entities`,
  `@mj-biz-apps/forms-ng`, `@mj-biz-apps/forms-actions`, `@mj-biz-apps/forms-server`. Prose per
  `.claude/rules/changesets.md`.
- Migration (Task 12): `migrations/V<YYYYMMDDHHMM>__v0.16.x__<Description>.sql` (the unreleased
  band is `v0.16.x`: packages are 0.15.1 and this release is a minor), stamp later than
  `V202610222300`; `${flyway:defaultSchema}` / `${mjSchema}` only; `npm run lint:distribution`
  must pass. Metadata (Task 13): JSON only, `uuidgen` ids, no `sync` block, no `Metadata_Sync` SQL.
- New dependencies: none. Tasks 9 and 10 are designed on what `forms-ng` already has
  (`@angular/common`'s `Location`; the package's own quiet-button idiom). Do not add
  `@angular/router` or `@memberjunction/ng-ui-components`.

**Rulings:** the coordinator decides ambiguities and records them in its ledger; it stops only for
destructive or outward-facing actions (push, PR open, DB drop) and asks Soham.

**Out of scope (observed, not fixed here):** orphaned `__mj.File` rows from superseded uploads;
the `:4121` harness running other apps' scheduled jobs; the launcher's raw `__mj_BizAppsForms`
app (#212 territory); noisy `PK_FormResponse` log on the ownership smoke; the release seed
(generated by the releasing developer).

---

## Task 1 — F1: say at boot when `READ_COMMITTED_SNAPSHOT` is off

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** four integration specs in parallel on `MJ_Smoke_1026`: RCSI off → 7 deadlock
errors / 3 failed specs; RCSI on → 0 / 0. Deadlock graphs: two authoring transactions, each
holding X key locks on its own new `FormPage` / `Form` rows, each reading `vwFormPages` (or the
clone's `COUNT(*) FROM Form WHERE Name = …`, which scans — `Name` has no index) through the other's
uncommitted rows.

**Root cause:** RCSI is a host requirement since #303 and nothing enforces or announces it. The
docs name only "share link vs archive"; the real exposure is any two concurrent authoring
transactions. `MJ_ATS_Dev` has it off.

**Design (agreed):**
1. New pure function in the EXISTING boot-readiness module
   `packages/Server/src/respondent-host/host-readiness.ts` (one home for every "ask at boot"
   check, so the next one is found beside these):
   `assessDatabaseReadiness(input: { dialect: 'sqlserver' | 'postgres'; readCommittedSnapshotOn: boolean | null })`
   returns `string[]` of reasons. Postgres → `[]` (always MVCC). SQL Server with `false` → one
   sentence that names the symptom (concurrent publish / clone / structural saves deadlock; the
   author sees "Could not read the form's pages; nothing was published"), the fix
   (`ALTER DATABASE [<db>] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;`), and the
   opt-in flag. `null` (the probe failed) → a reason saying the state is unknown and why.
2. `RespondentHostMiddleware` boot: after `reportAutomationReadiness()`, a new
   `reportDatabaseReadiness()` probes once on SQL Server
   (`SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()` through the
   provider's `ExecuteSQL`, catch → `null` with the error logged, never swallowed), logs each
   reason with `LogError` under the `[Forms]` prefix. Dialect detection: `automation/outbox/claim.ts` has a private
   `isPostgres(provider)` (`provider.PlatformKey === 'postgresql'`); move it into the EXISTING
   `CoreEntitiesServer/src/shared/database-provider.ts` as an export and import it from both.
3. Opt-in refuse: env `FORMS_REQUIRE_READ_COMMITTED_SNAPSHOT=true` throws at boot when a reason
   exists, mirroring `FORMS_REQUIRE_SESSION_HASH_SALT` in `CoreEntitiesServer/src/shared/hash-salt.ts`.
   Default off → no upgrade breaks.
4. Docs: `docs/local-host.md` §5 and `docs/install.md` widen
   the RCSI paragraph to "any two concurrent authoring transactions"; `docs/database-operations.md`
   integration-spec section says the sandbox needs RCSI on and why the specs are deliberately
   run in parallel (they double as a concurrency check).

**Not doing:** lock hints, NOLOCK, an index on `Form.Name`, a migration that sets RCSI (needs
exclusive DB access; stays a host step).

**Tests (red first):**
- `host-readiness.spec.ts` (extend): postgres → `[]`; sqlserver/true → `[]`; sqlserver/false → one
  reason containing `READ_COMMITTED_SNAPSHOT` and the `ALTER DATABASE`; sqlserver/null → the
  unknown-state reason; require flag + reason → throws naming the flag.
- Boot spec, same pattern as `__tests__/automation-readiness-boot.spec.ts`: the probe runs once
  on SQL Server, not on Postgres; a probe error is logged, not swallowed.

**Smoke test (agent runs, records output):**
1. `ALTER DATABASE [MJ_Smoke_1026] SET READ_COMMITTED_SNAPSHOT OFF WITH ROLLBACK IMMEDIATE`; boot
   the harness on `:4131` with `DB_DATABASE=MJ_Smoke_1026` added to the environment; grep the log
   for `READ_COMMITTED_SNAPSHOT` → one ERROR line.
2. Same with `FORMS_REQUIRE_READ_COMMITTED_SNAPSHOT=true` → boot refuses, message names the flag.
3. `… SET READ_COMMITTED_SNAPSHOT ON …`; boot → no such line.
4. Leave the sandbox with RCSI ON. Run the four integration specs in parallel
   (`docs/database-operations.md` command, `DB_DATABASE=MJ_Smoke_1026`) → 0 `deadlocked`; only the
   2 reporting failures that wait on the release seed remain.

---

## Task 2 — F3: runner lacks Update on Form Response Answers (shared dev DB only)

**Status:** env only, no code · **Verification:** grant re-applied on MJ_ATS_Dev 2026-10-26 (CanRead 1 / CanUpdate 1 / CanCreate 0 / CanDelete 0 read back); boot-log check still to run at the end with the other smokes

**Reproduced:** `__mj.EntityPermission` for role `Forms Automation Runner` × entity
`MJ_BizApps_Forms: Form Response Answers` has `CanUpdate = 0`, `__mj_UpdatedAt` 2026-08-25.
`V202608201200` granted it on 2026-08-20 (flyway history, success); the pre-#264
`seed-binding-smoke` revoked it on the 25th; no later migration touches the row.

**Root cause:** test-tool drift on `MJ_ATS_Dev`, not a product defect. The boot report (#239)
already names it at every start, and `metadata/entity-permissions` ships `CanUpdate: true`, so a
release `Metadata_Sync` restores it on any host.

**Design:** nothing in the PR. Operator step on `MJ_ATS_Dev` (Soham's OK required, shared DB):
re-run the `UPDATE` from `V202608201200__v0.11.x__Automation_Runner_Answer_Score_Update.sql`.

**Smoke test:** boot the harness (`apps/MJAPI`) against `MJ_ATS_Dev`; the startup log has no
`lacks Update on 'MJ_BizApps_Forms: Form Response Answers'` line.

---

## Task 3 — F4: autosave after a file upload or doodle commits

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** browser (smoke run, page 4 of `all-types-smoke`): upload + doodle → only
`POST /forms/upload`, no `Forms.SaveResponse`; reload lost both. Code: the only autosave entry is
`mj-form.component.ts` `onProgress()` → `autosave.ping()`, reached through the view's
`valueChange` → `progressChange`. `FormUploadStore.succeed()` → `commit()` →
`sink.setValue()` writes the runtime directly (by design, #248/#333) and nothing pings.

**Root cause:** the store-committed path has no progress signal. Not a store defect — the store
correctly owns the commit — the wiring in `mj-form.component.ts` hands it a sink that only writes.

**Design (agreed):**
1. New pure helper in `packages/Angular/src/lib/widget/core/` (e.g. `progress-reporting-sink.ts`):
   `progressReportingSink(runtime: UploadAnswerSink, onProgress: () => void): UploadAnswerSink`
   — `setValue` writes to `runtime` then calls `onProgress`. Document WHY in its header: file
   answers bypass the view on purpose, so progress must be reported at the commit, and this is the
   one place every file-answer write (succeed AND clear) passes through.
2. `mj-form.component.ts` connect site: `this.uploads.connect(progressReportingSink(runtime, () => this.onProgress()))`;
   update the comment beside it. `onProgress` already no-ops on a null controller (preview) and
   while a knockout is in flight, and clears a stale submit refusal.
3. No change to `FormUploadStore`, `UploadAnswerSink`, `succeed`, the doodle sink, or the
   autosave controller.

**Not doing:** orphaned `__mj.File` rows left by superseded uploads (pre-existing; backlog).

**Tests (red first):**
- `progress-reporting-sink.spec.ts`: setValue writes the runtime and calls `onProgress` once;
  a null value (clear) also calls it.
- `upload-store` wiring spec (node env, no `inject()`): store connected through the helper;
  `succeed(token, fileId)` → runtime holds fileId AND `onProgress` called once; `clear` →
  called again; a superseded token → runtime untouched, `onProgress` not called.
- Existing `upload-store.spec.ts`, `upload-in-flight-submit.spec.ts`,
  `next-waits-for-uploads.wiring.spec.ts`, `autosave-controller.spec.ts` stay green.

**Smoke test (agent runs, records output):** rebuild `forms-ng` + widget (`pnpm run build:widget`),
boot the harness on `:4131`, open `http://localhost:4131/f/all-types-smoke`, go to the page with
File upload + Doodle:
1. Upload `.playwright-mcp/smoke-upload.txt` (create it first), touch nothing else → within ~3 s one `Forms.SaveResponse` whose answers carry
   the FileUpload value; footer shows "Progress saved".
2. Draw a doodle, touch nothing else → same.
3. Reload → both restored.
4. DB: the `Partial` FormResponse has `FileUpload` and `Doodle` answers in `FormResponseAnswer`.

---

## Task 4 — F5: show the autosave error state and retry when the network returns

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** browser (smoke run): offline → status line blank at +3 s and +25 s; warning
only after ~80 s; online again → no request for 20 s. Code: `packages/Angular/src/lib/widget/mj-form.component.html` ~line 226
switches on `autosaveStatus()` with `saving` / `saved` only; `AutosaveController.runSave` sets
`'error'`; `scheduleRetry` stops at `RETRY_DELAYS_MS.length` and calls `onRetriesSpent`; no
`online` listener exists in `packages/Angular/src/lib/widget`.

**Root cause:** the `'error'` status is unrendered, and recovery depends on the respondent's next
edit, while the notice promises a retry.

**Design (agreed):**
1. Template: add `@case ('error')` → `<p class="mjf-autosave" aria-live="polite"><mjf-icon name="cloud-arrow-up" /> Couldn't save yet — will retry</p>`
   (pick the existing warning icon if one fits better; token colours only).
2. `AutosaveController`: new `public resume(): void` — no-op unless `settledStatus === 'error'`
   (or a backoff timer is pending); otherwise `clearTimer()`, `failedAttempts = 0`, `flush()`.
   Document in the class header that `resume` is the host's "the road reopened" signal and that
   a failing flush re-enters the capped backoff.
3. `mj-form.component.ts`: register `window.addEventListener('online', …)` once (guard
   `typeof window !== 'undefined'`), call `this.autosave?.resume()`; remove it in `ngOnDestroy`.
4. The retries-spent notice text stays; it is now true. It already clears on the next
   acknowledged save (`saveNotice.set(false)` in `savePartial`).

**Not doing:** `visibilitychange`, polling, a longer backoff.

**Tests (red first):**
- `autosave-controller.spec.ts`: after one failure `resume()` flushes immediately and resets the
  backoff; after the cap is spent `resume()` flushes and a success clears the error; `resume()`
  on `saved`/`idle` sends nothing; `resume()` after `dispose()` is a no-op.
- A form-level wiring spec (follow `autosave-refusal.spec.ts`'s style): the `online` listener is
  added on load and removed on destroy.

**Smoke test:** `http://localhost:4131/f/all-types-smoke` (worktree harness), page 2: go offline
(`browser_run_code_unsafe`: `await page.context().setOffline(true)`), answer a question → footer shows "Couldn't save yet — will retry"
within ~3 s. Go online, touch nothing → one `Forms.SaveResponse` within ~1 s, footer "Progress
saved", DB `Partial` row has the answer.

---

## Task 5 — F6: a network failure is one fixed sentence, not the browser's text

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** browser: offline Submit → `role="alert"` reads "Failed to fetch". Code:
`forms-api.graphql.service.ts` ~line 190 calls `fetch()` bare, so a network failure escapes as the
browser's `TypeError` (Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError when
attempting to fetch resource."); `mj-form.component.ts` submit catch shows `err.message`, which is
right for the typed refusals and wrong for this one.

**Design (agreed):** fix at the transport.
1. `forms-api.interface.ts`: `export class FormsApiUnreachableError extends Error { constructor(public readonly reason: string) }`
   with `message` = `API_UNREACHABLE_MESSAGE` = "You appear to be offline. Your answers are still
   here — try again when you're connected." (`name = 'FormsApiUnreachableError'`). Same shape as
   `ResponseNotSavedError`, so `failureDetail` logs the cause.
2. `forms-api.graphql.service.ts`: wrap the `fetch()` call; on rejection throw
   `new FormsApiUnreachableError(failureDetail(err))`. Nothing else changes: the submit banner,
   the autosave console warning and the load error page all read `message`/`reason` as today.

**Not doing:** mapping HTTP 5xx text (a separate decision), changing the banner code.

**Tests (red first):** `forms-api.graphql.service` spec: `fetch` rejects with
`TypeError('Failed to fetch')` → `saveResponse` rejects with `FormsApiUnreachableError`, `message`
is the fixed sentence, `reason` contains "Failed to fetch"; a 200 with a GraphQL refusal still
throws `ResponseNotSavedError` (unchanged).

**Smoke test:** on `:4131`, offline on the last page → Submit → alert shows the fixed sentence, no thank-you,
answers kept, Submit still enabled; online → Submit → "Thanks — all types submitted."

---

## Task 6 — F7: least-privilege credential smoke fixture needs Read on Forms

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** `apps/MJAPI/least-privilege-credential-smoke.mjs` from the worktree: 14 checks
pass, then "the author can publish a link in the first place" throws
`create failed: This link cannot be opened: its form could not be read, so whether the form is
archived is unknown.`

**Root cause:** #303's `FormDistributionEntityServer.openOnArchivedFormRefusal` reads the Form AS
THE WRITER (fail closed, on purpose: a form the writer cannot see answers as not existing). The
fixture's role (`Repro 114: Form Author`, role insert ~line 101, grant insert ~line 107) holds one grant — full rights on
`MJ_BizApps_Forms: Form Distributions` — and nothing on `MJ_BizApps_Forms: Forms`. No real author
can share a form they cannot read, so the product is right and the fixture is stale.

**Design (agreed):** add a second `EntityPermission` row to `seed()` for the same role:
`MJ_BizApps_Forms: Forms` with `CanRead = 1` only (`CanCreate/Update/Delete = 0`), its own fixed
UUID in `IDS` and its own `DELETE` in `cleanup` (the `WHERE RoleID` delete already covers it; the
explicit line keeps the two grants symmetrical). Update the file header (line ~16) so it states the
two grants and why the Read exists (#303's archived-form gate).

**Not doing:** widening the gate to read as System (it would reveal archived-ness of forms the
writer cannot see).

**Tests:** the smoke itself is the test. **Smoke test:** `pnpm run smoke:credentials:least-privilege`
→ every check ok, exit 0; `__mj.EntityPermission` has no rows for the repro role afterwards.

---

## Task 7 — F8: smoke suites name the redeem rate limit instead of "no anonymous session token"

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** back-to-back runs: `upload-provenance-path` / `file-links-path` fail with
"no anonymous session token"; the host answered `/f/:slug` with 429 ("Too many attempts from this
network. Please try again in about N seconds.", `Retry-After: N`, `error-view.ts` `rateLimitedView`).
TEN scripts inline `html.match(/data-token="([^"]+)"/)` and throw their own wording.

**Root cause:** no shared helper reads the host page, so none of them looks at the status before
looking for the token.

**Design (agreed):** one helper in `smoke/lib/` (e.g. `host-page.mjs`):
`export async function redeemHostPage(base, slug)` → `{ token, html }`. It fetches `/f/<slug>`;
on `429` it throws `redeem was rate-limited (HTTP 429), retry after <Retry-After> s`; on any other
non-200 it throws with the status and the page's first `<p>` text; on 200 without a token it
throws "the host page carried no anonymous session token". Replace all ten inline copies
(`automation-semantics-path`, `binding-path`, `device-resume-path`, `file-links-path`,
`respondent-errors-path`, `respondent-path` (twice), `respondent-scope-path`, `resume-arc-path`,
`session-ownership-path`, `upload-provenance-path`) with the helper; `apps/MJAPI/credential-lifecycle-smoke.mjs`
only asserts the attribute exists and stays as is. Keep each script's own follow-on checks
unchanged. (`packages/Server/src/respondent-host/host-page.ts` is an unrelated server file.)

**Tests:** `smoke/lib/host-page.spec.mjs` (same style as `operations.spec.mjs`): 429 with
`Retry-After` → the rate-limited message with the seconds; 200 with a token → `{ token }`; 200
without → the no-token message. The `smoke/lib/*.spec.mjs` files run ONLY as named steps in
`.github/workflows/build.yml` (~line 329–345): add a `Smoke host-page tests` step there and
update the pinned comment in `scripts/check-paths-touched.spec.mjs` (~line 112) that lists them.

**Smoke test:** run `smoke:provenance` and `smoke:file-links` back to back; if the second hits the
limit the failure line says "rate-limited (HTTP 429), retry after N s"; rerun after N s → ok.

---

## Task 8 — F9: the publish gate judges rules in display order (HIGH)

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** `brokenRuleLines` from the worktree's built `forms-entities` on the four questions
of form `3046C6BD…` ("Smoke 2026-10-26 release check"): display order → `[]`; SQL GUID order
(Email, People, NPS, Attending) → the refusal "Show "How likely to recommend?" when Attending?
equals Option 1 — references a question that is answered later…". Script: scratchpad
`order-proof.mjs` (copy next to `packages/CoreEntitiesServer` to resolve the import).

**Root cause:** `FormPublishingEngine.readDraft` reads pages/questions/options with no `OrderBy`;
`assembleTree` (~line 417) groups without sorting; `ruleInventoryFormOf`
(`packages/Entities/src/contracts/rules-inventory.ts`) takes array order as reading order — right
for the builder's tree, wrong for the server's. `packages/Entities/src/contracts/snapshot-builder.ts` sorts (lines ~105, ~206) so
the published definition is correct once past the gate. `form-clone.ts` reads the same rows WITH
`OrderBy: 'DisplayOrder'`. `AuthoredFormTree` (`contracts/authored-form.ts`) never states an order.

**Design (agreed):**
1. `FormPublishingEngine.ts`: one comparator `byDisplayOrderThenId(a, b)` (DisplayOrder asc, then
   lower-cased ID) — lift the inline one out of `placePagelessQuestions` and reuse it.
   `assembleTree` sorts `pages`, each page's `questions`, and each question's `options` with it.
   Comment on `readDraft`'s reads: order is settled in memory because SQL cannot promise a tie order.
2. `contracts/authored-form.ts`: on `AuthoredFormTree`, document the invariant: `pages`,
   `questions` and `options` are in display order (`DisplayOrder`, ties by id); every producer
   (builder load, publish `readDraft`) owes it; readers (`ruleInventoryFormOf`, the snapshot
   builder) may rely on it.
3. No sort added to `ruleInventoryFormOf`; the snapshot builder's sort stays (it canonicalises
   gaps). No `OrderBy` added to the reads (one ordering decision, in `assembleTree`).

**Tests (red first):**
- `FormPublishingEngine.spec.ts` (fake provider): rows returned in reversed and in GUID order,
  a same-page "show when" rule reading an EARLIER question → publish succeeds (no
  `FormPublishError`), and the definition's page/question/option order equals display order.
  Add a two-page case with a page-level rule, pages returned reversed.
- NEW `FormPublishingEngine.integration.spec.ts` (opt-in SQL, same gate and sandbox as the
  other `*.integration.spec.ts`): a draft whose GUIDs sort against display order publishes.

**Smoke test (no Explorer needed):** on the `:4131` harness, SQL: set the NPS question's
`ConditionalRule` on form `3046C6BD…` back to the Attending? rule (the value is in
`SMOKE_TEST_2026-10-26.md` F9; the question ids are listed in Task 8's Reproduced line). Then
`republishForm('http://localhost:4131', '<formId>')` from `smoke/lib/operations.mjs` (needs
`MJ_API_KEY`) → returns a version (no "broken rule" refusal). SQL: the new
`FormVersion.Definition`'s question ids are in `DisplayOrder` order. Run it 3× on a fresh form
whose GUIDs sort against display order (create it through the same operations) → 3/3 published.
Explorer step for Soham: new form, four questions, rule on Q4 reading Q2 → Publish → first time.

---

## Task 9 — F10: the Forms home re-reads when navigated back to

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** browser (smoke run): card read "0 Responses" after a submit, "1" after a full
reload. Code: `forms-home-dashboard.component.ts` reads at mount (`loadData`), on host `Refresh()`
(the Explorer wrapper calls it once, at mount — MJ repo,
`packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/dashboard-resource.component.ts:869`), and on
`onFormsWrite(HOME_ENTITY.forms, …)`, which hears only writes made in this browser. A respondent's
`FormResponse` is written server-side; nothing reaches the client. `BaseDashboard.SetVisible` has
no caller in Explorer.

**Design (agreed, ruled 2026-10-26):** `@angular/router` is NOT a dependency of `forms-ng` and is
not added. Use `Location` from `@angular/common` (already a peer): `inject(Location).onUrlChange(…)`
fires on every pushState the Explorer router makes. In `forms-home-dashboard.component.ts`,
register it in `initDashboard`, and call `this.loadForms()` when the new URL is this dashboard's
own route (determine the exact Explorer URL shape for the Forms app's home on `:4201` first —
read it from the address bar — and match on it; document it beside the subscription). Dispose
the returned unregister function in `ngOnDestroy`. `loadForms` is
already coalesced, so a navigation during a read queues one follow-up, never a second read.
Comment: a count that changes while the page is on screen still waits for the next visit or a
host Refresh — polling and a push channel are deliberately not done.

**Tests (red first):** component spec (follow the existing home specs): a URL change to the
home route triggers one `loadForms`; one to another route does not; after destroy none.

**Smoke test (Soham, in Explorer, after the dist is staged):** open the Forms home, note a form's count; submit one response on its
`/f/:slug`; open the builder tab for any form, click the Forms app link → the card shows the new
count without a page reload.

---

## Task 10 — F11: Archive asks first

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** home card Archive → immediate `Forms.ArchiveForm`; DB `Form.Status='Closed'`,
links `Closed`, invite `Revoked`; no dialog (`forms-home-dashboard.component.html` ~line 150,
`toggleArchive` ~line 291).

**Design (agreed, ruled 2026-10-26):** `@memberjunction/ng-ui-components` is NOT a dependency of
`forms-ng` and is not added; the package has no generic confirm dialog (the builder's
`mjf-rule-editor-dialog` is chrome for a draft editor). Use an INLINE two-step confirm on the
card, the same `confirming` idiom the rule editor uses: the first Archive click puts the row into
`confirmingArchive === row.id` and renders, in place of the icon button, the sentence
`Archive "<name>"? Its open share links close and respondents see "no longer accepting
responses". Restore brings it back, but the links stay closed.` with two quiet buttons —
**Archive** (confirm, LEFT) and **Cancel** (RIGHT). Confirm runs the existing archive path; Cancel,
Escape, or clicking another row clears the state. Focus moves to the Archive button when the
confirm appears (keyboard users). Restore stays one click (it opens nothing). No Undo toast (a
true undo would reopen links, a server-side decision — out of scope, noted in the comment).
Token colours only (`.claude/rules/design-tokens.md`).

**Tests (red first):** home component spec: Archive click sets the confirming state and does NOT
call `data.archive`; confirm calls it once; Cancel/Escape never; Restore calls `data.restore`
directly; the confirm sentence contains the form's name.

**Smoke test (Soham, in Explorer, after the dist is staged):** home → Archive on a form with a live
link → inline confirm; Cancel → nothing in
DB; Archive → `Form.Status='Closed'`, links closed, `/f/:slug` 410. Restore → back, links closed.

---

## Task 11 — F12: Matrix detail labels map rows and columns by axis

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** stored `{"opt1":"opt2","opt2":"opt3"}` on `all-types-smoke` renders
"Col 1: Col 2; Col 2: Col 3" in Explorer's response detail. Code:
`packages/Entities/src/contracts/answer-values.ts` `renderComposite` builds ONE value→label map
over all options; rows `opt1/opt2` and columns `opt1/opt2/opt3` collide. `packages/CoreEntitiesServer/src/reporting/breakdowns.ts`
(summary) already splits by `matrixAxis` (line ~189); `answer-format.ts` `offeredValues` too (line ~405).

**Design (agreed):**
1. `contracts/` (e.g. in `form-definition.ts` beside `PublishedFormQuestionOption`): export
   `matrixAxisOf(option): MatrixAxis` = `option.matrixAxis ?? 'Row'` with the one comment that
   says why absent means Row. Use it in `renderComposite`, `CoreEntitiesServer/src/reporting/breakdowns.ts:189`
   (cross-package: import from `@mj-biz-apps/forms-entities` directly, no re-export) and
   `answer-format.ts:405` (three copies → one).
2. `renderComposite`: for `Matrix`, `rowLabel` maps through Row-axis options and `cellLabel`
   through Column-axis options; Address / ContactInfo unchanged.

**Tests (red first):** `answer-values.spec.ts`: overlapping row/column values → "Row 1: Col 2;
Row 2: Col 3"; non-overlapping (builder-made, blank values) unchanged; multi-select cells join
with " / ". Existing `breakdowns` and `answer-format` specs stay green after the helper swap.

**Smoke test:** the spec is the gate (the renderer is pure). Explorer step for Soham after the dist
is staged: Responses → the `all-types-smoke` response from the smoke run → Matrix line reads
"Row 1: Col 2; Row 2: Col 3"; CSV export of the same form unchanged (it reads the summary path).

---

## Task 12 — F13: no invented surname on respondent People

**Status:** agreed 2026-10-26, INCLUDING the repair migration (Soham: "we can repair") · **Verification:** _pending_

**Reproduced:** `__mj_BizAppsCommon.Person`: 44 rows with `LastName='(unknown)'` (e.g.
FirstName `smoke.tester`). Code: `packages/Actions/src/custom/on-submit/upsert-respondent-person.action.ts`
`createPerson` (~line 217): `FirstName = identity.firstName ?? <email local part>`,
`LastName = identity.lastName ?? '(unknown)'`. `LastName` is NOT NULL, no CHECK, Zod `z.string()`,
and `BaseEntity.Validate` rejects only null/undefined for non-null columns → `''` is storable.
`bizapps-common`'s identity header renders a blank last name (`(Record.LastName || '').trim()`).

**Design (agreed):** `person.LastName = identity.lastName ?? ''`; FirstName fallback stays (the
email local part is real data). Update the comment: People requires the column, not a value, and
a placeholder leaks into every other app's search and mail-merge.
**Repair (agreed):** versioned migration
`V<stamp>__v0.16.x__Person_Unknown_Surname_Repair.sql`: `IF OBJECT_ID('__mj_BizAppsCommon.Person','U') IS NOT NULL UPDATE … SET LastName = '' WHERE LastName = '(unknown)'`
(this literal is Forms' own). Rule for writing into another app's schema from a Forms migration:
guard on the object existing (Common may not be installed on a host that runs this file), touch
only rows Forms itself created (the `'(unknown)'` literal is that marker), use no third placeholder
(`lint:distribution` checks placeholders only; `B202606281200` already names
`__mj_BizAppsCommon.Person` literally, so the literal schema is the established form). Changeset `minor` (the migration ships).

**Tests (red first):** action spec: no name question → saved Person has `LastName === ''`, never
"(unknown)"; a supplied surname is kept.

**Smoke test:** submit on `all-types-smoke` with a fresh email → Person row `LastName = ''`;
Responses list shows the first name alone. `pnpm run mj:migrate` on `MJ_ATS_Dev` (writes the 44 placeholder rows there) → 0 rows with
`'(unknown)'`; the
Responses list shows no "(unknown)" anywhere.

---

## Task 13 — F14: Forms on-submit actions declare their result codes

**Status:** agreed 2026-10-26 · **Verification:** _pending_

**Reproduced:** `__mj.ActionExecutionLog.ResultCode` NULL for every Forms on-submit run. Cause:
MJ's `ActionEngine.RunAction` sets `result.Result` from `ActionResultCodes.find(…)` (metadata) and
`EndActionLog` writes `result.Result?.ResultCode`; Forms ships no `MJ: Action Result Codes`
rows, so the lookup misses. The actions themselves return codes: `SUCCESS`, `SKIPPED`,
`MISSING_PARAMETERS`, `RESPONSE_LOAD_FAILED`, `ENTITY_CLASS_UNREGISTERED`, `PERSON_LOOKUP_FAILED`,
`PERSON_SAVE_FAILED`, `NO_TASK_TYPE`, `TASK_SAVE_FAILED` (+ whatever
`send-confirmation-email` / `analyze-written-responses` use — enumerate from source).

**Design (agreed):** metadata only. `metadata/actions/.actions.json` holds six Forms actions; the
four on-submit ones are Upsert Respondent Person, Send Confirmation Email, Create Followup Task
and Analyze Written Responses (~lines 220 / 260 / 300 / 358). Add to each of those four a `relatedEntities["MJ: Action Result Codes"]` list (shape: MJ `metadata/actions/.search.json`
line ~197): `ActionID: "@parent:ID"`, `ResultCode`, `IsSuccess` (true for SUCCESS and SKIPPED),
`Description`; `primaryKey.ID` from `uuidgen`; no `sync` block. A spec in `packages/Actions`
(mirror the pinning idea of `packages/Server/src/automation/__tests__/automation-readiness.spec.ts`) reads the four action sources, collects every
`ResultCode: '…'` / `fail(…, '…')` literal, and fails if the metadata lacks one or lists an extra.
Also add `"MJ: Action Result Codes": { "entity": "MJ: Action Result Codes", "foreignKey": "ActionID" }`
to `pull.relatedEntities` in `metadata/actions/.mj-sync.json`, or the next `mj sync pull` drops
the rows. Ships in the release `Metadata_Sync` (the changeset is `minor`, written in Task 14).

**Smoke test (dev DB only, Soham's):** `npx mj sync push --dir=metadata --include=actions` from the worktree root (`--dir` is the
metadata ROOT; if it says "No entity directories found" the directory form is wrong, not the
files). The push writes `sync` blocks into the NEW rows: strip only those (every existing record
in the file already carries one — diff before and after), submit one response, then
`SELECT ResultCode FROM __mj.ActionExecutionLog WHERE ActionID IN (<the four>) ORDER BY StartedAt DESC` →
`SUCCESS` / `SKIPPED`, no NULL.

---

## Task 14 — whole-branch verification, docs and PR readiness

**Status:** agreed 2026-10-26 · **Verification:** _pending_

Runs after every task above has a filled Verification line.
1. `pnpm run typecheck` (all green) and `pnpm test` from the root (6,132+ tests, 0 failed).
2. Every smoke suite from `SMOKE_TEST_2026-10-26.md` §1 (1.3–1.8, 1.10–1.12) green on a fresh
   `:4131` harness; `smoke:credentials:least-privilege` now passes end to end (Task 6).
3. Integration specs in parallel on `MJ_Smoke_1026` with RCSI ON: 0 deadlocks (Task 1).
4. `npm run lint:distribution` green (Task 12's migration); `npm run check:esm` if any
   `type: module` package changed.
5. Update `SMOKE_TEST_2026-10-26.md`: every ❌/⚠️ row that a task fixed gets "fixed in this branch
   (Task N)"; the findings keep their text with a one-line "Fix:" pointer each.
6. Whole-branch review: dispatch `superpowers:requesting-code-review` style reviewer(s) — spec
   and standards (`code-review` skill, base `origin/next`); fix confirmed findings, re-run 1–4.
7. Write the ONE changeset file (`minor`, all five packages by full name, prose per
   `.claude/rules/changesets.md`).
8. Hand Soham the Explorer walk-throughs (Tasks 9, 10, 11) with the dist-staging step, and report:
   changed files by task, the changeset text, the migration, and what is left for him (the
   commit, the push, `/open-pr` into `next`). Do not commit or push.
