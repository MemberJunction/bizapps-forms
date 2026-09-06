-- =================================================================================================
-- Rules & Branching (plans/RULES_AND_BRANCHING_PLAN.md §2.3, Phase C):
--
--   1. FormScreen.IsDisqualification — an Ending screen flagged as a DISQUALIFICATION: its
--      ConditionalRule is evaluated while the respondent answers, and a match ends the form
--      immediately (knockout screening). A disqualify screen IS an Ending — the ScreenType CHECK
--      stays ('Welcome','Ending') deliberately, so every existing endings code path keeps
--      working; the flag only adds "may fire mid-form and blocks completion".
--
--   2. FormResponse.Status gains 'Disqualified' — terminal like Complete (nothing more will
--      come) but distinct from it: the respondent was screened out, not finished. Kept out of
--      'Complete' so quotas, automations with OnComplete triggers, and reporting never count a
--      knockout as a completion.
--
-- The rule verbs themselves (require / jump / score conditions) need NO schema change — they
-- live in the existing ConditionalRule / ScoringConfig JSON columns.
-- =================================================================================================

ALTER TABLE [${flyway:defaultSchema}].[FormScreen]
    ADD [IsDisqualification] BIT NOT NULL CONSTRAINT [DF_FormScreen_IsDisqualification] DEFAULT (0);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ending only: this screen is a disqualification — its ConditionalRule is evaluated while the respondent answers, and a match ends the form immediately with FormResponse.Status = Disqualified. The flag alone never fires; the rule arms it',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormScreen', @level2type = N'COLUMN', @level2name = N'IsDisqualification';
GO

-- Value-list change: drop + re-add the CHECK in one migration, so the constraint and the
-- CodeGen-generated TypeScript union move together on the next CodeGen run.
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] DROP CONSTRAINT [CK_FormResponse_Status];
GO

ALTER TABLE [${flyway:defaultSchema}].[FormResponse]
    ADD CONSTRAINT [CK_FormResponse_Status] CHECK (Status IN ('Partial', 'Complete', 'Disqualified'));
GO


















































/* ==============================================================================================
   METADATA REFRESH — inlined copy of MJ/migrations/R__RefreshMetadata.sql
   (minus ${flyway:timestamp}). EXEC target ${mjSchema} (__mj).
   Replay: DDL, this refresh, then CodeGen emit below.
   ============================================================================================== */

/* SQL text to recompile all views (dependency order: inner layered views before g.* wrappers) */
EXEC [${mjSchema}].spRecompileAllViews @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to delete unneeded entity fields */
EXEC [${mjSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}'
GO

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${mjSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber', @LogOutput=0, @ContinueOnError=1
GO


















































/* ============================================================================================
   ==== CODEGEN OUTPUT — DO NOT EDIT BELOW THIS LINE ====
   Local MJ CLI 6.1.0-edge.5, includeSchemas __mj_BizAppsForms.
   Pending-fields query now honors excludeSchemas (compiled includeSchemas).
   Common Activity Files/Links EntityField inserts stripped; remaining emit is
   Forms Screens/Categories/Forms + IsDisqualification from this DB.
   Source: migrations/codegen/CodeGen_Run_2026-09-06_17-40-47.sql (scoped)
   ============================================================================================ */

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema},${flyway:defaultSchema}';

-- #155 (again). CodeGen captured this database's Form Screens entity id. Regenerating against a
-- CLEAN database does not make that id portable -- it only changes WHICH population breaks: the
-- literal 6313B0B1 is the one `V202608191300` seeds, and that seed is wrapped in
-- `IF NOT EXISTS (... BaseTable = 'FormScreen' ...)`, so a host that ran `mj codegen` before it
-- shipped kept its own id and never received 6313B0B1. Proven, not argued: this file with the
-- literals still died on that host with `FK_EntityField_Entity` at batch 12/45, the same error and
-- the same stopping point as the defect it was written to fix.
--
-- Resolved once here because lines 118-270 are a single batch; T-SQL variables do not cross a GO.
-- Keyed on BaseTable + SchemaName, never on Entity.Name -- the entity-name prefix is host
-- configurable via mj.config.cjs, the table this app creates is not.
-- See .claude/rules/migrations-codegen.md, "The __mj.Entity id rule".
DECLARE @FormScreensEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
);
IF @FormScreensEntityID IS NULL
    THROW 51173, 'V202608252340: no [Entity] row for FormScreen in this schema. V202608191300 seeds it - run the Forms migrations in order.', 1;

