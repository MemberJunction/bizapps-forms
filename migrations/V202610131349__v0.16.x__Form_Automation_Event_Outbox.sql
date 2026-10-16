-- =============================================================================================
-- MJ Forms v0.16.x — the on-submit automation outbox (#303)
-- =============================================================================================
-- WHY. A submitted response's automations must run even if the process that saved it dies a
-- millisecond later. The submit path used to fire them on a detached promise, which a restart lost
-- for good. The response and the work it owes now commit TOGETHER: the submit transaction inserts
-- one `FormAutomationEvent` row per owed run (one per final submit; one per partial save of a
-- version with OnPartial steps), and a drain claims and runs those rows after commit — at once,
-- from the submitting process, and every 30 seconds from a scheduled job as the safety net.
--
-- WHY A TABLE OF ITS OWN, not pending `FormAutomationRun` rows: `FormAutomationRun.FormAutomationID`
-- is NOT NULL, so a form that runs the four legacy on-submit hooks has no automation row to name, and
-- which steps fire is decided from the published snapshot AFTER the save. One event per save is what
-- the transaction can write without deciding any of that.
--
-- SHAPE.
--   * `Status` is the claim state machine: Pending → Running → Complete, or back to Pending with a
--     later `NextAttemptAt` (retry), or DeadLetter (a final submit that cannot succeed) / Abandoned
--     (a partial save that cannot; it must never block the final behind it).
--   * `LockedBy` / `LockedUntil` are the lease: a run in flight renews it, a drain that dies mid-run
--     leaves a Running row whose lease expires, and the next drain reclaims it. Settling and renewing
--     are fenced on `LockedBy`.
--   * `IsReplay` is set by an operator who re-queues a DeadLetter event, so the run reopens the
--     steps that dead-lettering closed.
--   * `UQ_FormAutomationEvent_Final`: a response completes once, so it owes at most one OnComplete
--     event. The submit path writes one only for the save that newly completed the row, so the
--     index firing means that invariant broke: the save is refused and its transaction rolls back.
--   * `IX_FormAutomationEvent_Due` serves the claim's `Status` + `NextAttemptAt` scan.
--   * `FormAutomationRun.FormAutomationEventID`: the event a run belongs to — a run is the step's
--     idempotency record, so a re-run of the same event re-runs only steps with no terminal run for
--     it. NULL on runs written before this column. A real foreign key: an event is never purged
--     before the runs that name it.
--
-- PostgreSQL: no twin. `migrations-pg/` is a converted mirror that stops at v0.8.x (its README).
-- =============================================================================================

CREATE TABLE [${flyway:defaultSchema}].[FormAutomationEvent] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [FormResponseID] UNIQUEIDENTIFIER NOT NULL,
    [Trigger] NVARCHAR(20) NOT NULL,
    [PartialSaveKey] NVARCHAR(64) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [AttemptCount] INT NOT NULL DEFAULT 0,
    [NextAttemptAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [LockedBy] NVARCHAR(100) NULL,
    [LockedUntil] DATETIMEOFFSET NULL,
    [IsReplay] BIT NOT NULL DEFAULT 0,
    [LastError] NVARCHAR(MAX) NULL,
    [CompletedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_FormAutomationEvent] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_FormAutomationEvent_Response] FOREIGN KEY ([FormResponseID]) REFERENCES [${flyway:defaultSchema}].[FormResponse]([ID]),
    CONSTRAINT [CK_FormAutomationEvent_Trigger] CHECK ([Trigger] IN ('OnComplete', 'OnPartial')),
    CONSTRAINT [CK_FormAutomationEvent_Status] CHECK ([Status] IN ('Pending', 'Running', 'Complete', 'DeadLetter', 'Abandoned')),
    CONSTRAINT [CK_FormAutomationEvent_PartialSaveKey] CHECK (([Trigger] = 'OnPartial' AND [PartialSaveKey] IS NOT NULL) OR ([Trigger] = 'OnComplete' AND [PartialSaveKey] IS NULL))
);
GO

