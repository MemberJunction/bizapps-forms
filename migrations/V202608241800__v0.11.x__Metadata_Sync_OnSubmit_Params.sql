-- =============================================================================
-- Metadata delta: the on-submit parameters on the two authoring actions
--
-- Adds `OnSubmitMode` and `Automations` to `Forms: Generate Form From Brief` and
-- `Forms: Create Form From Template`, so a form created programmatically can declare what runs on
-- submit instead of inheriting the four legacy hooks (bizapps-forms#47).
--
-- WHY THIS ONE IS HAND-WRITTEN. Seed deltas are normally the output of
-- `mj sync push --dir metadata --exclude users` with the substitutions in migrations/README.md
-- applied. That push needs a database with MJ and both sibling Open Apps installed, and this
-- change was authored without one. Four ActionParam creates are mechanical enough to write by hand
-- against the shape of the generated blocks in `V202608081700__v0.8.x__Metadata_Sync.sql`, and
-- `metadata/actions/.actions.json` carries the same four records with the same ids, so the next
-- real push diffs to nothing rather than re-creating them.
--
-- WHY THE IDS SKIP 03 AND 04. `7F0B0001-…-000000000003` and `…04` are already `InputMode` and
-- `SessionID` on `Forms: Generate Form From Brief` — added by work that is not on `next`, and found
-- only by dry-running this file against a real database. The hardcoded-id convention hands out a
-- shared ordinal space with no registry, so the next author faces the same trap: CHECK THE TARGET
-- before picking, rather than counting the rows in this repo.
--
-- TWO OUTCOMES, DELIBERATELY DIFFERENT. A param that already exists as (ActionID, Name) is skipped
-- silently — that is a re-run or a host that installed this before, and halting there is the #39
-- failure mode that cost a release. But an id already held by a DIFFERENT record is an authoring
-- collision, and it RAISES: skipping would mean this parameter is never created, on that host,
-- with the migration reporting success — the silent no-op this whole change exists to remove. That
-- error means "pick a free id", not "re-run me".
--
-- Every block is self-contained: `GO` ends the batch, so a variable declared above one is not in
-- scope below it.
-- =============================================================================

-- Forms: Generate Form From Brief -> OnSubmitMode
IF EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
           WHERE ID = '7F0B0001-A1B2-4C3D-8E4F-000000000005' AND NOT (ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'OnSubmitMode'))
BEGIN
    RAISERROR(N'V202608241800: ActionParam id 7F0B0001-A1B2-4C3D-8E4F-000000000005 is already held by a different record, so "OnSubmitMode" cannot be created with it. Pick a free id in the 7F0B space and update migrations/ and metadata/actions/.actions.json together.', 16, 1);
END
ELSE IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
                    WHERE ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'OnSubmitMode')
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0001-A1B2-4C3D-8E4F-000000000005',
        @ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001',
        @Name = N'OnSubmitMode',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Scalar',
        @IsArray = 0,
        @Description = N'Whether this form''s own automations are what run on submit (''Legacy'' or ''Configured''). ''Configured'' with no Automations is the supported way to run NOTHING - how a caller that owns its own subject identity declines Forms: Upsert Respondent Person. Omit to keep the historical behaviour.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO

-- Forms: Generate Form From Brief -> Automations
IF EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
           WHERE ID = '7F0B0001-A1B2-4C3D-8E4F-000000000006' AND NOT (ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'Automations'))
BEGIN
    RAISERROR(N'V202608241800: ActionParam id 7F0B0001-A1B2-4C3D-8E4F-000000000006 is already held by a different record, so "Automations" cannot be created with it. Pick a free id in the 7F0B space and update migrations/ and metadata/actions/.actions.json together.', 16, 1);
END
ELSE IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
                    WHERE ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'Automations')
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0001-A1B2-4C3D-8E4F-000000000006',
        @ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001',
        @Name = N'Automations',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Simple Object',
        @IsArray = 1,
        @Description = N'The on-submit steps this form runs, in order, each naming an MJ Action (for example [{"actionName":"Forms: Send Confirmation Email"}]). Supplying this implies OnSubmitMode=''Configured'', and supplying it alongside ''Legacy'' is an error rather than a silently ignored list. An Action name this deployment does not have is an error, not a skipped step.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO

-- Forms: Create Form From Template -> OnSubmitMode
IF EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
           WHERE ID = '7F0B0002-A1B2-4C3D-8E4F-000000000005' AND NOT (ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'OnSubmitMode'))
BEGIN
    RAISERROR(N'V202608241800: ActionParam id 7F0B0002-A1B2-4C3D-8E4F-000000000005 is already held by a different record, so "OnSubmitMode" cannot be created with it. Pick a free id in the 7F0B space and update migrations/ and metadata/actions/.actions.json together.', 16, 1);
END
ELSE IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
                    WHERE ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'OnSubmitMode')
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0002-A1B2-4C3D-8E4F-000000000005',
        @ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002',
        @Name = N'OnSubmitMode',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Scalar',
        @IsArray = 0,
        @Description = N'Whether this form''s own automations are what run on submit (''Legacy'' or ''Configured''). ''Configured'' with no Automations is the supported way to run NOTHING - how a caller that owns its own subject identity declines Forms: Upsert Respondent Person. Omit to keep the historical behaviour.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO

-- Forms: Create Form From Template -> Automations
IF EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
           WHERE ID = '7F0B0002-A1B2-4C3D-8E4F-000000000006' AND NOT (ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'Automations'))
BEGIN
    RAISERROR(N'V202608241800: ActionParam id 7F0B0002-A1B2-4C3D-8E4F-000000000006 is already held by a different record, so "Automations" cannot be created with it. Pick a free id in the 7F0B space and update migrations/ and metadata/actions/.actions.json together.', 16, 1);
END
ELSE IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
                    WHERE ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'Automations')
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0002-A1B2-4C3D-8E4F-000000000006',
        @ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002',
        @Name = N'Automations',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Simple Object',
        @IsArray = 1,
        @Description = N'The on-submit steps this form runs, in order, each naming an MJ Action (for example [{"actionName":"Forms: Send Confirmation Email"}]). Supplying this implies OnSubmitMode=''Configured'', and supplying it alongside ''Legacy'' is an error rather than a silently ignored list. An Action name this deployment does not have is an error, not a skipped step.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO
