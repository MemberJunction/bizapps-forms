-- ============================================================================
-- MemberJunction PostgreSQL Migration — B202606281200__v0.1.x_Schema_and_Tables.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsForms;
SET search_path TO __mj_BizAppsForms, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (6 statement(s)):
--   [1] (IF-EXISTS-BEGIN) IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_BizAppsForms') E
--   [2] (sp_addextendedproperty) EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ For
--   [3] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames
--   [4] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNa
--   [5] (EXECUTE) EXECUTE [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames
--   [6] (EXECUTE) EXECUTE [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames = 's
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝
--
-- Resolution of the gaps above (all six are resolved; nothing is outstanding):
--   [1] The schema guard is redundant — CREATE SCHEMA IF NOT EXISTS above does it.
--   [2] The MS_Description on the schema has no PostgreSQL equivalent that MJ reads.
--   [3]-[6] Those four EXECUTEs are CodeGen's *reconciliation* routines, which re-derive
--       Entity/EntityField metadata from the live catalog. They exist natively on
--       PostgreSQL, so they are ported verbatim as SELECTs at the END of this file rather
--       than dropped — see the closing block for why that matters. The CRUD objects they
--       do NOT cover are captured in the CodeGen_Objects migration, so a PG install is
--       correct WITHOUT running codegen. That is the whole point.
--
-- Why every schema name used as a VALUE is wrapped in LOWER():
--   The physical schema is created unquoted, so PostgreSQL folds it to
--   '__mj_bizappsforms'. CodeGen's reconciliation compares Entity."SchemaName" against
--   the physical catalog name; a mixed-case value never matches, and
--   spDeleteUnneededEntityFields then prunes every field of every entity in this schema.
--   Store the folded name so the comparison holds.

/* ------------------------------------------------------------------------- */
/* FormCategory: hierarchical organization of forms (self-referencing tree) */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormCategory" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ParentID" UUID NULL,
  "IconClass" VARCHAR(100) NULL,
  "DisplayRank" INT NOT NULL DEFAULT 0,
  "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PK_FormCategory" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormCategory_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj_BizAppsForms."FormCategory" (
    "ID"
  )
);

/* ------------------------------------------------------------------------- */
/* FormStyle: reusable themes / CSS token sets for departments & brands */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormStyle" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "CSSVariables" TEXT NULL,
  "CustomCSS" TEXT NULL,
  "LogoURL" VARCHAR(1000) NULL,
  "DisplayRank" INT NOT NULL DEFAULT 0,
  "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PK_FormStyle" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_FormStyle_Name" UNIQUE (
    "Name"
  )
);

/* ------------------------------------------------------------------------- */
/* Form: the root instrument definition */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."Form" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "CategoryID" UUID NULL,
  "StyleID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  "OwnerUserID" UUID NULL,
  "RenderMode" VARCHAR(20) NOT NULL DEFAULT 'Scroll',
  "Settings" TEXT NULL,
  CONSTRAINT "PK_Form" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_Form_Category" FOREIGN KEY ("CategoryID") REFERENCES __mj_BizAppsForms."FormCategory" (
    "ID"
  ),
  CONSTRAINT "FK_Form_Style" FOREIGN KEY ("StyleID") REFERENCES __mj_BizAppsForms."FormStyle" (
    "ID"
  ),
  CONSTRAINT "FK_Form_OwnerUser" FOREIGN KEY ("OwnerUserID") REFERENCES "__mj"."User" (
    "ID"
  ),
  CONSTRAINT "CK_Form_Status" CHECK ("Status" IN ('Draft', 'Published', 'Closed')),
  CONSTRAINT "CK_Form_RenderMode" CHECK ("RenderMode" IN ('Scroll', 'OneQuestion'))
);

/* ------------------------------------------------------------------------- */
/* FormVersion: immutable published snapshots (responses pin a version) */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormVersion" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "FormID" UUID NOT NULL,
  "VersionNumber" INT NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  "PublishedAt" TIMESTAMPTZ NULL,
  "DefinitionSnapshot" TEXT NULL,
  CONSTRAINT "PK_FormVersion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormVersion_Form" FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form" (
    "ID"
  ),
  CONSTRAINT "UQ_FormVersion_Form_VersionNumber" UNIQUE (
    "FormID",
    "VersionNumber"
  ),
  CONSTRAINT "CK_FormVersion_Status" CHECK ("Status" IN ('Draft', 'Published', 'Retired'))
);

/* ------------------------------------------------------------------------- */
/* FormPage: an ordered page/section within a form */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormPage" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "FormID" UUID NOT NULL,
  "Title" VARCHAR(255) NULL,
  "Description" TEXT NULL,
  "DisplayOrder" INT NOT NULL DEFAULT 0,
  "ConditionalRule" TEXT NULL,
  CONSTRAINT "PK_FormPage" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormPage_Form" FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form" (
    "ID"
  )
);

/* ------------------------------------------------------------------------- */
/* FormQuestion: a single question/field on a page */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormQuestion" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "FormID" UUID NOT NULL,
  "PageID" UUID NULL,
  "QuestionType" VARCHAR(50) NOT NULL,
  "Prompt" TEXT NOT NULL,
  "HelpText" TEXT NULL,
  "IsRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  "DisplayOrder" INT NOT NULL DEFAULT 0,
  "ValidationRule" TEXT NULL,
  "ConditionalRule" TEXT NULL,
  "ScoringConfig" TEXT NULL,
  "Settings" TEXT NULL,
  CONSTRAINT "PK_FormQuestion" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormQuestion_Form" FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form" (
    "ID"
  ),
  CONSTRAINT "FK_FormQuestion_Page" FOREIGN KEY ("PageID") REFERENCES __mj_BizAppsForms."FormPage" (
    "ID"
  ),
  CONSTRAINT "CK_FormQuestion_QuestionType" CHECK ("QuestionType" IN (
    'ShortText',
    'LongText',
    'Email',
    'Phone',
    'Number',
    'SingleChoice',
    'MultiChoice',
    'Dropdown',
    'Rating',
    'NPS',
    'YesNo',
    'Date',
    'Time',
    'FileUpload',
    'Statement'
  ))
);

/* ------------------------------------------------------------------------- */
/* FormQuestionOption: choices for choice-style questions */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormQuestionOption" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "QuestionID" UUID NOT NULL,
  "Label" VARCHAR(500) NOT NULL,
  "Value" VARCHAR(500) NULL,
  "DisplayOrder" INT NOT NULL DEFAULT 0,
  "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "PK_FormQuestionOption" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormQuestionOption_Question" FOREIGN KEY ("QuestionID") REFERENCES __mj_BizAppsForms."FormQuestion" (
    "ID"
  )
);

/* ------------------------------------------------------------------------- */
/* FormDistribution: a published channel (public link / embed / QR / email) */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormDistribution" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "FormID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Slug" VARCHAR(255) NULL,
  "ChannelType" VARCHAR(20) NOT NULL DEFAULT 'PublicLink',
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  "OpenAt" TIMESTAMPTZ NULL,
  "CloseAt" TIMESTAMPTZ NULL,
  "MaxResponses" INT NULL,
  "ResponseCount" INT NOT NULL DEFAULT 0,
  "MagicLinkInviteID" UUID NULL,
  "CaptchaRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "PK_FormDistribution" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormDistribution_Form" FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form" (
    "ID"
  ),
  CONSTRAINT "CK_FormDistribution_ChannelType" CHECK ("ChannelType" IN ('PublicLink', 'Embed', 'QR', 'Email')),
  CONSTRAINT "CK_FormDistribution_Status" CHECK ("Status" IN ('Draft', 'Active', 'Closed'))
);

/* Business index (non-FK): one distribution per public slug */
CREATE UNIQUE INDEX "UQ_FormDistribution_Slug" ON __mj_BizAppsForms."FormDistribution"("Slug")
WHERE
  NOT "Slug" IS NULL;

