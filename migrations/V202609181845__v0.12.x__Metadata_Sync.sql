-- MJ Forms v0.12.x — the consolidated release metadata seed.
--
-- ONE seed per release (#105). This is the release after v0.11.0, which shipped
-- V202609112116; that file is append-only history now (v0.11.0 carries it) and is untouched here.
-- This file is a DELTA beside it, not a replacement, and it folds in no retired per-PR seed —
-- there were none outstanding. `npm run check:seed-cadence` was the thing asking for this file:
-- metadata/ moved since v0.11.0 and no seed shipped it.
--
-- WHAT IT CARRIES, and nothing else: #232's search-API curation
-- (metadata/entities/.entities.json), which until now existed only as declarative JSON and had
-- therefore reached no host. Search stays ON for the two entities a user actually searches by name
-- — Forms and Form Categories, each with Name as a BeginsWith predicate and its other columns
-- excluded — and goes OFF for the fourteen detail / run / response entities behind them. Every one
-- of the sixteen also gets AutoUpdate*UserSearchAPI = 0, which is the half that makes the curation
-- stick: with it left at 1, the host's next CodeGen re-derives these flags and the curation is gone.
--
-- GENERATED AGAINST THE SHIPPED CHAIN AT HEAD, on a database built from migrations/ alone
-- (core __mj at MJ v6.1.1's frontier 202609132006, Forms at 202609142000) and carrying no dev
-- records. No unreleased seed had to be held back this time — the step-1 warning in
-- migrations/README.md had nothing to bite on, because v0.11.0 released every seed in the tree.
--
-- THE SUBSTITUTION, and the one site where it is not what it looks like. MetadataSync writes the
-- CORE schema as ${flyway:defaultSchema}, because in MJ's own repo the default schema IS the core
-- schema; here it is __mj_BizAppsForms, so every one of those has been rewritten to ${mjSchema}.
-- Twenty-four of the twenty-five are the EXEC target of a core SP. The twenty-fifth is INSIDE the
-- Form Uploads entity Description — the database holds "__mj.File has no owner column" and the
-- generator placeholder-ised the schema name in that prose along with the real ones. It needs the
-- same rewrite for the opposite reason: left alone it would have shipped the sentence claiming
-- __mj_BizAppsForms.File, silently rewriting a description this seed also WRITES. A future
-- regeneration whose text mentions the Forms schema would need the opposite call, so check the
-- non-EXEC sites rather than replacing blind.
--
-- WHY THE spUpdateUserView IS HERE. It writes the All Forms view back with the values it already
-- has; both earlier seeds carry exactly one of these for the same reason, and it is a generator
-- artifact rather than a change. It is kept rather than hand-deleted because editing generated
-- output by hand is how a seed stops matching what a push produces.
--
-- EVERY ID BELOW IS A LITERAL, AND THAT IS CORRECT HERE. These are UPDATEs to Entity / EntityField
-- rows, whose ids are usually host-minted — but not this app's: the shipped chain INSERTs all
-- sixteen Entity rows with hardcoded ids (B202606281200 and the CodeGen blocks after it), so a host
-- that installed from migrations/ holds exactly these. Verified across five independently built
-- databases. The assertions below exist because spUpdateEntity / spUpdateEntityField key on @ID and
-- raise NOTHING when it matches no row: on a host whose ids somehow differ, all twenty-three
-- statements would be silent no-ops and the seed would report success having done nothing.

IF (SELECT COUNT(*) FROM [${mjSchema}].[Entity]
    WHERE SchemaName = '${flyway:defaultSchema}'
      AND ID IN ('C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8','43ECBEA3-6CFC-480C-823F-96B5DB201FE7',
                 'DC399B21-517E-4E71-9571-037AB9E2641E','B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A',
                 '1FC60BDA-25B8-473B-ACE5-1238670D3535','ED974050-6DA2-40DA-813B-38927002246B',
                 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778','A3BFAA2D-3158-4EED-9934-76D1E35D20F6',
                 'BF3016E2-8BA7-4975-83B6-02C9435C1441','C396B99F-0677-47F8-BAEF-BCB08DE5CF97',
                 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810','63600739-7165-4BDC-B7D7-19A1B1951DFA',
                 '6313B0B1-37E8-432F-AEB6-F35F218C5D22','1EF36DB1-004D-4672-8A57-A0F3B71C0050',
                 '890AE739-1A57-4070-9358-D1788CC2C4C0','622E2804-5B6D-4B43-92A4-294ADC538F50')) <> 16
    THROW 51130, 'MJ Forms V202609181845: expected all 16 MJ Forms entity rows to carry the ids this seed addresses, in this app''s schema. spUpdateEntity keys on @ID and raises nothing when it matches no row, so a mismatch here would make every search-API update below a silent no-op (#64).', 1;

IF (SELECT COUNT(*) FROM [${mjSchema}].[EntityField]
    WHERE ID IN ('BC9E36EF-C93E-48BF-9F84-53F402CE6DE2','78B49574-A9C0-41B2-9352-01C24FE35FBA',
                 '8DC15128-B17F-45C1-87BE-DC4CD02B49E6','E02E1400-5755-45BB-B7AF-B2A73BFA2B83',
                 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40','A744F418-66DB-4475-A548-009F548B0105',
                 '8C879F40-9016-463A-99C5-1BD6495CF3A5')) <> 7
    THROW 51131, 'MJ Forms V202609181845: expected all 7 EntityField rows this seed addresses to exist. spUpdateEntityField keys on @ID and raises nothing when it matches no row, so a mismatch would silently drop the per-field search curation while the entity-level half applied.', 1;
GO

-- SQL Logging Session
-- Session ID: 1d5c9780-ac23-4661-8fea-1159dc3114a2
-- Started: 2026-09-18T18:45:44.452Z
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction

-- Save MJ: User Views (core SP call only)
DECLARE @UserID_c9c04ad15183 UNIQUEIDENTIFIER,
@EntityID_c9c04ad15183 UNIQUEIDENTIFIER,
@Name_c9c04ad15183 NVARCHAR(100),
@Description_c9c04ad15183 NVARCHAR(MAX),
@CategoryID_c9c04ad15183 UNIQUEIDENTIFIER,
@IsShared_c9c04ad15183 BIT,
@IsDefault_c9c04ad15183 BIT,
@GridState_c9c04ad15183 NVARCHAR(MAX),
@FilterState_c9c04ad15183 NVARCHAR(MAX),
@CustomFilterState_c9c04ad15183 BIT,
@SmartFilterEnabled_c9c04ad15183 BIT,
@SmartFilterPrompt_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterWhereClause_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterExplanation_c9c04ad15183 NVARCHAR(MAX),
@WhereClause_c9c04ad15183 NVARCHAR(MAX),
@CustomWhereClause_c9c04ad15183 BIT,
@SortState_c9c04ad15183 NVARCHAR(MAX),
@Thumbnail_c9c04ad15183 NVARCHAR(MAX),
@CardState_c9c04ad15183 NVARCHAR(MAX),
@DisplayState_c9c04ad15183 NVARCHAR(MAX),
@ViewTypeID_c9c04ad15183 UNIQUEIDENTIFIER,
@ID_c9c04ad15183 UNIQUEIDENTIFIER
SET
  @UserID_c9c04ad15183 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @EntityID_c9c04ad15183 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'
SET
  @Name_c9c04ad15183 = N'All Forms'
SET
  @Description_c9c04ad15183 = N''
SET
  @IsShared_c9c04ad15183 = 1
SET
  @IsDefault_c9c04ad15183 = 0
SET
  @GridState_c9c04ad15183 = N'{}'
SET
  @FilterState_c9c04ad15183 = N'{"logic":"and","filters":[]}'
SET
  @CustomFilterState_c9c04ad15183 = 0
SET
  @SmartFilterEnabled_c9c04ad15183 = 0
SET
  @WhereClause_c9c04ad15183 = N''
SET
  @CustomWhereClause_c9c04ad15183 = 0
SET
  @ID_c9c04ad15183 = '7F0D0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateUserView @UserID = @UserID_c9c04ad15183,
  @EntityID = @EntityID_c9c04ad15183,
  @Name = @Name_c9c04ad15183,
  @Description = @Description_c9c04ad15183,
  @CategoryID = @CategoryID_c9c04ad15183,
  @CategoryID_Clear = 1,
  @IsShared = @IsShared_c9c04ad15183,
  @IsDefault = @IsDefault_c9c04ad15183,
  @GridState = @GridState_c9c04ad15183,
  @FilterState = @FilterState_c9c04ad15183,
  @CustomFilterState = @CustomFilterState_c9c04ad15183,
  @SmartFilterEnabled = @SmartFilterEnabled_c9c04ad15183,
  @SmartFilterPrompt = @SmartFilterPrompt_c9c04ad15183,
  @SmartFilterPrompt_Clear = 1,
  @SmartFilterWhereClause = @SmartFilterWhereClause_c9c04ad15183,
  @SmartFilterWhereClause_Clear = 1,
  @SmartFilterExplanation = @SmartFilterExplanation_c9c04ad15183,
  @SmartFilterExplanation_Clear = 1,
  @WhereClause = @WhereClause_c9c04ad15183,
  @CustomWhereClause = @CustomWhereClause_c9c04ad15183,
  @SortState = @SortState_c9c04ad15183,
  @SortState_Clear = 1,
  @Thumbnail = @Thumbnail_c9c04ad15183,
  @Thumbnail_Clear = 1,
  @CardState = @CardState_c9c04ad15183,
  @CardState_Clear = 1,
  @DisplayState = @DisplayState_c9c04ad15183,
  @DisplayState_Clear = 1,
  @ViewTypeID = @ViewTypeID_c9c04ad15183,
  @ViewTypeID_Clear = 1,
  @ID = @ID_c9c04ad15183;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_8182a1d34be0 UNIQUEIDENTIFIER,
@Name_8182a1d34be0 NVARCHAR(255),
@NameSuffix_8182a1d34be0 NVARCHAR(255),
@Description_8182a1d34be0 NVARCHAR(MAX),
@AutoUpdateDescription_8182a1d34be0 BIT,
@BaseView_8182a1d34be0 NVARCHAR(255),
@BaseViewGenerated_8182a1d34be0 BIT,
@VirtualEntity_8182a1d34be0 BIT,
@TrackRecordChanges_8182a1d34be0 BIT,
@AuditRecordAccess_8182a1d34be0 BIT,
@AuditViewRuns_8182a1d34be0 BIT,
@IncludeInAPI_8182a1d34be0 BIT,
@AllowAllRowsAPI_8182a1d34be0 BIT,
@AllowUpdateAPI_8182a1d34be0 BIT,
@AllowCreateAPI_8182a1d34be0 BIT,
@AllowDeleteAPI_8182a1d34be0 BIT,
@CustomResolverAPI_8182a1d34be0 BIT,
@AllowUserSearchAPI_8182a1d34be0 BIT,
@FullTextSearchEnabled_8182a1d34be0 BIT,
@FullTextCatalog_8182a1d34be0 NVARCHAR(255),
@FullTextCatalogGenerated_8182a1d34be0 BIT,
@FullTextIndex_8182a1d34be0 NVARCHAR(255),
@FullTextIndexGenerated_8182a1d34be0 BIT,
@FullTextSearchFunction_8182a1d34be0 NVARCHAR(255),
@FullTextSearchFunctionGenerated_8182a1d34be0 BIT,
@UserViewMaxRows_8182a1d34be0 INT,
@spCreate_8182a1d34be0 NVARCHAR(255),
@spUpdate_8182a1d34be0 NVARCHAR(255),
@spDelete_8182a1d34be0 NVARCHAR(255),
@spCreateGenerated_8182a1d34be0 BIT,
@spUpdateGenerated_8182a1d34be0 BIT,
@spDeleteGenerated_8182a1d34be0 BIT,
@CascadeDeletes_8182a1d34be0 BIT,
@DeleteType_8182a1d34be0 NVARCHAR(10),
@AllowRecordMerge_8182a1d34be0 BIT,
@spMatch_8182a1d34be0 NVARCHAR(255),
@RelationshipDefaultDisplayType_8182a1d34be0 NVARCHAR(20),
@UserFormGenerated_8182a1d34be0 BIT,
@EntityObjectSubclassName_8182a1d34be0 NVARCHAR(255),
@EntityObjectSubclassImport_8182a1d34be0 NVARCHAR(255),
@PreferredCommunicationField_8182a1d34be0 NVARCHAR(255),
@Icon_8182a1d34be0 NVARCHAR(500),
@ScopeDefault_8182a1d34be0 NVARCHAR(100),
@RowsToPackWithSchema_8182a1d34be0 NVARCHAR(20),
@RowsToPackSampleMethod_8182a1d34be0 NVARCHAR(20),
@RowsToPackSampleCount_8182a1d34be0 INT,
@RowsToPackSampleOrder_8182a1d34be0 NVARCHAR(MAX),
@AutoRowCountFrequency_8182a1d34be0 INT,
@RowCount_8182a1d34be0 BIGINT,
@RowCountRunAt_8182a1d34be0 DATETIMEOFFSET,
@Status_8182a1d34be0 NVARCHAR(25),
@DisplayName_8182a1d34be0 NVARCHAR(255),
@AllowMultipleSubtypes_8182a1d34be0 BIT,
@AutoUpdateFullTextSearch_8182a1d34be0 BIT,
@AutoUpdateAllowUserSearchAPI_8182a1d34be0 BIT,
@TrustServerCacheCompletely_8182a1d34be0 BIT,
@SupportsGeoCoding_8182a1d34be0 BIT,
@AutoUpdateSupportsGeoCoding_8182a1d34be0 BIT,
@AllowCaching_8182a1d34be0 BIT,
@DetectExternalChanges_8182a1d34be0 BIT,
@ExternalDataSourceID_8182a1d34be0 UNIQUEIDENTIFIER,
@ExternalObjectName_8182a1d34be0 NVARCHAR(255),
@GeneratedBaseViewName_8182a1d34be0 NVARCHAR(255),
@AllowDirectSQLInsert_8182a1d34be0 BIT,
@AllowDirectSQLUpdate_8182a1d34be0 BIT,
@AllowDirectSQLDelete_8182a1d34be0 BIT,
@Configuration_8182a1d34be0 NVARCHAR(MAX),
@SubtypeSelector_8182a1d34be0 NVARCHAR(MAX),
@EnableFieldLevelSecurity_8182a1d34be0 BIT,
@ID_8182a1d34be0 UNIQUEIDENTIFIER
SET
  @Name_8182a1d34be0 = N'MJ_BizApps_Forms: Forms'
SET
  @Description_8182a1d34be0 = N'The root definition of a form/survey/intake instrument'
SET
  @AutoUpdateDescription_8182a1d34be0 = 1
SET
  @BaseView_8182a1d34be0 = N'vwForms'
SET
  @BaseViewGenerated_8182a1d34be0 = 1
SET
  @VirtualEntity_8182a1d34be0 = 0
SET
  @TrackRecordChanges_8182a1d34be0 = 1
SET
  @AuditRecordAccess_8182a1d34be0 = 0
SET
  @AuditViewRuns_8182a1d34be0 = 0
SET
  @IncludeInAPI_8182a1d34be0 = 1
SET
  @AllowAllRowsAPI_8182a1d34be0 = 0
SET
  @AllowUpdateAPI_8182a1d34be0 = 1
SET
  @AllowCreateAPI_8182a1d34be0 = 1
SET
  @AllowDeleteAPI_8182a1d34be0 = 1
SET
  @CustomResolverAPI_8182a1d34be0 = 0
SET
  @AllowUserSearchAPI_8182a1d34be0 = 1
SET
  @FullTextSearchEnabled_8182a1d34be0 = 0
SET
  @FullTextCatalogGenerated_8182a1d34be0 = 1
SET
  @FullTextIndexGenerated_8182a1d34be0 = 1
SET
  @FullTextSearchFunctionGenerated_8182a1d34be0 = 1
SET
  @UserViewMaxRows_8182a1d34be0 = 1000
SET
  @spCreateGenerated_8182a1d34be0 = 1
SET
  @spUpdateGenerated_8182a1d34be0 = 1
SET
  @spDeleteGenerated_8182a1d34be0 = 1
SET
  @CascadeDeletes_8182a1d34be0 = 0
SET
  @DeleteType_8182a1d34be0 = N'Hard'
SET
  @AllowRecordMerge_8182a1d34be0 = 0
SET
  @RelationshipDefaultDisplayType_8182a1d34be0 = N'Search'
SET
  @UserFormGenerated_8182a1d34be0 = 1
SET
  @Icon_8182a1d34be0 = N'fa fa-wpforms'
SET
  @RowsToPackWithSchema_8182a1d34be0 = N'None'
SET
  @RowsToPackSampleMethod_8182a1d34be0 = N'random'
SET
  @RowsToPackSampleCount_8182a1d34be0 = 0
SET
  @Status_8182a1d34be0 = N'Active'
SET
  @DisplayName_8182a1d34be0 = N'Forms'
SET
  @AllowMultipleSubtypes_8182a1d34be0 = 0
SET
  @AutoUpdateFullTextSearch_8182a1d34be0 = 1
SET
  @AutoUpdateAllowUserSearchAPI_8182a1d34be0 = 0
SET
  @TrustServerCacheCompletely_8182a1d34be0 = 1
SET
  @SupportsGeoCoding_8182a1d34be0 = 0
SET
  @AutoUpdateSupportsGeoCoding_8182a1d34be0 = 1
SET
  @AllowCaching_8182a1d34be0 = 0
SET
  @DetectExternalChanges_8182a1d34be0 = 0
SET
  @AllowDirectSQLInsert_8182a1d34be0 = 0
SET
  @AllowDirectSQLUpdate_8182a1d34be0 = 0
SET
  @AllowDirectSQLDelete_8182a1d34be0 = 0
SET
  @EnableFieldLevelSecurity_8182a1d34be0 = 0
SET
  @ID_8182a1d34be0 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_8182a1d34be0,
  @ParentID_Clear = 1,
  @Name = @Name_8182a1d34be0,
  @NameSuffix = @NameSuffix_8182a1d34be0,
  @NameSuffix_Clear = 1,
  @Description = @Description_8182a1d34be0,
  @AutoUpdateDescription = @AutoUpdateDescription_8182a1d34be0,
  @BaseView = @BaseView_8182a1d34be0,
  @BaseViewGenerated = @BaseViewGenerated_8182a1d34be0,
  @VirtualEntity = @VirtualEntity_8182a1d34be0,
  @TrackRecordChanges = @TrackRecordChanges_8182a1d34be0,
  @AuditRecordAccess = @AuditRecordAccess_8182a1d34be0,
  @AuditViewRuns = @AuditViewRuns_8182a1d34be0,
  @IncludeInAPI = @IncludeInAPI_8182a1d34be0,
  @AllowAllRowsAPI = @AllowAllRowsAPI_8182a1d34be0,
  @AllowUpdateAPI = @AllowUpdateAPI_8182a1d34be0,
  @AllowCreateAPI = @AllowCreateAPI_8182a1d34be0,
  @AllowDeleteAPI = @AllowDeleteAPI_8182a1d34be0,
  @CustomResolverAPI = @CustomResolverAPI_8182a1d34be0,
  @AllowUserSearchAPI = @AllowUserSearchAPI_8182a1d34be0,
  @FullTextSearchEnabled = @FullTextSearchEnabled_8182a1d34be0,
  @FullTextCatalog = @FullTextCatalog_8182a1d34be0,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_8182a1d34be0,
  @FullTextIndex = @FullTextIndex_8182a1d34be0,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_8182a1d34be0,
  @FullTextSearchFunction = @FullTextSearchFunction_8182a1d34be0,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_8182a1d34be0,
  @UserViewMaxRows = @UserViewMaxRows_8182a1d34be0,
  @spCreate = @spCreate_8182a1d34be0,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_8182a1d34be0,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_8182a1d34be0,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_8182a1d34be0,
  @spUpdateGenerated = @spUpdateGenerated_8182a1d34be0,
  @spDeleteGenerated = @spDeleteGenerated_8182a1d34be0,
  @CascadeDeletes = @CascadeDeletes_8182a1d34be0,
  @DeleteType = @DeleteType_8182a1d34be0,
  @AllowRecordMerge = @AllowRecordMerge_8182a1d34be0,
  @spMatch = @spMatch_8182a1d34be0,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_8182a1d34be0,
  @UserFormGenerated = @UserFormGenerated_8182a1d34be0,
  @EntityObjectSubclassName = @EntityObjectSubclassName_8182a1d34be0,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_8182a1d34be0,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_8182a1d34be0,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_8182a1d34be0,
  @ScopeDefault = @ScopeDefault_8182a1d34be0,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_8182a1d34be0,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_8182a1d34be0,
  @RowsToPackSampleCount = @RowsToPackSampleCount_8182a1d34be0,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_8182a1d34be0,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_8182a1d34be0,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_8182a1d34be0,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_8182a1d34be0,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_8182a1d34be0,
  @DisplayName = @DisplayName_8182a1d34be0,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_8182a1d34be0,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_8182a1d34be0,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_8182a1d34be0,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_8182a1d34be0,
  @SupportsGeoCoding = @SupportsGeoCoding_8182a1d34be0,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_8182a1d34be0,
  @AllowCaching = @AllowCaching_8182a1d34be0,
  @DetectExternalChanges = @DetectExternalChanges_8182a1d34be0,
  @ExternalDataSourceID = @ExternalDataSourceID_8182a1d34be0,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_8182a1d34be0,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_8182a1d34be0,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_8182a1d34be0,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_8182a1d34be0,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_8182a1d34be0,
  @Configuration = @Configuration_8182a1d34be0,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_8182a1d34be0,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_8182a1d34be0,
  @ID = @ID_8182a1d34be0;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_d07f6f03c9de UNIQUEIDENTIFIER,
@Name_d07f6f03c9de NVARCHAR(255),
@NameSuffix_d07f6f03c9de NVARCHAR(255),
@Description_d07f6f03c9de NVARCHAR(MAX),
@AutoUpdateDescription_d07f6f03c9de BIT,
@BaseView_d07f6f03c9de NVARCHAR(255),
@BaseViewGenerated_d07f6f03c9de BIT,
@VirtualEntity_d07f6f03c9de BIT,
@TrackRecordChanges_d07f6f03c9de BIT,
@AuditRecordAccess_d07f6f03c9de BIT,
@AuditViewRuns_d07f6f03c9de BIT,
@IncludeInAPI_d07f6f03c9de BIT,
@AllowAllRowsAPI_d07f6f03c9de BIT,
@AllowUpdateAPI_d07f6f03c9de BIT,
@AllowCreateAPI_d07f6f03c9de BIT,
@AllowDeleteAPI_d07f6f03c9de BIT,
@CustomResolverAPI_d07f6f03c9de BIT,
@AllowUserSearchAPI_d07f6f03c9de BIT,
@FullTextSearchEnabled_d07f6f03c9de BIT,
@FullTextCatalog_d07f6f03c9de NVARCHAR(255),
@FullTextCatalogGenerated_d07f6f03c9de BIT,
@FullTextIndex_d07f6f03c9de NVARCHAR(255),
@FullTextIndexGenerated_d07f6f03c9de BIT,
@FullTextSearchFunction_d07f6f03c9de NVARCHAR(255),
@FullTextSearchFunctionGenerated_d07f6f03c9de BIT,
@UserViewMaxRows_d07f6f03c9de INT,
@spCreate_d07f6f03c9de NVARCHAR(255),
@spUpdate_d07f6f03c9de NVARCHAR(255),
@spDelete_d07f6f03c9de NVARCHAR(255),
@spCreateGenerated_d07f6f03c9de BIT,
@spUpdateGenerated_d07f6f03c9de BIT,
@spDeleteGenerated_d07f6f03c9de BIT,
@CascadeDeletes_d07f6f03c9de BIT,
@DeleteType_d07f6f03c9de NVARCHAR(10),
@AllowRecordMerge_d07f6f03c9de BIT,
@spMatch_d07f6f03c9de NVARCHAR(255),
@RelationshipDefaultDisplayType_d07f6f03c9de NVARCHAR(20),
@UserFormGenerated_d07f6f03c9de BIT,
@EntityObjectSubclassName_d07f6f03c9de NVARCHAR(255),
@EntityObjectSubclassImport_d07f6f03c9de NVARCHAR(255),
@PreferredCommunicationField_d07f6f03c9de NVARCHAR(255),
@Icon_d07f6f03c9de NVARCHAR(500),
@ScopeDefault_d07f6f03c9de NVARCHAR(100),
@RowsToPackWithSchema_d07f6f03c9de NVARCHAR(20),
@RowsToPackSampleMethod_d07f6f03c9de NVARCHAR(20),
@RowsToPackSampleCount_d07f6f03c9de INT,
@RowsToPackSampleOrder_d07f6f03c9de NVARCHAR(MAX),
@AutoRowCountFrequency_d07f6f03c9de INT,
@RowCount_d07f6f03c9de BIGINT,
@RowCountRunAt_d07f6f03c9de DATETIMEOFFSET,
@Status_d07f6f03c9de NVARCHAR(25),
@DisplayName_d07f6f03c9de NVARCHAR(255),
@AllowMultipleSubtypes_d07f6f03c9de BIT,
@AutoUpdateFullTextSearch_d07f6f03c9de BIT,
@AutoUpdateAllowUserSearchAPI_d07f6f03c9de BIT,
@TrustServerCacheCompletely_d07f6f03c9de BIT,
@SupportsGeoCoding_d07f6f03c9de BIT,
@AutoUpdateSupportsGeoCoding_d07f6f03c9de BIT,
@AllowCaching_d07f6f03c9de BIT,
@DetectExternalChanges_d07f6f03c9de BIT,
@ExternalDataSourceID_d07f6f03c9de UNIQUEIDENTIFIER,
@ExternalObjectName_d07f6f03c9de NVARCHAR(255),
@GeneratedBaseViewName_d07f6f03c9de NVARCHAR(255),
@AllowDirectSQLInsert_d07f6f03c9de BIT,
@AllowDirectSQLUpdate_d07f6f03c9de BIT,
@AllowDirectSQLDelete_d07f6f03c9de BIT,
@Configuration_d07f6f03c9de NVARCHAR(MAX),
@SubtypeSelector_d07f6f03c9de NVARCHAR(MAX),
@EnableFieldLevelSecurity_d07f6f03c9de BIT,
@ID_d07f6f03c9de UNIQUEIDENTIFIER
SET
  @Name_d07f6f03c9de = N'MJ_BizApps_Forms: Form Categories'
SET
  @Description_d07f6f03c9de = N'Hierarchical categories that organize forms into a browsable tree'
SET
  @AutoUpdateDescription_d07f6f03c9de = 1
SET
  @BaseView_d07f6f03c9de = N'vwFormCategories'
SET
  @BaseViewGenerated_d07f6f03c9de = 1
SET
  @VirtualEntity_d07f6f03c9de = 0
SET
  @TrackRecordChanges_d07f6f03c9de = 1
SET
  @AuditRecordAccess_d07f6f03c9de = 0
SET
  @AuditViewRuns_d07f6f03c9de = 0
SET
  @IncludeInAPI_d07f6f03c9de = 1
SET
  @AllowAllRowsAPI_d07f6f03c9de = 0
SET
  @AllowUpdateAPI_d07f6f03c9de = 1
SET
  @AllowCreateAPI_d07f6f03c9de = 1
SET
  @AllowDeleteAPI_d07f6f03c9de = 1
SET
  @CustomResolverAPI_d07f6f03c9de = 0
SET
  @AllowUserSearchAPI_d07f6f03c9de = 1
SET
  @FullTextSearchEnabled_d07f6f03c9de = 0
SET
  @FullTextCatalogGenerated_d07f6f03c9de = 1
SET
  @FullTextIndexGenerated_d07f6f03c9de = 1
SET
  @FullTextSearchFunctionGenerated_d07f6f03c9de = 1
SET
  @UserViewMaxRows_d07f6f03c9de = 1000
SET
  @spCreateGenerated_d07f6f03c9de = 1
SET
  @spUpdateGenerated_d07f6f03c9de = 1
SET
  @spDeleteGenerated_d07f6f03c9de = 1
SET
  @CascadeDeletes_d07f6f03c9de = 0
SET
  @DeleteType_d07f6f03c9de = N'Hard'
SET
  @AllowRecordMerge_d07f6f03c9de = 0
SET
  @RelationshipDefaultDisplayType_d07f6f03c9de = N'Search'
SET
  @UserFormGenerated_d07f6f03c9de = 1
SET
  @Icon_d07f6f03c9de = N'fa fa-folder-tree'
SET
  @RowsToPackWithSchema_d07f6f03c9de = N'None'
SET
  @RowsToPackSampleMethod_d07f6f03c9de = N'random'
SET
  @RowsToPackSampleCount_d07f6f03c9de = 0
SET
  @Status_d07f6f03c9de = N'Active'
SET
  @DisplayName_d07f6f03c9de = N'Form Categories'
SET
  @AllowMultipleSubtypes_d07f6f03c9de = 0
SET
  @AutoUpdateFullTextSearch_d07f6f03c9de = 1
SET
  @AutoUpdateAllowUserSearchAPI_d07f6f03c9de = 0
SET
  @TrustServerCacheCompletely_d07f6f03c9de = 1
SET
  @SupportsGeoCoding_d07f6f03c9de = 0
SET
  @AutoUpdateSupportsGeoCoding_d07f6f03c9de = 1
SET
  @AllowCaching_d07f6f03c9de = 0
SET
  @DetectExternalChanges_d07f6f03c9de = 0
SET
  @AllowDirectSQLInsert_d07f6f03c9de = 0
SET
  @AllowDirectSQLUpdate_d07f6f03c9de = 0
SET
  @AllowDirectSQLDelete_d07f6f03c9de = 0
SET
  @EnableFieldLevelSecurity_d07f6f03c9de = 0
SET
  @ID_d07f6f03c9de = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_d07f6f03c9de,
  @ParentID_Clear = 1,
  @Name = @Name_d07f6f03c9de,
  @NameSuffix = @NameSuffix_d07f6f03c9de,
  @NameSuffix_Clear = 1,
  @Description = @Description_d07f6f03c9de,
  @AutoUpdateDescription = @AutoUpdateDescription_d07f6f03c9de,
  @BaseView = @BaseView_d07f6f03c9de,
  @BaseViewGenerated = @BaseViewGenerated_d07f6f03c9de,
  @VirtualEntity = @VirtualEntity_d07f6f03c9de,
  @TrackRecordChanges = @TrackRecordChanges_d07f6f03c9de,
  @AuditRecordAccess = @AuditRecordAccess_d07f6f03c9de,
  @AuditViewRuns = @AuditViewRuns_d07f6f03c9de,
  @IncludeInAPI = @IncludeInAPI_d07f6f03c9de,
  @AllowAllRowsAPI = @AllowAllRowsAPI_d07f6f03c9de,
  @AllowUpdateAPI = @AllowUpdateAPI_d07f6f03c9de,
  @AllowCreateAPI = @AllowCreateAPI_d07f6f03c9de,
  @AllowDeleteAPI = @AllowDeleteAPI_d07f6f03c9de,
  @CustomResolverAPI = @CustomResolverAPI_d07f6f03c9de,
  @AllowUserSearchAPI = @AllowUserSearchAPI_d07f6f03c9de,
  @FullTextSearchEnabled = @FullTextSearchEnabled_d07f6f03c9de,
  @FullTextCatalog = @FullTextCatalog_d07f6f03c9de,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_d07f6f03c9de,
  @FullTextIndex = @FullTextIndex_d07f6f03c9de,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_d07f6f03c9de,
  @FullTextSearchFunction = @FullTextSearchFunction_d07f6f03c9de,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_d07f6f03c9de,
  @UserViewMaxRows = @UserViewMaxRows_d07f6f03c9de,
  @spCreate = @spCreate_d07f6f03c9de,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_d07f6f03c9de,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_d07f6f03c9de,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_d07f6f03c9de,
  @spUpdateGenerated = @spUpdateGenerated_d07f6f03c9de,
  @spDeleteGenerated = @spDeleteGenerated_d07f6f03c9de,
  @CascadeDeletes = @CascadeDeletes_d07f6f03c9de,
  @DeleteType = @DeleteType_d07f6f03c9de,
  @AllowRecordMerge = @AllowRecordMerge_d07f6f03c9de,
  @spMatch = @spMatch_d07f6f03c9de,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_d07f6f03c9de,
  @UserFormGenerated = @UserFormGenerated_d07f6f03c9de,
  @EntityObjectSubclassName = @EntityObjectSubclassName_d07f6f03c9de,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_d07f6f03c9de,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_d07f6f03c9de,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_d07f6f03c9de,
  @ScopeDefault = @ScopeDefault_d07f6f03c9de,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_d07f6f03c9de,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_d07f6f03c9de,
  @RowsToPackSampleCount = @RowsToPackSampleCount_d07f6f03c9de,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_d07f6f03c9de,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_d07f6f03c9de,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_d07f6f03c9de,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_d07f6f03c9de,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_d07f6f03c9de,
  @DisplayName = @DisplayName_d07f6f03c9de,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_d07f6f03c9de,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_d07f6f03c9de,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_d07f6f03c9de,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_d07f6f03c9de,
  @SupportsGeoCoding = @SupportsGeoCoding_d07f6f03c9de,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_d07f6f03c9de,
  @AllowCaching = @AllowCaching_d07f6f03c9de,
  @DetectExternalChanges = @DetectExternalChanges_d07f6f03c9de,
  @ExternalDataSourceID = @ExternalDataSourceID_d07f6f03c9de,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_d07f6f03c9de,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_d07f6f03c9de,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_d07f6f03c9de,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_d07f6f03c9de,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_d07f6f03c9de,
  @Configuration = @Configuration_d07f6f03c9de,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_d07f6f03c9de,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_d07f6f03c9de,
  @ID = @ID_d07f6f03c9de;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_d2003b342954 UNIQUEIDENTIFIER,
@Name_d2003b342954 NVARCHAR(255),
@NameSuffix_d2003b342954 NVARCHAR(255),
@Description_d2003b342954 NVARCHAR(MAX),
@AutoUpdateDescription_d2003b342954 BIT,
@BaseView_d2003b342954 NVARCHAR(255),
@BaseViewGenerated_d2003b342954 BIT,
@VirtualEntity_d2003b342954 BIT,
@TrackRecordChanges_d2003b342954 BIT,
@AuditRecordAccess_d2003b342954 BIT,
@AuditViewRuns_d2003b342954 BIT,
@IncludeInAPI_d2003b342954 BIT,
@AllowAllRowsAPI_d2003b342954 BIT,
@AllowUpdateAPI_d2003b342954 BIT,
@AllowCreateAPI_d2003b342954 BIT,
@AllowDeleteAPI_d2003b342954 BIT,
@CustomResolverAPI_d2003b342954 BIT,
@AllowUserSearchAPI_d2003b342954 BIT,
@FullTextSearchEnabled_d2003b342954 BIT,
@FullTextCatalog_d2003b342954 NVARCHAR(255),
@FullTextCatalogGenerated_d2003b342954 BIT,
@FullTextIndex_d2003b342954 NVARCHAR(255),
@FullTextIndexGenerated_d2003b342954 BIT,
@FullTextSearchFunction_d2003b342954 NVARCHAR(255),
@FullTextSearchFunctionGenerated_d2003b342954 BIT,
@UserViewMaxRows_d2003b342954 INT,
@spCreate_d2003b342954 NVARCHAR(255),
@spUpdate_d2003b342954 NVARCHAR(255),
@spDelete_d2003b342954 NVARCHAR(255),
@spCreateGenerated_d2003b342954 BIT,
@spUpdateGenerated_d2003b342954 BIT,
@spDeleteGenerated_d2003b342954 BIT,
@CascadeDeletes_d2003b342954 BIT,
@DeleteType_d2003b342954 NVARCHAR(10),
@AllowRecordMerge_d2003b342954 BIT,
@spMatch_d2003b342954 NVARCHAR(255),
@RelationshipDefaultDisplayType_d2003b342954 NVARCHAR(20),
@UserFormGenerated_d2003b342954 BIT,
@EntityObjectSubclassName_d2003b342954 NVARCHAR(255),
@EntityObjectSubclassImport_d2003b342954 NVARCHAR(255),
@PreferredCommunicationField_d2003b342954 NVARCHAR(255),
@Icon_d2003b342954 NVARCHAR(500),
@ScopeDefault_d2003b342954 NVARCHAR(100),
@RowsToPackWithSchema_d2003b342954 NVARCHAR(20),
@RowsToPackSampleMethod_d2003b342954 NVARCHAR(20),
@RowsToPackSampleCount_d2003b342954 INT,
@RowsToPackSampleOrder_d2003b342954 NVARCHAR(MAX),
@AutoRowCountFrequency_d2003b342954 INT,
@RowCount_d2003b342954 BIGINT,
@RowCountRunAt_d2003b342954 DATETIMEOFFSET,
@Status_d2003b342954 NVARCHAR(25),
@DisplayName_d2003b342954 NVARCHAR(255),
@AllowMultipleSubtypes_d2003b342954 BIT,
@AutoUpdateFullTextSearch_d2003b342954 BIT,
@AutoUpdateAllowUserSearchAPI_d2003b342954 BIT,
@TrustServerCacheCompletely_d2003b342954 BIT,
@SupportsGeoCoding_d2003b342954 BIT,
@AutoUpdateSupportsGeoCoding_d2003b342954 BIT,
@AllowCaching_d2003b342954 BIT,
@DetectExternalChanges_d2003b342954 BIT,
@ExternalDataSourceID_d2003b342954 UNIQUEIDENTIFIER,
@ExternalObjectName_d2003b342954 NVARCHAR(255),
@GeneratedBaseViewName_d2003b342954 NVARCHAR(255),
@AllowDirectSQLInsert_d2003b342954 BIT,
@AllowDirectSQLUpdate_d2003b342954 BIT,
@AllowDirectSQLDelete_d2003b342954 BIT,
@Configuration_d2003b342954 NVARCHAR(MAX),
@SubtypeSelector_d2003b342954 NVARCHAR(MAX),
@EnableFieldLevelSecurity_d2003b342954 BIT,
@ID_d2003b342954 UNIQUEIDENTIFIER
SET
  @Name_d2003b342954 = N'MJ_BizApps_Forms: Form Automation Runs'
SET
  @Description_d2003b342954 = N'One execution attempt of an automation against one response, linking out to the MJ action or agent log that holds the detail'
SET
  @AutoUpdateDescription_d2003b342954 = 1
SET
  @BaseView_d2003b342954 = N'vwFormAutomationRuns'
SET
  @BaseViewGenerated_d2003b342954 = 1
SET
  @VirtualEntity_d2003b342954 = 0
SET
  @TrackRecordChanges_d2003b342954 = 1
SET
  @AuditRecordAccess_d2003b342954 = 0
SET
  @AuditViewRuns_d2003b342954 = 0
SET
  @IncludeInAPI_d2003b342954 = 1
SET
  @AllowAllRowsAPI_d2003b342954 = 0
SET
  @AllowUpdateAPI_d2003b342954 = 1
SET
  @AllowCreateAPI_d2003b342954 = 1
SET
  @AllowDeleteAPI_d2003b342954 = 1
SET
  @CustomResolverAPI_d2003b342954 = 0
SET
  @AllowUserSearchAPI_d2003b342954 = 0
SET
  @FullTextSearchEnabled_d2003b342954 = 0
SET
  @FullTextCatalogGenerated_d2003b342954 = 1
SET
  @FullTextIndexGenerated_d2003b342954 = 1
SET
  @FullTextSearchFunctionGenerated_d2003b342954 = 1
SET
  @UserViewMaxRows_d2003b342954 = 1000
SET
  @spCreateGenerated_d2003b342954 = 1
SET
  @spUpdateGenerated_d2003b342954 = 1
SET
  @spDeleteGenerated_d2003b342954 = 1
SET
  @CascadeDeletes_d2003b342954 = 0
SET
  @DeleteType_d2003b342954 = N'Hard'
SET
  @AllowRecordMerge_d2003b342954 = 0
SET
  @RelationshipDefaultDisplayType_d2003b342954 = N'Search'
SET
  @UserFormGenerated_d2003b342954 = 1
SET
  @Icon_d2003b342954 = N'fa fa-tasks'
SET
  @RowsToPackWithSchema_d2003b342954 = N'None'
SET
  @RowsToPackSampleMethod_d2003b342954 = N'random'
SET
  @RowsToPackSampleCount_d2003b342954 = 0
SET
  @Status_d2003b342954 = N'Active'
SET
  @DisplayName_d2003b342954 = N'Form Automation Runs'
SET
  @AllowMultipleSubtypes_d2003b342954 = 0
SET
  @AutoUpdateFullTextSearch_d2003b342954 = 1
SET
  @AutoUpdateAllowUserSearchAPI_d2003b342954 = 0
SET
  @TrustServerCacheCompletely_d2003b342954 = 1
SET
  @SupportsGeoCoding_d2003b342954 = 0
SET
  @AutoUpdateSupportsGeoCoding_d2003b342954 = 1
SET
  @AllowCaching_d2003b342954 = 0
SET
  @DetectExternalChanges_d2003b342954 = 0
SET
  @AllowDirectSQLInsert_d2003b342954 = 0
SET
  @AllowDirectSQLUpdate_d2003b342954 = 0
SET
  @AllowDirectSQLDelete_d2003b342954 = 0
SET
  @EnableFieldLevelSecurity_d2003b342954 = 0
SET
  @ID_d2003b342954 = 'DC399B21-517E-4E71-9571-037AB9E2641E' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_d2003b342954,
  @ParentID_Clear = 1,
  @Name = @Name_d2003b342954,
  @NameSuffix = @NameSuffix_d2003b342954,
  @NameSuffix_Clear = 1,
  @Description = @Description_d2003b342954,
  @AutoUpdateDescription = @AutoUpdateDescription_d2003b342954,
  @BaseView = @BaseView_d2003b342954,
  @BaseViewGenerated = @BaseViewGenerated_d2003b342954,
  @VirtualEntity = @VirtualEntity_d2003b342954,
  @TrackRecordChanges = @TrackRecordChanges_d2003b342954,
  @AuditRecordAccess = @AuditRecordAccess_d2003b342954,
  @AuditViewRuns = @AuditViewRuns_d2003b342954,
  @IncludeInAPI = @IncludeInAPI_d2003b342954,
  @AllowAllRowsAPI = @AllowAllRowsAPI_d2003b342954,
  @AllowUpdateAPI = @AllowUpdateAPI_d2003b342954,
  @AllowCreateAPI = @AllowCreateAPI_d2003b342954,
  @AllowDeleteAPI = @AllowDeleteAPI_d2003b342954,
  @CustomResolverAPI = @CustomResolverAPI_d2003b342954,
  @AllowUserSearchAPI = @AllowUserSearchAPI_d2003b342954,
  @FullTextSearchEnabled = @FullTextSearchEnabled_d2003b342954,
  @FullTextCatalog = @FullTextCatalog_d2003b342954,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_d2003b342954,
  @FullTextIndex = @FullTextIndex_d2003b342954,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_d2003b342954,
  @FullTextSearchFunction = @FullTextSearchFunction_d2003b342954,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_d2003b342954,
  @UserViewMaxRows = @UserViewMaxRows_d2003b342954,
  @spCreate = @spCreate_d2003b342954,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_d2003b342954,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_d2003b342954,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_d2003b342954,
  @spUpdateGenerated = @spUpdateGenerated_d2003b342954,
  @spDeleteGenerated = @spDeleteGenerated_d2003b342954,
  @CascadeDeletes = @CascadeDeletes_d2003b342954,
  @DeleteType = @DeleteType_d2003b342954,
  @AllowRecordMerge = @AllowRecordMerge_d2003b342954,
  @spMatch = @spMatch_d2003b342954,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_d2003b342954,
  @UserFormGenerated = @UserFormGenerated_d2003b342954,
  @EntityObjectSubclassName = @EntityObjectSubclassName_d2003b342954,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_d2003b342954,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_d2003b342954,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_d2003b342954,
  @ScopeDefault = @ScopeDefault_d2003b342954,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_d2003b342954,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_d2003b342954,
  @RowsToPackSampleCount = @RowsToPackSampleCount_d2003b342954,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_d2003b342954,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_d2003b342954,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_d2003b342954,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_d2003b342954,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_d2003b342954,
  @DisplayName = @DisplayName_d2003b342954,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_d2003b342954,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_d2003b342954,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_d2003b342954,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_d2003b342954,
  @SupportsGeoCoding = @SupportsGeoCoding_d2003b342954,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_d2003b342954,
  @AllowCaching = @AllowCaching_d2003b342954,
  @DetectExternalChanges = @DetectExternalChanges_d2003b342954,
  @ExternalDataSourceID = @ExternalDataSourceID_d2003b342954,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_d2003b342954,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_d2003b342954,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_d2003b342954,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_d2003b342954,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_d2003b342954,
  @Configuration = @Configuration_d2003b342954,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_d2003b342954,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_d2003b342954,
  @ID = @ID_d2003b342954;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_b8e212878618 UNIQUEIDENTIFIER,
@Name_b8e212878618 NVARCHAR(255),
@NameSuffix_b8e212878618 NVARCHAR(255),
@Description_b8e212878618 NVARCHAR(MAX),
@AutoUpdateDescription_b8e212878618 BIT,
@BaseView_b8e212878618 NVARCHAR(255),
@BaseViewGenerated_b8e212878618 BIT,
@VirtualEntity_b8e212878618 BIT,
@TrackRecordChanges_b8e212878618 BIT,
@AuditRecordAccess_b8e212878618 BIT,
@AuditViewRuns_b8e212878618 BIT,
@IncludeInAPI_b8e212878618 BIT,
@AllowAllRowsAPI_b8e212878618 BIT,
@AllowUpdateAPI_b8e212878618 BIT,
@AllowCreateAPI_b8e212878618 BIT,
@AllowDeleteAPI_b8e212878618 BIT,
@CustomResolverAPI_b8e212878618 BIT,
@AllowUserSearchAPI_b8e212878618 BIT,
@FullTextSearchEnabled_b8e212878618 BIT,
@FullTextCatalog_b8e212878618 NVARCHAR(255),
@FullTextCatalogGenerated_b8e212878618 BIT,
@FullTextIndex_b8e212878618 NVARCHAR(255),
@FullTextIndexGenerated_b8e212878618 BIT,
@FullTextSearchFunction_b8e212878618 NVARCHAR(255),
@FullTextSearchFunctionGenerated_b8e212878618 BIT,
@UserViewMaxRows_b8e212878618 INT,
@spCreate_b8e212878618 NVARCHAR(255),
@spUpdate_b8e212878618 NVARCHAR(255),
@spDelete_b8e212878618 NVARCHAR(255),
@spCreateGenerated_b8e212878618 BIT,
@spUpdateGenerated_b8e212878618 BIT,
@spDeleteGenerated_b8e212878618 BIT,
@CascadeDeletes_b8e212878618 BIT,
@DeleteType_b8e212878618 NVARCHAR(10),
@AllowRecordMerge_b8e212878618 BIT,
@spMatch_b8e212878618 NVARCHAR(255),
@RelationshipDefaultDisplayType_b8e212878618 NVARCHAR(20),
@UserFormGenerated_b8e212878618 BIT,
@EntityObjectSubclassName_b8e212878618 NVARCHAR(255),
@EntityObjectSubclassImport_b8e212878618 NVARCHAR(255),
@PreferredCommunicationField_b8e212878618 NVARCHAR(255),
@Icon_b8e212878618 NVARCHAR(500),
@ScopeDefault_b8e212878618 NVARCHAR(100),
@RowsToPackWithSchema_b8e212878618 NVARCHAR(20),
@RowsToPackSampleMethod_b8e212878618 NVARCHAR(20),
@RowsToPackSampleCount_b8e212878618 INT,
@RowsToPackSampleOrder_b8e212878618 NVARCHAR(MAX),
@AutoRowCountFrequency_b8e212878618 INT,
@RowCount_b8e212878618 BIGINT,
@RowCountRunAt_b8e212878618 DATETIMEOFFSET,
@Status_b8e212878618 NVARCHAR(25),
@DisplayName_b8e212878618 NVARCHAR(255),
@AllowMultipleSubtypes_b8e212878618 BIT,
@AutoUpdateFullTextSearch_b8e212878618 BIT,
@AutoUpdateAllowUserSearchAPI_b8e212878618 BIT,
@TrustServerCacheCompletely_b8e212878618 BIT,
@SupportsGeoCoding_b8e212878618 BIT,
@AutoUpdateSupportsGeoCoding_b8e212878618 BIT,
@AllowCaching_b8e212878618 BIT,
@DetectExternalChanges_b8e212878618 BIT,
@ExternalDataSourceID_b8e212878618 UNIQUEIDENTIFIER,
@ExternalObjectName_b8e212878618 NVARCHAR(255),
@GeneratedBaseViewName_b8e212878618 NVARCHAR(255),
@AllowDirectSQLInsert_b8e212878618 BIT,
@AllowDirectSQLUpdate_b8e212878618 BIT,
@AllowDirectSQLDelete_b8e212878618 BIT,
@Configuration_b8e212878618 NVARCHAR(MAX),
@SubtypeSelector_b8e212878618 NVARCHAR(MAX),
@EnableFieldLevelSecurity_b8e212878618 BIT,
@ID_b8e212878618 UNIQUEIDENTIFIER
SET
  @Name_b8e212878618 = N'MJ_BizApps_Forms: Form Automations'
SET
  @Description_b8e212878618 = N'One configured on-submit automation for a form: an Action, an Agent or an entity binding, with its trigger, ordering, condition and execution mode'
SET
  @AutoUpdateDescription_b8e212878618 = 1
SET
  @BaseView_b8e212878618 = N'vwFormAutomations'
SET
  @BaseViewGenerated_b8e212878618 = 1
SET
  @VirtualEntity_b8e212878618 = 0
SET
  @TrackRecordChanges_b8e212878618 = 1
SET
  @AuditRecordAccess_b8e212878618 = 0
SET
  @AuditViewRuns_b8e212878618 = 0
SET
  @IncludeInAPI_b8e212878618 = 1
SET
  @AllowAllRowsAPI_b8e212878618 = 0
SET
  @AllowUpdateAPI_b8e212878618 = 1
SET
  @AllowCreateAPI_b8e212878618 = 1
SET
  @AllowDeleteAPI_b8e212878618 = 1
SET
  @CustomResolverAPI_b8e212878618 = 0
SET
  @AllowUserSearchAPI_b8e212878618 = 0
SET
  @FullTextSearchEnabled_b8e212878618 = 0
SET
  @FullTextCatalogGenerated_b8e212878618 = 1
SET
  @FullTextIndexGenerated_b8e212878618 = 1
SET
  @FullTextSearchFunctionGenerated_b8e212878618 = 1
SET
  @UserViewMaxRows_b8e212878618 = 1000
SET
  @spCreateGenerated_b8e212878618 = 1
SET
  @spUpdateGenerated_b8e212878618 = 1
SET
  @spDeleteGenerated_b8e212878618 = 1
SET
  @CascadeDeletes_b8e212878618 = 0
SET
  @DeleteType_b8e212878618 = N'Hard'
SET
  @AllowRecordMerge_b8e212878618 = 0
SET
  @RelationshipDefaultDisplayType_b8e212878618 = N'Search'
SET
  @UserFormGenerated_b8e212878618 = 1
SET
  @Icon_b8e212878618 = N'fa fa-bolt'
SET
  @RowsToPackWithSchema_b8e212878618 = N'None'
SET
  @RowsToPackSampleMethod_b8e212878618 = N'random'
SET
  @RowsToPackSampleCount_b8e212878618 = 0
SET
  @Status_b8e212878618 = N'Active'
SET
  @DisplayName_b8e212878618 = N'Form Automations'
SET
  @AllowMultipleSubtypes_b8e212878618 = 0
SET
  @AutoUpdateFullTextSearch_b8e212878618 = 1
SET
  @AutoUpdateAllowUserSearchAPI_b8e212878618 = 0
SET
  @TrustServerCacheCompletely_b8e212878618 = 1
SET
  @SupportsGeoCoding_b8e212878618 = 0
SET
  @AutoUpdateSupportsGeoCoding_b8e212878618 = 1
SET
  @AllowCaching_b8e212878618 = 0
SET
  @DetectExternalChanges_b8e212878618 = 0
SET
  @AllowDirectSQLInsert_b8e212878618 = 0
SET
  @AllowDirectSQLUpdate_b8e212878618 = 0
SET
  @AllowDirectSQLDelete_b8e212878618 = 0
SET
  @EnableFieldLevelSecurity_b8e212878618 = 0
SET
  @ID_b8e212878618 = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_b8e212878618,
  @ParentID_Clear = 1,
  @Name = @Name_b8e212878618,
  @NameSuffix = @NameSuffix_b8e212878618,
  @NameSuffix_Clear = 1,
  @Description = @Description_b8e212878618,
  @AutoUpdateDescription = @AutoUpdateDescription_b8e212878618,
  @BaseView = @BaseView_b8e212878618,
  @BaseViewGenerated = @BaseViewGenerated_b8e212878618,
  @VirtualEntity = @VirtualEntity_b8e212878618,
  @TrackRecordChanges = @TrackRecordChanges_b8e212878618,
  @AuditRecordAccess = @AuditRecordAccess_b8e212878618,
  @AuditViewRuns = @AuditViewRuns_b8e212878618,
  @IncludeInAPI = @IncludeInAPI_b8e212878618,
  @AllowAllRowsAPI = @AllowAllRowsAPI_b8e212878618,
  @AllowUpdateAPI = @AllowUpdateAPI_b8e212878618,
  @AllowCreateAPI = @AllowCreateAPI_b8e212878618,
  @AllowDeleteAPI = @AllowDeleteAPI_b8e212878618,
  @CustomResolverAPI = @CustomResolverAPI_b8e212878618,
  @AllowUserSearchAPI = @AllowUserSearchAPI_b8e212878618,
  @FullTextSearchEnabled = @FullTextSearchEnabled_b8e212878618,
  @FullTextCatalog = @FullTextCatalog_b8e212878618,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_b8e212878618,
  @FullTextIndex = @FullTextIndex_b8e212878618,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_b8e212878618,
  @FullTextSearchFunction = @FullTextSearchFunction_b8e212878618,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_b8e212878618,
  @UserViewMaxRows = @UserViewMaxRows_b8e212878618,
  @spCreate = @spCreate_b8e212878618,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_b8e212878618,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_b8e212878618,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_b8e212878618,
  @spUpdateGenerated = @spUpdateGenerated_b8e212878618,
  @spDeleteGenerated = @spDeleteGenerated_b8e212878618,
  @CascadeDeletes = @CascadeDeletes_b8e212878618,
  @DeleteType = @DeleteType_b8e212878618,
  @AllowRecordMerge = @AllowRecordMerge_b8e212878618,
  @spMatch = @spMatch_b8e212878618,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_b8e212878618,
  @UserFormGenerated = @UserFormGenerated_b8e212878618,
  @EntityObjectSubclassName = @EntityObjectSubclassName_b8e212878618,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_b8e212878618,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_b8e212878618,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_b8e212878618,
  @ScopeDefault = @ScopeDefault_b8e212878618,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_b8e212878618,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_b8e212878618,
  @RowsToPackSampleCount = @RowsToPackSampleCount_b8e212878618,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_b8e212878618,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_b8e212878618,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_b8e212878618,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_b8e212878618,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_b8e212878618,
  @DisplayName = @DisplayName_b8e212878618,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_b8e212878618,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_b8e212878618,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_b8e212878618,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_b8e212878618,
  @SupportsGeoCoding = @SupportsGeoCoding_b8e212878618,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_b8e212878618,
  @AllowCaching = @AllowCaching_b8e212878618,
  @DetectExternalChanges = @DetectExternalChanges_b8e212878618,
  @ExternalDataSourceID = @ExternalDataSourceID_b8e212878618,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_b8e212878618,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_b8e212878618,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_b8e212878618,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_b8e212878618,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_b8e212878618,
  @Configuration = @Configuration_b8e212878618,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_b8e212878618,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_b8e212878618,
  @ID = @ID_b8e212878618;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_6ad1be9eaf89 UNIQUEIDENTIFIER,
@Name_6ad1be9eaf89 NVARCHAR(255),
@NameSuffix_6ad1be9eaf89 NVARCHAR(255),
@Description_6ad1be9eaf89 NVARCHAR(MAX),
@AutoUpdateDescription_6ad1be9eaf89 BIT,
@BaseView_6ad1be9eaf89 NVARCHAR(255),
@BaseViewGenerated_6ad1be9eaf89 BIT,
@VirtualEntity_6ad1be9eaf89 BIT,
@TrackRecordChanges_6ad1be9eaf89 BIT,
@AuditRecordAccess_6ad1be9eaf89 BIT,
@AuditViewRuns_6ad1be9eaf89 BIT,
@IncludeInAPI_6ad1be9eaf89 BIT,
@AllowAllRowsAPI_6ad1be9eaf89 BIT,
@AllowUpdateAPI_6ad1be9eaf89 BIT,
@AllowCreateAPI_6ad1be9eaf89 BIT,
@AllowDeleteAPI_6ad1be9eaf89 BIT,
@CustomResolverAPI_6ad1be9eaf89 BIT,
@AllowUserSearchAPI_6ad1be9eaf89 BIT,
@FullTextSearchEnabled_6ad1be9eaf89 BIT,
@FullTextCatalog_6ad1be9eaf89 NVARCHAR(255),
@FullTextCatalogGenerated_6ad1be9eaf89 BIT,
@FullTextIndex_6ad1be9eaf89 NVARCHAR(255),
@FullTextIndexGenerated_6ad1be9eaf89 BIT,
@FullTextSearchFunction_6ad1be9eaf89 NVARCHAR(255),
@FullTextSearchFunctionGenerated_6ad1be9eaf89 BIT,
@UserViewMaxRows_6ad1be9eaf89 INT,
@spCreate_6ad1be9eaf89 NVARCHAR(255),
@spUpdate_6ad1be9eaf89 NVARCHAR(255),
@spDelete_6ad1be9eaf89 NVARCHAR(255),
@spCreateGenerated_6ad1be9eaf89 BIT,
@spUpdateGenerated_6ad1be9eaf89 BIT,
@spDeleteGenerated_6ad1be9eaf89 BIT,
@CascadeDeletes_6ad1be9eaf89 BIT,
@DeleteType_6ad1be9eaf89 NVARCHAR(10),
@AllowRecordMerge_6ad1be9eaf89 BIT,
@spMatch_6ad1be9eaf89 NVARCHAR(255),
@RelationshipDefaultDisplayType_6ad1be9eaf89 NVARCHAR(20),
@UserFormGenerated_6ad1be9eaf89 BIT,
@EntityObjectSubclassName_6ad1be9eaf89 NVARCHAR(255),
@EntityObjectSubclassImport_6ad1be9eaf89 NVARCHAR(255),
@PreferredCommunicationField_6ad1be9eaf89 NVARCHAR(255),
@Icon_6ad1be9eaf89 NVARCHAR(500),
@ScopeDefault_6ad1be9eaf89 NVARCHAR(100),
@RowsToPackWithSchema_6ad1be9eaf89 NVARCHAR(20),
@RowsToPackSampleMethod_6ad1be9eaf89 NVARCHAR(20),
@RowsToPackSampleCount_6ad1be9eaf89 INT,
@RowsToPackSampleOrder_6ad1be9eaf89 NVARCHAR(MAX),
@AutoRowCountFrequency_6ad1be9eaf89 INT,
@RowCount_6ad1be9eaf89 BIGINT,
@RowCountRunAt_6ad1be9eaf89 DATETIMEOFFSET,
@Status_6ad1be9eaf89 NVARCHAR(25),
@DisplayName_6ad1be9eaf89 NVARCHAR(255),
@AllowMultipleSubtypes_6ad1be9eaf89 BIT,
@AutoUpdateFullTextSearch_6ad1be9eaf89 BIT,
@AutoUpdateAllowUserSearchAPI_6ad1be9eaf89 BIT,
@TrustServerCacheCompletely_6ad1be9eaf89 BIT,
@SupportsGeoCoding_6ad1be9eaf89 BIT,
@AutoUpdateSupportsGeoCoding_6ad1be9eaf89 BIT,
@AllowCaching_6ad1be9eaf89 BIT,
@DetectExternalChanges_6ad1be9eaf89 BIT,
@ExternalDataSourceID_6ad1be9eaf89 UNIQUEIDENTIFIER,
@ExternalObjectName_6ad1be9eaf89 NVARCHAR(255),
@GeneratedBaseViewName_6ad1be9eaf89 NVARCHAR(255),
@AllowDirectSQLInsert_6ad1be9eaf89 BIT,
@AllowDirectSQLUpdate_6ad1be9eaf89 BIT,
@AllowDirectSQLDelete_6ad1be9eaf89 BIT,
@Configuration_6ad1be9eaf89 NVARCHAR(MAX),
@SubtypeSelector_6ad1be9eaf89 NVARCHAR(MAX),
@EnableFieldLevelSecurity_6ad1be9eaf89 BIT,
@ID_6ad1be9eaf89 UNIQUEIDENTIFIER
SET
  @Name_6ad1be9eaf89 = N'MJ_BizApps_Forms: Form Distributions'
SET
  @Description_6ad1be9eaf89 = N'A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link'
SET
  @AutoUpdateDescription_6ad1be9eaf89 = 1
SET
  @BaseView_6ad1be9eaf89 = N'vwFormDistributions'
SET
  @BaseViewGenerated_6ad1be9eaf89 = 1
SET
  @VirtualEntity_6ad1be9eaf89 = 0
SET
  @TrackRecordChanges_6ad1be9eaf89 = 1
SET
  @AuditRecordAccess_6ad1be9eaf89 = 0
SET
  @AuditViewRuns_6ad1be9eaf89 = 0
SET
  @IncludeInAPI_6ad1be9eaf89 = 1
SET
  @AllowAllRowsAPI_6ad1be9eaf89 = 0
SET
  @AllowUpdateAPI_6ad1be9eaf89 = 1
SET
  @AllowCreateAPI_6ad1be9eaf89 = 1
SET
  @AllowDeleteAPI_6ad1be9eaf89 = 1
SET
  @CustomResolverAPI_6ad1be9eaf89 = 0
SET
  @AllowUserSearchAPI_6ad1be9eaf89 = 0
SET
  @FullTextSearchEnabled_6ad1be9eaf89 = 0
SET
  @FullTextCatalogGenerated_6ad1be9eaf89 = 1
SET
  @FullTextIndexGenerated_6ad1be9eaf89 = 1
SET
  @FullTextSearchFunctionGenerated_6ad1be9eaf89 = 1
SET
  @UserViewMaxRows_6ad1be9eaf89 = 1000
SET
  @spCreateGenerated_6ad1be9eaf89 = 1
SET
  @spUpdateGenerated_6ad1be9eaf89 = 1
SET
  @spDeleteGenerated_6ad1be9eaf89 = 1
SET
  @CascadeDeletes_6ad1be9eaf89 = 0
SET
  @DeleteType_6ad1be9eaf89 = N'Hard'
SET
  @AllowRecordMerge_6ad1be9eaf89 = 0
SET
  @RelationshipDefaultDisplayType_6ad1be9eaf89 = N'Search'
SET
  @UserFormGenerated_6ad1be9eaf89 = 1
SET
  @Icon_6ad1be9eaf89 = N'fa fa-share-square'
SET
  @RowsToPackWithSchema_6ad1be9eaf89 = N'None'
SET
  @RowsToPackSampleMethod_6ad1be9eaf89 = N'random'
SET
  @RowsToPackSampleCount_6ad1be9eaf89 = 0
SET
  @Status_6ad1be9eaf89 = N'Active'
SET
  @DisplayName_6ad1be9eaf89 = N'Form Distributions'
SET
  @AllowMultipleSubtypes_6ad1be9eaf89 = 0
SET
  @AutoUpdateFullTextSearch_6ad1be9eaf89 = 1
SET
  @AutoUpdateAllowUserSearchAPI_6ad1be9eaf89 = 0
SET
  @TrustServerCacheCompletely_6ad1be9eaf89 = 1
SET
  @SupportsGeoCoding_6ad1be9eaf89 = 0
SET
  @AutoUpdateSupportsGeoCoding_6ad1be9eaf89 = 1
SET
  @AllowCaching_6ad1be9eaf89 = 0
SET
  @DetectExternalChanges_6ad1be9eaf89 = 0
SET
  @AllowDirectSQLInsert_6ad1be9eaf89 = 0
SET
  @AllowDirectSQLUpdate_6ad1be9eaf89 = 0
SET
  @AllowDirectSQLDelete_6ad1be9eaf89 = 0
SET
  @EnableFieldLevelSecurity_6ad1be9eaf89 = 0
SET
  @ID_6ad1be9eaf89 = '1FC60BDA-25B8-473B-ACE5-1238670D3535' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_6ad1be9eaf89,
  @ParentID_Clear = 1,
  @Name = @Name_6ad1be9eaf89,
  @NameSuffix = @NameSuffix_6ad1be9eaf89,
  @NameSuffix_Clear = 1,
  @Description = @Description_6ad1be9eaf89,
  @AutoUpdateDescription = @AutoUpdateDescription_6ad1be9eaf89,
  @BaseView = @BaseView_6ad1be9eaf89,
  @BaseViewGenerated = @BaseViewGenerated_6ad1be9eaf89,
  @VirtualEntity = @VirtualEntity_6ad1be9eaf89,
  @TrackRecordChanges = @TrackRecordChanges_6ad1be9eaf89,
  @AuditRecordAccess = @AuditRecordAccess_6ad1be9eaf89,
  @AuditViewRuns = @AuditViewRuns_6ad1be9eaf89,
  @IncludeInAPI = @IncludeInAPI_6ad1be9eaf89,
  @AllowAllRowsAPI = @AllowAllRowsAPI_6ad1be9eaf89,
  @AllowUpdateAPI = @AllowUpdateAPI_6ad1be9eaf89,
  @AllowCreateAPI = @AllowCreateAPI_6ad1be9eaf89,
  @AllowDeleteAPI = @AllowDeleteAPI_6ad1be9eaf89,
  @CustomResolverAPI = @CustomResolverAPI_6ad1be9eaf89,
  @AllowUserSearchAPI = @AllowUserSearchAPI_6ad1be9eaf89,
  @FullTextSearchEnabled = @FullTextSearchEnabled_6ad1be9eaf89,
  @FullTextCatalog = @FullTextCatalog_6ad1be9eaf89,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_6ad1be9eaf89,
  @FullTextIndex = @FullTextIndex_6ad1be9eaf89,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_6ad1be9eaf89,
  @FullTextSearchFunction = @FullTextSearchFunction_6ad1be9eaf89,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_6ad1be9eaf89,
  @UserViewMaxRows = @UserViewMaxRows_6ad1be9eaf89,
  @spCreate = @spCreate_6ad1be9eaf89,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_6ad1be9eaf89,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_6ad1be9eaf89,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_6ad1be9eaf89,
  @spUpdateGenerated = @spUpdateGenerated_6ad1be9eaf89,
  @spDeleteGenerated = @spDeleteGenerated_6ad1be9eaf89,
  @CascadeDeletes = @CascadeDeletes_6ad1be9eaf89,
  @DeleteType = @DeleteType_6ad1be9eaf89,
  @AllowRecordMerge = @AllowRecordMerge_6ad1be9eaf89,
  @spMatch = @spMatch_6ad1be9eaf89,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_6ad1be9eaf89,
  @UserFormGenerated = @UserFormGenerated_6ad1be9eaf89,
  @EntityObjectSubclassName = @EntityObjectSubclassName_6ad1be9eaf89,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_6ad1be9eaf89,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_6ad1be9eaf89,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_6ad1be9eaf89,
  @ScopeDefault = @ScopeDefault_6ad1be9eaf89,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_6ad1be9eaf89,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_6ad1be9eaf89,
  @RowsToPackSampleCount = @RowsToPackSampleCount_6ad1be9eaf89,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_6ad1be9eaf89,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_6ad1be9eaf89,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_6ad1be9eaf89,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_6ad1be9eaf89,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_6ad1be9eaf89,
  @DisplayName = @DisplayName_6ad1be9eaf89,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_6ad1be9eaf89,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_6ad1be9eaf89,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_6ad1be9eaf89,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_6ad1be9eaf89,
  @SupportsGeoCoding = @SupportsGeoCoding_6ad1be9eaf89,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_6ad1be9eaf89,
  @AllowCaching = @AllowCaching_6ad1be9eaf89,
  @DetectExternalChanges = @DetectExternalChanges_6ad1be9eaf89,
  @ExternalDataSourceID = @ExternalDataSourceID_6ad1be9eaf89,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_6ad1be9eaf89,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_6ad1be9eaf89,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_6ad1be9eaf89,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_6ad1be9eaf89,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_6ad1be9eaf89,
  @Configuration = @Configuration_6ad1be9eaf89,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_6ad1be9eaf89,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_6ad1be9eaf89,
  @ID = @ID_6ad1be9eaf89;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_056788f665e3 UNIQUEIDENTIFIER,
@Name_056788f665e3 NVARCHAR(255),
@NameSuffix_056788f665e3 NVARCHAR(255),
@Description_056788f665e3 NVARCHAR(MAX),
@AutoUpdateDescription_056788f665e3 BIT,
@BaseView_056788f665e3 NVARCHAR(255),
@BaseViewGenerated_056788f665e3 BIT,
@VirtualEntity_056788f665e3 BIT,
@TrackRecordChanges_056788f665e3 BIT,
@AuditRecordAccess_056788f665e3 BIT,
@AuditViewRuns_056788f665e3 BIT,
@IncludeInAPI_056788f665e3 BIT,
@AllowAllRowsAPI_056788f665e3 BIT,
@AllowUpdateAPI_056788f665e3 BIT,
@AllowCreateAPI_056788f665e3 BIT,
@AllowDeleteAPI_056788f665e3 BIT,
@CustomResolverAPI_056788f665e3 BIT,
@AllowUserSearchAPI_056788f665e3 BIT,
@FullTextSearchEnabled_056788f665e3 BIT,
@FullTextCatalog_056788f665e3 NVARCHAR(255),
@FullTextCatalogGenerated_056788f665e3 BIT,
@FullTextIndex_056788f665e3 NVARCHAR(255),
@FullTextIndexGenerated_056788f665e3 BIT,
@FullTextSearchFunction_056788f665e3 NVARCHAR(255),
@FullTextSearchFunctionGenerated_056788f665e3 BIT,
@UserViewMaxRows_056788f665e3 INT,
@spCreate_056788f665e3 NVARCHAR(255),
@spUpdate_056788f665e3 NVARCHAR(255),
@spDelete_056788f665e3 NVARCHAR(255),
@spCreateGenerated_056788f665e3 BIT,
@spUpdateGenerated_056788f665e3 BIT,
@spDeleteGenerated_056788f665e3 BIT,
@CascadeDeletes_056788f665e3 BIT,
@DeleteType_056788f665e3 NVARCHAR(10),
@AllowRecordMerge_056788f665e3 BIT,
@spMatch_056788f665e3 NVARCHAR(255),
@RelationshipDefaultDisplayType_056788f665e3 NVARCHAR(20),
@UserFormGenerated_056788f665e3 BIT,
@EntityObjectSubclassName_056788f665e3 NVARCHAR(255),
@EntityObjectSubclassImport_056788f665e3 NVARCHAR(255),
@PreferredCommunicationField_056788f665e3 NVARCHAR(255),
@Icon_056788f665e3 NVARCHAR(500),
@ScopeDefault_056788f665e3 NVARCHAR(100),
@RowsToPackWithSchema_056788f665e3 NVARCHAR(20),
@RowsToPackSampleMethod_056788f665e3 NVARCHAR(20),
@RowsToPackSampleCount_056788f665e3 INT,
@RowsToPackSampleOrder_056788f665e3 NVARCHAR(MAX),
@AutoRowCountFrequency_056788f665e3 INT,
@RowCount_056788f665e3 BIGINT,
@RowCountRunAt_056788f665e3 DATETIMEOFFSET,
@Status_056788f665e3 NVARCHAR(25),
@DisplayName_056788f665e3 NVARCHAR(255),
@AllowMultipleSubtypes_056788f665e3 BIT,
@AutoUpdateFullTextSearch_056788f665e3 BIT,
@AutoUpdateAllowUserSearchAPI_056788f665e3 BIT,
@TrustServerCacheCompletely_056788f665e3 BIT,
@SupportsGeoCoding_056788f665e3 BIT,
@AutoUpdateSupportsGeoCoding_056788f665e3 BIT,
@AllowCaching_056788f665e3 BIT,
@DetectExternalChanges_056788f665e3 BIT,
@ExternalDataSourceID_056788f665e3 UNIQUEIDENTIFIER,
@ExternalObjectName_056788f665e3 NVARCHAR(255),
@GeneratedBaseViewName_056788f665e3 NVARCHAR(255),
@AllowDirectSQLInsert_056788f665e3 BIT,
@AllowDirectSQLUpdate_056788f665e3 BIT,
@AllowDirectSQLDelete_056788f665e3 BIT,
@Configuration_056788f665e3 NVARCHAR(MAX),
@SubtypeSelector_056788f665e3 NVARCHAR(MAX),
@EnableFieldLevelSecurity_056788f665e3 BIT,
@ID_056788f665e3 UNIQUEIDENTIFIER
SET
  @Name_056788f665e3 = N'MJ_BizApps_Forms: Form Entity Binding Records'
SET
  @Description_056788f665e3 = N'Durable record of which target record a submission produced, making re-execution idempotent and the lineage queryable'
SET
  @AutoUpdateDescription_056788f665e3 = 1
SET
  @BaseView_056788f665e3 = N'vwFormEntityBindingRecords'
SET
  @BaseViewGenerated_056788f665e3 = 1
SET
  @VirtualEntity_056788f665e3 = 0
SET
  @TrackRecordChanges_056788f665e3 = 1
SET
  @AuditRecordAccess_056788f665e3 = 0
SET
  @AuditViewRuns_056788f665e3 = 0
SET
  @IncludeInAPI_056788f665e3 = 1
SET
  @AllowAllRowsAPI_056788f665e3 = 0
SET
  @AllowUpdateAPI_056788f665e3 = 1
SET
  @AllowCreateAPI_056788f665e3 = 1
SET
  @AllowDeleteAPI_056788f665e3 = 1
SET
  @CustomResolverAPI_056788f665e3 = 0
SET
  @AllowUserSearchAPI_056788f665e3 = 0
SET
  @FullTextSearchEnabled_056788f665e3 = 0
SET
  @FullTextCatalogGenerated_056788f665e3 = 1
SET
  @FullTextIndexGenerated_056788f665e3 = 1
SET
  @FullTextSearchFunctionGenerated_056788f665e3 = 1
SET
  @UserViewMaxRows_056788f665e3 = 1000
SET
  @spCreateGenerated_056788f665e3 = 1
SET
  @spUpdateGenerated_056788f665e3 = 1
SET
  @spDeleteGenerated_056788f665e3 = 1
SET
  @CascadeDeletes_056788f665e3 = 0
SET
  @DeleteType_056788f665e3 = N'Hard'
SET
  @AllowRecordMerge_056788f665e3 = 0
SET
  @RelationshipDefaultDisplayType_056788f665e3 = N'Search'
SET
  @UserFormGenerated_056788f665e3 = 1
SET
  @Icon_056788f665e3 = N'fa fa-tasks'
SET
  @RowsToPackWithSchema_056788f665e3 = N'None'
SET
  @RowsToPackSampleMethod_056788f665e3 = N'random'
SET
  @RowsToPackSampleCount_056788f665e3 = 0
SET
  @Status_056788f665e3 = N'Active'
SET
  @DisplayName_056788f665e3 = N'Form Entity Binding Records'
SET
  @AllowMultipleSubtypes_056788f665e3 = 0
SET
  @AutoUpdateFullTextSearch_056788f665e3 = 1
SET
  @AutoUpdateAllowUserSearchAPI_056788f665e3 = 0
SET
  @TrustServerCacheCompletely_056788f665e3 = 1
SET
  @SupportsGeoCoding_056788f665e3 = 0
SET
  @AutoUpdateSupportsGeoCoding_056788f665e3 = 1
SET
  @AllowCaching_056788f665e3 = 0
SET
  @DetectExternalChanges_056788f665e3 = 0
SET
  @AllowDirectSQLInsert_056788f665e3 = 0
SET
  @AllowDirectSQLUpdate_056788f665e3 = 0
SET
  @AllowDirectSQLDelete_056788f665e3 = 0
SET
  @EnableFieldLevelSecurity_056788f665e3 = 0
SET
  @ID_056788f665e3 = 'ED974050-6DA2-40DA-813B-38927002246B' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_056788f665e3,
  @ParentID_Clear = 1,
  @Name = @Name_056788f665e3,
  @NameSuffix = @NameSuffix_056788f665e3,
  @NameSuffix_Clear = 1,
  @Description = @Description_056788f665e3,
  @AutoUpdateDescription = @AutoUpdateDescription_056788f665e3,
  @BaseView = @BaseView_056788f665e3,
  @BaseViewGenerated = @BaseViewGenerated_056788f665e3,
  @VirtualEntity = @VirtualEntity_056788f665e3,
  @TrackRecordChanges = @TrackRecordChanges_056788f665e3,
  @AuditRecordAccess = @AuditRecordAccess_056788f665e3,
  @AuditViewRuns = @AuditViewRuns_056788f665e3,
  @IncludeInAPI = @IncludeInAPI_056788f665e3,
  @AllowAllRowsAPI = @AllowAllRowsAPI_056788f665e3,
  @AllowUpdateAPI = @AllowUpdateAPI_056788f665e3,
  @AllowCreateAPI = @AllowCreateAPI_056788f665e3,
  @AllowDeleteAPI = @AllowDeleteAPI_056788f665e3,
  @CustomResolverAPI = @CustomResolverAPI_056788f665e3,
  @AllowUserSearchAPI = @AllowUserSearchAPI_056788f665e3,
  @FullTextSearchEnabled = @FullTextSearchEnabled_056788f665e3,
  @FullTextCatalog = @FullTextCatalog_056788f665e3,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_056788f665e3,
  @FullTextIndex = @FullTextIndex_056788f665e3,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_056788f665e3,
  @FullTextSearchFunction = @FullTextSearchFunction_056788f665e3,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_056788f665e3,
  @UserViewMaxRows = @UserViewMaxRows_056788f665e3,
  @spCreate = @spCreate_056788f665e3,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_056788f665e3,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_056788f665e3,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_056788f665e3,
  @spUpdateGenerated = @spUpdateGenerated_056788f665e3,
  @spDeleteGenerated = @spDeleteGenerated_056788f665e3,
  @CascadeDeletes = @CascadeDeletes_056788f665e3,
  @DeleteType = @DeleteType_056788f665e3,
  @AllowRecordMerge = @AllowRecordMerge_056788f665e3,
  @spMatch = @spMatch_056788f665e3,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_056788f665e3,
  @UserFormGenerated = @UserFormGenerated_056788f665e3,
  @EntityObjectSubclassName = @EntityObjectSubclassName_056788f665e3,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_056788f665e3,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_056788f665e3,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_056788f665e3,
  @ScopeDefault = @ScopeDefault_056788f665e3,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_056788f665e3,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_056788f665e3,
  @RowsToPackSampleCount = @RowsToPackSampleCount_056788f665e3,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_056788f665e3,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_056788f665e3,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_056788f665e3,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_056788f665e3,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_056788f665e3,
  @DisplayName = @DisplayName_056788f665e3,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_056788f665e3,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_056788f665e3,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_056788f665e3,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_056788f665e3,
  @SupportsGeoCoding = @SupportsGeoCoding_056788f665e3,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_056788f665e3,
  @AllowCaching = @AllowCaching_056788f665e3,
  @DetectExternalChanges = @DetectExternalChanges_056788f665e3,
  @ExternalDataSourceID = @ExternalDataSourceID_056788f665e3,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_056788f665e3,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_056788f665e3,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_056788f665e3,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_056788f665e3,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_056788f665e3,
  @Configuration = @Configuration_056788f665e3,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_056788f665e3,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_056788f665e3,
  @ID = @ID_056788f665e3;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_9dc92d076663 UNIQUEIDENTIFIER,
@Name_9dc92d076663 NVARCHAR(255),
@NameSuffix_9dc92d076663 NVARCHAR(255),
@Description_9dc92d076663 NVARCHAR(MAX),
@AutoUpdateDescription_9dc92d076663 BIT,
@BaseView_9dc92d076663 NVARCHAR(255),
@BaseViewGenerated_9dc92d076663 BIT,
@VirtualEntity_9dc92d076663 BIT,
@TrackRecordChanges_9dc92d076663 BIT,
@AuditRecordAccess_9dc92d076663 BIT,
@AuditViewRuns_9dc92d076663 BIT,
@IncludeInAPI_9dc92d076663 BIT,
@AllowAllRowsAPI_9dc92d076663 BIT,
@AllowUpdateAPI_9dc92d076663 BIT,
@AllowCreateAPI_9dc92d076663 BIT,
@AllowDeleteAPI_9dc92d076663 BIT,
@CustomResolverAPI_9dc92d076663 BIT,
@AllowUserSearchAPI_9dc92d076663 BIT,
@FullTextSearchEnabled_9dc92d076663 BIT,
@FullTextCatalog_9dc92d076663 NVARCHAR(255),
@FullTextCatalogGenerated_9dc92d076663 BIT,
@FullTextIndex_9dc92d076663 NVARCHAR(255),
@FullTextIndexGenerated_9dc92d076663 BIT,
@FullTextSearchFunction_9dc92d076663 NVARCHAR(255),
@FullTextSearchFunctionGenerated_9dc92d076663 BIT,
@UserViewMaxRows_9dc92d076663 INT,
@spCreate_9dc92d076663 NVARCHAR(255),
@spUpdate_9dc92d076663 NVARCHAR(255),
@spDelete_9dc92d076663 NVARCHAR(255),
@spCreateGenerated_9dc92d076663 BIT,
@spUpdateGenerated_9dc92d076663 BIT,
@spDeleteGenerated_9dc92d076663 BIT,
@CascadeDeletes_9dc92d076663 BIT,
@DeleteType_9dc92d076663 NVARCHAR(10),
@AllowRecordMerge_9dc92d076663 BIT,
@spMatch_9dc92d076663 NVARCHAR(255),
@RelationshipDefaultDisplayType_9dc92d076663 NVARCHAR(20),
@UserFormGenerated_9dc92d076663 BIT,
@EntityObjectSubclassName_9dc92d076663 NVARCHAR(255),
@EntityObjectSubclassImport_9dc92d076663 NVARCHAR(255),
@PreferredCommunicationField_9dc92d076663 NVARCHAR(255),
@Icon_9dc92d076663 NVARCHAR(500),
@ScopeDefault_9dc92d076663 NVARCHAR(100),
@RowsToPackWithSchema_9dc92d076663 NVARCHAR(20),
@RowsToPackSampleMethod_9dc92d076663 NVARCHAR(20),
@RowsToPackSampleCount_9dc92d076663 INT,
@RowsToPackSampleOrder_9dc92d076663 NVARCHAR(MAX),
@AutoRowCountFrequency_9dc92d076663 INT,
@RowCount_9dc92d076663 BIGINT,
@RowCountRunAt_9dc92d076663 DATETIMEOFFSET,
@Status_9dc92d076663 NVARCHAR(25),
@DisplayName_9dc92d076663 NVARCHAR(255),
@AllowMultipleSubtypes_9dc92d076663 BIT,
@AutoUpdateFullTextSearch_9dc92d076663 BIT,
@AutoUpdateAllowUserSearchAPI_9dc92d076663 BIT,
@TrustServerCacheCompletely_9dc92d076663 BIT,
@SupportsGeoCoding_9dc92d076663 BIT,
@AutoUpdateSupportsGeoCoding_9dc92d076663 BIT,
@AllowCaching_9dc92d076663 BIT,
@DetectExternalChanges_9dc92d076663 BIT,
@ExternalDataSourceID_9dc92d076663 UNIQUEIDENTIFIER,
@ExternalObjectName_9dc92d076663 NVARCHAR(255),
@GeneratedBaseViewName_9dc92d076663 NVARCHAR(255),
@AllowDirectSQLInsert_9dc92d076663 BIT,
@AllowDirectSQLUpdate_9dc92d076663 BIT,
@AllowDirectSQLDelete_9dc92d076663 BIT,
@Configuration_9dc92d076663 NVARCHAR(MAX),
@SubtypeSelector_9dc92d076663 NVARCHAR(MAX),
@EnableFieldLevelSecurity_9dc92d076663 BIT,
@ID_9dc92d076663 UNIQUEIDENTIFIER
SET
  @Name_9dc92d076663 = N'MJ_BizApps_Forms: Form Entity Bindings'
SET
  @Description_9dc92d076663 = N'Declares that submissions to a form create or update a record of a target entity, via a field mapping, an identity rule and a merge policy'
SET
  @AutoUpdateDescription_9dc92d076663 = 1
SET
  @BaseView_9dc92d076663 = N'vwFormEntityBindings'
SET
  @BaseViewGenerated_9dc92d076663 = 1
SET
  @VirtualEntity_9dc92d076663 = 0
SET
  @TrackRecordChanges_9dc92d076663 = 1
SET
  @AuditRecordAccess_9dc92d076663 = 0
SET
  @AuditViewRuns_9dc92d076663 = 0
SET
  @IncludeInAPI_9dc92d076663 = 1
SET
  @AllowAllRowsAPI_9dc92d076663 = 0
SET
  @AllowUpdateAPI_9dc92d076663 = 1
SET
  @AllowCreateAPI_9dc92d076663 = 1
SET
  @AllowDeleteAPI_9dc92d076663 = 1
SET
  @CustomResolverAPI_9dc92d076663 = 0
SET
  @AllowUserSearchAPI_9dc92d076663 = 0
SET
  @FullTextSearchEnabled_9dc92d076663 = 0
SET
  @FullTextCatalogGenerated_9dc92d076663 = 1
SET
  @FullTextIndexGenerated_9dc92d076663 = 1
SET
  @FullTextSearchFunctionGenerated_9dc92d076663 = 1
SET
  @UserViewMaxRows_9dc92d076663 = 1000
SET
  @spCreateGenerated_9dc92d076663 = 1
SET
  @spUpdateGenerated_9dc92d076663 = 1
SET
  @spDeleteGenerated_9dc92d076663 = 1
SET
  @CascadeDeletes_9dc92d076663 = 0
SET
  @DeleteType_9dc92d076663 = N'Hard'
SET
  @AllowRecordMerge_9dc92d076663 = 0
SET
  @RelationshipDefaultDisplayType_9dc92d076663 = N'Search'
SET
  @UserFormGenerated_9dc92d076663 = 1
SET
  @Icon_9dc92d076663 = N'fa fa-plug'
SET
  @RowsToPackWithSchema_9dc92d076663 = N'None'
SET
  @RowsToPackSampleMethod_9dc92d076663 = N'random'
SET
  @RowsToPackSampleCount_9dc92d076663 = 0
SET
  @Status_9dc92d076663 = N'Active'
SET
  @DisplayName_9dc92d076663 = N'Form Entity Bindings'
SET
  @AllowMultipleSubtypes_9dc92d076663 = 0
SET
  @AutoUpdateFullTextSearch_9dc92d076663 = 1
SET
  @AutoUpdateAllowUserSearchAPI_9dc92d076663 = 0
SET
  @TrustServerCacheCompletely_9dc92d076663 = 1
SET
  @SupportsGeoCoding_9dc92d076663 = 0
SET
  @AutoUpdateSupportsGeoCoding_9dc92d076663 = 1
SET
  @AllowCaching_9dc92d076663 = 0
SET
  @DetectExternalChanges_9dc92d076663 = 0
SET
  @AllowDirectSQLInsert_9dc92d076663 = 0
SET
  @AllowDirectSQLUpdate_9dc92d076663 = 0
SET
  @AllowDirectSQLDelete_9dc92d076663 = 0
SET
  @EnableFieldLevelSecurity_9dc92d076663 = 0
SET
  @ID_9dc92d076663 = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_9dc92d076663,
  @ParentID_Clear = 1,
  @Name = @Name_9dc92d076663,
  @NameSuffix = @NameSuffix_9dc92d076663,
  @NameSuffix_Clear = 1,
  @Description = @Description_9dc92d076663,
  @AutoUpdateDescription = @AutoUpdateDescription_9dc92d076663,
  @BaseView = @BaseView_9dc92d076663,
  @BaseViewGenerated = @BaseViewGenerated_9dc92d076663,
  @VirtualEntity = @VirtualEntity_9dc92d076663,
  @TrackRecordChanges = @TrackRecordChanges_9dc92d076663,
  @AuditRecordAccess = @AuditRecordAccess_9dc92d076663,
  @AuditViewRuns = @AuditViewRuns_9dc92d076663,
  @IncludeInAPI = @IncludeInAPI_9dc92d076663,
  @AllowAllRowsAPI = @AllowAllRowsAPI_9dc92d076663,
  @AllowUpdateAPI = @AllowUpdateAPI_9dc92d076663,
  @AllowCreateAPI = @AllowCreateAPI_9dc92d076663,
  @AllowDeleteAPI = @AllowDeleteAPI_9dc92d076663,
  @CustomResolverAPI = @CustomResolverAPI_9dc92d076663,
  @AllowUserSearchAPI = @AllowUserSearchAPI_9dc92d076663,
  @FullTextSearchEnabled = @FullTextSearchEnabled_9dc92d076663,
  @FullTextCatalog = @FullTextCatalog_9dc92d076663,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_9dc92d076663,
  @FullTextIndex = @FullTextIndex_9dc92d076663,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_9dc92d076663,
  @FullTextSearchFunction = @FullTextSearchFunction_9dc92d076663,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_9dc92d076663,
  @UserViewMaxRows = @UserViewMaxRows_9dc92d076663,
  @spCreate = @spCreate_9dc92d076663,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_9dc92d076663,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_9dc92d076663,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_9dc92d076663,
  @spUpdateGenerated = @spUpdateGenerated_9dc92d076663,
  @spDeleteGenerated = @spDeleteGenerated_9dc92d076663,
  @CascadeDeletes = @CascadeDeletes_9dc92d076663,
  @DeleteType = @DeleteType_9dc92d076663,
  @AllowRecordMerge = @AllowRecordMerge_9dc92d076663,
  @spMatch = @spMatch_9dc92d076663,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_9dc92d076663,
  @UserFormGenerated = @UserFormGenerated_9dc92d076663,
  @EntityObjectSubclassName = @EntityObjectSubclassName_9dc92d076663,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_9dc92d076663,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_9dc92d076663,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_9dc92d076663,
  @ScopeDefault = @ScopeDefault_9dc92d076663,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_9dc92d076663,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_9dc92d076663,
  @RowsToPackSampleCount = @RowsToPackSampleCount_9dc92d076663,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_9dc92d076663,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_9dc92d076663,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_9dc92d076663,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_9dc92d076663,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_9dc92d076663,
  @DisplayName = @DisplayName_9dc92d076663,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_9dc92d076663,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_9dc92d076663,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_9dc92d076663,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_9dc92d076663,
  @SupportsGeoCoding = @SupportsGeoCoding_9dc92d076663,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_9dc92d076663,
  @AllowCaching = @AllowCaching_9dc92d076663,
  @DetectExternalChanges = @DetectExternalChanges_9dc92d076663,
  @ExternalDataSourceID = @ExternalDataSourceID_9dc92d076663,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_9dc92d076663,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_9dc92d076663,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_9dc92d076663,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_9dc92d076663,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_9dc92d076663,
  @Configuration = @Configuration_9dc92d076663,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_9dc92d076663,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_9dc92d076663,
  @ID = @ID_9dc92d076663;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_6ef7f587ec89 UNIQUEIDENTIFIER,
@Name_6ef7f587ec89 NVARCHAR(255),
@NameSuffix_6ef7f587ec89 NVARCHAR(255),
@Description_6ef7f587ec89 NVARCHAR(MAX),
@AutoUpdateDescription_6ef7f587ec89 BIT,
@BaseView_6ef7f587ec89 NVARCHAR(255),
@BaseViewGenerated_6ef7f587ec89 BIT,
@VirtualEntity_6ef7f587ec89 BIT,
@TrackRecordChanges_6ef7f587ec89 BIT,
@AuditRecordAccess_6ef7f587ec89 BIT,
@AuditViewRuns_6ef7f587ec89 BIT,
@IncludeInAPI_6ef7f587ec89 BIT,
@AllowAllRowsAPI_6ef7f587ec89 BIT,
@AllowUpdateAPI_6ef7f587ec89 BIT,
@AllowCreateAPI_6ef7f587ec89 BIT,
@AllowDeleteAPI_6ef7f587ec89 BIT,
@CustomResolverAPI_6ef7f587ec89 BIT,
@AllowUserSearchAPI_6ef7f587ec89 BIT,
@FullTextSearchEnabled_6ef7f587ec89 BIT,
@FullTextCatalog_6ef7f587ec89 NVARCHAR(255),
@FullTextCatalogGenerated_6ef7f587ec89 BIT,
@FullTextIndex_6ef7f587ec89 NVARCHAR(255),
@FullTextIndexGenerated_6ef7f587ec89 BIT,
@FullTextSearchFunction_6ef7f587ec89 NVARCHAR(255),
@FullTextSearchFunctionGenerated_6ef7f587ec89 BIT,
@UserViewMaxRows_6ef7f587ec89 INT,
@spCreate_6ef7f587ec89 NVARCHAR(255),
@spUpdate_6ef7f587ec89 NVARCHAR(255),
@spDelete_6ef7f587ec89 NVARCHAR(255),
@spCreateGenerated_6ef7f587ec89 BIT,
@spUpdateGenerated_6ef7f587ec89 BIT,
@spDeleteGenerated_6ef7f587ec89 BIT,
@CascadeDeletes_6ef7f587ec89 BIT,
@DeleteType_6ef7f587ec89 NVARCHAR(10),
@AllowRecordMerge_6ef7f587ec89 BIT,
@spMatch_6ef7f587ec89 NVARCHAR(255),
@RelationshipDefaultDisplayType_6ef7f587ec89 NVARCHAR(20),
@UserFormGenerated_6ef7f587ec89 BIT,
@EntityObjectSubclassName_6ef7f587ec89 NVARCHAR(255),
@EntityObjectSubclassImport_6ef7f587ec89 NVARCHAR(255),
@PreferredCommunicationField_6ef7f587ec89 NVARCHAR(255),
@Icon_6ef7f587ec89 NVARCHAR(500),
@ScopeDefault_6ef7f587ec89 NVARCHAR(100),
@RowsToPackWithSchema_6ef7f587ec89 NVARCHAR(20),
@RowsToPackSampleMethod_6ef7f587ec89 NVARCHAR(20),
@RowsToPackSampleCount_6ef7f587ec89 INT,
@RowsToPackSampleOrder_6ef7f587ec89 NVARCHAR(MAX),
@AutoRowCountFrequency_6ef7f587ec89 INT,
@RowCount_6ef7f587ec89 BIGINT,
@RowCountRunAt_6ef7f587ec89 DATETIMEOFFSET,
@Status_6ef7f587ec89 NVARCHAR(25),
@DisplayName_6ef7f587ec89 NVARCHAR(255),
@AllowMultipleSubtypes_6ef7f587ec89 BIT,
@AutoUpdateFullTextSearch_6ef7f587ec89 BIT,
@AutoUpdateAllowUserSearchAPI_6ef7f587ec89 BIT,
@TrustServerCacheCompletely_6ef7f587ec89 BIT,
@SupportsGeoCoding_6ef7f587ec89 BIT,
@AutoUpdateSupportsGeoCoding_6ef7f587ec89 BIT,
@AllowCaching_6ef7f587ec89 BIT,
@DetectExternalChanges_6ef7f587ec89 BIT,
@ExternalDataSourceID_6ef7f587ec89 UNIQUEIDENTIFIER,
@ExternalObjectName_6ef7f587ec89 NVARCHAR(255),
@GeneratedBaseViewName_6ef7f587ec89 NVARCHAR(255),
@AllowDirectSQLInsert_6ef7f587ec89 BIT,
@AllowDirectSQLUpdate_6ef7f587ec89 BIT,
@AllowDirectSQLDelete_6ef7f587ec89 BIT,
@Configuration_6ef7f587ec89 NVARCHAR(MAX),
@SubtypeSelector_6ef7f587ec89 NVARCHAR(MAX),
@EnableFieldLevelSecurity_6ef7f587ec89 BIT,
@ID_6ef7f587ec89 UNIQUEIDENTIFIER
SET
  @Name_6ef7f587ec89 = N'MJ_BizApps_Forms: Form Pages'
SET
  @Description_6ef7f587ec89 = N'An ordered page/section of a form'
SET
  @AutoUpdateDescription_6ef7f587ec89 = 1
SET
  @BaseView_6ef7f587ec89 = N'vwFormPages'
SET
  @BaseViewGenerated_6ef7f587ec89 = 1
SET
  @VirtualEntity_6ef7f587ec89 = 0
SET
  @TrackRecordChanges_6ef7f587ec89 = 1
SET
  @AuditRecordAccess_6ef7f587ec89 = 0
SET
  @AuditViewRuns_6ef7f587ec89 = 0
SET
  @IncludeInAPI_6ef7f587ec89 = 1
SET
  @AllowAllRowsAPI_6ef7f587ec89 = 0
SET
  @AllowUpdateAPI_6ef7f587ec89 = 1
SET
  @AllowCreateAPI_6ef7f587ec89 = 1
SET
  @AllowDeleteAPI_6ef7f587ec89 = 1
SET
  @CustomResolverAPI_6ef7f587ec89 = 0
SET
  @AllowUserSearchAPI_6ef7f587ec89 = 0
SET
  @FullTextSearchEnabled_6ef7f587ec89 = 0
SET
  @FullTextCatalogGenerated_6ef7f587ec89 = 1
SET
  @FullTextIndexGenerated_6ef7f587ec89 = 1
SET
  @FullTextSearchFunctionGenerated_6ef7f587ec89 = 1
SET
  @UserViewMaxRows_6ef7f587ec89 = 1000
SET
  @spCreateGenerated_6ef7f587ec89 = 1
SET
  @spUpdateGenerated_6ef7f587ec89 = 1
SET
  @spDeleteGenerated_6ef7f587ec89 = 1
SET
  @CascadeDeletes_6ef7f587ec89 = 0
SET
  @DeleteType_6ef7f587ec89 = N'Hard'
SET
  @AllowRecordMerge_6ef7f587ec89 = 0
SET
  @RelationshipDefaultDisplayType_6ef7f587ec89 = N'Search'
SET
  @UserFormGenerated_6ef7f587ec89 = 1
SET
  @Icon_6ef7f587ec89 = N'fa fa-file-medical-alt'
SET
  @RowsToPackWithSchema_6ef7f587ec89 = N'None'
SET
  @RowsToPackSampleMethod_6ef7f587ec89 = N'random'
SET
  @RowsToPackSampleCount_6ef7f587ec89 = 0
SET
  @Status_6ef7f587ec89 = N'Active'
SET
  @DisplayName_6ef7f587ec89 = N'Form Pages'
SET
  @AllowMultipleSubtypes_6ef7f587ec89 = 0
SET
  @AutoUpdateFullTextSearch_6ef7f587ec89 = 1
SET
  @AutoUpdateAllowUserSearchAPI_6ef7f587ec89 = 0
SET
  @TrustServerCacheCompletely_6ef7f587ec89 = 1
SET
  @SupportsGeoCoding_6ef7f587ec89 = 0
SET
  @AutoUpdateSupportsGeoCoding_6ef7f587ec89 = 1
SET
  @AllowCaching_6ef7f587ec89 = 0
SET
  @DetectExternalChanges_6ef7f587ec89 = 0
SET
  @AllowDirectSQLInsert_6ef7f587ec89 = 0
SET
  @AllowDirectSQLUpdate_6ef7f587ec89 = 0
SET
  @AllowDirectSQLDelete_6ef7f587ec89 = 0
SET
  @EnableFieldLevelSecurity_6ef7f587ec89 = 0
SET
  @ID_6ef7f587ec89 = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_6ef7f587ec89,
  @ParentID_Clear = 1,
  @Name = @Name_6ef7f587ec89,
  @NameSuffix = @NameSuffix_6ef7f587ec89,
  @NameSuffix_Clear = 1,
  @Description = @Description_6ef7f587ec89,
  @AutoUpdateDescription = @AutoUpdateDescription_6ef7f587ec89,
  @BaseView = @BaseView_6ef7f587ec89,
  @BaseViewGenerated = @BaseViewGenerated_6ef7f587ec89,
  @VirtualEntity = @VirtualEntity_6ef7f587ec89,
  @TrackRecordChanges = @TrackRecordChanges_6ef7f587ec89,
  @AuditRecordAccess = @AuditRecordAccess_6ef7f587ec89,
  @AuditViewRuns = @AuditViewRuns_6ef7f587ec89,
  @IncludeInAPI = @IncludeInAPI_6ef7f587ec89,
  @AllowAllRowsAPI = @AllowAllRowsAPI_6ef7f587ec89,
  @AllowUpdateAPI = @AllowUpdateAPI_6ef7f587ec89,
  @AllowCreateAPI = @AllowCreateAPI_6ef7f587ec89,
  @AllowDeleteAPI = @AllowDeleteAPI_6ef7f587ec89,
  @CustomResolverAPI = @CustomResolverAPI_6ef7f587ec89,
  @AllowUserSearchAPI = @AllowUserSearchAPI_6ef7f587ec89,
  @FullTextSearchEnabled = @FullTextSearchEnabled_6ef7f587ec89,
  @FullTextCatalog = @FullTextCatalog_6ef7f587ec89,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_6ef7f587ec89,
  @FullTextIndex = @FullTextIndex_6ef7f587ec89,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_6ef7f587ec89,
  @FullTextSearchFunction = @FullTextSearchFunction_6ef7f587ec89,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_6ef7f587ec89,
  @UserViewMaxRows = @UserViewMaxRows_6ef7f587ec89,
  @spCreate = @spCreate_6ef7f587ec89,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_6ef7f587ec89,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_6ef7f587ec89,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_6ef7f587ec89,
  @spUpdateGenerated = @spUpdateGenerated_6ef7f587ec89,
  @spDeleteGenerated = @spDeleteGenerated_6ef7f587ec89,
  @CascadeDeletes = @CascadeDeletes_6ef7f587ec89,
  @DeleteType = @DeleteType_6ef7f587ec89,
  @AllowRecordMerge = @AllowRecordMerge_6ef7f587ec89,
  @spMatch = @spMatch_6ef7f587ec89,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_6ef7f587ec89,
  @UserFormGenerated = @UserFormGenerated_6ef7f587ec89,
  @EntityObjectSubclassName = @EntityObjectSubclassName_6ef7f587ec89,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_6ef7f587ec89,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_6ef7f587ec89,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_6ef7f587ec89,
  @ScopeDefault = @ScopeDefault_6ef7f587ec89,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_6ef7f587ec89,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_6ef7f587ec89,
  @RowsToPackSampleCount = @RowsToPackSampleCount_6ef7f587ec89,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_6ef7f587ec89,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_6ef7f587ec89,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_6ef7f587ec89,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_6ef7f587ec89,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_6ef7f587ec89,
  @DisplayName = @DisplayName_6ef7f587ec89,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_6ef7f587ec89,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_6ef7f587ec89,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_6ef7f587ec89,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_6ef7f587ec89,
  @SupportsGeoCoding = @SupportsGeoCoding_6ef7f587ec89,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_6ef7f587ec89,
  @AllowCaching = @AllowCaching_6ef7f587ec89,
  @DetectExternalChanges = @DetectExternalChanges_6ef7f587ec89,
  @ExternalDataSourceID = @ExternalDataSourceID_6ef7f587ec89,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_6ef7f587ec89,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_6ef7f587ec89,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_6ef7f587ec89,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_6ef7f587ec89,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_6ef7f587ec89,
  @Configuration = @Configuration_6ef7f587ec89,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_6ef7f587ec89,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_6ef7f587ec89,
  @ID = @ID_6ef7f587ec89;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_3dfa1410a24f UNIQUEIDENTIFIER,
@Name_3dfa1410a24f NVARCHAR(255),
@NameSuffix_3dfa1410a24f NVARCHAR(255),
@Description_3dfa1410a24f NVARCHAR(MAX),
@AutoUpdateDescription_3dfa1410a24f BIT,
@BaseView_3dfa1410a24f NVARCHAR(255),
@BaseViewGenerated_3dfa1410a24f BIT,
@VirtualEntity_3dfa1410a24f BIT,
@TrackRecordChanges_3dfa1410a24f BIT,
@AuditRecordAccess_3dfa1410a24f BIT,
@AuditViewRuns_3dfa1410a24f BIT,
@IncludeInAPI_3dfa1410a24f BIT,
@AllowAllRowsAPI_3dfa1410a24f BIT,
@AllowUpdateAPI_3dfa1410a24f BIT,
@AllowCreateAPI_3dfa1410a24f BIT,
@AllowDeleteAPI_3dfa1410a24f BIT,
@CustomResolverAPI_3dfa1410a24f BIT,
@AllowUserSearchAPI_3dfa1410a24f BIT,
@FullTextSearchEnabled_3dfa1410a24f BIT,
@FullTextCatalog_3dfa1410a24f NVARCHAR(255),
@FullTextCatalogGenerated_3dfa1410a24f BIT,
@FullTextIndex_3dfa1410a24f NVARCHAR(255),
@FullTextIndexGenerated_3dfa1410a24f BIT,
@FullTextSearchFunction_3dfa1410a24f NVARCHAR(255),
@FullTextSearchFunctionGenerated_3dfa1410a24f BIT,
@UserViewMaxRows_3dfa1410a24f INT,
@spCreate_3dfa1410a24f NVARCHAR(255),
@spUpdate_3dfa1410a24f NVARCHAR(255),
@spDelete_3dfa1410a24f NVARCHAR(255),
@spCreateGenerated_3dfa1410a24f BIT,
@spUpdateGenerated_3dfa1410a24f BIT,
@spDeleteGenerated_3dfa1410a24f BIT,
@CascadeDeletes_3dfa1410a24f BIT,
@DeleteType_3dfa1410a24f NVARCHAR(10),
@AllowRecordMerge_3dfa1410a24f BIT,
@spMatch_3dfa1410a24f NVARCHAR(255),
@RelationshipDefaultDisplayType_3dfa1410a24f NVARCHAR(20),
@UserFormGenerated_3dfa1410a24f BIT,
@EntityObjectSubclassName_3dfa1410a24f NVARCHAR(255),
@EntityObjectSubclassImport_3dfa1410a24f NVARCHAR(255),
@PreferredCommunicationField_3dfa1410a24f NVARCHAR(255),
@Icon_3dfa1410a24f NVARCHAR(500),
@ScopeDefault_3dfa1410a24f NVARCHAR(100),
@RowsToPackWithSchema_3dfa1410a24f NVARCHAR(20),
@RowsToPackSampleMethod_3dfa1410a24f NVARCHAR(20),
@RowsToPackSampleCount_3dfa1410a24f INT,
@RowsToPackSampleOrder_3dfa1410a24f NVARCHAR(MAX),
@AutoRowCountFrequency_3dfa1410a24f INT,
@RowCount_3dfa1410a24f BIGINT,
@RowCountRunAt_3dfa1410a24f DATETIMEOFFSET,
@Status_3dfa1410a24f NVARCHAR(25),
@DisplayName_3dfa1410a24f NVARCHAR(255),
@AllowMultipleSubtypes_3dfa1410a24f BIT,
@AutoUpdateFullTextSearch_3dfa1410a24f BIT,
@AutoUpdateAllowUserSearchAPI_3dfa1410a24f BIT,
@TrustServerCacheCompletely_3dfa1410a24f BIT,
@SupportsGeoCoding_3dfa1410a24f BIT,
@AutoUpdateSupportsGeoCoding_3dfa1410a24f BIT,
@AllowCaching_3dfa1410a24f BIT,
@DetectExternalChanges_3dfa1410a24f BIT,
@ExternalDataSourceID_3dfa1410a24f UNIQUEIDENTIFIER,
@ExternalObjectName_3dfa1410a24f NVARCHAR(255),
@GeneratedBaseViewName_3dfa1410a24f NVARCHAR(255),
@AllowDirectSQLInsert_3dfa1410a24f BIT,
@AllowDirectSQLUpdate_3dfa1410a24f BIT,
@AllowDirectSQLDelete_3dfa1410a24f BIT,
@Configuration_3dfa1410a24f NVARCHAR(MAX),
@SubtypeSelector_3dfa1410a24f NVARCHAR(MAX),
@EnableFieldLevelSecurity_3dfa1410a24f BIT,
@ID_3dfa1410a24f UNIQUEIDENTIFIER
SET
  @Name_3dfa1410a24f = N'MJ_BizApps_Forms: Form Question Options'
SET
  @Description_3dfa1410a24f = N'A selectable choice offered by a choice-style question'
SET
  @AutoUpdateDescription_3dfa1410a24f = 1
SET
  @BaseView_3dfa1410a24f = N'vwFormQuestionOptions'
SET
  @BaseViewGenerated_3dfa1410a24f = 1
SET
  @VirtualEntity_3dfa1410a24f = 0
SET
  @TrackRecordChanges_3dfa1410a24f = 1
SET
  @AuditRecordAccess_3dfa1410a24f = 0
SET
  @AuditViewRuns_3dfa1410a24f = 0
SET
  @IncludeInAPI_3dfa1410a24f = 1
SET
  @AllowAllRowsAPI_3dfa1410a24f = 0
SET
  @AllowUpdateAPI_3dfa1410a24f = 1
SET
  @AllowCreateAPI_3dfa1410a24f = 1
SET
  @AllowDeleteAPI_3dfa1410a24f = 1
SET
  @CustomResolverAPI_3dfa1410a24f = 0
SET
  @AllowUserSearchAPI_3dfa1410a24f = 0
SET
  @FullTextSearchEnabled_3dfa1410a24f = 0
SET
  @FullTextCatalogGenerated_3dfa1410a24f = 1
SET
  @FullTextIndexGenerated_3dfa1410a24f = 1
SET
  @FullTextSearchFunctionGenerated_3dfa1410a24f = 1
SET
  @UserViewMaxRows_3dfa1410a24f = 1000
SET
  @spCreateGenerated_3dfa1410a24f = 1
SET
  @spUpdateGenerated_3dfa1410a24f = 1
SET
  @spDeleteGenerated_3dfa1410a24f = 1
SET
  @CascadeDeletes_3dfa1410a24f = 0
SET
  @DeleteType_3dfa1410a24f = N'Hard'
SET
  @AllowRecordMerge_3dfa1410a24f = 0
SET
  @RelationshipDefaultDisplayType_3dfa1410a24f = N'Search'
SET
  @UserFormGenerated_3dfa1410a24f = 1
SET
  @Icon_3dfa1410a24f = N'fa fa-list-ul'
SET
  @RowsToPackWithSchema_3dfa1410a24f = N'None'
SET
  @RowsToPackSampleMethod_3dfa1410a24f = N'random'
SET
  @RowsToPackSampleCount_3dfa1410a24f = 0
SET
  @Status_3dfa1410a24f = N'Active'
SET
  @DisplayName_3dfa1410a24f = N'Form Question Options'
SET
  @AllowMultipleSubtypes_3dfa1410a24f = 0
SET
  @AutoUpdateFullTextSearch_3dfa1410a24f = 1
SET
  @AutoUpdateAllowUserSearchAPI_3dfa1410a24f = 0
SET
  @TrustServerCacheCompletely_3dfa1410a24f = 1
SET
  @SupportsGeoCoding_3dfa1410a24f = 0
SET
  @AutoUpdateSupportsGeoCoding_3dfa1410a24f = 1
SET
  @AllowCaching_3dfa1410a24f = 0
SET
  @DetectExternalChanges_3dfa1410a24f = 0
SET
  @AllowDirectSQLInsert_3dfa1410a24f = 0
SET
  @AllowDirectSQLUpdate_3dfa1410a24f = 0
SET
  @AllowDirectSQLDelete_3dfa1410a24f = 0
SET
  @EnableFieldLevelSecurity_3dfa1410a24f = 0
SET
  @ID_3dfa1410a24f = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_3dfa1410a24f,
  @ParentID_Clear = 1,
  @Name = @Name_3dfa1410a24f,
  @NameSuffix = @NameSuffix_3dfa1410a24f,
  @NameSuffix_Clear = 1,
  @Description = @Description_3dfa1410a24f,
  @AutoUpdateDescription = @AutoUpdateDescription_3dfa1410a24f,
  @BaseView = @BaseView_3dfa1410a24f,
  @BaseViewGenerated = @BaseViewGenerated_3dfa1410a24f,
  @VirtualEntity = @VirtualEntity_3dfa1410a24f,
  @TrackRecordChanges = @TrackRecordChanges_3dfa1410a24f,
  @AuditRecordAccess = @AuditRecordAccess_3dfa1410a24f,
  @AuditViewRuns = @AuditViewRuns_3dfa1410a24f,
  @IncludeInAPI = @IncludeInAPI_3dfa1410a24f,
  @AllowAllRowsAPI = @AllowAllRowsAPI_3dfa1410a24f,
  @AllowUpdateAPI = @AllowUpdateAPI_3dfa1410a24f,
  @AllowCreateAPI = @AllowCreateAPI_3dfa1410a24f,
  @AllowDeleteAPI = @AllowDeleteAPI_3dfa1410a24f,
  @CustomResolverAPI = @CustomResolverAPI_3dfa1410a24f,
  @AllowUserSearchAPI = @AllowUserSearchAPI_3dfa1410a24f,
  @FullTextSearchEnabled = @FullTextSearchEnabled_3dfa1410a24f,
  @FullTextCatalog = @FullTextCatalog_3dfa1410a24f,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_3dfa1410a24f,
  @FullTextIndex = @FullTextIndex_3dfa1410a24f,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_3dfa1410a24f,
  @FullTextSearchFunction = @FullTextSearchFunction_3dfa1410a24f,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_3dfa1410a24f,
  @UserViewMaxRows = @UserViewMaxRows_3dfa1410a24f,
  @spCreate = @spCreate_3dfa1410a24f,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_3dfa1410a24f,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_3dfa1410a24f,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_3dfa1410a24f,
  @spUpdateGenerated = @spUpdateGenerated_3dfa1410a24f,
  @spDeleteGenerated = @spDeleteGenerated_3dfa1410a24f,
  @CascadeDeletes = @CascadeDeletes_3dfa1410a24f,
  @DeleteType = @DeleteType_3dfa1410a24f,
  @AllowRecordMerge = @AllowRecordMerge_3dfa1410a24f,
  @spMatch = @spMatch_3dfa1410a24f,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_3dfa1410a24f,
  @UserFormGenerated = @UserFormGenerated_3dfa1410a24f,
  @EntityObjectSubclassName = @EntityObjectSubclassName_3dfa1410a24f,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_3dfa1410a24f,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_3dfa1410a24f,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_3dfa1410a24f,
  @ScopeDefault = @ScopeDefault_3dfa1410a24f,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_3dfa1410a24f,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_3dfa1410a24f,
  @RowsToPackSampleCount = @RowsToPackSampleCount_3dfa1410a24f,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_3dfa1410a24f,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_3dfa1410a24f,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_3dfa1410a24f,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_3dfa1410a24f,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_3dfa1410a24f,
  @DisplayName = @DisplayName_3dfa1410a24f,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_3dfa1410a24f,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_3dfa1410a24f,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_3dfa1410a24f,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_3dfa1410a24f,
  @SupportsGeoCoding = @SupportsGeoCoding_3dfa1410a24f,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_3dfa1410a24f,
  @AllowCaching = @AllowCaching_3dfa1410a24f,
  @DetectExternalChanges = @DetectExternalChanges_3dfa1410a24f,
  @ExternalDataSourceID = @ExternalDataSourceID_3dfa1410a24f,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_3dfa1410a24f,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_3dfa1410a24f,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_3dfa1410a24f,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_3dfa1410a24f,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_3dfa1410a24f,
  @Configuration = @Configuration_3dfa1410a24f,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_3dfa1410a24f,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_3dfa1410a24f,
  @ID = @ID_3dfa1410a24f;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_20930ed52f85 UNIQUEIDENTIFIER,
@Name_20930ed52f85 NVARCHAR(255),
@NameSuffix_20930ed52f85 NVARCHAR(255),
@Description_20930ed52f85 NVARCHAR(MAX),
@AutoUpdateDescription_20930ed52f85 BIT,
@BaseView_20930ed52f85 NVARCHAR(255),
@BaseViewGenerated_20930ed52f85 BIT,
@VirtualEntity_20930ed52f85 BIT,
@TrackRecordChanges_20930ed52f85 BIT,
@AuditRecordAccess_20930ed52f85 BIT,
@AuditViewRuns_20930ed52f85 BIT,
@IncludeInAPI_20930ed52f85 BIT,
@AllowAllRowsAPI_20930ed52f85 BIT,
@AllowUpdateAPI_20930ed52f85 BIT,
@AllowCreateAPI_20930ed52f85 BIT,
@AllowDeleteAPI_20930ed52f85 BIT,
@CustomResolverAPI_20930ed52f85 BIT,
@AllowUserSearchAPI_20930ed52f85 BIT,
@FullTextSearchEnabled_20930ed52f85 BIT,
@FullTextCatalog_20930ed52f85 NVARCHAR(255),
@FullTextCatalogGenerated_20930ed52f85 BIT,
@FullTextIndex_20930ed52f85 NVARCHAR(255),
@FullTextIndexGenerated_20930ed52f85 BIT,
@FullTextSearchFunction_20930ed52f85 NVARCHAR(255),
@FullTextSearchFunctionGenerated_20930ed52f85 BIT,
@UserViewMaxRows_20930ed52f85 INT,
@spCreate_20930ed52f85 NVARCHAR(255),
@spUpdate_20930ed52f85 NVARCHAR(255),
@spDelete_20930ed52f85 NVARCHAR(255),
@spCreateGenerated_20930ed52f85 BIT,
@spUpdateGenerated_20930ed52f85 BIT,
@spDeleteGenerated_20930ed52f85 BIT,
@CascadeDeletes_20930ed52f85 BIT,
@DeleteType_20930ed52f85 NVARCHAR(10),
@AllowRecordMerge_20930ed52f85 BIT,
@spMatch_20930ed52f85 NVARCHAR(255),
@RelationshipDefaultDisplayType_20930ed52f85 NVARCHAR(20),
@UserFormGenerated_20930ed52f85 BIT,
@EntityObjectSubclassName_20930ed52f85 NVARCHAR(255),
@EntityObjectSubclassImport_20930ed52f85 NVARCHAR(255),
@PreferredCommunicationField_20930ed52f85 NVARCHAR(255),
@Icon_20930ed52f85 NVARCHAR(500),
@ScopeDefault_20930ed52f85 NVARCHAR(100),
@RowsToPackWithSchema_20930ed52f85 NVARCHAR(20),
@RowsToPackSampleMethod_20930ed52f85 NVARCHAR(20),
@RowsToPackSampleCount_20930ed52f85 INT,
@RowsToPackSampleOrder_20930ed52f85 NVARCHAR(MAX),
@AutoRowCountFrequency_20930ed52f85 INT,
@RowCount_20930ed52f85 BIGINT,
@RowCountRunAt_20930ed52f85 DATETIMEOFFSET,
@Status_20930ed52f85 NVARCHAR(25),
@DisplayName_20930ed52f85 NVARCHAR(255),
@AllowMultipleSubtypes_20930ed52f85 BIT,
@AutoUpdateFullTextSearch_20930ed52f85 BIT,
@AutoUpdateAllowUserSearchAPI_20930ed52f85 BIT,
@TrustServerCacheCompletely_20930ed52f85 BIT,
@SupportsGeoCoding_20930ed52f85 BIT,
@AutoUpdateSupportsGeoCoding_20930ed52f85 BIT,
@AllowCaching_20930ed52f85 BIT,
@DetectExternalChanges_20930ed52f85 BIT,
@ExternalDataSourceID_20930ed52f85 UNIQUEIDENTIFIER,
@ExternalObjectName_20930ed52f85 NVARCHAR(255),
@GeneratedBaseViewName_20930ed52f85 NVARCHAR(255),
@AllowDirectSQLInsert_20930ed52f85 BIT,
@AllowDirectSQLUpdate_20930ed52f85 BIT,
@AllowDirectSQLDelete_20930ed52f85 BIT,
@Configuration_20930ed52f85 NVARCHAR(MAX),
@SubtypeSelector_20930ed52f85 NVARCHAR(MAX),
@EnableFieldLevelSecurity_20930ed52f85 BIT,
@ID_20930ed52f85 UNIQUEIDENTIFIER
SET
  @Name_20930ed52f85 = N'MJ_BizApps_Forms: Form Questions'
SET
  @Description_20930ed52f85 = N'A single question/field within a form page'
SET
  @AutoUpdateDescription_20930ed52f85 = 1
SET
  @BaseView_20930ed52f85 = N'vwFormQuestions'
SET
  @BaseViewGenerated_20930ed52f85 = 1
SET
  @VirtualEntity_20930ed52f85 = 0
SET
  @TrackRecordChanges_20930ed52f85 = 1
SET
  @AuditRecordAccess_20930ed52f85 = 0
SET
  @AuditViewRuns_20930ed52f85 = 0
SET
  @IncludeInAPI_20930ed52f85 = 1
SET
  @AllowAllRowsAPI_20930ed52f85 = 0
SET
  @AllowUpdateAPI_20930ed52f85 = 1
SET
  @AllowCreateAPI_20930ed52f85 = 1
SET
  @AllowDeleteAPI_20930ed52f85 = 1
SET
  @CustomResolverAPI_20930ed52f85 = 0
SET
  @AllowUserSearchAPI_20930ed52f85 = 0
SET
  @FullTextSearchEnabled_20930ed52f85 = 0
SET
  @FullTextCatalogGenerated_20930ed52f85 = 1
SET
  @FullTextIndexGenerated_20930ed52f85 = 1
SET
  @FullTextSearchFunctionGenerated_20930ed52f85 = 1
SET
  @UserViewMaxRows_20930ed52f85 = 1000
SET
  @spCreateGenerated_20930ed52f85 = 1
SET
  @spUpdateGenerated_20930ed52f85 = 1
SET
  @spDeleteGenerated_20930ed52f85 = 1
SET
  @CascadeDeletes_20930ed52f85 = 0
SET
  @DeleteType_20930ed52f85 = N'Hard'
SET
  @AllowRecordMerge_20930ed52f85 = 0
SET
  @RelationshipDefaultDisplayType_20930ed52f85 = N'Search'
SET
  @UserFormGenerated_20930ed52f85 = 1
SET
  @Icon_20930ed52f85 = N'fa fa-question-circle'
SET
  @RowsToPackWithSchema_20930ed52f85 = N'None'
SET
  @RowsToPackSampleMethod_20930ed52f85 = N'random'
SET
  @RowsToPackSampleCount_20930ed52f85 = 0
SET
  @Status_20930ed52f85 = N'Active'
SET
  @DisplayName_20930ed52f85 = N'Form Questions'
SET
  @AllowMultipleSubtypes_20930ed52f85 = 0
SET
  @AutoUpdateFullTextSearch_20930ed52f85 = 1
SET
  @AutoUpdateAllowUserSearchAPI_20930ed52f85 = 0
SET
  @TrustServerCacheCompletely_20930ed52f85 = 1
SET
  @SupportsGeoCoding_20930ed52f85 = 0
SET
  @AutoUpdateSupportsGeoCoding_20930ed52f85 = 1
SET
  @AllowCaching_20930ed52f85 = 0
SET
  @DetectExternalChanges_20930ed52f85 = 0
SET
  @AllowDirectSQLInsert_20930ed52f85 = 0
SET
  @AllowDirectSQLUpdate_20930ed52f85 = 0
SET
  @AllowDirectSQLDelete_20930ed52f85 = 0
SET
  @EnableFieldLevelSecurity_20930ed52f85 = 0
SET
  @ID_20930ed52f85 = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_20930ed52f85,
  @ParentID_Clear = 1,
  @Name = @Name_20930ed52f85,
  @NameSuffix = @NameSuffix_20930ed52f85,
  @NameSuffix_Clear = 1,
  @Description = @Description_20930ed52f85,
  @AutoUpdateDescription = @AutoUpdateDescription_20930ed52f85,
  @BaseView = @BaseView_20930ed52f85,
  @BaseViewGenerated = @BaseViewGenerated_20930ed52f85,
  @VirtualEntity = @VirtualEntity_20930ed52f85,
  @TrackRecordChanges = @TrackRecordChanges_20930ed52f85,
  @AuditRecordAccess = @AuditRecordAccess_20930ed52f85,
  @AuditViewRuns = @AuditViewRuns_20930ed52f85,
  @IncludeInAPI = @IncludeInAPI_20930ed52f85,
  @AllowAllRowsAPI = @AllowAllRowsAPI_20930ed52f85,
  @AllowUpdateAPI = @AllowUpdateAPI_20930ed52f85,
  @AllowCreateAPI = @AllowCreateAPI_20930ed52f85,
  @AllowDeleteAPI = @AllowDeleteAPI_20930ed52f85,
  @CustomResolverAPI = @CustomResolverAPI_20930ed52f85,
  @AllowUserSearchAPI = @AllowUserSearchAPI_20930ed52f85,
  @FullTextSearchEnabled = @FullTextSearchEnabled_20930ed52f85,
  @FullTextCatalog = @FullTextCatalog_20930ed52f85,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_20930ed52f85,
  @FullTextIndex = @FullTextIndex_20930ed52f85,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_20930ed52f85,
  @FullTextSearchFunction = @FullTextSearchFunction_20930ed52f85,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_20930ed52f85,
  @UserViewMaxRows = @UserViewMaxRows_20930ed52f85,
  @spCreate = @spCreate_20930ed52f85,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_20930ed52f85,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_20930ed52f85,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_20930ed52f85,
  @spUpdateGenerated = @spUpdateGenerated_20930ed52f85,
  @spDeleteGenerated = @spDeleteGenerated_20930ed52f85,
  @CascadeDeletes = @CascadeDeletes_20930ed52f85,
  @DeleteType = @DeleteType_20930ed52f85,
  @AllowRecordMerge = @AllowRecordMerge_20930ed52f85,
  @spMatch = @spMatch_20930ed52f85,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_20930ed52f85,
  @UserFormGenerated = @UserFormGenerated_20930ed52f85,
  @EntityObjectSubclassName = @EntityObjectSubclassName_20930ed52f85,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_20930ed52f85,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_20930ed52f85,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_20930ed52f85,
  @ScopeDefault = @ScopeDefault_20930ed52f85,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_20930ed52f85,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_20930ed52f85,
  @RowsToPackSampleCount = @RowsToPackSampleCount_20930ed52f85,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_20930ed52f85,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_20930ed52f85,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_20930ed52f85,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_20930ed52f85,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_20930ed52f85,
  @DisplayName = @DisplayName_20930ed52f85,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_20930ed52f85,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_20930ed52f85,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_20930ed52f85,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_20930ed52f85,
  @SupportsGeoCoding = @SupportsGeoCoding_20930ed52f85,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_20930ed52f85,
  @AllowCaching = @AllowCaching_20930ed52f85,
  @DetectExternalChanges = @DetectExternalChanges_20930ed52f85,
  @ExternalDataSourceID = @ExternalDataSourceID_20930ed52f85,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_20930ed52f85,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_20930ed52f85,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_20930ed52f85,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_20930ed52f85,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_20930ed52f85,
  @Configuration = @Configuration_20930ed52f85,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_20930ed52f85,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_20930ed52f85,
  @ID = @ID_20930ed52f85;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_ef0b9de94ce3 UNIQUEIDENTIFIER,
@Name_ef0b9de94ce3 NVARCHAR(255),
@NameSuffix_ef0b9de94ce3 NVARCHAR(255),
@Description_ef0b9de94ce3 NVARCHAR(MAX),
@AutoUpdateDescription_ef0b9de94ce3 BIT,
@BaseView_ef0b9de94ce3 NVARCHAR(255),
@BaseViewGenerated_ef0b9de94ce3 BIT,
@VirtualEntity_ef0b9de94ce3 BIT,
@TrackRecordChanges_ef0b9de94ce3 BIT,
@AuditRecordAccess_ef0b9de94ce3 BIT,
@AuditViewRuns_ef0b9de94ce3 BIT,
@IncludeInAPI_ef0b9de94ce3 BIT,
@AllowAllRowsAPI_ef0b9de94ce3 BIT,
@AllowUpdateAPI_ef0b9de94ce3 BIT,
@AllowCreateAPI_ef0b9de94ce3 BIT,
@AllowDeleteAPI_ef0b9de94ce3 BIT,
@CustomResolverAPI_ef0b9de94ce3 BIT,
@AllowUserSearchAPI_ef0b9de94ce3 BIT,
@FullTextSearchEnabled_ef0b9de94ce3 BIT,
@FullTextCatalog_ef0b9de94ce3 NVARCHAR(255),
@FullTextCatalogGenerated_ef0b9de94ce3 BIT,
@FullTextIndex_ef0b9de94ce3 NVARCHAR(255),
@FullTextIndexGenerated_ef0b9de94ce3 BIT,
@FullTextSearchFunction_ef0b9de94ce3 NVARCHAR(255),
@FullTextSearchFunctionGenerated_ef0b9de94ce3 BIT,
@UserViewMaxRows_ef0b9de94ce3 INT,
@spCreate_ef0b9de94ce3 NVARCHAR(255),
@spUpdate_ef0b9de94ce3 NVARCHAR(255),
@spDelete_ef0b9de94ce3 NVARCHAR(255),
@spCreateGenerated_ef0b9de94ce3 BIT,
@spUpdateGenerated_ef0b9de94ce3 BIT,
@spDeleteGenerated_ef0b9de94ce3 BIT,
@CascadeDeletes_ef0b9de94ce3 BIT,
@DeleteType_ef0b9de94ce3 NVARCHAR(10),
@AllowRecordMerge_ef0b9de94ce3 BIT,
@spMatch_ef0b9de94ce3 NVARCHAR(255),
@RelationshipDefaultDisplayType_ef0b9de94ce3 NVARCHAR(20),
@UserFormGenerated_ef0b9de94ce3 BIT,
@EntityObjectSubclassName_ef0b9de94ce3 NVARCHAR(255),
@EntityObjectSubclassImport_ef0b9de94ce3 NVARCHAR(255),
@PreferredCommunicationField_ef0b9de94ce3 NVARCHAR(255),
@Icon_ef0b9de94ce3 NVARCHAR(500),
@ScopeDefault_ef0b9de94ce3 NVARCHAR(100),
@RowsToPackWithSchema_ef0b9de94ce3 NVARCHAR(20),
@RowsToPackSampleMethod_ef0b9de94ce3 NVARCHAR(20),
@RowsToPackSampleCount_ef0b9de94ce3 INT,
@RowsToPackSampleOrder_ef0b9de94ce3 NVARCHAR(MAX),
@AutoRowCountFrequency_ef0b9de94ce3 INT,
@RowCount_ef0b9de94ce3 BIGINT,
@RowCountRunAt_ef0b9de94ce3 DATETIMEOFFSET,
@Status_ef0b9de94ce3 NVARCHAR(25),
@DisplayName_ef0b9de94ce3 NVARCHAR(255),
@AllowMultipleSubtypes_ef0b9de94ce3 BIT,
@AutoUpdateFullTextSearch_ef0b9de94ce3 BIT,
@AutoUpdateAllowUserSearchAPI_ef0b9de94ce3 BIT,
@TrustServerCacheCompletely_ef0b9de94ce3 BIT,
@SupportsGeoCoding_ef0b9de94ce3 BIT,
@AutoUpdateSupportsGeoCoding_ef0b9de94ce3 BIT,
@AllowCaching_ef0b9de94ce3 BIT,
@DetectExternalChanges_ef0b9de94ce3 BIT,
@ExternalDataSourceID_ef0b9de94ce3 UNIQUEIDENTIFIER,
@ExternalObjectName_ef0b9de94ce3 NVARCHAR(255),
@GeneratedBaseViewName_ef0b9de94ce3 NVARCHAR(255),
@AllowDirectSQLInsert_ef0b9de94ce3 BIT,
@AllowDirectSQLUpdate_ef0b9de94ce3 BIT,
@AllowDirectSQLDelete_ef0b9de94ce3 BIT,
@Configuration_ef0b9de94ce3 NVARCHAR(MAX),
@SubtypeSelector_ef0b9de94ce3 NVARCHAR(MAX),
@EnableFieldLevelSecurity_ef0b9de94ce3 BIT,
@ID_ef0b9de94ce3 UNIQUEIDENTIFIER
SET
  @Name_ef0b9de94ce3 = N'MJ_BizApps_Forms: Form Response Answers'
SET
  @Description_ef0b9de94ce3 = N'One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.'
SET
  @AutoUpdateDescription_ef0b9de94ce3 = 1
SET
  @BaseView_ef0b9de94ce3 = N'vwFormResponseAnswers'
SET
  @BaseViewGenerated_ef0b9de94ce3 = 1
SET
  @VirtualEntity_ef0b9de94ce3 = 0
SET
  @TrackRecordChanges_ef0b9de94ce3 = 1
SET
  @AuditRecordAccess_ef0b9de94ce3 = 0
SET
  @AuditViewRuns_ef0b9de94ce3 = 0
SET
  @IncludeInAPI_ef0b9de94ce3 = 1
SET
  @AllowAllRowsAPI_ef0b9de94ce3 = 0
SET
  @AllowUpdateAPI_ef0b9de94ce3 = 1
SET
  @AllowCreateAPI_ef0b9de94ce3 = 1
SET
  @AllowDeleteAPI_ef0b9de94ce3 = 1
SET
  @CustomResolverAPI_ef0b9de94ce3 = 0
SET
  @AllowUserSearchAPI_ef0b9de94ce3 = 0
SET
  @FullTextSearchEnabled_ef0b9de94ce3 = 0
SET
  @FullTextCatalogGenerated_ef0b9de94ce3 = 1
SET
  @FullTextIndexGenerated_ef0b9de94ce3 = 1
SET
  @FullTextSearchFunctionGenerated_ef0b9de94ce3 = 1
SET
  @UserViewMaxRows_ef0b9de94ce3 = 1000
SET
  @spCreateGenerated_ef0b9de94ce3 = 1
SET
  @spUpdateGenerated_ef0b9de94ce3 = 1
SET
  @spDeleteGenerated_ef0b9de94ce3 = 1
SET
  @CascadeDeletes_ef0b9de94ce3 = 0
SET
  @DeleteType_ef0b9de94ce3 = N'Hard'
SET
  @AllowRecordMerge_ef0b9de94ce3 = 0
SET
  @RelationshipDefaultDisplayType_ef0b9de94ce3 = N'Search'
SET
  @UserFormGenerated_ef0b9de94ce3 = 1
SET
  @Icon_ef0b9de94ce3 = N'fa fa-list-alt'
SET
  @RowsToPackWithSchema_ef0b9de94ce3 = N'None'
SET
  @RowsToPackSampleMethod_ef0b9de94ce3 = N'random'
SET
  @RowsToPackSampleCount_ef0b9de94ce3 = 0
SET
  @Status_ef0b9de94ce3 = N'Active'
SET
  @DisplayName_ef0b9de94ce3 = N'Form Response Answers'
SET
  @AllowMultipleSubtypes_ef0b9de94ce3 = 0
SET
  @AutoUpdateFullTextSearch_ef0b9de94ce3 = 1
SET
  @AutoUpdateAllowUserSearchAPI_ef0b9de94ce3 = 0
SET
  @TrustServerCacheCompletely_ef0b9de94ce3 = 1
SET
  @SupportsGeoCoding_ef0b9de94ce3 = 0
SET
  @AutoUpdateSupportsGeoCoding_ef0b9de94ce3 = 1
SET
  @AllowCaching_ef0b9de94ce3 = 0
SET
  @DetectExternalChanges_ef0b9de94ce3 = 0
SET
  @AllowDirectSQLInsert_ef0b9de94ce3 = 0
SET
  @AllowDirectSQLUpdate_ef0b9de94ce3 = 0
SET
  @AllowDirectSQLDelete_ef0b9de94ce3 = 0
SET
  @EnableFieldLevelSecurity_ef0b9de94ce3 = 0
SET
  @ID_ef0b9de94ce3 = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_ef0b9de94ce3,
  @ParentID_Clear = 1,
  @Name = @Name_ef0b9de94ce3,
  @NameSuffix = @NameSuffix_ef0b9de94ce3,
  @NameSuffix_Clear = 1,
  @Description = @Description_ef0b9de94ce3,
  @AutoUpdateDescription = @AutoUpdateDescription_ef0b9de94ce3,
  @BaseView = @BaseView_ef0b9de94ce3,
  @BaseViewGenerated = @BaseViewGenerated_ef0b9de94ce3,
  @VirtualEntity = @VirtualEntity_ef0b9de94ce3,
  @TrackRecordChanges = @TrackRecordChanges_ef0b9de94ce3,
  @AuditRecordAccess = @AuditRecordAccess_ef0b9de94ce3,
  @AuditViewRuns = @AuditViewRuns_ef0b9de94ce3,
  @IncludeInAPI = @IncludeInAPI_ef0b9de94ce3,
  @AllowAllRowsAPI = @AllowAllRowsAPI_ef0b9de94ce3,
  @AllowUpdateAPI = @AllowUpdateAPI_ef0b9de94ce3,
  @AllowCreateAPI = @AllowCreateAPI_ef0b9de94ce3,
  @AllowDeleteAPI = @AllowDeleteAPI_ef0b9de94ce3,
  @CustomResolverAPI = @CustomResolverAPI_ef0b9de94ce3,
  @AllowUserSearchAPI = @AllowUserSearchAPI_ef0b9de94ce3,
  @FullTextSearchEnabled = @FullTextSearchEnabled_ef0b9de94ce3,
  @FullTextCatalog = @FullTextCatalog_ef0b9de94ce3,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_ef0b9de94ce3,
  @FullTextIndex = @FullTextIndex_ef0b9de94ce3,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_ef0b9de94ce3,
  @FullTextSearchFunction = @FullTextSearchFunction_ef0b9de94ce3,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_ef0b9de94ce3,
  @UserViewMaxRows = @UserViewMaxRows_ef0b9de94ce3,
  @spCreate = @spCreate_ef0b9de94ce3,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_ef0b9de94ce3,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_ef0b9de94ce3,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_ef0b9de94ce3,
  @spUpdateGenerated = @spUpdateGenerated_ef0b9de94ce3,
  @spDeleteGenerated = @spDeleteGenerated_ef0b9de94ce3,
  @CascadeDeletes = @CascadeDeletes_ef0b9de94ce3,
  @DeleteType = @DeleteType_ef0b9de94ce3,
  @AllowRecordMerge = @AllowRecordMerge_ef0b9de94ce3,
  @spMatch = @spMatch_ef0b9de94ce3,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_ef0b9de94ce3,
  @UserFormGenerated = @UserFormGenerated_ef0b9de94ce3,
  @EntityObjectSubclassName = @EntityObjectSubclassName_ef0b9de94ce3,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_ef0b9de94ce3,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_ef0b9de94ce3,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_ef0b9de94ce3,
  @ScopeDefault = @ScopeDefault_ef0b9de94ce3,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_ef0b9de94ce3,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_ef0b9de94ce3,
  @RowsToPackSampleCount = @RowsToPackSampleCount_ef0b9de94ce3,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_ef0b9de94ce3,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_ef0b9de94ce3,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_ef0b9de94ce3,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_ef0b9de94ce3,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_ef0b9de94ce3,
  @DisplayName = @DisplayName_ef0b9de94ce3,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_ef0b9de94ce3,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_ef0b9de94ce3,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_ef0b9de94ce3,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_ef0b9de94ce3,
  @SupportsGeoCoding = @SupportsGeoCoding_ef0b9de94ce3,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_ef0b9de94ce3,
  @AllowCaching = @AllowCaching_ef0b9de94ce3,
  @DetectExternalChanges = @DetectExternalChanges_ef0b9de94ce3,
  @ExternalDataSourceID = @ExternalDataSourceID_ef0b9de94ce3,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_ef0b9de94ce3,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_ef0b9de94ce3,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_ef0b9de94ce3,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_ef0b9de94ce3,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_ef0b9de94ce3,
  @Configuration = @Configuration_ef0b9de94ce3,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_ef0b9de94ce3,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_ef0b9de94ce3,
  @ID = @ID_ef0b9de94ce3;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_2f3f249b8c38 UNIQUEIDENTIFIER,
@Name_2f3f249b8c38 NVARCHAR(255),
@NameSuffix_2f3f249b8c38 NVARCHAR(255),
@Description_2f3f249b8c38 NVARCHAR(MAX),
@AutoUpdateDescription_2f3f249b8c38 BIT,
@BaseView_2f3f249b8c38 NVARCHAR(255),
@BaseViewGenerated_2f3f249b8c38 BIT,
@VirtualEntity_2f3f249b8c38 BIT,
@TrackRecordChanges_2f3f249b8c38 BIT,
@AuditRecordAccess_2f3f249b8c38 BIT,
@AuditViewRuns_2f3f249b8c38 BIT,
@IncludeInAPI_2f3f249b8c38 BIT,
@AllowAllRowsAPI_2f3f249b8c38 BIT,
@AllowUpdateAPI_2f3f249b8c38 BIT,
@AllowCreateAPI_2f3f249b8c38 BIT,
@AllowDeleteAPI_2f3f249b8c38 BIT,
@CustomResolverAPI_2f3f249b8c38 BIT,
@AllowUserSearchAPI_2f3f249b8c38 BIT,
@FullTextSearchEnabled_2f3f249b8c38 BIT,
@FullTextCatalog_2f3f249b8c38 NVARCHAR(255),
@FullTextCatalogGenerated_2f3f249b8c38 BIT,
@FullTextIndex_2f3f249b8c38 NVARCHAR(255),
@FullTextIndexGenerated_2f3f249b8c38 BIT,
@FullTextSearchFunction_2f3f249b8c38 NVARCHAR(255),
@FullTextSearchFunctionGenerated_2f3f249b8c38 BIT,
@UserViewMaxRows_2f3f249b8c38 INT,
@spCreate_2f3f249b8c38 NVARCHAR(255),
@spUpdate_2f3f249b8c38 NVARCHAR(255),
@spDelete_2f3f249b8c38 NVARCHAR(255),
@spCreateGenerated_2f3f249b8c38 BIT,
@spUpdateGenerated_2f3f249b8c38 BIT,
@spDeleteGenerated_2f3f249b8c38 BIT,
@CascadeDeletes_2f3f249b8c38 BIT,
@DeleteType_2f3f249b8c38 NVARCHAR(10),
@AllowRecordMerge_2f3f249b8c38 BIT,
@spMatch_2f3f249b8c38 NVARCHAR(255),
@RelationshipDefaultDisplayType_2f3f249b8c38 NVARCHAR(20),
@UserFormGenerated_2f3f249b8c38 BIT,
@EntityObjectSubclassName_2f3f249b8c38 NVARCHAR(255),
@EntityObjectSubclassImport_2f3f249b8c38 NVARCHAR(255),
@PreferredCommunicationField_2f3f249b8c38 NVARCHAR(255),
@Icon_2f3f249b8c38 NVARCHAR(500),
@ScopeDefault_2f3f249b8c38 NVARCHAR(100),
@RowsToPackWithSchema_2f3f249b8c38 NVARCHAR(20),
@RowsToPackSampleMethod_2f3f249b8c38 NVARCHAR(20),
@RowsToPackSampleCount_2f3f249b8c38 INT,
@RowsToPackSampleOrder_2f3f249b8c38 NVARCHAR(MAX),
@AutoRowCountFrequency_2f3f249b8c38 INT,
@RowCount_2f3f249b8c38 BIGINT,
@RowCountRunAt_2f3f249b8c38 DATETIMEOFFSET,
@Status_2f3f249b8c38 NVARCHAR(25),
@DisplayName_2f3f249b8c38 NVARCHAR(255),
@AllowMultipleSubtypes_2f3f249b8c38 BIT,
@AutoUpdateFullTextSearch_2f3f249b8c38 BIT,
@AutoUpdateAllowUserSearchAPI_2f3f249b8c38 BIT,
@TrustServerCacheCompletely_2f3f249b8c38 BIT,
@SupportsGeoCoding_2f3f249b8c38 BIT,
@AutoUpdateSupportsGeoCoding_2f3f249b8c38 BIT,
@AllowCaching_2f3f249b8c38 BIT,
@DetectExternalChanges_2f3f249b8c38 BIT,
@ExternalDataSourceID_2f3f249b8c38 UNIQUEIDENTIFIER,
@ExternalObjectName_2f3f249b8c38 NVARCHAR(255),
@GeneratedBaseViewName_2f3f249b8c38 NVARCHAR(255),
@AllowDirectSQLInsert_2f3f249b8c38 BIT,
@AllowDirectSQLUpdate_2f3f249b8c38 BIT,
@AllowDirectSQLDelete_2f3f249b8c38 BIT,
@Configuration_2f3f249b8c38 NVARCHAR(MAX),
@SubtypeSelector_2f3f249b8c38 NVARCHAR(MAX),
@EnableFieldLevelSecurity_2f3f249b8c38 BIT,
@ID_2f3f249b8c38 UNIQUEIDENTIFIER
SET
  @Name_2f3f249b8c38 = N'MJ_BizApps_Forms: Form Responses'
SET
  @Description_2f3f249b8c38 = N'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.'
SET
  @AutoUpdateDescription_2f3f249b8c38 = 1
SET
  @BaseView_2f3f249b8c38 = N'vwFormResponses'
SET
  @BaseViewGenerated_2f3f249b8c38 = 1
SET
  @VirtualEntity_2f3f249b8c38 = 0
SET
  @TrackRecordChanges_2f3f249b8c38 = 1
SET
  @AuditRecordAccess_2f3f249b8c38 = 0
SET
  @AuditViewRuns_2f3f249b8c38 = 0
SET
  @IncludeInAPI_2f3f249b8c38 = 1
SET
  @AllowAllRowsAPI_2f3f249b8c38 = 0
SET
  @AllowUpdateAPI_2f3f249b8c38 = 1
SET
  @AllowCreateAPI_2f3f249b8c38 = 1
SET
  @AllowDeleteAPI_2f3f249b8c38 = 1
SET
  @CustomResolverAPI_2f3f249b8c38 = 0
SET
  @AllowUserSearchAPI_2f3f249b8c38 = 0
SET
  @FullTextSearchEnabled_2f3f249b8c38 = 0
SET
  @FullTextCatalogGenerated_2f3f249b8c38 = 1
SET
  @FullTextIndexGenerated_2f3f249b8c38 = 1
SET
  @FullTextSearchFunctionGenerated_2f3f249b8c38 = 1
SET
  @UserViewMaxRows_2f3f249b8c38 = 1000
SET
  @spCreateGenerated_2f3f249b8c38 = 1
SET
  @spUpdateGenerated_2f3f249b8c38 = 1
SET
  @spDeleteGenerated_2f3f249b8c38 = 1
SET
  @CascadeDeletes_2f3f249b8c38 = 0
SET
  @DeleteType_2f3f249b8c38 = N'Hard'
SET
  @AllowRecordMerge_2f3f249b8c38 = 0
SET
  @RelationshipDefaultDisplayType_2f3f249b8c38 = N'Search'
SET
  @UserFormGenerated_2f3f249b8c38 = 1
SET
  @Icon_2f3f249b8c38 = N'fa fa-file-signature'
SET
  @RowsToPackWithSchema_2f3f249b8c38 = N'None'
SET
  @RowsToPackSampleMethod_2f3f249b8c38 = N'random'
SET
  @RowsToPackSampleCount_2f3f249b8c38 = 0
SET
  @Status_2f3f249b8c38 = N'Active'
SET
  @DisplayName_2f3f249b8c38 = N'Form Responses'
SET
  @AllowMultipleSubtypes_2f3f249b8c38 = 0
SET
  @AutoUpdateFullTextSearch_2f3f249b8c38 = 1
SET
  @AutoUpdateAllowUserSearchAPI_2f3f249b8c38 = 0
SET
  @TrustServerCacheCompletely_2f3f249b8c38 = 1
SET
  @SupportsGeoCoding_2f3f249b8c38 = 0
SET
  @AutoUpdateSupportsGeoCoding_2f3f249b8c38 = 1
SET
  @AllowCaching_2f3f249b8c38 = 0
SET
  @DetectExternalChanges_2f3f249b8c38 = 0
SET
  @AllowDirectSQLInsert_2f3f249b8c38 = 0
SET
  @AllowDirectSQLUpdate_2f3f249b8c38 = 0
SET
  @AllowDirectSQLDelete_2f3f249b8c38 = 0
SET
  @EnableFieldLevelSecurity_2f3f249b8c38 = 0
SET
  @ID_2f3f249b8c38 = '63600739-7165-4BDC-B7D7-19A1B1951DFA' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_2f3f249b8c38,
  @ParentID_Clear = 1,
  @Name = @Name_2f3f249b8c38,
  @NameSuffix = @NameSuffix_2f3f249b8c38,
  @NameSuffix_Clear = 1,
  @Description = @Description_2f3f249b8c38,
  @AutoUpdateDescription = @AutoUpdateDescription_2f3f249b8c38,
  @BaseView = @BaseView_2f3f249b8c38,
  @BaseViewGenerated = @BaseViewGenerated_2f3f249b8c38,
  @VirtualEntity = @VirtualEntity_2f3f249b8c38,
  @TrackRecordChanges = @TrackRecordChanges_2f3f249b8c38,
  @AuditRecordAccess = @AuditRecordAccess_2f3f249b8c38,
  @AuditViewRuns = @AuditViewRuns_2f3f249b8c38,
  @IncludeInAPI = @IncludeInAPI_2f3f249b8c38,
  @AllowAllRowsAPI = @AllowAllRowsAPI_2f3f249b8c38,
  @AllowUpdateAPI = @AllowUpdateAPI_2f3f249b8c38,
  @AllowCreateAPI = @AllowCreateAPI_2f3f249b8c38,
  @AllowDeleteAPI = @AllowDeleteAPI_2f3f249b8c38,
  @CustomResolverAPI = @CustomResolverAPI_2f3f249b8c38,
  @AllowUserSearchAPI = @AllowUserSearchAPI_2f3f249b8c38,
  @FullTextSearchEnabled = @FullTextSearchEnabled_2f3f249b8c38,
  @FullTextCatalog = @FullTextCatalog_2f3f249b8c38,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_2f3f249b8c38,
  @FullTextIndex = @FullTextIndex_2f3f249b8c38,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_2f3f249b8c38,
  @FullTextSearchFunction = @FullTextSearchFunction_2f3f249b8c38,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_2f3f249b8c38,
  @UserViewMaxRows = @UserViewMaxRows_2f3f249b8c38,
  @spCreate = @spCreate_2f3f249b8c38,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_2f3f249b8c38,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_2f3f249b8c38,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_2f3f249b8c38,
  @spUpdateGenerated = @spUpdateGenerated_2f3f249b8c38,
  @spDeleteGenerated = @spDeleteGenerated_2f3f249b8c38,
  @CascadeDeletes = @CascadeDeletes_2f3f249b8c38,
  @DeleteType = @DeleteType_2f3f249b8c38,
  @AllowRecordMerge = @AllowRecordMerge_2f3f249b8c38,
  @spMatch = @spMatch_2f3f249b8c38,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_2f3f249b8c38,
  @UserFormGenerated = @UserFormGenerated_2f3f249b8c38,
  @EntityObjectSubclassName = @EntityObjectSubclassName_2f3f249b8c38,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_2f3f249b8c38,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_2f3f249b8c38,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_2f3f249b8c38,
  @ScopeDefault = @ScopeDefault_2f3f249b8c38,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_2f3f249b8c38,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_2f3f249b8c38,
  @RowsToPackSampleCount = @RowsToPackSampleCount_2f3f249b8c38,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_2f3f249b8c38,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_2f3f249b8c38,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_2f3f249b8c38,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_2f3f249b8c38,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_2f3f249b8c38,
  @DisplayName = @DisplayName_2f3f249b8c38,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_2f3f249b8c38,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_2f3f249b8c38,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_2f3f249b8c38,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_2f3f249b8c38,
  @SupportsGeoCoding = @SupportsGeoCoding_2f3f249b8c38,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_2f3f249b8c38,
  @AllowCaching = @AllowCaching_2f3f249b8c38,
  @DetectExternalChanges = @DetectExternalChanges_2f3f249b8c38,
  @ExternalDataSourceID = @ExternalDataSourceID_2f3f249b8c38,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_2f3f249b8c38,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_2f3f249b8c38,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_2f3f249b8c38,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_2f3f249b8c38,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_2f3f249b8c38,
  @Configuration = @Configuration_2f3f249b8c38,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_2f3f249b8c38,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_2f3f249b8c38,
  @ID = @ID_2f3f249b8c38;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_6c58d2665411 UNIQUEIDENTIFIER,
@Name_6c58d2665411 NVARCHAR(255),
@NameSuffix_6c58d2665411 NVARCHAR(255),
@Description_6c58d2665411 NVARCHAR(MAX),
@AutoUpdateDescription_6c58d2665411 BIT,
@BaseView_6c58d2665411 NVARCHAR(255),
@BaseViewGenerated_6c58d2665411 BIT,
@VirtualEntity_6c58d2665411 BIT,
@TrackRecordChanges_6c58d2665411 BIT,
@AuditRecordAccess_6c58d2665411 BIT,
@AuditViewRuns_6c58d2665411 BIT,
@IncludeInAPI_6c58d2665411 BIT,
@AllowAllRowsAPI_6c58d2665411 BIT,
@AllowUpdateAPI_6c58d2665411 BIT,
@AllowCreateAPI_6c58d2665411 BIT,
@AllowDeleteAPI_6c58d2665411 BIT,
@CustomResolverAPI_6c58d2665411 BIT,
@AllowUserSearchAPI_6c58d2665411 BIT,
@FullTextSearchEnabled_6c58d2665411 BIT,
@FullTextCatalog_6c58d2665411 NVARCHAR(255),
@FullTextCatalogGenerated_6c58d2665411 BIT,
@FullTextIndex_6c58d2665411 NVARCHAR(255),
@FullTextIndexGenerated_6c58d2665411 BIT,
@FullTextSearchFunction_6c58d2665411 NVARCHAR(255),
@FullTextSearchFunctionGenerated_6c58d2665411 BIT,
@UserViewMaxRows_6c58d2665411 INT,
@spCreate_6c58d2665411 NVARCHAR(255),
@spUpdate_6c58d2665411 NVARCHAR(255),
@spDelete_6c58d2665411 NVARCHAR(255),
@spCreateGenerated_6c58d2665411 BIT,
@spUpdateGenerated_6c58d2665411 BIT,
@spDeleteGenerated_6c58d2665411 BIT,
@CascadeDeletes_6c58d2665411 BIT,
@DeleteType_6c58d2665411 NVARCHAR(10),
@AllowRecordMerge_6c58d2665411 BIT,
@spMatch_6c58d2665411 NVARCHAR(255),
@RelationshipDefaultDisplayType_6c58d2665411 NVARCHAR(20),
@UserFormGenerated_6c58d2665411 BIT,
@EntityObjectSubclassName_6c58d2665411 NVARCHAR(255),
@EntityObjectSubclassImport_6c58d2665411 NVARCHAR(255),
@PreferredCommunicationField_6c58d2665411 NVARCHAR(255),
@Icon_6c58d2665411 NVARCHAR(500),
@ScopeDefault_6c58d2665411 NVARCHAR(100),
@RowsToPackWithSchema_6c58d2665411 NVARCHAR(20),
@RowsToPackSampleMethod_6c58d2665411 NVARCHAR(20),
@RowsToPackSampleCount_6c58d2665411 INT,
@RowsToPackSampleOrder_6c58d2665411 NVARCHAR(MAX),
@AutoRowCountFrequency_6c58d2665411 INT,
@RowCount_6c58d2665411 BIGINT,
@RowCountRunAt_6c58d2665411 DATETIMEOFFSET,
@Status_6c58d2665411 NVARCHAR(25),
@DisplayName_6c58d2665411 NVARCHAR(255),
@AllowMultipleSubtypes_6c58d2665411 BIT,
@AutoUpdateFullTextSearch_6c58d2665411 BIT,
@AutoUpdateAllowUserSearchAPI_6c58d2665411 BIT,
@TrustServerCacheCompletely_6c58d2665411 BIT,
@SupportsGeoCoding_6c58d2665411 BIT,
@AutoUpdateSupportsGeoCoding_6c58d2665411 BIT,
@AllowCaching_6c58d2665411 BIT,
@DetectExternalChanges_6c58d2665411 BIT,
@ExternalDataSourceID_6c58d2665411 UNIQUEIDENTIFIER,
@ExternalObjectName_6c58d2665411 NVARCHAR(255),
@GeneratedBaseViewName_6c58d2665411 NVARCHAR(255),
@AllowDirectSQLInsert_6c58d2665411 BIT,
@AllowDirectSQLUpdate_6c58d2665411 BIT,
@AllowDirectSQLDelete_6c58d2665411 BIT,
@Configuration_6c58d2665411 NVARCHAR(MAX),
@SubtypeSelector_6c58d2665411 NVARCHAR(MAX),
@EnableFieldLevelSecurity_6c58d2665411 BIT,
@ID_6c58d2665411 UNIQUEIDENTIFIER
SET
  @Name_6c58d2665411 = N'MJ_BizApps_Forms: Form Screens'
SET
  @Description_6c58d2665411 = N'Welcome and Ending screens for a form. Distinct from questions: a screen is never answered, produces no FormResponseAnswer row, appears in no aggregation and cannot be referenced by a conditional rule. It brackets the intake rather than sitting inside it'
SET
  @AutoUpdateDescription_6c58d2665411 = 1
SET
  @BaseView_6c58d2665411 = N'vwFormScreens'
SET
  @BaseViewGenerated_6c58d2665411 = 1
SET
  @VirtualEntity_6c58d2665411 = 0
SET
  @TrackRecordChanges_6c58d2665411 = 1
SET
  @AuditRecordAccess_6c58d2665411 = 0
SET
  @AuditViewRuns_6c58d2665411 = 0
SET
  @IncludeInAPI_6c58d2665411 = 1
SET
  @AllowAllRowsAPI_6c58d2665411 = 0
SET
  @AllowUpdateAPI_6c58d2665411 = 1
SET
  @AllowCreateAPI_6c58d2665411 = 1
SET
  @AllowDeleteAPI_6c58d2665411 = 1
SET
  @CustomResolverAPI_6c58d2665411 = 0
SET
  @AllowUserSearchAPI_6c58d2665411 = 0
SET
  @FullTextSearchEnabled_6c58d2665411 = 0
SET
  @FullTextCatalogGenerated_6c58d2665411 = 1
SET
  @FullTextIndexGenerated_6c58d2665411 = 1
SET
  @FullTextSearchFunctionGenerated_6c58d2665411 = 1
SET
  @UserViewMaxRows_6c58d2665411 = 1000
SET
  @spCreateGenerated_6c58d2665411 = 1
SET
  @spUpdateGenerated_6c58d2665411 = 1
SET
  @spDeleteGenerated_6c58d2665411 = 1
SET
  @CascadeDeletes_6c58d2665411 = 0
SET
  @DeleteType_6c58d2665411 = N'Hard'
SET
  @AllowRecordMerge_6c58d2665411 = 0
SET
  @RelationshipDefaultDisplayType_6c58d2665411 = N'Search'
SET
  @UserFormGenerated_6c58d2665411 = 1
SET
  @Icon_6c58d2665411 = N'fa fa-file-alt'
SET
  @RowsToPackWithSchema_6c58d2665411 = N'None'
SET
  @RowsToPackSampleMethod_6c58d2665411 = N'random'
SET
  @RowsToPackSampleCount_6c58d2665411 = 0
SET
  @Status_6c58d2665411 = N'Active'
SET
  @DisplayName_6c58d2665411 = N'Form Screens'
SET
  @AllowMultipleSubtypes_6c58d2665411 = 0
SET
  @AutoUpdateFullTextSearch_6c58d2665411 = 1
SET
  @AutoUpdateAllowUserSearchAPI_6c58d2665411 = 0
SET
  @TrustServerCacheCompletely_6c58d2665411 = 1
SET
  @SupportsGeoCoding_6c58d2665411 = 0
SET
  @AutoUpdateSupportsGeoCoding_6c58d2665411 = 1
SET
  @AllowCaching_6c58d2665411 = 0
SET
  @DetectExternalChanges_6c58d2665411 = 0
SET
  @AllowDirectSQLInsert_6c58d2665411 = 0
SET
  @AllowDirectSQLUpdate_6c58d2665411 = 0
SET
  @AllowDirectSQLDelete_6c58d2665411 = 0
SET
  @EnableFieldLevelSecurity_6c58d2665411 = 0
SET
  @ID_6c58d2665411 = '6313B0B1-37E8-432F-AEB6-F35F218C5D22' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_6c58d2665411,
  @ParentID_Clear = 1,
  @Name = @Name_6c58d2665411,
  @NameSuffix = @NameSuffix_6c58d2665411,
  @NameSuffix_Clear = 1,
  @Description = @Description_6c58d2665411,
  @AutoUpdateDescription = @AutoUpdateDescription_6c58d2665411,
  @BaseView = @BaseView_6c58d2665411,
  @BaseViewGenerated = @BaseViewGenerated_6c58d2665411,
  @VirtualEntity = @VirtualEntity_6c58d2665411,
  @TrackRecordChanges = @TrackRecordChanges_6c58d2665411,
  @AuditRecordAccess = @AuditRecordAccess_6c58d2665411,
  @AuditViewRuns = @AuditViewRuns_6c58d2665411,
  @IncludeInAPI = @IncludeInAPI_6c58d2665411,
  @AllowAllRowsAPI = @AllowAllRowsAPI_6c58d2665411,
  @AllowUpdateAPI = @AllowUpdateAPI_6c58d2665411,
  @AllowCreateAPI = @AllowCreateAPI_6c58d2665411,
  @AllowDeleteAPI = @AllowDeleteAPI_6c58d2665411,
  @CustomResolverAPI = @CustomResolverAPI_6c58d2665411,
  @AllowUserSearchAPI = @AllowUserSearchAPI_6c58d2665411,
  @FullTextSearchEnabled = @FullTextSearchEnabled_6c58d2665411,
  @FullTextCatalog = @FullTextCatalog_6c58d2665411,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_6c58d2665411,
  @FullTextIndex = @FullTextIndex_6c58d2665411,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_6c58d2665411,
  @FullTextSearchFunction = @FullTextSearchFunction_6c58d2665411,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_6c58d2665411,
  @UserViewMaxRows = @UserViewMaxRows_6c58d2665411,
  @spCreate = @spCreate_6c58d2665411,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_6c58d2665411,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_6c58d2665411,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_6c58d2665411,
  @spUpdateGenerated = @spUpdateGenerated_6c58d2665411,
  @spDeleteGenerated = @spDeleteGenerated_6c58d2665411,
  @CascadeDeletes = @CascadeDeletes_6c58d2665411,
  @DeleteType = @DeleteType_6c58d2665411,
  @AllowRecordMerge = @AllowRecordMerge_6c58d2665411,
  @spMatch = @spMatch_6c58d2665411,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_6c58d2665411,
  @UserFormGenerated = @UserFormGenerated_6c58d2665411,
  @EntityObjectSubclassName = @EntityObjectSubclassName_6c58d2665411,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_6c58d2665411,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_6c58d2665411,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_6c58d2665411,
  @ScopeDefault = @ScopeDefault_6c58d2665411,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_6c58d2665411,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_6c58d2665411,
  @RowsToPackSampleCount = @RowsToPackSampleCount_6c58d2665411,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_6c58d2665411,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_6c58d2665411,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_6c58d2665411,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_6c58d2665411,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_6c58d2665411,
  @DisplayName = @DisplayName_6c58d2665411,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_6c58d2665411,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_6c58d2665411,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_6c58d2665411,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_6c58d2665411,
  @SupportsGeoCoding = @SupportsGeoCoding_6c58d2665411,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_6c58d2665411,
  @AllowCaching = @AllowCaching_6c58d2665411,
  @DetectExternalChanges = @DetectExternalChanges_6c58d2665411,
  @ExternalDataSourceID = @ExternalDataSourceID_6c58d2665411,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_6c58d2665411,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_6c58d2665411,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_6c58d2665411,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_6c58d2665411,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_6c58d2665411,
  @Configuration = @Configuration_6c58d2665411,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_6c58d2665411,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_6c58d2665411,
  @ID = @ID_6c58d2665411;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_c910f99d8b54 UNIQUEIDENTIFIER,
@Name_c910f99d8b54 NVARCHAR(255),
@NameSuffix_c910f99d8b54 NVARCHAR(255),
@Description_c910f99d8b54 NVARCHAR(MAX),
@AutoUpdateDescription_c910f99d8b54 BIT,
@BaseView_c910f99d8b54 NVARCHAR(255),
@BaseViewGenerated_c910f99d8b54 BIT,
@VirtualEntity_c910f99d8b54 BIT,
@TrackRecordChanges_c910f99d8b54 BIT,
@AuditRecordAccess_c910f99d8b54 BIT,
@AuditViewRuns_c910f99d8b54 BIT,
@IncludeInAPI_c910f99d8b54 BIT,
@AllowAllRowsAPI_c910f99d8b54 BIT,
@AllowUpdateAPI_c910f99d8b54 BIT,
@AllowCreateAPI_c910f99d8b54 BIT,
@AllowDeleteAPI_c910f99d8b54 BIT,
@CustomResolverAPI_c910f99d8b54 BIT,
@AllowUserSearchAPI_c910f99d8b54 BIT,
@FullTextSearchEnabled_c910f99d8b54 BIT,
@FullTextCatalog_c910f99d8b54 NVARCHAR(255),
@FullTextCatalogGenerated_c910f99d8b54 BIT,
@FullTextIndex_c910f99d8b54 NVARCHAR(255),
@FullTextIndexGenerated_c910f99d8b54 BIT,
@FullTextSearchFunction_c910f99d8b54 NVARCHAR(255),
@FullTextSearchFunctionGenerated_c910f99d8b54 BIT,
@UserViewMaxRows_c910f99d8b54 INT,
@spCreate_c910f99d8b54 NVARCHAR(255),
@spUpdate_c910f99d8b54 NVARCHAR(255),
@spDelete_c910f99d8b54 NVARCHAR(255),
@spCreateGenerated_c910f99d8b54 BIT,
@spUpdateGenerated_c910f99d8b54 BIT,
@spDeleteGenerated_c910f99d8b54 BIT,
@CascadeDeletes_c910f99d8b54 BIT,
@DeleteType_c910f99d8b54 NVARCHAR(10),
@AllowRecordMerge_c910f99d8b54 BIT,
@spMatch_c910f99d8b54 NVARCHAR(255),
@RelationshipDefaultDisplayType_c910f99d8b54 NVARCHAR(20),
@UserFormGenerated_c910f99d8b54 BIT,
@EntityObjectSubclassName_c910f99d8b54 NVARCHAR(255),
@EntityObjectSubclassImport_c910f99d8b54 NVARCHAR(255),
@PreferredCommunicationField_c910f99d8b54 NVARCHAR(255),
@Icon_c910f99d8b54 NVARCHAR(500),
@ScopeDefault_c910f99d8b54 NVARCHAR(100),
@RowsToPackWithSchema_c910f99d8b54 NVARCHAR(20),
@RowsToPackSampleMethod_c910f99d8b54 NVARCHAR(20),
@RowsToPackSampleCount_c910f99d8b54 INT,
@RowsToPackSampleOrder_c910f99d8b54 NVARCHAR(MAX),
@AutoRowCountFrequency_c910f99d8b54 INT,
@RowCount_c910f99d8b54 BIGINT,
@RowCountRunAt_c910f99d8b54 DATETIMEOFFSET,
@Status_c910f99d8b54 NVARCHAR(25),
@DisplayName_c910f99d8b54 NVARCHAR(255),
@AllowMultipleSubtypes_c910f99d8b54 BIT,
@AutoUpdateFullTextSearch_c910f99d8b54 BIT,
@AutoUpdateAllowUserSearchAPI_c910f99d8b54 BIT,
@TrustServerCacheCompletely_c910f99d8b54 BIT,
@SupportsGeoCoding_c910f99d8b54 BIT,
@AutoUpdateSupportsGeoCoding_c910f99d8b54 BIT,
@AllowCaching_c910f99d8b54 BIT,
@DetectExternalChanges_c910f99d8b54 BIT,
@ExternalDataSourceID_c910f99d8b54 UNIQUEIDENTIFIER,
@ExternalObjectName_c910f99d8b54 NVARCHAR(255),
@GeneratedBaseViewName_c910f99d8b54 NVARCHAR(255),
@AllowDirectSQLInsert_c910f99d8b54 BIT,
@AllowDirectSQLUpdate_c910f99d8b54 BIT,
@AllowDirectSQLDelete_c910f99d8b54 BIT,
@Configuration_c910f99d8b54 NVARCHAR(MAX),
@SubtypeSelector_c910f99d8b54 NVARCHAR(MAX),
@EnableFieldLevelSecurity_c910f99d8b54 BIT,
@ID_c910f99d8b54 UNIQUEIDENTIFIER
SET
  @Name_c910f99d8b54 = N'MJ_BizApps_Forms: Form Styles'
SET
  @Description_c910f99d8b54 = N'Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt'
SET
  @AutoUpdateDescription_c910f99d8b54 = 1
SET
  @BaseView_c910f99d8b54 = N'vwFormStyles'
SET
  @BaseViewGenerated_c910f99d8b54 = 1
SET
  @VirtualEntity_c910f99d8b54 = 0
SET
  @TrackRecordChanges_c910f99d8b54 = 1
SET
  @AuditRecordAccess_c910f99d8b54 = 0
SET
  @AuditViewRuns_c910f99d8b54 = 0
SET
  @IncludeInAPI_c910f99d8b54 = 1
SET
  @AllowAllRowsAPI_c910f99d8b54 = 0
SET
  @AllowUpdateAPI_c910f99d8b54 = 1
SET
  @AllowCreateAPI_c910f99d8b54 = 1
SET
  @AllowDeleteAPI_c910f99d8b54 = 1
SET
  @CustomResolverAPI_c910f99d8b54 = 0
SET
  @AllowUserSearchAPI_c910f99d8b54 = 0
SET
  @FullTextSearchEnabled_c910f99d8b54 = 0
SET
  @FullTextCatalogGenerated_c910f99d8b54 = 1
SET
  @FullTextIndexGenerated_c910f99d8b54 = 1
SET
  @FullTextSearchFunctionGenerated_c910f99d8b54 = 1
SET
  @UserViewMaxRows_c910f99d8b54 = 1000
SET
  @spCreateGenerated_c910f99d8b54 = 1
SET
  @spUpdateGenerated_c910f99d8b54 = 1
SET
  @spDeleteGenerated_c910f99d8b54 = 1
SET
  @CascadeDeletes_c910f99d8b54 = 0
SET
  @DeleteType_c910f99d8b54 = N'Hard'
SET
  @AllowRecordMerge_c910f99d8b54 = 0
SET
  @RelationshipDefaultDisplayType_c910f99d8b54 = N'Search'
SET
  @UserFormGenerated_c910f99d8b54 = 1
SET
  @Icon_c910f99d8b54 = N'fa fa-palette'
SET
  @RowsToPackWithSchema_c910f99d8b54 = N'None'
SET
  @RowsToPackSampleMethod_c910f99d8b54 = N'random'
SET
  @RowsToPackSampleCount_c910f99d8b54 = 0
SET
  @Status_c910f99d8b54 = N'Active'
SET
  @DisplayName_c910f99d8b54 = N'Form Styles'
SET
  @AllowMultipleSubtypes_c910f99d8b54 = 0
SET
  @AutoUpdateFullTextSearch_c910f99d8b54 = 1
SET
  @AutoUpdateAllowUserSearchAPI_c910f99d8b54 = 0
SET
  @TrustServerCacheCompletely_c910f99d8b54 = 1
SET
  @SupportsGeoCoding_c910f99d8b54 = 0
SET
  @AutoUpdateSupportsGeoCoding_c910f99d8b54 = 1
SET
  @AllowCaching_c910f99d8b54 = 0
SET
  @DetectExternalChanges_c910f99d8b54 = 0
SET
  @AllowDirectSQLInsert_c910f99d8b54 = 0
SET
  @AllowDirectSQLUpdate_c910f99d8b54 = 0
SET
  @AllowDirectSQLDelete_c910f99d8b54 = 0
SET
  @EnableFieldLevelSecurity_c910f99d8b54 = 0
SET
  @ID_c910f99d8b54 = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_c910f99d8b54,
  @ParentID_Clear = 1,
  @Name = @Name_c910f99d8b54,
  @NameSuffix = @NameSuffix_c910f99d8b54,
  @NameSuffix_Clear = 1,
  @Description = @Description_c910f99d8b54,
  @AutoUpdateDescription = @AutoUpdateDescription_c910f99d8b54,
  @BaseView = @BaseView_c910f99d8b54,
  @BaseViewGenerated = @BaseViewGenerated_c910f99d8b54,
  @VirtualEntity = @VirtualEntity_c910f99d8b54,
  @TrackRecordChanges = @TrackRecordChanges_c910f99d8b54,
  @AuditRecordAccess = @AuditRecordAccess_c910f99d8b54,
  @AuditViewRuns = @AuditViewRuns_c910f99d8b54,
  @IncludeInAPI = @IncludeInAPI_c910f99d8b54,
  @AllowAllRowsAPI = @AllowAllRowsAPI_c910f99d8b54,
  @AllowUpdateAPI = @AllowUpdateAPI_c910f99d8b54,
  @AllowCreateAPI = @AllowCreateAPI_c910f99d8b54,
  @AllowDeleteAPI = @AllowDeleteAPI_c910f99d8b54,
  @CustomResolverAPI = @CustomResolverAPI_c910f99d8b54,
  @AllowUserSearchAPI = @AllowUserSearchAPI_c910f99d8b54,
  @FullTextSearchEnabled = @FullTextSearchEnabled_c910f99d8b54,
  @FullTextCatalog = @FullTextCatalog_c910f99d8b54,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_c910f99d8b54,
  @FullTextIndex = @FullTextIndex_c910f99d8b54,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_c910f99d8b54,
  @FullTextSearchFunction = @FullTextSearchFunction_c910f99d8b54,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_c910f99d8b54,
  @UserViewMaxRows = @UserViewMaxRows_c910f99d8b54,
  @spCreate = @spCreate_c910f99d8b54,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_c910f99d8b54,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_c910f99d8b54,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_c910f99d8b54,
  @spUpdateGenerated = @spUpdateGenerated_c910f99d8b54,
  @spDeleteGenerated = @spDeleteGenerated_c910f99d8b54,
  @CascadeDeletes = @CascadeDeletes_c910f99d8b54,
  @DeleteType = @DeleteType_c910f99d8b54,
  @AllowRecordMerge = @AllowRecordMerge_c910f99d8b54,
  @spMatch = @spMatch_c910f99d8b54,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_c910f99d8b54,
  @UserFormGenerated = @UserFormGenerated_c910f99d8b54,
  @EntityObjectSubclassName = @EntityObjectSubclassName_c910f99d8b54,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_c910f99d8b54,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_c910f99d8b54,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_c910f99d8b54,
  @ScopeDefault = @ScopeDefault_c910f99d8b54,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_c910f99d8b54,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_c910f99d8b54,
  @RowsToPackSampleCount = @RowsToPackSampleCount_c910f99d8b54,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_c910f99d8b54,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_c910f99d8b54,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_c910f99d8b54,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_c910f99d8b54,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_c910f99d8b54,
  @DisplayName = @DisplayName_c910f99d8b54,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_c910f99d8b54,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_c910f99d8b54,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_c910f99d8b54,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_c910f99d8b54,
  @SupportsGeoCoding = @SupportsGeoCoding_c910f99d8b54,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_c910f99d8b54,
  @AllowCaching = @AllowCaching_c910f99d8b54,
  @DetectExternalChanges = @DetectExternalChanges_c910f99d8b54,
  @ExternalDataSourceID = @ExternalDataSourceID_c910f99d8b54,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_c910f99d8b54,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_c910f99d8b54,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_c910f99d8b54,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_c910f99d8b54,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_c910f99d8b54,
  @Configuration = @Configuration_c910f99d8b54,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_c910f99d8b54,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_c910f99d8b54,
  @ID = @ID_c910f99d8b54;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_91b88c5848e6 UNIQUEIDENTIFIER,
@Name_91b88c5848e6 NVARCHAR(255),
@NameSuffix_91b88c5848e6 NVARCHAR(255),
@Description_91b88c5848e6 NVARCHAR(MAX),
@AutoUpdateDescription_91b88c5848e6 BIT,
@BaseView_91b88c5848e6 NVARCHAR(255),
@BaseViewGenerated_91b88c5848e6 BIT,
@VirtualEntity_91b88c5848e6 BIT,
@TrackRecordChanges_91b88c5848e6 BIT,
@AuditRecordAccess_91b88c5848e6 BIT,
@AuditViewRuns_91b88c5848e6 BIT,
@IncludeInAPI_91b88c5848e6 BIT,
@AllowAllRowsAPI_91b88c5848e6 BIT,
@AllowUpdateAPI_91b88c5848e6 BIT,
@AllowCreateAPI_91b88c5848e6 BIT,
@AllowDeleteAPI_91b88c5848e6 BIT,
@CustomResolverAPI_91b88c5848e6 BIT,
@AllowUserSearchAPI_91b88c5848e6 BIT,
@FullTextSearchEnabled_91b88c5848e6 BIT,
@FullTextCatalog_91b88c5848e6 NVARCHAR(255),
@FullTextCatalogGenerated_91b88c5848e6 BIT,
@FullTextIndex_91b88c5848e6 NVARCHAR(255),
@FullTextIndexGenerated_91b88c5848e6 BIT,
@FullTextSearchFunction_91b88c5848e6 NVARCHAR(255),
@FullTextSearchFunctionGenerated_91b88c5848e6 BIT,
@UserViewMaxRows_91b88c5848e6 INT,
@spCreate_91b88c5848e6 NVARCHAR(255),
@spUpdate_91b88c5848e6 NVARCHAR(255),
@spDelete_91b88c5848e6 NVARCHAR(255),
@spCreateGenerated_91b88c5848e6 BIT,
@spUpdateGenerated_91b88c5848e6 BIT,
@spDeleteGenerated_91b88c5848e6 BIT,
@CascadeDeletes_91b88c5848e6 BIT,
@DeleteType_91b88c5848e6 NVARCHAR(10),
@AllowRecordMerge_91b88c5848e6 BIT,
@spMatch_91b88c5848e6 NVARCHAR(255),
@RelationshipDefaultDisplayType_91b88c5848e6 NVARCHAR(20),
@UserFormGenerated_91b88c5848e6 BIT,
@EntityObjectSubclassName_91b88c5848e6 NVARCHAR(255),
@EntityObjectSubclassImport_91b88c5848e6 NVARCHAR(255),
@PreferredCommunicationField_91b88c5848e6 NVARCHAR(255),
@Icon_91b88c5848e6 NVARCHAR(500),
@ScopeDefault_91b88c5848e6 NVARCHAR(100),
@RowsToPackWithSchema_91b88c5848e6 NVARCHAR(20),
@RowsToPackSampleMethod_91b88c5848e6 NVARCHAR(20),
@RowsToPackSampleCount_91b88c5848e6 INT,
@RowsToPackSampleOrder_91b88c5848e6 NVARCHAR(MAX),
@AutoRowCountFrequency_91b88c5848e6 INT,
@RowCount_91b88c5848e6 BIGINT,
@RowCountRunAt_91b88c5848e6 DATETIMEOFFSET,
@Status_91b88c5848e6 NVARCHAR(25),
@DisplayName_91b88c5848e6 NVARCHAR(255),
@AllowMultipleSubtypes_91b88c5848e6 BIT,
@AutoUpdateFullTextSearch_91b88c5848e6 BIT,
@AutoUpdateAllowUserSearchAPI_91b88c5848e6 BIT,
@TrustServerCacheCompletely_91b88c5848e6 BIT,
@SupportsGeoCoding_91b88c5848e6 BIT,
@AutoUpdateSupportsGeoCoding_91b88c5848e6 BIT,
@AllowCaching_91b88c5848e6 BIT,
@DetectExternalChanges_91b88c5848e6 BIT,
@ExternalDataSourceID_91b88c5848e6 UNIQUEIDENTIFIER,
@ExternalObjectName_91b88c5848e6 NVARCHAR(255),
@GeneratedBaseViewName_91b88c5848e6 NVARCHAR(255),
@AllowDirectSQLInsert_91b88c5848e6 BIT,
@AllowDirectSQLUpdate_91b88c5848e6 BIT,
@AllowDirectSQLDelete_91b88c5848e6 BIT,
@Configuration_91b88c5848e6 NVARCHAR(MAX),
@SubtypeSelector_91b88c5848e6 NVARCHAR(MAX),
@EnableFieldLevelSecurity_91b88c5848e6 BIT,
@ID_91b88c5848e6 UNIQUEIDENTIFIER
SET
  @Name_91b88c5848e6 = N'MJ_BizApps_Forms: Form Uploads'
SET
  @Description_91b88c5848e6 = N'Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. ${mjSchema}.File has no owner column, so this is the only evidence of who produced a file'
SET
  @AutoUpdateDescription_91b88c5848e6 = 1
SET
  @BaseView_91b88c5848e6 = N'vwFormUploads'
SET
  @BaseViewGenerated_91b88c5848e6 = 1
SET
  @VirtualEntity_91b88c5848e6 = 0
SET
  @TrackRecordChanges_91b88c5848e6 = 1
SET
  @AuditRecordAccess_91b88c5848e6 = 0
SET
  @AuditViewRuns_91b88c5848e6 = 0
SET
  @IncludeInAPI_91b88c5848e6 = 1
SET
  @AllowAllRowsAPI_91b88c5848e6 = 0
SET
  @AllowUpdateAPI_91b88c5848e6 = 1
SET
  @AllowCreateAPI_91b88c5848e6 = 1
SET
  @AllowDeleteAPI_91b88c5848e6 = 1
SET
  @CustomResolverAPI_91b88c5848e6 = 0
SET
  @AllowUserSearchAPI_91b88c5848e6 = 0
SET
  @FullTextSearchEnabled_91b88c5848e6 = 0
SET
  @FullTextCatalogGenerated_91b88c5848e6 = 1
SET
  @FullTextIndexGenerated_91b88c5848e6 = 1
SET
  @FullTextSearchFunctionGenerated_91b88c5848e6 = 1
SET
  @UserViewMaxRows_91b88c5848e6 = 1000
SET
  @spCreateGenerated_91b88c5848e6 = 1
SET
  @spUpdateGenerated_91b88c5848e6 = 1
SET
  @spDeleteGenerated_91b88c5848e6 = 1
SET
  @CascadeDeletes_91b88c5848e6 = 0
SET
  @DeleteType_91b88c5848e6 = N'Hard'
SET
  @AllowRecordMerge_91b88c5848e6 = 0
SET
  @RelationshipDefaultDisplayType_91b88c5848e6 = N'Search'
SET
  @UserFormGenerated_91b88c5848e6 = 1
SET
  @Icon_91b88c5848e6 = N'fa fa-file-upload'
SET
  @RowsToPackWithSchema_91b88c5848e6 = N'None'
SET
  @RowsToPackSampleMethod_91b88c5848e6 = N'random'
SET
  @RowsToPackSampleCount_91b88c5848e6 = 0
SET
  @Status_91b88c5848e6 = N'Active'
SET
  @DisplayName_91b88c5848e6 = N'Form Uploads'
SET
  @AllowMultipleSubtypes_91b88c5848e6 = 0
SET
  @AutoUpdateFullTextSearch_91b88c5848e6 = 1
SET
  @AutoUpdateAllowUserSearchAPI_91b88c5848e6 = 0
SET
  @TrustServerCacheCompletely_91b88c5848e6 = 1
SET
  @SupportsGeoCoding_91b88c5848e6 = 0
SET
  @AutoUpdateSupportsGeoCoding_91b88c5848e6 = 1
SET
  @AllowCaching_91b88c5848e6 = 0
SET
  @DetectExternalChanges_91b88c5848e6 = 0
SET
  @AllowDirectSQLInsert_91b88c5848e6 = 0
SET
  @AllowDirectSQLUpdate_91b88c5848e6 = 0
SET
  @AllowDirectSQLDelete_91b88c5848e6 = 0
SET
  @EnableFieldLevelSecurity_91b88c5848e6 = 0
SET
  @ID_91b88c5848e6 = '890AE739-1A57-4070-9358-D1788CC2C4C0' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_91b88c5848e6,
  @ParentID_Clear = 1,
  @Name = @Name_91b88c5848e6,
  @NameSuffix = @NameSuffix_91b88c5848e6,
  @NameSuffix_Clear = 1,
  @Description = @Description_91b88c5848e6,
  @AutoUpdateDescription = @AutoUpdateDescription_91b88c5848e6,
  @BaseView = @BaseView_91b88c5848e6,
  @BaseViewGenerated = @BaseViewGenerated_91b88c5848e6,
  @VirtualEntity = @VirtualEntity_91b88c5848e6,
  @TrackRecordChanges = @TrackRecordChanges_91b88c5848e6,
  @AuditRecordAccess = @AuditRecordAccess_91b88c5848e6,
  @AuditViewRuns = @AuditViewRuns_91b88c5848e6,
  @IncludeInAPI = @IncludeInAPI_91b88c5848e6,
  @AllowAllRowsAPI = @AllowAllRowsAPI_91b88c5848e6,
  @AllowUpdateAPI = @AllowUpdateAPI_91b88c5848e6,
  @AllowCreateAPI = @AllowCreateAPI_91b88c5848e6,
  @AllowDeleteAPI = @AllowDeleteAPI_91b88c5848e6,
  @CustomResolverAPI = @CustomResolverAPI_91b88c5848e6,
  @AllowUserSearchAPI = @AllowUserSearchAPI_91b88c5848e6,
  @FullTextSearchEnabled = @FullTextSearchEnabled_91b88c5848e6,
  @FullTextCatalog = @FullTextCatalog_91b88c5848e6,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_91b88c5848e6,
  @FullTextIndex = @FullTextIndex_91b88c5848e6,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_91b88c5848e6,
  @FullTextSearchFunction = @FullTextSearchFunction_91b88c5848e6,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_91b88c5848e6,
  @UserViewMaxRows = @UserViewMaxRows_91b88c5848e6,
  @spCreate = @spCreate_91b88c5848e6,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_91b88c5848e6,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_91b88c5848e6,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_91b88c5848e6,
  @spUpdateGenerated = @spUpdateGenerated_91b88c5848e6,
  @spDeleteGenerated = @spDeleteGenerated_91b88c5848e6,
  @CascadeDeletes = @CascadeDeletes_91b88c5848e6,
  @DeleteType = @DeleteType_91b88c5848e6,
  @AllowRecordMerge = @AllowRecordMerge_91b88c5848e6,
  @spMatch = @spMatch_91b88c5848e6,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_91b88c5848e6,
  @UserFormGenerated = @UserFormGenerated_91b88c5848e6,
  @EntityObjectSubclassName = @EntityObjectSubclassName_91b88c5848e6,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_91b88c5848e6,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_91b88c5848e6,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_91b88c5848e6,
  @ScopeDefault = @ScopeDefault_91b88c5848e6,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_91b88c5848e6,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_91b88c5848e6,
  @RowsToPackSampleCount = @RowsToPackSampleCount_91b88c5848e6,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_91b88c5848e6,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_91b88c5848e6,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_91b88c5848e6,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_91b88c5848e6,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_91b88c5848e6,
  @DisplayName = @DisplayName_91b88c5848e6,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_91b88c5848e6,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_91b88c5848e6,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_91b88c5848e6,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_91b88c5848e6,
  @SupportsGeoCoding = @SupportsGeoCoding_91b88c5848e6,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_91b88c5848e6,
  @AllowCaching = @AllowCaching_91b88c5848e6,
  @DetectExternalChanges = @DetectExternalChanges_91b88c5848e6,
  @ExternalDataSourceID = @ExternalDataSourceID_91b88c5848e6,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_91b88c5848e6,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_91b88c5848e6,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_91b88c5848e6,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_91b88c5848e6,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_91b88c5848e6,
  @Configuration = @Configuration_91b88c5848e6,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_91b88c5848e6,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_91b88c5848e6,
  @ID = @ID_91b88c5848e6;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_ad5ce046168b UNIQUEIDENTIFIER,
@Name_ad5ce046168b NVARCHAR(255),
@NameSuffix_ad5ce046168b NVARCHAR(255),
@Description_ad5ce046168b NVARCHAR(MAX),
@AutoUpdateDescription_ad5ce046168b BIT,
@BaseView_ad5ce046168b NVARCHAR(255),
@BaseViewGenerated_ad5ce046168b BIT,
@VirtualEntity_ad5ce046168b BIT,
@TrackRecordChanges_ad5ce046168b BIT,
@AuditRecordAccess_ad5ce046168b BIT,
@AuditViewRuns_ad5ce046168b BIT,
@IncludeInAPI_ad5ce046168b BIT,
@AllowAllRowsAPI_ad5ce046168b BIT,
@AllowUpdateAPI_ad5ce046168b BIT,
@AllowCreateAPI_ad5ce046168b BIT,
@AllowDeleteAPI_ad5ce046168b BIT,
@CustomResolverAPI_ad5ce046168b BIT,
@AllowUserSearchAPI_ad5ce046168b BIT,
@FullTextSearchEnabled_ad5ce046168b BIT,
@FullTextCatalog_ad5ce046168b NVARCHAR(255),
@FullTextCatalogGenerated_ad5ce046168b BIT,
@FullTextIndex_ad5ce046168b NVARCHAR(255),
@FullTextIndexGenerated_ad5ce046168b BIT,
@FullTextSearchFunction_ad5ce046168b NVARCHAR(255),
@FullTextSearchFunctionGenerated_ad5ce046168b BIT,
@UserViewMaxRows_ad5ce046168b INT,
@spCreate_ad5ce046168b NVARCHAR(255),
@spUpdate_ad5ce046168b NVARCHAR(255),
@spDelete_ad5ce046168b NVARCHAR(255),
@spCreateGenerated_ad5ce046168b BIT,
@spUpdateGenerated_ad5ce046168b BIT,
@spDeleteGenerated_ad5ce046168b BIT,
@CascadeDeletes_ad5ce046168b BIT,
@DeleteType_ad5ce046168b NVARCHAR(10),
@AllowRecordMerge_ad5ce046168b BIT,
@spMatch_ad5ce046168b NVARCHAR(255),
@RelationshipDefaultDisplayType_ad5ce046168b NVARCHAR(20),
@UserFormGenerated_ad5ce046168b BIT,
@EntityObjectSubclassName_ad5ce046168b NVARCHAR(255),
@EntityObjectSubclassImport_ad5ce046168b NVARCHAR(255),
@PreferredCommunicationField_ad5ce046168b NVARCHAR(255),
@Icon_ad5ce046168b NVARCHAR(500),
@ScopeDefault_ad5ce046168b NVARCHAR(100),
@RowsToPackWithSchema_ad5ce046168b NVARCHAR(20),
@RowsToPackSampleMethod_ad5ce046168b NVARCHAR(20),
@RowsToPackSampleCount_ad5ce046168b INT,
@RowsToPackSampleOrder_ad5ce046168b NVARCHAR(MAX),
@AutoRowCountFrequency_ad5ce046168b INT,
@RowCount_ad5ce046168b BIGINT,
@RowCountRunAt_ad5ce046168b DATETIMEOFFSET,
@Status_ad5ce046168b NVARCHAR(25),
@DisplayName_ad5ce046168b NVARCHAR(255),
@AllowMultipleSubtypes_ad5ce046168b BIT,
@AutoUpdateFullTextSearch_ad5ce046168b BIT,
@AutoUpdateAllowUserSearchAPI_ad5ce046168b BIT,
@TrustServerCacheCompletely_ad5ce046168b BIT,
@SupportsGeoCoding_ad5ce046168b BIT,
@AutoUpdateSupportsGeoCoding_ad5ce046168b BIT,
@AllowCaching_ad5ce046168b BIT,
@DetectExternalChanges_ad5ce046168b BIT,
@ExternalDataSourceID_ad5ce046168b UNIQUEIDENTIFIER,
@ExternalObjectName_ad5ce046168b NVARCHAR(255),
@GeneratedBaseViewName_ad5ce046168b NVARCHAR(255),
@AllowDirectSQLInsert_ad5ce046168b BIT,
@AllowDirectSQLUpdate_ad5ce046168b BIT,
@AllowDirectSQLDelete_ad5ce046168b BIT,
@Configuration_ad5ce046168b NVARCHAR(MAX),
@SubtypeSelector_ad5ce046168b NVARCHAR(MAX),
@EnableFieldLevelSecurity_ad5ce046168b BIT,
@ID_ad5ce046168b UNIQUEIDENTIFIER
SET
  @Name_ad5ce046168b = N'MJ_BizApps_Forms: Form Versions'
SET
  @Description_ad5ce046168b = N'Immutable published snapshots of a form; responses pin the version they were filled against'
SET
  @AutoUpdateDescription_ad5ce046168b = 1
SET
  @BaseView_ad5ce046168b = N'vwFormVersions'
SET
  @BaseViewGenerated_ad5ce046168b = 1
SET
  @VirtualEntity_ad5ce046168b = 0
SET
  @TrackRecordChanges_ad5ce046168b = 1
SET
  @AuditRecordAccess_ad5ce046168b = 0
SET
  @AuditViewRuns_ad5ce046168b = 0
SET
  @IncludeInAPI_ad5ce046168b = 1
SET
  @AllowAllRowsAPI_ad5ce046168b = 0
SET
  @AllowUpdateAPI_ad5ce046168b = 1
SET
  @AllowCreateAPI_ad5ce046168b = 1
SET
  @AllowDeleteAPI_ad5ce046168b = 1
SET
  @CustomResolverAPI_ad5ce046168b = 0
SET
  @AllowUserSearchAPI_ad5ce046168b = 0
SET
  @FullTextSearchEnabled_ad5ce046168b = 0
SET
  @FullTextCatalogGenerated_ad5ce046168b = 1
SET
  @FullTextIndexGenerated_ad5ce046168b = 1
SET
  @FullTextSearchFunctionGenerated_ad5ce046168b = 1
SET
  @UserViewMaxRows_ad5ce046168b = 1000
SET
  @spCreateGenerated_ad5ce046168b = 1
SET
  @spUpdateGenerated_ad5ce046168b = 1
SET
  @spDeleteGenerated_ad5ce046168b = 1
SET
  @CascadeDeletes_ad5ce046168b = 0
SET
  @DeleteType_ad5ce046168b = N'Hard'
SET
  @AllowRecordMerge_ad5ce046168b = 0
SET
  @RelationshipDefaultDisplayType_ad5ce046168b = N'Search'
SET
  @UserFormGenerated_ad5ce046168b = 1
SET
  @Icon_ad5ce046168b = N'fa fa-history'
SET
  @RowsToPackWithSchema_ad5ce046168b = N'None'
SET
  @RowsToPackSampleMethod_ad5ce046168b = N'random'
SET
  @RowsToPackSampleCount_ad5ce046168b = 0
SET
  @Status_ad5ce046168b = N'Active'
SET
  @DisplayName_ad5ce046168b = N'Form Versions'
SET
  @AllowMultipleSubtypes_ad5ce046168b = 0
SET
  @AutoUpdateFullTextSearch_ad5ce046168b = 1
SET
  @AutoUpdateAllowUserSearchAPI_ad5ce046168b = 0
SET
  @TrustServerCacheCompletely_ad5ce046168b = 1
SET
  @SupportsGeoCoding_ad5ce046168b = 0
SET
  @AutoUpdateSupportsGeoCoding_ad5ce046168b = 1
SET
  @AllowCaching_ad5ce046168b = 0
SET
  @DetectExternalChanges_ad5ce046168b = 0
SET
  @AllowDirectSQLInsert_ad5ce046168b = 0
SET
  @AllowDirectSQLUpdate_ad5ce046168b = 0
SET
  @AllowDirectSQLDelete_ad5ce046168b = 0
SET
  @EnableFieldLevelSecurity_ad5ce046168b = 0
SET
  @ID_ad5ce046168b = '622E2804-5B6D-4B43-92A4-294ADC538F50' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_ad5ce046168b,
  @ParentID_Clear = 1,
  @Name = @Name_ad5ce046168b,
  @NameSuffix = @NameSuffix_ad5ce046168b,
  @NameSuffix_Clear = 1,
  @Description = @Description_ad5ce046168b,
  @AutoUpdateDescription = @AutoUpdateDescription_ad5ce046168b,
  @BaseView = @BaseView_ad5ce046168b,
  @BaseViewGenerated = @BaseViewGenerated_ad5ce046168b,
  @VirtualEntity = @VirtualEntity_ad5ce046168b,
  @TrackRecordChanges = @TrackRecordChanges_ad5ce046168b,
  @AuditRecordAccess = @AuditRecordAccess_ad5ce046168b,
  @AuditViewRuns = @AuditViewRuns_ad5ce046168b,
  @IncludeInAPI = @IncludeInAPI_ad5ce046168b,
  @AllowAllRowsAPI = @AllowAllRowsAPI_ad5ce046168b,
  @AllowUpdateAPI = @AllowUpdateAPI_ad5ce046168b,
  @AllowCreateAPI = @AllowCreateAPI_ad5ce046168b,
  @AllowDeleteAPI = @AllowDeleteAPI_ad5ce046168b,
  @CustomResolverAPI = @CustomResolverAPI_ad5ce046168b,
  @AllowUserSearchAPI = @AllowUserSearchAPI_ad5ce046168b,
  @FullTextSearchEnabled = @FullTextSearchEnabled_ad5ce046168b,
  @FullTextCatalog = @FullTextCatalog_ad5ce046168b,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_ad5ce046168b,
  @FullTextIndex = @FullTextIndex_ad5ce046168b,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_ad5ce046168b,
  @FullTextSearchFunction = @FullTextSearchFunction_ad5ce046168b,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_ad5ce046168b,
  @UserViewMaxRows = @UserViewMaxRows_ad5ce046168b,
  @spCreate = @spCreate_ad5ce046168b,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_ad5ce046168b,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_ad5ce046168b,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_ad5ce046168b,
  @spUpdateGenerated = @spUpdateGenerated_ad5ce046168b,
  @spDeleteGenerated = @spDeleteGenerated_ad5ce046168b,
  @CascadeDeletes = @CascadeDeletes_ad5ce046168b,
  @DeleteType = @DeleteType_ad5ce046168b,
  @AllowRecordMerge = @AllowRecordMerge_ad5ce046168b,
  @spMatch = @spMatch_ad5ce046168b,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_ad5ce046168b,
  @UserFormGenerated = @UserFormGenerated_ad5ce046168b,
  @EntityObjectSubclassName = @EntityObjectSubclassName_ad5ce046168b,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_ad5ce046168b,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_ad5ce046168b,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_ad5ce046168b,
  @ScopeDefault = @ScopeDefault_ad5ce046168b,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_ad5ce046168b,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_ad5ce046168b,
  @RowsToPackSampleCount = @RowsToPackSampleCount_ad5ce046168b,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_ad5ce046168b,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_ad5ce046168b,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_ad5ce046168b,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_ad5ce046168b,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_ad5ce046168b,
  @DisplayName = @DisplayName_ad5ce046168b,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_ad5ce046168b,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_ad5ce046168b,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_ad5ce046168b,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_ad5ce046168b,
  @SupportsGeoCoding = @SupportsGeoCoding_ad5ce046168b,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_ad5ce046168b,
  @AllowCaching = @AllowCaching_ad5ce046168b,
  @DetectExternalChanges = @DetectExternalChanges_ad5ce046168b,
  @ExternalDataSourceID = @ExternalDataSourceID_ad5ce046168b,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_ad5ce046168b,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_ad5ce046168b,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_ad5ce046168b,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_ad5ce046168b,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_ad5ce046168b,
  @Configuration = @Configuration_ad5ce046168b,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_ad5ce046168b,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_ad5ce046168b,
  @ID = @ID_ad5ce046168b;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_4a54fb67c663 NVARCHAR(255),
@Description_4a54fb67c663 NVARCHAR(MAX),
@AutoUpdateDescription_4a54fb67c663 BIT,
@IsPrimaryKey_4a54fb67c663 BIT,
@IsUnique_4a54fb67c663 BIT,
@Category_4a54fb67c663 NVARCHAR(255),
@ValueListType_4a54fb67c663 NVARCHAR(20),
@ExtendedType_4a54fb67c663 NVARCHAR(50),
@CodeType_4a54fb67c663 NVARCHAR(50),
@DefaultInView_4a54fb67c663 BIT,
@ViewCellTemplate_4a54fb67c663 NVARCHAR(MAX),
@DefaultColumnWidth_4a54fb67c663 INT,
@AllowUpdateAPI_4a54fb67c663 BIT,
@AllowUpdateInView_4a54fb67c663 BIT,
@IncludeInUserSearchAPI_4a54fb67c663 BIT,
@FullTextSearchEnabled_4a54fb67c663 BIT,
@UserSearchParamFormatAPI_4a54fb67c663 NVARCHAR(500),
@IncludeInGeneratedForm_4a54fb67c663 BIT,
@GeneratedFormSection_4a54fb67c663 NVARCHAR(10),
@IsNameField_4a54fb67c663 BIT,
@RelatedEntityID_4a54fb67c663 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_4a54fb67c663 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_4a54fb67c663 BIT,
@RelatedEntityNameFieldMap_4a54fb67c663 NVARCHAR(255),
@RelatedEntityDisplayType_4a54fb67c663 NVARCHAR(20),
@EntityIDFieldName_4a54fb67c663 NVARCHAR(100),
@ScopeDefault_4a54fb67c663 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_4a54fb67c663 BIT,
@ValuesToPackWithSchema_4a54fb67c663 NVARCHAR(10),
@Status_4a54fb67c663 NVARCHAR(25),
@AutoUpdateIsNameField_4a54fb67c663 BIT,
@AutoUpdateDefaultInView_4a54fb67c663 BIT,
@AutoUpdateCategory_4a54fb67c663 BIT,
@AutoUpdateDisplayName_4a54fb67c663 BIT,
@AutoUpdateIncludeInUserSearchAPI_4a54fb67c663 BIT,
@Encrypt_4a54fb67c663 BIT,
@EncryptionKeyID_4a54fb67c663 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_4a54fb67c663 BIT,
@SendEncryptedValue_4a54fb67c663 BIT,
@IsSoftPrimaryKey_4a54fb67c663 BIT,
@IsSoftForeignKey_4a54fb67c663 BIT,
@RelatedEntityJoinFields_4a54fb67c663 NVARCHAR(MAX),
@JSONType_4a54fb67c663 NVARCHAR(255),
@JSONTypeIsArray_4a54fb67c663 BIT,
@JSONTypeDefinition_4a54fb67c663 NVARCHAR(MAX),
@UserSearchPredicateAPI_4a54fb67c663 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_4a54fb67c663 BIT,
@AutoUpdateFullTextSearch_4a54fb67c663 BIT,
@AutoUpdateExtendedType_4a54fb67c663 BIT,
@IsComputed_4a54fb67c663 BIT,
@EmbeddedRecord_4a54fb67c663 NVARCHAR(MAX),
@Configuration_4a54fb67c663 NVARCHAR(MAX),
@ID_4a54fb67c663 UNIQUEIDENTIFIER
SET
  @DisplayName_4a54fb67c663 = N'Name'
SET
  @Description_4a54fb67c663 = N'Display name of the category'
SET
  @AutoUpdateDescription_4a54fb67c663 = 1
SET
  @IsPrimaryKey_4a54fb67c663 = 0
SET
  @IsUnique_4a54fb67c663 = 0
SET
  @Category_4a54fb67c663 = N'Category Details'
SET
  @ValueListType_4a54fb67c663 = N'None'
SET
  @DefaultInView_4a54fb67c663 = 1
SET
  @DefaultColumnWidth_4a54fb67c663 = 150
SET
  @AllowUpdateAPI_4a54fb67c663 = 1
SET
  @AllowUpdateInView_4a54fb67c663 = 1
SET
  @IncludeInUserSearchAPI_4a54fb67c663 = 1
SET
  @FullTextSearchEnabled_4a54fb67c663 = 0
SET
  @IncludeInGeneratedForm_4a54fb67c663 = 1
SET
  @GeneratedFormSection_4a54fb67c663 = N'Category'
SET
  @IsNameField_4a54fb67c663 = 1
SET
  @IncludeRelatedEntityNameFieldInBaseView_4a54fb67c663 = 0
SET
  @RelatedEntityDisplayType_4a54fb67c663 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_4a54fb67c663 = 1
SET
  @ValuesToPackWithSchema_4a54fb67c663 = N'Auto'
SET
  @Status_4a54fb67c663 = N'Active'
SET
  @AutoUpdateIsNameField_4a54fb67c663 = 1
SET
  @AutoUpdateDefaultInView_4a54fb67c663 = 1
SET
  @AutoUpdateCategory_4a54fb67c663 = 1
SET
  @AutoUpdateDisplayName_4a54fb67c663 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_4a54fb67c663 = 0
SET
  @Encrypt_4a54fb67c663 = 0
SET
  @AllowDecryptInAPI_4a54fb67c663 = 0
SET
  @SendEncryptedValue_4a54fb67c663 = 0
SET
  @IsSoftPrimaryKey_4a54fb67c663 = 0
SET
  @IsSoftForeignKey_4a54fb67c663 = 0
SET
  @JSONTypeIsArray_4a54fb67c663 = 0
SET
  @UserSearchPredicateAPI_4a54fb67c663 = N'BeginsWith'
SET
  @AutoUpdateUserSearchPredicate_4a54fb67c663 = 1
SET
  @AutoUpdateFullTextSearch_4a54fb67c663 = 1
SET
  @AutoUpdateExtendedType_4a54fb67c663 = 1
SET
  @IsComputed_4a54fb67c663 = 0
SET
  @ID_4a54fb67c663 = 'BC9E36EF-C93E-48BF-9F84-53F402CE6DE2' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_4a54fb67c663,
  @Description = @Description_4a54fb67c663,
  @AutoUpdateDescription = @AutoUpdateDescription_4a54fb67c663,
  @IsPrimaryKey = @IsPrimaryKey_4a54fb67c663,
  @IsUnique = @IsUnique_4a54fb67c663,
  @Category = @Category_4a54fb67c663,
  @ValueListType = @ValueListType_4a54fb67c663,
  @ExtendedType = @ExtendedType_4a54fb67c663,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_4a54fb67c663,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_4a54fb67c663,
  @ViewCellTemplate = @ViewCellTemplate_4a54fb67c663,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_4a54fb67c663,
  @AllowUpdateAPI = @AllowUpdateAPI_4a54fb67c663,
  @AllowUpdateInView = @AllowUpdateInView_4a54fb67c663,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_4a54fb67c663,
  @FullTextSearchEnabled = @FullTextSearchEnabled_4a54fb67c663,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_4a54fb67c663,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_4a54fb67c663,
  @GeneratedFormSection = @GeneratedFormSection_4a54fb67c663,
  @IsNameField = @IsNameField_4a54fb67c663,
  @RelatedEntityID = @RelatedEntityID_4a54fb67c663,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_4a54fb67c663,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_4a54fb67c663,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_4a54fb67c663,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_4a54fb67c663,
  @EntityIDFieldName = @EntityIDFieldName_4a54fb67c663,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_4a54fb67c663,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_4a54fb67c663,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_4a54fb67c663,
  @Status = @Status_4a54fb67c663,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_4a54fb67c663,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_4a54fb67c663,
  @AutoUpdateCategory = @AutoUpdateCategory_4a54fb67c663,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_4a54fb67c663,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_4a54fb67c663,
  @Encrypt = @Encrypt_4a54fb67c663,
  @EncryptionKeyID = @EncryptionKeyID_4a54fb67c663,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_4a54fb67c663,
  @SendEncryptedValue = @SendEncryptedValue_4a54fb67c663,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_4a54fb67c663,
  @IsSoftForeignKey = @IsSoftForeignKey_4a54fb67c663,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_4a54fb67c663,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_4a54fb67c663,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_4a54fb67c663,
  @JSONTypeDefinition = @JSONTypeDefinition_4a54fb67c663,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_4a54fb67c663,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_4a54fb67c663,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_4a54fb67c663,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_4a54fb67c663,
  @IsComputed = @IsComputed_4a54fb67c663,
  @EmbeddedRecord = @EmbeddedRecord_4a54fb67c663,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_4a54fb67c663,
  @Configuration_Clear = 1,
  @ID = @ID_4a54fb67c663;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_d5fa59a0676d NVARCHAR(255),
@Description_d5fa59a0676d NVARCHAR(MAX),
@AutoUpdateDescription_d5fa59a0676d BIT,
@IsPrimaryKey_d5fa59a0676d BIT,
@IsUnique_d5fa59a0676d BIT,
@Category_d5fa59a0676d NVARCHAR(255),
@ValueListType_d5fa59a0676d NVARCHAR(20),
@ExtendedType_d5fa59a0676d NVARCHAR(50),
@CodeType_d5fa59a0676d NVARCHAR(50),
@DefaultInView_d5fa59a0676d BIT,
@ViewCellTemplate_d5fa59a0676d NVARCHAR(MAX),
@DefaultColumnWidth_d5fa59a0676d INT,
@AllowUpdateAPI_d5fa59a0676d BIT,
@AllowUpdateInView_d5fa59a0676d BIT,
@IncludeInUserSearchAPI_d5fa59a0676d BIT,
@FullTextSearchEnabled_d5fa59a0676d BIT,
@UserSearchParamFormatAPI_d5fa59a0676d NVARCHAR(500),
@IncludeInGeneratedForm_d5fa59a0676d BIT,
@GeneratedFormSection_d5fa59a0676d NVARCHAR(10),
@IsNameField_d5fa59a0676d BIT,
@RelatedEntityID_d5fa59a0676d UNIQUEIDENTIFIER,
@RelatedEntityFieldName_d5fa59a0676d NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_d5fa59a0676d BIT,
@RelatedEntityNameFieldMap_d5fa59a0676d NVARCHAR(255),
@RelatedEntityDisplayType_d5fa59a0676d NVARCHAR(20),
@EntityIDFieldName_d5fa59a0676d NVARCHAR(100),
@ScopeDefault_d5fa59a0676d NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_d5fa59a0676d BIT,
@ValuesToPackWithSchema_d5fa59a0676d NVARCHAR(10),
@Status_d5fa59a0676d NVARCHAR(25),
@AutoUpdateIsNameField_d5fa59a0676d BIT,
@AutoUpdateDefaultInView_d5fa59a0676d BIT,
@AutoUpdateCategory_d5fa59a0676d BIT,
@AutoUpdateDisplayName_d5fa59a0676d BIT,
@AutoUpdateIncludeInUserSearchAPI_d5fa59a0676d BIT,
@Encrypt_d5fa59a0676d BIT,
@EncryptionKeyID_d5fa59a0676d UNIQUEIDENTIFIER,
@AllowDecryptInAPI_d5fa59a0676d BIT,
@SendEncryptedValue_d5fa59a0676d BIT,
@IsSoftPrimaryKey_d5fa59a0676d BIT,
@IsSoftForeignKey_d5fa59a0676d BIT,
@RelatedEntityJoinFields_d5fa59a0676d NVARCHAR(MAX),
@JSONType_d5fa59a0676d NVARCHAR(255),
@JSONTypeIsArray_d5fa59a0676d BIT,
@JSONTypeDefinition_d5fa59a0676d NVARCHAR(MAX),
@UserSearchPredicateAPI_d5fa59a0676d NVARCHAR(20),
@AutoUpdateUserSearchPredicate_d5fa59a0676d BIT,
@AutoUpdateFullTextSearch_d5fa59a0676d BIT,
@AutoUpdateExtendedType_d5fa59a0676d BIT,
@IsComputed_d5fa59a0676d BIT,
@EmbeddedRecord_d5fa59a0676d NVARCHAR(MAX),
@Configuration_d5fa59a0676d NVARCHAR(MAX),
@ID_d5fa59a0676d UNIQUEIDENTIFIER
SET
  @DisplayName_d5fa59a0676d = N'Name'
SET
  @Description_d5fa59a0676d = N'Display name of the form'
SET
  @AutoUpdateDescription_d5fa59a0676d = 1
SET
  @IsPrimaryKey_d5fa59a0676d = 0
SET
  @IsUnique_d5fa59a0676d = 0
SET
  @Category_d5fa59a0676d = N'Form Information'
SET
  @ValueListType_d5fa59a0676d = N'None'
SET
  @DefaultInView_d5fa59a0676d = 1
SET
  @DefaultColumnWidth_d5fa59a0676d = 150
SET
  @AllowUpdateAPI_d5fa59a0676d = 1
SET
  @AllowUpdateInView_d5fa59a0676d = 1
SET
  @IncludeInUserSearchAPI_d5fa59a0676d = 1
SET
  @FullTextSearchEnabled_d5fa59a0676d = 0
SET
  @IncludeInGeneratedForm_d5fa59a0676d = 1
SET
  @GeneratedFormSection_d5fa59a0676d = N'Category'
SET
  @IsNameField_d5fa59a0676d = 1
SET
  @IncludeRelatedEntityNameFieldInBaseView_d5fa59a0676d = 0
SET
  @RelatedEntityDisplayType_d5fa59a0676d = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_d5fa59a0676d = 1
SET
  @ValuesToPackWithSchema_d5fa59a0676d = N'Auto'
SET
  @Status_d5fa59a0676d = N'Active'
SET
  @AutoUpdateIsNameField_d5fa59a0676d = 1
SET
  @AutoUpdateDefaultInView_d5fa59a0676d = 1
SET
  @AutoUpdateCategory_d5fa59a0676d = 1
SET
  @AutoUpdateDisplayName_d5fa59a0676d = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_d5fa59a0676d = 0
SET
  @Encrypt_d5fa59a0676d = 0
SET
  @AllowDecryptInAPI_d5fa59a0676d = 0
SET
  @SendEncryptedValue_d5fa59a0676d = 0
SET
  @IsSoftPrimaryKey_d5fa59a0676d = 0
SET
  @IsSoftForeignKey_d5fa59a0676d = 0
SET
  @JSONTypeIsArray_d5fa59a0676d = 0
SET
  @UserSearchPredicateAPI_d5fa59a0676d = N'BeginsWith'
SET
  @AutoUpdateUserSearchPredicate_d5fa59a0676d = 1
SET
  @AutoUpdateFullTextSearch_d5fa59a0676d = 1
SET
  @AutoUpdateExtendedType_d5fa59a0676d = 1
SET
  @IsComputed_d5fa59a0676d = 0
SET
  @ID_d5fa59a0676d = '78B49574-A9C0-41B2-9352-01C24FE35FBA' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_d5fa59a0676d,
  @Description = @Description_d5fa59a0676d,
  @AutoUpdateDescription = @AutoUpdateDescription_d5fa59a0676d,
  @IsPrimaryKey = @IsPrimaryKey_d5fa59a0676d,
  @IsUnique = @IsUnique_d5fa59a0676d,
  @Category = @Category_d5fa59a0676d,
  @ValueListType = @ValueListType_d5fa59a0676d,
  @ExtendedType = @ExtendedType_d5fa59a0676d,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_d5fa59a0676d,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_d5fa59a0676d,
  @ViewCellTemplate = @ViewCellTemplate_d5fa59a0676d,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_d5fa59a0676d,
  @AllowUpdateAPI = @AllowUpdateAPI_d5fa59a0676d,
  @AllowUpdateInView = @AllowUpdateInView_d5fa59a0676d,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_d5fa59a0676d,
  @FullTextSearchEnabled = @FullTextSearchEnabled_d5fa59a0676d,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_d5fa59a0676d,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_d5fa59a0676d,
  @GeneratedFormSection = @GeneratedFormSection_d5fa59a0676d,
  @IsNameField = @IsNameField_d5fa59a0676d,
  @RelatedEntityID = @RelatedEntityID_d5fa59a0676d,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_d5fa59a0676d,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_d5fa59a0676d,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_d5fa59a0676d,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_d5fa59a0676d,
  @EntityIDFieldName = @EntityIDFieldName_d5fa59a0676d,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_d5fa59a0676d,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_d5fa59a0676d,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_d5fa59a0676d,
  @Status = @Status_d5fa59a0676d,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_d5fa59a0676d,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_d5fa59a0676d,
  @AutoUpdateCategory = @AutoUpdateCategory_d5fa59a0676d,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_d5fa59a0676d,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_d5fa59a0676d,
  @Encrypt = @Encrypt_d5fa59a0676d,
  @EncryptionKeyID = @EncryptionKeyID_d5fa59a0676d,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_d5fa59a0676d,
  @SendEncryptedValue = @SendEncryptedValue_d5fa59a0676d,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_d5fa59a0676d,
  @IsSoftForeignKey = @IsSoftForeignKey_d5fa59a0676d,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_d5fa59a0676d,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_d5fa59a0676d,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_d5fa59a0676d,
  @JSONTypeDefinition = @JSONTypeDefinition_d5fa59a0676d,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_d5fa59a0676d,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_d5fa59a0676d,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_d5fa59a0676d,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_d5fa59a0676d,
  @IsComputed = @IsComputed_d5fa59a0676d,
  @EmbeddedRecord = @EmbeddedRecord_d5fa59a0676d,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_d5fa59a0676d,
  @Configuration_Clear = 1,
  @ID = @ID_d5fa59a0676d;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_f8859fd907d3 NVARCHAR(255),
@Description_f8859fd907d3 NVARCHAR(MAX),
@AutoUpdateDescription_f8859fd907d3 BIT,
@IsPrimaryKey_f8859fd907d3 BIT,
@IsUnique_f8859fd907d3 BIT,
@Category_f8859fd907d3 NVARCHAR(255),
@ValueListType_f8859fd907d3 NVARCHAR(20),
@ExtendedType_f8859fd907d3 NVARCHAR(50),
@CodeType_f8859fd907d3 NVARCHAR(50),
@DefaultInView_f8859fd907d3 BIT,
@ViewCellTemplate_f8859fd907d3 NVARCHAR(MAX),
@DefaultColumnWidth_f8859fd907d3 INT,
@AllowUpdateAPI_f8859fd907d3 BIT,
@AllowUpdateInView_f8859fd907d3 BIT,
@IncludeInUserSearchAPI_f8859fd907d3 BIT,
@FullTextSearchEnabled_f8859fd907d3 BIT,
@UserSearchParamFormatAPI_f8859fd907d3 NVARCHAR(500),
@IncludeInGeneratedForm_f8859fd907d3 BIT,
@GeneratedFormSection_f8859fd907d3 NVARCHAR(10),
@IsNameField_f8859fd907d3 BIT,
@RelatedEntityID_f8859fd907d3 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_f8859fd907d3 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_f8859fd907d3 BIT,
@RelatedEntityNameFieldMap_f8859fd907d3 NVARCHAR(255),
@RelatedEntityDisplayType_f8859fd907d3 NVARCHAR(20),
@EntityIDFieldName_f8859fd907d3 NVARCHAR(100),
@ScopeDefault_f8859fd907d3 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_f8859fd907d3 BIT,
@ValuesToPackWithSchema_f8859fd907d3 NVARCHAR(10),
@Status_f8859fd907d3 NVARCHAR(25),
@AutoUpdateIsNameField_f8859fd907d3 BIT,
@AutoUpdateDefaultInView_f8859fd907d3 BIT,
@AutoUpdateCategory_f8859fd907d3 BIT,
@AutoUpdateDisplayName_f8859fd907d3 BIT,
@AutoUpdateIncludeInUserSearchAPI_f8859fd907d3 BIT,
@Encrypt_f8859fd907d3 BIT,
@EncryptionKeyID_f8859fd907d3 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_f8859fd907d3 BIT,
@SendEncryptedValue_f8859fd907d3 BIT,
@IsSoftPrimaryKey_f8859fd907d3 BIT,
@IsSoftForeignKey_f8859fd907d3 BIT,
@RelatedEntityJoinFields_f8859fd907d3 NVARCHAR(MAX),
@JSONType_f8859fd907d3 NVARCHAR(255),
@JSONTypeIsArray_f8859fd907d3 BIT,
@JSONTypeDefinition_f8859fd907d3 NVARCHAR(MAX),
@UserSearchPredicateAPI_f8859fd907d3 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_f8859fd907d3 BIT,
@AutoUpdateFullTextSearch_f8859fd907d3 BIT,
@AutoUpdateExtendedType_f8859fd907d3 BIT,
@IsComputed_f8859fd907d3 BIT,
@EmbeddedRecord_f8859fd907d3 NVARCHAR(MAX),
@Configuration_f8859fd907d3 NVARCHAR(MAX),
@ID_f8859fd907d3 UNIQUEIDENTIFIER
SET
  @DisplayName_f8859fd907d3 = N'ID'
SET
  @AutoUpdateDescription_f8859fd907d3 = 1
SET
  @IsPrimaryKey_f8859fd907d3 = 1
SET
  @IsUnique_f8859fd907d3 = 1
SET
  @Category_f8859fd907d3 = N'System Metadata'
SET
  @ValueListType_f8859fd907d3 = N'None'
SET
  @DefaultInView_f8859fd907d3 = 0
SET
  @DefaultColumnWidth_f8859fd907d3 = 150
SET
  @AllowUpdateAPI_f8859fd907d3 = 0
SET
  @AllowUpdateInView_f8859fd907d3 = 1
SET
  @IncludeInUserSearchAPI_f8859fd907d3 = 0
SET
  @FullTextSearchEnabled_f8859fd907d3 = 0
SET
  @IncludeInGeneratedForm_f8859fd907d3 = 1
SET
  @GeneratedFormSection_f8859fd907d3 = N'Category'
SET
  @IsNameField_f8859fd907d3 = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_f8859fd907d3 = 0
SET
  @RelatedEntityDisplayType_f8859fd907d3 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_f8859fd907d3 = 1
SET
  @ValuesToPackWithSchema_f8859fd907d3 = N'Auto'
SET
  @Status_f8859fd907d3 = N'Active'
SET
  @AutoUpdateIsNameField_f8859fd907d3 = 1
SET
  @AutoUpdateDefaultInView_f8859fd907d3 = 1
SET
  @AutoUpdateCategory_f8859fd907d3 = 1
SET
  @AutoUpdateDisplayName_f8859fd907d3 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_f8859fd907d3 = 0
SET
  @Encrypt_f8859fd907d3 = 0
SET
  @AllowDecryptInAPI_f8859fd907d3 = 0
SET
  @SendEncryptedValue_f8859fd907d3 = 0
SET
  @IsSoftPrimaryKey_f8859fd907d3 = 0
SET
  @IsSoftForeignKey_f8859fd907d3 = 0
SET
  @JSONTypeIsArray_f8859fd907d3 = 0
SET
  @UserSearchPredicateAPI_f8859fd907d3 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_f8859fd907d3 = 1
SET
  @AutoUpdateFullTextSearch_f8859fd907d3 = 1
SET
  @AutoUpdateExtendedType_f8859fd907d3 = 1
SET
  @IsComputed_f8859fd907d3 = 0
SET
  @ID_f8859fd907d3 = '8DC15128-B17F-45C1-87BE-DC4CD02B49E6' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_f8859fd907d3,
  @Description = @Description_f8859fd907d3,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_f8859fd907d3,
  @IsPrimaryKey = @IsPrimaryKey_f8859fd907d3,
  @IsUnique = @IsUnique_f8859fd907d3,
  @Category = @Category_f8859fd907d3,
  @ValueListType = @ValueListType_f8859fd907d3,
  @ExtendedType = @ExtendedType_f8859fd907d3,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_f8859fd907d3,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_f8859fd907d3,
  @ViewCellTemplate = @ViewCellTemplate_f8859fd907d3,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_f8859fd907d3,
  @AllowUpdateAPI = @AllowUpdateAPI_f8859fd907d3,
  @AllowUpdateInView = @AllowUpdateInView_f8859fd907d3,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_f8859fd907d3,
  @FullTextSearchEnabled = @FullTextSearchEnabled_f8859fd907d3,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_f8859fd907d3,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_f8859fd907d3,
  @GeneratedFormSection = @GeneratedFormSection_f8859fd907d3,
  @IsNameField = @IsNameField_f8859fd907d3,
  @RelatedEntityID = @RelatedEntityID_f8859fd907d3,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_f8859fd907d3,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_f8859fd907d3,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_f8859fd907d3,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_f8859fd907d3,
  @EntityIDFieldName = @EntityIDFieldName_f8859fd907d3,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_f8859fd907d3,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_f8859fd907d3,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_f8859fd907d3,
  @Status = @Status_f8859fd907d3,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_f8859fd907d3,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_f8859fd907d3,
  @AutoUpdateCategory = @AutoUpdateCategory_f8859fd907d3,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_f8859fd907d3,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_f8859fd907d3,
  @Encrypt = @Encrypt_f8859fd907d3,
  @EncryptionKeyID = @EncryptionKeyID_f8859fd907d3,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_f8859fd907d3,
  @SendEncryptedValue = @SendEncryptedValue_f8859fd907d3,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_f8859fd907d3,
  @IsSoftForeignKey = @IsSoftForeignKey_f8859fd907d3,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_f8859fd907d3,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_f8859fd907d3,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_f8859fd907d3,
  @JSONTypeDefinition = @JSONTypeDefinition_f8859fd907d3,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_f8859fd907d3,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_f8859fd907d3,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_f8859fd907d3,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_f8859fd907d3,
  @IsComputed = @IsComputed_f8859fd907d3,
  @EmbeddedRecord = @EmbeddedRecord_f8859fd907d3,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_f8859fd907d3,
  @Configuration_Clear = 1,
  @ID = @ID_f8859fd907d3;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_91a2bb68ad36 NVARCHAR(255),
@Description_91a2bb68ad36 NVARCHAR(MAX),
@AutoUpdateDescription_91a2bb68ad36 BIT,
@IsPrimaryKey_91a2bb68ad36 BIT,
@IsUnique_91a2bb68ad36 BIT,
@Category_91a2bb68ad36 NVARCHAR(255),
@ValueListType_91a2bb68ad36 NVARCHAR(20),
@ExtendedType_91a2bb68ad36 NVARCHAR(50),
@CodeType_91a2bb68ad36 NVARCHAR(50),
@DefaultInView_91a2bb68ad36 BIT,
@ViewCellTemplate_91a2bb68ad36 NVARCHAR(MAX),
@DefaultColumnWidth_91a2bb68ad36 INT,
@AllowUpdateAPI_91a2bb68ad36 BIT,
@AllowUpdateInView_91a2bb68ad36 BIT,
@IncludeInUserSearchAPI_91a2bb68ad36 BIT,
@FullTextSearchEnabled_91a2bb68ad36 BIT,
@UserSearchParamFormatAPI_91a2bb68ad36 NVARCHAR(500),
@IncludeInGeneratedForm_91a2bb68ad36 BIT,
@GeneratedFormSection_91a2bb68ad36 NVARCHAR(10),
@IsNameField_91a2bb68ad36 BIT,
@RelatedEntityID_91a2bb68ad36 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_91a2bb68ad36 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_91a2bb68ad36 BIT,
@RelatedEntityNameFieldMap_91a2bb68ad36 NVARCHAR(255),
@RelatedEntityDisplayType_91a2bb68ad36 NVARCHAR(20),
@EntityIDFieldName_91a2bb68ad36 NVARCHAR(100),
@ScopeDefault_91a2bb68ad36 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_91a2bb68ad36 BIT,
@ValuesToPackWithSchema_91a2bb68ad36 NVARCHAR(10),
@Status_91a2bb68ad36 NVARCHAR(25),
@AutoUpdateIsNameField_91a2bb68ad36 BIT,
@AutoUpdateDefaultInView_91a2bb68ad36 BIT,
@AutoUpdateCategory_91a2bb68ad36 BIT,
@AutoUpdateDisplayName_91a2bb68ad36 BIT,
@AutoUpdateIncludeInUserSearchAPI_91a2bb68ad36 BIT,
@Encrypt_91a2bb68ad36 BIT,
@EncryptionKeyID_91a2bb68ad36 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_91a2bb68ad36 BIT,
@SendEncryptedValue_91a2bb68ad36 BIT,
@IsSoftPrimaryKey_91a2bb68ad36 BIT,
@IsSoftForeignKey_91a2bb68ad36 BIT,
@RelatedEntityJoinFields_91a2bb68ad36 NVARCHAR(MAX),
@JSONType_91a2bb68ad36 NVARCHAR(255),
@JSONTypeIsArray_91a2bb68ad36 BIT,
@JSONTypeDefinition_91a2bb68ad36 NVARCHAR(MAX),
@UserSearchPredicateAPI_91a2bb68ad36 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_91a2bb68ad36 BIT,
@AutoUpdateFullTextSearch_91a2bb68ad36 BIT,
@AutoUpdateExtendedType_91a2bb68ad36 BIT,
@IsComputed_91a2bb68ad36 BIT,
@EmbeddedRecord_91a2bb68ad36 NVARCHAR(MAX),
@Configuration_91a2bb68ad36 NVARCHAR(MAX),
@ID_91a2bb68ad36 UNIQUEIDENTIFIER
SET
  @DisplayName_91a2bb68ad36 = N'ID'
SET
  @AutoUpdateDescription_91a2bb68ad36 = 1
SET
  @IsPrimaryKey_91a2bb68ad36 = 1
SET
  @IsUnique_91a2bb68ad36 = 1
SET
  @Category_91a2bb68ad36 = N'System Metadata'
SET
  @ValueListType_91a2bb68ad36 = N'None'
SET
  @DefaultInView_91a2bb68ad36 = 0
SET
  @DefaultColumnWidth_91a2bb68ad36 = 150
SET
  @AllowUpdateAPI_91a2bb68ad36 = 0
SET
  @AllowUpdateInView_91a2bb68ad36 = 1
SET
  @IncludeInUserSearchAPI_91a2bb68ad36 = 0
SET
  @FullTextSearchEnabled_91a2bb68ad36 = 0
SET
  @IncludeInGeneratedForm_91a2bb68ad36 = 1
SET
  @GeneratedFormSection_91a2bb68ad36 = N'Category'
SET
  @IsNameField_91a2bb68ad36 = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_91a2bb68ad36 = 0
SET
  @RelatedEntityDisplayType_91a2bb68ad36 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_91a2bb68ad36 = 1
SET
  @ValuesToPackWithSchema_91a2bb68ad36 = N'Auto'
SET
  @Status_91a2bb68ad36 = N'Active'
SET
  @AutoUpdateIsNameField_91a2bb68ad36 = 1
SET
  @AutoUpdateDefaultInView_91a2bb68ad36 = 1
SET
  @AutoUpdateCategory_91a2bb68ad36 = 1
SET
  @AutoUpdateDisplayName_91a2bb68ad36 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_91a2bb68ad36 = 0
SET
  @Encrypt_91a2bb68ad36 = 0
SET
  @AllowDecryptInAPI_91a2bb68ad36 = 0
SET
  @SendEncryptedValue_91a2bb68ad36 = 0
SET
  @IsSoftPrimaryKey_91a2bb68ad36 = 0
SET
  @IsSoftForeignKey_91a2bb68ad36 = 0
SET
  @JSONTypeIsArray_91a2bb68ad36 = 0
SET
  @UserSearchPredicateAPI_91a2bb68ad36 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_91a2bb68ad36 = 1
SET
  @AutoUpdateFullTextSearch_91a2bb68ad36 = 1
SET
  @AutoUpdateExtendedType_91a2bb68ad36 = 1
SET
  @IsComputed_91a2bb68ad36 = 0
SET
  @ID_91a2bb68ad36 = 'E02E1400-5755-45BB-B7AF-B2A73BFA2B83' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_91a2bb68ad36,
  @Description = @Description_91a2bb68ad36,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_91a2bb68ad36,
  @IsPrimaryKey = @IsPrimaryKey_91a2bb68ad36,
  @IsUnique = @IsUnique_91a2bb68ad36,
  @Category = @Category_91a2bb68ad36,
  @ValueListType = @ValueListType_91a2bb68ad36,
  @ExtendedType = @ExtendedType_91a2bb68ad36,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_91a2bb68ad36,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_91a2bb68ad36,
  @ViewCellTemplate = @ViewCellTemplate_91a2bb68ad36,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_91a2bb68ad36,
  @AllowUpdateAPI = @AllowUpdateAPI_91a2bb68ad36,
  @AllowUpdateInView = @AllowUpdateInView_91a2bb68ad36,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_91a2bb68ad36,
  @FullTextSearchEnabled = @FullTextSearchEnabled_91a2bb68ad36,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_91a2bb68ad36,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_91a2bb68ad36,
  @GeneratedFormSection = @GeneratedFormSection_91a2bb68ad36,
  @IsNameField = @IsNameField_91a2bb68ad36,
  @RelatedEntityID = @RelatedEntityID_91a2bb68ad36,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_91a2bb68ad36,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_91a2bb68ad36,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_91a2bb68ad36,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_91a2bb68ad36,
  @EntityIDFieldName = @EntityIDFieldName_91a2bb68ad36,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_91a2bb68ad36,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_91a2bb68ad36,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_91a2bb68ad36,
  @Status = @Status_91a2bb68ad36,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_91a2bb68ad36,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_91a2bb68ad36,
  @AutoUpdateCategory = @AutoUpdateCategory_91a2bb68ad36,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_91a2bb68ad36,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_91a2bb68ad36,
  @Encrypt = @Encrypt_91a2bb68ad36,
  @EncryptionKeyID = @EncryptionKeyID_91a2bb68ad36,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_91a2bb68ad36,
  @SendEncryptedValue = @SendEncryptedValue_91a2bb68ad36,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_91a2bb68ad36,
  @IsSoftForeignKey = @IsSoftForeignKey_91a2bb68ad36,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_91a2bb68ad36,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_91a2bb68ad36,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_91a2bb68ad36,
  @JSONTypeDefinition = @JSONTypeDefinition_91a2bb68ad36,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_91a2bb68ad36,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_91a2bb68ad36,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_91a2bb68ad36,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_91a2bb68ad36,
  @IsComputed = @IsComputed_91a2bb68ad36,
  @EmbeddedRecord = @EmbeddedRecord_91a2bb68ad36,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_91a2bb68ad36,
  @Configuration_Clear = 1,
  @ID = @ID_91a2bb68ad36;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_7f332bcc5c7e NVARCHAR(255),
@Description_7f332bcc5c7e NVARCHAR(MAX),
@AutoUpdateDescription_7f332bcc5c7e BIT,
@IsPrimaryKey_7f332bcc5c7e BIT,
@IsUnique_7f332bcc5c7e BIT,
@Category_7f332bcc5c7e NVARCHAR(255),
@ValueListType_7f332bcc5c7e NVARCHAR(20),
@ExtendedType_7f332bcc5c7e NVARCHAR(50),
@CodeType_7f332bcc5c7e NVARCHAR(50),
@DefaultInView_7f332bcc5c7e BIT,
@ViewCellTemplate_7f332bcc5c7e NVARCHAR(MAX),
@DefaultColumnWidth_7f332bcc5c7e INT,
@AllowUpdateAPI_7f332bcc5c7e BIT,
@AllowUpdateInView_7f332bcc5c7e BIT,
@IncludeInUserSearchAPI_7f332bcc5c7e BIT,
@FullTextSearchEnabled_7f332bcc5c7e BIT,
@UserSearchParamFormatAPI_7f332bcc5c7e NVARCHAR(500),
@IncludeInGeneratedForm_7f332bcc5c7e BIT,
@GeneratedFormSection_7f332bcc5c7e NVARCHAR(10),
@IsNameField_7f332bcc5c7e BIT,
@RelatedEntityID_7f332bcc5c7e UNIQUEIDENTIFIER,
@RelatedEntityFieldName_7f332bcc5c7e NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_7f332bcc5c7e BIT,
@RelatedEntityNameFieldMap_7f332bcc5c7e NVARCHAR(255),
@RelatedEntityDisplayType_7f332bcc5c7e NVARCHAR(20),
@EntityIDFieldName_7f332bcc5c7e NVARCHAR(100),
@ScopeDefault_7f332bcc5c7e NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_7f332bcc5c7e BIT,
@ValuesToPackWithSchema_7f332bcc5c7e NVARCHAR(10),
@Status_7f332bcc5c7e NVARCHAR(25),
@AutoUpdateIsNameField_7f332bcc5c7e BIT,
@AutoUpdateDefaultInView_7f332bcc5c7e BIT,
@AutoUpdateCategory_7f332bcc5c7e BIT,
@AutoUpdateDisplayName_7f332bcc5c7e BIT,
@AutoUpdateIncludeInUserSearchAPI_7f332bcc5c7e BIT,
@Encrypt_7f332bcc5c7e BIT,
@EncryptionKeyID_7f332bcc5c7e UNIQUEIDENTIFIER,
@AllowDecryptInAPI_7f332bcc5c7e BIT,
@SendEncryptedValue_7f332bcc5c7e BIT,
@IsSoftPrimaryKey_7f332bcc5c7e BIT,
@IsSoftForeignKey_7f332bcc5c7e BIT,
@RelatedEntityJoinFields_7f332bcc5c7e NVARCHAR(MAX),
@JSONType_7f332bcc5c7e NVARCHAR(255),
@JSONTypeIsArray_7f332bcc5c7e BIT,
@JSONTypeDefinition_7f332bcc5c7e NVARCHAR(MAX),
@UserSearchPredicateAPI_7f332bcc5c7e NVARCHAR(20),
@AutoUpdateUserSearchPredicate_7f332bcc5c7e BIT,
@AutoUpdateFullTextSearch_7f332bcc5c7e BIT,
@AutoUpdateExtendedType_7f332bcc5c7e BIT,
@IsComputed_7f332bcc5c7e BIT,
@EmbeddedRecord_7f332bcc5c7e NVARCHAR(MAX),
@Configuration_7f332bcc5c7e NVARCHAR(MAX),
@ID_7f332bcc5c7e UNIQUEIDENTIFIER
SET
  @DisplayName_7f332bcc5c7e = N'Category'
SET
  @AutoUpdateDescription_7f332bcc5c7e = 1
SET
  @IsPrimaryKey_7f332bcc5c7e = 0
SET
  @IsUnique_7f332bcc5c7e = 0
SET
  @Category_7f332bcc5c7e = N'Form Information'
SET
  @ValueListType_7f332bcc5c7e = N'None'
SET
  @DefaultInView_7f332bcc5c7e = 1
SET
  @DefaultColumnWidth_7f332bcc5c7e = 150
SET
  @AllowUpdateAPI_7f332bcc5c7e = 0
SET
  @AllowUpdateInView_7f332bcc5c7e = 1
SET
  @IncludeInUserSearchAPI_7f332bcc5c7e = 0
SET
  @FullTextSearchEnabled_7f332bcc5c7e = 0
SET
  @IncludeInGeneratedForm_7f332bcc5c7e = 1
SET
  @GeneratedFormSection_7f332bcc5c7e = N'Category'
SET
  @IsNameField_7f332bcc5c7e = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_7f332bcc5c7e = 0
SET
  @RelatedEntityDisplayType_7f332bcc5c7e = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_7f332bcc5c7e = 1
SET
  @ValuesToPackWithSchema_7f332bcc5c7e = N'Auto'
SET
  @Status_7f332bcc5c7e = N'Active'
SET
  @AutoUpdateIsNameField_7f332bcc5c7e = 1
SET
  @AutoUpdateDefaultInView_7f332bcc5c7e = 1
SET
  @AutoUpdateCategory_7f332bcc5c7e = 1
SET
  @AutoUpdateDisplayName_7f332bcc5c7e = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_7f332bcc5c7e = 0
SET
  @Encrypt_7f332bcc5c7e = 0
SET
  @AllowDecryptInAPI_7f332bcc5c7e = 0
SET
  @SendEncryptedValue_7f332bcc5c7e = 0
SET
  @IsSoftPrimaryKey_7f332bcc5c7e = 0
SET
  @IsSoftForeignKey_7f332bcc5c7e = 0
SET
  @JSONTypeIsArray_7f332bcc5c7e = 0
SET
  @UserSearchPredicateAPI_7f332bcc5c7e = N'BeginsWith'
SET
  @AutoUpdateUserSearchPredicate_7f332bcc5c7e = 1
SET
  @AutoUpdateFullTextSearch_7f332bcc5c7e = 1
SET
  @AutoUpdateExtendedType_7f332bcc5c7e = 1
SET
  @IsComputed_7f332bcc5c7e = 0
SET
  @ID_7f332bcc5c7e = 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_7f332bcc5c7e,
  @Description = @Description_7f332bcc5c7e,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_7f332bcc5c7e,
  @IsPrimaryKey = @IsPrimaryKey_7f332bcc5c7e,
  @IsUnique = @IsUnique_7f332bcc5c7e,
  @Category = @Category_7f332bcc5c7e,
  @ValueListType = @ValueListType_7f332bcc5c7e,
  @ExtendedType = @ExtendedType_7f332bcc5c7e,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_7f332bcc5c7e,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_7f332bcc5c7e,
  @ViewCellTemplate = @ViewCellTemplate_7f332bcc5c7e,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_7f332bcc5c7e,
  @AllowUpdateAPI = @AllowUpdateAPI_7f332bcc5c7e,
  @AllowUpdateInView = @AllowUpdateInView_7f332bcc5c7e,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_7f332bcc5c7e,
  @FullTextSearchEnabled = @FullTextSearchEnabled_7f332bcc5c7e,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_7f332bcc5c7e,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_7f332bcc5c7e,
  @GeneratedFormSection = @GeneratedFormSection_7f332bcc5c7e,
  @IsNameField = @IsNameField_7f332bcc5c7e,
  @RelatedEntityID = @RelatedEntityID_7f332bcc5c7e,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_7f332bcc5c7e,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_7f332bcc5c7e,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_7f332bcc5c7e,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_7f332bcc5c7e,
  @EntityIDFieldName = @EntityIDFieldName_7f332bcc5c7e,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_7f332bcc5c7e,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_7f332bcc5c7e,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_7f332bcc5c7e,
  @Status = @Status_7f332bcc5c7e,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_7f332bcc5c7e,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_7f332bcc5c7e,
  @AutoUpdateCategory = @AutoUpdateCategory_7f332bcc5c7e,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_7f332bcc5c7e,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_7f332bcc5c7e,
  @Encrypt = @Encrypt_7f332bcc5c7e,
  @EncryptionKeyID = @EncryptionKeyID_7f332bcc5c7e,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_7f332bcc5c7e,
  @SendEncryptedValue = @SendEncryptedValue_7f332bcc5c7e,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_7f332bcc5c7e,
  @IsSoftForeignKey = @IsSoftForeignKey_7f332bcc5c7e,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_7f332bcc5c7e,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_7f332bcc5c7e,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_7f332bcc5c7e,
  @JSONTypeDefinition = @JSONTypeDefinition_7f332bcc5c7e,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_7f332bcc5c7e,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_7f332bcc5c7e,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_7f332bcc5c7e,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_7f332bcc5c7e,
  @IsComputed = @IsComputed_7f332bcc5c7e,
  @EmbeddedRecord = @EmbeddedRecord_7f332bcc5c7e,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_7f332bcc5c7e,
  @Configuration_Clear = 1,
  @ID = @ID_7f332bcc5c7e;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_d1c1c996090c NVARCHAR(255),
@Description_d1c1c996090c NVARCHAR(MAX),
@AutoUpdateDescription_d1c1c996090c BIT,
@IsPrimaryKey_d1c1c996090c BIT,
@IsUnique_d1c1c996090c BIT,
@Category_d1c1c996090c NVARCHAR(255),
@ValueListType_d1c1c996090c NVARCHAR(20),
@ExtendedType_d1c1c996090c NVARCHAR(50),
@CodeType_d1c1c996090c NVARCHAR(50),
@DefaultInView_d1c1c996090c BIT,
@ViewCellTemplate_d1c1c996090c NVARCHAR(MAX),
@DefaultColumnWidth_d1c1c996090c INT,
@AllowUpdateAPI_d1c1c996090c BIT,
@AllowUpdateInView_d1c1c996090c BIT,
@IncludeInUserSearchAPI_d1c1c996090c BIT,
@FullTextSearchEnabled_d1c1c996090c BIT,
@UserSearchParamFormatAPI_d1c1c996090c NVARCHAR(500),
@IncludeInGeneratedForm_d1c1c996090c BIT,
@GeneratedFormSection_d1c1c996090c NVARCHAR(10),
@IsNameField_d1c1c996090c BIT,
@RelatedEntityID_d1c1c996090c UNIQUEIDENTIFIER,
@RelatedEntityFieldName_d1c1c996090c NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_d1c1c996090c BIT,
@RelatedEntityNameFieldMap_d1c1c996090c NVARCHAR(255),
@RelatedEntityDisplayType_d1c1c996090c NVARCHAR(20),
@EntityIDFieldName_d1c1c996090c NVARCHAR(100),
@ScopeDefault_d1c1c996090c NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_d1c1c996090c BIT,
@ValuesToPackWithSchema_d1c1c996090c NVARCHAR(10),
@Status_d1c1c996090c NVARCHAR(25),
@AutoUpdateIsNameField_d1c1c996090c BIT,
@AutoUpdateDefaultInView_d1c1c996090c BIT,
@AutoUpdateCategory_d1c1c996090c BIT,
@AutoUpdateDisplayName_d1c1c996090c BIT,
@AutoUpdateIncludeInUserSearchAPI_d1c1c996090c BIT,
@Encrypt_d1c1c996090c BIT,
@EncryptionKeyID_d1c1c996090c UNIQUEIDENTIFIER,
@AllowDecryptInAPI_d1c1c996090c BIT,
@SendEncryptedValue_d1c1c996090c BIT,
@IsSoftPrimaryKey_d1c1c996090c BIT,
@IsSoftForeignKey_d1c1c996090c BIT,
@RelatedEntityJoinFields_d1c1c996090c NVARCHAR(MAX),
@JSONType_d1c1c996090c NVARCHAR(255),
@JSONTypeIsArray_d1c1c996090c BIT,
@JSONTypeDefinition_d1c1c996090c NVARCHAR(MAX),
@UserSearchPredicateAPI_d1c1c996090c NVARCHAR(20),
@AutoUpdateUserSearchPredicate_d1c1c996090c BIT,
@AutoUpdateFullTextSearch_d1c1c996090c BIT,
@AutoUpdateExtendedType_d1c1c996090c BIT,
@IsComputed_d1c1c996090c BIT,
@EmbeddedRecord_d1c1c996090c NVARCHAR(MAX),
@Configuration_d1c1c996090c NVARCHAR(MAX),
@ID_d1c1c996090c UNIQUEIDENTIFIER
SET
  @DisplayName_d1c1c996090c = N'Owner'
SET
  @AutoUpdateDescription_d1c1c996090c = 1
SET
  @IsPrimaryKey_d1c1c996090c = 0
SET
  @IsUnique_d1c1c996090c = 0
SET
  @Category_d1c1c996090c = N'Form Information'
SET
  @ValueListType_d1c1c996090c = N'None'
SET
  @DefaultInView_d1c1c996090c = 1
SET
  @DefaultColumnWidth_d1c1c996090c = 150
SET
  @AllowUpdateAPI_d1c1c996090c = 0
SET
  @AllowUpdateInView_d1c1c996090c = 1
SET
  @IncludeInUserSearchAPI_d1c1c996090c = 0
SET
  @FullTextSearchEnabled_d1c1c996090c = 0
SET
  @IncludeInGeneratedForm_d1c1c996090c = 1
SET
  @GeneratedFormSection_d1c1c996090c = N'Category'
SET
  @IsNameField_d1c1c996090c = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_d1c1c996090c = 0
SET
  @RelatedEntityDisplayType_d1c1c996090c = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_d1c1c996090c = 1
SET
  @ValuesToPackWithSchema_d1c1c996090c = N'Auto'
SET
  @Status_d1c1c996090c = N'Active'
SET
  @AutoUpdateIsNameField_d1c1c996090c = 1
SET
  @AutoUpdateDefaultInView_d1c1c996090c = 1
SET
  @AutoUpdateCategory_d1c1c996090c = 1
SET
  @AutoUpdateDisplayName_d1c1c996090c = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_d1c1c996090c = 0
SET
  @Encrypt_d1c1c996090c = 0
SET
  @AllowDecryptInAPI_d1c1c996090c = 0
SET
  @SendEncryptedValue_d1c1c996090c = 0
SET
  @IsSoftPrimaryKey_d1c1c996090c = 0
SET
  @IsSoftForeignKey_d1c1c996090c = 0
SET
  @JSONTypeIsArray_d1c1c996090c = 0
SET
  @UserSearchPredicateAPI_d1c1c996090c = N'BeginsWith'
SET
  @AutoUpdateUserSearchPredicate_d1c1c996090c = 1
SET
  @AutoUpdateFullTextSearch_d1c1c996090c = 1
SET
  @AutoUpdateExtendedType_d1c1c996090c = 1
SET
  @IsComputed_d1c1c996090c = 0
SET
  @ID_d1c1c996090c = 'A744F418-66DB-4475-A548-009F548B0105' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_d1c1c996090c,
  @Description = @Description_d1c1c996090c,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_d1c1c996090c,
  @IsPrimaryKey = @IsPrimaryKey_d1c1c996090c,
  @IsUnique = @IsUnique_d1c1c996090c,
  @Category = @Category_d1c1c996090c,
  @ValueListType = @ValueListType_d1c1c996090c,
  @ExtendedType = @ExtendedType_d1c1c996090c,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_d1c1c996090c,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_d1c1c996090c,
  @ViewCellTemplate = @ViewCellTemplate_d1c1c996090c,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_d1c1c996090c,
  @AllowUpdateAPI = @AllowUpdateAPI_d1c1c996090c,
  @AllowUpdateInView = @AllowUpdateInView_d1c1c996090c,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_d1c1c996090c,
  @FullTextSearchEnabled = @FullTextSearchEnabled_d1c1c996090c,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_d1c1c996090c,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_d1c1c996090c,
  @GeneratedFormSection = @GeneratedFormSection_d1c1c996090c,
  @IsNameField = @IsNameField_d1c1c996090c,
  @RelatedEntityID = @RelatedEntityID_d1c1c996090c,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_d1c1c996090c,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_d1c1c996090c,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_d1c1c996090c,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_d1c1c996090c,
  @EntityIDFieldName = @EntityIDFieldName_d1c1c996090c,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_d1c1c996090c,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_d1c1c996090c,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_d1c1c996090c,
  @Status = @Status_d1c1c996090c,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_d1c1c996090c,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_d1c1c996090c,
  @AutoUpdateCategory = @AutoUpdateCategory_d1c1c996090c,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_d1c1c996090c,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_d1c1c996090c,
  @Encrypt = @Encrypt_d1c1c996090c,
  @EncryptionKeyID = @EncryptionKeyID_d1c1c996090c,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_d1c1c996090c,
  @SendEncryptedValue = @SendEncryptedValue_d1c1c996090c,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_d1c1c996090c,
  @IsSoftForeignKey = @IsSoftForeignKey_d1c1c996090c,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_d1c1c996090c,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_d1c1c996090c,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_d1c1c996090c,
  @JSONTypeDefinition = @JSONTypeDefinition_d1c1c996090c,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_d1c1c996090c,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_d1c1c996090c,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_d1c1c996090c,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_d1c1c996090c,
  @IsComputed = @IsComputed_d1c1c996090c,
  @EmbeddedRecord = @EmbeddedRecord_d1c1c996090c,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_d1c1c996090c,
  @Configuration_Clear = 1,
  @ID = @ID_d1c1c996090c;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_fc42f1e9b56d NVARCHAR(255),
@Description_fc42f1e9b56d NVARCHAR(MAX),
@AutoUpdateDescription_fc42f1e9b56d BIT,
@IsPrimaryKey_fc42f1e9b56d BIT,
@IsUnique_fc42f1e9b56d BIT,
@Category_fc42f1e9b56d NVARCHAR(255),
@ValueListType_fc42f1e9b56d NVARCHAR(20),
@ExtendedType_fc42f1e9b56d NVARCHAR(50),
@CodeType_fc42f1e9b56d NVARCHAR(50),
@DefaultInView_fc42f1e9b56d BIT,
@ViewCellTemplate_fc42f1e9b56d NVARCHAR(MAX),
@DefaultColumnWidth_fc42f1e9b56d INT,
@AllowUpdateAPI_fc42f1e9b56d BIT,
@AllowUpdateInView_fc42f1e9b56d BIT,
@IncludeInUserSearchAPI_fc42f1e9b56d BIT,
@FullTextSearchEnabled_fc42f1e9b56d BIT,
@UserSearchParamFormatAPI_fc42f1e9b56d NVARCHAR(500),
@IncludeInGeneratedForm_fc42f1e9b56d BIT,
@GeneratedFormSection_fc42f1e9b56d NVARCHAR(10),
@IsNameField_fc42f1e9b56d BIT,
@RelatedEntityID_fc42f1e9b56d UNIQUEIDENTIFIER,
@RelatedEntityFieldName_fc42f1e9b56d NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_fc42f1e9b56d BIT,
@RelatedEntityNameFieldMap_fc42f1e9b56d NVARCHAR(255),
@RelatedEntityDisplayType_fc42f1e9b56d NVARCHAR(20),
@EntityIDFieldName_fc42f1e9b56d NVARCHAR(100),
@ScopeDefault_fc42f1e9b56d NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_fc42f1e9b56d BIT,
@ValuesToPackWithSchema_fc42f1e9b56d NVARCHAR(10),
@Status_fc42f1e9b56d NVARCHAR(25),
@AutoUpdateIsNameField_fc42f1e9b56d BIT,
@AutoUpdateDefaultInView_fc42f1e9b56d BIT,
@AutoUpdateCategory_fc42f1e9b56d BIT,
@AutoUpdateDisplayName_fc42f1e9b56d BIT,
@AutoUpdateIncludeInUserSearchAPI_fc42f1e9b56d BIT,
@Encrypt_fc42f1e9b56d BIT,
@EncryptionKeyID_fc42f1e9b56d UNIQUEIDENTIFIER,
@AllowDecryptInAPI_fc42f1e9b56d BIT,
@SendEncryptedValue_fc42f1e9b56d BIT,
@IsSoftPrimaryKey_fc42f1e9b56d BIT,
@IsSoftForeignKey_fc42f1e9b56d BIT,
@RelatedEntityJoinFields_fc42f1e9b56d NVARCHAR(MAX),
@JSONType_fc42f1e9b56d NVARCHAR(255),
@JSONTypeIsArray_fc42f1e9b56d BIT,
@JSONTypeDefinition_fc42f1e9b56d NVARCHAR(MAX),
@UserSearchPredicateAPI_fc42f1e9b56d NVARCHAR(20),
@AutoUpdateUserSearchPredicate_fc42f1e9b56d BIT,
@AutoUpdateFullTextSearch_fc42f1e9b56d BIT,
@AutoUpdateExtendedType_fc42f1e9b56d BIT,
@IsComputed_fc42f1e9b56d BIT,
@EmbeddedRecord_fc42f1e9b56d NVARCHAR(MAX),
@Configuration_fc42f1e9b56d NVARCHAR(MAX),
@ID_fc42f1e9b56d UNIQUEIDENTIFIER
SET
  @DisplayName_fc42f1e9b56d = N'Status'
SET
  @Description_fc42f1e9b56d = N'Lifecycle status: Draft, Published, or Closed'
SET
  @AutoUpdateDescription_fc42f1e9b56d = 1
SET
  @IsPrimaryKey_fc42f1e9b56d = 0
SET
  @IsUnique_fc42f1e9b56d = 0
SET
  @Category_fc42f1e9b56d = N'Form Information'
SET
  @ValueListType_fc42f1e9b56d = N'List'
SET
  @DefaultInView_fc42f1e9b56d = 1
SET
  @DefaultColumnWidth_fc42f1e9b56d = 150
SET
  @AllowUpdateAPI_fc42f1e9b56d = 1
SET
  @AllowUpdateInView_fc42f1e9b56d = 1
SET
  @IncludeInUserSearchAPI_fc42f1e9b56d = 0
SET
  @FullTextSearchEnabled_fc42f1e9b56d = 0
SET
  @IncludeInGeneratedForm_fc42f1e9b56d = 1
SET
  @GeneratedFormSection_fc42f1e9b56d = N'Category'
SET
  @IsNameField_fc42f1e9b56d = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_fc42f1e9b56d = 0
SET
  @RelatedEntityDisplayType_fc42f1e9b56d = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_fc42f1e9b56d = 1
SET
  @ValuesToPackWithSchema_fc42f1e9b56d = N'Auto'
SET
  @Status_fc42f1e9b56d = N'Active'
SET
  @AutoUpdateIsNameField_fc42f1e9b56d = 1
SET
  @AutoUpdateDefaultInView_fc42f1e9b56d = 1
SET
  @AutoUpdateCategory_fc42f1e9b56d = 1
SET
  @AutoUpdateDisplayName_fc42f1e9b56d = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_fc42f1e9b56d = 0
SET
  @Encrypt_fc42f1e9b56d = 0
SET
  @AllowDecryptInAPI_fc42f1e9b56d = 0
SET
  @SendEncryptedValue_fc42f1e9b56d = 0
SET
  @IsSoftPrimaryKey_fc42f1e9b56d = 0
SET
  @IsSoftForeignKey_fc42f1e9b56d = 0
SET
  @JSONTypeIsArray_fc42f1e9b56d = 0
SET
  @UserSearchPredicateAPI_fc42f1e9b56d = N'Exact'
SET
  @AutoUpdateUserSearchPredicate_fc42f1e9b56d = 1
SET
  @AutoUpdateFullTextSearch_fc42f1e9b56d = 1
SET
  @AutoUpdateExtendedType_fc42f1e9b56d = 1
SET
  @IsComputed_fc42f1e9b56d = 0
SET
  @ID_fc42f1e9b56d = '8C879F40-9016-463A-99C5-1BD6495CF3A5' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_fc42f1e9b56d,
  @Description = @Description_fc42f1e9b56d,
  @AutoUpdateDescription = @AutoUpdateDescription_fc42f1e9b56d,
  @IsPrimaryKey = @IsPrimaryKey_fc42f1e9b56d,
  @IsUnique = @IsUnique_fc42f1e9b56d,
  @Category = @Category_fc42f1e9b56d,
  @ValueListType = @ValueListType_fc42f1e9b56d,
  @ExtendedType = @ExtendedType_fc42f1e9b56d,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_fc42f1e9b56d,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_fc42f1e9b56d,
  @ViewCellTemplate = @ViewCellTemplate_fc42f1e9b56d,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_fc42f1e9b56d,
  @AllowUpdateAPI = @AllowUpdateAPI_fc42f1e9b56d,
  @AllowUpdateInView = @AllowUpdateInView_fc42f1e9b56d,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_fc42f1e9b56d,
  @FullTextSearchEnabled = @FullTextSearchEnabled_fc42f1e9b56d,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_fc42f1e9b56d,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_fc42f1e9b56d,
  @GeneratedFormSection = @GeneratedFormSection_fc42f1e9b56d,
  @IsNameField = @IsNameField_fc42f1e9b56d,
  @RelatedEntityID = @RelatedEntityID_fc42f1e9b56d,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_fc42f1e9b56d,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_fc42f1e9b56d,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_fc42f1e9b56d,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_fc42f1e9b56d,
  @EntityIDFieldName = @EntityIDFieldName_fc42f1e9b56d,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_fc42f1e9b56d,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_fc42f1e9b56d,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_fc42f1e9b56d,
  @Status = @Status_fc42f1e9b56d,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_fc42f1e9b56d,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_fc42f1e9b56d,
  @AutoUpdateCategory = @AutoUpdateCategory_fc42f1e9b56d,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_fc42f1e9b56d,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_fc42f1e9b56d,
  @Encrypt = @Encrypt_fc42f1e9b56d,
  @EncryptionKeyID = @EncryptionKeyID_fc42f1e9b56d,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_fc42f1e9b56d,
  @SendEncryptedValue = @SendEncryptedValue_fc42f1e9b56d,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_fc42f1e9b56d,
  @IsSoftForeignKey = @IsSoftForeignKey_fc42f1e9b56d,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_fc42f1e9b56d,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_fc42f1e9b56d,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_fc42f1e9b56d,
  @JSONTypeDefinition = @JSONTypeDefinition_fc42f1e9b56d,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_fc42f1e9b56d,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_fc42f1e9b56d,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_fc42f1e9b56d,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_fc42f1e9b56d,
  @IsComputed = @IsComputed_fc42f1e9b56d,
  @EmbeddedRecord = @EmbeddedRecord_fc42f1e9b56d,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_fc42f1e9b56d,
  @Configuration_Clear = 1,
  @ID = @ID_fc42f1e9b56d;

GO


-- End of SQL Logging Session
-- Session ID: 1d5c9780-ac23-4661-8fea-1159dc3114a2
-- Completed: 2026-09-18T18:45:48.255Z
-- Duration: 3803ms
-- Total Statements: 24
