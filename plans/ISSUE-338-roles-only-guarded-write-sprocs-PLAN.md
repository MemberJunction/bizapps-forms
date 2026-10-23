# #338 Guarded-write procedures for a roles-only MJAPI login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every respondent submit, partial save, staff distribution save and outbox drain works on a host whose MJAPI login holds only `cdp_Developer`, `cdp_Integration` and `cdp_UI`.

**Architecture:** One migration creates nine procedures in `__mj_BizAppsForms`, each the raw base-table statement it replaces moved verbatim, granted `EXECUTE` to `cdp_Developer` and `cdp_Integration`. Ownership chaining lets an EXECUTE-only caller write the table. Each TypeScript call site branches on `provider.PlatformKey`: SQL Server sends `EXEC [schema].[sp…] @p = …` through `ExecuteSQL` on the same provider (so the caller's transaction still holds); PostgreSQL keeps the raw statement it runs today.

**Tech Stack:** SQL Server T-SQL (Flyway migration), TypeScript, Vitest, MJ `DatabaseProviderBase`.

**Spec:** the brief in issue #338 (Design decided / Done when / Out of scope).

## Global Constraints

- Migration file: `migrations/V202610222300__v0.16.x__Roles_Only_Guarded_Write_Sprocs.sql`; only the `${flyway:defaultSchema}` placeholder.
- Each procedure: `DROP PROCEDURE IF EXISTS` then `CREATE`, under `SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`. No dynamic SQL. `SET NOCOUNT ON` inside.
- `GRANT EXECUTE ON <proc> TO [cdp_Developer], [cdp_Integration]` — never `cdp_UI`, never a grant on a table.
- File carries `-- @codegen-none: <reason>` (procedures yield no CodeGen output).
- `DRAIN_BATCH_SIZE` (5) and `LEASE_SECONDS` (120) stay in `claim.ts` and are passed as `@BatchSize` / `@LeaseSeconds`.
- The claim keeps `OUTPUT … INTO` a table variable (the table has an `__mj_UpdatedAt` trigger).
- Parameter literals are built with `quoteSqlString`; the procedure's schema comes from `EntityByName(...).SchemaName` via `QuoteSchemaAndView`.
- No change to `migrations-pg/`, to tables/columns/entity rows, to the `Form Respondent` grants, to the claim ordering, or to the two constants.
- `readStoredServerColumnsLocked` keeps its fail-soft shape.
- Changeset level `minor` (the PR ships a migration).

## Procedures (signature → body source)

| Procedure | Params | Body = the statement in | Returns |
|---|---|---|---|
| `spFormDistributionConsumeResponseSlot` | `@ID UNIQUEIDENTIFIER` | `quota.ts consumeDistributionSlot` | `SELECT @@ROWCOUNT AS AffectedRows` |
| `spFormLockRowForQuota` | `@ID` | `quota.ts formQuotaReached` lock | the locked `ID` |
| `spFormResponseLockRow` | `@ID` | `persistence.ts lockResponseRow` | the locked `ID` |
| `spFormAutomationEventBringPartialsForward` | `@FormResponseID UNIQUEIDENTIFIER` | `enqueue.ts bringWaitingPartialsForward` | nothing |
| `spFormAutomationEventClaim` | `@WorkerID NVARCHAR(100), @FormResponseID UNIQUEIDENTIFIER = NULL, @BatchSize INT, @LeaseSeconds INT` | `claim.ts claimStatement` (SQL Server branch); response filter becomes `(@FormResponseID IS NULL OR e.[FormResponseID] = @FormResponseID)` | `ID, FormResponseID, Trigger, PartialSaveKey, AttemptCount, IsReplay` |
| `spFormAutomationEventSettle` | `@ID, @WorkerID NVARCHAR(100), @Status NVARCHAR(20), @LastError NVARCHAR(MAX), @RetryAfterSeconds INT = NULL` | `claim.ts settleEvent`; the TS `status === 'Pending'` branches become `CASE WHEN @Status = 'Pending'` | `AffectedRows` |
| `spFormAutomationEventRenewLease` | `@ID, @WorkerID NVARCHAR(100), @LeaseSeconds INT` | `claim.ts renewLease` | `AffectedRows` |
| `spFormAutomationEventReplay` | `@ID` | `claim.ts replayDeadLetteredEvent` | `AffectedRows` |
| `spFormDistributionReadServerColumnsLocked` | `@ID` | `FormDistributionEntityServer.readStoredServerColumnsLocked` | `MagicLinkInviteID, PublicLinkToken, ResponseCount` |

## Review Focus

- A `LastError` with a quote must reach the row intact (plain quoteSqlString, as today: no N prefix, so no behaviour change) → claim spec asserts the `EXEC` carries `'…it''s…'`.
- `retryAfterSeconds` that is not an integer must never be spliced into SQL → helper refuses non-integer numbers before any SQL.
- A claim without a response id must pass `NULL`, not `''` (a `''` fails the uniqueidentifier conversion) → claim spec asserts `@FormResponseID = NULL`.
- An `EXEC` must run inside the caller's open transaction → existing `inTransaction` assertions keep holding on the SQL Server branch.
- The settle of a non-`Pending` status must not touch `NextAttemptAt` and must clear `IsReplay` → migration-shape spec asserts the `CASE` arms.

---

### Task 1: The migration and its shape spec

**Files:**
- Create: `migrations/V202610222300__v0.16.x__Roles_Only_Guarded_Write_Sprocs.sql`
- Create: `packages/CoreEntitiesServer/src/shared/__tests__/guarded-write-sprocs.migration.spec.ts`

- [ ] Write the shape spec: reads the migration file; asserts each of the nine procedures has `DROP PROCEDURE IF EXISTS` + `CREATE PROCEDURE` + `GRANT EXECUTE … TO [cdp_Developer], [cdp_Integration]`; no `cdp_UI`; no `sp_executesql`/`EXEC (`; no `GRANT` on `[${flyway:defaultSchema}].[Form…]` tables (the brief's grep returns 0); the claim body keeps `WITH (UPDLOCK, READPAST, ROWLOCK)`, `TOP (@BatchSize)`, the `NOT EXISTS` ordering clause, `OUTPUT inserted.… INTO @claimed`; the locks keep `WITH (UPDLOCK, HOLDLOCK)`; the slot UPDATE keeps `(MaxResponses IS NULL OR ResponseCount < MaxResponses)`; settle keeps the lease fence and the `IsReplay` CASE. Run → FAIL (file missing).
- [ ] Write the migration (header comment: why, what is preserved, no dynamic SQL, grants). Run spec → PASS.
- [ ] In the slot: `npx mj migrate` (Forms schema), confirm the nine procedures exist in `SBX_s3`.
- [ ] `node scripts/check-codegen-append.mjs` and `pnpm run lint:distribution` pass.
- [ ] Commit.

### Task 2: The EXEC helper, the quota slot and the two row locks

**Files:**
- Create: `packages/CoreEntitiesServer/src/shared/forms-procedure.ts`, `shared/__tests__/forms-procedure.spec.ts`
- Modify: `submission/quota.ts`, `submission/persistence.ts`, `testing/fake-provider.ts` (`DISTRIBUTION_SLOT_UPDATE`)
- Test: `submission/__tests__/quota.spec.ts`, `submission/__tests__/terminal-row-guard.spec.ts`, `engines/__tests__/FormSubmissionEngine.spec.ts`

**Interfaces:**
- Produces: `formsProcedureCall(provider: DatabaseProviderBase, entityName: string, procedure: string, params: Record<string, string | number | null>): string` → `EXEC [schema].[procedure] @A = 'x', @B = 5, @C = NULL` (schema of `entityName`; throws naming the entity when it is not in metadata; throws on a non-integer number). Parameter order = object order.
- [ ] Red: helper spec; SQL Server specs expect `EXEC [__mj_BizAppsForms].[spFormDistributionConsumeResponseSlot] @ID = '…'`, `…[spFormLockRowForQuota] @ID = 'form-1'`, `…[spFormResponseLockRow] @ID = '…'`; PostgreSQL specs unchanged.
- [ ] Green: SQL Server branch of each site calls the helper; slot call reads `affectedRows` from the proc's result (no `AffectedRowCountSQL` wrap on SQL Server). Fake provider's slot emulation also matches the EXEC.
- [ ] Full package suite green. Commit.

### Task 3: The outbox — bring-forward, claim, settle, renew, replay

**Files:** Modify `automation/outbox/enqueue.ts`, `automation/outbox/claim.ts`; Test `automation/outbox/__tests__/claim.spec.ts`, `enqueue.spec.ts`.
- [ ] Red: SQL Server specs expect `EXEC …[spFormAutomationEventClaim] @WorkerID = 'worker-1', @FormResponseID = NULL, @BatchSize = 5, @LeaseSeconds = 120`; settle `@ID, @WorkerID, @Status, @LastError (NULL for Complete), @RetryAfterSeconds (NULL unless Pending)`; renew `@ID, @WorkerID, @LeaseSeconds = 120`; replay `@ID`; bring-forward `@FormResponseID`. The statement-shape assertions move to the PostgreSQL branch or Task 1's migration spec.
- [ ] Green; update the file header comment (SQL Server runs procedures). Commit.

### Task 4: The staff-save locked re-read

**Files:** Modify `magic-link/FormDistributionEntityServer.ts`, `testing/forms-world.ts` (`storedCredentialRead` matches the EXEC and `@ID = '…'`); Test `magic-link/__tests__/FormDistributionEntityServer.behaviour.spec.ts`, `entities/__tests__/FormEntityServer.behaviour.spec.ts`.
- [ ] Red: SQL Server expects `EXEC [__mj_BizAppsForms].[spFormDistributionReadServerColumnsLocked] @ID = 'dist-o''brien'`, still in a transaction; PostgreSQL unchanged. Green. Fail-soft unchanged. Commit.

### Task 5: Docs, changeset, verification

- [ ] `docs/install.md`: section "The MJAPI database login needs only MJ's three roles" + the `MJ: Entity Field Permissions` / `Forms Automation Runner` line.
- [ ] `.changeset/roles-only-mjapi-login.md` (`minor`, all four packages).
- [ ] Live in the slot: both integration specs; restart the slot API; `node smoke/respondent-path.mjs <slug>`.
- [ ] Lint, build, typecheck, publish-only checks.
