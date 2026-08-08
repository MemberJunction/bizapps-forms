# Distribution seed plan — the metadata sync migration Forms never shipped

**Status: steps 1–3 and 5–7 DONE and verified on 2026-08-08** (branch
`feat/distribution-metadata-seed`). Step 4 — the fresh-DB `mj app install` rehearsal — is the one
piece not done; see §7 for what was proved instead and what that does not cover.

Written 2026-08-08, from a read of `MJ` @ `v5.51.0` (`packages/OpenApp/Engine`,
`packages/MetadataSync`, `packages/MJCLI`, `@memberjunction/skyway-core`) and of the two sibling
Open Apps that get this right (`bizapps-common`, `bizapps-tasks`).

---

## The question that started this: do we author an `mj sync` migration for an MJ upgrade?

**No — and that part is correct as-is.** MJ ships its *own* metadata sync as a core migration
(`MJ/migrations/v5/V202607311852__v5.51.x__Metadata_Sync.sql`, and one per release band back to
5.37). `npx mj migrate -t v5.51.0` applies it to `__mj`. Nothing for this repo to author, and
`0d32627 chore(deps): bump MJ to 5.51.0` correctly touched only pins + `CLAUDE.md`.

**Nor a CodeGen migration for *this* bump.** `git diff v5.50.0 v5.51.0 -- packages/CodeGenLib` is
4 files: `CHANGELOG`, `package.json`, `GenerateClassRegistrationsManifest.ts` and its test. The
change is to the **TypeScript** class-registration manifest generator; no SQL template moved, so
nothing in `__mj_BizAppsForms`'s generated SPs/views needs regenerating for 5.51.0. (That is a
per-upgrade judgement, not a standing rule — see §6.)

**But the question exposed a real one.** Forms has never shipped a metadata seed migration *at
all*, for any release. Everything `mj sync push` created lives only in `MJ_Forms_Dev`.

---

## 1. Why this is a blocker, in MJ's own words

`MJ/packages/OpenApp/Engine/src/manifest/manifest-schema.ts` (the `metadata` block, lines 121–129):

> Dev-time-only pointer to the directory whose metadata is the source of truth for the app's seed
> migrations. **The install engine NEVER reads this at install** — seeding happens exclusively
> through the app's Skyway `migrations/` (generated from this directory via `mj sync push` at
> build time). Kept purely as documentation of where the metadata lives.

So `mj-app.json`'s `"metadata": { "directory": "metadata" }` is documentation. The install flow
(`install-orchestrator.ts`, step 8) runs migrations and nothing else that could seed metadata.

What the siblings do, and Forms does not:

| Repo | seed migration | `.mj-sync.json` `sqlLogging` |
|---|---|---|
| `bizapps-common` | `V202605141122__v5.29.x__Metadata_Sync.sql` (1564 lines) | — (hand-assembled) |
| `bizapps-tasks` | `V202606101616__v1.0.x__Metadata_Sync.sql` + `V202606231615__v1.1.x__Metadata_Sync.sql` | `enabled: true, formatAsMigration: true` |
| **`bizapps-forms`** | **none** | **block absent** |

That missing `sqlLogging` block in `metadata/.mj-sync.json` is the mechanical cause: with it,
`mj sync push` emits a migration-ready SQL log (`MetadataSync/src/lib/sql-logger.ts`, gated on
`syncConfig?.sqlLogging?.enabled ?? false`); without it, every push this repo has ever run wrote
to the dev DB and left no artifact.

### What is currently stranded in `MJ_Forms_Dev`

Counted from `metadata/**/*.json` (all dotfiles):

| Directory | Records |
|---|---|
| `roles` (incl. **Form Respondent**) | 2 |
| `entity-permissions` (the response-only `CanCreate` grants) | 15 |
| `form-styles` | 11 |
| `form-categories` | 9 |
| `actions` | 6 |
| `applications` / `application-roles` / `dashboards` | 1 / 2 / 2 |
| `ai-prompts` + `templates` + `ai-prompt-categories` + `action-categories` | 2 + 2 + 1 + 1 |
| `user-views` | 1 |
| `users` | 1 ⚠️ (see G5) |

