# Host-truth CodeGen convergence check — Implementation Plan (#220)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a check that builds a database from **only what this repo ships**, runs CodeGen against
it, and fails when CodeGen wants to change anything — the one question no existing gate asks, and the
reason #201 and #219 both reached every host.

**Architecture:** One Node-stdlib-only script (`scripts/check-host-truth-codegen.mjs`) that
orchestrates the `mj` CLI over a caller-provided **empty** database: core migrations, then
`bizapps-common`, then `bizapps-tasks`, then this repo's `migrations/`, then
`mj codegen --skipfiles --skip-commands --no-ai`. The verdict is binary and comes from CodeGen's own
capture folder (`mj.config.cjs` → `SQLOutput.folderPath`): **a new `CodeGen_Run_*.sql` file appeared
⇒ what we ship is incomplete.** The script never creates and never drops a database — provisioning
belongs to the caller, which is what makes it impossible for this check to destroy data. A new
workflow runs it nightly, on manual dispatch, and on pull requests that touch the inputs it reads.

**Tech Stack:** Node 24 (ESM `.mjs`, stdlib only), `node --test` for the spec, `@memberjunction/cli`
6.1.0-edge.5 (already a devDependency), GitHub Actions with an `mcr.microsoft.com/mssql/server:2022`
service container.

**Spec:** https://github.com/MemberJunction/bizapps-forms/issues/220 — plus the **Verified facts**
section below, which records what was measured on 2026-09-14/15 while reproducing the issue. Where the
two disagree, the measurements win and the plan says so.

---

## Verified facts (measured, not recalled — do not re-derive these)

Reproduction was run end-to-end before this plan was written. Everything here was observed.

1. **The clean-room chain works and is the recipe in `docs/database-operations.md` §4.** On a fresh
   sa-owned database: `mj migrate -t v6.1.0` (4m11s, 85 applied) → `mj migrate --schema
   __mj_BizAppsCommon --dir ../bizapps-common/migrations` (21s) → `--schema __mj_BizAppsTasks` (10s) →
   `--schema __mj_BizAppsForms --dir ./migrations` (28s) → `mj codegen`. Total ≈ 5–6 minutes locally.

2. **`next` is GREEN today.** With #201 (PR merged) and #219 (PR #223) landed, a clean-room build at
   `71d7c6b` produces **no capture file at all**. The issue's "it will be red on day one" caveat is
   already obsolete — the two defects it names are fixed, and so are the `EntityRelationship` /
   `RelatedEntityNameFieldMap` leftovers it mentions. This check can be turned on green.

3. **The detector fires on the pre-fix state.** Restoring the migrations-only database
   `MJ_Forms_SeedProof2_v012` (backup `/var/opt/mssql/data/i201.bak` in container `sql-mj-it`),
   which is `next` before those two fixes, and running the same CodeGen produces a **1017-line**
   `CodeGen_Run_*.sql` containing 3 `INSERT INTO [${mjSchema}].[EntityField]`, 16
   `UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=…`, 1
   `INSERT INTO [${mjSchema}].[EntityRelationship]`, and the base views / procedures / indexes for the
   affected entities.

4. **CodeGen exits 0 and reports `"success":true` in BOTH cases.** This is the crux: the CLI's own
   success signal says nothing about convergence. The capture file is the only signal, which is
   precisely why nothing in CI was asking.

5. **Convergence is idempotent and binary.** A second run on the already-converged database writes no
   capture file. The red database, once CodeGen has run on it, is converged and its second run also
   writes nothing. So "no new capture file" is a clean binary, not a judgement call.

6. **Stream contract of the `mj` CLI** (observed, `--format json`):
   - `mj migrate` writes its progress spinner to **stderr** and its findings to **stdout**:
     `No prior migration history detected — treating as a fresh install (baseline + later migrations).`
     on an empty database, or `Detected installed migration version: 202609132006 — fetching only
     migrations newer than it.` on a used one, then `Migrations complete in 16.1s — 1 applied`.
   - `mj codegen --format json` writes progress to **stderr** and a single machine-readable JSON
     document as the **last line of stdout**:
     `{"version":"1","success":true,"command":"codegen","durationSeconds":19.3,"data":{"entityCount":447,"skippedDb":false,"skippedFiles":true},"errors":[]}`

7. **`--skip-commands` exists and matters.** Without it, CodeGen's AFTER commands run `pnpm run build`
   in four packages (`mj.config.cjs`), which makes the exit code report unrelated build failures — and
   is why `mj codegen` is known to exit non-zero in a bare worktree. With `--skip-commands --no-ai` the
   run takes **19s instead of 33s**, needs no AI credentials, and **its exit code becomes
   trustworthy**. Use `--skipfiles --skip-commands --no-ai --no-banner --format json`.

8. **`--no-ai` is required for determinism, and costs nothing here.** Advanced generation is LLM-driven
   (descriptions, categories, search ranking); an assertion cannot be built on non-reproducible output.
   The green run above was verified with the flag on.

9. **A SQL driver was rejected on evidence.** Adding `mssql` as a root devDependency re-resolves the
   whole peer graph: **1574 lines** of `pnpm-lock.yaml` churn (`ws`, `@modelcontextprotocol/sdk`,
   `encoding` entering dozens of `@memberjunction/*` snapshot keys). `tedious@20.0.0` pinned exactly is
   only 3 lines — but neither is needed, because the script does not provision. See "Why the script
   never touches SQL directly" below.

10. **`bizapps-common` and `bizapps-tasks` are PRIVATE repos.** CI must check them out with a token;
    `secrets.GITHUB_TOKEN` cannot read another repository. The repo already uses the org-level GitHub
    App (`vars.APP_CLIENT_ID` / `secrets.APP_PRIVATE_KEY`, `publish.yml:285`).

### Why the script never touches SQL directly

The script takes `--database <name>` and **requires it to already exist and to be empty**. It does not
`CREATE DATABASE`, and — the part that matters — it cannot `DROP DATABASE`. On this estate `.env`
points at `MJ_ATS_Dev`, the shared dev database that MJ's host serves; a check that held a SQL
connection and a drop statement would be one bug away from destroying it.

Emptiness is not assumed, it is **verified from `mj migrate`'s own first line** (fact 6): the fresh
install line must be present, anything else is a hard failure. That is the same signal `CLAUDE.md`
already teaches people to read, so the check and the runbook agree by construction rather than by
coincidence.

The cost is that provisioning lives with the caller — one documented `sqlcmd` command locally, one
workflow step in CI. That is accepted deliberately: it keeps the script stdlib-only, like every other
gate in `scripts/` (each of which says so in its header, for the same reason), and it makes the
destructive capability absent rather than guarded.

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Node stdlib only** in `scripts/*.mjs`. No new runtime or dev dependency. Verified: the plan needs
  none.
