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
-- two surfaces would keep publishing the old claim.
--
-- The `EntityField` rows are addressed by the IDs `V202606301305` and the baseline inserted, not by
-- a fresh GUID: `__mj.EntityField` has no unique constraint on (EntityID, Name), so an insert-shaped
-- fix would silently duplicate the field rather than correct it.

-- ---- FormDistribution.PublicLinkToken ----

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
        @name = N'MS_Description',
        @value = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written when the link is provisioned and cleared when its credential is revoked, so NULL means this link holds no working credential. Clearing it on an otherwise-live link is a REISSUE REQUEST: the server-side lifecycle hook revokes the linked invite and mints a replacement, leaving Slug (and therefore every shared URL) unchanged.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'PublicLinkToken';
ELSE
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written when the link is provisioned and cleared when its credential is revoked, so NULL means this link holds no working credential. Clearing it on an otherwise-live link is a REISSUE REQUEST: the server-side lifecycle hook revokes the linked invite and mints a replacement, leaving Slug (and therefore every shared URL) unchanged.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'PublicLinkToken';
GO

UPDATE [${mjSchema}].[EntityField]
SET Description = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written when the link is provisioned and cleared when its credential is revoked, so NULL means this link holds no working credential. Clearing it on an otherwise-live link is a REISSUE REQUEST: the server-side lifecycle hook revokes the linked invite and mints a replacement, leaving Slug (and therefore every shared URL) unchanged.'
WHERE ID = '7DE1A89C-4880-4E08-A49E-ADF410C8FC44';
GO

-- ---- FormDistribution.MagicLinkInviteID ----

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
        @name = N'MS_Description',
        @value = N'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution. Set while the distribution is a live, linkable public channel and cleared once that invite has been revoked, so this column and PublicLinkToken are written and cleared together as one credential.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';
ELSE
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution. Set while the distribution is a live, linkable public channel and cleared once that invite has been revoked, so this column and PublicLinkToken are written and cleared together as one credential.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FormDistribution',
        @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';
GO

UPDATE [${mjSchema}].[EntityField]
SET Description = N'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution. Set while the distribution is a live, linkable public channel and cleared once that invite has been revoked, so this column and PublicLinkToken are written and cleared together as one credential.'
WHERE ID = 'B77F00D4-F944-4023-9A5E-3EE46E242B6A';
GO
