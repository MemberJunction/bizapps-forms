# Releasing v0.11.0 — design

**Date:** 2026-09-15
**Status:** approved (both decisions chosen by Soham on 2026-09-15)
**Plan:** [`../plans/2026-09-15-release-v0-11-0.md`](../plans/2026-09-15-release-v0-11-0.md)

## What this is

`main` is at `v0.10.0`, cut 2026-08-14. `next` is **690 commits and 75 changesets** ahead of it.
This design covers bringing `main` up to `next` and publishing the result to npm — step 0 through
step 4 of [`docs/release.md`](../../release.md) — and the one defect that stops it.

The version is **not a choice**. Changesets computes `v0.11.0` (strongest pending bump: `minor`)
and `release-prep.mjs` asserts the result matches its own prediction. If the version is wrong the
fix is a changeset, not an edit.

## What is already true

Verified against the live repository and registry on 2026-09-15, not recalled:

| Question | Answer | How it was checked |
|---|---|---|
| Is a release due? | Yes — `v0.11.0`, 75 changesets | `npm run release:plan` |
| Is the metadata seed owed? | No — one unreleased consolidated seed, `V202609112116__v0.12.x__Metadata_Sync.sql` | `check:release-seed` (88 UUIDs / 20 files), `check:seed-cadence` |
| Did metadata move after the seed? | Yes, `metadata/applications/.applications.json` on 2026-09-13 — and `V202609131200__v0.12.x__Forms_Application_Launcher_Visibility.sql` carries it | `git log` per file vs. the migration list |
| Is `main` an ancestor of `next`? | Yes | `git merge-base --is-ancestor origin/main origin/next` |
| Do all five packages exist on npm? | Yes, all at `0.10.0` | `npm view @mj-biz-apps/<pkg> version` |
| Is `v0.11.0` already published or tagged? | No | same, plus `git tag` |
| Is `#211` (the `@angular/cdk` exact peer that left installs `Disabled`) fixed? | Yes — all `@angular/*` peers are carets, three version lines respected, `grep -c '21\.1\.3' pnpm-lock.yaml` returns 0 | `packages/Angular/package.json`, root `pnpm.overrides` |
| Are the sibling ranges satisfiable? | Yes — `bizapps-common` `v5.42.0` ∈ `>=5.31.0 <6.0.0`, `bizapps-tasks` `v1.4.3` ∈ `>=1.1.0 <2.0.0` | sibling tags vs. `mj-app.json` |
| Is `next` green? | `Build and Test` and four gates green at `0e31667`; `Distribution Gate` was still running | `gh run list --branch next` |

Two facts about the pipeline itself matter more than any of the above:

- **`Prepare a release` has never been run. `Verify the release App token` has never been run.**
  Both landed with `#218` on 2026-09-14 and have zero runs.
- **`publish.yml` last ran on 2026-08-14 for `v0.10.0`, before the `#218` rewrite.** Nothing in
  today's publish path — the `release-plan.mjs` gate, the two release-readiness seed checks, the
  App-token back-merge pull request — has ever executed.

This release is therefore the first exercise of the whole mechanism. Every step below assumes it
will surface something, and is ordered so that it surfaces before anything reaches npm.

## The blocker

`codegen-append-gate` is one of the seven required checks on `main`. It fires on every pull request
into `main`, with no path filter, and runs:

```yaml
run: node scripts/check-codegen-append.mjs "${{ github.event.pull_request.base.sha }}" "${{ github.sha }}"
```

For the release pull request that base is **`main`** — 690 commits back. CHECK 2's banner rule
applies only to files the diff *adds* (`--diff-filter=A`), so against a base that old, four
already-merged migrations read as newly added:

```
$ node scripts/check-codegen-append.mjs origin/main origin/next    # exit 1
  V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql     ships CodeGen output, no banner
  V202608191400__v0.11.x__Form_Screen_Social_Links_Metadata.sql    ships CodeGen output, no banner
  V202608301200__v0.12.x__Rename_Signature_Question_To_Doodle.sql  ships CodeGen output, no banner
  V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql            ALTER TABLE, ships no output

$ node scripts/check-codegen-append.mjs origin/next origin/next    # exit 0
```

All four predate the gate, which landed 2026-09-09. The script names three of them in its own
source and states the invariant it depends on (`scripts/check-codegen-append.mjs:616-625`):

> `isNew` is what keeps this rule from re-flagging them. That only holds while the caller's BASE
> sits at or after those commits: true for a PR's merge-base and for a push range … but NOT true
> for an arbitrary wide range … which would relight all of them as if newly added.

