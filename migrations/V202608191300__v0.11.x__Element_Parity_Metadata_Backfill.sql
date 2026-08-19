-- =================================================================================================
-- Ship the metadata that V202608182100 left behind
-- =================================================================================================
-- V202608182100 added the FormScreen table, FormPage.IsPartialSubmitPoint and the
-- FormQuestionOption ImageURL / MatrixAxis columns — and shipped no CodeGen output for any of it.
-- Every other feature migration in this directory appends CodeGen's SQL below a marker; that one
-- did not, so a database built purely from these files gets three tables' worth of DDL with no
-- __mj metadata behind it: no Entity row for Form Screens, no EntityField rows for the new
-- columns, and views and CRUD procedures that predate them.
--
-- The symptom is quiet and unpleasant. BaseEntity.Set on a field with no EntityField row is a
-- no-op, so the entity never goes dirty and the save reports success having written nothing —
-- which is exactly the hour-long false trail this repo followed on 2026-08-19 before noticing the
-- column and the metadata lived in different databases.
--
-- A NEW migration rather than an edit to V202608182100. That file applies cleanly everywhere; it
-- is simply incomplete. The README allows editing history only when the old file CANNOT apply at
-- all (see the 2026-08-13 exception and the test it had to pass), which is not the case here.
-- Every statement below is idempotent — guarded INSERTs, CREATE OR ALTER, DROP-then-CREATE — so a
-- host that already ran CodeGen by hand converges instead of failing.
--
-- ONE EDIT to CodeGen's raw output: the Form Screens entity id is looked up rather than hardcoded,
-- because V202608182100 shipped no Entity row and each database therefore minted its own id (the
-- two dev databases here disagree). Form Pages and Form Question Options are baseline entities
-- with fixed, shipped ids, so those literals are correct and stay.
-- =================================================================================================

/* Entity creation, fenced. CodeGen emits these five INSERTs bare, which is correct for the
   database it just introspected and wrong for one that already has the entity: re-running them
   would add a second Form Screens row and duplicate its permissions. Everything inside runs only
   on a host that has never seen this entity, which is exactly the fresh install this migration
   exists for — and there the hardcoded id below becomes the deterministic one. */
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
)
BEGIN
/* SQL generated to create new entity MJ_BizApps_Forms: Form Screens */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '6313b0b1-37e8-432f-aeb6-f35f218c5d22',
         'MJ_BizApps_Forms: Form Screens',
         'Form Screens',
         'Welcome and Ending screens for a form. Distinct from questions: a screen is never answered, produces no FormResponseAnswer row, appears in no aggregation and cannot be referenced by a conditional rule. It brackets the intake rather than sitting inside it',
         NULL,
         'FormScreen',
         'vwFormScreens',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Screens to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '6313b0b1-37e8-432f-aeb6-f35f218c5d22', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6313b0b1-37e8-432f-aeb6-f35f218c5d22', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6313b0b1-37e8-432f-aeb6-f35f218c5d22', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6313b0b1-37e8-432f-aeb6-f35f218c5d22', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END;

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
IF COL_LENGTH('[${flyway:defaultSchema}].[FormScreen]', '__mj_CreatedAt') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
UPDATE [${flyway:defaultSchema}].[FormScreen] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'DF___mj_BizAppsForms_FormScreen___mj_CreatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD CONSTRAINT [DF___mj_BizAppsForms_FormScreen___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
IF COL_LENGTH('[${flyway:defaultSchema}].[FormScreen]', '__mj_UpdatedAt') IS NULL
    ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
