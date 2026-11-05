# #303 implementation plan: server engines + Remote Operations + thin clients

> **Superseded** by [`docs/superpowers/plans/2026-10-16-303-lts-6.1.md`](../../docs/superpowers/plans/2026-10-16-303-lts-6.1.md).
> This plan built PR #304 on the MJ 6.2 edge with the Work Queue; PR #306 rebuilt it on MJ 6.1.5 LTS with a
> `FormAutomationEvent` outbox. Kept as the record of how #304 was built.

**Spec (binding authority):** `plans/303/spec.md`. Section numbers below (§0–§11) and "Done when" item numbers (DW1–DW20) refer to it. Read only the sections your task names.

## Global Constraints (every task)

- **Workspace:** `~/Projects/mj-edge` (MJ `6.2.0-edge.*` workspace). Repo: `~/Projects/mj-edge/bizapps-forms`, branch `feat/303-server-engines-remote-ops`. Never touch `~/Projects/mj-dev` (the LTS workspace) or any repo other than `bizapps-forms`.
- **`~/Projects/mj-edge/MJ` belongs to another agent** (it is on an `agent/issue-*` branch with uncommitted work). Read it freely; never switch its branch, install inside it, edit it, build it, or run migrations from its `.env`. Do not touch `bizapps-common`, `bizapps-tasks`, `bizapps-caliber` checkouts either.
- **Database:** `MJ_Forms303_Edge` on `sql-mj-it` (`localhost:1455`). Never `MJ_Edge_Dev`, never `MJ_ATS_Dev`.
- **Harness port:** `4141` for this branch's `apps/MJAPI` (set `MJAPI_PUBLIC_URL` too; it is read at import time). Never `4121`, `4010`, `4000`.
- **No `git commit`, no `git push`, no `git stash`, no `git checkout -- / restore / reset`.** Leave every change in the working tree. The controller stages reviewed work.
- **Never dispatch subagents** (no helpers, no reviewers).
- **Repo rules apply in full:** `CLAUDE.md` and `.claude/rules/*.md` (no `any`, no `.Get()/.Set()`, no cross-package re-exports, `BaseSingleton`, `--mj-*` tokens, `.spec.ts` Vitest). Never hand-edit `generated/` files: regenerate with CodeGen against `MJ_Forms303_Edge`.
- **Metadata:** declarative JSON only, `uuidgen` primaryKeys for created records, `@lookup:` for updated ones, **no `sync` blocks, no `*__Metadata_Sync.sql`**. Push from a scratch mirror so `sync` blocks never land in tracked files.
- **Design rules (user's global):** never swallow errors (every catch logs/throws/returns with context); guard clauses up front; command–query separation; cap every loop/retry with a named constant; try/finally on resources; comments carry the why and stay accurate.
- **Tests:** TDD — write the failing spec first, then the code. Report exact commands and pass/fail counts. A pre-existing failure is recorded in the report, never "fixed" by weakening a test.
- **Report contract:** write the full report to the report-file path you are given (what changed, files, commands run with output tails, test counts, deviations, open concerns). Return only: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), one-line test summary, concerns.

---

### Task 0: Edge sandbox database, pin bump, baseline

Spec: §0, DW1 (the edge half).

