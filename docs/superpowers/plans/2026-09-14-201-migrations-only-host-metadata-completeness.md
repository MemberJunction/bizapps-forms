# Migrations-only host metadata completeness (#201) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three metadata artifacts a migrations-only host still lacks for `FormResponse.FormDistributionID` — the `EntityRelationship`, the related-entity name-field map, and the `EntityField.Category` values — and tighten `check-codegen-append.mjs` so the next partially-shipped column add fails a gate instead of a host.

**Architecture:** One repair migration carrying three writes, each guarded on a **natural/semantic key** rather than a minted id, because the rows it repairs already exist under host-specific ids on any database that ran CodeGen. Plus two new checks in the existing `check-codegen-append.mjs` — a column add must ship the `EntityField` INSERT that names it, and a foreign-key column add must ship its `EntityRelationship` INSERT — using the gate's existing `OUTPUT_SHIPPED_LATER` escape for the one shipped migration that legitimately deferred its output.

**Tech Stack:** T-SQL migration (Skyway/Flyway, `${mjSchema}` / `${flyway:defaultSchema}` placeholders), `node --test` (stdlib only — no Vitest for `scripts/`).

**Spec:** [GitHub issue #201](https://github.com/MemberJunction/bizapps-forms/issues/201) plus the Investigation below. **Both of the issue's comments are partly wrong — read Investigation before starting. Do not re-ship the `EntityField` rows; they already ship.**

---

## Global Constraints

- **Never hand-edit generated files.** `packages/*/src/**/generated/**` is off limits; `.claude/hooks/block-generated-edits.mjs` refuses it.
- **`migrations/` is append-only.** Never edit `V202609091600` or `V202609121200`. A new migration is the sanctioned repair (`migrations/README.md`).
- **Only `${flyway:defaultSchema}` and `${mjSchema}` may appear in shipped SQL.** A third placeholder ships as a literal string and fails silently on someone else's database.
- **No `__mj_*` timestamp columns on new app tables, no FK indexes** — CodeGen adds both. (Not applicable here; this migration adds no table.)
- **Changeset level: `minor`.** `.claude/rules/changesets.md` — the rule is mechanical: a PR touching `migrations/**.sql` or `metadata/**` is `minor`, everything else `patch`. This PR ships a migration.
- **No `any` types, no `BaseEntity.Get()/.Set()` as a substitute for generated types.** (Not applicable — this PR writes no TypeScript.)
- **Scripts under `scripts/` are Node stdlib only and tested with `node --test`,** never Vitest. Follow the file you are editing.
- Entity id literals, already shipped by `B202606281200` and therefore safe to reuse:
  - `1FC60BDA-25B8-473B-ACE5-1238670D3535` = `MJ_BizApps_Forms: Form Distributions`
  - `63600739-7165-4BDC-B7D7-19A1B1951DFA` = `MJ_BizApps_Forms: Form Responses`

---

## Investigation (findings that change the fix)

Reproduced and measured on 2026-09-14 against three real databases: `MJ_610_CodeGen` (today's clean room, migrations **then** CodeGen), `MJ_Forms_SeedProof2_v012` (migrations-only, frozen at frontier `202609112116`), and `MJ_I201_Repro` (a restored clone of the latter, brought to `next`'s frontier with `mj migrate` and **nothing else**).

### 1. The issue's headline defect is already fixed on `next`. Do not fix it again.

`MJ_Forms_SeedProof2_v012`, frozen before the repair, reproduces the issue's error text exactly:

| check | value |
|---|---|
| `vwFormResponses` columns | 15 |
| `__mj.EntityField` rows for Form Responses | 13 |
| rows named `AllowDeviceResume` / `FormDistributionID` | 0 |

That is the issue's *"base view exposes 15 column(s) but the entity declares 13 field(s)"*, verbatim.

Applying `next`'s remaining two migrations to the clone closes it:

| check | value | issue's DoD |
|---|---|---|
| view columns vs EntityField rows | **15 vs 15** | aligned — no save-capture fallback |
| rows named `AllowDeviceResume` / `FormDistributionID` | **2** | "must be 2" ✅ |
| `__mj_BizAppsForms` columns with no `EntityField` row | **0** | ✅ |

`V202609121200__v0.12.x__Distribution_Allowed_Origins.sql` (merged in #208) ships **four** guarded `INSERT INTO [${mjSchema}].[EntityField]` blocks — `AllowDeviceResume`, `AllowedOrigins`, `FormDistributionID`, and the virtual `FormDistribution` — with `Sequence` computed as `MAX+1`. The 2026-09-13 comment on the issue is right about this.

### 2. The 2026-09-14 comment's timestamp attribution is wrong, and its corroboration is a case-sensitivity artifact.

That comment reads `__mj_CreatedAt = 18:20:03` on `FormDistributionID` as "created by CodeGen, because migrations finished 18:19:38". `MJ_610_CodeGen`'s own `flyway_schema_history` says otherwise:

```
202609091600  Resume Own Response                    18:20:03.350
202609112116  Metadata Sync                          18:20:03.457
202609121200  Distribution Allowed Origins           18:20:03.937   <-- inserts the rows
202609131200  Forms Application Launcher Visibility  18:20:03.967   <-- migrations END here
```

Migrations ended at **18:20:03.967**, not 18:19:38. All four field rows carry `__mj_CreatedAt = 18:20:03.560` — inside that window — and their ids are the migration's own literals (`a6472dd2…`, `4ac66338…`, `28a7247c…`, `0fce1dbc…`). The comment's supporting claim that `28A7247C-…` "appears in no migration" fails only because the migration writes it lower-case; `grep -i` finds it.

**Consequence for this PR:** do not add `EntityField` INSERTs for these columns. They would be dead code at best and a duplicate-row hazard at worst.

### 3. Three artifacts really are missing, and each has a distinct cause.

Measured on `MJ_I201_Repro` (migrations only, never CodeGen — i.e. exactly a host):

| artifact | value on a host | cause |
|---|---|---|
| `EntityRelationship` Form Distributions → Form Responses via `FormDistributionID` | **0 rows** | No migration has ever shipped it. CodeGen minted it at 18:20:32 on the clean room. |
| `EntityField.RelatedEntityNameFieldMap` on `FormDistributionID` | **NULL** | **An ordering defect** — see below. CodeGen set it at 18:20:35. |
| `EntityField.Category` on `AllowDeviceResume`, `AllowedOrigins`, `FormDistributionID`, `FormDistribution` | **all NULL** | Never authored. CodeGen does not fill `Category`; it is NULL on the CodeGen'd clean room too. |

**The name-field map is an ordering defect, and it is the most interesting finding.**
`V202609091600` (2026-09-09) *does* ship the call, guarded on a natural-key lookup:

```sql
DECLARE @FormResponseDistributionFieldID UNIQUEIDENTIFIER = (
    SELECT ef.[ID] FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
     WHERE e.[Name] = N'MJ_BizApps_Forms: Form Responses'
       AND ef.[Name] = N'FormDistributionID');

IF @FormResponseDistributionFieldID IS NOT NULL
    EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] ...
```

The `EntityField` row it looks up is created by `V202609121200` — **three days later in the sort order**. On a migrations-only host the lookup returns NULL, the `IF` skips, and nothing says so. On a developer box CodeGen fills the map in afterwards, which is why nobody saw it. The guard was written to be safe and instead made the failure silent.

`RelatedEntityID` (`1FC60BDA-…`), `RelatedEntityFieldName` (`ID`) and `IncludeRelatedEntityNameFieldInBaseView` (`1`) are **already** in `V202609121200`'s INSERT — only `RelatedEntityNameFieldMap` is missing, because that column is absent from the INSERT's column list and is only reachable through the stored procedure.

### 4. The relationship id is random per database — guard on the semantic key.

Confirmed: the clean room minted `09519E97-EF0C-407D-AC6A-D2B53E3A89A4` for this relationship; `MJ_ATS_Dev` holds the same relationship as `552BEC6E-530C-4011-A08D-C2D36D4E85BC`. An `IF NOT EXISTS (… WHERE [ID] = '<literal>')` guard — the shape CodeGen itself emits — matches neither, and would insert a **duplicate** on every database that already ran CodeGen.

`scripts/check-distribution-seed.mjs` **CHECK 4** already forbids that shape for exactly this reason (#64 → #66: a duplicated relationship makes CodeGen emit a duplicate `@FieldResolver` and `forms-server` stops compiling). Its watershed is `202608211600`, so a new migration using an ID-only guard fails the gate. Guard on `EntityID` + `RelatedEntityID` + `RelatedEntityJoinField`.

### 5. Why the gate did not catch any of this, and what it must now check.

`classifyMigration`'s condition is `ddl.length && !generated`. `V202609091600` ships views, procedures and indexes, so `generated` is `true` and the gate passes — while the `EntityField` rows for the two columns it added are absent. The gate is all-or-nothing about "did this file ship *any* CodeGen output"; the partial case is invisible.

**`OUTPUT_SHIPPED_LATER` is the existing, correct escape for shipped history.** It already maps two merged migrations to the later migration that carried their output, and the gate verifies the named remedy actually exists and carries output. `V202609091600 → V202609121200` is the third instance of that exact pattern and belongs in the map.

### 6. Scope decisions

- **Migration-only, no `metadata/` change.** `metadata/entities/` declares no `Category` and there is no `metadata/entity-relationships/` directory; every `EntityRelationship` this repo has ever shipped travelled in a migration (`B202606281200`, `V202608072330`, `V202608081200`, `V202608211600`). Follow that. A `metadata/` change would also owe a release seed (`check:seed-cadence`), which is the build engineer's work, not this PR's.
- **`RelatedRecordCollection` / `DeclareRelatedRecords` is out of scope.** That is #103's subject and needs CodeGen-emitted TypeScript, which this PR cannot produce without regenerating from a database.
- **Do not run `mj codegen` against the shared dev DB** (`MJ_ATS_Dev`) — it lags migrations and carries other branches' metadata, and regenerating from it reverts merged fixes.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/check-codegen-append.mjs` (modify) | Two new exported predicates + their wiring into `classifyMigration`; one new `OUTPUT_SHIPPED_LATER` entry. |
| `scripts/check-codegen-append.spec.mjs` (modify) | `node --test` coverage for both new checks, including the shipped-history regression assertion. |
| `migrations/V202609141900__v0.12.x__Form_Response_Distribution_Metadata.sql` (create) | The three repair writes, each semantic-key guarded. |
| `.changeset/<name>.md` (create) | `minor` — this PR ships a migration. |

---

## Task 1: Gate — a column add must ship the `EntityField` row that names it

**Files:**
- Modify: `scripts/check-codegen-append.mjs`
- Test: `scripts/check-codegen-append.spec.mjs`

**Interfaces:**
- Produces: `export function findAddedColumns(sql)` → `string[]` of column names added by `ALTER TABLE … ADD`; `export function findInsertedEntityFieldNames(sql)` → `string[]` of column names appearing as an `EntityField` `Name` value in an INSERT. Task 2 consumes both.

- [ ] **Step 1: Read the file you are about to change, all of it.** `scripts/check-codegen-append.mjs` is 449 lines and its header comments explain why each existing check has the scope it has. Your new check must not contradict them. In particular: CHECK 2 is **diff-scoped** (new/changed migrations only) because history is append-only — keep it that way.

- [ ] **Step 2: Write the failing tests**

Append to `scripts/check-codegen-append.spec.mjs`, following the fixture style already used there:

```js
test('findAddedColumns names every column an ALTER TABLE ADD introduces', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormDistribution] ADD [AllowDeviceResume] BIT NOT NULL CONSTRAINT DF_x DEFAULT (1);
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL;
  `;
  assert.deepEqual(findAddedColumns(sql).sort(), ['AllowDeviceResume', 'FormDistributionID']);
});

test('findAddedColumns ignores ADD CONSTRAINT — a constraint is not a column', () => {
  const sql = `ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD CONSTRAINT FK_x FOREIGN KEY ([FormDistributionID]) REFERENCES [\${flyway:defaultSchema}].[FormDistribution]([ID]);`;
  assert.deepEqual(findAddedColumns(sql), []);
});

test('findInsertedEntityFieldNames reads the Name value out of an EntityField INSERT', () => {
  const sql = `
    INSERT INTO [\${mjSchema}].[EntityField] ([ID],[EntityID],[Sequence],[Name],[DisplayName])
    VALUES ('a','b',1,'AllowDeviceResume','Allow Device Resume')
  `;
  assert.deepEqual(findInsertedEntityFieldNames(sql), ['AllowDeviceResume']);
});

test('a migration that adds a column and ships CodeGen output but no EntityField row for it is a violation', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL;
    -- CodeGen output (appended)
    CREATE OR ALTER VIEW [\${flyway:defaultSchema}].[vwFormResponses] AS SELECT * FROM x;
    CREATE OR ALTER PROCEDURE [\${flyway:defaultSchema}].[spCreateFormResponse] AS SELECT 1;
  `;
  const v = classifyMigration('migrations/V209901010000__test.sql', sql, { isNew: true });
  assert.equal(v.length, 1);
  assert.match(v[0], /FormDistributionID/);
  assert.match(v[0], /EntityField/);
});

test('the same migration passes once it ships the EntityField row', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL;
    -- CodeGen output (appended)
    CREATE OR ALTER VIEW [\${flyway:defaultSchema}].[vwFormResponses] AS SELECT * FROM x;
    INSERT INTO [\${mjSchema}].[EntityField] ([ID],[EntityID],[Sequence],[Name])
    VALUES ('a','b',1,'FormDistributionID')
  `;
  assert.deepEqual(classifyMigration('migrations/V209901010000__test.sql', sql, { isNew: true }), []);
});

