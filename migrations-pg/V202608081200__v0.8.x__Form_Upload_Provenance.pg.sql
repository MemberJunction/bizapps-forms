-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsForms;
SET search_path TO __mj_BizAppsForms, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =============================================================================
-- FormUpload — the upload provenance ledger
--
-- Fulfils plans/UPLOAD_PROVENANCE_LEDGER_SPEC.md and closes F-SEC-1.
--
-- WHY THIS EXISTS. `__mj.File` carries no owner column and no row-level security, so the foreign
-- key on a submitted `fileId` proves the file EXISTS — not that the respondent submitting it is
-- the one who uploaded it. Today that is contained, because a file id only reaches
-- FormResponseAnswer. The moment a binding copies one onto a business record other users can read,
-- "a respondent can name any file" becomes cross-tenant disclosure. This table is what lets the
-- submit path and the binding executor tell those two apart.
--
-- WHO WRITES IT (decision DG-12a). The Forms upload endpoint, under an elevated principal — never
-- the anonymous respondent. The alternative on the table was granting the anonymous role
-- CanCreate here, and that defeats the control entirely: every IncludeInAPI entity gets a
-- generated GraphQL CreateRecord mutation gated on the session's synthesized roles, so an
-- anonymous session holding that grant could mint its own provenance row for any file id it liked
-- and the check would confirm the forgery. A ledger the anonymous role can write is not a ledger.
--
-- The elevation is also strictly LESS privilege than today: the anonymous role currently holds no
-- `MJ: Files` grant at all, so the upload path was failing default-deny on a clean install
-- (F-SEC-2). Moving the File write to the endpoint's principal fixes that without granting the
-- anonymous internet the ability to create File rows.
-- =============================================================================

CREATE TABLE __mj_BizAppsForms."FormUpload" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "FileID" UUID NOT NULL,
 "DistributionID" UUID NOT NULL,
 "FormID" UUID NOT NULL,
 "QuestionID" UUID NULL,
 "ResponseDraftID" UUID NULL,
 "AnonymousSessionID" VARCHAR(255) NULL,
 "UploadedByUserID" UUID NULL,
 "ProviderKey" VARCHAR(1000) NULL,
 "FileName" VARCHAR(500) NULL,
 "ContentType" VARCHAR(255) NULL,
 "SizeBytes" BIGINT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_FormUpload PRIMARY KEY ("ID"),
 CONSTRAINT FK_FormUpload_File FOREIGN KEY ("FileID") REFERENCES __mj."File"("ID"),
 CONSTRAINT FK_FormUpload_Distribution FOREIGN KEY ("DistributionID") REFERENCES __mj_BizAppsForms."FormDistribution"("ID"),
 CONSTRAINT FK_FormUpload_Form FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form"("ID"),
 CONSTRAINT FK_FormUpload_Question FOREIGN KEY ("QuestionID") REFERENCES __mj_BizAppsForms."FormQuestion"("ID"),
 CONSTRAINT FK_FormUpload_UploadedByUser FOREIGN KEY ("UploadedByUserID") REFERENCES __mj."User"("ID"),
 CONSTRAINT CK_FormUpload_Status CHECK ("Status" IN ('Active', 'Revoked'))
);

-- One ledger row per file. A second row for the same file would mean two different stories about
-- where it came from, and the check has no way to choose between them.
"CREATE" "UNIQUE" "INDEX" "UQ_FormUpload_File" "ON" __mj_BizAppsForms."FormUpload" ("FileID");

-- The verification lookup is by file; these two serve the correlation checks and the orphan sweep.
CREATE INDEX IF NOT EXISTS IX_FormUpload_ResponseDraft ON __mj_BizAppsForms."FormUpload" ("ResponseDraftID");

CREATE INDEX IF NOT EXISTS IX_FormUpload_Session ON __mj_BizAppsForms."FormUpload" ("AnonymousSessionID");

