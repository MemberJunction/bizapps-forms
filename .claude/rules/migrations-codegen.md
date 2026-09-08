---
paths:
  - "migrations/**"
---

# CodeGen output in migrations

**One convention. CodeGen's SQL is appended into the migration that caused it, below a
`-- CodeGen output (appended)` banner, and the standalone `CodeGen_Run_*.sql` is then DELETED.**

If you have read a document that says tracking `migrations/codegen/*.sql` is an equally valid
alternative, it is out of date — that sentence was removed from
`plans/DISTRIBUTION_SEED_PLAN.md` in #160, having caused the mistake twice.

## First: does this change need CodeGen at all?

```
Did you change the SCHEMA of __mj_BizAppsForms?
  CREATE/ALTER/DROP TABLE, or a CHECK constraint whose value list becomes a generated union
    → YES. Run CodeGen, append its SQL, delete the run file.
  Only a column DESCRIPTION (sp_add/updateextendedproperty)
    → Write BOTH the extended property AND __mj.EntityField.Description. No CodeGen block.
      (V202608302200 is the shape. CodeGen copies the description into the generated entity
      class; Explorer reads the EntityField row. One write leaves the two disagreeing.)
  Only core-schema rows — role grants, ${mjSchema} permissions, seed data
    → NO. No Forms CodeGen output exists. Ship nothing.
  Nothing generated changed
    → DELETE the run file. Do not commit dead SQL.
```

**Worked example of the last case:** `V202609011500` changes a column default in the three places it
lives — the SQL default constraint, `spCreateFormDistribution`'s `ISNULL(@CaptchaRequired, 1)`, and
`__mj.EntityField.DefaultValue` — all by hand, and correctly ships **no** appended block. Its header
says why: the only generated code that would change is a doc comment, and a full regeneration would
drag in whatever else the generating database happened to hold. (It predates the `@codegen-none`
marker below by three days; written today it would also carry one.)

When you make that call deliberately on a migration that *does* carry DDL, say so in the file:
`-- @codegen-none: <reason>`. The gate accepts a stated reason and rejects an empty one. It never
accepts one on a `CREATE TABLE` — a new table always produces at least its `__mj.Entity`
registration and `EntityField` rows.

**The reason must name every table the DDL touches, and must be on ONE line.** One `@codegen-none`
does not excuse the whole file — only the tables it actually names — so a later `ALTER` on a second
table in the same migration can't silently inherit an old excuse it never earned. And it must not
wrap onto a second comment line: `findCodeGenNoneReason` reads only up to the next newline, so
anything past a line-wrap is invisible to the gate — including a table name you meant to name.
Correct:

```sql
-- @codegen-none: FormQuestion, FormAnswer — both ALTERs only widen an existing NVARCHAR column, so CodeGen has nothing new to register.
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ALTER COLUMN [HelpText] NVARCHAR(1000) NULL;
ALTER TABLE [${flyway:defaultSchema}].[FormAnswer] ALTER COLUMN [RawValue] NVARCHAR(1000) NULL;
```

A reason naming only `FormQuestion` here would leave the `FormAnswer` ALTER unexcused and fail the
gate — correct behavior, not a bug: it re-fires on the table that never earned the exemption instead
of quietly inheriting one written for a different table.

**A banner with nothing beneath it also fails.** Carrying the `-- CodeGen output (appended)` banner
with no generated content following it reads as shipped while shipping nothing — the same failure
shape as committing the run file instead of its contents. Either put real output under the banner or
remove the banner.

## Order, for a new column