test('@codegen-none naming the column excuses it', () => {
  const sql = `
    -- @codegen-none: FormResponse.Scratch is a staging column the entity layer never exposes
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [Scratch] INT NULL;
    -- CodeGen output (appended)
    CREATE OR ALTER VIEW [\${flyway:defaultSchema}].[vwFormResponses] AS SELECT * FROM x;
  `;
  assert.deepEqual(classifyMigration('migrations/V209901010000__test.sql', sql, { isNew: true }), []);
});
```

Add `findAddedColumns` and `findInsertedEntityFieldNames` to the spec's import list.

- [ ] **Step 3: Run the tests and watch them fail**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-201
npm run lint:codegen-append:test
```

Expected: FAIL — `findAddedColumns is not a function`.

- [ ] **Step 4: Implement**

In `scripts/check-codegen-append.mjs`, beside the existing `findAppSchemaDDL`:

```js
/**
 * Columns an `ALTER TABLE … ADD` introduces, in our schema.
 *
 * `ADD CONSTRAINT` is deliberately excluded: a constraint is not a column and owes no EntityField
 * row. `ADD` may carry several comma-separated columns in one statement — CLAUDE.md asks for exactly
 * that ("single multi-`ADD` `ALTER`s") — so the list is parsed, not assumed to be one name.
 */
export function findAddedColumns(sql) {
  const code = stripSqlComments(sql);
  const re = new RegExp(String.raw`\bALTER\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?\w+\]?\s+ADD\s+([^;]*)`, 'gi');
  const names = [];
  for (const m of code.matchAll(re)) {
    const body = m[1];
    if (/^\s*CONSTRAINT\b/i.test(body)) continue;
    for (const part of splitTopLevel(body)) {
      const name = part.match(/^\s*\[?(\w+)\]?/);
      if (name && !/^CONSTRAINT$/i.test(name[1])) names.push(name[1]);
    }
  }
  return names;
}

/** Split on commas that are not inside parentheses — `DECIMAL(18, 2)` must stay one part. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Column names this migration inserts an `__mj.EntityField` row for.
 *
 * Read from the VALUES list by position of `[Name]` in the column list, because that is the shape
 * CodeGen emits and the only one that distinguishes the field's name from its DisplayName.
 */
export function findInsertedEntityFieldNames(sql) {
  const code = stripSqlComments(sql);
  const re = /INSERT\s+INTO\s+\S*\[?EntityField\]?\s*\(([^)]*)\)\s*VALUES\s*\(/gi;
  const names = [];
  for (const m of code.matchAll(re)) {
    const cols = m[1].split(',').map((c) => c.trim().replace(/[[\]]/g, '').toLowerCase());
    const nameIdx = cols.indexOf('name');
    if (nameIdx === -1) continue;
    const open = code.indexOf('(', m.index + m[0].length - 1);
    const close = matchingParen(code, open);
    if (close === -1) continue;
    const values = splitTopLevel(code.slice(open + 1, close));
    const raw = values[nameIdx];
    if (raw === undefined) continue;
    const lit = raw.trim().match(/^N?'([^']*)'$/);
    if (lit) names.push(lit[1]);
  }
  return names;
}

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}
```

