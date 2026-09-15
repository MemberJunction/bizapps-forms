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

-- =============================================================================================
-- CodeGen output (appended)
-- =============================================================================================
-- Generated by `mj codegen` against a CLEAN database carrying only what this repo ships, after the
-- DDL above had been applied. Appended for the reason `V202608252340` records: the column adds
-- above are useless without them. `spCreate`/`spUpdate` are generated with one parameter per
-- column, so the moment the new `EntityField` rows exist, EVERY save of these two entities fails
-- with "too many arguments specified" until the procedures are regenerated — which is what
-- `npm run lint:migrations` refuses to let ship.
--
-- WHAT WAS TAKEN FROM THE GENERATOR AND WHAT WAS NOT.
--
-- TAKEN, verbatim: the FK indexes, both base views, and the six spCreate/spUpdate/spDelete
-- procedures. These are pure schema. CodeGen already emits them against `${flyway:defaultSchema}`,
-- so they ship correctly on a host whose Forms schema is named something else.
--
-- NOT TAKEN: the generator's literal `EntityField` INSERT blocks. They carry ids minted against
-- the database CodeGen happened to introspect, and shipping a generated id as a literal is exactly
-- how #155 shipped one host's `FormScreen` entity id to everybody else. NO migration in this repo
-- ships `EntityField` rows — `V202608252340`, the precedent this append follows, ships zero — and
-- neither does any `Metadata_Sync` here. The rows for the two new columns are created when the
-- host runs `mj codegen` after migrating, which is what the banner at the top of this file already
-- instructs and what CLAUDE.md requires after any schema change. Do not add them here.
--
-- The three refresh procedures below are NOT what creates those rows, and are not here for that:
-- `spUpdateExistingEntityFieldsFromSchema` updates fields that already exist (type, nullability,
-- length) so the DDL above cannot leave stale metadata behind. Verified rather than assumed — a
-- fresh apply of this migration alone leaves both new `EntityField` rows absent, and running
-- CodeGen afterwards creates them.
--
-- REWRITTEN: `spUpdateEntityFieldRelatedEntityNameFieldMap`, which CodeGen emits keyed on the
-- `EntityField` id it had just minted (`4BA3CAC4-…`). That id does not exist on any other host.
-- Resolved by NATURAL KEY below — entity name plus field name — which is the correction #155
-- established. Guarded on NULL so a host that has not yet grown the field is skipped rather than
-- failed.
-- =============================================================================================

-- ── Derive the metadata for the two new columns from the schema itself ────────────────────────
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema]    @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase]        @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO

/* Index for Foreign Keys for FormDistribution */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormDistribution
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormDistribution_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormDistribution]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormDistribution_FormID ON [${flyway:defaultSchema}].[FormDistribution] ([FormID]);