/* ------------------------------------------------------------------------- */
/* FormResponse: one submission (anonymous or identified), pinned to a version */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormResponse" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "FormID" UUID NOT NULL,
  "FormVersionID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Partial',
  "AnonymousSessionID" VARCHAR(255) NULL,
  "RespondentPersonID" UUID NULL,
  "StartedAt" TIMESTAMPTZ NULL,
  "SubmittedAt" TIMESTAMPTZ NULL,
  "SourceMetadata" TEXT NULL,
  CONSTRAINT "PK_FormResponse" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormResponse_Form" FOREIGN KEY ("FormID") REFERENCES __mj_BizAppsForms."Form" (
    "ID"
  ),
  CONSTRAINT "FK_FormResponse_FormVersion" FOREIGN KEY ("FormVersionID") REFERENCES __mj_BizAppsForms."FormVersion" (
    "ID"
  ),
  -- Schema name folded to lower case deliberately: bizapps-common's own PG runbook creates
  -- its schema UNQUOTED, so the physical name is '__mj_bizappscommon'. A quoted mixed-case
  -- reference here does not match it and the FK fails to resolve. The TABLE name stays
  -- quoted mixed-case — CodeGen does create that one quoted.
  CONSTRAINT "FK_FormResponse_RespondentPerson" FOREIGN KEY ("RespondentPersonID") REFERENCES "__mj_bizappscommon"."Person" (
    "ID"
  ),
  CONSTRAINT "CK_FormResponse_Status" CHECK ("Status" IN ('Partial', 'Complete'))
);

/* ------------------------------------------------------------------------- */
/* FormResponseAnswer: one answer to one question (typed columns + JSON fallback) */
/* ------------------------------------------------------------------------- */
CREATE TABLE __mj_BizAppsForms."FormResponseAnswer" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ResponseID" UUID NOT NULL,
  "QuestionID" UUID NOT NULL,
  "TextValue" TEXT NULL,
  "NumericValue" DECIMAL(18, 4) NULL,
  "DateValue" TIMESTAMPTZ NULL,
  "BooleanValue" BOOLEAN NULL,
  "JSONValue" TEXT NULL,
  "FileID" UUID NULL,
  "Score" DECIMAL(18, 4) NULL,
  "ScoreRationale" TEXT NULL,
  CONSTRAINT "PK_FormResponseAnswer" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_FormResponseAnswer_Response" FOREIGN KEY ("ResponseID") REFERENCES __mj_BizAppsForms."FormResponse" (
    "ID"
  ),
  CONSTRAINT "FK_FormResponseAnswer_Question" FOREIGN KEY ("QuestionID") REFERENCES __mj_BizAppsForms."FormQuestion" (
    "ID"
  ),
  CONSTRAINT "FK_FormResponseAnswer_File" FOREIGN KEY ("FileID") REFERENCES "__mj"."File" (
    "ID"
  )
);

COMMENT ON TABLE __mj_BizAppsForms."FormCategory" IS 'Hierarchical categories that organize forms into a browsable tree';

COMMENT ON COLUMN __mj_BizAppsForms."FormCategory"."Name" IS 'Display name of the category';

COMMENT ON COLUMN __mj_BizAppsForms."FormCategory"."Description" IS 'Detailed description of this category';

COMMENT ON COLUMN __mj_BizAppsForms."FormCategory"."IconClass" IS 'Font Awesome icon class for UI display';

COMMENT ON COLUMN __mj_BizAppsForms."FormCategory"."DisplayRank" IS 'Sort order among siblings. Lower values appear first';

COMMENT ON COLUMN __mj_BizAppsForms."FormCategory"."IsActive" IS 'Whether this category is available for selection. Inactive categories are hidden but preserved';

COMMENT ON TABLE __mj_BizAppsForms."FormStyle" IS 'Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."Name" IS 'Display name of the style/theme';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."Description" IS 'Detailed description of this style';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."CSSVariables" IS 'JSON object of --mj-* design-token overrides applied to the respondent widget';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."CustomCSS" IS 'Optional raw CSS appended after the token overrides for advanced theming';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."LogoURL" IS 'URL of a logo to display on forms using this style';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."DisplayRank" IS 'Sort order in style pickers. Lower values appear first';

COMMENT ON COLUMN __mj_BizAppsForms."FormStyle"."IsActive" IS 'Whether this style is available for selection. Inactive styles are hidden but preserved';

COMMENT ON TABLE __mj_BizAppsForms."Form" IS 'The root definition of a form/survey/intake instrument';

COMMENT ON COLUMN __mj_BizAppsForms."Form"."Name" IS 'Display name of the form';

COMMENT ON COLUMN __mj_BizAppsForms."Form"."Description" IS 'Detailed description / purpose of the form';

COMMENT ON COLUMN __mj_BizAppsForms."Form"."Status" IS 'Lifecycle status: Draft, Published, or Closed';

COMMENT ON COLUMN __mj_BizAppsForms."Form"."RenderMode" IS 'Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)';

COMMENT ON COLUMN __mj_BizAppsForms."Form"."Settings" IS 'JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect';

COMMENT ON TABLE __mj_BizAppsForms."FormVersion" IS 'Immutable published snapshots of a form; responses pin the version they were filled against';

COMMENT ON COLUMN __mj_BizAppsForms."FormVersion"."VersionNumber" IS 'Monotonic version number within a form';

COMMENT ON COLUMN __mj_BizAppsForms."FormVersion"."Status" IS 'Version status: Draft, Published, or Retired';

COMMENT ON COLUMN __mj_BizAppsForms."FormVersion"."PublishedAt" IS 'Timestamp this version was published (null while Draft)';

COMMENT ON COLUMN __mj_BizAppsForms."FormVersion"."DefinitionSnapshot" IS 'Full pages/questions/options/logic as published, captured as a JSON snapshot';

COMMENT ON TABLE __mj_BizAppsForms."FormPage" IS 'An ordered page/section of a form';

COMMENT ON COLUMN __mj_BizAppsForms."FormPage"."Title" IS 'Page title shown to respondents';

COMMENT ON COLUMN __mj_BizAppsForms."FormPage"."Description" IS 'Page description / intro text';

COMMENT ON COLUMN __mj_BizAppsForms."FormPage"."DisplayOrder" IS 'Sort order of the page within the form. Lower values appear first';

COMMENT ON COLUMN __mj_BizAppsForms."FormPage"."ConditionalRule" IS 'JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)';

COMMENT ON TABLE __mj_BizAppsForms."FormQuestion" IS 'A single question/field within a form page';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."QuestionType" IS 'Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."Prompt" IS 'The question text shown to the respondent';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."HelpText" IS 'Optional helper/assistive text shown beneath the prompt';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."IsRequired" IS 'Whether an answer is required before the form can be submitted';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."DisplayOrder" IS 'Sort order of the question within its page. Lower values appear first';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."ValidationRule" IS 'JSON validation rule (min/max, regex, length, etc.) applied client- and server-side';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."ConditionalRule" IS 'JSON show/hide rule evaluated against prior answers (see plan §6)';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."ScoringConfig" IS 'JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestion"."Settings" IS 'JSON per-type settings (e.g. rating scale, NPS labels, file constraints)';

COMMENT ON TABLE __mj_BizAppsForms."FormQuestionOption" IS 'A selectable choice offered by a choice-style question';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestionOption"."Label" IS 'Label shown to the respondent for this option';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestionOption"."Value" IS 'Stored value for this option (defaults to Label when omitted)';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestionOption"."DisplayOrder" IS 'Sort order of the option within its question. Lower values appear first';

COMMENT ON COLUMN __mj_BizAppsForms."FormQuestionOption"."IsDefault" IS 'Whether this option is selected by default';

COMMENT ON TABLE __mj_BizAppsForms."FormDistribution" IS 'A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."Name" IS 'Internal name for this distribution';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."Slug" IS 'URL-friendly slug used in the public link (unique when set)';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."ChannelType" IS 'Channel type: PublicLink, Embed, QR, or Email';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."Status" IS 'Distribution status: Draft, Active, or Closed';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."OpenAt" IS 'When this distribution opens for responses (null = immediately)';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."CloseAt" IS 'When this distribution stops accepting responses (null = no end)';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."MaxResponses" IS 'Maximum number of responses allowed through this distribution (null = unlimited)';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."ResponseCount" IS 'Running count of responses received through this distribution';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."MagicLinkInviteID" IS 'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."CaptchaRequired" IS 'Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution';

COMMENT ON COLUMN __mj_BizAppsForms."FormDistribution"."IsActive" IS 'Whether this distribution is active and usable';

