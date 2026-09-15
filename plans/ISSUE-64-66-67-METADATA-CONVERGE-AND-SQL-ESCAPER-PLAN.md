# Issues #64 + #66 + #67 — metadata convergence repair, CodeGen unblock, and one SQL escaper

> *Historical record. `migrations/metadata-seed.manifest.json` and `npm run seed:manifest`, named
> below, were retired by [#105](https://github.com/MemberJunction/bizapps-forms/issues/105) on
> 2026-08-30 — the steps involving them no longer exist. Nothing else here changed.*

**One branch, one PR.** Branch `fix/issues-64-66-67-metadata-converge` cut **from `next`**, tracking
`origin/fix/issues-64-66-67-metadata-converge` (verify with `git branch -vv` before every push — never
track `origin/next`). PR targets `next`. Closes #64, #66, #67.

This plan was written after independently verifying every claim in all three issues against the working
tree and the live dev database on 2026-08-25. Everything in **Verified facts** is confirmed, not assumed.
Where this plan and an issue disagree, the plan is the corrected version — the differences are called out
explicitly (there are two: an extra duplicate class the issues missed, and an escaper inventory more than
twice the size #67 lists).

**Read before you start:** `CLAUDE.md` (all of it — the critical rules apply verbatim to this work),
`migrations/README.md` (append-only rule, placeholder rules), the header comments of
`scripts/check-distribution-seed.mjs` and `scripts/check-distribution-seed.mutants.mjs` (for Task 4),
and `smoke/file-links-path.mjs` (the house style for smoke scripts, for Task 2).

---

## 1. Verified facts (what is actually true, with evidence)

### #64 — V202608191300 guards some inserts on ID: CONFIRMED

`migrations/V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql` uses **three different guard
shapes**, and only one of them is wrong:

| Rows | Guard shape | Converges? |
|---|---|---|
| `Entity` / `ApplicationEntity` / `EntityPermission` (Form Screens creation, lines ~33–103) | fenced behind `IF NOT EXISTS (… Entity WHERE BaseTable='FormScreen' AND SchemaName=…)` | ✅ natural key |
| `EntityField` inserts (lines ~149–1100) | `WHERE ID = '<guid>' OR (EntityID = … AND Name = '<field>')` | ✅ natural key |
| **`EntityFieldValue` ×14, `EntityRelationship` ×1, `EntitySetting` ×2** | `WHERE [ID] = '<guid>'` **only** | ❌ duplicates on any host where CodeGen ran first |

The header's idempotency promise is therefore false for exactly 17 statements. Fresh installs are fine
(the chain up to that point ships no CodeGen rows, so each insert fires exactly once). Developer hosts
that ran `mj:codegen` between `V202608182100` and `V202608191300` get duplicates.

**Live dev DB state as of 2026-08-25** (queried directly):

- `EntityRelationship` duplicate **present**: `Forms → Form Screens` on `FormID` exists twice —
  `f3063e0c-7b0a-4b29-8f0c-86450e15f6d3` (CodeGen, created 2026-08-18 21:40) and
  `6729890a-d62c-4806-8fd3-3ce466fd0395` (the migration, created 2026-08-19 18:34).
- `EntityFieldValue` duplicates **already manually cleaned on this DB** (the cleanup SQL in #64 was run,
  keeping the migration's IDs) — but any other developer host in the affected window still carries them,
  so the repair migration is still required.
- **NEW, not in either issue:** `EntitySetting` duplicates **present** on the Form Screens entity
  (`a1f8cc58-b040-429c-b695-70db0e9e7327`, CodeGen's entity ID on this host):
  - `FieldCategoryInfo`: CodeGen's `e8b5fabc-290d-4c05-b758-cf7fafea58cf` (08-18) **and** the migration's
    `b2299181-df86-4e81-adaf-6eb05fc8cd34` (08-19), near-identical values (536 vs 546 chars).
  - `FieldCategoryIcons`: CodeGen's `0215a865-e0c6-4485-8aa2-fdac9f8e7c1f` (08-18) **and** the migration's
    `697cc89e-0c85-4902-831a-b60f80c2fd88` (08-19).
  The migration's `EntitySetting` inserts are ID-guarded and resolve `EntityID` by subquery
  (`SELECT TOP 1 … WHERE BaseTable='FormScreen'`), so on a CodeGen-first host they land on CodeGen's
  entity and duplicate `(EntityID, Name)`. #64's sweep covered Entity/EntityField/EntityPermission but
  not EntitySetting — this class must be added to the repair.
- Comprehensive duplicate sweeps grouped by real natural keys found **nothing else**: EntityField,
  EntityPermission, ApplicationEntity, and per-`EntityFieldID` EntityFieldValue are all clean.

**The 14 `EntityFieldValue` IDs the migration ships** (extract them from the migration file yourself as
the authoritative source — `grep "EntityFieldValue] WHERE \[ID\]"` — and cross-check this list):

- `FormQuestion.QuestionType` (EntityFieldID `0A4FF448-80DF-4D5D-94EC-E315822A1B45`, a pre-existing
  fixed-ID field — this is the set that actually duplicated, 10 rows):
  `a3807a5d-b745-4aa1-8c9c-97a37c3f0651`, `fa2bf74b-24ac-4d96-9f10-27346bab97da`,
  `dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2`, `8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47`,
  `04098387-4e62-4e1f-ae86-cd23a64d2c10`, `31b4c610-bd86-4eb8-bca1-7928d32bc7e4`,
  `5586b396-3160-41ee-9957-f6cafc8246b7`, `38150e25-0f5c-43b1-b583-8d3e678ce2b8`,
  `d4a3d852-21ca-41e5-977d-6297b1f33b11`, `9a56b49b-d201-4e20-9a88-2c0fb57e2bfc`
- ScreenType + MatrixAxis picklists (4 rows): `a2456d01-1dcf-4f55-a6e9-8561f334c910`,
  `8a3347c9-b0de-4f78-b376-8416ac8fac42`, `5f0484e2-b2b6-4e5c-9783-e97120b0ee2e`,
  `f47fcce7-8640-466d-9117-e919a72f9135`. These reference the migration's hardcoded new-field IDs via a
  companion `AND EXISTS (… EntityField WHERE [ID] = …)` — on CodeGen-first hosts that EXISTS fails and
  the insert is skipped, so **these four cannot have duplicated** (consistent with the 10 observed).
  Include them in the keep-list anyway; the converge delete is a no-op for them.

### #66 — CodeGen emits a duplicate resolver: CONFIRMED (root cause = the relationship row above)

The two-row `Forms → Form Screens` relationship is live in the DB (verified above). CodeGen emits one
`@FieldResolver` per row, producing `TS2300 Duplicate identifier 'mjBizAppsFormsFormScreens_FormIDArray'`
and `TS2393 Duplicate function implementation` in `packages/Server/src/generated/generated.ts`, which is
why every `mj codegen` run reports `ERROR running one or more AFTER commands` (its own Server build
failing on its own output). The **checked-in** generated files predate the duplicate and still compile —
the break only materializes on regeneration, which is what makes it look like it belongs to whatever
branch you happen to regenerate on.

Fix here = delete the duplicate row via the repair migration, then **prove** regeneration compiles.
The issue's third suggestion (CodeGen warning on colliding member names) lives in MemberJunction/MJ, not
this repo — it goes in the follow-ups section of the PR body, not in this PR.

### #67 — one SQL string-literal escaper, not six: CONFIRMED, but the real count is fifteen

The issue lists six sites. A full sweep (`grep -rn "sqlLiteral\|escapeSql\|replace(/'/g"` over
`packages/*/src`, excluding generated and specs) finds **15 production sites** across four packages —
the issue missed three in Angular, three inline in Actions, and two more in Server:

**Named local escaper functions (7):**
| Site | Name / shape |
|---|---|
| `packages/Actions/src/custom/binding/mj-binding-gateway.ts:186` | **exported** `sqlLiteral(value, dialect)` — the only N-prefixed one, with a load-bearing doc comment; unit-tested in `__tests__/mj-binding-gateway.spec.ts:64` |
| `packages/Server/src/file-links/mj-file-link-gateway.ts:161` | local `sqlLiteral(v)` — plain-quoted, `(value \|\| '')` guard; its doc comment explicitly logs this consolidation as "the right fix" |
| `packages/Server/src/download/download.service.ts:210` | local `escapeSql(v)` — bare doubling, no quotes |
| `packages/Server/src/public-submit/response-lookup.service.ts:47` | local `sqlString(v)` — plain-quoted (plus `sqlLikeLiteral` at `:91`, which also handles LIKE wildcards) |
| `packages/Server/src/public-submit/definition-loader.service.ts:59` | local `sqlString(v)` — plain-quoted |
| `packages/Server/src/respondent-host/redeem.service.ts:74` | local `sqlString(v)` — plain-quoted |
| `packages/Angular/src/lib/builder/automation-tab.component.ts:1216` | local `escapeSql(v)` — bare doubling |

**Inline `.replace(/'/g, "''")` (8):**
`packages/Server/src/public-submit/persistence.service.ts:302`,
`packages/Server/src/upload/upload-provenance.service.ts:134`,
`packages/Actions/src/custom/on-submit/create-followup-task.action.ts:157`,
`packages/Actions/src/custom/on-submit/upsert-respondent-person.action.ts:166`,
`packages/Actions/src/custom/authoring/form-blueprint-builder.ts:162`,
`packages/Angular/src/lib/home/forms-home.service.ts:147`,
`packages/Angular/src/lib/templates/form-templates.service.ts:180`,
`packages/Angular/src/lib/builder/distribution.service.ts:309`.

**The shared home exists and is ideal:** `@mj-biz-apps/forms-entities` is a dependency of forms-actions,
forms-server, **and** forms-ng; its only dependency is zod; hand-written code lives in
`packages/Entities/src/contracts/` with colocated `.spec.ts` files run by vitest. No new package needed,
no new coupling created.

**Consumers of the gateway's export:** only `packages/Actions/src/custom/binding/binding-ledger.ts:18`
and the spec. But note `packages/Actions/src/index.ts:7` does `export * from './custom/binding'`, so
`sqlLiteral` is currently part of forms-actions' public surface — removing it is deliberate (CLAUDE.md
rule 5 forbids keeping it as a cross-package re-export shim). Grep the repo for any other importer
before removing; there are none as of this writing.

---

## 2. Scope

**In:** repair migration (converges EntityFieldValue + EntityRelationship + EntitySetting duplicates);
a metadata-integrity smoke script; proof that `mj:codegen` output compiles again; escaper consolidation
across all 15 sites; a distribution-gate check that flags ID-only guards at authoring time; changeset;
smoke runs.

**Out (do not do these, even though the issues mention them):**
- Editing `V202608191300` in place — append-only rule; its one documented exception requires the file
  *cannot apply at all*, which is not the case (`migrations/README.md`).
- Committing regenerated CodeGen output — that is the separate `chore/resync-codegen-output` work; #66
  itself says to do it after this fix so a resync isn't mixed with a broken-output fix.
- PostgreSQL dialect wiring for `sqlLiteral` — #67 explicitly scopes consolidation only; the dialect
  parameter is a seam, not a promise (see the gateway's doc comment, which must survive the move).
- The `syncFileLinks` concurrent-reconcile race and the `FileEntityRecordLink` unique index — #67
  explicitly defers these upstream.
- CodeGen collision detection — upstream MJ (follow-ups section of the PR body).
- A `migrations-pg/` conversion — that directory is not kept in lockstep (it stops at 0.8.x); do not
  start now.

---

## 3. Tasks, in order

### Task 1 — the repair migration (fixes #64's damage, unblocks #66)

**File:** `migrations/V202608252300__v0.11.x__Converge_Element_Parity_Metadata_Duplicates.sql`
(timestamp must sort after `V202608251800`; bump if a later migration has landed —
`npm run lint:migrations` validates ordering).

**Rules that bind this file** (from `migrations/README.md` + CLAUDE.md): only `${mjSchema}` and
`${flyway:defaultSchema}` placeholders may appear (this file needs `${mjSchema}` only — it touches only
core `__mj` tables); no edits to any existing migration; header comment in the house style — read
`V202608242110`'s header as the model (WHAT WAS WRONG / WHO IS AFFECTED / WHY THIS SHAPE / postconditions).
This is not a metadata seed, so `metadata-seed.manifest.json` and `npm run seed:manifest` are untouched.

**Design.** Converge-by-keep-list: for every row `V202608191300` shipped under a fixed ID, delete any
*other* row carrying the same natural key. The migration's IDs win so a repaired host becomes
row-for-row identical to a fresh install (#64's stated goal). Set-based, deterministic, and a strict
no-op on a clean database *and* on an already-hand-cleaned one (like the current dev DB). It cannot
touch host-authored metadata because every delete requires a same-natural-key sibling from the keep-list.

**Body (adjust only if your extraction of the shipped IDs disagrees — the migration file is the
authoritative source, not this plan):**

```sql
-- 1. EntityFieldValue: keep the 14 shipped rows, delete same-(EntityFieldID, Value) siblings.
DELETE efv
FROM [${mjSchema}].[EntityFieldValue] efv
WHERE efv.[ID] NOT IN (
    'a3807a5d-b745-4aa1-8c9c-97a37c3f0651','fa2bf74b-24ac-4d96-9f10-27346bab97da',
    'dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2','8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47',
    '04098387-4e62-4e1f-ae86-cd23a64d2c10','31b4c610-bd86-4eb8-bca1-7928d32bc7e4',
    '5586b396-3160-41ee-9957-f6cafc8246b7','38150e25-0f5c-43b1-b583-8d3e678ce2b8',
    'd4a3d852-21ca-41e5-977d-6297b1f33b11','9a56b49b-d201-4e20-9a88-2c0fb57e2bfc',
    'a2456d01-1dcf-4f55-a6e9-8561f334c910','8a3347c9-b0de-4f78-b376-8416ac8fac42',
    '5f0484e2-b2b6-4e5c-9783-e97120b0ee2e','f47fcce7-8640-466d-9117-e919a72f9135')
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] keep
              WHERE keep.[ID] IN (/* same 14 ids */)
                AND keep.[EntityFieldID] = efv.[EntityFieldID]
                AND keep.[Value] = efv.[Value]);

-- 2. EntityRelationship: drop CodeGen's Forms → Form Screens row, keep the migration's.
DELETE FROM [${mjSchema}].[EntityRelationship]
WHERE [ID] = 'f3063e0c-7b0a-4b29-8f0c-86450e15f6d3'
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship]
              WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395');

-- 3. EntitySetting: keep the 2 shipped rows, delete same-(EntityID, Name) siblings.
--    (The class #64's sweep missed — verified live on 2026-08-25.)
DELETE es
FROM [${mjSchema}].[EntitySetting] es
WHERE es.[ID] NOT IN ('b2299181-df86-4e81-adaf-6eb05fc8cd34','697cc89e-0c85-4902-831a-b60f80c2fd88')
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntitySetting] keep
              WHERE keep.[ID] IN ('b2299181-df86-4e81-adaf-6eb05fc8cd34','697cc89e-0c85-4902-831a-b60f80c2fd88')
                AND keep.[EntityID] = es.[EntityID]
                AND keep.[Name]     = es.[Name]);
```

**Postconditions (required — repo house style, see `V202608131600`'s THROW pattern):** after the deletes,
`THROW` with a descriptive message if any duplicate group remains, scoped to Forms-schema entities so the
assert can never fire on unrelated host data:
- `EntityFieldValue` grouped by `(EntityFieldID, Value)` for fields of `__mj_BizAppsForms` entities;
- `EntityRelationship` grouped by `(EntityID, RelatedEntityID, RelatedEntityJoinField, Type)` for
  `__mj_BizAppsForms` entities;
- `EntitySetting` grouped by `(EntityID, Name)` for `__mj_BizAppsForms` entities.

**Apply and verify:** `pnpm run mj:migrate`, then re-run the three duplicate-group queries directly
(sqlcmd, `.env` sourced) and confirm zero rows, and confirm exactly **one** `Forms → Form Screens`
relationship survives with ID `6729890a-…`.

### Task 2 — metadata-integrity smoke script (the durable form of Task 1's verification)

**File:** `smoke/metadata-integrity-path.mjs`, plus `"smoke:metadata": "node smoke/metadata-integrity-path.mjs"`
in root `package.json` scripts.

Uses `sql` from `smoke/lib/sqlcmd.mjs` (the existing helper — see how `file-links-path.mjs` imports it).
Needs only `.env` sourced; **no MJAPI required** — say so in the header. Follow the house smoke-script
style: a header doc comment explaining what only a live run proves (here: that the *database* — the input
to CodeGen — is converged; unit tests and builds run against checked-in files and structurally cannot see
DB-side duplication, which is exactly how #66 stayed invisible until a regeneration).

Asserts, all scoped to `__mj_BizAppsForms`-schema entities, each failure naming the offending rows:
1. Zero duplicate groups on `EntityFieldValue (EntityFieldID, Value)`.
2. Zero duplicate groups on `EntityRelationship (EntityID, RelatedEntityID, RelatedEntityJoinField, Type)`.
3. Zero duplicate groups on `EntitySetting (EntityID, Name)`.
4. Zero duplicate groups on `EntityPermission (EntityID, RoleID)` and `ApplicationEntity (ApplicationID, EntityID)`
   (clean today; this is the regression tripwire — both tables lack unique constraints upstream).
5. Exactly one `Forms → Form Screens` relationship row.

Exit non-zero on any failure. Group the duplicate checks by **ID-typed natural keys** — grouping
picklist values by field *name* across entities false-positives on `Status` (verified: four Forms
entities each have a `Status` field).

### Task 3 — prove #66 is fixed: regeneration compiles

Only after Task 1 is applied to the dev DB:

1. `npm run mj:codegen` — must complete **without** `ERROR running one or more AFTER commands`.
2. `pnpm run build` — all packages green, including `@mj-biz-apps/forms-server` against the freshly
   regenerated `generated.ts`. Grep the regenerated file: exactly one `mjBizAppsFormsFormScreens_FormIDArray`.
3. **Then discard every artifact of this verification run** — the regenerated `packages/*/src/generated/**`
   files and any new `migrations/codegen/CodeGen_Run_*.sql`. This plan is your explicit approval for that
   specific `git restore` (CLAUDE.md rule 3 satisfied): the regen diff belongs to the separate
   `chore/resync-codegen-output` task per #66, and mixing it in here is what #66 warns against.
   Restore **only** those paths; run `git status` first and touch nothing else.

If step 1 or 2 fails, stop and report — do not improvise DB fixes beyond the migration.

### Task 4 — escaper consolidation (#67)

**New module** `packages/Entities/src/contracts/sql-literal.ts`, exported from
`packages/Entities/src/contracts/index.ts` (which `src/index.ts` already re-exports — that chain is
within one package and fine; rule 5 governs *cross-package* re-exports):

```ts
/** Double any single quotes — the one escaping rule for a T-SQL/ANSI string literal. */
export function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/** A plain quoted SQL string literal: `O'Brien` → `'O''Brien'`. Valid on every dialect. */
export function quoteSqlString(value: string): string {
  return `'${escapeSqlString(value)}'`;
}

export function sqlLiteral(value: string, dialect: 'sqlserver' | 'postgresql' = 'sqlserver'): string {
  const quoted = quoteSqlString(value);
  return dialect === 'sqlserver' ? `N${quoted}` : quoted;
}
```

**Move the gateway's doc comment onto `sqlLiteral` intact** — the paragraphs explaining why the `N`
prefix exists (varchar codepage silently replacing non-Latin characters *before* comparison, causing
duplicate respondent records) and that the dialect parameter is an unwired seam ("NOTHING SELECTS IT
TODAY") are load-bearing and must not be paraphrased away.

**Tests:** new `packages/Entities/src/contracts/sql-literal.spec.ts` (this repo is `.spec.ts`, never
`.test.ts`). Move the `describe('sqlLiteral')` cases out of
`packages/Actions/src/custom/binding/__tests__/mj-binding-gateway.spec.ts` and extend: doubling, the
N-prefix default, the postgresql branch, empty string, a value that is only quotes, and `quoteSqlString`
/ `escapeSqlString` cases.

**Call-site migration — the invariant is byte-identical emitted SQL per site** (this commit is a pure
refactor; any hardening, e.g. upgrading plain-quoted sites to `N`-prefixed, is a separate future decision
and NOT part of this PR):

| Site | Change |
|---|---|
| `Actions/binding/mj-binding-gateway.ts` | delete local `sqlLiteral` + its doc comment (moved); `import { sqlLiteral } from '@mj-biz-apps/forms-entities'`; **remove the export** |
| `Actions/binding/binding-ledger.ts` | import `sqlLiteral` from `@mj-biz-apps/forms-entities` |
| `Actions/on-submit/create-followup-task.action.ts:157` | `` `Name=${quoteSqlString(typeName)}` `` |
| `Actions/on-submit/upsert-respondent-person.action.ts:166` | `escapeSqlString(email)` |
| `Actions/authoring/form-blueprint-builder.ts:162` | `` `Name=${quoteSqlString(n)}` `` |
| `Server/file-links/mj-file-link-gateway.ts` | delete local `sqlLiteral` **and its now-satisfied "deliberate local copy" doc comment** (leaving it would make it a stale lie); call sites use `quoteSqlString(x)`; the old copy's `(value \|\| '')` tolerance moves to the call sites as `?? ''` only where the value is genuinely optional — check each of the two call sites (`:74`, `:82`) and prefer no coercion if the type guarantees a string |
| `Server/download/download.service.ts` | delete `escapeSql`; use `escapeSqlString` |
| `Server/public-submit/response-lookup.service.ts` | delete `sqlString`, use `quoteSqlString`; **keep `sqlLikeLiteral` local** (wildcard escaping is its own concern) but make its quote-doubling call `escapeSqlString` |
| `Server/public-submit/definition-loader.service.ts` | delete `sqlString`; use `quoteSqlString` |
| `Server/respondent-host/redeem.service.ts` | delete `sqlString`; use `quoteSqlString` |
| `Server/public-submit/persistence.service.ts:302` | `` `ResponseID=${quoteSqlString(responseId)}` `` |
| `Server/upload/upload-provenance.service.ts:134` | `unique.map((id) => quoteSqlString(id)).join(',')` |
| `Angular/home/forms-home.service.ts:147` | `` `Name=${quoteSqlString(actionName)}` `` |
| `Angular/templates/form-templates.service.ts:180` | `escapeSqlString(trimmed)` |
| `Angular/builder/distribution.service.ts:309` | `` `Slug=${quoteSqlString(slug)}` `` |
| `Angular/builder/automation-tab.component.ts` | delete `escapeSql`; use `escapeSqlString` |

Then per touched package (Entities first — it must build before its dependents):
`cd packages/<Pkg> && pnpm run build && pnpm run test`. Fix or update any test the removal breaks (the
gateway spec still tests the gateway itself; only the `sqlLiteral` describe block moves). Finally grep
the whole repo for any remaining `replace(/'/g` in `packages/*/src` outside the new module — the
acceptance criterion is **one** implementation of the doubling rule.

### Task 5 — the authoring gate (#64's suggested fix 3)

**Extend `scripts/check-distribution-seed.mjs` with CHECK 4:** flag any shipped migration statement where
an `INSERT INTO [${mjSchema}].[<T>]` — `<T>` ∈ {Entity, EntityField, EntityFieldValue,
EntityRelationship, EntityPermission, ApplicationEntity, EntitySetting} — is guarded by an
`IF NOT EXISTS (SELECT … WHERE …)` whose predicate tests **only** `[ID] = '<guid>'` (companion
`AND EXISTS (…)` clauses outside the NOT EXISTS don't rescue it — that is exactly the QuestionType shape
that failed). A guard whose NOT EXISTS predicate contains an `OR (`-joined natural-key alternative (the
`EntityField` shape) passes. Plain DML without an insert (like Task 1's DELETEs) is ignored.

**Watershed, not whole history** — mirror CHECK 3's pattern precisely: only migrations sorting **after**
`V202608191300` are scanned, because that file is the shipped offender that cannot be edited, and a gate
that fails today's healthy tree is a gate someone disables. Say this in the check's comment, citing
CHECK 3's own "WATERSHED, NOT WHOLE HISTORY" paragraph.

**The gate's contract with its own test harness is non-negotiable here:** add spec cases to
`check-distribution-seed.spec.mjs` (fires on an ID-only guard; stays silent on the OR-natural-key shape,
on pre-watershed files, and on guard-free DML) **and** `MUTANTS` entries to
`check-distribution-seed.mutants.mjs` for each load-bearing behavior of CHECK 4 (the table list, the
watershed, the OR-rescue). Read that harness's header first — it explains SURVIVED/KILLED/NOT APPLIED
and why an unpinned behavior is a behavior a refactor deletes silently. Run `npm run lint:distribution`
and `npm run lint:distribution:mutants`; both must pass.

### Task 6 — changeset + docs

- One changeset (`pnpm run change`), bump **minor** — this PR ships a migration, and the repo's recorded
  precedent is that a migration is never a patch (commit `9ba7093`). The `fixed: [["@mj-biz-apps/*"]]`
  group versions everything in lockstep; describe all three fixes in the changeset body.
- Append a one-line entry to `plans/FORMS_BUILD_PLAN.md`'s Progress Log, matching its existing entry style.
- Do **not** update `migrations/metadata-seed.manifest.json` (no seed changed).

---

## 4. Smoke-testing requirements (gate for the PR)

Environment for all of it: `set -a && . ./.env && set +a`. The API harness where needed:
`cd apps/MJAPI && node server.mjs` (this repo's own server on :4121 — `start:api` does not exist).

**A. Database-level (no server):**
1. Before Task 1: record the duplicate counts (expect: 1 relationship pair, 2 EntitySetting pairs, 0
   EntityFieldValue on this particular DB).
2. After `pnpm run mj:migrate`: `npm run smoke:metadata` (the new script) — must pass. This is also the
   proof the repair is a no-op-safe converge: it ran against a half-cleaned database (EntityFieldValue
   already converged by hand, the rest not) and produced a fully converged one.

**B. CodeGen round-trip (the #66 acceptance test):** Task 3's sequence — codegen clean, build green,
single resolver, artifacts discarded.

**C. Full builds, tests and lints:** `pnpm run build`, `pnpm run test:packages`, and every lint:
`lint:distribution`, `lint:distribution:mutants`, `lint:migrations`, `lint:generated`, `lint:ui`,
`lint:codegen-compat`.

**D. Live end-to-end suites** (MJAPI running; these collectively execute nearly every consolidated
escaper call site against the real database — that is why they gate this PR):

| Suite | Escaper sites it exercises live |
|---|---|
| `smoke:respondent` + `smoke:scope` | definition-loader, response-lookup, persistence, redeem |
| `smoke:resume-arc` | response-lookup (Partial path), persistence |
| `smoke:binding` (run `smoke:binding:seed` first) | the N-prefixed `sqlLiteral` binding path, binding-ledger |
| `smoke:file-links` | file-link gateway call sites |
| `smoke:provenance` | upload-provenance IN-list |
| `smoke:automation` | on-submit action lookups |
| `smoke:metadata` (new) | n/a — DB convergence |

All must pass. A suite that reports itself *skipped* for a missing seed is a failure of the run, not a
pass — seed and re-run. Report per-suite results in the PR body verbatim; if anything fails, fix or
report — never ship with a red suite (CLAUDE.md: fix/update tests rather than leaving them broken).

Angular escaper sites (`forms-ng`) have no smoke harness; they are covered by C plus the byte-identical
invariant. Say so in the PR body rather than implying they were exercised live.

---

## 5. Commit and PR structure

Follow CLAUDE.md's critical rules: **no commit without the user's explicit approval per commit**, stage
exactly what each commit describes, refactor and behavior change never share a commit. Proposed
sequence:

1. `fix(migrations): converge the metadata rows V202608191300 duplicated (#64, #66)` — Task 1 + Task 2
   (+ changeset, + build-plan log line).
2. `refactor(sql): one SQL string-literal escaper, not fifteen (#67)` — Task 4 only. Pure refactor;
   emitted SQL byte-identical.
3. `feat(lint): flag ID-only guards on core metadata inserts (CHECK 4)` — Task 5.

PR: base `next`, from `fix/issues-64-66-67-metadata-converge`. Load the `open-pr` skill before writing
the body. Body must state: closes #64, closes #66, closes #67; the EntitySetting finding as a
delta from the issues; the smoke matrix results; and the **follow-ups deliberately not done here** so
they aren't lost: (a) upstream MJ — CodeGen should refuse/warn when two relationship rows resolve to one
generated member (#66 §3); (b) upstream MJ — unique constraints on `EntityRelationship`,
`EntityPermission`, `EntitySetting`, `FileEntityRecordLink` natural keys, which is why every writer
currently owns idempotency by convention; (c) the generated-output resync (`chore/resync-codegen-output`),
now unblocked by this PR; (d) PostgreSQL dialect wiring for `sqlLiteral`.