Then, inside `classifyMigration`, **after** the existing `if (ddl.length && !generated)` block (so a
migration shipping no output at all still gets the clearer whole-file message first, not two
overlapping ones), add:

```js
  // The PARTIAL case the all-or-nothing check above cannot see: this file DID ship CodeGen output,
  // so `generated` is true, but a column it added has no EntityField row in it. That is #201 --
  // V202609091600 shipped views, procedures and indexes and no field rows, and every Form Response
  // save failed on a host until V202609121200 repaired it three days later.
  if (generated) {
    const reason = findCodeGenNoneReason(sql) ?? '';
    const inserted = new Set(findInsertedEntityFieldNames(sql).map((n) => n.toLowerCase()));
    const uncovered = [...new Set(findAddedColumns(sql))].filter(
      (c) => !inserted.has(c.toLowerCase()) && !new RegExp(`\\b${c}\\b`).test(reason),
    );
    if (uncovered.length && !OUTPUT_SHIPPED_LATER.has(path.basename(relPath))) {
      violations.push(
        `${relPath}: adds ${uncovered.join(', ')} but ships no INSERT INTO __mj.EntityField naming ` +
          `${uncovered.length > 1 ? 'those columns' : 'that column'}. The host runs only migrations, ` +
          `so a column with no EntityField row is unwritable there — BaseEntity.Set on it is a silent ` +
          `no-op and the save reports success having written nothing. Append CodeGen's EntityField ` +
          `INSERT for ${uncovered.length > 1 ? 'each' : 'it'}, or state why none is needed: ` +
          `\`-- ${CODEGEN_NONE_MARKER}: <reason naming the column>\`.`,
      );
    }
  }