COMMENT ON TABLE __mj_BizAppsForms."FormResponse" IS 'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponse"."Status" IS 'Completion status: Partial or Complete';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponse"."AnonymousSessionID" IS 'Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponse"."StartedAt" IS 'Timestamp the respondent began the form';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponse"."SubmittedAt" IS 'Timestamp the response was submitted (null while Partial)';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponse"."SourceMetadata" IS 'JSON source metadata: hashed IP, user-agent, distribution id, referrer';

COMMENT ON TABLE __mj_BizAppsForms."FormResponseAnswer" IS 'One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."TextValue" IS 'Text answer value (short/long text, email, phone, single-choice label, etc.)';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."NumericValue" IS 'Numeric answer value (Number, Rating, NPS)';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."DateValue" IS 'Date/time answer value (Date, Time)';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."BooleanValue" IS 'Boolean answer value (YesNo)';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."JSONValue" IS 'JSON answer value for multi-select or complex/structured answers';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."Score" IS 'Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored';

COMMENT ON COLUMN __mj_BizAppsForms."FormResponseAnswer"."ScoreRationale" IS 'Rationale/explanation for the assigned score (LLM-judge output)';

/* SQL generated to create new entity MJ_BizApps_Forms: Form Categories */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '43ecbea3-6cfc-480c-823f-96b5db201fe7',
    'MJ_BizApps_Forms: Form Categories',
    'Form Categories',
    'Hierarchical categories that organize forms into a browsable tree',
    NULL,
    'FormCategory',
    'vwFormCategories',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to create new application __mj_BizAppsForms */
INSERT INTO "${mjSchema}"."Application" (
  "ID",
  "Name",
  "Description",
  "SchemaAutoAddNewEntities",
  "Path",
  "AutoUpdatePath"
)
VALUES
  (
    'c2b2d4af-0fc5-4301-a4fd-d59731af33c8',
    LOWER('__mj_BizAppsForms'),
    'Generated for schema',
    LOWER('__mj_BizAppsForms'),
    'mjbizappsforms',
    TRUE
  );
/* Adding role UI to application __mj_BizAppsForms */
INSERT INTO "${mjSchema}"."ApplicationRole" (
  "ApplicationID",
  "RoleID",
  "CanAccess",
  "CanAdmin"
)
VALUES
  (
    'c2b2d4af-0fc5-4301-a4fd-d59731af33c8',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE
  );
/* Adding role Developer to application __mj_BizAppsForms */
INSERT INTO "${mjSchema}"."ApplicationRole" (
  "ApplicationID",
  "RoleID",
  "CanAccess",
  "CanAdmin"
)
VALUES
  (
    'c2b2d4af-0fc5-4301-a4fd-d59731af33c8',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE
  );
