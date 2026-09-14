# QuestionType picklist sequence repair (#219) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 25 `EntityFieldValue.Sequence` writes that `V202608301200` (Signature→Doodle) deliberately omitted, and a regression test that fails whenever the shipped migrations leave the `QuestionType` picklist in an order CodeGen would not produce.

**Architecture:** One new forward migration — history is append-only, so the original cannot be edited — using this repo's established natural-key pattern for `EntityFieldValue` writes (`V202608252340`): resolve the `EntityField` id by `(Entity.SchemaName, Entity.BaseTable, EntityField.Name)`, `THROW` if it does not resolve, then match rows by `(EntityFieldID, Value)`. Plus one test in the existing `question-types.spec.ts` that replays every migration's picklist writes and compares the end state against the sequences CodeGen derives from the shipped CHECK constraint.

**Tech Stack:** SQL Server T-SQL (Flyway/Skyway migrations, `${flyway:defaultSchema}` + `${mjSchema}` placeholders only), TypeScript, Vitest, Node stdlib.

**Spec:** [GitHub issue #219](https://github.com/MemberJunction/bizapps-forms/issues/219). Root-cause investigation is reproduced in the "Background" section below; this plan is self-contained.

---

## Global Constraints

- **Branch:** `fix/219-questiontype-sequence-rows`, cut from `origin/next`. PR targets `next`, never `main`.
- **Migrations are append-only.** Never edit `V202608301200`. The repair is a new file. (`migrations/README.md`)
- **`migrations/` is flat** — no `vN/` era subfolders. Filename: `VYYYYMMDDHHMM__v<ver>__<Description>.sql`.
- **The new file must sort after the current latest**, `V202609141900__v0.12.x__Form_Response_Distribution_Metadata.sql`.
- **Only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL.** A third placeholder ships as a literal string and fails silently on someone else's database (`npm run lint:distribution` CHECK 2).
- **Never guard a core-metadata write on a literal row id alone** where the id may be host-minted (`lint:distribution` CHECK 4; `V202608252340`'s own comment). `EntityField` ids are minted per database.
- **Changeset level is `minor`**, not `patch` — the rule is mechanical: *"Does the PR add or change anything under `migrations/**.sql` or `metadata/**`? → `minor`."* (`.claude/rules/changesets.md`). CI (`changes_and_migrations`) enforces this floor.
- **No `any` types, no weak typing.** (`CLAUDE.md` critical rules 2 / 2b)
- **Never hand-edit `packages/*/src/**/generated/**`.** This change touches no generated file; a hook refuses it anyway.
- **No commits without explicit approval** — already granted for this task by the user.

---

## Background — the defect, and why it cannot self-heal

`V202608301200__v0.12.x__Rename_Signature_Question_To_Doodle.sql` §5 renamed the picklist row's
`Value` and `Code` from `Signature` to `Doodle` and left its `Sequence` at 20, saying so explicitly:

```sql
-- `Sequence` is deliberately NOT touched. CodeGen re-derives the whole field's sequences from the
-- CHECK constraint (sorted, then `Sequence = 1 + index`) on its next run, so setting one here
```

That is correct about *what CodeGen does* and wrong about *whether it ever runs*. Both halves were
verified in MJ's source, not reasoned about:

1. `mj app install` writes the app schema into the host's `excludeSchemas`
   (`MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1987`, "so CodeGen skips entity
   discovery, view generation, and Angular component generation for app-owned tables").
2. CodeGen's constraint-sync query is filtered by exactly that list —
   `getCheckConstraintsSchemaFilter` returns `` ` WHERE SchemaName NOT IN (…)` ``
   (`SQLServerCodeGenProvider.ts:2000-2006`), consumed at `manage-metadata.ts:5470`.

So on every host the `FormQuestion.QuestionType` constraint never reaches `syncEntityFieldValues`,
and "its next run" never arrives. `migrations/` is the only channel — the same premise
`scripts/check-codegen-append.mjs` is built on.

**CodeGen's rule, read from source** (`manage-metadata.ts:5509` and `5656-5706`): `parsedValues.sort()`
— bare `Array.prototype.sort()`, so UTF-16 code-unit order — then rows are matched **by `Value`** and
`Sequence = 1 + possibleValues.indexOf(v)`, emitted **only where it differs**.

Renaming `Signature` (alphabetical slot 20) to `Doodle` (slot 5) shifts every value between. Replaying
the shipped migrations against that rule reproduces the issue's live clean-room capture exactly —
**16 of 25 rows drift**, including the three the issue quotes (`Doodle`→5, `Dropdown`→6, `ShortText`→20).

A sweep of all 16 picklist fields in the schema found **`QuestionType` is the only one affected**;
every other CHECK-constrained field is converged. (`FormResponse.Status` looked drifted only because
its `Disqualified` row is inserted under a `@variable` field id — a parser gap, not a defect.)

**Impact:** the designer's `QuestionType` dropdown renders with `Doodle` sitting where `Signature`
used to be instead of between `Date` and `Dropdown`, and 15 other values off by one. Cosmetic, but
permanent, and it is the migration's own stated contract ("A real run must produce NO diff") that
this not happen.

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/V202609142000__v0.12.x__Question_Type_Picklist_Sequence.sql` | **Create.** The 25 `Sequence` writes, natural-keyed, with the `THROW` guard. The only artifact that reaches a host. |
| `packages/Entities/src/contracts/question-types.spec.ts` | **Modify.** Add the replay-and-converge regression test beside the existing `checkConstraintTypes()` helper, which already reads the last migration to define the constraint. |
| `.changeset/<name>.md` | **Create.** `minor` — this PR ships a migration. |

No source, no generated code, and no metadata changes. The `QuestionType` *union* is already correct
in `packages/Entities/src/contracts/question-types.ts` and in the generated entity — only the
database-side display order is wrong.

---

### Task 1: The regression test that would have caught #219

**Files:**
- Test: `packages/Entities/src/contracts/question-types.spec.ts` (modify — append a new `describe` block at the end)

**Interfaces:**
- Consumes: nothing from other tasks. Reads `migrations/*.sql` off disk, same as the existing `checkConstraintTypes()` helper in this file (`join(__dirname, '..', '..', '..', '..', 'migrations')`).
- Produces: nothing other tasks import. Task 2 makes this test pass.

**Why a replay and not a database:** the contract is about *what we ship*, so the shipped SQL is the
right subject. It runs in CI with no database, no clean room, and no MJ install — the reason #219
went unnoticed is that nothing in the repo read this artifact at all.

- [ ] **Step 1: Write the failing test**

Append to `packages/Entities/src/contracts/question-types.spec.ts`:

```ts
describe('the picklist order a host actually receives', () => {
  /**
   * #219. `mj app install` puts our schema in the host's `excludeSchemas`
   * (MJ install-orchestrator.ts:1987), and CodeGen's constraint-sync query filters on exactly that
   * list (`WHERE SchemaName NOT IN (…)`, SQLServerCodeGenProvider.ts:2000). So CodeGen NEVER runs
   * against `FormQuestion.QuestionType` on a host: whatever `migrations/` leaves in
   * `EntityFieldValue.Sequence` is what the designer dropdown renders, forever.
   *
   * `V202608301200` renamed Signature→Doodle and skipped `Sequence` on the stated premise that
   * "CodeGen re-derives the whole field's sequences … on its next run". There is no next run. The
   * rename moved the value from alphabetical slot 20 to slot 5 and left 16 of 25 rows wrong.
   *
   * This replays every migration's writes to that picklist and holds the end state to CodeGen's own
   * rule, read from `syncEntityFieldValues` (manage-metadata.ts:5656): sort the parsed CHECK values
   * with bare `Array.prototype.sort()`, then `Sequence = 1 + index`, matching rows BY VALUE.
   */
  const QUESTION_TYPE_FIELD_ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45';

  type PicklistRow = { id: string; sequence: number; value: string };

  /** The end state of the QuestionType picklist after every shipped migration, keyed by value. */
  function shippedPicklist(): Map<string, PicklistRow> {
    const dir = join(__dirname, '..', '..', '..', '..', 'migrations');
    const byId = new Map<string, PicklistRow>();

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(dir, file), 'utf8');

      // CodeGen's own INSERT shape, with the EntityField id as a literal.
      for (const m of sql.matchAll(
        /\(\s*'([0-9a-fA-F-]{36})'\s*,\s*'([0-9a-fA-F-]{36})'\s*,\s*(\d+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g,
      )) {
        if (m[2].toUpperCase() !== QUESTION_TYPE_FIELD_ID) continue;
        byId.set(m[1].toLowerCase(), { id: m[1].toLowerCase(), sequence: Number(m[3]), value: m[4] });
      }

      // CodeGen's own re-sequence shape: `SET Sequence=N WHERE ID='…'`.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s+SET\s+\[?Sequence\]?\s*=\s*(\d+)\s+WHERE\s+\[?ID\]?\s*=\s*'([0-9a-fA-F-]{36})'/gi,
      )) {
        const row = byId.get(m[2].toLowerCase());
        if (row) row.sequence = Number(m[1]);
      }

      // The Signature→Doodle rename: `SET [Value] = 'x', [Code] = 'x' WHERE [ID] = '…'`.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s*\n?\s*SET\s+\[?Value\]?\s*=\s*'([^']*)'\s*,\s*\[?Code\]?\s*=\s*'([^']*)'\s*\n?\s*WHERE\s+\[?ID\]?\s*=\s*'([0-9a-fA-F-]{36})'/gi,
      )) {
        const row = byId.get(m[3].toLowerCase());
        if (row) row.value = m[1];
      }

      // The natural-key re-sequence shape this repo prefers, and the one #219's repair uses:
      // `SET [Sequence] = N WHERE [EntityFieldID] = @Var AND [Value] = 'x'`. Keyed by value
      // because that is how CodeGen matches, and because a host may hold its own row ids.
      for (const m of sql.matchAll(
        /EntityFieldValue\]?\s*\n?\s*SET\s+\[?Sequence\]?\s*=\s*(\d+)\s*\n?\s*WHERE\s+\[?EntityFieldID\]?\s*=\s*@\w+\s+AND\s+\[?Value\]?\s*=\s*'([^']+)'/gi,
      )) {
        for (const row of byId.values()) if (row.value === m[2]) row.sequence = Number(m[1]);
      }
    }

    return new Map([...byId.values()].map((r) => [r.value, r]));
  }

  it('leaves every QuestionType row at the sequence CodeGen would derive', () => {
    const ordered = [...checkConstraintTypes()].sort(); // CodeGen: bare Array.prototype.sort()
    const shipped = shippedPicklist();

    expect(shipped.size, 'shipped picklist row count').toBe(ordered.length);

    const drifted = ordered
      .map((value, index) => ({ value, want: index + 1, have: shipped.get(value)?.sequence }))
      .filter((r) => r.have !== r.want);

    expect(
      drifted,
      `migrations leave the QuestionType picklist in an order CodeGen would rewrite, and no host ` +
        `ever runs CodeGen against our schema — so this IS the order the designer renders:\n` +
        drifted.map((d) => `  ${d.value}: shipped ${d.have}, CodeGen wants ${d.want}`).join('\n'),
    ).toEqual([]);
  });
});
```

`checkConstraintTypes()` is declared inside the file's first `describe` block. Hoist it to module
scope (move the function above `describe('the taxonomy and the CHECK constraint', …)`, leaving its
doc comment attached) so both blocks can call it. `readdirSync`, `readFileSync` and `join` are
already imported at the top of the file.

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
cd packages/Entities && pnpm vitest run src/contracts/question-types.spec.ts -t 'sequence CodeGen would derive'
```

