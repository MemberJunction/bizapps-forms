# Forms Application Launcher Visibility (#212) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the curated `Forms` application appear in the Explorer app launcher on every host — both the hosts installed from now on and the hosts that already exist.

**Architecture:** Two writes, not one. `metadata/applications/.applications.json` flips `DefaultForNewUser` to `true` so the declaration (and therefore any regenerated seed) is right; a repair migration flips the same flag on databases that already ran the v0.8 seed **and** backfills the `__mj.UserApplication` rows that MJ's own self-heal can never reach. A dependency-free `node --test` spec pins both halves so a regeneration cannot silently revert them.

**Tech Stack:** T-SQL migration (Skyway/Flyway, `${mjSchema}` placeholder), MJ metadata JSON, `node --test` (stdlib only, no Vitest).

**Spec:** [GitHub issue #212](https://github.com/MemberJunction/bizapps-forms/issues/212) plus the root-cause findings in "Investigation" below. **The issue's own "Fix" section is incomplete — read Investigation before starting.**

---

## Investigation (findings that change the fix)

Reproduced and measured on 2026-09-13 against the two databases from the rehearsal that filed the issue (`MJ_HostTest_Fresh`, `MJ_HostTest_Upgrade`) and a restored clone (`MJ_I212_Repro`).

**1. The declared cause is real.** `metadata/applications/.applications.json` declares
`"DefaultForNewUser": false`; the shipped seed `migrations/V202608081700__v0.8.x__Metadata_Sync.sql:2479`
therefore executes `@DefaultForNewUser_58db7f0b = 0`. Both siblings declare `true`
(`bizapps-common/metadata/applications/.common-application.json:19`,
`bizapps-tasks/metadata/applications/.tasks-application.json:20`).

**2. Flipping that flag alone repairs almost nobody.** MJ has exactly two paths that create
`__mj.UserApplication` rows, and both are new-user-only:

| Path | File | Gate |
|---|---|---|
| JWT new-user provisioning | `MJ/packages/MJServer/src/auth/newUsers.ts:88` | runs only inside new-**User**-row creation |
| Explorer client self-heal | `MJ/packages/Angular/Explorer/base-application/src/lib/application-manager.ts:366` | `if (userApps.length === 0)` |

Measured on `MJ_HostTest_Upgrade`: `System` holds **7** UserApplication rows and `Anonymous` **2**,
neither including Forms. Applying *only* `UPDATE __mj.Application SET DefaultForNewUser = 1`
changed the launcher for **neither** — verified by re-reading the launcher predicate after the write:

```
--- BASELINE (bug reproduced) ---                --- AFTER the issue's stated fix, alone ---
Anonymous|2|forms invisible                       Anonymous|2|forms invisible
Forms Automation Service|0|forms invisible        Forms Automation Service|0|forms invisible
System|7|forms invisible                          System|7|forms invisible
```

This is the exact mistake `bizapps-caliber/migrations/V202609021000__v1.1.x__DeNavigateSchemaShim.sql`
documents from the opposite direction: *"the first two alone do nothing… Without it the shim is
hidden from everyone who exists now and reappears for the next person onboarded, which is the worst
kind of fix: it looks done and rots."* Ours rots the other way — fixed for users created later,
invisible forever to everyone who exists now.

**3. The backfill must NOT touch users who have zero rows.** This is the hazard that shapes the
migration. The Explorer self-heal fires only on an **empty** list. Give a zero-row user a single
Forms row and their list becomes non-empty, the self-heal never runs, and they log in to a launcher
containing **only Forms** — missing all thirteen other applications. So the backfill is restricted
to users who already hold at least one `UserApplication` row; zero-row users are left alone and get
Forms for free from the self-heal, because the flag is now `1`.

**4. Role gating stays MJ's job.** `UserInfoEngine.UserHasApplicationAccess`
(`MJ/packages/MJCoreEntities/src/engines/UserInfoEngine.ts:836`) filters the launcher by
`ApplicationRole.CanAccess`. Forms ships two `ApplicationRole` rows (Developer, UI), so a backfilled
row is inert for a user without them. The migration must therefore **not** filter by role: doing so
would duplicate a decision MJ already makes, and would under-deliver — a user granted the role later
would still be missing the row and would never self-heal.

**5. The backfill must be guarded on the natural key.** MJ ships
`UQ_UserApplication_UserID_ApplicationID`
(`MJ/migrations/v2/V202512301901__v2.129.x__Add_Unique_Constraint_UserApplication.sql:82`), so an
unguarded re-run halts the chain on a constraint violation.

**Verified end state** (same clone, after both writes): `System` and `Anonymous` read `FORMS VISIBLE`;
`Forms Automation Service` (0 rows) is deliberately still `forms invisible`, awaiting its self-heal.

## Global Constraints

- **Forms Application ID:** `BFB97C57-4552-4643-8933-A0B2D76544D8` — minted by this repo in `V202608081700`.
- **Placeholders:** only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL. Core `__mj` tables (`Application`, `UserApplication`, `User`) use **`${mjSchema}`**. `npm run lint:distribution` CHECK 2 enforces this.
- **`migrations/` is flat and append-only.** Never edit a shipped migration; add a new one.
- **Migration filename:** `VYYYYMMDDHHMM__v<ver>__<Description>.sql`. The current frontier is `V202609121200__v0.12.x__Distribution_Allowed_Origins.sql`, so this one must sort after it.
- **No `__mj_*` timestamp columns and no FK indexes** in hand-written migrations — CodeGen adds them.
- **Changeset level:** `minor`. `.claude/rules/changesets.md`: "`patch` is the default. Use `minor` only when the change ships a migration or metadata." This ships both.
- **No `*__Metadata_Sync.sql` in this PR.** Consolidated seeds are release work (`CLAUDE.md` → Migrations). A *repair* migration is not a Metadata_Sync — `V202608201400__v0.11.x__Forms_Application_Identity.sql` is the precedent and explains why both the metadata edit and the migration are needed.
- **Tests are dependency-free `node --test`**, matching the other `scripts/*.spec.mjs`. Do not reach for Vitest.
- **Never hand-edit anything under `packages/*/src/**/generated/`.** Nothing in this plan requires it.

---

### Task 1: Declare the application launcher-visible, and pin the declaration

The metadata declaration is the source of truth a regenerated seed reproduces. It is also live
regression bait: the shared dev database `MJ_ATS_Dev` currently holds `DefaultForNewUser = 0` for
Forms, so a `mj sync pull` today would silently write `false` straight back into this file. The spec
below is what stops that.

**Files:**
- Create: `scripts/check-forms-application-launcher.spec.mjs`
- Modify: `metadata/applications/.applications.json` (the `fields.DefaultForNewUser` line)
- Modify: `package.json` (add the `lint:forms-application:test` script)
- Modify: `.github/workflows/build.yml` (run it alongside `lint:designer-template:test`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `scripts/check-forms-application-launcher.spec.mjs`, which Task 2 **extends** with a second `test(...)` block. Task 2 relies on these module-level constants existing in that file with exactly these names: `REPO_ROOT` (string), `APPLICATIONS_JSON` (string path), `MIGRATIONS_DIR` (string path), `FORMS_APP_ID` (string, the uppercase UUID), and `readShippedSql()` (returns every `migrations/*.sql` file concatenated with `\n`).

- [ ] **Step 1: Write the failing test**

Create `scripts/check-forms-application-launcher.spec.mjs`:

```javascript
/**
 * Regression test for bizapps-forms#212.
 *
 * WHAT BROKE. `metadata/applications/.applications.json` declared the curated `Forms` application
 * `DefaultForNewUser: false`, so `V202608081700`'s `spCreateApplication` shipped `0` to every host.
 * `__mj.Application.DefaultForNewUser` is what decides whether an app is added to a user's
 * `__mj.UserApplication` list, and that list is what the Explorer launcher renders — so on a
 * textbook install the Forms admin UI (builder, both dashboards, seven browsable entities) was
 * reachable by nobody, and the only Forms-shaped entry an operator could find was the
 * auto-generated `__mj_BizAppsForms` schema shell. Both siblings declare `true`; Forms was the only
 * one of the three that did not.
 *
 * WHY THIS IS A LIVE REGRESSION RISK RATHER THAN A CLOSED BUG. The shared dev database this repo
 * regenerates metadata against still holds `DefaultForNewUser = 0` for Forms, so a `mj sync pull`
 * writes `false` back into the JSON without anyone typing it. Nothing else in the repo reads this
 * field: the build, the unit suites and the checked-in generated files are all identical either
 * way, which is why the defect shipped through four releases unnoticed.
 *
 * WHY IT IS PHRASED OVER EVERY DECLARED APPLICATION rather than pinned to the Forms record. The
 * class is "this repo ships a curated application that no host user can reach", and it applies to
 * the next application this repo declares just as much as to this one. A test pinned to one id
 * would go green on the second.
 *
 * Dependency-free `node --test`, matching the other scripts/*.spec.mjs here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const APPLICATIONS_JSON = join(REPO_ROOT, 'metadata/applications/.applications.json');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations');

/** The curated Forms application, minted by this repo in V202608081700. */
export const FORMS_APP_ID = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

/** Every application this repo declares, as `{ Name, DefaultForNewUser }`. */
export const readDeclaredApplications = () => {
    const declared = JSON.parse(readFileSync(APPLICATIONS_JSON, 'utf8'));
    return (Array.isArray(declared) ? declared : [declared]).map((a) => a.fields);
};

/** Every shipped migration, concatenated. `migrations/` is flat — there are no era subfolders. */
export const readShippedSql = () =>
    readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
        .join('\n');

test('every application this repo declares is reachable from a host user launcher', () => {
    const applications = readDeclaredApplications();
    assert.ok(applications.length > 0, `${APPLICATIONS_JSON} declares no applications`);

    for (const app of applications) {
        assert.equal(
            app.DefaultForNewUser,
            true,
            `metadata/applications/.applications.json declares the "${app.Name}" application with ` +
                `DefaultForNewUser: ${JSON.stringify(app.DefaultForNewUser)}. That flag is what puts an ` +
                `application into a new user's __mj.UserApplication list, which is the list the Explorer ` +
                `app launcher renders — so a curated application declaring anything but true ships ` +
                `unreachable by every user on the host (#212). Both sibling apps declare true.`,
        );
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/check-forms-application-launcher.spec.mjs`

Expected: **FAIL**, with the message naming the `Forms` application and `DefaultForNewUser: false`.
If it passes, stop — the metadata has already been edited and the test is proving nothing.

- [ ] **Step 3: Make the minimal change**

In `metadata/applications/.applications.json`, in the single object's `fields` block, change:

```json
      "DefaultForNewUser": false,
```

to:

```json
      "DefaultForNewUser": true,
```

Change **only** that line. Do not touch the `DefaultNavItems` children (already `true`), the
`relatedEntities` block, the `primaryKey`, or the `sync` checksum — the checksum belongs to
`mj sync` and is not ours to hand-edit.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/check-forms-application-launcher.spec.mjs`

Expected: **PASS**, `1 passing`.

- [ ] **Step 5: Wire it into CI**

In `package.json`, next to the other `lint:*:test` entries, add:

```json
    "lint:forms-application:test": "node --test scripts/check-forms-application-launcher.spec.mjs",
```

In `.github/workflows/build.yml`, find the step that runs `npm run lint:designer-template:test`
(around line 265) and add an equivalent step immediately after it, copying the surrounding step's
`name:`/`run:` formatting exactly:

```yaml
      - name: Forms application stays launcher-visible (#212)
        run: npm run lint:forms-application:test
```

- [ ] **Step 6: Verify the wiring**

Run: `npm run lint:forms-application:test`

Expected: **PASS**. Then confirm the workflow file still parses:
`node -e "require('fs').readFileSync('.github/workflows/build.yml','utf8')" && grep -n "lint:forms-application:test" .github/workflows/build.yml package.json`

Expected: one hit in each file.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-forms-application-launcher.spec.mjs metadata/applications/.applications.json package.json .github/workflows/build.yml
git commit -m "fix(#212): declare the Forms application DefaultForNewUser

The curated Forms application shipped DefaultForNewUser: false, so it was
never added to any host user's __mj.UserApplication list -- the list the
Explorer launcher renders. The admin UI was unreachable on every host and
the only Forms-shaped entry was the auto-generated __mj_BizAppsForms shell.

The spec is phrased over every application this repo declares, because the
class is 'a curated application no host user can reach', and because the
shared dev database still holds 0 -- a mj sync pull would write false back
without anyone typing it.

This half reaches fresh installs and never-logged-in users only. The repair
migration for existing hosts is the next commit."
```

---

### Task 2: Repair the hosts that already exist

The metadata edit reaches a host only through a regenerated seed, and even then only changes what
*new* users receive. Every database that already ran `V202608081700` holds `DefaultForNewUser = 0`,
and every user on it who has ever opened Explorer holds a `UserApplication` list that MJ will never
reconsider. This migration is the repair vehicle — the same split `V202608181030`, `V202608201200`
and `V202608201400` use.

**Files:**
- Create: `migrations/V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql`
- Modify: `scripts/check-forms-application-launcher.spec.mjs` (add one `test(...)` block at the end)

**Interfaces:**
- Consumes: from Task 1's spec file — `MIGRATIONS_DIR`, `FORMS_APP_ID`, `readShippedSql()`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `scripts/check-forms-application-launcher.spec.mjs`:

```javascript
/**
 * The metadata declaration above is necessary and not sufficient, and the issue that reported this
 * proposed only the declaration.
 *
 * `Application.DefaultForNewUser` is read by exactly two MJ paths, and both are new-user-only:
 * `MJServer/src/auth/newUsers.ts` runs inside new-User-row creation, and the Explorer client
 * self-heal in `base-application/src/lib/application-manager.ts` is gated on
 * `if (userApps.length === 0)`. So on a host that already exists, every user who has ever opened
 * Explorer holds a non-empty list that is never reconsidered. Measured on the upgrade-path
 * rehearsal database: setting the flag alone moved nobody -- `System` (7 rows) and `Anonymous`
 * (2 rows) both stayed without Forms.
 *
 * Shipping the flag with no backfill is therefore the mirror image of the mistake
 * bizapps-caliber's V202609021000 documents: correct for users created later, invisible forever to
 * everyone who exists now. This test refuses that half-fix.
 *
 * It is a text assertion over shipped SQL, like the designer-template spec, and it claims no more
 * than it can see: that a migration writes the flag and a migration backfills the subscription
 * table. Whether the backfill's predicate is right is settled by running it against a host-shaped
 * database, which Step 4 does.
 */
test('a shipped migration repairs hosts that already ran the v0.8 seed', () => {
    const sql = readShippedSql();

    // Scoped to the migration that names the Forms application id, so this cannot be satisfied by
    // some other migration writing some other application's flag — which is what a bare
    // /DefaultForNewUser = 1/ over the whole corpus would have done. Several already do.
    const repairs = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
        .filter((body) => body.includes(FORMS_APP_ID) && /\[Application\]/i.test(body))
        .filter((body) => /SET\s+DefaultForNewUser\s*=\s*1/i.test(body));

    assert.ok(
        repairs.length > 0,
        `No shipped migration sets Application.DefaultForNewUser = 1 for the Forms application ` +
            `(${FORMS_APP_ID}). The metadata declaration alone never leaves a dev database, so ` +
            `every host that already ran V202608081700 keeps the 0 that seed wrote (#212).`,
    );

    assert.match(
        sql,
        new RegExp(`INSERT\\s+INTO\\s+\\[\\$\\{mjSchema\\}\\]\\.\\[UserApplication\\]`, 'i'),
        `No shipped migration backfills __mj.UserApplication. Flipping DefaultForNewUser repairs ` +
            `only users whose application list is EMPTY -- MJ's two provisioning paths are both ` +
            `new-user-only, and the Explorer self-heal is gated on userApps.length === 0. Without ` +
            `the backfill the fix is invisible to everyone who already uses the host (#212).`,
    );

    assert.ok(
        sql.includes(FORMS_APP_ID),
        `Shipped SQL does not mention the Forms application id ${FORMS_APP_ID}.`,
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/check-forms-application-launcher.spec.mjs`

Expected: **FAIL** on the second assertion (`No shipped migration backfills __mj.UserApplication`).

Note the first assertion may already pass — `V202608191300` and others write other
`DefaultForNewUser` values. That is fine; the second assertion is the one that carries this task.

- [ ] **Step 3: Write the migration**

Create `migrations/V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql`:

```sql
-- =============================================================================================
-- MJ Forms v0.12.x — put the Forms application in the launcher, on hosts that already exist
-- =============================================================================================
-- WHAT WAS WRONG (#212). `metadata/applications/.applications.json` declared the curated `Forms`
-- application `DefaultForNewUser: false`, so `V202608081700`'s spCreateApplication shipped 0.
-- `__mj.Application.DefaultForNewUser` decides whether an application is added to a user's
-- `__mj.UserApplication` list, and that list is what the Explorer app launcher renders. A textbook
-- install therefore listed 13 applications, none of them Forms — the only Forms-shaped entry being
-- `__mj_BizAppsForms`, the shell MJ's schema-sync mints from the schema name. The builder, both
-- dashboards and the seven browsable admin entities were reachable by nobody. Both siblings ship
-- `true`; Forms was the only one of the three that did not.
--
-- TWO WRITES, BECAUSE THE FLAG ALONE MOVES ALMOST NOBODY. MJ creates `UserApplication` rows from
-- exactly two places and both are new-user-only: the JWT provisioning path (MJServer
-- `auth/newUsers.ts`, inside new-User-row creation) and the Explorer client self-heal
-- (`base-application/src/lib/application-manager.ts`), which is gated on `userApps.length === 0`.
-- Anyone who has ever opened Explorer holds a non-empty list that is never reconsidered. Measured
-- on the upgrade-path rehearsal database before writing this file: applying only the flag left
-- `System` (7 rows) and `Anonymous` (2 rows) exactly as they were.
--
-- This is bizapps-caliber's V202609021000 in reverse. That migration had to unsubscribe existing
-- users AND clear the new-user flag, and records that either alone "looks done and rots". Ours rots
-- the other way: correct for users created later, invisible forever to everyone who exists now.
--
-- WHY THE BACKFILL SKIPS USERS WITH NO ROWS AT ALL, which is the part that is easy to get wrong.
-- The Explorer self-heal fires only on an EMPTY list. Give a zero-row user a single Forms row and
-- their list becomes non-empty, the self-heal never runs, and they sign in to a launcher holding
-- Forms and nothing else — no Home, no Data Explorer, no siblings. So zero-row users are left
-- alone deliberately: the flag above is what reaches them, in full, on first sign-in.
--
-- WHY IT DOES NOT FILTER BY ROLE. `UserInfoEngine.UserHasApplicationAccess` already gates the
-- launcher on `ApplicationRole.CanAccess`, and Forms ships two ApplicationRole rows (Developer,
-- UI). A row backfilled for a user without them renders nothing. Filtering here would duplicate a
-- decision MJ already makes AND under-deliver — a user granted the role tomorrow would still be
-- missing the row, and (non-empty list) would never self-heal.
--
-- WHY A MIGRATION AS WELL AS THE METADATA EDIT. `metadata/` remains the source of truth so a
-- regenerated seed reproduces this state, but that seed has already run on every existing host, so
-- the edit alone reaches only fresh installs. Same split as V202608181030, V202608201200 and
-- V202608201400.
--
-- Matched by the Application's hardcoded ID, which Forms mints itself in V202608081700.

DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

-- Precondition: the row ships in Forms' own seed. Its absence means this database never ran that
-- migration, and continuing would report success while changing nothing.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Application] WHERE ID = @FormsAppID)
    THROW 51150, 'Forms application row not found — V202608081700 has not run on this database.', 1;

-- ── 1. What reaches users created LATER ──────────────────────────────────────────────────────
UPDATE [${mjSchema}].[Application]
SET DefaultForNewUser = 1
WHERE ID = @FormsAppID;
GO

-- ── 2. What reaches the users who exist TODAY ────────────────────────────────────────────────
-- Guarded on the natural key, not on a minted ID: MJ ships
-- UQ_UserApplication_UserID_ApplicationID (core V202512301901), so an unguarded re-run would halt
-- the chain on a constraint violation rather than no-op. Sequence continues each user's own list,
-- matching what UserInfoEngine.doCreateDefaultApplications would have written (maxExistingSequence
-- + 1); ISNULL covers a user whose only rows are somehow NULL-sequenced.
DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

INSERT INTO [${mjSchema}].[UserApplication] ([ID], [UserID], [ApplicationID], [Sequence], [IsActive])
SELECT NEWID(), u.[ID], @FormsAppID,
       ISNULL((SELECT MAX(s.[Sequence]) FROM [${mjSchema}].[UserApplication] s WHERE s.[UserID] = u.[ID]), -1) + 1,
       1
FROM [${mjSchema}].[User] u
WHERE u.[IsActive] = 1
  -- Only users MJ can no longer reach. A user with no rows keeps none, so the client self-heal
  -- still provisions their FULL default set on first sign-in — see the header.
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] e WHERE e.[UserID] = u.[ID])
  -- Any row at all, active or not. A user who has deliberately uninstalled Forms holds an
  -- IsActive = 0 row, and re-adding it would override a choice they made.
  AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] f
                  WHERE f.[UserID] = u.[ID] AND f.[ApplicationID] = @FormsAppID);
GO

-- ── Postconditions ───────────────────────────────────────────────────────────────────────────
-- Assert what the launcher actually reads, so a silently-skipped write (a WHERE that matched
-- nothing, a column renamed under us) fails here rather than surfacing as an app nobody can find
-- and nobody connects back to this file.
DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Application]
               WHERE ID = @FormsAppID AND DefaultForNewUser = 1)
    THROW 51151, 'Forms application DefaultForNewUser was not applied.', 1;

-- Deliberately asks whether a ROW EXISTS, not whether it is active — mirroring the INSERT's own
-- guard. A user who has deliberately uninstalled Forms keeps `IsActive = 0`, and this migration
-- must not resurrect that choice; an `AND f.[IsActive] = 1` here would THROW on exactly that host
-- and take its whole chain down for a state the migration is correct to have left alone.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[User] u
    WHERE u.[IsActive] = 1
      AND EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] e WHERE e.[UserID] = u.[ID])
      AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] f
                      WHERE f.[UserID] = u.[ID] AND f.[ApplicationID] = @FormsAppID))
    THROW 51152, 'At least one active user with an existing application list still has no Forms UserApplication row.', 1;
```

Note the `DECLARE @FormsAppID` repeated after each `GO`: a batch separator ends variable scope, so
the declaration cannot be hoisted. This matches how the other multi-batch migrations here are
written.

- [ ] **Step 4: Prove it against a host-shaped database**

Do **not** run this against the shared dev database — migrating it desyncs MJ's host from its code.
Restore a private clone of the upgrade-path rehearsal host and apply the migration's SQL to it.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
set -a && . ./.env && set +a
node -e "
import('./smoke/lib/sqlcmd.mjs').then(({sql})=>{
  console.log(sql(\"BACKUP DATABASE [MJ_HostTest_Upgrade] TO DISK='/var/opt/mssql/data/i212v.bak' WITH INIT, COMPRESSION;\").split('\n').pop());
  console.log(sql(\"RESTORE DATABASE [MJ_I212_Verify] FROM DISK='/var/opt/mssql/data/i212v.bak' WITH MOVE 'MJ_HostTest_Upgrade' TO '/var/opt/mssql/data/MJ_I212_Verify.mdf', MOVE 'MJ_HostTest_Upgrade_log' TO '/var/opt/mssql/data/MJ_I212_Verify_log.ldf', REPLACE;\").split('\n').pop());
});"
```

Then apply the migration body with `${mjSchema}` resolved to `__mj`, and read the launcher predicate
before and after:

```bash
node -e "
import('./smoke/lib/sqlcmd.mjs').then(async ({sql})=>{
  const fs = await import('node:fs');
  const body = fs.readFileSync('migrations/V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql','utf8')
                 .replaceAll('\${mjSchema}','__mj');
  const state = () => sql(\`USE [MJ_I212_Verify];
    SELECT u.Name,
      (SELECT COUNT(*) FROM __mj.UserApplication x WHERE x.UserID=u.ID AND x.IsActive=1) AS Apps,
      CASE WHEN EXISTS (SELECT 1 FROM __mj.UserApplication ua WHERE ua.UserID=u.ID
        AND ua.ApplicationID='BFB97C57-4552-4643-8933-A0B2D76544D8' AND ua.IsActive=1)
      THEN 'FORMS VISIBLE' ELSE 'forms invisible' END AS Verdict
    FROM __mj.[User] u WHERE u.IsActive=1 ORDER BY u.Name;\`).replace(/Changed database context.*\n/,'');
  console.log('BEFORE\n'+state());
  console.log(sql('USE [MJ_I212_Verify];\n'+body));
  console.log('AFTER\n'+state());
});"
```

Expected **BEFORE**: every user reads `forms invisible`.
Expected **AFTER**: every user with `Apps >= 1` reads `FORMS VISIBLE`; any user with `Apps = 0`
(e.g. `Forms Automation Service`) still reads `forms invisible` — that is the deliberate behaviour
from the header, not a failure.
Expected: the migration prints no `Msg 5115x` THROW.

