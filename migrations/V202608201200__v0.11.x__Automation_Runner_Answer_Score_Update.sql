-- =============================================================================================
-- MJ Forms v0.11.x — grant `Forms Automation Runner` update on Form Response Answers
-- =============================================================================================
-- WHAT WAS WRONG. `Forms: Analyze Written Responses` scores each free-text answer with an AI call
-- and writes `Score` + `ScoreRationale` back onto `MJ_BizApps_Forms: Form Response Answers`
-- (`analyze-written-responses.action.ts` → `saveAnswerScore`). The role that action runs as holds
-- CanRead on that entity and nothing else, so every one of those saves was refused:
--
--     Does NOT have permission to Update MJ_BizApps_Forms: Form Response Answers records.
--
-- The scores were produced, paid for, and thrown away — on every host, for every response, since
-- the action shipped. Observed live 2026-08-20: eight answers on one response, `Score` NULL on all
-- eight, three refusals in the log, and the automation run recorded as **Succeeded** because the
-- action reported success regardless of how many scores it managed to persist. That second half is
-- fixed in the action itself; this file fixes the first.
--
-- UPDATE ONLY. The runner scores answers that the submit pipeline has already written; it never
-- creates or deletes them. A runner that could create answer rows could fabricate responses, and
-- one that could delete them could erase a respondent's submission — so both stay off and the
-- postconditions below assert their absence rather than assuming it.
--
-- Role and entity matched by NAME, not GUID, for the reason V202608181030 records: `Role.Name` is
-- UNIQUE and a host where a sibling app minted the role first carries it under a different ID.
--
-- WHY A MIGRATION AS WELL AS THE METADATA EDIT. This grant is authored in
-- `metadata/entity-permissions/.entity-permissions.json` (record 3E2FAFDD-5A3E-4FAA-93E2-DFA006F226CF,
-- whose CanUpdate is flipped to true in the same change) and that remains the source of truth, so a
-- future regeneration reproduces this state instead of minting a duplicate. But the seed that
-- carries it, `V202608081700`, has already run on every existing host — so the edit alone reaches
-- only fresh installs. This file is the repair vehicle that reaches the rest, exactly as
-- V202608181030 was for the ledger read grant.

DECLARE @RunnerRoleID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Role] WHERE Name = N'Forms Automation Runner');
DECLARE @AnswersEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE Name = N'MJ_BizApps_Forms: Form Response Answers');

-- Preconditions: both rows ship in Forms' own migrations. Their absence means this database never
-- ran them, and continuing would "succeed" while granting nothing.
IF @RunnerRoleID IS NULL
    THROW 51130, 'MJ Forms v0.11.x: role "Forms Automation Runner" not found — the 0.8.x metadata seed has not run on this database.', 1;
IF @AnswersEntityID IS NULL
    THROW 51131, 'MJ Forms v0.11.x: entity "MJ_BizApps_Forms: Form Response Answers" not found — the baseline schema migration has not run on this database.', 1;

-- Raise update in place on the existing row rather than inserting a second one:
-- `__mj.EntityPermission` has no unique constraint on (EntityID, RoleID), so a duplicate is
-- silently additive and `GetUserPermisions` unions the two — the state the #39 hardening had to
-- clean up. The INSERT branch exists only for a host that somehow lacks the row entirely.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @AnswersEntityID)
BEGIN
    -- Read is set alongside update because the action LOADS each answer before stamping it; a row
    -- that could update but not read would fail one step earlier. Create/Delete are forced off in
    -- the same statement, so a pre-existing wider row (an operator copying the Developer grant
    -- three lines away in the baseline, which is full CRUD) is narrowed rather than blessed.
    UPDATE [${mjSchema}].[EntityPermission]
    SET CanRead = 1, CanUpdate = 1, CanCreate = 0, CanDelete = 0
    WHERE RoleID = @RunnerRoleID AND EntityID = @AnswersEntityID
      AND (CanRead = 0 OR CanUpdate = 0 OR CanCreate = 1 OR CanDelete = 1);
END
ELSE
BEGIN
    INSERT INTO [${mjSchema}].[EntityPermission]
        (ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
    VALUES
        ('3E2FAFDD-5A3E-4FAA-93E2-DFA006F226CF', @AnswersEntityID, @RunnerRoleID, 0, 1, 1, 0);
END

-- Postconditions. Three checks, because none implies the others and this file asserts every half
-- of what its header promises. (No role-wide counts — shared-role discipline, per #39.)
IF NOT EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @AnswersEntityID AND CanUpdate = 1 AND CanRead = 1)
    THROW 51132, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" still cannot read+update "MJ_BizApps_Forms: Form Response Answers"; AI scores will continue to be discarded.', 1;

IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @AnswersEntityID AND CanCreate = 1)
    THROW 51133, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanCreate on "MJ_BizApps_Forms: Form Response Answers"; a runner that can create answers can fabricate a response.', 1;

IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[EntityPermission]
    WHERE RoleID = @RunnerRoleID AND EntityID = @AnswersEntityID AND CanDelete = 1)
    THROW 51134, 'MJ Forms v0.11.x: postcondition failed — "Forms Automation Runner" holds CanDelete on "MJ_BizApps_Forms: Form Response Answers"; a runner that can delete answers can erase a submission.', 1;
