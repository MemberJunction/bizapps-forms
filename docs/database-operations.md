# Database operations: `mj migrate`, `mj codegen`, and MJ upgrades

Three commands touch the database. Each has a way of going wrong that **reports success**, which is
why this file exists and why it leans on exit-code-independent verification throughout.

Every rule below was verified against source in the MJ checkout or against this repo. Where a claim
comes from MJ, the path and line are cited so you can re-check rather than trust.

> **Prerequisite reading:** [`docs/local-host.md`](local-host.md) for which host serves what, and
> [`migrations/README.md`](../migrations/README.md) for authoring migrations and release cadence.
> This file covers *running* things, not writing them.

---

## 0. First: which database are you about to change?

In the shared dev workspace every repo points at **one** SQL Server database. MJ states the rule
(`MJ/migrations/CLAUDE.md:245`):

> **ONE DATABASE PER AGENT — never point two sessions at the same one.** Before running
> `mj migrate`, `mj codegen`, or `mj sync push`, confirm the database in your `.env` is not in use
> by another agent or another session.

A git worktree does **not** isolate the database. Two concurrent `mj codegen` runs from any two
repos collide, both report success, and the damage surfaces in someone else's server log.

```bash
node -p "require('dotenv').config().parsed.DB_DATABASE"   # what you are about to change
lsof -nP -iTCP:4000 -iTCP:4201 -sTCP:LISTEN               # is a host serving that database?
```

