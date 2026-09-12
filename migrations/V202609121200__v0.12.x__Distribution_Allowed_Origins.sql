-- =============================================================================================
-- MJ Forms v0.12.x — a distribution may name the origins permitted to embed it (#203)
-- =============================================================================================
-- WHAT THIS OPENS. Forms had NO origin control of any kind. `grep -rn "AllowedOrigins"
-- packages migrations` returned nothing, and `grep -rni "cors|access-control-allow-origin"
-- packages/Server/src` returned nothing outside tests. The only lever reaching a Forms request
-- was MJ core's host-wide `cors.allowedOrigins` (default `['*']`), which is all-or-nothing across
-- every app sharing the host and cannot express "this link may be embedded on customer A's site".
-- The product ruling is that the widget embeds on customer-controlled third-party sites, so the
-- authorization unit has to be the DISTRIBUTION — the thing a customer is actually given.
--
-- WHY A REAL COLUMN AND NOT A KEY IN AN EXISTING JSON BLOB. This value is an authorization input:
-- a gate on the public submit path reads it on every request, and the respondent-host door turns it
-- into a `Content-Security-Policy` header. Forms' own precedent for exactly this reasoning is
-- `V202609091600`, which added `FormResponse.FormDistributionID` rather than reading the same fact
-- out of `SourceMetadata` with `JSON_VALUE`: a free-form blob the application rewrites on every
-- save is not a thing to key authorization on. `FormDistribution` is also where the sibling
-- deployment-shaped switches already live (`CaptchaRequired`, `AllowDeviceResume`), which is what
-- makes this the right table rather than a new one.
--
-- THE CONTAINER IS A JSON ARRAY, AND THAT IS THE ONE DELIBERATE DIVERGENCE FROM CALIBER.
-- `bizapps-caliber`'s `Step.AllowedOrigins` (V202609021400) holds a KEYED JSON OBJECT, because a
-- Caliber step inherits its config down a company -> step chain and a child must be able to add one
-- origin, keep inheriting the rest, and tombstone an inherited one with `__suppress`. A keyed list
-- is the shape that shared merge machinery consumes. A Forms distribution inherits from nothing —
-- it is a leaf, authored whole, with no parent to merge against — so the keys would name a
-- vocabulary with nothing to say and every author would have to learn it to write `{}` as a value.
-- The GRAMMAR of a single entry is Caliber's, unchanged and deliberately so (see
-- `packages/Entities/src/contracts/allowed-origins.ts`, which cites its counterpart): a full browser
-- origin, matched exactly, no wildcards. Only the container differs, and only because the reason
-- Caliber's container exists does not exist here.
--
-- NULL AND EMPTY MEAN UNRESTRICTED, which is what keeps every live embed working — every existing
-- distribution is NULL and none of them changes behaviour. Once a distribution authors ANY origin
-- the check is fail-CLOSED for that distribution: an absent or unmatched `Origin` is a refusal, not
-- a warning, because an allowlist that admits on no-match is decorative. An authored value that
-- parses to NOTHING USABLE (invalid JSON, or every entry refused by the grammar) is likewise a
-- refusal of everything rather than a fall back to unrestricted — an author who wrote something
-- plainly meant to restrict something, and silently ignoring them is the worst of the three answers.
--
-- WHAT IT IS NOT. Defense in depth behind the magic link, not a replacement for it. A distribution's
-- link is anonymous and multi-use by construction, so a leaked link is replayable from anywhere
-- until it closes; an allowlist bounds that to pages the author named. Nothing here weakens the case
-- for `CloseAt` / `MaxResponses`.
--
-- No __mj_* timestamp columns and no index: CodeGen adds the former and there is nothing here to
-- index (the value is read only after the row has been found by Slug). `sp_addextendedproperty` on
-- the business column, through an NVARCHAR(4000) variable — `@value` is `sql_variant`, which cannot
-- hold ANY MAX type, and passing one fails the whole batch with `Operand type clash`.
--
-- THIS MIGRATION IS SELF-SUFFICIENT ON A HOST THAT ONLY RUNS MIGRATIONS. The column needs an
-- `EntityField` row and regenerated CRUD procedures before anything can write it, and a host
-- running `mj app install` never runs CodeGen — so both travel in the shipped SQL below the
-- column. A developer working in THIS repo still runs `npm run mj:codegen` afterwards, because
-- that is what regenerates the TypeScript; the SQL half is already here.
-- =============================================================================================

