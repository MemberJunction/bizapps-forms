-- ============================================================================
-- CodeGen objects — catalog capture (PostgreSQL only)
-- ============================================================================
-- Base views, CRUD functions, update triggers and grants for every Forms entity, captured
-- verbatim from a database that had the full migration set applied and `mj codegen` run
-- once. Shipping them means a PostgreSQL install is complete WITHOUT running codegen —
-- which is the entire point: consumers install an Open App, they do not code-generate it.
--
-- Why a catalog capture rather than CodeGen's own SQL log: CodeGen writes to that log only
-- for entities whose METADATA it changed. The migrations above already carry the metadata,
-- so CodeGen logged almost nothing while still building every object. The catalog is the
-- record of what was actually built.
--
-- `.pgonly.sql`: on SQL Server the equivalent objects are appended into the T-SQL
-- migrations by `npm run mj:codegen` (appendOutputCode), so there is no counterpart file.
--
-- MAINTENANCE CONTRACT. These definitions are frozen at the schema state of the last
-- migration above. When a future migration regenerates any view, CRUD function or trigger,
-- the new definition must be captured into a NEW PG migration. The regression test is the
-- runbook's no-op check (migrations-pg/docs/PG_INSTALL_VERIFICATION.md step 5): if
-- `mj codegen` changes catalog or metadata state after a fresh `mj migrate`, a capture
-- is missing.
--
-- The schema name is emitted unquoted so PostgreSQL folds it to the physical, lower-case
-- name the installer creates. Object names stay quoted and mixed-case — those are real
-- identifiers, not data.
-- ============================================================================
SET standard_conforming_strings = on;

-- Functions are created BEFORE the views: a base view can call a helper function (e.g. a
-- recursive hierarchy root resolver), and CREATE VIEW resolves its function references
-- immediately. check_function_bodies is off for the reverse dependency — a CRUD function
-- selecting from a view that does not exist yet — which PostgreSQL would otherwise reject
-- for the one SQL-language function among them.
SET check_function_bodies = off;


