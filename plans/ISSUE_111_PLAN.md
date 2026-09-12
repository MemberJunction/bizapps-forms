# Issue #111 — Generate the v0.12 consolidated metadata seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the one consolidated `Metadata_Sync` migration the v0.12 release owes, retire the two unreleased per-PR deltas, and drive `check:seed-cadence`, `check:release-seed` and `lint:distribution` green so `publish.yml` can reach the version bump.

**Architecture:** This is a **database operation**, not a code change. `mj sync push` emits only the difference between `metadata/` and a generation database, so the whole job is building the *right* generation database, pushing, and hand-correcting three placeholder classes in the emitted log before it ships as a migration. There is no application code in this plan and no unit test to write; the verification cycle is the three repo checks plus a replay on a database that has never seen dev work.

**Tech Stack:** SQL Server, MemberJunction CLI (`mj migrate`, `mj sync push`, `mj codegen`), Skyway migrations, Node check scripts.

**Spec:** [`migrations/README.md`](../migrations/README.md) → *Regenerating the metadata seed* (as corrected on this branch), and [issue #111](https://github.com/MemberJunction/bizapps-forms/issues/111) plus [its correction comment](https://github.com/MemberJunction/bizapps-forms/issues/111#issuecomment-5642714181).

---

## Global Constraints

- **MJ core version:** `6.1.0-edge.5`. `mj-app.json` `mjVersionRange` is `>=6.1.0-edge.5 <7.0.0`.
- **Never point `.env` at `MJ_ATS_Dev`** for any step here. It is the shared database MJ's host serves; generating against it both corrupts the seed (it carries dev-only records no seed ever shipped) and desyncs the host from the repo. The `.env` copied into this worktree points there **by default** — Task 1 Step 2 is what makes the rest of the plan safe.
- **Never run `npm run mj:migrate` against a database you did not create for this job.**
- **The generation database is the shipped chain at HEAD *minus* the two unreleased `Metadata_Sync` deltas.** Not "at head" (that strands four records), not "at v0.10.0" (that skips 23 migrations). This is the single fact the whole plan turns on; the reasoning is in `migrations/README.md` under *"At head", "from the shipped chain" and "at the last released metadata level" are three requirements, not one*.
- **New migration filename:** `migrations/V<stamp>__v0.12.x__Metadata_Sync.sql`, flat in `migrations/`, where `<stamp>` is `YYYYMMDDHHMM` and **must be greater than `202609091600`** (the current maximum). `npm run lint:migrations` enforces ordering.
- **Only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL.** A third placeholder ships as a literal string and fails silently on someone else's database.
- **Commits require explicit approval.** `CLAUDE.md` critical rule 1: never run a commit without Soham asking for it. Every commit step below says *request approval first* — that is not optional, and it overrides the skill's "frequent commits" default.
- **Branch:** work continues on `fix/111-consolidated-release-seed`, which already carries the recipe correction. Base is `next`.

## Hazards found while reproducing this (read before Task 1)

1. **A database "at head" silently produces an incomplete seed.** `V202608241800` already created the four `OnSubmit` `ActionParam` records, so on a head database they match `metadata/` and the push emits **nothing** for them. Delete the delta afterwards and those ids are named by no migration at all. Verified: `check:release-seed` goes red on exactly those four ids.
2. **The appendix and the main recipe disagree on the substitution count.** `migrations/README.md` step 4 lists **three** required edits; the break-glass appendix still says "the same two substitutions". Three is correct. Do not follow the appendix at all — it is for rebuilding from nothing.
3. **You cannot re-run a failed migration in place.** Skyway commits batch by batch, so a file that died at batch 5 has already applied part of itself and fails differently on retry. Rebuild from the backup instead (Task 1 Step 8).
4. **Create the database as `sa` or the core baseline dies** at batch 12/13083 with *"The login already has an account under a different user name"* — an error that points nowhere near ownership.
5. **`DB_DATABASE` in this repo's `.env` is single-quoted** (`DB_DATABASE='MJ_ATS_Dev'`). The helper script below strips quotes; anything else you write must too.

---

### Task 1: Build the generation database

**Files:**
- Create: `$HOME/.cache/forms-seedgen-v012/dbq.mjs` (throwaway query helper, deliberately **outside the repo** — `scripts/tmp/` is NOT gitignored here, so a helper written inside the tree can be committed by accident, and this one carries an absolute machine path and reads `.env`)
- Modify: `.env` (worktree-local, untracked)
- Temporarily move: `migrations/V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql`, `migrations/V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a database named `MJ_Forms_SeedGen_v012` holding the shipped chain at HEAD minus the two deltas, plus a backup at `/var/opt/mssql/data/seedgen_v012_base.bak` for cheap retries. Task 2 pushes against it.

- [ ] **Step 1: Write the throwaway query helper**

`mssql` is not installed in this repo; it lives in the shared workspace. Create the helper **outside the repository** so it can never be committed:

```bash
mkdir -p "$HOME/.cache/forms-seedgen-v012"
```

Write `$HOME/.cache/forms-seedgen-v012/dbq.mjs`. It reads `.env` relative to the current directory, so always invoke it from the worktree root:

```js
// Throwaway DB query helper for the #111 seed generation. Lives outside the repo on purpose.
// Run from the worktree root (it reads ./.env).
// Usage: node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "SELECT 1 AS ok"
//        DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "CREATE DATABASE [X]"
import { readFileSync } from 'node:fs';
import sql from '/Users/sohamdesai/Projects/mj-dev/node_modules/.pnpm/mssql@12.7.0/node_modules/mssql/index.js';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }),
);