ALTER TABLE __mj_BizAppsForms."FormUpload"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormUpload */
ALTER TABLE __mj_BizAppsForms."FormUpload"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FormUpload_FileID" ON __mj_BizAppsForms."FormUpload" ("FileID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FormUpload_DistributionID" ON __mj_BizAppsForms."FormUpload" ("DistributionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FormUpload_FormID" ON __mj_BizAppsForms."FormUpload" ("FormID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FormUpload_QuestionID" ON __mj_BizAppsForms."FormUpload" ("QuestionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FormUpload_UploadedByUserID" ON __mj_BizAppsForms."FormUpload" ("UploadedByUserID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_BizAppsForms';
  v_target_name CONSTANT TEXT := 'vwFormUploads';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsForms."vwFormUploads"
AS SELECT
    f.*,
    "MJFile_FileID"."Name" AS "File",
    mjBizAppsFormsFormDistribution_DistributionID."Name" AS "Distribution",
    mjBizAppsFormsForm_FormID."Name" AS "Form",
    "MJUser_UploadedByUserID"."Name" AS "UploadedByUser"
FROM
    __mj_BizAppsForms."FormUpload" AS f
INNER JOIN
    "${mjSchema}"."File" AS "MJFile_FileID"
  ON
    f."FileID" = "MJFile_FileID"."ID"
INNER JOIN
    __mj_BizAppsForms."FormDistribution" AS "mjBizAppsFormsFormDistribution_DistributionID"
  ON
    f."DistributionID" = mjBizAppsFormsFormDistribution_DistributionID."ID"
INNER JOIN
    __mj_BizAppsForms."Form" AS "mjBizAppsFormsForm_FormID"
  ON
    f."FormID" = mjBizAppsFormsForm_FormID."ID"
LEFT OUTER JOIN
    "${mjSchema}"."User" AS "MJUser_UploadedByUserID"
  ON
    f."UploadedByUserID" = "MJUser_UploadedByUserID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsForms].[spCreateFormUpload]
--     @ID UUID = NULL,
--     @FileID UUID,
--     @DistributionID UUID,
--     @FormID UUID,
--     @Questi...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsForms].[spUpdateFormUpload]
--     @ID UUID,
--     @FileID UUID = NULL,
--     @DistributionID UUID = NULL,
--     @FormID UUID = NUL...

-- SKIPPED: procedure (auto-conversion not supported)
-- CREATE PROCEDURE [__mj_BizAppsForms].[spDeleteFormUpload]
--     @ID UUID
-- AS
-- BEGIN
--     SET NOCOUNT ON;
-- 
--     DELETE FROM
--         [__mj_BizAppsForms].[FormUpload]
--     WHERE
--         [ID] = @ID
-- 
-- ...


-- ===================== Triggers =====================