UPDATE [${flyway:defaultSchema}].[FormScreen] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = 'DF___mj_BizAppsForms_FormScreen___mj_UpdatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD CONSTRAINT [DF___mj_BizAppsForms_FormScreen___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e0719ece-ceda-45c9-b02f-18d856c7e402' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'ImageURL')) BEGIN
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
            'e0719ece-ceda-45c9-b02f-18d856c7e402',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'BF3016E2-8BA7-4975-83B6-02C9435C1441') + 9,
            'ImageURL',
            'Image URL',
            'PictureChoice only: image shown above the option label. Ignored by every other question type',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2aedeba3-97e7-4a5c-ae73-63d110da037c' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'MatrixAxis')) BEGIN
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
            '2aedeba3-97e7-4a5c-ae73-63d110da037c',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'BF3016E2-8BA7-4975-83B6-02C9435C1441') + 10,
            'MatrixAxis',
            'Matrix Axis',
            'Matrix only: whether this option is a Row or a Column of the grid. NULL for every other question type, and read as Row if left NULL on a Matrix',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ab148e9f-a1b9-48ea-8b27-1a60b9148a14' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'IsPartialSubmitPoint')) BEGIN
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
            'ab148e9f-a1b9-48ea-8b27-1a60b9148a14',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6') + 9,
            'IsPartialSubmitPoint',
            'Is Partial Submit Point',
            'When set, advancing past this page banks a Partial response immediately instead of waiting for the autosave debounce',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c51e4c9e-a081-47e8-aad6-0beb98c1ee05' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'ID')) BEGIN
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
            'c51e4c9e-a081-47e8-aad6-0beb98c1ee05',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ed6c3d61-fbd9-40ce-95f3-535772bc0969' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'FormID')) BEGIN
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
            'ed6c3d61-fbd9-40ce-95f3-535772bc0969',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 2,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dd5623e5-abf9-479f-980f-a878f58f878a' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'ScreenType')) BEGIN
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
            'dd5623e5-abf9-479f-980f-a878f58f878a',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 3,
            'ScreenType',
            'Screen Type',
            'Whether this screen is shown before intake begins (Welcome) or after a successful submit (Ending)',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0d777b61-d720-4d6a-81db-8833a7c7bff4' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'Title')) BEGIN
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
            '0d777b61-d720-4d6a-81db-8833a7c7bff4',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 4,
            'Title',
            'Title',
            'Headline shown on the screen',
            'nvarchar',
            1000,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ae0569d6-7b7d-4866-8a43-7a32742083d0' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'Body')) BEGIN
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
            'ae0569d6-7b7d-4866-8a43-7a32742083d0',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 5,
            'Body',
            'Body',
            'Body copy shown under the title. Plain text — the widget does not render HTML from this column',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '33293d30-0c67-477f-b21e-a737ff3860b0' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'ButtonLabel')) BEGIN
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
            '33293d30-0c67-477f-b21e-a737ff3860b0',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 6,
            'ButtonLabel',
            'Button Label',
            'Label for the screens single button. The widget supplies Start / Done when this is blank',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1c327b5b-24da-42e4-ad5e-82c27eae804d' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'MediaURL')) BEGIN
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
            '1c327b5b-24da-42e4-ad5e-82c27eae804d',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 7,
            'MediaURL',
            'Media URL',
            'Optional image shown above the title',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '672bf4fe-4673-4912-902b-b8a1e41a9806' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'RedirectURL')) BEGIN
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
            '672bf4fe-4673-4912-902b-b8a1e41a9806',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 8,
            'RedirectURL',
            'Redirect URL',
            'Ending only: send the respondent here instead of showing this screen. Takes precedence over the form-wide redirect in Form.Settings',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '56d1a7d1-394e-477a-9e03-79be9dba1598' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'DisplayOrder')) BEGIN
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
            '56d1a7d1-394e-477a-9e03-79be9dba1598',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 9,
            'DisplayOrder',
            'Display Order',
            'Order among the forms Ending screens. Resolution walks them in this order and takes the first whose ConditionalRule the answers satisfy',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a415fc2e-31ee-4817-98ae-457d21527cef' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'ConditionalRule')) BEGIN
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
            'a415fc2e-31ee-4817-98ae-457d21527cef',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 10,
            'ConditionalRule',
            'Conditional Rule',
            'Ending only: JSON ConditionalRule deciding whether this ending applies to a given response. Unlike a page rule, a blank rule here does NOT mean always — it means this screen is only reachable as the default',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2448e280-b435-4b75-9c68-4db2af63d664' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'IsDefault')) BEGIN
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
            '2448e280-b435-4b75-9c68-4db2af63d664',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 11,
            'IsDefault',
            'Is Default',
            'Ending only: the fallback shown when no conditional ending matched',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '47a0fbd1-6905-474f-a7bc-fab6c4a4378d' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = '__mj_CreatedAt')) BEGIN
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
            '47a0fbd1-6905-474f-a7bc-fab6c4a4378d',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 12,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd20e07ae-275a-4fe2-9aa4-a761dc65d543' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd20e07ae-275a-4fe2-9aa4-a761dc65d543',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 13,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks';

