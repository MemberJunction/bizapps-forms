-- =============================================================================================
-- MJ Forms v0.11.x — converge the core metadata rows V202608191300 duplicated
-- =============================================================================================
-- WHAT WAS WRONG. `V202608191300__v0.11.x__Element_Parity_Metadata_Backfill.sql` promises in its
-- own header that it is idempotent, and for most of its length it is: the `Entity` block is fenced
-- on a NATURAL key (`BaseTable = 'FormScreen' AND SchemaName = …`) and every `EntityField` insert is
-- guarded `WHERE ID = '<guid>' OR (EntityID = … AND Name = '<field>')`. Seventeen statements are
-- guarded differently — `IF NOT EXISTS (… WHERE [ID] = '<guid>')` and nothing else — and that
-- predicate answers the wrong question. It asks whether THIS ROW has been inserted before; the fact
-- that makes an insert safe is whether THE THING IT DESCRIBES already exists, under whatever id the
-- host happens to have minted for it.
--
-- WHO IS AFFECTED, AND WHY IT IS INVISIBLE UNTIL IT IS NOT. On a fresh install nothing is wrong: the
-- chain ships no CodeGen rows before this point, so each of the seventeen fires exactly once. The
-- damage is confined to hosts that ran `mj codegen` between `V202608182100` (which creates the
-- `FormScreen` table) and `V202608191300` — every developer machine in that window, because running
-- CodeGen after a schema migration is the documented workflow. CodeGen mints the same metadata under
-- ITS OWN guids; the seventeen ID guards then all miss, and every one of them inserts a second copy.
-- None of the three affected tables carries a unique constraint on its natural key upstream
-- (`__mj.EntityFieldValue`, `__mj.EntityRelationship`, `__mj.EntitySetting` — every writer owns
-- idempotency by convention), so the duplicates land silently and the migration reports success.
--
-- THE COST IS NOT COSMETIC — it is issue #66. CodeGen emits one `@FieldResolver` per
-- `EntityRelationship` row, so the duplicated `Forms → Form Screens` relationship makes the NEXT
-- regeneration emit `mjBizAppsFormsFormScreens_FormIDArray` twice, and
-- `packages/Server/src/generated/generated.ts` stops compiling (TS2300 / TS2393). That is why every
-- `mj codegen` run on an affected host ends `ERROR running one or more AFTER commands`: CodeGen's
-- own build step failing on CodeGen's own output. The checked-in generated files predate the
-- duplicate and still compile, so the break materialises only on regeneration — which makes it look
-- like it belongs to whichever branch happened to regenerate, and is how it survived three reviews.
--
-- WHY THIS SHAPE — CONVERGE BY KEEP-LIST, NOT "DELETE THE NEWER ONE". Every delete below names the
-- ids `V202608191300` ships and removes only rows that carry the SAME NATURAL KEY as one of them.
-- The shipped ids win, so a repaired host ends up row-for-row identical to a fresh install rather
-- than merely un-duplicated — the two populations converge instead of diverging in a second way.
-- Three properties follow, and all three are the reason for the shape:
--   • It is a strict NO-OP on a clean database (no sibling to delete) and on a half-cleaned one (the
--     dev host where this was found had already had its `EntityFieldValue` duplicates removed by
--     hand). Nothing here depends on how far a given host got.
--   • It cannot touch host-authored metadata. A delete requires a same-natural-key row from the
--     keep-list to exist; a row describing anything else has no such sibling and is never matched.
--   • It is set-based and order-independent, so it behaves the same whether a host has one duplicate
--     class or all three.
--
-- WHY NOT FIX `V202608191300` IN PLACE. `migrations/README.md`'s append-only rule, and its one
-- documented exception does not apply: that exception is for a file that CANNOT APPLY AT ALL, and
-- this one applies fine — it applies twice. Editing it would also change nothing for the hosts that
-- already ran it, which are the only hosts that have the problem.
--
-- THE CLASS #64 MISSED. `EntitySetting` was not in the issue's sweep (which covered Entity /
-- EntityField / EntityPermission) and is duplicated live: `FieldCategoryInfo` and
-- `FieldCategoryIcons` on the Form Screens entity, one copy from CodeGen and one from the migration,
-- with near-identical values. Verified on the dev database 2026-08-25. The migration's copies are
-- kept, per the convergence rule above.
--
-- Only `${mjSchema}` and `${flyway:defaultSchema}` appear here: this file touches core `__mj` tables
-- exclusively, and reads the Forms schema NAME only to scope its postconditions. Asserts its own
-- postconditions and nothing outside this app's entities.
-- =============================================================================================

