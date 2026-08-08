---
name: mj-upgrade
description: Dry-run then (on approval) apply a MemberJunction version upgrade in bizapps-forms. Bumps every @memberjunction/* pin (apps exact, packages caret peerDeps) + mj-app.json range on a throwaway branch from next, installs/builds/tests, reports a GO/NO-GO summary, and STOPS for the user's decision before applying. Never runs the destructive core DB migration unprompted — it hands over a verified runbook for it (version-tagged migrate, watermark repair, post-migration checks). Use when upgrading MJ — "/mj-upgrade 5.51.0", "rev the MJ pin", "try the new MJ version".
disable-model-invocation: true
allowed-tools: Bash, Read, Edit
---

Upgrade MemberJunction in this repo. Three phases: a safe **dry run**, a hard approval gate, then — only if the user says yes — **apply** and the **core DB migration** (Phase 3, the step that actually breaks upgrades). Target version = `$ARGUMENTS` (if empty, ask the user which version).

Ported from `bizapps-caliber` on 2026-07-30 and corrected against this repo. Two differences that matter: this repo has a **fifth package** (`packages/CoreEntitiesServer`, which holds the magic-link entity subclass) that Caliber's file list omits, and its own schema/container/ports.

Pinning model (verified against this tree, do not violate): `apps/*` use **exact** `X.Y.Z` in `dependencies`; `packages/*` declare MJ only as **caret** `^X.Y.Z` `peerDependencies` and carry no MJ `dependencies` at all; root `@memberjunction/cli` exact; `mj-app.json` `mjVersionRange` = `>=X.Y.Z <(major+1).0.0`. The bundled `scripts/bump-pins.sh` enforces all of this — always use it, never hand-edit pins.

Keep install/build/test output in background log files under the scratchpad and grep them — never stream full logs into context.

## Phase 1 — Dry run (safe; no approval needed to run it)

1. **Preflight.** Confirm the target is published: `npm view @memberjunction/core@<version> version` — abort if it 404s. Require no uncommitted **tracked** changes (`git status --porcelain -uno` empty; untracked files are fine). `git fetch origin next`.
2. **Branch** from clean next: `git checkout --no-track -b mj-upgrade/<version> origin/next`. `--no-track` because this is a throwaway dry-run branch; the repo's same-named-remote rule is about real feature branches.
3. **Bump pins:** `bash .claude/skills/mj-upgrade/scripts/bump-pins.sh <version>` — it prints a verification summary and exits non-zero on stragglers. Expect **70 pins across 8 files** at time of writing.
4. **Install:** `npm install` (to a log file). Check the exit code and grep for ERESOLVE / peer conflicts.
5. **Build:** `TURBO_FORCE=true npm run build` (to a log file). `TURBO_FORCE` is **required**. A plain build turbo-cache-hits and replays stale logs, silently skipping the recompile against the new MJ — a type-level break then passes unnoticed and you report a green build that proved nothing. (This happened on the 5.50.0 upgrade: 6 of 7 tasks were cache hits.)
6. **Test:** `npm test` (to a log file). All suites must pass — currently **434 across 6 workspaces**, including `apps/MJAPI`'s 2, which per-package loops miss.
7. **Summarize to the user:** version resolved, install, build, tests, and a clear **GO / NO-GO**. A NO-GO caused by an upstream MJ bug is worth an issue in `MemberJunction/MJ`.

**Known upstream trap.** MJ's `@memberjunction/ng-auth-services` declares every auth provider as a **required** peer with an empty `peerDependenciesMeta`, so a new provider added upstream breaks the Angular build until you install it — even though you use none of them. 5.50.0 added `@workos-inc/authkit-js` this way. Symptom: `Could not resolve "@workos-inc/..."` in `mj_explorer:build`. Fix: add it to `apps/MJExplorer`, matching how this repo already carries Okta and Amplify unused.

## Phase 2 — GATE, then apply

8. **STOP. Wait for the user's decision.** Do nothing else until they answer.
9. **If NO:** offer teardown — `git checkout next` → `npm install` → delete the branch.
10. **If YES:** keep the branch and pin changes. Update the MJ-pin note in `CLAUDE.md` (what changed, when, and *why* — the previous pin was wrong precisely because its stated reason went unchallenged). Then hand the user **Phase 3**; those steps are manual and destructive, so run one only when they say go. Commit only if the user explicitly asks (repo rule: no commits without explicit approval); when they do, keep it a standalone `chore(deps): bump MJ to <version>`.

## Phase 3 — Core `__mj` migration (critical gate — verify, never assume)

**Why this step, and not the pins, is what wrecks an upgrade.** A partially-migrated core schema still installs, builds, tests and starts clean. The damage surfaces hours later and nowhere near its cause: `AIEngine.Config()` hits a core entity the metadata does not have, throws `Error: Entity <name> not found in metadata`, and aborts loading its **entire** agent/metadata set — so an unrelated feature fails with a missing-agent error. The upgrade is done when steps 11–15 are *verified*, not when `migrate` exits 0.

11. **Snapshot the database.** Local dev is a docker SQL Server (`forms-sql`, port 1456, database `MJ_Forms_Dev`) — `docker commit forms-sql forms-sql-snapshot:pre-<version>` before anything below.

12. **Check the watermark *before* migrating.** The CLI fetches only migrations strictly newer than the highest successful version in `__mj.flyway_schema_history`, so one row with a too-high version permanently hides every migration below it, silently.
    ```sql
    -- Frontier: is the top row the last migration of the band you are actually on?
    SELECT TOP 15 installed_rank, version, script, installed_on
      FROM __mj.flyway_schema_history
     WHERE version IS NOT NULL AND success = 1
     ORDER BY version DESC;
    ```
    **Poisoned** = the top row's release band jumps ahead of the rows under it, or `installed_on` is out of line with `installed_rank`. Repair before migrating.

    > Caliber's version also greps for rows whose `script` does not start with `migrations/`, calling them app-schema cruft. **That heuristic does not hold here.** Core migrations run from an MJ checkout are recorded with a `v5/` prefix, and this repo's 19 legitimate core rows all look like `v5/V…__v5.50.x__….sql`. Judge by the *band and ordering*, not the path prefix. Check for genuine leakage with the table query in step 15 instead.

    Write down two numbers now — step 15 compares against them: the frontier (`MAX(version)`) and `SELECT COUNT(*) FROM __mj.Entity`.

13. **Repair the watermark (bookkeeping only).** `DELETE` just the offending tracking rows so the frontier falls back to the last clean core version; the migrations they represent are then re-applied in order by step 14. Preview inside a transaction. Never touch the `SCHEMA` marker row (`script = '[__mj]'`, `version IS NULL`).

14. **Migrate core, version-tagged:**
    ```bash
    npx mj migrate -t v<version>       # e.g. npx mj migrate -t v5.50.0
    ```
    The `-t` tag makes the CLI clone MJ's `migrations/` at that release tag and apply them to `__mj`. Neither alternative works:
    - **`npm run mj:migrate` is not a substitute** — it is hardcoded to `--schema __mj_BizAppsForms --dir ./migrations`, i.e. *this app's* migrations. It never touches `__mj`.
    - **Bare `npx mj migrate` is actively harmful** — with no tag it runs the local `./migrations` against the default schema `__mj`, which is how an app's own tables end up inside the core schema.

    **Read the first line of the output before anything else.** A real core run opens with `Detected installed migration version: <N> — fetching only migrations newer than it.` `<N>` must equal the frontier from step 12 (higher ⇒ poisoned history, kill the run), and the line must be **present at all** — bare `migrate` prints no watermark line, so no line ⇒ you are not migrating core.

15. **Verify — all four checks, before moving on.**
    - **The `N applied` count proves nothing.** `R__RefreshMetadata.sql` is repeatable and re-runs every time, so an already-current run and a fully-skipped run both report `1 applied` and exit 0. Judge by the **frontier moving** (or by it already being at the target band).
    - Frontier advanced//is at the target band, and the entity count did not shrink:
      ```sql
      SELECT MAX(version) FROM __mj.flyway_schema_history WHERE version IS NOT NULL AND success = 1;
      SELECT COUNT(*) FROM __mj.Entity;
      SELECT COUNT(*) FROM __mj.flyway_schema_history WHERE success = 0;   -- must be 0
      ```
    - An entity from a band you crossed exists — e.g. `MJ: Scoped Prompt Configs` (5.46 band).
    - No app tables leaked into core. Beware false positives: `__mj.Task` is a **legitimate MJ core entity** (`MJ: Tasks`), not leakage from bizapps-tasks. Confirm by checking registration, not the name:
      ```sql
      SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
       WHERE s.name = '__mj' AND t.name IN ('Form','FormVersion','FormResponse','FormDistribution')
      ```

16a. **Decide what the upgrade obliges you to SHIP, not just to apply locally.** Two artifacts leave the dev database only if something writes them into `migrations/`, and an upgrade can create work in both:
    - **Metadata.** If `mj sync push` (step 16) creates or updates *any* record, that result exists only in your dev DB until it becomes a `V…__Metadata_Sync.sql` migration. Regenerate per `migrations/README.md` and run `npm run seed:manifest`. `npm run lint:distribution` fails if you skip it.
    - **Generated schema SQL.** Diff `packages/CodeGenLib` between the old and new MJ tags (`git diff v<old> v<new> -- packages/CodeGenLib` in an MJ checkout). If any **SQL** template moved, the regenerated objects for `__mj_BizAppsForms` must ship as a migration; a local `mj codegen` run updates only your database. For 5.50.0 → 5.51.0 the delta was `GenerateClassRegistrationsManifest.ts` and its test — TypeScript only — so no migration was owed, and none was written. Record which way it came out; "I checked and it was nothing" is a different note from silence.
    - MJ's own core metadata needs nothing from you: it ships as a core migration (`MJ/migrations/v5/V…__v<ver>__Metadata_Sync.sql`) applied by the version-tagged `npx mj migrate -t` in step 14.

16. **Then the app schema, codegen, and runtime.** `npm run mj:migrate` → `npx mj sync push --dir metadata` → `npm run mj:codegen` → restart MJAPI and **grep its startup log for `not found in metadata`** (must be clean; MJAPI starts fine either way, which is why this is grepped rather than eyeballed). Finish with `TURBO_FORCE=true npm run build`, `npm test`, `npm run lint:generated`, and `npm run smoke:respondent <slug>` — the smoke test is the only one of these that exercises the public path a respondent actually uses.