```

Add the third `OUTPUT_SHIPPED_LATER` entry, with the reason recorded the way the existing two are:

```js
  // Added FormDistribution.AllowDeviceResume and FormResponse.FormDistributionID, shipped views,
  // procedures and indexes for both, and no EntityField row for either -- so `generated` was true
  // and the all-or-nothing check passed while every Form Response save failed on a host (#201).
  // V202609121200 ships all four rows (the two columns, AllowedOrigins, and the virtual
  // FormDistribution field), each guarded on the natural key, with Sequence computed as MAX+1.
  ['V202609091600__v0.12.x__Resume_Own_Response.sql',
   'V202609121200__v0.12.x__Distribution_Allowed_Origins.sql'],
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npm run lint:codegen-append:test
```

Expected: PASS, every test.

- [ ] **Step 6: Prove the new check does not fire on shipped history**

```bash
npm run lint:codegen-append
```

Expected: exit 0. If it names a shipped migration other than `V202609091600`, **stop and report** — do not add it to `OUTPUT_SHIPPED_LATER` to quiet it. That map is for a migration whose output demonstrably shipped in a named later file, and the gate verifies that claim; using it as a mute button is the failure the file's own header warns about.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-codegen-append.mjs scripts/check-codegen-append.spec.mjs
git commit -m "fix(gates): a column add must ship the EntityField row that names it

The condition was \`ddl.length && !generated\`, so the gate fired only when a
migration shipped no CodeGen output at all. V202609091600 shipped views,
procedures and indexes and no EntityField rows for the two columns it added --
\`generated\` was true, the gate passed, and every Form Response save failed on
every migrations-only host until V202609121200 repaired it three days later.

Refs #201"
```