-- ── 1. EntityFieldValue — keep the 14 shipped picklist rows, drop same-(EntityFieldID, Value) twins
--
-- Ten of the fourteen are `FormQuestion.QuestionType` values attached to a PRE-EXISTING field whose
-- id is fixed (0A4FF448-…), which is exactly why they duplicated: the field was already there under
-- an id both writers agree on, so CodeGen and the migration both wrote values against it. The other
-- four (ScreenType, MatrixAxis) hang off fields the migration itself introduces, and their inserts
-- carry a companion `AND EXISTS (… EntityField WHERE [ID] = …)` that FAILS on a CodeGen-first host —
-- so those four were skipped rather than duplicated. They are in the keep-list anyway: their delete
-- is a no-op today, and leaving them out would make the list mean something narrower than "the rows
-- this migration ships", which is the only definition that stays true as the file ages.
DECLARE @KeepFieldValues TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @KeepFieldValues (ID) VALUES
    -- FormQuestion.QuestionType (EntityFieldID 0A4FF448-80DF-4D5D-94EC-E315822A1B45)
    ('a3807a5d-b745-4aa1-8c9c-97a37c3f0651'), ('fa2bf74b-24ac-4d96-9f10-27346bab97da'),
    ('dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2'), ('8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47'),
    ('04098387-4e62-4e1f-ae86-cd23a64d2c10'), ('31b4c610-bd86-4eb8-bca1-7928d32bc7e4'),
    ('5586b396-3160-41ee-9957-f6cafc8246b7'), ('38150e25-0f5c-43b1-b583-8d3e678ce2b8'),
    ('d4a3d852-21ca-41e5-977d-6297b1f33b11'), ('9a56b49b-d201-4e20-9a88-2c0fb57e2bfc'),
    -- FormScreen.ScreenType and FormQuestion.MatrixAxis
    ('a2456d01-1dcf-4f55-a6e9-8561f334c910'), ('8a3347c9-b0de-4f78-b376-8416ac8fac42'),
    ('5f0484e2-b2b6-4e5c-9783-e97120b0ee2e'), ('f47fcce7-8640-466d-9117-e919a72f9135');

DELETE efv
FROM [${mjSchema}].[EntityFieldValue] efv
WHERE efv.[ID] NOT IN (SELECT k.ID FROM @KeepFieldValues k)
  AND EXISTS (
        SELECT 1
        FROM [${mjSchema}].[EntityFieldValue] keep
        JOIN @KeepFieldValues k ON k.ID = keep.[ID]
        WHERE keep.[EntityFieldID] = efv.[EntityFieldID]
          AND keep.[Value]         = efv.[Value]);
GO

-- ── 2. EntityRelationship — drop CodeGen's `Forms → Form Screens` row, keep the migration's
--
-- Named by id on both sides rather than expressed as a natural-key sweep, because this is one known
-- row from one known writer and the narrower statement is the more honest one. The `EXISTS` is not
-- decoration: without it, a host that somehow has CodeGen's row and NOT the migration's would lose
-- its only relationship row and the generated `FormScreensArray` field would silently vanish.
DELETE FROM [${mjSchema}].[EntityRelationship]
WHERE [ID] = 'f3063e0c-7b0a-4b29-8f0c-86450e15f6d3'
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship]
              WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395');
