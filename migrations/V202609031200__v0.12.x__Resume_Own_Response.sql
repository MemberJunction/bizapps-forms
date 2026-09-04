-- =============================================================================================
-- MJ Forms v0.12.x — a respondent may read, and continue, their own half-finished response (#138)
-- =============================================================================================
-- Design: docs/superpowers/specs/2026-09-03-resume-a-partial-response-design.md
--
-- WHAT THIS OPENS. Until now the anonymous `Form Respondent` role held NO read on the two response
-- entities, deliberately: one shared anonymous principal backs every respondent, so an unfiltered
-- read is an instance-wide read. That reasoning is unchanged. What changed is that a resume link is
-- a magic-link invite whose `ResourceID` is a SINGLE FormResponse, so a resumed session's scope
-- claim names one row — and a filter keyed on it isolates one RESPONDENT, not merely one form. The
-- public link's scope is still a distribution id, which is the primary key of a different table, so
-- a public-link session continues to read exactly zero response rows.
--
-- WHY A REAL COLUMN AND NOT `JSON_VALUE(SourceMetadata)`. A response-scoped session must be able to
-- load the definition of the distribution it came through, which means the distribution filter has
-- to reach the response's link. `SourceMetadata` already carries a distribution id, and reading it
-- with JSON_VALUE inside a row filter would make a free-form JSON blob the authorization key: no
-- foreign key, no type, and rewritten by the application on every save. `FormDistributionID` is a
-- real FK, stamped once on create, and it is what the filter names.
--
-- WHY EVERY PREDICATE IS WRAPPED IN PARENTHESES. MJ ANDs a row filter onto the caller's own
-- predicate (`GetEffectiveRowFilterWhereClause`). An unparenthesised `A OR B` therefore binds as
-- `caller AND A OR B`, which is `(caller AND A) OR B` — a filter that returns rows the caller never
-- asked for. The two EXTENDED filters below gain an OR clause each, so both are parenthesised, and
-- the two NEW ones are parenthesised for the same reason before anybody extends them.
--
-- THE CAST TO TEXT IS KEPT, for the reason V202608131600 records: MJ substitutes an ABSENT scope
-- with the empty string, and comparing that against a `uniqueidentifier` column is a conversion
-- ERROR, so the query would fail loudly-but-wrongly instead of matching nothing. Cast to text it is
-- an ordinary non-match and the filter FAILS CLOSED, which is the required behaviour.
--
-- WHAT THE READ GRANT ALSO OPENS, stated so it is a decision rather than a surprise: MJ publishes a
-- generic `mjBizAppsFormsFormResponses` query for every entity, so `CanRead` makes that query
-- answerable by an anonymous session — filtered, by the filter below, to exactly the one row the
-- session's invite names. That row carries forensics columns (`AnonymousSessionID`, and
-- `SourceMetadata` with the salted IP hash) which the `resumeJSON` field does not expose. A
-- respondent reading their own row's forensics is acceptable; a respondent reading anybody else's
-- is what the filter prevents. Issue #137 will add `RecipientID` to the same row, readable the same
-- way, and that is the moment to revisit whether the filter should also project columns.
--
-- IDEMPOTENT AND SELF-HEALING, in the shape V202608131600 established: guarded column adds, guarded
-- INSERT plus absolute UPDATE for every filter record, set-based grants matched on (role name,
-- entity name) rather than on a permission-row id — `EntityPermission` has NO unique constraint on
-- (EntityID, RoleID), and on a host where a sibling app minted the role first both apps' rows
-- coexist for the same pair. Re-running changes nothing.
--
-- PLACEHOLDERS. Only the flyway default-schema and core-schema placeholders appear, which are the
-- only two `mj app install` supplies; `npm run lint:distribution` is the gate. The runtime token in
-- the filter text below is MJ's own (double-brace) and is NOT a Skyway placeholder — Skyway
-- substitutes only the dollar-brace form, so it ships through untouched, which is required.
--
-- ⚠️ RUN `npm run mj:codegen` AFTER APPLYING THIS. Both columns need their `EntityField` rows and
-- their generated entity properties; without the `EntityField` row `BaseEntity` silently drops the
-- value on every save, and the server code in this release writes both columns.
-- =============================================================================================

