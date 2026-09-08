-- The share-link credential columns now have a lifecycle, and their descriptions said they did not.
--
-- No schema changes here: no columns, no constraints, no data. This migration exists because
-- `FormDistribution.PublicLinkToken`'s description asserted the exact behaviour bizapps-forms#104
-- replaced — "Written once after a successful mint and left unchanged thereafter" — and that
-- sentence is now not merely stale but actively misleading. It is the one place a writer that is
-- not the builder (an Action, an import, a hand-run UPDATE) would look, and it tells them that
-- clearing the column means nothing. Clearing it is now the documented way to rotate a leaked
-- credential: the server-side `FormDistributionEntityServer` hook reads a live link with an invite
-- but no token as a reissue request, revokes the old `__mj.MagicLinkInvite` and mints a
-- replacement under the unchanged slug.
--
-- Column descriptions reach TypeScript (CodeGen writes them into the generated entity classes) and
-- the Explorer field UI through `__mj.EntityField.Description`, so both the extended property and
-- that row are updated — otherwise the next CodeGen run would find them disagreeing and one of the
-- two surfaces would keep publishing the old claim. **Run `npm run mj:codegen` after applying this**
-- so the generated entity classes carry the corrected text too.
--
-- The `EntityField` rows are addressed by the IDs `V202606301305` and the baseline inserted, not by
-- a fresh GUID: `__mj.EntityField` has no unique constraint on (EntityID, Name), so an insert-shaped
-- fix would silently duplicate the field rather than correct it.
--
-- Each description is written ONCE, into a variable used by all three writes. The three spellings
-- this replaces (update-property / add-property / EntityField) were three chances for the text to
-- drift apart, which is a peculiar way to ship a fix whose entire purpose is that two copies of a
-- sentence had gone out of step. Variables do not survive a batch separator, so each column gets
-- its own `GO`-delimited batch.
--
-- The variables are NVARCHAR(4000), NOT NVARCHAR(MAX), and that is load-bearing rather than
-- stylistic. `sp_addextendedproperty` / `sp_updateextendedproperty` declare `@value` as
-- `sql_variant`, and `sql_variant` cannot hold ANY of the MAX types: passing one fails the whole
-- batch with `Operand type clash: nvarchar(max) is incompatible with sql_variant`, so the
-- migration would abort on its first statement and take the release's migration run with it.
-- Every other migration in this directory passes a string LITERAL — which SQL Server types as
-- `nvarchar(n)` — which is why routing the text through a variable is the first thing here to
-- meet the restriction. 4000 is the ceiling `sql_variant` allows for `nvarchar`, and an extended
-- property is capped at 7500 bytes regardless; both descriptions below are well under 700 chars.

-- ---- FormDistribution.PublicLinkToken ----

DECLARE @tokenDescription NVARCHAR(4000) = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written when the link is provisioned and cleared when its credential is revoked, so NULL means this link holds no working credential. Clearing it on an otherwise-live link is a REISSUE REQUEST: the server-side lifecycle hook revokes the linked invite and mints a replacement, leaving Slug (and therefore every shared URL) unchanged.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description'
      AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormDistribution'
      AND c.name = N'PublicLinkToken'
)
    EXEC sp_updateextendedproperty
        @name = N'MS_Description', @value = @tokenDescription,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'PublicLinkToken';
ELSE
    EXEC sp_addextendedproperty
        @name = N'MS_Description', @value = @tokenDescription,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'PublicLinkToken';

UPDATE [${mjSchema}].[EntityField]
SET Description = @tokenDescription
WHERE ID = '7DE1A89C-4880-4E08-A49E-ADF410C8FC44';
GO

-- ---- FormDistribution.MagicLinkInviteID ----

DECLARE @inviteDescription NVARCHAR(4000) = N'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution. Set while the distribution is a live, linkable public channel and cleared once that invite has been revoked, so this column and PublicLinkToken are written and cleared together as one credential.';

IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.columns c ON c.object_id = ep.major_id AND c.column_id = ep.minor_id
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE ep.name = N'MS_Description'
      AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'FormDistribution'
      AND c.name = N'MagicLinkInviteID'
)
    EXEC sp_updateextendedproperty
        @name = N'MS_Description', @value = @inviteDescription,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';
ELSE
    EXEC sp_addextendedproperty
        @name = N'MS_Description', @value = @inviteDescription,
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';

UPDATE [${mjSchema}].[EntityField]
SET Description = @inviteDescription
WHERE ID = 'B77F00D4-F944-4023-9A5E-3EE46E242B6A';
GO