≈ **56 records**. Confirmed absent from the migrations: `grep` for inserts/`spCreate*` against
`Role`, `Application`, `ApplicationRole`, `Dashboard`, `AIPrompt`, `Template`, `Action`,
`UserView`, `AuthorizationRole` across all five migration files returns **0**. The only
`EntityPermission` rows present are CodeGen's automatic three-role defaults per entity — the
Form Respondent grants are not among them.

**Consequence:** a clean `mj app install mj-bizapps-forms` produces a Forms install with no
respondent role, no response-write permission, no styles, no categories, no app/nav, no
dashboards and no AI authoring. The anonymous submit path — the product — cannot work, and it
fails the same way Phase 1 failed on 2026-07-30: everything reports success.

---

## 2. Gap list

| # | Gap | Severity | Evidence |
|---|---|---|---|
| **G1** | No metadata seed migration; ~56 records ship nowhere | **Blocker** | §1 |
| **G2** | `metadata/.mj-sync.json` has no `sqlLogging` block, so no artifact can be produced | **Blocker** (enabler for G1) | vs. `bizapps-tasks`' config |
| **G3** | `${commonSchema}` (28 uses) does not resolve at install time | **Medium** | §3 |
| **G4** | No `migrations.teardownDirectory`; `mj app remove` strands our core-schema rows | Medium | `manifest-schema.ts` L108–116; `bizapps-caliber/migrations-teardown/` |
| **G5** | `metadata/users/.users.json` seeds a user — environment-specific, must not enter a migration | Medium | see below |
| **G6** | CodeGen-append discipline is manual and unchecked by CI | Medium | §6 |
| **G7** | `SchemaInfo.EntityNamePrefix` is not seeded; host CodeGen names post-install additions without `MJ_BizApps_Forms: ` | Low | §7 |

---

## 3. G3 — `${commonSchema}` silently does not resolve on a host install

`mj.config.cjs` declares `{ schema: '__mj_BizAppsCommon', placeholder: '${commonSchema}' }`, and
`mj migrate` maps `schemaPlaceholders` into Skyway's placeholder map — which is why
`npm run mj:migrate` works locally. **At install time the app's `mj.config.cjs` is never read.**
`install-orchestrator.ts:1678` passes `ExtraPlaceholders: context.MigrationPlaceholders`, and
`MJCLI/src/utils/open-app-context.ts:164` sources that from the **host's**
`config.openApps?.migrationPlaceholders`. A host has no reason to define `commonSchema`.

