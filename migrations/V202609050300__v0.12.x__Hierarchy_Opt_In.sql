-- =================================================================================================
-- Adopt MJ 6.1's IsHierarchy opt-in — without it, Form Categories and Forms read as empty
-- =================================================================================================
-- WHAT MJ CHANGED, AND WHERE. Through 6.1.0-edge.2 CodeGen treated every self-referencing foreign
-- key as a tree and gave the entity's base view a hierarchy column for it, unasked. At 6.1.0-edge.3
-- that became an opt-in: `detectRecursiveForeignKeys` in CodeGenLib's `Database/sql_codegen.ts` now
-- also demands `field.IsHierarchy === true`, and `EntityFieldInfo.IsHierarchy` (MJCore's
-- `generic/entityInfo.ts`) reads that out of `__mj.EntityField.Configuration` as
-- `{"Hierarchy":{"IsHierarchy":true}}`. A self-FK with no such row is now a plain pointer and gets
-- no hierarchy view columns, no traversal functions and no entity-class methods. The gate is right:
-- MergedIntoID and PreviousVersionID are self-FKs that never chain, and MJ was hanging a recursive
-- CTE off their base views to answer a question nobody asks of them.
--
-- WHAT IT DID TO US. Every CodeGen block in migrations/ was captured BEFORE that gate existed, so
-- the chain ships base views that HAVE the hierarchy columns and entity metadata that does not know
-- to keep them. The first `mj codegen` run against this schema — ours, or a fork's — regenerates
-- `vwFormCategories` without `RootParentID` and `vwForms` without `RootTemplateSourceFormID`, and
-- leaves both `__mj.EntityField` rows behind. From that moment every read of either entity is a
-- SELECT naming a column the view no longer has.
--
-- AND THE FAILURE IS SILENT, which is the reason this went a release unnoticed. `RunView` comes back
-- `Success: false` with `Invalid column name 'RootParentID'`, and a grid renders a failed view as an
-- empty one — so Form Categories and Forms read as "no data" on a host whose data is perfectly
-- intact. CodeGen does say it out loud ("2 unreadable fields", "Integrity check FAILED:
-- entityFieldsSequenceCheck ... position 11"), but nobody opens a CodeGen log to find out why a grid
-- is empty. See #156.
--
-- THE TWO DECISIONS — deliberately not the same answer.
--
--   FormCategory.ParentID -> IsHierarchy TRUE. Categories are a real tree: the builder nests them,
--   and `scripts/pg-objectmodel-test.mjs` asserts RootParentID walks to the root. Note that this
--   RESTORES MORE than the gate took: post-gate CodeGen emits FIVE view columns and FOUR TVFs per
--   hierarchy field, where the pre-gate run emitted one column and one function. Sequences 11-15 are
--   RootParentID, ParentIDDepth, ParentIDPath, ParentIDIsLeaf, ParentIDChildCount.
--
--   Form.TemplateSourceFormID -> IsHierarchy FALSE, written down rather than left unstated (the
--   bizapps-tasks precedent for Tasks.ParentID does the same). V202608211600's own header settles
--   it: the link lives on the TEMPLATE row, points at the form it was saved FROM, and is
--   deliberately never set on forms created from a template. That is a one-hop provenance pointer —
--   the MergedIntoID class the gate exists to suppress — and seeding it true would be worse than a
--   no-op, hanging a recursive-CTE OUTER APPLY on vwForms, the view every form load reads, to chase
--   a link that never chains. So RootTemplateSourceFormID goes: from the view, and from the metadata.
--
-- THIS REPAIRS AS WELL AS PREVENTS. A host that has already run CodeGen lost the columns when it did;
-- one that has not will lose them the first time it does. Both arrive at the same end state here,
-- because every step is idempotent — the seed is guarded on its own value, the CodeGen block is
-- DROP-then-CREATE, the EntityField inserts are guarded on the natural key, and the two removals are
-- guarded on existence. Section 4 asserts that end state and throws rather than reporting success.
-- =================================================================================================


-- -------------------------------------------------------------------------------------------------
-- 1. The opt-in itself: the two EntityField.Configuration seeds.
-- -------------------------------------------------------------------------------------------------
-- This is the only part of the file that is a DECISION rather than its consequence; everything below
-- is what CodeGen emits once these two rows say what they say. Section 2 ships that output verbatim
-- rather than asking the host to run CodeGen, which it cannot: `mj app install` writes
-- __mj_BizAppsForms into the host's excludeSchemas, so the host's CodeGen never sees our entities.
--
-- Matched on the entity's NATURAL KEY, never on a captured id. A host that ran CodeGen before our
-- metadata seed reached it minted its own `__mj.Entity` ids for these tables, so a literal from this
-- machine matches nothing there and the UPDATE reports success having changed no rows
-- (migrations/README.md CHECK 4, and #155). Matched on SchemaName + BaseTable rather than
-- Entity.Name because the entity-name prefix is host-configurable (`mj.config.cjs`), while the table
-- this app creates is not.
--
-- The JSON is written compact where MJ's own writer pretty-prints it. That is cosmetic and stays
-- that way on purpose: `IsHierarchy` parses the value, MJ's CodeGenLib tests use exactly this
-- compact literal, and a multi-line SQL string literal would carry whatever line endings the
-- checkout happened to have. The release's consolidated Metadata_Sync will later rewrite these two
-- rows in MJ's pretty form; that is a one-time no-op re-write, not a loop, because its version stamp
-- sorts after this file's and neither artifact reads the other's formatting.
UPDATE ef
   SET ef.[Configuration] = N'{"Hierarchy":{"IsHierarchy":true}}'
  FROM [${mjSchema}].[EntityField] ef
  JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
 WHERE e.[SchemaName] = '${flyway:defaultSchema}'
   AND e.[BaseTable] = 'FormCategory'
   AND ef.[Name] = 'ParentID'
   AND ISNULL(ef.[Configuration], '') <> N'{"Hierarchy":{"IsHierarchy":true}}';
GO

-- The negative twin. `false` and "no row at all" mean the same thing to CodeGen, so this row buys no
-- behaviour — it buys the RECORD. An absent Configuration is indistinguishable from an oversight,
-- and the next person to notice that Forms has an ungated self-FK would otherwise have to
-- re-derive the argument in V202608211600's header from scratch, or worse, "fix" it.
UPDATE ef
   SET ef.[Configuration] = N'{"Hierarchy":{"IsHierarchy":false}}'
  FROM [${mjSchema}].[EntityField] ef
  JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
 WHERE e.[SchemaName] = '${flyway:defaultSchema}'
   AND e.[BaseTable] = 'Form'
   AND ef.[Name] = 'TemplateSourceFormID'
   AND ISNULL(ef.[Configuration], '') <> N'{"Hierarchy":{"IsHierarchy":false}}';
GO


-- CodeGen output (appended)
-- -------------------------------------------------------------------------------------------------
-- 2. What post-gate CodeGen emits once section 1 is in place. Do not hand-edit.
-- -------------------------------------------------------------------------------------------------
-- Captured in TWO passes against a clean-room database built from this chain (core -> bizapps-common
-- -> bizapps-tasks -> forms), because one pass is not enough and MJ's own V202608201800 says so:
-- pass 1 rebuilds the views, TVFs and CRUD procedures, and only pass 2 — reading the views pass 1
-- just created — registers the four new virtual EntityField rows. Both passes are reproduced below,
-- pass 1 first, in the order CodeGen emitted them.
--
-- TRIMMED TO THIS APP'S ENTITIES, and that trimming is not tidiness. Both captures also swept
-- MJ_BizApps_Common — a sibling Open App that `mj app install` installs BEFORE us — and shipping
-- those statements would have this migration rewrite another app's metadata on every host that
-- installs Forms. The same hazard `check-distribution-seed.mjs` CHECK 5 exists for, arriving through
-- a different door: not a too-narrow @ExcludedSchemaNames, but a whole statement about a schema we
-- do not own. Also dropped for the same reason: the incidental `__mj.EntityFieldValue` sequence
-- renumbering and the `spUpdate*FromSchema` / `spSetDefaultColumnWidthWhereNeeded` /
-- `spUpdateSchemaInfoFromDatabase` sweeps, all of which speak for whatever schemas the capture box
-- happened to hold.
--
-- ONE EDIT to the raw output, marked at both places it appears: pass 2's EntityField INSERTs hardcode
-- this machine's Form Categories `EntityID`, and its category-info UPDATEs key on the captured
-- EntityField ids — both exactly the #155 defect. Every one of them is resolved by natural key
-- instead.
--
-- ONE ADDITION that is not from either capture, and is labelled where it appears: a guarded INSERT
-- restoring `RootParentID`'s own EntityField row. The capture box still had that row, so CodeGen had
-- no reason to emit it; the hosts this migration exists to repair mostly do not, because MJ core's
-- repeatable `R__RefreshMetadata.sql` sweeps it on every core migrate. Section 2 says why in full.
-- -------------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- Pass 1 — the four traversal TVFs, both base views, and the six CRUD procedures.
-- ---------------------------------------------------------------------------------------------

/* Hierarchy Metadata Function SQL for MJ_BizApps_Forms: Form Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: fnFormCategoryParentID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [FormCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormCategoryParentID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[FormCategory] WHERE [ParentID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[FormCategory] WHERE [ParentID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ_BizApps_Forms: Form Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: fnFormCategoryParentID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [FormCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormCategoryParentID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[FormCategory] WHERE [ParentID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[FormCategory] WHERE [ParentID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ_BizApps_Forms: Form Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: fnFormCategoryParentID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [FormCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormCategoryParentID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[FormCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ_BizApps_Forms: Form Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: fnFormCategoryParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [FormCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[FormCategory]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[FormCategory] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: vwFormCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormCategories]
AS
SELECT
    f.*,
    mjBizAppsFormsFormCategory_ParentID.[Name] AS [Parent],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[FormCategory] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormCategory] AS mjBizAppsFormsFormCategory_ParentID
  ON
    [f].[ParentID] = mjBizAppsFormsFormCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnFormCategoryParentID_GetHierarchyMeta]([f].[ID], [f].[ParentID]) AS hier_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: Permissions for vwFormCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spCreateFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [IconClass],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [IconClass],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spUpdateFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormCategory]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [DisplayRank] = ISNULL(@DisplayRank, [DisplayRank]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormCategory
ON [${flyway:defaultSchema}].[FormCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spDeleteFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormCategory] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: vwForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Forms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Form
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwForms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwForms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwForms]
AS
SELECT
    f.*,
    mjBizAppsFormsFormCategory_CategoryID.[Name] AS [Category],
    mjBizAppsFormsFormStyle_StyleID.[Name] AS [Style],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    mjBizAppsFormsForm_TemplateSourceFormID.[Name] AS [TemplateSourceForm]
FROM
    [${flyway:defaultSchema}].[Form] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormCategory] AS mjBizAppsFormsFormCategory_CategoryID
  ON
    [f].[CategoryID] = mjBizAppsFormsFormCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormStyle] AS mjBizAppsFormsFormStyle_StyleID
  ON
    [f].[StyleID] = mjBizAppsFormsFormStyle_StyleID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_OwnerUserID
  ON
    [f].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_TemplateSourceFormID
  ON
    [f].[TemplateSourceFormID] = mjBizAppsFormsForm_TemplateSourceFormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: Permissions for vwForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spCreateForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateForm]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @StyleID_Clear bit = 0,
    @StyleID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @RenderMode nvarchar(20) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL,
    @IsTemplate bit = NULL,
    @TemplateSourceFormID_Clear bit = 0,
    @TemplateSourceFormID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Form]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [StyleID],
                [Status],
                [OwnerUserID],
                [RenderMode],
                [Settings],
                [IsTemplate],
                [TemplateSourceFormID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@RenderMode, 'Scroll'),
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END,
                ISNULL(@IsTemplate, 0),
                CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Form]
            (
                [Name],
                [Description],
                [CategoryID],
                [StyleID],
                [Status],
                [OwnerUserID],
                [RenderMode],
                [Settings],
                [IsTemplate],
                [TemplateSourceFormID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@RenderMode, 'Scroll'),
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END,
                ISNULL(@IsTemplate, 0),
                CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwForms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spUpdateForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @StyleID_Clear bit = 0,
    @StyleID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @RenderMode nvarchar(20) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL,
    @IsTemplate bit = NULL,
    @TemplateSourceFormID_Clear bit = 0,
    @TemplateSourceFormID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Form]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [StyleID] = CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, [StyleID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [OwnerUserID] = CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, [OwnerUserID]) END,
        [RenderMode] = ISNULL(@RenderMode, [RenderMode]),
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END,
        [IsTemplate] = ISNULL(@IsTemplate, [IsTemplate]),
        [TemplateSourceFormID] = CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, [TemplateSourceFormID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwForms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwForms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Form table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateForm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateForm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateForm
ON [${flyway:defaultSchema}].[Form]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Form]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Form] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spDeleteForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteForm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Form]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];
GO

-- ---------------------------------------------------------------------------------------------
-- Pass 2 — the new virtual EntityField rows, at sequences 11-15, and their category info.
-- ---------------------------------------------------------------------------------------------
-- THE #155 EDIT. CodeGen wrote the capture box's Form Categories entity id as a literal into all
-- four guards and all four VALUES lists; a host that ran CodeGen before our metadata reached it
-- holds this entity under an id of its own, where a literal silently matches nothing and the rows
-- never appear. Resolved by natural key instead, and the resolution is checked: a NULL here would
-- make every guard's `EntityID = NULL` comparison unknown, the NOT EXISTS pass, and the INSERT die
-- on EntityField.EntityID's NOT NULL — a chain halt whose message would say nothing about why.
--
-- Declared once for the whole batch: T-SQL variables do not survive a GO, and there is deliberately
-- no GO between these four inserts.
--
-- Sequences 12-15 are literal because they are what the base view above actually produces — the
-- five hierarchy columns land after `Parent` (10) and `RootParentID` (11). CodeGen's own
-- `+ 100000` sequence-reshuffle preamble is NOT reproduced: it exists to make room when new fields
-- land in the middle of an entity's field list, and these land at the end, so replaying it here
-- would push every Form Categories field past 100000 and leave the integrity check reporting a
-- sequence gap this migration created.
DECLARE @FormCategoriesEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormCategory' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF @FormCategoriesEntityID IS NULL
    THROW 50156, 'V202609050300: no [Entity] row for FormCategory in this schema. B202606281200 seeds it; run the Forms migrations in order.', 1;

-- FIRST, RESTORE `RootParentID` IF THE HOST HAS ALREADY LOST THE ROW ITSELF. This is not in the
-- capture, because on the capture box the row was still there; it is here because on the most common
-- already-broken host it is not, and without it this migration halts on its own postcondition with
-- no forward path.
--
-- The mechanism, which is not obvious and is the whole reason this block exists: MJ core ships
-- `migrations/R__RefreshMetadata.sql`, a Flyway REPEATABLE that re-runs on every single core
-- `mj migrate`. Its line 14 is `EXEC spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'`
-- — UNSCOPED — and line 17 renumbers the survivors. So on any host that ran `mj codegen` (dropping
-- the column) and afterwards ran any core migration, the columnless `RootParentID` row was deleted
-- and Form Categories was renumbered 1..10. Verified: that is the state of this project's shared dev
-- database today.
--
-- This is a RESTORATION, not a fabrication, and the difference is the id. `B202606281200:13220`
-- already ships this row under `abe1e6be-cd00-4cf7-819f-63d3157ec493`; that literal is reused
-- verbatim, with that file's own guard shape, so a host that still has the row keeps it and a host
-- that lost it gets the same row back rather than a second one under a new id. `Sequence` is 11
-- rather than the capture's 100020 for the reason given below — nothing here reshuffles — and
-- DisplayName / Category / GeneratedFormSection are written in the END STATE B202606281200 leaves
-- after its own category-info UPDATE (`:13658`), so a repaired host is byte-identical to a fresh one
-- rather than merely close.
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'abe1e6be-cd00-4cf7-819f-63d3157ec493' OR (EntityID = @FormCategoriesEntityID AND Name = 'RootParentID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [Category],
            [GeneratedFormSection],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abe1e6be-cd00-4cf7-819f-63d3157ec493',
            @FormCategoriesEntityID, -- Entity: MJ_BizApps_Forms: Form Categories
            11,
            'RootParentID',
            'Root Parent',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            'Hierarchy and Sorting',
            'Category',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1b63d1a3-3167-4a4d-b7ef-7aa770c6ddb7' OR (EntityID = @FormCategoriesEntityID AND Name = 'ParentIDDepth')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b63d1a3-3167-4a4d-b7ef-7aa770c6ddb7',
            @FormCategoriesEntityID, -- Entity: MJ_BizApps_Forms: Form Categories
            12,
            'ParentIDDepth',
            'Parent ID Depth',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0cea2d2d-7b85-4190-8921-598494c91a02' OR (EntityID = @FormCategoriesEntityID AND Name = 'ParentIDPath')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0cea2d2d-7b85-4190-8921-598494c91a02',
            @FormCategoriesEntityID, -- Entity: MJ_BizApps_Forms: Form Categories
            13,
            'ParentIDPath',
            'Parent ID Path',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8574d3b7-07f6-4361-9cff-48acbcee8ab5' OR (EntityID = @FormCategoriesEntityID AND Name = 'ParentIDIsLeaf')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8574d3b7-07f6-4361-9cff-48acbcee8ab5',
            @FormCategoriesEntityID, -- Entity: MJ_BizApps_Forms: Form Categories
            14,
            'ParentIDIsLeaf',
            'Parent ID Is Leaf',
            NULL,
            'bit',
            1,
            1,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '581413ec-931f-4663-a2f4-432711d944b0' OR (EntityID = @FormCategoriesEntityID AND Name = 'ParentIDChildCount')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '581413ec-931f-4663-a2f4-432711d944b0',
            @FormCategoriesEntityID, -- Entity: MJ_BizApps_Forms: Form Categories
            15,
            'ParentIDChildCount',
            'Parent ID Child Count',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;


-- The category info for those same four fields. Same batch, so @FormCategoriesEntityID is still in
-- scope, and the SAME #155 EDIT: CodeGen keys each UPDATE on the captured EntityField id, which
-- matches nothing on a host that minted its own.
--
-- These are not cosmetic and they cannot be left to the host's next CodeGen run. Without them the
-- four fields carry Category NULL and GeneratedFormSection 'Details', so Explorer's generated form
-- files them under Details while `Parent` and `RootParentID` sit under 'Hierarchy and Sorting' —
-- and CodeGen will never revisit them, because it only rewrites category info for entities whose
-- metadata it changed on that run, and after this migration nothing changes. `B202606281200:13658`
-- ships exactly this block for `RootParentID`, so this is the established shape.
--
-- DELIBERATELY OMITTED, so the trim does not read as a truncated capture: the sibling category-info
-- blocks the same pass emitted for the fields that ALREADY have correct category info
-- (`Description`, `IconClass`, `IsActive`, `ParentID`, `DisplayRank`, `Parent`, `RootParentID`).
-- Two of those would RENAME a shipped display name — `Parent` from 'Parent Name' to 'Parent', and
-- `RootParentID` from 'Root Parent' to 'Root Parent ID'. That is 6.1.0-edge.5 CodeGen naming churn,
-- unrelated to the hierarchy gate, and it belongs to the wholesale regeneration in #159. Re-shipping
-- category info that B202606281200 already got right is churn, not repair.

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ParentIDDepth 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Depth',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   EntityID = @FormCategoriesEntityID AND [Name] = 'ParentIDDepth' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ParentIDPath 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Path',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   EntityID = @FormCategoriesEntityID AND [Name] = 'ParentIDPath' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ParentIDIsLeaf 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Leaf',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   EntityID = @FormCategoriesEntityID AND [Name] = 'ParentIDIsLeaf' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ParentIDChildCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Child Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   EntityID = @FormCategoriesEntityID AND [Name] = 'ParentIDChildCount' AND AutoUpdateCategory = 1;
GO


-- -------------------------------------------------------------------------------------------------
-- 3. Remove what the gate makes stale. CodeGen will not do either of these for us.
-- -------------------------------------------------------------------------------------------------
-- The orphaned `RootTemplateSourceFormID` metadata row. Section 2 rebuilt `vwForms` without that
-- column, but its `__mj.EntityField` row survives, and a virtual field with no column behind it is
-- precisely the unreadable-entity state this migration exists to end — the same shape, just pointing
-- the other way. CodeGen never clears it: it scopes `spDeleteUnneededEntityFields` to the entities
-- whose metadata it changed on that run, and turning a hierarchy OFF changes nothing it counts.
--
-- The @EntityIDs scope is load-bearing, not ceremony. That parameter defaults to NULL and NULL means
-- UNSCOPED — the proc would then walk every entity in the host's database and delete any field row
-- it could not match to a view, including entities belonging to apps we have never heard of. So the
-- id is resolved by natural key (#155) and asserted before it is used. That guard plus @EntityIDs is
-- the ENTIRE safety of this call. @ExcludedSchemaNames is the baseline `check-distribution-seed.mjs`
-- CHECK 5 requires of shipped SQL, both case spellings included, and it is here because the gate
-- requires it — not because it would save us: it names no `${mjSchema}_BizAppsOrders`, no Open App
-- nobody here has heard of, and no host-owned schema beyond `dbo` and `staging`. An unscoped call would still
-- delete other apps' field metadata straight through this list.
--
-- Exactly one row qualifies today. `vwForms` carries the Form table's thirteen columns plus Category,
-- Style, OwnerUser and TemplateSourceForm — sequences 1-17 — and RootTemplateSourceFormID at 18 is
-- the only field row with nothing behind it.
DECLARE @FormsEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'Form' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF @FormsEntityID IS NULL
    THROW 50156, 'V202609050300: no [Entity] row for Form in this schema. B202606281200 seeds it; run the Forms migrations in order.', 1;
DECLARE @FormsEntityIDList NVARCHAR(36) = CONVERT(NVARCHAR(36), @FormsEntityID);
EXEC [${mjSchema}].[spDeleteUnneededEntityFields]
     @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber',
     @EntityIDs=@FormsEntityIDList;
GO

-- The orphaned traversal function. `fnFormTemplateSourceFormID_GetRootID` is what pre-gate CodeGen
-- emitted for TemplateSourceFormID; the rebuilt `vwForms` was the only thing that referenced it, and
-- nothing replaces it, because the field is not a hierarchy. It is UNUSED, not broken — it reads
-- `[Form]`, which this migration leaves intact, so it would still execute — and it is dropped because
-- no CodeGen run will ever recreate or maintain it now that the gate says this field is not a tree,
-- which makes it a function that outlives the decision that produced it. MJ shipped V202608302030 to
-- drop an orphaned hierarchy TVF for the same reason (its bacpac argument is not borrowed here: that
-- one's TABLE was gone). Guarded on existence, so a host built after the gate is unaffected.
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormTemplateSourceFormID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormTemplateSourceFormID_GetRootID];
GO


-- -------------------------------------------------------------------------------------------------
-- 4. Postconditions. The bug this migration fixes is one that reports success, so this file must not.
-- -------------------------------------------------------------------------------------------------
-- Each assertion reads the END STATE out of the database rather than trusting that the statements
-- above ran, and each halts the chain rather than leaving a host in the half-repaired state that is
-- indistinguishable, from the UI, from the one we started in.

-- The five hierarchy columns on the base view. Counted rather than tested one at a time, so a
-- partial regeneration cannot pass by producing four of them.
IF (SELECT COUNT(*) FROM sys.columns
     WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[vwFormCategories]')
       AND name IN ('RootParentID', 'ParentIDDepth', 'ParentIDPath', 'ParentIDIsLeaf', 'ParentIDChildCount')) <> 5
    THROW 50156, 'vwFormCategories was not regenerated with all five ParentID hierarchy columns.', 1;
GO

-- The negative half, asserted as an absence: if a later CodeGen run ever re-emits a Root* column on
-- vwForms, the seed in section 1 has been lost or overwritten and the decision needs re-making, not
-- re-applying.
IF EXISTS (SELECT 1 FROM sys.columns
            WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[vwForms]')
              AND name LIKE 'Root%')
    THROW 50156, 'vwForms still carries a Root* hierarchy column; Form.TemplateSourceFormID is not a hierarchy.', 1;
GO

-- The four traversal functions. Only _GetHierarchyMeta is reachable from the base view, so the view
-- assertion above cannot speak for the other three. They are asserted because all four are what
-- post-gate CodeGen emits for a hierarchy field, and what this migration claims to have done is
-- reproduce that output — a run that produced three of them reproduced something else. (They are not
-- asserted because application code calls them: `BaseEntity.GetDescendants`/`GetAncestors`
-- (MJCore `generic/baseEntity.ts`) are RunView calls filtered on the VIEW columns, and there is no
-- `BaseEntity.GetRootID` at all.)
IF (SELECT COUNT(*) FROM sys.objects
     WHERE [schema_id] = SCHEMA_ID('${flyway:defaultSchema}')
       AND [type] = 'IF'
       AND [name] IN ('fnFormCategoryParentID_GetHierarchyMeta', 'fnFormCategoryParentID_GetDescendants',
                      'fnFormCategoryParentID_GetAncestors', 'fnFormCategoryParentID_GetRootID')) <> 4
    THROW 50156, 'The four fnFormCategoryParentID_* traversal functions were not all created.', 1;
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormTemplateSourceFormID_GetRootID]', 'IF') IS NOT NULL
    THROW 50156, 'fnFormTemplateSourceFormID_GetRootID survived; the orphaned TVF was not dropped.', 1;
GO

-- The metadata half, which is the half that actually decides whether the entity is readable: MJ
-- composes its SELECT from these rows, so a field row with no column is what produces
-- "Invalid column name". All five must be present on Form Categories, and the stale one on Forms
-- must be gone.
--
-- FIVE, not four, and section 2 restores the fifth rather than assuming it. `RootParentID`'s row is
-- created by B202606281200 and CodeGen alone does leave it behind — but MJ core's
-- `R__RefreshMetadata.sql` is a repeatable that runs `spDeleteUnneededEntityFields` UNSCOPED on every
-- core `mj migrate`, so on any host that ran CodeGen and then migrated core, the row is already gone
-- and the entity is renumbered 1..10. An earlier draft asserted five while inserting four, on the
-- premise that the row always survives; that premise is false, and on such a host this file applied
-- forty batches and then halted here with no way forward. Section 2's restoration block is what makes
-- this assertion reachable.
DECLARE @FormCategoriesEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormCategory' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF (SELECT COUNT(*) FROM [${mjSchema}].[EntityField]
     WHERE [EntityID] = @FormCategoriesEntityID
       AND [Name] IN ('RootParentID', 'ParentIDDepth', 'ParentIDPath', 'ParentIDIsLeaf', 'ParentIDChildCount')) <> 5
    THROW 50156, 'The five Form Categories hierarchy EntityField rows are not all present.', 1;

-- And that the four landed in the right panel. Without their category info they are Category NULL /
-- GeneratedFormSection 'Details', and CodeGen never revisits them, so a silent miss here is
-- permanent. Scoped to AutoUpdateCategory = 1 deliberately: that flag is how an operator says "I
-- chose this field's category myself", and a host exercising it must not have the chain halted on it.
IF EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField]
            WHERE [EntityID] = @FormCategoriesEntityID
              AND [Name] IN ('ParentIDDepth', 'ParentIDPath', 'ParentIDIsLeaf', 'ParentIDChildCount')
              AND [AutoUpdateCategory] = 1
              AND ISNULL([Category], '') <> 'Hierarchy and Sorting')
    THROW 50156, 'The new hierarchy EntityField rows did not receive their Hierarchy and Sorting category info.', 1;

DECLARE @FormsEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'Form' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField]
            WHERE [EntityID] = @FormsEntityID AND [Name] = 'RootTemplateSourceFormID')
    THROW 50156, 'The stale RootTemplateSourceFormID EntityField row survived; every read of Forms will still fail on Invalid column name.', 1;
GO