-- ── The column ────────────────────────────────────────────────────────────────────────────────
-- Guarded, so a re-run on a host that already has it changes nothing.
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[FormDistribution]')
                 AND name = N'AllowedOrigins')
    ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
        ADD [AllowedOrigins] NVARCHAR(MAX) NULL;
GO

DECLARE @allowedOrigins NVARCHAR(4000) = N'JSON array of the browser ORIGINS permitted to embed this distribution and call the public form API with its link — e.g. ["https://careers.acme.com","https://acme.com:8443"]. Values are full origins exactly as a browser sends them (scheme, host, optional port), matched EXACTLY after case-normalising scheme and host. No wildcards and no subdomain implication: "acme.com" does not admit "https://careers.acme.com", and an author needing three subdomains names three origins — a pattern is refused at authoring time rather than accepted and ignored. Plain http is accepted only for loopback hosts, so a local harness is authorable without a proxy. NULL or an empty array (the default, and every distribution until an author sets one) means UNRESTRICTED, so no existing embed changes behaviour. Once ANY origin is authored the distribution is fail-closed: the respondent host page is served with a Content-Security-Policy frame-ancestors directive naming exactly these origins, and a public API call whose Origin is neither this API''s own origin nor one of them is refused. An authored value that parses to nothing usable is a refusal of everything, never a fall back to unrestricted. Defense in depth behind the magic link, not a replacement for it: it bounds where a leaked multi-use link can be replayed. The array container differs deliberately from the keyed object bizapps-caliber uses for Step.AllowedOrigins, which is keyed only because Caliber steps inherit and must tombstone an inherited origin; a Forms distribution is a leaf and inherits from nothing. The per-entry grammar is identical.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables  t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description' AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormDistribution' AND c.name = N'AllowedOrigins')
    EXEC sp_updateextendedproperty @name = N'MS_Description', @value = @allowedOrigins,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowedOrigins';
ELSE
    EXEC sp_addextendedproperty @name = N'MS_Description', @value = @allowedOrigins,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'AllowedOrigins';
GO

-- =============================================================================================
-- CodeGen output (appended) — the column is unwritable without this half
-- =============================================================================================
-- A column add is only half a change here, and `npm run lint:migration-order` is what says so out
-- loud: `spCreateFormDistribution` / `spUpdateFormDistribution` are generated with one parameter
-- per column, so a migration that adds a column without regenerating them ships a column the
-- entity layer can never write. Worse than merely inert: once the `EntityField` row exists,
-- `BaseEntity` passes the new field and every save of the entity fails with "too many arguments
-- specified". The gate names both procedures by the LAST migration that defined them, which is
-- why the fix belongs here and not as an edit to V202609091600.
--
-- The three `spUpdate…FromSchema` calls come first because they are what mints the `EntityField`
-- row on a host that has only ever run migrations. CodeGen does this locally; another host runs
-- `mj app install`, which runs migrations and nothing else, so the metadata has to travel in the
-- shipped SQL. This is the shape V202609091600 established for exactly the same reason.
--
-- Everything below the EXECs is `mj codegen`'s own output for this one entity, taken verbatim from
-- the run that produced this release's generated TypeScript, against a clean-room database built
-- from shipped migrations only. Scoped to `FormDistribution`: the same run also re-emitted the
-- FormResponse block, which V202609091600 already shipped unchanged, and re-shipping it would put
-- churn in a release for no behaviour. Only `${flyway:defaultSchema}` appears, and no host-minted
-- id — `npm run lint:distribution` is the gate on both.
-- =============================================================================================