Skyway then leaves it alone — deliberately (`skyway-core/dist/executor/placeholder.js`: "Unknown
placeholder — leave it untouched", unlike Flyway). So no error is raised; the literal string
`${commonSchema}` survives into the SQL.

All 28 occurrences sit inside `@ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},…'`
arguments to `spUpdateExistingEntitiesFromSchema`, `spUpdateExistingEntityFieldsFromSchema`,
`spDeleteUnneededEntityFields`, `spSetDefaultColumnWidthWhereNeeded` and
`spUpdateSchemaInfoFromDatabase` in `V202608072330` and `V202608081200`. So it does not crash — it
fails to exclude `__mj_BizAppsCommon`, and our migration sweeps another installed app's entity
metadata. That is precisely the contamination class that `#10` / `73a3290` already cost this repo
once.

**Fix:** hardcode the literal schema names in those `@ExcludedSchemaNames` lists (they are string
data, not identifiers — no placeholder needed), *or* drop `${commonSchema}` from
`schemaPlaceholders` in `mj.config.cjs` so CodeGen never emits it. Prefer the second: it fixes the
source rather than each generated copy. Either way the existing two migrations must be edited —
they are unapplied on every environment but the dev DB, so check `flyway_schema_history` checksums
before editing, and re-baseline the dev DB if they are already recorded.

---

## 4. G5 — do not ship `metadata/users/.users.json`

A `User` row is host-environment identity, not app metadata. `bizapps-common` and `bizapps-tasks`
ship none. Exclude `users/` from the generated migration (and consider dropping it from
`directoryOrder`, keeping `metadata/users/README.md` to explain that it is a local-dev convenience).
Same review pass for `user-views` (1 record): a saved view owned by a dev user will carry a
`UserID` that does not exist on the host — either re-own it to the system user or drop it.

---

## 5. The plan

Ordered; each step is its own commit. Steps 1–4 are the blocker.

### Step 1 — turn on SQL logging for metadata sync *(G2)*
Add to `metadata/.mj-sync.json`, mirroring `bizapps-tasks`:

```jsonc
"sqlLogging": {
  "enabled": true,
  "outputDirectory": "./sql_logging",
  "formatAsMigration": true,
  "filterPatterns": ["*spCreateAIPromptRun*", "*spUpdateAIPromptRun*"],
  "filterType": "exclude"
}
```
Add `sql_logging/` to `.gitignore` (raw logs are an intermediate, like `migrations/codegen/`).
Commit: `chore(metadata): emit migration-ready SQL from mj sync push`.

### Step 2 — regenerate the seed from a clean database *(G1)*
The push must run against a DB whose Forms metadata is **empty**, or the log records updates
instead of creates and the migration is not replayable on a fresh install.

1. `docker commit forms-sql forms-sql-snapshot:pre-seed-gen` (the dev DB is the only copy of this
   metadata — snapshot before touching it).
2. Stand up a scratch DB: run `npm run mj:migrate` + host CodeGen against an empty database so the
   Forms schema and entity rows exist but no app metadata does.
3. `npx mj sync push --dir metadata` against the scratch DB. Expect ~56 records **created**, 0
   updated. Any "updated" means the target was not clean — stop and reset.
4. Move `sql_logging/<session>.sql` to
   `migrations/V<YYYYMMDDHHMM>__v0.8.x__Metadata_Sync.sql`, and hand-edit the header the way
   `bizapps-common`'s does: what ships, why, and which records were deliberately excluded.
5. Strip the `users/` (and, per G5, possibly `user-views/`) sections.
6. Verify placeholders: core-schema references must be `${mjSchema}`, Forms-schema references
   `${flyway:defaultSchema}`, and **no `${commonSchema}`** (G3).

Commit: `feat(distribution): ship the metadata seed as a migration`.

### Step 3 — fix the unresolved placeholder *(G3)*
Drop `${commonSchema}` from `mj.config.cjs` `schemaPlaceholders`; replace the 28 occurrences in
`V202608072330` and `V202608081200` with the literal `__mj_BizAppsCommon`. Verify no other
generated artifact depends on the placeholder. Commit:
`fix(migrations): resolve the common-schema exclusion at install time, not just locally`.

### Step 4 — verify by installing, not by reading *(the only step that proves anything)*
On a **fresh, empty** SQL Server database, with no `openApps.migrationPlaceholders` configured on
the host — i.e. what a stranger gets:

`mj app install` (common → tasks → forms) → `mj codegen` → restart MJAPI → grep the startup log
for `not found in metadata` (must be clean) → `npm run smoke:respondent <slug>` against a form
created through the builder.

The smoke test is the acceptance criterion. A green `npm test` is necessary and not sufficient
for anything on the public path — that is the lesson already written into the Phase 1 snapshot.

### Step 5 — teardown scripts *(G4)*
Add `migrations-teardown/V001__Retire_Forms_Core_Rows.sql` (inverse `DELETE`s for the role,
entity permissions, application + application-roles, dashboards, AI prompts/templates/categories,
actions/action-categories, user views) and declare
`"teardownDirectory": "migrations-teardown"` in `mj-app.json`. Pattern:
`bizapps-caliber/migrations-teardown/V001__Retire_Caliber_Core_Rows.sql`. Dropping
`__mj_BizAppsForms` does not reach any of these — they live in `__mj`.
Commit: `feat(distribution): retire Forms' core-schema rows on remove`.

### Step 6 — close the loop so this cannot silently recur *(G6)*
1. **CI check:** fail the build when `metadata/**` changed in a commit range without a
   corresponding new/edited `*__Metadata_Sync.sql` — the same shape of check as
   `lint:generated`. Metadata drift is invisible otherwise; that is how 56 records went unshipped
   across nine months of commits.
2. **CI check:** fail when `migrations/*.sql` contains a `${...}` token outside the three
   supported names (`flyway:defaultSchema`, `mjSchema`, plus anything the host is documented to
   provide). Catches G3-class regressions at authoring time.
3. **`CLAUDE.md` — Migrations section:** state that metadata changes ship as a `Metadata_Sync`
   migration generated by `mj sync push`, and that `mj-app.json`'s `metadata.directory` is
   dev-time-only documentation MJ never reads at install.
4. **`.claude/skills/mj-upgrade/SKILL.md` step 16:** today it says
   `npm run mj:migrate` → `npx mj sync push --dir metadata` → `npm run mj:codegen`. Amend to:
   after the push, if it created or updated *any* record, the emitted SQL log becomes a new
   `Metadata_Sync` migration — a push whose result exists only in the dev DB is an unshipped
   change. Add the same rule for CodeGen: diff `packages/CodeGenLib` between the old and new MJ
   tags; if any **SQL** template moved, the regenerated schema SQL must ship as a migration
   (for 5.51.0 it did not — TypeScript-only).

### Step 7 — seed the entity-name prefix *(G7)*
Insert `SchemaInfo.EntityNamePrefix = 'MJ_BizApps_Forms: '` for `__mj_BizAppsForms`. Our shipped
`Entity` rows already carry prefixed names, so nothing existing is wrong — but a host CodeGen run
that adds an entity later resolves the prefix from its own `mj.config.cjs` (which lacks our rule)
and then from `SchemaInfo` (which lacks our row), and names it bare. Reference and full rationale:
`bizapps-caliber/migrations/V202608041800__v1.0.x__SeedSchemaInfoEntityNamePrefix.sql`, which
documents that `spUpdateSchemaInfoFromDatabase` never overwrites `EntityNamePrefix`, so the value
is set once and survives. Cheap insurance; fold into Step 2's migration or ship standalone.

---

## 6. Standing rule this plan establishes

Two artifacts leave the dev database only if something writes them into `migrations/`:

- **metadata** — `mj sync push` output, whenever `metadata/**` changes;
- **generated schema SQL** — CodeGen output, whenever the schema changes *or* an MJ upgrade moves
  a CodeGen SQL template.

`migrations/codegen/` is `.gitignore`d here (a deliberate Phase 1 decision — the raw run files are
an intermediate), and the repo's convention is to **append** CodeGen's SQL beneath the hand-DDL in
the feature migration, marked `-- CodeGen output (appended) — regenerated; do not hand-edit below
this line.` (`V202606301305`, `B202606281200`). `bizapps-tasks` instead tracks
`migrations/codegen/*.sql` directly. Either is fine; ours depends on an unenforced manual step,
which is what Step 6.1/6.2 exist to enforce.

---

## 7. Outcome (2026-08-08)

### Shipped

| Step | Artifact | Verified by |
|---|---|---|
| 1 | `metadata/.mj-sync.json` gains `sqlLogging.formatAsMigration` | the push below produced a log at all |
| 2 | `migrations/V202608081700__v0.8.x__Metadata_Sync.sql` — **80 records** | replayed on an emptied database; all 80 present |
| 3 | `${commonSchema}` removed from 2 migrations + `mj.config.cjs` | `npm run lint:distribution` |
| 5 | `migrations-teardown/V001__Retire_Forms_Core_Rows.sql` + `mj-app.json` | run against a used database; postcondition passed |
| 6 | `scripts/check-distribution-seed.mjs` + `.spec.mjs`, `write-seed-manifest.mjs`, `distribution-gate.yml`, doc updates | 7/7 self-tests |
| 7 | `migrations/V202608081800__v0.8.x__Seed_SchemaInfo_EntityNamePrefix.sql` | `SchemaInfo.EntityNamePrefix` was confirmed NULL even in dev |

**How the seed was generated.** `MJ_Forms_Dev` was backed up and restored as `MJ_Forms_SeedGen`;
the teardown script emptied its core rows, a companion script cleared the Forms business data, and
`mj sync push --dir metadata --exclude users --ci` reported **80 created, 0 updated, 0 errors**.
The scratch database was then emptied again and the *migration* — not the push — was replayed
against it, yielding all 80 rows. `MJ_Forms_SeedGen` has been dropped; `MJ_Forms_Dev` was never
written to.

### Three defects found by running things, not reading them

1. **The generator's output cannot ship verbatim.** MetadataSync writes core stored-procedure calls
   with `${flyway:defaultSchema}` because in MJ's own repo the default schema *is* the core schema.
   Here it is `__mj_BizAppsForms`, so all 65 core calls would have executed as
   `__mj_BizAppsForms.spCreateRole` — an object that does not exist — on every install. Rewritten
   to `${mjSchema}`; the 20 Forms-schema calls went the other way, literal → placeholder.
2. **The teardown could not remove a used installation.** `mj app remove` runs teardown *before*
   dropping the app schema, so `FormAutomation` rows are still present and still referencing the
   Actions being retired. Leaving them blocks the delete (`FK_FormAutomation_Action`); NULLing the
   reference violates `CK_FormAutomation_SingleTarget`. Either way the single transaction rolls
   back and the app cannot be removed at all. Fixed by treating own-schema references as doomed
   rather than released, and by letting the FK walk span both schemas so `FormAutomationRun`
   follows its parent. A pristine canary database has no automation rows and passes either way —
   which is exactly how this would have shipped.
3. **The gate caught a leak on its first run**: the seed migration's own header comment contained
   the literal `${commonSchema}`. Reworded rather than teaching the gate to skip comments — a
   placeholder in a comment today is a placeholder pasted into SQL tomorrow.

### Drift found between `metadata/` and the live dev database

`metadata/` has never been the source of truth for `MJ_Forms_Dev`:

- the **`Forms Automation Runner` role** exists in dev at `11111111-…-555555555004`, created by
  `smoke/seed-binding-smoke.mjs`, not at the `5154187D-…` the metadata declares — they collide on
  `Role.Name`, which is UNIQUE, so the push fails against dev until one is removed;
- the **`Forms Automation Service` user** likewise (`11111111-…-003`, and a different email).

The seed ships the metadata GUIDs. Reconciling dev is a separate, deliberate act — see §8.

### The `users/` decision, which is reversible and should be reviewed

The seed is generated with `--exclude users`, so a fresh install gets the automation **role** but
not the **user**, and automations stay off until an operator provisions one. This follows
`service-principal.ts` ("the USER itself is a deployment step, deliberately") and contradicts
`metadata/users/README.md`, which argued for seeding it to produce a better first failure. Both
were written for the merged automation layer; they disagree. The conservative reading won because
writing a `User` row into a host's identity table is the higher-consequence direction. To reverse:
drop `--exclude users`, regenerate the seed, `npm run seed:manifest`.

## 8. What is left

1. **Step 4 — the fresh-DB `mj app install` rehearsal.** What was proved is that the migration
   replays and the teardown reverses it, on a *copy of a working database*. What that does not
   cover is the install ORDER on a genuinely empty host: common → tasks → forms, then `mj codegen`,
   then MJAPI startup, then `npm run smoke:respondent`. That remains the acceptance test.
2. **`MJ_Forms_Dev` is deliberately untouched.** It does not have the two new migrations, and
   applying the seed to it will fail on duplicates until the drift above is reconciled (tear down
   with `migrations-teardown/V001`, clear the smoke-seeded role/user, then `npm run mj:migrate`).
   `V202608081800` (SchemaInfo) is idempotent and safe to apply on its own. Note that the two
   edited migrations now have stale recorded checksums — harmless, because Skyway's `Migrate()`
   does not call `Validate()`, but `mj migrate` repair would realign them.
3. **The metadata JSON files carry rewritten `sync` blocks** from the scratch-DB push. Content is
   unchanged (verified: only `.mj-sync.json` differs in substance) and the gate ignores `sync` by
   design, but the diff noise can be reverted if preferred.