---

## Task 2: Gate — a foreign-key column add must ship its `EntityRelationship` row

**Files:**
- Modify: `scripts/check-codegen-append.mjs`
- Test: `scripts/check-codegen-append.spec.mjs`

**Interfaces:**
- Consumes: `findAddedColumns` from Task 1.
- Produces: `export function findAddedForeignKeyColumns(sql)` → `string[]`.

**Why this is a separate check from Task 1.** The `EntityField` row makes the column *writable*. The `EntityRelationship` row makes the related-records collection *exist*. `V202609121200` shipped the first and not the second, which is why a host at `next` today has the field and no relationship — Task 1's check would have passed that file. They fail independently, so they are checked independently.

- [ ] **Step 1: Write the failing tests**

```js
test('findAddedForeignKeyColumns names a column whose ADD carries a REFERENCES clause', () => {
  const sql = `ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL REFERENCES [\${flyway:defaultSchema}].[FormDistribution]([ID]);`;
  assert.deepEqual(findAddedForeignKeyColumns(sql), ['FormDistributionID']);
});

test('findAddedForeignKeyColumns also catches the separate ADD CONSTRAINT … FOREIGN KEY form', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL;
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD CONSTRAINT FK_FormResponse_FormDistributionID
      FOREIGN KEY ([FormDistributionID]) REFERENCES [\${flyway:defaultSchema}].[FormDistribution]([ID]);
  `;
  assert.deepEqual(findAddedForeignKeyColumns(sql), ['FormDistributionID']);
});

test('a migration adding an FK column with an EntityField row but no EntityRelationship is a violation', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL
      REFERENCES [\${flyway:defaultSchema}].[FormDistribution]([ID]);
    -- CodeGen output (appended)
    CREATE OR ALTER VIEW [\${flyway:defaultSchema}].[vwFormResponses] AS SELECT * FROM x;
    INSERT INTO [\${mjSchema}].[EntityField] ([ID],[EntityID],[Sequence],[Name])
    VALUES ('a','b',1,'FormDistributionID')
  `;
  const v = classifyMigration('migrations/V209901010000__test.sql', sql, { isNew: true });
  assert.equal(v.length, 1);
  assert.match(v[0], /EntityRelationship/);
  assert.match(v[0], /FormDistributionID/);
});

test('it passes once the EntityRelationship insert is present', () => {
  const sql = `
    ALTER TABLE [\${flyway:defaultSchema}].[FormResponse] ADD [FormDistributionID] UNIQUEIDENTIFIER NULL
      REFERENCES [\${flyway:defaultSchema}].[FormDistribution]([ID]);
    -- CodeGen output (appended)
    CREATE OR ALTER VIEW [\${flyway:defaultSchema}].[vwFormResponses] AS SELECT * FROM x;
    INSERT INTO [\${mjSchema}].[EntityField] ([ID],[EntityID],[Sequence],[Name])
    VALUES ('a','b',1,'FormDistributionID')
    INSERT INTO [\${mjSchema}].[EntityRelationship] ([ID],[EntityID],[RelatedEntityID],[RelatedEntityJoinField])
    VALUES ('c','d','e','FormDistributionID')
  `;
  assert.deepEqual(classifyMigration('migrations/V209901010000__test.sql', sql, { isNew: true }), []);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm run lint:codegen-append:test
```

Expected: FAIL — `findAddedForeignKeyColumns is not a function`.

- [ ] **Step 3: Implement**

```js
/**
 * Columns added in this migration that are foreign keys, in either spelling: the inline
 * `… REFERENCES …` on the column, or a separate `ADD CONSTRAINT … FOREIGN KEY (col)`.
 *
 * Only columns THIS migration adds count. A constraint added over a pre-existing column is a
 * different change and its relationship, if it needed one, was owed by the migration that added it.
 */
export function findAddedForeignKeyColumns(sql) {
  const code = stripSqlComments(sql);
  const added = new Set(findAddedColumns(code).map((c) => c.toLowerCase()));
  const fks = new Set();

  const inline = new RegExp(
    String.raw`\bALTER\s+TABLE\s+${APP_SCHEMA}\s*\.\s*\[?\w+\]?\s+ADD\s+\[?(\w+)\]?[^;]*?\bREFERENCES\b`, 'gi');
  for (const m of code.matchAll(inline)) fks.add(m[1].toLowerCase());

  for (const m of code.matchAll(/\bFOREIGN\s+KEY\s*\(\s*\[?(\w+)\]?\s*\)/gi)) fks.add(m[1].toLowerCase());

  return findAddedColumns(code).filter((c) => added.has(c.toLowerCase()) && fks.has(c.toLowerCase()));
}
```

And in `classifyMigration`, inside the same `if (generated)` block added in Task 1, after the
`uncovered` check:

```js
    // The relationship is a SECOND obligation, not the same one. V202609121200 shipped every
    // EntityField row and no EntityRelationship, so a host at `next` has the field and no
    // related-records collection: nothing bundles in the API and nothing renders on the form (#201).
    const joinFields = new Set(
      [...stripSqlComments(sql).matchAll(
        /INSERT\s+INTO\s+\S*\[?EntityRelationship\]?[\s\S]{0,2000}?\bVALUES\b[\s\S]{0,2000}?'(\w+)'\s*[,)]/gi,
      )].map((m) => m[1].toLowerCase()),
    );
    const relatedText = stripSqlComments(sql);
    const unlinked = findAddedForeignKeyColumns(sql).filter(
      (c) => !new RegExp(String.raw`\[?EntityRelationship\]?[\s\S]{0,3000}?\b${c}\b`, 'i').test(relatedText)
             && !joinFields.has(c.toLowerCase())
             && !new RegExp(`\\b${c}\\b`).test(reason),
    );
    if (unlinked.length && !OUTPUT_SHIPPED_LATER.has(path.basename(relPath))) {
      violations.push(
        `${relPath}: adds the foreign key ${unlinked.join(', ')} but ships no INSERT INTO ` +
          `__mj.EntityRelationship for it. CodeGen mints that row locally and the host never runs ` +
          `CodeGen, so the related-records collection does not exist there — it does not bundle in ` +
          `the API and does not render on the form. Ship the relationship, guarded on ` +
          `(EntityID, RelatedEntityID, RelatedEntityJoinField) and never on its own ID — the id is ` +
          `minted per database (lint:distribution CHECK 4, #64). Or state why none is needed: ` +
          `\`-- ${CODEGEN_NONE_MARKER}: <reason naming the column>\`.`,
      );
    }
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm run lint:codegen-append:test && npm run lint:codegen-append
```

Expected: tests PASS, gate exits 0 on the working tree.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-codegen-append.mjs scripts/check-codegen-append.spec.mjs
git commit -m "fix(gates): an FK column add must ship its EntityRelationship row

V202609121200 shipped every EntityField row the two resume columns needed and
no EntityRelationship, so a host at next has FormResponse.FormDistributionID
and no related-records collection. The field obligation and the relationship
obligation fail independently, so they are checked independently.

Refs #201"
```

