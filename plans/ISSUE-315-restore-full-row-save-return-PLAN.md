# Restore full-row save return (#315) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every published MJ (6.1.6, 6.2.0-edge.4) can save Form Response Answers and Form Automation Runs again, because the four save sprocs return the full base-view row.

**Architecture:** Withdraw #310's `datestamps_only` metadata file and ship one forward migration whose only content is MJ 6.1.6 CodeGen's output for the four sprocs and their grants. It sorts after `V202610172102`, so on a database that already ran `V202610171645` and `V202610172100` it redefines the sprocs last and wins.

**Tech Stack:** SQL Server / Flyway (`mj migrate`), MJ 6.1.6 CodeGen, Vitest.

**Spec:** the issue brief for #315 (design decided; done-when list is the acceptance test).

## Global Constraints

- Do not edit `V202610171645__v0.15.x__SaveReturnMode_DatestampsOnly_StoredProcedures.sql` or `V202610172100__v0.16.x__Form_Automation_Event_Outbox.sql`.
- Do not change `mj-app.json` `mjVersionRange` or any `@memberjunction/*` pin.
- No `*__Metadata_Sync.sql`, no `Entity`/`EntityField` row change, no `mj sync push`.
- Only `${flyway:defaultSchema}` as schema placeholder in the new migration.
- Only the sprocs of `FormResponseAnswer` and `FormAutomationRun`; keep `@FormAutomationEventID`.
- CodeGen runs on the slot (MJ checkout at v6.1.6, database `SBX_s2`) only.

## Review Focus

1. A database that already applied the two old files: the new file must re-create, not just ALTER-skip, each sproc — covered by Task 2's converge check (re-apply shipped sprocs, then `mj migrate`).
2. A fresh database: the baseline and both old files apply first, then the new one — covered by the regression spec (last-definition rule) plus Task 2's from-scratch check if the slot login can create a database; else recorded as deferred.
3. The `@ResultTable` holder for automation runs includes `FormAutomationEventID` at position 14 — the repro SQL declares the view's column order read from `sys.columns`.
4. Grants: `cdp_Developer`/`cdp_Integration` keep EXECUTE after the DROP/CREATE — the new file carries CodeGen's GRANT lines.
5. The live submit path: respondent smoke on the slot API passes and no new error-213 line appears in the API log.

---

### Task 1: Restore migration, metadata removal, changeset, docs

**Files:**
- Delete: `metadata/entities/.save-return-datestamps-only.json`
- Create: `migrations/V202610201900__v0.16.x__Restore_Full_Row_Save_Return.sql`
- Modify: `.changeset/save-return-datestamps-only.md`
- Modify: `docs/database-operations.md` (paragraph after the §4a table)
- Test: `packages/Entities/src/contracts/save-return-shape.spec.ts` (already committed, red)

- [ ] **Step 1:** Run `npx vitest run src/contracts/save-return-shape.spec.ts` in `packages/Entities`. Expected: 4 failed, 2 passed.
- [ ] **Step 2:** Delete the metadata file. `grep -r datestamps_only metadata/` prints nothing.
- [ ] **Step 3:** In the workdir run `npx mj codegen --skipfiles` (DB side; emits `migrations/codegen/CodeGen_Run_*.sql`).
- [ ] **Step 4:** Write the new migration: header (supersedes the sproc definitions in `V202610171645` and `V202610172100`; published MJ expects the full row; `datestamps_only` needs MJ#5804, which is in no MJ tag; ships only the four sprocs and grants), then `-- CodeGen output (appended)`, then the run file's `spCreate`/`spUpdate` sections and their permission sections for Form Response Answers and Form Automation Runs, verbatim, schema replaced by `${flyway:defaultSchema}`. Exclude triggers, views, spDelete and every other entity. Delete the run file.
- [ ] **Step 5:** Rewrite the changeset prose (level stays `minor`): the `datestamps_only` return is withdrawn and the four sprocs return the full row again because no published MJ supports the three-column return.
- [ ] **Step 6:** Add to the docs paragraph: the restore migration redefines the four sprocs last, so a host keeps the full-row return.
- [ ] **Step 7:** Spec passes (6/6). Commit.

### Task 2: Prove it on the slot database and API

- [ ] **Step 1 (converge):** apply `agent/host-state.sql` (shipped sprocs), run `pnpm run mj:migrate`, then `agent/repro.sql`: four tails end in `[vwFormResponseAnswers]`/`[vwFormAutomationRuns]`; both saves `SAVE OK`, `captured_rows = 1`.
- [ ] **Step 2 (from scratch):** if the slot login can create a database, build it from all migrations and run the same checks; otherwise mark the row deferred with the reason.
- [ ] **Step 3 (live):** `FORMS_SMOKE_URL=http://localhost:4502 node --env-file=.env smoke/respondent-path.mjs` passes; no new `Column name or number of supplied values` line in the API log.
- [ ] **Step 4:** `pnpm run lint:migrations`, `lint:codegen-append`, `lint:distribution`, `check:release-seed`, `check:seed-cadence`, `pnpm run build`, `pnpm test`.