/* SQL text to insert 6 new entity field(s) */

UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = @FormScreensEntityID
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = @FormScreensEntityID
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '213ed24a-c20a-4323-a73c-5090b2dd7663' OR (EntityID = @FormScreensEntityID AND Name = 'IsDisqualification')) BEGIN
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
            '213ed24a-c20a-4323-a73c-5090b2dd7663',
            @FormScreensEntityID, -- Entity: MJ_BizApps_Forms: Form Screens
            15,
            'IsDisqualification',
            'Is Disqualification',
            'Ending only: this screen is a disqualification — its ConditionalRule is evaluated while the respondent answers, and a match ends the form immediately with FormResponse.Status = Disqualified. The flag alone never fires; the rule arms it',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema},${flyway:defaultSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema},${flyway:defaultSchema}';

/* SQL text to insert entity field value with ID 68a6bc5f-1b58-4ffb-9ff2-11ee9113dfa8 */
-- CodeGen emits this bare, which is correct for the database it just introspected and wrong for one
-- that already has the row: re-running it there is a primary-key violation, and "replay-safe" is
-- exactly what this file set out to be. The EntityFieldID is resolved rather than captured for the
-- same reason as the entity id above -- EntityField ids are minted per database too, and a literal
-- one silently matches nothing on a host that minted its own.
DECLARE @FormResponseStatusFieldID UNIQUEIDENTIFIER = (
    SELECT TOP 1 ef.[ID] FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
     WHERE e.[BaseTable] = 'FormResponse' AND e.[SchemaName] = '${flyway:defaultSchema}'
       AND ef.[Name] = 'Status'
);
IF @FormResponseStatusFieldID IS NULL
    THROW 51175, 'V202608252340: no [EntityField] row for FormResponse.Status in this schema. Run the Forms migrations in order.', 1;

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue]
                WHERE [EntityFieldID] = @FormResponseStatusFieldID AND [Value] = 'Disqualified')
BEGIN
    INSERT INTO [${mjSchema}].[EntityFieldValue]
           ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES ('68a6bc5f-1b58-4ffb-9ff2-11ee9113dfa8', @FormResponseStatusFieldID, 2, 'Disqualified', 'Disqualified', GETUTCDATE(), GETUTCDATE());
END

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='719712D6-558C-4087-8C3C-A1254801E211';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema},${flyway:defaultSchema}';

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
    mjBizAppsFormsFormCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[FormCategory] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormCategory] AS mjBizAppsFormsFormCategory_ParentID
  ON
    [f].[ParentID] = mjBizAppsFormsFormCategory_ParentID.[ID]
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

/* Index for Foreign Keys for FormScreen */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormScreen
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormScreen_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormScreen]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormScreen_FormID ON [${flyway:defaultSchema}].[FormScreen] ([FormID]);

