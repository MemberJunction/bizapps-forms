# Contributing to MJ Forms

The durable source of truth for what to build is
[`plans/FORMS_BUILD_PLAN.md`](plans/FORMS_BUILD_PLAN.md). Coding standards and repo-specific
rules live in [`CLAUDE.md`](CLAUDE.md) and `.claude/rules/`.

---

## Branching model: `next` → `main`

- **`next`** is the integration branch — feature PRs land here.
- **`main`** is the release branch — it publishes on push.

Cut feature branches **from `next`**, push, and open a PR **into `next`**. A single
coordinating PR promotes `next` → `main`.

- Feature branches **must track the same-named remote** (`origin/<branch>`), never
  `origin/next` or `origin/main`. Verify with `git branch -vv` before every push.
- **Never commit directly to `main`.**
- Never hand-author the `chore: Update package-lock.json` commit — the publish workflow
  creates it.

---

## Build and test

```bash
pnpm install              # repo root only — never inside a package dir
pnpm run build            # turbo, all @mj-biz-apps/* packages
pnpm run build:packages
pnpm run build:widget     # just the <mj-form> bundle
npm test                  # the ONLY command that covers all six packages
```

After changing a package's source, build that package and run its tests. Fix or update tests
rather than leaving them broken.

Tests are Vitest, named `.spec.ts`. There is no `@memberjunction/test-utils` and no
`scripts/scaffold-tests.mjs` in this repo, whatever sibling repos do.

Running the app locally — and why there is no Explorer here — is
[`docs/local-host.md`](docs/local-host.md).

---

## CodeGen

Generated code lives in `packages/*/src/generated/`. **Never hand-edit it.** Run
`npm run mj:codegen` after any schema change, and write TypeScript against generated types
**only after** CodeGen has run.

---

## Migrations

- Highest `migrations/` version folder; filename `VYYYYMMDDHHMM__v<ver>__<Description>.sql`.
- Hardcoded UUIDs. New tables in schema `__mj_BizAppsForms`.
- No `__mj_*` timestamp columns and no FK indexes — CodeGen adds both.
- `sp_addextendedproperty` on every business column; single multi-`ADD` `ALTER`s.
- Use the `${flyway:defaultSchema}` placeholder; see
  [`docs/install.md`](docs/install.md#6-only-two-placeholders-may-appear-in-shipped-sql) for
  why only two placeholders are ever allowed in shipped SQL.

**`migrations/` is the only thing that ships.** Metadata seeding is release work, not PR work —
a feature PR carries the declarative JSON under `metadata/` and no seed migration. See
[`docs/install.md`](docs/install.md#1-metadata-ships-through-migrations-and-nowhere-else) and
[`migrations/README.md`](migrations/README.md).

---

## Changesets

Every user-visible change needs a changeset (`npm run change`).

**Use `patch` unless the change ships a migration or metadata** — the packages release as a
fixed group, so the bump level is a release-wide decision, not a local one. Full reasoning:
`.claude/rules/changesets.md`.

---

## Non-negotiables

- **No `any`** — no `as any`, `: any`, `<any>`, or `unknown` as a lazy substitute.
- **No weak typing** — never use `BaseEntity.Get()` / `.Set()` in place of generated types. If
  the generated types don't exist yet, wait for CodeGen.
- **No re-exports between packages** — import directly from the source package.
- **No hardcoded colors** in component CSS — semantic `--mj-*` / `--mjf-*` design tokens only,
  or dark mode breaks.
- **Mobile-first or it doesn't ship** — hold every respondent-facing surface to the build
  plan's §2 UX quality bar: WCAG AA, per-field mobile keyboards, large tap targets, a progress
  signal.
- Use `BaseSingleton` from `@memberjunction/global` for all singletons.
- Create entities via `md.GetEntityObject<T>('Name', contextUser)` — never `new EntityClass()`.
  `RunView` doesn't throw, so check `.Success`; `Save()` / `Delete()` return booleans, so check
  them and read `LatestResult.CompleteMessage` on failure.