Nobody changed the invocation. The release pull request simply *has* a base that violates the
invariant, and no pull request into `main` has been opened since the gate existed. Because
`bypass_actors: []` on both rulesets and `current_user_can_bypass: never`, a red required check
cannot be waved through by anyone, including repo admins: the release pull request would open and
stall permanently.

The same wide range reaches the **push** trigger when the release merges — `github.event.before` is
the old tip of `main` — so a fix that only addresses the pull-request half leaves `main` red on
release day.

## Decision 1 — the effective base is `next` for anything aimed at `main`

A change into `main` is a release or a back-merge. **By construction it introduces no migration
that `next` does not already carry**, so `main` is the wrong commit to ask "what does this
introduce?" from. The base that keeps `isNew` meaning *introduced by this change* is the tip of
`next`.

The decision lives in `scripts/check-codegen-append.mjs`, not in YAML, for the reason
`release-prep.yml`'s own header gives about release-only logic: a decision that runs only during a
release cannot be proven by running a release. A new pure export, `resolveCheckBase(baseSha,
targetBranch, cwd)`, is identity for anything aimed at `next` and answers with `next`'s tip for
anything aimed at `main`. The workflow passes the target branch as a third argument —
`github.base_ref` on a pull request, `github.ref_name` on a push.

**This does not blind the gate on `main`.** A hotfix committed straight onto `main` carries a
migration `next` does not have, so it still reads as added and still fires. That direction is
pinned by its own test rather than argued.

Rejected, and why:

- **Name the four files as pre-gate history.** Range-independent, but it costs an exception list
  that must be pruned forever, and it would break the spec's existing end-to-end test, which
  asserts the CLI *fires* on `V202609011500`'s own add-commit. Listing a special case is worse
  than removing it.
- **Edit the four migrations in place.** They are all unreleased, so no host has applied them — but
  it contradicts `migrations/README.md` ("Add a NEW seed migration; never edit an existing one"),
  contradicts the script's own comment, and changes the Flyway checksum on every development
  database that has already run them.

## Decision 2 — verification depth

Everything below runs **before** `Prepare a release` is dispatched:

1. Every one of the seven required checks, reproduced locally at the release-pull-request range
   (`origin/main`..`origin/next`) rather than at `next`'s own range. This is the class of failure
   the blocker belongs to, and only this range can find another one.
2. `npm run check:host-truth` against a fresh `sa`-owned clean-room database built from only what
   the three repositories ship. It is the one check that reads the artefact a host receives rather
   than the repository, and its verdict is a file, not an exit code.
3. The respondent smoke suite against the branch's own MJAPI harness on `:4131`.

A full Verdaccio host-install rehearsal is **out of scope**. It is the only thing that exercises
`mj app install` itself, and it found `#211` and `#212` — but both are fixed and verified above,
it costs most of a day, and a leftover `vX.Y.Z-rc.N` tag silently re-bases `check:seed-cadence`
into a passing no-op. If the clean-room run comes back red, that judgement is revisited.

## Non-goals

- Choosing or overriding the version. `v0.11.0` is computed.
- Regenerating the metadata seed. One consolidated seed is already in place and both gates pass.
- Any MJ version change. The `6.1.1` pin merged in `#221` and ships as-is.
- Landing the three unrelated open pull requests (`#112`, `#55`, `#46`) or the stale `#22` into
  `main`.

## Risks

| Risk | Covered by |
|---|---|
| Another gate behaves differently at the `main`..`next` range | Task 2 runs all seven at that range |
| The App credential is dead — invisible until a release is half-done | Task 6 dispatches the read-only verifier first |
| `Prepare a release` computes something unexpected | Task 7 runs it with `dry_run: true` |
| `changeset publish` partially publishes | Documented: re-run the workflow; `release-plan.mjs` asks *publish* and *tag* separately so a retry finishes the job |
| The back-merge pull request cannot be opened | The publish run goes red for exactly this and nothing else; Task 10 |
| The release ships a migration the host cannot use | Task 3's clean-room host-truth run |
| The widget bundle is absent from the tarball (four releases shipped this way) | `validate-widget-bundle.sh`, in both `build-and-test` and `publish.yml` |

## Success criteria

- `codegen-append-gate` is green on a pull request into `main` and on the push to `main`, and a
  hotfix that genuinely owes CodeGen output still fails it.
- All seven required checks are green on the release pull request.
- `@mj-biz-apps/{forms-entities,forms-actions,forms-server,forms-ng,forms-core-entities-server}`
  are all at `0.11.0` on npm, and `forms-ng`'s tarball contains the widget bundle.
- Tag `v0.11.0` exists on `origin`.
- `chore/backmerge-v0.11.0` is merged and `origin/main` is an ancestor of `origin/next` again.
- `npm run release:plan` reports `0` pending changesets and no blockers.
