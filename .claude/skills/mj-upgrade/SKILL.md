---
name: mj-upgrade
description: Dry-run then (on approval) apply a MemberJunction version upgrade in bizapps-forms. Bumps every @memberjunction/* pin (apps exact, packages caret peerDeps) + mj-app.json range on a throwaway branch from next, regenerates the lockfile, installs/builds/tests, reports a GO/NO-GO summary, and STOPS for the user's decision before applying. The core DB migration in Phase 3 is MANDATORY, not optional — an upgrade that skips it is not an upgrade, it is a pin bump that leaves the database behind. It still runs only on the user's go-ahead, because it is destructive. Use when upgrading MJ — "/mj-upgrade 5.51.0", "rev the MJ pin", "try the new MJ version".
disable-model-invocation: true
allowed-tools: Bash, Read, Edit
---

Upgrade MemberJunction in this repo. Three phases: a safe **dry run**, a hard approval gate, then — only if the user says yes — **apply** and the **core DB migration** (Phase 3, the step that actually breaks upgrades). Target version = `$ARGUMENTS` (if empty, ask the user which version).

Ported from `bizapps-caliber` on 2026-07-30 and corrected against this repo. Two differences that matter: this repo has a **fifth package** (`packages/CoreEntitiesServer`, which holds the magic-link entity subclass) that Caliber's file list omits, and its own schema/container/ports.

Pinning model (verified against this tree, do not violate): `apps/*` use **exact** `X.Y.Z` in `dependencies`; `packages/*` declare MJ only as **caret** `^X.Y.Z` `peerDependencies` and carry no MJ `dependencies` at all; root `@memberjunction/cli` exact; `mj-app.json` `mjVersionRange` = `>=X.Y.Z <(major+1).0.0`. The bundled `scripts/bump-pins.sh` enforces all of this — always use it, never hand-edit pins. Angular is pinned separately from MJ: `@angular/*` peers in `packages/*` stay caret at the platform pin (`^21.2.22` since the 6.1.0 upgrade) with exact anchors in consuming packages' `devDependencies`. **Three version lines, not one** — `@angular/cdk` is `21.2.14`, the build tooling (`@angular/cli`, `@angular/build`, `@angular-devkit/build-angular`) is `21.2.23`, everything else `21.2.22`; collapsing them into one number is what #211 was. **And the pin that actually binds is `pnpm.overrides` in the root `package.json`, not the anchor** — an override outranks every manifest, so on the 6.1.0 upgrade bumping only the anchor left the regenerated lockfile still on `@angular/core@21.1.3` while `@angular/cdk` moved, purely because CDK is the one package the override list omits. Bump overrides and anchors together and confirm with `grep -c '21\.1\.3' pnpm-lock.yaml` returning 0. An MJ pin bump does not *automatically* touch Angular — but check MJ's own platform version every time, because 6.1.0 moved it and left this repo's peers unsatisfiable.

**This repo is pnpm, not npm** (`packageManager: pnpm@10.33.0`); the npm spellings below were left over from before the migration and were wrong in a way that mattered — see step 4.

Keep install/build/test output in background log files under the scratchpad and grep them — never stream full logs into context.

## Phase 1 — Dry run (safe; no approval needed to run it)

1. **Preflight.** Confirm the target is published: `npm view @memberjunction/core@<version> version` — abort if it 404s. Require no uncommitted **tracked** changes (`git status --porcelain -uno` empty; untracked files are fine). `git fetch origin next`.
2. **Branch** from clean next: `git checkout --no-track -b mj-upgrade/<version> origin/next`. `--no-track` because this is a throwaway dry-run branch; the repo's same-named-remote rule is about real feature branches.
3. **Bump pins:** `bash .claude/skills/mj-upgrade/scripts/bump-pins.sh <version>` — it prints a verification summary and exits non-zero on stragglers. Expect **55 pins across 7 files** (2026-09-14; it was 70/8 before `apps/MJExplorer` was reduced to stale build leftovers with no `package.json` — the script prints `skip (missing)` for it, which is correct, not a warning).
4. **Regenerate the lockfile — `pnpm install --lockfile-only`.** This step did not exist in the runbook and is a hard CI blocker: CI runs `pnpm install --frozen-lockfile`, so a bumped manifest against a stale `pnpm-lock.yaml` fails the build before it compiles a line. On the 6.1.0 upgrade the lockfile still held 3,159 `edge.5` references.

    **Never plain `pnpm install` here.** In the shared `mj-dev` dev workspace this repo's `node_modules` are symlinks into the MJ *source* checkout, and `bizapps-forms` has its own `pnpm-workspace.yaml`, so pnpm treats it as a standalone root and a plain install re-resolves every `@memberjunction/*` to a registry tarball — which splits the type-graphql registry and stops MJ's API booting. `--lockfile-only` writes the lockfile and never touches `node_modules`, so every symlink survives. Verify both afterwards: `pnpm install --frozen-lockfile --lockfile-only` must exit 0, and `readlink packages/Server/node_modules/@memberjunction/core` must still point into `../../../../../MJ/packages/MJCore`.
5. **Build:** `TURBO_FORCE=true pnpm run build` (to a log file). `TURBO_FORCE` is **required**. A plain build turbo-cache-hits and replays stale logs, silently skipping the recompile against the new MJ — a type-level break then passes unnoticed and you report a green build that proved nothing. (This happened on the 5.50.0 upgrade: 6 of 7 tasks were cache hits.) Confirm `Cached: 0 cached` in the summary rather than trusting the exit code.
6. **Test and typecheck:** `TURBO_FORCE=true pnpm test` and `TURBO_FORCE=true pnpm run typecheck` (to log files). Force both — an unforced `pnpm test` on the 6.1.0 upgrade replayed 5 of 10 task logs from the *pre-bump* state. Typecheck is a separate CI step and the only gate that compiles the builder component, so a green `pnpm test` alone proves nothing about it. Then the no-install lint gates: `lint:peer-ranges`, `lint:migrations`, `lint:ui`, `lint:generated`, `lint:release-pushes`, `lint:codegen-append`.
7. **Summarize to the user:** version resolved, install, build, tests, and a clear **GO / NO-GO**. A NO-GO caused by an upstream MJ bug is worth an issue in `MemberJunction/MJ`.

**Known upstream trap.** MJ's `@memberjunction/ng-auth-services` declares every auth provider as a **required** peer with an empty `peerDependenciesMeta`, so a new provider added upstream breaks the Angular build until you install it — even though you use none of them. 5.50.0 added `@workos-inc/authkit-js` this way. Symptom: `Could not resolve "@workos-inc/..."` in `mj_explorer:build`. **The stated fix no longer applies here** — `apps/MJExplorer` has no `package.json` any more (only stale `dist`/`.angular` leftovers), so there is nowhere in this repo to add the provider; the trap would now land on `packages/Angular` instead. Diff the peer set anyway on every upgrade — it is a two-command check and the failure it prevents names neither auth nor peers. For 6.1.0-edge.5 → 6.1.0 the provider peers were unchanged, so it did not fire:

    ```bash
    cd ../MJ && P=packages/Angular/Explorer/auth-services/package.json
    git show v<old>:$P | python3 -c "import json,sys;print(json.load(sys.stdin).get('peerDependencies'))"
    git show v<new>:$P | python3 -c "import json,sys;print(json.load(sys.stdin).get('peerDependencies'))"
    ```

## Phase 2 — GATE, then apply

8. **STOP. Wait for the user's decision.** Do nothing else until they answer.
9. **If NO:** offer teardown — switch back to `next`, restore `pnpm-lock.yaml` to its committed state, delete the branch. No install is needed: `--lockfile-only` never touched `node_modules`, so there is nothing to undo there.
10. **If YES:** keep the branch and pin changes. Update the MJ-pin note in `CLAUDE.md` (what changed, when, and *why* — the previous pin was wrong precisely because its stated reason went unchallenged). Then do **Phase 3 — it is part of this upgrade, not a follow-up.** The steps are destructive, so run them only when the user says go; but do not let the branch be described as upgraded, merged, or done until Phase 3 is verified. A pin bump without it leaves the database on the old core schema. Commit only if the user explicitly asks (repo rule: no commits without explicit approval); when they do, keep it a standalone `chore(deps): bump MJ to <version>`.

## Phase 3 — Core `__mj` migration (critical gate — verify, never assume)

**Why this step, and not the pins, is what wrecks an upgrade.** A partially-migrated core schema still installs, builds, tests and starts clean. The damage surfaces hours later and nowhere near its cause: `AIEngine.Config()` hits a core entity the metadata does not have, throws `Error: Entity <name> not found in metadata`, and aborts loading its **entire** agent/metadata set — so an unrelated feature fails with a missing-agent error. The upgrade is done when steps 11–15 are *verified*, not when `migrate` exits 0.

11. **Snapshot the database.** Local dev is a docker SQL Server — since the per-app databases were retired (see `WORKSPACE.md`, 2026-08-21) that is the shared `sql-mj-it` on port 1455, database `MJ_ATS_Dev`, NOT the old `forms-sql`/`MJ_Forms_Dev` on 1456. **Prefer a SQL backup to the `docker commit` this step used to prescribe.** `docker commit` of a *running* SQL Server captures files mid-write — crash-consistent at best, and on a 13.5 GB container it is slow and huge. A `BACKUP DATABASE` is transactionally consistent, restorable, and took 2.4s / 513 MB compressed on the 6.1.0 upgrade (the data is far smaller than the allocated file size):

    ```sql
    BACKUP DATABASE [MJ_ATS_Dev] TO DISK = '/var/opt/mssql/data/MJ_ATS_Dev_pre_<version>.bak'
      WITH INIT, COMPRESSION, NAME = 'Pre MJ <version> core migration';
    RESTORE VERIFYONLY FROM DISK = '/var/opt/mssql/data/MJ_ATS_Dev_pre_<version>.bak';
    ```

    Check the file exists with `docker exec sql-mj-it ls -lh <path>` and that VERIFYONLY raises no error — this is the rollback point, and a step that silently no-ops (the old `docker commit` against a stale container name failed with `No such container` while the upgrade proceeded anyway) is worse than no step at all.

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
    - **`pnpm run mj:migrate` is not a substitute** — it is hardcoded to `--schema __mj_BizAppsForms --dir ./migrations`, i.e. *this app's* migrations. It never touches `__mj`.
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
    - **Metadata.** If `mj sync push` (step 16) creates or updates *any* record, that result exists only in your dev DB until a `V…__Metadata_Sync.sql` migration carries it. **Do not hand-author one in the upgrade PR** — the seed is generated once per release by the build engineer (`migrations/README.md`, and MJ/metadata/CLAUDE.md §1b). What the upgrade owes is the JSON under `metadata/`, committed with no `sync` block. Nothing on the PR fails for this, by design, and there is no pending list to write down — `pnpm run check:release-seed` derives it from the repo whenever anyone asks, which is the whole reason a hand-maintained one was retired.
    - **Generated schema SQL.** Diff `packages/CodeGenLib` between the old and new MJ tags (`git diff v<old> v<new> -- packages/CodeGenLib` in an MJ checkout). If any **SQL** template moved, the regenerated objects for `__mj_BizAppsForms` must ship as a migration; a local `mj codegen` run updates only your database. For 5.50.0 → 5.51.0 the delta was `GenerateClassRegistrationsManifest.ts` and its test — TypeScript only — so no migration was owed, and none was written. Record which way it came out; "I checked and it was nothing" is a different note from silence.
    - MJ's own core metadata needs nothing from you: it ships as a core migration (`MJ/migrations/v5/V…__v<ver>__Metadata_Sync.sql`) applied by the version-tagged `npx mj migrate -t` in step 14.

16. **Then the app schema, codegen, and runtime.** `pnpm run mj:migrate` → `npx mj sync push --dir metadata` → `pnpm run mj:codegen` → restart MJAPI and **grep its startup log for `not found in metadata`** (must be clean; MJAPI starts fine either way, which is why this is grepped rather than eyeballed). Boot the harness on its own port so it cannot collide with a host the user is running — `cd apps/MJAPI && GRAPHQL_PORT=4131 MJAPI_PUBLIC_URL=http://localhost:4131 node server.mjs` — and stop it by **PID**, never by process name. Ignore `ClassFactory: no registration found for base class 'BaseAction'` warnings naming ATS/Caliber actions: those are sibling apps' rows in the shared database whose code this harness does not load.

    **Do not run `mj:codegen` against the shared `MJ_ATS_Dev`.** It regenerates from whatever metadata that database happens to hold — other branches' records included — and can revert already-merged fixes with nothing in the repo to detect it. Use a clean-room database (`docs/database-operations.md`).

    Finish with `TURBO_FORCE=true pnpm run build`, `TURBO_FORCE=true pnpm test`, `pnpm run lint:generated`, and `pnpm run smoke:respondent <slug>` — the smoke test is the only one of these that exercises the public path a respondent actually uses.
