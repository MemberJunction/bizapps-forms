# Verifying Forms on PostgreSQL (one-shot install, no CodeGen)

This runbook simulates what `mj app install` does to a PostgreSQL database and
verifies Forms is **fully functional without ever running `mj codegen`**. That is
the contract: a consumer installs an Open App, they do not code-generate it.

Everything below was measured on PostgreSQL **16.11**, MJ **5.51.0**, CLI **5.51.0**.

## 0. Fresh PostgreSQL — use the OLDEST version we support

```bash
docker run -d --name forms-pg-test \
  -e POSTGRES_USER=mj_admin -e POSTGRES_PASSWORD=<pw> \
  -e POSTGRES_DB=FORMS_Test -p 5436:5432 postgres:16.11
```

Test on the **oldest** supported major, not the newest. A newer server silently
accepts things an older one rejects — bizapps-sonar shipped a baseline whose
`pg_dump` 17 header set `transaction_timeout`, a GUC that does not exist in 16.x,
and an unrecognized parameter is an `ERROR`: the file failed at line 1 on every
16.x server while passing on 17. A test pinned to the newest major cannot see
that class of bug.

MJ core's migrations `GRANT` to three roles that do not exist on a virgin
cluster; create them first, or migration 1 fails with
`role "cdp_Developer" does not exist`:

```bash
for r in cdp_Developer cdp_Integration cdp_UI; do
  psql -h localhost -p 5436 -U mj_admin -d postgres -c "CREATE ROLE \"$r\";"
done
```

## 1. Point the MJ CLI at it

```bash
export DB_PLATFORM=postgresql DB_HOST=localhost DB_PORT=5436 \
  DB_DATABASE=FORMS_Test DB_USERNAME=mj_admin DB_PASSWORD=<pw> \
  CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=<pw> DB_ENCRYPT=false
```

`CODEGEN_DB_*` is required even for migrate — the CLI opens its admin connection
with those credentials.

## 2. Platform install

```bash
npx mj migrate --tag v5.51.0        # expect: 25 applied on a virgin DB
```

Do **not** run plain `npx mj migrate` — without `--tag` it uses this repo's local
migrations directory, not MJ core's.

## 3. Simulate `mj app install`

`FormResponse.RespondentPersonID` has a hard FK to
`__mj_BizAppsCommon.Person(ID)`, so **bizapps-common is a required prior
install** — the baseline fails with `relation "…Person" does not exist` without
it. mj-app.json also declares bizapps-tasks as a dependency, but no Forms
migration references its schema, so it is not needed for *this* check.

```bash
psql -h localhost -p 5436 -U mj_admin -d FORMS_Test \
  -c 'CREATE SCHEMA IF NOT EXISTS __mj_bizappscommon;'
(cd ../bizapps-common && npx mj migrate --schema __mj_BizAppsCommon --dir ./migrations-pg)  # 7 applied

psql -h localhost -p 5436 -U mj_admin -d FORMS_Test \
  -c 'CREATE SCHEMA IF NOT EXISTS __mj_bizappsforms;'
npx mj migrate --schema __mj_BizAppsForms --dir ./migrations-pg   # expect: 3 applied
```

Note the **unquoted** `CREATE SCHEMA`. That is what the installer issues, and
PostgreSQL folds it, so the physical schema is `__mj_bizappsforms` while
`--schema` (and therefore `${flyway:defaultSchema}`) carries the canonical
mixed-case spelling. The migrations are written to survive that split; see
"Things that look wrong but aren't".

Then the metadata push, which `mj app install` also performs and which is not
platform-specific — but is not optional either, since it creates the
`Form Respondent` role the anonymous submit path depends on:

```bash
npx mj sync push --dir metadata     # measured: 73 created, 0 errors
```

**Do not run codegen. That is the point of the test.**

## 4. Verify

```sql
SELECT 'tables' AS check, count(*)::text AS n FROM information_schema.tables
  WHERE table_schema='__mj_bizappsforms' AND table_type='BASE TABLE'
UNION ALL SELECT 'base views', count(*)::text FROM information_schema.views
  WHERE table_schema='__mj_bizappsforms'
UNION ALL SELECT 'crud functions', count(*)::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='__mj_bizappsforms' AND p.proname LIKE 'sp%'
UNION ALL SELECT 'triggers', count(*)::text FROM information_schema.triggers
  WHERE trigger_schema='__mj_bizappsforms'
UNION ALL SELECT 'entities registered', count(*)::text FROM __mj."Entity"
  WHERE LOWER("SchemaName")='__mj_bizappsforms'
UNION ALL SELECT 'entity fields', count(*)::text FROM __mj."EntityField" f
  JOIN __mj."Entity" e ON e."ID"=f."EntityID" WHERE LOWER(e."SchemaName")='__mj_bizappsforms'
UNION ALL SELECT 'permissions', count(*)::text FROM __mj."EntityPermission" p
  JOIN __mj."Entity" e ON e."ID"=p."EntityID" WHERE LOWER(e."SchemaName")='__mj_bizappsforms';
```

