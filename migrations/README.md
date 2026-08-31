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
| `V…__Metadata_Sync.sql` | `mj sync push --dir metadata --exclude users` against a database built from the shipped chain, shipped as a **new delta** file beside the existing ones | **once per release**, by the build engineer — never in a feature PR |
| `../migrations-teardown/V001__…` | hand-written; retires the seed's core-schema rows on `mj app remove` | the seed gains or loses a root record |

`migrations/codegen/` is gitignored: CodeGen's raw run files are an intermediate, and its SQL is
appended into the feature migration instead.

## Order is a correctness property — `npm run lint:migrations`

Flyway applies these files in version order against a database nobody here has seen. Three
orderings are load-bearing, and all three break in the same silent way: CodeGen is re-run against
a database in state N, its output is appended to a migration that will apply at state N+1, and the
difference between the two states is a column someone added an hour earlier. Nothing errors on the
authoring box, because that box already ran the statements by hand.

1. **A CRUD procedure must not be regenerated from a database that predates a column.** A later
   `DROP`/`CREATE` of `spUpdateX` wins, the `EntityField` row survives, and MJ keeps composing an
   `EXEC` that passes a parameter the procedure no longer has — so *every* save of that entity
   fails with "too many arguments specified", not just saves that touch the new column.
2. **Nothing may reference `__mj_CreatedAt`/`__mj_UpdatedAt` before the migration that adds them.**
   SQL Server resolves column names at `CREATE TRIGGER` time: `Msg 207`, chain halted.
3. **An `EntityField` insert may not precede its `__mj.Entity` row.** CodeGen writes `EntityID` as a
   subquery; on a fresh database it yields `NULL`, the `IF NOT EXISTS` guard passes on the `NULL`
   comparison, and the insert dies on `NOT NULL`.

`scripts/check-migration-order.mjs` enforces all three, `scripts/check-migration-order.spec.mjs`
proves it still fires, and the Migration Order Gate workflow runs both. All three violations above
are reconstructions of defects that actually reached a pull request here (2026-08-19,
`V202608191200` / `V202608191300`), which is why the split into `V202608191400` exists.

## The loop, whenever you touch `metadata/`

```
your PR:      edit metadata/ (declarative JSON only)  →  commit  →  review
the release:  mj sync push against a clean DB  →  ONE consolidated Metadata_Sync  →  ship
```

**A feature PR carries no `Metadata_Sync` migration.** It carries the JSON: fields, `@lookup` /
`@file` / `@parent` references, a `primaryKey` UUID from `uuidgen`, and no `sync` block — the
release push writes that back. The build engineer takes everything merged on `next` and generates
one consolidated seed for the release. This is MJ's model (`MJ/metadata/CLAUDE.md` §1b and §10) and
the reason for it is drift: per-PR sync migrations duplicate the release step, produce many small
files instead of one per build, and diverge from what the real push emits.

`npm run check:release-seed` is the release-readiness check and the answer to "what does the next
seed still owe?" — it walks every `primaryKey` under `metadata/` and reports the ones that appear in
no shipped migration. No database, runs anywhere, and it reproduces that list from the repo rather
than asking anyone to maintain one. It runs in `publish.yml` before anything is published or
tagged; it is deliberately **not** on `lint:distribution` or the Distribution Gate workflow, because
no feature PR can answer a question about a seed generated after it merges.

`npm run lint:distribution` still reads whatever seed you regenerate: its CHECK 3 refuses a seed
sorting after `V202608131600` that grants the anonymous `Form Respondent` role anything MJ would not
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
> text. The edit changed no record — only how the role id is resolved — so `metadata/` and the hash
> manifest that then existed were untouched. Everything else #39 fixed shipped as a new
> migration (`V202608131600__v0.10.x__Respondent_Grant_Hardening.sql`), which is the rule, not the
> exception.

So a release's metadata changes become one new `V<newstamp>__v<ver>__Metadata_Sync.sql` carrying that
release's records. That delta is the path below.

**Three `Metadata_Sync` files are here, and only ONE of them is shipped history.** They are the
migrations that seed records **declared under `metadata/`** — the property `npm run check:release-seed`
tests, and the one the release cadence is about. Two are `mj sync push` output; `V202608241800` was
hand-written against the shape of the generated blocks because the author had no database to push
from, and its header says so. That is the practice #105 ends, not a fourth category.

| file | in a release tag? | what that means |
|---|---|---|
| `V202608081700__v0.8.x__Metadata_Sync.sql` | **yes** — `v0.8.0`, `v0.9.0`, `v0.10.0` | append-only history. Hosts ran it. **Never rewrite or delete it.** |
| `V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql` | **no** | on `next` only. Has reached nobody. Belongs in the next consolidated seed. |
| `V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql` | **no** | same. |

**The append-only argument covers the first row and nothing else** — an earlier draft of this
section applied it to all three, which would have frozen two deltas that never shipped and carried
the retired per-PR cadence into the first release under the new model. A seed that is not in a
release tag has reached no host, so nothing depends on it having been applied, and folding it into
the release's consolidated seed is free. Check it, don't recall it:

```bash
git tag --list 'v*' | while read t; do
  git ls-tree --name-only "$t" migrations/ | grep -i metadata_sync | sed "s/^/$t /"
done
```

`npm run check:seed-cadence` enforces exactly this: **at most one unreleased `Metadata_Sync`** — the
release's own. Two or more means the per-PR loop came back. It runs at the release in `publish.yml`,
beside the coverage check, and it will be **red on the first release after #105** until those two
rows are folded in. That is the check working, not a defect.

> **Not the same family, and not affected by #105.** Other migrations here also write `__mj` rows —
> `V202608191300`, `V202608191400`, `V202608252300` — but that is **CodeGen** metadata: the
> `Entity` / `EntityField` rows behind a schema change, not a seed push. Those still ship in the
> feature migration that needs them, exactly as before, and `check-migration-order` exists because
> of their ordering. #105 changed the cadence of the metadata **seed** and nothing else. Counting
> the two families together is how this paragraph previously said "six".

**Nothing generates this at build time.** There is no CI step that produces a seed — generating one
requires a database with MJ and both sibling apps installed, which no build agent has. What CI does
at release is *detect* that you owed one: `npm run check:release-seed`, in `publish.yml`.

## Regenerating the metadata seed

**Release work, done once per release by the build engineer.** Push against a database migrated to
head, and ship what comes out as one new delta file. The push logs only what actually changed —
`spCreate*` for records added since the last release, `spUpdate*` for records edited — and that
delta appends to the chain rather than replacing it. This is the whole recipe; you do not need the
appendix.

Start by asking what the seed owes: `npm run check:release-seed` lists every `primaryKey` under
`metadata/` that no migration names.

**An empty list does not mean there is nothing to generate.** The check reads ids, not content, so a
record whose id already ships but whose *body* changed — a `@file:` template, a reworded description
— passes it silently. Generate the seed anyway if `metadata/` moved at all since the last release
(`git diff v<last> -- metadata/`); the push emits `spUpdate*` for those by construction, which is
the half no repo-side check can see.

```bash
# 1. Build the generation database from the SHIPPED CHAIN, not from dev work. Start empty and run
#    `mj app install` for this app, which installs bizapps-common, then bizapps-tasks, then Forms,
#    and leaves you at head. Restoring a backup of MJ_Forms_Dev is the tempting shortcut and the
#    wrong one: a dev database holds records no seed ever shipped, so the push diffs against rows a
#    fresh install does not have and emits spUpdate* calls that quietly match nothing there.
#    Nothing in CI detects that: check:release-seed asks whether an ID is NAMED by the shipped SQL,
#    not whether the statement naming it can replay on a host. Only a clean install proves that.
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
npm run lint:distribution && npm run check:release-seed
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
on every push and PR that touches `migrations/`, `migrations-pg/`, `migrations-teardown/`,
`mj-app.json` or the gate's own sources — **not** `metadata/`, which #105 removed from its triggers
because the gate reads shipped SQL and can say nothing about declarative JSON). Any
seed sorting after `V202608131600` grants the anonymous `Form Respondent` role a filtered create or
read, or nothing at all: a `CanCreate`/`CanRead` whose RLS filter is cleared, omitted or NULL fails,
`CanUpdate`/`CanDelete` for that role fails outright, and one of the four guarded grants pointed at
a filter record other than its own `7F0E000x` fails. `V202608131600` asserts the same invariant on
the host, but only at its own point in the chain — a regenerated seed carries a later timestamp and
would otherwise silently win (#41). If it fires, the fix is in `metadata/`, never in the gate.

**Cadence: one seed per release, like MJ (#105, 2026-08-30).** This repo used to regenerate per
feature, held there by a CI check comparing `metadata/` to a hash manifest. That check was retired:
it inferred "the seed ships this record" from the presence of a manifest key, which is a silent pass
in one direction — regenerate the manifest without regenerating the seed and it goes green while the
record reaches no host. `bizapps-sales` hit exactly that.

What replaced it is a check on the property rather than the proxy (`npm run check:release-seed`),
run at the release rather than on every PR. The earlier decision was recorded in
`plans/RESEARCH-METADATA-SYNC-RELEASE-PRACTICE.md`, whose comparison remains accurate and whose
conclusion this reverses — it carries a note saying so. The risk it named is real and is now
answered rather than avoided: MJ, bizapps-common and bizapps-caliber all document their release step
with "no automated detection at all", and caliber shipped v6.0.0 in violation of its own step. Here
the release step is checked automatically, in `publish.yml`, before anything is published or tagged.

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
npm run lint:distribution && npm run check:release-seed
```

Then prove it: empty the copy again and run the migration itself, not the push. Count the records.

The FAILS-LOUDLY property above is a backstop, not the gate. It fires only for whoever runs this
recipe, on their own machine, and only while the filter records happen to be missing. CHECK 3 is
what fires in CI for everyone, on the file that actually ships — and post-watershed, the output of
this recipe has to satisfy it like any other seed.
