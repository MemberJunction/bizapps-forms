# Issue #156 — Adopt MJ 6.1's `IsHierarchy` opt-in

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MJ_BizApps_Forms: Form Categories` and `MJ_BizApps_Forms: Forms` readable again by
seeding MJ 6.1's `EntityField.Configuration → Hierarchy.IsHierarchy` opt-in, and by shipping a
corrective migration that brings every host's base views, TVFs and entity metadata to the shape
post-gate CodeGen produces.

**Architecture:** Three artifacts that must agree — a declarative metadata seed (source of truth
for the release push), a corrective migration (the only thing that reaches a host), and the
committed generated TypeScript (must match what CodeGen emits from the seeded metadata).

**Tech Stack:** SQL Server T-SQL / Skyway migrations, MJ CodeGen 6.1.0-edge.5, mj-sync JSON,
TypeScript.

**Spec:** https://github.com/MemberJunction/bizapps-forms/issues/156 (plus its two comments).

---

## Global Constraints

- Schema: `__mj_BizAppsForms`. Entity-name prefix `MJ_BizApps_Forms: `.
- Shipped SQL may reference **only** `${flyway:defaultSchema}` and `${mjSchema}` placeholders.
- `migrations/` is flat and append-only. **Never edit a merged migration** (the one documented
  exception — a file that cannot apply at all — does not apply here).
- Hardcoded UUIDs in migrations; no `__mj_*` timestamp columns by hand; no FK indexes by hand.
- Entity ids are resolved **by natural key**, never by a captured literal (issue #155, PR #163).
- Metadata seeding is release work: the PR contributes declarative JSON with **no `sync` block**
  and **no `*__Metadata_Sync.sql`**.
- Changeset level: **`minor`** — this PR ships both a migration and metadata
  (`.claude/rules/changesets.md`).
- No hand-editing of generated files is normally allowed; the one deliberate exception here is
  documented in Task 3 (a full `mj codegen` file run is issue #159's scope and would relayout
  every generated file in the repo).

---

## Established facts (verified 2026-09-04, do not re-derive)

Clean-room database `MJ_Forms_156` on `localhost:1455` (core → common → tasks → forms, restored
from `/var/opt/mssql/data/issue156_forms_premigrate.bak`, which is the **pre-CodeGen** state).

1. **Migrations ship the pre-gate shape.** Straight after `mj migrate`, `vwFormCategories` has
   `RootParentID` at column 11 and `vwForms` has `RootTemplateSourceFormID`.
2. **The first `mj codegen` drops both** and leaves their `EntityField` rows behind, which is the
   "unreadable entity" state the issue reports, reproduced verbatim including
   `Integrity check FAILED: entityFieldsSequenceCheck … position 11`.
3. **Seeding `IsHierarchy: true` on `FormCategory.ParentID` restores more than `RootParentID`.**
   Post-gate CodeGen emits **five** view columns and **four** TVFs per hierarchy field:
   - columns: `RootParentID`, `ParentIDDepth`, `ParentIDPath`, `ParentIDIsLeaf`,
     `ParentIDChildCount` (sequences 11–15)
   - TVFs: `fnFormCategoryParentID_GetHierarchyMeta` / `_GetDescendants` / `_GetAncestors` /
     `_GetRootID`
4. **Two CodeGen passes are required** (MJ's own `V202608201800` says so): pass 1 writes the
   views/TVFs, pass 2 registers the four new virtual `EntityField` rows.
5. **CodeGen never removes the stale `RootTemplateSourceFormID` row.** `spDeleteUnneededEntityFields`
   scoped to the Forms entity does — verified.
6. **`fnFormTemplateSourceFormID_GetRootID` is orphaned** once `vwForms` stops referencing it.
   MJ shipped `V202608302030` for exactly this case (a dangling module breaks Azure SQL bacpac
   export).
7. With all of the above applied, a third `mj codegen --skipfiles` run is a **no-op**: no
   unreadable fields, integrity checks pass, and the hierarchy columns compute correctly
   (`RootParentID` walks a two-level tree to its root; Depth 0/1; Path `/root/`, `/root/child/`;
   IsLeaf false/true; ChildCount 1/0).

**Harvested CodeGen output** (the exact SQL to ship), in
`/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/d7418121-7ab3-4d68-af52-0c91551bd25f/scratchpad/issue-156/`:

| file | what it holds |
|---|---|
| `run-pass1.sql` | the 4 TVFs, `vwFormCategories` + permissions, `spCreate/Update/DeleteFormCategory`, `vwForms` + permissions, `spCreate/Update/DeleteForm` |
| `run-pass2.sql` | the 4 `EntityField` INSERT blocks (`ParentIDDepth` 12, `ParentIDPath` 13, `ParentIDIsLeaf` 14, `ParentIDChildCount` 15) with their captured UUIDs, plus a re-emit of the pass-1 Form Categories objects |
| `codegen-before.log` | the reproduction (2 unreadable fields + the sequence-check failure) |
| `codegen-pass3.log` | the clean run after the fix |

---

## The `TemplateSourceFormID` decision — settled, `IsHierarchy: false`

Recorded here because the issue left it open and the consequence is a public surface change.

`Form.TemplateSourceFormID` is **not** a tree. Its own migration
(`V202608211600`, header) says so: it is set on the **template** row and points at the form it was
saved *from*, and is *"deliberately NOT set on forms created from a template"* because such a link
*"would read as 'this form follows that template', which is false"*. It is a one-hop provenance
pointer — the same class as the `MergedIntoID` / `PreviousVersionID` fields MJ's
`RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md` §1.2 names as exactly what the gate exists to
suppress.

Seeding it `true` would be worse than a no-op: it adds four more columns to the public surface and
puts a recursive-CTE `OUTER APPLY` on `vwForms` — the hottest view in the app, read on every form
load — to answer a question about a link that never chains.

So: seed `false`, record the negative decision explicitly (the `bizapps-tasks` precedent for
`Tasks.ParentID`), and remove `RootTemplateSourceFormID` from the view, the metadata and the
generated classes.

---

## File structure

| file | responsibility |
|---|---|
| `metadata/entities/.mj-sync.json` | new — declares this directory pushes `MJ: Entities` |
| `metadata/entities/.entity-field-hierarchy-configurations.json` | new — the two opt-in decisions |
| `metadata/.mj-sync.json` | modified — add `entities` to `directoryOrder` |
| `migrations/V202609050300__v0.12.x__Hierarchy_Opt_In.sql` | new — the only thing that reaches a host |
| `packages/Entities/src/generated/entity_subclasses.ts` | modified — 4 properties added, 1 removed |
| `packages/Server/src/generated/generated.ts` | modified — same |
| `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsFormCategory/*.html` | modified — 4 fields added |
| `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsForm/*.html` | modified — 1 field removed |
| `migrations-pg/README.md` | modified — record why there is no PostgreSQL twin |
| `.changeset/hierarchy-opt-in.md` | new — `minor` |

---

## Task 1: The metadata seed

**Files:**
- Create: `metadata/entities/.mj-sync.json`
- Create: `metadata/entities/.entity-field-hierarchy-configurations.json`
- Modify: `metadata/.mj-sync.json`

**Interfaces:** Produces nothing other tasks consume. The two field decisions it records are the
same two the migration in Task 2 writes; they must not diverge.

- [ ] **Step 1: Create `metadata/entities/.mj-sync.json`**, copying the sibling shape verbatim from
  `/Users/sohamdesai/Projects/mj-dev/bizapps-common/metadata/entities/.mj-sync.json`:

```json
{
  "entity": "MJ: Entities",
  "filePattern": "**/.*.json",
  "pull": {
    "createNewFileIfNotFound": true,
    "newFileName": ".entities.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "ignoreNullFields": true,
    "ignoreVirtualFields": true
  }
}
```

- [ ] **Step 2: Create `metadata/entities/.entity-field-hierarchy-configurations.json`**

Two records. `Configuration` is **native nested JSON, not an escaped string** (the issue's own
comment calls this out). **No `sync` block** — the release push writes those back
(`metadata/README.md`). Use `_comments` to carry the *why*, as the siblings do.

```json
[
  {
    "_comments": [
      "Seeds Hierarchy.IsHierarchy=true in EntityField.Configuration for FormCategory.ParentID.",
      "Form categories are a genuine tree: the builder nests them and scripts/pg-objectmodel-test.mjs",
      "asserts vwFormCategories.RootParentID walks to the root. MJ 6.1.0-edge.3 gated the base-view",
      "hierarchy columns behind this flag, so without this file CodeGen drops RootParentID and every",
      "read of the entity fails with 'Invalid column name' — which a grid renders as 'no data'. #156."
    ],
    "fields": {
      "Name": "MJ_BizApps_Forms: Form Categories"
    },
    "relatedEntities": {
      "MJ: Entity Fields": [
        {
          "fields": {
            "Configuration": {
              "Hierarchy": {
                "IsHierarchy": true
              }
            }
          },
          "primaryKey": {
            "ID": "@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=MJ_BizApps_Forms: Form Categories&Name=ParentID"
          }
        }
      ]
    },
    "primaryKey": {
      "ID": "@lookup:MJ: Entities.Name=MJ_BizApps_Forms: Form Categories"
    }
  },
  {
    "_comments": [
      "Seeds Hierarchy.IsHierarchy=FALSE for Form.TemplateSourceFormID — a deliberate negative,",
      "recorded rather than left ambiguous (the bizapps-tasks precedent for Tasks.ParentID).",
      "V202608211600's header states the link is set on the TEMPLATE row, points at the form it was",
      "saved FROM, and is deliberately never set on forms created from a template. It is a one-hop",
      "provenance pointer, not a tree — the MergedIntoID / PreviousVersionID class MJ's hierarchy",
      "guide names as exactly what the gate suppresses. Seeding true would put a recursive-CTE OUTER",
      "APPLY on vwForms, the view every form load reads, to answer a question that never chains. #156."
    ],
    "fields": {
      "Name": "MJ_BizApps_Forms: Forms"
    },
    "relatedEntities": {
      "MJ: Entity Fields": [
        {
          "fields": {
            "Configuration": {
              "Hierarchy": {
                "IsHierarchy": false
              }
            }
          },
          "primaryKey": {
            "ID": "@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=MJ_BizApps_Forms: Forms&Name=TemplateSourceFormID"
          }
        }
      ]
    },
    "primaryKey": {
      "ID": "@lookup:MJ: Entities.Name=MJ_BizApps_Forms: Forms"
    }
  }
]
```

- [ ] **Step 3: Add `"entities"` to `metadata/.mj-sync.json` `directoryOrder`**, immediately before
  `"entity-permissions"` (both address `MJ: Entities`; the list is documented as
  "a record cannot be created before whatever it looks up").

- [ ] **Step 4: Verify the JSON parses and the gates stay green**

```bash
node -e "JSON.parse(require('fs').readFileSync('metadata/entities/.entity-field-hierarchy-configurations.json','utf8')); JSON.parse(require('fs').readFileSync('metadata/entities/.mj-sync.json','utf8')); JSON.parse(require('fs').readFileSync('metadata/.mj-sync.json','utf8')); console.log('ok')"
npm run check:release-seed
```

Expected: `ok`, and `check:release-seed` reports no *new* uncovered ids (the two records are
addressed by `@lookup`, not by literal UUIDs, so they contribute none).

---

## Task 2: The corrective migration

**Files:**
- Create: `migrations/V202609050300__v0.12.x__Hierarchy_Opt_In.sql`

**Interfaces:**
- Consumes: the harvested CodeGen output named in "Established facts".
- Produces: the database shape Task 3's generated code must match — `vwFormCategories` columns
  1–15 ending `RootParentID, ParentIDDepth, ParentIDPath, ParentIDIsLeaf, ParentIDChildCount`;
  `vwForms` with **no** `Root*` column.

- [ ] **Step 1: Write the header comment.** It must state, in the repo's house voice (see
  `V202609011500` for the register): what MJ changed at 6.1.0-edge.3 and where the gate is; that
  our migrations were captured pre-gate so the shipped view and the metadata behind it disagree;
  that the failure is silent (a grid shows "no data", not an error); the `true` / `false` decisions
  and the reason for each; and that hosts which already ran CodeGen have lost the columns already,
  so this repairs as well as prevents.

- [ ] **Step 2: Section 1 — seed `EntityField.Configuration`.**

Natural-key matched (a host that ran CodeGen before the shipped metadata holds these entities under
ids of its own — `migrations/README.md` CHECK 4, and #155):

```sql
UPDATE ef
   SET ef.[Configuration] = N'{"Hierarchy":{"IsHierarchy":true}}'
  FROM [${mjSchema}].[EntityField] ef
  JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
 WHERE e.[SchemaName] = '${flyway:defaultSchema}'
   AND e.[BaseTable] = 'FormCategory'
   AND ef.[Name] = 'ParentID'
   AND ISNULL(ef.[Configuration], '') <> N'{"Hierarchy":{"IsHierarchy":true}}';