- **Never `mj` bare.** `/opt/homebrew/bin/mj` is 5.49.0, two majors stale. Resolve
  `<repo>/node_modules/.bin/mj` and fall back to `npx mj`; a bare `mj` silently runs a 5.x CLI against
  a 6.1 database.
- **Never swallow an error.** Every failure path throws or exits with *what we were doing*, the exit
  code, and the tail of the child's output. Guard clauses validate inputs before any work.
- **Cap every wait.** Each child process gets an explicit timeout constant; the limit-hit case is
  reported as itself, never as a generic failure.
- **Tests for `scripts/*.mjs` are `node --test` specs** named `<script>.spec.mjs` next to the script.
  (The repo's Vitest `.spec.ts` convention is for `packages/`; the gate scripts use `node --test` —
  see `scripts/check-paths-touched.spec.mjs`.)
- **Do not name a CI job any of the seven required contexts** — `build-and-test`,
  `changes_and_migrations`, `codegen-append-gate`, `distribution-gate`, `generated-scope-gate`,
  `migration-order-gate`, `ui-token-gate`. A new required-looking name cannot be satisfied and would
  block every PR forever.
- **Path filtering lives in a job-level `if:` fed by `scripts/check-paths-touched.mjs`, never in
  `on: paths:`.** A workflow skipped by `on: paths:` creates no check run.
- **Changeset level: `patch`.** This ships no migration and no metadata (`.claude/rules/changesets.md`).
- **Never hand-edit anything under `packages/*/src/**/generated/`.** Nothing in this plan goes near it.
- **Do not run `pnpm install` inside this repo** (it unlinks the shared dev workspace and MJ's host
  stops booting). `node scripts/link-worktree-deps.mjs` is how this worktree got `node_modules`; it has
  already been run.
- **Commit message trailer**, on every commit in this plan:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Do not `git commit` beyond the commits this plan specifies**, and never `git push` until the
  finishing task says so.

## Working environment (already set up — do not redo)

- Worktree: `/Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-220`,
  branch `feat/220-host-truth-codegen-check`, cut from `origin/next` at `71d7c6b`.
- `node_modules` is linked (`node scripts/link-worktree-deps.mjs`), so `./node_modules/.bin/mj` works.
- `.env` exists and points at `MJ_ATS_Dev` — **leave it that way**; it is the guard's negative case.
- SQL Server: docker container `sql-mj-it`, host port **1455**, sa password is `DB_PASSWORD` in `.env`.
- Two databases already exist for verification:
  - **`MJ_I220_Clean`** — a converged clean-room build of this branch. Re-run CodeGen on it and the
    capture stays empty (the GREEN fixture).
  - **`MJ_I220_Red`** — restorable from `/var/opt/mssql/data/i201.bak` to the pre-#201/#219 state (the
    RED fixture). **CodeGen converges it, so restore it again before each red run:**
    ```bash
    PW=$(grep -E '^DB_PASSWORD' .env | sed -E "s/^DB_PASSWORD='?([^']*)'?/\1/")
    docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -C -Q \
      "ALTER DATABASE [MJ_I220_Red] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
       RESTORE DATABASE [MJ_I220_Red] FROM DISK='/var/opt/mssql/data/i201.bak'
         WITH MOVE 'MJ_Forms_SeedProof2_v012' TO '/var/opt/mssql/data/MJ_I220_Red.mdf',
              MOVE 'MJ_Forms_SeedProof2_v012_log' TO '/var/opt/mssql/data/MJ_I220_Red_log.ldf', REPLACE;
       ALTER DATABASE [MJ_I220_Red] SET MULTI_USER;
       ALTER AUTHORIZATION ON DATABASE::[MJ_I220_Red] TO [sa];"
    ```