GO

-- ── 3. EntitySetting — keep the 2 shipped rows, drop same-(EntityID, Name) twins
--
-- The class #64's sweep did not cover. Both settings are the Explorer form designer's field-category
-- layout for the Form Screens entity; the two copies differ only in whitespace and field ordering,
-- so which one survives is invisible to a user and matters only for convergence with a fresh install.
DECLARE @KeepEntitySettings TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @KeepEntitySettings (ID) VALUES
    ('b2299181-df86-4e81-adaf-6eb05fc8cd34'),   -- FieldCategoryInfo
    ('697cc89e-0c85-4902-831a-b60f80c2fd88');   -- FieldCategoryIcons

DELETE es
FROM [${mjSchema}].[EntitySetting] es
WHERE es.[ID] NOT IN (SELECT k.ID FROM @KeepEntitySettings k)
  AND EXISTS (
        SELECT 1
        FROM [${mjSchema}].[EntitySetting] keep
        JOIN @KeepEntitySettings k ON k.ID = keep.[ID]
        WHERE keep.[EntityID] = es.[EntityID]
          AND keep.[Name]     = es.[Name]);
GO

-- ── Postconditions ────────────────────────────────────────────────────────────────────────────
-- Each asserts the END STATE by natural key, which is deliberately NOT a restatement of the deletes
-- above: a delete can only remove a twin of a row this migration ships, while these fire on ANY
-- duplicate among this app's entities, whatever wrote it. That difference is the whole value — a
-- postcondition that re-tests its own DELETE's predicate passes by construction on every input while
-- reading like protection (the lesson `V202608131600` records at line 273).
--
-- ⚠️ SCOPED TO THIS APP'S ENTITIES, NEVER CORE-WIDE. `__mj` is shared with MJ itself and with every
-- sibling Open App, and none of those tables has a unique natural key upstream — a duplicate
-- elsewhere in core is somebody else's to rule on, and asserting on it would make MJ Forms
-- uninstallable next to an app that has one. The schema is read from `${flyway:defaultSchema}` rather
-- than the literal `__mj_BizAppsForms` so a host that installed Forms under a different schema name
-- is still covered.
--
-- ⚠️ EVERY CONCATENATED COLUMN IS WRAPPED IN `ISNULL`, and not because any of them is nullable
-- today — `Entity.Name`, `EntityField.Name`, `EntityFieldValue.Value`,
-- `EntityRelationship.RelatedEntityJoinField` and `EntitySetting.Name` are all NOT NULL as of
-- MJ 6.1.0-edge, verified on the dev database. It is because these are MJ's tables, not ours, and
-- `NULL + N'x'` is NULL, which `STRING_AGG` then SKIPS: one nullable column upstream and a
-- duplicate group would build a NULL detail line, leaving `@Dup… IS NOT NULL` false and the assert
-- reporting health on the very row it exists to catch. That is the same silent-pass failure this
-- whole migration is about, so it is worth five function calls to make it unreachable by
-- construction rather than by a nullability constraint we do not own.