const pool = await sql.connect({
  server: env.DB_HOST,
  port: Number(env.DB_PORT),
  database: process.env.DBQ_DATABASE || env.DB_DATABASE,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: false },
});
// recordsets (plural): with multi-statement SQL, .recordset shows only the first result.
console.log(JSON.stringify((await pool.request().query(process.argv[2])).recordsets, null, 2));
await pool.close();
```

- [ ] **Step 2: Create the database owned by `sa`, and repoint `.env` at it**

```bash
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "CREATE DATABASE [MJ_Forms_SeedGen_v012];"
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "ALTER AUTHORIZATION ON DATABASE::[MJ_Forms_SeedGen_v012] TO [sa];"
sed -i '' "s/^DB_DATABASE=.*/DB_DATABASE='MJ_Forms_SeedGen_v012'/" .env
grep '^DB_DATABASE=' .env
```

Expected last line: `DB_DATABASE='MJ_Forms_SeedGen_v012'`. **If it still says `MJ_ATS_Dev`, stop** — every following command would hit the shared host database.

- [ ] **Step 3: Move the two unreleased seed deltas out of the chain**

```bash
mkdir -p "$HOME/.cache/forms-seedgen-v012"
mv migrations/V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql \
   migrations/V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql \
   "$HOME/.cache/forms-seedgen-v012/"