---

## Task 3: The repair migration

**Files:**
- Create: `migrations/V202609141900__v0.12.x__Form_Response_Distribution_Metadata.sql`

**Interfaces:** none — SQL only.

- [ ] **Step 1: Read `migrations/README.md` and `V202609121200__v0.12.x__Distribution_Allowed_Origins.sql`.** The second is the file this one completes; match its header voice (what this opens, why this shape, what it is not) and its guard style.

- [ ] **Step 2: Write the migration**

Mint one fresh UUID for the relationship — `uuidgen | tr 'A-Z' 'a-z'` — and use it in place of
`<RELATIONSHIP-UUID>` below. Do **not** reuse `09519E97-…` or `552BEC6E-…`; those are two different
databases' minted ids and neither is portable.

```sql
-- =============================================================================================
-- MJ Forms v0.12.x — the three metadata artifacts a migrations-only host still lacks for
-- FormResponse.FormDistributionID (#201)
-- =============================================================================================
-- V202609121200 repaired the EntityField half of #201: all four rows (AllowDeviceResume,
-- AllowedOrigins, FormDistributionID and the virtual FormDistribution) ship there, guarded on the
-- natural key, and a database built from migrations alone now has 15 EntityField rows against a
-- 15-column vwFormResponses. Measured 2026-09-14 on MJ_I201_Repro — migrations only, never CodeGen.
-- Form Response saves succeed there; the save-capture view-order fallback is gone.
--
-- THREE THINGS CODEGEN STILL DOES THAT NO MIGRATION DOES. Measured on the same database:
--
--   1. The EntityRelationship Form Distributions -> Form Responses (One To Many via
--      FormDistributionID) does not exist. CodeGen minted it on the clean room at 18:20:32,
--      29 seconds after the last migration committed. Without it the related-records collection
--      does not bundle in the API and does not render on the Form Distribution form.
--
--   2. EntityField.RelatedEntityNameFieldMap on FormDistributionID is NULL. This one is an ORDERING
--      defect, not an omission: V202609091600 DOES ship the
--      spUpdateEntityFieldRelatedEntityNameFieldMap call, guarded on a natural-key lookup of the
--      EntityField row -- but that row is created by V202609121200, which sorts THREE DAYS LATER.
--      The lookup returns NULL, the IF skips, and nothing says so. On a developer box CodeGen fills
--      the map in afterwards, which is exactly why nobody saw it. RelatedEntityID,
--      RelatedEntityFieldName and IncludeRelatedEntityNameFieldInBaseView are already correct --
--      they are columns in V202609121200's INSERT. RelatedEntityNameFieldMap is not, and is
--      reachable only through the procedure.
--
--   3. EntityField.Category is NULL on all four of V202609121200's rows. CodeGen does not fill
--      Category -- it is NULL on the CodeGen'd clean room too -- so this one is unauthored rather
--      than un-shipped, and it is why the generated form drops these fields into a generic
--      "Details" section instead of their curated one (related: #180).
--
-- WHY EVERY GUARD HERE IS A SEMANTIC KEY AND NEVER AN ID. The relationship id is minted per
-- database: the 2026-09-14 clean room produced 09519E97-EF0C-407D-AC6A-D2B53E3A89A4 and MJ_ATS_Dev
-- holds the same relationship as 552BEC6E-530C-4011-A08D-C2D36D4E85BC. An
-- `IF NOT EXISTS (… WHERE [ID] = '<literal>')` guard -- the shape CodeGen itself emits -- matches
-- neither and lands a SECOND copy on every database that ran CodeGen. EntityRelationship carries no
-- unique constraint on its natural key to stop that, and a duplicated row makes the next CodeGen run
-- emit a duplicate @FieldResolver so forms-server stops compiling: #64, then #66. That is what
-- `npm run lint:distribution` CHECK 4 exists to refuse, and its watershed sits at 202608211600, so
-- this file is held to it. The literal below is ours, for hosts that have no row at all.
--
-- Sequence is computed as MAX+1 rather than captured, for the reason V202609121200 records at
-- length: a captured value is a statement about the generating database, not a portable one.
-- =============================================================================================

-- ── 1. The relationship ───────────────────────────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityRelationship]
     WHERE [EntityID]              = '1FC60BDA-25B8-473B-ACE5-1238670D3535'
       AND [RelatedEntityID]       = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
       AND [RelatedEntityJoinField] = 'FormDistributionID')
BEGIN
    INSERT INTO [${mjSchema}].[EntityRelationship]
        ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type],
         [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('<RELATIONSHIP-UUID>',
         '1FC60BDA-25B8-473B-ACE5-1238670D3535',  -- Entity:        MJ_BizApps_Forms: Form Distributions
         '63600739-7165-4BDC-B7D7-19A1B1951DFA',  -- RelatedEntity: MJ_BizApps_Forms: Form Responses
         'FormDistributionID',
         'One To Many',
         1,
         1,
         (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityRelationship]
           WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'),
         GETUTCDATE(), GETUTCDATE());
END
GO

-- ── 2. The related-entity name-field map ──────────────────────────────────────────────────────
-- V202609091600's copy of this call was a no-op: it sorts before the migration that creates the row
-- it looks up. Here the row is guaranteed -- V202609121200 sorts before this file -- so a NULL
-- lookup means something is wrong with the chain, and this raises instead of skipping. A guard that
-- turns a missing prerequisite into silence is what produced this defect in the first place.
DECLARE @FormResponseDistributionFieldID UNIQUEIDENTIFIER = (
    SELECT ef.[ID]
      FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = ef.[EntityID]
     WHERE e.[Name]  = N'MJ_BizApps_Forms: Form Responses'
       AND ef.[Name] = N'FormDistributionID');

IF @FormResponseDistributionFieldID IS NULL
    THROW 51201, N'#201: no EntityField row for MJ_BizApps_Forms: Form Responses.FormDistributionID. V202609121200 must have applied before this migration.', 1;

EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap]
     @EntityFieldID             = @FormResponseDistributionFieldID,
     @RelatedEntityNameFieldMap = 'FormDistribution';
GO

-- ── 3. The curated categories ─────────────────────────────────────────────────────────────────
-- `AND [Category] IS NULL` so a host that curated its own grouping keeps it; this fills the blank
-- CodeGen leaves, it does not overrule an author. The values match the siblings already on each
-- entity: CaptchaRequired and PublicLinkToken are 'Access and Limits', FormID and FormVersionID are
-- 'Form & Status'.
UPDATE [${mjSchema}].[EntityField]
   SET [Category] = N'Access and Limits'
 WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'
   AND [Name] IN (N'AllowDeviceResume', N'AllowedOrigins')
   AND [Category] IS NULL;

UPDATE [${mjSchema}].[EntityField]
   SET [Category] = N'Form & Status'
 WHERE [EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
   AND [Name] IN (N'FormDistributionID', N'FormDistribution')
   AND [Category] IS NULL;
GO
```

