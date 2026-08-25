-- =============================================================================================
-- MJ Forms v0.11.x — let `Forms Automation Runner` attach a response's files to the record it binds
-- =============================================================================================
-- WHAT THIS IS FOR. A file uploaded through a form is stored as an `MJ: Files` row and referenced
-- by `FormResponseAnswer.FileID`. MJ's record-attachments panel reads NEITHER of those — it reads
-- `__mj.FileEntityRecordLink` filtered by (EntityID, RecordID). Forms now writes those link rows in
-- two places: on the form response (as the SYSTEM user, which already holds Integration and
-- Developer and therefore needs nothing here), and on the business record an entity binding
-- materializes — an applicant, a member, an account — which runs as the automation service
-- principal. That principal's role holds NO permission row on the link entity at all, so without
-- this grant the second write fails on every single binding and the résumé stays invisible on the
-- record a reviewer actually opens.
--
-- Read + Create + Delete. NO Update.
--   * Read, because the writer owns idempotency: `FileEntityRecordLink` has a primary key and two
--     foreign keys and NO unique constraint on (FileID, EntityID, RecordID), so the reconciler must
--     look at what is already attached before inserting. Without Read it would stack a duplicate
--     attachment on the record every time a binding re-drove.
--   * Create, which is the work.
--   * Delete, so a respondent who REPLACES their upload stops the superseded one being on display.
--     The reconciler removes a link only when that file has a `FormUpload` row for the same
--     response — i.e. only links Forms itself created — so a file a human attached through the
--     panel is never in scope.
--   * NOT Update: the row is (FileID, EntityID, RecordID) and nothing else. "Changing" a link is a
--     delete and an insert, and a principal that can rewrite a link in place can silently point an
--     existing attachment at a different file.
--
-- ON GRANTING DELETE AT ALL, which is the part worth pausing over. MJ's attachments panel offers
-- "Delete Completely", which deletes the link row and then HARD-deletes the `MJ: Files` row — no
-- transaction, no confirmation, and no call to the storage driver, so a "successful" delete leaves
-- the bytes orphaned and a half-failed one leaves the file with no link (MemberJunction/MJ#4046).
-- That path is gated on the actor holding CanDelete on `MJ: Files` AND on this link entity. This
-- grant is on the LINK ENTITY ONLY: `Forms Automation Runner` holds nothing on `MJ: Files`, so the
-- destructive half remains impossible for it, and the capability it gains is exactly the panel's
-- harmless "Unlink from Record". Do not widen this to `MJ: Files` — and do not grant CanDelete on
-- either entity to a role a PERSON holds until #4046 lands.
--
-- Role matched by NAME, not GUID: `Role.Name` is UNIQUE and a host where a sibling app minted the
-- role first carries it under a different ID (the lesson the 0.8.0 seed, #39, the 0.10.x Form
-- Uploads grant and V202608242110 all record). Set-based and idempotent; asserts its own
-- postconditions and nothing role-wide.
--
-- WHY HAND-WRITTEN SQL RATHER THAN A REGENERATED SEED — same as V202608242110. The record for this
-- grant is declared in `metadata/entity-permissions/.entity-permissions.json` under the SAME id
-- this file lands (BA109DE8-2DAA-4664-816A-743673002FCC), so `metadata/` describes the deployed
-- state and a future full regeneration reproduces exactly this row instead of minting a duplicate
-- under a fresh GUID (`__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a
-- duplicate is silently additive). This file is the SHIPPING VEHICLE for that record: hosts already
-- installed need the grant applied without replaying a 4,600-line seed.
--
-- LANDS, not merely inserts. A row that already exists for this pair is re-keyed onto the declared
-- id before the flags are touched, and the last postcondition asserts it — because the id is the
-- half of that claim nothing else checks, and a grant sitting under an operator's own GUID reads
-- as correct right up until the regeneration that duplicates it.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @FileLinkEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ: File Entity Record Links');

-- Preconditions. The role ships in Forms' own 0.8.x seed; the entity is core MJ metadata. Either
-- being absent means this database is not in a state this grant can be reasoned about, and
-- continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51160, 'MJ Forms v0.11.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @FileLinkEntityID IS NULL
    THROW 51161, 'MJ Forms v0.11.x: entity "MJ: File Entity Record Links" not found — core MJ metadata is missing or behind; run the core migration first.', 1;

-- Converge the row on the DECLARED id first, so the header's claim above is true whichever branch
-- below runs. Without this the `EXISTS` path corrects the flags and leaves whatever id was already
-- there — which happens when an operator hand-inserts the grant while diagnosing the "bindings
-- attach nothing" symptom. The flags end up right either way, so nothing looks wrong; the damage
-- lands later, when a full metadata regeneration keyed on `BA109DE8…` finds no such row, inserts
-- one, and `GetUserPermisions` unions two grants for the same pair. Nothing foreign-keys
-- `EntityPermission.ID`, so re-keying the row is safe; the NOT EXISTS guard keeps this from
-- colliding with a row that already holds the id for some other pair.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID
      AND ID <> 'BA109DE8-2DAA-4664-816A-743673002FCC')
   AND NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE ID = 'BA109DE8-2DAA-4664-816A-743673002FCC')
BEGIN
    UPDATE [${mjSchema}].[EntityPermission]
    SET ID = 'BA109DE8-2DAA-4664-816A-743673002FCC'
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID;
END

-- Grant. If any permission row already exists for the pair, correct it in place rather than adding
-- a second row — `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), and
-- duplicate rows are exactly the state the #39 hardening had to clean up after.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID)
BEGIN
    -- Deliberately NOT guarded on the flags individually: the nearest rows to copy on this entity
    -- are `Developer` and `Integration`, both full CRUD, so an operator hand-inserting a row while
    -- diagnosing the failure would most likely have granted Update as well. A migration must
    -- enforce the state it documents.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanCreate = 1, CanUpdate = 0, CanDelete = 1
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID
      AND (CanRead = 0 OR CanCreate = 0 OR CanUpdate = 1 OR CanDelete = 0);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('BA109DE8-2DAA-4664-816A-743673002FCC', @FileLinkEntityID, @RunnerRoleID, 1, 1, 0, 1);
END

-- Postconditions. FOUR checks, because none implies the others and this file asserts every half of
-- what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID
      AND CanRead = 1 AND CanCreate = 1 AND CanDelete = 1)
    THROW 51162, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" still cannot attach a response file to a bound record.', 1;

