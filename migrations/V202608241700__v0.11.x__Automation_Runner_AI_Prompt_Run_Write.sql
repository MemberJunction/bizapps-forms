-- =============================================================================================
-- MJ Forms v0.11.x — let `Forms Automation Runner` record the AI prompt runs it performs
-- =============================================================================================
-- WHAT WAS WRONG. `Forms: Analyze Written Responses` runs an AI prompt under the automation
-- service principal, and MJ's prompt engine writes one `MJ: AI Prompt Runs` row per execution
-- (inserted when the run starts, updated when it finishes with the result and token counts). The
-- runner role was never granted anything on that entity, so every execution failed at
-- `BaseEntitySaveQueue.Insert(MJ: AI Prompt Runs)`.
--
-- Nothing surfaced. On-submit automations are best-effort by design — the response is already
-- persisted and the respondent is already answered before they run — so the failure reached a log
-- line and nowhere else. Found 2026-08-24 while QA-ing the live path: 34 consecutive failures
-- against one form, with a green submit every time and no AI Prompt Run row to show for any of
-- them. Any host that has ever enabled this automation has been silently dropping the analysis
-- AND its audit trail, which is the worse half: there is no record that the work did not happen.
--
-- Read + Create + Update, no Delete. That is the shape the engine needs (insert at start, update
-- at completion) and it matches the `UI` and `Widget Guest` grants on the same entity; `Developer`
-- and `Integration` additionally hold Delete, which a runner has no reason to and which would let
-- it erase the evidence of its own executions.
--
-- Role matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app minted the
-- role first carries it under a different ID (the lesson the 0.8.0 seed, #39 and the 0.10.x
-- Form Uploads grant all record). Set-based and idempotent; asserts its own postconditions and
-- nothing role-wide.
--
-- This grant is on a CORE `__mj` entity rather than a Forms one, which is a first for this repo
-- and worth naming: it is not Forms reaching into core for convenience. The prompt-run ledger is
-- where MJ records that an AI call happened at all, so any principal that may run a prompt must
-- be able to write it — which is exactly why `Integration` and `Widget Guest`, the other two
-- non-interactive roles, already hold it.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED. This role's other nine grants are authored
-- in `metadata/entity-permissions/.entity-permissions.json` and ship through
-- `V202608081700__v0.8.x__Metadata_Sync.sql`, and that remains the source of truth — the record for
-- THIS grant is declared there too, under the SAME id this file inserts
-- (4B1E7C93-2A85-4D67-B0F4-9E3C5A2D8176), so `metadata/` describes the deployed state and a future
-- full regeneration reproduces exactly this row instead of minting a duplicate under a fresh GUID
-- (`__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a duplicate is
-- silently additive). This file is the SHIPPING VEHICLE for that record: hosts already installed
-- need the grant applied without replaying a 4,600-line seed.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @PromptRunEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ: AI Prompt Runs');

-- Preconditions. The role ships in Forms' own 0.8.x seed; the entity is core MJ metadata. Either
-- being absent means this database is not in a state this grant can be reasoned about, and
-- continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51130, 'MJ Forms v0.11.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @PromptRunEntityID IS NULL
    THROW 51131, 'MJ Forms v0.11.x: entity "MJ: AI Prompt Runs" not found — core MJ metadata is missing or behind; run the core migration first.', 1;

-- Grant. If any permission row already exists for the pair, widen it in place rather than adding
-- a second row — `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), and
-- duplicate rows are exactly the state the #39 hardening had to clean up after.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PromptRunEntityID)
BEGIN
    -- Sets CanDelete = 0 as well, and is deliberately NOT guarded on the read/create/update flags.
    -- The nearest rows to copy on this entity are the `Developer` and `Integration` grants, which
    -- are full CRUD — so an operator hand-inserting a row while diagnosing the failure would most
    -- likely have granted Delete too. A migration must enforce the state it documents.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanCreate = 1, CanUpdate = 1, CanDelete = 0
    WHERE RoleID = @RunnerRoleID AND EntityID = @PromptRunEntityID
      AND (CanRead = 0 OR CanCreate = 0 OR CanUpdate = 0 OR CanDelete = 1);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('4B1E7C93-2A85-4D67-B0F4-9E3C5A2D8176', @PromptRunEntityID, @RunnerRoleID, 1, 1, 1, 0);
END

-- Postconditions. TWO checks, because neither implies the other and this file asserts BOTH halves
-- of what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PromptRunEntityID
      AND CanRead = 1 AND CanCreate = 1 AND CanUpdate = 1)
    THROW 51132, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" still cannot record AI prompt runs.', 1;

-- The write half being satisfied says nothing about delete: with no unique constraint on
-- (EntityID, RoleID), a second, wider row can sit beside a correct one and `GetUserPermisions`
-- unions them. Asserting absence is the only check that catches that.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @PromptRunEntityID AND CanDelete = 1)
    THROW 51133, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanDelete on "MJ: AI Prompt Runs"; a runner that can delete prompt-run rows can erase the record of its own executions.', 1;