GO
```

…and the `false` twin for `Form` / `TemplateSourceFormID`.

- [ ] **Step 3: Section 2 — the CodeGen output block.** Prefix it with the banner this repo uses
  (`-- CodeGen output (appended)`) and a note naming the two-pass capture. Take verbatim from
  `run-pass1.sql` / `run-pass2.sql`, **Forms entities only** — pass 1 also swept two
  `MJ_BizApps_Common` fields, and shipping those would violate the schema-scope gate and
  `migrations/README.md`. In this order:

  1. the four `fnFormCategoryParentID_*` TVFs (`run-pass1.sql:145–389`)
  2. `vwFormCategories` + its permissions (`run-pass1.sql:391–439`)
  3. `spCreate/spUpdate/spDeleteFormCategory` + permissions (`run-pass1.sql:444–666`)
  4. `vwForms` + its permissions (`run-pass1.sql:667–727`)
  5. `spCreate/spUpdate/spDeleteForm` + permissions (`run-pass1.sql:728–989`)
  6. the four `EntityField` INSERT blocks (`run-pass2.sql:14–266`)

  **One edit to the raw output, the #155 edit:** the INSERT blocks hardcode
  `'43ECBEA3-6CFC-480C-823F-96B5DB201FE7'` as the Form Categories `EntityID`. Replace it with a
  natural-key lookup, exactly as `V202608252340` does on the `fix/155-formscreen-entity-seed`
  branch:

```sql
DECLARE @FormCategoriesEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormCategory' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF @FormCategoriesEntityID IS NULL
    THROW 50156, 'V202609050300: no [Entity] row for FormCategory in this schema. B202606281200 seeds it — run the Forms migrations in order.', 1;
