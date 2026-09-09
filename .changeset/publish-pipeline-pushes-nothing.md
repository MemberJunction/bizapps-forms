---
"@mj-biz-apps/forms-entities": patch
---

The publish pipeline no longer pushes to `main` or `next`.

Required status checks are evaluated against the check runs present on the SHA being *introduced*. A
direct push introduces a SHA the remote has never seen, so no check run can exist for it and the push
is rejected permanently with `GH013` — which is where every release would have stopped since CI became
blocking. `[skip ci]` made the rejection permanent but was never the deciding fact: `changes.yml`
carries only a `pull_request` trigger, so `changes_and_migrations` could not report on a pushed commit
in any case.

The version bump now rides the `next` → `main` release pull request, where all seven checks run
normally, and `publish.yml` is reduced to build, validate, publish, and push a tag — tags being
outside both rulesets, which are `target: branch`. `mj-app.json`'s derived fields move into
`scripts/sync-app-version.mjs`, which `pnpm run version` writes and the workflow verifies with
`--check`, and the schema-change version policy now reads the shipped artifacts (did `migrations/`
move since the last tag, and did the version move by more than a patch?) rather than changeset files
that are gone by the time a release runs.

`scripts/check-release-pushes.mjs` fails any workflow or script that reintroduces a protected-branch
push — a defect that is otherwise invisible until the next release.

Fixes #177.
