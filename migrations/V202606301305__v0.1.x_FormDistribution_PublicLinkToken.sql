-- =============================================================================
-- MJ Forms — FormDistribution.PublicLinkToken (Phase 1)
-- =============================================================================
-- Versioned (V) migration layered on the B-baseline schema file. Adds the raw,
-- redeemable magic-link token to a FormDistribution so a minted public link
-- actually has a shareable, redeemable URL.
--
-- WHY a raw token is persisted (and not just the hash on the invite row):
--   A public form link is low-secrecy BY DESIGN — the URL is meant to be shared
--   (homepage button, email, QR). The magic-link redeem path needs the RAW token
--   in the URL (/magic-link/redeem?token=<token>) to establish the anonymous,
--   distribution-scoped session. The invite row still stores ONLY the SHA-256
--   hash (unchanged); the raw token lives here so the builder can surface the
--   public URL / embed / QR. This is the deliberate exception for shareable
--   public links — do NOT use this column for any secret/identified flow.
--
-- Conventions (see CLAUDE.md / migrations rules):
--   * Single ADD ALTER (one business column).
--   * ${flyway:defaultSchema} placeholder for the __mj_BizAppsForms schema.
--   * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds them.
--   * NO foreign-key indexes — not an FK.
--   * sp_addextendedproperty on the business column → CodeGen field description.
--
-- NOTE: CodeGen SQL output is APPENDED below this hand-DDL by `npm run mj:codegen`
--       (devs don't run codegen on install). Do NOT hand-edit the appended block.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[FormDistribution]
    ADD [PublicLinkToken] NVARCHAR(255) NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms',
    @level1type = N'TABLE',  @level1name = N'FormDistribution',
    @level2type = N'COLUMN', @level2name = N'PublicLinkToken';
GO
