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

## Regenerating the metadata seed

The push must run against a database whose Forms metadata is empty, or it logs `spUpdate*` calls
instead of `spCreate*` and the result is not replayable on a fresh install.

```bash
# 1. Work on a COPY. Never generate against MJ_Forms_Dev.
#    BACKUP MJ_Forms_Dev / RESTORE AS MJ_Forms_SeedGen, then against the copy:
#      - run migrations-teardown/V001 (with ${mjSchema} -> __mj) to clear the core rows
#      - DELETE the Forms business data + FormStyle + FormCategory
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