/* Adding role Integration to application __mj_BizAppsForms */
INSERT INTO "${mjSchema}"."ApplicationRole" (
  "ApplicationID",
  "RoleID",
  "CanAccess",
  "CanAdmin"
)
VALUES
  (
    'c2b2d4af-0fc5-4301-a4fd-d59731af33c8',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Categories to application ID: 'c2b2d4af-0fc5-4301-a4fd-d59731af33c8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c2b2d4af-0fc5-4301-a4fd-d59731af33c8',
    '43ecbea3-6cfc-480c-823f-96b5db201fe7',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'c2b2d4af-0fc5-4301-a4fd-d59731af33c8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '43ecbea3-6cfc-480c-823f-96b5db201fe7',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '43ecbea3-6cfc-480c-823f-96b5db201fe7',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '43ecbea3-6cfc-480c-823f-96b5db201fe7',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Styles */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ef36db1-004d-4672-8a57-a0f3b71c0050',
    'MJ_BizApps_Forms: Form Styles',
    'Form Styles',
    'Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt',
    NULL,
    'FormStyle',
    'vwFormStyles',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Styles to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    '1ef36db1-004d-4672-8a57-a0f3b71c0050',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ef36db1-004d-4672-8a57-a0f3b71c0050',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ef36db1-004d-4672-8a57-a0f3b71c0050',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1ef36db1-004d-4672-8a57-a0f3b71c0050',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Forms */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
    'MJ_BizApps_Forms: Forms',
    'Forms',
    'The root definition of a form/survey/intake instrument',
    NULL,
    'Form',
    'vwForms',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Forms to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Versions */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '622e2804-5b6d-4b43-92a4-294adc538f50',
    'MJ_BizApps_Forms: Form Versions',
    'Form Versions',
    'Immutable published snapshots of a form; responses pin the version they were filled against',
    NULL,
    'FormVersion',
    'vwFormVersions',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Versions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    '622e2804-5b6d-4b43-92a4-294adc538f50',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '622e2804-5b6d-4b43-92a4-294adc538f50',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '622e2804-5b6d-4b43-92a4-294adc538f50',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '622e2804-5b6d-4b43-92a4-294adc538f50',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Pages */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
    'MJ_BizApps_Forms: Form Pages',
    'Form Pages',
    'An ordered page/section of a form',
    NULL,
    'FormPage',
    'vwFormPages',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Pages to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Questions */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c396b99f-0677-47f8-baef-bcb08de5cf97',
    'MJ_BizApps_Forms: Form Questions',
    'Form Questions',
    'A single question/field within a form page',
    NULL,
    'FormQuestion',
    'vwFormQuestions',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Questions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    'c396b99f-0677-47f8-baef-bcb08de5cf97',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c396b99f-0677-47f8-baef-bcb08de5cf97',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c396b99f-0677-47f8-baef-bcb08de5cf97',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c396b99f-0677-47f8-baef-bcb08de5cf97',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Question Options */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf3016e2-8ba7-4975-83b6-02c9435c1441',
    'MJ_BizApps_Forms: Form Question Options',
    'Form Question Options',
    'A selectable choice offered by a choice-style question',
    NULL,
    'FormQuestionOption',
    'vwFormQuestionOptions',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Question Options to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    'bf3016e2-8ba7-4975-83b6-02c9435c1441',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf3016e2-8ba7-4975-83b6-02c9435c1441',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf3016e2-8ba7-4975-83b6-02c9435c1441',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf3016e2-8ba7-4975-83b6-02c9435c1441',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Distributions */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1fc60bda-25b8-473b-ace5-1238670d3535',
    'MJ_BizApps_Forms: Form Distributions',
    'Form Distributions',
    'A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link',
    NULL,
    'FormDistribution',
    'vwFormDistributions',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Distributions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    '1fc60bda-25b8-473b-ace5-1238670d3535',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1fc60bda-25b8-473b-ace5-1238670d3535',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1fc60bda-25b8-473b-ace5-1238670d3535',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '1fc60bda-25b8-473b-ace5-1238670d3535',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Responses */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '63600739-7165-4bdc-b7d7-19a1b1951dfa',
    'MJ_BizApps_Forms: Form Responses',
    'Form Responses',
    'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.',
    NULL,
    'FormResponse',
    'vwFormResponses',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Responses to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    '63600739-7165-4bdc-b7d7-19a1b1951dfa',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '63600739-7165-4bdc-b7d7-19a1b1951dfa',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '63600739-7165-4bdc-b7d7-19a1b1951dfa',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '63600739-7165-4bdc-b7d7-19a1b1951dfa',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ_BizApps_Forms: Form Response Answers */
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
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
    'MJ_BizApps_Forms: Form Response Answers',
    'Form Response Answers',
    'One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.',
    NULL,
    'FormResponseAnswer',
    'vwFormResponseAnswers',
    LOWER('__mj_BizAppsForms'),
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ_BizApps_Forms: Form Response Answers to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO "${mjSchema}"."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8',
    'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM "${mjSchema}"."ApplicationEntity"
      WHERE
        "ApplicationID" = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role UI */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role Developer */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role Integration */
INSERT INTO "${mjSchema}"."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj_BizAppsForms."FormQuestionOption"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormQuestionOption */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormQuestionOption */
UPDATE __mj_BizAppsForms."FormQuestionOption" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormQuestionOption' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormQuestionOption" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormQuestionOption" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormQuestionOption"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormQuestionOption */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormQuestionOption */
UPDATE __mj_BizAppsForms."FormQuestionOption" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormQuestionOption' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormQuestionOption" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormQuestionOption" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormDistribution"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormDistribution */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormDistribution */
UPDATE __mj_BizAppsForms."FormDistribution" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormDistribution' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormDistribution" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormDistribution" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormDistribution"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormDistribution */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormDistribution */
UPDATE __mj_BizAppsForms."FormDistribution" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormDistribution' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormDistribution" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormDistribution" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormResponse"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormResponse */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormResponse */
UPDATE __mj_BizAppsForms."FormResponse" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormResponse' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormResponse" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormResponse" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormResponse"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormResponse */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormResponse */
UPDATE __mj_BizAppsForms."FormResponse" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormResponse' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormResponse" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormResponse" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormVersion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormVersion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormVersion */
UPDATE __mj_BizAppsForms."FormVersion" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormVersion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormVersion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormVersion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormVersion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormVersion */
UPDATE __mj_BizAppsForms."FormVersion" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormVersion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormVersion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."Form"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.Form */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.Form */
UPDATE __mj_BizAppsForms."Form" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'Form' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."Form" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."Form" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."Form"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.Form */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.Form */
UPDATE __mj_BizAppsForms."Form" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'Form' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."Form" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."Form" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormPage"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormPage */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormPage */
UPDATE __mj_BizAppsForms."FormPage" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormPage' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormPage" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormPage" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormPage"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormPage */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormPage */
UPDATE __mj_BizAppsForms."FormPage" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormPage' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormPage" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormPage" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormCategory"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormCategory */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormCategory */
UPDATE __mj_BizAppsForms."FormCategory" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormCategory' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormCategory" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormCategory"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormCategory */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormCategory */
UPDATE __mj_BizAppsForms."FormCategory" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormCategory' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormCategory" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormStyle"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormStyle */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormStyle */
UPDATE __mj_BizAppsForms."FormStyle" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormStyle' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormStyle" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormStyle" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormStyle"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormStyle */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormStyle */
UPDATE __mj_BizAppsForms."FormStyle" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormStyle' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormStyle" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormStyle" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormQuestion"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormQuestion */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormQuestion */
UPDATE __mj_BizAppsForms."FormQuestion" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormQuestion' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormQuestion" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormQuestion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormQuestion"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormQuestion */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormQuestion */
UPDATE __mj_BizAppsForms."FormQuestion" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormQuestion' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormQuestion" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormQuestion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormResponseAnswer"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormResponseAnswer */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsForms.FormResponseAnswer */
UPDATE __mj_BizAppsForms."FormResponseAnswer" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormResponseAnswer' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormResponseAnswer" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormResponseAnswer" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj_BizAppsForms."FormResponseAnswer"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormResponseAnswer */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsForms.FormResponseAnswer */
UPDATE __mj_BizAppsForms."FormResponseAnswer" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'FormResponseAnswer' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj_BizAppsForms."FormResponseAnswer" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsForms."FormResponseAnswer" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '994dcc05-13cf-45b4-b70d-4ef00e053997' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('994dcc05-13cf-45b4-b70d-4ef00e053997', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f3e792a1-6b2b-448e-95b1-0c2ecab5febc' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'QuestionID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3e792a1-6b2b-448e-95b1-0c2ecab5febc', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100002, 'QuestionID', 'Question ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '02b3434b-2660-4665-b1d7-383876adfc24' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'Label')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02b3434b-2660-4665-b1d7-383876adfc24', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100003, 'Label', 'Label', 'Label shown to the respondent for this option', 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '34062c98-e7f1-4000-8e98-ac020b1b7225' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'Value')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34062c98-e7f1-4000-8e98-ac020b1b7225', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100004, 'Value', 'Value', 'Stored value for this option (defaults to Label when omitted)', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'afeea024-7e9f-4c98-aee1-0332d898c101' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'DisplayOrder')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('afeea024-7e9f-4c98-aee1-0332d898c101', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100005, 'DisplayOrder', 'Display Order', 'Sort order of the option within its question. Lower values appear first', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '405711df-cdb0-4ffa-88af-af9d9e971fca' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = 'IsDefault')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('405711df-cdb0-4ffa-88af-af9d9e971fca', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100006, 'IsDefault', 'Is Default', 'Whether this option is selected by default', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a491cd71-2032-48c4-9579-23ac41803627' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a491cd71-2032-48c4-9579-23ac41803627', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7586e5e7-058e-4172-b75a-f322768d89ae' OR ("EntityID" = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7586e5e7-058e-4172-b75a-f322768d89ae', 'BF3016E2-8BA7-4975-83B6-02C9435C1441' /* Entity: MJ_BizApps_Forms: Form Question Options */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'eb722f5e-2fd8-437a-8b1a-ef01a930f980' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb722f5e-2fd8-437a-8b1a-ef01a930f980', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6798b45d-6288-4a1c-bdfe-4c1d29929b5f' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'FormID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6798b45d-6288-4a1c-bdfe-4c1d29929b5f', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100002, 'FormID', 'Form ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '20e36f64-0f3f-4c81-8645-659c9f50f5fa' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'Name')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('20e36f64-0f3f-4c81-8645-659c9f50f5fa', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100003, 'Name', 'Name', 'Internal name for this distribution', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '866866b1-f573-4d3d-acdb-c74582a22054' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'Slug')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('866866b1-f573-4d3d-acdb-c74582a22054', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100004, 'Slug', 'Slug', 'URL-friendly slug used in the public link (unique when set)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '3a10a102-4a2a-4f15-bdad-231bd16ec34f' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'ChannelType')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a10a102-4a2a-4f15-bdad-231bd16ec34f', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100005, 'ChannelType', 'Channel Type', 'Channel type: PublicLink, Embed, QR, or Email', 'nvarchar', 40, 0, 0, FALSE, 'PublicLink', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b2168352-1a2c-413d-a7f2-0ad9ae14bfac' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'Status')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b2168352-1a2c-413d-a7f2-0ad9ae14bfac', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100006, 'Status', 'Status', 'Distribution status: Draft, Active, or Closed', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6ca1d54e-3de5-4505-9d62-f5f46031b164' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'OpenAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6ca1d54e-3de5-4505-9d62-f5f46031b164', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100007, 'OpenAt', 'Open At', 'When this distribution opens for responses (null = immediately)', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e2346265-1bb3-4957-9768-b7a286339d38' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'CloseAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e2346265-1bb3-4957-9768-b7a286339d38', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100008, 'CloseAt', 'Close At', 'When this distribution stops accepting responses (null = no end)', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd0668174-8180-4c67-9df7-8183e0b30851' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'MaxResponses')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d0668174-8180-4c67-9df7-8183e0b30851', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100009, 'MaxResponses', 'Max Responses', 'Maximum number of responses allowed through this distribution (null = unlimited)', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '19a5fb8d-be86-4f84-9bb9-45437a878efb' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'ResponseCount')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19a5fb8d-be86-4f84-9bb9-45437a878efb', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100010, 'ResponseCount', 'Response Count', 'Running count of responses received through this distribution', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b77f00d4-f944-4023-9a5e-3ee46e242b6a' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'MagicLinkInviteID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b77f00d4-f944-4023-9a5e-3ee46e242b6a', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100011, 'MagicLinkInviteID', 'Magic Link Invite ID', 'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b8fc49df-b819-41f0-b1de-dadbff171519' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'CaptchaRequired')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8fc49df-b819-41f0-b1de-dadbff171519', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100012, 'CaptchaRequired', 'Captcha Required', 'Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '284688de-aea8-4960-aa9a-b98ed80bcf96' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'IsActive')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('284688de-aea8-4960-aa9a-b98ed80bcf96', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100013, 'IsActive', 'Is Active', 'Whether this distribution is active and usable', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '41d93c94-5cb9-4126-8e63-f662c05878e2' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41d93c94-5cb9-4126-8e63-f662c05878e2', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100014, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '1053b9b8-3094-4201-9903-506a702dff22' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1053b9b8-3094-4201-9903-506a702dff22', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100015, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f1fe5a15-8a97-4e58-969c-9141f08645f8' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1fe5a15-8a97-4e58-969c-9141f08645f8', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'dc96c1fc-1f9b-4d7a-9fc7-9c25a7161d1f' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'FormID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc96c1fc-1f9b-4d7a-9fc7-9c25a7161d1f', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100002, 'FormID', 'Form ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f566f224-45b9-4629-b04b-a3b39eb13e54' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'FormVersionID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f566f224-45b9-4629-b04b-a3b39eb13e54', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100003, 'FormVersionID', 'Form Version ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '622E2804-5B6D-4B43-92A4-294ADC538F50', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '38ca5677-5a04-4121-aa5c-d8fd325fef67' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'Status')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38ca5677-5a04-4121-aa5c-d8fd325fef67', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100004, 'Status', 'Status', 'Completion status: Partial or Complete', 'nvarchar', 40, 0, 0, FALSE, 'Partial', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c3db71fe-8c4f-47e7-9ce3-4fe7182ec829' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'AnonymousSessionID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3db71fe-8c4f-47e7-9ce3-4fe7182ec829', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100005, 'AnonymousSessionID', 'Anonymous Session ID', 'Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a6cfe92b-2751-4668-8651-0b6c25f23b17' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'RespondentPersonID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6cfe92b-2751-4668-8651-0b6c25f23b17', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100006, 'RespondentPersonID', 'Respondent Person ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c1fd44fb-013f-4919-8214-fb04a5968e93' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'StartedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c1fd44fb-013f-4919-8214-fb04a5968e93', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100007, 'StartedAt', 'Started At', 'Timestamp the respondent began the form', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fd111def-402d-4044-9e13-8a115beb1fba' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'SubmittedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd111def-402d-4044-9e13-8a115beb1fba', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100008, 'SubmittedAt', 'Submitted At', 'Timestamp the response was submitted (null while Partial)', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '5a92b934-65e1-4fee-92de-c53a776ad87c' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'SourceMetadata')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5a92b934-65e1-4fee-92de-c53a776ad87c', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100009, 'SourceMetadata', 'Source Metadata', 'JSON source metadata: hashed IP, user-agent, distribution id, referrer', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '304f0501-0984-4454-88c7-62b2fd251fdd' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('304f0501-0984-4454-88c7-62b2fd251fdd', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '14c4d3dc-bcc7-4cfb-93ff-e40914d80433' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14c4d3dc-bcc7-4cfb-93ff-e40914d80433', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '36b23d09-ef86-4a96-99ed-a862203c95c5' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36b23d09-ef86-4a96-99ed-a862203c95c5', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '9a7d5e0a-73a9-4461-84e9-5ae14ee24990' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'FormID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9a7d5e0a-73a9-4461-84e9-5ae14ee24990', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100002, 'FormID', 'Form ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '1baa2ea5-c5a4-4f8b-b6ed-84c2eb7f4a02' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'VersionNumber')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1baa2ea5-c5a4-4f8b-b6ed-84c2eb7f4a02', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100003, 'VersionNumber', 'Version Number', 'Monotonic version number within a form', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '36801486-e291-48f4-bc02-432be04642f3' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'Status')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36801486-e291-48f4-bc02-432be04642f3', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100004, 'Status', 'Status', 'Version status: Draft, Published, or Retired', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e833c165-d0dd-4491-afdc-fae97236f845' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'PublishedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e833c165-d0dd-4491-afdc-fae97236f845', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100005, 'PublishedAt', 'Published At', 'Timestamp this version was published (null while Draft)', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'abba6d48-7952-4065-ab3c-eb99cffcdf5e' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'DefinitionSnapshot')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abba6d48-7952-4065-ab3c-eb99cffcdf5e', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100006, 'DefinitionSnapshot', 'Definition Snapshot', 'Full pages/questions/options/logic as published, captured as a JSON snapshot', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '948df34c-0257-4077-acb9-a6289b63fc48' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('948df34c-0257-4077-acb9-a6289b63fc48', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '561e289e-c030-4320-a55d-71d46febabe8' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('561e289e-c030-4320-a55d-71d46febabe8', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8dc15128-b17f-45c1-87be-dc4cd02b49e6' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8dc15128-b17f-45c1-87be-dc4cd02b49e6', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '78b49574-a9c0-41b2-9352-01c24fe35fba' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Name')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('78b49574-a9c0-41b2-9352-01c24fe35fba', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100002, 'Name', 'Name', 'Display name of the form', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '27d8b5eb-327d-4379-9836-154ff01c06be' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Description')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27d8b5eb-327d-4379-9836-154ff01c06be', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100003, 'Description', 'Description', 'Detailed description / purpose of the form', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2421f226-3a60-4e97-94f0-b819aee55e6a' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'CategoryID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2421f226-3a60-4e97-94f0-b819aee55e6a', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100004, 'CategoryID', 'Category ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'cafefeb9-0912-41c4-aa68-83ab38119540' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'StyleID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cafefeb9-0912-41c4-aa68-83ab38119540', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100005, 'StyleID', 'Style ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '1EF36DB1-004D-4672-8A57-A0F3B71C0050', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8c879f40-9016-463a-99c5-1bd6495cf3a5' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Status')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c879f40-9016-463a-99c5-1bd6495cf3a5', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100006, 'Status', 'Status', 'Lifecycle status: Draft, Published, or Closed', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8ae25576-ac84-41c5-9176-56c0b4b1698a' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'OwnerUserID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ae25576-ac84-41c5-9176-56c0b4b1698a', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100007, 'OwnerUserID', 'Owner User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6e914524-14e8-4408-96b6-cbc4b6b97e17' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'RenderMode')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e914524-14e8-4408-96b6-cbc4b6b97e17', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100008, 'RenderMode', 'Render Mode', 'Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)', 'nvarchar', 40, 0, 0, FALSE, 'Scroll', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd82a7d4b-5ff0-4cd6-a891-2e5de984ca1b' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Settings')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d82a7d4b-5ff0-4cd6-a891-2e5de984ca1b', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100009, 'Settings', 'Settings', 'JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '292e2057-dd6f-4d78-beaf-f5ee6f12cd0d' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('292e2057-dd6f-4d78-beaf-f5ee6f12cd0d', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100010, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '37ca4680-5a61-4205-bd03-fb37143c698b' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('37ca4680-5a61-4205-bd03-fb37143c698b', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100011, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '499a1f6f-ed7b-4a6b-9f41-ce033e0f4117' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('499a1f6f-ed7b-4a6b-9f41-ce033e0f4117', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'dca0c023-9dac-4610-be75-b992961f0d73' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'FormID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dca0c023-9dac-4610-be75-b992961f0d73', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100002, 'FormID', 'Form ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '85651746-4fd6-4b72-8e1e-cf6d9155358c' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'Title')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85651746-4fd6-4b72-8e1e-cf6d9155358c', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100003, 'Title', 'Title', 'Page title shown to respondents', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e9e0b37b-2360-49e9-b0f5-09d27718e771' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'Description')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e9e0b37b-2360-49e9-b0f5-09d27718e771', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100004, 'Description', 'Description', 'Page description / intro text', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '885257f0-f6a9-4999-8c07-6b5764c3b8a6' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'DisplayOrder')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('885257f0-f6a9-4999-8c07-6b5764c3b8a6', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100005, 'DisplayOrder', 'Display Order', 'Sort order of the page within the form. Lower values appear first', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a6895d0e-fbf5-420b-924a-f6bfde686f0c' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'ConditionalRule')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6895d0e-fbf5-420b-924a-f6bfde686f0c', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100006, 'ConditionalRule', 'Conditional Rule', 'JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '89ac8052-1b77-4569-90d5-90b7c4e7edfa' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('89ac8052-1b77-4569-90d5-90b7c4e7edfa', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2e12e031-c7d1-495d-9d51-86b9693c6d08' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2e12e031-c7d1-495d-9d51-86b9693c6d08', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e02e1400-5755-45bb-b7af-b2a73bfa2b83' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e02e1400-5755-45bb-b7af-b2a73bfa2b83', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'bc9e36ef-c93e-48bf-9f84-53f402ce6de2' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'Name')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc9e36ef-c93e-48bf-9f84-53f402ce6de2', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100002, 'Name', 'Name', 'Display name of the category', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '4028417c-6bbd-41dc-8429-27bc0020690e' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'Description')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4028417c-6bbd-41dc-8429-27bc0020690e', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100003, 'Description', 'Description', 'Detailed description of this category', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'bfec1de7-95e3-4c68-841e-80402093eade' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'ParentID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bfec1de7-95e3-4c68-841e-80402093eade', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100004, 'ParentID', 'Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '5f77b517-002f-4bfd-942e-2063342d5014' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'IconClass')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f77b517-002f-4bfd-942e-2063342d5014', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100005, 'IconClass', 'Icon Class', 'Font Awesome icon class for UI display', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd79c0b78-e04f-421b-a400-ca553ff59323' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'DisplayRank')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d79c0b78-e04f-421b-a400-ca553ff59323', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100006, 'DisplayRank', 'Display Rank', 'Sort order among siblings. Lower values appear first', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '93b156ad-2c29-4092-91c2-65f92e98e578' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'IsActive')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('93b156ad-2c29-4092-91c2-65f92e98e578', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100007, 'IsActive', 'Is Active', 'Whether this category is available for selection. Inactive categories are hidden but preserved', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '77de29d8-1a47-4174-a476-14d2fbf10d3b' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77de29d8-1a47-4174-a476-14d2fbf10d3b', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100008, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '4235ac79-5aa0-4232-8754-b037487f1397' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4235ac79-5aa0-4232-8754-b037487f1397', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100009, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '79db70ec-842f-4f05-9d16-876d59f3ab69' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('79db70ec-842f-4f05-9d16-876d59f3ab69', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e99aca0b-4f27-49a8-96f0-d6b4244920a1' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'Name')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e99aca0b-4f27-49a8-96f0-d6b4244920a1', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100002, 'Name', 'Name', 'Display name of the style/theme', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd7100a09-f513-4d69-9f62-29add26140f7' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'Description')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7100a09-f513-4d69-9f62-29add26140f7', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100003, 'Description', 'Description', 'Detailed description of this style', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f090b12b-bc26-40f6-94b1-05c08c761230' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'CSSVariables')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f090b12b-bc26-40f6-94b1-05c08c761230', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100004, 'CSSVariables', 'CSS Variables', 'JSON object of --mj-* design-token overrides applied to the respondent widget', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e3d8d3c6-f6fa-49ff-8a2a-318118dbf94f' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'CustomCSS')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e3d8d3c6-f6fa-49ff-8a2a-318118dbf94f', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100005, 'CustomCSS', 'Custom CSS', 'Optional raw CSS appended after the token overrides for advanced theming', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd950cb92-e4ab-4799-be78-83850e027650' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'LogoURL')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d950cb92-e4ab-4799-be78-83850e027650', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100006, 'LogoURL', 'Logo URL', 'URL of a logo to display on forms using this style', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '94bce002-088d-4d73-83e0-76666ba3055f' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'DisplayRank')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94bce002-088d-4d73-83e0-76666ba3055f', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100007, 'DisplayRank', 'Display Rank', 'Sort order in style pickers. Lower values appear first', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '38345d6e-f2ad-4fda-81b0-255b00f177a5' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = 'IsActive')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38345d6e-f2ad-4fda-81b0-255b00f177a5', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100008, 'IsActive', 'Is Active', 'Whether this style is available for selection. Inactive styles are hidden but preserved', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a30dbd4a-a40b-4b26-ba51-a1bcedede24e' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a30dbd4a-a40b-4b26-ba51-a1bcedede24e', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '62ff749c-aa71-4a58-a831-f252380645b6' OR ("EntityID" = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('62ff749c-aa71-4a58-a831-f252380645b6', '1EF36DB1-004D-4672-8A57-A0F3B71C0050' /* Entity: MJ_BizApps_Forms: Form Styles */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e9903e88-261d-4043-becc-a9448e75bf8a' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e9903e88-261d-4043-becc-a9448e75bf8a', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c83fddaa-982b-4756-9488-f01f819889b8' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'FormID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c83fddaa-982b-4756-9488-f01f819889b8', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100002, 'FormID', 'Form ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e5610750-df58-471f-933d-a8873b15600b' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'PageID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5610750-df58-471f-933d-a8873b15600b', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100003, 'PageID', 'Page ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '0a4ff448-80df-4d5d-94ec-e315822a1b45' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'QuestionType')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a4ff448-80df-4d5d-94ec-e315822a1b45', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100004, 'QuestionType', 'Question Type', 'Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)', 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f43882ad-2dfd-4bc3-9fbe-abf60adff048' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'Prompt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f43882ad-2dfd-4bc3-9fbe-abf60adff048', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100005, 'Prompt', 'Prompt', 'The question text shown to the respondent', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a3f91065-efbc-48a3-9546-80e3a431344d' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'HelpText')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3f91065-efbc-48a3-9546-80e3a431344d', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100006, 'HelpText', 'Help Text', 'Optional helper/assistive text shown beneath the prompt', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '27b92bc4-4f9b-4167-abc9-b22d7eb6939a' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'IsRequired')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27b92bc4-4f9b-4167-abc9-b22d7eb6939a', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100007, 'IsRequired', 'Is Required', 'Whether an answer is required before the form can be submitted', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b404e767-712e-48dd-9b1c-849074a06d5d' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'DisplayOrder')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b404e767-712e-48dd-9b1c-849074a06d5d', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100008, 'DisplayOrder', 'Display Order', 'Sort order of the question within its page. Lower values appear first', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a2677db5-121e-41f1-862b-6f7fe876fefa' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'ValidationRule')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a2677db5-121e-41f1-862b-6f7fe876fefa', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100009, 'ValidationRule', 'Validation Rule', 'JSON validation rule (min/max, regex, length, etc.) applied client- and server-side', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd7ec6a52-f85c-45d8-89e4-26cadf2efcca' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'ConditionalRule')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7ec6a52-f85c-45d8-89e4-26cadf2efcca', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100010, 'ConditionalRule', 'Conditional Rule', 'JSON show/hide rule evaluated against prior answers (see plan §6)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'bfae940f-b36b-479d-833d-88ba789da4a7' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'ScoringConfig')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bfae940f-b36b-479d-833d-88ba789da4a7', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100011, 'ScoringConfig', 'Scoring Config', 'JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '9685e608-f874-4dce-92b1-c628fc77db15' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'Settings')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9685e608-f874-4dce-92b1-c628fc77db15', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100012, 'Settings', 'Settings', 'JSON per-type settings (e.g. rating scale, NPS labels, file constraints)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd6f82852-d6ba-42c5-8085-af83bc25896c' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6f82852-d6ba-42c5-8085-af83bc25896c', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100013, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd4960171-01a7-4200-93eb-794f736f616e' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4960171-01a7-4200-93eb-794f736f616e', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100014, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '4d082382-a267-408a-8aa5-40ec3162682b' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'ID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d082382-a267-408a-8aa5-40ec3162682b', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b4d02511-4eb2-4d84-a3f7-a1b9d15666d9' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'ResponseID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b4d02511-4eb2-4d84-a3f7-a1b9d15666d9', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100002, 'ResponseID', 'Response ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a500243a-077b-4218-b5cc-8dc9d123206c' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'QuestionID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a500243a-077b-4218-b5cc-8dc9d123206c', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100003, 'QuestionID', 'Question ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'acf08639-0240-41ae-a165-d793e087e262' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'TextValue')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('acf08639-0240-41ae-a165-d793e087e262', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100004, 'TextValue', 'Text Value', 'Text answer value (short/long text, email, phone, single-choice label, etc.)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '31571eca-c123-49bd-b9e3-493d561d0f86' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'NumericValue')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('31571eca-c123-49bd-b9e3-493d561d0f86', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100005, 'NumericValue', 'Numeric Value', 'Numeric answer value (Number, Rating, NPS)', 'decimal', 9, 18, 4, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '1381e224-7565-483d-8012-f03df96a1e77' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'DateValue')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1381e224-7565-483d-8012-f03df96a1e77', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100006, 'DateValue', 'Date Value', 'Date/time answer value (Date, Time)', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '4c390d42-2642-4568-9bd9-a01d1dbd56f1' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'BooleanValue')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4c390d42-2642-4568-9bd9-a01d1dbd56f1', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100007, 'BooleanValue', 'Boolean Value', 'Boolean answer value (YesNo)', 'bit', 1, 1, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e62dbdc4-ce0c-4723-99fe-83fe905ccf18' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'JSONValue')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e62dbdc4-ce0c-4723-99fe-83fe905ccf18', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100008, 'JSONValue', 'JSON Value', 'JSON answer value for multi-select or complex/structured answers', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '75af68cf-0a5b-410d-a087-a43f1a0f3a47' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'FileID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('75af68cf-0a5b-410d-a087-a43f1a0f3a47', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100009, 'FileID', 'File ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '3ac92d71-70ff-498a-a316-993a78979c61' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'Score')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ac92d71-70ff-498a-a316-993a78979c61', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100010, 'Score', 'Score', 'Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored', 'decimal', 9, 18, 4, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7c03ead1-3a5b-408c-aeb6-261318143025' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'ScoreRationale')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7c03ead1-3a5b-408c-aeb6-261318143025', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100011, 'ScoreRationale', 'Score Rationale', 'Rationale/explanation for the assigned score (LLM-judge output)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b3c5d14a-5fa8-47d4-9450-e0d3434fb3fe' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3c5d14a-5fa8-47d4-9450-e0d3434fb3fe', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100012, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fc891545-f18b-4afb-a46b-fc89ed81f14f' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fc891545-f18b-4afb-a46b-fc89ed81f14f', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100013, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 46f3b85f-0008-49a6-b137-7ad3b610e9aa */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '46f3b85f-0008-49a6-b137-7ad3b610e9aa',
    '8C879F40-9016-463A-99C5-1BD6495CF3A5',
    1,
    'Closed',
    'Closed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 48c3b8da-e89b-4ed1-b983-6127edde45b6 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '48c3b8da-e89b-4ed1-b983-6127edde45b6',
    '8C879F40-9016-463A-99C5-1BD6495CF3A5',
    2,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4125b0d3-1b51-4905-951c-be612b14aad1 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4125b0d3-1b51-4905-951c-be612b14aad1',
    '8C879F40-9016-463A-99C5-1BD6495CF3A5',
    3,
    'Published',
    'Published',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8C879F40-9016-463A-99C5-1BD6495CF3A5 */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8C879F40-9016-463A-99C5-1BD6495CF3A5';