```

  T-SQL variables do not survive a `GO`, so re-declare in each batch that needs one.

- [ ] **Step 4: Section 3 — remove what the gate makes stale.**

```sql
-- The stale RootTemplateSourceFormID row. CodeGen leaves it behind: it scopes
-- spDeleteUnneededEntityFields to entities whose metadata it changed, and Forms' did not change.
-- A NULL id here would be read as "unscoped" and sweep every entity in the database, so the guard
-- is load-bearing, not ceremony (#155).
DECLARE @FormsEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'Form' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF @FormsEntityID IS NULL
    THROW 50156, 'V202609050300: no [Entity] row for Form in this schema.', 1;
DECLARE @FormsEntityIDList NVARCHAR(36) = CONVERT(NVARCHAR(36), @FormsEntityID);
EXEC [${mjSchema}].[spDeleteUnneededEntityFields]
     @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber',
     @EntityIDs=@FormsEntityIDList;
GO

-- The orphaned TVF. Nothing references it once vwForms is regenerated, and a module whose
-- dependencies are gone breaks Azure SQL's bacpac export — MJ shipped V202608302030 for the same
-- shape. Guarded, so a host that never had it is unaffected.
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormTemplateSourceFormID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormTemplateSourceFormID_GetRootID];
GO
```

- [ ] **Step 5: Section 4 — postcondition THROWs.** House convention (`V202608211600:35`,
  `V202609011500`). Assert, and fail loudly if not:
  - `vwFormCategories` produces all five hierarchy columns;
  - `vwForms` produces none named `Root%`;
  - no `EntityField` row named `RootTemplateSourceFormID` survives on the Forms entity;
  - all four `EntityField` rows for the new hierarchy columns exist.

```sql
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[vwFormCategories]')
                 AND name = 'ParentIDChildCount')
    THROW 50156, 'vwFormCategories was not regenerated with the hierarchy columns.', 1;
