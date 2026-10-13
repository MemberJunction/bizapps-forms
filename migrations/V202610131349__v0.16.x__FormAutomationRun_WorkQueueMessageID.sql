-- =============================================================================================
-- MJ Forms v0.16.x — which Work Queue message a FormAutomationRun ran for (#303)
-- =============================================================================================
-- Approved by the user on 2026-10-13 (spec #303, Out of scope: one of the two columns allowed).
--
-- WHY. A submitted response's automations run from MJ's durable work queue: one
-- `forms.response-submitted` message per final submit, and one per partial save of a version with
-- OnPartial steps. Delivery is at least once, so a redelivered message must not repeat a step that
-- already finished FOR THAT MESSAGE. A run row is the step's idempotency record; to be one it must
-- say which message it belongs to. Without a column the handler could only infer it by time (rows
-- created since the message was published), which misattributes rows across saves of one response:
-- partial save P1 delivered after P2 was published made P2 skip the OnPartial steps P1 ran, and a
-- partial delivery in flight at completion made the final skip an OnCompleteOrPartial step.
-- With this column a run belongs to a message's event iff the two ids are equal.
--
-- SHAPE.
--   * UNIQUEIDENTIFIER, the type of MJ's `WorkQueueMessage.ID` (= the envelope's `MessageID`).
--   * NULL: rows written before this column, and rows the submit path writes inline (no message),
--     belong to no event — which is exactly how the handler treats them.
--   * NO foreign key to `${mjSchema}.WorkQueueMessage`: the work queue purges its message rows on a
--     retention schedule, and a run is history that must outlive them. It is an identity, not a
--     reference.
--   * No index and no __mj_ columns: the handler reads a response's runs by `FormResponseID`, which
--     CodeGen already indexes; CodeGen adds the __mj_ columns and FK indexes itself.
--
-- PostgreSQL: no twin. `migrations-pg/` is a converted mirror that stops at v0.8.x (its README);
-- every SQL Server migration since then, this one included, reaches PostgreSQL only when the chain
-- is next converted with `pnpm run mj:migrate:convert`.
-- =============================================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormAutomationRun]')
                 AND name = N'WorkQueueMessageID')
    ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun]
        ADD [WorkQueueMessageID] UNIQUEIDENTIFIER NULL;
GO

-- Through an NVARCHAR(4000) variable, never NVARCHAR(MAX): `sp_addextendedproperty` declares @value
-- as `sql_variant`, which cannot hold a MAX type.
DECLARE @messageColumn NVARCHAR(4000) = N'The Work Queue message (MessageID) whose delivery ran this step: the run''s identity for at-least-once delivery. A redelivery of the same message re-runs only the steps with no terminal run carrying that id, and reuses a step''s open row; a run with a different id belongs to another save of the response. NULL on runs written before this column and on runs the submit path makes inline, which belong to no message. Deliberately not a foreign key: the work queue purges its messages on a retention schedule and this history outlives them.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables  t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description' AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormAutomationRun' AND c.name = N'WorkQueueMessageID')
    EXEC sp_updateextendedproperty @name = N'MS_Description', @value = @messageColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormAutomationRun',
        @level2type = N'COLUMN', @level2name = N'WorkQueueMessageID';
ELSE
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = @messageColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormAutomationRun',
        @level2type = N'COLUMN', @level2name = N'WorkQueueMessageID';
GO


















































-- =============================================================================================
-- CodeGen output (appended) — the column is unwritable without this half
-- =============================================================================================
-- `spCreateFormAutomationRun` / `spUpdateFormAutomationRun` take one parameter per column, so the
-- column above is invisible to the entity layer until they and `vwFormAutomationRuns` are
-- regenerated, and on a host that only ever runs migrations (`mj app install`) no `EntityField`
-- row would exist for it either — `BaseEntity.Set` on a field with no row is a silent no-op, and the
-- dispatcher writes this column on every run it opens.
--
-- `mj codegen --skipfiles` output for this one entity, verbatim, from a run against
-- MJ_Forms303_Edge right after the DDL above was applied (2026-10-13). The `EntityField` INSERT is
-- CodeGen's own natural-key guard (field id OR (EntityID, Name)) with `[Sequence]` computed as
-- MAX+1, so a host that already minted its own row keeps it and a migrations-only host gets one.
-- `DC399B21-517E-4E71-9571-037AB9E2641E` is this repo's shipped id for Form Automation Runs.
--
-- ORDER is V202609121200's: the entity refresh first (so the EntityID resolves), then the INSERT and
-- the regenerated objects, then the two refreshes that update rows which already exist.
-- =============================================================================================

EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema]     @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3417f613-1460-4275-9f06-3231625e5971' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'WorkQueueMessageID')) BEGIN
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
            '3417f613-1460-4275-9f06-3231625e5971',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'DC399B21-517E-4E71-9571-037AB9E2641E'),
            'WorkQueueMessageID',
            'Work Queue Message ID',
            'The Work Queue message (MessageID) whose delivery ran this step: the run''s identity for at-least-once delivery. A redelivery of the same message re-runs only the steps with no terminal run carrying that id, and reuses a step''s open row; a run with a different id belongs to another save of the response. NULL on runs written before this column and on runs the submit path makes inline, which belong to no message. Deliberately not a foreign key: the work queue purges its messages on a retention schedule and this history outlives them.',
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

/* Index for Foreign Keys for FormAutomationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormAutomationID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationID ON [${flyway:defaultSchema}].[FormAutomationRun] ([FormAutomationID]);

-- Index for foreign key FormResponseID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_FormResponseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_FormResponseID ON [${flyway:defaultSchema}].[FormAutomationRun] ([FormResponseID]);

-- Index for foreign key ActionExecutionLogID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_ActionExecutionLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_ActionExecutionLogID ON [${flyway:defaultSchema}].[FormAutomationRun] ([ActionExecutionLogID]);

-- Index for foreign key AIAgentRunID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_AIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_AIAgentRunID ON [${flyway:defaultSchema}].[FormAutomationRun] ([AIAgentRunID]);

/* Base View SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: vwFormAutomationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Automation Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormAutomationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormAutomationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormAutomationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormAutomationRuns]
AS
SELECT
    f.*,
    mjBizAppsFormsFormAutomation_FormAutomationID.[Name] AS [FormAutomation],
    MJActionExecutionLog_ActionExecutionLogID.[Action] AS [ActionExecutionLog],
    MJAIAgentRun_AIAgentRunID.[RunName] AS [AIAgentRun]
FROM
    [${flyway:defaultSchema}].[FormAutomationRun] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FormAutomation] AS mjBizAppsFormsFormAutomation_FormAutomationID
  ON
    [f].[FormAutomationID] = mjBizAppsFormsFormAutomation_FormAutomationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[vwActionExecutionLogs] AS MJActionExecutionLog_ActionExecutionLogID
  ON
    [f].[ActionExecutionLogID] = MJActionExecutionLog_ActionExecutionLogID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[AIAgentRun] AS MJAIAgentRun_AIAgentRunID
  ON
    [f].[AIAgentRunID] = MJAIAgentRun_AIAgentRunID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: Permissions for vwFormAutomationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spCreateFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationRun]
    @ID uniqueidentifier = NULL,
    @FormAutomationID uniqueidentifier,
    @FormResponseID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @OutputSummary_Clear bit = 0,
    @OutputSummary nvarchar(MAX) = NULL,
    @WorkQueueMessageID_Clear bit = 0,
    @WorkQueueMessageID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationRun]
            (
                [ID],
                [FormAutomationID],
                [FormResponseID],
                [Status],
                [AttemptCount],
                [StartedAt],
                [CompletedAt],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [ErrorMessage],
                [OutputSummary],
                [WorkQueueMessageID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormAutomationID,
                @FormResponseID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, NULL) END,
                CASE WHEN @WorkQueueMessageID_Clear = 1 THEN NULL ELSE ISNULL(@WorkQueueMessageID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationRun]
            (
                [FormAutomationID],
                [FormResponseID],
                [Status],
                [AttemptCount],
                [StartedAt],
                [CompletedAt],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [ErrorMessage],
                [OutputSummary],
                [WorkQueueMessageID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormAutomationID,
                @FormResponseID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, NULL) END,
                CASE WHEN @WorkQueueMessageID_Clear = 1 THEN NULL ELSE ISNULL(@WorkQueueMessageID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormAutomationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Automation Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spUpdateFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationRun]
    @ID uniqueidentifier,
    @FormAutomationID uniqueidentifier = NULL,
    @FormResponseID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @OutputSummary_Clear bit = 0,
    @OutputSummary nvarchar(MAX) = NULL,
    @WorkQueueMessageID_Clear bit = 0,
    @WorkQueueMessageID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationRun]
    SET
        [FormAutomationID] = ISNULL(@FormAutomationID, [FormAutomationID]),
        [FormResponseID] = ISNULL(@FormResponseID, [FormResponseID]),
        [Status] = ISNULL(@Status, [Status]),
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ActionExecutionLogID] = CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, [ActionExecutionLogID]) END,
        [AIAgentRunID] = CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, [AIAgentRunID]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [OutputSummary] = CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, [OutputSummary]) END,
        [WorkQueueMessageID] = CASE WHEN @WorkQueueMessageID_Clear = 1 THEN NULL ELSE ISNULL(@WorkQueueMessageID, [WorkQueueMessageID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormAutomationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormAutomationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormAutomationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormAutomationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormAutomationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormAutomationRun
ON [${flyway:defaultSchema}].[FormAutomationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormAutomationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Automation Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spDeleteFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormAutomationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Automation Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

GO

-- The refresh that fills in what the schema knows, for rows that already exist (it creates none).
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase]        @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO
