-- =============================================================================================
-- MJ Forms v0.12.x — put the Forms application in the launcher, on hosts that already exist
-- =============================================================================================
-- WHAT WAS WRONG (#212). `metadata/applications/.applications.json` declared the curated `Forms`
-- application `DefaultForNewUser: false`, so `V202608081700`'s spCreateApplication shipped 0.
-- `__mj.Application.DefaultForNewUser` decides whether an application is added to a user's
-- `__mj.UserApplication` list, and that list is what the Explorer app launcher renders. A textbook
-- install therefore listed 13 applications, none of them Forms — the only Forms-shaped entry being
-- `__mj_BizAppsForms`, the shell MJ's schema-sync mints from the schema name. The builder, both
-- dashboards and the seven browsable admin entities were reachable by nobody. Both siblings ship
-- `true`; Forms was the only one of the three that did not.
--
-- TWO WRITES, BECAUSE THE FLAG ALONE MOVES ALMOST NOBODY. MJ creates `UserApplication` rows from
-- three places, not two: the JWT provisioning path (MJServer `auth/newUsers.ts`, inside
-- new-User-row creation) and the Explorer client self-heal
-- (`base-application/src/lib/application-manager.ts`, gated on `userApps.length === 0`) are
-- new-user-only, but `MJApplicationEntityServer.Save()` also runs `CreateUserApplicationsForAllUsers()`
-- — with no zero-row exclusion at all — on any false→true `DefaultForNewUser` flip through
-- `BaseEntity.Save()`. This migration's raw `UPDATE` deliberately never routes through `Save()`, so
-- it stays off that third path — a `mj sync push` of the metadata edit would not.
-- Anyone who has ever opened Explorer holds a non-empty list that is never reconsidered. Measured
-- on the upgrade-path rehearsal database before writing this file: applying only the flag left
-- `System` (7 rows) and `Anonymous` (2 rows) exactly as they were.
--
-- This is bizapps-caliber's V202609021000 in reverse. That migration had to unsubscribe existing
-- users AND clear the new-user flag, and records that either alone "looks done and rots". Ours rots
-- the other way: correct for users created later, invisible forever to everyone who exists now.
--
-- WHY THE BACKFILL SKIPS USERS WITH NO ROWS AT ALL, which is the part that is easy to get wrong.
-- The Explorer self-heal fires only on an EMPTY list. Give a zero-row user a single Forms row and
-- their list becomes non-empty, the self-heal never runs, and they sign in to a launcher holding
-- Forms and nothing else — no Home, no Data Explorer, no siblings. So zero-row users are left
-- alone deliberately: the flag above is what reaches them, in full, on first sign-in.
--
-- WHY IT DOES NOT FILTER BY ROLE. `UserInfoEngine.UserHasApplicationAccess` already gates the
-- launcher on `ApplicationRole.CanAccess`, and Forms ships two ApplicationRole rows (Developer,
-- UI). A row backfilled for a user without them renders nothing. Filtering here would duplicate a
-- decision MJ already makes AND under-deliver — a user granted the role tomorrow would still be
-- missing the row, and (non-empty list) would never self-heal.
--
-- WHY A MIGRATION AS WELL AS THE METADATA EDIT. `metadata/` remains the source of truth so a
-- regenerated seed reproduces this state, but that seed has already run on every existing host, so
-- the edit alone reaches only fresh installs. Same split as V202608181030, V202608201200 and
-- V202608201400.
--
-- Matched by the Application's hardcoded ID, which Forms mints itself in V202608081700.

DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

-- Precondition: the row ships in Forms' own seed. Its absence means this database never ran that
-- migration, and continuing would report success while changing nothing.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Application] WHERE ID = @FormsAppID)
    THROW 51150, 'Forms application row not found — V202608081700 has not run on this database.', 1;

-- ── 1. What reaches users created LATER ──────────────────────────────────────────────────────
UPDATE [${mjSchema}].[Application]
SET DefaultForNewUser = 1
WHERE ID = @FormsAppID;
GO

-- ── 2. What reaches the users who exist TODAY ────────────────────────────────────────────────
-- Guarded on the natural key, not on a minted ID: MJ ships
-- UQ_UserApplication_UserID_ApplicationID (core V202512301901), so an unguarded re-run would halt
-- the chain on a constraint violation rather than no-op. Sequence continues each user's own list,
-- matching what UserInfoEngine.doCreateDefaultApplications would have written (maxExistingSequence
-- + 1); ISNULL covers a user whose only rows are somehow NULL-sequenced.
DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

INSERT INTO [${mjSchema}].[UserApplication] ([ID], [UserID], [ApplicationID], [Sequence], [IsActive])
SELECT NEWID(), u.[ID], @FormsAppID,
       ISNULL((SELECT MAX(s.[Sequence]) FROM [${mjSchema}].[UserApplication] s WHERE s.[UserID] = u.[ID]), -1) + 1,
       1
FROM [${mjSchema}].[User] u
WHERE u.[IsActive] = 1
  -- Only users MJ can no longer reach. A user with no rows keeps none, so the client self-heal
  -- still provisions their FULL default set on first sign-in — see the header.
  AND EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] e WHERE e.[UserID] = u.[ID])
  -- Any row at all, active or not. A user who has deliberately uninstalled Forms holds an
  -- IsActive = 0 row, and re-adding it would override a choice they made.
  AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] f
                  WHERE f.[UserID] = u.[ID] AND f.[ApplicationID] = @FormsAppID);

-- Postcondition for the INSERT above lives in THIS batch, not after a GO. A `GO` ends the batch
-- and gives another connection a window to create a user in between (MJAPI's env-configured
-- `newUsers.ts` branch provisions from a fixed app-name list that need not include Forms) — that
-- user would then have >= 1 UserApplication row and no Forms row, tripping THROW 51152 for a state
-- this migration is otherwise content to leave alone and hard-stopping a stranger's entire chain.
-- Same ROW-EXISTS-not-IsActive reasoning as the INSERT's own guard: a user who deliberately
-- uninstalled Forms keeps an IsActive = 0 row, and this must not treat that choice as a failure.
IF EXISTS (
    SELECT 1 FROM [${mjSchema}].[User] u
    WHERE u.[IsActive] = 1
      AND EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] e WHERE e.[UserID] = u.[ID])
      AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[UserApplication] f
                      WHERE f.[UserID] = u.[ID] AND f.[ApplicationID] = @FormsAppID))
    THROW 51152, 'At least one active user with an existing application list still has no Forms UserApplication row.', 1;
GO

-- ── Postcondition for step 1 ─────────────────────────────────────────────────────────────────
-- Assert what the launcher actually reads for new users, so a silently-skipped write (a WHERE
-- that matched nothing, a column renamed under us) fails here rather than surfacing as an app
-- nobody can find and nobody connects back to this file.
DECLARE @FormsAppID UNIQUEIDENTIFIER = 'BFB97C57-4552-4643-8933-A0B2D76544D8';

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Application]
               WHERE ID = @FormsAppID AND DefaultForNewUser = 1)
    THROW 51151, 'Forms application DefaultForNewUser was not applied.', 1;