ls migrations/*.sql | wc -l
```

Expected: `31` (33 minus the two held back).

- [ ] **Step 4: Run the chain, leaf-first**

Forms' own migrations need common and tasks first — `FormResponse.RespondentPersonID` has a hard FK to `MJ_BizApps_Common: People`, so a bare Forms migrate on an empty database fails at the baseline.

```bash
npx mj migrate -t v6.1.0-edge.5
npx mj migrate --schema __mj_BizAppsCommon --dir /Users/sohamdesai/Projects/mj-dev/bizapps-common/migrations
npx mj migrate --schema __mj_BizAppsTasks  --dir /Users/sohamdesai/Projects/mj-dev/bizapps-tasks/migrations
npx mj migrate --schema __mj_BizAppsForms  --dir ./migrations
npx mj codegen --skipfiles
```

Read the first core line. On a database you just created there is no watermark yet, so it correctly prints `No prior migration history detected — treating as a fresh install…`. The root `CLAUDE.md` rule about `Detected installed migration version: <N>` applies to migrating an EXISTING database, not this one — do not treat its absence here as a failure. Judge success by the applied count and by zero failures:

```bash
node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
SELECT COUNT(*) AS CoreOK   FROM [__mj].[flyway_schema_history]               WHERE success = 1;
SELECT COUNT(*) AS CoreFail FROM [__mj].[flyway_schema_history]               WHERE success = 0;
SELECT COUNT(*) AS FormsOK  FROM [__mj_BizAppsForms].[flyway_schema_history]  WHERE success = 1;"
```

Expected: `CoreFail: 0`, and `FormsOK` equal to **32** — 31 migration files plus Skyway's own `[__mj_BizAppsForms]` schema-creation row, which is counted but is not a file. Total runtime ~2–3 minutes.

`npx mj codegen --skipfiles` exits non-zero here, and that is expected rather than a failure: its AFTER command runs `pnpm run build`, which cannot work in a worktree with no `node_modules`. Every database-side phase still runs. Confirm the part that matters — that the entities `metadata/` resolves `@lookup`s against exist:

```bash
node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
SELECT COUNT(*) AS FormsEntities FROM [__mj].[Entity] WHERE Name LIKE 'MJ_BizApps_Forms:%';"
```

Expected: at least `12`.

- [ ] **Step 5: Put the held-back files back in the working tree**

They are still tracked by git and are deleted deliberately in Task 4 — not here. The generation database must simply never have run them.

```bash
mv "$HOME/.cache/forms-seedgen-v012"/*.sql migrations/
git status --short
```

Expected: only `M migrations/README.md` and `M scripts/check-release-seed-cadence.mjs` (this branch's existing work). No `D` lines.

- [ ] **Step 6: Verify the database is at the last released metadata level**

This is the gate the whole plan depends on. Both assertions must hold.

```bash
node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
SELECT COUNT(*) AS ActionParamsPresent FROM [__mj].[ActionParam]
 WHERE ID IN ('7F0B0001-A1B2-4C3D-8E4F-000000000005','7F0B0001-A1B2-4C3D-8E4F-000000000006',
              '7F0B0002-A1B2-4C3D-8E4F-000000000005','7F0B0002-A1B2-4C3D-8E4F-000000000006');
SELECT CASE WHEN TemplateText LIKE '%Doodle%'    THEN 'HAS_DOODLE'
            WHEN TemplateText LIKE '%Signature%' THEN 'HAS_SIGNATURE'
            ELSE 'PRE_TAXONOMY' END AS DesignerState
 FROM [__mj].[TemplateContent] WHERE ID = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60';"
```

Expected: `ActionParamsPresent: 0` and `DesignerState: "PRE_TAXONOMY"`.

`PRE_TAXONOMY` is correct and is not a failure — the v0.8 seed's Designer prompt predates the rename and mentions neither word (verified: `grep -o "Signature\|Doodle" migrations/V202608081700__v0.8.x__Metadata_Sync.sql` returns nothing). `HAS_SIGNATURE` means the taxonomy delta leaked into the chain; `HAS_DOODLE` means you restored a dev backup. Either way, drop the database and restart at Step 2.

- [ ] **Step 7: Back the database up so retries are cheap**

Rebuilding core+common+tasks costs ~2 minutes; restoring costs seconds, and you will likely iterate on Task 3.

```bash
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
BACKUP DATABASE [MJ_Forms_SeedGen_v012]
  TO DISK='/var/opt/mssql/data/seedgen_v012_base.bak' WITH INIT, COMPRESSION;"
```

- [ ] **Step 8: Record the restore command for later use**

Keep this to hand. Use it whenever a push or migration attempt goes wrong — never re-run a half-applied migration in place.

```bash
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
ALTER DATABASE [MJ_Forms_SeedGen_v012] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [MJ_Forms_SeedGen_v012] FROM DISK='/var/opt/mssql/data/seedgen_v012_base.bak' WITH REPLACE;
ALTER DATABASE [MJ_Forms_SeedGen_v012] SET MULTI_USER;"
```

No commit for this task — it produces a database, not a repo change.

---

### Task 2: Generate the push log

**Files:**
- Creates (untracked, by-product): `metadata/sql_logging/<timestamp>.sql`

**Interfaces:**
- Consumes: `MJ_Forms_SeedGen_v012` from Task 1.
- Produces: a raw push log whose path Task 3 reads. It must contain 4 × `spCreateActionParam` and a `spUpdateTemplateContent` carrying `Doodle`.

- [ ] **Step 1: Push**

```bash
DB_DATABASE=MJ_Forms_SeedGen_v012 npx mj sync push --dir metadata --exclude users --ci
```

Expect a small log — the records changed since v0.10.0 and nothing else. A push that reports hundreds of creates means the database was emptied or torn down; restore from the backup and re-verify Task 1 Step 6.

- [ ] **Step 2: Verify the log carries both halves**

```bash
LOG=$(ls -t metadata/sql_logging/*.sql | head -1); echo "$LOG"
echo "spCreateActionParam: $(grep -c spCreateActionParam "$LOG")"
echo "Doodle mentions:     $(grep -c Doodle "$LOG")"
echo "Signature mentions:  $(grep -c Signature "$LOG")"
```

Expected: `spCreateActionParam: 4` (the stranding hazard, closed), `Doodle mentions` at least `2`, `Signature mentions: 0`.

**If `spCreateActionParam` is 0, stop.** The generation database was at head after all — this is hazard 1. Drop it and rebuild from Task 1 Step 2.

- [ ] **Step 3: Copy the log aside before editing**

```bash
LOG=$(ls -t metadata/sql_logging/*.sql | head -1)
mkdir -p "$HOME/.cache/forms-seedgen-v012"
cp "$LOG" "$HOME/.cache/forms-seedgen-v012/raw-push-log.sql"
```

The `metadata/sql_logging/` original is a by-product and is ignored by both check scripts; keeping a pristine copy means a botched substitution costs nothing.

No commit for this task — the log is a by-product, not a shipped file.

---

### Task 3: Substitute and ship it as the consolidated seed

**Files:**
- Create: `migrations/V<stamp>__v0.12.x__Metadata_Sync.sql`

**Interfaces:**
- Consumes: the raw push log from Task 2.
- Produces: the single shipped seed file. Task 4 retires the two deltas against it; Task 5 replays it.

- [ ] **Step 1: Copy the log to its migration filename**

Pick `<stamp>` as the current `YYYYMMDDHHMM`; it must be greater than `202609091600`.

```bash
STAMP=$(date +%Y%m%d%H%M); echo "$STAMP"   # must be > 202609091600
cp "$HOME/.cache/forms-seedgen-v012/raw-push-log.sql" \
   "migrations/V${STAMP}__v0.12.x__Metadata_Sync.sql"
```

- [ ] **Step 2: Apply substitution 1 — core SP calls use `${mjSchema}`**

MetadataSync writes core SP calls with the default-schema placeholder, because in MJ's own repo the default schema *is* the core schema. Here the default schema is `__mj_BizAppsForms`, so shipping the log verbatim calls `__mj_BizAppsForms.spCreateRole` — an object that does not exist.

Each step below re-derives `$SEED` by glob rather than reusing a variable, because shell state does not survive between steps if you run them as separate commands.

```bash
SEED=$(ls migrations/V*__v0.12.x__Metadata_Sync.sql)
perl -pi -e 's/\$\{flyway:defaultSchema\}/\${mjSchema}/g' "$SEED"
```

- [ ] **Step 3: Apply substitution 2 — Forms-schema calls use the default-schema placeholder**

```bash
SEED=$(ls migrations/V*__v0.12.x__Metadata_Sync.sql)
perl -pi -e 's/\[__mj_BizAppsForms\]/[\${flyway:defaultSchema}]/g' "$SEED"
grep -c '__mj_BizAppsForms' "$SEED"
```

Expected: `0`. A surviving literal is a hardcoded schema name that breaks on a host that installed Forms under a different default schema.

- [ ] **Step 4: Apply substitution 3 — resolve BOTH Forms roles by name**

The generator emits whatever role id it read from *your* database. `V202608081700`'s own header
records that #39 made **both** `spCreateRole` calls adopt-or-skip by name and rewrote "the 18
`SET @RoleID_… =` lines that addressed the two Forms roles by their hardcoded UUIDs" to resolve by
name. So on a host that adopted a pre-existing role, neither id matches ours, and a literal binds to
nothing. `migrations/README.md` names only `Form Respondent`; the Automation Runner is the identical
failure class and gets the same treatment.

**The generator does NOT write `@RoleID = '<guid>'`.** It declares a suffixed variable, SETs the
literal, then passes the variable — so grepping for `@RoleID = '` finds nothing and proves nothing.
Find the literals this way instead:

```bash
SEED=$(ls migrations/V*__v0.12.x__Metadata_Sync.sql)
grep -nE "SET|@(Role)?ID_[0-9a-f]+ = '" "$SEED" | grep -iE "5154187D|A18E13FC"
```

There are **three** in this release's log — one `Forms Automation Runner` id on the `spUpdateRole`
call and two `Form Respondent` ids on the `spUpdateEntityPermission` calls. Replace each literal with
a by-name lookup, keeping the variable and the surrounding statement intact:

```sql
-- was: @ID_<suffix> = '5154187D-0AB9-4C75-A444-CFC3D10E1BC0'
        @ID_<suffix> = (SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner')

-- was: @RoleID_<suffix> = 'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C'
        @RoleID_<suffix> = (SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Form Respondent')
```

⚠️ On the `spUpdateRole` line the SET and the `EXEC` share a line — `… = '5154187D-…' EXEC [${mjSchema}].spUpdateRole @Name = …`. Replace only the quoted literal; do not disturb the `EXEC` that follows it.

Then confirm no role-id literal survives:

```bash
SEED=$(ls migrations/V*__v0.12.x__Metadata_Sync.sql)
grep -icE "'5154187D-0AB9-4C75-A444-CFC3D10E1BC0'|'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C'" "$SEED"
```

Expected: `0`. And the by-name lookups are present:

```bash
grep -c "FROM \[\${mjSchema}\].\[Role\] WHERE Name" "$SEED"
```

Expected: `3`.

- [ ] **Step 5: Add the header**

Prepend this block — every shipped migration here carries one, and the next person to regenerate a seed reads it to learn what this one already covers.

```sql
-- MJ Forms v0.12.x — the consolidated release metadata seed.
--
-- ONE seed per release (#105). This file folds in and REPLACES two per-PR deltas that reached no
-- release tag and therefore no host: V202608182130 (Designer taxonomy) and V202608241800 (OnSubmit
-- ActionParams). Both are deleted in the same change. They were never append-only history — a seed
-- becomes history when a release tag carries it, and neither was in v0.10.0.
--
-- GENERATED AGAINST THE SHIPPED CHAIN AT HEAD *MINUS* THOSE TWO FILES, which is the only database
-- that produces a complete delta. On a database that ran them, the four ActionParam records already
-- match metadata/, `mj sync push` emits nothing for them, and deleting the delta strands four ids
-- that no migration names. See migrations/README.md — three requirements, not one.
--
-- WHAT A HOST GETS. spCreate* for records added since v0.10.0, including the four OnSubmit
-- ActionParams. spUpdate* for records edited since, including the AI Designer prompt, which until
-- now still proposed `Signature` — a question type V202608301200 installs a CHECK constraint to
-- reject. Authoring a form therefore burned Designer retries against MAX_DESIGNER_ATTEMPTS on every
-- brief. That half is invisible to check:release-seed, which compares ids and not content (#97, #111).
```

- [ ] **Step 6: Verify the shipped-SQL gates**

```bash
npm run lint:distribution
npm run lint:migrations
```

Expected: both pass. `lint:distribution` CHECK 3 is the one that refuses a post-`V202608131600` seed granting the anonymous role anything MJ would not row-level filter; if it fires, substitution 3 is wrong or incomplete.

- [ ] **Step 7: Request approval, then commit**

Do not run this until Soham has asked for a commit (`CLAUDE.md` critical rule 1).

```bash
git add migrations/V*__v0.12.x__Metadata_Sync.sql
git commit -m "feat(migrations): consolidated v0.12 metadata seed"
```

---

### Task 4: Retire the two deltas and make all three checks green

**Files:**
- Delete: `migrations/V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql`
- Delete: `migrations/V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql`
- Create: `.changeset/<memorable-name>.md`

**Interfaces:**
- Consumes: the seed file from Task 3.
- Produces: a repo state where `check:seed-cadence`, `check:release-seed` and `lint:distribution` all pass. Task 5 proves it against a database.

- [ ] **Step 1: Delete both unreleased deltas**

Neither is in any release tag, so neither has reached a host and neither is append-only history. This is the one case where removing a migration is correct.

```bash
git rm migrations/V202608182130__v0.11.x__Metadata_Sync_Designer_Taxonomy.sql \
       migrations/V202608241800__v0.11.x__Metadata_Sync_OnSubmit_Params.sql
ls migrations/*.sql | wc -l
```

Expected: `32` (33 − 2 deleted + 1 new seed).

- [ ] **Step 2: Run all three checks**

```bash
npm run check:seed-cadence
npm run check:release-seed
npm run lint:distribution
```

Expected: all three pass. Specifically, `check:seed-cadence` must now report one unreleased seed rather than two, and must not report unshipped drift.

**If `check:release-seed` names the four `7F0B000x…0005/0006` ids, the seed is missing its creates** — that is hazard 1 and it means Task 1's generation database was wrong. Do not patch the seed by hand: rebuild from Task 1 Step 2.

- [ ] **Step 3: Write the changeset**

This ships a migration, so the bump is **`minor`** (`.claude/rules/changesets.md`: `minor` only when the change ships a migration or metadata — this does both). The fixed group means one `minor` moves all packages together, which is correct here. Create `.changeset/<memorable-name>.md`:

```markdown
---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

The v0.12 release ships one consolidated metadata seed, and the AI Designer stops proposing a question type the database rejects.

The AI Designer stops proposing a question type the database rejects, and the release ships one consolidated metadata seed instead of a pile of per-PR deltas.

**The shipped Designer prompt still said `Signature`.** #97 renamed the type to `Doodle` and `V202608301200` installed a CHECK constraint that accepts only the new spelling — but that migration is pure DDL, and the prompt lives in a metadata record no DDL touches. So a host installing from `migrations/` got a prompt proposing `Signature` and a constraint refusing it. The blueprint validator rejects the value before it ever reaches the database, and the Designer retries with the error fed back, up to `MAX_DESIGNER_ATTEMPTS` — wasted round-trips on every authored form rather than a visible failure, which is why nothing surfaced it. No repo-side check could: `check:release-seed` compares declared ids against shipped SQL, and this record's id already shipped in the v0.8 seed.

**Two unreleased deltas are folded in and deleted.** `V202608182130` and `V202608241800` appear in no release tag, so neither reached a host and neither was append-only history yet. They are replaced by a single `Metadata_Sync` generated against the shipped chain — the cadence #105 established, and what `check:seed-cadence` has been red on.

**Operators should expect this**: applying this migration corrects the Designer prompt in place and adds the four `OnSubmit` `ActionParam` records. No form data is touched, and `V202608301200` already migrated any stored `Signature` questions to `Doodle`.

Closes #111.
```

- [ ] **Step 4: Request approval, then commit**

```bash
git add -A migrations/ .changeset/
git commit -m "chore(release): fold the unreleased seed deltas into the v0.12 consolidated seed"
```

---

### Task 5: Prove it on a database that has never seen dev work

**Files:** none — this task produces evidence, not repo changes.

**Interfaces:**
- Consumes: `migrations/` as it now stands.
- Produces: a pass/fail verdict on whether the shipped chain alone installs the seed correctly. Replaying against the generation database proves nothing — it already contains the records.

- [ ] **Step 1: Create a virgin proof database**

```bash
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "CREATE DATABASE [MJ_Forms_SeedProof_v012];"
DBQ_DATABASE=master node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "ALTER AUTHORIZATION ON DATABASE::[MJ_Forms_SeedProof_v012] TO [sa];"
sed -i '' "s/^DB_DATABASE=.*/DB_DATABASE='MJ_Forms_SeedProof_v012'/" .env
grep '^DB_DATABASE=' .env
```

- [ ] **Step 2: Run the full chain, including the new seed and excluding nothing**

```bash
npx mj migrate -t v6.1.0-edge.5
npx mj migrate --schema __mj_BizAppsCommon --dir /Users/sohamdesai/Projects/mj-dev/bizapps-common/migrations
npx mj migrate --schema __mj_BizAppsTasks  --dir /Users/sohamdesai/Projects/mj-dev/bizapps-tasks/migrations
npx mj migrate --schema __mj_BizAppsForms  --dir ./migrations
```

Every file must apply. A failure here is the seed failing on a fresh install — the exact defect this task exists to catch.

- [ ] **Step 3: Verify the records a host actually receives**

```bash
node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
SELECT COUNT(*) AS ActionParamsPresent FROM [__mj].[ActionParam]
 WHERE ID IN ('7F0B0001-A1B2-4C3D-8E4F-000000000005','7F0B0001-A1B2-4C3D-8E4F-000000000006',
              '7F0B0002-A1B2-4C3D-8E4F-000000000005','7F0B0002-A1B2-4C3D-8E4F-000000000006');
