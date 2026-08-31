# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# MJ Forms Development Guide

**MJ Forms** is a source-available [MemberJunction](https://github.com/MemberJunction/MJ) **Open App** for **forms, surveys, and intake**. It works for **anonymous internet users** (public links / embeds), is **mobile-first** (published as an Angular custom-element widget, not the Explorer shell), is **easy to set up** (visual builder or AI-authored), and makes responses **first-class records in your MemberJunction database** — optionally projected into real, query-able, Skip-accessible entities.

**The single source of truth for building MJ Forms is [`plans/FORMS_BUILD_PLAN.md`](plans/FORMS_BUILD_PLAN.md).** Read its Status Snapshot + Progress Log at the start of every session, pick up the first unfinished task in dependency order, and update task state there as you work.

## MemberJunction core foundation
MJ Forms reuses ~70% of what it needs from MJ core (the heart of the plan — see §3.3):
- **Anonymous magic-link sessions** — `IdentityMode='anonymous'`, scope enforced server-side from JWT `mj_scopes` claims (no DB-role accretion).
- **API-key scopes**, **Actions / Agents / AI Prompts**, **RunView / RunQuery / dashboards**.
- **RSU** (`RuntimeSchemaManager` + `SchemaEvolution`) for promoting responses to first-class entities.
- **bizapps-common** Person / Organization for known-respondent identity (optional, loose coupling).

These capabilities all come from MJ core. We pin `@memberjunction/*` to the **`6.1.0-edge`** line and rev that pin upward over time (do not loosen an app's exact pin to a caret range without a reason — the caret ranges in `peerDependencies` are correct and deliberate; the `dependencies` pins are the ones that must stay exact).

**The exact version is not written here, on purpose.** It lives in `apps/MJAPI/package.json` and `mj-app.json`, which are the files an upgrade actually edits; restating it in prose is how this section came to claim a pin two majors behind the one the repo was building against. Read it, don't recall it:

```bash
node -p "require('./mj-app.json').mjVersionRange"                                  # supported range
node -p "require('./apps/MJAPI/package.json').dependencies['@memberjunction/core']" # the exact pin
```

**Pinning model** (matches the sibling repos'): `apps/*` use **exact** `X.Y.Z` in `dependencies`; `packages/*` declare MJ only as **caret** `^X.Y.Z` `peerDependencies` and carry no MJ `dependencies` at all; `mj-app.json` `mjVersionRange` is `>=X.Y.Z <(major+1).0.0`.

**On every MJ upgrade, diff `@memberjunction/ng-auth-services`'s peer set.** It is the trap most likely to break the Angular build. That package has added auth providers as **required** peers (empty `peerDependenciesMeta`), and the Angular build cannot resolve a peer that is not installed — which is why MJExplorer carries auth SDKs this repo never authenticates with. A version bump that needs a new one fails at build time with a bare module-resolution error that says nothing about auth.

**Angular pinning model** (family-wide, 2026-08-07, with MemberJunction/MJ#3580): `@angular/*` peers in `packages/*` are **caret ranges at the platform pin** (`^21.1.3`) — compatibility claims, never exact. Each package that consumes Angular **anchors** the concrete version with exact `21.1.3` entries in its own `devDependencies`; the anchor is what actually installs. In the shared pnpm dev workspace `auto-install-peers=true` turns unanchored peer ranges into install instructions, which is how two copies of `@angular/core` ended up installed family-wide. Rev anchors with the era platform pin, never with MJ pins.

**Upgrading MJ is a database operation, not just a pin bump.** Bumping npm versions leaves the `__mj` core schema behind, and a partially-migrated core still installs, builds, tests and boots cleanly — the damage surfaces later and nowhere near its cause (`AIEngine.Config()` hits a core entity the metadata lacks, throws `Entity <name> not found in metadata`, and aborts loading its entire agent set). The core migration is run **version-tagged**:

```bash
npx mj migrate -t v<version>      # NOT `npm run mj:migrate`, which only targets __mj_BizAppsForms
```

Read the first line of its output. A real core run prints `Detected installed migration version: <N> — fetching only migrations newer than it.` — that `<N>` must equal the frontier you recorded beforehand (`SELECT MAX(version) FROM __mj.flyway_schema_history WHERE version IS NOT NULL AND success = 1`). A higher `<N>` means a poisoned watermark that will silently hide every migration below it. No watermark line at all means you are not migrating core. Judge success by the **frontier advancing**, never by the `N applied` count — `R__RefreshMetadata.sql` is repeatable, so an already-current run and a fully-skipped run both report `1 applied` and exit 0. Finish by restarting MJAPI and grepping its startup log for `not found in metadata`; it must be clean, because MJAPI starts fine either way.

`bizapps-caliber` carries a full `mj-upgrade` skill covering this end to end (watermark repair, `TURBO_FORCE` builds, post-migration verification). Port it here rather than re-deriving it.

## Repository facts
- **npm scope:** `@mj-biz-apps/forms-*` (packages: `forms-entities`, `forms-actions`, `forms-server`, `forms-ng`)
- **Database schema:** `__mj_BizAppsForms` (follows the bizapps-common / bizapps-tasks `__mj_BizApps*` convention; never put Forms tables in `__mj`)
- **Ports:** MJAPI `4121`, MJExplorer `4321`
- **Entity-name prefix:** Forms entities get the `MJ_BizApps_Forms: ` prefix (set in `mj.config.cjs`), matching the `MJ_BizApps_Common:` / `MJ_BizApps_Tasks:` sibling convention.
- **Hard dependencies (auto-installed Open Apps):** MJ Forms **requires** `bizapps-common` (identity — `MJ_BizApps_Common: People`, hard FK from `FormResponse.RespondentPersonID`) and `bizapps-tasks` (review/approve-before-publish routing). Both are declared in `mj-app.json` `dependencies` and installed automatically by `mj app install` (leaf-first: common → tasks → forms). They're free OSS and part of our stack — build on them directly with hard FKs; do **not** use soft polymorphic links to avoid the dependency.
- **Approval routing (Phase 2):** publish gating uses `bizapps-tasks` — a `FormVersion` going to review creates a Task + TaskLink(→FormVersion) + TaskAssignment(→approver People); the Task's `TaskType` `OnComplete`/`OnReject` action hooks call back into Forms actions to publish or return-to-draft. Forms owns the `FormVersion` status state machine; tasks owns assignment/decisions/UI/audit/notifications.

## Rules and skills (`.claude/`)

Ported from MemberJunction and bizapps-caliber on 2026-07-30 and **corrected against this repo** —
several details in the originals are wrong here, and each file says where and why.

| File | Scope | Covers |
|---|---|---|
| `.claude/rules/data-access.md` | `**/*.ts` | Entity metadata, `BaseEntity`, `RunView`/`RunViews`, caching, the `MJ: ` prefix rule |
| `.claude/rules/typescript-style.md` | `**/*.ts` | No `any`, no weak typing, no cross-package re-exports, `BaseSingleton`, decomposition |
| `.claude/rules/testing.md` | tests | Vitest conventions **here** (`.spec.ts`, no `test-utils`), and what unit tests structurally cannot catch |
| `.claude/rules/design-tokens.md` | `**/*.css` | No hardcoded colours; `--mj-*` / `--mjf-*` tokens; the shadow-root constraint |
| `.claude/skills/mj-upgrade/` | on request | Full MJ version-upgrade runbook, including the core `__mj` migration that the pin bump alone does **not** do |

Known corrections applied during the port, so nobody re-derives them: this repo uses `.spec.ts` not
`.test.ts`; `@memberjunction/test-utils`, `scripts/scaffold-tests.mjs` and `guides/` do not exist
here; there is no Sass; and Caliber's `bump-pins.sh` omits `packages/CoreEntitiesServer`, which this
repo has.

## Structure
```
mj-app.json   package.json   mj.config.cjs   turbo.json
migrations/   migrations-pg/   metadata/   plans/
packages/{Entities,Actions,Server,Angular}
apps/MJAPI            # API-only harness; there is no MJExplorer here
```

---

## 🚨 CRITICAL RULES — VIOLATIONS ARE UNACCEPTABLE 🚨

### 1. NO COMMITS WITHOUT EXPLICIT APPROVAL
- **NEVER run `git commit` without the user explicitly asking.** Each commit needs one-time explicit approval. Never ask "should I commit?" — wait for the request. Only commit what is staged.

### 2. NO `any` TYPES — EVER
- No `as any`, `: any`, `<any>`, or `unknown` as a lazy alternative. MJ has strong typing throughout — ask for the proper type if stuck.

### 2b. NO WEAK TYPING — never use BaseEntity `.Get()`/`.Set()` as a substitute for generated types
- If the generated types don't exist yet, **wait for CodeGen** before writing code against new columns.

### 3. NO DESTRUCTIVE GIT OPERATIONS WITHOUT EXPLICIT APPROVAL
- Never `git checkout -- <file>`, `git restore`, or `git reset --hard` to discard uncommitted work without explicit approval. Never modify merged PRs without approval.

### 4. ANGULAR — standalone preferred for new leaf components; `@if`/`@for`/`@switch` + `inject()` for new code; follow the pattern already used in a package. The respondent widget is an Angular **custom element** — keep it free of the Explorer shell.

### 5. NO RE-EXPORTS BETWEEN PACKAGES — import directly from the source package.

### 6. USE `BaseSingleton` FOR ALL SINGLETONS (from `@memberjunction/global`).

### 7. NO DYNAMIC `import()` unless narrowly justified (Angular lazy routes, optional peer deps, measured bundle deferral, breaking a hard cycle, runtime plugin discovery). Otherwise static imports at top of file, and still declare the dependency.

### 8. PERSIST USER PREFERENCES VIA `UserInfoEngine` — never `localStorage`.

---

## Branching model: `next` → `main`
- **`next`** = integration branch (feature PRs land here). **`main`** = release branch (publishes on push).
- Cut feature branches **from `next`**, push, open a PR → `next`. A single coordinating PR promotes `next` → `main`.
- **Feature branches MUST track the same-named remote** (`origin/<branch>`), never `origin/next` or `origin/main`. Verify with `git branch -vv` before every push.
- Never commit directly to `main`. Never hand-author the `chore: Update package-lock.json` commit — the publish workflow creates it.

## Build & dev commands
- `pnpm install` (repo root only — never inside a package dir)
- `pnpm run build` (turbo, all `@mj-biz-apps/*`) · `pnpm run build:packages` · `pnpm run build:widget`
- `pnpm run mj:migrate` (apply migrations to `__mj_BizAppsForms`) · `pnpm run mj:codegen` · `pnpm run mj:migrate:convert` (PG)
- After changing a package's source, build that package (`cd packages/<Pkg> && pnpm run build`) and run its tests. Fix/update tests rather than leaving them broken.

### Running it — **[docs/local-host.md](docs/local-host.md)**
⚠️ **`start:api` / `start:explorer` / `build:api` / `build:explorer` do not exist** (they did not survive the pnpm migration; `4121`/`4321` describe a host convention, not something this repo serves). Two different answers depending on what you are working on:
- **Server side** (submit endpoint, actions, resolvers, smoke tests) → this repo's own API harness: `cd apps/MJAPI && node server.mjs`. It is API-only, `private: true`, and a deliberate workspace member — see the comment in `pnpm-workspace.yaml` for why that membership is load-bearing.
- **Builder / admin UI in Explorer, or `forms-ng` components** → **MJ's host**: `cd ../MJ && pnpm start` (Explorer `:4201`, API `:4000`) — MJ is checked out beside this repo under a shared workspace parent, with this repo linked in via `mj dev workspace`. There is no Explorer in this repo. Caliber and ATS use the same host; one serves all three.

## CodeGen
- Generated code lives in `packages/*/src/generated/` (entities, actions, resolvers, Angular forms). **Never hand-edit generated files.** Run `npm run mj:codegen` after any schema change. Write TypeScript against generated types **only after** CodeGen runs.
- The scaffold ships **placeholder** `generated/` files so the packages compile before the first CodeGen run; CodeGen overwrites them.

## Migrations
- Highest `migrations/` version folder; `VYYYYMMDDHHMM__v<ver>__<Description>.sql`; hardcoded UUIDs; no `__mj_*` timestamp columns (CodeGen adds them); no FK indexes (CodeGen adds them); `sp_addextendedproperty` on every business column; single multi-`ADD` `ALTER`s; new tables in schema `__mj_BizAppsForms`; use the `${flyway:defaultSchema}` placeholder.
- **`migrations/` is the only thing that ships.** `mj-app.json`'s `metadata.directory` is a dev-time pointer MJ's install engine **never reads** (it says so in `manifest-schema.ts`); seeding happens exclusively through migrations. So a `mj sync push` whose result exists only in your dev DB is an **unshipped change**.
- **Metadata seeding is release work, not PR work** (MJ's model — `MJ/metadata/CLAUDE.md` §1b and §10). A feature PR contributes **only** the declarative JSON under `metadata/`: fields, `@lookup`/`@file`/`@parent` references, a `primaryKey` UUID from `uuidgen`, **no `sync` block, and no `*__Metadata_Sync.sql`**. The build engineer generates **one consolidated `Metadata_Sync` per release** against a clean database — recipe in `migrations/README.md`; it is not a plain re-push, the generator's output needs documented schema substitutions. Two release-readiness checks run in `publish.yml`, not on PRs: `npm run check:release-seed` (every declared `primaryKey` appears in a shipped migration) and `npm run check:seed-cadence` (**one consolidated `Metadata_Sync` per release**: at most one unreleased seed — one not in any release tag has reached no host, so it is not append-only history — and **not zero when `metadata/` moved since the last tag**, which is the only check that sees an *edited* record, since coverage compares ids and an edit keeps its id). `npm run lint:distribution` is a different thing and covers only the shipped-SQL hazards, including the placeholder rule below.
- **Only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL** (teardown scripts: `${mjSchema}` only). `mj migrate` builds its placeholder map from *this* repo's `mj.config.cjs`, but `mj app install` builds it from the *host's* — and Skyway leaves an unknown `${…}` untouched instead of failing, so a third placeholder ships as a literal string and fails silently on someone else's database.

## MJ entity & data patterns (must follow)
- Create entities via `md.GetEntityObject<T>('Name', contextUser)` — never `new EntityClass()`. Look up entities with `md.EntityByName(name)`, not `Entities.find`.
- Server-side: always pass `contextUser` to `GetEntityObject`/`RunView`.
- `RunView`/`RunViews` don't throw — check `.Success`. `Save()`/`Delete()` return booleans — check them and read `LatestResult.CompleteMessage` on failure.
- Use `RunViews` (plural) to batch; `ResultType: 'entity_object'` only when mutating, `'simple'` (+ `Fields`) for read-only.
- Never spread a BaseEntity — use `.GetAll()`.

## Anonymous submission (the crux — see plan §4)
- Public submissions ride an **anonymous, multi-use, scoped magic link** wrapped by a `FormDistribution` record. Authorization is enforced from the JWT `mj_scopes` union — never DB roles — so there is no privilege accretion.
- The one deliberate exception to magic-link read-only convention is a restricted **"Form Respondent"** role with **CanCreate on response entities only** (authored as mj-sync metadata, like the Magic Link recipe in `MJ/guides/MAGIC_LINK_GUIDE.md`).
- Net-new server work is the **public-write hardening layer**: Cloudflare Turnstile (per-form toggle) + rate-limit + quota + dedupe + IP-hash/UA capture, then Save response/answers and fire on-submit Actions/Agents.

## UI / design tokens
- All component CSS uses semantic `--mj-*` design tokens — **no hardcoded colors** (breaks dark mode). Use `@memberjunction/ng-ui-components` + AG Grid + `angular-split` + `<mj-loading>`. Dialog buttons: confirm LEFT, cancel RIGHT. Font Awesome for icons. **Mobile-first or it doesn't ship** — hold every respondent-facing surface to the plan's §2 UX Quality Bar (WCAG AA, per-field mobile keyboards, large tap targets, progress signal).

## Functional decomposition
- Small, focused functions (~30–40 lines max). Decompose complex logic. DRY via base classes/shared utilities.

## High-performance agent behavior
- When tasks are independent and non-interactive, run them in **parallel**, never sequentially.