-- ── The role must be resolvable by name, asserted before anything below relies on it ───────────
-- Every statement below resolves the role BY NAME, because the id is not ours to assume: on a host
-- where a sibling app minted `Form Respondent` first, the 0.8.0 seed adopts that row and the
-- canonical id never exists. Zero rows would make every UPDATE match nothing, silently, and this
-- migration would report success having done nothing at all.
IF (SELECT COUNT(*) FROM [${mjSchema}].[Role] WHERE Name = N'Form Respondent') <> 1
    THROW 51115, 'MJ Forms: expected exactly ONE role named ''Form Respondent''. The 0.8.0 metadata seed creates or adopts it and V202608131600 hardened its grants — zero rows means the seed did not run or its role was removed, and this migration would otherwise report success while silently granting nothing.', 1;
GO

-- ── The two columns ───────────────────────────────────────────────────────────────────────────
-- One ADD per table (each adds one column). No index on the FK and no __mj_ timestamp columns:
-- CodeGen adds both, and hand-adding them here makes the next CodeGen run a diff.
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormResponse]')
                 AND name = N'FormDistributionID')
    ALTER TABLE [${flyway:defaultSchema}].[FormResponse]
        ADD [FormDistributionID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_FormResponse_FormDistribution] FOREIGN KEY
            REFERENCES [${flyway:defaultSchema}].[FormDistribution]([ID]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormDistribution]')
                 AND name = N'AllowDeviceResume')
    ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
        ADD [AllowDeviceResume] BIT NOT NULL
            CONSTRAINT [DF_FormDistribution_AllowDeviceResume] DEFAULT (1);
GO

-- Descriptions go through an NVARCHAR(4000) variable, never NVARCHAR(MAX): `sp_addextendedproperty`
-- declares @value as `sql_variant`, which cannot hold ANY of the MAX types — passing one fails the
-- whole batch with `Operand type clash` and takes the release's migration run with it.
DECLARE @distColumn NVARCHAR(4000) = N'The distribution this response was submitted through, stamped once when the row is created and never rewritten. A resume session is scoped to one FormResponse, and it must still be able to load the definition of the link it came through — so the row-level-security filter that permits that read needs a real column to name. Putting it on JSON_VALUE(SourceMetadata) instead would make a free-form JSON blob the authorization key. NULL on rows created before resume shipped; those rows are not resumable by either channel.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables  t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description' AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormResponse' AND c.name = N'FormDistributionID')
    EXEC sp_updateextendedproperty @name = N'MS_Description', @value = @distColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormResponse',
        @level2type = N'COLUMN', @level2name = N'FormDistributionID';
ELSE
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = @distColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormResponse',
        @level2type = N'COLUMN', @level2name = N'FormDistributionID';
GO

DECLARE @switchColumn NVARCHAR(4000) = N'Owner switch for same-device resume on this link. When 1 (the default) the respondent host mints a single-use device invite after the first partial save and holds its raw token in an HttpOnly cookie scoped to that form''s route, so reopening the link in the same browser restores the draft; every resume rotates the token. Set 0 for kiosks and shared devices: no device invite is minted, and any cookie a browser still holds is cleared without being redeemed. It does not affect the emailed resume link, which works on any device.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables  t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description' AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormDistribution' AND c.name = N'AllowDeviceResume')
    EXEC sp_updateextendedproperty @name = N'MS_Description', @value = @switchColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowDeviceResume';
ELSE
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = @switchColumn,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowDeviceResume';
GO

-- ── The two NEW row-level-security filters ────────────────────────────────────────────────────
-- Guarded INSERT then absolute UPDATE, so a re-run is self-healing and a record whose text drifted
-- is corrected. These are Forms' rows to define, exactly as the four V202608131600 owns are.

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0004-A1B2-4C3D-8E4F-000000000004')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0004-A1B2-4C3D-8E4F-000000000004', N'MJ Forms: Respondent Own Response', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Own Response',
    Description = N'The single Form Response a resume session''s magic-link invite was scoped to. Unlike the distribution filter beside it, this one isolates one RESPONDENT rather than one form: a resume invite''s ResourceID is a FormResponse primary key, so the scope claim names exactly one row. A public-link session''s scope is a distribution id — the primary key of a different table — so it matches no response row and reads zero. Note this grant also makes MJ''s generated Form Responses query answerable by the anonymous role, filtered to that one row, forensics columns (AnonymousSessionID, SourceMetadata with the salted IP hash) included; that is more than the resumeJSON field exposes and is accepted deliberately. Cast to text on purpose: an absent scope substitutes the EMPTY STRING, which against a uniqueidentifier column is a conversion error rather than a non-match, so the cast is what makes this fail CLOSED.',
    FilterText  = N'(CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'')'
