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

## So: editing anything here is only half the change

```
edit metadata/  →  regenerate the seed migration  →  npm run seed:manifest  →  commit both
```

The recipe for the middle step is in [`../migrations/README.md`](../migrations/README.md). It is
**not** a plain re-push — the push must run against a database whose Forms metadata is empty (or it
logs `spUpdate*` calls that cannot replay on a fresh install), and its output needs two schema
substitutions before it can ship.

`npm run lint:distribution` fails the build when these files and
`migrations/metadata-seed.manifest.json` disagree. It compares content, ignoring the `sync` block a
push writes back, so the push that regenerates a seed cannot trip its own gate.

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
