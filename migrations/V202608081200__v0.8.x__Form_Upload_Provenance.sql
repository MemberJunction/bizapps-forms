-- =============================================================================
-- FormUpload — the upload provenance ledger
--
-- Fulfils plans/UPLOAD_PROVENANCE_LEDGER_SPEC.md and closes F-SEC-1.
--
-- WHY THIS EXISTS. `__mj.File` carries no owner column and no row-level security, so the foreign
-- key on a submitted `fileId` proves the file EXISTS — not that the respondent submitting it is
-- the one who uploaded it. Today that is contained, because a file id only reaches
-- FormResponseAnswer. The moment a binding copies one onto a business record other users can read,
-- "a respondent can name any file" becomes cross-tenant disclosure. This table is what lets the
-- submit path and the binding executor tell those two apart.
--
-- WHO WRITES IT (decision DG-12a). The Forms upload endpoint, under an elevated principal — never
-- the anonymous respondent. The alternative on the table was granting the anonymous role
-- CanCreate here, and that defeats the control entirely: every IncludeInAPI entity gets a
-- generated GraphQL CreateRecord mutation gated on the session's synthesized roles, so an
-- anonymous session holding that grant could mint its own provenance row for any file id it liked
-- and the check would confirm the forgery. A ledger the anonymous role can write is not a ledger.
--
-- The elevation is also strictly LESS privilege than today: the anonymous role currently holds no
-- `MJ: Files` grant at all, so the upload path was failing default-deny on a clean install
-- (F-SEC-2). Moving the File write to the endpoint's principal fixes that without granting the
-- anonymous internet the ability to create File rows.
-- =============================================================================

