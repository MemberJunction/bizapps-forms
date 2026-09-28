-- =============================================================================================
-- MJ Forms v0.14.x — give `Forms Automation Runner` the two indirect writes its own shipped hooks
-- trigger, WITHOUT the core task-graph writes issue #269 asked for
-- =============================================================================================
-- WHAT WAS WRONG (#269). Reproduced on a throwaway clone (MJ 6.1.4 core, common + tasks, Forms at
-- `next`) with the AS-SHIPPED grants (V202609251200):
--
--   1. `Forms: Create Followup Task` writes the task and its link fine (V202609251200 covers that),
--      but with a `TaskTypeStatus` seeded for the task's type, the task is saved with
--      `TaskTypeStatusID = NULL`. bizapps-tasks' `TaskEntityServer.loadDefaultTaskTypeStatus` runs a
--      RunView against `MJ_BizApps_Tasks: Task Type Status` to resolve the type's default status; the
--      runner cannot read it, the RunView fails, and the failure is only logged, never surfaced to
--      whoever saved the task. Silent degradation, not a thrown error.
--
--   2. `Forms: Upsert Respondent Person` creating or updating a geo-enabled Person fires MJ core's
--      geocode sync (`GeoCodeSyncService`) after the save. It finds no existing `MJ: Record Geo Codes`
--      row, CREATEs one, then immediately RE-SAVES it with the lookup result — and that second save is
--      an UPDATE. With Read + Create only (what issue #269's own table asked for), that re-save is
--      refused and logged on every submit whose automations create or update a respondent Person
--      (People is geo-enabled): `Does NOT have permission to Update MJ: Record Geo Codes`.
--      The issue's table under-asked; Update is required, not optional.
--
-- WHY EACH FLAG.
--   MJ_BizApps_Tasks: Task Type Status   Read only     — resolve the task type's default status.
--                                                         Never Create/Update: the runner does not
--                                                         author statuses, only reads the one bound
--                                                         to a task's type.
--   MJ: Record Geo Codes                 Read+Create+Update — Read: GeoCodeSyncService looks for an
--                                                         existing row before creating one, same
--                                                         "failed read reads as absent" shape as the
--                                                         Activities dedupe in V202609251200. Create:
--                                                         the row itself. Update: measured above — the
--                                                         service re-saves the row it just created with
--                                                         the geocode result. No Delete: nothing on
--                                                         this path removes a row.
--                                                         REACH: with FORMS_BINDING_ALLOWED_ENTITIES
--                                                         unset (unrestricted, the default), this lets
--                                                         a form author bind answers into the geocode
--                                                         row of ANY record. Shipped anyway (derived,
--                                                         low-sensitivity data; the runner already has
--                                                         CRU on People), but keep `MJ: Record Geo
--                                                         Codes` out of FORMS_BINDING_ALLOWED_ENTITIES.
--
-- WHAT IS STILL DELIBERATELY NOT GRANTED. Write on core `MJ: Task Types` / `MJ: Tasks` /
-- `MJ: Task Dependencies` — the grants issue #269 actually asked for — for two measured reasons:
--   a) Tasks MJ dispatches through its durable task graph execute their actions as the SYSTEM user
--      (`UserCache.GetSystemUser()`, `MJServer/src/index.ts:1550`). Granting an anonymous-submission-
--      driven principal the right to create task graphs lets it mint work that later runs with
--      system-level privilege — and a form author can bind any answer into any entity this runner can
--      write, since `FORMS_BINDING_ALLOWED_ENTITIES` is unrestricted by default. That is a materially
--      wider privilege than "create one followup task", and Forms declines to ship it.
--   b) Even setting (a) aside, on MJ 6.1.4 granting those three entities does not make durable dispatch
--      WORK: durable task-graph dispatch stores action parameters as an array and drops every
--      parameter NAME (open upstream MemberJunction/MJ#4794), so the inline-fired
--      `Common.LogActivity` — which succeeds today, exactly as it does for every ordinary interactive
--      user — instead fails `VALIDATION_ERROR: TypeCode is required. Title is required.` the moment
--      durable dispatch is available to accept it. Net effect of granting the issue's own ask: the
--      activity that is logged today would stop being logged at all. The inline fallback this runner
--      already uses (falls back for the same reason every UI-role user's does) is the correct
--      behaviour for this principal, and stays. Its concurrency cost is tracked separately as
--      bizapps-common#195 / MemberJunction/MJ#4786 — it is not a Forms grant to fix.
--
-- SUPERSEDES a paragraph of V202609251200, rather than editing that shipped file (history is
-- append-only — see migrations/README.md). Its "WHAT IS DELIBERATELY NOT GRANTED" paragraph reasoned
-- that `MJ: Record Geo Codes` Create was safe to withhold because "the scheduled Geocoding Maintenance
-- job backfills it." That assumed the scheduled job was the thing that would settle the row. It is
-- not: the runner's own inline save re-saves the row it just created and that Update is refused and
-- logged on every submit whose automations create or update a respondent Person. Read this file's
-- header as the current word on that entity; V202609251200's text is left as written, per policy.
--
-- WIDEN-ONLY / ALLOW ROWS ONLY / MATCHED BY NAME / HAND-WRITTEN SQL — same reasons as V202609251200
-- (read that file's header for the full argument): an existing Allow row for (role, entity) has each
-- needed flag raised and nothing lowered, including a hand-added core task-graph grant this migration
-- does not touch or revoke — a migration that silently revoked an operator's own grant would be a
-- worse surprise than leaving it in place. Instead, Forms' boot-time automation readiness report
-- (`automation-readiness.ts`, Task 2 of this same PR) warns when the principal can submit task
-- graphs, naming the grant to remove. Only `Type = 'Allow'` rows are read or written, a Deny row is
-- left exactly as an operator wrote it; role and entities are matched by `Name`, not GUID, because
-- `Role.Name` is UNIQUE and a sibling app installed first can mint the role under a different ID; and
-- this ships as hand-written SQL — not a regenerated seed — because
-- `metadata/entity-permissions/.entity-permissions.json` already declares both rows under the SAME
-- ids this file inserts, so a future full regeneration reproduces these exact rows rather than
-- minting duplicates.
--
-- ONLY THE ROLE IS A THROW PRECONDITION. Both target entities are CONDITIONAL. `Task Type Status`
-- is younger than the floor Forms accepts: bizapps-tasks created it in
-- `V202608200800__v1.2.x_TaskType_Code_Statuses_Workflow_Hooks.sql` (1.2.x), while `mj-app.json`
-- declares `mj-bizapps-tasks >=1.1.0` — a host on 1.1.x is a valid hard-dependency install with no
-- such entity yet. A database can also lack bizapps-tasks altogether (the shared dev database has
-- no tasks schema at all). `MJ: Record Geo Codes` is kept conditional defensively: a core whose
-- metadata lacks the entity skips it with a PRINT rather than failing the whole migration. Either
-- absence means the hook that would use the grant already has nothing to write to, so each is
-- SKIPPED with a PRINT naming its provider — never a THROW — and the boot-time automation readiness
-- report (`packages/Server/src/automation/automation-readiness.ts`) names the still-missing grant
-- at every start once that entity exists.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');

-- Precondition. The role ships in Forms' own 0.8.x seed; its absence means this database is not in a
-- state this grant can be reasoned about, and continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51240, 'MJ Forms v0.14.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;

-- The grant set. InsertID is the metadata record's primaryKey; ProvidedBy names who ships the
-- entity, for the skip message.
DECLARE @Grants TABLE (
    Seq INT NOT NULL PRIMARY KEY,
    EntityName NVARCHAR(255) NOT NULL,
    NeedRead BIT NOT NULL,
    NeedCreate BIT NOT NULL,
    NeedUpdate BIT NOT NULL,
    InsertID UNIQUEIDENTIFIER NOT NULL,
    ProvidedBy NVARCHAR(100) NOT NULL,
    EntityID UNIQUEIDENTIFIER NULL);

INSERT INTO @Grants (Seq, EntityName, NeedRead, NeedCreate, NeedUpdate, InsertID, ProvidedBy) VALUES
    (1, N'MJ_BizApps_Tasks: Task Type Status', 1, 0, 0, 'F039DBBD-F6CA-40C2-B747-94D4F22EC87C', N'bizapps-tasks'),
    (2, N'MJ: Record Geo Codes',               1, 1, 1, 'F6FE151E-BEE5-42A2-BF2A-A788887046C5', N'MJ core geocoding');

UPDATE g SET EntityID = e.ID
FROM @Grants g
JOIN [${mjSchema}].[Entity] e ON e.Name = g.EntityName;

-- One pass per grant. Bounded by the two rows above — the loop walks Seq 1..2 and nothing else.
DECLARE @Seq INT = 1;
DECLARE @GrantCount INT = (SELECT COUNT(*) FROM @Grants);
DECLARE @EntityName NVARCHAR(255), @EntityID UNIQUEIDENTIFIER, @NeedRead BIT, @NeedCreate BIT,
        @NeedUpdate BIT, @InsertID UNIQUEIDENTIFIER, @ProvidedBy NVARCHAR(100);

WHILE @Seq <= @GrantCount
BEGIN
    SELECT @EntityName = EntityName, @EntityID = EntityID, @NeedRead = NeedRead,
           @NeedCreate = NeedCreate, @NeedUpdate = NeedUpdate, @InsertID = InsertID,
           @ProvidedBy = ProvidedBy
    FROM @Grants WHERE Seq = @Seq;

    IF @EntityID IS NULL
    BEGIN
        -- Absent conditional entity: skipped, loudly.
        PRINT N'MJ Forms v0.14.x: SKIPPED the "Forms Automation Runner" grant on "' + @EntityName +
              N'" — this database has no such entity (provided by ' + @ProvidedBy + N'). If that app ' +
              N'is installed or upgraded later, Forms'' boot-time automation readiness report will ' +
              N'name this missing grant until it is applied.';
    END
    ELSE IF NOT EXISTS (
        SELECT 1 FROM [${mjSchema}].[EntityPermission]
        WHERE RoleID = @RunnerRoleID AND EntityID = @EntityID AND Type = N'Allow')
    BEGIN
        -- No Allow row yet for the pair: insert exactly the documented flags, under the metadata's id.
        INSERT INTO [${mjSchema}].[EntityPermission]
            (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
        VALUES
            (@InsertID, @EntityID, @RunnerRoleID, @NeedCreate, @NeedRead, @NeedUpdate, 0);
    END
    ELSE
    BEGIN
        -- An Allow row exists (hand-applied, or a sibling's): widen-only — raise each needed flag
        -- that is 0 and lower nothing (see header). Deny rows are never touched.
        UPDATE [${mjSchema}].[EntityPermission]
        SET CanRead   = CASE WHEN @NeedRead   = 1 THEN 1 ELSE CanRead   END,
            CanCreate = CASE WHEN @NeedCreate = 1 THEN 1 ELSE CanCreate END,
            CanUpdate = CASE WHEN @NeedUpdate = 1 THEN 1 ELSE CanUpdate END
        WHERE RoleID = @RunnerRoleID AND EntityID = @EntityID AND Type = N'Allow'
          AND ((@NeedRead = 1 AND CanRead = 0) OR (@NeedCreate = 1 AND CanCreate = 0)
               OR (@NeedUpdate = 1 AND CanUpdate = 0));
    END

    SET @Seq = @Seq + 1;
END

-- Postcondition, per entity that exists: some ALLOW row for the pair carries every needed flag.
-- (No role-wide counts — shared-role discipline, per #39.)
DECLARE @Unmet NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(g.EntityName AS NVARCHAR(MAX)), N', ')
    FROM @Grants g
    WHERE g.EntityID IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [${mjSchema}].[EntityPermission] ep
          WHERE ep.RoleID = @RunnerRoleID AND ep.EntityID = g.EntityID AND ep.Type = N'Allow'
            AND (g.NeedRead = 0 OR ep.CanRead = 1)
            AND (g.NeedCreate = 0 OR ep.CanCreate = 1)
            AND (g.NeedUpdate = 0 OR ep.CanUpdate = 1)));
IF @Unmet IS NOT NULL
BEGIN
    DECLARE @UnmetMessage NVARCHAR(2048) =
        N'MJ Forms v0.14.x: postcondition failed — "Forms Automation Runner" still lacks its needed grant on: ' + @Unmet;
    THROW 51242, @UnmetMessage, 1;
END