WHERE ID = '7F0E0004-A1B2-4C3D-8E4F-000000000004';
GO

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[RowLevelSecurityFilter] WHERE ID = '7F0E0005-A1B2-4C3D-8E4F-000000000005')
    INSERT INTO [${mjSchema}].[RowLevelSecurityFilter] (ID, Name, Description, FilterText)
    VALUES ('7F0E0005-A1B2-4C3D-8E4F-000000000005', N'MJ Forms: Respondent Own Response Answers', N'', N'');

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Name        = N'MJ Forms: Respondent Own Response Answers',
    Description = N'The answers of the one Form Response a resume session is scoped to. Keyed on ResponseID, which is the same scope value the response filter matches on ID, so the two cannot disagree about which draft a session may read. Same deliberate cast to text, for the same fail-closed reason.',
    FilterText  = N'(CAST(ResponseID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'')'
WHERE ID = '7F0E0005-A1B2-4C3D-8E4F-000000000005';
GO

-- ── The two EXTENDED filters ──────────────────────────────────────────────────────────────────
-- Same ids, one OR clause each, and the whole predicate parenthesised (see the header). A resume
-- session's scope names a response, not a distribution or a version, so without these clauses the
-- resumed widget could read its own draft and then fail to load the form it belongs to.
--
-- The subselects read the app's own views through the flyway schema placeholder rather than a
-- literal schema name, so a host that installed Forms under a different schema still gets a correct
-- filter; Skyway resolves it at apply time and what lands in FilterText is the concrete schema.

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Description = N'The distribution this anonymous respondent may read: the one their public link was minted for, OR the one their resumed response was submitted through. Forms sets a public link''s invite ResourceID to the distribution id, so for a public-link session the scope claim IS the distribution; for a resume session the claim is a FormResponse id, and the second clause follows that row''s FormDistributionID back to its link. Cast to text deliberately: an absent scope substitutes the empty string, which against a uniqueidentifier column is a conversion error rather than a non-match — the cast makes it fail CLOSED. The whole predicate is parenthesised because MJ ANDs this onto the caller''s own filter, and an unparenthesised OR would bind as (caller AND first) OR second. The first clause scopes one form from another and does NOT separate two respondents to the same distribution, who share one scope value; the second names exactly one row.',
    FilterText  = N'(CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'' OR ID IN (SELECT FormDistributionID FROM [${flyway:defaultSchema}].vwFormResponses WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}''))'
WHERE ID = '7F0E0002-A1B2-4C3D-8E4F-000000000002';
GO

UPDATE [${mjSchema}].[RowLevelSecurityFilter]
SET Description = N'Versions the respondent may read: every version of the form their scoped distribution points at, OR the single version their resumed response was created on. The second clause is not redundant — a resumed draft may sit on a RETIRED version after the author republished, and the resume design re-stamps the current version on the next save rather than stranding the draft, which requires reading the old one first. ANDed onto the definition loader''s own FormID + Status=Published predicate, so a session still cannot reach another form''s published definition by supplying a different FormID. Same deliberate cast to text, and the same parenthesisation, as the distribution filter.',
    FilterText  = N'(FormID IN (SELECT FormID FROM [${flyway:defaultSchema}].vwFormDistributions WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}'') OR ID IN (SELECT FormVersionID FROM [${flyway:defaultSchema}].vwFormResponses WHERE CAST(ID AS NVARCHAR(450)) = ''{{ScopeResourceID}}''))'
WHERE ID = '7F0E0003-A1B2-4C3D-8E4F-000000000003';
GO

-- ── Attach the read grants ────────────────────────────────────────────────────────────────────
-- The contract is declared once and used twice (attach, then assert), so the two cannot drift.
DECLARE @ReadContract TABLE (
    EntityName NVARCHAR(255)    NOT NULL PRIMARY KEY,
    FilterID   UNIQUEIDENTIFIER NOT NULL,
    Fact       NVARCHAR(200)    NOT NULL
);
INSERT INTO @ReadContract (EntityName, FilterID, Fact) VALUES
    (N'MJ_BizApps_Forms: Form Responses',        '7F0E0004-A1B2-4C3D-8E4F-000000000004', N'SCOPE-FILTERED READ on Form Responses'),
    (N'MJ_BizApps_Forms: Form Response Answers', '7F0E0005-A1B2-4C3D-8E4F-000000000005', N'SCOPE-FILTERED READ on Form Response Answers');