Expected: **FAIL**, listing exactly 16 drifted rows, beginning `Doodle: shipped 20, CodeGen wants 5`
and ending `ShortText: shipped 19, CodeGen wants 20`. A failure with a different count, or one about
row count / undefined sequences, means the replay is wrong — fix the test before touching the
migration.

- [ ] **Step 3: Confirm the rest of the file still passes**

```bash
cd packages/Entities && pnpm vitest run src/contracts/question-types.spec.ts
```

Expected: every other test in the file PASSES; only the new one fails. This proves the hoist of
`checkConstraintTypes()` did not break `offers exactly the types the database accepts`.

- [ ] **Step 4: Commit the red test**

```bash
git add packages/Entities/src/contracts/question-types.spec.ts
git commit -m "test(entities): the QuestionType picklist order a migrations-only host receives (#219)"
```

---

### Task 2: The migration that repairs it

**Files:**
- Create: `migrations/V202609142000__v0.12.x__Question_Type_Picklist_Sequence.sql`

**Interfaces:**
- Consumes: the test from Task 1, which must be red before this task starts.
- Produces: nothing importable. Its contract is the `Sequence` end state Task 1 asserts.

**Two design decisions, both load-bearing:**

1. **Natural key, never a literal row id.** `V202608252340` established this for `EntityFieldValue`
   and says why in its own comment: *"EntityField ids are minted per database too, and a literal one
   silently matches nothing on a host that minted its own."* The `IF @… IS NULL THROW` is the other
   half — `V202609141900` records that *"a guard that turns a missing prerequisite into silence is
   what produced this defect in the first place."*

