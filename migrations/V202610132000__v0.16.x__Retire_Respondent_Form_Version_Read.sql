-- =============================================================================================
-- MJ Forms v0.16.x — retire the Form Respondent role's read on Form Versions (#302, #303)
-- =============================================================================================
-- WHAT WAS WRONG. V202608131600 gave the anonymous `Form Respondent` role a scope-filtered READ on
-- Form Versions (filter `MJ Forms: Respondent Own Form Versions`: every version of the form the
-- session's link points at), because the server read the Published version AS the respondent. MJ
-- gives an anonymous magic-link session its synthesized roles, and the generated GraphQL resolvers
-- honour role + row filter only. So anyone holding a public link could query
-- `mjBizAppsFormsFormVersion(ID)` — the id is in `GetRespondentForm`'s own answer — and read the raw
-- `DefinitionSnapshot`: the scoring table, every ending with its redirect URL, and the knockout
-- conditions. The respondent operations hand out an allowlisted projection; this grant handed out
-- the data behind it.
--
-- WHAT REPLACES IT. forms-core-entities-server (`submission/published-link.ts`) now reads the
-- Published version as the SYSTEM user, after the Form Distributions read — still made as the
-- respondent, so its row filter binds the session to its own link — has named the form. No
-- anonymous code path reads Form Versions any more, so the grant is deleted rather than filtered:
-- the same decision V202608131600 made for Forms, Form Questions, Form Question Options, Form Pages
-- and Form Styles.
--
-- MATCHED BY ROLE NAME AND ENTITY (SCHEMA, BASE TABLE), NEVER BY PERMISSION-ROW ID. The id a host holds is not ours
-- to assume: on a host where a sibling app minted `Form Respondent` first, the role and its rows
-- carry ids this repo has never seen, and `__mj.EntityPermission` has no unique constraint on
-- (EntityID, RoleID), so duplicates are reachable. Every matching row goes. Entity names may be
-- renamed by the host; the schema and physical table are the stable identity.
--
-- THE FILTER RECORD GOES TOO, BUT ONLY WHEN NOTHING POINTS AT IT. It is Forms-owned (fixed id
-- `7F0E0003-…`, seeded by V202608131600 and extended by V202609091600), and its only consumer was
-- the row this file deletes. A reference from anything else — an operator's hand-made grant, say —
-- is left alone with a message rather than broken: deleting a filter that a live permission row
-- still names would NULL nothing (the FK refuses) and halt the chain. The teardown keeps its row in
-- the doom list, so `mj app remove` still clears a filter this file had to leave behind.
--
-- IDEMPOTENT. Two DELETEs that converge, then postconditions. Re-running changes nothing. Fresh
-- installs reach this after V202608131600 has created (and asserted) the grant, so the chain's
-- earlier postconditions still hold at the point they run.
--
-- PLACEHOLDERS. The core schema identifies metadata tables; the app schema identifies the
-- FormVersion entity by its natural key. `npm run lint:distribution` gates both.
-- =============================================================================================

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Entity]
               WHERE SchemaName = '${flyway:defaultSchema}' AND BaseTable = N'FormVersion')
    THROW 51116, 'MJ Forms: FormVersion entity is missing from metadata; cannot retire respondent permissions.', 1;
GO

DELETE p
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
WHERE r.Name = N'Form Respondent'
  AND e.SchemaName = '${flyway:defaultSchema}' AND e.BaseTable = N'FormVersion';
GO

IF EXISTS (SELECT 1 FROM [${mjSchema}].[EntityPermission]
           WHERE ReadRLSFilterID   = '7F0E0003-A1B2-4C3D-8E4F-000000000003'
              OR CreateRLSFilterID = '7F0E0003-A1B2-4C3D-8E4F-000000000003'
              OR UpdateRLSFilterID = '7F0E0003-A1B2-4C3D-8E4F-000000000003'
              OR DeleteRLSFilterID = '7F0E0003-A1B2-4C3D-8E4F-000000000003')
    PRINT 'MJ Forms: kept the row-level-security filter ''MJ Forms: Respondent Own Form Versions'' (7F0E0003-A1B2-4C3D-8E4F-000000000003) because another permission row still references it. Forms no longer uses it; mj app remove deletes it.';
ELSE
    DELETE FROM [${mjSchema}].[RowLevelSecurityFilter]
    WHERE ID = '7F0E0003-A1B2-4C3D-8E4F-000000000003';
GO

-- ── Postcondition ─────────────────────────────────────────────────────────────────────────────
-- A security migration that half-applies and reports success is the worst outcome, so the end
-- state is asserted. A permission row added between the DELETE and here must not leave
-- the grant in place. The same natural key also handles host-renamed entities.
IF EXISTS (
    SELECT 1
    FROM [${mjSchema}].[EntityPermission] p
    JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
    JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
    WHERE r.Name = N'Form Respondent'
      AND e.SchemaName = '${flyway:defaultSchema}' AND e.BaseTable = N'FormVersion')
    THROW 51115, 'MJ Forms: the Form Respondent role still holds a permission row on Form Versions. It lets any holder of a public link read the raw DefinitionSnapshot (answer key, ending redirects, knockout conditions) through the generic GraphQL resolvers (#302). Forms reads the published version as the system user and needs no respondent grant here; delete the row.', 1;
GO