| check | n |
|---|---|
| tables | 10 |
| base views | 10 |
| crud functions | 30 |
| all functions (incl. trigger + helper fns) | 41 |
| triggers | 10 |
| entities registered | 10 |
| entity fields | 121 |
| permissions | 39 (30 from the migrations + 9 from the metadata push) |
| relationships | 13 |

Objects existing is not the same as a working model, so also run the functional
test — CRUD functions, FK-joining base views, the category tree's derived
`RootParentID`, the cross-schema respondent link, the CHECK/UNIQUE constraints
and the `__mj_UpdatedAt` triggers. It is self-cleaning:

```bash
node scripts/pg-objectmodel-test.mjs     # measured: 19 passed, 0 failed
```

And boot the API against it:

```bash
npm run build && npm run start:api
#   DB   PostgreSQL · localhost:5436/FORMS_Test · 404 entities
#   Ready http://localhost:4113/
```

## 5. Prove codegen is a no-op

```bash
npx mj codegen
```

Snapshot Forms' entity / field / permission / relationship metadata plus
`pg_get_viewdef`, `pg_get_functiondef`, `pg_get_triggerdef` and
`information_schema.columns` before and after, and diff: it must be **empty**.
Measured: **0 lines**.

One normalization is needed when hashing function bodies: replace
`__mj_BizAppsForms` with `__mj_bizappsforms` first. The migrations write the
schema name through `${flyway:defaultSchema}` (canonical mixed case) while
CodeGen writes the folded physical name. Both are unquoted, so PostgreSQL
resolves them to the same schema — the stored source text differs, the object
does not.

Afterwards, restore what codegen rewrote:

```bash
git checkout -- packages apps
git clean -fd packages apps     # codegen emits forms for every app sharing the DB
rm -rf temp_sql_scripts migrations/codegen
```

## Things that look wrong but aren't

- **`CREATE SCHEMA … __mj_bizappsforms` is unquoted and lower case.** Deliberate,
  and it must stay that way — that is what the installer does, and every
  reference in these migrations is written to fold to the same name.
- **Every schema name used as a VALUE is wrapped in `LOWER()`** (an
  `Entity."SchemaName"` row, a catalog comparison). CodeGen's reconciliation
  compares `Entity."SchemaName"` to the physical catalog name; a mixed-case value
  never matches and `spDeleteUnneededEntityFields` then deletes every field of
  every entity in the schema. Identifiers, by contrast, stay quoted and
  mixed-case — those are real object names, not data.
- **The FK to bizapps-common names `__mj_bizappscommon` in lower case** while the
  table stays `"Person"`. Common's own runbook creates its schema unquoted, so
  the schema folds and the table does not.
- **The migrations call MJ core's `spUpdateExistingEntityFieldsFromSchema` and
  friends.** Those are the four `EXECUTE`s the transpiler reports as unhandled.
  They are not cosmetic: they rewrite the placeholder `Sequence` values CodeGen
  assigns to new fields (100001, 100002, …) into real ordinals. Skipping them
  leaves 121 rows that no SQL Server install has.
- **`V202606301400__…CodeGen_Objects.pgonly.sql` has no T-SQL counterpart.** On
  SQL Server CodeGen appends its output into the migrations themselves
  (`appendOutputCode`); on PostgreSQL that never happened, so the objects are
  captured here instead. `.pgonly.sql` is the marker for "PG-only by design".
- **`npx mj codegen` exits 1** if the environment has no AI provider
  credentials ("No suitable model found for prompt CodeGen: Check Constraint
  Parser"). That is CodeGen's LLM-backed constraint parser, not a database
  problem — the metadata diff is still empty.
- **Codegen renames the generated Angular folders** from `mjBizAppsFormsForm…`
  to `mjbizappsformsForm…`, because on PostgreSQL it derives them from the folded
  schema name. On a case-insensitive filesystem `git status` cannot see it and
  the next Angular build fails with TS1261. Rename them back after step 5.

## Maintenance contract

When a future schema change regenerates any CRUD function, view, or trigger, the
new definition must be captured into the corresponding PG migration — otherwise a
fresh PG install silently ships the stale one. **The no-op check in step 5 is the
regression test for this**, and step 0's version choice is the regression test
for dump-header and GUC portability.