SELECT CASE WHEN TemplateText LIKE '%Doodle%'    THEN 'HAS_DOODLE'
            WHEN TemplateText LIKE '%Signature%' THEN 'HAS_SIGNATURE'
            ELSE 'PRE_TAXONOMY' END AS DesignerState
 FROM [__mj].[TemplateContent] WHERE ID = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60';
SELECT COUNT(*) AS RespondentRoleGrants FROM [__mj].[EntityPermission] ep
 JOIN [__mj].[Role] r ON r.ID = ep.RoleID WHERE r.Name = N'Form Respondent';"
```

Expected: `ActionParamsPresent: 4`, `DesignerState: "HAS_DOODLE"`, and `RespondentRoleGrants` non-zero (substitution 3 resolved the role by name rather than a foreign id).

`HAS_SIGNATURE` here means the headline defect in #111 is still shipping and the seed did not carry the template update.

- [ ] **Step 4: Confirm the constraint and the prompt now agree**

The whole point of the issue: the prompt must not propose a type the CHECK constraint rejects.

```bash
node "$HOME/.cache/forms-seedgen-v012/dbq.mjs" "
SELECT definition FROM sys.check_constraints WHERE name = 'CK_FormQuestion_QuestionType';"
```

Expected: the definition lists `Doodle` and does not list `Signature` — matching the template's taxonomy from Step 3.

---

### Task 6: Clean up and open the PR

**Files:**
- Delete: `$HOME/.cache/forms-seedgen-v012/` (helper, held-back files, raw push log)
- Modify: `.env` (restore)

**Interfaces:**
- Consumes: a green Task 4 and a proven Task 5.
- Produces: a PR to `next`.

- [ ] **Step 1: Remove the throwaway working directory**

```bash
rm -rf "$HOME/.cache/forms-seedgen-v012"
```

Nothing to clean inside the repo — the helper and the held-back files never lived there, which is the point of putting them under `$HOME/.cache`.

- [ ] **Step 2: Restore `.env`**

Leaving it pointed at a seed-gen database will confuse the next person to use this worktree.

```bash
sed -i '' "s/^DB_DATABASE=.*/DB_DATABASE='MJ_ATS_Dev'/" .env
grep '^DB_DATABASE=' .env
```

- [ ] **Step 3: Confirm the tree carries only what should ship**

```bash
git status --short
git diff --stat next...HEAD
```

Expected files: the new `Metadata_Sync` seed (added), the two deltas (deleted), the changeset (added), plus this branch's existing `migrations/README.md` and `scripts/check-release-seed-cadence.mjs` corrections and this plan. No `metadata/sql_logging/` entries (that path is gitignored) and nothing under `scripts/tmp/`.

- [ ] **Step 4: Run the full gate set one last time**

```bash
npm run check:seed-cadence && npm run check:release-seed && \
npm run lint:distribution && npm run lint:migrations && npm run lint:release-pushes
```

Expected: all pass.

- [ ] **Step 5: Request approval, then open the PR**

Base is **`next`**, never `main`. The branch must track `origin/fix/111-consolidated-release-seed` — verify with `git branch -vv` before pushing. Body should state that the seed was generated against the shipped chain minus the two deltas, and that Task 5's virgin-database replay is the evidence.

---

## Self-review notes

- **Spec coverage.** #111's six-step recipe maps to Tasks 1–5, with its step 1 replaced by the corrected generation-database rule. Its "gap that remains" is already closed (#108's drift half) and needs no task.
- **Not covered, deliberately:** the drift half is satisfied by *any* one new seed rather than per-file, so it cannot report that a seed covered 5 of 6 changed files. Out of scope here; worth filing separately.
- **No TDD cycle.** There is no unit test to write — the deliverable is a SQL migration whose correctness is a property of a database. Task 1 Step 6, Task 2 Step 2 and all of Task 5 are the substitutes, and each fails loudly with a named expected value.