-- ── The entity registration, then the EntityField rows, then the schema-derived refresh ───────
-- ORDER IS LOAD-BEARING and is `V202606301305`'s, which is the only column-add in this repo whose
-- field is present on a migrations-only host: entities first (so an EntityID resolves), then the
-- INSERTs, then the refresh that fills in what the schema knows.
--
-- `spUpdateExistingEntityFieldsFromSchema` does what its name says — it UPDATES fields that already
-- have a row. It creates none. On a developer's box that never shows, because `mj codegen` mints
-- missing rows in TypeScript as a side effect of the same command that builds the views; on a host,
-- `mj app install` runs migrations and never runs CodeGen, so a row that no shipped SQL inserts
-- simply never exists. `BaseEntity.Set` on such a field is a SILENT NO-OP: the entity never goes
-- dirty and the save reports success having written nothing.
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema]     @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO

-- Four rows, not one. THIS MIGRATION'S column is `AllowedOrigins`; the other three are the same
-- defect, on the same two Forms entities, shipped by `V202609091600` three days earlier — it added
-- `FormDistribution.AllowDeviceResume` and `FormResponse.FormDistributionID` and inserted no
-- EntityField row for either, so both are unwritable on every host built from shipped migrations.
-- Measured on 2026-09-12, which is how this was found: `MJ_ATS_Dev` (a database CodeGen has run
-- against) HAS `AllowDeviceResume`; a database built from this repo's migrations alone does not,
-- while `PublicLinkToken` — the one column whose migration ships its INSERT — is present in both.
--
-- Healed here rather than filed because it is one defect with three instances, on the table this
-- change is already adding a fourth column to, and because leaving it would ship a release in which
-- two of `FormDistribution`'s four switches silently discard writes. `migrations/README.md` forbids
-- editing a merged migration; a NEW migration carrying the missing output is the sanctioned repair,
-- which is what `V202608191300` and `V202608191400` are.
--
-- Every block is CodeGen's own, guarded on the field id OR the natural key (EntityID, Name), so a
-- host that already minted its own row keeps it and a re-run changes nothing. The two EntityID
-- literals are this repo's own shipped ids — `B202606281200` seeds both — which is what
-- `npm run lint:distribution` CHECK 7 verifies.
--
-- ONE DELIBERATE EDIT TO CODEGEN'S OUTPUT: `[Sequence]` is computed, not the captured literal.
-- CodeGen emitted `18` for `AllowedOrigins`, which is the number that was free on the database it
-- ran against — one where CodeGen had already inserted the other three rows and pushed the virtual
-- `Form` field out of the way. On a host that has only ever run migrations, `Form` still occupies
-- 18, and the literal fails the whole chain on `UQ_EntityField_EntityID_Sequence`:
--
--   Failed at batch 4/18: Violation of UNIQUE KEY constraint 'UQ_EntityField_EntityID_Sequence'.
--   The duplicate key value is (1fc60bda-25b8-473b-ace5-1238670d3535, 18).
--
-- That is not hypothetical — it is what this file did on 2026-09-12 the first time it was applied
-- to a database built from shipped migrations alone, and it is the same lesson
-- `.claude/rules/migrations-codegen.md` draws about captured entity ids: a value CodeGen captured
-- is a statement about the generating database, not a portable one, and "it applied cleanly here"
-- is never evidence. `MAX(Sequence) + 1` is correct on both populations. Sequence only orders
-- fields on a generated form, and a host's next CodeGen run re-sequences anyway.
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a6472dd2-acf7-49ec-9957-cfa83f30fcb6' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'AllowDeviceResume')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6472dd2-acf7-49ec-9957-cfa83f30fcb6',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'),
            'AllowDeviceResume',
            'Allow Device Resume',
            'Owner switch for same-device resume on this link. When 1 (the default) the respondent host mints a single-use device invite after the first partial save and holds its raw token in an HttpOnly cookie scoped to that form''s route, so reopening the link in the same browser restores the draft; every resume rotates the token. Set 0 for kiosks and shared devices: no device invite is minted, and any cookie a browser still holds is cleared without being redeemed. It does not affect the emailed resume link, which works on any device.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4ac66338-e47e-465c-82ac-21061ed92df5' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'AllowedOrigins')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ac66338-e47e-465c-82ac-21061ed92df5',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535'),
            'AllowedOrigins',
            'Allowed Origins',
            'JSON array of the browser ORIGINS permitted to embed this distribution and call the public form API with its link — e.g. ["https://careers.acme.com","https://acme.com:8443"]. Values are full origins exactly as a browser sends them (scheme, host, optional port), matched EXACTLY after case-normalising scheme and host. No wildcards and no subdomain implication: "acme.com" does not admit "https://careers.acme.com", and an author needing three subdomains names three origins — a pattern is refused at authoring time rather than accepted and ignored. Plain http is accepted only for loopback hosts, so a local harness is authorable without a proxy. NULL or an empty array (the default, and every distribution until an author sets one) means UNRESTRICTED, so no existing embed changes behaviour. Once ANY origin is authored the distribution is fail-closed: the respondent host page is served with a Content-Security-Policy frame-ancestors directive naming exactly these origins, and a public API call whose Origin is neither this API''s own origin nor one of them is refused. An authored value that parses to nothing usable is a refusal of everything, never a fall back to unrestricted. Defense in depth behind the magic link, not a replacement for it: it bounds where a leaked multi-use link can be replayed. The array container differs deliberately from the keyed object bizapps-caliber uses for Step.AllowedOrigins, which is keyed only because Caliber steps inherit and must tombstone an inherited origin; a Forms distribution is a leaf and inherits from nothing. The per-entry grammar is identical.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '28a7247c-d780-488f-a6e4-5da898da715c' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'FormDistributionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '28a7247c-d780-488f-a6e4-5da898da715c',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA'),
            'FormDistributionID',
            'Form Distribution ID',
            'The distribution this response was submitted through, stamped once when the row is created and never rewritten. A resume session is scoped to one FormResponse, and it must still be able to load the definition of the link it came through — so the row-level-security filter that permits that read needs a real column to name. Putting it on JSON_VALUE(SourceMetadata) instead would make a free-form JSON blob the authorization key. NULL on rows created before resume shipped; those rows are not resumable by either channel.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '1FC60BDA-25B8-473B-ACE5-1238670D3535',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0fce1dbc-5bc4-4ae1-87ed-866e41f1147e' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'FormDistribution')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0fce1dbc-5bc4-4ae1-87ed-866e41f1147e',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            (SELECT ISNULL(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA'),
            'FormDistribution',
            'Form Distribution',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
GO

EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
GO
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase]         @ExcludedSchemaNames='sys,staging', @IncludedSchemaNames='${flyway:defaultSchema}';
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
    @AllowDeviceResume bit = NULL,
    @AllowedOrigins_Clear bit = 0,
    @AllowedOrigins nvarchar(MAX) = NULL
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
                [AllowDeviceResume],
                [AllowedOrigins]
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
                ISNULL(@AllowDeviceResume, 1),
                CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, NULL) END
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
                [AllowDeviceResume],
                [AllowedOrigins]
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
                ISNULL(@AllowDeviceResume, 1),
                CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, NULL) END
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
    @AllowDeviceResume bit = NULL,
    @AllowedOrigins_Clear bit = 0,
    @AllowedOrigins nvarchar(MAX) = NULL
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
        [AllowDeviceResume] = ISNULL(@AllowDeviceResume, [AllowDeviceResume]),
        [AllowedOrigins] = CASE WHEN @AllowedOrigins_Clear = 1 THEN NULL ELSE ISNULL(@AllowedOrigins, [AllowedOrigins]) END
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
