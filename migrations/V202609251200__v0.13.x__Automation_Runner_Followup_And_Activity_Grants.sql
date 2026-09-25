-- =============================================================================================
-- MJ Forms v0.13.x — let `Forms Automation Runner` run the followup-task and person-activity paths
-- =============================================================================================
-- WHAT WAS WRONG (#239). Two of the four built-in on-submit hooks failed on every real
-- `mj app install` host, and each failure surfaced only as a best-effort per-submit log line.
-- Measured on a clone of such a host (MJ 6.1.1 core, Forms 0.12.0, bizapps-common 5.41,
-- bizapps-tasks 1.4.3):
--
--   1. `Forms: Create Followup Task` failed before writing anything:
--        User forms-automation@localhost.invalid does not have read permissions on
--        MJ_BizApps_Tasks: Task Types
--      and the action then reported the misleading `No TaskType available to assign to the task.`
--      (that swallowed read is fixed in forms-actions in the same release). With Read on Task Types
--      and Create ONLY on Tasks and Task Links, the task and its link to the response are written.
--      Read on Tasks / Task Links is NOT needed — measured with CanRead = 0, it works — so it is
--      not granted.
--
--   2. `Forms: Upsert Respondent Person` creating a Person fires bizapps-common's `People`
--      AfterCreate entity action `Common.LogActivity` (RunMode Durable), as this runner. MJ's
--      durable dispatch (TaskGraphService) first failed with the misleading
--        Task graph ... references 1 unknown action(s): Common.LogActivity
--      because the runner could not read `MJ: Actions`. With that Read it fails truthfully one step
--      later — `Does NOT have permission to Create MJ: Task Types` (the CORE task-graph entities) —
--      and either way MJ then runs the action INLINE ("asked for durable dispatch but ran inline
--      instead"), by design.
--
--   3. The inline `Common.LogActivity` then failed:
--        does not have read permissions on MJ_BizApps_Common: Activity Types
--      With Read on Activity Types, Read + Create on Activities and Create ONLY on Activity Links,
--      the activity and its link to the Person are written (verified with the real bizapps-common
--      5.41 server code).
--
-- WHY EACH FLAG. No Update and no Delete anywhere in this file; nothing on these paths modifies or
-- removes a row it did not just create.
--   MJ_BizApps_Tasks: Task Types        Read    — resolve the required Task.TypeID.
--   MJ_BizApps_Tasks: Tasks             Create  — the followup task itself.
--   MJ_BizApps_Tasks: Task Links        Create  — link the task to the form response.
--   MJ: Actions                         Read    — MJ resolves an entity action BY NAME before it
--                                                 runs it, durable or inline; without Read the
--                                                 action reads as "unknown".
--   MJ_BizApps_Common: Activity Types   Read    — LogActivity resolves its activity type.
--   MJ_BizApps_Common: Activities       Read + Create — Create for the activity; Read because
--                                                 ActivityWriter.findByExternalKey dedupes through
--                                                 RunView, and a FAILED read silently reads as "not
--                                                 found" — so without Read, every re-run duplicates.
--   MJ_BizApps_Common: Activity Links   Create  — link the activity to the Person.
--
-- WHAT IS DELIBERATELY NOT GRANTED. Write on core `MJ: Task Types` / `MJ: Tasks` /
-- `MJ: Task Dependencies`, which would let the durable dispatch in (2) succeed. Even the `UI` role —
-- every interactive user — holds only Read there, and a principal driven by ANONYMOUS submissions
-- must not be able to create task graphs, which execute actions. So `Common.LogActivity` keeps
-- falling back to inline execution for this runner exactly as it does for every ordinary user, and
-- the "ran inline instead" log line is expected. Likewise `MJ: Record Geo Codes` create, which core's
-- geocode sync attempts after an Activity save: `UI` lacks it too, and the scheduled Geocoding
-- Maintenance job backfills it.
--
-- WHY FORMS SHIPS GRANTS ON OTHER APPS' AND CORE ENTITIES. The same argument as V202608242100
-- (People) and V202608242110 (Action Execution Logs): a principal Forms invents, to run an action
-- Forms ships, is Forms' grant to make. bizapps-tasks and bizapps-common are declared HARD
-- dependencies in `mj-app.json` precisely so Forms can build on them; the grants here are the
-- floor those shipped hooks need, and nothing wider.
--
-- WHY SIBLING ENTITIES ARE CONDITIONAL, NOT PRECONDITIONS. Both sibling apps are hard dependencies,
-- but a database can still legitimately lack these entities: bizapps-common's Activities arrived in
-- 5.35 while Forms accepts `>=5.31.0`, and databases that were not built by `mj app install` (the
-- shared dev database has no bizapps-tasks at all) must still be able to run Forms' migrations. A
-- grant on an entity the host does not have cannot be needed — the hook that would use it has
-- nothing to write to. So each absent entity is SKIPPED with a PRINT naming the app that provides
-- it; if that app is installed or upgraded later, Forms' boot-time automation readiness report
-- (forms-server) names the missing grant at every start until it is applied. Only the role (Forms'
-- own seed) and `MJ: Actions` (core) are preconditions that THROW.
--
-- WIDEN-ONLY, UNLIKE V202608242100. An existing row for (role, entity) has each needed flag raised
-- to 1 and NOTHING lowered. V202608242100 forced CanDelete = 0 because Delete on People could let an
-- anonymous submission destroy a subject record; these are the floor a set of shipped hooks needs
-- on entities other apps own, and an operator's wider hand grant there is their decision to make,
-- not this repair's to revoke. `__mj.EntityPermission` has no unique constraint on
-- (EntityID, RoleID), so an existing row is widened in place rather than joined by a rival.
--
-- Role and entities matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app
-- minted the role first carries it under a different ID (the lesson the 0.8.0 seed, #39 and the
-- 0.10.x Form Uploads grant all record). Set-based and idempotent; asserts its own postconditions
-- and nothing role-wide.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED. Each of these seven records is declared in
-- `metadata/entity-permissions/.entity-permissions.json` under the SAME id this file inserts, so
-- `metadata/` describes the deployed state and a future full regeneration reproduces exactly these
-- rows instead of minting duplicates under fresh GUIDs (a duplicate is silently additive — it
-- unions into the effective permission). This file is the SHIPPING VEHICLE for those records:
-- hosts already installed need the grants without replaying a whole seed.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');

-- Preconditions. The role ships in Forms' own 0.8.x seed; `MJ: Actions` is core MJ metadata.
-- Either being absent means this database is not in a state this grant can be reasoned about, and
-- continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51230, 'MJ Forms v0.13.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Entity] WHERE Name = N'MJ: Actions')
    THROW 51231, 'MJ Forms v0.13.x: entity "MJ: Actions" not found — core MJ metadata is missing or behind; run the core migration first.', 1;

-- The grant set. InsertID is the metadata record's primaryKey; ProvidedBy names who ships the
-- entity, for the skip message.
DECLARE @Grants TABLE (
    Seq INT NOT NULL PRIMARY KEY,
    EntityName NVARCHAR(255) NOT NULL,
    NeedRead BIT NOT NULL,
    NeedCreate BIT NOT NULL,
    InsertID UNIQUEIDENTIFIER NOT NULL,
    ProvidedBy NVARCHAR(100) NOT NULL,
    EntityID UNIQUEIDENTIFIER NULL);

INSERT INTO @Grants (Seq, EntityName, NeedRead, NeedCreate, InsertID, ProvidedBy) VALUES
    (1, N'MJ_BizApps_Tasks: Task Types',      1, 0, 'BB7D52C9-4DF6-4D65-87DD-A2B2FF991D35', N'bizapps-tasks'),
    (2, N'MJ_BizApps_Tasks: Tasks',           0, 1, '354FD02B-55B1-455E-8C56-B8EDDACC307F', N'bizapps-tasks'),
    (3, N'MJ_BizApps_Tasks: Task Links',      0, 1, '299CEC61-B47E-4A30-9F31-E018588CAA7A', N'bizapps-tasks'),
    (4, N'MJ: Actions',                       1, 0, 'B415C9FE-FF65-4D6D-A3E2-6D2F72C343CA', N'MJ core'),
    (5, N'MJ_BizApps_Common: Activity Types', 1, 0, '986DF264-F17F-4678-BDC4-72139738E3DB', N'bizapps-common >= 5.35'),
    (6, N'MJ_BizApps_Common: Activities',     1, 1, 'FDBABDF8-090F-404F-A0B2-18D713EE7D35', N'bizapps-common >= 5.35'),
    (7, N'MJ_BizApps_Common: Activity Links', 0, 1, '1E1A1369-B200-4948-A653-10FAACCC1ACA', N'bizapps-common >= 5.35');

UPDATE g SET EntityID = e.ID
FROM @Grants g
JOIN [${mjSchema}].[Entity] e ON e.Name = g.EntityName;

-- One pass per grant. Bounded by the seven rows above — the loop walks Seq 1..7 and nothing else.
DECLARE @Seq INT = 1;
DECLARE @GrantCount INT = (SELECT COUNT(*) FROM @Grants);
DECLARE @EntityName NVARCHAR(255), @EntityID UNIQUEIDENTIFIER, @NeedRead BIT, @NeedCreate BIT,
        @InsertID UNIQUEIDENTIFIER, @ProvidedBy NVARCHAR(100);

WHILE @Seq <= @GrantCount
BEGIN
    SELECT @EntityName = EntityName, @EntityID = EntityID, @NeedRead = NeedRead,
           @NeedCreate = NeedCreate, @InsertID = InsertID, @ProvidedBy = ProvidedBy
    FROM @Grants WHERE Seq = @Seq;

    IF @EntityID IS NULL
    BEGIN
        -- Absent sibling entity: skipped, loudly. (`MJ: Actions` cannot get here: THROW 51231.)
        PRINT N'MJ Forms v0.13.x: SKIPPED the "Forms Automation Runner" grant on "' + @EntityName +
              N'" — this database has no such entity (provided by ' + @ProvidedBy + N'). If that app ' +
              N'is installed or upgraded later, Forms'' boot-time automation readiness report will ' +
              N'name this missing grant until it is applied.';
    END
    ELSE IF NOT EXISTS (
        SELECT 1 FROM [${mjSchema}].[EntityPermission]
        WHERE RoleID = @RunnerRoleID AND EntityID = @EntityID)
    BEGIN
        -- No row yet for the pair: insert exactly the documented flags, under the metadata's id.
        INSERT INTO [${mjSchema}].[EntityPermission]
            (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
        VALUES
            (@InsertID, @EntityID, @RunnerRoleID, @NeedCreate, @NeedRead, 0, 0);
    END
    ELSE
    BEGIN
        -- A row exists (hand-applied, or a sibling's): widen-only — raise each needed flag that
        -- is 0 and lower nothing (see header). Every row for the pair, so no duplicate is left
        -- narrower than the floor.
        UPDATE [${mjSchema}].[EntityPermission]
        SET CanRead   = CASE WHEN @NeedRead   = 1 THEN 1 ELSE CanRead   END,
            CanCreate = CASE WHEN @NeedCreate = 1 THEN 1 ELSE CanCreate END
        WHERE RoleID = @RunnerRoleID AND EntityID = @EntityID
          AND ((@NeedRead = 1 AND CanRead = 0) OR (@NeedCreate = 1 AND CanCreate = 0));
    END

    SET @Seq = @Seq + 1;
END

-- Postcondition, per entity that exists: some row for the pair carries every needed flag.
-- (No role-wide counts — shared-role discipline, per #39.)
DECLARE @Unmet NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(g.EntityName AS NVARCHAR(MAX)), N', ')
    FROM @Grants g
    WHERE g.EntityID IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [${mjSchema}].[EntityPermission] ep
          WHERE ep.RoleID = @RunnerRoleID AND ep.EntityID = g.EntityID
            AND (g.NeedRead = 0 OR ep.CanRead = 1)
            AND (g.NeedCreate = 0 OR ep.CanCreate = 1)));
IF @Unmet IS NOT NULL
BEGIN
    DECLARE @UnmetMessage NVARCHAR(2048) =
        N'MJ Forms v0.13.x: postcondition failed — "Forms Automation Runner" still lacks its needed grant on: ' + @Unmet;
    THROW 51232, @UnmetMessage, 1;
END
