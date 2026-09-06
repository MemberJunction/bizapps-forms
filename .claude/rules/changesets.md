---
paths:
  - ".changeset/*.md"
---

# Changeset rules

## The bump level

**`patch` is the default. Use `minor` only when the change ships a migration or metadata.**

- Does the PR add or change anything under `migrations/**.sql` or `metadata/**`? → **`minor`**.
- Otherwise → **`patch`**. Whatever else the change does.

That is the whole rule. It is deliberately not semver-by-argument, and the tempting reasoning
below is the mistake this file exists to stop:

> *"`minor` rather than `patch`, because the package gains a public export / this is a documented
> behaviour change for an API client / the blast radius is every app on the host."*

Every one of those sentences has been written in this repo, and each one reads as careful
judgement. They are still wrong here, for a reason that is not about semver at all.

## Why the level is not a local decision

`.changeset/config.json` puts every package in one **fixed** group:

```json
"fixed": [["@mj-biz-apps/*"]]
```

A fixed group takes the **highest** bump present in the release and applies that one version to
all of its packages. So a single `minor` written anywhere, for any reason, moves
`forms-entities`, `forms-actions`, `forms-server` and `forms-ng` together — including the three
that the change never touched.

That is why an unjustified `minor` is not a small overstatement. It is a claim, made on behalf of
four packages, that hosts installing this app have something new to reckon with. When there is no
migration and no metadata, they do not: `mj app install` has nothing extra to apply, and the
version is telling them otherwise.

Checking the level of the OTHER changesets already on the branch is therefore part of writing
one. Downgrading yours while a sibling on the same PR stays `minor` changes no released number.

## What CI enforces, and what it does not

`.github/workflows/changes.yml` (job `changes_and_migrations`) is a **floor in one direction
only**. On a PR to `next`, if any `migrations/*.sql` changed, it requires a changeset to exist and
requires at least one to carry `minor` or `major`:

```
::error::Migrations require at least a 'minor' version bump in the changeset.
```

Nothing checks the other direction. A `minor` on a PR with no migration is green, ships, and
moves all four packages. CI will not catch it — which is precisely why the rule is written here.

Note also that the gate fires on **migrations only**. `metadata/` is in the rule above because
metadata is release work that reaches a host (see `CLAUDE.md` → Migrations), not because CI reads
it.

## Everything else about a changeset

- One changeset per coherent change; a PR may carry more than one.
- List **only the packages the change actually touches**. The fixed group handles the rest; naming
  extra packages does not make the release more accurate, it just obscures what moved.
- The body is release-notes prose. Say what changed and what a reader has to do about it, not how
  it was implemented.
- Name a visible behaviour change explicitly — a respondent-facing or API-facing difference
  belongs in the body in plain words. That is what the body is for, and it is the reason a
  behaviour change does **not** need to buy itself a `minor`.
