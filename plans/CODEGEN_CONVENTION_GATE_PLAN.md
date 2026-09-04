# CodeGen Convention: Contradiction, Rule, and Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make "CodeGen's SQL is appended into the migration that caused it, and the standalone run
file is deleted" the repo's single written convention, load it at the moment an agent touches a
migration, and make violating it fail CI.

**Architecture:** Three layers, in the order they take effect. (1) Delete the one sentence in
`plans/DISTRIBUTION_SEED_PLAN.md` that blesses a second convention. (2) Add
`.claude/rules/migrations-codegen.md`, scoped to `migrations/**` — currently **no** rule loads when
an agent edits a migration. (3) Ship a two-check gate: a **whole-tree** check that no
`CodeGen_Run_*.sql` is tracked, and a **diff-scoped** check that a changed migration carrying
app-schema DDL also carries CodeGen output (or a stated reason it produces none).

**Tech Stack:** Node 20+ stdlib only (`node:child_process`, `node:fs`, `node:test`) — no
dependencies, matching every other gate in `scripts/`. GitHub Actions.

**Spec:** [bizapps-forms#160](https://github.com/MemberJunction/bizapps-forms/issues/160)

---

## Global Constraints

- **Node stdlib only.** No `npm ci` in the gate workflow — a dependency problem must never be the
  reason nobody finds out a migration shipped without its CodeGen output. Matches
  `.github/workflows/migration-order-gate.yml`.
- **Never edit an existing migration.** `migrations/README.md:70` — append-only history; the one
  earned exception (2026-08-13, #39) required that the file *could not apply at all*. Adding a
  banner comment to a merged migration does not qualify. **No task in this plan edits a migration.**
- **Gate scope is deliberate and asymmetric.** Capture files: whole-tree (the tree is at 0 today, so
  whole-tree can never be permanently red). DDL↔output: diff-scoped (9 historical migrations would
  make a whole-tree check permanently red, and a permanently-red gate gets turned off).
- **The banner is the one this repo already uses:** `-- CodeGen output (appended)`. Do **not** import
  `bizapps-caliber`'s `@codegen-output-below` marker — 4 shipped migrations use the prose banner and
  cannot be retrofitted.
- **Changeset level: `patch`.** `.claude/rules/changesets.md` — `minor` only when the change ships a
  migration or metadata. This ships neither.
- **Branch from `next`**, track `origin/<branch>`, PR into `next`. Never commit to `main`.
- **No commits without explicit approval** (CLAUDE.md critical rule 1). Steps say `git commit`; ask first.

---

## What was verified before this plan was written

Every claim in #160 was checked against source. Results, because the plan depends on them:

| Claim | Verdict |
|---|---|
| `plans/DISTRIBUTION_SEED_PLAN.md:255` blesses two conventions | **Confirmed** — "Either is fine" |
| No `.claude/rules/*` matches `migrations/**` or `*.sql` | **Confirmed** — 5 rules, paths are `.changeset/*.md`, `**/*.ts` ×2, `**/*.{css,scss}`, `**/*.{test,spec}.ts` |
| `git ls-files migrations/codegen` is 0 | **Confirmed** (14 files on disk, all untracked) |
| CodeGen logs and executes in one call | **Confirmed** — `MJ/packages/CodeGenLib/src/Misc/sql_logging.ts:212-216` |
| Open-App migrations must be self-contained | **Confirmed** — `MJ/plans/open-app-spec.md:387` |
| `mj app install` writes the app schema into `excludeSchemas` | **Confirmed** — `install-orchestrator.ts:1980`, via `HandleServerConfig` |
| Skyway silently skips a `CodeGen_Run_*.sql` | **Confirmed, and worse than stated** — `scanner.ts` globs `**/*.sql` *recursively*, so the file **is** scanned, fails `^([VvBb])(\d+)__` / `^[Rr]__`, and the `MigrationParseError` is swallowed into an **optional** warning callback |
| `--skipdb` emits no run file | **Confirmed** — `SQLLogging.initSQLLogging()` has exactly one call site, `runCodeGen.ts:243`, inside `if (!skipDB)` |
| CodeGen output is a delta, not a snapshot | **Confirmed** — `sql_codegen.ts:996+`, `logSQLForNewOrModifiedEntity` gates on `newEntityList`/`modifiedEntityList` |
| `mj codegen` runs MJ source in mj-dev | **Confirmed** — root `package.json` overrides both `@memberjunction/cli` **and** `@memberjunction/codegen-lib` to `workspace:*` |
| Ordering rule `migrate → codegen --skipfiles → sync push → codegen --skipdb` | **Confirmed** — `MJ/migrations/CLAUDE.md:318-325` |
| Append-then-delete is a hard MJ rule | **Confirmed** — `MJ/migrations/CLAUDE.md:172-179`; guide steps 4–5 |
| `install-orchestrator.ts:490-500` contradicts `:1980` | **Confirmed** — line 497 tells the operator to run `mj codegen` for a schema app, in the same install that excluded that schema from CodeGen. **File an MJ issue** (Task 7) |
| Marker coverage "4/9" | **Confirmed, by a sounder method** — 9 migrations carry generated CRUD; 4 carry the banner |
| Caliber's gate ships with a spec | **Corrected** — `validate-codegen-append.mjs` has **no** test; its classifier `scripts/migration-codegen.mjs` does. #160's "ship it with a spec" is a new requirement, not a port |
| "Zero code references to `CodeGen_Run` across MJ" | **Corrected in wording, intact in substance** — 5 references exist (filename composer, 2 comments, a config doc-comment, one test fixture string). **None reads a run file back.** |

### Three findings the issue does not contain

1. **The gate cannot be wired behind `changes.yml`'s `has_migrations`.** That step greps
   `^migrations/[^/]+\.sql$` (`.github/workflows/changes.yml:30`), which deliberately excludes
   `migrations/codegen/`. The incident commit `a23b598` touched **no** top-level migration — so a
   gate gated on `has_migrations` would not have run on the very commit that motivated #160.
   *This plan gives the gate its own workflow with its own trigger.*
2. **The failure the DDL check exists to catch has already happened here, and cost an hour.**
   `V202608182100` shipped `CREATE TABLE FormScreen` + three columns with no CodeGen output;
   `V202608191300` is the repair, and its header records the debugging: `BaseEntity.Set` on a field
   with no `EntityField` row is a **no-op**, so the save reported success having written nothing.
   `V202608191200`/`V202608191400` are a second instance of the same pair.
3. **A straight port of caliber's classifier flags 13 of 31 Forms migrations — including all 4 that
   are correct.** Measured, not guessed. Two Forms-specific calibrations fix it (Task 2), taking it
   to 3 flags, all three verified as either already-remedied or correct-by-design.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `plans/DISTRIBUTION_SEED_PLAN.md` | Modify §6 (~line 249-256) | State one convention; stop blessing two |
| `scripts/check-codegen-append.mjs` | Create | The gate: pure classifier functions + a CLI running both checks |
| `scripts/check-codegen-append.spec.mjs` | Create | `node --test` spec, including cases that watch the gate **fail** |
| `.github/workflows/codegen-append-gate.yml` | Create | Its own trigger — `migrations/**` *including* `codegen/` |
| `.claude/rules/migrations-codegen.md` | Create | The discovery mechanism, scoped to `migrations/**` |
| `package.json` | Modify (~line 30) | `lint:codegen-append`, `lint:codegen-append:test` |
| `migrations/README.md` | Modify (~line 19) | Point the existing sentence at the rule and the gate |
| `.changeset/<name>.md` | Create | `patch` |

**One file for classifier + CLI, not two.** Caliber splits them (`migration-codegen.mjs` +
`.github/scripts/validate-codegen-append.mjs`) because its classifier is shared with a Claude hook.
Nothing here shares it, and every existing gate in `scripts/` is one file with its pure functions
exported and `main()` guarded — `check-migration-order.mjs`, `check-release-seed-coverage.mjs`.
Follow the neighbourhood.

---

## Task 1: Remove the contradiction

**Files:**
- Modify: `plans/DISTRIBUTION_SEED_PLAN.md:249-256`

No test — this is prose. Its verification is a grep.

- [ ] **Step 1: Read the surrounding section**

```bash
sed -n '240,262p' plans/DISTRIBUTION_SEED_PLAN.md
```

The paragraph currently ends: `` `bizapps-tasks` instead tracks `migrations/codegen/*.sql` directly.
Either is fine; ours depends on an unenforced manual step, which is what Step 6.1/6.2 exist to enforce.``

- [ ] **Step 2: Replace the last two sentences**

Replace from `` `bizapps-tasks` instead tracks `` through `` Step 6.1/6.2 exist to enforce. `` with:

```markdown
`bizapps-tasks` tracks `migrations/codegen/*.sql` directly. That is **not** an equally valid
alternative and this document should never have implied it was: nothing applies a tracked run file.
Skyway globs `**/*.sql` recursively and *does* read it, then fails its `V…__`/`B…__`/`R__` filename
parse and swallows the error into an optional warning — so a committed run file reads as "the CodeGen
output shipped" while shipping nothing, and MJ has no code that reads one back. For an Open App that
is fatal rather than untidy: `mj app install` adds our schema to the host's `excludeSchemas`
(`MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1980`), so the host's CodeGen never
runs against `__mj_BizAppsForms` and **if it is not in the migration it does not exist on the host**.
The single convention is MJ's (`MJ/guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md` steps 4–5,
`MJ/migrations/CLAUDE.md:172-179`): append below the banner, then delete the standalone file.
Step 6.1/6.2 exist because that append was an unenforced manual step; it is enforced now by
`npm run lint:codegen-append` and `.claude/rules/migrations-codegen.md`.
```

- [ ] **Step 3: Verify the contradiction is gone and Step 6.1/6.2 still read correctly**

```bash
grep -rn "Either is fine" --include='*.md' . | grep -v node_modules   # expect: no output
sed -n '240,275p' plans/DISTRIBUTION_SEED_PLAN.md                     # read Step 6.1/6.2 in context
```

Expected: the grep prints nothing (the two `review-134/` hits are an untracked scratch directory —
confirm with `git ls-files review-134 | wc -l` → `0`; if it prints hits, they are not in the repo).

- [ ] **Step 4: Commit**

```bash
git add plans/DISTRIBUTION_SEED_PLAN.md
git commit -m "docs(plans): one CodeGen convention, not two

DISTRIBUTION_SEED_PLAN said tracking migrations/codegen/*.sql was as good as appending, and it was
the only written endorsement of two conventions in the family. It contradicted migrations/README.md,
docs/database-operations.md and MJ's own guide, and it read authoritatively because it sat in a plan.
An agent on #134 quoted README:19 in the commit message that overrode it. See #160."
```

---

## Task 2: The classifier, as pure functions

**Files:**
- Create: `scripts/check-codegen-append.mjs`
- Create: `scripts/check-codegen-append.spec.mjs`

**Interfaces:**
- Produces (consumed by Task 3): `stripSqlComments(sql) -> string`,
  `findAppSchemaDDL(sql) -> string[]`, `carriesCodeGenOutput(sql) -> boolean`,
  `hasBanner(sql) -> boolean`, `findCodeGenNoneReason(sql) -> string | null`,
  `classifyMigration(relPath, sql, { isNew }) -> string[]` (empty array = clean),
  and the constants `BANNER_PATTERN`, `CODEGEN_NONE_MARKER`.

**Why these two calibrations exist** (both measured against this repo's 31 migrations — caliber's
classifier without them flags 13, including all 4 correct ones):

1. **`EntityFieldValue` writes count as CodeGen output.** `V202608301200` renames a `QuestionType`
   and hand-writes the `__mj.EntityFieldValue` rows CodeGen derives from the CHECK constraint,
   documenting exactly why (its header, lines 36-46). That *is* the output, hand-authored.
2. **A description-only migration is satisfied by its `EntityField.Description` write.**
   `V202608302200` changes two column descriptions and touches no schema. The established Forms
   pattern writes **both** the extended property and `__mj.EntityField.Description`, because
   CodeGen copies the description into the generated entity class and Explorer reads the
   `EntityField` row. Demanding a CodeGen block there is wrong; demanding the *second write* is
   right, and catches a real failure mode (the two surfaces silently disagreeing).

- [ ] **Step 1: Write the failing spec**

Create `scripts/check-codegen-append.spec.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Spec for the CodeGen-append gate. Two jobs, and the second is the one that matters:
 *   1. the classifier is right about this repo's real migrations, and
 *   2. the gate FAILS when it should — a gate nobody has watched fail is indistinguishable
 *      from one that returns pass.
 *
 * Node stdlib only, run with `node --test`, matching scripts/check-migration-order.spec.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findAppSchemaDDL,
  carriesCodeGenOutput,
  hasBanner,
  findCodeGenNoneReason,
  classifyMigration,
} from './check-codegen-append.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

// ── The classifier's own vocabulary ──────────────────────────────────────────────────────────
test('DDL detection is scoped to our own schema placeholder', () => {
  assert.deepEqual(
    findAppSchemaDDL('ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;'),
    ['ALTER TABLE Form']
  );
  // A core-schema grant produces no Forms CodeGen output and must not be nagged about.
  assert.deepEqual(findAppSchemaDDL('UPDATE [${mjSchema}].[Role] SET Name = N\'x\';'), []);
});

test('prose mentioning DDL in a comment does not count as DDL', () => {
  assert.deepEqual(findAppSchemaDDL('-- CREATE TABLE [${flyway:defaultSchema}].[Nope]\nSELECT 1;'), []);
});

test('the banner this repo actually uses is recognised', () => {
  assert.equal(hasBanner('-- CodeGen output (appended) — regenerated; do not hand-edit below this line.'), true);
  assert.equal(hasBanner('-- CodeGen output (appended)'), true);
  assert.equal(hasBanner('-- some other comment'), false);
});

test('@codegen-none reads a reason on its own line only', () => {
  assert.equal(findCodeGenNoneReason('-- @codegen-none: the default is hand-written in three places'),
    'the default is hand-written in three places');
  // Horizontal whitespace only: `\s*` would swallow the newline and adopt the next statement.
  assert.equal(findCodeGenNoneReason('-- @codegen-none:\nALTER TABLE x ADD y INT;'), '');
  assert.equal(findCodeGenNoneReason('nothing here'), null);
});

test('hand-authored EntityFieldValue rows count as CodeGen output', () => {
  assert.equal(carriesCodeGenOutput("UPDATE [${mjSchema}].[EntityFieldValue] SET [Value] = N'Doodle';"), true);
});

// ── The gate must FAIL on the things it exists to catch ──────────────────────────────────────
test('FIRES: DDL with no CodeGen output and no stated reason', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD NewCol BIT NOT NULL DEFAULT 0;');
  assert.equal(v.length, 1);
  assert.match(v[0], /ships no CodeGen output/);
});

test('FIRES: @codegen-none with no reason', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none:\nALTER TABLE [${flyway:defaultSchema}].[Form] ADD NewCol BIT;');
  assert.equal(v.length, 1);
  assert.match(v[0], /carries no reason/);
});

test('FIRES: @codegen-none on a CREATE TABLE, which is always false', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    '-- @codegen-none: nothing to generate\nCREATE TABLE [${flyway:defaultSchema}].[Thing] (ID UNIQUEIDENTIFIER);');
  assert.equal(v.length, 1);
  assert.match(v[0], /always false/);
});

test('FIRES: a description change that never writes EntityField.Description', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    "EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'new text';");
  assert.equal(v.length, 1);
  assert.match(v[0], /EntityField\.Description/);
});

test('FIRES: a NEW migration ships CodeGen output with no banner', () => {
  const v = classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: true });
  assert.equal(v.length, 1);
  assert.match(v[0], /banner/);
});

test('does NOT fire on the same file when it is merely modified', () => {
  // History cannot be retrofitted (migrations/README.md:70), so the banner rule is for new files.
  assert.deepEqual(classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: false }), []);
});

test('does NOT fire on DDL that ships its output under the banner', () => {
  assert.deepEqual(classifyMigration('migrations/V1__x.sql',
    'ALTER TABLE [${flyway:defaultSchema}].[Form] ADD X BIT;\n-- CodeGen output (appended)\nCREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm] AS SELECT 1;',
    { isNew: true }), []);
});

// ── Calibration against this repo's real history ─────────────────────────────────────────────
// Three migrations are expected to flag, and each is understood. If this list changes, either
// the classifier drifted or someone edited history — both need a human.
const KNOWN_HISTORICAL_FLAGS = [
  'migrations/V202608182100__v0.11.x__Element_Parity_And_Screens.sql',
  'migrations/V202608191200__v0.11.x__Ending_Screen_Social_Links.sql',
  'migrations/V202609011500__v0.12.x__Captcha_Opt_In_By_Default.sql',
];

test('the classifier is calibrated against the whole migration directory', () => {
  const files = execFileSync('git', ['ls-files', 'migrations/*.sql'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  assert.ok(files.length >= 31, `expected the shipped migration set, got ${files.length}`);
  const flagged = files.filter((f) => classifyMigration(f, read(f)).length > 0);
  assert.deepEqual(flagged.sort(), [...KNOWN_HISTORICAL_FLAGS].sort());
});

test('the four banner-bearing migrations are recognised as shipping output', () => {
  for (const f of [
    'migrations/V202606301305__v0.1.x_FormDistribution_PublicLinkToken.sql',
    'migrations/V202608211000__v0.11.x__Form_Templates.sql',
    'migrations/V202608211600__v0.11.x__Form_Template_Source.sql',
    'migrations/V202608252340__v0.12.x__Rules_And_Branching.sql',
  ]) {
    assert.equal(hasBanner(read(f)), true, `${f} should carry the banner`);
    assert.deepEqual(classifyMigration(f, read(f)), [], `${f} should be clean`);
  }
});

test('the description-only migration is clean because it writes EntityField.Description too', () => {
  const f = 'migrations/V202608302200__v0.12.x__Link_Credential_Lifecycle.sql';
  assert.deepEqual(classifyMigration(f, read(f)), []);
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```bash
node --test scripts/check-codegen-append.spec.mjs
```

Expected: **FAIL** — `Cannot find module '.../scripts/check-codegen-append.mjs'`.

- [ ] **Step 3: Write the classifier**

Create `scripts/check-codegen-append.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Gate: CodeGen's SQL ships inside the migration that caused it, and the standalone run file does not
 * ship at all.
 *
 * ── WHY THIS IS NOT A STYLE RULE ────────────────────────────────────────────────────────────────
 * MJ Forms is an Open App. `mj app install` writes `__mj_BizAppsForms` into the host's
 * `excludeSchemas` (MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1980), so the
 * host's CodeGen never runs against our schema. `migrations/` is the only channel we have: if a
 * table, a base view, an spCreate/spUpdate/spDelete, an EntityField row or a column description is
 * not in a migration, it does not exist on the host. Locally everything works, because `mj codegen`
 * both LOGS and EXECUTES each statement in one call (CodeGenLib/src/Misc/sql_logging.ts:212-216) —
 * the authoring database is already current when CodeGen exits, and the run file exists solely to
 * replay that effect somewhere else.
 *
 * The specific damage, observed here on 2026-08-19: V202608182100 created FormScreen and three
 * columns and shipped no CodeGen output. `BaseEntity.Set` on a field with no EntityField row is a
 * NO-OP, so the entity never goes dirty and the save reports success having written nothing. An hour
 * went into that before anyone noticed the column and the metadata lived in different databases;
 * V202608191300 is the repair, and V202608191200/V202608191400 are the same pair a second time.
 *
 * ── THE TWO CHECKS, AND WHY THEIR SCOPES DIFFER ─────────────────────────────────────────────────
 * CHECK 1 (capture files) is WHOLE-TREE. `git ls-files migrations/codegen` is 0 today, so a
 * whole-tree check can never be permanently red, and whole-tree is the only scope that catches the
 * commit that motivated this gate: a23b598 committed 14 run files and touched no top-level
 * migration at all.
 *
 * CHECK 2 (DDL ↔ output) is DIFF-SCOPED, for the reason bizapps-caliber documents: nine merged
 * migrations predate the rule and cannot be repaired in place (migrations/README.md:70 — history is
 * append-only), so a whole-tree version would be permanently red and would get turned off. The diff
 * is also the only thing the PR's author can act on.
 *
 * Node stdlib only, deliberately: a dependency problem must never be the reason nobody finds out.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * A migration that ships its CodeGen output is large — B202606281200 is 15k lines — and node's
 * default maxBuffer is 1 MB, so `git show` on exactly the files this gate exists to read would throw
 * ENOBUFS and be indistinguishable from "the path does not exist".
 */
const GIT_OUTPUT_LIMIT = 256 * 1024 * 1024;

/** The banner this repo already uses (V202606301305, V202608211000, V202608211600, V202608252340). */
export const BANNER_PATTERN = /--\s*CodeGen output \(appended\)/i;

/** A deliberate, stated claim that this DDL yields no CodeGen output. */
export const CODEGEN_NONE_MARKER = '@codegen-none';

/**
 * Migrations whose CodeGen output legitimately shipped in a LATER migration.
 *
 * Both were already merged — and therefore immutable — when the omission was found, so the only
 * available remedy was a new migration. Verified, never trusted: the named remedy must exist in the
 * diff's head AND actually carry output, so an entry cannot outlive its justification.
 *
 * NOT a general escape hatch. For a migration that is still editable, append the output to it.
 */
export const OUTPUT_SHIPPED_LATER = new Map([
  // Created FormScreen + FormPage.IsPartialSubmitPoint + FormQuestionOption.ImageURL/MatrixAxis
  // with no output. V202608191300's header documents the repair and the debugging it cost.
  ['V202608182100__v0.11.x__Element_Parity_And_Screens.sql',
   'V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql'],
  // Added FormScreen.SocialLinks. Its EntityField row could not be inserted in the same file — the
  // Entity row for Form Screens is created by V202608191300, which sorts AFTER it. V202608191400
  // calls itself "the second half of V202608191200".
  ['V202608191200__v0.11.x__Ending_Screen_Social_Links.sql',
   'V202608191400__v0.11.x__Form_Screen_Social_Links_Metadata.sql'],
]);

/** Strip line and block comments so prose naming a table never trips a check. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

const APP_SCHEMA = String.raw`\[?\$\{flyway:defaultSchema\}\]?`;
const DDL_PATTERNS = [
  ['CREATE TABLE', new RegExp(String.raw`\bCREATE\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
  ['ALTER TABLE',  new RegExp(String.raw`\bALTER\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
  ['DROP TABLE',   new RegExp(String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?${APP_SCHEMA}\s*\.\s*\[?(\w+)\]?`, 'gi')],
];

/**
 * Schema changes CodeGen owns, and therefore that oblige output.
 *
 * Scoped to `${flyway:defaultSchema}` — our own schema — because CodeGen generates for our entities
 * and nothing else. A migration that only grants a core role or writes `${mjSchema}` rows
 * (V202608131600, V202608181030 and the other Automation_Runner grants) produces no Forms CodeGen
 * output and must not be nagged.
 *
 * Deliberately NOT here: CREATE INDEX and INSERTs into app tables — neither changes entity metadata.
 * Extended properties are handled separately, by `classifyMigration`.
 */
export function findAppSchemaDDL(sql) {
  const code = stripSqlComments(sql);
  const found = [];
  for (const [what, re] of DDL_PATTERNS) {
    for (const m of code.matchAll(re)) found.push(`${what} ${m[1]}`);
  }
  return found;
}

/** Does this migration touch a column description? */
export function touchesExtendedProperty(sql) {
  return /\bsp_(add|update)extendedproperty\b/i.test(stripSqlComments(sql));
}

/**
 * Does it also write `__mj.EntityField.Description`?
 *
 * The established Forms pattern (V202608302200) writes BOTH: CodeGen copies the description into the
 * generated entity class, Explorer's field UI reads the EntityField row, and a migration that
 * updates only one leaves the two surfaces publishing different sentences.
 */
export function writesEntityFieldDescription(sql) {
  return /UPDATE\s+(?:\[?\$\{mjSchema\}\]?\s*\.\s*)?\[?EntityField\]?\b[\s\S]{0,600}?\bDescription\b/i
    .test(stripSqlComments(sql));
}

/** The banner, on its own. Kept separate because the banner rule applies only to NEW files. */
export function hasBanner(sql) {
  return BANNER_PATTERN.test(sql);
}

/**
 * Does the file carry CodeGen's SQL — under the banner, or structurally?
 *
 * Structural detection exists because history predates the banner: five merged migrations carry
 * generated CRUD without one, and they ship correct output. Hand-authored equivalents count too —
 * V202608301200 writes the `__mj.EntityFieldValue` rows CodeGen derives from a CHECK constraint by
 * hand, and documents exactly why (it had no database to regenerate from).
 */
export function carriesCodeGenOutput(sql) {
  if (hasBanner(sql)) return true;
  const code = stripSqlComments(sql);
  return (
    /CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+\S*\[?sp(?:Create|Update|Delete)\w+/i.test(code) ||
    /CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+\S*\[?vw\w+/i.test(code) ||
    /(?:INSERT\s+INTO|UPDATE)\s+\S*\[?EntityField(?:Value)?\]?/i.test(code)
  );
}

/**
 * The stated reason behind `@codegen-none:`, or null when absent.
 *
 * Horizontal whitespace only around the colon — `\s*` would swallow the newline and adopt the next
 * SQL statement as the "reason", so a bare `-- @codegen-none:` would read as fully justified.
 */
export function findCodeGenNoneReason(sql) {
  const m = sql.match(new RegExp(String.raw`${CODEGEN_NONE_MARKER}[ \t]*:[ \t]*([^\n]*)`));
  return m ? m[1].trim() : null;
}

/**
 * Does this migration honour the DDL ↔ CodeGen-output contract?
 *
 * Returns violation strings (empty = clean). `isNew` is true for a file the diff ADDS: the banner is
 * required of new migrations only, because history cannot be retrofitted (migrations/README.md:70).
 * Every message names the fix — a gate that only says "no" costs a round trip to find out why.
 */
export function classifyMigration(relPath, sql, { isNew = false } = {}) {
  const violations = [];
  const ddl = findAppSchemaDDL(sql);
  const generated = carriesCodeGenOutput(sql);

  // A description-only migration: no schema change, just text. Its obligation is the second write.
  if (!ddl.length && touchesExtendedProperty(sql) && !generated) {
    if (!writesEntityFieldDescription(sql)) {
      violations.push(
        `${relPath}: changes a column description via sp_addextendedproperty but never writes ` +
          `__mj.EntityField.Description. CodeGen copies the description into the generated entity ` +
          `class and Explorer reads the EntityField row, so the two surfaces will publish different ` +
          `sentences. Write both — see V202608302200 for the shape.`
      );
    }
    return violations;
  }

  if (ddl.length && !generated) {
    const reason = findCodeGenNoneReason(sql);
    if (reason === null) {
      violations.push(
        `${relPath}: changes schema CodeGen owns (${[...new Set(ddl)].join(', ')}) but ships no ` +
          `CodeGen output. The host runs only migrations and never CodeGen for __mj_BizAppsForms, so ` +
          `it gets the column and not the API — no EntityField row, a stale base view, stale CRUD. ` +
          `Run \`npm run mj:migrate && npx mj codegen --skipfiles\`, then append ` +
          `migrations/codegen/CodeGen_Run_*.sql below a "-- CodeGen output (appended)" banner and ` +
          `DELETE the run file. If this DDL genuinely produces none, say so and why: ` +
          `\`-- ${CODEGEN_NONE_MARKER}: <reason>\`.`
      );
    } else if (reason === '') {
      violations.push(
        `${relPath}: ${CODEGEN_NONE_MARKER} carries no reason. The marker exists to make the claim ` +
          `reviewable — state what about this DDL yields no CodeGen output.`
      );
    } else if (ddl.some((d) => d.startsWith('CREATE TABLE'))) {
      violations.push(
        `${relPath}: ${CODEGEN_NONE_MARKER} on a migration that CREATEs a table is always false — a ` +
          `new table always produces at least the __mj.Entity registration and its EntityField rows. ` +
          `Append the output instead.`
      );
    }
  }

  if (isNew && generated && !hasBanner(sql)) {
    violations.push(
      `${relPath}: ships CodeGen output with no "-- CodeGen output (appended)" banner. In a file this ` +
        `long the hand-DDL/generated boundary has to be unmissable, or a reviewer reads generated ` +
        `plumbing as reviewable schema. Put the banner above the appended block, under ~50 blank lines.`
    );
  }

  return violations;
}
```

- [ ] **Step 4: Run the spec and watch it pass**

```bash
node --test scripts/check-codegen-append.spec.mjs
```

Expected: **PASS**, all tests. If `the classifier is calibrated against the whole migration
directory` fails, print the actual list and reconcile it against the three known flags before
touching the classifier — a fourth flag is either drift or a real finding.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-codegen-append.mjs scripts/check-codegen-append.spec.mjs
git commit -m "feat(scripts): classifier for the DDL <-> CodeGen-output contract

Pure functions plus a spec that watches each rule fire. Calibrated against all 31 shipped
migrations: 28 clean, 3 flagged, each of the three verified as already-remedied by a later
migration or correct by design. Two Forms-specific calibrations that bizapps-caliber's version
lacks -- hand-authored EntityFieldValue rows count as output (V202608301200), and a
description-only migration is satisfied by its EntityField.Description write (V202608302200).
Without them a straight port flags 13 of 31, including all four that are correct. See #160."
```

---

## Task 3: The two checks, as a CLI

**Files:**
- Modify: `scripts/check-codegen-append.mjs` (append the CLI half)
- Modify: `scripts/check-codegen-append.spec.mjs` (add the CLI tests)

**Interfaces:**
- Consumes: everything Task 2 exports.
- Produces (consumed by Task 4): CLI `node scripts/check-codegen-append.mjs [<base-sha> <head-sha>]`,
  exit 0 clean / 1 violation. With no arguments it runs CHECK 1 only — which is what makes it usable
  locally and on `push`, where there is no PR base.

- [ ] **Step 1: Add the failing CLI tests to the spec**

Append to `scripts/check-codegen-append.spec.mjs`:

```javascript
// ── The CLI ──────────────────────────────────────────────────────────────────────────────────
import { trackedCaptureFiles, changedMigrations } from './check-codegen-append.mjs';

test('CHECK 1 is clean on the current tree', () => {
  assert.deepEqual(trackedCaptureFiles(REPO_ROOT), [],
    'a CodeGen_Run_*.sql is tracked — the tree has regressed');
});

test('CHECK 1 is whole-tree, so it sees a capture wherever it lands', () => {
  // The incident (a23b598) committed 14 run files and touched no top-level migration, so a
  // diff-scoped or has_migrations-gated version would not have run at all.
  const out = execFileSync('git', ['ls-files', '--', '*CodeGen_Run_*.sql'],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(out.trim(), '');
});

test('CHECK 1 counts TRACKED files, not files on disk', () => {
  // 14 run files sit untracked in migrations/codegen/ on a developer machine. A pure-fs check
  // would fail every local run and teach people to ignore the gate.
  const onDisk = execFileSync('bash',
    ['-c', 'ls migrations/codegen/CodeGen_Run_*.sql 2>/dev/null | wc -l'],
    { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  assert.ok(Number(onDisk) >= 0);
  assert.deepEqual(trackedCaptureFiles(REPO_ROOT), []);
});

test('the CLI exits 0 with no arguments on a clean tree', () => {
  const r = execFileSync('node', ['scripts/check-codegen-append.mjs'],
    { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.match(r, /No CodeGen capture files are tracked/);
});

test('FIRES: the CLI exits 1 when a base ref cannot be diffed', () => {
  assert.throws(
    () => execFileSync('node',
      ['scripts/check-codegen-append.mjs', 'no-such-ref-aaaa', 'HEAD'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1);
      // The unfetched-base case must be named as itself, never mistaken for a clean run.
      assert.match(String(err.stderr), /Could not diff/);
      return true;
    }
  );
});

test('changedMigrations lists only top-level migration SQL', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  // A commit against itself changes nothing; the point is the shape, not the contents.
  assert.deepEqual(changedMigrations(head, head, REPO_ROOT), []);
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
node --test scripts/check-codegen-append.spec.mjs
```

Expected: **FAIL** — `trackedCaptureFiles` and `changedMigrations` are not exported yet.

- [ ] **Step 3: Append the CLI to `scripts/check-codegen-append.mjs`**

```javascript
// ── CHECK 1: no capture file is tracked, anywhere ───────────────────────────────────────────────

/**
 * Every tracked path matching `CodeGen_Run_*.sql`.
 *
 * `git ls-files`, not the filesystem, and that is load-bearing: 14 untracked run files sit in
 * `migrations/codegen/` on a developer machine right now. A pure-fs check would fail every local run
 * and teach people that this gate is noise.
 */
export function trackedCaptureFiles(cwd) {
  return execFileSync('git', ['ls-files', '--', '*CodeGen_Run_*.sql'], {
    cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT,
  }).split('\n').filter(Boolean);
}

// ── CHECK 2: a changed migration ships its output ───────────────────────────────────────────────

function diffPaths(baseSha, headSha, cwd, filter) {
  const args = ['diff', '--name-only'];
  if (filter) args.push(`--diff-filter=${filter}`);
  args.push(baseSha, headSha, '--', 'migrations/');
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT })
    .split('\n').filter(Boolean);
}

/** Top-level `migrations/*.sql` added or modified between two commits. */
export function changedMigrations(baseSha, headSha, cwd) {
  return diffPaths(baseSha, headSha, cwd, 'AM').filter((p) => /^migrations\/[^/]+\.sql$/.test(p));
}

/** Of those, the ones the diff ADDS — the only files the banner rule applies to. */
export function addedMigrations(baseSha, headSha, cwd) {
  return diffPaths(baseSha, headSha, cwd, 'A').filter((p) => /^migrations\/[^/]+\.sql$/.test(p));
}

/** File contents at `sha`, or null when the path does not exist there. */
function readAt(sha, relPath, cwd) {
  try {
    return execFileSync('git', ['show', `${sha}:${relPath}`], {
      cwd, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT,
    });
  } catch {
    return null;
  }
}

function main() {
  const [, , baseSha, headSha] = process.argv;
  const cwd = process.cwd();
  const violations = [];

  // CHECK 1 — always, with or without a diff.
  const captures = trackedCaptureFiles(cwd);
  for (const f of captures) {
    violations.push(
      `${f}: a standalone CodeGen capture is tracked. Nothing applies it — skyway globs **/*.sql, ` +
        `fails to parse a name that is not V…__/B…__/R__, and swallows the error into a warning, so ` +
        `this reads as "the output shipped" while shipping nothing. Append it below a ` +
        `"-- CodeGen output (appended)" banner in the migration that caused it, then delete it.`
    );
  }

  // CHECK 2 — only when given a range.
  if (baseSha && headSha) {
    let changed, added;
    try {
      changed = changedMigrations(baseSha, headSha, cwd);
      added = new Set(addedMigrations(baseSha, headSha, cwd));
    } catch (error) {
      // Named as itself. The unfetched-base case must never be mistaken for a clean run.
      console.error(
        `::error::Could not diff ${baseSha}..${headSha} from ${cwd}: ${error.message.trim()}\n` +
          `This check ran nothing. Confirm the base commit is fetched (\`fetch-depth: 0\`) and that ` +
          `both refs exist.`
      );
      process.exit(1);
    }

    for (const relPath of changed) {
      const sql = readAt(headSha, relPath, cwd);
      if (sql === null) {
        violations.push(`${relPath}: listed as added/modified but unreadable at ${headSha}.`);
        continue;
      }
      const findings = classifyMigration(relPath, sql, { isNew: added.has(relPath) });
      if (findings.length === 0) continue;

      // A merged migration's output may have shipped in a later one — verified, never assumed.
      const remedy = OUTPUT_SHIPPED_LATER.get(path.basename(relPath));
      if (remedy) {
        const remedySql = readAt(headSha, `migrations/${remedy}`, cwd);
        if (remedySql === null) {
          violations.push(
            `${relPath}: recorded as remedied by ${remedy}, but that migration does not exist at ` +
              `${headSha}. The columns are unregistered on every host either way.`
          );
        } else if (!carriesCodeGenOutput(remedySql)) {
          violations.push(
            `${relPath}: recorded as remedied by ${remedy}, but that migration carries no CodeGen ` +
              `output. The exemption no longer holds.`
          );
        } else {
          console.log(
            `::notice file=migrations/${remedy}::${path.basename(relPath)} ships no output of its ` +
              `own — it was already merged when that was found; its registration ships here.`
          );
        }
        continue;
      }
      violations.push(...findings);
    }

    if (violations.length === 0) {
      console.log(`::notice::${changed.length} changed migration(s) ship their CodeGen output.`);
    }
  } else if (violations.length === 0) {
    console.log('::notice::No CodeGen capture files are tracked.');
  }

  if (violations.length > 0) {
    console.error('::error::CodeGen output convention violated:');
    for (const v of violations) console.error(`  - ${v}`);
    console.error('See .claude/rules/migrations-codegen.md and migrations/README.md.');
    process.exit(1);
  }
}

// Only run as a CLI when executed directly, so the spec can import the pure parts.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run the spec and watch it pass**

```bash
node --test scripts/check-codegen-append.spec.mjs
node scripts/check-codegen-append.mjs                    # expect: exit 0, "No CodeGen capture files are tracked."
node scripts/check-codegen-append.mjs origin/next HEAD    # expect: exit 0 on a clean branch
```

- [ ] **Step 5: Commit**

```bash
git add scripts/check-codegen-append.mjs scripts/check-codegen-append.spec.mjs
git commit -m "feat(scripts): the CodeGen-append gate, with both checks

CHECK 1 (tracked capture files) is whole-tree: the tree is at zero, so it can never be permanently
red, and whole-tree is the only scope that catches a23b598, which committed 14 run files and touched
no top-level migration. It reads git ls-files rather than the filesystem, because 14 UNTRACKED run
files sit in migrations/codegen/ on every developer machine.

CHECK 2 (DDL <-> output) is diff-scoped: nine merged migrations predate the rule and history is
append-only, so a whole-tree version would be permanently red and would get turned off.

Refs #160."
```

---

## Task 4: Wire it into CI

**Files:**
- Create: `.github/workflows/codegen-append-gate.yml`
- Modify: `package.json` (after `lint:migrations`, ~line 30)

**Interfaces:**
- Consumes: the CLI from Task 3.

**The trigger is the point of this task.** `changes.yml`'s `has_migrations` step greps
`^migrations/[^/]+\.sql$` and deliberately excludes `migrations/codegen/` — so wiring behind it
would skip the incident commit entirely. This gate gets its own workflow and its own paths.

- [ ] **Step 1: Add the npm scripts**

In `package.json`, after `"lint:migrations"`:

```json
    "lint:codegen-append": "node scripts/check-codegen-append.mjs",
    "lint:codegen-append:test": "node --test scripts/check-codegen-append.spec.mjs",
```

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/codegen-append-gate.yml`:

```yaml
name: CodeGen Append Gate

# MJ Forms is an Open App: `mj app install` writes __mj_BizAppsForms into the host's excludeSchemas,
# so the host's CodeGen never runs against our schema and `migrations/` is the only channel we have.
# A migration that changes the schema and stops has, on every host, added a column that is not in the
# API — no EntityField row, a stale base view, stale CRUD procedures. It is invisible locally,
# because `mj codegen` logs and executes in one call and the authoring database is already current.
#
# Two checks, two scopes, on purpose:
#   1. No CodeGen_Run_*.sql is TRACKED — whole-tree. The tree is at zero, so this can never be
#      permanently red, and whole-tree is the only scope that catches a23b598 (14 run files
#      committed, no top-level migration touched).
#   2. A changed migration with app-schema DDL ships its CodeGen output — diff-scoped, because nine
#      merged migrations predate the rule and history is append-only (migrations/README.md:70).
#
# NOT wired into changes.yml: that workflow's has_migrations step greps '^migrations/[^/]+\.sql$'
# and deliberately excludes migrations/codegen/, so a gate behind it would not have run on the very
# commit that motivated it. See #160.

on:
  workflow_dispatch:
  # `push` as well as `pull_request`: the PR trigger alone would let a direct commit to next/main
  # land a tracked capture without the gate ever running.
  push:
    branches: [next, main]
    paths:
      - 'migrations/**'
      - 'scripts/check-codegen-append.mjs'
      # The gate's own spec. `npm test` is Vitest and never runs a plain-Node .mjs spec, so without
      # this entry a PR that weakened a case would run neither step.
      - 'scripts/check-codegen-append.spec.mjs'
      - '.github/workflows/codegen-append-gate.yml'
  pull_request:
    branches: [next, main]
    paths:
      - 'migrations/**'
      - 'scripts/check-codegen-append.mjs'
      - 'scripts/check-codegen-append.spec.mjs'
      - '.github/workflows/codegen-append-gate.yml'

jobs:
  codegen-append-gate:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          # CHECK 2 diffs against the PR base, which shallow history does not contain.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # The spec runs FIRST. A gate nobody has watched fail is indistinguishable from one that
      # returns pass, and this order means a weakened gate fails before it gets to report clean.
      - name: Check the gate itself still fires
        run: npm run lint:codegen-append:test

      # No `npm ci`: the gate is Node stdlib only, deliberately, so a dependency problem can never
      # be the reason nobody finds out a migration shipped without its CodeGen output.
      - name: No CodeGen capture file is tracked (whole tree)
        run: npm run lint:codegen-append

      - name: Changed migrations ship their CodeGen output
        if: github.event_name == 'pull_request'
        run: node scripts/check-codegen-append.mjs "${{ github.event.pull_request.base.sha }}" "${{ github.sha }}"

      # On a push, the range is the push itself. `github.event.before` is all-zeroes for a new
      # branch, in which case there is nothing to diff and CHECK 1 above has already run.
      - name: Changed migrations ship their CodeGen output (push)
        if: github.event_name == 'push' && github.event.before != '0000000000000000000000000000000000000000'
        run: node scripts/check-codegen-append.mjs "${{ github.event.before }}" "${{ github.sha }}"
```

- [ ] **Step 3: Validate the workflow parses and the scripts resolve**

```bash
node -e "const p=require('./package.json'); console.log(p.scripts['lint:codegen-append'], '|', p.scripts['lint:codegen-append:test'])"
npm run lint:codegen-append
npm run lint:codegen-append:test
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/codegen-append-gate.yml')); print('workflow YAML OK')"
```

Expected: both npm scripts exit 0; the YAML parses.

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/codegen-append-gate.yml
git commit -m "ci: gate the CodeGen-append convention

Its own workflow rather than a step in changes.yml, because changes.yml's has_migrations greps
'^migrations/[^/]+\\.sql\$' and deliberately excludes migrations/codegen/ -- a gate behind it would
not have run on a23b598, the commit that motivated #160. Triggers on push to next/main as well as
pull_request, so a direct commit cannot land a tracked capture unseen. The spec runs BEFORE the
gate: a weakened gate fails before it gets to report clean.

Closes part of #160."
```

---

## Task 5: The rule that loads at the moment of the decision

**Files:**
- Create: `.claude/rules/migrations-codegen.md`
- Modify: `migrations/README.md:19-20`

**No rule currently loads when an agent edits a migration** — verified: the five existing rules'
`paths:` are `.changeset/*.md`, `**/*.ts` (×2), `**/*.{css,scss}`, `**/*.{test,spec}.ts`. This file
is the discovery mechanism, and it is the layer that would have prevented the incident.

**Keep it a rule, not a second copy of the docs.** `docs/database-operations.md:144-153` already
carries the ordering rule and the append-and-delete instruction; `migrations/README.md` carries the
ordering-is-correctness argument. Duplicating either creates the second place a decision lives —
which is what #160 is about. The rule states the decision and points.

- [ ] **Step 1: Write the rule**

Create `.claude/rules/migrations-codegen.md`:

```markdown
---
paths:
  - "migrations/**"
---

# CodeGen output in migrations

**One convention. CodeGen's SQL is appended into the migration that caused it, below a
`-- CodeGen output (appended)` banner, and the standalone `CodeGen_Run_*.sql` is then DELETED.**

If you have read a document that says tracking `migrations/codegen/*.sql` is an equally valid
alternative, it is out of date — that sentence was removed from
`plans/DISTRIBUTION_SEED_PLAN.md` in #160, having caused the mistake twice.

## First: does this change need CodeGen at all?

```
Did you change the SCHEMA of __mj_BizAppsForms?
  CREATE/ALTER/DROP TABLE, or a CHECK constraint whose value list becomes a generated union
    → YES. Run CodeGen, append its SQL, delete the run file.
  Only a column DESCRIPTION (sp_add/updateextendedproperty)
    → Write BOTH the extended property AND __mj.EntityField.Description. No CodeGen block.
      (V202608302200 is the shape. CodeGen copies the description into the generated entity
      class; Explorer reads the EntityField row. One write leaves the two disagreeing.)
  Only core-schema rows — role grants, ${mjSchema} permissions, seed data
    → NO. No Forms CodeGen output exists. Ship nothing.
  Nothing generated changed
    → DELETE the run file. Do not commit dead SQL.
```

**Worked example of the last case:** `V202609011500` changes a column default in the three places it
lives — the SQL default constraint, `spCreateFormDistribution`'s `ISNULL(@CaptchaRequired, 1)`, and
`__mj.EntityField.DefaultValue` — all by hand, and correctly ships **no** appended block. Its header
says why: the only generated code that would change is a doc comment, and a full regeneration would
drag in whatever else the generating database happened to hold.

When you make that call deliberately on a migration that *does* carry DDL, say so in the file:
`-- @codegen-none: <reason>`. The gate accepts a stated reason and rejects an empty one. It never
accepts one on a `CREATE TABLE` — a new table always produces at least its `__mj.Entity`
registration and `EntityField` rows.

## Order, for a new column

```bash
npm run mj:migrate            # 1. schema
npx mj codegen --skipfiles    # 2. DB side only — creates the EntityField row, rebuilds views and
                              #    procs, and emits the run file you are about to append
npx mj sync push --dir metadata --ci   # 3. now @lookup:MJ: Entity Fields resolves
npx mj codegen --skipdb       # 4. files only — regenerates TS from complete metadata
```

**Never a full `mj codegen` at step 2.** File generation reads whatever metadata the database holds,
and a database built from migrations alone has none of what step 3 is about to seed. A full run there
regenerates from the empty set and **deletes real classes** (`MJ/migrations/CLAUDE.md:318-325`).

**`--skipdb` emits no run file at all.** `SQLLogging.initSQLLogging()` has exactly one call site,
inside `if (!skipDB)` (`MJ/packages/CodeGenLib/src/runCodeGen.ts:243`). If you ran step 4 and found no
run file, nothing is wrong.

## Why this is mandatory rather than tidy

MJ Forms is an **Open App**. `mj app install` writes `__mj_BizAppsForms` into the host's
`excludeSchemas` (`MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1980`), so the
host's CodeGen never runs against our schema. `MJ/plans/open-app-spec.md:387`: *"app migrations must
be self-contained because CodeGen does not run on app schemas at install time."*

**If it is not in the migration, it does not exist on the host** — tables, `spCreate`/`spUpdate`/
`spDelete`, views, indexes, `EntityField` rows, all of it.

It is invisible locally because `mj codegen` **logs and executes in the same call**
(`CodeGenLib/src/Misc/sql_logging.ts:212-216`): your database is already current when CodeGen exits.
The run file exists solely to replay that effect onto databases CodeGen will never touch.

The symptom when you get it wrong is quiet and expensive. `BaseEntity.Set` on a field with no
`EntityField` row is a **no-op** — the entity never goes dirty and the save reports success having
written nothing. That cost an hour here on 2026-08-19; `V202608191300`'s header is the record.

**Do not commit the run file instead.** Skyway globs `**/*.sql` recursively and does read it, then
fails its `V…__`/`B…__`/`R__` filename parse and swallows the error into an optional warning. Nothing
in MJ reads one back. It is also a **delta, not a snapshot** — only new and modified entities are
logged — so an archive of run files is a pile of overlapping partial diffs.

## Two traps specific to this workspace

Generic instructions fail here for two reasons, and both depend on where you are running:

1. **`mj codegen` runs MJ *source*, not the pinned CLI.** The mj-dev root `package.json` overrides
   both `@memberjunction/cli` and `@memberjunction/codegen-lib` to `workspace:*`. The CodeGen doing
   the emitting can be ahead of this repo's `@memberjunction/*` pin.
2. **It runs against whatever `.env` points at** — in mj-dev that is a *shared* database hosting
   sibling apps' schemas, which may be ahead of `next`.

Neither is true on a host or a clean checkout. If you write instructions, say which you assume.

## Never edit a merged migration to add a banner

`migrations/README.md:70` — history is append-only, and the one earned exception (2026-08-13, #39)
required that the file *could not apply at all*. Five merged migrations carry CodeGen output with no
banner; that is history, not a defect to repair. If a merged migration is genuinely missing its
output, ship a **new** migration — `V202608191300` and `V202608191400` are what that looks like.

## The gate

`npm run lint:codegen-append` (and `.github/workflows/codegen-append-gate.yml`) fails on a tracked
`CodeGen_Run_*.sql` anywhere, and on a changed migration with app-schema DDL that ships no output and
states no reason. Full workflow: [`docs/database-operations.md`](../../docs/database-operations.md)
§2 and [`migrations/README.md`](../../migrations/README.md).
```

- [ ] **Step 2: Point `migrations/README.md` at the rule**

Replace lines 19-20 (`` `migrations/codegen/` is gitignored: CodeGen's raw run files are an
intermediate, and its SQL is appended into the feature migration instead. ``) with:

```markdown
`migrations/codegen/` is gitignored: CodeGen's raw run files are an intermediate, and its SQL is
appended into the feature migration instead — under a `-- CodeGen output (appended)` banner, after
which the run file is deleted. This is the **only** convention here; `npm run lint:codegen-append`
enforces both halves, and [`.claude/rules/migrations-codegen.md`](../.claude/rules/migrations-codegen.md)
carries the decision tree, the ordering rule and the reasons.
```

- [ ] **Step 3: Verify the rule is discoverable and its links resolve**

```bash
head -5 .claude/rules/migrations-codegen.md            # expect the `paths: - "migrations/**"` frontmatter
for f in docs/database-operations.md migrations/README.md .claude/rules/migrations-codegen.md; do
  test -f "$f" && echo "ok $f"; done
# Every MJ path the rule cites must exist:
for p in MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts \
         MJ/plans/open-app-spec.md \
         MJ/packages/CodeGenLib/src/Misc/sql_logging.ts \
         MJ/packages/CodeGenLib/src/runCodeGen.ts \
         MJ/migrations/CLAUDE.md; do
  test -f "../$p" && echo "ok $p" || echo "MISSING $p"; done
```

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/migrations-codegen.md migrations/README.md
git commit -m "docs(rules): load the CodeGen convention when a migration is touched

No rule matched migrations/** or *.sql -- the five existing ones scope to .changeset/*.md, **/*.ts,
CSS and test files -- so an agent editing a migration got the repo's TypeScript rules and nothing
about the one convention that decides whether the change reaches a host at all.

Decision tree first (does this need CodeGen?), then the ordering rule, append-and-delete, the
Open-App reason it is mandatory, and the two mj-dev traps that make generic instructions wrong here.
Points at docs/database-operations.md rather than restating it -- a second copy of a decision is what
#160 is about."
```

---

## Task 6: Prove the gate fires, end to end

This is the issue's **Verify by** section. It is a task, not a footnote: a gate nobody has watched
fail is indistinguishable from one that returns pass.

**Files:** none committed. This task produces evidence, then discards it.

- [ ] **Step 1: Prove CHECK 1 fires on a tracked capture**

```bash
git checkout -b throwaway/codegen-gate-proof
mkdir -p migrations/codegen && touch migrations/codegen/CodeGen_Run_test.sql
git add -f migrations/codegen/CodeGen_Run_test.sql
node scripts/check-codegen-append.mjs; echo "exit=$?"
```

Expected: `exit=1`, and the message names the append convention and the banner.

- [ ] **Step 2: Undo, and confirm the gate goes green again**

```bash
git rm -f --cached migrations/codegen/CodeGen_Run_test.sql
rm migrations/codegen/CodeGen_Run_test.sql
node scripts/check-codegen-append.mjs; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 3: Prove CHECK 2 fires on schema DDL with no output**

```bash
BASE=$(git rev-parse HEAD)
cat > migrations/V209912312359__v0.99.x__Gate_Proof.sql <<'SQL'
CREATE TABLE [${flyway:defaultSchema}].[GateProof] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PK_GateProof] PRIMARY KEY DEFAULT (NEWID()),
    [Name] NVARCHAR(200) NOT NULL
);
SQL
git add migrations/V209912312359__v0.99.x__Gate_Proof.sql
git commit -q -m "throwaway: gate proof"
node scripts/check-codegen-append.mjs "$BASE" HEAD; echo "exit=$?"
```

Expected: `exit=1`, naming `CREATE TABLE GateProof` and telling the author to append the output or
state `@codegen-none:`.

- [ ] **Step 4: Prove the `@codegen-none` escape hatch is not a free pass**

```bash
sed -i '' '1i\
-- @codegen-none: nothing to generate
' migrations/V209912312359__v0.99.x__Gate_Proof.sql
git commit -q -am "throwaway: claim no codegen"
node scripts/check-codegen-append.mjs "$BASE" HEAD; echo "exit=$?"
```

Expected: `exit=1` — `@codegen-none` on a `CREATE TABLE` is always false.

- [ ] **Step 5: Prove a compliant migration passes**

```bash
printf '\n-- CodeGen output (appended)\nCREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGateProof] AS SELECT 1;\n' \
  >> migrations/V209912312359__v0.99.x__Gate_Proof.sql
sed -i '' '/@codegen-none/d' migrations/V209912312359__v0.99.x__Gate_Proof.sql
git commit -q -am "throwaway: append output"
node scripts/check-codegen-append.mjs "$BASE" HEAD; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 6: Discard the proof branch**

```bash
git checkout next && git branch -D throwaway/codegen-gate-proof
git status --short   # expect: clean
```

Record the four exit codes in the PR description. **This branch is never pushed.**

- [ ] **Step 7: Run the full existing suite and every gate, and add the changeset**

```bash
pnpm run build:packages
pnpm test
npm run lint:migrations && npm run lint:distribution && npm run lint:generated && npm run lint:ui
node scripts/check-migration-order.spec.mjs
npm run lint:codegen-append && npm run lint:codegen-append:test
git ls-files migrations/codegen | wc -l    # expect: 0
```

Every one must pass, and **no existing test's expectation may change** — if one does, the gate has
altered behaviour it should not have.

Create `.changeset/codegen-append-gate.md`:

```markdown
---
"@mj-biz-apps/forms-entities": patch
---

Ship the CodeGen-append convention as a rule and a gate. `plans/DISTRIBUTION_SEED_PLAN.md` no longer
blesses a second convention; `.claude/rules/migrations-codegen.md` loads when a migration is touched;
`npm run lint:codegen-append` fails a tracked `CodeGen_Run_*.sql` and a schema-DDL migration that
ships no CodeGen output.
```

> Confirm the package name against `.changeset/config.json` and an existing changeset before
> writing it — the fixed group makes the level a release-wide decision, and `patch` is correct here
> because this ships no migration and no metadata (`.claude/rules/changesets.md`).

- [ ] **Step 8: Commit and open the PR**

```bash
git add .changeset/codegen-append-gate.md
git commit -m "chore: changeset for the CodeGen-append gate"
git push -u origin fix/160-codegen-append-gate
git branch -vv      # confirm it tracks origin/fix/160-codegen-append-gate, NOT origin/next
gh pr create --base next \
  --title "Remove the CodeGen convention contradiction, add a migrations-scoped rule, and gate it" \
  --body "$(cat <<'BODY'
Closes #160.

CodeGen's SQL kept being handled wrong because this repo said two different things about it. An
agent on #134 quoted `migrations/README.md:19` in the very commit message that overrode it, because
`plans/DISTRIBUTION_SEED_PLAN.md:255` said tracking `migrations/codegen/*.sql` was equally fine.

Three layers, in the order they take effect:

1. **The contradiction is gone.** DISTRIBUTION_SEED_PLAN now states the single convention and says
   why the alternative is not one: skyway globs `**/*.sql` recursively and *does* read a run file,
   then fails its filename parse and swallows the error into an optional warning. Nothing in MJ
   reads one back.
2. **`.claude/rules/migrations-codegen.md`, scoped to `migrations/**`.** No rule matched
   `migrations/**` or `*.sql` before this — the five existing ones scope to `.changeset/*.md`,
   `**/*.ts`, CSS and test files. Decision tree first (does this even need CodeGen?), then the
   ordering rule, append-and-delete, the Open-App reason it is mandatory, and the two mj-dev traps.
3. **A gate, with its own workflow.** Not a step in `changes.yml`: that workflow's `has_migrations`
   greps `^migrations/[^/]+\.sql$` and deliberately excludes `migrations/codegen/`, so a gate behind
   it would not have run on `a23b598` — the commit that motivated the issue.

**Scopes differ on purpose.** CHECK 1 (no tracked `CodeGen_Run_*.sql`) is whole-tree: the tree is at
zero, so it can never be permanently red, and whole-tree is the only scope that catches a commit
that touches no top-level migration. CHECK 2 (DDL ships its output) is diff-scoped, because nine
merged migrations predate the rule and history is append-only.

**Calibration.** A straight port of `bizapps-caliber`'s classifier flags 13 of 31 shipped
migrations, including all four that are correct. Two Forms-specific calibrations take it to 3:
hand-authored `EntityFieldValue` rows count as output (`V202608301200`), and a description-only
migration is satisfied by its `EntityField.Description` write (`V202608302200`). The three that
remain are `V202608182100` and `V202608191200` — both genuinely missing their output, both already
remedied by a later migration, both recorded in a registry the gate *verifies* rather than trusts —
and `V202609011500`, which is correct by design.

**Watched it fail** (`node scripts/check-codegen-append.mjs`, throwaway branch, never pushed):

| Scenario | Exit |
|---|---|
| `git add -f migrations/codegen/CodeGen_Run_test.sql` | 1 |
| same, removed | 0 |
| new migration with `CREATE TABLE`, no output | 1 |
| same, with `-- @codegen-none: nothing to generate` | 1 (always false on a CREATE TABLE) |
| same, with output under the banner | 0 |

No migration was edited: `migrations/README.md:70` makes history append-only, and the classifier
recognises the five merged migrations that carry output without a banner structurally instead.

Plan: `plans/CODEGEN_CONVENTION_GATE_PLAN.md`.
BODY
)"
```

---

## Task 7: File the MJ issue for the stale install message (optional, ~10 minutes)

`#160` asks this to be resolved rather than built on, and it is resolved: the code is unambiguous and
**the message is stale**.

- `install-orchestrator.ts:497` tells the operator, for any schema-bearing app: *"entity metadata is
  generated by CodeGen — run `mj codegen`, then restart MJAPI and rebuild MJExplorer to activate."*
- `install-orchestrator.ts:1980`, in the **same** install, calls `AddExcludeSchema(...)` for
  `manifest.schema.name` — "so CodeGen skips entity discovery, view generation, and Angular component
  generation for app-owned tables."

The advice cannot work: the host's CodeGen has just been configured to skip that schema. An operator
who follows it and sees no entities has been sent to look in the wrong place.

- [ ] **Step 1: Re-read both sites and confirm they are one install path**

```bash
sed -n '490,500p'   ../MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts
sed -n '1975,1990p' ../MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts
grep -n "HandleServerConfig" ../MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts
```

- [ ] **Step 2: File it against MemberJunction/MJ**

Title: *"`mj app install` tells the operator to run CodeGen for a schema app it just excluded from
CodeGen"*. Body: both line references, the quoted message, the quoted `excludeSchemas` comment, and
`plans/open-app-spec.md:387` as the statement of intended behaviour. Suggest the message say the
app's entity metadata ships in its own migrations and its entity classes in its own npm packages, so
the remaining step is restart + rebuild.

Cross-link it from bizapps-forms#160.

---

## Explicitly out of scope

**`append-codegen.mjs` and `guard-codegen-baseline.mjs`** (issue §4, 382 + 529 lines). #160 marks
them optional and fine to split out, and they should be: they are 900 lines of tooling that make the
append ergonomic, whereas Tasks 1–6 make it *correct and enforced*. Land the gate first, then decide
whether the manual paste is actually the friction — `migrations/V202608252340:79-105` (the 20-line
comment on id-keyed→natural-key hardening) is the evidence to weigh. File as a follow-up issue.

**Retrofitting banners into the five merged migrations that carry output without one**
(`B202606281200`, `V202608072330`, `V202608081200`, `V202608191300`, `V202608191400`). History is
append-only. The classifier recognises their output structurally, so they are clean without an edit.

**Whether `B202606281200` "needs a banner at all"** (#160's verify-before-you-build item). Answered
by not needing an answer: it is merged, it cannot be edited, and the classifier reads its 36 CRUD
procedures as output. No action.

---

## Definition of done — mapped to tasks

| #160 checkbox | Task | Verified by |
|---|---|---|
| `DISTRIBUTION_SEED_PLAN.md` no longer blesses two conventions | 1 | `grep -rn "Either is fine" --include='*.md' .` → empty |
| `.claude/rules/migrations-codegen.md` exists, scoped to `migrations/**`, states the decision tree, ordering rule, append+delete, Open-App reason, mj-dev traps | 5 | frontmatter check + read |
| A CI gate fails a committed `CodeGen_Run_*.sql` | 3, 4 | Task 6 Step 1 → `exit=1` |
| A CI gate fails a schema-DDL migration with no appended block | 3, 4 | Task 6 Step 3 → `exit=1` |
| That gate has a spec that watches it fail, wired into CI ahead of the gate | 2, 3, 4 | 6 `FIRES:` tests; workflow runs the spec before the gate |
| `git ls-files migrations/codegen \| wc -l` is 0 and stays 0 | 3 | CHECK 1, whole-tree, on push and PR |
| Existing suite and gates green; no changed expectation in an existing test | 6 | Task 6 Step 7 |