DECLARE @DupFieldValues NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(d.Detail AS NVARCHAR(MAX)), N'; ')
    FROM (
        SELECT ISNULL(e.[Name],N'?') + N'.' + ISNULL(ef.[Name],N'?') + N' = ''' + ISNULL(efv.[Value],N'?') + N''' (' +
               CAST(COUNT(*) AS NVARCHAR(10)) + N' rows)' AS Detail
        FROM [${mjSchema}].[EntityFieldValue] efv
        JOIN [${mjSchema}].[EntityField] ef ON ef.[ID] = efv.[EntityFieldID]
        JOIN [${mjSchema}].[Entity]      e  ON e.[ID]  = ef.[EntityID]
        WHERE e.[SchemaName] = '${flyway:defaultSchema}'
        GROUP BY e.[Name], ef.[Name], efv.[EntityFieldID], efv.[Value]
        HAVING COUNT(*) > 1
    ) d);

IF @DupFieldValues IS NOT NULL
BEGIN
    DECLARE @DupFieldValuesMsg NVARCHAR(2048) =
        N'MJ Forms: duplicate EntityFieldValue rows survive on a Forms entity — ' + @DupFieldValues +
        N'. A picklist value present twice makes CodeGen emit the same enum member twice and the generated TypeScript stops compiling. This migration converges only the rows V202608191300 ships, so a duplicate reported here came from somewhere else: identify the extra row by (EntityFieldID, Value) and remove whichever copy no migration owns.';
    THROW 51170, @DupFieldValuesMsg, 1;
END
GO

DECLARE @DupRelationships NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(d.Detail AS NVARCHAR(MAX)), N'; ')
    FROM (
        SELECT ISNULL(e.[Name],N'?') + N' → ' + ISNULL(re.[Name],N'?') + N' on ' + ISNULL(er.[RelatedEntityJoinField],N'?') + N' (' +
               CAST(COUNT(*) AS NVARCHAR(10)) + N' rows)' AS Detail
        FROM [${mjSchema}].[EntityRelationship] er
        JOIN [${mjSchema}].[Entity] e  ON e.[ID]  = er.[EntityID]
        JOIN [${mjSchema}].[Entity] re ON re.[ID] = er.[RelatedEntityID]
        WHERE e.[SchemaName] = '${flyway:defaultSchema}'
        -- `Type` is deliberately NOT in the group key, though the row carries one. What breaks is
        -- CodeGen's generated MEMBER NAME, which is built from the related entity and the join field
        -- (`mjBizAppsFormsFormScreens_FormIDArray`) and never from the type — so two rows differing
        -- only in `Type` still collide, and a key that included it would report health on the very
        -- shape it exists to catch.
        GROUP BY e.[Name], re.[Name], er.[EntityID], er.[RelatedEntityID], er.[RelatedEntityJoinField]
        HAVING COUNT(*) > 1
    ) d);

IF @DupRelationships IS NOT NULL
BEGIN
    DECLARE @DupRelationshipsMsg NVARCHAR(2048) =
        N'MJ Forms: duplicate EntityRelationship rows survive on a Forms entity — ' + @DupRelationships +
        N'. CodeGen emits one @FieldResolver per relationship row, so this is issue #66 in its exact original form: the next `mj codegen` will emit a duplicate identifier and forms-server will stop compiling. Remove the extra row before regenerating.';
    THROW 51171, @DupRelationshipsMsg, 1;
END
GO

DECLARE @DupSettings NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(d.Detail AS NVARCHAR(MAX)), N'; ')
    FROM (
        SELECT ISNULL(e.[Name],N'?') + N'.' + ISNULL(es.[Name],N'?') + N' (' + CAST(COUNT(*) AS NVARCHAR(10)) + N' rows)' AS Detail
        FROM [${mjSchema}].[EntitySetting] es
        JOIN [${mjSchema}].[Entity] e ON e.[ID] = es.[EntityID]
        WHERE e.[SchemaName] = '${flyway:defaultSchema}'
        GROUP BY e.[Name], es.[EntityID], es.[Name]
        HAVING COUNT(*) > 1
    ) d);

IF @DupSettings IS NOT NULL
BEGIN
    DECLARE @DupSettingsMsg NVARCHAR(2048) =
        N'MJ Forms: duplicate EntitySetting rows survive on a Forms entity — ' + @DupSettings +
        N'. Which copy MJ reads for a given (EntityID, Name) is unspecified, so the Explorer form designer''s field layout becomes whichever row the query planner returns first. Remove the copy no migration owns.';
    THROW 51172, @DupSettingsMsg, 1;
END
GO