/* SQL text to insert entity field value with ID 2fbc806c-0504-432d-8e7d-cd4e237df8aa */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2fbc806c-0504-432d-8e7d-cd4e237df8aa',
    '6E914524-14E8-4408-96B6-CBC4B6B97E17',
    1,
    'OneQuestion',
    'OneQuestion',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ac4ea032-ba66-4243-a55f-7572498709ea */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ac4ea032-ba66-4243-a55f-7572498709ea',
    '6E914524-14E8-4408-96B6-CBC4B6B97E17',
    2,
    'Scroll',
    'Scroll',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 6E914524-14E8-4408-96B6-CBC4B6B97E17 */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6E914524-14E8-4408-96B6-CBC4B6B97E17';
/* SQL text to insert entity field value with ID 5a506965-8ae0-4a8d-aac1-1dbf18a52425 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5a506965-8ae0-4a8d-aac1-1dbf18a52425',
    '36801486-E291-48F4-BC02-432BE04642F3',
    1,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c7020cbb-cdb4-4dcf-87fd-f34ca7023ee3 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c7020cbb-cdb4-4dcf-87fd-f34ca7023ee3',
    '36801486-E291-48F4-BC02-432BE04642F3',
    2,
    'Published',
    'Published',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3d7c6481-453b-4def-a7fa-cfbd99a3665f */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '3d7c6481-453b-4def-a7fa-cfbd99a3665f',
    '36801486-E291-48F4-BC02-432BE04642F3',
    3,
    'Retired',
    'Retired',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 36801486-E291-48F4-BC02-432BE04642F3 */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '36801486-E291-48F4-BC02-432BE04642F3';
