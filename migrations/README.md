# Migrations (SQL Server)

Skyway/Flyway-style migrations for the `__mj_BizAppsForms` schema. Files follow
`VYYYYMMDDHHMM__v<ver>__<Description>.sql`. Apply locally with `npm run mj:migrate`.

**This directory is the only thing that ships.** `mj-app.json` names a `metadata` directory and a
`schema`, but MJ's manifest schema is explicit that `metadata.directory` is a dev-time pointer the
install engine **never reads** — seeding happens exclusively through the files here. Anything that
exists only because someone ran `mj sync push` on their laptop exists only on that laptop.

## The three kinds of file here

| File | Produced by | Regenerate when |
|---|---|---|
| `B…__Schema_and_Tables.sql`, `V…__<Feature>.sql` | hand-written DDL, with CodeGen's SQL **appended** below the `-- CodeGen output (appended)` marker | the schema changes |
| `V…__Metadata_Sync.sql` | `mj sync push --dir metadata --exclude users` against a database whose Forms metadata is **empty** | anything under `metadata/` changes |
| `../migrations-teardown/V001__…` | hand-written; retires the seed's core-schema rows on `mj app remove` | the seed gains or loses a root record |

`migrations/codegen/` is gitignored: CodeGen's raw run files are an intermediate, and its SQL is
appended into the feature migration instead. `migrations/metadata-seed.manifest.json` records the
metadata hashes the current seed was generated from — `npm run lint:distribution` fails if they
have drifted, which is the only thing standing between a metadata edit and a silent non-ship.

## The loop, whenever you touch `metadata/`

```
edit metadata/  →  regenerate the seed migration  →  npm run seed:manifest  →  commit both
```

Miss the middle step and the edit exists only in your database. `npm run lint:distribution` fails
the build when the manifest and `metadata/` disagree, which is the only thing standing between a
metadata edit and a silent non-ship.

**Add a NEW seed migration; never edit an existing one.** Migrations are append-only history —
`V202608081700` is applied wherever it is applied, and rewriting it changes what a database that
already ran it believes it ran.

> **The one exception, and what earned it (2026-08-13, #39).** `V202608081700` was edited in place
> to make its two `spCreateRole` calls adopt-or-skip by name. It qualified on a test worth reusing
> before anyone claims the exception again: **the file could not apply at all** on the hosts that
> needed fixing — `Role.Name` is UNIQUE and `spCreateRole` is a bare INSERT, so on any database where
> `Form Respondent` already existed it failed with `Msg 2627` and halted the chain, which means a
> repair shipped as a LATER migration could never have run there. Editing the file was the only path
> to a chain that applies. It is safe for hosts that already applied it because Skyway's `Migrate()`
> resolves applied migrations by version and never checksum-validates them (checksums live only in
> the separate `Validate()`), so an applied host skips the file and a stuck host runs the corrected
> text. The edit changed no record — only how the role id is resolved — so `metadata/` and the seed
> manifest were untouched. Everything else #39 fixed shipped as a new migration
> (`V202608131600__v0.10.x__Respondent_Grant_Hardening.sql`), which is the rule, not the exception. A later metadata change becomes
`V<newstamp>__v<ver>__Metadata_Sync.sql` containing just that change's records, exactly as
`bizapps-tasks` ships two. (Regenerating the *whole* seed into a new file also works and is simpler
to produce, but then it must be written to tolerate rows that already exist.)

**Nothing generates this at build time.** There is no CI step that produces a seed; the gate only
detects that you owed one. That is deliberate — generating it requires a database whose Forms
metadata is empty, which no build agent has.

## Regenerating the metadata seed

The push must run against a database whose Forms metadata is empty, or it logs `spUpdate*` calls
instead of `spCreate*` and the result is not replayable on a fresh install.

```bash
# 1. Work on a COPY. Never generate against MJ_Forms_Dev.
#    BACKUP MJ_Forms_Dev / RESTORE AS MJ_Forms_SeedGen, then against the copy:
#      - run migrations-teardown/V001 (with ${mjSchema} -> __mj) to clear the core rows
#      - DELETE the Forms business data + FormStyle + FormCategory
#      - RE-CREATE the three 7F0E000x row-level-security filter records (#39). The teardown you
#        just ran deleted them, correctly — they are Forms-owned and in its doom list — but the
#        four Form Respondent permission records reference them by @lookup, so the push cannot
#        resolve them. Re-run just the filter section of
#        V202608131600__v0.10.x__Respondent_Grant_Hardening.sql. If you skip this the push FAILS
#        LOUDLY ("Lookup failed: No record found in 'MJ: Row Level Security Filters'"), which is
#        the point: it cannot quietly regenerate a seed that re-grants unfiltered create.
#        The filter RECORDS cannot live in metadata/ — MJ grants no role Create on
#        'MJ: Row Level Security Filters', so pushing them is refused. Only the references are
#        expressible there.
# 2. Push. Expect every directory to report "created" and none to report "updated".
DB_DATABASE=MJ_Forms_SeedGen npx mj sync push --dir metadata --exclude users --ci
# 3. The log lands in metadata/sql_logging/. Two substitutions are REQUIRED before it can ship:
#      ${flyway:defaultSchema} -> ${mjSchema}          on every core SP call (all of them)
#      literal [__mj_BizAppsForms] -> [${flyway:defaultSchema}]  on the Forms-schema SP calls
#    MetadataSync writes core SP calls with the default-schema placeholder because in MJ's own
#    repo the default schema IS the core schema. Here it is __mj_BizAppsForms, so shipping the
#    log verbatim calls __mj_BizAppsForms.spCreateRole — an object that does not exist.
# 4. Move it to migrations/V<stamp>__v<ver>__Metadata_Sync.sql with a header saying what and why.
npm run seed:manifest && npm run lint:distribution
```

Then prove it: empty the copy again and run the migration itself, not the push. Count the records.

## Placeholders

Only two are substituted by `mj app install`, and only these may appear in shipped SQL:

- `${flyway:defaultSchema}` → the app schema (`__mj_BizAppsForms`)
- `${mjSchema}` → the core schema (`__mj`)

Teardown scripts get **only** `${mjSchema}` — MJ substitutes it with a literal string split, with
no Skyway involved. Anything else must be written as a literal schema name. `mj migrate` builds its
map from *this* repo's `mj.config.cjs`, so a third placeholder resolves locally and looks fine;
`mj app install` builds it from the *host's* config, and Skyway deliberately leaves an unknown
`${…}` untouched rather than failing — so it ships as a literal string into whatever SQL contained
it. `npm run lint:distribution` is the gate; `${commonSchema}` is the one that got through before it
existed.

## Other conventions

Hardcoded UUIDs; no `__mj_*` timestamp columns (CodeGen adds them); no FK indexes (CodeGen adds
them); `sp_addextendedproperty` on every business column; single multi-`ADD` `ALTER`s; new tables in
`__mj_BizAppsForms`.