/* Base View SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: vwFormDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Distributions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormDistribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormDistributions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormDistributions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormDistributions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormDistribution] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: Permissions for vwFormDistributions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormDistributions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spCreateFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormDistribution]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Name nvarchar(255),
    @Slug_Clear bit = 0,
    @Slug nvarchar(255) = NULL,
    @ChannelType nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @OpenAt_Clear bit = 0,
    @OpenAt datetimeoffset = NULL,
    @CloseAt_Clear bit = 0,
    @CloseAt datetimeoffset = NULL,
    @MaxResponses_Clear bit = 0,
    @MaxResponses int = NULL,
    @ResponseCount int = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @CaptchaRequired bit = NULL,
    @IsActive bit = NULL,
    @PublicLinkToken_Clear bit = 0,
    @PublicLinkToken nvarchar(255) = NULL,
    @AllowDeviceResume bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormDistribution]
            (
                [ID],
                [FormID],
                [Name],
                [Slug],
                [ChannelType],
                [Status],
                [OpenAt],
                [CloseAt],
                [MaxResponses],
                [ResponseCount],
                [MagicLinkInviteID],
                [CaptchaRequired],
                [IsActive],
                [PublicLinkToken],
                [AllowDeviceResume]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @Name,
                CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, NULL) END,
                ISNULL(@ChannelType, 'PublicLink'),
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, NULL) END,
                CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, NULL) END,
                CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, NULL) END,
                ISNULL(@ResponseCount, 0),
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@CaptchaRequired, 0),
                ISNULL(@IsActive, 1),
                CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, NULL) END,
                ISNULL(@AllowDeviceResume, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormDistribution]
            (
                [FormID],
                [Name],
                [Slug],
                [ChannelType],
                [Status],
                [OpenAt],
                [CloseAt],
                [MaxResponses],
                [ResponseCount],
                [MagicLinkInviteID],
                [CaptchaRequired],
                [IsActive],
                [PublicLinkToken],
                [AllowDeviceResume]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @Name,
                CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, NULL) END,
                ISNULL(@ChannelType, 'PublicLink'),
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, NULL) END,
                CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, NULL) END,
                CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, NULL) END,
                ISNULL(@ResponseCount, 0),
                CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, NULL) END,
                ISNULL(@CaptchaRequired, 0),
                ISNULL(@IsActive, 1),
                CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, NULL) END,
                ISNULL(@AllowDeviceResume, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormDistributions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spUpdateFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormDistribution]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Slug_Clear bit = 0,
    @Slug nvarchar(255) = NULL,
    @ChannelType nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @OpenAt_Clear bit = 0,
    @OpenAt datetimeoffset = NULL,
    @CloseAt_Clear bit = 0,
    @CloseAt datetimeoffset = NULL,
    @MaxResponses_Clear bit = 0,
    @MaxResponses int = NULL,
    @ResponseCount int = NULL,
    @MagicLinkInviteID_Clear bit = 0,
    @MagicLinkInviteID uniqueidentifier = NULL,
    @CaptchaRequired bit = NULL,
    @IsActive bit = NULL,
    @PublicLinkToken_Clear bit = 0,
    @PublicLinkToken nvarchar(255) = NULL,
    @AllowDeviceResume bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormDistribution]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Name] = ISNULL(@Name, [Name]),
        [Slug] = CASE WHEN @Slug_Clear = 1 THEN NULL ELSE ISNULL(@Slug, [Slug]) END,
        [ChannelType] = ISNULL(@ChannelType, [ChannelType]),
        [Status] = ISNULL(@Status, [Status]),
        [OpenAt] = CASE WHEN @OpenAt_Clear = 1 THEN NULL ELSE ISNULL(@OpenAt, [OpenAt]) END,
        [CloseAt] = CASE WHEN @CloseAt_Clear = 1 THEN NULL ELSE ISNULL(@CloseAt, [CloseAt]) END,
        [MaxResponses] = CASE WHEN @MaxResponses_Clear = 1 THEN NULL ELSE ISNULL(@MaxResponses, [MaxResponses]) END,
        [ResponseCount] = ISNULL(@ResponseCount, [ResponseCount]),
        [MagicLinkInviteID] = CASE WHEN @MagicLinkInviteID_Clear = 1 THEN NULL ELSE ISNULL(@MagicLinkInviteID, [MagicLinkInviteID]) END,
        [CaptchaRequired] = ISNULL(@CaptchaRequired, [CaptchaRequired]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [PublicLinkToken] = CASE WHEN @PublicLinkToken_Clear = 1 THEN NULL ELSE ISNULL(@PublicLinkToken, [PublicLinkToken]) END,
        [AllowDeviceResume] = ISNULL(@AllowDeviceResume, [AllowDeviceResume])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormDistributions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormDistributions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormDistribution] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormDistribution table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormDistribution]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormDistribution];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormDistribution
ON [${flyway:defaultSchema}].[FormDistribution]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormDistribution]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormDistribution] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Distributions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Distributions
-- Item: spDeleteFormDistribution
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormDistribution
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormDistribution]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormDistribution];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormDistribution]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormDistribution]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Distributions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormDistribution] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for FormResponse */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_FormID ON [${flyway:defaultSchema}].[FormResponse] ([FormID]);

-- Index for foreign key FormVersionID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_FormVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_FormVersionID ON [${flyway:defaultSchema}].[FormResponse] ([FormVersionID]);

-- Index for foreign key RespondentPersonID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_RespondentPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_RespondentPersonID ON [${flyway:defaultSchema}].[FormResponse] ([RespondentPersonID]);

-- Index for foreign key FormDistributionID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_FormDistributionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_FormDistributionID ON [${flyway:defaultSchema}].[FormResponse] ([FormDistributionID]);


