-- Publish approval: a form can require a reviewer's approval before a new version goes live.
--
-- WHAT IT ADDS
--   Form.RequiresPublishApproval   Opt-in per form; 0 for every existing form, so nothing changes
--                                  until an author turns it on.
--   Form.PublishApproverRoleID     The MJ role whose members review. Required (by the engine, not a
--                                  CHECK) while RequiresPublishApproval is on.
--   FormVersion.Status             Gains 'InReview' and 'Rejected'. A version under review already
--                                  carries its snapshot, so the reviewer approves exactly what will
--                                  go live: edits made to the form after the request are not in it.
--   FormVersion.ApprovalWorkflowTaskID  The workflow run (an MJ: Tasks row) reviewing the version.
--   FormVersion.ReviewNotes        What the reviewer wrote when deciding.
--   UQ_FormVersion_OneInReview     At most one version of a form under review at a time.
--
-- WHY A WORKFLOW. The review is a task-graph workflow: a Human step answered as a BizApps Tasks
-- approval, then an Action step that publishes or rejects the version. The Action reads the
-- approval from the workflow's own Human step, never from its input, so a caller cannot publish a
-- reviewed version by invoking the Action directly. See FormPublishingEngine.RequestApproval.
--
-- ADDITIVE ONLY. Two nullable columns and one defaulted BIT; the status CHECK only widens.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE [${flyway:defaultSchema}].[Form] ADD
    [RequiresPublishApproval] BIT NOT NULL CONSTRAINT [DF_Form_RequiresPublishApproval] DEFAULT 0,
    [PublishApproverRoleID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Form_PublishApproverRole] FOREIGN KEY REFERENCES [${mjSchema}].[Role]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD
    [ApprovalWorkflowTaskID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_FormVersion_ApprovalWorkflowTask] FOREIGN KEY REFERENCES [${mjSchema}].[Task]([ID]),
    [ReviewNotes] NVARCHAR(2000) NULL;
GO

-- Drop and recreate rather than add a second CHECK: SQL Server ANDs multiple CHECKs on one column,
-- so a second constraint could only narrow the list.
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] DROP CONSTRAINT [CK_FormVersion_Status];
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD CONSTRAINT [CK_FormVersion_Status]
    CHECK ([Status] IN ('Draft', 'InReview', 'Published', 'Retired', 'Rejected'));
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_FormVersion_OneInReview]
    ON [${flyway:defaultSchema}].[FormVersion] ([FormID])
    WHERE [Status] = 'InReview';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When on, a new version of this form goes live only after a member of PublishApproverRoleID approves it. Publishing directly is refused; the author requests approval instead.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Form',
    @level2type = N'COLUMN', @level2name = N'RequiresPublishApproval';
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The role whose members review a new version of this form before it is published. Required while RequiresPublishApproval is on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Form',
    @level2type = N'COLUMN', @level2name = N'PublishApproverRoleID';
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The workflow run (an MJ: Tasks row) reviewing this version. Set when approval is requested; null for a version published directly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormVersion',
    @level2type = N'COLUMN', @level2name = N'ApprovalWorkflowTaskID';
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What the reviewer wrote when approving or rejecting this version.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormVersion',
    @level2type = N'COLUMN', @level2name = N'ReviewNotes';
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Draft while being built; InReview while a reviewer decides on it; Published while live; Retired once a newer version is published; Rejected when a reviewer declined it. The snapshot of an InReview, Published, Retired or Rejected version never changes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormVersion',
    @level2type = N'COLUMN', @level2name = N'Status';
GO


















