CREATE UNIQUE INDEX [UQ_FormAutomationEvent_Final]
    ON [${flyway:defaultSchema}].[FormAutomationEvent] ([FormResponseID])
    WHERE [Trigger] = 'OnComplete';
GO

CREATE INDEX [IX_FormAutomationEvent_Due]
    ON [${flyway:defaultSchema}].[FormAutomationEvent] ([Status], [NextAttemptAt])
    INCLUDE ([FormResponseID], [LockedUntil]);
GO

ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun]
    ADD [FormAutomationEventID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_FormAutomationRun_Event] REFERENCES [${flyway:defaultSchema}].[FormAutomationEvent]([ID]);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The on-submit automation outbox: one row per run a response save owes (one per final submit, one per partial save of a version with OnPartial steps), written in the save''s own transaction and claimed by the automation drain after commit',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The response whose save owes this run',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'FormResponseID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Which save this event announces, and so which steps it runs: OnComplete (the final submit) or OnPartial (a partial save)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'Trigger';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'OnPartial only: a hash of the answers the partial save stored, so an autosave that changed nothing since the previous partial event queues no second run',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'PartialSaveKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Pending (waiting for a drain), Running (claimed under a lease), Complete, DeadLetter (a final submit that cannot succeed; an operator may re-queue it) or Abandoned (a partial save that cannot; never blocks the final)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How many times a drain has claimed this event; the drain gives up after its attempt cap',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'AttemptCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The earliest time a drain may claim this Pending event: the save time, then later after each retryable failure (exponential backoff)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'NextAttemptAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The drain that holds the current lease; settling the event is refused to any other drain',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'LockedBy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the current lease expires; a Running event past it is reclaimed by the next drain',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'LockedUntil';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Set by an operator who re-queues a DeadLetter event, so its next run reopens the steps dead-lettering closed; cleared when the run settles',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'IsReplay';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why the last attempt did not complete, as a fixed sentence; provider detail goes to the server log only',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'LastError';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the event reached Complete, DeadLetter or Abandoned',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationEvent', @level2type = N'COLUMN', @level2name = N'CompletedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The outbox event whose drain ran this step: the run''s identity for at-least-once delivery. A re-run of the same event re-runs only the steps with no terminal run carrying it, and reuses a step''s open row. NULL on runs written before this column',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'FormAutomationEventID';
GO

-- =============================================================================================
-- CodeGen output (appended)
-- =============================================================================================
-- `npx mj codegen --skipfiles` (MJ 6.1.5) against a clean room built from shipped migrations only
-- (core v6.1.5, bizapps-common and bizapps-tasks heads, Forms through this file), captured on
-- 2026-10-16 after a first CodeGen pass had settled everything this file does not own.
--
-- EDITS to CodeGen's raw output, all of them guards, none changing what a fresh install ends with:
--   1. The entity creation (its Entity row, ApplicationEntity row and three EntityPermission rows)
--      is fenced on the natural key, the V202608191300 shape. `0DBA2EE2-89F7-4120-BD1B-7AA3672B7DEF`
--      is the id CodeGen minted in that room and is the id a fresh install gets.
--   2. Every other reference to that id resolves the entity by natural key into
--      `@FormAutomationEventEntityID`, with a THROW when it is missing (the V202608252340 shape), so
--      a database that minted its own id before this file converges instead of FK-failing (#155).
--   3. The EntityPermission INSERT…SELECT…WHERE NOT EXISTS become IF NOT EXISTS … INSERT … VALUES
--      (same predicate); each EntityFieldValue INSERT is guarded on (EntityFieldID, Value) and each
--      EntityRelationship INSERT on (EntityID, RelatedEntityID, RelatedEntityJoinField) as well as
--      its id (lint:distribution).
-- =============================================================================================

IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormAutomationEvent' AND [SchemaName] = '${flyway:defaultSchema}'
)
BEGIN
/* SQL generated to create new entity MJ_BizApps_Forms: Form Automation Events */

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
         '0dba2ee2-89f7-4120-bd1b-7aa3672b7def',
         'MJ_BizApps_Forms: Form Automation Events',
         'Form Automation Events',
         'The on-submit automation outbox: one row per run a response save owes (one per final submit, one per partial save of a version with OnPartial steps), written in the save''s own transaction and claimed by the automation drain after commit',
         NULL,
         'FormAutomationEvent',
         'vwFormAutomationEvents',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Automation Events to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '0dba2ee2-89f7-4120-bd1b-7aa3672b7def', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Events for role UI */
