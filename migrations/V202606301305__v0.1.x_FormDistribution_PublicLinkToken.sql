-- =============================================================================
-- MJ Forms — FormDistribution.PublicLinkToken (Phase 1)
-- =============================================================================
-- Versioned (V) migration layered on the B-baseline schema file. Adds the raw,
-- redeemable magic-link token to a FormDistribution so a minted public link
-- actually has a shareable, redeemable URL.
--
-- WHY a raw token is persisted (and not just the hash on the invite row):
--   A public form link is low-secrecy BY DESIGN — the URL is meant to be shared
--   (homepage button, email, QR). The magic-link redeem path needs the RAW token
--   in the URL (/magic-link/redeem?token=<token>) to establish the anonymous,
--   distribution-scoped session. The invite row still stores ONLY the SHA-256
--   hash (unchanged); the raw token lives here so the builder can surface the
--   public URL / embed / QR. This is the deliberate exception for shareable
--   public links — do NOT use this column for any secret/identified flow.
--
-- Conventions (see CLAUDE.md / migrations rules):
--   * Single ADD ALTER (one business column).
--   * ${flyway:defaultSchema} placeholder for the __mj_BizAppsForms schema.
--   * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds them.
--   * NO foreign-key indexes — not an FK.
--   * sp_addextendedproperty on the business column → CodeGen field description.
--
-- NOTE: CodeGen SQL output is APPENDED below this hand-DDL by `npm run mj:codegen`
--       (devs don't run codegen on install). Do NOT hand-edit the appended block.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
    ADD [PublicLinkToken] NVARCHAR(255) NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms',
    @level1type = N'TABLE',  @level1name = N'FormDistribution',
    @level2type = N'COLUMN', @level2name = N'PublicLinkToken';
GO


-- ============================================================================
-- CodeGen output (appended) — regenerated; do not hand-edit below this line.
-- Covers FormDistribution (incl. PublicLinkToken SPs/view + EntityField) and the
-- FormQuestion regeneration. Schema placeholders ${flyway:defaultSchema}/${mjSchema}.
-- ============================================================================

-- ---- FormDistribution / PublicLinkToken ----
/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7de1a89c-4880-4e08-a49e-adf410c8fc44' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'PublicLinkToken')) BEGIN
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
            '7de1a89c-4880-4e08-a49e-adf410c8fc44',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100032,
            'PublicLinkToken',
            'Public Link Token',
            'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.',
            'nvarchar',
            510,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Index for Foreign Keys for FormDistribution */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormDistribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormDistribution_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormDistribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormDistribution_FormID ON [${flyway:defaultSchema}].[FormDistribution] ([FormID]);

/* SQL text to update entity field related entity name field map for entity field ID E5610750-DF58-471F-933D-A8873B15600B */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E5610750-DF58-471F-933D-A8873B15600B', @RelatedEntityNameFieldMap='Page';

/* Base View SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: vwFormDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Distributions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormDistribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormDistributions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormDistributions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormDistributions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormDistribution] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: Permissions for vwFormDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spCreateFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormDistribution]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Name nvarchar(255),
    @Slug_Clear bit = 0,
    @Slug nvarchar(255) = NULL,
    @ChannelType nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @OpenAt_Clear bit = 0,
    @OpenAt datetimeoffset = NULL,
    @CloseAt_Clear bit = 0,
    @CloseAt datetimeoffset = NULL,
    @MaxResponses_Clear bit = 0,
    @MaxResponses int = NULL,
    @ResponseCount int = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @CaptchaRequired bit = NULL,
    @IsActive bit = NULL,
    @PublicLinkToken_Clear bit = 0,
    @PublicLinkToken nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormDistribution]
            (
                [ID],
                [FormID],
                [Name],
                [Slug],
                [ChannelType],
                [Status],
                [OpenAt],
                [CloseAt],
                [MaxResponses],
                [ResponseCount],
                [MagicLinkInviteID],
                [CaptchaRequired],
                [IsActive],
                [PublicLinkToken]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @Name,
                CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, NULL) END,
                ISNULL(@ChannelType, 'PublicLink'),
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, NULL) END,
                CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, NULL) END,
                CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, NULL) END,
                ISNULL(@ResponseCount, 0),
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@CaptchaRequired, 1),
                ISNULL(@IsActive, 1),
                CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormDistribution]
            (
                [FormID],
                [Name],
                [Slug],
                [ChannelType],
                [Status],
                [OpenAt],
                [CloseAt],
                [MaxResponses],
                [ResponseCount],
                [MagicLinkInviteID],
                [CaptchaRequired],
                [IsActive],
                [PublicLinkToken]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @Name,
                CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, NULL) END,
                ISNULL(@ChannelType, 'PublicLink'),
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, NULL) END,
                CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, NULL) END,
                CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, NULL) END,
                ISNULL(@ResponseCount, 0),
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@CaptchaRequired, 1),
                ISNULL(@IsActive, 1),
                CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormDistributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spUpdateFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormDistribution]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Slug_Clear bit = 0,
    @Slug nvarchar(255) = NULL,
    @ChannelType nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @OpenAt_Clear bit = 0,
    @OpenAt datetimeoffset = NULL,
    @CloseAt_Clear bit = 0,
    @CloseAt datetimeoffset = NULL,
    @MaxResponses_Clear bit = 0,
    @MaxResponses int = NULL,
    @ResponseCount int = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @CaptchaRequired bit = NULL,
    @IsActive bit = NULL,
    @PublicLinkToken_Clear bit = 0,
    @PublicLinkToken nvarchar(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormDistribution]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Name] = ISNULL(@Name, [Name]),
        [Slug] = CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, [Slug]) END,
        [ChannelType] = ISNULL(@ChannelType, [ChannelType]),
        [Status] = ISNULL(@Status, [Status]),
        [OpenAt] = CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, [OpenAt]) END,
        [CloseAt] = CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, [CloseAt]) END,
        [MaxResponses] = CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, [MaxResponses]) END,
        [ResponseCount] = ISNULL(@ResponseCount, [ResponseCount]),
        [MagicLinkInviteID] = CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]) END,
        [CaptchaRequired] = ISNULL(@CaptchaRequired, [CaptchaRequired]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [PublicLinkToken] = CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, [PublicLinkToken]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormDistributions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormDistributions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormDistribution] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormDistribution table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormDistribution]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormDistribution];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormDistribution
ON [${flyway:defaultSchema}].[FormDistribution]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormDistribution]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormDistribution] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spDeleteFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormDistribution]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormDistribution]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Questions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormQuestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormQuestions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormQuestions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormQuestions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    mjBizAppsFormsFormPage_PageID.[Title] AS [Page]
FROM
    [${flyway:defaultSchema}].[FormQuestion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormPage] AS mjBizAppsFormsFormPage_PageID
  ON
    [f].[PageID] = mjBizAppsFormsFormPage_PageID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: Permissions for vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spCreateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50),
    @Prompt nvarchar(MAX),
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [ID],
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spUpdateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50) = NULL,
    @Prompt nvarchar(MAX) = NULL,
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [PageID] = CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, [PageID]) END,
        [QuestionType] = ISNULL(@QuestionType, [QuestionType]),
        [Prompt] = ISNULL(@Prompt, [Prompt]),
        [HelpText] = CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, [HelpText]) END,
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ValidationRule] = CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, [ValidationRule]) END,
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [ScoringConfig] = CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, [ScoringConfig]) END,
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormQuestions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormQuestion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormQuestion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormQuestion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormQuestion
ON [${flyway:defaultSchema}].[FormQuestion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormQuestion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spDeleteFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormQuestion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (1 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='1FC60BDA-25B8-473B-ACE5-1238670D3535';

/* SQL text to update existing entity fields from schema (1 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='1FC60BDA-25B8-473B-ACE5-1238670D3535';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB722F5E-2FD8-437A-8B1A-EF01A930F980' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41D93C94-5CB9-4126-8E63-F662C05878E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1053B9B8-3094-4201-9903-506A702DFF22' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6798B45D-6288-4A1C-BDFE-4C1D29929B5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20E36F64-0F3F-4C81-8645-659C9F50F5FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Slug 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Slug',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '866866B1-F573-4D3D-ACDB-C74582A22054' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ChannelType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284688DE-AEA8-4960-AA9A-B98ED80BCF96' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7331258F-34A3-4BDA-B4DB-347DB3A16148' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.OpenAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CA1D54E-3DE5-4505-9D62-F5F46031B164' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.CloseAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E2346265-1BB3-4957-9768-B7A286339D38' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.MaxResponses 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Responses',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0668174-8180-4C67-9DF7-8183E0B30851' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ResponseCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19A5FB8D-BE86-4F84-9BB9-45437A878EFB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.MagicLinkInviteID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Magic Link Invite',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B77F00D4-F944-4023-9A5E-3EE46E242B6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.CaptchaRequired 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Captcha Required',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8FC49DF-B819-41F0-B1DE-DADBFF171519' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.PublicLinkToken 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DE1A89C-4880-4E08-A49E-ADF410C8FC44' AND AutoUpdateCategory = 1;



-- ---- FormQuestion (regenerated) ----
/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2447de83-4360-4186-8948-9848bc14d2d7' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'Page')) BEGIN
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
            '2447de83-4360-4186-8948-9848bc14d2d7',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100031,
            'Page',
            'Page',
            NULL,
            'nvarchar',
            510,
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Index for Foreign Keys for FormQuestion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormQuestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestion_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestion_FormID ON [${flyway:defaultSchema}].[FormQuestion] ([FormID]);

-- Index for foreign key PageID in table FormQuestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestion_PageID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestion_PageID ON [${flyway:defaultSchema}].[FormQuestion] ([PageID]);

/* Base View SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Questions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormQuestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormQuestions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormQuestions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormQuestions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    mjBizAppsFormsFormPage_PageID.[Title] AS [Page]
FROM
    [${flyway:defaultSchema}].[FormQuestion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormPage] AS mjBizAppsFormsFormPage_PageID
  ON
    [f].[PageID] = mjBizAppsFormsFormPage_PageID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: Permissions for vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spCreateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50),
    @Prompt nvarchar(MAX),
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [ID],
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spUpdateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50) = NULL,
    @Prompt nvarchar(MAX) = NULL,
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [PageID] = CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, [PageID]) END,
        [QuestionType] = ISNULL(@QuestionType, [QuestionType]),
        [Prompt] = ISNULL(@Prompt, [Prompt]),
        [HelpText] = CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, [HelpText]) END,
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ValidationRule] = CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, [ValidationRule]) END,
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [ScoringConfig] = CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, [ScoringConfig]) END,
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormQuestions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormQuestion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormQuestion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormQuestion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormQuestion
ON [${flyway:defaultSchema}].[FormQuestion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormQuestion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spDeleteFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormQuestion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (1 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='C396B99F-0677-47F8-BAEF-BCB08DE5CF97';

/* SQL text to update existing entity fields from schema (1 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='C396B99F-0677-47F8-BAEF-BCB08DE5CF97';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '581327C5-0A60-41BA-A25A-3B5A171050CC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9903E88-261D-4043-BECC-A9448E75BF8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6F82852-D6BA-42C5-8085-AF83BC25896C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4960171-01A7-4200-93EB-794F736F616E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C83FDDAA-982B-4756-9488-F01F819889B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.PageID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5610750-DF58-471F-933D-A8873B15600B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B404E767-712E-48DD-9B1C-849074A06D5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '581327C5-0A60-41BA-A25A-3B5A171050CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Page 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Structure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2447DE83-4360-4186-8948-9848BC14D2D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.QuestionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Prompt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F43882AD-2DFD-4BC3-9FBE-ABF60ADFF048' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.HelpText 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A3F91065-EFBC-48A3-9546-80E3A431344D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.IsRequired 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27B92BC4-4F9B-4167-ABC9-B22D7EB6939A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ValidationRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A2677DB5-121E-41F1-862B-6F7FE876FEFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D7EC6A52-F85C-45D8-89E4-26CADF2EFCCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ScoringConfig 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'BFAE940F-B36B-479D-833D-88BA789DA4A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Settings 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9685E608-F874-4DCE-92B1-C628FC77DB15' AND AutoUpdateCategory = 1;