-- =============================================================================================
-- CodeGen output (appended)
-- =============================================================================================
-- `npx mj codegen --skipfiles` (MJ next, 6.3.0-edge.1 source) against a database built from shipped
-- migrations only (MJ core next, bizapps-common and bizapps-tasks next heads, Forms through this
-- file), captured on 2026-11-19 after a first CodeGen pass had settled everything this file does not
-- own. The Forms entity and field ids it names (Forms, Form Versions, Form Version.Status and its
-- value-list rows) are seeded by B202606281200, so they are the same on every host.
--
-- EDITS to CodeGen's raw output, all of them guards, none changing what a fresh install ends with:
--   1. The two MJ core entities the new foreign keys point at, `MJ: Roles` and `MJ: Tasks`, are
--      resolved by natural key into `@RoleEntityID` / `@TaskEntityID`, with a THROW when either is
--      missing, rather than named by the ids this database holds (lint:distribution, #155).
--   2. Each EntityFieldValue INSERT is guarded on (EntityFieldID, Value) as well as its id, and each
--      EntityRelationship INSERT keeps CodeGen's (EntityID, RelatedEntityID, RelatedEntityJoinField)
--      guard, now over the resolved ids.
-- =============================================================================================

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3185637d-7350-442b-8029-e21b2e8238c3' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'ApprovalWorkflowTaskID')) BEGIN
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
            '3185637d-7350-442b-8029-e21b2e8238c3',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '622E2804-5B6D-4B43-92A4-294ADC538F50'),
            'ApprovalWorkflowTaskID',
            'Approval Workflow Task ID',
            'The workflow run (an MJ: Tasks row) reviewing this version. Set when approval is requested; null for a version published directly.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            @TaskEntityID,
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bd9248de-bb7e-4db1-a316-f9ebeab1186e' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'ReviewNotes')) BEGIN
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
            'bd9248de-bb7e-4db1-a316-f9ebeab1186e',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '622E2804-5B6D-4B43-92A4-294ADC538F50'),
            'ReviewNotes',
            'Review Notes',
            'What the reviewer wrote when approving or rejecting this version.',
            'nvarchar',
            4000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9488528a-99c4-4ee9-8bff-72c5c69540fc' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'RequiresPublishApproval')) BEGIN
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
            '9488528a-99c4-4ee9-8bff-72c5c69540fc',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'),
            'RequiresPublishApproval',
            'Requires Publish Approval',
            'When on, a new version of this form goes live only after a member of PublishApproverRoleID approves it. Publishing directly is refused; the author requests approval instead.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'df8211e6-65ef-4fa3-a8f4-bbe870c2d0bd' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'PublishApproverRoleID')) BEGIN
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
            'df8211e6-65ef-4fa3-a8f4-bbe870c2d0bd',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'),
            'PublishApproverRoleID',
            'Publish Approver Role ID',
            'The role whose members review a new version of this form before it is published. Required while RequiresPublishApproval is on.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            @RoleEntityID,
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to sync entity unique keys (1 added, 0 updated, 0 removed) */
INSERT INTO [${mjSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('9d1774b9-b010-4d4f-8c49-5171f69e260b', '622E2804-5B6D-4B43-92A4-294ADC538F50', 'UQ_FormVersion_OneInReview', 'FormID', '([Status]=''InReview'')');

/* SQL text to sync 4 entity field value row(s) for entity field ID 36801486-E291-48F4-BC02-432BE04642F3 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '299c41af-16db-4f46-a1e1-4340e96a4241' OR ([EntityFieldID] = '36801486-E291-48F4-BC02-432BE04642F3' AND [Value] = 'InReview'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('299c41af-16db-4f46-a1e1-4340e96a4241', '36801486-E291-48F4-BC02-432BE04642F3', 2, 'InReview', 'InReview', 'Check', GETUTCDATE(), GETUTCDATE());
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '354a9676-826a-4fea-8d1a-a4b84f7f0b93' OR ([EntityFieldID] = '36801486-E291-48F4-BC02-432BE04642F3' AND [Value] = 'Rejected'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('354a9676-826a-4fea-8d1a-a4b84f7f0b93', '36801486-E291-48F4-BC02-432BE04642F3', 4, 'Rejected', 'Rejected', 'Check', GETUTCDATE(), GETUTCDATE());
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='C7020CBB-CDB4-4DCF-87FD-F34CA7023EE3';
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='3D7C6481-453B-4DEF-A7FA-CFBD99A3665F';


DECLARE @RoleEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'Role' AND [SchemaName] = '${mjSchema}');
IF @RoleEntityID IS NULL
    THROW 51305, 'V202611191337: no [Entity] row for the core Role table. Run the MJ core migrations first.', 1;
DECLARE @TaskEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'Task' AND [SchemaName] = '${mjSchema}');
IF @TaskEntityID IS NULL
    THROW 51306, 'V202611191337: no [Entity] row for the core Task table. Run the MJ core migrations first.', 1;

/* Create Entity Relationship: MJ: Roles -> MJ_BizApps_Forms: Forms (One To Many via PublishApproverRoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c97d2677-358e-4e1a-b07f-4d0e9ecd8d6b' OR ([EntityID] = @RoleEntityID AND [RelatedEntityID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND [RelatedEntityJoinField] = 'PublishApproverRoleID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c97d2677-358e-4e1a-b07f-4d0e9ecd8d6b', @RoleEntityID, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'PublishApproverRoleID', 'One To Many', 1, 1, 19, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Tasks -> MJ_BizApps_Forms: Form Versions (One To Many via ApprovalWorkflowTaskID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'fe123296-2d5d-413b-b9fd-520e9467ebac' OR ([EntityID] = @TaskEntityID AND [RelatedEntityID] = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND [RelatedEntityJoinField] = 'ApprovalWorkflowTaskID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fe123296-2d5d-413b-b9fd-520e9467ebac', @TaskEntityID, '622E2804-5B6D-4B43-92A4-294ADC538F50', 'ApprovalWorkflowTaskID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to update entity field related entity name field map for entity field ID 3185637D-7350-442B-8029-E21B2E8238C3 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3185637D-7350-442B-8029-E21B2E8238C3', @RelatedEntityNameFieldMap='ApprovalWorkflowTask';

/* Index for Foreign Keys for FormVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormVersion
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormVersion_FormID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormVersion]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormVersion]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'FormID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormVersion_FormID ON [${flyway:defaultSchema}].[FormVersion] ([FormID]);

-- Index for foreign key ApprovalWorkflowTaskID in table FormVersion
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormVersion_ApprovalWorkflowTaskID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormVersion]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormVersion]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ApprovalWorkflowTaskID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormVersion_ApprovalWorkflowTaskID ON [${flyway:defaultSchema}].[FormVersion] ([ApprovalWorkflowTaskID]);

/* Base View SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: vwFormVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormVersions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormVersions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormVersions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    MJTask_ApprovalWorkflowTaskID.[Name] AS [ApprovalWorkflowTask]
FROM
    [${flyway:defaultSchema}].[FormVersion] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[Task] AS MJTask_ApprovalWorkflowTaskID
  ON
    [f].[ApprovalWorkflowTaskID] = MJTask_ApprovalWorkflowTaskID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: Permissions for vwFormVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormVersions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spCreateFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormVersion]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @VersionNumber int,
    @Status nvarchar(20) = NULL,
    @PublishedAt_Clear bit = 0,
    @PublishedAt datetimeoffset = NULL,
    @DefinitionSnapshot_Clear bit = 0,
    @DefinitionSnapshot nvarchar(MAX) = NULL,
    @ApprovalWorkflowTaskID_Clear bit = 0,
    @ApprovalWorkflowTaskID uniqueidentifier = NULL,
    @ReviewNotes_Clear bit = 0,
    @ReviewNotes nvarchar(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormVersion]
            (
                [ID],
                [FormID],
                [VersionNumber],
                [Status],
                [PublishedAt],
                [DefinitionSnapshot],
                [ApprovalWorkflowTaskID],
                [ReviewNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @VersionNumber,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, NULL) END,
                CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, NULL) END,
                CASE WHEN @ApprovalWorkflowTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalWorkflowTaskID, NULL) END,
                CASE WHEN @ReviewNotes_Clear = 1 THEN NULL ELSE ISNULL(@ReviewNotes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormVersion]
            (
                [FormID],
                [VersionNumber],
                [Status],
                [PublishedAt],
                [DefinitionSnapshot],
                [ApprovalWorkflowTaskID],
                [ReviewNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @VersionNumber,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, NULL) END,
                CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, NULL) END,
                CASE WHEN @ApprovalWorkflowTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalWorkflowTaskID, NULL) END,
                CASE WHEN @ReviewNotes_Clear = 1 THEN NULL ELSE ISNULL(@ReviewNotes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Versions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spUpdateFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormVersion]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @VersionNumber int = NULL,
    @Status nvarchar(20) = NULL,
    @PublishedAt_Clear bit = 0,
    @PublishedAt datetimeoffset = NULL,
    @DefinitionSnapshot_Clear bit = 0,
    @DefinitionSnapshot nvarchar(MAX) = NULL,
    @ApprovalWorkflowTaskID_Clear bit = 0,
    @ApprovalWorkflowTaskID uniqueidentifier = NULL,
    @ReviewNotes_Clear bit = 0,
    @ReviewNotes nvarchar(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormVersion]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [VersionNumber] = ISNULL(@VersionNumber, [VersionNumber]),
        [Status] = ISNULL(@Status, [Status]),
        [PublishedAt] = CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, [PublishedAt]) END,
        [DefinitionSnapshot] = CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, [DefinitionSnapshot]) END,
        [ApprovalWorkflowTaskID] = CASE WHEN @ApprovalWorkflowTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalWorkflowTaskID, [ApprovalWorkflowTaskID]) END,
        [ReviewNotes] = CASE WHEN @ReviewNotes_Clear = 1 THEN NULL ELSE ISNULL(@ReviewNotes, [ReviewNotes]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormVersion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormVersion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormVersion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormVersion
ON [${flyway:defaultSchema}].[FormVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[FormVersion]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[FormVersion] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Versions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spDeleteFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Versions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Form */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Form
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'CategoryID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_CategoryID ON [${flyway:defaultSchema}].[Form] ([CategoryID]);

-- Index for foreign key StyleID in table Form
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_StyleID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'StyleID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_StyleID ON [${flyway:defaultSchema}].[Form] ([StyleID]);

-- Index for foreign key OwnerUserID in table Form
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_OwnerUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'OwnerUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_OwnerUserID ON [${flyway:defaultSchema}].[Form] ([OwnerUserID]);

-- Index for foreign key TemplateSourceFormID in table Form
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_TemplateSourceFormID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'TemplateSourceFormID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_TemplateSourceFormID ON [${flyway:defaultSchema}].[Form] ([TemplateSourceFormID]);

-- Index for foreign key PublishApproverRoleID in table Form
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_PublishApproverRoleID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PublishApproverRoleID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_PublishApproverRoleID ON [${flyway:defaultSchema}].[Form] ([PublishApproverRoleID]);

/* SQL text to update entity field related entity name field map for entity field ID DF8211E6-65EF-4FA3-A8F4-BBE870C2D0BD */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DF8211E6-65EF-4FA3-A8F4-BBE870C2D0BD', @RelatedEntityNameFieldMap='PublishApproverRole';

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
    mjBizAppsFormsForm_TemplateSourceFormID.[Name] AS [TemplateSourceForm],
    MJRole_PublishApproverRoleID.[Name] AS [PublishApproverRole]
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
LEFT OUTER JOIN
    [${mjSchema}].[Role] AS MJRole_PublishApproverRoleID
  ON
    [f].[PublishApproverRoleID] = MJRole_PublishApproverRoleID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwForms] FROM [cdp_UI]
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
    @TemplateSourceFormID uniqueidentifier = NULL,
    @RequiresPublishApproval bit = NULL,
    @PublishApproverRoleID_Clear bit = 0,
    @PublishApproverRoleID uniqueidentifier = NULL
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
                [TemplateSourceFormID],
                [RequiresPublishApproval],
                [PublishApproverRoleID]
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
                CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, NULL) END,
                ISNULL(@RequiresPublishApproval, 0),
                CASE WHEN @PublishApproverRoleID_Clear = 1 THEN NULL ELSE ISNULL(@PublishApproverRoleID, NULL) END
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
                [TemplateSourceFormID],
                [RequiresPublishApproval],
                [PublishApproverRoleID]
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
                CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, NULL) END,
                ISNULL(@RequiresPublishApproval, 0),
                CASE WHEN @PublishApproverRoleID_Clear = 1 THEN NULL ELSE ISNULL(@PublishApproverRoleID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwForms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Forms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] FROM [cdp_Integration]
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
    @TemplateSourceFormID uniqueidentifier = NULL,
    @RequiresPublishApproval bit = NULL,
    @PublishApproverRoleID_Clear bit = 0,
    @PublishApproverRoleID uniqueidentifier = NULL
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
        [TemplateSourceFormID] = CASE WHEN @TemplateSourceFormID_Clear = 1 THEN NULL ELSE ISNULL(@TemplateSourceFormID, [TemplateSourceFormID]) END,
        [RequiresPublishApproval] = ISNULL(@RequiresPublishApproval, [RequiresPublishApproval]),
        [PublishApproverRoleID] = CASE WHEN @PublishApproverRoleID_Clear = 1 THEN NULL ELSE ISNULL(@PublishApproverRoleID, [PublishApproverRoleID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] FROM [cdp_Integration]
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
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[Form]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[Form] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Forms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Forms */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd86d422f-42fe-4326-bd73-bfc19a2f0652' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'ApprovalWorkflowTask')) BEGIN
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
            'd86d422f-42fe-4326-bd73-bfc19a2f0652',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '622E2804-5B6D-4B43-92A4-294ADC538F50'),
            'ApprovalWorkflowTask',
            'Approval Workflow Task',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cd8929ed-6578-4f94-8f81-205e87a88a8a' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'PublishApproverRole')) BEGIN
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
            'cd8929ed-6578-4f94-8f81-205e87a88a8a',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'),
            'PublishApproverRole',
            'Publish Approver Role',
            NULL,
            'nvarchar',
            100,
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