/* Base View SQL for MJ_BizApps_Forms: Form Screens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: vwFormScreens
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Screens
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormScreen
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormScreens]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormScreens];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormScreens]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormScreen] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormScreens] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Screens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: Permissions for vwFormScreens
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormScreens] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Screens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: spCreateFormScreen
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormScreen
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormScreen]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormScreen];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormScreen]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @ScreenType nvarchar(20),
    @Title nvarchar(500),
    @Body_Clear bit = 0,
    @Body nvarchar(MAX) = NULL,
    @ButtonLabel_Clear bit = 0,
    @ButtonLabel nvarchar(100) = NULL,
    @MediaURL_Clear bit = 0,
    @MediaURL nvarchar(1000) = NULL,
    @RedirectURL_Clear bit = 0,
    @RedirectURL nvarchar(1000) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @IsDefault bit = NULL,
    @SocialLinks_Clear bit = 0,
    @SocialLinks nvarchar(MAX) = NULL,
    @IsDisqualification bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormScreen]
            (
                [ID],
                [FormID],
                [ScreenType],
                [Title],
                [Body],
                [ButtonLabel],
                [MediaURL],
                [RedirectURL],
                [DisplayOrder],
                [ConditionalRule],
                [IsDefault],
                [SocialLinks],
                [IsDisqualification]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @ScreenType,
                @Title,
                CASE WHEN @Body_Clear = 1 THEN NULL ELSE ISNULL(@Body, NULL) END,
                CASE WHEN @ButtonLabel_Clear = 1 THEN NULL ELSE ISNULL(@ButtonLabel, NULL) END,
                CASE WHEN @MediaURL_Clear = 1 THEN NULL ELSE ISNULL(@MediaURL, NULL) END,
                CASE WHEN @RedirectURL_Clear = 1 THEN NULL ELSE ISNULL(@RedirectURL, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                ISNULL(@IsDefault, 0),
                CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, NULL) END,
                ISNULL(@IsDisqualification, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormScreen]
            (
                [FormID],
                [ScreenType],
                [Title],
                [Body],
                [ButtonLabel],
                [MediaURL],
                [RedirectURL],
                [DisplayOrder],
                [ConditionalRule],
                [IsDefault],
                [SocialLinks],
                [IsDisqualification]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @ScreenType,
                @Title,
                CASE WHEN @Body_Clear = 1 THEN NULL ELSE ISNULL(@Body, NULL) END,
                CASE WHEN @ButtonLabel_Clear = 1 THEN NULL ELSE ISNULL(@ButtonLabel, NULL) END,
                CASE WHEN @MediaURL_Clear = 1 THEN NULL ELSE ISNULL(@MediaURL, NULL) END,
                CASE WHEN @RedirectURL_Clear = 1 THEN NULL ELSE ISNULL(@RedirectURL, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                ISNULL(@IsDefault, 0),
                CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, NULL) END,
                ISNULL(@IsDisqualification, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormScreens] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormScreen] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Screens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormScreen] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Screens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: spUpdateFormScreen
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormScreen
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormScreen]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormScreen];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormScreen]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @ScreenType nvarchar(20) = NULL,
    @Title nvarchar(500) = NULL,
    @Body_Clear bit = 0,
    @Body nvarchar(MAX) = NULL,
    @ButtonLabel_Clear bit = 0,
    @ButtonLabel nvarchar(100) = NULL,
    @MediaURL_Clear bit = 0,
    @MediaURL nvarchar(1000) = NULL,
    @RedirectURL_Clear bit = 0,
    @RedirectURL nvarchar(1000) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @IsDefault bit = NULL,
    @SocialLinks_Clear bit = 0,
    @SocialLinks nvarchar(MAX) = NULL,
    @IsDisqualification bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormScreen]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [ScreenType] = ISNULL(@ScreenType, [ScreenType]),
        [Title] = ISNULL(@Title, [Title]),
        [Body] = CASE WHEN @Body_Clear = 1 THEN NULL ELSE ISNULL(@Body, [Body]) END,
        [ButtonLabel] = CASE WHEN @ButtonLabel_Clear = 1 THEN NULL ELSE ISNULL(@ButtonLabel, [ButtonLabel]) END,
        [MediaURL] = CASE WHEN @MediaURL_Clear = 1 THEN NULL ELSE ISNULL(@MediaURL, [MediaURL]) END,
        [RedirectURL] = CASE WHEN @RedirectURL_Clear = 1 THEN NULL ELSE ISNULL(@RedirectURL, [RedirectURL]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [SocialLinks] = CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, [SocialLinks]) END,
        [IsDisqualification] = ISNULL(@IsDisqualification, [IsDisqualification])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormScreens] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormScreens]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormScreen] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormScreen table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormScreen]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormScreen];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormScreen
ON [${flyway:defaultSchema}].[FormScreen]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormScreen]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormScreen] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Screens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormScreen] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Screens */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Screens
-- Item: spDeleteFormScreen
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormScreen
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormScreen]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormScreen];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormScreen]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormScreen]
    WHERE
        [ID] = @ID

    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormScreen] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Screens */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormScreen] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to delete unneeded entity fields (3 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to update existing entity fields from schema (3 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='', @IncludedSchemaNames='${flyway:defaultSchema},${flyway:defaultSchema}';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2448E280-B435-4B75-9C68-4DB2AF63D664'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 3 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   DisplayName = 'Form ID'
WHERE 
   ID = 'ED6C3D61-FBD9-40CE-95F3-535772BC0969' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   DisplayName = 'Form'
WHERE 
   ID = '3CC65FC2-7770-407A-96F0-12E9482CB6AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.IsDisqualification 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '213ED24A-C20A-4323-A73C-5090B2DD7663' AND AutoUpdateCategory = 1;
