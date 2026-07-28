# Fix Plan — Issue #10: forms-server bundles tasks + common resolvers (duplicate GraphQL types crash MJAPI)

**Issue:** https://github.com/MemberJunction/bizapps-forms/issues/10
**Status:** ✅ Implemented on branch `fix/issue-10-scope-codegen-to-forms-schema` (2026-07-27).
See §6 for the execution record and how the plan changed during implementation.

## 1. Issue summary

`@mj-biz-apps/forms-server@0.2.0` ships generated GraphQL resolvers not only for its own
`__mj_BizAppsForms` schema but also for its dependencies' schemas (`__mj_BizAppsTasks`,
`__mj_BizAppsCommon`). When forms is installed alongside `tasks-server` and `common-server`
(the only supported configuration — both are hard dependencies in `mj-app.json`), MJ's
`server-bootstrap` globs every package's `RESOLVER_PATHS` into one schema and type-graphql
aborts with:

```
Error: Schema must contain uniquely named types but contains multiple types named "mjBizAppsTasksTaskActivity_".
```

MJAPI does not start at all. The reporter's workaround (disabling `forms-server` in
`dynamicPackages`) unblocks the host but takes down the entire browser-facing form-fill path.

## 2. Verification results (all claims confirmed)

| Claim in issue | Verified against repo | Result |
|---|---|---|
| `excludeSchemas` missing sibling schemas | `mj.config.cjs:60` → `['sys', 'staging', 'dbo', '__mj']` | ✅ Confirmed — root cause |
| forms-server bundles ~196 classes incl. all of tasks + common | `packages/Server/src/generated/generated.ts` has **195** exported classes, incl. full `mjBizAppsCommon*` and `mjBizAppsTasks*` resolver/type sets | ✅ Confirmed — and the reporter has since corrected the issue's table to **195 / 95 / 50** (the original 196 / 95 / 51 double-counted a JSDoc string containing the word `class`). 195 = 5 generated classes × 39 entities. |
| Collision unavoidable at runtime | `packages/Server/src/index.ts:69` exports `RESOLVER_PATHS` pointing at `generated/generated.{js,ts}` — bootstrap merges all dynamic packages' resolvers into one schema | ✅ Confirmed |

Contamination spread (wider than the issue states — it affects three packages, not just Server):

| Package | Contaminated? | Evidence |
|---|---|---|
| `packages/Server` | **Yes** | `src/generated/generated.ts` — full tasks + common resolvers/types |
| `packages/Entities` | **Yes** | `src/generated/entity_subclasses.ts` — 146 `BizAppsTasks`/`BizAppsCommon` references (sibling entity subclasses + zod schemas) |
| `packages/Angular` | **Yes** | `src/lib/generated/Entities/mjBizAppsTasks*` and `mjBizAppsCommon*` form-component directories, wired into `generated-forms.module.ts` |
| `packages/Actions` | No (generated), **but** two hand-written files import sibling entity types from the contaminated `forms-entities` (see §4 step 2) | `src/custom/on-submit/create-followup-task.action.ts`, `src/custom/on-submit/upsert-respondent-person.action.ts` |
| `packages/CoreEntitiesServer` | No | No generated directory |
| `metadata/` | No | No sibling references |

Sanity check on the fix's viability: `tasks-server` ∩ `common-server` overlap is 0 (per the
issue's evidence), i.e. the sibling repos already scope CodeGen to their own schema and live
happily with cross-schema FKs. Forms is the outlier.

## 3. Root cause

The repo's CodeGen ran against a database containing all three `__mj_BizApps*` schemas
without excluding the sibling ones, so it emitted entities, resolvers, and Angular form
components for `__mj_BizAppsTasks` and `__mj_BizAppsCommon` into the Forms packages. Those
types are owned by `@mj-biz-apps/tasks-*` and `@mj-biz-apps/common-*`; duplicating them in
forms guarantees a GraphQL type-name collision in any real deployment.

A second, latent defect made the first one invisible: the hand-written on-submit actions
import sibling entity classes from `@mj-biz-apps/forms-entities` instead of from the source
packages — this only compiles *because* of the contamination (and violates the repo rule
"no re-exports between packages; import directly from the source package").

## 4. Fix plan