[`docs/database-operations.md`](../../docs/database-operations.md) §2 is the authority on this
workflow and the reasons behind it — the commands below are reproduced here only because this rule
is where the decision gets made. Where a command differs between the two, use the safe app-schema
form (`pnpm run mj:migrate`, per §1's table) — never a bare `mj migrate`, which targets core's `__mj`
schema instead of this app's (§1 explains why).

```bash
pnpm run mj:migrate           # 1. schema
npx mj codegen --skipfiles    # 2. DB side only — creates the EntityField row, rebuilds views and
                              #    procs, and emits the run file you are about to append
npx mj sync push --dir metadata --ci   # 3. now @lookup:MJ: Entity Fields resolves
npx mj codegen --skipdb       # 4. files only — regenerates TS from complete metadata
```

**Never a full `mj codegen` at step 2.** File generation reads whatever metadata the database holds,
and a database built from migrations alone has none of what step 3 is about to seed. A full run there
regenerates from the empty set and **deletes real classes** (`MJ/migrations/CLAUDE.md:327-330`).

**`--skipdb` emits no run file at all.** `SQLLogging.initSQLLogging()` has exactly one call site,
inside `if (!skipDB)` (`MJ/packages/CodeGenLib/src/runCodeGen.ts:243`). If you ran step 4 and found no
run file, nothing is wrong.

## Why this is mandatory rather than tidy

MJ Forms is an **Open App**. `mj app install` writes `__mj_BizAppsForms` into the host's
`excludeSchemas` (`MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1980-1983`), so the
host's CodeGen never runs against our schema. `MJ/plans/open-app-spec.md:387`: *"app migrations must
be self-contained because CodeGen does not run on app schemas at install time."*

**If it is not in the migration, it does not exist on the host** — tables, `spCreate`/`spUpdate`/
`spDelete`, views, indexes, `EntityField` rows, all of it.

It is invisible locally because `mj codegen` **logs and executes in the same call**
(`CodeGenLib/src/Misc/sql_logging.ts:212-216`): your database is already current when CodeGen exits.
The run file exists solely to replay that effect onto databases CodeGen will never touch.

The symptom when you get it wrong is quiet and expensive. `BaseEntity.Set` on a field with no
`EntityField` row is a **no-op** — the entity never goes dirty and the save reports success having
written nothing. That cost an hour here on 2026-08-19; `V202608191300`'s header is the record.

**Do not commit the run file instead.** Skyway globs `**/*.sql` recursively and does read it, then
fails its `V…__`/`B…__`/`R__` filename parse and swallows the error into an optional warning. Nothing
in MJ reads one back. It is also a **delta, not a snapshot** — only new and modified entities are
logged — so an archive of run files is a pile of overlapping partial diffs.

## Two traps specific to this workspace

Generic instructions fail here for two reasons, and both depend on where you are running:

1. **`mj codegen` runs MJ *source*, not the pinned CLI.** The mj-dev root `package.json` overrides
   both `@memberjunction/cli` and `@memberjunction/codegen-lib` to `workspace:*`. The CodeGen doing
   the emitting can be ahead of this repo's `@memberjunction/*` pin.
2. **It runs against whatever `.env` points at** — in mj-dev that is a *shared* database hosting
   sibling apps' schemas, which may be ahead of `next`.

Neither is true on a host or a clean checkout. If you write instructions, say which you assume.

## Never edit a merged migration to add a banner

`migrations/README.md`, "Add a NEW seed migration; never edit an existing one" — history is
append-only, and the one earned exception (2026-08-13, #39) required that the file *could not apply
at all*. Six merged migrations carry CodeGen output with no banner (`B202606281200`,
`V202608072330`, `V202608081200`, `V202608191300`, `V202608191400`, `V202608301200`) — that is
history, not a defect to repair; the gate detects them structurally
instead of by banner. If a merged migration is genuinely missing its output, ship a **new**
migration — `V202608191300` and `V202608191400` are what that looks like.

## The gate

`npm run lint:codegen-append` (spec: `npm run lint:codegen-append:test`; wired into CI by
`.github/workflows/codegen-append-gate.yml`) fails on a tracked `CodeGen_Run_*.sql` anywhere, and on
a changed migration with app-schema DDL that ships no output and states no reason. Full workflow:
[`docs/database-operations.md`](../../docs/database-operations.md) §2 and
[`migrations/README.md`](../../migrations/README.md).

## The `__mj.Entity` id rule — read this before shipping any CodeGen output

**A migration that creates a table MUST insert that table's `__mj.Entity` row in the SAME file,
with a hardcoded `uuidgen` id, guarded on the natural key.** Not a later backfill. Not "CodeGen will
register it". The same file.

```sql
CREATE TABLE __mj_BizAppsForms.FormThing ( ... );
GO

-- Ship the entity row here, in this file. See below for why the gap is fatal.
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormThing' AND [SchemaName] = '${flyway:defaultSchema}'
)
BEGIN
    INSERT INTO [${mjSchema}].[Entity] ([ID], [Name], [BaseTable], [SchemaName], ...)
    VALUES ('<uuidgen>', 'MJ_BizApps_Forms: Form Things', 'FormThing', '${flyway:defaultSchema}', ...);
END
GO
```

### Why this works — the mechanism, not a convention

MJ discovers unregistered tables with
`SELECT t.* FROM [__mj].[vwSQLTablesAndEntities] t WHERE t.[EntityID] IS NULL`
(`MJ/packages/CodeGenLib/src/Database/manage-metadata.ts:5682`), and that view joins
`Entity e ON t.name = e.BaseTable AND s.name = e.SchemaName`
(`MJ/migrations/v5/B202607091514__v5.46.x__Baseline.sql:94567`).

So **if your row already exists under that natural key, `EntityID IS NOT NULL`, CodeGen skips the
table entirely and adopts your id.** If it does not, `createNewEntity()` mints one with `uuidv4()`
(`manage-metadata.ts:5933,5957`) — a different GUID on every database, forever.

There is no deterministic-id scheme in MJ. Core's own ids are stable only because someone froze
random GUIDs into a baseline. `uuidv4()` is the whole story.

### The window that actually bites

The danger is not "no seed ever" — every table in this repo and its siblings has one today. It is
the **gap between the CREATE and the seed**. Any developer who runs `mj codegen` inside that gap
mints the id locally, and a later seed guarded on the natural key then correctly *skips* their box,
which keeps their divergent id forever. Everything CodeGen emits on that box afterwards carries it.

Measured in this repo: **16 tables, 16 seeds, and exactly one seeded in a later file than its
CREATE** — `FormScreen`, created by `V202608182100`, seeded by `V202608191300`. That one table is
the entire cause of #155. The same shape cost `bizapps-common` an 8-day gap (`V202608171935` →
`V202608251531`, whose header records the fallout) and `bizapps-caliber` a month.

### Two fixes were tried on #155. Record of both, so neither is repeated.

**Attempt 1 — #163 (this branch).** Replaced the five captured `A1F8CC58` literals with a natural-key
lookup into a `DECLARE`d variable plus a `THROW` when it returns NULL. Verified on both populations:
32/32 applied on a fresh install AND on a simulated host holding the other id, converging on
identical metadata.

**Attempt 2 — #168 (merged to `next`).** Re-authored the file: DDL → CodeGen against a clean database
→ append. This is the more thorough-looking fix and it is the one that shipped. **It does not close
the bug.** Regenerating on a clean database captures the id a clean database holds — `6313B0B1` — and
that id exists *only* on hosts where `V202608191300`'s conditional seed actually fired. Proven by
running #168's own file against a host that minted its own id:

```
Failed at batch 12/45 (lines 118-290): The INSERT statement conflicted with the FOREIGN KEY
constraint "FK_EntityField_Entity" ... table "__mj.Entity", column 'ID'.
   FAILED: V202608252340__v0.12.x__Rules_And_Branching.sql       (25 applied, chain dead)
```

Same error, same file, same stopping point as the original defect. **Regenerating on a clean database
does not make a captured id portable — it only changes which population breaks.**

| population | before #168 | after #168 |
|---|---|---|
| fresh install | broken | works |
| ran CodeGen before the seed shipped | works | **broken** |

The lesson generalises past this file: **"I regenerated it against a clean DB" is not evidence that a
migration is portable.** The only evidence is running it on both populations, or not shipping a
captured id at all.

### So: what to do with the entity ids CodeGen hands you

1. **Prevent them.** Seed the entity row in the CREATE's own file (above). Then the id CodeGen
   captures is the id the repo shipped, on every host, and the capture is correct by construction.
   This is the fix; everything below is for output you already have.
2. **Drop the heal EXECs.** `mj.config.cjs` → `SQLOutput.omitRecurringScriptsFromLog: true` keeps the
   `@EntityIDs='<guid>,<guid>'` arguments out of the logged migration entirely
   (`MJ/packages/CodeGenLib/src/Misc/sql_logging.ts:158`). This repo had it `false`, which is how two
   ids that no shipped SQL seeds reached `next` in #168.
3. **De-literalise what is left**, by natural key into a variable, with a `THROW` on NULL:

   ```sql
   DECLARE @X UNIQUEIDENTIFIER = (
       SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
       WHERE [BaseTable] = 'FormThing' AND [SchemaName] = '${flyway:defaultSchema}');
   IF @X IS NULL THROW 5xxxx, '<file>: no [Entity] row for FormThing in this schema.', 1;
   ```

   Re-declare in each `GO` batch that needs it — T-SQL variables do not cross a batch. The `THROW`
   is load-bearing, not ceremony: `spDeleteUnneededEntityFields` reads a NULL or empty `@EntityIDs`
   as **unscoped** and then sweeps every entity in every schema its exclude-list does not name.

**Key on `BaseTable` + `SchemaName`, never on `Entity.Name`.** The entity-name prefix is
host-configurable (`mj.config.cjs` → `newEntityDefaults.NameRulesBySchema`), so a name-keyed lookup
matches nothing on a host configured differently — and reports success while doing so. The table this
app creates is not configurable. `bizapps-ats/.claude/rules/migrations.md:112` reaches the same
conclusion independently; `bizapps-caliber` still keys on `Name` and should not be copied on this
point.

### Which failure you get, and why the loud one is the lucky one

A captured id that is wrong on a host fails in one of two ways, and the difference matters more than
the defect:

- **Positional value in an INSERT** → `FK_EntityField_Entity` violation, `mj app install` stops, every
  later migration is unreachable. Loud, total, immediately diagnosed.
- **Inside a `WHERE` or an `IF NOT EXISTS` guard** → matches nothing, the statement reports success
  having changed no rows, the migration exits 0 and the diff looks like every other capture. Silent.

`V202608252340` on `next` currently carries six `6313B0B1` references: one positional (crashes) and
four in predicates (silent). Both classes ship together, which is why "it applied cleanly" is not
evidence of anything.

### Gates

- `npm run lint:distribution` — CHECK 7 refuses an `__mj.Entity` id no shipped SQL seeds. Its
  docblock names the three shapes it still cannot see; read that before trusting it.
- `npm run lint:codegen-append` — refuses a `CREATE TABLE` that ships no CodeGen output.
- **The check that catches this every time, and the only one that does: apply the chain from zero on
  a throwaway database, and again on one that holds a different entity id.** Recipe in
  [`docs/database-operations.md`](../../docs/database-operations.md).