2. **Literal sequence numbers, not `ROW_NUMBER() OVER (ORDER BY [Value])`.** The window function is
   shorter and it encodes a *different rule*: SQL Server's collation (`CI_AS`) against CodeGen's
   UTF-16 `Array.prototype.sort()`. They agree on today's 25 values only by luck — they diverge the
   moment a value's first differing character crosses case (`'NPS'` vs a hypothetical `'NaN'`: JS
   orders `P`(80) < `a`(97), SQL compares `p` > `a`). Shipping a rule that happens to agree is the
   same class of latent trap as #219 itself. The literals below are what CodeGen computes.

All 25 rows are written, not just the 16 that drift: the statement set then *declares* the order
rather than encoding a delta against one particular history, it is idempotent, and it repairs a host
that drifted some other way. The nine no-op writes cost nothing.

- [ ] **Step 1: Create the migration**

```sql
-- =============================================================================================
-- MJ Forms v0.12.x — the QuestionType picklist order a host actually receives (#219)
-- =============================================================================================
-- `V202608301200` (Signature → Doodle) renamed this row's `Value` and `Code` and deliberately left
-- its `Sequence`, saying so:
--
--     `Sequence` is deliberately NOT touched. CodeGen re-derives the whole field's sequences from
--     the CHECK constraint (sorted, then `Sequence = 1 + index`) on its next run […]
--
-- Correct about what CodeGen does; wrong about whether it ever runs. `mj app install` writes
-- `__mj_BizAppsForms` into the host's `excludeSchemas`
-- (MJ/packages/OpenApp/Engine/src/install/install-orchestrator.ts:1987), and CodeGen's
-- constraint-sync query filters on exactly that list -- `getCheckConstraintsSchemaFilter` returns
-- ` WHERE SchemaName NOT IN (…)` (SQLServerCodeGenProvider.ts:2000), consumed at
-- manage-metadata.ts:5470. On a host the constraint never reaches `syncEntityFieldValues`. There is
-- no next run, and `migrations/` is the only channel -- the same premise
-- `scripts/check-codegen-append.mjs` is built on.
--
-- The damage: renaming Signature (alphabetical slot 20) to Doodle (slot 5) shifted every value
-- between, so 16 of 25 rows carry the pre-rename ordering. The designer's QuestionType dropdown
-- renders Doodle where Signature used to be and 15 other values off by one. Cosmetic, permanent,
-- and contrary to that migration's own stated contract ("A real run must produce NO diff").
--
-- THE NUMBERS BELOW ARE CODEGEN'S, NOT A PREFERENCE. `syncEntityFieldValues`
-- (CodeGenLib/src/Database/manage-metadata.ts:5656) sorts the parsed CHECK values with a bare
-- `Array.prototype.sort()` -- UTF-16 code-unit order -- and writes `Sequence = 1 + index`, matching
-- rows BY VALUE. `question-types.spec.ts` recomputes that from the shipped constraint and fails if
-- this file drifts from it.
--
-- WHY LITERALS AND NOT `ROW_NUMBER() OVER (ORDER BY [Value])`. The window function would be shorter
-- and would encode a DIFFERENT rule: SQL Server's collation (CI_AS) rather than UTF-16. The two
-- agree on today's 25 values only by luck, and diverge as soon as a value's first differing
-- character crosses case -- 'NPS' vs a hypothetical 'NaN' sorts one way in JS (P=80 < a=97) and the
-- other in SQL (p > a). Shipping a rule that happens to agree is how #219 happened.
--
-- WHY THE NATURAL KEY. `EntityField` ids are minted per database, so a literal one silently matches
-- nothing on a host that minted its own -- V202608252340 records this for these very rows, and
-- `lint:distribution` CHECK 4 exists for the same reason. The THROW is the other half: a guard that
-- turns a missing prerequisite into silence is what produced this defect in the first place
-- (V202609141900).
--
-- ALL 25 ROWS, NOT THE 16 THAT DRIFT. This then declares the order rather than encoding a delta
-- against one history; it is idempotent, and it repairs a host that drifted some other way. The
-- nine writes that change nothing cost nothing.
-- =============================================================================================

DECLARE @QuestionTypeFieldID UNIQUEIDENTIFIER = (
    SELECT TOP 1 ef.[ID]
      FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
     WHERE e.[BaseTable]  = 'FormQuestion'
       AND e.[SchemaName] = '${flyway:defaultSchema}'
       AND ef.[Name]      = 'QuestionType'
);

IF @QuestionTypeFieldID IS NULL
    THROW 51219, N'#219: no [EntityField] row for FormQuestion.QuestionType in this schema. Run the Forms migrations in order.', 1;

UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  1 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Address';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  2 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Checkbox';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  3 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'ContactInfo';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  4 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Date';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  5 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Doodle';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  6 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Dropdown';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  7 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Email';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  8 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'FileUpload';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] =  9 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Legal';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 10 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'LongText';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 11 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Matrix';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 12 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'MultiChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 13 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'NPS';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 14 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Number';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 15 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'OpinionScale';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 16 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Phone';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 17 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'PictureChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 18 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Ranking';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 19 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Rating';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 20 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'ShortText';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 21 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'SingleChoice';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 22 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Statement';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 23 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Time';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 24 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'Website';
UPDATE [${mjSchema}].[EntityFieldValue] SET [Sequence] = 25 WHERE [EntityFieldID] = @QuestionTypeFieldID AND [Value] = 'YesNo';
GO
```