-- NOTE on the guards below. CodeGen emits these picklist rows as bare INSERTs carrying two fixed
-- ids: their own, and the EntityField they describe. Both need fencing, for different reasons.
--
-- Their own id, because a re-run would otherwise duplicate-key.
--
-- The FIELD id, because it is only correct on a database where THIS migration created that field.
-- On a host whose FormScreen fields already exist, the guarded field INSERT above matches on
-- (EntityID, Name) and skips, so the fixed field id never comes into being and the picklist row
-- would point at nothing — a foreign-key violation that fails the whole migration. Which is not
-- hypothetical: it is what MJ_ATS_Dev did the first time this file was run against it. Skipping
-- is the right answer there, because such a host already has these rows under its own ids.
/* SQL text to insert entity field value with ID a3807a5d-b745-4aa1-8c9c-97a37c3f0651 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'a3807a5d-b745-4aa1-8c9c-97a37c3f0651')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a3807a5d-b745-4aa1-8c9c-97a37c3f0651', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 1, 'Address', 'Address', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa2bf74b-24ac-4d96-9f10-27346bab97da */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'fa2bf74b-24ac-4d96-9f10-27346bab97da')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa2bf74b-24ac-4d96-9f10-27346bab97da', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 2, 'Checkbox', 'Checkbox', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dbc3c8c1-1dff-4f02-9763-c13cbc45b1e2', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 3, 'ContactInfo', 'ContactInfo', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8495c7f4-b9b7-4cc4-86dc-f3aacdbb5d47', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 8, 'Legal', 'Legal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 04098387-4e62-4e1f-ae86-cd23a64d2c10 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '04098387-4e62-4e1f-ae86-cd23a64d2c10')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('04098387-4e62-4e1f-ae86-cd23a64d2c10', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 10, 'Matrix', 'Matrix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 31b4c610-bd86-4eb8-bca1-7928d32bc7e4 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '31b4c610-bd86-4eb8-bca1-7928d32bc7e4')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('31b4c610-bd86-4eb8-bca1-7928d32bc7e4', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 14, 'OpinionScale', 'OpinionScale', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5586b396-3160-41ee-9957-f6cafc8246b7 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '5586b396-3160-41ee-9957-f6cafc8246b7')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5586b396-3160-41ee-9957-f6cafc8246b7', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 16, 'PictureChoice', 'PictureChoice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 38150e25-0f5c-43b1-b583-8d3e678ce2b8 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '38150e25-0f5c-43b1-b583-8d3e678ce2b8')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('38150e25-0f5c-43b1-b583-8d3e678ce2b8', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 17, 'Ranking', 'Ranking', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d4a3d852-21ca-41e5-977d-6297b1f33b11 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'd4a3d852-21ca-41e5-977d-6297b1f33b11')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d4a3d852-21ca-41e5-977d-6297b1f33b11', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 20, 'Signature', 'Signature', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9a56b49b-d201-4e20-9a88-2c0fb57e2bfc */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '9a56b49b-d201-4e20-9a88-2c0fb57e2bfc')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '0A4FF448-80DF-4D5D-94EC-E315822A1B45')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a56b49b-d201-4e20-9a88-2c0fb57e2bfc', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 24, 'Website', 'Website', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='B603B9EE-E9F1-41A8-8D9C-500160F70C92';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='6E88EEEC-0C44-413B-9ADD-C1DD8D325215';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='2D1336BF-066E-402B-A823-8D94AB544EA2';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='F7963BB8-B712-40DD-A7B5-9B18A5B14AE1';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=9 WHERE ID='BEF3DC65-2DBE-4D98-8675-696A2BE17A59';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=11 WHERE ID='7C8BE7C9-6A4F-454C-A855-81751FB8955E';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=12 WHERE ID='7AF7260D-177F-413F-AABC-A07121C4F538';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=13 WHERE ID='236665A7-F0CA-4254-92E7-106DCD6DFD35';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='47B88450-FDA8-4A13-BEC7-38C6A7F2DAEE';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=18 WHERE ID='5A836273-74FD-4D37-8918-A1CB0F5DEE57';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=19 WHERE ID='753C2962-6D2A-4081-8869-231CF37A15C8';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=21 WHERE ID='4B4B6B5E-54F8-433F-BB63-CD271191D464';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=22 WHERE ID='D17F31F1-CFDA-4684-9F76-CA0C8C17129B';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=23 WHERE ID='F99A1046-5229-43FB-B95B-394208573996';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=25 WHERE ID='00CD7332-1881-48DE-AE14-16D3A89C7835';