/* SQL text to insert entity field value with ID b603b9ee-e9f1-41a8-8d9c-500160f70c92 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b603b9ee-e9f1-41a8-8d9c-500160f70c92',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    1,
    'Date',
    'Date',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6e88eeec-0c44-413b-9add-c1dd8d325215 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6e88eeec-0c44-413b-9add-c1dd8d325215',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    2,
    'Dropdown',
    'Dropdown',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 2d1336bf-066e-402b-a823-8d94ab544ea2 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2d1336bf-066e-402b-a823-8d94ab544ea2',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    3,
    'Email',
    'Email',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f7963bb8-b712-40dd-a7b5-9b18a5b14ae1 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f7963bb8-b712-40dd-a7b5-9b18a5b14ae1',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    4,
    'FileUpload',
    'FileUpload',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bef3dc65-2dbe-4d98-8675-696a2be17a59 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bef3dc65-2dbe-4d98-8675-696a2be17a59',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    5,
    'LongText',
    'LongText',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7c8be7c9-6a4f-454c-a855-81751fb8955e */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7c8be7c9-6a4f-454c-a855-81751fb8955e',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    6,
    'MultiChoice',
    'MultiChoice',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7af7260d-177f-413f-aabc-a07121c4f538 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7af7260d-177f-413f-aabc-a07121c4f538',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    7,
    'NPS',
    'NPS',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 236665a7-f0ca-4254-92e7-106dcd6dfd35 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '236665a7-f0ca-4254-92e7-106dcd6dfd35',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    8,
    'Number',
    'Number',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 47b88450-fda8-4a13-bec7-38c6a7f2daee */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '47b88450-fda8-4a13-bec7-38c6a7f2daee',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    9,
    'Phone',
    'Phone',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5a836273-74fd-4d37-8918-a1cb0f5dee57 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5a836273-74fd-4d37-8918-a1cb0f5dee57',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    10,
    'Rating',
    'Rating',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 753c2962-6d2a-4081-8869-231cf37a15c8 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '753c2962-6d2a-4081-8869-231cf37a15c8',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    11,
    'ShortText',
    'ShortText',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4b4b6b5e-54f8-433f-bb63-cd271191d464 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4b4b6b5e-54f8-433f-bb63-cd271191d464',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    12,
    'SingleChoice',
    'SingleChoice',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d17f31f1-cfda-4684-9f76-ca0c8c17129b */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd17f31f1-cfda-4684-9f76-ca0c8c17129b',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    13,
    'Statement',
    'Statement',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f99a1046-5229-43fb-b95b-394208573996 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f99a1046-5229-43fb-b95b-394208573996',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    14,
    'Time',
    'Time',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 00cd7332-1881-48de-ae14-16d3a89c7835 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '00cd7332-1881-48de-ae14-16d3a89c7835',
    '0A4FF448-80DF-4D5D-94EC-E315822A1B45',
    15,
    'YesNo',
    'YesNo',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 0A4FF448-80DF-4D5D-94EC-E315822A1B45 */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '0A4FF448-80DF-4D5D-94EC-E315822A1B45';
