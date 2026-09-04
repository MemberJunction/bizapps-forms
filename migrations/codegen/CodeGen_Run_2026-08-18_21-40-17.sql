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
         'a1f8cc58-b040-429c-b695-70db0e9e7327',
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
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'a1f8cc58-b040-429c-b695-70db0e9e7327', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a1f8cc58-b040-429c-b695-70db0e9e7327', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a1f8cc58-b040-429c-b695-70db0e9e7327', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Screens for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a1f8cc58-b040-429c-b695-70db0e9e7327', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
UPDATE [${flyway:defaultSchema}].[FormScreen] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD CONSTRAINT [DF___mj_BizAppsForms_FormScreen___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
UPDATE [${flyway:defaultSchema}].[FormScreen] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormScreen */
ALTER TABLE [${flyway:defaultSchema}].[FormScreen] ADD CONSTRAINT [DF___mj_BizAppsForms_FormScreen___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '262ac597-8c95-43c3-a3c5-9064688ea0eb' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'ImageURL')) BEGIN
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
            '262ac597-8c95-43c3-a3c5-9064688ea0eb',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f04ceff1-1118-4357-b85b-4d89ab2076dc' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'MatrixAxis')) BEGIN
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
            'f04ceff1-1118-4357-b85b-4d89ab2076dc',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '854bba43-2290-4a97-bb81-551b59ffdbec' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'ID')) BEGIN
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
            '854bba43-2290-4a97-bb81-551b59ffdbec',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a106ca10-7538-4646-916b-b647ef2153bc' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'FormID')) BEGIN
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
            'a106ca10-7538-4646-916b-b647ef2153bc',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 2,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4e65e26a-8ce3-4726-b463-7676eae3a8e1' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'ScreenType')) BEGIN
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
            '4e65e26a-8ce3-4726-b463-7676eae3a8e1',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 3,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f7262737-345b-4994-a3fc-03275446dfd0' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'Title')) BEGIN
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
            'f7262737-345b-4994-a3fc-03275446dfd0',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dd2f05b2-4a0f-4a3e-a371-c5cfee2441d2' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'Body')) BEGIN
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
            'dd2f05b2-4a0f-4a3e-a371-c5cfee2441d2',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 5,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7d477c75-70ff-4b66-a8c6-df3565b0c7fd' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'ButtonLabel')) BEGIN
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
            '7d477c75-70ff-4b66-a8c6-df3565b0c7fd',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 6,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ed70e88f-b1dd-45bd-9305-dee79c2dae83' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'MediaURL')) BEGIN
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
            'ed70e88f-b1dd-45bd-9305-dee79c2dae83',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f393f61a-a698-4f5a-8b87-0256a8d6de42' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'RedirectURL')) BEGIN
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
            'f393f61a-a698-4f5a-8b87-0256a8d6de42',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f06baca9-dd58-49d9-9f6c-4be202dc52d8' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'DisplayOrder')) BEGIN
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
            'f06baca9-dd58-49d9-9f6c-4be202dc52d8',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7d9cdd52-b555-4eea-8936-194cdad940ec' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'ConditionalRule')) BEGIN
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
            '7d9cdd52-b555-4eea-8936-194cdad940ec',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0cff820e-21d2-4441-945f-cc38d3bd0d6f' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'IsDefault')) BEGIN
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
            '0cff820e-21d2-4441-945f-cc38d3bd0d6f',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 11,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0c0004f1-c84b-423d-a6b0-0f498fce21c6' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0c0004f1-c84b-423d-a6b0-0f498fce21c6',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dc740c88-97ed-4e28-a29d-57dcd5e8c42e' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'dc740c88-97ed-4e28-a29d-57dcd5e8c42e',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7019855a-6960-4b8f-afe3-4aea958cc18d' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'IsPartialSubmitPoint')) BEGIN
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
            '7019855a-6960-4b8f-afe3-4aea958cc18d',
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* SQL text to insert entity field value with ID 5d587f79-a892-480e-9bb7-0faab51a02ee */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5d587f79-a892-480e-9bb7-0faab51a02ee', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 1, 'Address', 'Address', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cf1b0969-f0fe-4ccd-8090-8db90878a8c2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cf1b0969-f0fe-4ccd-8090-8db90878a8c2', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 2, 'Checkbox', 'Checkbox', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 359c97df-42cd-4db0-acdd-dde76f0cc16a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('359c97df-42cd-4db0-acdd-dde76f0cc16a', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 3, 'ContactInfo', 'ContactInfo', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 210e6c6b-abc5-4cb8-9fb0-bbe065abe0d7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('210e6c6b-abc5-4cb8-9fb0-bbe065abe0d7', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 8, 'Legal', 'Legal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4a60e7fc-30bd-4614-a6a1-0e4b6d2650e7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4a60e7fc-30bd-4614-a6a1-0e4b6d2650e7', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 10, 'Matrix', 'Matrix', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 727315f8-ad60-4899-99be-ce2d1a841b29 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('727315f8-ad60-4899-99be-ce2d1a841b29', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 14, 'OpinionScale', 'OpinionScale', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 398e4f99-911d-4346-900e-f7955a248684 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('398e4f99-911d-4346-900e-f7955a248684', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 16, 'PictureChoice', 'PictureChoice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1df5702b-3b22-478d-b5b7-42d2301cbbb0 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1df5702b-3b22-478d-b5b7-42d2301cbbb0', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 17, 'Ranking', 'Ranking', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 825d9dcf-0db0-48ee-a710-e15f7364ec3a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('825d9dcf-0db0-48ee-a710-e15f7364ec3a', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 20, 'Signature', 'Signature', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e5356f2b-eaa7-4972-af3a-0be92ad20d2d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e5356f2b-eaa7-4972-af3a-0be92ad20d2d', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 24, 'Website', 'Website', GETUTCDATE(), GETUTCDATE());

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

/* SQL text to insert entity field value with ID 6081a517-0db2-4272-8c5a-6ae81638d087 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6081a517-0db2-4272-8c5a-6ae81638d087', 'F04CEFF1-1118-4357-B85B-4D89AB2076DC', 1, 'Column', 'Column', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d494e8f7-40ef-403e-aae7-b636f4067c8c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d494e8f7-40ef-403e-aae7-b636f4067c8c', 'F04CEFF1-1118-4357-B85B-4D89AB2076DC', 2, 'Row', 'Row', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F04CEFF1-1118-4357-B85B-4D89AB2076DC */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='F04CEFF1-1118-4357-B85B-4D89AB2076DC';

/* SQL text to insert entity field value with ID 207e84e3-a350-4199-82b4-4c23c6426b25 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('207e84e3-a350-4199-82b4-4c23c6426b25', '4E65E26A-8CE3-4726-B463-7676EAE3A8E1', 1, 'Ending', 'Ending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ba07b88f-73b5-4c57-a436-568498774c41 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ba07b88f-73b5-4c57-a436-568498774c41', '4E65E26A-8CE3-4726-B463-7676EAE3A8E1', 2, 'Welcome', 'Welcome', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4E65E26A-8CE3-4726-B463-7676EAE3A8E1 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='4E65E26A-8CE3-4726-B463-7676EAE3A8E1';


/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Screens (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f3063e0c-7b0a-4b29-8f0c-86450e15f6d3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f3063e0c-7b0a-4b29-8f0c-86450e15f6d3', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'A1F8CC58-B040-429C-B695-70DB0E9E7327', 'FormID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

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

/* SQL text to update entity field related entity name field map for entity field ID A106CA10-7538-4646-916B-B647EF2153BC */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A106CA10-7538-4646-916B-B647EF2153BC', @RelatedEntityNameFieldMap='Form';

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
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber', @EntityIDs='A1F8CC58-B040-429C-B695-70DB0E9E7327,BF3016E2-8BA7-4975-83B6-02C9435C1441,A3BFAA2D-3158-4EED-9934-76D1E35D20F6';

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '41b8b19a-edb2-4934-b332-2a3329deb5ed' OR (EntityID = 'A1F8CC58-B040-429C-B695-70DB0E9E7327' AND Name = 'Form')) BEGIN
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
            '41b8b19a-edb2-4934-b332-2a3329deb5ed',
            'A1F8CC58-B040-429C-B695-70DB0E9E7327', -- Entity: MJ_BizApps_Forms: Form Screens
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327') + 14,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber', @EntityIDs='A1F8CC58-B040-429C-B695-70DB0E9E7327,BF3016E2-8BA7-4975-83B6-02C9435C1441,A3BFAA2D-3158-4EED-9934-76D1E35D20F6';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_bizappscommon,${mjSchema}_bizappstasks,${mjSchema}_BizAppsATS,${mjSchema}_BizAppsCaliber';

/* Set field properties for entity */

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F7262737-345B-4994-A3FC-03275446DFD0'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4E65E26A-8CE3-4726-B463-7676EAE3A8E1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F7262737-345B-4994-A3FC-03275446DFD0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F06BACA9-DD58-49D9-9F6C-4BE202DC52D8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0CFF820E-21D2-4441-945F-CC38D3BD0D6F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F7262737-345B-4994-A3FC-03275446DFD0'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'F7262737-345B-4994-A3FC-03275446DFD0'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7019855A-6960-4B8F-AFE3-4AEA958CC18D'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6'
            AND AutoUpdateAllowUserSearchAPI = 1;

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
   ID = '7019855A-6960-4B8F-AFE3-4AEA958CC18D' AND AutoUpdateCategory = 1;

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
   ID = '262AC597-8C95-43C3-A3C5-9064688EA0EB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.MatrixAxis 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F04CEFF1-1118-4357-B85B-4D89AB2076DC' AND AutoUpdateCategory = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '854BBA43-2290-4A97-BB81-551B59FFDBEC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A106CA10-7538-4646-916B-B647EF2153BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41B8B19A-EDB2-4934-B332-2A3329DEB5ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ScreenType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Screen Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4E65E26A-8CE3-4726-B463-7676EAE3A8E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Title 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7262737-345B-4994-A3FC-03275446DFD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.Body 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD2F05B2-4A0F-4A3E-A371-C5CFEE2441D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ButtonLabel 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D477C75-70FF-4B66-A8C6-DF3565B0C7FD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.MediaURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Content',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'ED70E88F-B1DD-45BD-9305-DEE79C2DAE83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.RedirectURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F393F61A-A698-4F5A-8B87-0256A8D6DE42' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F06BACA9-DD58-49D9-9F6C-4BE202DC52D8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '7D9CDD52-B555-4EEA-8936-194CDAD940EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Behavioral Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0CFF820E-21D2-4441-945F-CC38D3BD0D6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C0004F1-C84B-423D-A6B0-0F498FCE21C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Screens.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC740C88-97ED-4E28-A29D-57DCD5E8C42E' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-window-maximize */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-window-maximize', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e8b5fabc-290d-4c05-b758-cf7fafea58cf', 'A1F8CC58-B040-429C-B695-70DB0E9E7327', 'FieldCategoryInfo', '{"Form Association":{"icon":"fa fa-link","description":"Links the screen to the parent form entity"},"Screen Configuration":{"icon":"fa fa-cog","description":"Fundamental settings defining the screen''s purpose"},"Content":{"icon":"fa fa-align-left","description":"Visual and textual content displayed on the screen"},"Behavioral Rules":{"icon":"fa fa-project-diagram","description":"Logic and routing rules for form flow and endings"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0215a865-e0c6-4485-8aa2-fdac9f8e7c1f', 'A1F8CC58-B040-429C-B695-70DB0E9E7327', 'FieldCategoryIcons', '{"Form Association":"fa fa-link","Screen Configuration":"fa fa-cog","Content":"fa fa-align-left","Behavioral Rules":"fa fa-project-diagram","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A1F8CC58-B040-429C-B695-70DB0E9E7327';