/* SQL text to insert entity field value with ID a2456d01-1dcf-4f55-a6e9-8561f334c910 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'a2456d01-1dcf-4f55-a6e9-8561f334c910')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '2AEDEBA3-97E7-4A5C-AE73-63D110DA037C')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2456d01-1dcf-4f55-a6e9-8561f334c910', '2AEDEBA3-97E7-4A5C-AE73-63D110DA037C', 1, 'Column', 'Column', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8a3347c9-b0de-4f78-b376-8416ac8fac42 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '8a3347c9-b0de-4f78-b376-8416ac8fac42')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = '2AEDEBA3-97E7-4A5C-AE73-63D110DA037C')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8a3347c9-b0de-4f78-b376-8416ac8fac42', '2AEDEBA3-97E7-4A5C-AE73-63D110DA037C', 2, 'Row', 'Row', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2AEDEBA3-97E7-4A5C-AE73-63D110DA037C */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='2AEDEBA3-97E7-4A5C-AE73-63D110DA037C';

/* SQL text to insert entity field value with ID 5f0484e2-b2b6-4e5c-9783-e97120b0ee2e */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '5f0484e2-b2b6-4e5c-9783-e97120b0ee2e')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = 'DD5623E5-ABF9-479F-980F-A878F58F878A')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f0484e2-b2b6-4e5c-9783-e97120b0ee2e', 'DD5623E5-ABF9-479F-980F-A878F58F878A', 1, 'Ending', 'Ending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f47fcce7-8640-466d-9117-e919a72f9135 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'f47fcce7-8640-466d-9117-e919a72f9135')
   AND EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = 'DD5623E5-ABF9-479F-980F-A878F58F878A')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f47fcce7-8640-466d-9117-e919a72f9135', 'DD5623E5-ABF9-479F-980F-A878F58F878A', 2, 'Welcome', 'Welcome', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DD5623E5-ABF9-479F-980F-A878F58F878A */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='DD5623E5-ABF9-479F-980F-A878F58F878A';


/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Screens (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6729890a-d62c-4806-8fd3-3ce466fd0395'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6729890a-d62c-4806-8fd3-3ce466fd0395', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), 'FormID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks';

/* Index for Foreign Keys for FormPage */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormPage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormPage_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormPage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormPage_FormID ON [${flyway:defaultSchema}].[FormPage] ([FormID]);

/* Index for Foreign Keys for FormQuestionOption */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QuestionID in table FormQuestionOption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestionOption_QuestionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestionOption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestionOption_QuestionID ON [${flyway:defaultSchema}].[FormQuestionOption] ([QuestionID]);