-- ── helper functions referenced by the base views (1) ──

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_form_category_parent_id_get_root_id(p_record_id uuid, p_parent_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            ${flyway:defaultSchema}."FormCategory"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            ${flyway:defaultSchema}."FormCategory" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$function$
;

-- ── base views (10) ──

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormCategories" AS
 SELECT f."ID",
    f."Name",
    f."Description",
    f."ParentID",
    f."IconClass",
    f."DisplayRank",
    f."IsActive",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsformcategory_parentid."Name" AS "Parent",
    root_parentid.root_id AS "RootParentID"
   FROM ${flyway:defaultSchema}."FormCategory" f
     LEFT JOIN ${flyway:defaultSchema}."FormCategory" mjbizappsformsformcategory_parentid ON f."ParentID" = mjbizappsformsformcategory_parentid."ID"
     LEFT JOIN LATERAL ( SELECT ${flyway:defaultSchema}.fn_form_category_parent_id_get_root_id(f."ID", f."ParentID") AS root_id) root_parentid ON true;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormDistributions" AS
 SELECT f."ID",
    f."FormID",
    f."Name",
    f."Slug",
    f."ChannelType",
    f."Status",
    f."OpenAt",
    f."CloseAt",
    f."MaxResponses",
    f."ResponseCount",
    f."MagicLinkInviteID",
    f."CaptchaRequired",
    f."IsActive",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    f."PublicLinkToken",
    mjbizappsformsform_formid."Name" AS "Form"
   FROM ${flyway:defaultSchema}."FormDistribution" f
     JOIN ${flyway:defaultSchema}."Form" mjbizappsformsform_formid ON f."FormID" = mjbizappsformsform_formid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormPages" AS
 SELECT f."ID",
    f."FormID",
    f."Title",
    f."Description",
    f."DisplayOrder",
    f."ConditionalRule",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsform_formid."Name" AS "Form"
   FROM ${flyway:defaultSchema}."FormPage" f
     JOIN ${flyway:defaultSchema}."Form" mjbizappsformsform_formid ON f."FormID" = mjbizappsformsform_formid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormQuestionOptions" AS
 SELECT "ID",
    "QuestionID",
    "Label",
    "Value",
    "DisplayOrder",
    "IsDefault",
    "__mj_CreatedAt",
    "__mj_UpdatedAt"
   FROM ${flyway:defaultSchema}."FormQuestionOption" f;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormQuestions" AS
 SELECT f."ID",
    f."FormID",
    f."PageID",
    f."QuestionType",
    f."Prompt",
    f."HelpText",
    f."IsRequired",
    f."DisplayOrder",
    f."ValidationRule",
    f."ConditionalRule",
    f."ScoringConfig",
    f."Settings",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsform_formid."Name" AS "Form"
   FROM ${flyway:defaultSchema}."FormQuestion" f
     JOIN ${flyway:defaultSchema}."Form" mjbizappsformsform_formid ON f."FormID" = mjbizappsformsform_formid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormResponseAnswers" AS
 SELECT f."ID",
    f."ResponseID",
    f."QuestionID",
    f."TextValue",
    f."NumericValue",
    f."DateValue",
    f."BooleanValue",
    f."JSONValue",
    f."FileID",
    f."Score",
    f."ScoreRationale",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjfile_fileid."Name" AS "File"
   FROM ${flyway:defaultSchema}."FormResponseAnswer" f
     LEFT JOIN __mj."File" mjfile_fileid ON f."FileID" = mjfile_fileid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormResponses" AS
 SELECT f."ID",
    f."FormID",
    f."FormVersionID",
    f."Status",
    f."AnonymousSessionID",
    f."RespondentPersonID",
    f."StartedAt",
    f."SubmittedAt",
    f."SourceMetadata",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsform_formid."Name" AS "Form",
    mjbizappscommonperson_respondentpersonid."DisplayName" AS "RespondentPerson"
   FROM ${flyway:defaultSchema}."FormResponse" f
     JOIN ${flyway:defaultSchema}."Form" mjbizappsformsform_formid ON f."FormID" = mjbizappsformsform_formid."ID"
     LEFT JOIN __mj_bizappscommon."Person" mjbizappscommonperson_respondentpersonid ON f."RespondentPersonID" = mjbizappscommonperson_respondentpersonid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormStyles" AS
 SELECT "ID",
    "Name",
    "Description",
    "CSSVariables",
    "CustomCSS",
    "LogoURL",
    "DisplayRank",
    "IsActive",
    "__mj_CreatedAt",
    "__mj_UpdatedAt"
   FROM ${flyway:defaultSchema}."FormStyle" f;

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwFormVersions" AS
 SELECT f."ID",
    f."FormID",
    f."VersionNumber",
    f."Status",
    f."PublishedAt",
    f."DefinitionSnapshot",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsform_formid."Name" AS "Form"
   FROM ${flyway:defaultSchema}."FormVersion" f
     JOIN ${flyway:defaultSchema}."Form" mjbizappsformsform_formid ON f."FormID" = mjbizappsformsform_formid."ID";

CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwForms" AS
 SELECT f."ID",
    f."Name",
    f."Description",
    f."CategoryID",
    f."StyleID",
    f."Status",
    f."OwnerUserID",
    f."RenderMode",
    f."Settings",
    f."__mj_CreatedAt",
    f."__mj_UpdatedAt",
    mjbizappsformsformcategory_categoryid."Name" AS "Category",
    mjbizappsformsformstyle_styleid."Name" AS "Style",
    mjuser_owneruserid."Name" AS "OwnerUser"
   FROM ${flyway:defaultSchema}."Form" f
     LEFT JOIN ${flyway:defaultSchema}."FormCategory" mjbizappsformsformcategory_categoryid ON f."CategoryID" = mjbizappsformsformcategory_categoryid."ID"
     LEFT JOIN ${flyway:defaultSchema}."FormStyle" mjbizappsformsformstyle_styleid ON f."StyleID" = mjbizappsformsformstyle_styleid."ID"
     LEFT JOIN __mj."User" mjuser_owneruserid ON f."OwnerUserID" = mjuser_owneruserid."ID";

-- ── CRUD functions & trigger functions (40) ──

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_category()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_distribution()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_page()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_question()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_question_option()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_response()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_response_answer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_style()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateForm"(p_id uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_categoryid_clear boolean DEFAULT false, p_categoryid uuid DEFAULT NULL::uuid, p_styleid_clear boolean DEFAULT false, p_styleid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_owneruserid_clear boolean DEFAULT false, p_owneruserid uuid DEFAULT NULL::uuid, p_rendermode character varying DEFAULT NULL::character varying, p_settings_clear boolean DEFAULT false, p_settings text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwForms"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."Form"
        (
            "ID",
            "Name",
                "Description",
                "CategoryID",
                "StyleID",
                "Status",
                "OwnerUserID",
                "RenderMode",
                "Settings"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_styleid_clear = true THEN NULL ELSE COALESCE(p_styleid, NULL) END,
                COALESCE(p_status, 'Draft'),
                CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, NULL) END,
                COALESCE(p_rendermode, 'Scroll'),
                CASE WHEN p_settings_clear = true THEN NULL ELSE COALESCE(p_settings, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwForms"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormCategory"(p_id uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_parentid_clear boolean DEFAULT false, p_parentid uuid DEFAULT NULL::uuid, p_iconclass_clear boolean DEFAULT false, p_iconclass character varying DEFAULT NULL::character varying, p_displayrank integer DEFAULT NULL::integer, p_isactive boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormCategories"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormCategory"
        (
            "ID",
            "Name",
                "Description",
                "ParentID",
                "IconClass",
                "DisplayRank",
                "IsActive"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                COALESCE(p_displayrank, 0),
                COALESCE(p_isactive, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormCategories"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormDistribution"(p_id uuid DEFAULT NULL::uuid, p_formid uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying, p_slug_clear boolean DEFAULT false, p_slug character varying DEFAULT NULL::character varying, p_channeltype character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_openat_clear boolean DEFAULT false, p_openat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_closeat_clear boolean DEFAULT false, p_closeat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_maxresponses_clear boolean DEFAULT false, p_maxresponses integer DEFAULT NULL::integer, p_responsecount integer DEFAULT NULL::integer, p_magiclinkinviteid_clear boolean DEFAULT false, p_magiclinkinviteid uuid DEFAULT NULL::uuid, p_captcharequired boolean DEFAULT NULL::boolean, p_isactive boolean DEFAULT NULL::boolean, p_publiclinktoken_clear boolean DEFAULT false, p_publiclinktoken character varying DEFAULT NULL::character varying)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormDistributions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormDistribution"
        (
            "ID",
            "FormID",
                "Name",
                "Slug",
                "ChannelType",
                "Status",
                "OpenAt",
                "CloseAt",
                "MaxResponses",
                "ResponseCount",
                "MagicLinkInviteID",
                "CaptchaRequired",
                "IsActive",
                "PublicLinkToken"
        )
    VALUES
        (
            v_new_id,
            p_formid,
                p_name,
                CASE WHEN p_slug_clear = true THEN NULL ELSE COALESCE(p_slug, NULL) END,
                COALESCE(p_channeltype, 'PublicLink'),
                COALESCE(p_status, 'Draft'),
                CASE WHEN p_openat_clear = true THEN NULL ELSE COALESCE(p_openat, NULL) END,
                CASE WHEN p_closeat_clear = true THEN NULL ELSE COALESCE(p_closeat, NULL) END,
                CASE WHEN p_maxresponses_clear = true THEN NULL ELSE COALESCE(p_maxresponses, NULL) END,
                COALESCE(p_responsecount, 0),
                CASE WHEN p_magiclinkinviteid_clear = true THEN NULL ELSE COALESCE(p_magiclinkinviteid, NULL) END,
                COALESCE(p_captcharequired, TRUE),
                COALESCE(p_isactive, TRUE),
                CASE WHEN p_publiclinktoken_clear = true THEN NULL ELSE COALESCE(p_publiclinktoken, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormDistributions"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormPage"(p_id uuid DEFAULT NULL::uuid, p_formid uuid DEFAULT NULL::uuid, p_title_clear boolean DEFAULT false, p_title character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_displayorder integer DEFAULT NULL::integer, p_conditionalrule_clear boolean DEFAULT false, p_conditionalrule text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormPages"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormPage"
        (
            "ID",
            "FormID",
                "Title",
                "Description",
                "DisplayOrder",
                "ConditionalRule"
        )
    VALUES
        (
            v_new_id,
            p_formid,
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_conditionalrule_clear = true THEN NULL ELSE COALESCE(p_conditionalrule, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormPages"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormQuestion"(p_id uuid DEFAULT NULL::uuid, p_formid uuid DEFAULT NULL::uuid, p_pageid_clear boolean DEFAULT false, p_pageid uuid DEFAULT NULL::uuid, p_questiontype character varying DEFAULT NULL::character varying, p_prompt text DEFAULT NULL::text, p_helptext_clear boolean DEFAULT false, p_helptext text DEFAULT NULL::text, p_isrequired boolean DEFAULT NULL::boolean, p_displayorder integer DEFAULT NULL::integer, p_validationrule_clear boolean DEFAULT false, p_validationrule text DEFAULT NULL::text, p_conditionalrule_clear boolean DEFAULT false, p_conditionalrule text DEFAULT NULL::text, p_scoringconfig_clear boolean DEFAULT false, p_scoringconfig text DEFAULT NULL::text, p_settings_clear boolean DEFAULT false, p_settings text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormQuestions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormQuestion"
        (
            "ID",
            "FormID",
                "PageID",
                "QuestionType",
                "Prompt",
                "HelpText",
                "IsRequired",
                "DisplayOrder",
                "ValidationRule",
                "ConditionalRule",
                "ScoringConfig",
                "Settings"
        )
    VALUES
        (
            v_new_id,
            p_formid,
                CASE WHEN p_pageid_clear = true THEN NULL ELSE COALESCE(p_pageid, NULL) END,
                p_questiontype,
                p_prompt,
                CASE WHEN p_helptext_clear = true THEN NULL ELSE COALESCE(p_helptext, NULL) END,
                COALESCE(p_isrequired, FALSE),
                COALESCE(p_displayorder, 0),
                CASE WHEN p_validationrule_clear = true THEN NULL ELSE COALESCE(p_validationrule, NULL) END,
                CASE WHEN p_conditionalrule_clear = true THEN NULL ELSE COALESCE(p_conditionalrule, NULL) END,
                CASE WHEN p_scoringconfig_clear = true THEN NULL ELSE COALESCE(p_scoringconfig, NULL) END,
                CASE WHEN p_settings_clear = true THEN NULL ELSE COALESCE(p_settings, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormQuestions"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormQuestionOption"(p_id uuid DEFAULT NULL::uuid, p_questionid uuid DEFAULT NULL::uuid, p_label character varying DEFAULT NULL::character varying, p_value_clear boolean DEFAULT false, p_value character varying DEFAULT NULL::character varying, p_displayorder integer DEFAULT NULL::integer, p_isdefault boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormQuestionOptions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormQuestionOption"
        (
            "ID",
            "QuestionID",
                "Label",
                "Value",
                "DisplayOrder",
                "IsDefault"
        )
    VALUES
        (
            v_new_id,
            p_questionid,
                p_label,
                CASE WHEN p_value_clear = true THEN NULL ELSE COALESCE(p_value, NULL) END,
                COALESCE(p_displayorder, 0),
                COALESCE(p_isdefault, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormQuestionOptions"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormResponse"(p_id uuid DEFAULT NULL::uuid, p_formid uuid DEFAULT NULL::uuid, p_formversionid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_anonymoussessionid_clear boolean DEFAULT false, p_anonymoussessionid character varying DEFAULT NULL::character varying, p_respondentpersonid_clear boolean DEFAULT false, p_respondentpersonid uuid DEFAULT NULL::uuid, p_startedat_clear boolean DEFAULT false, p_startedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_submittedat_clear boolean DEFAULT false, p_submittedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sourcemetadata_clear boolean DEFAULT false, p_sourcemetadata text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormResponses"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormResponse"
        (
            "ID",
            "FormID",
                "FormVersionID",
                "Status",
                "AnonymousSessionID",
                "RespondentPersonID",
                "StartedAt",
                "SubmittedAt",
                "SourceMetadata"
        )
    VALUES
        (
            v_new_id,
            p_formid,
                p_formversionid,
                COALESCE(p_status, 'Partial'),
                CASE WHEN p_anonymoussessionid_clear = true THEN NULL ELSE COALESCE(p_anonymoussessionid, NULL) END,
                CASE WHEN p_respondentpersonid_clear = true THEN NULL ELSE COALESCE(p_respondentpersonid, NULL) END,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_submittedat_clear = true THEN NULL ELSE COALESCE(p_submittedat, NULL) END,
                CASE WHEN p_sourcemetadata_clear = true THEN NULL ELSE COALESCE(p_sourcemetadata, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormResponses"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormResponseAnswer"(p_id uuid DEFAULT NULL::uuid, p_responseid uuid DEFAULT NULL::uuid, p_questionid uuid DEFAULT NULL::uuid, p_textvalue_clear boolean DEFAULT false, p_textvalue text DEFAULT NULL::text, p_numericvalue_clear boolean DEFAULT false, p_numericvalue numeric DEFAULT NULL::numeric, p_datevalue_clear boolean DEFAULT false, p_datevalue timestamp with time zone DEFAULT NULL::timestamp with time zone, p_booleanvalue_clear boolean DEFAULT false, p_booleanvalue boolean DEFAULT NULL::boolean, p_jsonvalue_clear boolean DEFAULT false, p_jsonvalue text DEFAULT NULL::text, p_fileid_clear boolean DEFAULT false, p_fileid uuid DEFAULT NULL::uuid, p_score_clear boolean DEFAULT false, p_score numeric DEFAULT NULL::numeric, p_scorerationale_clear boolean DEFAULT false, p_scorerationale text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormResponseAnswers"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormResponseAnswer"
        (
            "ID",
            "ResponseID",
                "QuestionID",
                "TextValue",
                "NumericValue",
                "DateValue",
                "BooleanValue",
                "JSONValue",
                "FileID",
                "Score",
                "ScoreRationale"
        )
    VALUES
        (
            v_new_id,
            p_responseid,
                p_questionid,
                CASE WHEN p_textvalue_clear = true THEN NULL ELSE COALESCE(p_textvalue, NULL) END,
                CASE WHEN p_numericvalue_clear = true THEN NULL ELSE COALESCE(p_numericvalue, NULL) END,
                CASE WHEN p_datevalue_clear = true THEN NULL ELSE COALESCE(p_datevalue, NULL) END,
                CASE WHEN p_booleanvalue_clear = true THEN NULL ELSE COALESCE(p_booleanvalue, NULL) END,
                CASE WHEN p_jsonvalue_clear = true THEN NULL ELSE COALESCE(p_jsonvalue, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, NULL) END,
                CASE WHEN p_scorerationale_clear = true THEN NULL ELSE COALESCE(p_scorerationale, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormResponseAnswers"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormStyle"(p_id uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_cssvariables_clear boolean DEFAULT false, p_cssvariables text DEFAULT NULL::text, p_customcss_clear boolean DEFAULT false, p_customcss text DEFAULT NULL::text, p_logourl_clear boolean DEFAULT false, p_logourl character varying DEFAULT NULL::character varying, p_displayrank integer DEFAULT NULL::integer, p_isactive boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormStyles"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormStyle"
        (
            "ID",
            "Name",
                "Description",
                "CSSVariables",
                "CustomCSS",
                "LogoURL",
                "DisplayRank",
                "IsActive"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_cssvariables_clear = true THEN NULL ELSE COALESCE(p_cssvariables, NULL) END,
                CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, NULL) END,
                CASE WHEN p_logourl_clear = true THEN NULL ELSE COALESCE(p_logourl, NULL) END,
                COALESCE(p_displayrank, 0),
                COALESCE(p_isactive, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormStyles"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateFormVersion"(p_id uuid DEFAULT NULL::uuid, p_formid uuid DEFAULT NULL::uuid, p_versionnumber integer DEFAULT NULL::integer, p_status character varying DEFAULT NULL::character varying, p_publishedat_clear boolean DEFAULT false, p_publishedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_definitionsnapshot_clear boolean DEFAULT false, p_definitionsnapshot text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormVersions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."FormVersion"
        (
            "ID",
            "FormID",
                "VersionNumber",
                "Status",
                "PublishedAt",
                "DefinitionSnapshot"
        )
    VALUES
        (
            v_new_id,
            p_formid,
                p_versionnumber,
                COALESCE(p_status, 'Draft'),
                CASE WHEN p_publishedat_clear = true THEN NULL ELSE COALESCE(p_publishedat, NULL) END,
                CASE WHEN p_definitionsnapshot_clear = true THEN NULL ELSE COALESCE(p_definitionsnapshot, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormVersions"
    WHERE "ID" = v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteForm"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."Form"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormCategory"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormCategory"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormDistribution"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormDistribution"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormPage"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormPage"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormQuestion"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormQuestion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormQuestionOption"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormQuestionOption"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormResponse"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormResponse"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormResponseAnswer"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormResponseAnswer"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormStyle"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormStyle"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteFormVersion"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."FormVersion"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateForm"(p_id uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_categoryid_clear boolean DEFAULT false, p_categoryid uuid DEFAULT NULL::uuid, p_styleid_clear boolean DEFAULT false, p_styleid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_owneruserid_clear boolean DEFAULT false, p_owneruserid uuid DEFAULT NULL::uuid, p_rendermode character varying DEFAULT NULL::character varying, p_settings_clear boolean DEFAULT false, p_settings text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwForms"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."Form"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "StyleID" = CASE WHEN p_styleid_clear = true THEN NULL ELSE COALESCE(p_styleid, "StyleID") END,
        "Status" = COALESCE(p_status, "Status"),
        "OwnerUserID" = CASE WHEN p_owneruserid_clear = true THEN NULL ELSE COALESCE(p_owneruserid, "OwnerUserID") END,
        "RenderMode" = COALESCE(p_rendermode, "RenderMode"),
        "Settings" = CASE WHEN p_settings_clear = true THEN NULL ELSE COALESCE(p_settings, "Settings") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwForms"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormCategory"(p_id uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_parentid_clear boolean DEFAULT false, p_parentid uuid DEFAULT NULL::uuid, p_iconclass_clear boolean DEFAULT false, p_iconclass character varying DEFAULT NULL::character varying, p_displayrank integer DEFAULT NULL::integer, p_isactive boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormCategories"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormCategory"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "DisplayRank" = COALESCE(p_displayrank, "DisplayRank"),
        "IsActive" = COALESCE(p_isactive, "IsActive")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormCategories"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormDistribution"(p_id uuid, p_formid uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying, p_slug_clear boolean DEFAULT false, p_slug character varying DEFAULT NULL::character varying, p_channeltype character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_openat_clear boolean DEFAULT false, p_openat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_closeat_clear boolean DEFAULT false, p_closeat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_maxresponses_clear boolean DEFAULT false, p_maxresponses integer DEFAULT NULL::integer, p_responsecount integer DEFAULT NULL::integer, p_magiclinkinviteid_clear boolean DEFAULT false, p_magiclinkinviteid uuid DEFAULT NULL::uuid, p_captcharequired boolean DEFAULT NULL::boolean, p_isactive boolean DEFAULT NULL::boolean, p_publiclinktoken_clear boolean DEFAULT false, p_publiclinktoken character varying DEFAULT NULL::character varying)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormDistributions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormDistribution"
    SET
        "FormID" = COALESCE(p_formid, "FormID"),
        "Name" = COALESCE(p_name, "Name"),
        "Slug" = CASE WHEN p_slug_clear = true THEN NULL ELSE COALESCE(p_slug, "Slug") END,
        "ChannelType" = COALESCE(p_channeltype, "ChannelType"),
        "Status" = COALESCE(p_status, "Status"),
        "OpenAt" = CASE WHEN p_openat_clear = true THEN NULL ELSE COALESCE(p_openat, "OpenAt") END,
        "CloseAt" = CASE WHEN p_closeat_clear = true THEN NULL ELSE COALESCE(p_closeat, "CloseAt") END,
        "MaxResponses" = CASE WHEN p_maxresponses_clear = true THEN NULL ELSE COALESCE(p_maxresponses, "MaxResponses") END,
        "ResponseCount" = COALESCE(p_responsecount, "ResponseCount"),
        "MagicLinkInviteID" = CASE WHEN p_magiclinkinviteid_clear = true THEN NULL ELSE COALESCE(p_magiclinkinviteid, "MagicLinkInviteID") END,
        "CaptchaRequired" = COALESCE(p_captcharequired, "CaptchaRequired"),
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "PublicLinkToken" = CASE WHEN p_publiclinktoken_clear = true THEN NULL ELSE COALESCE(p_publiclinktoken, "PublicLinkToken") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormDistributions"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormPage"(p_id uuid, p_formid uuid DEFAULT NULL::uuid, p_title_clear boolean DEFAULT false, p_title character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_displayorder integer DEFAULT NULL::integer, p_conditionalrule_clear boolean DEFAULT false, p_conditionalrule text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormPages"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormPage"
    SET
        "FormID" = COALESCE(p_formid, "FormID"),
        "Title" = CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, "Title") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "ConditionalRule" = CASE WHEN p_conditionalrule_clear = true THEN NULL ELSE COALESCE(p_conditionalrule, "ConditionalRule") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormPages"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormQuestion"(p_id uuid, p_formid uuid DEFAULT NULL::uuid, p_pageid_clear boolean DEFAULT false, p_pageid uuid DEFAULT NULL::uuid, p_questiontype character varying DEFAULT NULL::character varying, p_prompt text DEFAULT NULL::text, p_helptext_clear boolean DEFAULT false, p_helptext text DEFAULT NULL::text, p_isrequired boolean DEFAULT NULL::boolean, p_displayorder integer DEFAULT NULL::integer, p_validationrule_clear boolean DEFAULT false, p_validationrule text DEFAULT NULL::text, p_conditionalrule_clear boolean DEFAULT false, p_conditionalrule text DEFAULT NULL::text, p_scoringconfig_clear boolean DEFAULT false, p_scoringconfig text DEFAULT NULL::text, p_settings_clear boolean DEFAULT false, p_settings text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormQuestions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormQuestion"
    SET
        "FormID" = COALESCE(p_formid, "FormID"),
        "PageID" = CASE WHEN p_pageid_clear = true THEN NULL ELSE COALESCE(p_pageid, "PageID") END,
        "QuestionType" = COALESCE(p_questiontype, "QuestionType"),
        "Prompt" = COALESCE(p_prompt, "Prompt"),
        "HelpText" = CASE WHEN p_helptext_clear = true THEN NULL ELSE COALESCE(p_helptext, "HelpText") END,
        "IsRequired" = COALESCE(p_isrequired, "IsRequired"),
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "ValidationRule" = CASE WHEN p_validationrule_clear = true THEN NULL ELSE COALESCE(p_validationrule, "ValidationRule") END,
        "ConditionalRule" = CASE WHEN p_conditionalrule_clear = true THEN NULL ELSE COALESCE(p_conditionalrule, "ConditionalRule") END,
        "ScoringConfig" = CASE WHEN p_scoringconfig_clear = true THEN NULL ELSE COALESCE(p_scoringconfig, "ScoringConfig") END,
        "Settings" = CASE WHEN p_settings_clear = true THEN NULL ELSE COALESCE(p_settings, "Settings") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormQuestions"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormQuestionOption"(p_id uuid, p_questionid uuid DEFAULT NULL::uuid, p_label character varying DEFAULT NULL::character varying, p_value_clear boolean DEFAULT false, p_value character varying DEFAULT NULL::character varying, p_displayorder integer DEFAULT NULL::integer, p_isdefault boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormQuestionOptions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormQuestionOption"
    SET
        "QuestionID" = COALESCE(p_questionid, "QuestionID"),
        "Label" = COALESCE(p_label, "Label"),
        "Value" = CASE WHEN p_value_clear = true THEN NULL ELSE COALESCE(p_value, "Value") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "IsDefault" = COALESCE(p_isdefault, "IsDefault")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormQuestionOptions"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormResponse"(p_id uuid, p_formid uuid DEFAULT NULL::uuid, p_formversionid uuid DEFAULT NULL::uuid, p_status character varying DEFAULT NULL::character varying, p_anonymoussessionid_clear boolean DEFAULT false, p_anonymoussessionid character varying DEFAULT NULL::character varying, p_respondentpersonid_clear boolean DEFAULT false, p_respondentpersonid uuid DEFAULT NULL::uuid, p_startedat_clear boolean DEFAULT false, p_startedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_submittedat_clear boolean DEFAULT false, p_submittedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sourcemetadata_clear boolean DEFAULT false, p_sourcemetadata text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormResponses"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormResponse"
    SET
        "FormID" = COALESCE(p_formid, "FormID"),
        "FormVersionID" = COALESCE(p_formversionid, "FormVersionID"),
        "Status" = COALESCE(p_status, "Status"),
        "AnonymousSessionID" = CASE WHEN p_anonymoussessionid_clear = true THEN NULL ELSE COALESCE(p_anonymoussessionid, "AnonymousSessionID") END,
        "RespondentPersonID" = CASE WHEN p_respondentpersonid_clear = true THEN NULL ELSE COALESCE(p_respondentpersonid, "RespondentPersonID") END,
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "SubmittedAt" = CASE WHEN p_submittedat_clear = true THEN NULL ELSE COALESCE(p_submittedat, "SubmittedAt") END,
        "SourceMetadata" = CASE WHEN p_sourcemetadata_clear = true THEN NULL ELSE COALESCE(p_sourcemetadata, "SourceMetadata") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormResponses"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormResponseAnswer"(p_id uuid, p_responseid uuid DEFAULT NULL::uuid, p_questionid uuid DEFAULT NULL::uuid, p_textvalue_clear boolean DEFAULT false, p_textvalue text DEFAULT NULL::text, p_numericvalue_clear boolean DEFAULT false, p_numericvalue numeric DEFAULT NULL::numeric, p_datevalue_clear boolean DEFAULT false, p_datevalue timestamp with time zone DEFAULT NULL::timestamp with time zone, p_booleanvalue_clear boolean DEFAULT false, p_booleanvalue boolean DEFAULT NULL::boolean, p_jsonvalue_clear boolean DEFAULT false, p_jsonvalue text DEFAULT NULL::text, p_fileid_clear boolean DEFAULT false, p_fileid uuid DEFAULT NULL::uuid, p_score_clear boolean DEFAULT false, p_score numeric DEFAULT NULL::numeric, p_scorerationale_clear boolean DEFAULT false, p_scorerationale text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormResponseAnswers"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormResponseAnswer"
    SET
        "ResponseID" = COALESCE(p_responseid, "ResponseID"),
        "QuestionID" = COALESCE(p_questionid, "QuestionID"),
        "TextValue" = CASE WHEN p_textvalue_clear = true THEN NULL ELSE COALESCE(p_textvalue, "TextValue") END,
        "NumericValue" = CASE WHEN p_numericvalue_clear = true THEN NULL ELSE COALESCE(p_numericvalue, "NumericValue") END,
        "DateValue" = CASE WHEN p_datevalue_clear = true THEN NULL ELSE COALESCE(p_datevalue, "DateValue") END,
        "BooleanValue" = CASE WHEN p_booleanvalue_clear = true THEN NULL ELSE COALESCE(p_booleanvalue, "BooleanValue") END,
        "JSONValue" = CASE WHEN p_jsonvalue_clear = true THEN NULL ELSE COALESCE(p_jsonvalue, "JSONValue") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "Score" = CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, "Score") END,
        "ScoreRationale" = CASE WHEN p_scorerationale_clear = true THEN NULL ELSE COALESCE(p_scorerationale, "ScoreRationale") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormResponseAnswers"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormStyle"(p_id uuid, p_name character varying DEFAULT NULL::character varying, p_description_clear boolean DEFAULT false, p_description text DEFAULT NULL::text, p_cssvariables_clear boolean DEFAULT false, p_cssvariables text DEFAULT NULL::text, p_customcss_clear boolean DEFAULT false, p_customcss text DEFAULT NULL::text, p_logourl_clear boolean DEFAULT false, p_logourl character varying DEFAULT NULL::character varying, p_displayrank integer DEFAULT NULL::integer, p_isactive boolean DEFAULT NULL::boolean)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormStyles"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormStyle"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CSSVariables" = CASE WHEN p_cssvariables_clear = true THEN NULL ELSE COALESCE(p_cssvariables, "CSSVariables") END,
        "CustomCSS" = CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, "CustomCSS") END,
        "LogoURL" = CASE WHEN p_logourl_clear = true THEN NULL ELSE COALESCE(p_logourl, "LogoURL") END,
        "DisplayRank" = COALESCE(p_displayrank, "DisplayRank"),
        "IsActive" = COALESCE(p_isactive, "IsActive")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormStyles"
    WHERE "ID" = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateFormVersion"(p_id uuid, p_formid uuid DEFAULT NULL::uuid, p_versionnumber integer DEFAULT NULL::integer, p_status character varying DEFAULT NULL::character varying, p_publishedat_clear boolean DEFAULT false, p_publishedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_definitionsnapshot_clear boolean DEFAULT false, p_definitionsnapshot text DEFAULT NULL::text)
 RETURNS SETOF ${flyway:defaultSchema}."vwFormVersions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."FormVersion"
    SET
        "FormID" = COALESCE(p_formid, "FormID"),
        "VersionNumber" = COALESCE(p_versionnumber, "VersionNumber"),
        "Status" = COALESCE(p_status, "Status"),
        "PublishedAt" = CASE WHEN p_publishedat_clear = true THEN NULL ELSE COALESCE(p_publishedat, "PublishedAt") END,
        "DefinitionSnapshot" = CASE WHEN p_definitionsnapshot_clear = true THEN NULL ELSE COALESCE(p_definitionsnapshot, "DefinitionSnapshot") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwFormVersions"
    WHERE "ID" = p_id;
END;
$function$
;

-- ── CodeGen-owned column defaults (20) ──
ALTER TABLE ${flyway:defaultSchema}."Form" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."Form" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormDistribution" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormDistribution" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormPage" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormPage" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormQuestion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormQuestion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormQuestionOption" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormQuestionOption" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormResponse" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormResponse" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormResponseAnswer" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormResponseAnswer" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormStyle" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormStyle" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE ${flyway:defaultSchema}."FormVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);

-- ── triggers (10) ──

DROP TRIGGER IF EXISTS "trg_update_form" ON ${flyway:defaultSchema}."Form";
CREATE TRIGGER trg_update_form BEFORE UPDATE ON ${flyway:defaultSchema}."Form" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form();

DROP TRIGGER IF EXISTS "trg_update_form_category" ON ${flyway:defaultSchema}."FormCategory";
CREATE TRIGGER trg_update_form_category BEFORE UPDATE ON ${flyway:defaultSchema}."FormCategory" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_category();

DROP TRIGGER IF EXISTS "trg_update_form_distribution" ON ${flyway:defaultSchema}."FormDistribution";
CREATE TRIGGER trg_update_form_distribution BEFORE UPDATE ON ${flyway:defaultSchema}."FormDistribution" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_distribution();

DROP TRIGGER IF EXISTS "trg_update_form_page" ON ${flyway:defaultSchema}."FormPage";
CREATE TRIGGER trg_update_form_page BEFORE UPDATE ON ${flyway:defaultSchema}."FormPage" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_page();

DROP TRIGGER IF EXISTS "trg_update_form_question" ON ${flyway:defaultSchema}."FormQuestion";
CREATE TRIGGER trg_update_form_question BEFORE UPDATE ON ${flyway:defaultSchema}."FormQuestion" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_question();

DROP TRIGGER IF EXISTS "trg_update_form_question_option" ON ${flyway:defaultSchema}."FormQuestionOption";
CREATE TRIGGER trg_update_form_question_option BEFORE UPDATE ON ${flyway:defaultSchema}."FormQuestionOption" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_question_option();

DROP TRIGGER IF EXISTS "trg_update_form_response" ON ${flyway:defaultSchema}."FormResponse";
CREATE TRIGGER trg_update_form_response BEFORE UPDATE ON ${flyway:defaultSchema}."FormResponse" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_response();

DROP TRIGGER IF EXISTS "trg_update_form_response_answer" ON ${flyway:defaultSchema}."FormResponseAnswer";
CREATE TRIGGER trg_update_form_response_answer BEFORE UPDATE ON ${flyway:defaultSchema}."FormResponseAnswer" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_response_answer();

DROP TRIGGER IF EXISTS "trg_update_form_style" ON ${flyway:defaultSchema}."FormStyle";
CREATE TRIGGER trg_update_form_style BEFORE UPDATE ON ${flyway:defaultSchema}."FormStyle" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_style();

DROP TRIGGER IF EXISTS "trg_update_form_version" ON ${flyway:defaultSchema}."FormVersion";
CREATE TRIGGER trg_update_form_version BEFORE UPDATE ON ${flyway:defaultSchema}."FormVersion" FOR EACH ROW EXECUTE FUNCTION ${flyway:defaultSchema}.fn_trg_update_form_version();

-- ── grants (30 table, 101 function) ──
GRANT SELECT ON ${flyway:defaultSchema}."vwFormCategories" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormCategories" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormCategories" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormDistributions" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormDistributions" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormDistributions" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormPages" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormPages" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormPages" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestionOptions" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestionOptions" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestionOptions" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestions" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestions" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormQuestions" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponseAnswers" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponseAnswers" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponseAnswers" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponses" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponses" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormResponses" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormStyles" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormStyles" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormStyles" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormVersions" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormVersions" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwFormVersions" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwForms" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwForms" TO "cdp_Integration";
GRANT SELECT ON ${flyway:defaultSchema}."vwForms" TO "cdp_UI";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${flyway:defaultSchema} TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${flyway:defaultSchema} TO "cdp_Developer";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${flyway:defaultSchema} TO "cdp_Integration";

-- ── CodeGen reconciliation, re-run now that the base views exist ──
SELECT ${mjSchema}."spUpdateExistingEntitiesFromSchema"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateExistingEntityFieldsFromSchema"('sys,staging,dbo,${mjSchema}', NULL);
SELECT ${mjSchema}."spSetDefaultColumnWidthWhereNeeded"('sys,staging,dbo,${mjSchema}');
SELECT ${mjSchema}."spUpdateSchemaInfoFromDatabase"('sys,staging,dbo,${mjSchema}');