> **Note on `GO` and the `DECLARE`.** The `DECLARE` and every `UPDATE` must stay in **one batch** —
> a `GO` between them puts the variable out of scope and every `UPDATE` then silently matches
> nothing (`@QuestionTypeFieldID` would be NULL). This is the same single-batch shape
> `V202608252340` uses. Do not add `GO` separators between the statements.

- [ ] **Step 2: Run the test and confirm it now passes**

```bash
cd packages/Entities && pnpm vitest run src/contracts/question-types.spec.ts
```

Expected: **all PASS**, including `leaves every QuestionType row at the sequence CodeGen would derive`.

- [ ] **Step 3: Run the migration and distribution gates**

```bash
npm run lint:migrations      # filename/order: the new file must sort last
npm run lint:distribution    # placeholders (CHECK 2), ID-only guards (CHECK 4), schema scope (CHECK 5)
npm run lint:codegen-append  # DDL ↔ CodeGen output pairing
```

Expected: all exit 0. This migration adds no DDL — no `CREATE TABLE`, no `ALTER TABLE`, no new
column — so `check-codegen-append` has no obligation to discharge. If it nonetheless demands one,
read its message: the marker it wants is `@codegen-none`, a stated claim that this DDL yields no
CodeGen output. Do **not** add the marker to silence a real obligation.

- [ ] **Step 4: Run the full package test suite**

```bash
pnpm --filter @mj-biz-apps/forms-entities run test
```

Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add migrations/V202609142000__v0.12.x__Question_Type_Picklist_Sequence.sql
git commit -m "fix(migrations): ship the QuestionType sequences the rename deferred to a run that never happens (#219)"
```

---

### Task 3: Changeset, plan, and whole-repo verification

**Files:**
- Create: `.changeset/question-type-picklist-sequence.md`
- Create: `docs/superpowers/plans/2026-09-14-219-question-type-picklist-sequence.md` (this file)

**Interfaces:** none.

- [ ] **Step 1: Write the changeset**

`minor`, because the PR ships a migration. Verify no sibling changeset on this branch already
carries a *higher* level before settling on it.

```markdown
---
"@mj-biz-apps/forms-entities": minor
---

Ship the `QuestionType` picklist sequences the Signature→Doodle rename deferred to a CodeGen run that
never happens on a host (#219).

`mj app install` puts this app's schema in the host's `excludeSchemas`, and CodeGen's
constraint-sync query filters on that list — so the designer's question-type dropdown rendered
`Doodle` in the slot `Signature` used to occupy, with 15 other values off by one, on every host.
A new migration writes all 25 rows to the order CodeGen derives, keyed on the field's natural key,
and `question-types.spec.ts` now replays the shipped migrations and fails if that order ever drifts
again.
```

- [ ] **Step 2: Verify the whole repo is green**

```bash
pnpm run test
pnpm run typecheck
```

Expected: PASS. `typecheck` needs the worktree's own `pnpm install` to have run (otherwise it fails
with `TS2307: Cannot find module 'node:fs'` across every spec, which reads like the specs are broken
and is not).

- [ ] **Step 3: Commit**

```bash
git add .changeset/question-type-picklist-sequence.md docs/superpowers/plans/2026-09-14-219-question-type-picklist-sequence.md
git commit -m "chore(changeset): minor — this ships a migration (#219)"
```

---

## Verification beyond the test suite — RUN, 2026-09-14

The issue's own acceptance check was executed, with a control so the pass is not vacuous.

**Method.** `MJ_I201_Verify` sits at the `origin/next` Forms frontier and is migrations-only — what a
real host looks like. Backed it up (`RESTORE FILELISTONLY` first: the logical names are
`MJ_Forms_SeedProof2_v012`/`_log`, not the database name) and restored **two** clones from the same
`.bak`, both `ALTER AUTHORIZATION … TO [sa]`:

| database | state | `mj codegen --skipfiles` capture |
|---|---|---|
| `MJ_I219_Control` | pre-fix (frontier `V202609141900`, `Doodle` = 20) | **16 `EntityFieldValue` UPDATEs** |
| `MJ_I219_Verify` | `V202609142000` applied, order 1–25 | **0 `EntityFieldValue` statements** |
| `MJ_I219_Verify` | second run, same database | **no capture file at all** |

The control's 16 statements are byte-identical to the capture quoted in the issue — `Sequence=5 …
D4A3D852` (Doodle), `Sequence=6 … 6E88EEEC` (Dropdown), through `Sequence=20 … 753C2962` (ShortText).

**CodeGen demonstrably looked at our schema**, so the zero is a real convergence and not a scoping
artifact: this repo's `mj.config.cjs` has `includeSchemas: ["__mj_BizAppsForms","__mj_bizappsforms"]`
and `excludeSchemas: []`. The QuestionType order was still 1–25 after CodeGen finished — it had
nothing to change.

**What the passing capture did contain** (335 lines, none of it ours): 7 new `EntityField` rows and
two `EntityField.Sequence` offsets for `MJ_BizApps_Common: Organizations` and
`… Activity Sync Run Details` — pre-existing drift between the checked-out `bizapps-common` and what
the clone's common migrations shipped. Unrelated to this change, and worth knowing before someone
reads a non-empty capture as a failure here.

**Cleanup:** both clones dropped, the `.bak` deleted, `.env` restored to `MJ_ATS_Dev`, and
`migrations/codegen/` removed — a tracked capture file fails `lint:codegen-append` CHECK 1.
`MJ_I201_Verify` was never written to.

## Out of scope

- **The systemic gap** — nothing in the repo reads `EntityFieldValue` end-state for the other 15
  picklist fields. This plan adds coverage for `QuestionType` only, the one field with a rename
  history. The issue notes the systemic gap is already filed separately.

### Corrected during execution — a population that cannot exist

This plan originally carried a third out-of-scope item: *"a host that ran `mj codegen` against our
schema before `V202608301200` and never again still holds this row under its own id with
`Value = 'Signature'` … worth an issue."* **That host cannot exist**, and the note was wrong. Both
reviewers found it independently and the mechanism was then verified directly:

- `B202606281200` seeds the `QuestionType` `EntityField` row under the literal `0a4ff448-…` **and**
  its first 15 `EntityFieldValue` rows **in the same file**, and `__mj.EntityFieldValue` carries
  `FK_EntityFieldValue_EntityField`. A database that had minted its own field id would have failed on
  that file's INSERTs rather than reaching any later migration.
- `mj app install` puts our schema in `excludeSchemas`, so a host cannot run CodeGen here at all.

Confirmed on `MJ_I201_Verify`: the field id is `0a4ff448-80df-4d5d-94ec-e315822a1b45` and the FK is
present. So every host that installed successfully holds the shipped id, `V202608301200` §5's
literal-id `UPDATE` did land, and there is no stale-`Signature` population to file. No issue was
opened. The natural-key form in Task 2 remains correct — it is defence in depth and the repo's
documented direction — but it is not covering a live risk.