-- SKIPPED: trigger (auto-conversion not supported)
-- CREATE TRIGGER [__mj_BizAppsForms].trgUpdateFormUpload
ON "__mj_BizAppsForms"."FormUpload"
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        "__mj_BizAppsForms"."FormUpload"
    SET
       


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '890ae739-1a57-4070-9358-d1788cc2c4c0',
         'MJ_BizApps_Forms: Form Uploads',
         'Form Uploads',
         'Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. ${mjSchema}.File has no owner column, so this is the only evidence of who produced a file',
         NULL,
         'FormUpload',
         'vwFormUploads',
         '__mj_BizAppsForms',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Uploads to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '890ae739-1a57-4070-9358-d1788cc2c4c0', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Uploads for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('890ae739-1a57-4070-9358-d1788cc2c4c0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, NOW(), NOW());

/* SQL text to update existing entities from schema */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms."FormUpload" */
UPDATE "__mj_BizAppsForms"."FormUpload" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormUpload */
ALTER TABLE __mj_BizAppsForms."FormUpload" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormUpload"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms."FormUpload" */
UPDATE "__mj_BizAppsForms"."FormUpload" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormUpload */
ALTER TABLE __mj_BizAppsForms."FormUpload" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormUpload"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c148decf-f6f8-444d-aac7-ef9c4a05459c' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c148decf-f6f8-444d-aac7-ef9c4a05459c',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        0,
        'gen_random_uuid()',
        0,
        0,
        0,
        0,
        NULL,
        NULL,
        0,
        1,
        0,
        0,
        1,
        1,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '42cb99dc-8808-4841-b796-44342b63319d' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'FileID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '42cb99dc-8808-4841-b796-44342b63319d',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100002,
        'FileID',
        'File ID',
        'The uploaded file',
        'UUID',
        16,
        0,
        0,
        0,
        NULL,
        0,
        1,
        0,
        0,
        '29248F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        0,
        0,
        1,
        0,
        0,
        1,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '1e1b7555-7da3-4ebc-82f9-69cfb6054381' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'DistributionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1e1b7555-7da3-4ebc-82f9-69cfb6054381',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100003,
        'DistributionID',
        'Distribution ID',
        'The distribution the upload was made through. The hard scope every provenance check enforces',
        'UUID',
        16,
        0,
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6130fd61-5262-4eaa-98bd-43b98941012c' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'FormID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6130fd61-5262-4eaa-98bd-43b98941012c',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100004,
        'FormID',
        'Form ID',
        'The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed',
        'UUID',
        16,
        0,
        0,
        0,
        NULL,
        0,
        1,
        0,
        0,
        'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '746f2f72-c1f6-4f4a-9da6-60fa354d6c6e' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'QuestionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '746f2f72-c1f6-4f4a-9da6-60fa354d6c6e',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100005,
        'QuestionID',
        'Question ID',
        'The question the file answers',
        'UUID',
        16,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        0,
        'C396B99F-0677-47F8-BAEF-BCB08DE5CF97',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'db577f23-8a40-4db1-9ecf-664dd79836c8' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'ResponseDraftID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'db577f23-8a40-4db1-9ecf-664dd79836c8',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100006,
        'ResponseDraftID',
        'Response Draft ID',
        'The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows',
        'UUID',
        16,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '467428dc-3a6e-4ced-a0ea-eeab2c7ecedf' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'AnonymousSessionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '467428dc-3a6e-4ced-a0ea-eeab2c7ecedf',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100007,
        'AnonymousSessionID',
        'Anonymous Session ID',
        'The anonymous session id at upload time. A fallback correlation key; blank is tolerated',
        'TEXT',
        510,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '01b65515-ad70-413d-8917-4c2423341f15' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'UploadedByUserID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '01b65515-ad70-413d-8917-4c2423341f15',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100008,
        'UploadedByUserID',
        'Uploaded By User ID',
        'The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record',
        'UUID',
        16,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        0,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd8670159-ce1a-4bb1-98ae-eea73ad81a1a' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'ProviderKey')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd8670159-ce1a-4bb1-98ae-eea73ad81a1a',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100009,
        'ProviderKey',
        'Provider Key',
        'Storage key of the file, so the Forms path prefix can be checked without loading the file row',
        'TEXT',
        2000,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '666f4e03-791c-4503-9bb0-357b39cf0b57' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'FileName')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '666f4e03-791c-4503-9bb0-357b39cf0b57',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100010,
        'FileName',
        'File Name',
        'Original sanitized filename',
        'TEXT',
        1000,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fe8fafbb-9c27-44f8-a2a0-91c95d39a23a' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'ContentType')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'fe8fafbb-9c27-44f8-a2a0-91c95d39a23a',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100011,
        'ContentType',
        'Content Type',
        'Stored content type',
        'TEXT',
        510,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f27a930f-26f8-428d-b1eb-5802efc78e5f' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'SizeBytes')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f27a930f-26f8-428d-b1eb-5802efc78e5f',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100012,
        'SizeBytes',
        'Size Bytes',
        'Size in bytes',
        'bigint',
        8,
        19,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c104492a-2da5-4627-bbae-6f25128be23d' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c104492a-2da5-4627-bbae-6f25128be23d',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100013,
        'Status',
        'Status',
        'Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance',
        'TEXT',
        40,
        0,
        0,
        0,
        'Active',
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '452a1ee1-95e8-414f-b5c2-b651c8d6ce89' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '452a1ee1-95e8-414f-b5c2-b651c8d6ce89',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100014,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '65fddb3d-8ef1-4d0d-bacc-569312e8ddc6' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '65fddb3d-8ef1-4d0d-bacc-569312e8ddc6',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100015,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        0,
        'NOW()',
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('21c5eaf7-4dba-4717-9986-0f563aef9c53', 'C104492A-2DA5-4627-BBAE-6F25128BE23D', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID 0ec13542-d3bd-40ce-b1bb-676235daa3f5 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('0ec13542-d3bd-40ce-b1bb-676235daa3f5', 'C104492A-2DA5-4627-BBAE-6F25128BE23D', 2, 'Revoked', 'Revoked', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID C104492A-2DA5-4627-BBAE-6F25128BE23D */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='C104492A-2DA5-4627-BBAE-6F25128BE23D';


/* Create Entity Relationship: MJ_BizApps_Forms: Form Distributions -> MJ_BizApps_Forms: Form Uploads (One To Many via DistributionID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '17c58082-ab7e-41f3-b898-b659eb732828'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('17c58082-ab7e-41f3-b898-b659eb732828', '1FC60BDA-25B8-473B-ACE5-1238670D3535', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'DistributionID', 'One To Many', 1, 1, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '0e14af4a-72fe-43a7-bae7-b1ab9545e8d9'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('0e14af4a-72fe-43a7-bae7-b1ab9545e8d9', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'UploadedByUserID', 'One To Many', 1, 1, 113, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '87910a4f-de28-41c0-b9b2-8be59909cf70'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('87910a4f-de28-41c0-b9b2-8be59909cf70', '29248F34-2837-EF11-86D4-6045BDEE16E6', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FileID', 'One To Many', 1, 1, 10, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '82809106-4d66-4eb7-9d7a-29f2f131260f'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('82809106-4d66-4eb7-9d7a-29f2f131260f', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FormID', 'One To Many', 1, 1, 8, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '76684696-dae3-4f4d-9247-d6de16af2d70'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('76684696-dae3-4f4d-9247-d6de16af2d70', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'QuestionID', 'One To Many', 1, 1, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '44514475-afec-4b0f-931a-7ef6d29f9556' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'File')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '44514475-afec-4b0f-931a-7ef6d29f9556',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100031,
        'File',
        'File',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'cd0bf4f2-cb1f-477a-990c-874648b2e8e5' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'Distribution')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cd0bf4f2-cb1f-477a-990c-874648b2e8e5',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100032,
        'Distribution',
        'Distribution',
        NULL,
        'TEXT',
        510,
        0,
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e0f16358-d0c3-4b96-97aa-16b5b1e88ed2' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'Form')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e0f16358-d0c3-4b96-97aa-16b5b1e88ed2',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100033,
        'Form',
        'Form',
        NULL,
        'TEXT',
        510,
        0,
        0,
        0,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '06d26ec3-9c48-42e4-a77b-cda5b004eccd' OR ("EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0' AND "Name" = 'UploadedByUser')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '06d26ec3-9c48-42e4-a77b-cda5b004eccd',
        '890AE739-1A57-4070-9358-D1788CC2C4C0', -- "Entity": "MJ_BizApps_Forms": "Form" "Uploads"
        100034,
        'UploadedByUser',
        'Uploaded By User',
        NULL,
        'TEXT',
        200,
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
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE "${mjSchema}"."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F27A930F-26F8-428D-B1EB-5802EFC78E5F'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '452A1EE1-95E8-414F-B5C2-B651C8D6CE89'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '666F4E03-791C-4503-9BB0-357B39CF0B57'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE "${mjSchema}"."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'C104492A-2DA5-4627-BBAE-6F25128BE23D'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C148DECF-F6F8-444D-AAC7-EF9C4A05459C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FileID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'File',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42CB99DC-8808-4841-B796-44342B63319D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.DistributionID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Distribution',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E1B7555-7DA3-4EBC-82F9-69CFB6054381' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FormID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Form',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6130FD61-5262-4EAA-98BD-43B98941012C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.QuestionID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Question',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '746F2F72-C1F6-4F4A-9DA6-60FA354D6C6E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ResponseDraftID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Response Draft',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB577F23-8A40-4DB1-9ECF-664DD79836C8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.AnonymousSessionID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Anonymous Session',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '467428DC-3A6E-4CED-A0EA-EEAB2C7ECEDF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.UploadedByUserID

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Uploaded By User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01B65515-AD70-413D-8917-4C2423341F15' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ProviderKey

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8670159-CE1A-4BB1-98AE-EEA73AD81A1A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.FileName

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '666F4E03-791C-4503-9BB0-357B39CF0B57' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.ContentType

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE8FAFBB-9C27-44F8-A2A0-91C95D39A23A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.SizeBytes

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Size (Bytes)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F27A930F-26F8-428D-B1EB-5802EFC78E5F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Status

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C104492A-2DA5-4627-BBAE-6F25128BE23D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.__mj_CreatedAt

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '452A1EE1-95E8-414F-B5C2-B651C8D6CE89' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.__mj_UpdatedAt

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65FDDB3D-8EF1-4D0D-BACC-569312E8DDC6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.File

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'File Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'File Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44514475-AFEC-4B0F-931A-7EF6D29F9556' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Distribution

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Distribution Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD0BF4F2-CB1F-477A-990C-874648B2E8E5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.Form

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Form Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E0F16358-D0C3-4B96-97AA-16B5B1E88ED2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Uploads.UploadedByUser

UPDATE "${mjSchema}"."EntityField"
SET 
   "Category" = 'Provenance and Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Uploaded By User Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '06D26EC3-9C48-42E4-A77B-CDA5B004ECCD' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-file-upload */

UPDATE "${mjSchema}"."Entity"
               SET "Icon" = 'fa fa-file-upload', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '890AE739-1A57-4070-9358-D1788CC2C4C0';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO "${mjSchema}"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('90f74ddd-cdd8-4b22-b305-885c20c53561', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FieldCategoryInfo', '{"File Details":{"icon":"fa fa-file","description":"Technical details regarding the uploaded file, its size, type, and storage location."},"Provenance and Context":{"icon":"fa fa-history","description":"Information linking the upload to specific forms, distributions, and user sessions for audit and provenance."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO "${mjSchema}"."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('236872f7-c64c-4ea6-8ec3-572483a97db4', '890AE739-1A57-4070-9358-D1788CC2C4C0', 'FieldCategoryIcons', '{"File Details":"fa fa-file","Provenance and Context":"fa fa-history","System Metadata":"fa fa-cog"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE "${mjSchema}"."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '890AE739-1A57-4070-9358-D1788CC2C4C0';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsForms."vwFormUploads" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: Permissions for vwFormUploads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsForms."vwFormUploads" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spCreateFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormUpload
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spCreateFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_Forms: Form Uploads */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spCreateFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spUpdateFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormUpload
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spUpdateFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spUpdateFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_Forms: Form Uploads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Uploads
-- Item: spDeleteFormUpload
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormUpload
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spDeleteFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_Forms: Form Uploads */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsForms."spDeleteFormUpload" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to delete unneeded entity fields (1 scoped entities) */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsForms."FormUpload" IS 'Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. __mj.File has no owner column, so this is the only evidence of who produced a file';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."FileID" IS 'The uploaded file';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."DistributionID" IS 'The distribution the upload was made through. The hard scope every provenance check enforces';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."FormID" IS 'The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."QuestionID" IS 'The question the file answers';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."ResponseDraftID" IS 'The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."AnonymousSessionID" IS 'The anonymous session id at upload time. A fallback correlation key; blank is tolerated';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."UploadedByUserID" IS 'The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."ProviderKey" IS 'Storage key of the file, so the Forms path prefix can be checked without loading the file row';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."FileName" IS 'Original sanitized filename';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."ContentType" IS 'Stored content type';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."SizeBytes" IS 'Size in bytes';

COMMENT ON COLUMN __mj_BizAppsForms."FormUpload"."Status" IS 'Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance';


-- ===================== Other =====================

-- =============================================================================
-- EXTENDED PROPERTIES
-- =============================================================================

-- =============================================================================
-- CodeGen output for FormUpload (view, CRUD procedures, and the __mj metadata rows).
-- Appended per migrations/CLAUDE.md so a fresh environment gets the entity, not just
-- the table. Generated by `npm run mj:codegen` after applying the DDL above.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Forms: Form Uploads */

/* SQL text to insert 15 new entity field(s) */

/* spUpdate Permissions for MJ_BizApps_Forms: Form Uploads */