If a host is up, it is serving the **main checkout**, not your worktree. Migrating from a worktree
moves the data ahead of the code the host is running. Either stop the host, bring the main checkout
to the same commit straight after, or — better — [build your own database](#4-clean-room-build).

---

## 1. `mj migrate` — three different commands that look alike

| You want | Command | Schema | Migrations applied |
|---|---|---|---|
| MJ **core** schema | `npx mj migrate -t v<version>` | `__mj` | MJ's own, fetched at that git tag |
| **This app's** schema | `pnpm run mj:migrate` | `__mj_BizAppsForms` | `./migrations` |
| — | `npx mj migrate` (bare) | **`__mj`** | **`./migrations`** ← almost never what you want |

### Why bare `mj migrate` is dangerous *here specifically*

`packages/MJCLI/src/commands/migrate/index.ts:56`:

```ts
const ref = flags.tag ?? (flags.dir ? undefined : config.mjRepoVersion);
```

`mjRepoVersion` is a release tag written by `mj install` so a bare migrate matches the installed
code. **This repo's `mj.config.cjs` sets neither `mjRepoVersion` nor `migrationsLocation`**, so a
bare `mj migrate` falls through to the defaults — `migrationsLocation: 'filesystem:./migrations'`
and `coreSchema: '__mj'` (`packages/MJCLI/src/config.ts:122,126`). That is *"apply Forms' migrations
to the core schema"*: it is how an app's tables end up inside `__mj`.

`pnpm run mj:migrate` is safe because it always passes `--schema __mj_BizAppsForms --dir ./migrations`.

### The watermark, and why `N applied` proves nothing

The CLI reads `MAX(version)` from the target schema's history, skipping failed rows, and fetches only
migrations strictly newer. A real core run opens with:

```
Detected installed migration version: <N> — fetching only migrations newer than it.
```

Two failure modes, both silent:

- **No watermark line at all** ⇒ you are not migrating core. Stop.
- **`<N>` higher than the true frontier** ⇒ poisoned history. Every migration below it is hidden
  permanently. Record the frontier *before* migrating and compare.

**Never judge success by the applied count.** `R__RefreshMetadata.sql` is repeatable, so an
already-current run and a fully-skipped run both report `1 applied` and exit 0. Judge by the frontier
moving:

```sql
SELECT MAX(version) FROM __mj.flyway_schema_history WHERE version IS NOT NULL AND success = 1;
SELECT COUNT(*) FROM __mj.Entity;                                    -- must not shrink
SELECT COUNT(*) FROM __mj.flyway_schema_history WHERE success = 0;   -- must be 0
```

### An app migrate also heals core metadata — know this before you blame CodeGen

After a successful Open App migrate, the CLI runs six core procs scoped to your schema
(`MJ/packages/OpenApp/Engine/src/install/open-app-metadata-refresh.ts:94-101`):

```
spRecompileAllViews (@IncludedSchemaNames = your schema)
spUpdateExistingEntitiesFromSchema      spUpdateSchemaInfoFromDatabase
spDeleteUnneededEntityFields            spUpdateExistingEntityFieldsFromSchema
spSetDefaultColumnWidthWhereNeeded
```

The rationale is in that file's header: core gets this from `R__RefreshMetadata`, which never runs in
an app's separate migration history. **Consequence:** `pnpm run mj:migrate` can rewrite your base
views and `EntityField` rows even when the migration you added did none of that.

---

## 2. `mj codegen`

### Flags, with real semantics

| Flag | What it actually does |
|---|---|
| `--skipdb` | Skips before/after SQL scripts, `newUserSetup`, metadata management **and SQL-object generation**. `initSQLLogging` lives inside this branch, so `--skipdb` emits **no `CodeGen_Run_*.sql` at all**. It still connects to the database. |
| `--skipfiles` | Skips file generation only. The database pass still runs. |
| `--force-advanced-gen`, `--format` | Rarely needed. |

Neither flag skips the integrity checks or the AFTER commands — and in this repo the AFTER commands
build four packages (`mj.config.cjs`), so a CodeGen failure can surface as a *build* error.

### What it changes in the database

CodeGen is not read-only and not purely additive. It regenerates base views, CRUD stored procedures
and permissions, and it creates/updates `EntityField` rows. It also **drops** views, procedures and
functions and deletes metadata for tables that have vanished
(`MJ/packages/CodeGenLib/src/Database/manage-metadata.ts:3956,4015`).

Because generation is DROP-then-CREATE, **an interrupted run leaves the database missing objects
that existed before it started**. If a run dies, re-run it to completion before doing anything else.

### Order matters on a database that has never seen CodeGen

```bash
pnpm run mj:migrate              # 1. schema — __mj_BizAppsForms (bare `mj migrate` targets __mj instead; see §1)
mj codegen --skipfiles           # 2. DB SIDE ONLY  ← the step that bites
mj sync push --dir metadata --ci # 3. seed metadata; @lookup refs now resolve
mj codegen --skipdb              # 4. FILES ONLY, from complete metadata
```

Two one-way dependencies force this: `sync push`'s `@lookup:MJ: Entity Fields…` needs rows only
CodeGen's DB pass creates, and file generation needs metadata only `sync push` seeds. Step 2 must not
be a full run — file generation against not-yet-seeded metadata regenerates from an empty set and
deletes real classes. MJ's summary of the failure mode (`MJ/migrations/CLAUDE.md:337`):

> **How you find out you got this wrong: you don't, locally.**

### Turning CodeGen's SQL into a migration

MJ's default output folder is `../../migrations/v5/` (`CodeGenLib/src/Config/config.ts:346`) — an
MJ-monorepo path that is wrong for an app. **This repo already repoints it** to
`./migrations/codegen/` (`mj.config.cjs:118`), which is gitignored *staging*, not shippable output.

To ship it: append the SQL to the migration that caused it, under 50+ blank lines and a do-not-edit
banner, then delete the standalone file. **If your change had no schema DDL there is nothing to
ship — delete the file rather than committing dead SQL.**

Never hand-edit anything under `packages/*/src/generated/`.

---

## 3. Hierarchies: the opt-in you must not forget

If you add a **self-referencing foreign key** (`ParentID`-style), CodeGen will *not* generate the
root-ID function or the base-view lateral join unless you seed metadata saying you meant it.
`MJ/guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md:56-59`:

> CodeGen only generates the TVF suite and base view lateral joins for self-referencing foreign keys
> where `field.IsHierarchy === true`. […] When building new applications or adding recursive tree
> structures to OpenApps, **author a metadata JSON seed file** setting
> `"Configuration": { "Hierarchy": { "IsHierarchy": true } }` on the intended parent field.

The gate landed in MJ `6.1.0-edge.3`. It exists so accidental self-references — `MergedIntoID`,
`PreviousVersionID`, `TemplateSourceFormID` — do not sprout machinery nobody asked for. **Decide
explicitly and seed either value**; `bizapps-tasks` seeds `IsHierarchy: false` for `Tasks.ParentID`
to record the negative decision rather than leave it ambiguous.

Get this wrong and the symptom is nasty: the `EntityField` row exists but the base view does not
produce the column, so every read of the entity fails with `Invalid column name`, **which a grid
renders as "no data" rather than an error — the entity looks empty while its table is full.**

Two implementation notes: author the value as native nested JSON, never an escaped string
(`MJ/metadata/CLAUDE.md:29-31`); and `mj sync push` is a single transaction, so one bad `@lookup`
rolls back the whole push and CodeGen then strips the columns again — which looks exactly like the
fix not working.

> Forms is currently missing this file. See issue #156.

---

## 4. Clean-room build

The only way to prove this repo can produce a working system from what it actually ships. A
long-lived dev database hides defects by already containing rows a migration forgot to create.

```sql
CREATE DATABASE [MJ_<version>_<purpose>];
ALTER AUTHORIZATION ON DATABASE::[MJ_<version>_<purpose>] TO [sa];
```

**Create it owned by `sa`.** If you create it while connected as `MJ_Connect`, that login becomes
`dbo` and MJ's core baseline dies ~12 batches in with *"The login already has an account under a
different user name"* — an error that says nothing about ownership.

Then, **leaf-first**, with `.env` pointed at the new database:

```bash
mj migrate -t v<version>                                          # core __mj
mj migrate --schema __mj_BizAppsCommon --dir ../bizapps-common/migrations
mj migrate --schema __mj_BizAppsTasks  --dir ../bizapps-tasks/migrations
mj migrate --schema __mj_BizAppsForms  --dir ./migrations
mj codegen --skipfiles                                            # the detector
```

Common and tasks are **not optional**: `FormResponse.RespondentPersonID` has a hard FK to
`MJ_BizApps_Common: People`, so Forms' baseline cannot apply without them.

Read the resulting capture rather than reverting it — it is the repo telling you what your working
database had been hiding.

### The same thing, as a check

`npm run check:host-truth` runs exactly the chain above and turns the last step into an assertion:
CodeGen must write **no capture file at all**. That is the only question that reads the same truth a
host does — every other gate here reads the repository — and it is the question nothing was asking
when #201 and #219 shipped.

```bash
# One empty database, owned by [sa], and a DIFFERENT one each time. The check never creates or drops
# a database, and it refuses the one named in .env before it spawns anything — but its "must be
# empty" check can only run AFTER `mj migrate` has reported the watermark, and that same command
# applies everything newer than it. So a non-empty database that is not the .env one gets the core
# chain applied and is refused afterwards. Drop MJ_HostTruth between runs.
docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASSWORD" -C -Q \
  "CREATE DATABASE [MJ_HostTruth]; ALTER AUTHORIZATION ON DATABASE::[MJ_HostTruth] TO [sa];"

npm run check:host-truth -- --database MJ_HostTruth \
  --common-migrations ../bizapps-common/migrations \
  --tasks-migrations ../bizapps-tasks/migrations
```

It takes ~7 minutes, exits 0 on `✅ Converged`, and on failure names every statement CodeGen wanted —
which is the SQL a host would need and will never run, because `mj app install` excludes
`__mj_BizAppsForms` from the host's CodeGen. `.github/workflows/host-truth-gate.yml` runs it nightly,
on manual dispatch, and on pull requests touching any of the eight paths it reads: `migrations/`,
`metadata/`, `mj.config.cjs`, `mj-app.json`, `package.json`, `pnpm-lock.yaml`, `scripts/` and
`.github/workflows/`.

**It runs CodeGen twice, and only the second run is the verdict.** A clean room is not ours alone —
Forms' baseline needs common and tasks for its foreign keys, and at the pinned CLI those schemas'
own unshipped metadata lands in the capture too (measured: 7 `EntityField` writes for
`MJ_BizApps_Common: Organizations` and `Activity Sync Run Details`). It cannot be filtered out after
the fact, because the capture writes `${mjSchema}.EntityField` keyed by an opaque `EntityID` and
names no schema anywhere; filtering on our own `${flyway:defaultSchema}` placeholder instead would
let a metadata-only defect — #219's exact shape — through. So the first pass runs *before* our
migrations and settles everything we do not own, and the second pass can only report what applying
our migrations left unsaid.

---

## 4a. What #303 changed in the database

**Three migrations**, all approved for #303 (2026-10-13) and nothing else:

| Migration | What it does |
|---|---|
| `V202610131349__v0.16.x__FormAutomationRun_WorkQueueMessageID.sql` | Adds nullable `FormAutomationRun.WorkQueueMessageID` (UNIQUEIDENTIFIER), the Work Queue message whose delivery ran the step. It is the run's identity for at-least-once delivery: a redelivery re-runs only the steps with no terminal run carrying that id. **No foreign key** — the queue purges messages on retention and run history outlives them. `NULL` on every pre-existing row, and those rows belong to no delivery. Carries its CodeGen output (EntityField row and the regenerated view/procedures). |
| `V202610131416__v0.16.x__Field_Form_Sections.sql` | Metadata only: sets `GeneratedFormSection = 'Category'` (and a `Category` where one was missing) on five EntityField rows earlier migrations inserted as `'Details'` — two on FormDistribution, two on FormResponse, one on FormAutomationRun — so a host's Explorer files them in their category panels instead of a stray "Details" panel. |
| `V202610132000__v0.16.x__Retire_Respondent_Form_Version_Read.sql` | Core rows only: deletes the `Form Respondent` role's Read grant on Form Versions (matched by role name + entity name, every duplicate) and its `MJ Forms: Respondent Own Form Versions` row-level-security filter, unless another permission row still names that filter. With the grant, any holder of a public link could read the raw `DefinitionSnapshot` — answer key, ending redirects, knockout conditions — through the generated `mjBizAppsFormsFormVersion` resolver (#302); the server now reads the published version as the system user. Idempotent; THROW 51115 if the grant survives. |

None sets **`READ_COMMITTED_SNAPSHOT`**, which the Work Queue requires — that is a host step,
in [`docs/local-host.md` §5](local-host.md#5-host-requirements-since-303-the-work-queue-and-read_committed_snapshot).

**Everything else is metadata**, declared under `metadata/` and shipped at release in the one
consolidated `Metadata_Sync` (see `migrations/README.md`): the 19 `Forms.*` Remote Operations and
their category, the three reporting queries, the `forms.response-submitted` topic and the
`forms.run-automations` subscription, the four builder `RelatedRecordCollection`s, and the
`forms` / `forms:read` / `forms:write` API scopes. So until that release migration exists,
`npm run check:release-seed` reports these records as unseeded — expected, and release work, not a
defect of the branch. What a host built from migrations alone (the clean room above) does without
them, so nobody mistakes it for a code defect:

- The operations still run: with no `MJ: Remote Operations` row, MJ governs an operation by its
  code registration alone (`RemoteOperationEngineBase.IsInvokable`).
- With no topic or subscription row, the API logs which one is missing (at startup, then at most
  once a minute), and **every form refuses respondents** ("This form is not available.") rather than
  store responses whose automations would never run. "Every" is literal: a form that configures no
  automations runs the four legacy hooks, so its completion still owes an `OnComplete` message
  (`submission/queued-automations.ts`). Only a form whose configured steps are all inactive, or none
  of which fires on completion, is served.
- With no reporting queries, `Forms.GetResponseSummary` cannot build the dashboard.
- With no `RelatedRecordCollection` rows, the builder's structural edits (add, delete, reorder)
  have no collections to save through.
- With no `forms:*` API scopes, an API key cannot be granted access to the operations.

**CodeGen gained an output.** `mj.config.cjs` `output` has `{ type: 'RemoteOperations' }`, which
emits `packages/Entities/src/generated/remote_operations.ts` (one `Forms*Operation` class per
`MJ: Remote Operations` row, with its I/O types read verbatim from
`metadata/remote-operations/types/*.ts`). It reads the pushed rows, so a regeneration needs a database
the metadata was pushed to.

**The LTS merge gate.** This branch targets MJ **6.2** (`6.2.0-edge.3` today): the Work Queue,
`CreateIsolatedProvider()` and the lease API exist only there. It does not merge to `next` until
MJ's 6.2 LTS tag ships **and** `@mj-biz-apps/common-*` and `@mj-biz-apps/tasks-*` publish releases
whose MJ peers admit it (`npm view @mj-biz-apps/common-entities peerDependencies`, the same for
`tasks-entities`) — `mj app install` installs them before Forms, so a Forms release they cannot sit
beside is uninstallable. At that point: rev every pin with `.claude/skills/mj-upgrade/scripts/bump-pins.sh <tag>`
(never by hand), rebuild the sandbox from scratch at that tag (below), re-run CodeGen against it,
and re-run `check:host-truth --core-tag <tag>`. The changeset carries the same gate.

**Building a #303 sandbox: from scratch, never upward.** MJ `6.2.0-edge` carries 28 core migrations
versioned *below* 6.1.5's top file, and `mj migrate` runs with `outOfOrder: false`, so a 6.1.5
database migrated upward skips all 28 and reports success. Build it with the clean-room chain above
at `-t v6.2.0-edge.3`. `MJ_Forms303_Edge` was built that way and then advanced to two later core
migrations from MJ `next` (`V202610111907`, `V202610121900`, first shipped in 6.2.0-edge.4), and the
dev host links MJ `next` source — so evidence measured there is `next`-shaped, not edge.3. A sandbox
that must match the pinned MJ exactly is built at the pin's tag and never migrated further.
`check:host-truth` derives its core tag from the `mjVersionRange` floor, prerelease included
(`v6.2.0-edge.3` today); pass `--core-tag` only to build against a different tag.

### Release checklist: guarantees only an opt-in spec proves

CI never sets `FORMS_INTEGRATION_DB`, so the specs below are skipped on every pull request, and a
regression in what they prove **merges green**. Each is a claim about what SQL Server does — a lock,
a rollback, a collation — that no fake provider can hold. Run all of them against a sandbox built
at the release's MJ tag before cutting the release, and record the result in the release PR:

```bash
cd packages/CoreEntitiesServer
FORMS_INTEGRATION_DB=1 npx vitest run \
  src/engines/__tests__/FormSubmissionEngine.integration.spec.ts \
  src/entities/__tests__/form-structure-graph.integration.spec.ts \
  src/reporting/__tests__/FormReportingEngine.integration.spec.ts \
  src/engines/__tests__/FormAuthoringEngine.integration.spec.ts
```

| # | Guarantee | Where it is proven |
|---|---|---|
| 1 | **DW9** — concurrent final saves never exceed `MaxResponses`; the refusal comes from the conditional slot `UPDATE` | `FormSubmissionEngine.integration.spec.ts`, both DW9 cases |
| 2 | **DW10** — a final save commits the response and its `forms.response-submitted` message together, or neither | `FormSubmissionEngine.integration.spec.ts`, both DW10 cases |
| 3 | **Draft promotion is serialised** — two concurrent finals promoting one draft take one slot and queue one message | `FormSubmissionEngine.integration.spec.ts`, "promoting ONE draft" |
| 4 | **Key-only structural saves** — a builder structural edit sends none of the form's columns, so a rename or an archive committed meanwhile survives it | `form-structure-graph.integration.spec.ts`, the rename / archive / page-title cases |
| 5 | **Binary value grouping** — the reporting queries count a choice value by its exact text (`G` and `"g "` are not option `g`) | `FormReportingEngine.integration.spec.ts`, "counts choice values by their exact text" |

Also there, not one of the five but in the same class: a stale builder save after a submission
leaves `ResponseCount` where the slot `UPDATE` put it (final review I2), and clone / create-from-
template / publish-immediately roll back whole (`FormAuthoringEngine.integration.spec.ts`). The
durable fix is a scheduled CI job against a container database; until one exists, this list is the
only thing standing between those claims and a silent regression.

---

## 5. Upgrading the MJ version

The runbook is [`.claude/skills/mj-upgrade/SKILL.md`](../.claude/skills/mj-upgrade/SKILL.md); it is
not repeated here. Three things about it that are easy to get wrong:

**A local build cannot verify a pin.** In the shared dev workspace, `mj-dev/package.json` overrides
every `@memberjunction/*` package to `workspace:*`, so they all resolve to MJ **source** no matter
what this repo's `package.json` says. A green build there proves nothing about the published
tarballs a host installs. Verify in an isolated worktree with its own standalone install, and
confirm what you actually got:

```bash
ls -d node_modules/.pnpm/@memberjunction+* | grep -v <target-version>   # expect: nothing
```

**Build and test with `TURBO_FORCE=true`.** A plain run cache-hits and replays stale logs — a
type-level break against the new MJ then passes unnoticed and you report a green build that proved
nothing.

**The npm bump is not the upgrade.** The core `__mj` schema migration is a separate, destructive
step (§1). A partially-migrated core still installs, builds, tests and boots cleanly; the damage
surfaces later and nowhere near its cause, as `Entity <name> not found in metadata`.

---

## Which MJ documents to trust

| Trust | Covers |
|---|---|
| `MJ/migrations/CLAUDE.md` | Migration authoring, one-database-per-agent, CodeGen ordering |
| `MJ/.claude/skills/bootstrap-clean-db/SKILL.md` | The four-step ordering and why |
| `MJ/guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md` | The `IsHierarchy` opt-in |
| `MJ/metadata/CLAUDE.md` | Metadata authoring, `@lookup` syntax, release-time sync |

| Do not trust | Why |
|---|---|
| `MJ/guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md` | v5-era; prescribes a full `mj codegen` where `migrations/CLAUDE.md` says never |
| `MJ/packages/OpenApp/README.md` §2 | Says app migrations are `V1__Initial_schema.sql`; real apps use the timestamp form |
| `MJ/UPDATES.md` | ~16 months stale; recommends `mj bump --channel edge`, a flag that does not exist |
| `MJ/plans/open-app-spec.md` | Design document, not current behaviour (e.g. claims the migration engine defaults to `flyway`; it is `skyway`) |

One settled disagreement worth recording, because sibling repos state the opposite: **`Migrate()`
never checksum-validates applied migrations.** Checksum verification exists only in the separate
`Validate()` command (`skyway/packages/core/src/core/skyway.ts:166`,
`skyway/packages/cli/src/commands/validate.ts:10`), which nothing runs automatically. Editing an
already-applied migration therefore does not block a later migrate — but see
[`migrations/README.md`](../migrations/README.md) for when editing one is nonetheless wrong.