/* SQL text to insert entity field value with ID e3a63078-de8f-4836-9c49-fda146d97c6c */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e3a63078-de8f-4836-9c49-fda146d97c6c',
    '3A10A102-4A2A-4F15-BDAD-231BD16EC34F',
    1,
    'Email',
    'Email',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 92634c32-6ea1-4a07-ada7-bfcf3ec710c7 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '92634c32-6ea1-4a07-ada7-bfcf3ec710c7',
    '3A10A102-4A2A-4F15-BDAD-231BD16EC34F',
    2,
    'Embed',
    'Embed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a4e687dd-a28f-4bcb-b2d1-b9fa26d640c2 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'a4e687dd-a28f-4bcb-b2d1-b9fa26d640c2',
    '3A10A102-4A2A-4F15-BDAD-231BD16EC34F',
    3,
    'PublicLink',
    'PublicLink',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7ed9f470-3169-41a3-99ae-49b73fec367c */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7ed9f470-3169-41a3-99ae-49b73fec367c',
    '3A10A102-4A2A-4F15-BDAD-231BD16EC34F',
    4,
    'QR',
    'QR',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3A10A102-4A2A-4F15-BDAD-231BD16EC34F */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F';
/* SQL text to insert entity field value with ID ec642f96-3acc-4627-a0f4-cad9bf0cc80f */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ec642f96-3acc-4627-a0f4-cad9bf0cc80f',
    'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 13f97d82-a070-490f-a8be-da1129a3ed3e */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '13f97d82-a070-490f-a8be-da1129a3ed3e',
    'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC',
    2,
    'Closed',
    'Closed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8adec9aa-cbb8-4561-9d7c-0d806fff9b1a */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8adec9aa-cbb8-4561-9d7c-0d806fff9b1a',
    'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC',
    3,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B2168352-1A2C-413D-A7F2-0AD9AE14BFAC */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC';