CREATE TABLE __mj_BizAppsForms.FormUpload (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FileID UNIQUEIDENTIFIER NOT NULL,
    DistributionID UNIQUEIDENTIFIER NOT NULL,
    FormID UNIQUEIDENTIFIER NOT NULL,
    QuestionID UNIQUEIDENTIFIER NULL,
    ResponseDraftID UNIQUEIDENTIFIER NULL,
    AnonymousSessionID NVARCHAR(255) NULL,
    UploadedByUserID UNIQUEIDENTIFIER NULL,
    ProviderKey NVARCHAR(1000) NULL,
    FileName NVARCHAR(500) NULL,
    ContentType NVARCHAR(255) NULL,
    SizeBytes BIGINT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_FormUpload PRIMARY KEY (ID),
    CONSTRAINT FK_FormUpload_File FOREIGN KEY (FileID) REFERENCES __mj.[File](ID),
    CONSTRAINT FK_FormUpload_Distribution FOREIGN KEY (DistributionID) REFERENCES __mj_BizAppsForms.FormDistribution(ID),
    CONSTRAINT FK_FormUpload_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT FK_FormUpload_Question FOREIGN KEY (QuestionID) REFERENCES __mj_BizAppsForms.FormQuestion(ID),
    CONSTRAINT FK_FormUpload_UploadedByUser FOREIGN KEY (UploadedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_FormUpload_Status CHECK (Status IN ('Active', 'Revoked'))
);
GO

-- One ledger row per file. A second row for the same file would mean two different stories about
-- where it came from, and the check has no way to choose between them.
CREATE UNIQUE INDEX UQ_FormUpload_File ON __mj_BizAppsForms.FormUpload (FileID);
GO

-- The verification lookup is by file; these two serve the correlation checks and the orphan sweep.
CREATE INDEX IX_FormUpload_ResponseDraft ON __mj_BizAppsForms.FormUpload (ResponseDraftID);
GO
CREATE INDEX IX_FormUpload_Session ON __mj_BizAppsForms.FormUpload (AnonymousSessionID);
GO

-- =============================================================================
-- EXTENDED PROPERTIES
-- =============================================================================
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. __mj.File has no owner column, so this is the only evidence of who produced a file',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The uploaded file',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'FileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The distribution the upload was made through. The hard scope every provenance check enforces',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'DistributionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'FormID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The question the file answers',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'QuestionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'ResponseDraftID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The anonymous session id at upload time. A fallback correlation key; blank is tolerated',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'AnonymousSessionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'UploadedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Storage key of the file, so the Forms path prefix can be checked without loading the file row',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'ProviderKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Original sanitized filename',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'FileName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Stored content type',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'ContentType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size in bytes',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'SizeBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormUpload', @level2type = N'COLUMN', @level2name = N'Status';
GO

-- =============================================================================
-- CodeGen output for FormUpload (view, CRUD procedures, and the __mj metadata rows).
-- Appended per migrations/CLAUDE.md so a fresh environment gets the entity, not just
-- the table. Generated by `npm run mj:codegen` after applying the DDL above.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Forms: Form Uploads */

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
         '890ae739-1a57-4070-9358-d1788cc2c4c0',
         'MJ_BizApps_Forms: Form Uploads',
         'Form Uploads',
         'Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. ${mjSchema}.File has no owner column, so this is the only evidence of who produced a file',
         NULL,
         'FormUpload',
         'vwFormUploads',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Uploads to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '890ae739-1a57-4070-9358-d1788cc2c4c0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormUpload */
UPDATE [${flyway:defaultSchema}].[FormUpload] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ADD CONSTRAINT [DF___mj_BizAppsForms_FormUpload___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormUpload */
UPDATE [${flyway:defaultSchema}].[FormUpload] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormUpload */
ALTER TABLE [${flyway:defaultSchema}].[FormUpload] ADD CONSTRAINT [DF___mj_BizAppsForms_FormUpload___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 15 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c148decf-f6f8-444d-aac7-ef9c4a05459c' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'ID')) BEGIN
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
            'c148decf-f6f8-444d-aac7-ef9c4a05459c',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100001,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '42cb99dc-8808-4841-b796-44342b63319d' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'FileID')) BEGIN
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
            '42cb99dc-8808-4841-b796-44342b63319d',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100002,
            'FileID',
            'File ID',
            'The uploaded file',
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1e1b7555-7da3-4ebc-82f9-69cfb6054381' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'DistributionID')) BEGIN
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
            '1e1b7555-7da3-4ebc-82f9-69cfb6054381',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100003,
            'DistributionID',
            'Distribution ID',
            'The distribution the upload was made through. The hard scope every provenance check enforces',
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
            '1FC60BDA-25B8-473B-ACE5-1238670D3535',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6130fd61-5262-4eaa-98bd-43b98941012c' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'FormID')) BEGIN
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
            '6130fd61-5262-4eaa-98bd-43b98941012c',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100004,
            'FormID',
            'Form ID',
            'The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '746f2f72-c1f6-4f4a-9da6-60fa354d6c6e' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'QuestionID')) BEGIN
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
            '746f2f72-c1f6-4f4a-9da6-60fa354d6c6e',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100005,
            'QuestionID',
            'Question ID',
            'The question the file answers',
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
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'db577f23-8a40-4db1-9ecf-664dd79836c8' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'ResponseDraftID')) BEGIN
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
            'db577f23-8a40-4db1-9ecf-664dd79836c8',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100006,
            'ResponseDraftID',
            'Response Draft ID',
            'The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '467428dc-3a6e-4ced-a0ea-eeab2c7ecedf' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'AnonymousSessionID')) BEGIN
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
            '467428dc-3a6e-4ced-a0ea-eeab2c7ecedf',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100007,
            'AnonymousSessionID',
            'Anonymous Session ID',
            'The anonymous session id at upload time. A fallback correlation key; blank is tolerated',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '01b65515-ad70-413d-8917-4c2423341f15' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'UploadedByUserID')) BEGIN
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
            '01b65515-ad70-413d-8917-4c2423341f15',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100008,
            'UploadedByUserID',
            'Uploaded By User ID',
            'The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd8670159-ce1a-4bb1-98ae-eea73ad81a1a' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'ProviderKey')) BEGIN
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
            'd8670159-ce1a-4bb1-98ae-eea73ad81a1a',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100009,
            'ProviderKey',
            'Provider Key',
            'Storage key of the file, so the Forms path prefix can be checked without loading the file row',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '666f4e03-791c-4503-9bb0-357b39cf0b57' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'FileName')) BEGIN
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
            '666f4e03-791c-4503-9bb0-357b39cf0b57',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100010,
            'FileName',
            'File Name',
            'Original sanitized filename',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fe8fafbb-9c27-44f8-a2a0-91c95d39a23a' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'ContentType')) BEGIN
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
            'fe8fafbb-9c27-44f8-a2a0-91c95d39a23a',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100011,
            'ContentType',
            'Content Type',
            'Stored content type',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f27a930f-26f8-428d-b1eb-5802efc78e5f' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'SizeBytes')) BEGIN
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
            'f27a930f-26f8-428d-b1eb-5802efc78e5f',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100012,
            'SizeBytes',
            'Size Bytes',
            'Size in bytes',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c104492a-2da5-4627-bbae-6f25128be23d' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'Status')) BEGIN
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
            'c104492a-2da5-4627-bbae-6f25128be23d',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100013,
            'Status',
            'Status',
            'Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '452a1ee1-95e8-414f-b5c2-b651c8d6ce89' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = '__mj_CreatedAt')) BEGIN
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
            '452a1ee1-95e8-414f-b5c2-b651c8d6ce89',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '65fddb3d-8ef1-4d0d-bacc-569312e8ddc6' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '65fddb3d-8ef1-4d0d-bacc-569312e8ddc6',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100015,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks';

/* SQL text to insert entity field value with ID 21c5eaf7-4dba-4717-9986-0f563aef9c53 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('21c5eaf7-4dba-4717-9986-0f563aef9c53', 'C104492A-2DA5-4627-BBAE-6F25128BE23D', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0ec13542-d3bd-40ce-b1bb-676235daa3f5 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0ec13542-d3bd-40ce-b1bb-676235daa3f5', 'C104492A-2DA5-4627-BBAE-6F25128BE23D', 2, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C104492A-2DA5-4627-BBAE-6F25128BE23D */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='C104492A-2DA5-4627-BBAE-6F25128BE23D';


/* Create Entity Relationship: MJ_BizApps_Forms: Form Distributions -> MJ_BizApps_Forms: Form Uploads (One To Many via DistributionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '17c58082-ab7e-41f3-b898-b659eb732828'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17c58082-ab7e-41f3-b898-b659eb732828', '1FC60BDA-25B8-473B-ACE5-1238670D3535', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'DistributionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Forms: Form Uploads (One To Many via UploadedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0e14af4a-72fe-43a7-bae7-b1ab9545e8d9'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0e14af4a-72fe-43a7-bae7-b1ab9545e8d9', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'UploadedByUserID', 'One To Many', 1, 1, 113, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ_BizApps_Forms: Form Uploads (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '87910a4f-de28-41c0-b9b2-8be59909cf70'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('87910a4f-de28-41c0-b9b2-8be59909cf70', '29248F34-2837-EF11-86D4-6045BDEE16E6', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FileID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Uploads (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '82809106-4d66-4eb7-9d7a-29f2f131260f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('82809106-4d66-4eb7-9d7a-29f2f131260f', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FormID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Questions -> MJ_BizApps_Forms: Form Uploads (One To Many via QuestionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '76684696-dae3-4f4d-9247-d6de16af2d70'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('76684696-dae3-4f4d-9247-d6de16af2d70', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'QuestionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks';

/* Index for Foreign Keys for FormUpload */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FileID in table FormUpload
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormUpload_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormUpload]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormUpload_FileID ON [${flyway:defaultSchema}].[FormUpload] ([FileID]);

