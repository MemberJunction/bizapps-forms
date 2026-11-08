-- Guarded-write stored procedures for a roles-only MJAPI login (#338).
--
-- WHY THIS EXISTS. MJ grants its runtime roles (cdp_Developer, cdp_Integration, cdp_UI) SELECT on
-- views and EXECUTE on stored procedures, and never table-level rights. Six code paths in
-- packages/CoreEntitiesServer/src ran raw SQL straight against Forms base tables: the distribution
-- response-slot UPDATE and the Form quota lock (submission/quota.ts), the FormResponse row lock
-- (submission/persistence.ts), the OnPartial bring-forward (automation/outbox/enqueue.ts), the
-- outbox claim / settle / renew / replay (automation/outbox/claim.ts), and the locked re-read of a
-- distribution's server columns (magic-link/FormDistributionEntityServer.ts). On a host whose MJAPI
-- login is a member of the data roles rather than db_owner, every one of them is refused ("The
-- UPDATE permission was denied on the object ..."), so no response can be submitted and no
-- automation can run. Same defect and remedy as MJ's own spConsumeMagicLinkInvite (#4753) and the
-- task-graph claim procs (#4575): one hand-written procedure per raw statement.
--
-- WHAT IS PRESERVED. Each procedure is the SQL Server statement it replaces, verbatim, with
-- parameters where the TypeScript quoted literals. The only addition is the settle guard: a
-- 'Pending' settle with no @RetryAfterSeconds would write NULL into the NOT NULL NextAttemptAt, so
-- it THROWs instead. The lock procedures (UPDLOCK, HOLDLOCK) still serialise their callers: a lock
-- taken inside EXEC belongs to the calling transaction, so it is held until the caller's submit
-- transaction commits or rolls back, exactly as the inline SELECT's was. The fenced UPDATEs return
-- @@ROWCOUNT as [AffectedRows], the alias the TypeScript already reads.
--
-- NO DYNAMIC SQL, DELIBERATELY. Ownership chaining is what lets an EXECUTE-only caller write the
-- table, and it only covers static statements; sp_executesql would break the chain.
--
-- OUTPUT INTO A TABLE VARIABLE. The claim returns the rows it took through OUTPUT ... INTO
-- @claimed and then reads the variable: CodeGen gives FormAutomationEvent an __mj_UpdatedAt
-- trigger, and SQL Server refuses a bare OUTPUT clause on a table with an enabled trigger.
--
-- GRANTS. cdp_Developer and cdp_Integration, the roles that run MJAPI's server-side writes. Never
-- cdp_UI: these are server-only writes and locks, never something a UI login should run. No grant
-- on any base table — the procedures are the whole point.
--
-- POSTGRESQL. Unchanged: the PostgreSQL branches keep their raw statements, and migrations-pg/
-- gets no counterpart here.
--
-- @codegen-none: procedures only; no table, column, entity or EntityField changes, so CodeGen has nothing to emit.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- submission/quota.ts consumeDistributionSlot: the response-slot compare-and-increment. One row =
-- a slot was taken; zero = the distribution is full (or gone).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormDistributionConsumeResponseSlot];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormDistributionConsumeResponseSlot]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[FormDistribution] SET [ResponseCount] = [ResponseCount] + 1
    WHERE [ID] = @ID
      AND ([MaxResponses] IS NULL OR [ResponseCount] < [MaxResponses]);
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormDistributionConsumeResponseSlot] TO [cdp_Developer], [cdp_Integration];
GO

-- submission/quota.ts formQuotaReached: lock the Form row so concurrent submits count its quota in turn.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormLockRowForQuota];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormLockRowForQuota]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [ID] FROM [${flyway:defaultSchema}].[Form] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormLockRowForQuota] TO [cdp_Developer], [cdp_Integration];
GO

-- submission/persistence.ts lockResponseRow: lock an existing FormResponse before it is adopted.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormResponseLockRow];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormResponseLockRow]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [ID] FROM [${flyway:defaultSchema}].[FormResponse] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormResponseLockRow] TO [cdp_Developer], [cdp_Integration];
GO

-- automation/outbox/enqueue.ts bringWaitingPartialsForward: make this response's backed-off
-- OnPartial events due now, so the post-commit drain clears them ahead of the final.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormAutomationEventBringPartialsForward];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormAutomationEventBringPartialsForward]
    @FormResponseID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[FormAutomationEvent] SET [NextAttemptAt] = SYSDATETIMEOFFSET()
    WHERE [FormResponseID] = @FormResponseID AND [Trigger] = 'OnPartial' AND [Status] = 'Pending' AND [NextAttemptAt] > SYSDATETIMEOFFSET();
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormAutomationEventBringPartialsForward] TO [cdp_Developer], [cdp_Integration];
GO

-- automation/outbox/claim.ts claimStatement: claim up to @BatchSize due events (only
-- @FormResponseID's, when given). READPAST lets two drains skip each other's rows instead of
-- waiting; the NOT EXISTS keeps one response's events in creation order.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormAutomationEventClaim];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormAutomationEventClaim]
    @WorkerID NVARCHAR(100),
    @FormResponseID UNIQUEIDENTIFIER = NULL,
    @BatchSize INT,
    @LeaseSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @claimed TABLE ([ID] UNIQUEIDENTIFIER, [FormResponseID] UNIQUEIDENTIFIER, [Trigger] NVARCHAR(20), [PartialSaveKey] NVARCHAR(64), [AttemptCount] INT, [IsReplay] BIT);
    WITH due AS (
        SELECT TOP (@BatchSize) e.*
        FROM [${flyway:defaultSchema}].[FormAutomationEvent] e WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE ((e.[Status] = 'Pending' AND (e.[AttemptCount] = 0 OR e.[NextAttemptAt] <= SYSDATETIMEOFFSET())) OR (e.[Status] = 'Running' AND e.[LockedUntil] < SYSDATETIMEOFFSET()))
          AND (@FormResponseID IS NULL OR e.[FormResponseID] = @FormResponseID)
          AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[FormAutomationEvent] o WHERE o.[FormResponseID] = e.[FormResponseID] AND o.[Status] IN ('Pending', 'Running') AND (o.[__mj_CreatedAt] < e.[__mj_CreatedAt] OR (o.[__mj_CreatedAt] = e.[__mj_CreatedAt] AND o.[ID] < e.[ID])))
        ORDER BY e.[__mj_CreatedAt], e.[ID]
    )
    UPDATE due
    SET [Status] = 'Running', [LockedBy] = @WorkerID, [LockedUntil] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET()),
        [AttemptCount] = [AttemptCount] + 1, [__mj_UpdatedAt] = SYSDATETIMEOFFSET()
    OUTPUT inserted.[ID], inserted.[FormResponseID], inserted.[Trigger], inserted.[PartialSaveKey], inserted.[AttemptCount], inserted.[IsReplay]
    INTO @claimed;
    SELECT [ID], [FormResponseID], [Trigger], [PartialSaveKey], [AttemptCount], [IsReplay] FROM @claimed;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormAutomationEventClaim] TO [cdp_Developer], [cdp_Integration];
GO

-- automation/outbox/claim.ts settleEvent: how a drain leaves an event it held, fenced on its
-- lease. The TypeScript's `status === 'Pending'` branches are the CASE arms: a retry gets a new
-- NextAttemptAt and no CompletedAt, and a replay stays marked across a retry (if its first attempt
-- retries before any step ran, the next attempt must still reopen the steps the dead letter
-- closed).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormAutomationEventSettle];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormAutomationEventSettle]
    @ID UNIQUEIDENTIFIER,
    @WorkerID NVARCHAR(100),
    @Status NVARCHAR(20),
    @LastError NVARCHAR(MAX) = NULL,
    @RetryAfterSeconds INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    -- Not in the TypeScript, where the type makes it impossible: here a NULL would reach the
    -- NOT NULL NextAttemptAt and fail as an opaque constraint error.
    IF @Status = 'Pending' AND @RetryAfterSeconds IS NULL
    BEGIN
        DECLARE @message NVARCHAR(400) = CONCAT(N'Settling automation event ', CONVERT(NVARCHAR(36), @ID), N' as Pending needs @RetryAfterSeconds; got NULL.');
        THROW 50000, @message, 1;
    END;
    UPDATE [${flyway:defaultSchema}].[FormAutomationEvent]
    SET [Status] = @Status,
        [NextAttemptAt] = CASE WHEN @Status = 'Pending' THEN DATEADD(SECOND, @RetryAfterSeconds, SYSDATETIMEOFFSET()) ELSE [NextAttemptAt] END,
        [LastError] = @LastError,
        [CompletedAt] = CASE WHEN @Status = 'Pending' THEN NULL ELSE SYSDATETIMEOFFSET() END,
        [LockedBy] = NULL, [LockedUntil] = NULL,
        [IsReplay] = CASE WHEN @Status = 'Pending' THEN [IsReplay] ELSE 0 END,
        [__mj_UpdatedAt] = SYSDATETIMEOFFSET()
    WHERE [ID] = @ID AND [Status] = 'Running' AND [LockedBy] = @WorkerID;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormAutomationEventSettle] TO [cdp_Developer], [cdp_Integration];
GO

-- automation/outbox/claim.ts renewLease: push this worker's lease out again, fenced on the lease.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormAutomationEventRenewLease];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormAutomationEventRenewLease]
    @ID UNIQUEIDENTIFIER,
    @WorkerID NVARCHAR(100),
    @LeaseSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[FormAutomationEvent] SET [LockedUntil] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET())
    WHERE [ID] = @ID AND [Status] = 'Running' AND [LockedBy] = @WorkerID;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormAutomationEventRenewLease] TO [cdp_Developer], [cdp_Integration];
GO

-- automation/outbox/claim.ts replayDeadLetteredEvent: re-queue a dead letter for one more run.
-- No drain holds it, so the fence is Status = 'DeadLetter': of two racing replays, one wins.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormAutomationEventReplay];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormAutomationEventReplay]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[FormAutomationEvent]
    SET [Status] = 'Pending', [AttemptCount] = 0, [IsReplay] = 1,
        [NextAttemptAt] = SYSDATETIMEOFFSET(), [LastError] = NULL, [CompletedAt] = NULL, [__mj_UpdatedAt] = SYSDATETIMEOFFSET()
    WHERE [ID] = @ID AND [Status] = 'DeadLetter';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormAutomationEventReplay] TO [cdp_Developer], [cdp_Integration];
GO

-- magic-link/FormDistributionEntityServer.ts readStoredServerColumnsLocked: lock the distribution
-- row and re-read the server-owned columns a save must not let a client overwrite.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFormDistributionReadServerColumnsLocked];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFormDistributionReadServerColumnsLocked]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [MagicLinkInviteID], [PublicLinkToken], [ResponseCount] FROM [${flyway:defaultSchema}].[FormDistribution] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFormDistributionReadServerColumnsLocked] TO [cdp_Developer], [cdp_Integration];
GO
