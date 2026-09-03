# Installing MJ Forms — the parts that bite

The [README quick start](../README.md#-quick-start) is the happy path. This file holds the
things that are easy to get wrong, and the history that explains why each rule exists.

---

## 1. Metadata ships through migrations, and nowhere else

**There is no separate metadata step.** Roles, entity permissions, actions, AI prompts,
styles, categories, the application and its dashboards all ship inside
`migrations/V…__Metadata_Sync.sql`.

`mj-app.json` names a `metadata/` directory, but MJ's manifest schema is explicit that
`metadata.directory` is a **dev-time pointer the install engine never reads** — it says so in
`manifest-schema.ts`. Migrations are the only channel to a database that is not yours.

Earlier versions of the install guide told you to run `mj sync push` here. That was the whole
bug. It meant every install but the author's produced a Forms deployment with no
`Form Respondent` role, no `CanCreate` grant on the response entities, no styles, categories,
application, nav, dashboards or AI authoring — so the anonymous submit path could not run,
while every step reported success.

**`mj sync push` is an authoring tool, not an install step, and a host never runs it.** It is
how a *contributor* who edited `metadata/` pushes that change into a dev database, and how the
build engineer generates a release's seed migration.

> **The rule this leaves behind: a `mj sync push` whose result exists only in your dev DB is
> an unshipped change.**

A feature PR contributes only the declarative JSON under `metadata/` — fields, `@lookup` /
`@file` / `@parent` references, a `primaryKey` UUID from `uuidgen`, **no `sync` block and no
`*__Metadata_Sync.sql`**. One consolidated seed migration is generated per release. The recipe,
and the two CI gates that check it (`npm run check:release-seed`, `npm run check:seed-cadence`),
are in [`migrations/README.md`](../migrations/README.md).

---

## 2. Read the MJ version, never recall it

The supported range and the exact pin live in the files an upgrade actually edits. Restating
either in prose is how the README came to claim a pin two majors behind what the repo was
building against.

```bash
node -p "require('./mj-app.json').mjVersionRange"                                   # supported range
node -p "require('./apps/MJAPI/package.json').dependencies['@memberjunction/core']" # the exact pin
```

**Pinning model:** `apps/*` use exact `X.Y.Z` in `dependencies`; `packages/*` declare MJ only
as caret `^X.Y.Z` `peerDependencies` and carry no MJ `dependencies` at all.

**Upgrading MJ is a database operation, not just a pin bump.** Bumping npm versions leaves the
`__mj` core schema behind, and a partially-migrated core still installs, builds, tests and
boots cleanly — the damage surfaces later and nowhere near its cause. The core migration is run
version-tagged:

```bash
npx mj migrate -t v<version>      # NOT `npm run mj:migrate`, which only targets __mj_BizAppsForms
```

Judge success by the **frontier advancing**, never by the `N applied` count —
`R__RefreshMetadata.sql` is repeatable, so an already-current run and a fully-skipped run both
report `1 applied` and exit 0. Finish by restarting MJAPI and grepping its startup log for
`not found in metadata`; it must be clean, because MJAPI starts fine either way.

---

## 3. Running it locally

Two different answers depending on what you are working on:

| Working on | Run |
|---|---|
| Submit endpoint, actions, resolvers, smoke tests | This repo's API harness: `cd apps/MJAPI && node server.mjs` |
| Builder / admin UI, or `forms-ng` components | **MJ's host** — there is no Explorer in this repo |

`start:api`, `start:explorer`, `build:api` and `build:explorer` **do not exist** — they did not
survive the pnpm migration. `4121` / `4321` describe a host convention, not something this repo
serves. Full procedure: [`local-host.md`](local-host.md).

The `<mj-form>` bundle is emitted by `pnpm run build` as part of `forms-ng`'s build, not as a
separate step. `npm run build:widget` rebuilds just that bundle during widget work.

---

## 4. Smoke-test environment knobs

The defaults stopped being right when the dev environment changed.

| Variable | Default | When to set it |
|---|---|---|
| `FORMS_SMOKE_URL` | `http://localhost:4121` | The API actually serving Forms. In the shared dev workspace that is **`http://localhost:4000`** — `4121` is this repo's own harness, which the workspace no longer runs. |
| `FORMS_SQL_CONTAINER` | `sql-mj-it` | The docker SQL Server the state-seeding scripts shell into (`automation-semantics`, `upload-provenance`, `resume-arc`, `binding`). Was `forms-sql` until the per-app databases were retired. |

```bash
FORMS_SMOKE_URL=http://localhost:4000 npm run smoke:respondent -- <distribution-slug>
```

**A green `npm test` is necessary and not sufficient for anything touching the public path.**
The full unit suite was green the entire time the product could not accept a single response —
two independent defects, either alone fatal. `npm run smoke:respondent` drives the real public
surface and is the only check that would have caught either.

---

## 5. Host-side wiring

Beyond the `magicLink` block in the [README](../README.md#-install-into-a-host-app):

- The host should add Forms to its own CodeGen `excludeSchemas` (or use an `includeSchemas`
  allow-list), so *its* CodeGen never generates `__mj_BizAppsForms` artifacts into *its*
  packages — the mirror image of what this repo does.
- `mj app remove` retires the rows Forms wrote into the shared `__mj` schema, via
  `migrations-teardown/`.

---

## 6. Only two placeholders may appear in shipped SQL

`${flyway:defaultSchema}` and `${mjSchema}` (teardown scripts: `${mjSchema}` only).

`mj migrate` builds its placeholder map from *this* repo's `mj.config.cjs`, but `mj app install`
builds it from the *host's* — and Skyway leaves an unknown `${…}` untouched instead of failing.
So a third placeholder ships as a literal string and fails silently on someone else's database.
`npm run lint:distribution` enforces this.
