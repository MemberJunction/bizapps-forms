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
-- GUARDED, WHERE THE GENERATOR IS NOT. `spCreateActionParam` is a bare INSERT. The generator can
-- afford that because it only emits records it has just diffed against the target; a hand-written
-- delta has diffed nothing. An unguarded insert on a host that already has one of these fails and
-- HALTS THE CHAIN — the #39 failure mode, which cost a release. Each guard keys on the id AND on
-- the (action, name) pair, because either colliding is enough to fail the insert.
--
-- Every block is self-contained: `GO` ends the batch, so a variable declared above one is not in
-- scope below it, and a shared DECLARE at the top would be silently out of scope for three of the
-- four inserts.
--
-- Ids follow this repo's convention: 7F0B<action-ordinal>-A1B2-4C3D-8E4F-0000000000<param-ordinal>.
-- =============================================================================

-- Forms: Generate Form From Brief -> OnSubmitMode
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE ID = '7F0B0001-A1B2-4C3D-8E4F-000000000003'
                  OR (ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'OnSubmitMode'))
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0001-A1B2-4C3D-8E4F-000000000003',
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
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE ID = '7F0B0001-A1B2-4C3D-8E4F-000000000004'
                  OR (ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001' AND Name = N'Automations'))
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0001-A1B2-4C3D-8E4F-000000000004',
        @ActionID = '7F0A0001-A1B2-4C3D-8E4F-000000000001',
        @Name = N'Automations',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Simple Object',
        @IsArray = 1,
        @Description = N'The on-submit steps this form runs, in order, each naming an MJ Action (for example [{"actionName":"Forms: Send Confirmation Email"}]). Supplying this implies OnSubmitMode=''Configured''. An Action name this deployment does not have is an error, not a skipped step.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO

-- Forms: Create Form From Template -> OnSubmitMode
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE ID = '7F0B0002-A1B2-4C3D-8E4F-000000000003'
                  OR (ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'OnSubmitMode'))
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0002-A1B2-4C3D-8E4F-000000000003',
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
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[ActionParam]
               WHERE ID = '7F0B0002-A1B2-4C3D-8E4F-000000000004'
                  OR (ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002' AND Name = N'Automations'))
BEGIN
    EXEC [${mjSchema}].spCreateActionParam
        @ID = '7F0B0002-A1B2-4C3D-8E4F-000000000004',
        @ActionID = '7F0A0002-A1B2-4C3D-8E4F-000000000002',
        @Name = N'Automations',
        @DefaultValue = NULL,
        @DefaultValue_Clear = 1,
        @Type = N'Input',
        @ValueType = N'Simple Object',
        @IsArray = 1,
        @Description = N'The on-submit steps this form runs, in order, each naming an MJ Action (for example [{"actionName":"Forms: Send Confirmation Email"}]). Supplying this implies OnSubmitMode=''Configured''. An Action name this deployment does not have is an error, not a skipped step.',
        @IsRequired = 0,
        @MediaModality = NULL,
        @MediaModality_Clear = 1;
END
GO