- Sibling checkouts: `/Users/sohamdesai/Projects/mj-dev/bizapps-common` and `…/bizapps-tasks`. From the
  worktree they are at `../../../../bizapps-common/migrations` — **which is why the script must take
  them as options rather than assume `../`**.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/check-host-truth-codegen.mjs` (create) | The whole check: five pure exported helpers + a `main()` that orchestrates the `mj` CLI and renders the verdict. |
| `scripts/check-host-truth-codegen.spec.mjs` (create) | `node --test` spec for the five pure helpers. The orchestration is covered by the real runs in Task 3 and by CI. |
| `package.json` (modify) | `check:host-truth`, `check:host-truth:test`. |
| `.github/workflows/host-truth-gate.yml` (create) | Nightly + dispatch + scoped-PR run: SQL Server service, sibling checkouts, provision, run. |
| `.github/workflows/build.yml` (modify) | Run the new spec alongside the other gate specs, so the check's logic is tested on every PR even when the expensive job is skipped. |
| `docs/database-operations.md` (modify, §4) | Point the clean-room section at the script instead of leaving five commands to be typed by hand. |
| `.changeset/*.md` (create) | `patch`. |

---

### Task 1: The five pure helpers, test-first

**Files:**
- Create: `scripts/check-host-truth-codegen.mjs` (helpers + header only; `main()` arrives in Task 2)
- Create: `scripts/check-host-truth-codegen.spec.mjs`
- Modify: `package.json` (add `check:host-truth:test`)

**Interfaces — Produces** (Task 2 and the spec both depend on these exact names):

```js
export function coreMigrationTag(mjVersionRange)            // '>=6.1.0-edge.5 <7.0.0' -> 'v6.1.0'
export function readMigrateStart(stdout)                    // -> { fresh: boolean, installedVersion: string|null }
export function readCliResult(stdout)                       // -> parsed JSON object | null
export function newCaptureFiles({ before, after })          // -> string[] (sorted)
export function summarizeCapture(sql)                       // -> Array<{ label: string, count: number }>
export function workingDatabaseName({ envFileText, processEnv })  // -> string | null
```

(Six, not five — `workingDatabaseName` is the guard that stops a clean-room run from landing in the
shared dev database.)

- [ ] **Step 1: Write the failing spec**

Create `scripts/check-host-truth-codegen.spec.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coreMigrationTag,
  newCaptureFiles,
  readCliResult,
  readMigrateStart,
  summarizeCapture,
  workingDatabaseName,
} from './check-host-truth-codegen.mjs';

test('coreMigrationTag reads the floor of the declared range and drops the prerelease', () => {
  assert.equal(coreMigrationTag('>=6.1.0-edge.5 <7.0.0'), 'v6.1.0');
  assert.equal(coreMigrationTag('>=5.31.0 <6.0.0'), 'v5.31.0');
  assert.equal(coreMigrationTag('>= 6.1.0-edge.5 <7.0.0'), 'v6.1.0');
});

test('coreMigrationTag refuses a range with no lower bound rather than guessing one', () => {
  assert.throws(() => coreMigrationTag('^6.1.0'), /lower bound/i);
  assert.throws(() => coreMigrationTag(''), /lower bound/i);
});

test('readMigrateStart recognises the fresh-install line', () => {
  const stdout = 'No prior migration history detected — treating as a fresh install (baseline + later migrations).\nMigrating to v6.1.0\n';
  assert.deepEqual(readMigrateStart(stdout), { fresh: true, installedVersion: null });
});

test('readMigrateStart reports the watermark of a database that is NOT empty', () => {
  const stdout = 'Detected installed migration version: 202609132006 — fetching only migrations newer than it.\n';
  assert.deepEqual(readMigrateStart(stdout), { fresh: false, installedVersion: '202609132006' });
});

test('readMigrateStart treats output it cannot read as NOT fresh', () => {
  // Fail closed: an unreadable start line must never be read as "the database was empty".
  assert.deepEqual(readMigrateStart('Migrating to v6.1.0\n'), { fresh: false, installedVersion: null });
  assert.deepEqual(readMigrateStart(''), { fresh: false, installedVersion: null });
});

test('readCliResult returns the JSON document the CLI puts on its last stdout line', () => {
  const stdout = [
    'MJ startup: task mode — engine pre-warm skipped',
    '{"version":"1","success":true,"command":"codegen","data":{"skippedDb":false,"skippedFiles":true},"errors":[]}',
  ].join('\n');
  assert.equal(readCliResult(stdout).success, true);
  assert.equal(readCliResult(stdout).data.skippedDb, false);
});

test('readCliResult skips a log line that merely begins with a brace', () => {
  const stdout = [
    '{ not json at all',
    '{"version":"1","success":true,"command":"codegen","data":{},"errors":[]}',
    '',
  ].join('\n');
  assert.equal(readCliResult(stdout).command, 'codegen');
});

test('readCliResult returns null when the CLI printed no result document', () => {
  assert.equal(readCliResult('just some text\n'), null);
  assert.equal(readCliResult(''), null);
});

test('newCaptureFiles reports only what appeared during the run', () => {
  assert.deepEqual(
    newCaptureFiles({ before: ['CodeGen_Run_A.sql'], after: ['CodeGen_Run_A.sql', 'CodeGen_Run_B.sql'] }),
    ['CodeGen_Run_B.sql'],
  );
  assert.deepEqual(newCaptureFiles({ before: [], after: [] }), []);
  // A file the developer already had staged is NOT our verdict — the check must not destroy or
  // claim someone else's capture.
  assert.deepEqual(newCaptureFiles({ before: ['x.sql'], after: ['x.sql'] }), []);
});

test('summarizeCapture names the metadata writes a host would be missing', () => {
  const sql = `
    INSERT INTO [\${mjSchema}].[EntityField]
       ([ID],[EntityID]) VALUES ('a','b');
    INSERT INTO [\${mjSchema}].[EntityField]
       ([ID],[EntityID]) VALUES ('c','d');
    UPDATE [\${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='e';
    INSERT INTO [\${mjSchema}].[EntityRelationship] ([ID]) VALUES ('f');
    CREATE VIEW [\${flyway:defaultSchema}].[vwFormDistributions] AS SELECT 1;
    DROP VIEW [\${flyway:defaultSchema}].[vwFormDistributions];
  `;
  assert.deepEqual(summarizeCapture(sql), [
    { label: 'INSERT INTO ${mjSchema}.EntityField', count: 2 },
    { label: 'CREATE VIEW', count: 1 },
    { label: 'DROP VIEW', count: 1 },
    { label: 'INSERT INTO ${mjSchema}.EntityRelationship', count: 1 },
    { label: 'UPDATE ${mjSchema}.EntityFieldValue', count: 1 },
  ]);
});

test('summarizeCapture is empty for SQL that changes nothing', () => {
  assert.deepEqual(summarizeCapture('-- nothing to do\n'), []);
});

test('workingDatabaseName prefers the process environment over the .env file', () => {
  assert.equal(
    workingDatabaseName({ envFileText: "DB_DATABASE='MJ_ATS_Dev'\n", processEnv: { DB_DATABASE: 'MJ_Other' } }),
    'MJ_Other',
  );
});

test('workingDatabaseName reads the .env file in either quoting style', () => {
  assert.equal(workingDatabaseName({ envFileText: "DB_DATABASE='MJ_ATS_Dev'\n", processEnv: {} }), 'MJ_ATS_Dev');
  assert.equal(workingDatabaseName({ envFileText: 'DB_DATABASE=MJ_ATS_Dev\n', processEnv: {} }), 'MJ_ATS_Dev');
  assert.equal(workingDatabaseName({ envFileText: 'DB_DATABASE="MJ_ATS_Dev"  \n', processEnv: {} }), 'MJ_ATS_Dev');
});

test('workingDatabaseName ignores a commented-out assignment and a missing file', () => {
  assert.equal(workingDatabaseName({ envFileText: "# DB_DATABASE='MJ_ATS_Dev'\n", processEnv: {} }), null);
  assert.equal(workingDatabaseName({ envFileText: null, processEnv: {} }), null);
});
```

- [ ] **Step 2: Add the npm script and run the spec to watch it fail**

Add to `package.json` `scripts`, immediately after `"check:seed-cadence"`:

```json
"check:host-truth:test": "node --test scripts/check-host-truth-codegen.spec.mjs",
```

Run: `npm run check:host-truth:test`
Expected: FAIL — `Cannot find module …/check-host-truth-codegen.mjs`.

- [ ] **Step 3: Write the helpers**

Create `scripts/check-host-truth-codegen.mjs`. Header first — it carries the *why*, in the same voice
as the other gates in this directory:

```js
#!/usr/bin/env node
/**
 * Gate: build a database from ONLY what this repo ships, run CodeGen against it, and fail if CodeGen
 * wants to change anything.
 *
 * ── THE QUESTION NOTHING ELSE ASKS ──────────────────────────────────────────────────────────────
 * Every other check here reads the REPOSITORY. check-distribution-seed.mjs reads literals in SQL
 * text; check-codegen-append.mjs reads a diff — and its CHECK 2 is diff-scoped on purpose, because
 * nine merged migrations predate the rule and a whole-tree version would be permanently red. That
 * scoping has a consequence nobody could act on: the moment a migration merges without its CodeGen
 * output there is no diff left to scope to, so the omission becomes invisible forever.
 *
 * Two shipped that way. #201 (`V202609091600` added FormResponse.FormDistributionID with no
 * EntityField row — every Form Response save failed on a host, silently, because BaseEntity.Set on a
 * field with no EntityField row is a no-op) and #219 (a Signature→Doodle rename that skipped the
 * EntityFieldValue.Sequence rewrite). Both carried a "RUN mj:codegen AFTER APPLYING THIS" banner,
 * which is the one instruction a host cannot follow: `mj app install` puts __mj_BizAppsForms in the
 * host's excludeSchemas, so the host's CodeGen never runs against our schema. `migrations/` is the
 * only channel we have. Neither defect was found by CI; an unrelated MJ upgrade found them.
 *
 * So this check reads the ARTEFACT instead of the repository: it builds what a host builds and looks
 * at it. See issue #220.
 *
 * ── THE VERDICT IS A FILE, NOT AN EXIT CODE ─────────────────────────────────────────────────────
 * `mj codegen` exits 0 and reports {"success":true} whether or not the database it just looked at was
 * complete — measured on both a converged and an unconverged database. Its only signal is the capture
 * it writes into mj.config.cjs's SQLOutput.folderPath: the SQL a host would have to run. A converged
 * database produces NO capture file at all, so the verdict is binary rather than a judgement call.
 * We compare the folder before and after, so a capture a developer already had staged is neither
 * destroyed nor mistaken for our answer.
 *
 * ── WHY THIS SCRIPT HOLDS NO DATABASE CONNECTION ────────────────────────────────────────────────
 * It takes an EXISTING, EMPTY database and never creates or drops one. `.env` on a dev machine points
 * at the shared database MJ's host serves; a check that could DROP DATABASE is one bug away from
 * taking it. Emptiness is verified rather than trusted, from `mj migrate`'s own first stdout line —
 * the same signal the root CLAUDE.md teaches — and a run against the database named in .env is
 * refused outright.
 *
 * Node stdlib only, like every other gate here: a dependency problem must never be the reason nobody
 * finds out.
 */
