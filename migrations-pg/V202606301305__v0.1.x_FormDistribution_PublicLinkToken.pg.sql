-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606301305__v0.1.x_FormDistribution_PublicLinkToken.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsForms;
SET search_path TO __mj_BizAppsForms, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (4 statement(s)):
--   [1] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames
--   [2] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNa
--   [3] (EXECUTE) EXECUTE [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames
--   [4] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames = 's
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝
--
-- Resolved: all four are CodeGen's reconciliation routines, which re-derive
-- Entity/EntityField metadata from the live catalog. They exist natively on PostgreSQL and
-- are ported as SELECTs at the end of this file. See the baseline migration's header.

ALTER TABLE __mj_BizAppsForms."FormDistribution"
ADD COLUMN "PublicLinkToken" VARCHAR(255) NULL /* ============================================================================= */ /* MJ Forms — FormDistribution.PublicLinkToken (Phase 1) */ /* ============================================================================= */ /* Versioned (V) migration layered on the B-baseline schema file. Adds the raw, */ /* redeemable magic-link token to a FormDistribution so a minted public link */ /* actually has a shareable, redeemable URL. */ /* WHY a raw token is persisted (and not just the hash on the invite row): */ /*   A public form link is low-secrecy BY DESIGN — the URL is meant to be shared */ /*   (homepage button, email, QR). The magic-link redeem path needs the RAW token */ /*   in the URL (/magic-link/redeem?token=<token>) to establish the anonymous, */ /*   distribution-scoped session. The invite row still stores ONLY the SHA-256 */ /*   hash (unchanged); the raw token lives here so the builder can surface the */ /*   public URL / embed / QR. This is the deliberate exception for shareable */ /*   public links — do NOT use this column for any secret/identified flow. */ /* Conventions (see CLAUDE.md / migrations rules): */ /*   * Single ADD ALTER (one business column). */ /*   * __mj_BizAppsForms placeholder for the __mj_BizAppsForms schema. */ /*   * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds them. */ /*   * NO foreign-key indexes — not an FK. */ /*   * sp_addextendedproperty on the business column → CodeGen field description. */ /* NOTE: CodeGen SQL output is APPENDED below this hand-DDL by `npm run mj:codegen` */ /*       (devs don't run codegen on install). Do NOT hand-edit the appended block. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."PublicLinkToken" IS 'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.';

/* SQL text to insert new entity field */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7de1a89c-4880-4e08-a49e-adf410c8fc44' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'PublicLinkToken')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7de1a89c-4880-4e08-a49e-adf410c8fc44', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100032, 'PublicLinkToken', 'Public Link Token', 'Raw redeemable magic-link token for this distribution''s public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2447de83-4360-4186-8948-9848bc14d2d7' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'Page')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2447de83-4360-4186-8948-9848bc14d2d7', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100031, 'Page', 'Page', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ── CodeGen reconciliation — see the baseline migration's closing block for why ──
SELECT ${mjSchema}."spUpdateExistingEntitiesFromSchema"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateExistingEntityFieldsFromSchema"('sys,staging,dbo,${mjSchema}', NULL);
SELECT ${mjSchema}."spSetDefaultColumnWidthWhereNeeded"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateSchemaInfoFromDatabase"('sys,staging,dbo,${mjSchema}');
