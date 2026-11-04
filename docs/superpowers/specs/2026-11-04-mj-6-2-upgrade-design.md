# MJ 6.2.0 upgrade, with the issues that waited for it

Date: 2026-11-04 · Branch: `feat/mj-6-2-upgrade` (from `origin/next` `2f94607`) · One PR into `next` (#352)

> **As built — read this first.** This design was written before the work. Where the shipped PR differs, the PR wins:
> - **Upgrade of a host that already runs Forms is verified, not "not tested".** It was rehearsed end to end and recorded in #353 (closed): a 6.1.6 host with Forms 0.15.0 was upgraded to MJ 6.2.0, then `mj app upgrade` took Forms to 0.15.1. Forms stayed `Active`, all 11 `dynamicPackages` entries stayed `Enabled: true`, and an anonymous submit succeeded. The bizapps-common migration clash seen during the work was fixed in Common 5.60.0.
> - **Commit split is five commits, not one bump plus behaviour.** The pin bump (`cc7dd1c`) also carries the compile fixes MJ 6.2 forced: `TotalRowCount` became optional, so `quota.ts` and `response-lookup.ts` now fail closed when it is missing or null, and `ScheduledJobExecutionContext` now requires `Provider`. These went into the bump commit because the bump does not build without them. A separate commit (`1ba1622`) fixes `check:host-truth`. MJ 6.2 CodeGen fails on an `includeSchemas` entry that matches no schema, so pass 1 now accepts exactly that failure (`settlingPassAccepts`).
> - **The hook (Goal 5)** reads `apps/MJAPI/mj.config.cjs` first, then `mj.config.cjs`. A missing or unloadable config makes it print the instruction with "could not check"; it is not treated as empty. Its payload type takes only `RepoRoot` and `Callbacks.OnWarn`.
> - **Worktree install:** see the corrected anti-goal below.

## Intent

MemberJunction released **6.2.0** (npm dist-tag `lts-6.2`, git tag `v6.2.0`). Forms moves to it in one
PR, and that PR also fixes the Forms issues that were parked "until MJ 6.2". Forms now needs 6.2:
the #349 fix depends on MJ#4990, which was fixed only in the 6.2 line. So the **minimum supported
host becomes 6.2**, and Forms stops claiming to support 6.1 hosts.

Success, in Soham's words: a host upgrades MJ to 6.2 and then installs bizapps-forms and the other
bizapps that are on 6.2.0, with no hand fixes.

## What 6.2.0 holds (verified against the tag, 2026-11-04)

| Area | 6.1.6 → 6.2.0 | Consequence |
|---|---|---|
| Core migrations | 75 new files. Frontier `V202610061630` → `V202611032346` | The upgrade is a database operation (`npx mj migrate -t v6.2.0`) |
| Angular | Unchanged: core `21.2.22`, cdk `21.2.14`, tooling `21.2.23` | No Angular rev. Do not touch `pnpm.overrides`/anchors |
| `ng-auth-services` | No new auth-provider peer. Adds peer `@angular/cdk ^21.2.14`, deps `realtime-runtime`, `theme-engine` | Low risk of the provider-peer build trap. Still diff it |
| Magic link | `MagicLinkService` now exported. `CreateInvite` still cannot set `IdentityMode`/`Kind`/`ResourceID`/`ResourceTypeID`, and requires `email` | #312 item 2 stays blocked (proof below) |
| Upstream fixes | MJ#4426/#4427/#4428 fix commits (MJ PRs #4516/#4518/#4521) and MJ#4990 fix (MJ PR #4311) are ancestors of `v6.2.0`. #4311 is first in `v6.2.0-edge.3` | #213 and #349 are unblocked |
| Changes near Forms' public path | routes under API root (`c159e2f8ee`), redeem via granted sproc (MJ#4762), widget guest session caps (MJ#4931), PascalCase renames behind `@deprecated` stubs (`80905a1231`) | Covered by the E2E checks below, already PASS in the rehearsal |

## Evidence already gathered (rehearsal, 2026-11-04)

Log and screenshots: `/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/36fd31a9-d8d4-4813-8971-c3c9d5ea2274/scratchpad/rehearsal-62/log.md`.
Databases kept: `MJ_R62_Fresh`, `MJ_R62_Upgrade`. Hosts kept: `~/Projects/mj62-rehearsal/`.

- **Fresh 6.2.0 host** (`mj install -t v6.2.0`, then `mj app install` of the **released** Forms 0.15.1):
  install green with 9 of 9 phases. common 5.59.0 → tasks 1.10.0 → forms 0.15.1 are all `Active`, and all
  dynamicPackages entries are enabled. MJAPI has no `not found in metadata`. Explorer builds and serves.
  An anonymous `/f/<slug>` submit stores a `Complete` FormResponse. **No MJ hand fixes were needed.**
- **6.1.6 host (no apps) → 6.2.0, then install Forms:** same result.
- **One hand step on both:** the host's `magicLink` config. Without it MJAPI logs
  `[Forms] Anonymous respondent path is NOT ready: core 'magicLink' is not enabled on this host…`
  and every link answers 409. `README.md:168-191` documents it, but `mj app install` does not do it.
- **Not tested:** upgrading a host that **already has Forms** from 6.1.6. The 6.1.6 CLI refuses the
  install (`Schema names starting with '__' are reserved for MJ internals`) unless
  `--dangerously-ignore-dbl-underscore-schema-rule` is passed. The agent's permission system denied
  that flag twice, even with Soham's approval. So `mj app upgrade`'s dynamicPackages behaviour (#215
  note) is unverified.
- **#312 item 2 proof:** `scratchpad/repro-312/` holds a `tsc` run against `@memberjunction/server@6.2.0`
  (TS2353 on `IdentityMode`/`Kind`/`ResourceID`/`ResourceTypeID`, TS2345 missing `email`) and a runtime
  call of the real `CreateInvite` that saves none of those fields. Upstream: MJ#5942 (open) and draft
  MJ#6295. The draft refuses an anonymous invite that carries an email, but Forms sets one as a
  delivery address (`MagicLinkInviteMinter.ts:470-473`).

## Goals

1. **Upgrade the host-tracking pins to 6.2.0.** Use `.claude/skills/mj-upgrade` Phase 1:
   `bump-pins.sh 6.2.0`, `pnpm install --lockfile-only`, `drop-stale-mj-lock.py` until the lockfile
   holds one MJ version, then `TURBO_FORCE` build, test and typecheck, and the lint gates.
2. **Raise the supported-host floor to 6.2 (decided by Soham).** The `@memberjunction/*` peers in all five
   `packages/*` move from `^6.1.0-edge.6` to **`^6.2.0-edge.8`**, and `mjVersionRange` becomes
   `>=6.2.0-edge.8 <7.0.0` through `scripts/sync-app-version.mjs`.
   *My call, and why `-edge.8` rather than `^6.2.0`:* `lint:mj-ranges` (required check) refuses an MJ
   peer that admits no prerelease of its own tuple, because a peer of `^6.2.0` makes every 6.2 edge host
   fail ERESOLVE while `mj app install` reports success (#211). `-edge.8` is the last edge before 6.2.0, and
   it contains the MJ#4990 fix (which first shipped in edge.3). Semver check:
   `^6.2.0-edge.8` admits 6.2.0-edge.8, 6.2.0, 6.2.x and 6.3.0 stable, and rejects 6.1.6 and 6.3.0-edge.N.
   `bump-pins.sh` moves peers only for a prerelease target, so either run it with `6.2.0-edge.8` for the
   peer group or extend it. Leave that choice to the builder, but `lint:mj-ranges` must pass on the result.
3. **#349:** replace the counter-example test with the fixed behaviour. With
   `relatedJoinField: 'RespondentPersonID'`, `StockGrids` is empty and the Forms panel wins. Add
   `relatedJoinField: 'RespondentPersonID'` to `PERSON_FORMS_REGISTRATION`
   (`packages/Angular/src/lib/form-panels/person-form-responses.model.ts`), and rewrite its header
   comment, which describes the 6.1 defect. Naming the join field stops the panel claiming any future
   second FK to Person. Safe only because of Goal 2.
4. **#215:** Goal 2 fixes the 6.2-edge case. Correct #215's record: its proposed option 1
   (`>=X <7.0.0`) does **not** admit later edge lines, because no plain semver range admits a future
   prerelease tuple (shown with the real `semver` on 2026-11-04). Extend `check-mj-version-ranges.mjs` only if
   the builder finds a real gap. Close #215 with that explanation and the rehearsal evidence. The
   untested `mj app upgrade` dynamicPackages note moves to a new issue, unless Soham runs the
   flagged test himself.
5. **Make the `magicLink` step hard to miss (Soham said yes).** *My call on the shape:* use the
   `hooks.postInstallModule` / `postUpgradeModule` that the 6.2 manifest schema supports
   (`manifest-schema.ts:179-195`; the engine imports the module from the app's installed packages and
   passes the live context). The hook **checks and prints** the exact config block when `magicLink`
   is off. It never edits host config. If the 6.2 engine cannot read host config from that context, fall
   back to a clear post-install message only. Verify on a rehearsal host (a disposable tag and
   Verdaccio, per the existing recipe), because `mj app install` installs only releases.
6. **Core migration of Soham's dev environment (Soham approved).** Back up `MJ_ATS_Dev`
   (`BACKUP … WITH COMPRESSION` + `RESTORE VERIFYONLY`). Record the frontier and the entity count. Move the
   MJ checkout from detached `v6.1.6` to `v6.2.0` (two untracked junk files in `packages/MJAPI` stay
   untouched). Run `pnpm install` at the **mj-dev root only**. Build MJ, run `npx mj migrate -t v6.2.0`, and verify
   the frontier is `202611032346` with zero `success = 0`. Then restart the host and grep for
   `not found in metadata`. Caliber and ATS share this host and still pin 6.1.6. Note any breakage in
   them, but do not fix it here.
7. **Clean-room CodeGen (`check:host-truth --core-tag v6.2.0`)** decides whether the upgrade owes a
   migration for our schema. Record "nothing" explicitly if it emits nothing.
8. **Docs that state the pin:** update `CLAUDE.md` (`lts-6.1` → `lts-6.2`, plus the Angular line note
   "6.2.0's Angular requirements are unchanged") and the `mj-upgrade` skill where it is version-specific.
9. **Changeset:** `patch`. `.claude/rules/changesets.md` is explicit: `minor` only when the PR adds or
   changes `migrations/**.sql` or `metadata/**`, "otherwise `patch`, whatever else the change does". It
   becomes `minor` only if Goal 7 makes the PR ship a migration. The changeset text must tell operators
   in plain words that the host must be on MJ 6.2 first.
10. **Issue hygiene (comments drafted for Soham's approval before posting):** #349 and #215 are
    closed by the PR. #213 is closed with the rehearsal evidence. #312 gets a comment with the proof
    and the MJ#5942/MJ#6295 links. MJ#6295 gets a comment about the anonymous-with-delivery-email case.

## Non-goals

- #312 items 1–3 (cross-instance limits, swapping in core `MagicLinkService`, component split).
- #308 (undefined `--mj-*` tokens). It is not 6.2-related: 6.2 still lacks those names, and every use has a fallback.
- #217 (stray schema-shell launcher app) and the other rehearsal side-findings (RCSI warning,
  `excludeSchemas` edit on a commented line, `mj bump -r` rewriting `node_modules`). These are MJ's
  or separate issues.
- Regenerating `generated/` TypeScript wholesale. Only do it if typecheck or `lint:codegen-compat` demands it.
- Renaming Forms call sites to MJ's new PascalCase names, unless the build fails. Deprecation warnings
  are fine for this PR.

## Anti-goals (failure even if CI is green)

- A green build that is a turbo cache replay (`Cached: 0 cached` must be shown).
- The dev DB on 6.2 code with an unmigrated core, or migrated without a verified backup.
- Any `pnpm install` inside the main `bizapps-forms` checkout. That unlinks MJ source and MJ's API stops booting. (A worktree under `.claude/worktrees/` is a standalone pnpm root with its own `node_modules`, so a frozen install there is safe and gives a CI-faithful build against the published packages. That is what this upgrade did.)
- CodeGen run against `MJ_ATS_Dev`.
- A peer range that `mj app install` accepts but npm rejects (the #211/#215 class).

## Verification (all required before the PR is called done)

- `TURBO_FORCE=true` build, test and typecheck are green. Every lint gate in the mj-upgrade skill passes. `lint:mj-ranges` passes.
- The lockfile has a single MJ version (`uniq -c` check), and no non-MJ package moved.
- Dev host: MJAPI boots clean on the migrated `MJ_ATS_Dev`. `pnpm run smoke:respondent <slug>` passes.
- Branch harness on :4131: publish → link → anonymous submit works.
- On the Person record in Explorer (needs Soham's login): exactly one Forms section and no duplicate stock grid (#349).
- Rehearsal host with the branch's disposable tag: `mj app install` → Active, and the magicLink hook message appears.

## Calls settled after the builder check

- **Sibling apps (Soham's decision):** ship now. common 5.59.0 and tasks 1.10.0 declare
  `@memberjunction/core ^6.1.6`. That range admits 6.2.0 stable (proven in the rehearsal) but not
  `6.2.0-edge.8`. Soham says common and tasks will upgrade soon. So this PR does not wait for them, and it does not raise
  `mj-app.json`'s `dependencies` floors on them. The PR body states the edge.8 gap plainly.

- **Hook behaviour (my call):** the hook prints only. It never prompts, never edits config, and never
  throws. A throw from `ExecuteHookModule` would fail the install phase. `AppHookPayload` gives
  `RepoRoot`, `Provider`, `ContextUser`, `Callbacks` and `Manifest`, but no host config. So the hook reads
  `magicLink` itself, from the host's `mj.config.cjs` under `RepoRoot`. If it cannot read the config, it
  prints the instruction anyway, and says that it could not check.
- **If the shared host breaks for Caliber/ATS after Goal 6 (my call):** do not remove their entries
  from Soham's host. Verify the #349 Person-record check on the rehearsal host
  (`~/Projects/mj62-rehearsal/hostA`, which already has common, tasks and forms on 6.2.0), using the
  branch's forms-ng build. Record the Caliber/ATS breakage for Soham.

## Left to the builder

The order of steps. How `bump-pins.sh` is driven for the two pin groups. The exact hook module location and
its tests. Whether `check-mj-version-ranges.mjs` needs a new rule. Commit split: the pin bump stays a standalone
`chore(deps): bump MJ to 6.2.0` commit, separate from the behaviour changes (repo rule). No commit
or push without Soham's explicit request.