IF NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
)
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
                VALUES (CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Events for role Developer */
IF NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
)
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
                VALUES (CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Events for role Integration */
IF NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
)
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
                VALUES (CAST('0dba2ee2-89f7-4120-bd1b-7aa3672b7def' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());
END;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
UPDATE [${flyway:defaultSchema}].[FormAutomationEvent] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomationEvent___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
UPDATE [${flyway:defaultSchema}].[FormAutomationEvent] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationEvent */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationEvent] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomationEvent___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

DECLARE @FormAutomationEventEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormAutomationEvent' AND [SchemaName] = '${flyway:defaultSchema}');
IF @FormAutomationEventEntityID IS NULL
    THROW 51304, 'V202610131349: no [Entity] row for FormAutomationEvent in this schema. Run the Forms migrations in order.', 1;
/* SQL text to insert 15 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3b47977c-3e01-4101-b662-344886efe69f' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'FormAutomationEventID')) BEGIN
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
            '3b47977c-3e01-4101-b662-344886efe69f',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'DC399B21-517E-4E71-9571-037AB9E2641E'),
            'FormAutomationEventID',
            'Form Automation Event ID',
            'The outbox event whose drain ran this step: the run''s identity for at-least-once delivery. A re-run of the same event re-runs only the steps with no terminal run carrying it, and reuses a step''s open row. NULL on runs written before this column',
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
            @FormAutomationEventEntityID,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '61adbaca-3e86-47d8-944d-b2bf6ada0d38' OR (EntityID = @FormAutomationEventEntityID AND Name = 'ID')) BEGIN
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
            '61adbaca-3e86-47d8-944d-b2bf6ada0d38',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
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
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5046ac5f-aac6-4723-a481-406bfdcf0937' OR (EntityID = @FormAutomationEventEntityID AND Name = 'FormResponseID')) BEGIN
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
            '5046ac5f-aac6-4723-a481-406bfdcf0937',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'FormResponseID',
            'Form Response ID',
            'The response whose save owes this run',
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
            '63600739-7165-4BDC-B7D7-19A1B1951DFA',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1386313a-63a1-4385-9055-6c140606d69e' OR (EntityID = @FormAutomationEventEntityID AND Name = 'Trigger')) BEGIN
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
            '1386313a-63a1-4385-9055-6c140606d69e',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'Trigger',
            'Trigger',
            'Which save this event announces, and so which steps it runs: OnComplete (the final submit) or OnPartial (a partial save)',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '309a0499-5cb2-47c2-a081-25241fac717b' OR (EntityID = @FormAutomationEventEntityID AND Name = 'PartialSaveKey')) BEGIN
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
            '309a0499-5cb2-47c2-a081-25241fac717b',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'PartialSaveKey',
            'Partial Save Key',
            'OnPartial only: a hash of the answers the partial save stored, so an autosave that changed nothing since the previous partial event queues no second run',
            'nvarchar',
            128,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '190a252a-950f-4bc2-beb1-5f9cb2664b6f' OR (EntityID = @FormAutomationEventEntityID AND Name = 'Status')) BEGIN
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
            '190a252a-950f-4bc2-beb1-5f9cb2664b6f',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'Status',
            'Status',
            'Pending (waiting for a drain), Running (claimed under a lease), Complete, DeadLetter (a final submit that cannot succeed; an operator may re-queue it) or Abandoned (a partial save that cannot; never blocks the final)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b483107a-787e-4cb6-a045-ef5ac23fc58c' OR (EntityID = @FormAutomationEventEntityID AND Name = 'AttemptCount')) BEGIN
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
            'b483107a-787e-4cb6-a045-ef5ac23fc58c',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'AttemptCount',
            'Attempt Count',
            'How many times a drain has claimed this event; the drain gives up after its attempt cap',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3cde442c-7e88-4dfd-8aef-3f028d981132' OR (EntityID = @FormAutomationEventEntityID AND Name = 'NextAttemptAt')) BEGIN
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
            '3cde442c-7e88-4dfd-8aef-3f028d981132',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'NextAttemptAt',
            'Next Attempt At',
            'The earliest time a drain may claim this Pending event: the save time, then later after each retryable failure (exponential backoff)',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b05ba440-9334-46a0-b2f4-7a2188145370' OR (EntityID = @FormAutomationEventEntityID AND Name = 'LockedBy')) BEGIN
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
            'b05ba440-9334-46a0-b2f4-7a2188145370',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'LockedBy',
            'Locked By',
            'The drain that holds the current lease; settling the event is refused to any other drain',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '22c3ccf8-f795-4ad1-abee-77dcd61a0ccf' OR (EntityID = @FormAutomationEventEntityID AND Name = 'LockedUntil')) BEGIN
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
            '22c3ccf8-f795-4ad1-abee-77dcd61a0ccf',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'LockedUntil',
            'Locked Until',
            'When the current lease expires; a Running event past it is reclaimed by the next drain',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '50d87d9d-69df-4be9-b2a2-a78aec00ff08' OR (EntityID = @FormAutomationEventEntityID AND Name = 'IsReplay')) BEGIN
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
            '50d87d9d-69df-4be9-b2a2-a78aec00ff08',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'IsReplay',
            'Is Replay',
            'Set by an operator who re-queues a DeadLetter event, so its next run reopens the steps dead-lettering closed; cleared when the run settles',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f164e6ad-4eaa-429c-8a89-4e7b0580ceff' OR (EntityID = @FormAutomationEventEntityID AND Name = 'LastError')) BEGIN
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
            'f164e6ad-4eaa-429c-8a89-4e7b0580ceff',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'LastError',
            'Last Error',
            'Why the last attempt did not complete, as a fixed sentence; provider detail goes to the server log only',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2ef1c925-0d4a-4f51-acb0-d494f2713682' OR (EntityID = @FormAutomationEventEntityID AND Name = 'CompletedAt')) BEGIN
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
            '2ef1c925-0d4a-4f51-acb0-d494f2713682',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
            'CompletedAt',
            'Completed At',
            'When the event reached Complete, DeadLetter or Abandoned',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '10b51e07-62e4-4329-b492-59468817b771' OR (EntityID = @FormAutomationEventEntityID AND Name = '__mj_CreatedAt')) BEGIN
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
            '10b51e07-62e4-4329-b492-59468817b771',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2803125c-4fa4-47b4-a49c-8353d1651453' OR (EntityID = @FormAutomationEventEntityID AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2803125c-4fa4-47b4-a49c-8353d1651453',
            @FormAutomationEventEntityID, -- Entity: MJ_BizApps_Forms: Form Automation Events
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = @FormAutomationEventEntityID),
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

/* SQL text to insert entity field value with ID bf007d60-4ddf-485a-af6e-df3c8991ea45 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'bf007d60-4ddf-485a-af6e-df3c8991ea45' OR ([EntityFieldID] = '1386313A-63A1-4385-9055-6C140606D69E' AND [Value] = 'OnComplete'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bf007d60-4ddf-485a-af6e-df3c8991ea45', '1386313A-63A1-4385-9055-6C140606D69E', 1, 'OnComplete', 'OnComplete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9a4f0a57-8673-4841-be13-1b7150c58346 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '9a4f0a57-8673-4841-be13-1b7150c58346' OR ([EntityFieldID] = '1386313A-63A1-4385-9055-6C140606D69E' AND [Value] = 'OnPartial'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a4f0a57-8673-4841-be13-1b7150c58346', '1386313A-63A1-4385-9055-6C140606D69E', 2, 'OnPartial', 'OnPartial', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1386313A-63A1-4385-9055-6C140606D69E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='1386313A-63A1-4385-9055-6C140606D69E';

/* SQL text to insert entity field value with ID d0e5a18c-3246-4cc9-9b48-c68b11662fd1 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'd0e5a18c-3246-4cc9-9b48-c68b11662fd1' OR ([EntityFieldID] = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F' AND [Value] = 'Abandoned'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0e5a18c-3246-4cc9-9b48-c68b11662fd1', '190A252A-950F-4BC2-BEB1-5F9CB2664B6F', 1, 'Abandoned', 'Abandoned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 39e0bbed-8d87-4eae-b9e1-3d726ec8bc9f */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = '39e0bbed-8d87-4eae-b9e1-3d726ec8bc9f' OR ([EntityFieldID] = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F' AND [Value] = 'Complete'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('39e0bbed-8d87-4eae-b9e1-3d726ec8bc9f', '190A252A-950F-4BC2-BEB1-5F9CB2664B6F', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b4c10fd4-bd68-43c2-9ee1-5e12b7e05d8c */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'b4c10fd4-bd68-43c2-9ee1-5e12b7e05d8c' OR ([EntityFieldID] = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F' AND [Value] = 'DeadLetter'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4c10fd4-bd68-43c2-9ee1-5e12b7e05d8c', '190A252A-950F-4BC2-BEB1-5F9CB2664B6F', 3, 'DeadLetter', 'DeadLetter', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bcd47f8e-0fe8-4d73-a187-8c08b951a508 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'bcd47f8e-0fe8-4d73-a187-8c08b951a508' OR ([EntityFieldID] = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F' AND [Value] = 'Pending'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bcd47f8e-0fe8-4d73-a187-8c08b951a508', '190A252A-950F-4BC2-BEB1-5F9CB2664B6F', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dacceb44-a087-478a-8778-24de142a6746 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE [ID] = 'dacceb44-a087-478a-8778-24de142a6746' OR ([EntityFieldID] = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F' AND [Value] = 'Running'))
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dacceb44-a087-478a-8778-24de142a6746', '190A252A-950F-4BC2-BEB1-5F9CB2664B6F', 5, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 190A252A-950F-4BC2-BEB1-5F9CB2664B6F */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='190A252A-950F-4BC2-BEB1-5F9CB2664B6F';


