-- =============================================================================================
-- MJ Forms v0.10.x — grant `Forms Automation Runner` read on the upload provenance ledger (#49)
-- =============================================================================================
-- WHAT WAS WRONG. The binding executor refuses to copy a file answer onto a target entity unless
-- bind-time provenance verification passes (`dispatch-automation.ts` `filesAreVerified` →
-- `loadUploadLedger`, a RunView over `MJ_BizApps_Forms: Form Uploads` under the automation service
-- principal). The 0.8.x provenance migration granted `Form Uploads` read to UI / Developer /
-- Integration — and never to `Forms Automation Runner`, the ONE role that must read the ledger to
-- verify anything. The lookup therefore threw ("does not have read permissions"), the check
-- correctly failed closed, and EVERY file-answer binding on EVERY host failed with "provenance
-- cannot be verified" — regardless of storage configuration, and with a perfectly attributable
-- ledger row sitting in the table. Found 2026-08-18 driving the full résumé arc live (issue #49):
-- upload → submit → bind was green the moment this single read grant existed.
--
-- Read only. The ledger is WRITTEN by the upload endpoint's elevated principal, not by the
-- automation runner; and a runner that could create ledger rows could vouch for arbitrary files,
-- which is the forgery DG-12a exists to prevent.
--
-- Role matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app minted the
-- role first carries it under a different ID (the same lesson the 0.8.0 seed and #39 hardening
-- already record). Set-based and idempotent; asserts its own postconditions and nothing role-wide.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED. This role's other eight grants are authored
-- in `metadata/entity-permissions/.entity-permissions.json` and ship through
-- `V202608081700__v0.8.x__Metadata_Sync.sql`, and that remains the source of truth — the record for
-- THIS grant is declared there too, under the SAME id this file inserts
-- (7A49C1D4-8E02-4F5B-9C63-D18B52E7A930), so `metadata/` describes the deployed state and a future
-- full regeneration reproduces exactly this row instead of minting a duplicate under a fresh GUID
-- (`__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a duplicate is
-- silently additive — the state #39 had to clean up).
--
-- This file is the SHIPPING VEHICLE for that record, for the same reason
-- `V202608131600__…Respondent_Grant_Hardening` is hand-written: hosts already installed at 0.8.x
-- have the role and its eight grants, and they need the ninth applied without replaying a 4,600-line
-- seed. A repair migration reaches both a fresh install and an existing one; regenerating the seed
-- reaches only the fresh one.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @FormUploadsEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ_BizApps_Forms: Form Uploads');

-- Preconditions: both rows ship in Forms' own 0.8.x migrations. Their absence means this database
-- never ran them, and continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51120, 'MJ Forms v0.10.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @FormUploadsEntityID IS NULL
    THROW 51121, 'MJ Forms v0.10.x: entity "MJ_BizApps_Forms: Form Uploads" not found — the 0.8.x upload provenance migration has not run on this database.', 1;

-- Grant. If any permission row already exists for the pair (reachable when a co-installed sibling
-- or an operator minted one), raise its read flag in place rather than adding a second row —
-- `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), and duplicate rows are
-- exactly the state the #39 hardening had to clean up after.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FormUploadsEntityID)
BEGIN
    -- Sets CanCreate = 0 as well, and is deliberately NOT guarded on `CanRead = 0`. The guard
    -- would skip any row that already reads, including one an operator hand-inserted while
    -- diagnosing "provenance cannot be verified" — the nearest row to copy is the Developer grant
    -- three lines away in V202608081200, which is full CRUD (1,1,1,1). This file would then have
    -- blessed a runner that can mint its own ledger rows and exited 0 while its header claims
    -- read-only. A migration must enforce the state it documents, not assume it.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanCreate = 0
    WHERE RoleID = @RunnerRoleID AND EntityID = @FormUploadsEntityID
      AND (CanRead = 0 OR CanCreate = 1);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('7A49C1D4-8E02-4F5B-9C63-D18B52E7A930', @FormUploadsEntityID, @RunnerRoleID, 0, 1, 0, 0);
END

-- Postconditions. TWO checks, because neither implies the other and this file asserts BOTH halves
-- of what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FormUploadsEntityID AND CanRead = 1)
    THROW 51122, 'MJ Forms v0.10.x: postcondition failed — "Forms Automation Runner" still cannot read "MJ_BizApps_Forms: Form Uploads".', 1;

-- The read half being satisfied says nothing about create: `__mj.EntityPermission` has no unique
-- constraint on (EntityID, RoleID), so a second, wider row can sit beside a correct one and
-- `GetUserPermisions` unions them. Asserting absence is the only check that catches that.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FormUploadsEntityID AND CanCreate = 1)
    THROW 51123, 'MJ Forms v0.10.x: postcondition failed — "Forms Automation Runner" holds CanCreate on "MJ_BizApps_Forms: Form Uploads"; a runner that can write the ledger can vouch for arbitrary files (DG-12a).', 1;