```

Then the helpers:

```js
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `mj migrate -t` tag a host sitting at our declared floor would be on. */
export function coreMigrationTag(mjVersionRange) {
  const lowerBound = /(?:^|\s)>=\s*(\d+)\.(\d+)\.(\d+)/.exec(mjVersionRange ?? '');
  if (!lowerBound) {
    throw new Error(
      `mj-app.json's mjVersionRange ${JSON.stringify(mjVersionRange)} has no '>=X.Y.Z' lower bound, ` +
        'so the core migration tag cannot be derived. Pass --core-tag vX.Y.Z to say it explicitly.',
    );
  }
  const [, major, minor, patch] = lowerBound;
  return `v${major}.${minor}.${patch}`;
}

/**
 * What `mj migrate` said about the database it started on. stdout only — the spinner is on stderr.
 *
 * Fails CLOSED: output we cannot read reports `fresh: false`, because reading "the database was
 * empty" out of silence is the one mistake that would make this whole check meaningless.
 */
export function readMigrateStart(stdout) {
  const text = stdout ?? '';
  if (text.includes('No prior migration history detected')) {
    return { fresh: true, installedVersion: null };
  }
  const watermark = /Detected installed migration version:\s*(\S+)/.exec(text);
  return { fresh: false, installedVersion: watermark ? watermark[1] : null };
}

/** How many trailing lines of a CLI's stdout may be searched for its result document. */
const RESULT_SEARCH_LINES = 20;

