-- =============================================================================================
-- MJ Forms v0.11.x — let `Forms Automation Runner` read and write the People it is asked to upsert
-- =============================================================================================
-- WHAT WAS WRONG. `Forms: Upsert Respondent Person` is a seam-S3 on-submit action shipped enabled
-- in the starter templates, and its entire job is to match-or-create a `MJ_BizApps_Common: People`
-- row from a response's answers and stamp `FormResponse.RespondentPersonID` with the result. The
-- runner role was never granted anything on that entity. Neither was the entity-binding path that
-- writes the same table (`Forms: Bind Response To Entity`, whose gateway creates OR updates).
--
-- So the action could not do the one thing it exists to do, on any host but the ones where an
-- operator had hand-inserted the row while diagnosing it. That is how this was found (2026-08-24,
-- #60): the grant was present in a dev database under a hand-minted id that appears nowhere in
-- `migrations/` or `metadata/`, which is the signature of a fix that was applied and never shipped.
-- Everyone else got a permission failure on a best-effort hook — which is to say, a log line.
--
-- Read + Create + Update, no Delete. Read for the match-by-email that prevents duplicate People
-- (#47 is about this action creating duplicates; without Read it can only ever create). Create for
-- a respondent nobody has seen before. Update because entity binding merges answers into a matched
-- record rather than only creating. Delete is withheld: nothing on this path removes a Person, and
-- a runner that could would be able to destroy subject records from an anonymous submission.
--
-- Role matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app minted the
-- role first carries it under a different ID (the lesson the 0.8.0 seed, #39 and the 0.10.x
-- Form Uploads grant all record). Set-based and idempotent; asserts its own postconditions and
-- nothing role-wide.
--
-- WHY FORMS SHIPS A GRANT ON ANOTHER APP'S ENTITY. `MJ_BizApps_Common: People` belongs to
-- bizapps-common, which Forms declares as a HARD dependency in `mj-app.json` precisely so it can
-- build on it with real foreign keys — `FormResponse.RespondentPersonID` is one. A principal Forms
-- invents, to run an action Forms ships, against a table Forms already points at, is Forms' grant
-- to make. The same reasoning as `V202608241700`, which grants this role write on a core `__mj`
-- entity for the same structural reason.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED. This role's other grants are authored in
-- `metadata/entity-permissions/.entity-permissions.json` and ship through
-- `V202608081700__v0.8.x__Metadata_Sync.sql`, and that remains the source of truth — the record for
-- THIS grant is declared there too, under the SAME id this file inserts
-- (2F22F165-073D-45BB-AD26-6534BA222E59), so `metadata/` describes the deployed state and a future
-- full regeneration reproduces exactly this row instead of minting a duplicate under a fresh GUID
-- (`__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a duplicate is
-- silently additive). This file is the SHIPPING VEHICLE for that record: hosts already installed
-- need the grant applied without replaying a 4,600-line seed.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @PersonEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ_BizApps_Common: People');

-- Preconditions. The role ships in Forms' own 0.8.x seed; the entity comes from bizapps-common,
-- which `mj app install` installs before Forms because Forms declares it as a dependency. Either
-- being absent means this database is not in a state this grant can be reasoned about, and
-- continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51140, 'MJ Forms v0.11.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @PersonEntityID IS NULL
    THROW 51141, 'MJ Forms v0.11.x: entity "MJ_BizApps_Common: People" not found — bizapps-common is not installed, but Forms declares it as a hard dependency.', 1;

-- Grant. If any permission row already exists for the pair, widen it in place rather than adding
-- a second row — `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), and
-- duplicate rows are exactly the state the #39 hardening had to clean up after. This branch is
-- the one that runs on every host where the grant was hand-applied during diagnosis, including
-- the one that found it: it adopts that row rather than shipping a rival beside it.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PersonEntityID)
BEGIN
    -- Sets CanDelete = 0 as well, and is deliberately NOT guarded on the read/create/update flags.
    -- An operator hand-inserting a row to get the action working would most likely have granted
    -- full CRUD and moved on. A migration must enforce the state it documents.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanCreate = 1, CanUpdate = 1, CanDelete = 0
    WHERE RoleID = @RunnerRoleID AND EntityID = @PersonEntityID
      AND (CanRead = 0 OR CanCreate = 0 OR CanUpdate = 0 OR CanDelete = 1);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('2F22F165-073D-45BB-AD26-6534BA222E59', @PersonEntityID, @RunnerRoleID, 1, 1, 1, 0);
END

-- Postconditions. TWO checks, because neither implies the other and this file asserts BOTH halves
-- of what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PersonEntityID
      AND CanRead = 1 AND CanCreate = 1 AND CanUpdate = 1)
    THROW 51142, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" still cannot match or create a respondent Person.', 1;

-- The write half being satisfied says nothing about delete: with no unique constraint on
-- (EntityID, RoleID), a second, wider row can sit beside a correct one and `GetUserPermisions`
-- unions them. Asserting absence is the only check that catches that.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PersonEntityID AND CanDelete = 1)
    THROW 51143, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanDelete on "MJ_BizApps_Common: People"; an anonymous submission must never be able to destroy a subject record.', 1;