1. Create `MJ_Forms303_Edge` `sa`-owned with users `MJ_CodeGen` and `MJ_Connect` as `db_owner`, following `~/Projects/mj-edge/WORKSPACE.md` "(Re)building" step 1 verbatim (substitute the name). Grant the app roles after the baseline (step 3).
2. Give `bizapps-forms` its own `.env` (copy `.env.example`, set `DB_HOST=localhost`, `DB_PORT=1455`, `DB_DATABASE=MJ_Forms303_Edge`, credentials from `~/Projects/mj-edge/MJ/.env`, harness port `4141`, `MJAPI_PUBLIC_URL=http://localhost:4141`, `MJ_API_KEY` = a fresh random value). Never print secrets into the report.
3. Core migration **version-tagged to `v6.2.0-edge.3`**, run from `bizapps-forms` with its `.env` using the workspace CLI (`node ~/Projects/mj-edge/MJ/packages/MJCLI/bin/run.js migrate -t v6.2.0-edge.3`; read `.claude/skills/mj-upgrade/SKILL.md` Phase 3 and `docs/database-operations.md` first). Verify by state: `MAX(version)` of `__mj.flyway_schema_history` = `202610121900`, zero rows with `success = 0`.
4. Sibling schemas leaf-first: `bizapps-common` then `bizapps-tasks` migrations at the versions this repo's `mj-app.json` dependency ranges admit (use their published release tags; `docs/database-operations.md` and `.claude/skills/mj-upgrade/` describe the clean-room chain). Read their checkouts, do not change them.
5. Forms migrations (`pnpm run mj:migrate` equivalent with the workspace CLI). Then push metadata for core (scratch mirror per WORKSPACE.md step 4), common, tasks and forms.
6. `ALTER DATABASE [MJ_Forms303_Edge] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;` (needed by the Work Queue).
7. Pin bump: `.claude/skills/mj-upgrade/scripts/bump-pins.sh 6.2.0-edge.3` (or the script the skill names), then `pnpm install --lockfile-only` inside `bizapps-forms`, then `npm run lint:mj-ranges`. Do not touch `@angular/*` or `pnpm.overrides`.
8. Make `bizapps-forms` resolve and build inside the edge workspace without disturbing `MJ/`. Work out how the workspace links members (`~/Projects/mj-edge/pnpm-workspace.yaml`, `.mj-dev-workspace.json`, `node_modules`); if an install is required, run it only at `~/Projects/mj-edge` root and confirm afterwards that `git -C ~/Projects/mj-edge/MJ status --porcelain` is unchanged from before.
9. `pnpm run build` (turbo, `@mj-biz-apps/*` only) and `pnpm test` at `bizapps-forms`. Record results as the **baseline**, including every pre-existing failure, in the report.
10. Run CodeGen once against `MJ_Forms303_Edge` (`docs/database-operations.md`) and record what changed in `packages/*/src/**/generated/` (6.2 narrows CHECK columns to literal unions — expected). Rebuild and re-test.

Done when: DB frontier verified; `lint:mj-ranges` green; build green; baseline test counts recorded; `git -C ~/Projects/mj-edge/MJ status --porcelain` unchanged.

### Task 1: Remote Operation rails, metadata, CodeGen

Spec: §2, §3 (I/O columns), §5 (topic/subscription), §3 last paragraph (entity relationships), §4 FormReportingEngine (queries), §11, DW2, DW11 (index half).

1. `mj.config.cjs` gains the `RemoteOperations` output; `packages/Entities/src/index.ts` exports `./generated/remote_operations`.
2. `metadata/remote-operation-categories/` (category "Forms") and `metadata/remote-operations/` with one record per operation in §3 (`Forms.PublishForm`, `Forms.CloneForm`, `Forms.CreateFormFromTemplate`, `Forms.ArchiveForm`, `Forms.RestoreForm`, `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`, `Forms.OpenDistribution`, `Forms.CloseDistribution`, `Forms.GetDistributionClaims`, `Forms.SaveAutomation`, `Forms.ReorderAutomations`, `Forms.RemoveAutomation`, `Forms.GetResponseSummary`, `Forms.ListResponses`, `Forms.GetRespondentForm`, `Forms.SaveResponse`), types under `types/` with **no import lines**. Model on `~/Projects/mj-dev/bizapps-orders/metadata/remote-operations/` (read-only). Every field name in §3's Input → Output column becomes a typed property; choose precise types (no `any`, no `unknown`), document each property with a one-line comment.
3. `metadata/entity-relationships/` declaring `RelatedRecordCollection`s `Form.Pages`, `Form.Screens`, `FormPage.Questions`, `FormQuestion.Options` (`Load: immediate`, `OnRemove: delete`, `Source: database`, `OrderBy: DisplayOrder ASC`); primaryKey is the full nested `@lookup:` form (see memory note in spec §3 and `MJ/metadata/entities/.related-record-collections.json`).
4. `metadata/work-queue-topics/` and `metadata/work-queue-subscriptions/` per §5 (model on `MJ/metadata-optional/work-queue-samples/`).
5. `metadata/queries/` for the reporting breakdowns (per-question option counts, per-page funnel reach, completion/duration stats) parameterised by `FormID` and optional `FormVersionID` (model on `bizapps-orders/metadata/queries/`). Approved status.
6. Add every new directory to `metadata/.mj-sync.json` `directoryOrder` in dependency order.
7. (Dropped by ruling — no migration; see spec §11.)
8. Push the new metadata to `MJ_Forms303_Edge` from a scratch mirror; run CodeGen; confirm `packages/Entities/src/generated/remote_operations.ts` has one `Forms*Operation` class per record and that the generated Form/FormPage/FormQuestion subclasses carry `DeclareRelatedRecords`.
9. Build and test; add a spec under `packages/Entities` asserting every operation key in metadata has a generated class (reads the metadata JSON, imports the generated module).

### Task 2: Contracts moves and single rule implementations

Spec: §6 bullets 1–2, §8, DW3 (contracts part), DW6 (parser part), DW7, DW13.

Move (not copy) into `packages/Entities/src/contracts/` the files §8 lists; snapshot builder takes structural row types (`Pick<…>` like `AuthoredAutomationRow`) and uses the zod parsers; Angular builder and widget import from `@mj-biz-apps/forms-entities/contracts`; delete the Angular copies and the tolerant parsers in `builder/json-fields.ts`. Add `toRespondentDefinition` + `RespondentFormDefinition` zod schema (+ key-enumeration spec), `validateAnswers(definition, answers, mode)` (unify messages; include the server's 64 KB cap and unknown-question refusal), `settleVisibility(definition, answers)` (fixed point, `MAX_VISIBILITY_PASSES` constant, explicit cap-hit result). Switch `widget/core/validation.ts`, `widget/core/form-runtime.ts` and `Server/.../validation.service.ts` to call them; delete `transmittedView()`. Add the builder→parser round-trip spec. Existing specs for moved files move with them.

### Task 3: Package graph and entity server subclasses

Spec: §1, §2 (last two bullets), §7, DW5, DW15 (subclass part).

Move the action helpers §1 lists from `packages/Actions` into `packages/CoreEntitiesServer` (update imports, no re-exports); adjust peers/deps in both `package.json`s and list `forms-core-entities-server` in `mj-app.json` under `server` as `library`. Move `packages/Server/src/public-submit/__tests__/fakes.ts` to a `CoreEntitiesServer` test-support location and extend it with `RunInEntityTransaction` support (`SupportsEntityTransactions`, `BeginEntityTransaction` returning a scope that records commit/rollback) and an `ExecuteSQL` stub. Implement `FormEntityServer`, `FormVersionEntityServer`, `FormQuestionEntityServer` per §7 with the engine flag as a public transient field, and change `FormDistributionEntityServer` (origins grammar into `ValidateAsync`; `savesInFlight`/`takeTurn` replaced by `RunInEntityTransaction` + `UPDLOCK, HOLDLOCK` row read on the same provider). Specs for every transition and refusal.

### Task 4: Publishing engine, `Forms.PublishForm`, AI actions

Spec: §4 FormPublishingEngine, §2 (op shape + Authorize), §1 forms-actions bullet, DW4, DW5, DW6, DW17 (PublishForm).

`FormPublishingEngine` + `PublishFormServerOperation`; `buildFormFromBlueprint` moved into `FormAuthoringEngine.BuildFromBlueprint` in one transaction, no Draft `FormVersion`; both AI actions gain `PublishImmediately` (metadata `ActionParam` record + code) and become thin; registration anchors wired into `LoadBizAppsFormsServer()`. Three-way identical-snapshot spec. Delete `packages/Angular/src/lib/builder/publish.service.ts` only in Task 10 (client switch) — here, leave it.

### Task 5: Authoring engine verbs

Spec: §4 FormAuthoringEngine, §3 rows CloneForm / CreateFormFromTemplate / Archive / Restore, DW14 (clone part), DW15, DW17.

`FormAuthoringEngine.Clone`, `CreateFromTemplate`, `Archive`, `Restore` + four operations. Preserve every rule cited in §4. Rollback specs with a forced child failure.

### Task 6: Distribution engine

Spec: §4 FormDistributionEngine, §3 distribution rows, DW17.

`FormDistributionEngine` + five operations (`Issue/Reissue/Open/CloseDistribution`, `GetDistributionClaims`); slug generation with a named attempt cap moved from `distribution.service.ts`; delete `packages/Server/src/distribution-claims/` resolver and move its claims logic into the engine; update `RESOLVER_PATHS`.

### Task 7: Automation engine, Work Queue handler, binding identity rule

Spec: §4 FormAutomationEngine, §5, §6 identity bullet, DW11, DW12, DW17.

`FormAutomationEngine` (`SaveAutomation`, `Reorder`, `Remove`, `RunForResponse`) + three operations; `@RegisterClass(BaseWorkHandler, 'Forms.RunAutomations')` handler with idempotency against `Succeeded` pairs; snapshot-driven plan (binding settings now in the snapshot from Task 4); `RespondentVerified: false` threaded to the binding executor with the never-update-on-match rule; `WorkQueueEngine.Instance.Config` call in `LoadBizAppsFormsServer()`. Delete `recovery-sweep.ts`, `isolated-dispatcher.ts`, `isolated-provider.ts` (use `CreateIsolatedProvider()`), `FORMS_HOOKS_BLOCKING` and the legacy hook path once nothing references them.

### Task 8: Submission engine and respondent operations

Spec: §4 FormSubmissionEngine, §5 publish bullet, §6, DW7, DW8, DW9, DW10, DW15 (public-path part), DW17.

`FormSubmissionEngine.GetRespondentForm` / `SaveResponse` + two operations with scope-bound `Authorize`; carry the existing pipeline stages over (dedupe, partial cap, session ownership, resume, sealed-invite revocation, Turnstile, origin, rate limit); Form must be Published; atomic quota UPDATE with `AffectedRowCountSQL`; the response write, answers, file provenance and the Work Queue publish inside one `RunInEntityTransaction`; server-resolved ending in the result; partial knockout returns `ended`. Delete `PublicFormResolver.ts` and the rest of `packages/Server/src/public-submit/` that moved; update `RESOLVER_PATHS`; HTTP middlewares (resume, upload provenance) call the engine. Sandbox specs for DW9 and DW10 run against `MJ_Forms303_Edge` (mark them as integration specs runnable on demand; document the command).

### Task 9: Reporting engine

Spec: §4 FormReportingEngine, §3 reporting rows, DW16, DW17.

`FormReportingEngine` + `GetResponseSummary` / `ListResponses` using `RunView` `Aggregates`, `RunQuery` against the Task 1 queries, and paged views; move the aggregation rules out of `reporting-aggregations.ts`; fixture spec that the summary equals the old browser aggregation.

### Task 10: Clients

Spec: §9, §3 last paragraph (graph saves), §6 bullet 2, DW3, DW8, DW13, DW14 (builder part), DW16, DW18.

Builder, home, responses and widget switch to the operations; builder structure saves through the Form root's related-record collections (`MJ.SaveEntityGraph`), field autosaves stay single-entity, `Form.Load()` replaces the 4 reads; delete `PublishService`, `FormCloneService`, `FormTemplatesService`, `ResponsesDataService`, the widget's live-path `computeScore` / `resolveFormOutcome`, the `PublishedForm` / `SubmitFormResponse` queries; widget gets one `ExecuteRemoteOperation` method on its fetch client; response list pages. Replace the source-regex specs DW18 lists with executing specs. Widget bundle guard and Angular typecheck (`ngc`) must pass.

### Task 11: Harness, smoke, docs, changeset

Spec: §5 host bullet, DW19, DW20.

`apps/MJAPI/mj.config.cjs` gains `workQueue` config; boot the harness on `:4141` against `MJ_Forms303_Edge`; grep startup log for `not found in metadata` (must be clean) and for the Work Queue host starting with the Forms subscription; update `smoke/*.mjs` to the operations and run `smoke:respondent-path`, `smoke:resume-arc-path`, `smoke:binding-path`, `smoke:automation-semantics-path` against `:4141`; `npm run check:host-truth`; full `pnpm run build` + `pnpm test`; update `docs/local-host.md`, `docs/database-operations.md`, add a `minor` changeset describing host requirements and the LTS merge gate; stop the harness by PID when done.