- [ ] **Step 5: Prove it is idempotent**

Re-apply the same body to the same database. Expected: no error, no THROW, and the AFTER state
unchanged (no duplicate rows — `UQ_UserApplication_UserID_ApplicationID` would raise `Msg 2627` if
the guard were wrong).

```bash
node -e "
import('./smoke/lib/sqlcmd.mjs').then(async ({sql})=>{
  const fs = await import('node:fs');
  const body = fs.readFileSync('migrations/V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql','utf8').replaceAll('\${mjSchema}','__mj');
  console.log(sql('USE [MJ_I212_Verify];\n'+body));
  console.log(sql(\"USE [MJ_I212_Verify]; SELECT COUNT(*) AS FormsRows FROM __mj.UserApplication WHERE ApplicationID='BFB97C57-4552-4643-8933-A0B2D76544D8';\"));
});"
```

- [ ] **Step 6: Run the spec and the shipped-SQL gates**

```bash
node --test scripts/check-forms-application-launcher.spec.mjs
npm run lint:distribution
npm run lint:migrations
```

Expected: all three **PASS**. `lint:distribution` CHECK 2 is the one most likely to object — it
fails any placeholder other than `${flyway:defaultSchema}` / `${mjSchema}` in shipped SQL.

- [ ] **Step 7: Commit**

```bash
git add migrations/V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql scripts/check-forms-application-launcher.spec.mjs
git commit -m "fix(#212): repair hosts that already shipped the invisible Forms app

The metadata declaration reaches only fresh installs. Every database that
already ran V202608081700 holds DefaultForNewUser = 0, and every user on it
who has opened Explorer holds a UserApplication list MJ never reconsiders --
both provisioning paths are new-user-only and the client self-heal is gated
on userApps.length === 0. Measured on the upgrade rehearsal host, the flag
alone moved nobody: System (7 rows) and Anonymous (2 rows) stayed without
Forms.

So two writes. The backfill deliberately skips users with NO rows: seeding
one row there would make the list non-empty and suppress the self-heal,
leaving them a launcher holding Forms and nothing else.

Verified on a restored clone of the upgrade-path rehearsal database, applied
twice to prove idempotence against UQ_UserApplication_UserID_ApplicationID."
```

---

### Task 3: Ship it

**Files:**
- Create: `.changeset/<two-word-slug>.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the changeset**

`minor`, per `.claude/rules/changesets.md` — this PR changes both `migrations/**.sql` and
`metadata/**`. Check the other changesets already on the branch first; if one is already `minor`,
this one still reads `minor` (a fixed group takes the highest).

Create `.changeset/forms-launcher-visibility.md`:

```markdown
---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-actions': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
---

Fix the Forms application never appearing in the Explorer app launcher (#212).

The curated `Forms` application shipped `DefaultForNewUser: false`, so it was never added to any
host user's `__mj.UserApplication` list — the list the launcher renders. The builder, both
dashboards and the seven browsable admin entities were unreachable on every host, fresh or
upgraded, and the only Forms-shaped entry an operator could find was the auto-generated
`__mj_BizAppsForms` schema shell.

Ships as two writes, because the flag alone repairs only users whose application list is empty:
`V202609131200` sets the flag for users created later and backfills `UserApplication` rows for the
users who exist today. Users with no rows at all are deliberately left alone so MJ's client
self-heal still provisions their full default set.
```

Confirm the package names against `.changeset/config.json` and an existing changeset before writing
— do not invent them.

- [ ] **Step 2: Verify the whole gate set**

```bash
node --test scripts/check-forms-application-launcher.spec.mjs
npm run lint:distribution
npm run lint:migrations
npm run lint:ui
npm run lint:generated
npm run check:release-seed
```

Expected: all **PASS**. `check:release-seed` verifies every declared `primaryKey` appears in shipped
SQL; the Forms application id already does, via `V202608081700`.

- [ ] **Step 3: Commit**

```bash
git add .changeset/forms-launcher-visibility.md
git commit -m "chore(#212): changeset for the launcher-visibility fix"
```

---

## Out of scope — log, do not fix here

The issue's **Related** section names a second, cosmetic half: the apps' shipped migrations call
`spUpdateExistingEntitiesFromSchema`, which under MJ's `AddToApplicationWithSchemaName` default
mints an `Application` named after the schema, so a host gets `__mj_BizAppsForms` and
`__mj_BizAppsCommon` ("Generated for schema") in the launcher beside the curated apps. The issue
says explicitly it is "worth deciding on separately", and `bizapps-caliber`'s
`V202609021000__v1.1.x__DeNavigateSchemaShim.sql` already solved the same problem for Caliber and is
the model for whoever picks it up — including its warning that the entities carried *only* by the
shim must be moved to the curated app first, or deprecating the shim makes them reachable from no
application at all. File it as its own issue; do not widen this PR.