- [ ] **Step 3: Apply it to a migrations-only clone and verify all three writes**

`MJ_I201_Repro` already exists: a restored clone of the migrations-only `MJ_Forms_SeedProof2_v012`,
brought to `next`'s frontier by `mj migrate` and nothing else. It is disposable — it is **not**
`MJ_ATS_Dev`, and nothing else is using it.

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms
DB_DATABASE=MJ_I201_Repro ./node_modules/.bin/mj migrate \
  --schema __mj_BizAppsForms \
  --dir /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-201/migrations
```

Expected: `1 applied`, no errors. Then verify — a SQL helper is already written at
`/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/e2863f40-8508-439e-8879-dc01c529e8b7/scratchpad/issue-201/sql.mjs`
(usage: `TARGET_DB=<db> node sql.mjs <file.sql>`):

```sql
SELECT 'relationship (want 1)' AS check_name, CAST(COUNT(*) AS NVARCHAR(40)) AS result
  FROM __mj.EntityRelationship
 WHERE EntityID='1FC60BDA-25B8-473B-ACE5-1238670D3535'
   AND RelatedEntityID='63600739-7165-4BDC-B7D7-19A1B1951DFA'
   AND RelatedEntityJoinField='FormDistributionID'
UNION ALL SELECT 'name-field map (want FormDistribution)',
  ISNULL((SELECT RelatedEntityNameFieldMap FROM __mj.EntityField
           WHERE EntityID='63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name='FormDistributionID'),'<NULL>')
UNION ALL SELECT 'categories (want no <NULL>)',
  (SELECT STRING_AGG(ISNULL(Category,'<NULL>'),', ') FROM __mj.EntityField f
     JOIN __mj.Entity e ON e.ID=f.EntityID
    WHERE e.SchemaName='__mj_BizAppsForms'
      AND f.Name IN ('AllowDeviceResume','AllowedOrigins','FormDistributionID','FormDistribution'));
```

Expected: `1`, `FormDistribution`, and four non-NULL categories.

- [ ] **Step 4: Prove it is idempotent — apply it a second time**

Re-running Skyway will not re-apply an applied version, so run the file's body directly a second
time against the same database (paste it into a scratch `.sql` and run it through the helper). The
relationship count must still be **1**, not 2. This is the #64 failure this file's guard exists to
prevent; assert it rather than assuming it.

- [ ] **Step 5: Run every gate the migration must satisfy**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-201
npm run lint:distribution && npm run lint:migrations && npm run lint:codegen-append
```

Expected: all three exit 0. `lint:distribution` CHECK 4 is the one that rules on the guard shape and
CHECK 2 on the placeholders; if either fails, fix the migration — never the gate.

- [ ] **Step 6: Commit**

```bash
git add migrations/V202609141900__v0.12.x__Form_Response_Distribution_Metadata.sql
git commit -m "fix(migrations): ship the relationship, name-field map and categories a host never gets

V202609121200 repaired the EntityField half of #201 and Form Response saves
succeed on a migrations-only host again. Three artifacts downstream of those
rows still only exist where CodeGen ran: the Form Distributions -> Form
Responses relationship, the RelatedEntityNameFieldMap on FormDistributionID,
and the Category on all four new fields.

The name-field map is an ordering defect worth naming: V202609091600 ships the
call already, guarded on a lookup of a row that V202609121200 creates three days
later in the sort order. The guard was written to be safe and made the failure
silent instead. This one throws on a missing prerequisite.

Every guard is a semantic key -- the relationship id is minted per database
(#64, lint:distribution CHECK 4).

Closes #201"
```

---

## Task 4: Changeset

**Files:**
- Create: `.changeset/<two-or-three-word-name>.md`

- [ ] **Step 1: Write it**

`minor`, mechanically, because this PR touches `migrations/**.sql` — see
`.claude/rules/changesets.md`. Do not reason about blast radius.

```markdown
---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Ship the metadata a host only ever got from CodeGen

A host installs MJ Forms by running migrations, and never runs CodeGen against
`__mj_BizAppsForms`. Three artifacts for `FormResponse.FormDistributionID` were
therefore missing on every installed host: the Form Distributions → Form
Responses relationship (so the related-records collection neither bundled in the
API nor rendered on the form), the related-entity name-field map, and the
curated `Category` on the four fields V202609121200 added.

The gate that should have caught the original defect now checks the partial
case: a migration that adds a column must ship the `EntityField` row naming it,
and one that adds a foreign key must ship its `EntityRelationship` row.
```

Match the package list to `.changeset/`'s existing files — copy the four names from a recent one
rather than typing them from memory.

- [ ] **Step 2: Run the full suite before claiming anything**

```bash
cd /Users/sohamdesai/Projects/mj-dev/bizapps-forms/.claude/worktrees/issue-201
npm run lint:codegen-append && npm run lint:codegen-append:test \
  && npm run lint:distribution && npm run lint:migrations
```

Expected: all green. Report the actual output — do not summarise it as "passing" without it.

- [ ] **Step 3: Commit**

```bash
git add .changeset
git commit -m "chore(changeset): minor — this ships a migration

Refs #201"
```

---

## Self-Review notes for the executor

- **The `EntityField` rows already ship.** If you find yourself writing an `INSERT INTO EntityField`
  for `AllowDeviceResume`, `AllowedOrigins`, `FormDistributionID` or `FormDistribution`, stop — you
  have re-derived the 2026-09-14 comment's mistake. Re-read Investigation §1 and §2.
- **Never guard a core-metadata INSERT on its own ID.** `lint:distribution` CHECK 4 will refuse it,
  and it is right to.
- **Do not touch `MJ_ATS_Dev`.** It is the shared dev database MJ's host serves from the main
  checkout. `MJ_I201_Repro` is the disposable one.
- **Do not run `mj codegen`.** This PR ships no regenerated TypeScript, and regenerating from the
  shared DB reverts merged fixes from other branches.