GO
```

- [ ] **Step 6: Gates**

```bash
npm run lint:migrations
npm run lint:codegen-append
npm run lint:distribution
```

Expected: all pass. `lint:codegen-append` will not demand a CodeGen block (this migration issues no
`CREATE`/`ALTER`/`DROP TABLE`), but the banner is still the honest label for what section 2 is.

- [ ] **Step 7: Apply it to a clean-room database, migrations only, no CodeGen**

This is the test that matters: it proves a *fresh host* gets the right shape from the chain alone.

```bash
# from the worktree
SP=/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-dev-bizapps-forms/d7418121-7ab3-4d68-af52-0c91551bd25f/scratchpad/issue-156
DB_OVERRIDE=master node "$SP/sql.mjs" "
ALTER DATABASE [MJ_Forms_156] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [MJ_Forms_156] FROM DISK='/var/opt/mssql/data/issue156_forms_premigrate.bak'
WITH MOVE 'MJ_Issue155_Base' TO '/var/opt/mssql/data/MJ_Forms_156.mdf',
     MOVE 'MJ_Issue155_Base_log' TO '/var/opt/mssql/data/MJ_Forms_156_log.ldf', REPLACE, RECOVERY;
ALTER DATABASE [MJ_Forms_156] SET MULTI_USER;"
./node_modules/.bin/mj migrate --schema __mj_BizAppsForms --dir ./migrations
```

Expected: `1 applied`, then

```bash
DB_OVERRIDE=MJ_Forms_156 node "$SP/sql.mjs" "
SELECT c.name FROM sys.columns c WHERE c.object_id=OBJECT_ID('__mj_BizAppsForms.vwFormCategories') ORDER BY c.column_id;
SELECT c.name FROM sys.columns c WHERE c.object_id=OBJECT_ID('__mj_BizAppsForms.vwForms') AND c.name LIKE 'Root%';
SELECT ef.Name, ef.Sequence FROM __mj.EntityField ef JOIN __mj.Entity e ON e.ID=ef.EntityID WHERE e.SchemaName='__mj_BizAppsForms' AND e.BaseTable IN ('FormCategory','Form') AND (ef.Name LIKE 'Root%' OR ef.Name LIKE 'ParentID%') ORDER BY ef.Sequence;"
```

Expected: 15 columns ending `ParentIDChildCount`; **zero** `Root%` on `vwForms`; sequences 11–15
present and no `RootTemplateSourceFormID`.

- [ ] **Step 8: Prove the fix holds under CodeGen** — the run that used to break it:

```bash
./node_modules/.bin/mj codegen --skipfiles 2>&1 | grep -iE "unreadable|Integrity check FAILED"
```

Expected: **no output**.

---

## Task 3: The generated-code delta

**Files:**
- Modify: `packages/Entities/src/generated/entity_subclasses.ts`
- Modify: `packages/Server/src/generated/generated.ts`
- Modify: `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsFormCategory/mjbizappsformsformcategory.form.component.html`
- Modify: `packages/Angular/src/lib/generated/Entities/mjBizAppsFormsForm/mjbizappsformsform.form.component.html`
- Modify: `Schema Files/*` if the schema JSON carries these fields

**Interfaces:** Consumes the database shape Task 2 produces. The property names must be exactly
`RootParentID`, `ParentIDDepth`, `ParentIDPath`, `ParentIDIsLeaf`, `ParentIDChildCount`.

**Why hand-applied rather than regenerated:** a full `mj codegen` file run is issue #159's scope —
it relayouts every generated file in the repo onto edge.5's per-schema layout, which would bury
this change and force #159 to be redone. Precedent for a hand-applied generated delta accepted by
`lint:generated` exists on this repo (PR for #122). This is the deliberate exception; say so in the
PR body.

- [ ] **Step 1: `entity_subclasses.ts` — FormCategory.** Next to the existing `RootParentID`
  entries, add four more in the same shape: the Zod schema entries (near line 298) and the
  getter/`Get()` accessors (near line 2146). Types: `ParentIDDepth: number | null`,
  `ParentIDPath: string | null`, `ParentIDIsLeaf: boolean | null`,
  `ParentIDChildCount: number | null`. Match the surrounding JSDoc block format exactly, including
  the `* * SQL Data Type:` lines (`int`, `nvarchar(MAX)`, `bit`, `int` — confirm each against
  `sys.columns` on `MJ_Forms_156`).
- [ ] **Step 2: `entity_subclasses.ts` — Form.** Remove the `RootTemplateSourceFormID` Zod entry
  (near line 1370) and its getter (near line 4829), with their JSDoc.
- [ ] **Step 3: `packages/Server/src/generated/generated.ts`.** Add the four fields beside
  `RootParentID?: string;` (line 606) with the ObjectType decorators the neighbouring virtual
  fields use; remove `RootTemplateSourceFormID?: string;` (line 3658).
- [ ] **Step 4: The two Angular generated HTML files.** Add four `<mj-form-field FieldName="…">`
  blocks beside the existing `RootParentID` one; remove the `RootTemplateSourceFormID` block.
  Copy the surrounding block verbatim and change only the `FieldName` and `Type`.
- [ ] **Step 5: `Schema Files/`** — check whether the schema JSON is tracked and carries these
  fields; update to match if so.

```bash
git ls-files "Schema Files" | head
grep -rn "RootTemplateSourceFormID" "Schema Files" 2>/dev/null | head
```

- [ ] **Step 6: Verify**

```bash
npm run lint:generated
npm run lint:codegen-compat
npm run typecheck
npm run build:packages
```

Expected: all green. A `tsc` error naming a removed property means a non-generated consumer exists —
stop and report it rather than re-adding the property.

---

## Task 4: Changeset and the PostgreSQL note

**Files:**
- Create: `.changeset/hierarchy-opt-in.md`
- Modify: `migrations-pg/README.md`

- [ ] **Step 1: The changeset — `minor`** (ships a migration *and* metadata):

```markdown
---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-server': minor
---

Adopt MJ 6.1's `IsHierarchy` opt-in so Form Categories and Forms stay readable

MJ 6.1.0-edge.3 put base-view `Root*` hierarchy columns behind an `EntityField.Configuration` seed.
Forms never shipped one, so the first `mj codegen` on any host dropped `RootParentID` from
`vwFormCategories` and `RootTemplateSourceFormID` from `vwForms` while their `EntityField` rows
stayed — making every read of both entities fail with `Invalid column name`, which a grid renders as
"no data" rather than an error.

`FormCategory.ParentID` is seeded as a hierarchy and gains the full column set
(`RootParentID`, `ParentIDDepth`, `ParentIDPath`, `ParentIDIsLeaf`, `ParentIDChildCount`).
`Form.TemplateSourceFormID` is seeded as **not** a hierarchy — it is a one-hop provenance pointer —
so `RootTemplateSourceFormID` is removed from `vwForms` and from the generated `FormEntity`.
```

Check the other changesets already on the branch before settling the level
(`.claude/rules/changesets.md`).

- [ ] **Step 2: Add a row to `migrations-pg/README.md`'s "no PostgreSQL twin" table** for this
  migration. The PostgreSQL chain stops at `v0.8.x`, so `TemplateSourceFormID` (v0.11.x) never
  reached it, and the PostgreSQL install is documented as migrations-only with no CodeGen — so
  `root_parentid` in `V202606301400__…CodeGen_Objects.pgonly.sql` is still produced and
  `scripts/pg-objectmodel-test.mjs:88` still passes. State plainly that the day PostgreSQL runs
  CodeGen, it needs this seed too, and that the capture would then move to the five-column shape.

- [ ] **Step 3: Verify**

```bash
npm run lint:distribution
node -e "console.log(require('fs').readFileSync('.changeset/hierarchy-opt-in.md','utf8'))"
```

---

## Task 5: Whole-chain verification (coordinator, after Tasks 1–4)

- [ ] **Step 1:** Restore the pre-CodeGen base, run the full Forms chain, assert the shape
  (Task 2 Step 7).
- [ ] **Step 2:** `mj codegen --skipfiles` twice; assert no unreadable fields and no integrity
  failure on either run.
- [ ] **Step 3:** Functional check — insert a two-level category tree and assert
  `RootParentID` / `ParentIDDepth` / `ParentIDPath` / `ParentIDIsLeaf` / `ParentIDChildCount`;
  delete the rows afterwards.
- [ ] **Step 4:** `npm run build:packages && npm run test:packages && npm run typecheck` plus every
  `lint:*` gate.
- [ ] **Step 5:** Confirm the shared dev database (`MJ_ATS_Dev`) was never written to.

---

## Out of scope, stated so it is a known quantity

- **Regenerating all generated code onto edge.5's per-schema layout** — issue #159, which this
  unblocks. Task 3 is a minimal hand-applied delta, not a regeneration.
- **The PostgreSQL twin** — `migrations-pg/` stops at `v0.8.x` for reasons its README already
  lists; Task 4 Step 2 adds this migration to that list rather than porting it.
- **An upstream MJ `logWarning`** in `detectRecursiveForeignKeys` when an ungated self-FK still has
  a `Root*` `EntityField` row (the issue's "optional upstream nicety"). Worth a small MJ PR; not
  this one.
- **Issue #155** — the clean-room build needs PR #163's `V202608252340` fix to get past the Forms
  chain at all. It was applied *temporarily and uncommitted* for the reproduction and reverted; it
  is not part of this branch.
