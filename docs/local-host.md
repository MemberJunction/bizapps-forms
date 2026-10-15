# Running Forms locally

Forms is in a different position from its siblings: it **keeps an API harness** but has **no
Explorer**. Which one you need depends on what you are working on.

| Working on | Run |
|---|---|
| Respondent path, submit endpoint, actions, resolvers — anything server-side or smoke-tested | This repo's own API harness: `cd apps/MJAPI && node server.mjs` |
| The builder / admin UI in Explorer, or `forms-ng` components | **MJ's host**: `cd ../MJ && pnpm start` (Explorer `:4201`, API `:4000`) |

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

**Every path below is relative to this repo**, so `..` is that parent and `../MJ` is the MJ
checkout. Where it lives on your disk is yours to choose; only the shape matters:

```
<workspace parent>/          # a plain folder, NOT a git repo
  MJ/
  bizapps-forms/             # you are here
  bizapps-common/
  ...
```

```bash
cd ..
node MJ/packages/MJCLI/bin/run.js dev workspace --force --clean-members \
  --exclude SaaS --exclude bizapps-tasks
```

**This step is not optional and symlinks are not a substitute.** Published
`@memberjunction/core@6.1.0-edge.5` and MJ's *source* `6.1.0-edge.5` are different code under the
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
ln -s ../../../../../bizapps-forms/packages/Angular  ../MJ/packages/MJExplorer/node_modules/@mj-biz-apps/forms-ng
ln -s ../../../../../bizapps-forms/packages/Entities ../MJ/packages/MJExplorer/node_modules/@mj-biz-apps/forms-entities
ln -s ../../../../../bizapps-forms/packages/Server   ../MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-server
ln -s ../../../../../bizapps-forms/packages/Entities ../MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-entities
ln -s ../../../../../bizapps-forms/packages/Actions  ../MJ/packages/MJAPI/node_modules/@mj-biz-apps/forms-actions
```

### 4. Point the host at your Forms database

`MJ/packages/MJAPI/.env` (gitignored) needs `DB_DATABASE` on the database your `__mj_BizAppsForms`
migrations ran against — along with `bizapps-common` and `bizapps-tasks`, which Forms hard-depends
on. MJAPI reads **its own** `.env`, not MJ's root one — a common hour-waster, and the same trap as
the `ln -sf ../../.env apps/MJAPI/.env` step in the Quick start.

### 5. Host requirements since #303: the Work Queue and READ_COMMITTED_SNAPSHOT

Since #303 a submitted response's on-submit automations do not run inside the submit. The submit
publishes one `forms.response-submitted` message in the same transaction as the response (both commit
or neither does), and the `forms.run-automations` subscription runs them, at least once, on a host
that enables MJ's Work Queue. **A host without this config accepts responses normally and runs no
automations** — the messages wait in the queue until some host subscribes. The API logs which case
it is at startup (see *Verifying it worked*).

Every host that should run automations needs, in its `mj.config.cjs` (`MJ/mj.config.cjs` for MJ's
host; `apps/MJAPI/mj.config.cjs` already carries it for the harness):

```js
workQueue: {
  enabled: true,
  // Handlers read as this user. It must name an existing user; a fresh MJ install's System user is
  // this address. The steps themselves run as the Forms automation principal, not as this user.
  systemUserEmail: 'not.set@nowhere.com',
  subscriptions: [{ name: 'forms.run-automations', concurrency: 2 }],
},
```

and its database needs **`READ_COMMITTED_SNAPSHOT ON`**. No migration sets it (it is a database-wide
setting, and switching it needs exclusive access); MJ logs an error at startup without it:

```sql
ALTER DATABASE [<your database>] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = '<your database>';  -- 1
```

RCSI matters to Forms for a second reason — a **lock order**. Saving a `FormDistribution` takes
`UPDLOCK, HOLDLOCK` on the link row and then reads its form; archiving a form (`Forms.ArchiveForm`)
writes the form and then closes its links, which is the opposite order. With RCSI **off**, the
reads block on the writers and the two can deadlock; SQL Server picks a victim and rolls it back
cleanly (nothing half-written — the caller sees a failed save and retries). With RCSI **on**, the
form read is a snapshot read and does not wait, so the cycle cannot form. Treat RCSI as required,
not as a tuning option.

The `Form Respondent` role loses one grant in #303: its Read on **Form Versions** is retired by
`V202610132000` (with its row filter), because any holder of a public link could read the raw
snapshot — answer key, ending redirects, knockout conditions — through the generated
`mjBizAppsFormsFormVersion` resolver (#302). Its grants on Form Responses, Form Response Answers and
Form Distributions are as before (narrowing them is a follow-up). The respondent operations
authorize the session against the link — the Form Distributions read is still made as the
respondent, so its row filter binds the session to its own link — and then read the version and
write as the system user.

**This branch targets MJ 6.2 and has an LTS merge gate.** The Work Queue and the isolated-provider
API above exist only in MJ `6.2.0-edge.*`, so the branch does not merge to `next` until MJ's 6.2 LTS
tag ships and bizapps-common and bizapps-tasks publish releases whose MJ peers admit it. Until then,
develop against an MJ **edge** workspace (the harness section below); the LTS `mj-dev` workspace
cannot run it. The full gate — pins, sandbox rebuild, CodeGen, host-truth — is in
[`docs/database-operations.md` §4a](database-operations.md#4a-what-303-changed-in-the-database).

## Running the API harness (`apps/MJAPI`) against an edge workspace

What the #303 harness run needed, beyond `node server.mjs`, in order:

1. **`.env` in `apps/MJAPI`.** `server.mjs` loads `dotenv/config` from its own directory, and a fresh
   checkout or worktree has none. Link the repo root's: `ln -s ../../.env apps/MJAPI/.env` (gitignored).
   Set `GRAPHQL_PORT` and `MJAPI_PUBLIC_URL` together — both are read at import time.
2. **The edge workspace links.** In an MJ `6.2.0-edge` workspace, `forms-core-entities-server` needs
   seven `@memberjunction/*` packages the workspace does not link for it (the Work Queue packages are
   not workspace members at all). `node scripts/link-edge-workspace-deps.mjs` creates gitignored
   symlinks to the MJ checkout beside this repo; `--check` reports without changing anything. Two
   copies of `@memberjunction/core` would leave the `Forms.RunAutomations` handler unregistered.
   (An older harness also died on two copies of `type-graphql`; that came from the hand-written
   `PublicFormResolver`, which #303 deleted. The generated resolvers take their decorators through
   `@memberjunction/server`, so no symlink repoint is needed.)
3. **File storage**, for any upload smoke: `MJ_ENV_FILE=$PWD/.env FORMS_LOCAL_STORAGE_ROOT=<dir> node
   scripts/dev-local-storage.mjs`, then start the API with the same `FORMS_LOCAL_STORAGE_ROOT`.
   Pass `MJ_ENV_FILE` explicitly: the script's default is MJ's own `.env`, which names another database.
4. **`MJ_API_KEY`** in `.env`, for `smoke/resume-arc-path.mjs`: it republishes its fixture form through
   `Forms.PublishForm` with that system key (`x-mj-api-key`), because a published snapshot now
   carries each automation's binding settings and a live-row patch alone changes nothing.

Then `cd apps/MJAPI && node server.mjs`, and run the smokes with `FORMS_SMOKE_URL` set to the harness
(the `npm run smoke:*` scripts; `npm run smoke:binding:seed` first for the binding, résumé and
automation suites). Stop the harness **by PID** (`lsof -tiTCP:<port> -sTCP:LISTEN`), never by
process name — other agents and your own host run `node server.mjs` too.

## Operating the automation queue: dead letters

Delivery semantics come from the shipped subscription row: `PartitionMode: Ordered` (one response's
messages run in order), `MaxAttempts: 5`, exponential backoff from 2 s, `LeaseSeconds: 120`. The
operator tools are MJ's `WorkQueue.*` Remote Operations (`ListDeadLetters`, `ReplayDeadLetter`,
`DiscardDelivery`, `GetBacklog`, `GetSubscriptionStats`). Reading needs Read on `MJ: Work Queue
Deliveries` (delivery payloads can hold personal data); replay and discard need Update on `MJ: Work
Queue Subscriptions`.

| What you see | What it means | What to do |
|---|---|---|
| A final-submit delivery dead-lettered, its `FormAutomationRun` rows `Failed` with `ErrorMessage` starting `Dead-lettered: ` | The handler gave up on purpose: the response or its snapshot cannot be read, the response is not Complete, or a step kept failing transiently through the last attempt | Fix the cause (usually a grant or a target system), then `WorkQueue.ReplayDeadLetter`. A replay reopens exactly the `Dead-lettered: ` rows of that message and runs only those steps; steps that already `Succeeded` are never run twice. |
| A partial-save delivery that "did nothing", one error line naming the response and its steps, rows `Failed` with `ErrorMessage` starting `Abandoned after the retry limit (partial save): ` | Partials never dead-letter: under `Ordered` a dead-lettered partial would hold the response's final message. The next save, and the final submit, supersede it | Nothing, unless the OnPartial step matters on its own; it runs again on the next partial save. |
| A delivery dead-lettered **by the runtime**, with no `Dead-lettered: ` rows — its `FormAutomationRun` rows still `Pending`/`Running` | Its lease expired on the last attempt (a step hung past 120 s, or the host died mid-run). The handler never saw the final attempt, so it closed nothing | `WorkQueue.ReplayDeadLetter` runs it again on the same open rows. Or `WorkQueue.DiscardDelivery` if it must not run; the open rows then stay open — they are history, not work. **If it is a partial save, it blocks that response's final message** (same partition, `Ordered`) until you replay or discard it. Rare; check for it when a response's automations "never ran". |
| A response's final automations delayed by tens of seconds | A partial save for the same response is retrying: it holds the partition key while in backoff — at most ~30 s over its attempts, plus up to 120 s for each attempt that hangs until its lease expires | Nothing; it drains itself. |

To see a response's runs: `SELECT [Status], ErrorMessage, WorkQueueMessageID FROM
__mj_BizAppsForms.FormAutomationRun WHERE FormResponseID = '<id>'`. A run belongs to the delivery
whose message id it carries; rows with a NULL `WorkQueueMessageID` predate #303 and belong to no
delivery.

## Daily loop

```bash
cd ../MJ && pnpm start                                # host up
cd .. && pnpm --filter @mj-biz-apps/forms-ng run build  # after editing Forms
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
  printf "%-16s " "$r"; [ -d ../$r/node_modules/.pnpm ] && echo STANDALONE || echo clean
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
cd ../<offending-repo>
find . -name node_modules -type d -prune -not -path "*/node_modules/*" -not -path "./.claude/*" -exec rm -rf {} +
cd .. && CI=true pnpm install
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
| API startup log | zero `not found in metadata` (a partially-migrated core; see `docs/database-operations.md`) |
| API startup log, a host that runs automations | `[WorkQueue] Host … started {"Running":1,"NotRunning":0}`, `Work Queue host …: forms.run-automations×2` and `[Forms] This host runs 'forms.run-automations'` |
| API startup log, a host without `workQueue` | `[Forms] Work queue ready: submissions publish to "forms.response-submitted"…` and nothing about running the subscription — submissions are accepted, automations wait |

`Failed to resolve import` is raised at **page load**, not at build — a clean bundle build proves
nothing about it. When one appears, census every dep the linked packages declare that the Explorer
cannot resolve and widen the hoist pattern once, rather than adding them one error at a time.
