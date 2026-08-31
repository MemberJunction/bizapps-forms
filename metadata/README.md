# `metadata/` — the source of truth, and NOT the delivery mechanism

These files are what `mj sync push` reads. They are **not** what a host installs.

`mj-app.json` names this directory, which reads like it ships. It does not. MJ's manifest schema
says so in as many words:

> Dev-time-only pointer to the directory whose metadata is the source of truth for the app's seed
> migrations. **The install engine NEVER reads this at install** — seeding happens exclusively
> through the app's Skyway `migrations/`.

MJ Forms believed otherwise for nine months. Every `mj sync push` wrote to one developer's database
and left no artifact, so a clean `mj app install` produced a Forms deployment with no
`Form Respondent` role, no `CanCreate` grant on the response entities, no styles, categories,
application, nav, dashboards or AI authoring — the anonymous submit path, the product, could not
run. Every step reported success.

## So: editing anything here is only half the change — and the other half happens at the release

```
your PR:        edit metadata/ (declarative JSON only)  →  commit  →  review
the release:    mj sync push against a clean DB  →  ONE consolidated Metadata_Sync  →  ship
```

**Do not hand-author a `*__Metadata_Sync.sql` in a feature PR.** This follows MJ
(`MJ/metadata/CLAUDE.md` §1b and §10): PRs contribute the JSON — fields, `@lookup` / `@file` /
`@parent` references, and a `primaryKey` UUID from `uuidgen`, with **no hand-written `sync` block**
(the release push writes that back). The `sync` blocks already in 17 of the 19 record files here are
exactly that write-back — a `lastModified` and a `checksum` from an earlier push. Leave them alone;
the rule is "do not author one", not "strip the ones that are there". The build engineer takes everything merged on `next` and generates one
consolidated seed for the release. Per-PR sync migrations duplicate that step, produce a pile of
small files instead of one per build, and drift from what the real push emits.

The release recipe is in [`../migrations/README.md`](../migrations/README.md). It is **not** a plain
re-push — the push must run against a database built from the shipped chain (or it logs `spUpdate*`
calls that cannot replay on a fresh install), and its output needs documented schema substitutions
before it can ship.

`npm run check:release-seed` is what tells you whether that has happened: it lists every
`primaryKey` declared here that appears in no shipped migration, which is exactly the set the next
release seed owes. It runs at the release (`publish.yml`), not on your PR — a PR cannot answer a
question about a seed that is generated after it merges. Run it any time; it needs no database.

> **What used to be here, so nobody rebuilds it.** A `metadata-seed.manifest.json` of content hashes
> once gated every PR, on the theory that a manifest key proves the seed ships that record. It does
> not: regenerate the manifest without regenerating the seed and the gate goes green while the
> record reaches no host. That is #105, and the manifest, its writer and the check went with it.

## What lives here

Ordered by `directoryOrder` in `.mj-sync.json`, which matters: a record cannot be created before
whatever it looks up. `users` and `user-roles` come last because the grant looks up both sides.

| Directory | Ships? | Note |
|---|---|---|
| `roles`, `entity-permissions` | yes | `Form Respondent` (the anonymous submit boundary) and `Forms Automation Runner` |
| `actions`, `action-categories` | yes | the 4 on-submit hooks + 2 authoring actions |
| `ai-prompts`, `templates`, `ai-prompt-categories` | yes | AI authoring and response analysis |
| `form-styles`, `form-categories` | yes | the only two that live in `__mj_BizAppsForms`, not `__mj` |
| `applications`, `application-roles`, `dashboards`, `user-views` | yes | the Explorer surface |
| `users`, `user-roles` | yes | the automation service principal **and** its role grant — see [`users/README.md`](users/README.md); the two are useless apart |

Grants on **binding target entities** deliberately do not ship. That set is the ceiling on what a
form author can reach through an entity binding, and it stays each deployment's decision.

`sql_logging/` is gitignored generator output, not source.
