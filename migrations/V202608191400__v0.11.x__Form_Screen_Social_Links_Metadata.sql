-- =================================================================================================
-- The SocialLinks metadata, applied after the entity it belongs to exists
-- =================================================================================================
-- This is the second half of V202608191200. It was moved out of that file because it cannot run
-- there, and because leaving it there quietly broke every FormScreen save.
--
-- TWO ORDERING FACTS make this file necessary, and neither is visible on a machine that has run
-- CodeGen by hand:
--
--   1. V202608191200 adds the SocialLinks COLUMN, but the __mj.Entity row for Form Screens and the
--      __mj_CreatedAt/__mj_UpdatedAt columns are created by V202608191300 — which sorts AFTER it.
--      An EntityField insert in 191200 therefore looks up a NULL EntityID and dies on a NOT NULL
--      constraint, and its regenerated trigger references __mj_UpdatedAt before that column exists
--      ("Invalid column name", Msg 207). Both abort a fresh install partway through Forms' schema.
--
--   2. V202608191300 is CodeGen output taken from a database that predated SocialLinks. It DROPs
--      and re-CREATEs vwFormScreens and spCreate/spUpdate/spDeleteFormScreen. Anything 191200 had
--      already regenerated with @SocialLinks was therefore thrown away by the very next migration,
--      leaving an EntityField row pointing at a parameter the procedure no longer had — so MJ
--      composed an EXEC with @SocialLinks and SQL Server refused it. Not just social links: EVERY
--      FormScreen save, welcome and ending alike, failed with "too many arguments specified".
--
-- Applying LAST is what fixes both. By this point the entity row, the timestamp columns and
-- 191300's procedures all exist, so this file adds the one field they are missing and regenerates
-- the CRUD procedures on top. The result is the same on a fresh install and on a host that already
-- ran 191200 when it was DDL-only, which is the state every developer box here is in.
--
-- `npm run lint:migrations` (scripts/check-migration-order.mjs) now enforces all three orderings,
-- because every symptom above is invisible on the machine that authors the migration.
--
-- ONE EDIT to CodeGen's raw output, carried over from 191200: the Form Screens entity id is LOOKED
-- UP rather than hardcoded. CodeGen emits the id of the database it ran against, and because
-- V202608182100 shipped no Entity row, each database minted its own.
-- =================================================================================================

-- ============================================================================
-- CodeGen output (moved here from V202608191200) — do not hand-edit below this line.
--
-- On the id lookup noted above: the two dev databases hold two different ids for
-- the same entity. A literal would attach the new
-- EntityField to an entity that does not exist on anyone else's install. The
-- lookup is inline rather than a variable because eleven GO batches follow, and a
-- DECLARE does not survive one.
--
-- Schema placeholders come straight from CodeGen (${flyway:defaultSchema} /
-- ${mjSchema}); no literal schema name appears below, which is what lets this run
-- on a host whose core schema is named differently.
-- ============================================================================

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '73dc2267-fe69-4cff-8aad-d522511d053c' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'SocialLinks')) BEGIN
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
            '73dc2267-fe69-4cff-8aad-d522511d053c',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 14,
            'SocialLinks',
            'Social Links',
            'Ending screens only: JSON array of { platform, url } social links rendered as icons under the ending message. Absent or empty means no social links are shown; there is no separate enabled flag',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

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
    @SocialLinks nvarchar(MAX) = NULL
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
                [SocialLinks]
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
                CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, NULL) END
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
                [SocialLinks]
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
                CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, NULL) END
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
    @SocialLinks nvarchar(MAX) = NULL
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
        [SocialLinks] = CASE WHEN @SocialLinks_Clear = 1 THEN NULL ELSE ISNULL(@SocialLinks, [SocialLinks]) END
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

-- A subquery is not legal as an EXEC parameter, so this pair needs a variable. Declared here
-- rather than at the top of the file because eleven GO batches sit above and a DECLARE does not
-- cross one; both EXECs below are in this same batch.
DECLARE @ScopedFormScreenEntityID NVARCHAR(50) = (
    SELECT TOP 1 CONVERT(NVARCHAR(50), [ID]) FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
);

/* SQL text to delete unneeded entity fields (1 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber', @EntityIDs=@ScopedFormScreenEntityID;

/* SQL text to update existing entity fields from schema (1 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber', @EntityIDs=@ScopedFormScreenEntityID;

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* Set field properties for entity */

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '854BBA43-2290-4A97-BB81-551B59FFDBEC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C0004F1-C84B-423D-A6B0-0F498FCE21C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC740C88-97ED-4E28-A29D-57DCD5E8C42E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A106CA10-7538-4646-916B-B647EF2153BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41B8B19A-EDB2-4934-B332-2A3329DEB5ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ScreenType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4E65E26A-8CE3-4726-B463-7676EAE3A8E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Title 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7262737-345B-4994-A3FC-03275446DFD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Body 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD2F05B2-4A0F-4A3E-A371-C5CFEE2441D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ButtonLabel 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D477C75-70FF-4B66-A8C6-DF3565B0C7FD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.MediaURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'ED70E88F-B1DD-45BD-9305-DEE79C2DAE83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.RedirectURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F393F61A-A698-4F5A-8B87-0256A8D6DE42' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F06BACA9-DD58-49D9-9F6C-4BE202DC52D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7D9CDD52-B555-4EEA-8936-194CDAD940EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CFF820E-21D2-4441-945F-CC38D3BD0D6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.SocialLinks 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '73DC2267-FE69-4CFF-8AAD-D522511D053C' AND AutoUpdateCategory = 1;
