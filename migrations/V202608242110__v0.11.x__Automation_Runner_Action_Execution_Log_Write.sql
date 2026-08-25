-- =============================================================================================
-- MJ Forms v0.11.x — let `Forms Automation Runner` write the action execution log it generates
-- =============================================================================================
-- WHAT WAS WRONG. Every automation Forms dispatches runs an MJ Action, and MJ's action engine
-- writes one `MJ: Action Execution Logs` row per execution — inserted when the run starts, updated
-- when it finishes. The runner role held no permission on that entity, so every dispatch logged
-- `BaseEntitySaveQueue.Insert(MJ: Action Execution Logs) failed` for the automation service
-- principal and carried on.
--
-- The execution itself survives — the automation completes and `FormAutomationRun` is written — so
-- this costs the AUDIT TRAIL, not the work. Which is the same trade `V202608241700` called the
-- worse half, and here it is worse still, because Forms ships a column that depends on it:
-- `FormAutomationRun.ActionExecutionLogID` is a foreign key to this entity, and it has never once
-- been populated. Measured on the database where this was found (2026-08-24, #60): 134 automation
-- runs, 134 null `ActionExecutionLogID`, zero `ActionExecutionLog` rows for the service principal —
-- and the nulls include the runs that SUCCEEDED. Forms' own ledger cannot be joined to MJ's.
--
-- Read + Create + Update, no Delete. That is the shape the engine needs (insert at start, update at
-- completion) and it matches `Developer`, which holds exactly this on the same entity. `Integration`
-- additionally holds Delete, which a runner has no reason to and which would let it erase the
-- evidence of its own executions — the same line drawn for AI Prompt Runs in `V202608241700`.
--
-- Role matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app minted the
-- role first carries it under a different ID (the lesson the 0.8.0 seed, #39 and the 0.10.x
-- Form Uploads grant all record). Set-based and idempotent; asserts its own postconditions and
-- nothing role-wide.
--
-- This is the second grant this repo ships on a CORE `__mj` entity, and it is the same argument as
-- the first: the execution log is where MJ records that an Action ran at all, so any principal
-- permitted to run one must be able to write it. `Developer`, `Integration` and `UI` already hold
-- some shape of it.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED. This role's other grants are authored in
-- `metadata/entity-permissions/.entity-permissions.json` and ship through
-- `V202608081700__v0.8.x__Metadata_Sync.sql`, and that remains the source of truth — the record for
-- THIS grant is declared there too, under the SAME id this file inserts
-- (5BC1949A-60F7-4788-A87D-A2FA2C073E69), so `metadata/` describes the deployed state and a future
-- full regeneration reproduces exactly this row instead of minting a duplicate under a fresh GUID
-- (`__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a duplicate is
-- silently additive). This file is the SHIPPING VEHICLE for that record: hosts already installed
-- need the grant applied without replaying a 4,600-line seed.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @ExecutionLogEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ: Action Execution Logs');

-- Preconditions. The role ships in Forms' own 0.8.x seed; the entity is core MJ metadata. Either
-- being absent means this database is not in a state this grant can be reasoned about, and
-- continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51150, 'MJ Forms v0.11.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @ExecutionLogEntityID IS NULL
    THROW 51151, 'MJ Forms v0.11.x: entity "MJ: Action Execution Logs" not found — core MJ metadata is missing or behind; run the core migration first.', 1;

-- Grant. If any permission row already exists for the pair, widen it in place rather than adding
-- a second row — `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), and
-- duplicate rows are exactly the state the #39 hardening had to clean up after.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @ExecutionLogEntityID)
BEGIN
    -- Sets CanDelete = 0 as well, and is deliberately NOT guarded on the read/create/update flags.
    -- The nearest row to copy on this entity is `Integration`, which is full CRUD — so an operator
    -- hand-inserting a row while diagnosing the failure would most likely have granted Delete too.
    -- A migration must enforce the state it documents.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanCreate = 1, CanUpdate = 1, CanDelete = 0
    WHERE RoleID = @RunnerRoleID AND EntityID = @ExecutionLogEntityID
      AND (CanRead = 0 OR CanCreate = 0 OR CanUpdate = 0 OR CanDelete = 1);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('5BC1949A-60F7-4788-A87D-A2FA2C073E69', @ExecutionLogEntityID, @RunnerRoleID, 1, 1, 1, 0);
END

-- Postconditions. TWO checks, because neither implies the other and this file asserts BOTH halves
-- of what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @ExecutionLogEntityID
      AND CanRead = 1 AND CanCreate = 1 AND CanUpdate = 1)
    THROW 51152, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" still cannot record action executions.', 1;

-- The write half being satisfied says nothing about delete: with no unique constraint on
-- (EntityID, RoleID), a second, wider row can sit beside a correct one and `GetUserPermisions`
-- unions them. Asserting absence is the only check that catches that.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @ExecutionLogEntityID AND CanDelete = 1)
    THROW 51153, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanDelete on "MJ: Action Execution Logs"; a runner that can delete execution-log rows can erase the record of its own executions.', 1;