-- Set-based and matched on (role name, entity name), never on a permission-row id: duplicates of
-- (EntityID, RoleID) are reachable in practice and MJ exempts the role from row-level security on
-- the FIRST unfiltered row it finds, so every matching row must be filtered, not merely one.
--
-- No INSERT path: the 0.8.0 seed creates the permission row for both response entities (it grants
-- CanCreate there) and V202608131600 asserts their presence, so a missing row means the seed did
-- not run — which the postcondition below reports as such rather than papering over.
UPDATE p
SET p.CanRead = 1, p.ReadRLSFilterID = c.FilterID
FROM [${mjSchema}].[EntityPermission] p
JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
JOIN @ReadContract          c ON c.EntityName = e.Name
WHERE r.Name = N'Form Respondent';

-- ── Postconditions ────────────────────────────────────────────────────────────────────────────
-- A security migration that half-applies and reports success is the worst available outcome.

-- 1. Both grants are present AND filtered. Checked positively, because the absence check below
--    passes vacuously when the rows do not exist at all — which is exactly what a
--    silently-matched-nothing run looks like.
DECLARE @Missing NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(c.Fact AS NVARCHAR(MAX)), N'; ')
    FROM @ReadContract c
    WHERE NOT EXISTS (
        SELECT 1
        FROM [${mjSchema}].[EntityPermission] p
        JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
        JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
        WHERE r.Name = N'Form Respondent'
          AND e.Name = c.EntityName
          AND p.CanRead = 1
          AND p.ReadRLSFilterID IS NOT NULL));

IF @Missing IS NOT NULL
BEGIN
    DECLARE @MissingMsg NVARCHAR(2048) =
        N'MJ Forms: the Form Respondent role is missing a required read grant, or holds it unfiltered — ' + @Missing +
        N'. The 0.8.0 metadata seed is what creates these permission rows (it grants CanCreate on both response entities); a missing row means that seed did not run on this host. Without the grant a resumed respondent cannot read their own draft and PublishedForm returns no resumeJSON; with the grant unfiltered, one shared anonymous principal could read EVERY response in the instance.';
    THROW 51113, @MissingMsg, 1;
END

-- 2. This role still holds NO unfiltered create or read on ANY Forms entity. Re-asserted here, not
--    inherited from V202608131600, because THIS file has just added read grants — and
--    `UserExemptFromRowLevelSecurity` returns TRUE on the FIRST unfiltered row it finds, so one
--    leftover re-opens the bypass however many filtered rows sit beside it.
--
--    ⚠️ SCOPED TO THIS APP'S ENTITIES, NEVER ROLE-WIDE. `Form Respondent` is a SHARED role:
--    bizapps-caliber grants it unfiltered reads on two core file-storage entities deliberately, so a
--    role-wide version of this check would be green standalone and would brick every co-install.
DECLARE @Unfiltered NVARCHAR(MAX) = (
    SELECT STRING_AGG(CAST(d.Detail AS NVARCHAR(MAX)), N'; ')
    FROM (
        SELECT DISTINCT e.Name + CASE WHEN p.CanCreate = 1 AND p.CreateRLSFilterID IS NULL
                                      THEN N' (unfiltered CREATE)' ELSE N' (unfiltered READ)' END AS Detail
        FROM [${mjSchema}].[EntityPermission] p
        JOIN [${mjSchema}].[Entity] e ON e.ID = p.EntityID
        JOIN [${mjSchema}].[Role]   r ON r.ID = p.RoleID
        WHERE r.Name  = N'Form Respondent'
          AND e.Name LIKE N'MJ[_]BizApps[_]Forms: %'
          AND ((p.CanCreate = 1 AND p.CreateRLSFilterID IS NULL)
            OR (p.CanRead   = 1 AND p.ReadRLSFilterID   IS NULL))
    ) d);

IF @Unfiltered IS NOT NULL
BEGIN
    DECLARE @UnfilteredMsg NVARCHAR(2048) =
        N'MJ Forms: the Form Respondent role holds an UNFILTERED grant on a Forms entity — ' + @Unfiltered +
        N'. ONE shared anonymous principal backs every respondent, so an unfiltered read is an instance-wide read and an unfiltered create is a write that never enters the submit pipeline. MJ exempts the role from row-level security on the FIRST unfiltered row it finds, so this stands regardless of the filtered rows beside it. Attach a scoped filter or remove the row — do not widen this check.';
    THROW 51114, @UnfilteredMsg, 1;
END
GO