/* SQL text to insert entity field value with ID bf7fe39e-306d-407a-a86a-2aa338acd0b7 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bf7fe39e-306d-407a-a86a-2aa338acd0b7',
    '38CA5677-5A04-4121-AA5C-D8FD325FEF67',
    1,
    'Complete',
    'Complete',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 719712d6-558c-4087-8c3c-a1254801e211 */
INSERT INTO "${mjSchema}"."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '719712d6-558c-4087-8c3c-a1254801e211',
    '38CA5677-5A04-4121-AA5C-D8FD325FEF67',
    2,
    'Partial',
    'Partial',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 38CA5677-5A04-4121-AA5C-D8FD325FEF67 */
UPDATE "${mjSchema}"."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '38CA5677-5A04-4121-AA5C-D8FD325FEF67';
/* Create Entity Relationship: MJ_BizApps_Forms: Form Responses -> MJ_BizApps_Forms: Form Response Answers (One To Many via ResponseID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'e257cc40-2091-4c6f-9d5f-e30a95140e53') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e257cc40-2091-4c6f-9d5f-e30a95140e53', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'ResponseID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '50260ae4-7623-4726-b049-523bb931f1ea') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50260ae4-7623-4726-b049-523bb931f1ea', '622E2804-5B6D-4B43-92A4-294ADC538F50', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FormVersionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'ba2b7ea1-3602-4763-8358-f46617a0306a') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba2b7ea1-3602-4763-8358-f46617a0306a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'OwnerUserID', 'One To Many', TRUE, TRUE, 108, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'c11d64f0-e2af-401c-bb75-f31ae1905c2c') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c11d64f0-e2af-401c-bb75-f31ae1905c2c', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'FileID', 'One To Many', TRUE, TRUE, 6, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'bad12a59-2724-4a47-8808-785ce1edab63') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bad12a59-2724-4a47-8808-785ce1edab63', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '1FC60BDA-25B8-473B-ACE5-1238670D3535', 'FormID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '3f0828d1-fbdb-464f-8fa5-8dc40626a743') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3f0828d1-fbdb-464f-8fa5-8dc40626a743', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '622E2804-5B6D-4B43-92A4-294ADC538F50', 'FormID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '6a072e73-3670-4200-b45f-4ec7c9858ef0') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a072e73-3670-4200-b45f-4ec7c9858ef0', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'FormID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '5981266e-6f57-45df-a394-9aaeabd5ac7f') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5981266e-6f57-45df-a394-9aaeabd5ac7f', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'FormID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'de633c98-baf5-406e-8159-3937b611c2e3') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de633c98-baf5-406e-8159-3937b611c2e3', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FormID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'eff9400a-94da-4f3c-85aa-9a5492dc1867') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eff9400a-94da-4f3c-85aa-9a5492dc1867', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'PageID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '29184830-0df4-4ca8-95f2-18959fadc81f') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29184830-0df4-4ca8-95f2-18959fadc81f', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'CategoryID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '9d6bbfd7-0150-4389-9ed1-c3c66ee78598') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d6bbfd7-0150-4389-9ed1-c3c66ee78598', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'ParentID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '29c119d5-4dc2-4e7b-be58-395f024aaf0a') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29c119d5-4dc2-4e7b-be58-395f024aaf0a', '1EF36DB1-004D-4672-8A57-A0F3B71C0050', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'StyleID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '60b1b456-9eaa-4b65-902c-47eb232e5ca1') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('60b1b456-9eaa-4b65-902c-47eb232e5ca1', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'BF3016E2-8BA7-4975-83B6-02C9435C1441', 'QuestionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'a03dd408-f488-48f5-a453-df62bd37a05a') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a03dd408-f488-48f5-a453-df62bd37a05a', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'QuestionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '446d0b34-2281-4987-bf84-667f68870677') THEN
    INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('446d0b34-2281-4987-bf84-667f68870677', '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'RespondentPersonID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7331258f-34a3-4bda-b4db-347db3a16148' OR ("EntityID" = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND "Name" = 'Form')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7331258f-34a3-4bda-b4db-347db3a16148', '1FC60BDA-25B8-473B-ACE5-1238670D3535' /* Entity: MJ_BizApps_Forms: Form Distributions */, 100031, 'Form', 'Form', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6a6fca68-3ed7-437a-85ff-e94b903994c3' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'Form')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6a6fca68-3ed7-437a-85ff-e94b903994c3', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100023, 'Form', 'Form', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fd73ced5-a116-4a34-be6f-12c86f054274' OR ("EntityID" = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND "Name" = 'RespondentPerson')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd73ced5-a116-4a34-be6f-12c86f054274', '63600739-7165-4BDC-B7D7-19A1B1951DFA' /* Entity: MJ_BizApps_Forms: Form Responses */, 100024, 'RespondentPerson', 'Respondent Person', NULL, 'nvarchar', 402, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e99b2d46-1141-43e9-a3b8-578a0e25dc65' OR ("EntityID" = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND "Name" = 'Form')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e99b2d46-1141-43e9-a3b8-578a0e25dc65', '622E2804-5B6D-4B43-92A4-294ADC538F50' /* Entity: MJ_BizApps_Forms: Form Versions */, 100017, 'Form', 'Form', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e8a0c1d1-ce9d-439d-8034-04abefa7eb40' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Category')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e8a0c1d1-ce9d-439d-8034-04abefa7eb40', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100023, 'Category', 'Category', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fb29e97e-f448-4c04-9d4b-8f79ba25be65' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'Style')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb29e97e-f448-4c04-9d4b-8f79ba25be65', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100024, 'Style', 'Style', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a744f418-66db-4475-a548-009f548b0105' OR ("EntityID" = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND "Name" = 'OwnerUser')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a744f418-66db-4475-a548-009f548b0105', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' /* Entity: MJ_BizApps_Forms: Forms */, 100025, 'OwnerUser', 'Owner User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '888297d3-e8c8-4bc2-ba81-7583b2987424' OR ("EntityID" = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND "Name" = 'Form')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('888297d3-e8c8-4bc2-ba81-7583b2987424', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' /* Entity: MJ_BizApps_Forms: Form Pages */, 100017, 'Form', 'Form', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '23b52466-20e8-4bad-9415-3ed07e743b8e' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'Parent')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23b52466-20e8-4bad-9415-3ed07e743b8e', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100019, 'Parent', 'Parent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'abe1e6be-cd00-4cf7-819f-63d3157ec493' OR ("EntityID" = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND "Name" = 'RootParentID')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abe1e6be-cd00-4cf7-819f-63d3157ec493', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' /* Entity: MJ_BizApps_Forms: Form Categories */, 100020, 'RootParentID', 'Root Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '581327c5-0a60-41ba-a25a-3b5a171050cc' OR ("EntityID" = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND "Name" = 'Form')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('581327c5-0a60-41ba-a25a-3b5a171050cc', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' /* Entity: MJ_BizApps_Forms: Form Questions */, 100029, 'Form', 'Form', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '5345a5a1-e772-43f6-8fad-9794c3153d2e' OR ("EntityID" = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND "Name" = 'File')) THEN
    INSERT INTO "${mjSchema}"."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5345a5a1-e772-43f6-8fad-9794c3153d2e', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' /* Entity: MJ_BizApps_Forms: Form Response Answers */, 100027, 'File', 'File', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ── CodeGen reconciliation (the four EXECUTEs the transpiler reported as unhandled) ──
-- These are MJ core's own routines and they exist natively on PostgreSQL. Calling them is
-- the faithful port of what the T-SQL migration does at lines 1203 / 8481 / 8484 / 8852 —
-- and it is not cosmetic: spUpdateExistingEntityFieldsFromSchema is what rewrites the
-- placeholder Sequence values CodeGen assigns to newly-inserted fields (100001, 100002, …)
-- into real ordinal positions. Without it a PG install ships field ordering that no SQL
-- Server install has, and the runbook's codegen no-op check fails on 121 rows.
-- Excluded-schema list matches the T-SQL verbatim.
SELECT ${mjSchema}."spUpdateExistingEntitiesFromSchema"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateExistingEntityFieldsFromSchema"('sys,staging,dbo,${mjSchema}', NULL);
SELECT ${mjSchema}."spSetDefaultColumnWidthWhereNeeded"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateSchemaInfoFromDatabase"('sys,staging,dbo,${mjSchema}');