/* Related-entity name-field map for FormResponse.FormDistributionID — by natural key, not by the
   generated EntityField id. This is what gives `vwFormResponses` its `FormDistribution` name
   column, which the generated entity type exposes and the dashboard's row type requires. */
DECLARE @FormResponseDistributionFieldID UNIQUEIDENTIFIER = (
    SELECT ef.[ID]
      FROM [${mjSchema}].[EntityField] ef
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = ef.[EntityID]
     WHERE e.[Name]  = N'MJ_BizApps_Forms: Form Responses'
       AND ef.[Name] = N'FormDistributionID');

IF @FormResponseDistributionFieldID IS NOT NULL
    EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap]
         @EntityFieldID = @FormResponseDistributionFieldID,
         @RelatedEntityNameFieldMap = 'FormDistribution';
GO

/* Base View SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: vwFormResponses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Responses
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormResponse
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormResponses]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormResponses];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormResponses]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    mjBizAppsCommonPerson_RespondentPersonID.[DisplayName] AS [RespondentPerson],
    mjBizAppsFormsFormDistribution_FormDistributionID.[Name] AS [FormDistribution]
FROM
    [${flyway:defaultSchema}].[FormResponse] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_RespondentPersonID
  ON
    [f].[RespondentPersonID] = mjBizAppsCommonPerson_RespondentPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormDistribution] AS mjBizAppsFormsFormDistribution_FormDistributionID
  ON
    [f].[FormDistributionID] = mjBizAppsFormsFormDistribution_FormDistributionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: Permissions for vwFormResponses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spCreateFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponse]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @FormVersionID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @RespondentPersonID_Clear bit = 0,
    @RespondentPersonID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @SubmittedAt_Clear bit = 0,
    @SubmittedAt datetimeoffset = NULL,
    @SourceMetadata_Clear bit = 0,
    @SourceMetadata nvarchar(MAX) = NULL,
    @FormDistributionID_Clear bit = 0,
    @FormDistributionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormResponse]
            (
                [ID],
                [FormID],
                [FormVersionID],
                [Status],
                [AnonymousSessionID],
                [RespondentPersonID],
                [StartedAt],
                [SubmittedAt],
                [SourceMetadata],
                [FormDistributionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @FormVersionID,
                ISNULL(@Status, 'Partial'),
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, NULL) END,
                CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, NULL) END,
                CASE WHEN @FormDistributionID_Clear = 1 THEN NULL ELSE ISNULL(@FormDistributionID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormResponse]
            (
                [FormID],
                [FormVersionID],
                [Status],
                [AnonymousSessionID],
                [RespondentPersonID],
                [StartedAt],
                [SubmittedAt],
                [SourceMetadata],
                [FormDistributionID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @FormVersionID,
                ISNULL(@Status, 'Partial'),
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, NULL) END,
                CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, NULL) END,
                CASE WHEN @FormDistributionID_Clear = 1 THEN NULL ELSE ISNULL(@FormDistributionID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormResponses] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spUpdateFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponse]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @FormVersionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @RespondentPersonID_Clear bit = 0,
    @RespondentPersonID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @SubmittedAt_Clear bit = 0,
    @SubmittedAt datetimeoffset = NULL,
    @SourceMetadata_Clear bit = 0,
    @SourceMetadata nvarchar(MAX) = NULL,
    @FormDistributionID_Clear bit = 0,
    @FormDistributionID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponse]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [FormVersionID] = ISNULL(@FormVersionID, [FormVersionID]),
        [Status] = ISNULL(@Status, [Status]),
        [AnonymousSessionID] = CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, [AnonymousSessionID]) END,
        [RespondentPersonID] = CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, [RespondentPersonID]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [SubmittedAt] = CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, [SubmittedAt]) END,
        [SourceMetadata] = CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, [SourceMetadata]) END,
        [FormDistributionID] = CASE WHEN @FormDistributionID_Clear = 1 THEN NULL ELSE ISNULL(@FormDistributionID, [FormDistributionID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormResponses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormResponses]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponse] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormResponse table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormResponse]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormResponse];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormResponse
ON [${flyway:defaultSchema}].[FormResponse]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponse]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormResponse] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spDeleteFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponse]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormResponse]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponse] TO [cdp_Developer], [cdp_Integration];