/* Create Entity Relationship: MJ_BizApps_Forms: Form Responses -> MJ_BizApps_Forms: Form Automation Events (One To Many via FormResponseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '918a6456-0922-412d-b368-4c925b31e697'
         OR ([EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND [RelatedEntityID] = @FormAutomationEventEntityID AND [RelatedEntityJoinField] = 'FormResponseID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('918a6456-0922-412d-b368-4c925b31e697', '63600739-7165-4BDC-B7D7-19A1B1951DFA', @FormAutomationEventEntityID, 'FormResponseID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Automation Events -> MJ_BizApps_Forms: Form Automation Runs (One To Many via FormAutomationEventID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f9206672-c90e-411c-b224-c972008e44d1'
         OR ([EntityID] = @FormAutomationEventEntityID AND [RelatedEntityID] = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND [RelatedEntityJoinField] = 'FormAutomationEventID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f9206672-c90e-411c-b224-c972008e44d1', @FormAutomationEventEntityID, 'DC399B21-517E-4E71-9571-037AB9E2641E', 'FormAutomationEventID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for FormAutomationEvent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormResponseID in table FormAutomationEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationEvent_FormResponseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationEvent_FormResponseID ON [${flyway:defaultSchema}].[FormAutomationEvent] ([FormResponseID]);

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

-- Index for foreign key FormAutomationEventID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationEventID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationEventID ON [${flyway:defaultSchema}].[FormAutomationRun] ([FormAutomationEventID]);

/* Base View SQL for MJ_BizApps_Forms: Form Automation Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: vwFormAutomationEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Automation Events
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormAutomationEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormAutomationEvents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormAutomationEvents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormAutomationEvents]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FormAutomationEvent] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Automation Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: Permissions for vwFormAutomationEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Automation Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: spCreateFormAutomationEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormAutomationEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormAutomationEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationEvent]
    @ID uniqueidentifier = NULL,
    @FormResponseID uniqueidentifier,
    @Trigger nvarchar(20),
    @PartialSaveKey_Clear bit = 0,
    @PartialSaveKey nvarchar(64) = NULL,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @NextAttemptAt datetimeoffset = NULL,
    @LockedBy_Clear bit = 0,
    @LockedBy nvarchar(100) = NULL,
    @LockedUntil_Clear bit = 0,
    @LockedUntil datetimeoffset = NULL,
    @IsReplay bit = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationEvent]
            (
                [ID],
                [FormResponseID],
                [Trigger],
                [PartialSaveKey],
                [Status],
                [AttemptCount],
                [NextAttemptAt],
                [LockedBy],
                [LockedUntil],
                [IsReplay],
                [LastError],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormResponseID,
                @Trigger,
                CASE WHEN @PartialSaveKey_Clear = 1 THEN NULL ELSE ISNULL(@PartialSaveKey, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                ISNULL(@NextAttemptAt, sysdatetimeoffset()),
                CASE WHEN @LockedBy_Clear = 1 THEN NULL ELSE ISNULL(@LockedBy, NULL) END,
                CASE WHEN @LockedUntil_Clear = 1 THEN NULL ELSE ISNULL(@LockedUntil, NULL) END,
                ISNULL(@IsReplay, 0),
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationEvent]
            (
                [FormResponseID],
                [Trigger],
                [PartialSaveKey],
                [Status],
                [AttemptCount],
                [NextAttemptAt],
                [LockedBy],
                [LockedUntil],
                [IsReplay],
                [LastError],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormResponseID,
                @Trigger,
                CASE WHEN @PartialSaveKey_Clear = 1 THEN NULL ELSE ISNULL(@PartialSaveKey, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                ISNULL(@NextAttemptAt, sysdatetimeoffset()),
                CASE WHEN @LockedBy_Clear = 1 THEN NULL ELSE ISNULL(@LockedBy, NULL) END,
                CASE WHEN @LockedUntil_Clear = 1 THEN NULL ELSE ISNULL(@LockedUntil, NULL) END,
                ISNULL(@IsReplay, 0),
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormAutomationEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Automation Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Automation Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: spUpdateFormAutomationEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormAutomationEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormAutomationEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationEvent]
    @ID uniqueidentifier,
    @FormResponseID uniqueidentifier = NULL,
    @Trigger nvarchar(20) = NULL,
    @PartialSaveKey_Clear bit = 0,
    @PartialSaveKey nvarchar(64) = NULL,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @NextAttemptAt datetimeoffset = NULL,
    @LockedBy_Clear bit = 0,
    @LockedBy nvarchar(100) = NULL,
    @LockedUntil_Clear bit = 0,
    @LockedUntil datetimeoffset = NULL,
    @IsReplay bit = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationEvent]
    SET
        [FormResponseID] = ISNULL(@FormResponseID, [FormResponseID]),
        [Trigger] = ISNULL(@Trigger, [Trigger]),
        [PartialSaveKey] = CASE WHEN @PartialSaveKey_Clear = 1 THEN NULL ELSE ISNULL(@PartialSaveKey, [PartialSaveKey]) END,
        [Status] = ISNULL(@Status, [Status]),
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [NextAttemptAt] = ISNULL(@NextAttemptAt, [NextAttemptAt]),
        [LockedBy] = CASE WHEN @LockedBy_Clear = 1 THEN NULL ELSE ISNULL(@LockedBy, [LockedBy]) END,
        [LockedUntil] = CASE WHEN @LockedUntil_Clear = 1 THEN NULL ELSE ISNULL(@LockedUntil, [LockedUntil]) END,
        [IsReplay] = ISNULL(@IsReplay, [IsReplay]),
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormAutomationEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormAutomationEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormAutomationEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormAutomationEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormAutomationEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormAutomationEvent
ON [${flyway:defaultSchema}].[FormAutomationEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationEvent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormAutomationEvent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Automation Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationEvent] TO [cdp_Developer], [cdp_Integration];

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
    @FormAutomationEventID_Clear bit = 0,
    @FormAutomationEventID uniqueidentifier = NULL
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
                [FormAutomationEventID]
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
                CASE WHEN @FormAutomationEventID_Clear = 1 THEN NULL ELSE ISNULL(@FormAutomationEventID, NULL) END
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
                [FormAutomationEventID]
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
                CASE WHEN @FormAutomationEventID_Clear = 1 THEN NULL ELSE ISNULL(@FormAutomationEventID, NULL) END
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
    @FormAutomationEventID_Clear bit = 0,
    @FormAutomationEventID uniqueidentifier = NULL
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
        [FormAutomationEventID] = CASE WHEN @FormAutomationEventID_Clear = 1 THEN NULL ELSE ISNULL(@FormAutomationEventID, [FormAutomationEventID]) END
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

/* spDelete SQL for MJ_BizApps_Forms: Form Automation Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Events
-- Item: spDeleteFormAutomationEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormAutomationEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormAutomationEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormAutomationEvent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Automation Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationEvent] TO [cdp_Developer], [cdp_Integration];

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
DECLARE @FormAutomationEventEntityID UNIQUEIDENTIFIER = (
    SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity]
    WHERE [BaseTable] = 'FormAutomationEvent' AND [SchemaName] = '${flyway:defaultSchema}');
IF @FormAutomationEventEntityID IS NULL
    THROW 51304, 'V202610131349: no [Entity] row for FormAutomationEvent in this schema. Run the Forms migrations in order.', 1;
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Automation Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B483107A-787E-4CB6-A045-EF5AC23FC58C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F164E6AD-4EAA-429C-8A89-4E7B0580CEFF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2EF1C925-0D4A-4F51-ACB0-D494F2713682'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = @FormAutomationEventEntityID
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.FormAutomationEventID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Automation Event'
WHERE 
   ID = '3B47977C-3E01-4101-B662-344886EFE69F';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '61ADBACA-3E86-47D8-944D-B2BF6ADA0D38';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.FormResponseID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Response'
WHERE 
   ID = '5046AC5F-AAC6-4723-A481-406BFDCF0937';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.Trigger 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1386313A-63A1-4385-9055-6C140606D69E';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.PartialSaveKey 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '309A0499-5CB2-47C2-A081-25241FAC717B';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '190A252A-950F-4BC2-BEB1-5F9CB2664B6F';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.AttemptCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B483107A-787E-4CB6-A045-EF5AC23FC58C';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.NextAttemptAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3CDE442C-7E88-4DFD-8AEF-3F028D981132';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.LockedBy 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B05BA440-9334-46A0-B2F4-7A2188145370';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.LockedUntil 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '22C3CCF8-F795-4AD1-ABEE-77DCD61A0CCF';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.IsReplay 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '50D87D9D-69DF-4BE9-B2A2-A78AEC00FF08';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.LastError 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F164E6AD-4EAA-429C-8A89-4E7B0580CEFF';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.CompletedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2EF1C925-0D4A-4F51-ACB0-D494F2713682';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '10B51E07-62E4-4329-B492-59468817B771';

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Events.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2803125C-4FA4-47B4-A49C-8353D1651453';

/* Set entity icon to fa fa-tasks */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = @FormAutomationEventEntityID;

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = @FormAutomationEventEntityID AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('65cccc39-68cc-565e-9f2a-9a9b9f08152d', @FormAutomationEventEntityID, 'FieldCategoryInfo', '{
  "Automation Context": {
    "description": "Core identification and trigger context for the automation event",
    "icon": "fa fa-info-circle"
  },
  "Execution Status": {
    "description": "Runtime state, retry tracking, and completion details",
    "icon": "fa fa-sync-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = @FormAutomationEventEntityID AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4d1f13c5-228c-52af-80cd-0dc4cc9d8f4d', @FormAutomationEventEntityID, 'FieldCategoryIcons', '{
  "Automation Context": "fa fa-info-circle",
  "Execution Status": "fa fa-sync-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = @FormAutomationEventEntityID;

