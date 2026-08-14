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
| `V…__Metadata_Sync.sql` | `mj sync push --dir metadata --exclude users` against a database migrated to head, shipped as a **new delta** file beside the existing ones | anything under `metadata/` changes |
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
metadata edit and a silent non-ship. Its CHECK 3 then reads what you regenerated: a seed sorting
after `V202608131600` may not grant the anonymous `Form Respondent` role anything MJ would not
row-level filter (#41). See [Regenerating the metadata seed](#regenerating-the-metadata-seed).

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
> (`V202608131600__v0.10.x__Respondent_Grant_Hardening.sql`), which is the rule, not the exception.

So a later metadata change becomes a new `V<newstamp>__v<ver>__Metadata_Sync.sql` carrying just that
change's records, exactly as `bizapps-tasks` ships two. That delta is the default path below.

**Nothing generates this at build time.** There is no CI step that produces a seed; the gate only
detects that you owed one. That is deliberate — generating it requires a database with MJ and both
sibling apps installed, which no build agent has.

## Regenerating the metadata seed

**Push against a database migrated to head, and ship what comes out as a new delta file.** The push
then logs only what actually changed — `spCreate*` for records you added, `spUpdate*` for records
you edited — and that delta appends to the chain rather than replacing it. This is the whole
recipe; you do not need the appendix.

```bash
# 1. Build the generation database from the SHIPPED CHAIN, not from dev work. Start empty and run
#    `mj app install` for this app, which installs bizapps-common, then bizapps-tasks, then Forms,
#    and leaves you at head. Restoring a backup of MJ_Forms_Dev is the tempting shortcut and the
#    wrong one: a dev database holds records no seed ever shipped, so the push diffs against rows a
#    fresh install does not have and emits spUpdate* calls that quietly match nothing there.
#    Nothing detects that — CHECK 1 compares metadata/ to a hash manifest, not to seed contents.
# 2. If you started from a copy rather than empty, bring it to HEAD — core first, then this app:
npx mj migrate -t v<mj-version>     # core __mj — NOT npm run mj:migrate; see the root CLAUDE.md
npm run mj:migrate                  # through V202608131600 and whatever follows it
# 3. Push. Expect a small log: the records you touched, and nothing else.
DB_DATABASE=MJ_Forms_SeedGen npx mj sync push --dir metadata --exclude users --ci
# 4. The log lands in metadata/sql_logging/. THREE edits are REQUIRED before it can ship:
#      ${flyway:defaultSchema} -> ${mjSchema}          on every core SP call (all of them)
#      literal [__mj_BizAppsForms] -> [${flyway:defaultSchema}]  on the Forms-schema SP calls
#    MetadataSync writes core SP calls with the default-schema placeholder because in MJ's own
#    repo the default schema IS the core schema. Here it is __mj_BizAppsForms, so shipping the
#    log verbatim calls __mj_BizAppsForms.spCreateRole — an object that does not exist.
#      @RoleID literal -> (SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Form Respondent')
#    on the Form Respondent permission records. The generator emits whatever id it read from YOUR
#    database; #39 changed the shipped seed to resolve this role BY NAME because it is a shared
#    role a sibling app may have minted under a different id. A literal is unportable, and CHECK 3
#    cannot see a grant bound to an id it does not recognise — see its header.
# 5. Move it to migrations/V<stamp>__v<ver>__Metadata_Sync.sql — a NEW file, beside the existing
#    seeds, with a header saying what changed and why.
npm run seed:manifest && npm run lint:distribution
```

Then prove it on a database that has never seen your dev work: install from empty, run the chain
including your new file, and count the records. Replaying against the copy you generated from proves
nothing — it already contains them.

**Why head, and not an empty database.** Against a migrated-to-head copy the three `7F0E000x`
row-level-security filter records already exist, so the `@lookup` references in the four
`Form Respondent` permission records resolve and the push just works. That is the whole reason this
is the default: the teardown / manual filter re-create ritual in the appendix is not part of the
normal loop, it is what you do when you have to rebuild the seed from nothing.

**"At head" and "from the shipped chain" are two requirements, not one.** Head is what makes the
`@lookup`s resolve; provenance is what makes the delta replayable. A database that is at head *and*
carries records someone created by hand produces a delta that updates rows a fresh install never
had. The from-empty recipe used to prevent this structurally by demanding an empty database; the
delta path has to ask for it explicitly instead.

**What CHECK 3 will hold you to** (`npm run lint:distribution`, and the Distribution Gate workflow
on every push and PR that touches `migrations/`, `migrations-pg/`, `metadata/` or the gate itself). Any
seed sorting after `V202608131600` grants the anonymous `Form Respondent` role a filtered create or
read, or nothing at all: a `CanCreate`/`CanRead` whose RLS filter is cleared, omitted or NULL fails,
`CanUpdate`/`CanDelete` for that role fails outright, and one of the four guarded grants pointed at
a filter record other than its own `7F0E000x` fails. `V202608131600` asserts the same invariant on
the host, but only at its own point in the chain — a regenerated seed carries a later timestamp and
would otherwise silently win (#41). If it fires, the fix is in `metadata/`, never in the gate.

**Cadence: this repo regenerates per feature, and that is a decision, not an omission.** MJ,
bizapps-common and bizapps-caliber all consolidate at release time instead. We do not, because
CHECK 1 makes forgetting the seed impossible here while all three of those repos document their
release step as having "no automated detection at all" — and caliber shipped v6.0.0 in violation of
its own step. Revisit release-time consolidation only if delta files start accumulating noisily per
release, and then adopt it *with* a redesigned enforcement point for CHECK 1, never without.
`plans/RESEARCH-METADATA-SYNC-RELEASE-PRACTICE.md` has the evidence.

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

---

## Appendix — full regeneration (⚠️ BREAK GLASS ONLY)

**You almost certainly want the delta path above.** This one replays *every* record, and it remains
the only way to rebuild the seed from nothing. It is also the only path that needs the teardown, the
manual filter re-create, and a database whose Forms metadata is empty — emptiness is what makes
MetadataSync log `spCreate*` for everything instead of `spUpdate*`.

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
# 3-4. Identical to steps 4-5 of the delta recipe: the same two substitutions, then a NEW
#      V<stamp>__v<ver>__Metadata_Sync.sql. Written from nothing, it must also tolerate rows that
#      already exist on a host that ran the earlier seeds.
npm run seed:manifest && npm run lint:distribution
```

Then prove it: empty the copy again and run the migration itself, not the push. Count the records.

The FAILS-LOUDLY property above is a backstop, not the gate. It fires only for whoever runs this
recipe, on their own machine, and only while the filter records happen to be missing. CHECK 3 is
what fires in CI for everyone, on the file that actually ships — and post-watershed, the output of
this recipe has to satisfy it like any other seed.
