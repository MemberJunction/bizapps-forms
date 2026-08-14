# Migrations (PostgreSQL)

PostgreSQL migrations for Forms, converted from `../migrations` via
`npx mj migrate convert --split --bake-codegen`, plus one `.pgonly.sql` file that
carries CodeGen's native plpgsql output.

**Verified end to end: see [`docs/PG_INSTALL_VERIFICATION.md`](docs/PG_INSTALL_VERIFICATION.md).**
A fresh install is 3 migrations, **no codegen**, and a subsequent `mj codegen` run
changes nothing in the database. `scripts/pg-objectmodel-test.mjs` (19 assertions)
proves the resulting model actually works, not merely that the objects exist.
Measured on PostgreSQL **16.11** — the oldest major we support, deliberately, not
the newest.

## What is here

| kind | files | what they are |
|---|---|---|
| `*.pg.sql` | 2 | 1:1 conversions of `../migrations/*.sql` — DDL, comments, entity metadata |
| `*.pgonly.sql` | 1 | CodeGen's base views, CRUD functions, triggers, grants and column defaults — no T-SQL counterpart |

The capture file exists because on SQL Server CodeGen **appends** its output into
the migrations themselves (`appendOutputCode`), and that never happened for
PostgreSQL. Without it an install has tables and registered entities but no base
views and no CRUD functions — i.e. nothing the API can read or write through.

It is a **catalog capture**, not a copy of CodeGen's SQL log, because CodeGen
writes to that log only for entities whose *metadata* it changed. These
migrations already carry the metadata, so CodeGen logged almost nothing while
still building every object. The catalog is the record of what was actually
built.

## What is deliberately NOT here

The PostgreSQL chain stops before the metadata seed, and everything downstream of that stop is
absent for the same reason rather than by oversight. Recorded here so the gap is a known quantity
instead of something the next reader has to infer from a directory listing:

| SQL Server migration | why there is no PostgreSQL twin |
|---|---|
| `V202608081400__…Backfill_Legacy_Automations` | backfills rows the seed creates; nothing to backfill without it |
| `V202608081700__…Metadata_Sync` | 4,600 lines of `EXEC __mj.spCreate*` calls. The converter emits these as raw T-SQL, and a PostgreSQL core exposes the equivalents as functions with a different call shape — porting it is a hand-authored rewrite, not a conversion |
| `V202608081800__…Seed_SchemaInfo_EntityNamePrefix` | seeds a row the file above depends on |
| `V202608131600__…Respondent_Grant_Hardening` | repairs grants that only the seed creates, so on PostgreSQL there is nothing for it to repair — neither the vulnerability it closes nor the rows it corrects exist (#39) |

The consequence is worth stating plainly: **a PostgreSQL host installs the Forms schema but none of
the seed payload** — no roles, no grants, no actions, prompts, styles or dashboards — so the
anonymous respondent path does not run there at all. Port the seed and this file in the same change
if that is ever taken on; shipping the hardening without the seed would repair nothing, and shipping
the seed without the hardening would import the vulnerability #39 closed.

## Prerequisite

`FormResponse.RespondentPersonID` hard-FKs `__mj_BizAppsCommon.Person(ID)`, so
**bizapps-common must be installed first**. mj-app.json also declares
bizapps-tasks, but no Forms migration references its schema.

## Converter gaps worked around here (CLI 5.51.0)

All of these are worth reporting upstream:

- **`--bake-codegen` produced no CodeGen objects.** The conversion reported
  success and emitted DDL + metadata, but zero views/functions/triggers — hence
  the catalog capture.
- **BIT → BOOLEAN literals are not coerced.** Every `1`/`0` bound for a boolean
  MJ core column came through as an integer, and PostgreSQL has no implicit cast:
  the baseline failed with `column "IncludeInAPI" is of type boolean but
  expression is of type integer`. 1,590 literals were rewritten (mechanically,
  by looking each target column's type up in `information_schema`).
- **The schema qualifier is emitted quoted in some places and unquoted in
  others** — `"__mj_BizAppsForms"."FormCategory"` in `CREATE TABLE` next to
  `__mj_BizAppsForms."FormCategory"` in `ALTER TABLE`. Those are two different
  schemas on PostgreSQL. All are unquoted here so they fold consistently.
- **Cross-schema `REFERENCES` keeps the mixed-case schema name**, which does not
  match a schema created unquoted. Folded by hand, with the reason in place.
- **The four CodeGen reconciliation `EXECUTE`s are reported as unhandled**, but
  they exist natively on PostgreSQL. They are ported as `SELECT`s rather than
  dropped — see the migration headers for why that is load-bearing.
- **`schemaPlaceholders` / `includeSchemas` / `NameRulesBySchema` match
  case-sensitively**, while PostgreSQL hands CodeGen the folded name. Lower-case
  twins are added in `mj.config.cjs`; without them the generic `__mj` rule
  matches the *prefix* of `__mj_bizappsforms` and emits `${mjSchema}_bizappsforms`.

## Editing these files

Prefer fixing the converter and regenerating
over hand-tuning. Where hand-authoring was unavoidable it is commented in place
with the reason. Two invariants to preserve — read
`docs/PG_INSTALL_VERIFICATION.md` § Maintenance contract before touching them:

1. The schema name used as a **value** is always wrapped in `LOWER()`; identifiers
   stay quoted-and-mixed-case (object names) or unquoted (schema, so it folds).
2. The CodeGen capture stays **last**, and reconciles metadata once more at its
   end — that pass is what gives virtual (view-derived) fields real ordinals.