-- Update being off is not implied by the three above: with no unique constraint on
-- (EntityID, RoleID), a second, wider row can sit beside a correct one and `GetUserPermisions`
-- unions them. Asserting absence is the only check that catches that.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID AND CanUpdate = 1)
    THROW 51163, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanUpdate on "MJ: File Entity Record Links"; a link is (FileID, EntityID, RecordID) and nothing else, so rewriting one in place silently repoints an existing attachment at a different file.', 1;

-- The destructive half of MJ's attachments panel ("Delete Completely") needs CanDelete on BOTH the
-- link entity and `MJ: Files`. This grant deliberately supplies only the first, so assert the
-- second is still absent — a later migration widening it would turn this grant into that one.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission] p
    JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
    WHERE p.RoleID = @RunnerRoleID AND e.Name = N'MJ: Files' AND p.CanDelete = 1)
    THROW 51164, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanDelete on "MJ: Files". Combined with the link-entity grant above that is MJ''s "Delete Completely" path, which hard-deletes the file row and orphans its stored bytes (MemberJunction/MJ#4046).', 1;

-- The deployed row must carry the id `metadata/` declares. The three checks above all pass on a
-- row under some other id, and that row is invisible to a later regeneration keyed on this one —
-- which then inserts a duplicate that GetUserPermisions unions with it.
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @FileLinkEntityID
      AND ID = 'BA109DE8-2DAA-4664-816A-743673002FCC')
    THROW 51165, 'MJ Forms v0.11.x: postcondition failed — the grant exists but not under the id metadata/entity-permissions declares (BA109DE8-2DAA-4664-816A-743673002FCC). A regenerated seed will not see it and will insert a second row for the same pair.', 1;
