-- MJ Forms v0.14.x — the consolidated release metadata seed.
--
-- ONE seed per release (#105). v0.13.x shipped V202609262310; that file is append-only history now
-- and is untouched here. This is a DELTA beside it, and it folds in no retired per-PR seed — there
-- were none outstanding. `npm run check:seed-cadence` asked for it: one record file moved since
-- v0.13.1, metadata/entity-permissions/.entity-permissions.json, which gained the three
-- `Forms Automation Runner` grants of #269 (metadata/users/README.md also moved; it is prose, not a
-- record, and the check does not count it).
--
-- WHY THIS FILE CARRIES NONE OF THOSE THREE. They already ship, under the SAME ids, in the feature
-- migration V202609280149__v0.14.x__Automation_Runner_Indirect_Write_Grants.sql, which has to carry
-- them itself: it skips a grant with a PRINT when its sibling entity is absent, and widens an
-- existing row without lowering anything an operator granted — neither of which a push can express.
-- The push against a database that ran that migration reported
--   metadata/entity-permissions — 27 records, no changes
-- which is the proof that the migration writes exactly what metadata/ declares. Coverage agrees:
-- `npm run check:release-seed` finds all three ids in shipped SQL. So the delta a push owes for this
-- release is empty, and this file is that delta, generated rather than asserted.
--
-- GENERATED AGAINST THE SHIPPED CHAIN AT HEAD. MJ_Forms_SeedGen_v0140 is the v0.12.0 generation
-- baseline (/var/opt/mssql/data/seedgen_v0120.bak: migrations-only, zero business rows) migrated to
-- what a host installing today holds: core __mj at MJ 6.1.4's frontier 202609191819, bizapps-common
-- at v5.47.0 (202609282100), bizapps-tasks at v1.6.1 (202609202350), Forms at head 202609280149.
-- No unreleased seed had to be held back — v0.13.1 released every seed in the tree.
-- Pushed with the PINNED CLI (@memberjunction/cli 6.1.4, installed disposably), not the workspace
-- `mj`, which links MJ source.
--
-- WHY THE spUpdateUserView IS HERE, and why it is the only statement. It writes the All Forms view
-- back with the values it already has; all four earlier seeds carry exactly one for the same reason,
-- and it is a generator artifact rather than a change. It is kept rather than hand-deleted because
-- editing generated output by hand is how a seed stops matching what a push produces. The push also
-- reported one template and one application as "updated": those wrote no SQL — they were
-- `lastModified`/`checksum` writebacks into metadata/ sync blocks, which ship nowhere.
--
-- THE SUBSTITUTION. The one core SP call was written as ${flyway:defaultSchema} and is rewritten to
-- ${mjSchema}. There is no non-EXEC site: nothing below is prose that names a schema.



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


