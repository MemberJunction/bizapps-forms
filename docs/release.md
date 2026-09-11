# Cutting a release

Two pull requests. Nothing is pushed directly to `main` or `next` at any point — required status
checks make such a push impossible, not merely discouraged (see [Why none of this is
automated](#why-none-of-this-is-automated)).

## 1. The release PR

```bash
git fetch origin
git switch -c release/vX.Y.Z origin/next
pnpm run version              # changeset version + scripts/sync-app-version.mjs
pnpm install --lockfile-only  # the bumped internal pins; linkWorkspacePackages resolves them locally
git add -A
git commit -m "Release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "Release vX.Y.Z"
```

`pnpm run version` consumes `.changeset/*.md`, bumps every `@mj-biz-apps/*` package (they are one
`fixed` group, so they all move together), rewrites the CHANGELOGs, and syncs `mj-app.json`'s
`version` and `mjVersionRange`. Read the diff before pushing: the version it chose is the version
that will be published, and no gate downstream can second-guess it.

This is the `next` → `main` promotion PR the branching model already describes — it just carries the
bump as well. All seven required checks run on it, because it is an ordinary human-authored pull
request.

Merge it with a **merge commit**.

## 2. Publishing happens by itself

The merge pushes to `main`, which triggers `publish.yml`. It builds, runs the release-readiness
checks, publishes to npm, and pushes the tag `vX.Y.Z`. It writes nothing else to the repository.

Every gate sits before `Publish to npm`, so a failure costs a re-run and nothing has been published.
Two of them are worth knowing by name:

- **`What is there to release?`** asks two questions separately — is any package missing this version
  from npm, and is the `vX.Y.Z` tag absent — and each gates its own step. So **re-running the
  workflow after a partial failure finishes the job** rather than reporting a green no-op: if some
  packages published and others did not, the re-run publishes the rest; if everything published and
  only the tag failed, the re-run tags. It does nothing, and says so, only when the version is fully
  published *and* tagged. A separate step before it fails if any `.changeset/*.md` is still present,
  because that means step 1 never ran and publishing would republish the current version.
- **`Enforce schema-change version policy`** fails if `migrations/` changed since the last `v*` tag
  but the version only moved by a patch. Fix it by redoing step 1 with a `minor` changeset.

## 3. The sync PR

```bash
git fetch origin
git switch -c chore/sync-main-into-next-vX.Y.Z origin/main
git push -u origin chore/sync-main-into-next-vX.Y.Z
gh pr create --base next --title "chore: sync main into next after vX.Y.Z"
```

This is not bookkeeping. The release PR left a merge commit on `main` that `next` does not contain,
and `protect-main` sets `strict: true` — "branch must be up to date with base" — so until this
merges, the *following* release PR cannot merge either.

## Why none of this is automated

Required status checks are evaluated against the check runs present **on the SHA being introduced**.
A direct push introduces a SHA the remote has never seen, so no check run can exist for it yet and
the push is rejected permanently with `GH013`. It is not a race a retry wins: there is no ordering in
which a brand-new commit can already carry its own passing checks.

Routing those pushes through pull requests opened by the workflow does not help either. GitHub
deliberately does not start workflow runs from events authored with `GITHUB_TOKEN`, so none of the
seven required contexts would ever report on such a PR and it could never merge. Making that work
needs a PAT or GitHub App token in secrets — which needs repo or org admin, the same permission the
other remedy (adding GitHub Actions as a bypass actor on both rulesets) needs, and which was refused
at repository level with `422 — Actor GitHub Actions integration must be part of the ruleset source
or owner organization`.

So the release is human-driven by construction rather than by preference.
`scripts/check-release-pushes.mjs` runs inside `build-and-test` and fails any workflow or script that
reintroduces a push to `main` or `next`; tag pushes stay allowed, because both rulesets are
`target: branch` and never see `refs/tags/*`. Full investigation: **#177**.
