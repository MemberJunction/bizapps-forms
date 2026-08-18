# Running Forms locally

Forms is in a different position from its siblings: it **keeps an API harness** but has **no
Explorer**. Which one you need depends on what you are working on.

| Working on | Run |
|---|---|
| Respondent path, submit endpoint, actions, resolvers — anything server-side or smoke-tested | This repo's own API harness: `cd apps/MJAPI && node server.mjs` |
| The builder / admin UI in Explorer, or `forms-ng` components | **MJ's host**: `cd ~/Projects/MJ && pnpm start` (Explorer `:4201`, API `:4000`) |

`apps/MJAPI` is `mj-forms-api-harness` — API only, `private: true`, and a deliberate workspace member
so its `@memberjunction/*` deps dedupe against `packages/*` through one lockfile. See the comment in
`pnpm-workspace.yaml` for why that membership is load-bearing. It is **not** named `mj_api`, which is
what keeps it from colliding when this repo is linked into a cross-repo workspace.

⚠️ **`npm run start:api` and `npm run start:explorer` no longer exist**, and neither do `build:api` /
`build:explorer`. The repo is on pnpm and those scripts were not carried over. Ports `4121`/`4321`
describe the slot a *host* should use in the sibling convention; nothing here serves them.

## Running the builder UI in MJ's host

### 1. Link the repos into one pnpm workspace

`mj dev workspace` joins sibling checkouts under a common parent so an edit here is live in the
running host in about a second. The parent must not itself be a git repo.

```bash
cd ~/Projects   # a plain folder holding MJ/, bizapps-forms/, bizapps-common/, ...
node MJ/packages/MJCLI/bin/run.js dev workspace --force --clean-members \
  --exclude SaaS --exclude bizapps-tasks
```

**This step is not optional and symlinks are not a substitute.** Published
`@memberjunction/core@6.1.0-edge.2` and MJ's *source* `6.1.0-edge.2` are different code under the
same version string — the source has `BaseEntity.InitializeEmbeddedRecords`, the published copy does
not. Without one shared store, our generated entity subclasses extend a different `BaseEntity` than
MJAPI uses and the API dies during bootstrap with ~94 `newObject.InitializeEmbeddedRecords is not a
function` errors before it ever binds a port. This is the same class of problem as the duplicate
`RunViewByIDInput` failure that `pnpm-workspace.yaml` already warns about — one store, one copy.

Two settings the generator writes that need changing in the parent `.npmrc`:

| Setting | Why |
|---|---|
| `strict-peer-dependencies=false` | The generator writes `true`. Every member repo sets `false` on purpose (Angular 21 ships strict peer ranges a fresh resolve rejects), so the first parent install fails outright otherwise. |
| `public-hoist-pattern[]=@memberjunction/*`, `=@angular/*`, `=acorn` | MJExplorer bundles the linked client packages, and **Vite resolves the bare imports inside them from the vite-root (MJExplorer), not from the file being compiled.** `forms-ng` and `forms-actions` between them need `@memberjunction/actions-base`, `actions`, `ai`, `ai-prompts`, `aiengine`, `communication-engine`, `communication-types` and `core-entities-server` — none of which MJExplorer declares. Under a standalone MJ install this resolved by walk-up, because `MJ/node_modules` held every workspace package; the parent store does not, but the parent's own `node_modules` *is* on the walk-up path. |

Changing a hoist pattern needs `CI=true pnpm install` — pnpm wants a TTY to confirm the purge.

### 2. Register the app in the host

Linking makes our packages *resolve*; registration makes them *load*. They are independent, and
dev-mode registration is phase 2 of the linking spec — not built yet — so it is hand-written.

`mj app install` normally writes this block. Forms is unpublished, so add it to
**`MJ/mj.config.cjs`** (`packages/MJAPI/mj.config.cjs` is a one-line re-export of that file, so
there is only one to edit):

```js
dynamicPackages: {
  server: [
    { PackageName: "@mj-biz-apps/forms-server", StartupExport: "LoadBizAppsFormsServer", AppName: "mj-bizapps-forms" },
  ],
  client: [
    { PackageName: "@mj-biz-apps/forms-ng", AppName: "mj-bizapps-forms" },
  ],
},
```

⚠️ **`AppName` is required on every entry, client ones included.** The TS interface marks it
optional; the CLI's zod schema does not. Omit it and `getOptionalConfig()` fails `safeParse` and
returns `undefined`, silently discarding **the whole config**. The only symptom is
`[class-manifest] Open App client bootstrap: 0 client packages wired` scrolling past at startup.

Add the sibling apps too if their migrations ran on the same database — the database seeds nav items
naming a `DriverClass`, and a screen whose class is not registered renders
**"Dashboard class '<X>' is not registered"**, which reads like a broken app and is a missing
package. Caliber and ATS use `LoadBizAppsCaliberServer` / `LoadBizAppsCaliberClient` and
`LoadBizAppsATSServer` / `LoadBizAppsATSClient`.

MJExplorer's `prestart` runs `mj codegen manifest --open-app-client-bootstrap`, which rebuilds its
class-registration manifest from `dynamicPackages.client` on **every start** — so tree-shaking
cannot drop the classes and you never wire imports by hand.

