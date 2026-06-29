# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# MJ Forms Development Guide

**MJ Forms** is a free, open-source [MemberJunction](https://github.com/MemberJunction/MJ) **Open App** for **forms, surveys, and intake**. It works for **anonymous internet users** (public links / embeds), is **mobile-first** (published as an Angular custom-element widget, not the Explorer shell), is **easy to set up** (visual builder or AI-authored), and makes responses **first-class records in your MemberJunction database** — optionally projected into real, query-able, Skip-accessible entities.

**The single source of truth for building MJ Forms is [`plans/FORMS_BUILD_PLAN.md`](plans/FORMS_BUILD_PLAN.md).** Read its Status Snapshot + Progress Log at the start of every session, pick up the first unfinished task in dependency order, and update task state there as you work.

## MemberJunction core foundation
MJ Forms reuses ~70% of what it needs from MJ core (the heart of the plan — see §3.3):
- **Anonymous magic-link sessions** — `IdentityMode='anonymous'`, scope enforced server-side from JWT `mj_scopes` claims (no DB-role accretion).
- **API-key scopes**, **Actions / Agents / AI Prompts**, **RunView / RunQuery / dashboards**.
- **RSU** (`RuntimeSchemaManager` + `SchemaEvolution`) for promoting responses to first-class entities.
- **bizapps-common** Person / Organization for known-respondent identity (optional, loose coupling).

These capabilities are all present in published **MJ 5.43.0**. We pin `@memberjunction/*` to **exactly `5.43.0`** and rev that pin upward over time (do not loosen to a caret range without a reason). Note: the plan's §12 default assumed `>=5.44.0`; verification during Phase 0 (DG-1) confirmed the forms-critical features ship in 5.43.0, which — unlike 5.44.0 — is actually published to npm.

## Repository facts
- **npm scope:** `@mj-biz-apps/forms-*` (packages: `forms-entities`, `forms-actions`, `forms-server`, `forms-ng`)
- **Database schema:** `__mj_BizAppsForms` (follows the bizapps-common / bizapps-tasks `__mj_BizApps*` convention; never put Forms tables in `__mj`)
- **Ports:** MJAPI `4121`, MJExplorer `4321`
- **Entity-name prefix:** Forms entities get the `MJ Forms: ` prefix (set in `mj.config.cjs`).
- **Caliber seam (do NOT build now):** keep `FormResponse` carrying a polymorphic `SubjectEntityName + SubjectID` and the response/version data cleanly mappable to a JSON `IntakeSubmission`, so the sibling Caliber app can later consume MJ Forms as native intake. Don't build any Caliber integration in this repo.

## Structure
```
mj-app.json   package.json   mj.config.cjs   turbo.json
migrations/   migrations-pg/   metadata/   plans/
packages/{Entities,Actions,Server,Angular}
apps/{MJAPI,MJExplorer}
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
- `npm install` (repo root only — never inside a package dir)
- `npm run build` (turbo, all packages/apps) · `npm run build:packages` · `npm run build:api` · `npm run build:explorer`
- `npm run start:api` (4121) · `npm run start:explorer` (4321)
- `npm run mj:migrate` (apply migrations to `__mj_BizAppsForms`) · `npm run mj:codegen` · `npm run mj:migrate:convert` (PG)
- After changing a package's source, build that package (`cd packages/<Pkg> && npm run build`) and run its tests. Fix/update tests rather than leaving them broken.

## CodeGen
- Generated code lives in `packages/*/src/generated/` (entities, actions, resolvers, Angular forms). **Never hand-edit generated files.** Run `npm run mj:codegen` after any schema change. Write TypeScript against generated types **only after** CodeGen runs.
- The scaffold ships **placeholder** `generated/` files so the packages compile before the first CodeGen run; CodeGen overwrites them.

## Migrations
- Highest `migrations/` version folder; `VYYYYMMDDHHMM__v<ver>__<Description>.sql`; hardcoded UUIDs; no `__mj_*` timestamp columns (CodeGen adds them); no FK indexes (CodeGen adds them); `sp_addextendedproperty` on every business column; single multi-`ADD` `ALTER`s; new tables in schema `__mj_BizAppsForms`; use the `${flyway:defaultSchema}` placeholder.

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