/** The machine-readable result the CLI prints as the last line of stdout, or null. */
export function readCliResult(stdout) {
  const lines = (stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const floor = Math.max(0, lines.length - RESULT_SEARCH_LINES);
  for (let i = lines.length - 1; i >= floor; i--) {
    if (!lines[i].startsWith('{')) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {
      // Not the result document — a progress line can begin with a brace. Keep looking; if no line
      // parses, the caller gets null and treats that as a failure, so nothing is swallowed.
    }
  }
  return null;
}

/** Capture files that appeared during the run — never the ones that were already there. */
export function newCaptureFiles({ before, after }) {
  const alreadyThere = new Set(before);
  return after.filter((name) => !alreadyThere.has(name)).sort();
}

/**
 * What a capture file is asking a host to run, condensed. Metadata writes first — those are the
 * defect class this gate exists for — then the object DDL that came with them.
 */
export function summarizeCapture(sql) {
  const counts = new Map();
  const bump = (label) => counts.set(label, (counts.get(label) ?? 0) + 1);

  const metadataWrite = /\b(INSERT INTO|UPDATE|DELETE FROM)\s+\[?\$\{mjSchema\}\]?\.\[?(\w+)\]?/gi;
  for (const [, verb, table] of (sql ?? '').matchAll(metadataWrite)) {
    bump(`${verb.toUpperCase()} \${mjSchema}.${table}`);
  }
  const objectDdl = /\b(CREATE|DROP|ALTER)\s+(VIEW|PROCEDURE|TRIGGER|INDEX|TABLE|FUNCTION)\b/gi;
  for (const [, verb, kind] of (sql ?? '').matchAll(objectDdl)) {
    bump(`${verb.toUpperCase()} ${kind.toUpperCase()}`);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The database this checkout works against — the one a clean-room run must never be. */
export function workingDatabaseName({ envFileText, processEnv }) {
  if (processEnv?.DB_DATABASE) return processEnv.DB_DATABASE;
  const assignment = /^[ \t]*DB_DATABASE[ \t]*=[ \t]*(['"]?)([^'"\n#]+?)\1[ \t]*$/m.exec(envFileText ?? '');
  return assignment ? assignment[2] : null;
}
```

> Note on `summarizeCapture`'s expected order in the spec: counts descending, then label ascending.
> `INSERT INTO ${mjSchema}.EntityField` (2) sorts first; the four singletons sort
> `CREATE VIEW` < `DROP VIEW` < `INSERT INTO ${mjSchema}.EntityRelationship` < `UPDATE ${mjSchema}.EntityFieldValue`.

- [ ] **Step 4: Run the spec and watch it pass**

Run: `npm run check:host-truth:test`
Expected: PASS, 13 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-host-truth-codegen.mjs scripts/check-host-truth-codegen.spec.mjs package.json
git commit -m "$(cat <<'EOF'
test(gates): the pieces a host-truth convergence check is made of

Six pure helpers with a node --test spec, ahead of the orchestration that
uses them. The two that carry the safety properties are readMigrateStart,
which fails closed so unreadable output can never be read as "the database
was empty", and workingDatabaseName, which is how the check refuses to run
a clean-room build inside the shared dev database.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The orchestration

**Files:**
- Modify: `scripts/check-host-truth-codegen.mjs` (append `main()` and its private helpers)
- Modify: `package.json` (add `check:host-truth`)

**Interfaces — Consumes:** every export from Task 1.
**Produces:** a CLI —
`node scripts/check-host-truth-codegen.mjs --database <name> [--common-migrations <dir>] [--tasks-migrations <dir>] [--core-tag vX.Y.Z]`
— exit 0 when converged, exit 1 for any precondition failure or non-convergence.

- [ ] **Step 1: Write the orchestration**

Append to `scripts/check-host-truth-codegen.mjs`:

```js
const require = createRequire(import.meta.url);

/**
 * Per-step ceilings. The core chain is 85 migrations and took 4m11s on a developer laptop; a cold CI
 * runner is slower. Capped rather than open-ended so a hung child is reported as a hung child.
 */
const STEP_TIMEOUT_MS = { migrateCore: 45 * 60_000, migrateApp: 15 * 60_000, codegen: 30 * 60_000 };

/** Where CodeGen writes its capture — read from mj.config.cjs so this decision lives in one place. */
function captureDirectory() {
  const folder = require(path.join(REPO_ROOT, 'mj.config.cjs'))?.SQLOutput?.folderPath;
  if (!folder) {
    throw new Error('mj.config.cjs has no SQLOutput.folderPath, so there is no capture folder to read.');
  }
  return path.resolve(REPO_ROOT, folder);
}

function listCaptures(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith('.sql'));
}

/**
 * The MJ CLI, never bare. `/opt/homebrew/bin/mj` is two majors behind the pinned one and would run a
 * 5.x CLI against a 6.1 database without saying so.
 */
function mjCommand() {
  const local = path.join(REPO_ROOT, 'node_modules', '.bin', 'mj');
  if (existsSync(local)) return { command: local, prefix: [] };
  return { command: 'npx', prefix: ['--no-install', 'mj'] };
}

/**
 * Run one `mj` step. Progress goes straight to our stderr so a long chain is watchable; stdout is
 * captured because that is where the CLI puts its findings.
 */
function runMj({ label, args, database, timeout }) {
  const { command, prefix } = mjCommand();
  process.stderr.write(`\n── ${label}\n`);
  const child = spawnSync(command, [...prefix, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
    // dotenv does not overwrite a variable already in the environment, so this — not an edit to
    // .env — is what points the CLI at the clean room.
    env: { ...process.env, DB_DATABASE: database },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (child.error?.code === 'ETIMEDOUT') {
    throw new Error(`${label}: no answer within ${Math.round(timeout / 60_000)} minutes — giving up rather than waiting forever.`);
  }
  if (child.error) throw new Error(`${label}: could not run ${command} — ${child.error.message}`);
  const stdout = child.stdout ?? '';
  process.stdout.write(stdout);
  if (child.status !== 0) {
    throw new Error(
      `${label}: mj exited ${child.status}.\n` +
        (stdout.trim() ? `Its last words on stdout:\n${stdout.trim().split('\n').slice(-15).join('\n')}\n` : '') +
        'If the failure mentions "The login already has an account under a different user name", the ' +
        'database was not created owned by [sa] — see docs/database-operations.md §4.',
    );
  }
  return stdout;
}

function parseArgs(argv) {
  const options = { database: null, commonMigrations: '../bizapps-common/migrations', tasksMigrations: '../bizapps-tasks/migrations', coreTag: null };
  const byFlag = { '--database': 'database', '--common-migrations': 'commonMigrations', '--tasks-migrations': 'tasksMigrations', '--core-tag': 'coreTag' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = byFlag[argv[i]];
    if (!key) throw new Error(`Unknown option ${argv[i]}. Known: ${Object.keys(byFlag).join(', ')}.`);
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value.`);
    options[key] = argv[i + 1];
  }
  return options;
}

/** Everything that must be true before a single migration runs. */
function checkPreconditions(options) {
  if (!options.database) {
    throw new Error(
      'A clean-room database name is required: --database <name>.\n' +
        'It must already exist, be EMPTY, and be owned by [sa]. Create one with:\n' +
        "  docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P \"$DB_PASSWORD\" -C -Q \\\n" +
        '    "CREATE DATABASE [MJ_HostTruth]; ALTER AUTHORIZATION ON DATABASE::[MJ_HostTruth] TO [sa];"',
    );
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(options.database)) {
    throw new Error(`--database ${JSON.stringify(options.database)} is not a plain identifier; refusing to pass it on.`);
  }
  const envPath = path.join(REPO_ROOT, '.env');
  const working = workingDatabaseName({
    envFileText: existsSync(envPath) ? readFileSync(envPath, 'utf8') : null,
    processEnv: process.env,
  });
  if (working && working === options.database) {
    throw new Error(
      `--database ${options.database} is the database this checkout already works against. A clean-room ` +
        'build would run every migration into it; refusing. Name a throwaway database instead.',
    );
  }
  for (const [what, dir] of [
    ['this repo', path.join(REPO_ROOT, 'migrations')],
    ['bizapps-common (--common-migrations)', path.resolve(REPO_ROOT, options.commonMigrations)],
    ['bizapps-tasks (--tasks-migrations)', path.resolve(REPO_ROOT, options.tasksMigrations)],
  ]) {
    if (!existsSync(dir)) {
      throw new Error(
        `No migrations directory for ${what} at ${dir}. Forms' baseline cannot apply without common ` +
          'and tasks — FormResponse.RespondentPersonID has a hard FK to MJ_BizApps_Common: People.',
      );
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  checkPreconditions(options);

  const coreTag = options.coreTag ?? coreMigrationTag(require(path.join(REPO_ROOT, 'mj-app.json')).mjVersionRange);
  const capture = captureDirectory();
  const before = listCaptures(capture);

  console.log(`Host-truth build of ${options.database}: core ${coreTag}, then common, tasks, forms, then CodeGen.`);

  const coreOut = runMj({ label: `core migrations (${coreTag})`, args: ['migrate', '-t', coreTag], database: options.database, timeout: STEP_TIMEOUT_MS.migrateCore });
  const start = readMigrateStart(coreOut);
  if (!start.fresh) {
    throw new Error(
      `${options.database} is not empty — mj reported ${start.installedVersion ? `installed migration version ${start.installedVersion}` : 'no fresh-install line at all'}. ` +
        'A clean room must start from nothing, or it proves nothing. Drop and recreate it.',
    );
  }

  runMj({ label: 'bizapps-common migrations', args: ['migrate', '--schema', '__mj_BizAppsCommon', '--dir', options.commonMigrations], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });
  runMj({ label: 'bizapps-tasks migrations', args: ['migrate', '--schema', '__mj_BizAppsTasks', '--dir', options.tasksMigrations], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });
  runMj({ label: 'this repo\'s migrations', args: ['migrate', '--schema', '__mj_BizAppsForms', '--dir', './migrations'], database: options.database, timeout: STEP_TIMEOUT_MS.migrateApp });

  const codegenOut = runMj({
    label: 'CodeGen, database pass only',
    // --skip-commands: the AFTER commands build four packages, which makes the exit code report
    // unrelated build failures. --no-ai: advanced generation is LLM-driven and an assertion cannot
    // rest on non-reproducible output.
    args: ['codegen', '--skipfiles', '--skip-commands', '--no-ai', '--no-banner', '--format', 'json'],
    database: options.database,
    timeout: STEP_TIMEOUT_MS.codegen,
  });
  const result = readCliResult(codegenOut);
  if (!result || result.command !== 'codegen' || result.success !== true || result.data?.skippedDb !== false) {
    throw new Error(
      'Could not confirm CodeGen ran its database pass, so its silence proves nothing. Its result ' +
        `document was ${result ? JSON.stringify(result) : 'absent from stdout'}.`,
    );
  }

  const appeared = newCaptureFiles({ before, after: listCaptures(capture) });
  if (appeared.length === 0) {
    console.log(`\n✅ Converged. What this repo ships builds a database CodeGen wants to change nothing about.`);
    console.log(`   ${options.database} is still there; drop it when you are done with it.`);
    return;
  }

  console.error(`\n❌ NOT converged. CodeGen wants ${appeared.length} change set(s) that no migration ships:`);
  for (const name of appeared) {
    const file = path.join(capture, name);
    console.error(`\n   ${path.relative(REPO_ROOT, file)}`);
    for (const { label, count } of summarizeCapture(readFileSync(file, 'utf8'))) {
      console.error(`     ${String(count).padStart(4)} × ${label}`);
    }
  }
  console.error(
    '\nEvery line of that is SQL a host would need and will never run — `mj app install` excludes ' +
      '__mj_BizAppsForms from the host\'s CodeGen, so migrations/ is the only channel. Append the ' +
      'output to the migration that caused it (docs/database-operations.md §2), or ship a new one.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
```

Add to `package.json` `scripts`, immediately before `check:host-truth:test`:

```json
"check:host-truth": "node scripts/check-host-truth-codegen.mjs",
```

- [ ] **Step 2: Prove the guards fire, before spending five minutes on a build**

Run each and read the message:

```bash
node scripts/check-host-truth-codegen.mjs                              # no --database
node scripts/check-host-truth-codegen.mjs --database MJ_ATS_Dev        # the working database
node scripts/check-host-truth-codegen.mjs --database MJ_I220_Spike --common-migrations ./nope
```

Expected, in order: "A clean-room database name is required"; "is the database this checkout already
works against … refusing"; "No migrations directory for bizapps-common". Exit code 1 each time
(`echo $?`).

- [ ] **Step 3: Prove it goes RED on a database that is missing shipped metadata**

The chain is not re-run for this — the point is the detector, and `MJ_I220_Red` is a real
migrations-only host at the pre-fix state. Restore it (command in "Working environment"), then run the
same CodeGen step the script runs and confirm a capture appears:

```bash
rm -rf migrations/codegen
DB_DATABASE=MJ_I220_Red ./node_modules/.bin/mj codegen --skipfiles --skip-commands --no-ai --no-banner --format json >/dev/null
ls migrations/codegen/     # expect one CodeGen_Run_*.sql
node -e "
  const { summarizeCapture } = await import('./scripts/check-host-truth-codegen.mjs');
  const fs = require('node:fs');
  const f = fs.readdirSync('migrations/codegen')[0];
  console.log(summarizeCapture(fs.readFileSync('migrations/codegen/' + f, 'utf8')));
" --input-type=module
rm -rf migrations/codegen
```

Expected: the summary names `INSERT INTO ${mjSchema}.EntityField` ×3,
`UPDATE ${mjSchema}.EntityFieldValue` ×16, `INSERT INTO ${mjSchema}.EntityRelationship` ×1, plus the
view/procedure/index DDL. **If it does not, stop and report** — the detector is the whole deliverable.

- [ ] **Step 4: Run the whole check for real, end to end, and watch it come back green**

```bash
PW=$(grep -E '^DB_PASSWORD' .env | sed -E "s/^DB_PASSWORD='?([^']*)'?/\1/")
docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -C -Q \
  "IF DB_ID('MJ_I220_Gate') IS NOT NULL BEGIN ALTER DATABASE [MJ_I220_Gate] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [MJ_I220_Gate]; END;
   CREATE DATABASE [MJ_I220_Gate]; ALTER AUTHORIZATION ON DATABASE::[MJ_I220_Gate] TO [sa];"

npm run check:host-truth -- --database MJ_I220_Gate \
  --common-migrations ../../../../bizapps-common/migrations \
  --tasks-migrations ../../../../bizapps-tasks/migrations
echo "exit=$?"
```

Expected: ~6 minutes, then `✅ Converged.` and `exit=0`. **This is the run that matters** — it is the
issue's own recipe, executed by the script, on this branch.

Then confirm the emptiness guard is not theatre, by pointing it at the database it just built:

```bash
npm run check:host-truth -- --database MJ_I220_Gate \
  --common-migrations ../../../../bizapps-common/migrations \
  --tasks-migrations ../../../../bizapps-tasks/migrations
```

Expected: fails within ~20s with `MJ_I220_Gate is not empty — mj reported installed migration version …`.

- [ ] **Step 5: Leave the tree clean**

`migrations/codegen/`, `SQL Scripts/generated/` and `codegen.output.log` are gitignored staging that
the runs above create. Remove them and confirm:

```bash
rm -rf migrations/codegen "SQL Scripts/generated" codegen.output.log
git status --porcelain      # expect only the two files this task edits
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-host-truth-codegen.mjs package.json
git commit -m "$(cat <<'EOF'
feat(gates): build a database from only what we ship and ask CodeGen if it is complete

Every other check here reads the repository. This one reads the artefact:
core, common, tasks and our own migrations into an empty database, then
`mj codegen --skipfiles`, and the verdict is whether CodeGen wrote a capture
file. It writes none against a complete set, and 1017 lines against `next`
as it stood before #201 and #219 — neither of which any gate could see.

`mj codegen` exits 0 and reports success on both, which is why the exit code
is not the verdict.

The script holds no database connection and cannot drop anything: it takes an
existing empty database, verifies the emptiness from mj's own first line, and
refuses the database named in .env.

Refs #220

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The workflow

**Files:**
- Create: `.github/workflows/host-truth-gate.yml`
- Modify: `.github/workflows/build.yml` (run the new spec with the other gate specs)

**Interfaces — Consumes:** `npm run check:host-truth` and `npm run check:host-truth:test` from Tasks 1–2.

Design notes the implementer must not "simplify" away:

- **Job names are `host-truth-scope` and `host-truth`.** Neither may be one of the seven required
  contexts, and neither may be `scope` — `build.yml` already has a job by that name and two check runs
  with one name is a reader's trap.
- **The three checkouts mirror the local layout** — `bizapps-forms/`, `bizapps-common/`,
  `bizapps-tasks/` side by side — so the script's own `../bizapps-*/migrations` defaults are what CI
  exercises. A CI-only path shape is a second thing to keep right.
- **The siblings are private repos**, so they need the org GitHub App token; `secrets.GITHUB_TOKEN`
  cannot read them. If the App is not installed on them, the token step fails loudly — which is the
  correct outcome, not something to paper over.
- **`.env` is generated from the values below.** The CLI reads DB settings from the environment via
  dotenv, and a real `.env` is the shape every local run uses.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/host-truth-gate.yml`:

```yaml
# Build a database from ONLY what this repository ships, run CodeGen against it, and fail if CodeGen
# wants to change anything. See scripts/check-host-truth-codegen.mjs for why this is the only check
# that reads the artefact rather than the repository, and issue #220 for the two defects that reached
# every host because nothing did.
#
# NOT a required status check, deliberately. It needs a SQL Server, two sibling checkouts and ~15
# minutes, which is the wrong shape for every pull request. It runs nightly on the default branch, on
# demand, and on the pull requests that touch what it reads. Promote it into publish.yml alongside
# check:release-seed once it has a track record; that is the other half of #220's own suggestion.
name: Host-truth CodeGen convergence

on:
  schedule:
    # 09:00 UTC daily. Nightly is the point: a migration that merges without its CodeGen output
    # becomes invisible to the diff-scoped gate the moment it lands, so the next run after the merge
    # is the last chance to catch it before a release.
    - cron: '0 9 * * *'
  workflow_dispatch:
  # No `paths:` filter. Path decisions live in the job-level `if:` below, fed by
  # scripts/check-paths-touched.mjs — a workflow skipped by `on: paths:` creates no check run at all.
  pull_request:

concurrency:
  group: host-truth-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  host-truth-scope:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      relevant: ${{ steps.decide.outputs.relevant }}
    steps:
      - uses: actions/checkout@v4
        with:
          # The decision is a diff against the base, which shallow history does not contain.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Check the path decider still fires
        run: npm run lint:paths-touched:test

      - name: Does this change touch anything the host-truth build reads?
        id: decide
        env:
          # A pull_request diffs against its base. A schedule or a dispatch has neither SHA, which
          # check-paths-touched.mjs treats as fail-open — so those always run, which is what we want.
          BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
          HEAD_SHA: ${{ github.sha }}
        run: |
          RELEVANT=$(node scripts/check-paths-touched.mjs "$BASE_SHA" "$HEAD_SHA" \
            migrations/ \
            metadata/ \
            mj.config.cjs \
            mj-app.json \
            package.json \
            pnpm-lock.yaml \
            scripts/ \
            .github/workflows/)
          echo "relevant=$RELEVANT" >> "$GITHUB_OUTPUT"
          echo "host-truth relevant: $RELEVANT"

  host-truth:
    needs: host-truth-scope
    # Same fail-open rule the decider applies to itself, one level up: if the decider could not
    # decide, build. `!cancelled()` rather than `always()`, matching build.yml — this workflow sets
    # cancel-in-progress, and `always()` would keep a 20-minute build running after cancellation.
    if: ${{ !cancelled() && (needs.host-truth-scope.result != 'success' || needs.host-truth-scope.outputs.relevant == 'true') }}
    runs-on: ubuntu-latest
    timeout-minutes: 45
    defaults:
      run:
        working-directory: bizapps-forms

    services:
      sqlserver:
        image: mcr.microsoft.com/mssql/server:2022-latest
        env:
          ACCEPT_EULA: 'Y'
          # Not a secret. This container exists for the length of one job, is reachable only from it,
          # and is thrown away with the runner. A repository secret here would buy nothing and would
          # make the workflow unrunnable from a fork or a fresh clone.
          MSSQL_SA_PASSWORD: 'HostTruth!2026#ci'
        ports:
          - 1433:1433
        options: >-
          --health-cmd "/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P 'HostTruth!2026#ci' -Q 'SELECT 1'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 30
          --health-start-period 30s

    steps:
      # A token for the two PRIVATE sibling repositories. GITHUB_TOKEN is scoped to this repository
      # only, so it cannot read them; the org App already used by publish.yml can. Least privilege,
      # named here rather than inherited: read, and only these two repositories.
      - name: Mint a token for the sibling repositories
        id: sibling-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ vars.APP_CLIENT_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          owner: MemberJunction
          repositories: bizapps-common,bizapps-tasks
          permission-contents: read

      # The three checkouts sit side by side, exactly as a developer's machine has them, so the
      # script's own ../bizapps-*/migrations defaults are what runs here too.
      - uses: actions/checkout@v4
        with:
          path: bizapps-forms

      - uses: actions/checkout@v4
        with:
          repository: MemberJunction/bizapps-common
          token: ${{ steps.sibling-token.outputs.token }}
          path: bizapps-common

      - uses: actions/checkout@v4
        with:
          repository: MemberJunction/bizapps-tasks
          token: ${{ steps.sibling-token.outputs.token }}
          path: bizapps-tasks

      # Must precede setup-node: `cache: 'pnpm'` needs pnpm already on PATH.
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'
          cache-dependency-path: 'bizapps-forms/pnpm-lock.yaml'

      - name: Check the convergence gate's own logic still fires
        run: npm run check:host-truth:test

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # The CLI reads its database settings through dotenv, so give it the file shape every local run
      # uses. The encryption key is generated per run: nothing in this job encrypts anything, and a
      # literal would be a credential in a public file for no reason.
      - name: Write the .env this run uses
        run: |
          {
            echo "DB_HOST='localhost'"
            echo "DB_PORT='1433'"
            echo "DB_DATABASE='MJ_HostTruth_Placeholder'"
            echo "DB_TRUST_SERVER_CERTIFICATE=1"
            echo "DB_USERNAME='sa'"
            echo "DB_PASSWORD='HostTruth!2026#ci'"
            echo "CODEGEN_DB_USERNAME='sa'"
            echo "CODEGEN_DB_PASSWORD='HostTruth!2026#ci'"
            echo "MJ_CORE_SCHEMA='__mj'"
            echo "OUTPUT_CODE='Forms'"
            echo "CONFIG_FILE='config.json'"
            echo "MJ_BASE_ENCRYPTION_KEY='$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")'"
          } > .env

      # Provisioning is the caller's job — the check itself holds no database connection and cannot
      # drop anything, which is what keeps it from ever being pointed at a real database by mistake.
      # Owned by [sa]: MJ's core baseline dies ~12 batches in otherwise, with an error that says
      # nothing about ownership.
      - name: Create the empty clean-room database
        run: |
          SQL_CONTAINER=$(docker ps --filter "ancestor=mcr.microsoft.com/mssql/server:2022-latest" --format '{{.ID}}' | head -n1)
          if [ -z "$SQL_CONTAINER" ]; then
            echo "::error::No SQL Server service container found; nothing to build the clean room in."
            exit 1
          fi
          docker exec "$SQL_CONTAINER" /opt/mssql-tools18/bin/sqlcmd \
            -S localhost -U sa -P 'HostTruth!2026#ci' -C -Q \
            "CREATE DATABASE [MJ_HostTruth_${{ github.run_id }}];
             ALTER AUTHORIZATION ON DATABASE::[MJ_HostTruth_${{ github.run_id }}] TO [sa];"

      - name: Build from only what we ship, and ask CodeGen whether it is complete
        run: |
          npm run check:host-truth -- \
            --database "MJ_HostTruth_${{ github.run_id }}" \
            --common-migrations ../bizapps-common/migrations \
            --tasks-migrations ../bizapps-tasks/migrations

      # The capture IS the finding: it is the SQL a host would need and will never run. Keep it when
      # the check goes red, so the fix can be written from the artefact rather than from a log.
      - name: Keep what CodeGen wanted to change
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: codegen-capture-${{ github.run_id }}
          path: bizapps-forms/migrations/codegen/
          if-no-files-found: ignore
```

- [ ] **Step 2: Wire the spec into `build.yml`**

The expensive job above is skipped on most pull requests, so the check's own logic would go untested
on exactly those. Add a step to `build.yml`'s `build-and-test` job, immediately after the
`lint:forms-application:test` step (around line 282), matching the surrounding style:

```yaml
      # The host-truth build itself is too expensive for a pull request and runs in its own workflow.
      # Its LOGIC is cheap, and a gate whose own test only runs when the gate runs is a gate nobody
      # is checking.
      - name: Host-truth convergence gate tests
        run: npm run check:host-truth:test
```

- [ ] **Step 3: Verify the workflow is syntactically valid and the path list is honest**

```bash
node -e "
  const fs = require('node:fs');
  const text = fs.readFileSync('.github/workflows/host-truth-gate.yml', 'utf8');
  for (const name of ['build-and-test','changes_and_migrations','codegen-append-gate','distribution-gate','generated-scope-gate','migration-order-gate','ui-token-gate']) {
    if (new RegExp('^  ' + name + ':', 'm').test(text)) throw new Error('job name collides with a required check: ' + name);
  }
  if (/^  scope:/m.test(text)) throw new Error('job name scope collides with build.yml');
  if (/^on:[\s\S]*?^\s{4}paths:/m.test(text)) throw new Error('path filter must not live in on:');
  console.log('workflow name checks passed');
"
npx --yes yaml-lint .github/workflows/host-truth-gate.yml 2>/dev/null \
  || node -e "require('node:fs').readFileSync('.github/workflows/host-truth-gate.yml','utf8'); console.log('read ok — GitHub will parse it on push')"
npm run lint:paths-touched:test
npm run check:host-truth:test
```

Expected: all pass. (`actionlint` is not installed here; the push in the finishing task is what
actually parses the YAML, and the workflow runs on this very pull request because it touches
`scripts/` and `.github/workflows/`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/host-truth-gate.yml .github/workflows/build.yml
git commit -m "$(cat <<'EOF'
ci: run the host-truth build nightly, on demand, and on the PRs that can break it

Not a required check: a SQL Server, two private sibling checkouts and ~15
minutes is the wrong shape for every pull request. Nightly is where it earns
its keep — a migration that merges without its CodeGen output goes invisible
to the diff-scoped gate the moment it lands, and the next nightly is the last
look before a release.

The path decision lives in a job-level `if:`, never `on: paths:`, for the
reason the repo keeps re-learning: a workflow skipped by `on: paths:` creates
no check run at all.

The gate's own spec runs in build-and-test too, because the expensive job is
skipped on most PRs and a gate whose test only runs when the gate runs is a
gate nobody is checking.

Refs #220

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Documentation and changeset

**Files:**
- Modify: `docs/database-operations.md` (§4 Clean-room build)
- Create: `.changeset/<two-words>-<word>.md`

- [ ] **Step 1: Point the clean-room section at the script**

In `docs/database-operations.md`, §4 currently ends with:

```
Read the resulting diff rather than reverting it — it is the repo telling you what your working
database had been hiding.

> A clean-room run currently stops at `V202608252340`. See issue #155.
```

Replace **both** of those (the stale #155 note included — that issue is closed and a clean-room run
completes today) with:

```markdown
Read the resulting capture rather than reverting it — it is the repo telling you what your working
database had been hiding.

### The same thing, as a check

`npm run check:host-truth` runs exactly the chain above and turns the last step into an assertion:
CodeGen must write **no capture file at all**. That is the only question that reads the same truth a
host does — every other gate here reads the repository — and it is the question nothing was asking
when #201 and #219 shipped.

```bash
# One empty database, owned by [sa]. The check never creates or drops one, so it can never be
# pointed at a real database by mistake; it refuses the database named in .env outright.
docker exec sql-mj-it /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASSWORD" -C -Q \
  "CREATE DATABASE [MJ_HostTruth]; ALTER AUTHORIZATION ON DATABASE::[MJ_HostTruth] TO [sa];"

npm run check:host-truth -- --database MJ_HostTruth \
  --common-migrations ../bizapps-common/migrations \
  --tasks-migrations ../bizapps-tasks/migrations
```

It takes ~6 minutes, exits 0 on `✅ Converged`, and on failure names every statement CodeGen wanted —
which is the SQL a host would need and will never run, because `mj app install` excludes
`__mj_BizAppsForms` from the host's CodeGen. `.github/workflows/host-truth-gate.yml` runs it nightly
and on pull requests that touch `migrations/`, `metadata/` or `mj.config.cjs`.
```

- [ ] **Step 2: Write the changeset**

`.changeset/` filenames are two random words plus one more; any unused name works. Create
`.changeset/host-truth-convergence.md`:

```markdown
---
'@mj-biz-apps/forms-entities': patch
---

Add a host-truth convergence check: build a database from only the migrations this repo ships, run
CodeGen against it, and fail if CodeGen wants to change anything. Every existing gate reads the
repository; this one reads the artefact, which is why #201 and #219 both reached every host. Runs
nightly and on pull requests that touch the migration inputs. Ships no migration and no metadata.
```

**Verify the package name and level first** — read an existing entry under `.changeset/` and copy its
front-matter shape exactly. `patch` is correct here per `.claude/rules/changesets.md`: this ships no
migration and no metadata.

- [ ] **Step 3: Verify the docs edit did not break anything and the changeset parses**

```bash
npm run lint:distribution        # shipped-SQL hazards; must stay green
ls .changeset/
git diff --stat
```

- [ ] **Step 4: Commit**

```bash
git add docs/database-operations.md .changeset/
git commit -m "$(cat <<'EOF'
docs(database-operations): the clean-room section names the check that runs it

It also drops the note saying a clean-room run stops at V202608252340. That
was true when #155 was open; a clean-room build of next completes today, and
a stale caveat in a runbook is worse than none.

Refs #220

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (already applied)

- **Spec coverage.** The issue asks for a host-truth check (Tasks 1–2), acknowledges the CI cost and
  suggests nightly or release-gate (Task 3 — nightly + dispatch + scoped PR, with the publish.yml
  promotion named as the documented follow-up), and warns it will be red until #201/#219 land (both
  landed; verified green, fact 2).
- **The issue's `mj migrate -t v6.1.0` etc. are written with a bare `mj`.** The plan does not copy
  that: bare `mj` is the stale homebrew 5.49.0 binary here.
- **The issue's "61 lines" is a filtered count**; the actual capture is 1017 lines. The plan uses the
  measured number.
