# Cutting a release

Two pull requests, and both are opened for you. Nothing is ever pushed to `main` or `next` — not by
you, not by a workflow. That constraint is not a limitation being worked around; it is the shape of
the design (see [Why it looks like this](#why-it-looks-like-this)).

| Step | Who | What |
|---|---|---|
| 0. Prep the seed | you, once per release | the consolidated `Metadata_Sync` — needs a database, so no workflow can do it |
| 1. Dispatch **Prepare a release** | you, one click | cuts `release/vX.Y.Z`, bumps, opens the PR into `main` |
| 2. Review and merge that PR | you | the only place the seed and the version get human eyes |
| 3. Publish | `publish.yml` | builds, publishes to npm, tags, opens the back-merge PR |
| 4. Merge the back-merge PR | you | carries `main` back into `next` |

---

## Is a release even due?

```bash
npm run release:plan
```

Read-only, runs on any checkout, always exits 0. It reports the current version, how many changesets
are pending and what version they compute to, whether `main` has reached `next`, and whether all four
release gates pass — then lists every blocker standing between you and a release.

It is the same code the workflow runs, so it cannot drift from what actually happens. Run it whenever
you want to know where things stand; it writes nothing.

## 0. Prep — the metadata seed

**The one part of a release no workflow will ever do for you.** Generating the consolidated
`Metadata_Sync` needs a database with MJ and both sibling apps installed, which no CI runner has.
The recipe is [`migrations/README.md`](../migrations/README.md) — read it there, it is not duplicated
here.

`npm run release:plan` tells you whether one is owed: `check:release-seed` and `check:seed-cadence`
both appear in its gate line, and a red one is a blocker that stops step 1 before anything is
written.

If it has been a while since the last release, also dispatch **Verify the release App token** once
(Actions → *Verify the release App token*). It is read-only, takes under a minute, and confirms the
credential steps 1 and 3 depend on is still live. A revoked App is otherwise invisible until a
release is half-done — which is exactly how MJ's `v6.1.0-edge.6` went.

## 1. Dispatch "Prepare a release"

Actions → **Prepare a release** → *Run workflow*. Set `dry_run: true` first if you want to see the
plan without anything being written.

It refuses, before writing anything, if: the tree it checked out is not clean, there are no
changesets, any of the four gates is red, the computed version is already tagged or already on npm,
or `main` has not reached `next` from the previous release. Each refusal names what to do about it.

Otherwise it cuts `release/vX.Y.Z` from the tip of `next`, runs `pnpm run version` (changesets +
`sync-app-version.mjs`), updates the lockfile, verifies that what came out matches what it predicted,
commits, pushes the branch, and opens the pull request into `main` with a body listing the changesets
being consumed.

**The version is not yours to choose.** Changesets computes it from the pending changesets and the
workflow asserts the result matches its own prediction. Nothing downstream second-guesses it, so if
the version is wrong the fix is a changeset, not an edit.

> A migration filename's `__v<ver>__` segment is **not** a claim about which release ships it. Flyway
> orders on the `V<timestamp>` prefix and nothing reads the label. Do not infer a version from one —
> see [`migrations/README.md`](../migrations/README.md).

## 2. Review and merge the release PR

All seven required checks run on it, because the App-authored push started them. This is the step
that matters: it is the only point where a human looks at the consolidated seed, the computed
version, and the CHANGELOGs before any of it is permanent.

**Give it ten minutes, and do not read the wait as a hang.** This pull request is slower than any
feature PR, for a reason: several gates filter their expensive work on what the diff touches, and a
diff against `main` spans everything since the last release. On `v0.11.0` `distribution-gate` took
9m41s against 20s on a feature PR (its mutant suite actually ran), and `host-truth` 8m9s.
`build-and-test` is unaffected at ~3m.

The diff is also too large for `gh pr diff` (over 300 files). Review the bump instead, which is the
part a human can actually judge — `git diff --name-only origin/next origin/release/vX.Y.Z` should be
the consumed changesets, five `package.json`, five `CHANGELOG.md`, the lockfile and `mj-app.json`,
and **nothing** under `migrations/`, `metadata/` or any `src/`.

Merge it with a **merge commit**.

## 3. Publishing happens by itself

The merge pushes to `main`, which triggers `publish.yml`. It builds, runs the release-readiness
checks, publishes to npm, pushes the `vX.Y.Z` tag, and opens the back-merge pull request.

Every gate sits before `Publish to npm`, so a failure costs a re-run and nothing has been published.
Three are worth knowing by name:

- **`What is there to release?`** asks two questions separately — is any package missing this version
  from npm, and is the `vX.Y.Z` tag absent — and each gates its own step. So **re-running the workflow
  after a partial failure finishes the job** rather than reporting a green no-op. It does nothing, and
  says so, only when the version is fully published *and* tagged. A separate step before it fails if
  any `.changeset/*.md` is still present, because that means step 1 never ran.
- **`Enforce schema-change version policy`** fails if `migrations/` changed since the last `v*` tag
  but the version only moved by a patch. Fix it by redoing step 1 with a `minor` changeset.
- **Release readiness** — the two seed checks, run here and nowhere else, because no feature PR can
  answer a question about a seed generated after it merges.

**A green run means the automation did its job.** It is red only when the back-merge pull request
could not be opened — which means no one is tracking the outstanding merge, and a human is needed.

## 4. Merge the back-merge PR

`chore/backmerge-vX.Y.Z → next`, opened for you in step 3. It carries the release merge commit and
the version bump back to `next`.

This is not bookkeeping, and the cost of skipping it lands somewhere surprising: `protect-main` sets
`strict: true` — "branch must be up to date with base" — so leaving it costs **this** release nothing
and silently blocks the **next** one. That is enforced rather than trusted: step 1 refuses to cut a
release while `main` is not an ancestor of `next`, and names this pull request when it does.

---

## Why it looks like this

**Why an App token.** GitHub deliberately does not start workflow runs from `GITHUB_TOKEN`-authored
events. A branch or pull request created by the default token would therefore never have any of the
seven required checks report on it, and could never merge — so the automation needs an identity that
is not `GITHUB_TOKEN`. This repo has no PAT; it has `vars.APP_CLIENT_ID` + `secrets.APP_PRIVATE_KEY`,
an App already installed org-wide and used by MJ core for the same reason.

**The App is never a bypass.** It writes only to `release/*` and `chore/backmerge-*`, which are
covered by no ruleset — verified, not assumed:

```bash
gh api repos/MemberJunction/bizapps-forms/rules/branches/main          # → deletion, non_fast_forward, required_status_checks
gh api repos/MemberJunction/bizapps-forms/rules/branches/release%2Fv0  # → []
```

Both rulesets keep `bypass_actors: []`, and `npm run lint:release-pushes` (inside `build-and-test`)
still fails any workflow or script that pushes to `main` or `next`. Nothing here asks for an
exception to anything.

**Why there is still a human merge, twice.** MJ built a one-click release button, never dispatched
it, and deleted it — because every release carries prep that must be *reviewed*, and a metadata-sync
migration is permanent, append-only history. That argument holds here verbatim. What is automated is
the mechanical part: computing the version, writing the commit, opening the pull requests. What stays
human is the judgement.

**What changed from `#177`, and what did not.** `#177` correctly identified that a direct push can
never satisfy a required status check: checks are evaluated against the check runs present on the SHA
being *introduced*, and a push introduces a SHA the remote has never seen. That finding still stands
and this design never pushes to a protected branch. What `#177` also concluded — that routing the
work through workflow-opened pull requests needed a credential this repo does not have — was true when
written and is not true now: the App credential is visible to this repository today.

**First executed on 2026-09-15, for `v0.11.0`.** Between `#177` and `#218` the release was a hand-run
runbook that was never once carried out, so `v0.10.0` (2026-08-14) stood as the last release for a
month. Everything above has now run end to end. Two defects surfaced on that first run, both in the
release machinery rather than in the product, and both invisible to the seven required checks because
neither fires on a pull request into `next`:

- **`#225`** — `codegen-append-gate` is required on `main` and diffs from the pull request's base.
  For a release that base is `main`, hundreds of commits back, and its banner rule applies only to
  files the diff *adds* — so every migration merged since the last release read as newly added and
  the four predating the gate failed a check nobody can bypass. The base is now resolved from the
  branch the ref is aimed at.
- **`#226`** — `actions/checkout` defaults to `persist-credentials: true`, which writes an
  `extraheader` carrying `GITHUB_TOKEN` into the local git config. It outranks credentials embedded
  in a remote's URL, so the release branch was pushed as `github-actions[bot]` rather than as the App
  and refused with a 403. `release-prep.yml` no longer persists a credential; `publish.yml` still
  must, because it pushes the tag through `origin` (`#229`).

Expect the first run after a long gap to find something similar. Nothing in either failure reached
npm: both stopped before `Publish to npm`, which is what every gate sitting ahead of it is for.

## When something goes wrong

| Symptom | What it means |
|---|---|
| A step fails to mint the App token | Dispatch **Verify the release App token** — read-only, and it names which half is broken. |
| Publish run is red with an open `chore/backmerge-v*` PR | Should not happen — red means the PR could **not** be opened. Read the failed step. |
| Some packages appear published and others do not, right after a green run | **Wait three minutes and look again before doing anything.** npm's packument is eventually consistent: after `v0.11.0` the registry served `0.11.0` for one package and `0.10.0` for four, and converged over ~3 minutes. Read the `Publish to npm` step's own output — `changeset publish` names every package it published — and trust that over the registry. |
| Some packages genuinely did not publish (the step's output says so, or they are still absent well after the run) | `changeset publish` works concurrently and expects a retry. Re-run the workflow; `release-plan.mjs` asks *publish* and *tag* separately, so it finishes the job rather than reporting a green no-op. |
| A push in the release path is refused with a 403 naming `github-actions[bot]` | The push used the ambient token, not the App, whatever its remote URL says — `actions/checkout`'s persisted `extraheader` outranks URL credentials. See `#226` and `#229`. |
| The back-merge branch exists at an unexpected SHA | The workflow refuses to force-push over it, because someone may have resolved conflicts there. Delete the branch or open the PR by hand. |
| `release:plan` says the seed is owed | Step 0. `migrations/README.md`. |