-- Index for foreign key DistributionID in table FormUpload
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormUpload_DistributionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormUpload]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormUpload_DistributionID ON [${flyway:defaultSchema}].[FormUpload] ([DistributionID]);

-- Index for foreign key FormID in table FormUpload
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormUpload_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormUpload]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormUpload_FormID ON [${flyway:defaultSchema}].[FormUpload] ([FormID]);

-- Index for foreign key QuestionID in table FormUpload
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormUpload_QuestionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormUpload]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormUpload_QuestionID ON [${flyway:defaultSchema}].[FormUpload] ([QuestionID]);

-- Index for foreign key UploadedByUserID in table FormUpload
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormUpload_UploadedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormUpload]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormUpload_UploadedByUserID ON [${flyway:defaultSchema}].[FormUpload] ([UploadedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 42CB99DC-8808-4841-B796-44342B63319D */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='42CB99DC-8808-4841-B796-44342B63319D', @RelatedEntityNameFieldMap='File';

/* SQL text to update entity field related entity name field map for entity field ID 1E1B7555-7DA3-4EBC-82F9-69CFB6054381 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1E1B7555-7DA3-4EBC-82F9-69CFB6054381', @RelatedEntityNameFieldMap='Distribution';

/* SQL text to update entity field related entity name field map for entity field ID 6130FD61-5262-4EAA-98BD-43B98941012C */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6130FD61-5262-4EAA-98BD-43B98941012C', @RelatedEntityNameFieldMap='Form';

/* SQL text to update entity field related entity name field map for entity field ID 01B65515-AD70-413D-8917-4C2423341F15 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='01B65515-AD70-413D-8917-4C2423341F15', @RelatedEntityNameFieldMap='UploadedByUser';

/* Base View SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: vwFormUploads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Uploads
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormUpload
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormUploads]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormUploads];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormUploads]
AS
SELECT
    f.*,
    MJFile_FileID.[Name] AS [File],
    mjBizAppsFormsFormDistribution_DistributionID.[Name] AS [Distribution],
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    MJUser_UploadedByUserID.[Name] AS [UploadedByUser]
FROM
    [${flyway:defaultSchema}].[FormUpload] AS f
INNER JOIN
    [${mjSchema}].[File] AS MJFile_FileID
  ON
    [f].[FileID] = MJFile_FileID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[FormDistribution] AS mjBizAppsFormsFormDistribution_DistributionID
  ON
    [f].[DistributionID] = mjBizAppsFormsFormDistribution_DistributionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_UploadedByUserID
  ON
    [f].[UploadedByUserID] = MJUser_UploadedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormUploads] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: Permissions for vwFormUploads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormUploads] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spCreateFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormUpload
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormUpload]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormUpload];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormUpload]
    @ID uniqueidentifier = NULL,
    @FileID uniqueidentifier,
    @DistributionID uniqueidentifier,
    @FormID uniqueidentifier,
    @QuestionID_Clear bit = 0,
    @QuestionID uniqueidentifier = NULL,
    @ResponseDraftID_Clear bit = 0,
    @ResponseDraftID uniqueidentifier = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @UploadedByUserID_Clear bit = 0,
    @UploadedByUserID uniqueidentifier = NULL,
    @ProviderKey_Clear bit = 0,
    @ProviderKey nvarchar(1000) = NULL,
    @FileName_Clear bit = 0,
    @FileName nvarchar(500) = NULL,
    @ContentType_Clear bit = 0,
    @ContentType nvarchar(255) = NULL,
    @SizeBytes_Clear bit = 0,
    @SizeBytes bigint = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormUpload]
            (
                [ID],
                [FileID],
                [DistributionID],
                [FormID],
                [QuestionID],
                [ResponseDraftID],
                [AnonymousSessionID],
                [UploadedByUserID],
                [ProviderKey],
                [FileName],
                [ContentType],
                [SizeBytes],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FileID,
                @DistributionID,
                @FormID,
                CASE WHEN @QuestionID_Clear = 1 THEN NULL ELSE ISNULL(@QuestionID, NULL) END,
                CASE WHEN @ResponseDraftID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDraftID, NULL) END,
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @UploadedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@UploadedByUserID, NULL) END,
                CASE WHEN @ProviderKey_Clear = 1 THEN NULL ELSE ISNULL(@ProviderKey, NULL) END,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, NULL) END,
                CASE WHEN @SizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@SizeBytes, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormUpload]
            (
                [FileID],
                [DistributionID],
                [FormID],
                [QuestionID],
                [ResponseDraftID],
                [AnonymousSessionID],
                [UploadedByUserID],
                [ProviderKey],
                [FileName],
                [ContentType],
                [SizeBytes],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FileID,
                @DistributionID,
                @FormID,
                CASE WHEN @QuestionID_Clear = 1 THEN NULL ELSE ISNULL(@QuestionID, NULL) END,
                CASE WHEN @ResponseDraftID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDraftID, NULL) END,
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @UploadedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@UploadedByUserID, NULL) END,
                CASE WHEN @ProviderKey_Clear = 1 THEN NULL ELSE ISNULL(@ProviderKey, NULL) END,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, NULL) END,
                CASE WHEN @SizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@SizeBytes, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormUploads] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormUpload] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Uploads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormUpload] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spUpdateFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormUpload
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormUpload]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormUpload];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormUpload]
    @ID uniqueidentifier,
    @FileID uniqueidentifier = NULL,
    @DistributionID uniqueidentifier = NULL,
    @FormID uniqueidentifier = NULL,
    @QuestionID_Clear bit = 0,
    @QuestionID uniqueidentifier = NULL,
    @ResponseDraftID_Clear bit = 0,
    @ResponseDraftID uniqueidentifier = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @UploadedByUserID_Clear bit = 0,
    @UploadedByUserID uniqueidentifier = NULL,
    @ProviderKey_Clear bit = 0,
    @ProviderKey nvarchar(1000) = NULL,
    @FileName_Clear bit = 0,
    @FileName nvarchar(500) = NULL,
    @ContentType_Clear bit = 0,
    @ContentType nvarchar(255) = NULL,
    @SizeBytes_Clear bit = 0,
    @SizeBytes bigint = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormUpload]
    SET
        [FileID] = ISNULL(@FileID, [FileID]),
        [DistributionID] = ISNULL(@DistributionID, [DistributionID]),
        [FormID] = ISNULL(@FormID, [FormID]),
        [QuestionID] = CASE WHEN @QuestionID_Clear = 1 THEN NULL ELSE ISNULL(@QuestionID, [QuestionID]) END,
        [ResponseDraftID] = CASE WHEN @ResponseDraftID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDraftID, [ResponseDraftID]) END,
        [AnonymousSessionID] = CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, [AnonymousSessionID]) END,
        [UploadedByUserID] = CASE WHEN @UploadedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@UploadedByUserID, [UploadedByUserID]) END,
        [ProviderKey] = CASE WHEN @ProviderKey_Clear = 1 THEN NULL ELSE ISNULL(@ProviderKey, [ProviderKey]) END,
        [FileName] = CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, [FileName]) END,
        [ContentType] = CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, [ContentType]) END,
        [SizeBytes] = CASE WHEN @SizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@SizeBytes, [SizeBytes]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormUploads] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormUploads]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormUpload] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormUpload table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormUpload]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormUpload];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormUpload
ON [${flyway:defaultSchema}].[FormUpload]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormUpload]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormUpload] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Uploads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormUpload] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spDeleteFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormUpload
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormUpload]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormUpload];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormUpload]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormUpload]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormUpload] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Uploads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormUpload] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (1 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks', @EntityIDs='890AE739-1A57-4070-9358-D1788CC2C4C0';

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '44514475-afec-4b0f-931a-7ef6d29f9556' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'File')) BEGIN
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
            '44514475-afec-4b0f-931a-7ef6d29f9556',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100031,
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cd0bf4f2-cb1f-477a-990c-874648b2e8e5' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'Distribution')) BEGIN
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
            'cd0bf4f2-cb1f-477a-990c-874648b2e8e5',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100032,
            'Distribution',
            'Distribution',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e0f16358-d0c3-4b96-97aa-16b5b1e88ed2' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'Form')) BEGIN
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
            'e0f16358-d0c3-4b96-97aa-16b5b1e88ed2',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '06d26ec3-9c48-42e4-a77b-cda5b004eccd' OR (EntityID = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND Name = 'UploadedByUser')) BEGIN
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
            '06d26ec3-9c48-42e4-a77b-cda5b004eccd',
            '890AE739-1A57-4070-9358-D1788CC2C4C0', -- Entity: MJ_BizApps_Forms: Form Uploads
            100034,
            'UploadedByUser',
            'Uploaded By User',
            NULL,
            'nvarchar',
            200,
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

/* SQL text to update existing entity fields from schema (1 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks', @EntityIDs='890AE739-1A57-4070-9358-D1788CC2C4C0';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon,__mj_BizAppsTasks,__mj_BizAppsCommon,__mj_bizappstasks';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F27A930F-26F8-428D-B1EB-5802EFC78E5F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '452A1EE1-95E8-414F-B5C2-B651C8D6CE89'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C148DECF-F6F8-444D-AAC7-EF9C4A05459C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FileID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'File',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '42CB99DC-8808-4841-B796-44342B63319D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.DistributionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Distribution',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E1B7555-7DA3-4EBC-82F9-69CFB6054381' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6130FD61-5262-4EAA-98BD-43B98941012C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.QuestionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Question',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '746F2F72-C1F6-4F4A-9DA6-60FA354D6C6E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ResponseDraftID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Response Draft',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB577F23-8A40-4DB1-9ECF-664DD79836C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.AnonymousSessionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Anonymous Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '467428DC-3A6E-4CED-A0EA-EEAB2C7ECEDF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.UploadedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Uploaded By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01B65515-AD70-413D-8917-4C2423341F15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ProviderKey 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8670159-CE1A-4BB1-98AE-EEA73AD81A1A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FileName 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '666F4E03-791C-4503-9BB0-357B39CF0B57' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ContentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE8FAFBB-9C27-44F8-A2A0-91C95D39A23A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.SizeBytes 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Size (Bytes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F27A930F-26F8-428D-B1EB-5802EFC78E5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C104492A-2DA5-4627-BBAE-6F25128BE23D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '452A1EE1-95E8-414F-B5C2-B651C8D6CE89' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65FDDB3D-8EF1-4D0D-BACC-569312E8DDC6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.File 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'File Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44514475-AFEC-4B0F-931A-7EF6D29F9556' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Distribution 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Distribution Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD0BF4F2-CB1F-477A-990C-874648B2E8E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.UploadedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provenance and Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Uploaded By User Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-upload */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-file-upload', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '890AE739-1A57-4070-9358-D1788CC2C4C0';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('90f74ddd-cdd8-4b22-b305-885c20c53561', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FieldCategoryInfo', '{"File Details":{"icon":"fa fa-file","description":"Technical details regarding the uploaded file, its size, type, and storage location."},"Provenance and Context":{"icon":"fa fa-history","description":"Information linking the upload to specific forms, distributions, and user sessions for audit and provenance."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('236872f7-c64c-4ea6-8ec3-572483a97db4', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FieldCategoryIcons', '{"File Details":"fa fa-file","Provenance and Context":"fa fa-history","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '890AE739-1A57-4070-9358-D1788CC2C4C0';