### Step 1 — Scope CodeGen to the Forms schema (the issue's suggested fix; adopt as-is)

In `mj.config.cjs`:

```js
excludeSchemas: ['sys', 'staging', 'dbo', '__mj', '__mj_BizAppsCommon', '__mj_BizAppsTasks'],
```

### Step 2 — Repoint the two hand-written actions at the source entity packages

Regenerating will delete `mjBizAppsCommonPersonEntity` / `mjBizAppsTasksTask*Entity` from
`forms-entities`, which would break `packages/Actions`. Fix forward, per the repo's own
import rule:

- Add to `packages/Actions/package.json` dependencies:
  - `@mj-biz-apps/common-entities` (published: `5.32.0`)
  - `@mj-biz-apps/tasks-entities` (published: `1.2.0`)
- In `upsert-respondent-person.action.ts`: import `mjBizAppsCommonPersonEntity` from
  `@mj-biz-apps/common-entities`.
- In `create-followup-task.action.ts`: import `mjBizAppsTasksTaskEntity`,
  `mjBizAppsTasksTaskLinkEntity`, `mjBizAppsTasksTaskTypeEntity` from
  `@mj-biz-apps/tasks-entities`.

**Pre-check before editing:** confirm the published packages export those exact class names
(`npm view` / inspect the installed package's `entity_subclasses`). Class names derive from
entity names, which are identical across repos, so they should match — verify, don't assume.
If a name differs, adapt the imports; do not keep the forms-entities copies.

### Step 3 — Regenerate

- Run `npm run mj:codegen` against a dev database that has all three schemas installed
  (CodeGen needs the live DB; siblings must be present so Forms' FKs still resolve).
- CodeGen may not delete files it no longer emits — after the run, delete any stale
  `packages/Angular/src/lib/generated/Entities/mjBizAppsTasks*` / `mjBizAppsCommon*`
  directories and confirm `generated-forms.module.ts` no longer references them.
- Never hand-edit the generated files themselves; all changes flow from config + regen.

### Step 4 — Verify locally (the actual repro, not just counts)

1. Counts: `grep -c "^export class" packages/Server/src/generated/generated.ts` should drop
   from 195 to roughly 50 (forms' own share per the issue's table).
2. `grep -rn "BizAppsTasks\|BizAppsCommon" packages/*/src` should hit **only** the two
   Actions files' imports from the sibling packages — zero hits in any `generated/` output.
3. `npm install` (root) + `npm run build` — all packages compile; run package tests.
4. Boot repro: start MJAPI with `forms-server`, `tasks-server`, and `common-server` all
   enabled as dynamic packages. Confirm the schema builds (no duplicate-type error) and the
   server starts.
5. Confirm forms' own surface still works: `/f/:slug` respondent page loads, public submit
   endpoint responds, forms GraphQL operations resolve.

### Step 5 — Release

- Branch from `next` (repo rule: feature branches cut from `next`, PR → `next`; the
  `next` → `main` promotion publishes).
- Consider two commits per the design rules: (a) the import-repoint refactor,
  (b) the config change + regenerated output.
- Add a changeset: **patch** bump (`0.2.0` → `0.2.1`) for all affected packages
  (`forms-entities`, `forms-server`, `forms-ng`, `forms-actions`); the fix is
  behavior-restoring, not API-adding. Note: removing the sibling classes from
  `forms-entities`' public surface is technically breaking for anyone importing them — but
  those exports were never intended, and the only known consumer is our own Actions package.
  Call this out in the changeset text.
- After publish, comment on issue #10 with the fixed version and close it. Mention that the
  `dynamicPackages` workaround can be reverted.

## 5. Risks / notes

- **Angular FK rendering:** with sibling schemas excluded, generated Forms Angular
  components lose entity-metadata-driven awareness of `People`/`Tasks` targets for FK
  fields (they render as plain fields). This is exactly how tasks-server already treats its
  FK to common — acceptable and consistent.
- **CodeGen SQL output:** `SQLOutput.folderPath` is `./migrations/codegen/` with
  `${flyway:defaultSchema}` mapped to `__mj_BizAppsForms`. Inspect the diff of any emitted
  SQL after regen; nothing for sibling schemas should appear once they're excluded.
- **Reporter's environment runs MJ core 5.48.0** against our `^5.43.0` pins — out of scope
  for this fix; the duplicate-type failure is version-independent.
- **Do not** "fix" by hand-deleting classes from `generated.ts` — the next CodeGen run
  would reintroduce them. The config change is the only durable fix.

## 6. Execution record (2026-07-27)

### What shipped

| Step | Outcome |
|---|---|
| 1. `excludeSchemas` | Done — sibling schemas added, with a comment explaining the failure mode |
| 2. Repoint action imports | Done — and made **type-only** (see below) |
| 3. Regenerate | **Substituted** — no DB available; output pruned deterministically (see below) |
| 4. Verify | Done — build, 426 tests, and a direct type-overlap proof (see below) |
| 5. Release | Changeset added; branch cut from `next`, PR pending |

### Deviations from the plan, and why

**CodeGen could not be re-run.** `mj codegen` requires a live database and this
environment has no credentials (no `.env`, no DB config in `mj.config.cjs` or
`apps/MJAPI/mj.config.cjs`). The generated output was instead pruned
deterministically by a one-off script that only *deletes* whole generated blocks and
never rewrites Forms' own output. Preconditions were verified first:

- `entity_subclasses.ts` — exactly 78 top-level blocks (39 zod schemas + 39 entity
  classes), each starting at a column-0 `/**`. Kept 20 (Forms' 10 entities × 2).
- `generated.ts` — exactly 156 sections (39 entities × ENTITY CLASS + 2 × INPUT TYPE +
  RESOLVER), each delimited by a 3-line `//****` banner. Kept 40 (10 × 4).
- Angular — 39 per-entity component directories. Kept 10; the module was rebuilt with
  one submodule, matching CodeGen's 20-per-submodule chunking.
- **Crucially:** Forms' own blocks were confirmed to contain *zero* references to
  foreign symbols in either file, so removing the foreign blocks could not break them.

The next real CodeGen run (with the config fix in place) should be *semantically* a
no-op against this output, but **not byte-identical**: the prune dropped CodeGen's
trailing-whitespace filler lines and normalised the final newline in
`generated-forms.module.ts`. Expect a small whitespace-only diff on the next regen.
The script was not kept — it is not a repo artifact.

**Imports were made type-only.** Both actions use the sibling entity classes purely as
generic type parameters (`GetEntityObject<T>`, `RunView<T>`) — there is no value usage,
so `import type` is both accurate and free at runtime. Verified: `packages/Actions/dist`
contains no reference to either sibling package, including in `.d.ts`.

**A regression gate was added** (not in the original plan). `scripts/check-generated-schema-scope.mjs`
+ `npm run lint:generated` + `.github/workflows/generated-scope-gate.yml`, following the
existing `check-ui-tokens.mjs` / `lint:ui` precedent. It flags *declarations* of
foreign-schema symbols, foreign-named generated files, and imports reaching into them —
deliberately **not** mere mentions, because correctly scoped output still names
`MJ_BizApps_Common: People` in FK descriptions. It ships with a `--self-test` that proves
the matchers fire on known-bad input and stay silent on the legitimate FK reference.

### Verification results

- `npm run build` — 7/7 tasks green (all packages + MJAPI + MJExplorer).
- Tests — 426 passed across 52 files (Actions 61, Entities 24, Server 153, Angular 162,
  CoreEntitiesServer 26). No test was modified.
- `npm run lint:generated` — RED before the fix (261 violations across 90 paths),
  GREEN after. `npm run lint:ui` — still green.
- **Type-overlap proof** — generated class names extracted from the built
  `dist/generated/generated.js` of all three packages (siblings pulled from npm):

  | Overlap | Before (issue #10) | After |
  |---|---|---|
  | forms ∩ tasks | 95 (complete) | **0** |
  | forms ∩ common | 50 (complete) | **0** |
  | tasks ∩ common | 0 | 0 |

  `forms-server` now contributes 50 generated classes, down from 195 — the same shape as
  its correctly-scoped siblings. The duplicate-type schema build can no longer occur.
  (Before-figures are the reporter's **corrected** counts, 195 / 95 / 50; the issue body's
  original 196 / 95 / 51 over-counted by one on two of the three packages.)

### Post-review fix: the gate's declaration matcher was missing 60% of a regression

A multi-agent review of this branch found a real hole in the gate as first written.
`declarationRe` was anchored to the **start** of the exported identifier
(`^…export\s+class\s+(mjBizAppsTasks\w*)`), but CodeGen emits five classes per entity and
only two of them lead with the schema prefix:

| CodeGen class | Leads with prefix? |
|---|---|
| `mjBizAppsTasksTask_` (ObjectType) | yes |
| `mjBizAppsTasksTaskResolver` | yes |
| `CreatemjBizAppsTasksTaskInput` | **no** |
| `UpdatemjBizAppsTasksTaskInput` | **no** |
| `RunmjBizAppsTasksTaskViewResult` | **no** |

Measured against the real pre-fix contaminated `generated.ts`, the start-anchored matcher
caught **58** foreign declarations; the corrected substring matcher catches **145** — it was
blind to **87**. The gate would still have failed overall on a full regression (the two
prefix-leading classes trip it), but a partial leak of only wrapper types would have passed,
and `generated.ts` carries no foreign prefix in its own filename for the name gate to catch.

Fixed test-first: three failing self-test cases were added (`Create`/`Update`/`Run` foreign
wrappers), confirmed red (`SELF-TEST FAILED — 3 matcher check(s) wrong`, exit 2), then the
matcher was widened to `\w*${classPrefix}\w*`. Self-test is now 9/9 green and the real tree
still passes, so no false positive was introduced.

### Known tension: sibling peer-dependency vs the MJ 5.43.0 pin

`@mj-biz-apps/common-entities@5.32.0` and `@mj-biz-apps/tasks-entities@1.2.0` both declare
`peerDependencies: { "@memberjunction/core": "^5.44.0" }`, while this repo pins
`@memberjunction/*` to exactly `5.43.0`. `npm ls @memberjunction/core` therefore reports
`invalid: "^5.44.0"` for those two packages — and **only** those two.

This is contained but not resolved:

- The sibling packages are declared as `devDependencies` (so this repo can typecheck)
  plus `peerDependencies` with the ranges `mj-app.json` already promises
  (`>=5.31.0 <6.0.0`, `>=1.1.0 <2.0.0`). Consumers of `forms-actions` are therefore **not**
  forced to install packages carrying the `^5.44.0` peer; the host supplies them, as it
  already must.
- Everything compiles and all tests pass against 5.43.0, and the imports are type-only,
  so there is no runtime exposure.
- An earlier draft of this record claimed `npm install --dry-run` proved the gap
  "resolves cleanly". **That claim was wrong and has been removed** — this repo's
  `.npmrc` sets `legacy-peer-deps=true`, which suppresses exactly this class of conflict,
  so the dry-run could not have proven anything about a strict resolver.

**Follow-up (outside this fix's blast radius, logged not done):** CLAUDE.md justifies the
5.43.0 pin with "5.44.0 … is NOT published to npm (404)". That is now **stale** —
`@memberjunction/core@5.44.0` is published and latest is `5.49.0`; the reporter of #10 is
running 5.48.0. Revving the pin would clear this tension outright, but it touches every
package and deserves its own commit, its own testing, and its own decision.

### Still outstanding

- **MJAPI boot repro (plan §4 step 4) was not run** — it needs a database plus all three
  Open Apps installed. The type-overlap proof above is a strong static substitute (the
  crash is purely a name-collision at schema build), but a real boot with
  `forms-server` + `tasks-server` + `common-server` enabled should be done before release.
- Confirming `/f/:slug`, the public upload endpoint, and Forms' GraphQL operations still
  serve correctly likewise needs a running instance.
- **`excludeSchemas` itself has never been exercised** — the config is the durable fix, but
  with no database available it was the *prune*, not CodeGen, that produced this output. The
  first real regen is the true test of the config change.
- **Logged, not done:** `scripts/check-generated-schema-scope.mjs` and
  `scripts/check-ui-tokens.mjs` now share a visible amount of shape (directory walk, the
  `::error file=…` annotation format, the `--self-test` + exit-code protocol). Extracting a
  small `scripts/lib/gate.mjs` is worth doing, but it means editing a file this bug fix has
  no reason to touch, and refactors belong in their own commit. A third gate should force it.