`MJ/mj.config.cjs` is a tracked file, so this leaves MJ's working tree dirty. That is unavoidable
today; the spec's fix (registration via `.env.workspace` env vars) is phase 2. Just don't commit it.

### 3. Make the app packages resolvable from the host

The workspace links only what a package *declares*, and MJAPI/MJExplorer declare nothing about us —
so `@mj-biz-apps/forms-ng` is `UNRESOLVED` from the Explorer until you link it. Symlinks keep MJ's
tracked files clean (`workspace:*` dependencies would break MJ's standalone install later):

```bash
ln -s ../../../../../bizapps-forms/packages/Angular  ~/Projects/MJ/packages/MJExplorer/node_modules/@mj-biz-apps/forms-ng
ln -s ../../../../../bizapps-forms/packages/Entities ~/Projects/MJ/packages/MJExplorer/node_modules/@mj-biz-apps/forms-entities
ln -s ../../../../../bizapps-forms/packages/Server   ~/Projects/MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-server
ln -s ../../../../../bizapps-forms/packages/Entities ~/Projects/MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-entities
ln -s ../../../../../bizapps-forms/packages/Actions  ~/Projects/MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-actions
```

### 4. Point the host at your Forms database

`MJ/packages/MJAPI/.env` (gitignored) needs `DB_DATABASE` on the database your `__mj_BizAppsForms`
migrations ran against — along with `bizapps-common` and `bizapps-tasks`, which Forms hard-depends
on. MJAPI reads **its own** `.env`, not MJ's root one — a common hour-waster, and the same trap as
the `ln -sf ../../.env apps/MJAPI/.env` step in the Quick start.

## Daily loop

```bash
cd ~/Projects/MJ && pnpm start                                   # host up
cd ~/Projects && pnpm --filter @mj-biz-apps/forms-ng run build   # after editing Forms
```

Build from the **parent**, not from this repo. Consumers see the change immediately through the
workspace link — no repack, no restart.

## Recovery: "it worked yesterday and now the API won't boot"

The failure mode that will actually bite you. Symptom: a wall of

```
TypeError: newObject.InitializeEmbeddedRecords is not a function
Error: Entity MJ: <Something> could not be instantiated via MJGlobal Class Factory.
```

**on MJ's own core entities** (`MJ: Dashboards`, `MJ: Queries`, `MJ: Permission Domains` …), and the
API never binds a port. The Explorer builds fine and even reports its client packages wired, which
makes it look like a server bug. It is not.

**Cause: a member repo got its own standalone `node_modules`.** Anything that runs `pnpm install`
*inside* a member repo — an IDE, a stray terminal, a `pnpm install` in a git worktree under
`.claude/worktrees/` — recreates that repo's own store with the **published** `@memberjunction/*`
packages. That repo's entity subclasses then extend a different `BaseEntity` than MJAPI's, and
because a linked app's registrations land last they win in the ClassFactory. So one repo's stale
install breaks entities that have nothing to do with that repo.

Find it:

```bash
for r in MJ bizapps-ats bizapps-caliber bizapps-forms bizapps-common; do
  printf "%-16s " "$r"; [ -d ~/Projects/$r/node_modules/.pnpm ] && echo STANDALONE || echo clean
done
```

Any `STANDALONE` is the culprit — members are supposed to resolve through the parent store and have
no `.pnpm` of their own. Confirm with:

```bash
node -e "console.log(require.resolve('@memberjunction/core/package.json',{paths:['<repo>/packages/Entities']}))"
# healthy -> .../MJ/packages/MJCore/package.json
```

Fix — remove that repo's trees and reinstall from the parent:

```bash
cd ~/Projects/<offending-repo>
find . -name node_modules -type d -prune -not -path "*/node_modules/*" -not -path "./.claude/*" -exec rm -rf {} +
cd ~/Projects && CI=true pnpm install
```

⚠️ **Do not reach for the documented `dev workspace --force --clean-members` here.** `--force`
rewrites the generated parent files, which resets `.npmrc` to the generator's defaults and **silently
undoes the `strict-peer-dependencies` and `public-hoist-pattern` deviations above** — so you fix the
standalone install and immediately reintroduce two different failures. If you do run it, re-apply
those `.npmrc` lines and `CI=true pnpm install` again before starting the host.

`.claude/worktrees/*` are excluded from the `find` above on purpose: those are separate checkouts
with their own installs, they are not on the host's resolution path, and blowing them away just
costs whoever is working in them a reinstall.

## Verifying it worked

| Check | Healthy |
|---|---|
| `curl -o /dev/null -w '%{http_code}' localhost:4000/graphql` | `401` — auth required, the server is up |
| `curl -o /dev/null -w '%{http_code}' localhost:4201/` | `200` |
| API startup log | `Loaded Open App server package: @mj-biz-apps/forms-server (ran LoadBizAppsFormsServer)` |
| Explorer startup log | `Open App client bootstrap: N client packages wired` (N = your `client[]` length) |
| Either log | zero `InitializeEmbeddedRecords is not a function`, zero `Failed to resolve import` |

`Failed to resolve import` is raised at **page load**, not at build — a clean bundle build proves
nothing about it. When one appears, census every dep the linked packages declare that the Explorer
cannot resolve and widen the hoist pattern once, rather than adding them one error at a time.