/* Base View SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: vwFormPages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Pages
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormPage
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormPages]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormPages];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormPages]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormPage] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormPages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: Permissions for vwFormPages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormPages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spCreateFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormPage]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @IsPartialSubmitPoint bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormPage]
            (
                [ID],
                [FormID],
                [Title],
                [Description],
                [DisplayOrder],
                [ConditionalRule],
                [IsPartialSubmitPoint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                ISNULL(@IsPartialSubmitPoint, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormPage]
            (
                [FormID],
                [Title],
                [Description],
                [DisplayOrder],
                [ConditionalRule],
                [IsPartialSubmitPoint]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                ISNULL(@IsPartialSubmitPoint, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormPages] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormPage] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormPage] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spUpdateFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormPage]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @IsPartialSubmitPoint bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormPage]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [IsPartialSubmitPoint] = ISNULL(@IsPartialSubmitPoint, [IsPartialSubmitPoint])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormPages] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormPages]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormPage] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormPage table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormPage]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormPage];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormPage
ON [${flyway:defaultSchema}].[FormPage]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormPage]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormPage] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormPage] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: vwFormQuestionOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Question Options
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormQuestionOption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormQuestionOptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormQuestionOptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormQuestionOptions]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FormQuestionOption] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestionOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: Permissions for vwFormQuestionOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestionOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spCreateFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestionOption]
    @ID uniqueidentifier = NULL,
    @QuestionID uniqueidentifier,
    @Label nvarchar(500),
    @Value_Clear bit = 0,
    @Value nvarchar(500) = NULL,
    @DisplayOrder int = NULL,
    @IsDefault bit = NULL,
    @ImageURL_Clear bit = 0,
    @ImageURL nvarchar(1000) = NULL,
    @MatrixAxis_Clear bit = 0,
    @MatrixAxis nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormQuestionOption]
            (
                [ID],
                [QuestionID],
                [Label],
                [Value],
                [DisplayOrder],
                [IsDefault],
                [ImageURL],
                [MatrixAxis]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QuestionID,
                @Label,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                ISNULL(@DisplayOrder, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @ImageURL_Clear = 1 THEN NULL ELSE ISNULL(@ImageURL, NULL) END,
                CASE WHEN @MatrixAxis_Clear = 1 THEN NULL ELSE ISNULL(@MatrixAxis, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormQuestionOption]
            (
                [QuestionID],
                [Label],
                [Value],
                [DisplayOrder],
                [IsDefault],
                [ImageURL],
                [MatrixAxis]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QuestionID,
                @Label,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                ISNULL(@DisplayOrder, 0),
                ISNULL(@IsDefault, 0),
                CASE WHEN @ImageURL_Clear = 1 THEN NULL ELSE ISNULL(@ImageURL, NULL) END,
                CASE WHEN @MatrixAxis_Clear = 1 THEN NULL ELSE ISNULL(@MatrixAxis, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormQuestionOptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spUpdateFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestionOption]
    @ID uniqueidentifier,
    @QuestionID uniqueidentifier = NULL,
    @Label nvarchar(500) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(500) = NULL,
    @DisplayOrder int = NULL,
    @IsDefault bit = NULL,
    @ImageURL_Clear bit = 0,
    @ImageURL nvarchar(1000) = NULL,
    @MatrixAxis_Clear bit = 0,
    @MatrixAxis nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestionOption]
    SET
        [QuestionID] = ISNULL(@QuestionID, [QuestionID]),
        [Label] = ISNULL(@Label, [Label]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [ImageURL] = CASE WHEN @ImageURL_Clear = 1 THEN NULL ELSE ISNULL(@ImageURL, [ImageURL]) END,
        [MatrixAxis] = CASE WHEN @MatrixAxis_Clear = 1 THEN NULL ELSE ISNULL(@MatrixAxis, [MatrixAxis]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormQuestionOptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormQuestionOptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestionOption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormQuestionOption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormQuestionOption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormQuestionOption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormQuestionOption
ON [${flyway:defaultSchema}].[FormQuestionOption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestionOption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormQuestionOption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spDeleteFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormPage]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormPage]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormPage] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormPage] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spDeleteFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestionOption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormQuestionOption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID ED6C3D61-FBD9-40CE-95F3-535772BC0969 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ED6C3D61-FBD9-40CE-95F3-535772BC0969', @RelatedEntityNameFieldMap='Form';

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
    @IsDefault bit = NULL
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
                [IsDefault]
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
                ISNULL(@IsDefault, 0)
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
                [IsDefault]
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
                ISNULL(@IsDefault, 0)
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
    @IsDefault bit = NULL
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
        [IsDefault] = ISNULL(@IsDefault, [IsDefault])
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

/* SQL text to delete unneeded entity fields (3 scoped entities) */
DECLARE @ScopedEntityIDs NVARCHAR(200) = (
    SELECT TOP 1 CONVERT(NVARCHAR(50), [ID]) FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
) + ',BF3016E2-8BA7-4975-83B6-02C9435C1441,A3BFAA2D-3158-4EED-9934-76D1E35D20F6';
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks', @EntityIDs=@ScopedEntityIDs;

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3cc65fc2-7770-407a-96f0-12e9482cb6ad' OR (EntityID = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}') AND Name = 'Form')) BEGIN
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
            '3cc65fc2-7770-407a-96f0-12e9482cb6ad',
            (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')) + 14,
            'Form',
            'Form',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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

/* SQL text to update existing entity fields from schema (3 scoped entities) */
DECLARE @ScopedEntityIDs2 NVARCHAR(200) = (
    SELECT TOP 1 CONVERT(NVARCHAR(50), [ID]) FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
) + ',BF3016E2-8BA7-4975-83B6-02C9435C1441,A3BFAA2D-3158-4EED-9934-76D1E35D20F6';
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks', @EntityIDs=@ScopedEntityIDs2;

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks';

/* Set field properties for entity */

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0D777B61-D720-4D6A-81DB-8833A7C7BFF4'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DD5623E5-ABF9-479F-980F-A878F58F878A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0D777B61-D720-4D6A-81DB-8833A7C7BFF4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '56D1A7D1-394E-477A-9E03-79BE9DBA1598'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3CC65FC2-7770-407A-96F0-12E9482CB6AD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D777B61-D720-4D6A-81DB-8833A7C7BFF4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0D777B61-D720-4D6A-81DB-8833A7C7BFF4'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AB148E9F-A1B9-48EA-8B27-1A60B9148A14'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '994DCC05-13CF-45B4-B70D-4EF00E053997' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A491CD71-2032-48C4-9579-23AC41803627' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7586E5E7-058E-4172-B75A-F322768D89AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.QuestionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3E792A1-6B2B-448E-95B1-0C2ECAB5FEBC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.Label 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02B3434B-2660-4665-B1D7-383876ADFC24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.Value 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34062C98-E7F1-4000-8E98-AC020B1B7225' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AFEEA024-7E9F-4C98-AEE1-0332D898C101' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '405711DF-CDB0-4FFA-88AF-AF9D9E971FCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.ImageURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'E0719ECE-CEDA-45C9-B02F-18D856C7E402' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.MatrixAxis 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2AEDEBA3-97E7-4A5C-AE73-63D110DA037C' AND AutoUpdateCategory = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '499A1F6F-ED7B-4A6B-9F41-CE033E0F4117' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89AC8052-1B77-4569-90D5-90B7C4E7EDFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E12E031-C7D1-495D-9D51-86B9693C6D08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCA0C023-9DAC-4610-BE75-B992961F0D73' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '885257F0-F6A9-4999-8C07-6B5764C3B8A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A6895D0E-FBF5-420B-924A-F6BFDE686F0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '888297D3-E8C8-4BC2-BA81-7583B2987424' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.IsPartialSubmitPoint 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Structure & Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB148E9F-A1B9-48EA-8B27-1A60B9148A14' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Title 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9E0B37B-2360-49E9-B0F5-09D27718E771' AND AutoUpdateCategory = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C51E4C9E-A081-47E8-AAD6-0BEB98C1EE05' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ED6C3D61-FBD9-40CE-95F3-535772BC0969' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3CC65FC2-7770-407A-96F0-12E9482CB6AD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ScreenType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD5623E5-ABF9-479F-980F-A878F58F878A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Title 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D777B61-D720-4D6A-81DB-8833A7C7BFF4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Body 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE0569D6-7B7D-4866-8A43-7A32742083D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ButtonLabel 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33293D30-0C67-477F-B21E-A737FF3860B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.MediaURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Content',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '1C327B5B-24DA-42E4-AD5E-82C27EAE804D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.RedirectURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '672BF4FE-4673-4912-902B-B8A1E41A9806' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '56D1A7D1-394E-477A-9E03-79BE9DBA1598' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A415FC2E-31EE-4817-98AE-457D21527CEF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2448E280-B435-4B75-9C68-4DB2AF63D664' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47A0FBD1-6905-474F-A7BC-FAB6C4A4378D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D20E07AE-275A-4FE2-9AA4-A761DC65D543' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-alt */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-file-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}');

/* Insert FieldCategoryInfo setting for entity */

               IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [ID] = 'b2299181-df86-4e81-adaf-6eb05fc8cd34')


               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b2299181-df86-4e81-adaf-6eb05fc8cd34', (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), 'FieldCategoryInfo', '{"Form Association":{"icon":"fa fa-link","description":"Links the screen to its parent form entity"},"Screen Configuration":{"icon":"fa fa-sliders-h","description":"Basic configuration settings for the screen type"},"Screen Content":{"icon":"fa fa-align-left","description":"Visual content and text displayed on the screen"},"Behavioral Rules":{"icon":"fa fa-code-branch","description":"Logic governing redirects, conditional display, and ordering"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [ID] = '697cc89e-0c85-4902-831a-b60f80c2fd88')


               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('697cc89e-0c85-4902-831a-b60f80c2fd88', (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'), 'FieldCategoryIcons', '{"Form Association":"fa fa-link","Screen Configuration":"fa fa-sliders-h","Screen Content":"fa fa-align-left","Behavioral Rules":"fa fa-code-branch","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}');
