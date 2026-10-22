-- MJ Forms v0.16.x — the consolidated release metadata seed (#319).
--
-- ONE seed per release (#105). v0.15.1 released every earlier seed, so this is a DELTA beside them and
-- folds in no retired per-PR seed. `npm run check:seed-cadence` asked for it: 52 record files moved
-- since v0.15.1. `npm run check:release-seed` named 44 declared ids that no migration carried.
--
-- WHAT IT SEEDS. Created: the 20 `Forms.*` Remote Operations and their category (#303, #311); the
-- three reporting queries with their category, fields, parameters, entities and permissions; the
-- `forms`, `forms:read` and `forms:write` API scopes and their two MJAPI application grants; the
-- outbox sweep's scheduled job type and job (#306); the `Form Automation Failed` notification type
-- (#311); and two action params. Updated, because metadata/ moved and the ids already ship: the
-- `Form Response` name field and the four response foreign keys kept off the name join (#306); the
-- `TargetRecordID` polymorphic link (#325); one entity flag; the Form Respondent role and two action
-- descriptions (#306 review); the Form Designer template text and params; the usual no-op view.
-- `migrations-teardown/V001` already lists every new root, so `mj app remove` needs no change.
--
-- WHY THE THREE TEMPLATE PARAM UPDATES APPEAR TWICE. Saving the template content runs MJ's
-- server-side param extraction, and that rewrote the three param descriptions AFTER the push had
-- compared them with metadata/ and found them equal. So the first push's log captured the extracted
-- wording, which is the v0.8 text metadata/ has since replaced. A SQL replay on a host runs no such
-- hook, so that log alone would have shipped the stale wording. A second push against the same
-- database emitted the three corrections and nothing else of substance. This file is the first log
-- followed by the second, both unedited apart from the substitution and the one hand edit described below; the later
-- statement wins.
--
-- WHAT THE PUSH UPDATED IS WHAT metadata/ DECLARES. Every changed value was diffed column by column
-- against an untouched database at the same head. Each one traces to a metadata/ edit made since
-- v0.15.1, and no migration writes any of them, so nothing here reverts a migration (the README's
-- "fourth hazard"). V202610172102 deletes the respondent Form Versions read; metadata/ no longer
-- declares that row, and this file does not write it.
--
-- GENERATED AGAINST THE SHIPPED CHAIN AT HEAD. MJ_Forms_SeedGen_v0160 is the v0.12.0 generation
-- baseline (/var/opt/mssql/data/seedgen_v0120.bak: migrations-only, zero business rows) migrated to
-- what a host installing today holds: core __mj at MJ 6.1.6's frontier 202610061630, bizapps-common
-- at v5.54.0 (202610161324), bizapps-tasks at v1.9.0 (202610142252), Forms at head 202610201910.
-- The sibling chains were exported from their release tags, not their `next` checkouts, which are
-- ahead. No unreleased seed had to be held back. Pushed with the PINNED CLI
-- (@memberjunction/cli 6.1.6, installed disposably), not the workspace `mj`, which links MJ source.
--
-- THE SUBSTITUTION. Every core SP call was written as ${flyway:defaultSchema} and is rewritten to
-- ${mjSchema}. There is no non-EXEC site. The seven literal __mj_BizAppsForms names below are inside
-- the reporting queries' SQL and one TechnicalDescription: they are data, copied from metadata/, and
-- are left as written. No Form Respondent permission is in this file, so the @RoleID rewrite does not
-- apply.
--
-- THE ONE HAND EDIT TO THE GENERATED BODY. The Forms -> Form Screens relationship update set
-- @RelatedEntityID to the literal 6313B0B1. That FormScreen entity id is seeded only under a
-- natural-key guard (V202608191300), so `npm run lint:distribution` CHECK 7 refuses it as a literal:
-- it is resolved by BaseTable + SchemaName instead, with a THROW when the lookup comes back NULL.
-- On every host that ran V202609181845's assertion the lookup returns the same id, so this changes
-- what the statement writes nowhere; it only stops the file depending on that history.
--
-- THE ASSERTIONS BELOW, and why they THROW. spUpdateEntity, spUpdateEntityField and
-- spUpdateEntityRelationship key on @ID and raise NOTHING when it matches no row, so on a host whose
-- ids differed every update here would be a silent no-op and the seed would report success. Each id is
-- created by a shipped migration (B202606281200, V202608072330, V202608191300 converged by
-- V202608252300, V202610172100), so a host installed from migrations/ holds all of them. Same shape
-- as V202609181845's.
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Entity]
               WHERE [ID] = '0DBA2EE2-89F7-4120-BD1B-7AA3672B7DEF' AND [SchemaName] = '${flyway:defaultSchema}')
    THROW 51160, 'MJ Forms V202610220041: expected the Form Automation Events entity row this seed addresses, in this app''s schema. spUpdateEntity keys on @ID and raises nothing when it matches no row.', 1;
IF (SELECT COUNT(*) FROM [${mjSchema}].[EntityField]
    WHERE [ID] IN ('5046AC5F-AAC6-4723-A481-406BFDCF0937','4B524BE8-6C81-49ED-9AA5-B6E3C9D54635',
                   'BA8E088C-65BD-4FA6-870E-4E3AB919C38B','B4D02511-4EB2-4D84-A3F7-A1B9D15666D9',
                   '6A6FCA68-3ED7-437A-85FF-E94B903994C3','D8664C7D-C78E-40AA-9E42-94CDF189DCB6')) <> 6
    THROW 51161, 'MJ Forms V202610220041: expected all 6 EntityField rows this seed addresses to exist. spUpdateEntityField keys on @ID and raises nothing when it matches no row.', 1;
IF (SELECT COUNT(*) FROM [${mjSchema}].[EntityRelationship]
    WHERE [ID] IN ('5981266E-6F57-45DF-A394-9AAEABD5AC7F','6729890A-D62C-4806-8FD3-3CE466FD0395',
                   'EFF9400A-94DA-4F3C-85AA-9A5492DC1867','60B1B456-9EAA-4B65-902C-47EB232E5CA1')) <> 4
    THROW 51163, 'MJ Forms V202610220041: expected all 4 EntityRelationship rows this seed addresses to exist. spUpdateEntityRelationship keys on @ID and raises nothing when it matches no row.', 1;
GO



-- Save MJ: Roles (core SP call only)
DECLARE @Name_24a4190962bc NVARCHAR(50),
@Description_24a4190962bc NVARCHAR(MAX),
@DirectoryID_24a4190962bc NVARCHAR(250),
@SQLName_24a4190962bc NVARCHAR(250),
@ID_24a4190962bc UNIQUEIDENTIFIER
SET
  @Name_24a4190962bc = N'Form Respondent'
SET
  @Description_24a4190962bc = N'Restricted role for anonymous/external respondents who reach a published MJ Form via a scoped magic-link distribution. The ONE deliberate exception to the magic-link read-only convention. It grants exactly five things and nothing else: CanCreate on Form Responses and Form Response Answers, each carrying a DENY-ALL create filter — the respondent scope check (checkRespondentScope, in forms-core-entities-server) reads only the CanCreate flag, while the real write is performed by the system user, so an unfiltered grant would buy nothing but a bypass of the submit pipeline via MJ''s generic Create mutation; scope-filtered read on Form Distributions, filtered to the distribution the session''s own invite names; and, since #138, scope-filtered read on Form Responses and Form Response Answers, filtered to the ONE response a resume link''s invite names. One shared anonymous principal backs every respondent, so no unfiltered read on a response entity is ever safe; a public-link session''s scope is a distribution id, so it reads zero response rows. Since #303 it holds no read on Form Versions: the raw snapshot carries the answer key and gated endings, so the server reads the published version as the system user and sends the respondent an allowlisted projection. It holds NOTHING on Forms, Form Questions, Form Question Options, Form Pages or Form Styles — the server''s respondent projection already carries all of that, so no anonymous code path reads them. This is a SHARED role: co-installed apps may add their own grants to it, and this app asserts only its own five facts. Authorization is enforced server-side from the session''s mj_scopes union; this role is the entity-permission boundary. Never assign to internal/SSO users.'
SET
  @ID_24a4190962bc = 'A18E13FC-B2C1-4E77-A3D7-EE775BDE098C' EXEC [${mjSchema}].spUpdateRole @Name = @Name_24a4190962bc,
  @Description = @Description_24a4190962bc,
  @DirectoryID = @DirectoryID_24a4190962bc,
  @DirectoryID_Clear = 1,
  @SQLName = @SQLName_24a4190962bc,
  @SQLName_Clear = 1,
  @ID = @ID_24a4190962bc;

GO

-- Save MJ: Template Contents (core SP call only)
DECLARE @TemplateID_7f6922bfd11f UNIQUEIDENTIFIER,
@TypeID_7f6922bfd11f UNIQUEIDENTIFIER,
@TemplateText_7f6922bfd11f NVARCHAR(MAX),
@Priority_7f6922bfd11f INT,
@IsActive_7f6922bfd11f BIT,
@ID_7f6922bfd11f UNIQUEIDENTIFIER
SET
  @TemplateID_7f6922bfd11f = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @TypeID_7f6922bfd11f = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @TemplateText_7f6922bfd11f = N'You are a form-design assistant for MJ Forms. Given a natural-language brief, design a clear, friendly, mobile-first form and return it as a single JSON object — no prose, no markdown fences, JSON only.

The JSON MUST match this shape exactly:
{
  "name": string,                       // short form title
  "description"?: string,               // one-sentence intro shown to respondents
  "renderMode"?: "Scroll" | "OneQuestion",
  "confirmationMessage"?: string,       // shown after successful submit
  "pages": [                            // at least one page
    {
      "title"?: string,
      "description"?: string,
      "questions": [                    // at least one question per page
        {
          "type": <QuestionType>,       // see allowed types below
          "prompt": string,             // the question label
          "helpText"?: string,
          "isRequired"?: boolean,
          "options"?: [ { "label": string, "value"?: string, "isDefault"?: boolean } ],
          "settings"?: object           // per-type config, e.g. { "max": 5 } for Rating
        }
      ]
    }
  ]
}

Allowed "type" values:
ShortText, LongText, Email, Phone, Website, Number,
SingleChoice, MultiChoice, Dropdown, PictureChoice,
Rating, NPS, OpinionScale, Ranking, Matrix,
YesNo, Checkbox, Legal,
Date, Time,
Address, ContactInfo,
FileUpload, Doodle,
Statement.

Rules:
- "options" are REQUIRED for SingleChoice, MultiChoice, Dropdown, PictureChoice, Ranking and Matrix; provide at least two. Do NOT add options to any other type.
- Matrix options carry a "matrixAxis" of "Row" or "Column"; supply at least two of each.
- Use Email for email addresses, Phone for phone numbers, Website for URLs, Number for numeric inputs (e.g. a "+1 count" or quantity).
- Prefer ContactInfo over separate first-name / last-name / email / phone questions, and Address over separate street / city / postcode questions. Both collect the whole block in one field.
- Rating settings may include { "max": number } (stars, default 5). NPS is a fixed 0-10 scale. OpinionScale settings may include { "min": number, "max": number, "labelMin": string, "labelMax": string }.
- Checkbox is a single box to tick (consent, opt-in); its settings may include { "placeholder": string } for the text beside the box. Legal shows terms then Accept / Decline; put the terms in settings as { "terms": string }.
- Doodle is a freehand drawing pad; it is not a signature and carries no legal weight. Its settings may include { "penColor": string, "penWidth": string, "penControls": string } — leave them out unless the brief asks for a particular pen.
- Statement is display-only (a section header / instructional text); it is never required and has no options.
- Do NOT emit a welcome or thank-you "question". Those are SCREENS, configured separately from the questions, and a Statement standing in for one appears in the middle of the form instead of around it.
- Design the form ONLY. Do NOT include "automations", "onSubmitMode" or any other on-submit behaviour (emails, tasks, actions, integrations) — even if the request asks for it. What happens on submit is configured by the caller, not by you, and a response carrying either key is rejected.
- Keep prompts concise. Mark only genuinely-required fields as required.
- Return valid JSON parseable by JSON.parse. Output the JSON object and nothing else.

Design a form for this request:

"""{{ Brief }}"""
{% if ValidationError %}
Your previous response was invalid:
{{ PreviousAttempt }}

Validation error: {{ ValidationError }}
Fix it and return ONLY the corrected JSON blueprint.
{% else %}
Return ONLY the JSON blueprint.
{% endif %}
'
SET
  @Priority_7f6922bfd11f = 100
SET
  @IsActive_7f6922bfd11f = 1
SET
  @ID_7f6922bfd11f = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateContent @TemplateID = @TemplateID_7f6922bfd11f,
  @TypeID = @TypeID_7f6922bfd11f,
  @TemplateText = @TemplateText_7f6922bfd11f,
  @Priority = @Priority_7f6922bfd11f,
  @IsActive = @IsActive_7f6922bfd11f,
  @ID = @ID_7f6922bfd11f;

GO

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@Name_9f7b66ce5ee0 NVARCHAR(255),
@Description_9f7b66ce5ee0 NVARCHAR(MAX),
@Type_9f7b66ce5ee0 NVARCHAR(20),
@DefaultValue_9f7b66ce5ee0 NVARCHAR(MAX),
@IsRequired_9f7b66ce5ee0 BIT,
@LinkedParameterName_9f7b66ce5ee0 NVARCHAR(255),
@LinkedParameterField_9f7b66ce5ee0 NVARCHAR(500),
@ExtraFilter_9f7b66ce5ee0 NVARCHAR(MAX),
@EntityID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@RecordID_9f7b66ce5ee0 NVARCHAR(2000),
@OrderBy_9f7b66ce5ee0 NVARCHAR(MAX),
@TemplateContentID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@ID_9f7b66ce5ee0 UNIQUEIDENTIFIER
SET
  @TemplateID_9f7b66ce5ee0 = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_9f7b66ce5ee0 = N'Brief'
SET
  @Description_9f7b66ce5ee0 = N'The natural-language request describing the form to be designed.'
SET
  @Type_9f7b66ce5ee0 = N'Scalar'
SET
  @IsRequired_9f7b66ce5ee0 = 1
SET
  @ID_9f7b66ce5ee0 = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_9f7b66ce5ee0,
  @Name = @Name_9f7b66ce5ee0,
  @Description = @Description_9f7b66ce5ee0,
  @Type = @Type_9f7b66ce5ee0,
  @DefaultValue = @DefaultValue_9f7b66ce5ee0,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_9f7b66ce5ee0,
  @LinkedParameterName = @LinkedParameterName_9f7b66ce5ee0,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_9f7b66ce5ee0,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_9f7b66ce5ee0,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_9f7b66ce5ee0,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_9f7b66ce5ee0,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_9f7b66ce5ee0,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_9f7b66ce5ee0,
  @TemplateContentID_Clear = 1,
  @ID = @ID_9f7b66ce5ee0;

GO

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_e0380d77ac7c UNIQUEIDENTIFIER,
@Name_e0380d77ac7c NVARCHAR(255),
@Description_e0380d77ac7c NVARCHAR(MAX),
@Type_e0380d77ac7c NVARCHAR(20),
@DefaultValue_e0380d77ac7c NVARCHAR(MAX),
@IsRequired_e0380d77ac7c BIT,
@LinkedParameterName_e0380d77ac7c NVARCHAR(255),
@LinkedParameterField_e0380d77ac7c NVARCHAR(500),
@ExtraFilter_e0380d77ac7c NVARCHAR(MAX),
@EntityID_e0380d77ac7c UNIQUEIDENTIFIER,
@RecordID_e0380d77ac7c NVARCHAR(2000),
@OrderBy_e0380d77ac7c NVARCHAR(MAX),
@TemplateContentID_e0380d77ac7c UNIQUEIDENTIFIER,
@ID_e0380d77ac7c UNIQUEIDENTIFIER
SET
  @TemplateID_e0380d77ac7c = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_e0380d77ac7c = N'PreviousAttempt'
SET
  @Description_e0380d77ac7c = N'The JSON output from the previous failed attempt.'
SET
  @Type_e0380d77ac7c = N'Scalar'
SET
  @IsRequired_e0380d77ac7c = 0
SET
  @ID_e0380d77ac7c = '2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_e0380d77ac7c,
  @Name = @Name_e0380d77ac7c,
  @Description = @Description_e0380d77ac7c,
  @Type = @Type_e0380d77ac7c,
  @DefaultValue = @DefaultValue_e0380d77ac7c,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_e0380d77ac7c,
  @LinkedParameterName = @LinkedParameterName_e0380d77ac7c,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_e0380d77ac7c,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_e0380d77ac7c,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_e0380d77ac7c,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_e0380d77ac7c,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_e0380d77ac7c,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_e0380d77ac7c,
  @TemplateContentID_Clear = 1,
  @ID = @ID_e0380d77ac7c;

GO

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_903ad94c3518 UNIQUEIDENTIFIER,
@Name_903ad94c3518 NVARCHAR(255),
@Description_903ad94c3518 NVARCHAR(MAX),
@Type_903ad94c3518 NVARCHAR(20),
@DefaultValue_903ad94c3518 NVARCHAR(MAX),
@IsRequired_903ad94c3518 BIT,
@LinkedParameterName_903ad94c3518 NVARCHAR(255),
@LinkedParameterField_903ad94c3518 NVARCHAR(500),
@ExtraFilter_903ad94c3518 NVARCHAR(MAX),
@EntityID_903ad94c3518 UNIQUEIDENTIFIER,
@RecordID_903ad94c3518 NVARCHAR(2000),
@OrderBy_903ad94c3518 NVARCHAR(MAX),
@TemplateContentID_903ad94c3518 UNIQUEIDENTIFIER,
@ID_903ad94c3518 UNIQUEIDENTIFIER
SET
  @TemplateID_903ad94c3518 = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_903ad94c3518 = N'ValidationError'
SET
  @Description_903ad94c3518 = N'Error message describing why the previous attempt was rejected.'
SET
  @Type_903ad94c3518 = N'Scalar'
SET
  @IsRequired_903ad94c3518 = 0
SET
  @ID_903ad94c3518 = '3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_903ad94c3518,
  @Name = @Name_903ad94c3518,
  @Description = @Description_903ad94c3518,
  @Type = @Type_903ad94c3518,
  @DefaultValue = @DefaultValue_903ad94c3518,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_903ad94c3518,
  @LinkedParameterName = @LinkedParameterName_903ad94c3518,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_903ad94c3518,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_903ad94c3518,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_903ad94c3518,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_903ad94c3518,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_903ad94c3518,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_903ad94c3518,
  @TemplateContentID_Clear = 1,
  @ID = @ID_903ad94c3518;

GO

-- Save MJ: User Views (core SP call only)
DECLARE @UserID_c9c04ad15183 UNIQUEIDENTIFIER,
@EntityID_c9c04ad15183 UNIQUEIDENTIFIER,
@Name_c9c04ad15183 NVARCHAR(100),
@Description_c9c04ad15183 NVARCHAR(MAX),
@CategoryID_c9c04ad15183 UNIQUEIDENTIFIER,
@IsShared_c9c04ad15183 BIT,
@IsDefault_c9c04ad15183 BIT,
@GridState_c9c04ad15183 NVARCHAR(MAX),
@FilterState_c9c04ad15183 NVARCHAR(MAX),
@CustomFilterState_c9c04ad15183 BIT,
@SmartFilterEnabled_c9c04ad15183 BIT,
@SmartFilterPrompt_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterWhereClause_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterExplanation_c9c04ad15183 NVARCHAR(MAX),
@WhereClause_c9c04ad15183 NVARCHAR(MAX),
@CustomWhereClause_c9c04ad15183 BIT,
@SortState_c9c04ad15183 NVARCHAR(MAX),
@Thumbnail_c9c04ad15183 NVARCHAR(MAX),
@CardState_c9c04ad15183 NVARCHAR(MAX),
@DisplayState_c9c04ad15183 NVARCHAR(MAX),
@ViewTypeID_c9c04ad15183 UNIQUEIDENTIFIER,
@ID_c9c04ad15183 UNIQUEIDENTIFIER
SET
  @UserID_c9c04ad15183 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @EntityID_c9c04ad15183 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'
SET
  @Name_c9c04ad15183 = N'All Forms'
SET
  @Description_c9c04ad15183 = N''
SET
  @IsShared_c9c04ad15183 = 1
SET
  @IsDefault_c9c04ad15183 = 0
SET
  @GridState_c9c04ad15183 = N'{}'
SET
  @FilterState_c9c04ad15183 = N'{"logic":"and","filters":[]}'
SET
  @CustomFilterState_c9c04ad15183 = 0
SET
  @SmartFilterEnabled_c9c04ad15183 = 0
SET
  @WhereClause_c9c04ad15183 = N''
SET
  @CustomWhereClause_c9c04ad15183 = 0
SET
  @ID_c9c04ad15183 = '7F0D0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateUserView @UserID = @UserID_c9c04ad15183,
  @EntityID = @EntityID_c9c04ad15183,
  @Name = @Name_c9c04ad15183,
  @Description = @Description_c9c04ad15183,
  @CategoryID = @CategoryID_c9c04ad15183,
  @CategoryID_Clear = 1,
  @IsShared = @IsShared_c9c04ad15183,
  @IsDefault = @IsDefault_c9c04ad15183,
  @GridState = @GridState_c9c04ad15183,
  @FilterState = @FilterState_c9c04ad15183,
  @CustomFilterState = @CustomFilterState_c9c04ad15183,
  @SmartFilterEnabled = @SmartFilterEnabled_c9c04ad15183,
  @SmartFilterPrompt = @SmartFilterPrompt_c9c04ad15183,
  @SmartFilterPrompt_Clear = 1,
  @SmartFilterWhereClause = @SmartFilterWhereClause_c9c04ad15183,
  @SmartFilterWhereClause_Clear = 1,
  @SmartFilterExplanation = @SmartFilterExplanation_c9c04ad15183,
  @SmartFilterExplanation_Clear = 1,
  @WhereClause = @WhereClause_c9c04ad15183,
  @CustomWhereClause = @CustomWhereClause_c9c04ad15183,
  @SortState = @SortState_c9c04ad15183,
  @SortState_Clear = 1,
  @Thumbnail = @Thumbnail_c9c04ad15183,
  @Thumbnail_Clear = 1,
  @CardState = @CardState_c9c04ad15183,
  @CardState_Clear = 1,
  @DisplayState = @DisplayState_c9c04ad15183,
  @DisplayState_Clear = 1,
  @ViewTypeID = @ViewTypeID_c9c04ad15183,
  @ViewTypeID_Clear = 1,
  @ID = @ID_c9c04ad15183;

GO

-- Save MJ: Query Categories (core SP call only)
DECLARE @ID_09b56d2034a1 UNIQUEIDENTIFIER,
@Name_09b56d2034a1 NVARCHAR(50),
@ParentID_09b56d2034a1 UNIQUEIDENTIFIER,
@Description_09b56d2034a1 NVARCHAR(MAX),
@UserID_09b56d2034a1 UNIQUEIDENTIFIER,
@DefaultCacheEnabled_09b56d2034a1 BIT,
@DefaultCacheTTLMinutes_09b56d2034a1 INT,
@DefaultCacheMaxSize_09b56d2034a1 INT,
@CacheInheritanceEnabled_09b56d2034a1 BIT
SET
  @ID_09b56d2034a1 = '38044DBA-A933-4A8D-A5B6-25EC82210B93'
SET
  @Name_09b56d2034a1 = N'Forms'
SET
  @Description_09b56d2034a1 = N'MJ Forms reporting read models: response counts, answer breakdowns and the page funnel, aggregated in SQL for FormReportingEngine instead of in the browser over every answer row.'
SET
  @UserID_09b56d2034a1 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @DefaultCacheEnabled_09b56d2034a1 = 0
SET
  @CacheInheritanceEnabled_09b56d2034a1 = 1
EXEC [${mjSchema}].spCreateQueryCategory @ID = @ID_09b56d2034a1,
  @Name = @Name_09b56d2034a1,
  @ParentID = @ParentID_09b56d2034a1,
  @ParentID_Clear = 1,
  @Description = @Description_09b56d2034a1,
  @UserID = @UserID_09b56d2034a1,
  @DefaultCacheEnabled = @DefaultCacheEnabled_09b56d2034a1,
  @DefaultCacheTTLMinutes = @DefaultCacheTTLMinutes_09b56d2034a1,
  @DefaultCacheTTLMinutes_Clear = 1,
  @DefaultCacheMaxSize = @DefaultCacheMaxSize_09b56d2034a1,
  @DefaultCacheMaxSize_Clear = 1,
  @CacheInheritanceEnabled = @CacheInheritanceEnabled_09b56d2034a1;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@Name_cb06fe6f2bf3 NVARCHAR(255),
@CategoryID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@UserQuestion_cb06fe6f2bf3 NVARCHAR(MAX),
@Description_cb06fe6f2bf3 NVARCHAR(MAX),
@SQL_cb06fe6f2bf3 NVARCHAR(MAX),
@TechnicalDescription_cb06fe6f2bf3 NVARCHAR(MAX),
@OriginalSQL_cb06fe6f2bf3 NVARCHAR(MAX),
@Feedback_cb06fe6f2bf3 NVARCHAR(MAX),
@Status_cb06fe6f2bf3 NVARCHAR(15),
@QualityRank_cb06fe6f2bf3 INT,
@ExecutionCostRank_cb06fe6f2bf3 INT,
@UsesTemplate_cb06fe6f2bf3 BIT,
@AuditQueryRuns_cb06fe6f2bf3 BIT,
@CacheEnabled_cb06fe6f2bf3 BIT,
@CacheTTLMinutes_cb06fe6f2bf3 INT,
@CacheMaxSize_cb06fe6f2bf3 INT,
@EmbeddingVector_cb06fe6f2bf3 NVARCHAR(MAX),
@EmbeddingModelID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@CacheValidationSQL_cb06fe6f2bf3 NVARCHAR(MAX),
@SQLDialectID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@Reusable_cb06fe6f2bf3 BIT,
@ExternalDataSourceID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@IsMaterialized_cb06fe6f2bf3 BIT
SET
  @ID_cb06fe6f2bf3 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_cb06fe6f2bf3 = N'Forms: Response Completion Stats'
SET
  @CategoryID_cb06fe6f2bf3 = '38044DBA-A933-4A8D-A5B6-25EC82210B93'
SET
  @UserQuestion_cb06fe6f2bf3 = N'How many responses did this form get, how many were completed, and how long does it typically take to fill in?'
SET
  @Description_cb06fe6f2bf3 = N'One row of headline figures for a form''s responses: Complete, Partial and Disqualified counts, every started response, the median completion time over credible sittings, and the latest submission.'
SET
  @SQL_cb06fe6f2bf3 = N'-- Forms: Response Completion Stats — the reporting headline for one form, as ONE row
-- (FormReportingEngine, Forms.GetResponseSummary).
--
-- FormID is required. FormVersionID narrows to the responses pinned to one version; absent, every
-- version counts, because each response pins the version live when it was submitted and reading
-- only the latest version hides every response an earlier one collected.
--
-- Rules carried over unchanged from the dashboard''s former client-side aggregations (now
-- forms-core-entities-server reporting/headline.ts):
--   * Status counts are reported separately; the engine''s headline is CompleteCount alone.
--   * Duration is SubmittedAt - StartedAt over Complete rows that have both, kept only when the
--     gap is 0 to 24 hours: anything outside is a broken StartedAt (an epoch default, a migrated
--     row), not a sitting, and one such row moves a mean by orders of magnitude.
--   * The MEDIAN, not the mean, for the same reason. PERCENTILE_CONT(0.5) interpolates the two
--     middle values of an even count, exactly as statistics.ts median() does.
-- Both parameters pass through sqlString, so no caller text reaches the SQL unquoted.
WITH scoped AS (
    SELECT r.Status, r.StartedAt, r.SubmittedAt
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
durations AS (
    SELECT CAST(DATEDIFF_BIG(MILLISECOND, s.StartedAt, s.SubmittedAt) AS FLOAT) / 1000.0 AS Seconds
    FROM scoped s
    WHERE s.Status = N''Complete''
      AND s.StartedAt IS NOT NULL
      AND s.SubmittedAt IS NOT NULL
      AND DATEDIFF_BIG(MILLISECOND, s.StartedAt, s.SubmittedAt) BETWEEN 0 AND 86400000
)
SELECT
    (SELECT COUNT(*) FROM scoped WHERE Status = N''Complete'') AS CompleteCount,
    (SELECT COUNT(*) FROM scoped WHERE Status = N''Partial'') AS PartialCount,
    (SELECT COUNT(*) FROM scoped WHERE Status = N''Disqualified'') AS DisqualifiedCount,
    (SELECT COUNT(*) FROM scoped) AS StartedCount,
    (SELECT TOP 1 PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d.Seconds) OVER () FROM durations d) AS MedianCompletionSeconds,
    (SELECT MAX(SubmittedAt) FROM scoped WHERE Status = N''Complete'') AS LastSubmittedAt;
'
SET
  @TechnicalDescription_cb06fe6f2bf3 = N'Nunjucks-parameterized. FormID (required) and FormVersionID (optional; absent means every version) filter __mj_BizAppsForms.vwFormResponses. MedianCompletionSeconds is PERCENTILE_CONT(0.5) over Complete rows whose SubmittedAt - StartedAt is 0 to 86400 s. Always returns exactly one row.'
SET
  @Status_cb06fe6f2bf3 = N'Approved'
SET
  @QualityRank_cb06fe6f2bf3 = 8
SET
  @ExecutionCostRank_cb06fe6f2bf3 = 2
SET
  @UsesTemplate_cb06fe6f2bf3 = 1
SET
  @AuditQueryRuns_cb06fe6f2bf3 = 0
SET
  @CacheEnabled_cb06fe6f2bf3 = 0
SET
  @EmbeddingVector_cb06fe6f2bf3 = N'[-0.011771460063755512,0.03894571214914322,0.0016534560127183795,0.032221220433712006,-0.018556075170636177,0.017733611166477203,-0.03689291700720787,-0.007480086293071508,-0.028505027294158936,0.015114923007786274,0.09221435338258743,-0.08894474059343338,0.054364729672670364,0.020671265199780464,-0.009503373876214027,-0.039356380701065063,-0.01551927998661995,0.005320047959685326,-0.04592570662498474,0.002259979024529457,-0.017319930717349052,0.013079680502414703,-0.04238840937614441,0.0069238124415278435,-0.038239654153585434,0.03822161257266998,-0.02790231630206108,-0.01592009700834751,-0.003017229260876775,-0.11286924034357071,0.04370272532105446,0.022664526477456093,-0.002475959248840809,-0.014146885834634304,0.0000026614663966029184,-0.037086810916662216,0.013466408476233482,0.02930268831551075,-0.08445559442043304,0.02292422205209732,0.005732499063014984,-0.029133249074220657,0.019619779661297798,0.011902880854904652,0.03050384111702442,-0.022558508440852165,-0.011999983340501785,0.015593050047755241,-0.01000590156763792,-0.027916956692934036,0.01502190437167883,-0.008719458244740963,-0.06488972902297974,-0.027682961896061897,0.062790647149086,-0.004854204598814249,0.007513988297432661,-0.060168925672769547,0.0647314265370369,-0.06991662085056305,-0.049554646015167236,0.03152100741863251,0.00502570578828454,-0.02646506577730179,0.0004705362662207335,0.03270726278424263,0.01691805012524128,-0.0312863364815712,0.013225007802248001,-0.017515437677502632,0.10765226930379868,0.04107701778411865,-0.02949877828359604,-0.0586678721010685,-0.02727372944355011,-0.03630305081605911,-0.030767615884542465,-0.004582468885928392,-0.022273797541856766,-0.04530705139040947,-0.10251297801733017,0.0533902682363987,-0.002996186725795269,-0.024456022307276726,-0.00037166420952416956,-0.04551784694194794,0.007214669603854418,0.011351985856890678,-0.04117584601044655,0.056777842342853546,0.10367651283740997,-0.047941967844963074,0.024979807436466217,-0.020679526031017303,-0.018955128267407417,-0.0028729368932545185,-0.01079851295799017,-0.008207633160054684,0.06352736055850983,-0.010776573792099953,0.018431659787893295,-0.0027225646190345287,-0.028051599860191345,0.021624501794576645,0.037287868559360504,0.0025808357167989016,0.023827549070119858,-0.08418699353933334,-0.06344377994537354,0.0006017779815010726,-0.03717571869492531,-0.0012309716548770666,-0.01602516695857048,0.05226181447505951,0.018630901351571083,0.002091574715450406,-0.049278680235147476,-0.006514525040984154,0.02035530097782612,0.01033675018697977,0.04109199717640877,-0.0000701757671777159,0.018580520525574684,-0.03165065497159958,-0.10242995619773865,0.035695046186447144,-0.043508972972631454,-0.016417277976870537,0.020539795979857445,-0.019398771226406097,-0.020671049132943153,-0.08146213740110397,0.0386640690267086,-0.04975314810872078,0.00892745889723301,-0.04624433070421219,-0.01703101582825184,0.026868488639593124,-0.011432403698563576,-0.008395803160965443,0.01980355568230152,-0.01743508316576481,-0.057517729699611664,0.020265037193894386,0.05755871906876564,0.023423509672284126,-0.024062490090727806,0.02847360633313656,-0.005598153918981552,-0.0017974640941247344,-0.001422158326022327,0.0049812751822173595,0.02802303247153759,-0.005993553902953863,0.041983865201473236,0.02579536661505699,0.05143166705965996,-0.00375201809220016,-0.02343849651515484,0.046413786709308624,-0.005879699718207121,-0.06498581916093826,0.04452173039317131,-0.03436380997300148,0.051935289055109024,0.03289730101823807,0.019141463562846184,0.05995175987482071,-0.025417640805244446,-0.027539221569895744,-0.030204780399799347,-0.037298619747161865,0.015290756709873676,-0.013040431775152683,0.0353105403482914,0.03224247694015503,0.020237775519490242,-0.03157629072666168,-0.0263946745544672,-0.004973958246409893,0.001545664039440453,-0.0320756621658802,-0.044461075216531754,0.05381767824292183,-0.017813796177506447,0.010225812904536724,0.013674694113433361,-0.009552928619086742,0.007203582674264908,-0.01134039182215929,0.013796349056065083,0.03498890623450279,-0.0761272981762886,0.08832741528749466,-0.013897945173084736,-0.010653534904122353,-0.03935778886079788,-0.04705595225095749,-0.02750905603170395,-0.020411960780620575,0.017846060916781425,-0.028964191675186157,0.06507181376218796,0.07109533250331879,0.015823738649487495,-0.007432697806507349,-0.03767305240035057,0.013268363662064075,0.06424351036548615,0.01024707593023777,0.0469764769077301,0.03287530317902565,0.038869719952344894,0.05239880084991455,-0.006287622265517712,0.04866861179471016,0.025885259732604027,0.004045157693326473,-0.029206829145550728,0.0319083146750927,-0.013286598958075047,0.0024060977157205343,-0.02726891078054905,0.028318164870142937,0.05761169269680977,-0.010912936180830002,0.03940768539905548,0.027365049347281456,0.011922087520360947,0.010039223358035088,-0.001453888020478189,0.007076788693666458,0.023959672078490257,0.0023338794708251953,0.0023587094619870186,-0.05834410712122917,0.110855832695961,0.06350622326135635,-0.0028280424885451794,0.08281800150871277,0.00014115542580839247,-0.010226198472082615,-0.021863840520381927,-0.005995653104037046,0.020112989470362663,-0.0577131062746048,-0.05312003940343857,-0.0053167156875133514,-0.01335124485194683,0.040033191442489624,0.006688750348985195,0.05735943466424942,0.0044562919065356255,-0.0007101548835635185,0.014046665281057358,0.06074481084942818,-0.0851588100194931,0.03644493222236633,-0.017936667427420616,-0.022648481652140617,-0.004132418427616358,-0.058445919305086136,-0.02310468629002571,0.036549512296915054,-0.042380157858133316,-0.050739649683237076,0.026808079332113266,0.054469604045152664,0.0034644429106265306,0.016544926911592484,-0.0017525841249153018,-0.009198768064379692,0.004154090769588947,-0.015376369468867779,0.0196042712777853,0.024406051263213158,-0.07680440694093704,-0.004876242950558662,0.006934802513569593,0.012240304611623287,0.00325072486884892,-0.00005423495531431399,-0.07661104202270508,0.01899050734937191,0.03594544157385826,0.02092268131673336,0.023753900080919266,-0.050778258591890335,-0.017801346257328987,-0.07196217030286789,-0.016547169536352158,-0.00243490026332438,0.015497046522796154,-0.05999312922358513,-0.03251458704471588,-0.020206471905112267,-0.07611874490976334,0.0553930290043354,0.05797369405627251,-0.0012755469651892781,0.017329219728708267,0.033091358840465546,-0.04600418731570244,0.012461002916097641,-0.037832874804735184,0.008852534927427769,0.02808171510696411,-0.0657959058880806,0.0066076102666556835,0.005574048031121492,0.03499266132712364,0.02120169624686241,-0.01876336894929409,-0.0018383016576990485,-0.022674884647130966,-0.02007143385708332,-0.02727721445262432,0.04165598377585411,-0.033096350729465485,0.09060714393854141,0.01578330434858799,0.011494864709675312,0.009245632216334343,0.024586601182818413,-0.007968258112668991,0.0008041982655413449,-0.017532166093587875,0.07080429792404175,0.09925813227891922,-0.02429291047155857,0.009379456751048565,-0.04133821278810501,-0.024367092177271843,0.01415584608912468,-0.07294486463069916,0.01130990032106638,-0.03601718693971634,-0.04357517138123512,0.004999531898647547,0.028379732742905617,-0.06424908339977264,-0.0002415770577499643,0.008712525479495525,-0.07468842715024948,-0.007471918594092131,-0.037943869829177856,0.017548376694321632,0.0033839151728898287,0.007139448542147875,-0.02916613221168518,0.03827675059437752,0.007587091531604528,0.0021424940787255764,-0.04457051679491997,0.009457587264478207,0.007972842082381248,-0.0077118114568293095,0.03562883287668228,0.044192805886268616,-0.06705741584300995,-0.037374116480350494,0.036346305161714554,0.0007147662690840662,0.05840661749243736,0.0006654009339399636,-0.07040677219629288,0.019176488742232323,-0.010554916225373745,-0.024920105934143066,0.00223086541518569,0.020663084462285042,-0.07656269520521164,0.06549806892871857,0.029486145824193954,-0.005043998826295137,0.06060288846492767,-0.014680726453661919,0.03000984899699688,-0.030731426551938057,0.014503128826618195,0.04458563029766083,-0.05248398706316948,0.09283644706010818,0.014118109829723835,0.03577279672026634,-0.017124421894550323,-0.01898476853966713,-0.03633008152246475,-0.036678414791822433,0.06382151693105698,-0.05568934231996536,0.016190743073821068,-0.01775345578789711,0.03568178415298462,0.02530496008694172,0.05276225134730339,-0.09338195621967316,0.02757536619901657,0.013778661377727985,0.007435639388859272,0.04547648876905441,-0.0604204386472702,0.051907919347286224,0.0050935219042003155,-0.014091216027736664,-0.0010359310545027256,-0.014288169331848621,0.005838457494974136,-0.05466017127037048,0.007697208784520626,0.01644883118569851,-0.02713305875658989,-0.025574129074811935,-0.015706244856119156,0.06403800845146179,0.07452782988548279,-0.030817190185189247,-0.03771116957068443,-0.02245444804430008,-0.011001608334481716,0.05317546799778938,0.03790656849741936,0.021696532145142555,-0.001818762975744903,-0.031680744141340256,-0.03981959819793701,0.026851460337638855,0.00892611313611269,-0.014302650466561317,0.0015714302426204085,-0.03401155397295952,-0.010485350154340267,-0.024601425975561142,0.03458208590745926,-0.0881974920630455,0.04398632422089577,-0.04743662849068642,0.00046192080480977893,0.003614759771153331,-0.0036298593040555716,-0.01235571876168251,0.04203752800822258,0.045094821602106094,0.010728782042860985,0.017592649906873703,0.037735406309366226,-0.022614993155002594,-0.022905070334672928,0.0025685823056846857,0.04535629600286484,0.039775628596544266,-0.03527725115418434,0.0011079251999035478,-0.004002104513347149,0.01257772371172905,-0.02577194757759571,-0.03635544329881668,-0.029271237552165985,-0.0016233244678005576,-0.0014778993790969253,0.0386960469186306,0.008253243751823902,-0.08013126254081726,-0.0018405892187729478,0.0035667913034558296,-0.04380307346582413,-0.04351763427257538,-0.00222196988761425,0.0016570737352594733,-0.02675541117787361,-0.00487620709463954,-0.022767527028918266,-0.03347949683666229,-0.011404340155422688,-0.020002787932753563,0.05906576290726662,-0.04639389365911484,0.01467402745038271,0.038659676909446716,0.03770464286208153,0.0015900101279839873,0.006932474207133055,-0.01461891457438469,-0.006383066531270742,-0.006382928695529699,0.019503960385918617,-0.04529326409101486,0.008254843764007092,-0.02130337990820408,-0.07877499610185623,0.048650745302438736,-0.028234310448169708,-0.05326949432492256,0.0504625141620636,-0.012447129935026169,0.12405520677566528,-0.0674113780260086,0.009670419618487358,-0.024117853492498398,0.006409083027392626,0.028600601479411125,0.0429740771651268,-0.0052571543492376804,-0.056462038308382034,0.022507162764668465,0.06331445276737213,0.013668572530150414,-0.04502685368061066,-0.006029778625816107,0.039751749485731125,0.03191543370485306,-0.009995752014219761,0.01828130893409252,-0.06435070931911469,-0.020383426919579506,0.0009452563826926053,-0.03048115037381649,0.030105335637927055,-0.017561107873916626,0.05585949495434761,-0.003661512862890959,-0.021190764382481575,0.035177696496248245,-0.007001437712460756,0.04792165383696556,0.004326042253524065,0.01797136291861534,-0.002575849648565054,-0.04139977693557739,0.05885978788137436,-0.0629560723900795,0.019072962924838066,-0.010206889361143112,0.030840832740068436,0.0409536138176918,-0.001453318982385099,-0.060359660536050797,0.03366750106215477,-0.030263442546129227,-0.004893615376204252,-0.025769516825675964,-0.05803985521197319,-0.02066069096326828,-0.0054489197209477425,0.0021174552384763956,0.01900213584303856,0.021441346034407616,-0.011109216138720512,0.027235116809606552,-0.017372827976942062,-0.009939178824424744,0.01816132478415966,-0.0026554204523563385,-0.0067641898058354855,0.0009821291314437985,-8.328930692604763e-33,-0.06210627034306526,-0.019498925656080246,0.012935414910316467,0.0017428160645067692,-0.028916876763105392,-0.043600257486104965,0.013702225871384144,0.03636471927165985,-0.039939992129802704,0.010573147796094418,-0.001985113602131605,0.03525425121188164,0.016849439591169357,0.017974624410271645,0.09141824394464493,-0.023124324157834053,0.022349921986460686,-0.00520765595138073,-0.007985120639204979,-0.03840864077210426,-0.04854303225874901,0.038636960089206696,0.021961351856589317,-0.12727907299995422,0.044933076947927475,0.010639030486345291,-0.0011477334192022681,-0.01885370910167694,0.06794136017560959,-0.017915818840265274,0.007761620916426182,-0.04058488830924034,-0.010447362437844276,-0.06224408745765686,0.007094728760421276,0.020596299320459366,-0.03580337390303612,-0.018798749893903732,0.03480113297700882,-0.0070132105611264706,0.016144918277859688,0.0208504106849432,-0.00872946996241808,0.016104714944958687,-0.0004867363895755261,-0.05528976768255234,0.014650939032435417,0.01675947569310665,0.01507926732301712,-0.0042563313618302345,0.010274086147546768,0.006854720413684845,-0.04481339827179909,-0.005225324537605047,-0.025776084512472153,0.08018152415752411,0.012078195810317993,0.0248690377920866,0.0036040327977389097,-0.019423678517341614,-0.051981121301651,0.018348753452301025,0.012226705439388752,-0.001848317333497107,-0.005296844523400068,-0.02869749441742897,0.019901787862181664,-0.0017856655176728964,-0.08511610329151154,-0.005678173620253801,-0.05321827903389931,0.04321090504527092,0.016843266785144806,0.011126379482448101,-0.009739482775330544,-0.059409983456134796,-0.028432969003915787,0.022136589512228966,0.05330448970198631,0.00034625077387318015,0.027976302430033684,-0.03322659432888031,-0.0040619890205562115,-0.014034788124263287,0.008044583722949028,0.005356684792786837,-0.0206778384745121,0.002617952413856983,0.036440424621105194,0.010649682022631168,-0.002908205846324563,-0.016131727024912834,-0.005556980613619089,0.007009441498667002,-0.06184210628271103,-0.02642086148262024,0.05271897837519646,0.04948268458247185,-0.006055265665054321,-0.015527164563536644,0.03545482084155083,0.10677202045917511,-0.025001678615808487,-0.006275010760873556,0.010262343101203442,-0.012852760963141918,-0.05915693938732147,0.015773696824908257,-0.05739510804414749,-0.0021068823989480734,0.013069260865449905,0.02324538677930832,0.012798667885363102,0.000868731178343296,0.0023760469630360603,0.023990221321582794,0.03924744576215744,0.030634578317403793,-0.02041690982878208,0.003594400594010949,0.002655219053849578,-0.005896551534533501,0.007199425250291824,0.03638782352209091,-0.012603149749338627,-0.024134870618581772,0.004531830083578825,-0.012643921189010143,0.06987309455871582,0.024289684370160103,0.003528071567416191,0.0121395168825984,3.2859463772183517e-7,0.04937581345438957,0.022751474753022194,-0.01327963825315237,0.015138448216021061,0.023456722497940063,-0.043696943670511246,-0.018045881763100624,0.01958685927093029,0.00202411157079041,0.01821300946176052,0.022021815180778503,-0.06715492159128189,0.041351910680532455,0.0845443531870842,-0.03869759291410446,-0.07948341220617294,-0.024757634848356247,-0.00344390282407403,-0.0355679914355278,0.015081661753356457,0.07853078097105026,0.024591457098722458,-0.0016055797459557652,0.022354841232299805,0.001252765767276287,0.015393933281302452,-0.009592660702764988,-0.01567208021879196,-0.00252108764834702,0.035559896379709244,0.028341827914118767,-0.03958424925804138,0.032295964658260345,-0.027181047946214676,-0.04589244723320007,-0.02464345656335354,-0.005983326584100723,0.00867723673582077,0.0632636547088623,-0.027781018987298012,-0.04291760176420212,-0.03987077251076698,0.040084581822156906,-0.016493316739797592,0.039705559611320496,0.031009679660201073,0.038970861583948135,-0.015525948256254196,-0.05161731690168381,-0.08188886940479279,0.04254832863807678,0.0077121383510529995,-0.01346001960337162,-0.008534671738743782,0.048815011978149414,-0.007230125367641449,-0.014639138244092464,0.02518695406615734,0.04039391502737999,0.019712142646312714,-0.027746468782424927,-0.03159773349761963,0.02111705392599106,-0.0210487749427557,0.04129400476813316,0.0781935304403305,-0.03838407248258591,2.0613544700303964e-34,0.01204773224890232,0.002577523933723569,0.005866124760359526,-0.00021457417460624129,0.031888723373413086,-0.038647834211587906,-0.030051253736019135,-0.03304832801222801,0.013017618097364902,-0.036441486328840256,-0.016313202679157257]'
SET
  @EmbeddingModelID_cb06fe6f2bf3 = '1D45AA65-41EC-4572-9ECD-AB2826C9B059'
SET
  @Reusable_cb06fe6f2bf3 = 0
SET
  @IsMaterialized_cb06fe6f2bf3 = 0
EXEC [${mjSchema}].spCreateQuery @ID = @ID_cb06fe6f2bf3,
  @Name = @Name_cb06fe6f2bf3,
  @CategoryID = @CategoryID_cb06fe6f2bf3,
  @UserQuestion = @UserQuestion_cb06fe6f2bf3,
  @Description = @Description_cb06fe6f2bf3,
  @SQL = @SQL_cb06fe6f2bf3,
  @TechnicalDescription = @TechnicalDescription_cb06fe6f2bf3,
  @OriginalSQL = @OriginalSQL_cb06fe6f2bf3,
  @OriginalSQL_Clear = 1,
  @Feedback = @Feedback_cb06fe6f2bf3,
  @Feedback_Clear = 1,
  @Status = @Status_cb06fe6f2bf3,
  @QualityRank = @QualityRank_cb06fe6f2bf3,
  @ExecutionCostRank = @ExecutionCostRank_cb06fe6f2bf3,
  @UsesTemplate = @UsesTemplate_cb06fe6f2bf3,
  @AuditQueryRuns = @AuditQueryRuns_cb06fe6f2bf3,
  @CacheEnabled = @CacheEnabled_cb06fe6f2bf3,
  @CacheTTLMinutes = @CacheTTLMinutes_cb06fe6f2bf3,
  @CacheTTLMinutes_Clear = 1,
  @CacheMaxSize = @CacheMaxSize_cb06fe6f2bf3,
  @CacheMaxSize_Clear = 1,
  @EmbeddingVector = @EmbeddingVector_cb06fe6f2bf3,
  @EmbeddingModelID = @EmbeddingModelID_cb06fe6f2bf3,
  @CacheValidationSQL = @CacheValidationSQL_cb06fe6f2bf3,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_cb06fe6f2bf3,
  @Reusable = @Reusable_cb06fe6f2bf3,
  @ExternalDataSourceID = @ExternalDataSourceID_cb06fe6f2bf3,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_cb06fe6f2bf3;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_565862dd9a85 UNIQUEIDENTIFIER,
@QueryID_565862dd9a85 UNIQUEIDENTIFIER,
@Name_565862dd9a85 NVARCHAR(255),
@Type_565862dd9a85 NVARCHAR(50),
@IsRequired_565862dd9a85 BIT,
@DefaultValue_565862dd9a85 NVARCHAR(MAX),
@Description_565862dd9a85 NVARCHAR(MAX),
@SampleValue_565862dd9a85 NVARCHAR(MAX),
@ValidationFilters_565862dd9a85 NVARCHAR(MAX),
@DetectionMethod_565862dd9a85 NVARCHAR(50),
@AutoDetectConfidenceScore_565862dd9a85 DECIMAL(3, 2)
SET
  @ID_565862dd9a85 = '7ba637fa-2a63-40be-9a7e-d1b0fc140b7d'
SET
  @QueryID_565862dd9a85 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_565862dd9a85 = N'FormID'
SET
  @Type_565862dd9a85 = N'string'
SET
  @IsRequired_565862dd9a85 = 1
SET
  @Description_565862dd9a85 = N'Unique identifier of the form to retrieve response stats for.'
SET
  @SampleValue_565862dd9a85 = N'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
SET
  @DetectionMethod_565862dd9a85 = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_565862dd9a85,
  @QueryID = @QueryID_565862dd9a85,
  @Name = @Name_565862dd9a85,
  @Type = @Type_565862dd9a85,
  @IsRequired = @IsRequired_565862dd9a85,
  @DefaultValue = @DefaultValue_565862dd9a85,
  @DefaultValue_Clear = 1,
  @Description = @Description_565862dd9a85,
  @SampleValue = @SampleValue_565862dd9a85,
  @ValidationFilters = @ValidationFilters_565862dd9a85,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_565862dd9a85,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_565862dd9a85,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_153bf1dffe10 UNIQUEIDENTIFIER,
@QueryID_153bf1dffe10 UNIQUEIDENTIFIER,
@Name_153bf1dffe10 NVARCHAR(255),
@Type_153bf1dffe10 NVARCHAR(50),
@IsRequired_153bf1dffe10 BIT,
@DefaultValue_153bf1dffe10 NVARCHAR(MAX),
@Description_153bf1dffe10 NVARCHAR(MAX),
@SampleValue_153bf1dffe10 NVARCHAR(MAX),
@ValidationFilters_153bf1dffe10 NVARCHAR(MAX),
@DetectionMethod_153bf1dffe10 NVARCHAR(50),
@AutoDetectConfidenceScore_153bf1dffe10 DECIMAL(3, 2)
SET
  @ID_153bf1dffe10 = '4bc3309b-3aa8-4907-bbcf-34470b2568a9'
SET
  @QueryID_153bf1dffe10 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_153bf1dffe10 = N'FormVersionID'
SET
  @Type_153bf1dffe10 = N'string'
SET
  @IsRequired_153bf1dffe10 = 0
SET
  @Description_153bf1dffe10 = N'Optional unique identifier of a specific form version to narrow stats down to that version. Guarded by truthiness check.'
SET
  @SampleValue_153bf1dffe10 = N'F9E8D7C6-B5A4-3210-FEDC-BA0987654321'
SET
  @DetectionMethod_153bf1dffe10 = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_153bf1dffe10,
  @QueryID = @QueryID_153bf1dffe10,
  @Name = @Name_153bf1dffe10,
  @Type = @Type_153bf1dffe10,
  @IsRequired = @IsRequired_153bf1dffe10,
  @DefaultValue = @DefaultValue_153bf1dffe10,
  @DefaultValue_Clear = 1,
  @Description = @Description_153bf1dffe10,
  @SampleValue = @SampleValue_153bf1dffe10,
  @ValidationFilters = @ValidationFilters_153bf1dffe10,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_153bf1dffe10,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_153bf1dffe10,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_494b1e948b76 UNIQUEIDENTIFIER,
@QueryID_494b1e948b76 UNIQUEIDENTIFIER,
@Name_494b1e948b76 NVARCHAR(255),
@Description_494b1e948b76 NVARCHAR(MAX),
@Sequence_494b1e948b76 INT,
@SQLBaseType_494b1e948b76 NVARCHAR(50),
@SQLFullType_494b1e948b76 NVARCHAR(100),
@SourceEntityID_494b1e948b76 UNIQUEIDENTIFIER,
@SourceFieldName_494b1e948b76 NVARCHAR(255),
@IsComputed_494b1e948b76 BIT,
@ComputationDescription_494b1e948b76 NVARCHAR(MAX),
@IsSummary_494b1e948b76 BIT,
@SummaryDescription_494b1e948b76 NVARCHAR(MAX),
@DetectionMethod_494b1e948b76 NVARCHAR(50),
@AutoDetectConfidenceScore_494b1e948b76 DECIMAL(3, 2)
SET
  @ID_494b1e948b76 = '7f2df849-a9c7-4fd0-bc22-77d3ecfff803'
SET
  @QueryID_494b1e948b76 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_494b1e948b76 = N'CompleteCount'
SET
  @Description_494b1e948b76 = N'Count of form responses with Status = ''Complete'''
SET
  @Sequence_494b1e948b76 = 1
SET
  @SQLBaseType_494b1e948b76 = N'decimal'
SET
  @SQLFullType_494b1e948b76 = N'decimal(18,2)'
SET
  @IsComputed_494b1e948b76 = 1
SET
  @ComputationDescription_494b1e948b76 = N'Subquery counting all scoped rows where Status = ''Complete'''
SET
  @IsSummary_494b1e948b76 = 1
SET
  @DetectionMethod_494b1e948b76 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_494b1e948b76,
  @QueryID = @QueryID_494b1e948b76,
  @Name = @Name_494b1e948b76,
  @Description = @Description_494b1e948b76,
  @Sequence = @Sequence_494b1e948b76,
  @SQLBaseType = @SQLBaseType_494b1e948b76,
  @SQLFullType = @SQLFullType_494b1e948b76,
  @SourceEntityID = @SourceEntityID_494b1e948b76,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_494b1e948b76,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_494b1e948b76,
  @ComputationDescription = @ComputationDescription_494b1e948b76,
  @IsSummary = @IsSummary_494b1e948b76,
  @SummaryDescription = @SummaryDescription_494b1e948b76,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_494b1e948b76,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_494b1e948b76,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_e8278bb36a7a UNIQUEIDENTIFIER,
@QueryID_e8278bb36a7a UNIQUEIDENTIFIER,
@Name_e8278bb36a7a NVARCHAR(255),
@Description_e8278bb36a7a NVARCHAR(MAX),
@Sequence_e8278bb36a7a INT,
@SQLBaseType_e8278bb36a7a NVARCHAR(50),
@SQLFullType_e8278bb36a7a NVARCHAR(100),
@SourceEntityID_e8278bb36a7a UNIQUEIDENTIFIER,
@SourceFieldName_e8278bb36a7a NVARCHAR(255),
@IsComputed_e8278bb36a7a BIT,
@ComputationDescription_e8278bb36a7a NVARCHAR(MAX),
@IsSummary_e8278bb36a7a BIT,
@SummaryDescription_e8278bb36a7a NVARCHAR(MAX),
@DetectionMethod_e8278bb36a7a NVARCHAR(50),
@AutoDetectConfidenceScore_e8278bb36a7a DECIMAL(3, 2)
SET
  @ID_e8278bb36a7a = '1dfa0915-422b-4f2a-9971-9c40869dfbf9'
SET
  @QueryID_e8278bb36a7a = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_e8278bb36a7a = N'PartialCount'
SET
  @Description_e8278bb36a7a = N'Count of form responses with Status = ''Partial'''
SET
  @Sequence_e8278bb36a7a = 2
SET
  @SQLBaseType_e8278bb36a7a = N'decimal'
SET
  @SQLFullType_e8278bb36a7a = N'decimal(18,2)'
SET
  @IsComputed_e8278bb36a7a = 1
SET
  @ComputationDescription_e8278bb36a7a = N'Subquery counting all scoped rows where Status = ''Partial'''
SET
  @IsSummary_e8278bb36a7a = 1
SET
  @DetectionMethod_e8278bb36a7a = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_e8278bb36a7a,
  @QueryID = @QueryID_e8278bb36a7a,
  @Name = @Name_e8278bb36a7a,
  @Description = @Description_e8278bb36a7a,
  @Sequence = @Sequence_e8278bb36a7a,
  @SQLBaseType = @SQLBaseType_e8278bb36a7a,
  @SQLFullType = @SQLFullType_e8278bb36a7a,
  @SourceEntityID = @SourceEntityID_e8278bb36a7a,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_e8278bb36a7a,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_e8278bb36a7a,
  @ComputationDescription = @ComputationDescription_e8278bb36a7a,
  @IsSummary = @IsSummary_e8278bb36a7a,
  @SummaryDescription = @SummaryDescription_e8278bb36a7a,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_e8278bb36a7a,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_e8278bb36a7a,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_76087f771dc1 UNIQUEIDENTIFIER,
@QueryID_76087f771dc1 UNIQUEIDENTIFIER,
@Name_76087f771dc1 NVARCHAR(255),
@Description_76087f771dc1 NVARCHAR(MAX),
@Sequence_76087f771dc1 INT,
@SQLBaseType_76087f771dc1 NVARCHAR(50),
@SQLFullType_76087f771dc1 NVARCHAR(100),
@SourceEntityID_76087f771dc1 UNIQUEIDENTIFIER,
@SourceFieldName_76087f771dc1 NVARCHAR(255),
@IsComputed_76087f771dc1 BIT,
@ComputationDescription_76087f771dc1 NVARCHAR(MAX),
@IsSummary_76087f771dc1 BIT,
@SummaryDescription_76087f771dc1 NVARCHAR(MAX),
@DetectionMethod_76087f771dc1 NVARCHAR(50),
@AutoDetectConfidenceScore_76087f771dc1 DECIMAL(3, 2)
SET
  @ID_76087f771dc1 = '51f93d27-511f-4ca0-90b2-9dd4d0b65a6e'
SET
  @QueryID_76087f771dc1 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_76087f771dc1 = N'DisqualifiedCount'
SET
  @Description_76087f771dc1 = N'Count of form responses with Status = ''Disqualified'''
SET
  @Sequence_76087f771dc1 = 3
SET
  @SQLBaseType_76087f771dc1 = N'decimal'
SET
  @SQLFullType_76087f771dc1 = N'decimal(18,2)'
SET
  @IsComputed_76087f771dc1 = 1
SET
  @ComputationDescription_76087f771dc1 = N'Subquery counting all scoped rows where Status = ''Disqualified'''
SET
  @IsSummary_76087f771dc1 = 1
SET
  @DetectionMethod_76087f771dc1 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_76087f771dc1,
  @QueryID = @QueryID_76087f771dc1,
  @Name = @Name_76087f771dc1,
  @Description = @Description_76087f771dc1,
  @Sequence = @Sequence_76087f771dc1,
  @SQLBaseType = @SQLBaseType_76087f771dc1,
  @SQLFullType = @SQLFullType_76087f771dc1,
  @SourceEntityID = @SourceEntityID_76087f771dc1,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_76087f771dc1,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_76087f771dc1,
  @ComputationDescription = @ComputationDescription_76087f771dc1,
  @IsSummary = @IsSummary_76087f771dc1,
  @SummaryDescription = @SummaryDescription_76087f771dc1,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_76087f771dc1,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_76087f771dc1,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_45d1f202c495 UNIQUEIDENTIFIER,
@QueryID_45d1f202c495 UNIQUEIDENTIFIER,
@Name_45d1f202c495 NVARCHAR(255),
@Description_45d1f202c495 NVARCHAR(MAX),
@Sequence_45d1f202c495 INT,
@SQLBaseType_45d1f202c495 NVARCHAR(50),
@SQLFullType_45d1f202c495 NVARCHAR(100),
@SourceEntityID_45d1f202c495 UNIQUEIDENTIFIER,
@SourceFieldName_45d1f202c495 NVARCHAR(255),
@IsComputed_45d1f202c495 BIT,
@ComputationDescription_45d1f202c495 NVARCHAR(MAX),
@IsSummary_45d1f202c495 BIT,
@SummaryDescription_45d1f202c495 NVARCHAR(MAX),
@DetectionMethod_45d1f202c495 NVARCHAR(50),
@AutoDetectConfidenceScore_45d1f202c495 DECIMAL(3, 2)
SET
  @ID_45d1f202c495 = '02c10762-775d-4718-8a04-c09282659dae'
SET
  @QueryID_45d1f202c495 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_45d1f202c495 = N'StartedCount'
SET
  @Description_45d1f202c495 = N'Total count of form responses (all statuses combined)'
SET
  @Sequence_45d1f202c495 = 4
SET
  @SQLBaseType_45d1f202c495 = N'decimal'
SET
  @SQLFullType_45d1f202c495 = N'decimal(18,2)'
SET
  @IsComputed_45d1f202c495 = 1
SET
  @ComputationDescription_45d1f202c495 = N'Subquery counting all scoped rows for the form'
SET
  @IsSummary_45d1f202c495 = 1
SET
  @DetectionMethod_45d1f202c495 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_45d1f202c495,
  @QueryID = @QueryID_45d1f202c495,
  @Name = @Name_45d1f202c495,
  @Description = @Description_45d1f202c495,
  @Sequence = @Sequence_45d1f202c495,
  @SQLBaseType = @SQLBaseType_45d1f202c495,
  @SQLFullType = @SQLFullType_45d1f202c495,
  @SourceEntityID = @SourceEntityID_45d1f202c495,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_45d1f202c495,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_45d1f202c495,
  @ComputationDescription = @ComputationDescription_45d1f202c495,
  @IsSummary = @IsSummary_45d1f202c495,
  @SummaryDescription = @SummaryDescription_45d1f202c495,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_45d1f202c495,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_45d1f202c495,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_9a69127f7970 UNIQUEIDENTIFIER,
@QueryID_9a69127f7970 UNIQUEIDENTIFIER,
@Name_9a69127f7970 NVARCHAR(255),
@Description_9a69127f7970 NVARCHAR(MAX),
@Sequence_9a69127f7970 INT,
@SQLBaseType_9a69127f7970 NVARCHAR(50),
@SQLFullType_9a69127f7970 NVARCHAR(100),
@SourceEntityID_9a69127f7970 UNIQUEIDENTIFIER,
@SourceFieldName_9a69127f7970 NVARCHAR(255),
@IsComputed_9a69127f7970 BIT,
@ComputationDescription_9a69127f7970 NVARCHAR(MAX),
@IsSummary_9a69127f7970 BIT,
@SummaryDescription_9a69127f7970 NVARCHAR(MAX),
@DetectionMethod_9a69127f7970 NVARCHAR(50),
@AutoDetectConfidenceScore_9a69127f7970 DECIMAL(3, 2)
SET
  @ID_9a69127f7970 = '153ad2f6-57c3-4f33-b8e8-65f43bdaf9c5'
SET
  @QueryID_9a69127f7970 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_9a69127f7970 = N'MedianCompletionSeconds'
SET
  @Description_9a69127f7970 = N'Median time taken to complete the form, in seconds'
SET
  @Sequence_9a69127f7970 = 5
SET
  @SQLBaseType_9a69127f7970 = N'decimal'
SET
  @SQLFullType_9a69127f7970 = N'decimal(18,2)'
SET
  @IsComputed_9a69127f7970 = 1
SET
  @ComputationDescription_9a69127f7970 = N'PERCENTILE_CONT(0.5) window function calculating the median duration in seconds for completed responses submitted within 0 to 24 hours'
SET
  @IsSummary_9a69127f7970 = 1
SET
  @DetectionMethod_9a69127f7970 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_9a69127f7970,
  @QueryID = @QueryID_9a69127f7970,
  @Name = @Name_9a69127f7970,
  @Description = @Description_9a69127f7970,
  @Sequence = @Sequence_9a69127f7970,
  @SQLBaseType = @SQLBaseType_9a69127f7970,
  @SQLFullType = @SQLFullType_9a69127f7970,
  @SourceEntityID = @SourceEntityID_9a69127f7970,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_9a69127f7970,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_9a69127f7970,
  @ComputationDescription = @ComputationDescription_9a69127f7970,
  @IsSummary = @IsSummary_9a69127f7970,
  @SummaryDescription = @SummaryDescription_9a69127f7970,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_9a69127f7970,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_9a69127f7970,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_7f17a688dfec UNIQUEIDENTIFIER,
@QueryID_7f17a688dfec UNIQUEIDENTIFIER,
@Name_7f17a688dfec NVARCHAR(255),
@Description_7f17a688dfec NVARCHAR(MAX),
@Sequence_7f17a688dfec INT,
@SQLBaseType_7f17a688dfec NVARCHAR(50),
@SQLFullType_7f17a688dfec NVARCHAR(100),
@SourceEntityID_7f17a688dfec UNIQUEIDENTIFIER,
@SourceFieldName_7f17a688dfec NVARCHAR(255),
@IsComputed_7f17a688dfec BIT,
@ComputationDescription_7f17a688dfec NVARCHAR(MAX),
@IsSummary_7f17a688dfec BIT,
@SummaryDescription_7f17a688dfec NVARCHAR(MAX),
@DetectionMethod_7f17a688dfec NVARCHAR(50),
@AutoDetectConfidenceScore_7f17a688dfec DECIMAL(3, 2)
SET
  @ID_7f17a688dfec = 'b704e550-5d6b-4c66-8581-14a021c63f3a'
SET
  @QueryID_7f17a688dfec = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_7f17a688dfec = N'LastSubmittedAt'
SET
  @Description_7f17a688dfec = N'Timestamp of the most recent completed response submission'
SET
  @Sequence_7f17a688dfec = 6
SET
  @SQLBaseType_7f17a688dfec = N'datetime'
SET
  @SQLFullType_7f17a688dfec = N'datetime'
SET
  @IsComputed_7f17a688dfec = 1
SET
  @ComputationDescription_7f17a688dfec = N'MAX(SubmittedAt) aggregate subquery over completed scoped responses'
SET
  @IsSummary_7f17a688dfec = 1
SET
  @DetectionMethod_7f17a688dfec = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_7f17a688dfec,
  @QueryID = @QueryID_7f17a688dfec,
  @Name = @Name_7f17a688dfec,
  @Description = @Description_7f17a688dfec,
  @Sequence = @Sequence_7f17a688dfec,
  @SQLBaseType = @SQLBaseType_7f17a688dfec,
  @SQLFullType = @SQLFullType_7f17a688dfec,
  @SourceEntityID = @SourceEntityID_7f17a688dfec,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_7f17a688dfec,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_7f17a688dfec,
  @ComputationDescription = @ComputationDescription_7f17a688dfec,
  @IsSummary = @IsSummary_7f17a688dfec,
  @SummaryDescription = @SummaryDescription_7f17a688dfec,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_7f17a688dfec,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_7f17a688dfec,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_27f2ccf353fd UNIQUEIDENTIFIER,
@QueryID_27f2ccf353fd UNIQUEIDENTIFIER,
@EntityID_27f2ccf353fd UNIQUEIDENTIFIER,
@DetectionMethod_27f2ccf353fd NVARCHAR(50),
@AutoDetectConfidenceScore_27f2ccf353fd DECIMAL(3, 2)
SET
  @ID_27f2ccf353fd = '86112ea6-530b-486d-b6a5-696c342cd4ee'
SET
  @QueryID_27f2ccf353fd = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @EntityID_27f2ccf353fd = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_27f2ccf353fd = N'AI'
SET
  @AutoDetectConfidenceScore_27f2ccf353fd = 1
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_27f2ccf353fd,
  @QueryID = @QueryID_27f2ccf353fd,
  @EntityID = @EntityID_27f2ccf353fd,
  @DetectionMethod = @DetectionMethod_27f2ccf353fd,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_27f2ccf353fd;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ID_d181d21344e2 UNIQUEIDENTIFIER,
@Name_d181d21344e2 NVARCHAR(255),
@CategoryID_d181d21344e2 UNIQUEIDENTIFIER,
@UserQuestion_d181d21344e2 NVARCHAR(MAX),
@Description_d181d21344e2 NVARCHAR(MAX),
@SQL_d181d21344e2 NVARCHAR(MAX),
@TechnicalDescription_d181d21344e2 NVARCHAR(MAX),
@OriginalSQL_d181d21344e2 NVARCHAR(MAX),
@Feedback_d181d21344e2 NVARCHAR(MAX),
@Status_d181d21344e2 NVARCHAR(15),
@QualityRank_d181d21344e2 INT,
@ExecutionCostRank_d181d21344e2 INT,
@UsesTemplate_d181d21344e2 BIT,
@AuditQueryRuns_d181d21344e2 BIT,
@CacheEnabled_d181d21344e2 BIT,
@CacheTTLMinutes_d181d21344e2 INT,
@CacheMaxSize_d181d21344e2 INT,
@EmbeddingVector_d181d21344e2 NVARCHAR(MAX),
@EmbeddingModelID_d181d21344e2 UNIQUEIDENTIFIER,
@CacheValidationSQL_d181d21344e2 NVARCHAR(MAX),
@SQLDialectID_d181d21344e2 UNIQUEIDENTIFIER,
@Reusable_d181d21344e2 BIT,
@ExternalDataSourceID_d181d21344e2 UNIQUEIDENTIFIER,
@IsMaterialized_d181d21344e2 BIT
SET
  @ID_d181d21344e2 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_d181d21344e2 = N'Forms: Question Answer Value Counts'
SET
  @CategoryID_d181d21344e2 = '38044DBA-A933-4A8D-A5B6-25EC82210B93'
SET
  @UserQuestion_d181d21344e2 = N'For each question on this form, how many completed responses chose each answer?'
SET
  @Description_d181d21344e2 = N'Per question, per stored value, the number of Complete responses'' answers carrying it: choice values (multi-select arrays expanded), numbers, yes/no and dates, plus the exact count of responses that answered the question. Unbounded; read server-side by FormReportingEngine, which returns aggregates only.'
SET
  @SQL_d181d21344e2 = N'-- Forms: Question Answer Value Counts — per question, how many Complete responses chose each
-- stored value (FormReportingEngine, Forms.GetResponseSummary breakdowns). One row per
-- (QuestionID, ValueKind, Value).
--
-- FormID is required. FormVersionID narrows to the responses pinned to one version; absent, every
-- version counts (answers map back to questions by QuestionID).
--
-- Complete responses only: breakdowns describe the same population as the headline, and mixing in
-- partial autosaves produced counts larger than the denominator they were shown against.
--
-- Value extraction mirrors answer-values.ts extractChoiceValues():
--   * a JSONValue that is a JSON ARRAY contributes one value per non-null, non-blank element, and
--     then its TextValue is ignored (an empty array contributes nothing);
--   * otherwise a non-blank TextValue is the value;
--   * NumericValue, BooleanValue and DateValue contribute their own kinds, so scale, consent and
--     date breakdowns come from the same query.
-- A nested array or object element is counted by its JSON text; no choice control writes one.
-- A JSON OBJECT (Matrix, Address, ContactInfo) contributes nothing here: those are aggregated by
-- the engine from the rows themselves (Matrix cells, the respondent profile).
--
-- UNBOUNDED, deliberately. The dashboard truncates no choice, scale, yes/no or date distribution,
-- so neither may this. Free-text values come back too (the query cannot tell a ShortText from a
-- SingleChoice without the type table it must not duplicate); the engine uses only the rows of
-- charted questions, and nothing here ever reaches a client: the operation returns aggregates.
-- AnsweredResponses is distinct Complete responses with a value of this ValueKind for the question.
-- A question may change type across versions; older incompatible kinds must not inflate its card.
--
-- OPENJSON gets only text that already passed the array guard: the guard is INSIDE the call
-- (CASE ... END yields NULL otherwise, and OPENJSON(NULL) returns no rows), because SQL Server
-- does not promise to filter rows before evaluating a CROSS APPLY, and OPENJSON throws on
-- invalid JSON.
WITH scoped AS (
    SELECT r.ID
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
      AND r.Status = N''Complete''
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
answers AS (
    SELECT
        a.QuestionID,
        a.ResponseID,
        a.TextValue,
        a.NumericValue,
        a.BooleanValue,
        a.DateValue,
        a.JSONValue,
        CASE WHEN ISJSON(a.JSONValue) = 1 AND LEFT(LTRIM(a.JSONValue), 1) = N''['' THEN 1 ELSE 0 END AS IsJSONArray
    FROM [__mj_BizAppsForms].[vwFormResponseAnswers] a
    INNER JOIN scoped s ON s.ID = a.ResponseID
),
vals AS (
    SELECT a.QuestionID, a.ResponseID, N''Text'' AS ValueKind, LTRIM(RTRIM(j.[value])) AS Value, CAST(NULL AS DECIMAL(18, 4)) AS NumericValue
    FROM answers a
    CROSS APPLY OPENJSON(CASE WHEN a.IsJSONArray = 1 THEN a.JSONValue END) j
    WHERE a.IsJSONArray = 1 AND j.[type] <> 0 AND LTRIM(RTRIM(j.[value])) <> N''''
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N''Text'', a.TextValue, NULL
    FROM answers a
    WHERE a.IsJSONArray = 0 AND a.TextValue IS NOT NULL AND LTRIM(RTRIM(a.TextValue)) <> N''''
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N''Numeric'', CONVERT(NVARCHAR(64), a.NumericValue), a.NumericValue
    FROM answers a
    WHERE a.NumericValue IS NOT NULL
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N''Boolean'', CASE WHEN a.BooleanValue = 1 THEN N''true'' ELSE N''false'' END, NULL
    FROM answers a
    WHERE a.BooleanValue IS NOT NULL
    UNION ALL
    SELECT a.QuestionID, a.ResponseID, N''Date'', CONVERT(NVARCHAR(40), a.DateValue, 127), NULL
    FROM answers a
    WHERE a.DateValue IS NOT NULL
),
answered AS (
    SELECT v.QuestionID, v.ValueKind, COUNT(DISTINCT v.ResponseID) AS AnsweredResponses
    FROM vals v
    GROUP BY v.QuestionID, v.ValueKind
),
counted AS (
    -- Grouped on the value''s BYTES, not its text: the database collation is case- and trailing-space-
    -- insensitive, so GROUP BY v.Value would put ''g'', ''G'' and ''g '' in one group and return whichever
    -- spelling came first — moving a whole option''s count into "Other", or an off-list variant into
    -- the option, depending on row order. The browser compared values exactly; so does this. Every
    -- row of a group has the same bytes, so MAX(v.Value) is that one value, deterministically.
    SELECT v.QuestionID, v.ValueKind, MAX(v.Value) AS Value, v.NumericValue, COUNT(*) AS ValueCount
    FROM vals v
    GROUP BY v.QuestionID, v.ValueKind, CONVERT(VARBINARY(MAX), v.Value), v.NumericValue
)
SELECT
    c.QuestionID,
    q.AnsweredResponses,
    c.ValueKind,
    c.Value,
    c.NumericValue,
    c.ValueCount
FROM counted c
INNER JOIN answered q ON q.QuestionID = c.QuestionID AND q.ValueKind = c.ValueKind
ORDER BY c.QuestionID, c.ValueKind, c.ValueCount DESC, c.Value;
'
SET
  @TechnicalDescription_d181d21344e2 = N'Nunjucks-parameterized. FormID (required) and FormVersionID (optional) scope Complete rows of vwFormResponses; answers from vwFormResponseAnswers. A JSON-array JSONValue yields one Text value per non-blank element and suppresses TextValue (answer-values.ts extractChoiceValues); JSON objects contribute nothing; NumericValue, BooleanValue and DateValue yield Numeric, Boolean and Date kinds. Values are grouped on their bytes (CONVERT(VARBINARY(MAX), Value)), so case and trailing-space variants are counted apart, as the dashboard compared them. Columns: QuestionID, AnsweredResponses, ValueKind, Value, NumericValue, ValueCount.'
SET
  @Status_d181d21344e2 = N'Approved'
SET
  @QualityRank_d181d21344e2 = 8
SET
  @ExecutionCostRank_d181d21344e2 = 4
SET
  @UsesTemplate_d181d21344e2 = 1
SET
  @AuditQueryRuns_d181d21344e2 = 0
SET
  @CacheEnabled_d181d21344e2 = 0
SET
  @EmbeddingVector_d181d21344e2 = N'[-0.03790012747049332,0.004523449577391148,-0.012652062810957432,0.02901528589427471,-0.008473124355077744,0.00323971058242023,-0.0014068350428715348,-0.019695917144417763,-0.002127800602465868,0.048593148589134216,0.03593727573752403,-0.044928692281246185,0.0029219973366707563,0.029640838503837585,-0.007027678657323122,0.02703261375427246,0.005569812376052141,-0.01366464700549841,-0.08027910441160202,-0.0007002699421718717,-0.018585851415991783,0.012781049124896526,-0.04452909156680107,0.008699478581547737,0.0013845044886693358,-0.021982192993164062,-0.04686228558421135,-0.005424755625426769,0.017208732664585114,-0.10891727358102798,-0.04318026080727577,0.008615432307124138,-0.03423032537102699,-0.044607844203710556,0.00000230436717174598,-0.02852572500705719,-0.07183892279863358,0.0446113720536232,-0.055202122777700424,0.02384842187166214,0.0018768765730783343,0.04313717037439346,0.00971387792378664,0.030488908290863037,0.024469032883644104,-0.05861545354127884,-0.03056233748793602,-0.02633453905582428,0.009103343822062016,-0.039110057055950165,0.016719447448849678,0.010870524682104588,-0.011843845248222351,0.0072341556660830975,0.05244823172688484,0.03769393265247345,-0.022688226774334908,0.0073371101170778275,0.014397646300494671,-0.005311793647706509,-0.0123911052942276,-0.021117685362696648,0.034297436475753784,-0.06954409182071686,-0.030659006908535957,0.002768256701529026,0.02243170142173767,-0.008003615774214268,0.02523697353899479,0.0036989720538258553,0.14997419714927673,0.026721743866801262,-0.02966877445578575,-0.030050916597247124,-0.0033872544299811125,0.0528576634824276,-0.0007817344157956541,-0.012568112462759018,0.007644653785973787,-0.02523268572986126,-0.05656199902296066,0.0483686663210392,-0.04634837806224823,-0.011988739483058453,-0.014429457485675812,0.057709768414497375,0.036089036613702774,0.014622122049331665,-0.0018437812104821205,0.003393488936126232,0.015226979739964008,-0.01941039226949215,0.0671953484416008,0.008745679631829262,-0.017466289922595024,-0.01551728043705225,0.007827882654964924,-0.08115340769290924,0.06400921940803528,0.021323194727301598,0.0531109943985939,0.02131255343556404,-0.050635926425457,0.010791038163006306,0.05426971614360809,0.01528649777173996,0.04637080803513527,-0.05281367897987366,-0.08114855736494064,-0.009264564141631126,-0.01334268506616354,-0.007071120664477348,-0.023140056058764458,0.03526195511221886,-0.01004662923514843,0.02984539605677128,-0.03346209600567818,0.00827813521027565,0.023775368928909302,0.02086527645587921,0.005940984934568405,0.020253930240869522,0.037852659821510315,-0.00824821088463068,-0.06005696952342987,0.08209788054227829,-0.053650133311748505,-0.052274055778980255,0.023900175467133522,-0.06769822537899017,-0.018379488959908485,-0.06739174574613571,0.048848435282707214,-0.0377672053873539,-0.015402794815599918,0.0029754824936389923,0.00042425841093063354,0.05360385775566101,0.040069639682769775,-0.07120008766651154,0.036733511835336685,0.03285791724920273,0.012289940379559994,0.007485165726393461,0.008629493415355682,0.013986872509121895,-0.009437701664865017,0.03269096091389656,0.01080939918756485,0.03477197512984276,0.0119005823507905,0.01277193520218134,0.00960540771484375,0.018557285889983177,0.021410908550024033,-0.009205465205013752,0.10743416845798492,0.014553372748196125,0.0015282147796824574,0.021745620295405388,0.009211239404976368,-0.03294062614440918,0.06467559188604355,-0.029617559164762497,0.02929513156414032,0.04939530789852142,-0.0773029774427414,0.03199261799454689,0.013101703487336636,-0.03461555391550064,-0.0197344608604908,-0.03600887581706047,0.019707268103957176,-0.0058029997162520885,0.03920265659689903,0.023910438641905785,0.009379005059599876,-0.03724730387330055,-0.02828381583094597,-0.004272105172276497,0.02310110814869404,-0.02423100546002388,0.004720867145806551,0.03783789649605751,-0.021045204252004623,0.0009837279794737697,0.005852638278156519,-0.03015046939253807,-0.0016515707829967141,0.01773558184504509,0.016349071636795998,0.015176134184002876,-0.027231907472014427,0.07339980453252792,-0.007861854508519173,-0.030090659856796265,-0.012582213617861271,-0.02280370518565178,-0.020448097959160805,-0.04432981088757515,0.009167902171611786,-0.008996894583106041,0.08968979865312576,-0.022268740460276604,-0.0005946332239545882,-0.04859330132603645,-0.0403703898191452,0.005980252753943205,-0.039975497871637344,0.03462127968668938,0.03768238052725792,0.008587424643337727,0.042604271322488785,0.043701861053705215,-0.0029956488870084286,0.08399393409490585,0.014425719156861305,0.01475810818374157,-0.0657278299331665,0.0036328299902379513,-0.05041094124317169,-0.011243702843785286,-0.03617185726761818,0.0011507081799209118,0.07343252003192902,-0.049860890954732895,0.010599498637020588,-0.007145163603127003,-0.0070752850733697414,0.024641510099172592,-0.031245093792676926,0.04057016596198082,0.04330792650580406,0.016687706112861633,-0.004028236959129572,-0.06115054711699486,0.0419430285692215,-0.009421069175004959,0.006803491152822971,0.03854034096002579,0.008531848900020123,-0.029509305953979492,-0.03765834867954254,-0.004426012746989727,-0.017240436747670174,-0.03096618875861168,-0.08137797564268112,-0.005762962158769369,-0.04144609719514847,0.024253372102975845,-0.020255450159311295,0.022006189450621605,0.030919088050723076,-0.020657075569033623,-0.0015994682908058167,-0.04476892948150635,-0.04596136882901192,0.025539718568325043,-0.024620166048407555,0.06132519617676735,-0.004317654762417078,-0.03372225910425186,-0.01288730837404728,0.008395850658416748,-0.007155019324272871,-0.062205664813518524,0.039218369871377945,0.005719584412872791,0.003596697701141238,0.009056870825588703,-0.0024107354693114758,0.0026955828070640564,0.01642618514597416,0.012062842957675457,-0.004898142069578171,-0.01695922389626503,-0.10491546243429184,0.03264636918902397,0.004270363133400679,-0.0034030659589916468,-0.01853378489613533,0.04663023352622986,-0.02165895886719227,0.012835333123803139,0.0005587668856605887,0.029453713446855545,0.02112620510160923,0.04794164001941681,0.021359898149967194,-0.077192023396492,-0.05715831741690636,-0.008627910166978836,0.034032706171274185,-0.06509143859148026,-0.025772009044885635,-0.035507746040821075,-0.07610161602497101,0.06425643712282181,0.04692956060171127,0.005897131282836199,-0.016400087624788284,0.056614428758621216,-0.022710638120770454,0.013081957586109638,-0.03469394892454147,-0.017735743895173073,0.018663763999938965,-0.023437462747097015,-0.005827980116009712,0.01918540894985199,0.02871389500796795,0.014507616870105267,0.02668638713657856,0.005654340609908104,0.01385321281850338,-0.03765895217657089,-0.03065965510904789,0.026716114953160286,-0.009338759817183018,0.0818062573671341,0.015309881418943405,0.020493008196353912,0.005935792811214924,0.010121149942278862,-0.05945850536227226,-0.035773418843746185,-0.0030082473531365395,0.0064165955409407616,0.038671206682920456,0.012969943694770336,0.04602924734354019,-0.00412684166803956,-0.0037353429943323135,0.0033368368167430162,-0.09982246160507202,-0.01633949764072895,-0.07469795644283295,0.04621294513344765,-0.016545748338103294,-0.024122895672917366,-0.029157016426324844,0.002973530674353242,-0.012847444973886013,-0.03193506598472595,0.010988925583660603,-0.0001490041904617101,-0.001652829349040985,0.017651749774813652,-0.02567797154188156,-0.029439454898238182,0.09073764830827713,0.0004115685005672276,-0.012676669284701347,-0.01128370501101017,-0.000370256369933486,0.052825286984443665,0.05070165544748306,0.07241224497556686,0.06404303014278412,-0.048753466457128525,-0.02379174903035164,0.05469905957579613,0.009634857065975666,0.05907449126243591,0.03677137941122055,0.00744250463321805,0.0031389992218464613,-0.01795799657702446,0.06749670952558517,-0.0015844362787902355,0.054825711995363235,-0.018483951687812805,0.037765633314847946,0.023779628798365593,0.017312685027718544,0.002258281921967864,0.008110789582133293,-0.0008919766987673938,-0.013866611756384373,0.015849942341446877,0.05676309019327164,-0.03832289204001427,0.07693179696798325,-0.028529774397611618,-0.0001412767160218209,-0.04297492280602455,-0.03351590037345886,-0.031374264508485794,-0.13094232976436615,0.01133460272103548,-0.01789669319987297,-0.019518734887242317,0.02413765899837017,0.02299748919904232,-0.013040685094892979,0.024676192551851273,-0.04997923970222473,0.016337042674422264,0.014981944113969803,0.012533058412373066,0.017800945788621902,0.017442118376493454,0.036883171647787094,0.01959260180592537,0.018256159499287605,-0.04656999558210373,0.06620308756828308,0.012096387334167957,-0.06311937421560287,0.0008188642095774412,-0.04279585927724838,-0.052001263946294785,-0.01031493116170168,-0.029578160494565964,0.04470447823405266,0.04445526748895645,-0.0320054292678833,-0.014685191214084625,0.008519027382135391,-0.015517713502049446,0.045285485684871674,0.050671011209487915,0.03292492777109146,-0.0064353253692388535,0.0464107021689415,-0.04059424251317978,0.019475575536489487,0.03257635235786438,-0.009491966105997562,0.029564695432782173,-0.03029668517410755,0.022920453920960426,-0.0477965883910656,0.053228382021188736,-0.11522278934717178,0.012075637467205524,-0.050417616963386536,0.00002647708788572345,0.014741631224751472,-0.012606440111994743,-0.009558933787047863,0.037208206951618195,0.04453073441982269,-0.023748505860567093,-0.010112144984304905,0.09604596346616745,-0.004257655702531338,0.06967103481292725,0.0008524648146703839,0.004295794293284416,0.010783711448311806,-0.015526728704571724,-0.033030424267053604,-0.014285720884799957,-0.005583920981734991,-0.022049376741051674,-0.04871677607297897,0.018884191289544106,-0.010020376183092594,-0.01354421116411686,0.018016168847680092,0.01527385413646698,-0.10621770471334457,-0.01764703541994095,0.007838761433959007,-0.061750221997499466,-0.06584732979536057,0.0016823436599224806,-0.01016293279826641,-0.043315205723047256,0.021068260073661804,-0.0007196655496954918,-0.00010984798427671194,-0.028880853205919266,0.057750824838876724,0.048275578767061234,-0.006997573655098677,-0.0235467329621315,0.014244607649743557,0.011707918718457222,0.01154556404799223,0.007944359444081783,0.03325006365776062,0.028642404824495316,0.029782894998788834,-0.002223856747150421,-0.028805125504732132,-0.024469908326864243,-0.061848532408475876,-0.040755268186330795,0.012058792635798454,-0.04323491081595421,-0.011828112415969372,0.04388768970966339,0.030879711732268333,0.14011730253696442,-0.012673418037593365,-0.01868358813226223,0.059406835585832596,0.004133507143706083,-0.02979276143014431,0.024346670135855675,-0.04684308543801308,-0.076165109872818,0.015369579195976257,0.0837886780500412,0.03861568123102188,0.02638271264731884,-0.024149693548679352,0.02483704872429371,0.04091053083539009,-0.007668360136449337,-0.022835619747638702,-0.06054569408297539,0.02628151699900627,-0.006313515827059746,-0.04860810935497284,0.01932680793106556,-0.025893177837133408,0.06924602389335632,0.017859015613794327,-0.05514456704258919,0.022852523252367973,0.005145934876054525,0.08873318135738373,-0.005471128970384598,0.02260693535208702,-0.012231948785483837,0.0036385641433298588,0.04240681231021881,-0.025327855721116066,-0.01356860063970089,0.007045298349112272,0.002800549380481243,0.03598874434828758,0.031885869801044464,-0.06740649044513702,-0.018127476796507835,-0.017649613320827484,0.00889135804027319,-0.017945438623428345,-0.02995796874165535,0.022048521786928177,0.007912971079349518,0.03513737767934799,-0.011388422921299934,0.01964542455971241,-0.03563198447227478,0.020365454256534576,-0.003631471423432231,-0.01991124078631401,0.0637875571846962,-0.16364814341068268,0.014611947350203991,-0.03038313239812851,-7.045409880309846e-33,-0.08174257725477219,-0.025399425998330116,-0.015793660655617714,-0.0759335309267044,0.0015685985563322902,-0.06520318239927292,0.016335144639015198,-0.012087897397577763,-0.05693627893924713,0.029747305437922478,0.0015706232516095042,-0.0015218069311231375,0.027963988482952118,0.018021343275904655,0.03991350904107094,-0.03714389353990555,-0.005204265471547842,-0.018326809629797935,-0.015222428366541862,0.008328725583851337,-0.012519166804850101,-0.003971979022026062,0.026173755526542664,-0.08598822355270386,0.007664788048714399,0.01931283250451088,0.030525987967848778,0.0004242068389430642,0.013914371840655804,-0.010523669421672821,0.010960545390844345,-0.05051612854003906,-0.012185468338429928,-0.04732353612780571,0.0036590369418263435,0.014714849181473255,-0.030472641810774803,-0.040321193635463715,-0.0013622406404465437,-0.033408377319574356,0.03278130292892456,0.03476804122328758,-0.02416762337088585,-0.00007256549724843353,0.02306089736521244,-0.025448644533753395,0.004338673781603575,-0.013990087434649467,-0.028449077159166336,-0.035159774124622345,0.021404488012194633,-0.009255940094590187,-0.015057984739542007,0.024273430928587914,-0.06846962869167328,0.09956718981266022,0.03885667026042938,0.02806752361357212,0.013181760907173157,-0.010067537426948547,0.013073766604065895,0.012548615224659443,-0.025890816003084183,0.04619773477315903,0.006577376741915941,-0.009916692040860653,0.012037216685712337,-0.02672712877392769,-0.05429976060986519,-0.0020881753880530596,-0.047709088772535324,-0.005192157346755266,0.015834184363484383,0.004741241689771414,0.010221967473626137,0.03856309875845909,-0.01065683364868164,0.01084650494158268,0.0070105488412082195,-0.007752193603664637,0.0036475518718361855,-0.01807665079832077,0.02376442775130272,0.0018436092650517821,0.006784095894545317,-0.006654959637671709,-0.014827577397227287,-0.005778071004897356,0.00751569913700223,-0.021275751292705536,-0.07868174463510513,0.010812589898705482,0.014747154898941517,0.0077260383404791355,-0.0609111562371254,-0.034070324152708054,0.050171129405498505,0.03476060926914215,-0.010713687166571617,0.02866428531706333,0.016922032460570335,0.08377090841531754,-0.04042167216539383,-0.031885940581560135,-0.03145420923829079,0.03979464992880821,-0.039030976593494415,0.020625809207558632,-0.04506150633096695,-0.011714491061866283,-0.003666073549538851,-0.0028818876016885042,-0.035403668880462646,0.04735827073454857,-0.004866992123425007,-0.0037827901542186737,0.04043952375650406,-0.01139079686254263,-0.03314998745918274,0.02157934568822384,0.006785744801163673,-0.04967333376407623,0.00910490658134222,0.017581069841980934,-0.006214476190507412,-0.055813685059547424,-0.020800789818167686,-0.06436484307050705,0.027906235307455063,0.0775691419839859,0.010928977280855179,0.040057502686977386,2.906600684582372e-7,0.03433328866958618,-0.028883857652544975,-0.029545502737164497,0.03368387743830681,0.03441229462623596,0.02161889150738716,0.009734339080750942,0.031063798815011978,0.0814608633518219,-0.008434101939201355,-0.030750900506973267,-0.03564950078725815,0.03422742709517479,0.06822145730257034,0.029452171176671982,-0.08659426867961884,0.017143065109848976,0.005640231538563967,-0.021581437438726425,0.04861670732498169,0.03566786274313927,0.04329639673233032,0.020430663600564003,0.021826980635523796,0.001828524051234126,0.004649017006158829,-0.004124623257666826,-0.02191721275448799,-0.020943542942404747,0.01609855890274048,0.005467026494443417,-0.025958910584449768,0.019459962844848633,-0.007737760432064533,-0.023859770968556404,-0.019089162349700928,-0.0059316111728549,0.022043192759156227,0.0421818345785141,-0.036963239312171936,-0.03371463343501091,-0.023247523233294487,0.0126142967492342,0.019554683938622475,0.06033540517091751,0.02983059175312519,0.0197968278080225,0.003537148470059037,-0.04444568604230881,-0.05643682926893234,0.01588098518550396,-0.008340190164744854,-0.024271216243505478,-0.03929067403078079,0.045864127576351166,-0.012741888873279095,-0.016141099855303764,0.05502196401357651,0.032021407037973404,-0.008734962902963161,-0.01568848267197609,-0.06293540447950363,0.03427371010184288,-0.0006828843033872545,-0.00430593965575099,0.022150781005620956,-0.026674628257751465,2.9201573265942168e-34,0.024917416274547577,0.029006140306591988,0.01106565073132515,0.01915171556174755,0.03383432701230049,-0.024050232023000717,0.01919652335345745,-0.009114904329180717,0.027299119159579277,-0.0444239005446434,-0.002255816478282213]'
SET
  @EmbeddingModelID_d181d21344e2 = '1D45AA65-41EC-4572-9ECD-AB2826C9B059'
SET
  @Reusable_d181d21344e2 = 0
SET
  @IsMaterialized_d181d21344e2 = 0
EXEC [${mjSchema}].spCreateQuery @ID = @ID_d181d21344e2,
  @Name = @Name_d181d21344e2,
  @CategoryID = @CategoryID_d181d21344e2,
  @UserQuestion = @UserQuestion_d181d21344e2,
  @Description = @Description_d181d21344e2,
  @SQL = @SQL_d181d21344e2,
  @TechnicalDescription = @TechnicalDescription_d181d21344e2,
  @OriginalSQL = @OriginalSQL_d181d21344e2,
  @OriginalSQL_Clear = 1,
  @Feedback = @Feedback_d181d21344e2,
  @Feedback_Clear = 1,
  @Status = @Status_d181d21344e2,
  @QualityRank = @QualityRank_d181d21344e2,
  @ExecutionCostRank = @ExecutionCostRank_d181d21344e2,
  @UsesTemplate = @UsesTemplate_d181d21344e2,
  @AuditQueryRuns = @AuditQueryRuns_d181d21344e2,
  @CacheEnabled = @CacheEnabled_d181d21344e2,
  @CacheTTLMinutes = @CacheTTLMinutes_d181d21344e2,
  @CacheTTLMinutes_Clear = 1,
  @CacheMaxSize = @CacheMaxSize_d181d21344e2,
  @CacheMaxSize_Clear = 1,
  @EmbeddingVector = @EmbeddingVector_d181d21344e2,
  @EmbeddingModelID = @EmbeddingModelID_d181d21344e2,
  @CacheValidationSQL = @CacheValidationSQL_d181d21344e2,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_d181d21344e2,
  @Reusable = @Reusable_d181d21344e2,
  @ExternalDataSourceID = @ExternalDataSourceID_d181d21344e2,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_d181d21344e2;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_2218a8282d3a UNIQUEIDENTIFIER,
@QueryID_2218a8282d3a UNIQUEIDENTIFIER,
@Name_2218a8282d3a NVARCHAR(255),
@Type_2218a8282d3a NVARCHAR(50),
@IsRequired_2218a8282d3a BIT,
@DefaultValue_2218a8282d3a NVARCHAR(MAX),
@Description_2218a8282d3a NVARCHAR(MAX),
@SampleValue_2218a8282d3a NVARCHAR(MAX),
@ValidationFilters_2218a8282d3a NVARCHAR(MAX),
@DetectionMethod_2218a8282d3a NVARCHAR(50),
@AutoDetectConfidenceScore_2218a8282d3a DECIMAL(3, 2)
SET
  @ID_2218a8282d3a = 'bea65f20-dcab-41e0-aeb7-e4d0a1915ef6'
SET
  @QueryID_2218a8282d3a = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_2218a8282d3a = N'FormID'
SET
  @Type_2218a8282d3a = N'string'
SET
  @IsRequired_2218a8282d3a = 1
SET
  @Description_2218a8282d3a = N'Unique identifier of the Form to filter responses for.'
SET
  @SampleValue_2218a8282d3a = N'123e4567-e89b-12d3-a456-426614174000'
SET
  @DetectionMethod_2218a8282d3a = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_2218a8282d3a,
  @QueryID = @QueryID_2218a8282d3a,
  @Name = @Name_2218a8282d3a,
  @Type = @Type_2218a8282d3a,
  @IsRequired = @IsRequired_2218a8282d3a,
  @DefaultValue = @DefaultValue_2218a8282d3a,
  @DefaultValue_Clear = 1,
  @Description = @Description_2218a8282d3a,
  @SampleValue = @SampleValue_2218a8282d3a,
  @ValidationFilters = @ValidationFilters_2218a8282d3a,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_2218a8282d3a,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_2218a8282d3a,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_006cd088d2bc UNIQUEIDENTIFIER,
@QueryID_006cd088d2bc UNIQUEIDENTIFIER,
@Name_006cd088d2bc NVARCHAR(255),
@Type_006cd088d2bc NVARCHAR(50),
@IsRequired_006cd088d2bc BIT,
@DefaultValue_006cd088d2bc NVARCHAR(MAX),
@Description_006cd088d2bc NVARCHAR(MAX),
@SampleValue_006cd088d2bc NVARCHAR(MAX),
@ValidationFilters_006cd088d2bc NVARCHAR(MAX),
@DetectionMethod_006cd088d2bc NVARCHAR(50),
@AutoDetectConfidenceScore_006cd088d2bc DECIMAL(3, 2)
SET
  @ID_006cd088d2bc = 'f4d480d6-6816-45df-baf2-1b51ff311013'
SET
  @QueryID_006cd088d2bc = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_006cd088d2bc = N'FormVersionID'
SET
  @Type_006cd088d2bc = N'string'
SET
  @IsRequired_006cd088d2bc = 0
SET
  @Description_006cd088d2bc = N'Optional unique identifier of the specific Form Version to narrow down response counts.'
SET
  @SampleValue_006cd088d2bc = N'987f6543-e21b-12d3-a456-426614174000'
SET
  @DetectionMethod_006cd088d2bc = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_006cd088d2bc,
  @QueryID = @QueryID_006cd088d2bc,
  @Name = @Name_006cd088d2bc,
  @Type = @Type_006cd088d2bc,
  @IsRequired = @IsRequired_006cd088d2bc,
  @DefaultValue = @DefaultValue_006cd088d2bc,
  @DefaultValue_Clear = 1,
  @Description = @Description_006cd088d2bc,
  @SampleValue = @SampleValue_006cd088d2bc,
  @ValidationFilters = @ValidationFilters_006cd088d2bc,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_006cd088d2bc,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_006cd088d2bc,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_dd62b3e3221d UNIQUEIDENTIFIER,
@QueryID_dd62b3e3221d UNIQUEIDENTIFIER,
@Name_dd62b3e3221d NVARCHAR(255),
@Description_dd62b3e3221d NVARCHAR(MAX),
@Sequence_dd62b3e3221d INT,
@SQLBaseType_dd62b3e3221d NVARCHAR(50),
@SQLFullType_dd62b3e3221d NVARCHAR(100),
@SourceEntityID_dd62b3e3221d UNIQUEIDENTIFIER,
@SourceFieldName_dd62b3e3221d NVARCHAR(255),
@IsComputed_dd62b3e3221d BIT,
@ComputationDescription_dd62b3e3221d NVARCHAR(MAX),
@IsSummary_dd62b3e3221d BIT,
@SummaryDescription_dd62b3e3221d NVARCHAR(MAX),
@DetectionMethod_dd62b3e3221d NVARCHAR(50),
@AutoDetectConfidenceScore_dd62b3e3221d DECIMAL(3, 2)
SET
  @ID_dd62b3e3221d = '022b8528-abc3-49b6-ab88-a99f68857ca9'
SET
  @QueryID_dd62b3e3221d = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_dd62b3e3221d = N'QuestionID'
SET
  @Description_dd62b3e3221d = N'Unique identifier for the form question'
SET
  @Sequence_dd62b3e3221d = 1
SET
  @SQLBaseType_dd62b3e3221d = N'nvarchar'
SET
  @SQLFullType_dd62b3e3221d = N'nvarchar(MAX)'
SET
  @SourceFieldName_dd62b3e3221d = N'QuestionID'
SET
  @IsComputed_dd62b3e3221d = 0
SET
  @IsSummary_dd62b3e3221d = 0
SET
  @DetectionMethod_dd62b3e3221d = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_dd62b3e3221d,
  @QueryID = @QueryID_dd62b3e3221d,
  @Name = @Name_dd62b3e3221d,
  @Description = @Description_dd62b3e3221d,
  @Sequence = @Sequence_dd62b3e3221d,
  @SQLBaseType = @SQLBaseType_dd62b3e3221d,
  @SQLFullType = @SQLFullType_dd62b3e3221d,
  @SourceEntityID = @SourceEntityID_dd62b3e3221d,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_dd62b3e3221d,
  @IsComputed = @IsComputed_dd62b3e3221d,
  @ComputationDescription = @ComputationDescription_dd62b3e3221d,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_dd62b3e3221d,
  @SummaryDescription = @SummaryDescription_dd62b3e3221d,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_dd62b3e3221d,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dd62b3e3221d,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_f1e787564b0c UNIQUEIDENTIFIER,
@QueryID_f1e787564b0c UNIQUEIDENTIFIER,
@Name_f1e787564b0c NVARCHAR(255),
@Description_f1e787564b0c NVARCHAR(MAX),
@Sequence_f1e787564b0c INT,
@SQLBaseType_f1e787564b0c NVARCHAR(50),
@SQLFullType_f1e787564b0c NVARCHAR(100),
@SourceEntityID_f1e787564b0c UNIQUEIDENTIFIER,
@SourceFieldName_f1e787564b0c NVARCHAR(255),
@IsComputed_f1e787564b0c BIT,
@ComputationDescription_f1e787564b0c NVARCHAR(MAX),
@IsSummary_f1e787564b0c BIT,
@SummaryDescription_f1e787564b0c NVARCHAR(MAX),
@DetectionMethod_f1e787564b0c NVARCHAR(50),
@AutoDetectConfidenceScore_f1e787564b0c DECIMAL(3, 2)
SET
  @ID_f1e787564b0c = '95f67322-cc7c-4d26-b68d-4441148c03a4'
SET
  @QueryID_f1e787564b0c = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_f1e787564b0c = N'AnsweredResponses'
SET
  @Description_f1e787564b0c = N'Count of distinct complete responses that provided an answer for this question and value kind'
SET
  @Sequence_f1e787564b0c = 2
SET
  @SQLBaseType_f1e787564b0c = N'nvarchar'
SET
  @SQLFullType_f1e787564b0c = N'nvarchar(MAX)'
SET
  @SourceFieldName_f1e787564b0c = N'AnsweredResponses'
SET
  @IsComputed_f1e787564b0c = 0
SET
  @ComputationDescription_f1e787564b0c = N'COUNT(DISTINCT v.ResponseID) aggregated from answered inner CTE'
SET
  @IsSummary_f1e787564b0c = 1
SET
  @DetectionMethod_f1e787564b0c = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_f1e787564b0c,
  @QueryID = @QueryID_f1e787564b0c,
  @Name = @Name_f1e787564b0c,
  @Description = @Description_f1e787564b0c,
  @Sequence = @Sequence_f1e787564b0c,
  @SQLBaseType = @SQLBaseType_f1e787564b0c,
  @SQLFullType = @SQLFullType_f1e787564b0c,
  @SourceEntityID = @SourceEntityID_f1e787564b0c,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_f1e787564b0c,
  @IsComputed = @IsComputed_f1e787564b0c,
  @ComputationDescription = @ComputationDescription_f1e787564b0c,
  @IsSummary = @IsSummary_f1e787564b0c,
  @SummaryDescription = @SummaryDescription_f1e787564b0c,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_f1e787564b0c,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_f1e787564b0c,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_364d753d9dd8 UNIQUEIDENTIFIER,
@QueryID_364d753d9dd8 UNIQUEIDENTIFIER,
@Name_364d753d9dd8 NVARCHAR(255),
@Description_364d753d9dd8 NVARCHAR(MAX),
@Sequence_364d753d9dd8 INT,
@SQLBaseType_364d753d9dd8 NVARCHAR(50),
@SQLFullType_364d753d9dd8 NVARCHAR(100),
@SourceEntityID_364d753d9dd8 UNIQUEIDENTIFIER,
@SourceFieldName_364d753d9dd8 NVARCHAR(255),
@IsComputed_364d753d9dd8 BIT,
@ComputationDescription_364d753d9dd8 NVARCHAR(MAX),
@IsSummary_364d753d9dd8 BIT,
@SummaryDescription_364d753d9dd8 NVARCHAR(MAX),
@DetectionMethod_364d753d9dd8 NVARCHAR(50),
@AutoDetectConfidenceScore_364d753d9dd8 DECIMAL(3, 2)
SET
  @ID_364d753d9dd8 = '81bfacce-a12f-4d67-b1aa-fb1261a810b1'
SET
  @QueryID_364d753d9dd8 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_364d753d9dd8 = N'ValueKind'
SET
  @Description_364d753d9dd8 = N'The data type classification of the answer value (e.g., Text, Numeric, Boolean, Date)'
SET
  @Sequence_364d753d9dd8 = 3
SET
  @SQLBaseType_364d753d9dd8 = N'nvarchar'
SET
  @SQLFullType_364d753d9dd8 = N'nvarchar(MAX)'
SET
  @SourceFieldName_364d753d9dd8 = N'ValueKind'
SET
  @IsComputed_364d753d9dd8 = 0
SET
  @ComputationDescription_364d753d9dd8 = N'Literal value indicating kind of choice/value extracted'
SET
  @IsSummary_364d753d9dd8 = 0
SET
  @DetectionMethod_364d753d9dd8 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_364d753d9dd8,
  @QueryID = @QueryID_364d753d9dd8,
  @Name = @Name_364d753d9dd8,
  @Description = @Description_364d753d9dd8,
  @Sequence = @Sequence_364d753d9dd8,
  @SQLBaseType = @SQLBaseType_364d753d9dd8,
  @SQLFullType = @SQLFullType_364d753d9dd8,
  @SourceEntityID = @SourceEntityID_364d753d9dd8,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_364d753d9dd8,
  @IsComputed = @IsComputed_364d753d9dd8,
  @ComputationDescription = @ComputationDescription_364d753d9dd8,
  @IsSummary = @IsSummary_364d753d9dd8,
  @SummaryDescription = @SummaryDescription_364d753d9dd8,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_364d753d9dd8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_364d753d9dd8,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_30223415cf52 UNIQUEIDENTIFIER,
@QueryID_30223415cf52 UNIQUEIDENTIFIER,
@Name_30223415cf52 NVARCHAR(255),
@Description_30223415cf52 NVARCHAR(MAX),
@Sequence_30223415cf52 INT,
@SQLBaseType_30223415cf52 NVARCHAR(50),
@SQLFullType_30223415cf52 NVARCHAR(100),
@SourceEntityID_30223415cf52 UNIQUEIDENTIFIER,
@SourceFieldName_30223415cf52 NVARCHAR(255),
@IsComputed_30223415cf52 BIT,
@ComputationDescription_30223415cf52 NVARCHAR(MAX),
@IsSummary_30223415cf52 BIT,
@SummaryDescription_30223415cf52 NVARCHAR(MAX),
@DetectionMethod_30223415cf52 NVARCHAR(50),
@AutoDetectConfidenceScore_30223415cf52 DECIMAL(3, 2)
SET
  @ID_30223415cf52 = '534f137d-b9bd-46ac-86bf-a8dd8fbdf252'
SET
  @QueryID_30223415cf52 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_30223415cf52 = N'Value'
SET
  @Description_30223415cf52 = N'String representation of the chosen answer value'
SET
  @Sequence_30223415cf52 = 4
SET
  @SQLBaseType_30223415cf52 = N'nvarchar'
SET
  @SQLFullType_30223415cf52 = N'nvarchar(MAX)'
SET
  @SourceFieldName_30223415cf52 = N'Value'
SET
  @IsComputed_30223415cf52 = 0
SET
  @ComputationDescription_30223415cf52 = N'MAX(v.Value) inside binary conversion grouping to maintain exact casing and spacing distinctness'
SET
  @IsSummary_30223415cf52 = 1
SET
  @DetectionMethod_30223415cf52 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_30223415cf52,
  @QueryID = @QueryID_30223415cf52,
  @Name = @Name_30223415cf52,
  @Description = @Description_30223415cf52,
  @Sequence = @Sequence_30223415cf52,
  @SQLBaseType = @SQLBaseType_30223415cf52,
  @SQLFullType = @SQLFullType_30223415cf52,
  @SourceEntityID = @SourceEntityID_30223415cf52,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_30223415cf52,
  @IsComputed = @IsComputed_30223415cf52,
  @ComputationDescription = @ComputationDescription_30223415cf52,
  @IsSummary = @IsSummary_30223415cf52,
  @SummaryDescription = @SummaryDescription_30223415cf52,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_30223415cf52,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_30223415cf52,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_564fc4089e39 UNIQUEIDENTIFIER,
@QueryID_564fc4089e39 UNIQUEIDENTIFIER,
@Name_564fc4089e39 NVARCHAR(255),
@Description_564fc4089e39 NVARCHAR(MAX),
@Sequence_564fc4089e39 INT,
@SQLBaseType_564fc4089e39 NVARCHAR(50),
@SQLFullType_564fc4089e39 NVARCHAR(100),
@SourceEntityID_564fc4089e39 UNIQUEIDENTIFIER,
@SourceFieldName_564fc4089e39 NVARCHAR(255),
@IsComputed_564fc4089e39 BIT,
@ComputationDescription_564fc4089e39 NVARCHAR(MAX),
@IsSummary_564fc4089e39 BIT,
@SummaryDescription_564fc4089e39 NVARCHAR(MAX),
@DetectionMethod_564fc4089e39 NVARCHAR(50),
@AutoDetectConfidenceScore_564fc4089e39 DECIMAL(3, 2)
SET
  @ID_564fc4089e39 = '511dc56e-323d-4187-951b-a53da3d1245e'
SET
  @QueryID_564fc4089e39 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_564fc4089e39 = N'NumericValue'
SET
  @Description_564fc4089e39 = N'The numeric value if the answer is of Numeric kind, otherwise null'
SET
  @Sequence_564fc4089e39 = 5
SET
  @SQLBaseType_564fc4089e39 = N'nvarchar'
SET
  @SQLFullType_564fc4089e39 = N'nvarchar(MAX)'
SET
  @SourceFieldName_564fc4089e39 = N'NumericValue'
SET
  @IsComputed_564fc4089e39 = 0
SET
  @IsSummary_564fc4089e39 = 0
SET
  @DetectionMethod_564fc4089e39 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_564fc4089e39,
  @QueryID = @QueryID_564fc4089e39,
  @Name = @Name_564fc4089e39,
  @Description = @Description_564fc4089e39,
  @Sequence = @Sequence_564fc4089e39,
  @SQLBaseType = @SQLBaseType_564fc4089e39,
  @SQLFullType = @SQLFullType_564fc4089e39,
  @SourceEntityID = @SourceEntityID_564fc4089e39,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_564fc4089e39,
  @IsComputed = @IsComputed_564fc4089e39,
  @ComputationDescription = @ComputationDescription_564fc4089e39,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_564fc4089e39,
  @SummaryDescription = @SummaryDescription_564fc4089e39,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_564fc4089e39,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_564fc4089e39,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_20d599946e4f UNIQUEIDENTIFIER,
@QueryID_20d599946e4f UNIQUEIDENTIFIER,
@Name_20d599946e4f NVARCHAR(255),
@Description_20d599946e4f NVARCHAR(MAX),
@Sequence_20d599946e4f INT,
@SQLBaseType_20d599946e4f NVARCHAR(50),
@SQLFullType_20d599946e4f NVARCHAR(100),
@SourceEntityID_20d599946e4f UNIQUEIDENTIFIER,
@SourceFieldName_20d599946e4f NVARCHAR(255),
@IsComputed_20d599946e4f BIT,
@ComputationDescription_20d599946e4f NVARCHAR(MAX),
@IsSummary_20d599946e4f BIT,
@SummaryDescription_20d599946e4f NVARCHAR(MAX),
@DetectionMethod_20d599946e4f NVARCHAR(50),
@AutoDetectConfidenceScore_20d599946e4f DECIMAL(3, 2)
SET
  @ID_20d599946e4f = '3488536d-ad34-4892-b0a4-3a06b5b42492'
SET
  @QueryID_20d599946e4f = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_20d599946e4f = N'ValueCount'
SET
  @Description_20d599946e4f = N'Total number of times this specific value was chosen for the question'
SET
  @Sequence_20d599946e4f = 6
SET
  @SQLBaseType_20d599946e4f = N'nvarchar'
SET
  @SQLFullType_20d599946e4f = N'nvarchar(MAX)'
SET
  @SourceFieldName_20d599946e4f = N'ValueCount'
SET
  @IsComputed_20d599946e4f = 0
SET
  @ComputationDescription_20d599946e4f = N'COUNT(*) aggregate counting instances of the specific answer value'
SET
  @IsSummary_20d599946e4f = 1
SET
  @DetectionMethod_20d599946e4f = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_20d599946e4f,
  @QueryID = @QueryID_20d599946e4f,
  @Name = @Name_20d599946e4f,
  @Description = @Description_20d599946e4f,
  @Sequence = @Sequence_20d599946e4f,
  @SQLBaseType = @SQLBaseType_20d599946e4f,
  @SQLFullType = @SQLFullType_20d599946e4f,
  @SourceEntityID = @SourceEntityID_20d599946e4f,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_20d599946e4f,
  @IsComputed = @IsComputed_20d599946e4f,
  @ComputationDescription = @ComputationDescription_20d599946e4f,
  @IsSummary = @IsSummary_20d599946e4f,
  @SummaryDescription = @SummaryDescription_20d599946e4f,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_20d599946e4f,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_20d599946e4f,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_6bec3f521391 UNIQUEIDENTIFIER,
@QueryID_6bec3f521391 UNIQUEIDENTIFIER,
@EntityID_6bec3f521391 UNIQUEIDENTIFIER,
@DetectionMethod_6bec3f521391 NVARCHAR(50),
@AutoDetectConfidenceScore_6bec3f521391 DECIMAL(3, 2)
SET
  @ID_6bec3f521391 = 'fa458b97-f847-4d26-b1e9-c605fc3df2ed'
SET
  @QueryID_6bec3f521391 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @EntityID_6bec3f521391 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_6bec3f521391 = N'AI'
SET
  @AutoDetectConfidenceScore_6bec3f521391 = 1
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_6bec3f521391,
  @QueryID = @QueryID_6bec3f521391,
  @EntityID = @EntityID_6bec3f521391,
  @DetectionMethod = @DetectionMethod_6bec3f521391,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_6bec3f521391;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ID_4729458b1444 UNIQUEIDENTIFIER,
@Name_4729458b1444 NVARCHAR(255),
@CategoryID_4729458b1444 UNIQUEIDENTIFIER,
@UserQuestion_4729458b1444 NVARCHAR(MAX),
@Description_4729458b1444 NVARCHAR(MAX),
@SQL_4729458b1444 NVARCHAR(MAX),
@TechnicalDescription_4729458b1444 NVARCHAR(MAX),
@OriginalSQL_4729458b1444 NVARCHAR(MAX),
@Feedback_4729458b1444 NVARCHAR(MAX),
@Status_4729458b1444 NVARCHAR(15),
@QualityRank_4729458b1444 INT,
@ExecutionCostRank_4729458b1444 INT,
@UsesTemplate_4729458b1444 BIT,
@AuditQueryRuns_4729458b1444 BIT,
@CacheEnabled_4729458b1444 BIT,
@CacheTTLMinutes_4729458b1444 INT,
@CacheMaxSize_4729458b1444 INT,
@EmbeddingVector_4729458b1444 NVARCHAR(MAX),
@EmbeddingModelID_4729458b1444 UNIQUEIDENTIFIER,
@CacheValidationSQL_4729458b1444 NVARCHAR(MAX),
@SQLDialectID_4729458b1444 UNIQUEIDENTIFIER,
@Reusable_4729458b1444 BIT,
@ExternalDataSourceID_4729458b1444 UNIQUEIDENTIFIER,
@IsMaterialized_4729458b1444 BIT
SET
  @ID_4729458b1444 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_4729458b1444 = N'Forms: Page Funnel Reach'
SET
  @CategoryID_4729458b1444 = '38044DBA-A933-4A8D-A5B6-25EC82210B93'
SET
  @UserQuestion_4729458b1444 = N'How far through this form do respondents get, page by page?'
SET
  @Description_4729458b1444 = N'Per page of the form''s published layout, how many responses (any status) answered at least one of its questions, with the page''s question types so pages that ask nothing can be dropped from the funnel.'
SET
  @SQL_4729458b1444 = N'-- Forms: Page Funnel Reach — per page, how many responses answered at least one of its questions
-- (FormReportingEngine, Forms.GetResponseSummary funnel). One row per page of the labelling version.
--
-- The page layout comes from the published SNAPSHOT (FormVersion.DefinitionSnapshot, pages[] and
-- their questions[]), not from the live FormPage/FormQuestion rows, which an author may have edited
-- since. The labelling version is FormVersionID when given, else the form''s one Published version.
--
-- Responses: every STATUS counts, deliberately: drop-off is a fact about the people who abandoned,
-- so excluding partials would measure only the respondents who never dropped off. FormVersionID
-- also narrows the responses to that version; absent, every version''s responses count, mapped onto
-- the labelling version''s pages by QuestionID.
--
-- "Answered" means an answer row exists, as in forms-core-entities-server reporting/funnel.ts buildFunnel(). Pages with
-- no answerable question are returned with their QuestionTypes so the engine can drop them using
-- the contracts'' answerable-type table rather than a second copy of it here.
--
-- OPENJSON gets only a snapshot that already passed ISJSON: the guard is INSIDE the call
-- (CASE ... END yields NULL otherwise, and OPENJSON(NULL) returns no rows), because SQL Server
-- does not promise to filter rows before evaluating a CROSS APPLY, and OPENJSON throws on
-- invalid JSON.
WITH version AS (
    -- ORDER BY rather than resting on the one-Published-version invariant
    -- (UQ_FormVersion_OnePublishedPerForm) alone: TOP 1 without it is arbitrary by definition.
    SELECT TOP 1 v.DefinitionSnapshot
    FROM [__mj_BizAppsForms].[vwFormVersions] v
    WHERE v.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND v.ID = {{ FormVersionID | sqlString }}
    {% else %}
      AND v.Status = N''Published''
    {% endif %}
    ORDER BY v.VersionNumber DESC
),
pages AS (
    -- Every JSON_VALUE / OPENJSON input below is gated by its element type INSIDE the call
    -- (5 = object), for the same evaluation-order reason as the snapshot guard above: a stray
    -- non-object element yields NULLs and no rows instead of an error.
    SELECT
        JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, ''$.id'') AS PageID,
        JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, ''$.title'') AS Title,
        TRY_CONVERT(INT, JSON_VALUE(CASE WHEN p.[type] = 5 THEN p.[value] END, ''$.displayOrder'')) AS DisplayOrder,
        CASE WHEN p.[type] = 5 THEN p.[value] END AS PageJSON
    FROM version v
    CROSS APPLY OPENJSON(CASE WHEN ISJSON(v.DefinitionSnapshot) = 1 THEN v.DefinitionSnapshot END, ''$.pages'') p
    WHERE p.[type] = 5
),
page_questions AS (
    SELECT
        pg.PageID,
        TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(CASE WHEN q.[type] = 5 THEN q.[value] END, ''$.id'')) AS QuestionID,
        JSON_VALUE(CASE WHEN q.[type] = 5 THEN q.[value] END, ''$.type'') AS QuestionType
    FROM pages pg
    CROSS APPLY OPENJSON(pg.PageJSON, ''$.questions'') q
    WHERE q.[type] = 5
),
scoped AS (
    SELECT r.ID
    FROM [__mj_BizAppsForms].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
reached AS (
    SELECT pq.PageID, COUNT(DISTINCT a.ResponseID) AS ReachedCount
    FROM page_questions pq
    INNER JOIN [__mj_BizAppsForms].[vwFormResponseAnswers] a ON a.QuestionID = pq.QuestionID
    INNER JOIN scoped s ON s.ID = a.ResponseID
    GROUP BY pq.PageID
)
SELECT
    pg.PageID,
    pg.Title,
    pg.DisplayOrder,
    ISNULL(rc.ReachedCount, 0) AS ReachedCount,
    (SELECT STRING_AGG(pq.QuestionType, N'','') FROM page_questions pq WHERE pq.PageID = pg.PageID) AS QuestionTypes
FROM pages pg
LEFT JOIN reached rc ON rc.PageID = pg.PageID
ORDER BY pg.DisplayOrder, pg.PageID;
'
SET
  @TechnicalDescription_4729458b1444 = N'Nunjucks-parameterized. The page layout is read from FormVersion.DefinitionSnapshot (pages[].questions[]) of FormVersionID, or of the form''s highest-numbered Published version when it is absent; FormVersionID also narrows the responses. Every response status counts. Columns: PageID, Title, DisplayOrder, ReachedCount, QuestionTypes (comma-separated snapshot types).'
SET
  @Status_4729458b1444 = N'Approved'
SET
  @QualityRank_4729458b1444 = 8
SET
  @ExecutionCostRank_4729458b1444 = 3
SET
  @UsesTemplate_4729458b1444 = 1
SET
  @AuditQueryRuns_4729458b1444 = 0
SET
  @CacheEnabled_4729458b1444 = 0
SET
  @EmbeddingVector_4729458b1444 = N'[-0.045931246131658554,-0.0766233429312706,0.014551342464983463,0.013621511869132519,-0.024495305493474007,0.03600378334522247,-0.02464447356760502,0.00047885652747936547,-0.020140158012509346,0.053561434149742126,0.06483419239521027,-0.04005724564194679,0.019503971561789513,0.056019991636276245,0.00989580899477005,-0.01056082732975483,0.012398936785757542,0.00032716954592615366,-0.03039541468024254,0.029060475528240204,-0.01667114347219467,0.010315456427633762,-0.04972947761416435,0.007762782741338015,-0.02992234379053116,0.01665475219488144,-0.052354346960783005,0.016270043328404427,0.02347305789589882,-0.12041132152080536,0.026211382821202278,-0.007671165745705366,0.02087787538766861,-0.042080026119947433,0.000002267444187964429,-0.011268751695752144,0.01437060721218586,0.019489865750074387,-0.04080817475914955,-0.0106050418689847,0.027140261605381966,-0.044411495327949524,0.009327794425189495,0.02246556058526039,0.0139777148142457,0.009700515307486057,-0.02301602251827717,0.07691150903701782,-0.020347217097878456,-0.0007658344693481922,0.012356848455965519,-0.03833749517798424,0.014608985744416714,0.006886138115078211,0.1084384024143219,-0.03168535605072975,0.008401882834732533,-0.06333165615797043,0.018561996519565582,-0.05981099605560303,-0.03157401829957962,0.04154441878199577,0.04033266380429268,-0.03206050023436546,0.01471739076077938,0.018767431378364563,0.04019196331501007,-0.05997380614280701,0.013499215245246887,-0.02099151350557804,0.11385923624038696,0.022967686876654625,-0.03694508224725723,-0.07829709351062775,-0.034801091998815536,0.020409999415278435,-0.033354513347148895,-0.054172489792108536,-0.02120179682970047,-0.03243592754006386,-0.10539513826370239,0.021470822393894196,0.015160498209297657,-0.06263016909360886,-0.06522393226623535,0.017868224531412125,0.00037563193473033607,0.013047645799815655,-0.021532513201236725,0.07435925304889679,0.1350300908088684,0.006794531363993883,0.008718805387616158,-0.03547001630067825,0.004692926537245512,-0.01722061075270176,0.03270713984966278,-0.0441286675632,0.04814345762133598,-0.046644967049360275,0.030230693519115448,-0.03881699964404106,-0.03645982965826988,0.013567561283707619,0.10186701267957687,-0.03265905752778053,0.036553170531988144,-0.02422896958887577,-0.06884166598320007,0.0460418276488781,0.009883377701044083,-0.008772258646786213,-0.01113963034003973,0.02256917394697666,0.03813602775335312,-0.02943090908229351,-0.016178563237190247,-0.05407804995775223,0.03495027869939804,-0.012331157922744751,0.029026269912719727,-0.0008937723468989134,0.03543064370751381,-0.05921517312526703,-0.022688040509819984,0.04260770604014397,-0.052682727575302124,-0.01714496500790119,0.014829548075795174,-0.03400537744164467,-0.00013697889517061412,-0.07545936107635498,0.025016672909259796,-0.04028788581490517,-0.026810402050614357,0.006261172704398632,-0.015045134350657463,-0.026100218296051025,-0.05685305967926979,0.00814756378531456,0.055006999522447586,0.008971111848950386,-0.018218379467725754,0.0298960879445076,0.06453198939561844,0.002718569478020072,-0.013272419571876526,0.06833931058645248,-0.010690338909626007,0.03547654673457146,-0.016627656295895576,0.015434692613780499,0.11056826263666153,0.015244841575622559,0.04739827290177345,0.015734326094388962,0.027632195502519608,0.011818327009677887,0.01570429839193821,0.06436824053525925,0.01771305873990059,-0.05557366460561752,0.0029069529846310616,-0.01627998612821102,0.03336986526846886,0.011113696731626987,0.03351174667477608,0.03318585082888603,-0.024171190336346626,-0.061600930988788605,-0.05541890487074852,-0.041922468692064285,0.005215732380747795,0.018443094566464424,-0.007338990923017263,0.023874858394265175,0.09052424132823944,-0.037243012338876724,-0.00041021237848326564,0.029470771551132202,-0.03409602493047714,-0.011771353892982006,-0.09999124705791473,0.026894258335232735,-0.035400208085775375,-0.046416476368904114,0.015980595722794533,-0.03305546194314957,-0.004527107812464237,-0.0033813819754868746,-0.01400028821080923,0.01839159056544304,-0.018294723704457283,0.05983801186084747,-0.024644099175930023,0.023351037874817848,-0.03154714033007622,-0.009708888828754425,-0.007953139953315258,-0.027536462992429733,0.022180818021297455,0.03093564696609974,0.04487689211964607,0.03814944252371788,0.050965070724487305,-0.006760283838957548,-0.004874591249972582,0.006440354511141777,-0.0016971396980807185,0.01197067741304636,0.026986291632056236,0.03393678739666939,0.04696933925151825,0.05958082526922226,0.005832182243466377,0.046885378658771515,0.016823958605527878,-0.025545170530676842,-0.017444191500544548,0.011521006003022194,-0.00499524362385273,-0.09024963527917862,-0.01304376870393753,0.039509117603302,0.01657593809068203,-0.0014946716837584972,0.022421525791287422,0.03805261105298996,0.002753262175247073,0.037062376737594604,0.014983742497861385,0.01151553075760603,0.042184293270111084,0.0020937765948474407,0.021584177389740944,-0.06684413552284241,0.05783481523394585,0.06828851997852325,-0.030056653544306755,0.010121375322341919,0.035766586661338806,-0.026927553117275238,-0.01763012446463108,-0.015729475766420364,-0.014544237405061722,-0.054800845682621,-0.06267262995243073,0.003427453339099884,-0.025157727301120758,0.06288639456033707,-0.008310036733746529,0.02821238711476326,0.018535573035478592,0.00700338976457715,0.028115490451455116,-0.02380581572651863,-0.023794135078787804,0.03751864284276962,0.024998335167765617,0.00638252217322588,-0.013076581060886383,-0.07632104307413101,-0.04609200358390808,0.060868192464113235,-0.029414642602205276,-0.06434212625026703,0.018367424607276917,0.05881579592823982,-0.016913125291466713,0.007508864626288414,0.030014878138899803,-0.02093268372118473,-0.00239706807769835,-0.007579931989312172,0.019427254796028137,0.0029552499763667583,-0.026457834988832474,-0.007610071450471878,0.005331553053110838,-0.00271896505728364,0.011789601296186447,0.007648421451449394,-0.049316488206386566,0.01864759996533394,0.03354623168706894,0.00012175903248135,0.0538930669426918,-0.04405779764056206,0.015211600810289383,-0.02009616792201996,-0.036839354783296585,-0.026800300925970078,0.0064990627579391,-0.03559161350131035,0.00912690069526434,-0.045631565153598785,-0.08804060518741608,0.03601793944835663,0.05590114742517471,0.0059122866950929165,-0.01767083816230297,-0.016222989186644554,-0.03912850469350815,0.005728151183575392,-0.07347226142883301,-0.008878646418452263,-0.03197017312049866,-0.03259362280368805,0.006836940534412861,-0.0006375212105922401,0.032867010682821274,0.011128959245979786,-0.029859066009521484,-0.01710781827569008,-0.013574139215052128,-0.013095159083604813,0.04033011570572853,0.10345356911420822,-0.03711094334721565,0.059981197118759155,0.018462011590600014,0.03658805415034294,0.01865406148135662,0.004160542041063309,-0.008959776721894741,0.0033626954536885023,0.0192189309746027,0.03119656816124916,0.053414322435855865,-0.014774532057344913,0.016474340111017227,-0.020773962140083313,-0.048774752765893936,0.03978367894887924,-0.04074950888752937,-0.014621886424720287,-0.027978315949440002,0.04152330756187439,0.019719606265425682,0.03883427008986473,-0.06990377604961395,0.00600530905649066,-0.007544232532382011,-0.045360080897808075,0.03295145183801651,-0.07743240147829056,-0.025737211108207703,-0.008692200295627117,-0.03847300261259079,-0.05544599890708923,0.04721204191446304,0.030903290957212448,0.006756092421710491,0.008716174401342869,0.004307236988097429,-0.01292790099978447,-0.0057246871292591095,0.03241176903247833,0.04171984642744064,-0.041088882833719254,-0.014686466194689274,0.05147804692387581,-0.010061981156468391,0.010460250079631805,0.06463765352964401,-0.04121154919266701,0.016399532556533813,-0.022469881922006607,-0.0026083700358867645,0.0176346804946661,0.006792158354073763,-0.06273353844881058,0.01644977554678917,0.04363001883029938,0.0280379019677639,-0.04457216337323189,-0.014643105678260326,-0.024771487340331078,0.03681693598628044,0.006101435516029596,0.01558335218578577,-0.058292120695114136,0.08599903434515,-0.007315814029425383,0.04163212329149246,0.02137118950486183,-0.013130074366927147,-0.0028888925444334745,-0.03793882578611374,0.04232778400182724,-0.029453745111823082,0.0022046442609280348,0.0430515892803669,0.017073161900043488,0.0005817703204229474,0.049754321575164795,-0.07805512845516205,-0.0008593581151217222,0.00648045027628541,-0.010887539014220238,0.0028961936477571726,-0.019187262281775475,0.0029244644101709127,-0.007594394497573376,0.015418707393109798,-0.04098918288946152,0.015777453780174255,-0.0005924415308982134,-0.04335819184780121,0.029854070395231247,-0.0002007524890359491,-0.07345612347126007,-0.009545368142426014,-0.029651708900928497,0.035955119878053665,0.05384604632854462,-0.006471504922956228,0.004320160951465368,0.00257960706949234,-0.007014421746134758,0.061764907091856,0.04473862424492836,-0.011117149144411087,-0.013996296562254429,-0.035267576575279236,-0.03838081657886505,0.03073692135512829,0.021982552483677864,-0.0065528922714293,0.016199368983507156,-0.004008784890174866,-0.04317859560251236,-0.047625526785850525,0.0603315606713295,-0.08205103874206543,0.033714231103658676,-0.051081303507089615,-0.009853169322013855,-0.011121473275125027,-0.014309342950582504,0.0053335558623075485,0.021772880107164383,0.021898368373513222,0.0050402735359966755,0.007475896272808313,0.050579339265823364,-0.037812240421772,0.0005559296696446836,-0.015519397333264351,0.0345374271273613,0.051574308425188065,-0.03859226033091545,-0.006888946983963251,0.006428203545510769,-0.0008568392368033528,-0.02180488035082817,0.008162790909409523,-0.04637542739510536,-0.02554052509367466,0.026492774486541748,0.0007447157404385507,0.0015550416428595781,-0.06134637072682381,-0.015678193420171738,0.0002807770506478846,-0.03405957669019699,-0.07077331095933914,-0.012300832197070122,-0.0010022212518379092,-0.01364253368228674,0.057438261806964874,-0.035054534673690796,-0.016647322103381157,-0.033489204943180084,0.024556830525398254,0.043687283992767334,-0.02547282725572586,0.03313373774290085,0.01904292032122612,-0.0001689049822743982,-0.01800321601331234,-0.0134874964132905,0.028410768136382103,-0.022609127685427666,-0.011797390878200531,0.03673042356967926,-0.06288944184780121,0.027638571336865425,-0.06079728156328201,-0.030753541737794876,0.004950040020048618,-0.08519946038722992,-0.015925554558634758,0.02130829356610775,-0.02412046678364277,0.10647832602262497,-0.024782124906778336,-0.019632970914244652,0.04109428450465202,-0.028523661196231842,-0.010699890553951263,-0.004650421440601349,-0.018119415268301964,-0.05303551256656647,0.013512637466192245,0.0825405865907669,0.0333087183535099,0.023468025028705597,-0.006332726683467627,0.027127705514431,0.01158445980399847,-0.020627383142709732,0.01652042753994465,-0.036941733211278915,0.025742212310433388,-0.01695994660258293,-0.0696427971124649,0.06399468332529068,0.014929202385246754,0.06353120505809784,-0.00037088809767737985,-0.016105448827147484,0.01771615631878376,-0.02556745335459709,0.0331086702644825,0.0032239980064332485,0.02018849365413189,0.031488075852394104,-0.04786587134003639,0.01710529252886772,0.017684075981378555,-0.004308659117668867,-0.02314617671072483,0.03657110780477524,0.007124871015548706,-0.004839472938328981,-0.05125884339213371,0.05091901123523712,-0.0037481505423784256,0.021916033700108528,-0.019696040078997612,-0.03377363458275795,0.0006033863173797727,0.010766551829874516,0.004586676601320505,0.004537103697657585,0.022887738421559334,-0.006804433651268482,-0.001690422766841948,-0.01964135654270649,0.009184634312987328,0.01642639935016632,-0.08349741250276566,0.03186263516545296,-0.019484061747789383,-7.510933561226303e-33,-0.09272754192352295,-0.02396589145064354,0.036434661597013474,-0.017663590610027313,-0.04159891605377197,-0.06030650809407234,-0.0017638819990679622,0.010496541857719421,-0.05168411135673523,0.023719092831015587,0.03972205892205238,0.03900368511676788,0.012321142479777336,0.008889060467481613,0.007890339009463787,-0.04300997033715248,0.010969249531626701,-0.006942820269614458,-0.021165726706385612,0.025613222271203995,-0.040567170828580856,0.034420907497406006,-0.025688547641038895,-0.07934240996837616,0.028302129358053207,-0.06317651271820068,0.007385340519249439,0.020043518394231796,0.012180615216493607,-0.025977058336138725,0.005631116218864918,-0.08900924026966095,-0.011073662899434566,-0.0012978105805814266,0.016605710610747337,0.06486930698156357,-0.07944223284721375,-0.05556989088654518,0.01937238872051239,-0.011050073429942131,-0.01798023283481598,0.04236515238881111,-0.036693770438432693,0.007948054000735283,0.0013109463034197688,-0.049310117959976196,0.042843129485845566,0.03055758960545063,0.004837255924940109,0.025941796600818634,0.014824624173343182,0.00986096728593111,-0.0018305215053260326,0.011197554878890514,-0.028470980003476143,0.10663945972919464,0.005549344699829817,0.02438834309577942,0.003778195707127452,-0.0185964647680521,-0.04704367369413376,0.034247081726789474,-0.001209859736263752,0.004088038578629494,0.0001218520337715745,0.010201871395111084,0.016188845038414,-0.01965082809329033,-0.06285331398248672,-0.015446415171027184,-0.0434546172618866,0.017742332071065903,0.0068526980467140675,-0.03629298880696297,-0.07392650842666626,0.006839318200945854,0.008429354056715965,-0.019473161548376083,-0.004691635258495808,0.018457699567079544,0.009598813951015472,-0.029144683852791786,-0.0012820499250665307,-0.05099576711654663,0.02447369322180748,0.014111172407865524,0.004597801249474287,-0.0029288039077073336,0.029299713671207428,0.03771629184484482,-0.040859632194042206,-0.033826228231191635,-0.007967578247189522,0.018170220777392387,-0.034212108701467514,0.048820026218891144,0.07523870468139648,0.02858276106417179,-0.013864433392882347,-0.005422383546829224,-0.011835936456918716,0.06073518469929695,-0.02501150779426098,-0.032020751386880875,0.0001555496855871752,-0.005812963470816612,-0.05596669018268585,0.00823159422725439,-0.03337465226650238,-0.023165414109826088,0.003290726337581873,0.011066798120737076,-0.029554033651947975,0.05773475766181946,0.023504067212343216,-0.00800514779984951,0.0388932004570961,0.050748541951179504,-0.018315104767680168,-0.010056712664663792,0.02415885403752327,0.023864874616265297,0.011938430368900299,0.04049817845225334,-0.03634843975305557,-0.01506307814270258,0.00821145810186863,0.003739349078387022,0.05152486264705658,-0.0008317475439980626,-0.01177646778523922,0.06791883707046509,3.030870061593305e-7,0.04588107764720917,-0.02036270871758461,0.04121553152799606,0.05013800039887428,0.03624875098466873,-0.004792000167071819,0.02344673126935959,0.00867602601647377,0.0014442306710407138,-0.015983371064066887,0.015370611101388931,-0.0370493121445179,0.028589462861418724,0.08186841756105423,-0.033125732094049454,0.03904186561703682,-0.022727809846401215,0.016819819808006287,-0.01772300899028778,0.0027891332283616066,0.04081938415765762,-0.007822143845260143,-0.039602771401405334,0.013036047108471394,0.011672358959913254,0.013105533085763454,-0.05098492279648781,0.0532994419336319,-0.01495728362351656,0.03972256928682327,-0.005113329738378525,-0.02405092492699623,0.02252628467977047,-0.03887052461504936,-0.04686300456523895,0.02704068087041378,-0.018063673749566078,0.01548734214156866,0.026399442926049232,-0.09638560563325882,-0.064604751765728,-0.034467004239559174,0.029654458165168762,-0.04855133593082428,0.05539713799953461,0.06082667037844658,0.0189321618527174,-0.030212197452783585,-0.006252904422581196,-0.08014142513275146,-0.009753823280334473,0.026324352249503136,0.004505218006670475,-0.035859107971191406,0.077079638838768,-0.022898351773619652,0.010584027506411076,0.022559359669685364,0.0053556072525680065,-0.013416169211268425,-0.007596118375658989,-0.007671344093978405,0.02114206925034523,0.028724947944283485,-0.08033090829849243,0.05377911403775215,-0.06182713434100151,1.8011903639276874e-34,0.009032518602907658,-0.005510610993951559,-0.0021842517890036106,-0.011026154272258282,0.013770131394267082,0.00034481374314054847,0.05705759674310684,-0.029558196663856506,0.010308987461030483,-0.03878236189484596,-0.0013351903762668371]'
SET
  @EmbeddingModelID_4729458b1444 = '1D45AA65-41EC-4572-9ECD-AB2826C9B059'
SET
  @Reusable_4729458b1444 = 0
SET
  @IsMaterialized_4729458b1444 = 0
EXEC [${mjSchema}].spCreateQuery @ID = @ID_4729458b1444,
  @Name = @Name_4729458b1444,
  @CategoryID = @CategoryID_4729458b1444,
  @UserQuestion = @UserQuestion_4729458b1444,
  @Description = @Description_4729458b1444,
  @SQL = @SQL_4729458b1444,
  @TechnicalDescription = @TechnicalDescription_4729458b1444,
  @OriginalSQL = @OriginalSQL_4729458b1444,
  @OriginalSQL_Clear = 1,
  @Feedback = @Feedback_4729458b1444,
  @Feedback_Clear = 1,
  @Status = @Status_4729458b1444,
  @QualityRank = @QualityRank_4729458b1444,
  @ExecutionCostRank = @ExecutionCostRank_4729458b1444,
  @UsesTemplate = @UsesTemplate_4729458b1444,
  @AuditQueryRuns = @AuditQueryRuns_4729458b1444,
  @CacheEnabled = @CacheEnabled_4729458b1444,
  @CacheTTLMinutes = @CacheTTLMinutes_4729458b1444,
  @CacheTTLMinutes_Clear = 1,
  @CacheMaxSize = @CacheMaxSize_4729458b1444,
  @CacheMaxSize_Clear = 1,
  @EmbeddingVector = @EmbeddingVector_4729458b1444,
  @EmbeddingModelID = @EmbeddingModelID_4729458b1444,
  @CacheValidationSQL = @CacheValidationSQL_4729458b1444,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_4729458b1444,
  @Reusable = @Reusable_4729458b1444,
  @ExternalDataSourceID = @ExternalDataSourceID_4729458b1444,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_4729458b1444;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_fb2168078c2a UNIQUEIDENTIFIER,
@QueryID_fb2168078c2a UNIQUEIDENTIFIER,
@Name_fb2168078c2a NVARCHAR(255),
@Type_fb2168078c2a NVARCHAR(50),
@IsRequired_fb2168078c2a BIT,
@DefaultValue_fb2168078c2a NVARCHAR(MAX),
@Description_fb2168078c2a NVARCHAR(MAX),
@SampleValue_fb2168078c2a NVARCHAR(MAX),
@ValidationFilters_fb2168078c2a NVARCHAR(MAX),
@DetectionMethod_fb2168078c2a NVARCHAR(50),
@AutoDetectConfidenceScore_fb2168078c2a DECIMAL(3, 2)
SET
  @ID_fb2168078c2a = 'fbe10d11-d146-47f2-9f28-90364b7b42e0'
SET
  @QueryID_fb2168078c2a = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_fb2168078c2a = N'FormID'
SET
  @Type_fb2168078c2a = N'string'
SET
  @IsRequired_fb2168078c2a = 1
SET
  @Description_fb2168078c2a = N'Unique identifier of the form to filter versions and responses'
SET
  @SampleValue_fb2168078c2a = N'A123B456-C789-0123-DEF4-567890ABCDEF'
SET
  @DetectionMethod_fb2168078c2a = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_fb2168078c2a,
  @QueryID = @QueryID_fb2168078c2a,
  @Name = @Name_fb2168078c2a,
  @Type = @Type_fb2168078c2a,
  @IsRequired = @IsRequired_fb2168078c2a,
  @DefaultValue = @DefaultValue_fb2168078c2a,
  @DefaultValue_Clear = 1,
  @Description = @Description_fb2168078c2a,
  @SampleValue = @SampleValue_fb2168078c2a,
  @ValidationFilters = @ValidationFilters_fb2168078c2a,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_fb2168078c2a,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_fb2168078c2a,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_c03dce02ce65 UNIQUEIDENTIFIER,
@QueryID_c03dce02ce65 UNIQUEIDENTIFIER,
@Name_c03dce02ce65 NVARCHAR(255),
@Type_c03dce02ce65 NVARCHAR(50),
@IsRequired_c03dce02ce65 BIT,
@DefaultValue_c03dce02ce65 NVARCHAR(MAX),
@Description_c03dce02ce65 NVARCHAR(MAX),
@SampleValue_c03dce02ce65 NVARCHAR(MAX),
@ValidationFilters_c03dce02ce65 NVARCHAR(MAX),
@DetectionMethod_c03dce02ce65 NVARCHAR(50),
@AutoDetectConfidenceScore_c03dce02ce65 DECIMAL(3, 2)
SET
  @ID_c03dce02ce65 = '38e31238-aa5e-4a8e-b482-cbaa6ecdb120'
SET
  @QueryID_c03dce02ce65 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_c03dce02ce65 = N'FormVersionID'
SET
  @Type_c03dce02ce65 = N'string'
SET
  @IsRequired_c03dce02ce65 = 0
SET
  @Description_c03dce02ce65 = N'Optional specific form version ID to scope funnel data. Guarded by truthiness check.'
SET
  @SampleValue_c03dce02ce65 = N'B987C654-D321-0987-CBA6-543210FEDCBA'
SET
  @DetectionMethod_c03dce02ce65 = N'AI' EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_c03dce02ce65,
  @QueryID = @QueryID_c03dce02ce65,
  @Name = @Name_c03dce02ce65,
  @Type = @Type_c03dce02ce65,
  @IsRequired = @IsRequired_c03dce02ce65,
  @DefaultValue = @DefaultValue_c03dce02ce65,
  @DefaultValue_Clear = 1,
  @Description = @Description_c03dce02ce65,
  @SampleValue = @SampleValue_c03dce02ce65,
  @ValidationFilters = @ValidationFilters_c03dce02ce65,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_c03dce02ce65,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_c03dce02ce65,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_11db64df29de UNIQUEIDENTIFIER,
@QueryID_11db64df29de UNIQUEIDENTIFIER,
@Name_11db64df29de NVARCHAR(255),
@Description_11db64df29de NVARCHAR(MAX),
@Sequence_11db64df29de INT,
@SQLBaseType_11db64df29de NVARCHAR(50),
@SQLFullType_11db64df29de NVARCHAR(100),
@SourceEntityID_11db64df29de UNIQUEIDENTIFIER,
@SourceFieldName_11db64df29de NVARCHAR(255),
@IsComputed_11db64df29de BIT,
@ComputationDescription_11db64df29de NVARCHAR(MAX),
@IsSummary_11db64df29de BIT,
@SummaryDescription_11db64df29de NVARCHAR(MAX),
@DetectionMethod_11db64df29de NVARCHAR(50),
@AutoDetectConfidenceScore_11db64df29de DECIMAL(3, 2)
SET
  @ID_11db64df29de = '1212cadf-1947-42ca-867c-e7ec1ddece77'
SET
  @QueryID_11db64df29de = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_11db64df29de = N'PageID'
SET
  @Description_11db64df29de = N'Unique identifier of the form page extracted from JSON snapshot'
SET
  @Sequence_11db64df29de = 1
SET
  @SQLBaseType_11db64df29de = N'nvarchar'
SET
  @SQLFullType_11db64df29de = N'nvarchar(MAX)'
SET
  @SourceFieldName_11db64df29de = N'PageID'
SET
  @IsComputed_11db64df29de = 0
SET
  @ComputationDescription_11db64df29de = N'Extracted via JSON_VALUE from the DefinitionSnapshot $.pages array'
SET
  @IsSummary_11db64df29de = 0
SET
  @DetectionMethod_11db64df29de = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_11db64df29de,
  @QueryID = @QueryID_11db64df29de,
  @Name = @Name_11db64df29de,
  @Description = @Description_11db64df29de,
  @Sequence = @Sequence_11db64df29de,
  @SQLBaseType = @SQLBaseType_11db64df29de,
  @SQLFullType = @SQLFullType_11db64df29de,
  @SourceEntityID = @SourceEntityID_11db64df29de,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_11db64df29de,
  @IsComputed = @IsComputed_11db64df29de,
  @ComputationDescription = @ComputationDescription_11db64df29de,
  @IsSummary = @IsSummary_11db64df29de,
  @SummaryDescription = @SummaryDescription_11db64df29de,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_11db64df29de,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_11db64df29de,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_241207052d50 UNIQUEIDENTIFIER,
@QueryID_241207052d50 UNIQUEIDENTIFIER,
@Name_241207052d50 NVARCHAR(255),
@Description_241207052d50 NVARCHAR(MAX),
@Sequence_241207052d50 INT,
@SQLBaseType_241207052d50 NVARCHAR(50),
@SQLFullType_241207052d50 NVARCHAR(100),
@SourceEntityID_241207052d50 UNIQUEIDENTIFIER,
@SourceFieldName_241207052d50 NVARCHAR(255),
@IsComputed_241207052d50 BIT,
@ComputationDescription_241207052d50 NVARCHAR(MAX),
@IsSummary_241207052d50 BIT,
@SummaryDescription_241207052d50 NVARCHAR(MAX),
@DetectionMethod_241207052d50 NVARCHAR(50),
@AutoDetectConfidenceScore_241207052d50 DECIMAL(3, 2)
SET
  @ID_241207052d50 = 'c80093e2-1f78-4219-bc5c-519663f38f45'
SET
  @QueryID_241207052d50 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_241207052d50 = N'Title'
SET
  @Description_241207052d50 = N'Title of the form page'
SET
  @Sequence_241207052d50 = 2
SET
  @SQLBaseType_241207052d50 = N'nvarchar'
SET
  @SQLFullType_241207052d50 = N'nvarchar(MAX)'
SET
  @SourceFieldName_241207052d50 = N'Title'
SET
  @IsComputed_241207052d50 = 0
SET
  @ComputationDescription_241207052d50 = N'Extracted via JSON_VALUE from the DefinitionSnapshot $.pages array'
SET
  @IsSummary_241207052d50 = 0
SET
  @DetectionMethod_241207052d50 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_241207052d50,
  @QueryID = @QueryID_241207052d50,
  @Name = @Name_241207052d50,
  @Description = @Description_241207052d50,
  @Sequence = @Sequence_241207052d50,
  @SQLBaseType = @SQLBaseType_241207052d50,
  @SQLFullType = @SQLFullType_241207052d50,
  @SourceEntityID = @SourceEntityID_241207052d50,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_241207052d50,
  @IsComputed = @IsComputed_241207052d50,
  @ComputationDescription = @ComputationDescription_241207052d50,
  @IsSummary = @IsSummary_241207052d50,
  @SummaryDescription = @SummaryDescription_241207052d50,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_241207052d50,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_241207052d50,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_202b31d2f601 UNIQUEIDENTIFIER,
@QueryID_202b31d2f601 UNIQUEIDENTIFIER,
@Name_202b31d2f601 NVARCHAR(255),
@Description_202b31d2f601 NVARCHAR(MAX),
@Sequence_202b31d2f601 INT,
@SQLBaseType_202b31d2f601 NVARCHAR(50),
@SQLFullType_202b31d2f601 NVARCHAR(100),
@SourceEntityID_202b31d2f601 UNIQUEIDENTIFIER,
@SourceFieldName_202b31d2f601 NVARCHAR(255),
@IsComputed_202b31d2f601 BIT,
@ComputationDescription_202b31d2f601 NVARCHAR(MAX),
@IsSummary_202b31d2f601 BIT,
@SummaryDescription_202b31d2f601 NVARCHAR(MAX),
@DetectionMethod_202b31d2f601 NVARCHAR(50),
@AutoDetectConfidenceScore_202b31d2f601 DECIMAL(3, 2)
SET
  @ID_202b31d2f601 = '1e9aa3fd-d172-4916-9978-ed89ef249c8a'
SET
  @QueryID_202b31d2f601 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_202b31d2f601 = N'DisplayOrder'
SET
  @Description_202b31d2f601 = N'Ordinal display position of the page'
SET
  @Sequence_202b31d2f601 = 3
SET
  @SQLBaseType_202b31d2f601 = N'nvarchar'
SET
  @SQLFullType_202b31d2f601 = N'nvarchar(MAX)'
SET
  @SourceFieldName_202b31d2f601 = N'DisplayOrder'
SET
  @IsComputed_202b31d2f601 = 0
SET
  @ComputationDescription_202b31d2f601 = N'TRY_CONVERT to INT from JSON_VALUE of DefinitionSnapshot $.pages array displayOrder'
SET
  @IsSummary_202b31d2f601 = 0
SET
  @DetectionMethod_202b31d2f601 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_202b31d2f601,
  @QueryID = @QueryID_202b31d2f601,
  @Name = @Name_202b31d2f601,
  @Description = @Description_202b31d2f601,
  @Sequence = @Sequence_202b31d2f601,
  @SQLBaseType = @SQLBaseType_202b31d2f601,
  @SQLFullType = @SQLFullType_202b31d2f601,
  @SourceEntityID = @SourceEntityID_202b31d2f601,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_202b31d2f601,
  @IsComputed = @IsComputed_202b31d2f601,
  @ComputationDescription = @ComputationDescription_202b31d2f601,
  @IsSummary = @IsSummary_202b31d2f601,
  @SummaryDescription = @SummaryDescription_202b31d2f601,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_202b31d2f601,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_202b31d2f601,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_32afe21dc55d UNIQUEIDENTIFIER,
@QueryID_32afe21dc55d UNIQUEIDENTIFIER,
@Name_32afe21dc55d NVARCHAR(255),
@Description_32afe21dc55d NVARCHAR(MAX),
@Sequence_32afe21dc55d INT,
@SQLBaseType_32afe21dc55d NVARCHAR(50),
@SQLFullType_32afe21dc55d NVARCHAR(100),
@SourceEntityID_32afe21dc55d UNIQUEIDENTIFIER,
@SourceFieldName_32afe21dc55d NVARCHAR(255),
@IsComputed_32afe21dc55d BIT,
@ComputationDescription_32afe21dc55d NVARCHAR(MAX),
@IsSummary_32afe21dc55d BIT,
@SummaryDescription_32afe21dc55d NVARCHAR(MAX),
@DetectionMethod_32afe21dc55d NVARCHAR(50),
@AutoDetectConfidenceScore_32afe21dc55d DECIMAL(3, 2)
SET
  @ID_32afe21dc55d = '7f3dc365-6bc2-4eb0-a588-1d38a518b15e'
SET
  @QueryID_32afe21dc55d = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_32afe21dc55d = N'ReachedCount'
SET
  @Description_32afe21dc55d = N'Number of distinct form responses that answered at least one question on this page'
SET
  @Sequence_32afe21dc55d = 4
SET
  @SQLBaseType_32afe21dc55d = N'decimal'
SET
  @SQLFullType_32afe21dc55d = N'decimal(18,2)'
SET
  @IsComputed_32afe21dc55d = 1
SET
  @ComputationDescription_32afe21dc55d = N'ISNULL(rc.ReachedCount, 0) where rc aggregates COUNT(DISTINCT a.ResponseID)'
SET
  @IsSummary_32afe21dc55d = 1
SET
  @DetectionMethod_32afe21dc55d = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_32afe21dc55d,
  @QueryID = @QueryID_32afe21dc55d,
  @Name = @Name_32afe21dc55d,
  @Description = @Description_32afe21dc55d,
  @Sequence = @Sequence_32afe21dc55d,
  @SQLBaseType = @SQLBaseType_32afe21dc55d,
  @SQLFullType = @SQLFullType_32afe21dc55d,
  @SourceEntityID = @SourceEntityID_32afe21dc55d,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_32afe21dc55d,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_32afe21dc55d,
  @ComputationDescription = @ComputationDescription_32afe21dc55d,
  @IsSummary = @IsSummary_32afe21dc55d,
  @SummaryDescription = @SummaryDescription_32afe21dc55d,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_32afe21dc55d,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_32afe21dc55d,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_27fe56242199 UNIQUEIDENTIFIER,
@QueryID_27fe56242199 UNIQUEIDENTIFIER,
@Name_27fe56242199 NVARCHAR(255),
@Description_27fe56242199 NVARCHAR(MAX),
@Sequence_27fe56242199 INT,
@SQLBaseType_27fe56242199 NVARCHAR(50),
@SQLFullType_27fe56242199 NVARCHAR(100),
@SourceEntityID_27fe56242199 UNIQUEIDENTIFIER,
@SourceFieldName_27fe56242199 NVARCHAR(255),
@IsComputed_27fe56242199 BIT,
@ComputationDescription_27fe56242199 NVARCHAR(MAX),
@IsSummary_27fe56242199 BIT,
@SummaryDescription_27fe56242199 NVARCHAR(MAX),
@DetectionMethod_27fe56242199 NVARCHAR(50),
@AutoDetectConfidenceScore_27fe56242199 DECIMAL(3, 2)
SET
  @ID_27fe56242199 = '7df78192-d2b2-45e6-8626-6b3f5be51cd5'
SET
  @QueryID_27fe56242199 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_27fe56242199 = N'QuestionTypes'
SET
  @Description_27fe56242199 = N'Comma-separated list of question types present on the page'
SET
  @Sequence_27fe56242199 = 5
SET
  @SQLBaseType_27fe56242199 = N'nvarchar'
SET
  @SQLFullType_27fe56242199 = N'nvarchar(MAX)'
SET
  @IsComputed_27fe56242199 = 1
SET
  @ComputationDescription_27fe56242199 = N'Subquery using STRING_AGG(pq.QuestionType, N'','') across page questions'
SET
  @IsSummary_27fe56242199 = 1
SET
  @DetectionMethod_27fe56242199 = N'Manual' EXEC [${mjSchema}].spCreateQueryField @ID = @ID_27fe56242199,
  @QueryID = @QueryID_27fe56242199,
  @Name = @Name_27fe56242199,
  @Description = @Description_27fe56242199,
  @Sequence = @Sequence_27fe56242199,
  @SQLBaseType = @SQLBaseType_27fe56242199,
  @SQLFullType = @SQLFullType_27fe56242199,
  @SourceEntityID = @SourceEntityID_27fe56242199,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_27fe56242199,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_27fe56242199,
  @ComputationDescription = @ComputationDescription_27fe56242199,
  @IsSummary = @IsSummary_27fe56242199,
  @SummaryDescription = @SummaryDescription_27fe56242199,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_27fe56242199,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_27fe56242199,
  @AutoDetectConfidenceScore_Clear = 1;

GO

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_fd5d6f39100c UNIQUEIDENTIFIER,
@QueryID_fd5d6f39100c UNIQUEIDENTIFIER,
@EntityID_fd5d6f39100c UNIQUEIDENTIFIER,
@DetectionMethod_fd5d6f39100c NVARCHAR(50),
@AutoDetectConfidenceScore_fd5d6f39100c DECIMAL(3, 2)
SET
  @ID_fd5d6f39100c = '66af80d9-45d1-4615-931e-68e4438f2c16'
SET
  @QueryID_fd5d6f39100c = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @EntityID_fd5d6f39100c = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_fd5d6f39100c = N'AI'
SET
  @AutoDetectConfidenceScore_fd5d6f39100c = 1
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_fd5d6f39100c,
  @QueryID = @QueryID_fd5d6f39100c,
  @EntityID = @EntityID_fd5d6f39100c,
  @DetectionMethod = @DetectionMethod_fd5d6f39100c,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_fd5d6f39100c;

GO

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_742043b81728 UNIQUEIDENTIFIER,
@QueryID_742043b81728 UNIQUEIDENTIFIER,
@EntityID_742043b81728 UNIQUEIDENTIFIER,
@DetectionMethod_742043b81728 NVARCHAR(50),
@AutoDetectConfidenceScore_742043b81728 DECIMAL(3, 2)
SET
  @ID_742043b81728 = '4b9982cb-896d-4831-94cb-1d4025c31c5d'
SET
  @QueryID_742043b81728 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @EntityID_742043b81728 = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810'
SET
  @DetectionMethod_742043b81728 = N'AI'
SET
  @AutoDetectConfidenceScore_742043b81728 = 1
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_742043b81728,
  @QueryID = @QueryID_742043b81728,
  @EntityID = @EntityID_742043b81728,
  @DetectionMethod = @DetectionMethod_742043b81728,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_742043b81728;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_cc652908f056 UNIQUEIDENTIFIER,
@QueryID_cc652908f056 UNIQUEIDENTIFIER,
@RoleID_cc652908f056 UNIQUEIDENTIFIER
SET
  @ID_cc652908f056 = '0F071145-C1C6-4C63-BBE3-44F3A74C39DA'
SET
  @QueryID_cc652908f056 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_cc652908f056 = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_cc652908f056,
  @QueryID = @QueryID_cc652908f056,
  @RoleID = @RoleID_cc652908f056;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_c211c02753b1 UNIQUEIDENTIFIER,
@QueryID_c211c02753b1 UNIQUEIDENTIFIER,
@RoleID_c211c02753b1 UNIQUEIDENTIFIER
SET
  @ID_c211c02753b1 = '67760AF4-07FC-4CC8-8B51-AE3A3F1AF725'
SET
  @QueryID_c211c02753b1 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_c211c02753b1 = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_c211c02753b1,
  @QueryID = @QueryID_c211c02753b1,
  @RoleID = @RoleID_c211c02753b1;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_f0f50aea3247 UNIQUEIDENTIFIER,
@QueryID_f0f50aea3247 UNIQUEIDENTIFIER,
@RoleID_f0f50aea3247 UNIQUEIDENTIFIER
SET
  @ID_f0f50aea3247 = 'C8768CAF-4613-46D6-B0F8-0624EE8D5B79'
SET
  @QueryID_f0f50aea3247 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_f0f50aea3247 = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_f0f50aea3247,
  @QueryID = @QueryID_f0f50aea3247,
  @RoleID = @RoleID_f0f50aea3247;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_6ff1245aecb8 UNIQUEIDENTIFIER,
@QueryID_6ff1245aecb8 UNIQUEIDENTIFIER,
@RoleID_6ff1245aecb8 UNIQUEIDENTIFIER
SET
  @ID_6ff1245aecb8 = '5C571EC4-F923-4A11-B975-1DDA08F87E2D'
SET
  @QueryID_6ff1245aecb8 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_6ff1245aecb8 = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_6ff1245aecb8,
  @QueryID = @QueryID_6ff1245aecb8,
  @RoleID = @RoleID_6ff1245aecb8;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_da34224bcaeb UNIQUEIDENTIFIER,
@QueryID_da34224bcaeb UNIQUEIDENTIFIER,
@RoleID_da34224bcaeb UNIQUEIDENTIFIER
SET
  @ID_da34224bcaeb = 'F4C56BD9-FC37-4C66-8F22-2B467B53E550'
SET
  @QueryID_da34224bcaeb = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_da34224bcaeb = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_da34224bcaeb,
  @QueryID = @QueryID_da34224bcaeb,
  @RoleID = @RoleID_da34224bcaeb;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_8f37f37341c7 UNIQUEIDENTIFIER,
@QueryID_8f37f37341c7 UNIQUEIDENTIFIER,
@RoleID_8f37f37341c7 UNIQUEIDENTIFIER
SET
  @ID_8f37f37341c7 = '7633BEFC-1941-43A6-84BA-D4F14FB19AF8'
SET
  @QueryID_8f37f37341c7 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_8f37f37341c7 = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_8f37f37341c7,
  @QueryID = @QueryID_8f37f37341c7,
  @RoleID = @RoleID_8f37f37341c7;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_3559f5ea1487 UNIQUEIDENTIFIER,
@QueryID_3559f5ea1487 UNIQUEIDENTIFIER,
@RoleID_3559f5ea1487 UNIQUEIDENTIFIER
SET
  @ID_3559f5ea1487 = '2DD55B24-4082-417A-A4A9-3A36CB9FEE23'
SET
  @QueryID_3559f5ea1487 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_3559f5ea1487 = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_3559f5ea1487,
  @QueryID = @QueryID_3559f5ea1487,
  @RoleID = @RoleID_3559f5ea1487;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_b15f3245b51f UNIQUEIDENTIFIER,
@QueryID_b15f3245b51f UNIQUEIDENTIFIER,
@RoleID_b15f3245b51f UNIQUEIDENTIFIER
SET
  @ID_b15f3245b51f = '3BDE1A93-2798-4962-A1D1-DEF5E373BA6D'
SET
  @QueryID_b15f3245b51f = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_b15f3245b51f = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_b15f3245b51f,
  @QueryID = @QueryID_b15f3245b51f,
  @RoleID = @RoleID_b15f3245b51f;

GO

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_74f1a4b86273 UNIQUEIDENTIFIER,
@QueryID_74f1a4b86273 UNIQUEIDENTIFIER,
@RoleID_74f1a4b86273 UNIQUEIDENTIFIER
SET
  @ID_74f1a4b86273 = '94B1BFDB-6521-48D3-A5F1-A786FBCF15C2'
SET
  @QueryID_74f1a4b86273 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_74f1a4b86273 = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_74f1a4b86273,
  @QueryID = @QueryID_74f1a4b86273,
  @RoleID = @RoleID_74f1a4b86273;

GO

-- Save MJ: Entities (core SP call only)
DECLARE @ParentID_5ea7e6abd541 UNIQUEIDENTIFIER,
@Name_5ea7e6abd541 NVARCHAR(255),
@NameSuffix_5ea7e6abd541 NVARCHAR(255),
@Description_5ea7e6abd541 NVARCHAR(MAX),
@AutoUpdateDescription_5ea7e6abd541 BIT,
@BaseView_5ea7e6abd541 NVARCHAR(255),
@BaseViewGenerated_5ea7e6abd541 BIT,
@VirtualEntity_5ea7e6abd541 BIT,
@TrackRecordChanges_5ea7e6abd541 BIT,
@AuditRecordAccess_5ea7e6abd541 BIT,
@AuditViewRuns_5ea7e6abd541 BIT,
@IncludeInAPI_5ea7e6abd541 BIT,
@AllowAllRowsAPI_5ea7e6abd541 BIT,
@AllowUpdateAPI_5ea7e6abd541 BIT,
@AllowCreateAPI_5ea7e6abd541 BIT,
@AllowDeleteAPI_5ea7e6abd541 BIT,
@CustomResolverAPI_5ea7e6abd541 BIT,
@AllowUserSearchAPI_5ea7e6abd541 BIT,
@FullTextSearchEnabled_5ea7e6abd541 BIT,
@FullTextCatalog_5ea7e6abd541 NVARCHAR(255),
@FullTextCatalogGenerated_5ea7e6abd541 BIT,
@FullTextIndex_5ea7e6abd541 NVARCHAR(255),
@FullTextIndexGenerated_5ea7e6abd541 BIT,
@FullTextSearchFunction_5ea7e6abd541 NVARCHAR(255),
@FullTextSearchFunctionGenerated_5ea7e6abd541 BIT,
@UserViewMaxRows_5ea7e6abd541 INT,
@spCreate_5ea7e6abd541 NVARCHAR(255),
@spUpdate_5ea7e6abd541 NVARCHAR(255),
@spDelete_5ea7e6abd541 NVARCHAR(255),
@spCreateGenerated_5ea7e6abd541 BIT,
@spUpdateGenerated_5ea7e6abd541 BIT,
@spDeleteGenerated_5ea7e6abd541 BIT,
@CascadeDeletes_5ea7e6abd541 BIT,
@DeleteType_5ea7e6abd541 NVARCHAR(10),
@AllowRecordMerge_5ea7e6abd541 BIT,
@spMatch_5ea7e6abd541 NVARCHAR(255),
@RelationshipDefaultDisplayType_5ea7e6abd541 NVARCHAR(20),
@UserFormGenerated_5ea7e6abd541 BIT,
@EntityObjectSubclassName_5ea7e6abd541 NVARCHAR(255),
@EntityObjectSubclassImport_5ea7e6abd541 NVARCHAR(255),
@PreferredCommunicationField_5ea7e6abd541 NVARCHAR(255),
@Icon_5ea7e6abd541 NVARCHAR(500),
@ScopeDefault_5ea7e6abd541 NVARCHAR(100),
@RowsToPackWithSchema_5ea7e6abd541 NVARCHAR(20),
@RowsToPackSampleMethod_5ea7e6abd541 NVARCHAR(20),
@RowsToPackSampleCount_5ea7e6abd541 INT,
@RowsToPackSampleOrder_5ea7e6abd541 NVARCHAR(MAX),
@AutoRowCountFrequency_5ea7e6abd541 INT,
@RowCount_5ea7e6abd541 BIGINT,
@RowCountRunAt_5ea7e6abd541 DATETIMEOFFSET,
@Status_5ea7e6abd541 NVARCHAR(25),
@DisplayName_5ea7e6abd541 NVARCHAR(255),
@AllowMultipleSubtypes_5ea7e6abd541 BIT,
@AutoUpdateFullTextSearch_5ea7e6abd541 BIT,
@AutoUpdateAllowUserSearchAPI_5ea7e6abd541 BIT,
@TrustServerCacheCompletely_5ea7e6abd541 BIT,
@SupportsGeoCoding_5ea7e6abd541 BIT,
@AutoUpdateSupportsGeoCoding_5ea7e6abd541 BIT,
@AllowCaching_5ea7e6abd541 BIT,
@DetectExternalChanges_5ea7e6abd541 BIT,
@ExternalDataSourceID_5ea7e6abd541 UNIQUEIDENTIFIER,
@ExternalObjectName_5ea7e6abd541 NVARCHAR(255),
@GeneratedBaseViewName_5ea7e6abd541 NVARCHAR(255),
@AllowDirectSQLInsert_5ea7e6abd541 BIT,
@AllowDirectSQLUpdate_5ea7e6abd541 BIT,
@AllowDirectSQLDelete_5ea7e6abd541 BIT,
@Configuration_5ea7e6abd541 NVARCHAR(MAX),
@SubtypeSelector_5ea7e6abd541 NVARCHAR(MAX),
@EnableFieldLevelSecurity_5ea7e6abd541 BIT,
@ID_5ea7e6abd541 UNIQUEIDENTIFIER
SET
  @Name_5ea7e6abd541 = N'MJ_BizApps_Forms: Form Automation Events'
SET
  @Description_5ea7e6abd541 = N'The on-submit automation outbox: one row per run a response save owes (one per final submit, one per partial save of a version with OnPartial steps), written in the save''s own transaction and claimed by the automation drain after commit'
SET
  @AutoUpdateDescription_5ea7e6abd541 = 1
SET
  @BaseView_5ea7e6abd541 = N'vwFormAutomationEvents'
SET
  @BaseViewGenerated_5ea7e6abd541 = 1
SET
  @VirtualEntity_5ea7e6abd541 = 0
SET
  @TrackRecordChanges_5ea7e6abd541 = 1
SET
  @AuditRecordAccess_5ea7e6abd541 = 0
SET
  @AuditViewRuns_5ea7e6abd541 = 0
SET
  @IncludeInAPI_5ea7e6abd541 = 1
SET
  @AllowAllRowsAPI_5ea7e6abd541 = 0
SET
  @AllowUpdateAPI_5ea7e6abd541 = 1
SET
  @AllowCreateAPI_5ea7e6abd541 = 1
SET
  @AllowDeleteAPI_5ea7e6abd541 = 1
SET
  @CustomResolverAPI_5ea7e6abd541 = 0
SET
  @AllowUserSearchAPI_5ea7e6abd541 = 0
SET
  @FullTextSearchEnabled_5ea7e6abd541 = 0
SET
  @FullTextCatalogGenerated_5ea7e6abd541 = 1
SET
  @FullTextIndexGenerated_5ea7e6abd541 = 1
SET
  @FullTextSearchFunctionGenerated_5ea7e6abd541 = 1
SET
  @UserViewMaxRows_5ea7e6abd541 = 1000
SET
  @spCreateGenerated_5ea7e6abd541 = 1
SET
  @spUpdateGenerated_5ea7e6abd541 = 1
SET
  @spDeleteGenerated_5ea7e6abd541 = 1
SET
  @CascadeDeletes_5ea7e6abd541 = 0
SET
  @DeleteType_5ea7e6abd541 = N'Hard'
SET
  @AllowRecordMerge_5ea7e6abd541 = 0
SET
  @RelationshipDefaultDisplayType_5ea7e6abd541 = N'Search'
SET
  @UserFormGenerated_5ea7e6abd541 = 1
SET
  @Icon_5ea7e6abd541 = N'fa fa-tasks'
SET
  @RowsToPackWithSchema_5ea7e6abd541 = N'None'
SET
  @RowsToPackSampleMethod_5ea7e6abd541 = N'random'
SET
  @RowsToPackSampleCount_5ea7e6abd541 = 0
SET
  @Status_5ea7e6abd541 = N'Active'
SET
  @DisplayName_5ea7e6abd541 = N'Form Automation Events'
SET
  @AllowMultipleSubtypes_5ea7e6abd541 = 0
SET
  @AutoUpdateFullTextSearch_5ea7e6abd541 = 1
SET
  @AutoUpdateAllowUserSearchAPI_5ea7e6abd541 = 0
SET
  @TrustServerCacheCompletely_5ea7e6abd541 = 1
SET
  @SupportsGeoCoding_5ea7e6abd541 = 0
SET
  @AutoUpdateSupportsGeoCoding_5ea7e6abd541 = 1
SET
  @AllowCaching_5ea7e6abd541 = 0
SET
  @DetectExternalChanges_5ea7e6abd541 = 0
SET
  @AllowDirectSQLInsert_5ea7e6abd541 = 0
SET
  @AllowDirectSQLUpdate_5ea7e6abd541 = 0
SET
  @AllowDirectSQLDelete_5ea7e6abd541 = 0
SET
  @EnableFieldLevelSecurity_5ea7e6abd541 = 0
SET
  @ID_5ea7e6abd541 = '0DBA2EE2-89F7-4120-BD1B-7AA3672B7DEF' EXEC [${mjSchema}].spUpdateEntity @ParentID = @ParentID_5ea7e6abd541,
  @ParentID_Clear = 1,
  @Name = @Name_5ea7e6abd541,
  @NameSuffix = @NameSuffix_5ea7e6abd541,
  @NameSuffix_Clear = 1,
  @Description = @Description_5ea7e6abd541,
  @AutoUpdateDescription = @AutoUpdateDescription_5ea7e6abd541,
  @BaseView = @BaseView_5ea7e6abd541,
  @BaseViewGenerated = @BaseViewGenerated_5ea7e6abd541,
  @VirtualEntity = @VirtualEntity_5ea7e6abd541,
  @TrackRecordChanges = @TrackRecordChanges_5ea7e6abd541,
  @AuditRecordAccess = @AuditRecordAccess_5ea7e6abd541,
  @AuditViewRuns = @AuditViewRuns_5ea7e6abd541,
  @IncludeInAPI = @IncludeInAPI_5ea7e6abd541,
  @AllowAllRowsAPI = @AllowAllRowsAPI_5ea7e6abd541,
  @AllowUpdateAPI = @AllowUpdateAPI_5ea7e6abd541,
  @AllowCreateAPI = @AllowCreateAPI_5ea7e6abd541,
  @AllowDeleteAPI = @AllowDeleteAPI_5ea7e6abd541,
  @CustomResolverAPI = @CustomResolverAPI_5ea7e6abd541,
  @AllowUserSearchAPI = @AllowUserSearchAPI_5ea7e6abd541,
  @FullTextSearchEnabled = @FullTextSearchEnabled_5ea7e6abd541,
  @FullTextCatalog = @FullTextCatalog_5ea7e6abd541,
  @FullTextCatalog_Clear = 1,
  @FullTextCatalogGenerated = @FullTextCatalogGenerated_5ea7e6abd541,
  @FullTextIndex = @FullTextIndex_5ea7e6abd541,
  @FullTextIndex_Clear = 1,
  @FullTextIndexGenerated = @FullTextIndexGenerated_5ea7e6abd541,
  @FullTextSearchFunction = @FullTextSearchFunction_5ea7e6abd541,
  @FullTextSearchFunction_Clear = 1,
  @FullTextSearchFunctionGenerated = @FullTextSearchFunctionGenerated_5ea7e6abd541,
  @UserViewMaxRows = @UserViewMaxRows_5ea7e6abd541,
  @spCreate = @spCreate_5ea7e6abd541,
  @spCreate_Clear = 1,
  @spUpdate = @spUpdate_5ea7e6abd541,
  @spUpdate_Clear = 1,
  @spDelete = @spDelete_5ea7e6abd541,
  @spDelete_Clear = 1,
  @spCreateGenerated = @spCreateGenerated_5ea7e6abd541,
  @spUpdateGenerated = @spUpdateGenerated_5ea7e6abd541,
  @spDeleteGenerated = @spDeleteGenerated_5ea7e6abd541,
  @CascadeDeletes = @CascadeDeletes_5ea7e6abd541,
  @DeleteType = @DeleteType_5ea7e6abd541,
  @AllowRecordMerge = @AllowRecordMerge_5ea7e6abd541,
  @spMatch = @spMatch_5ea7e6abd541,
  @spMatch_Clear = 1,
  @RelationshipDefaultDisplayType = @RelationshipDefaultDisplayType_5ea7e6abd541,
  @UserFormGenerated = @UserFormGenerated_5ea7e6abd541,
  @EntityObjectSubclassName = @EntityObjectSubclassName_5ea7e6abd541,
  @EntityObjectSubclassName_Clear = 1,
  @EntityObjectSubclassImport = @EntityObjectSubclassImport_5ea7e6abd541,
  @EntityObjectSubclassImport_Clear = 1,
  @PreferredCommunicationField = @PreferredCommunicationField_5ea7e6abd541,
  @PreferredCommunicationField_Clear = 1,
  @Icon = @Icon_5ea7e6abd541,
  @ScopeDefault = @ScopeDefault_5ea7e6abd541,
  @ScopeDefault_Clear = 1,
  @RowsToPackWithSchema = @RowsToPackWithSchema_5ea7e6abd541,
  @RowsToPackSampleMethod = @RowsToPackSampleMethod_5ea7e6abd541,
  @RowsToPackSampleCount = @RowsToPackSampleCount_5ea7e6abd541,
  @RowsToPackSampleOrder = @RowsToPackSampleOrder_5ea7e6abd541,
  @RowsToPackSampleOrder_Clear = 1,
  @AutoRowCountFrequency = @AutoRowCountFrequency_5ea7e6abd541,
  @AutoRowCountFrequency_Clear = 1,
  @RowCount = @RowCount_5ea7e6abd541,
  @RowCount_Clear = 1,
  @RowCountRunAt = @RowCountRunAt_5ea7e6abd541,
  @RowCountRunAt_Clear = 1,
  @Status = @Status_5ea7e6abd541,
  @DisplayName = @DisplayName_5ea7e6abd541,
  @AllowMultipleSubtypes = @AllowMultipleSubtypes_5ea7e6abd541,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_5ea7e6abd541,
  @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_5ea7e6abd541,
  @TrustServerCacheCompletely = @TrustServerCacheCompletely_5ea7e6abd541,
  @SupportsGeoCoding = @SupportsGeoCoding_5ea7e6abd541,
  @AutoUpdateSupportsGeoCoding = @AutoUpdateSupportsGeoCoding_5ea7e6abd541,
  @AllowCaching = @AllowCaching_5ea7e6abd541,
  @DetectExternalChanges = @DetectExternalChanges_5ea7e6abd541,
  @ExternalDataSourceID = @ExternalDataSourceID_5ea7e6abd541,
  @ExternalDataSourceID_Clear = 1,
  @ExternalObjectName = @ExternalObjectName_5ea7e6abd541,
  @ExternalObjectName_Clear = 1,
  @GeneratedBaseViewName = @GeneratedBaseViewName_5ea7e6abd541,
  @GeneratedBaseViewName_Clear = 1,
  @AllowDirectSQLInsert = @AllowDirectSQLInsert_5ea7e6abd541,
  @AllowDirectSQLUpdate = @AllowDirectSQLUpdate_5ea7e6abd541,
  @AllowDirectSQLDelete = @AllowDirectSQLDelete_5ea7e6abd541,
  @Configuration = @Configuration_5ea7e6abd541,
  @Configuration_Clear = 1,
  @SubtypeSelector = @SubtypeSelector_5ea7e6abd541,
  @SubtypeSelector_Clear = 1,
  @EnableFieldLevelSecurity = @EnableFieldLevelSecurity_5ea7e6abd541,
  @ID = @ID_5ea7e6abd541;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_ee757dd2f38e NVARCHAR(255),
@Description_ee757dd2f38e NVARCHAR(MAX),
@AutoUpdateDescription_ee757dd2f38e BIT,
@IsPrimaryKey_ee757dd2f38e BIT,
@IsUnique_ee757dd2f38e BIT,
@Category_ee757dd2f38e NVARCHAR(255),
@ValueListType_ee757dd2f38e NVARCHAR(20),
@ExtendedType_ee757dd2f38e NVARCHAR(50),
@CodeType_ee757dd2f38e NVARCHAR(50),
@DefaultInView_ee757dd2f38e BIT,
@ViewCellTemplate_ee757dd2f38e NVARCHAR(MAX),
@DefaultColumnWidth_ee757dd2f38e INT,
@AllowUpdateAPI_ee757dd2f38e BIT,
@AllowUpdateInView_ee757dd2f38e BIT,
@IncludeInUserSearchAPI_ee757dd2f38e BIT,
@FullTextSearchEnabled_ee757dd2f38e BIT,
@UserSearchParamFormatAPI_ee757dd2f38e NVARCHAR(500),
@IncludeInGeneratedForm_ee757dd2f38e BIT,
@GeneratedFormSection_ee757dd2f38e NVARCHAR(10),
@IsNameField_ee757dd2f38e BIT,
@RelatedEntityID_ee757dd2f38e UNIQUEIDENTIFIER,
@RelatedEntityFieldName_ee757dd2f38e NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e BIT,
@RelatedEntityNameFieldMap_ee757dd2f38e NVARCHAR(255),
@RelatedEntityDisplayType_ee757dd2f38e NVARCHAR(20),
@EntityIDFieldName_ee757dd2f38e NVARCHAR(100),
@ScopeDefault_ee757dd2f38e NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_ee757dd2f38e BIT,
@ValuesToPackWithSchema_ee757dd2f38e NVARCHAR(10),
@Status_ee757dd2f38e NVARCHAR(25),
@AutoUpdateIsNameField_ee757dd2f38e BIT,
@AutoUpdateDefaultInView_ee757dd2f38e BIT,
@AutoUpdateCategory_ee757dd2f38e BIT,
@AutoUpdateDisplayName_ee757dd2f38e BIT,
@AutoUpdateIncludeInUserSearchAPI_ee757dd2f38e BIT,
@Encrypt_ee757dd2f38e BIT,
@EncryptionKeyID_ee757dd2f38e UNIQUEIDENTIFIER,
@AllowDecryptInAPI_ee757dd2f38e BIT,
@SendEncryptedValue_ee757dd2f38e BIT,
@IsSoftPrimaryKey_ee757dd2f38e BIT,
@IsSoftForeignKey_ee757dd2f38e BIT,
@RelatedEntityJoinFields_ee757dd2f38e NVARCHAR(MAX),
@JSONType_ee757dd2f38e NVARCHAR(255),
@JSONTypeIsArray_ee757dd2f38e BIT,
@JSONTypeDefinition_ee757dd2f38e NVARCHAR(MAX),
@UserSearchPredicateAPI_ee757dd2f38e NVARCHAR(20),
@AutoUpdateUserSearchPredicate_ee757dd2f38e BIT,
@AutoUpdateFullTextSearch_ee757dd2f38e BIT,
@AutoUpdateExtendedType_ee757dd2f38e BIT,
@IsComputed_ee757dd2f38e BIT,
@EmbeddedRecord_ee757dd2f38e NVARCHAR(MAX),
@Configuration_ee757dd2f38e NVARCHAR(MAX),
@ID_ee757dd2f38e UNIQUEIDENTIFIER
SET
  @DisplayName_ee757dd2f38e = N'Form Response'
SET
  @Description_ee757dd2f38e = N'The response whose save owes this run'
SET
  @AutoUpdateDescription_ee757dd2f38e = 1
SET
  @IsPrimaryKey_ee757dd2f38e = 0
SET
  @IsUnique_ee757dd2f38e = 1
SET
  @Category_ee757dd2f38e = N'Automation Context'
SET
  @ValueListType_ee757dd2f38e = N'None'
SET
  @DefaultInView_ee757dd2f38e = 0
SET
  @DefaultColumnWidth_ee757dd2f38e = 150
SET
  @AllowUpdateAPI_ee757dd2f38e = 1
SET
  @AllowUpdateInView_ee757dd2f38e = 1
SET
  @IncludeInUserSearchAPI_ee757dd2f38e = 0
SET
  @FullTextSearchEnabled_ee757dd2f38e = 0
SET
  @IncludeInGeneratedForm_ee757dd2f38e = 1
SET
  @GeneratedFormSection_ee757dd2f38e = N'Category'
SET
  @IsNameField_ee757dd2f38e = 0
SET
  @RelatedEntityID_ee757dd2f38e = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @RelatedEntityFieldName_ee757dd2f38e = N'ID'
SET
  @IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e = 0
SET
  @RelatedEntityDisplayType_ee757dd2f38e = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_ee757dd2f38e = 1
SET
  @ValuesToPackWithSchema_ee757dd2f38e = N'Auto'
SET
  @Status_ee757dd2f38e = N'Active'
SET
  @AutoUpdateIsNameField_ee757dd2f38e = 1
SET
  @AutoUpdateDefaultInView_ee757dd2f38e = 1
SET
  @AutoUpdateCategory_ee757dd2f38e = 1
SET
  @AutoUpdateDisplayName_ee757dd2f38e = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_ee757dd2f38e = 1
SET
  @Encrypt_ee757dd2f38e = 0
SET
  @AllowDecryptInAPI_ee757dd2f38e = 0
SET
  @SendEncryptedValue_ee757dd2f38e = 0
SET
  @IsSoftPrimaryKey_ee757dd2f38e = 0
SET
  @IsSoftForeignKey_ee757dd2f38e = 0
SET
  @JSONTypeIsArray_ee757dd2f38e = 0
SET
  @UserSearchPredicateAPI_ee757dd2f38e = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_ee757dd2f38e = 1
SET
  @AutoUpdateFullTextSearch_ee757dd2f38e = 1
SET
  @AutoUpdateExtendedType_ee757dd2f38e = 1
SET
  @IsComputed_ee757dd2f38e = 0
SET
  @ID_ee757dd2f38e = '5046AC5F-AAC6-4723-A481-406BFDCF0937' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_ee757dd2f38e,
  @Description = @Description_ee757dd2f38e,
  @AutoUpdateDescription = @AutoUpdateDescription_ee757dd2f38e,
  @IsPrimaryKey = @IsPrimaryKey_ee757dd2f38e,
  @IsUnique = @IsUnique_ee757dd2f38e,
  @Category = @Category_ee757dd2f38e,
  @ValueListType = @ValueListType_ee757dd2f38e,
  @ExtendedType = @ExtendedType_ee757dd2f38e,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_ee757dd2f38e,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_ee757dd2f38e,
  @ViewCellTemplate = @ViewCellTemplate_ee757dd2f38e,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_ee757dd2f38e,
  @AllowUpdateAPI = @AllowUpdateAPI_ee757dd2f38e,
  @AllowUpdateInView = @AllowUpdateInView_ee757dd2f38e,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_ee757dd2f38e,
  @FullTextSearchEnabled = @FullTextSearchEnabled_ee757dd2f38e,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_ee757dd2f38e,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_ee757dd2f38e,
  @GeneratedFormSection = @GeneratedFormSection_ee757dd2f38e,
  @IsNameField = @IsNameField_ee757dd2f38e,
  @RelatedEntityID = @RelatedEntityID_ee757dd2f38e,
  @RelatedEntityFieldName = @RelatedEntityFieldName_ee757dd2f38e,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_ee757dd2f38e,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_ee757dd2f38e,
  @EntityIDFieldName = @EntityIDFieldName_ee757dd2f38e,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_ee757dd2f38e,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_ee757dd2f38e,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_ee757dd2f38e,
  @Status = @Status_ee757dd2f38e,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_ee757dd2f38e,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_ee757dd2f38e,
  @AutoUpdateCategory = @AutoUpdateCategory_ee757dd2f38e,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_ee757dd2f38e,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_ee757dd2f38e,
  @Encrypt = @Encrypt_ee757dd2f38e,
  @EncryptionKeyID = @EncryptionKeyID_ee757dd2f38e,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_ee757dd2f38e,
  @SendEncryptedValue = @SendEncryptedValue_ee757dd2f38e,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_ee757dd2f38e,
  @IsSoftForeignKey = @IsSoftForeignKey_ee757dd2f38e,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_ee757dd2f38e,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_ee757dd2f38e,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_ee757dd2f38e,
  @JSONTypeDefinition = @JSONTypeDefinition_ee757dd2f38e,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_ee757dd2f38e,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_ee757dd2f38e,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_ee757dd2f38e,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_ee757dd2f38e,
  @IsComputed = @IsComputed_ee757dd2f38e,
  @EmbeddedRecord = @EmbeddedRecord_ee757dd2f38e,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_ee757dd2f38e,
  @Configuration_Clear = 1,
  @ID = @ID_ee757dd2f38e;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_4f3ab01f9db0 NVARCHAR(255),
@Description_4f3ab01f9db0 NVARCHAR(MAX),
@AutoUpdateDescription_4f3ab01f9db0 BIT,
@IsPrimaryKey_4f3ab01f9db0 BIT,
@IsUnique_4f3ab01f9db0 BIT,
@Category_4f3ab01f9db0 NVARCHAR(255),
@ValueListType_4f3ab01f9db0 NVARCHAR(20),
@ExtendedType_4f3ab01f9db0 NVARCHAR(50),
@CodeType_4f3ab01f9db0 NVARCHAR(50),
@DefaultInView_4f3ab01f9db0 BIT,
@ViewCellTemplate_4f3ab01f9db0 NVARCHAR(MAX),
@DefaultColumnWidth_4f3ab01f9db0 INT,
@AllowUpdateAPI_4f3ab01f9db0 BIT,
@AllowUpdateInView_4f3ab01f9db0 BIT,
@IncludeInUserSearchAPI_4f3ab01f9db0 BIT,
@FullTextSearchEnabled_4f3ab01f9db0 BIT,
@UserSearchParamFormatAPI_4f3ab01f9db0 NVARCHAR(500),
@IncludeInGeneratedForm_4f3ab01f9db0 BIT,
@GeneratedFormSection_4f3ab01f9db0 NVARCHAR(10),
@IsNameField_4f3ab01f9db0 BIT,
@RelatedEntityID_4f3ab01f9db0 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_4f3ab01f9db0 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0 BIT,
@RelatedEntityNameFieldMap_4f3ab01f9db0 NVARCHAR(255),
@RelatedEntityDisplayType_4f3ab01f9db0 NVARCHAR(20),
@EntityIDFieldName_4f3ab01f9db0 NVARCHAR(100),
@ScopeDefault_4f3ab01f9db0 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_4f3ab01f9db0 BIT,
@ValuesToPackWithSchema_4f3ab01f9db0 NVARCHAR(10),
@Status_4f3ab01f9db0 NVARCHAR(25),
@AutoUpdateIsNameField_4f3ab01f9db0 BIT,
@AutoUpdateDefaultInView_4f3ab01f9db0 BIT,
@AutoUpdateCategory_4f3ab01f9db0 BIT,
@AutoUpdateDisplayName_4f3ab01f9db0 BIT,
@AutoUpdateIncludeInUserSearchAPI_4f3ab01f9db0 BIT,
@Encrypt_4f3ab01f9db0 BIT,
@EncryptionKeyID_4f3ab01f9db0 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_4f3ab01f9db0 BIT,
@SendEncryptedValue_4f3ab01f9db0 BIT,
@IsSoftPrimaryKey_4f3ab01f9db0 BIT,
@IsSoftForeignKey_4f3ab01f9db0 BIT,
@RelatedEntityJoinFields_4f3ab01f9db0 NVARCHAR(MAX),
@JSONType_4f3ab01f9db0 NVARCHAR(255),
@JSONTypeIsArray_4f3ab01f9db0 BIT,
@JSONTypeDefinition_4f3ab01f9db0 NVARCHAR(MAX),
@UserSearchPredicateAPI_4f3ab01f9db0 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_4f3ab01f9db0 BIT,
@AutoUpdateFullTextSearch_4f3ab01f9db0 BIT,
@AutoUpdateExtendedType_4f3ab01f9db0 BIT,
@IsComputed_4f3ab01f9db0 BIT,
@EmbeddedRecord_4f3ab01f9db0 NVARCHAR(MAX),
@Configuration_4f3ab01f9db0 NVARCHAR(MAX),
@ID_4f3ab01f9db0 UNIQUEIDENTIFIER
SET
  @DisplayName_4f3ab01f9db0 = N'Form Response'
SET
  @AutoUpdateDescription_4f3ab01f9db0 = 1
SET
  @IsPrimaryKey_4f3ab01f9db0 = 0
SET
  @IsUnique_4f3ab01f9db0 = 0
SET
  @Category_4f3ab01f9db0 = N'Automation Context'
SET
  @ValueListType_4f3ab01f9db0 = N'None'
SET
  @DefaultInView_4f3ab01f9db0 = 0
SET
  @DefaultColumnWidth_4f3ab01f9db0 = 150
SET
  @AllowUpdateAPI_4f3ab01f9db0 = 1
SET
  @AllowUpdateInView_4f3ab01f9db0 = 1
SET
  @IncludeInUserSearchAPI_4f3ab01f9db0 = 0
SET
  @FullTextSearchEnabled_4f3ab01f9db0 = 0
SET
  @IncludeInGeneratedForm_4f3ab01f9db0 = 1
SET
  @GeneratedFormSection_4f3ab01f9db0 = N'Category'
SET
  @IsNameField_4f3ab01f9db0 = 0
SET
  @RelatedEntityID_4f3ab01f9db0 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @RelatedEntityFieldName_4f3ab01f9db0 = N'ID'
SET
  @IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0 = 0
SET
  @RelatedEntityDisplayType_4f3ab01f9db0 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_4f3ab01f9db0 = 1
SET
  @ValuesToPackWithSchema_4f3ab01f9db0 = N'Auto'
SET
  @Status_4f3ab01f9db0 = N'Active'
SET
  @AutoUpdateIsNameField_4f3ab01f9db0 = 1
SET
  @AutoUpdateDefaultInView_4f3ab01f9db0 = 1
SET
  @AutoUpdateCategory_4f3ab01f9db0 = 1
SET
  @AutoUpdateDisplayName_4f3ab01f9db0 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_4f3ab01f9db0 = 1
SET
  @Encrypt_4f3ab01f9db0 = 0
SET
  @AllowDecryptInAPI_4f3ab01f9db0 = 0
SET
  @SendEncryptedValue_4f3ab01f9db0 = 0
SET
  @IsSoftPrimaryKey_4f3ab01f9db0 = 0
SET
  @IsSoftForeignKey_4f3ab01f9db0 = 0
SET
  @JSONTypeIsArray_4f3ab01f9db0 = 0
SET
  @UserSearchPredicateAPI_4f3ab01f9db0 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_4f3ab01f9db0 = 1
SET
  @AutoUpdateFullTextSearch_4f3ab01f9db0 = 1
SET
  @AutoUpdateExtendedType_4f3ab01f9db0 = 1
SET
  @IsComputed_4f3ab01f9db0 = 0
SET
  @ID_4f3ab01f9db0 = '4B524BE8-6C81-49ED-9AA5-B6E3C9D54635' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_4f3ab01f9db0,
  @Description = @Description_4f3ab01f9db0,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_4f3ab01f9db0,
  @IsPrimaryKey = @IsPrimaryKey_4f3ab01f9db0,
  @IsUnique = @IsUnique_4f3ab01f9db0,
  @Category = @Category_4f3ab01f9db0,
  @ValueListType = @ValueListType_4f3ab01f9db0,
  @ExtendedType = @ExtendedType_4f3ab01f9db0,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_4f3ab01f9db0,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_4f3ab01f9db0,
  @ViewCellTemplate = @ViewCellTemplate_4f3ab01f9db0,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_4f3ab01f9db0,
  @AllowUpdateAPI = @AllowUpdateAPI_4f3ab01f9db0,
  @AllowUpdateInView = @AllowUpdateInView_4f3ab01f9db0,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_4f3ab01f9db0,
  @FullTextSearchEnabled = @FullTextSearchEnabled_4f3ab01f9db0,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_4f3ab01f9db0,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_4f3ab01f9db0,
  @GeneratedFormSection = @GeneratedFormSection_4f3ab01f9db0,
  @IsNameField = @IsNameField_4f3ab01f9db0,
  @RelatedEntityID = @RelatedEntityID_4f3ab01f9db0,
  @RelatedEntityFieldName = @RelatedEntityFieldName_4f3ab01f9db0,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_4f3ab01f9db0,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_4f3ab01f9db0,
  @EntityIDFieldName = @EntityIDFieldName_4f3ab01f9db0,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_4f3ab01f9db0,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_4f3ab01f9db0,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_4f3ab01f9db0,
  @Status = @Status_4f3ab01f9db0,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_4f3ab01f9db0,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_4f3ab01f9db0,
  @AutoUpdateCategory = @AutoUpdateCategory_4f3ab01f9db0,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_4f3ab01f9db0,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_4f3ab01f9db0,
  @Encrypt = @Encrypt_4f3ab01f9db0,
  @EncryptionKeyID = @EncryptionKeyID_4f3ab01f9db0,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_4f3ab01f9db0,
  @SendEncryptedValue = @SendEncryptedValue_4f3ab01f9db0,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_4f3ab01f9db0,
  @IsSoftForeignKey = @IsSoftForeignKey_4f3ab01f9db0,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_4f3ab01f9db0,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_4f3ab01f9db0,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_4f3ab01f9db0,
  @JSONTypeDefinition = @JSONTypeDefinition_4f3ab01f9db0,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_4f3ab01f9db0,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_4f3ab01f9db0,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_4f3ab01f9db0,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_4f3ab01f9db0,
  @IsComputed = @IsComputed_4f3ab01f9db0,
  @EmbeddedRecord = @EmbeddedRecord_4f3ab01f9db0,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_4f3ab01f9db0,
  @Configuration_Clear = 1,
  @ID = @ID_4f3ab01f9db0;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_142ee16f9bd5 NVARCHAR(255),
@Description_142ee16f9bd5 NVARCHAR(MAX),
@AutoUpdateDescription_142ee16f9bd5 BIT,
@IsPrimaryKey_142ee16f9bd5 BIT,
@IsUnique_142ee16f9bd5 BIT,
@Category_142ee16f9bd5 NVARCHAR(255),
@ValueListType_142ee16f9bd5 NVARCHAR(20),
@ExtendedType_142ee16f9bd5 NVARCHAR(50),
@CodeType_142ee16f9bd5 NVARCHAR(50),
@DefaultInView_142ee16f9bd5 BIT,
@ViewCellTemplate_142ee16f9bd5 NVARCHAR(MAX),
@DefaultColumnWidth_142ee16f9bd5 INT,
@AllowUpdateAPI_142ee16f9bd5 BIT,
@AllowUpdateInView_142ee16f9bd5 BIT,
@IncludeInUserSearchAPI_142ee16f9bd5 BIT,
@FullTextSearchEnabled_142ee16f9bd5 BIT,
@UserSearchParamFormatAPI_142ee16f9bd5 NVARCHAR(500),
@IncludeInGeneratedForm_142ee16f9bd5 BIT,
@GeneratedFormSection_142ee16f9bd5 NVARCHAR(10),
@IsNameField_142ee16f9bd5 BIT,
@RelatedEntityID_142ee16f9bd5 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_142ee16f9bd5 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5 BIT,
@RelatedEntityNameFieldMap_142ee16f9bd5 NVARCHAR(255),
@RelatedEntityDisplayType_142ee16f9bd5 NVARCHAR(20),
@EntityIDFieldName_142ee16f9bd5 NVARCHAR(100),
@ScopeDefault_142ee16f9bd5 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_142ee16f9bd5 BIT,
@ValuesToPackWithSchema_142ee16f9bd5 NVARCHAR(10),
@Status_142ee16f9bd5 NVARCHAR(25),
@AutoUpdateIsNameField_142ee16f9bd5 BIT,
@AutoUpdateDefaultInView_142ee16f9bd5 BIT,
@AutoUpdateCategory_142ee16f9bd5 BIT,
@AutoUpdateDisplayName_142ee16f9bd5 BIT,
@AutoUpdateIncludeInUserSearchAPI_142ee16f9bd5 BIT,
@Encrypt_142ee16f9bd5 BIT,
@EncryptionKeyID_142ee16f9bd5 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_142ee16f9bd5 BIT,
@SendEncryptedValue_142ee16f9bd5 BIT,
@IsSoftPrimaryKey_142ee16f9bd5 BIT,
@IsSoftForeignKey_142ee16f9bd5 BIT,
@RelatedEntityJoinFields_142ee16f9bd5 NVARCHAR(MAX),
@JSONType_142ee16f9bd5 NVARCHAR(255),
@JSONTypeIsArray_142ee16f9bd5 BIT,
@JSONTypeDefinition_142ee16f9bd5 NVARCHAR(MAX),
@UserSearchPredicateAPI_142ee16f9bd5 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_142ee16f9bd5 BIT,
@AutoUpdateFullTextSearch_142ee16f9bd5 BIT,
@AutoUpdateExtendedType_142ee16f9bd5 BIT,
@IsComputed_142ee16f9bd5 BIT,
@EmbeddedRecord_142ee16f9bd5 NVARCHAR(MAX),
@Configuration_142ee16f9bd5 NVARCHAR(MAX),
@ID_142ee16f9bd5 UNIQUEIDENTIFIER
SET
  @DisplayName_142ee16f9bd5 = N'Form Response ID'
SET
  @AutoUpdateDescription_142ee16f9bd5 = 1
SET
  @IsPrimaryKey_142ee16f9bd5 = 0
SET
  @IsUnique_142ee16f9bd5 = 1
SET
  @Category_142ee16f9bd5 = N'Binding Details'
SET
  @ValueListType_142ee16f9bd5 = N'None'
SET
  @DefaultInView_142ee16f9bd5 = 0
SET
  @DefaultColumnWidth_142ee16f9bd5 = 150
SET
  @AllowUpdateAPI_142ee16f9bd5 = 1
SET
  @AllowUpdateInView_142ee16f9bd5 = 1
SET
  @IncludeInUserSearchAPI_142ee16f9bd5 = 0
SET
  @FullTextSearchEnabled_142ee16f9bd5 = 0
SET
  @IncludeInGeneratedForm_142ee16f9bd5 = 1
SET
  @GeneratedFormSection_142ee16f9bd5 = N'Category'
SET
  @IsNameField_142ee16f9bd5 = 0
SET
  @RelatedEntityID_142ee16f9bd5 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @RelatedEntityFieldName_142ee16f9bd5 = N'ID'
SET
  @IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5 = 0
SET
  @RelatedEntityDisplayType_142ee16f9bd5 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_142ee16f9bd5 = 1
SET
  @ValuesToPackWithSchema_142ee16f9bd5 = N'Auto'
SET
  @Status_142ee16f9bd5 = N'Active'
SET
  @AutoUpdateIsNameField_142ee16f9bd5 = 1
SET
  @AutoUpdateDefaultInView_142ee16f9bd5 = 1
SET
  @AutoUpdateCategory_142ee16f9bd5 = 1
SET
  @AutoUpdateDisplayName_142ee16f9bd5 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_142ee16f9bd5 = 1
SET
  @Encrypt_142ee16f9bd5 = 0
SET
  @AllowDecryptInAPI_142ee16f9bd5 = 0
SET
  @SendEncryptedValue_142ee16f9bd5 = 0
SET
  @IsSoftPrimaryKey_142ee16f9bd5 = 0
SET
  @IsSoftForeignKey_142ee16f9bd5 = 0
SET
  @JSONTypeIsArray_142ee16f9bd5 = 0
SET
  @UserSearchPredicateAPI_142ee16f9bd5 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_142ee16f9bd5 = 1
SET
  @AutoUpdateFullTextSearch_142ee16f9bd5 = 1
SET
  @AutoUpdateExtendedType_142ee16f9bd5 = 1
SET
  @IsComputed_142ee16f9bd5 = 0
SET
  @ID_142ee16f9bd5 = 'BA8E088C-65BD-4FA6-870E-4E3AB919C38B' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_142ee16f9bd5,
  @Description = @Description_142ee16f9bd5,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_142ee16f9bd5,
  @IsPrimaryKey = @IsPrimaryKey_142ee16f9bd5,
  @IsUnique = @IsUnique_142ee16f9bd5,
  @Category = @Category_142ee16f9bd5,
  @ValueListType = @ValueListType_142ee16f9bd5,
  @ExtendedType = @ExtendedType_142ee16f9bd5,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_142ee16f9bd5,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_142ee16f9bd5,
  @ViewCellTemplate = @ViewCellTemplate_142ee16f9bd5,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_142ee16f9bd5,
  @AllowUpdateAPI = @AllowUpdateAPI_142ee16f9bd5,
  @AllowUpdateInView = @AllowUpdateInView_142ee16f9bd5,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_142ee16f9bd5,
  @FullTextSearchEnabled = @FullTextSearchEnabled_142ee16f9bd5,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_142ee16f9bd5,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_142ee16f9bd5,
  @GeneratedFormSection = @GeneratedFormSection_142ee16f9bd5,
  @IsNameField = @IsNameField_142ee16f9bd5,
  @RelatedEntityID = @RelatedEntityID_142ee16f9bd5,
  @RelatedEntityFieldName = @RelatedEntityFieldName_142ee16f9bd5,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_142ee16f9bd5,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_142ee16f9bd5,
  @EntityIDFieldName = @EntityIDFieldName_142ee16f9bd5,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_142ee16f9bd5,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_142ee16f9bd5,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_142ee16f9bd5,
  @Status = @Status_142ee16f9bd5,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_142ee16f9bd5,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_142ee16f9bd5,
  @AutoUpdateCategory = @AutoUpdateCategory_142ee16f9bd5,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_142ee16f9bd5,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_142ee16f9bd5,
  @Encrypt = @Encrypt_142ee16f9bd5,
  @EncryptionKeyID = @EncryptionKeyID_142ee16f9bd5,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_142ee16f9bd5,
  @SendEncryptedValue = @SendEncryptedValue_142ee16f9bd5,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_142ee16f9bd5,
  @IsSoftForeignKey = @IsSoftForeignKey_142ee16f9bd5,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_142ee16f9bd5,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_142ee16f9bd5,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_142ee16f9bd5,
  @JSONTypeDefinition = @JSONTypeDefinition_142ee16f9bd5,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_142ee16f9bd5,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_142ee16f9bd5,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_142ee16f9bd5,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_142ee16f9bd5,
  @IsComputed = @IsComputed_142ee16f9bd5,
  @EmbeddedRecord = @EmbeddedRecord_142ee16f9bd5,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_142ee16f9bd5,
  @Configuration_Clear = 1,
  @ID = @ID_142ee16f9bd5;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_980580dcbe83 NVARCHAR(255),
@Description_980580dcbe83 NVARCHAR(MAX),
@AutoUpdateDescription_980580dcbe83 BIT,
@IsPrimaryKey_980580dcbe83 BIT,
@IsUnique_980580dcbe83 BIT,
@Category_980580dcbe83 NVARCHAR(255),
@ValueListType_980580dcbe83 NVARCHAR(20),
@ExtendedType_980580dcbe83 NVARCHAR(50),
@CodeType_980580dcbe83 NVARCHAR(50),
@DefaultInView_980580dcbe83 BIT,
@ViewCellTemplate_980580dcbe83 NVARCHAR(MAX),
@DefaultColumnWidth_980580dcbe83 INT,
@AllowUpdateAPI_980580dcbe83 BIT,
@AllowUpdateInView_980580dcbe83 BIT,
@IncludeInUserSearchAPI_980580dcbe83 BIT,
@FullTextSearchEnabled_980580dcbe83 BIT,
@UserSearchParamFormatAPI_980580dcbe83 NVARCHAR(500),
@IncludeInGeneratedForm_980580dcbe83 BIT,
@GeneratedFormSection_980580dcbe83 NVARCHAR(10),
@IsNameField_980580dcbe83 BIT,
@RelatedEntityID_980580dcbe83 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_980580dcbe83 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_980580dcbe83 BIT,
@RelatedEntityNameFieldMap_980580dcbe83 NVARCHAR(255),
@RelatedEntityDisplayType_980580dcbe83 NVARCHAR(20),
@EntityIDFieldName_980580dcbe83 NVARCHAR(100),
@ScopeDefault_980580dcbe83 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_980580dcbe83 BIT,
@ValuesToPackWithSchema_980580dcbe83 NVARCHAR(10),
@Status_980580dcbe83 NVARCHAR(25),
@AutoUpdateIsNameField_980580dcbe83 BIT,
@AutoUpdateDefaultInView_980580dcbe83 BIT,
@AutoUpdateCategory_980580dcbe83 BIT,
@AutoUpdateDisplayName_980580dcbe83 BIT,
@AutoUpdateIncludeInUserSearchAPI_980580dcbe83 BIT,
@Encrypt_980580dcbe83 BIT,
@EncryptionKeyID_980580dcbe83 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_980580dcbe83 BIT,
@SendEncryptedValue_980580dcbe83 BIT,
@IsSoftPrimaryKey_980580dcbe83 BIT,
@IsSoftForeignKey_980580dcbe83 BIT,
@RelatedEntityJoinFields_980580dcbe83 NVARCHAR(MAX),
@JSONType_980580dcbe83 NVARCHAR(255),
@JSONTypeIsArray_980580dcbe83 BIT,
@JSONTypeDefinition_980580dcbe83 NVARCHAR(MAX),
@UserSearchPredicateAPI_980580dcbe83 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_980580dcbe83 BIT,
@AutoUpdateFullTextSearch_980580dcbe83 BIT,
@AutoUpdateExtendedType_980580dcbe83 BIT,
@IsComputed_980580dcbe83 BIT,
@EmbeddedRecord_980580dcbe83 NVARCHAR(MAX),
@Configuration_980580dcbe83 NVARCHAR(MAX),
@ID_980580dcbe83 UNIQUEIDENTIFIER
SET
  @DisplayName_980580dcbe83 = N'Response'
SET
  @AutoUpdateDescription_980580dcbe83 = 1
SET
  @IsPrimaryKey_980580dcbe83 = 0
SET
  @IsUnique_980580dcbe83 = 0
SET
  @Category_980580dcbe83 = N'Form Response Context'
SET
  @ValueListType_980580dcbe83 = N'None'
SET
  @DefaultInView_980580dcbe83 = 0
SET
  @DefaultColumnWidth_980580dcbe83 = 150
SET
  @AllowUpdateAPI_980580dcbe83 = 1
SET
  @AllowUpdateInView_980580dcbe83 = 1
SET
  @IncludeInUserSearchAPI_980580dcbe83 = 0
SET
  @FullTextSearchEnabled_980580dcbe83 = 0
SET
  @IncludeInGeneratedForm_980580dcbe83 = 1
SET
  @GeneratedFormSection_980580dcbe83 = N'Category'
SET
  @IsNameField_980580dcbe83 = 0
SET
  @RelatedEntityID_980580dcbe83 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @RelatedEntityFieldName_980580dcbe83 = N'ID'
SET
  @IncludeRelatedEntityNameFieldInBaseView_980580dcbe83 = 0
SET
  @RelatedEntityDisplayType_980580dcbe83 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_980580dcbe83 = 1
SET
  @ValuesToPackWithSchema_980580dcbe83 = N'Auto'
SET
  @Status_980580dcbe83 = N'Active'
SET
  @AutoUpdateIsNameField_980580dcbe83 = 1
SET
  @AutoUpdateDefaultInView_980580dcbe83 = 1
SET
  @AutoUpdateCategory_980580dcbe83 = 1
SET
  @AutoUpdateDisplayName_980580dcbe83 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_980580dcbe83 = 1
SET
  @Encrypt_980580dcbe83 = 0
SET
  @AllowDecryptInAPI_980580dcbe83 = 0
SET
  @SendEncryptedValue_980580dcbe83 = 0
SET
  @IsSoftPrimaryKey_980580dcbe83 = 0
SET
  @IsSoftForeignKey_980580dcbe83 = 0
SET
  @JSONTypeIsArray_980580dcbe83 = 0
SET
  @UserSearchPredicateAPI_980580dcbe83 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_980580dcbe83 = 1
SET
  @AutoUpdateFullTextSearch_980580dcbe83 = 1
SET
  @AutoUpdateExtendedType_980580dcbe83 = 1
SET
  @IsComputed_980580dcbe83 = 0
SET
  @ID_980580dcbe83 = 'B4D02511-4EB2-4D84-A3F7-A1B9D15666D9' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_980580dcbe83,
  @Description = @Description_980580dcbe83,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_980580dcbe83,
  @IsPrimaryKey = @IsPrimaryKey_980580dcbe83,
  @IsUnique = @IsUnique_980580dcbe83,
  @Category = @Category_980580dcbe83,
  @ValueListType = @ValueListType_980580dcbe83,
  @ExtendedType = @ExtendedType_980580dcbe83,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_980580dcbe83,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_980580dcbe83,
  @ViewCellTemplate = @ViewCellTemplate_980580dcbe83,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_980580dcbe83,
  @AllowUpdateAPI = @AllowUpdateAPI_980580dcbe83,
  @AllowUpdateInView = @AllowUpdateInView_980580dcbe83,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_980580dcbe83,
  @FullTextSearchEnabled = @FullTextSearchEnabled_980580dcbe83,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_980580dcbe83,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_980580dcbe83,
  @GeneratedFormSection = @GeneratedFormSection_980580dcbe83,
  @IsNameField = @IsNameField_980580dcbe83,
  @RelatedEntityID = @RelatedEntityID_980580dcbe83,
  @RelatedEntityFieldName = @RelatedEntityFieldName_980580dcbe83,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_980580dcbe83,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_980580dcbe83,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_980580dcbe83,
  @EntityIDFieldName = @EntityIDFieldName_980580dcbe83,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_980580dcbe83,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_980580dcbe83,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_980580dcbe83,
  @Status = @Status_980580dcbe83,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_980580dcbe83,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_980580dcbe83,
  @AutoUpdateCategory = @AutoUpdateCategory_980580dcbe83,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_980580dcbe83,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_980580dcbe83,
  @Encrypt = @Encrypt_980580dcbe83,
  @EncryptionKeyID = @EncryptionKeyID_980580dcbe83,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_980580dcbe83,
  @SendEncryptedValue = @SendEncryptedValue_980580dcbe83,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_980580dcbe83,
  @IsSoftForeignKey = @IsSoftForeignKey_980580dcbe83,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_980580dcbe83,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_980580dcbe83,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_980580dcbe83,
  @JSONTypeDefinition = @JSONTypeDefinition_980580dcbe83,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_980580dcbe83,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_980580dcbe83,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_980580dcbe83,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_980580dcbe83,
  @IsComputed = @IsComputed_980580dcbe83,
  @EmbeddedRecord = @EmbeddedRecord_980580dcbe83,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_980580dcbe83,
  @Configuration_Clear = 1,
  @ID = @ID_980580dcbe83;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_af90f6299da0 NVARCHAR(255),
@Description_af90f6299da0 NVARCHAR(MAX),
@AutoUpdateDescription_af90f6299da0 BIT,
@IsPrimaryKey_af90f6299da0 BIT,
@IsUnique_af90f6299da0 BIT,
@Category_af90f6299da0 NVARCHAR(255),
@ValueListType_af90f6299da0 NVARCHAR(20),
@ExtendedType_af90f6299da0 NVARCHAR(50),
@CodeType_af90f6299da0 NVARCHAR(50),
@DefaultInView_af90f6299da0 BIT,
@ViewCellTemplate_af90f6299da0 NVARCHAR(MAX),
@DefaultColumnWidth_af90f6299da0 INT,
@AllowUpdateAPI_af90f6299da0 BIT,
@AllowUpdateInView_af90f6299da0 BIT,
@IncludeInUserSearchAPI_af90f6299da0 BIT,
@FullTextSearchEnabled_af90f6299da0 BIT,
@UserSearchParamFormatAPI_af90f6299da0 NVARCHAR(500),
@IncludeInGeneratedForm_af90f6299da0 BIT,
@GeneratedFormSection_af90f6299da0 NVARCHAR(10),
@IsNameField_af90f6299da0 BIT,
@RelatedEntityID_af90f6299da0 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_af90f6299da0 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_af90f6299da0 BIT,
@RelatedEntityNameFieldMap_af90f6299da0 NVARCHAR(255),
@RelatedEntityDisplayType_af90f6299da0 NVARCHAR(20),
@EntityIDFieldName_af90f6299da0 NVARCHAR(100),
@ScopeDefault_af90f6299da0 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_af90f6299da0 BIT,
@ValuesToPackWithSchema_af90f6299da0 NVARCHAR(10),
@Status_af90f6299da0 NVARCHAR(25),
@AutoUpdateIsNameField_af90f6299da0 BIT,
@AutoUpdateDefaultInView_af90f6299da0 BIT,
@AutoUpdateCategory_af90f6299da0 BIT,
@AutoUpdateDisplayName_af90f6299da0 BIT,
@AutoUpdateIncludeInUserSearchAPI_af90f6299da0 BIT,
@Encrypt_af90f6299da0 BIT,
@EncryptionKeyID_af90f6299da0 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_af90f6299da0 BIT,
@SendEncryptedValue_af90f6299da0 BIT,
@IsSoftPrimaryKey_af90f6299da0 BIT,
@IsSoftForeignKey_af90f6299da0 BIT,
@RelatedEntityJoinFields_af90f6299da0 NVARCHAR(MAX),
@JSONType_af90f6299da0 NVARCHAR(255),
@JSONTypeIsArray_af90f6299da0 BIT,
@JSONTypeDefinition_af90f6299da0 NVARCHAR(MAX),
@UserSearchPredicateAPI_af90f6299da0 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_af90f6299da0 BIT,
@AutoUpdateFullTextSearch_af90f6299da0 BIT,
@AutoUpdateExtendedType_af90f6299da0 BIT,
@IsComputed_af90f6299da0 BIT,
@EmbeddedRecord_af90f6299da0 NVARCHAR(MAX),
@Configuration_af90f6299da0 NVARCHAR(MAX),
@ID_af90f6299da0 UNIQUEIDENTIFIER
SET
  @DisplayName_af90f6299da0 = N'Form Name'
SET
  @AutoUpdateDescription_af90f6299da0 = 1
SET
  @IsPrimaryKey_af90f6299da0 = 0
SET
  @IsUnique_af90f6299da0 = 0
SET
  @Category_af90f6299da0 = N'Form & Status'
SET
  @ValueListType_af90f6299da0 = N'None'
SET
  @DefaultInView_af90f6299da0 = 1
SET
  @DefaultColumnWidth_af90f6299da0 = 150
SET
  @AllowUpdateAPI_af90f6299da0 = 0
SET
  @AllowUpdateInView_af90f6299da0 = 1
SET
  @IncludeInUserSearchAPI_af90f6299da0 = 1
SET
  @FullTextSearchEnabled_af90f6299da0 = 0
SET
  @IncludeInGeneratedForm_af90f6299da0 = 1
SET
  @GeneratedFormSection_af90f6299da0 = N'Category'
SET
  @IsNameField_af90f6299da0 = 1
SET
  @IncludeRelatedEntityNameFieldInBaseView_af90f6299da0 = 0
SET
  @RelatedEntityDisplayType_af90f6299da0 = N'Search'
SET
  @AutoUpdateRelatedEntityInfo_af90f6299da0 = 1
SET
  @ValuesToPackWithSchema_af90f6299da0 = N'Auto'
SET
  @Status_af90f6299da0 = N'Active'
SET
  @AutoUpdateIsNameField_af90f6299da0 = 0
SET
  @AutoUpdateDefaultInView_af90f6299da0 = 1
SET
  @AutoUpdateCategory_af90f6299da0 = 1
SET
  @AutoUpdateDisplayName_af90f6299da0 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_af90f6299da0 = 1
SET
  @Encrypt_af90f6299da0 = 0
SET
  @AllowDecryptInAPI_af90f6299da0 = 0
SET
  @SendEncryptedValue_af90f6299da0 = 0
SET
  @IsSoftPrimaryKey_af90f6299da0 = 0
SET
  @IsSoftForeignKey_af90f6299da0 = 0
SET
  @JSONTypeIsArray_af90f6299da0 = 0
SET
  @UserSearchPredicateAPI_af90f6299da0 = N'Contains'
SET
  @AutoUpdateUserSearchPredicate_af90f6299da0 = 1
SET
  @AutoUpdateFullTextSearch_af90f6299da0 = 1
SET
  @AutoUpdateExtendedType_af90f6299da0 = 1
SET
  @IsComputed_af90f6299da0 = 0
SET
  @ID_af90f6299da0 = '6A6FCA68-3ED7-437A-85FF-E94B903994C3' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_af90f6299da0,
  @Description = @Description_af90f6299da0,
  @Description_Clear = 1,
  @AutoUpdateDescription = @AutoUpdateDescription_af90f6299da0,
  @IsPrimaryKey = @IsPrimaryKey_af90f6299da0,
  @IsUnique = @IsUnique_af90f6299da0,
  @Category = @Category_af90f6299da0,
  @ValueListType = @ValueListType_af90f6299da0,
  @ExtendedType = @ExtendedType_af90f6299da0,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_af90f6299da0,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_af90f6299da0,
  @ViewCellTemplate = @ViewCellTemplate_af90f6299da0,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_af90f6299da0,
  @AllowUpdateAPI = @AllowUpdateAPI_af90f6299da0,
  @AllowUpdateInView = @AllowUpdateInView_af90f6299da0,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_af90f6299da0,
  @FullTextSearchEnabled = @FullTextSearchEnabled_af90f6299da0,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_af90f6299da0,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_af90f6299da0,
  @GeneratedFormSection = @GeneratedFormSection_af90f6299da0,
  @IsNameField = @IsNameField_af90f6299da0,
  @RelatedEntityID = @RelatedEntityID_af90f6299da0,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_af90f6299da0,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_af90f6299da0,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_af90f6299da0,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_af90f6299da0,
  @EntityIDFieldName = @EntityIDFieldName_af90f6299da0,
  @EntityIDFieldName_Clear = 1,
  @ScopeDefault = @ScopeDefault_af90f6299da0,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_af90f6299da0,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_af90f6299da0,
  @Status = @Status_af90f6299da0,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_af90f6299da0,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_af90f6299da0,
  @AutoUpdateCategory = @AutoUpdateCategory_af90f6299da0,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_af90f6299da0,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_af90f6299da0,
  @Encrypt = @Encrypt_af90f6299da0,
  @EncryptionKeyID = @EncryptionKeyID_af90f6299da0,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_af90f6299da0,
  @SendEncryptedValue = @SendEncryptedValue_af90f6299da0,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_af90f6299da0,
  @IsSoftForeignKey = @IsSoftForeignKey_af90f6299da0,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_af90f6299da0,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_af90f6299da0,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_af90f6299da0,
  @JSONTypeDefinition = @JSONTypeDefinition_af90f6299da0,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_af90f6299da0,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_af90f6299da0,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_af90f6299da0,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_af90f6299da0,
  @IsComputed = @IsComputed_af90f6299da0,
  @EmbeddedRecord = @EmbeddedRecord_af90f6299da0,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_af90f6299da0,
  @Configuration_Clear = 1,
  @ID = @ID_af90f6299da0;

GO

-- Save MJ: Entity Fields (core SP call only)
DECLARE @DisplayName_c4797657cff5 NVARCHAR(255),
@Description_c4797657cff5 NVARCHAR(MAX),
@AutoUpdateDescription_c4797657cff5 BIT,
@IsPrimaryKey_c4797657cff5 BIT,
@IsUnique_c4797657cff5 BIT,
@Category_c4797657cff5 NVARCHAR(255),
@ValueListType_c4797657cff5 NVARCHAR(20),
@ExtendedType_c4797657cff5 NVARCHAR(50),
@CodeType_c4797657cff5 NVARCHAR(50),
@DefaultInView_c4797657cff5 BIT,
@ViewCellTemplate_c4797657cff5 NVARCHAR(MAX),
@DefaultColumnWidth_c4797657cff5 INT,
@AllowUpdateAPI_c4797657cff5 BIT,
@AllowUpdateInView_c4797657cff5 BIT,
@IncludeInUserSearchAPI_c4797657cff5 BIT,
@FullTextSearchEnabled_c4797657cff5 BIT,
@UserSearchParamFormatAPI_c4797657cff5 NVARCHAR(500),
@IncludeInGeneratedForm_c4797657cff5 BIT,
@GeneratedFormSection_c4797657cff5 NVARCHAR(10),
@IsNameField_c4797657cff5 BIT,
@RelatedEntityID_c4797657cff5 UNIQUEIDENTIFIER,
@RelatedEntityFieldName_c4797657cff5 NVARCHAR(255),
@IncludeRelatedEntityNameFieldInBaseView_c4797657cff5 BIT,
@RelatedEntityNameFieldMap_c4797657cff5 NVARCHAR(255),
@RelatedEntityDisplayType_c4797657cff5 NVARCHAR(20),
@EntityIDFieldName_c4797657cff5 NVARCHAR(100),
@ScopeDefault_c4797657cff5 NVARCHAR(100),
@AutoUpdateRelatedEntityInfo_c4797657cff5 BIT,
@ValuesToPackWithSchema_c4797657cff5 NVARCHAR(10),
@Status_c4797657cff5 NVARCHAR(25),
@AutoUpdateIsNameField_c4797657cff5 BIT,
@AutoUpdateDefaultInView_c4797657cff5 BIT,
@AutoUpdateCategory_c4797657cff5 BIT,
@AutoUpdateDisplayName_c4797657cff5 BIT,
@AutoUpdateIncludeInUserSearchAPI_c4797657cff5 BIT,
@Encrypt_c4797657cff5 BIT,
@EncryptionKeyID_c4797657cff5 UNIQUEIDENTIFIER,
@AllowDecryptInAPI_c4797657cff5 BIT,
@SendEncryptedValue_c4797657cff5 BIT,
@IsSoftPrimaryKey_c4797657cff5 BIT,
@IsSoftForeignKey_c4797657cff5 BIT,
@RelatedEntityJoinFields_c4797657cff5 NVARCHAR(MAX),
@JSONType_c4797657cff5 NVARCHAR(255),
@JSONTypeIsArray_c4797657cff5 BIT,
@JSONTypeDefinition_c4797657cff5 NVARCHAR(MAX),
@UserSearchPredicateAPI_c4797657cff5 NVARCHAR(20),
@AutoUpdateUserSearchPredicate_c4797657cff5 BIT,
@AutoUpdateFullTextSearch_c4797657cff5 BIT,
@AutoUpdateExtendedType_c4797657cff5 BIT,
@IsComputed_c4797657cff5 BIT,
@EmbeddedRecord_c4797657cff5 NVARCHAR(MAX),
@Configuration_c4797657cff5 NVARCHAR(MAX),
@ID_c4797657cff5 UNIQUEIDENTIFIER
SET
  @DisplayName_c4797657cff5 = N'Target Record ID'
SET
  @Description_c4797657cff5 = N'Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped'
SET
  @AutoUpdateDescription_c4797657cff5 = 1
SET
  @IsPrimaryKey_c4797657cff5 = 0
SET
  @IsUnique_c4797657cff5 = 0
SET
  @Category_c4797657cff5 = N'Execution Context'
SET
  @ValueListType_c4797657cff5 = N'None'
SET
  @DefaultInView_c4797657cff5 = 1
SET
  @DefaultColumnWidth_c4797657cff5 = 150
SET
  @AllowUpdateAPI_c4797657cff5 = 1
SET
  @AllowUpdateInView_c4797657cff5 = 1
SET
  @IncludeInUserSearchAPI_c4797657cff5 = 1
SET
  @FullTextSearchEnabled_c4797657cff5 = 0
SET
  @IncludeInGeneratedForm_c4797657cff5 = 1
SET
  @GeneratedFormSection_c4797657cff5 = N'Category'
SET
  @IsNameField_c4797657cff5 = 0
SET
  @IncludeRelatedEntityNameFieldInBaseView_c4797657cff5 = 0
SET
  @RelatedEntityDisplayType_c4797657cff5 = N'Search'
SET
  @EntityIDFieldName_c4797657cff5 = N'TargetEntityID'
SET
  @AutoUpdateRelatedEntityInfo_c4797657cff5 = 1
SET
  @ValuesToPackWithSchema_c4797657cff5 = N'Auto'
SET
  @Status_c4797657cff5 = N'Active'
SET
  @AutoUpdateIsNameField_c4797657cff5 = 1
SET
  @AutoUpdateDefaultInView_c4797657cff5 = 1
SET
  @AutoUpdateCategory_c4797657cff5 = 1
SET
  @AutoUpdateDisplayName_c4797657cff5 = 1
SET
  @AutoUpdateIncludeInUserSearchAPI_c4797657cff5 = 1
SET
  @Encrypt_c4797657cff5 = 0
SET
  @AllowDecryptInAPI_c4797657cff5 = 0
SET
  @SendEncryptedValue_c4797657cff5 = 0
SET
  @IsSoftPrimaryKey_c4797657cff5 = 0
SET
  @IsSoftForeignKey_c4797657cff5 = 0
SET
  @JSONTypeIsArray_c4797657cff5 = 0
SET
  @UserSearchPredicateAPI_c4797657cff5 = N'Exact'
SET
  @AutoUpdateUserSearchPredicate_c4797657cff5 = 1
SET
  @AutoUpdateFullTextSearch_c4797657cff5 = 1
SET
  @AutoUpdateExtendedType_c4797657cff5 = 1
SET
  @IsComputed_c4797657cff5 = 0
SET
  @ID_c4797657cff5 = 'D8664C7D-C78E-40AA-9E42-94CDF189DCB6' EXEC [${mjSchema}].spUpdateEntityField @DisplayName = @DisplayName_c4797657cff5,
  @Description = @Description_c4797657cff5,
  @AutoUpdateDescription = @AutoUpdateDescription_c4797657cff5,
  @IsPrimaryKey = @IsPrimaryKey_c4797657cff5,
  @IsUnique = @IsUnique_c4797657cff5,
  @Category = @Category_c4797657cff5,
  @ValueListType = @ValueListType_c4797657cff5,
  @ExtendedType = @ExtendedType_c4797657cff5,
  @ExtendedType_Clear = 1,
  @CodeType = @CodeType_c4797657cff5,
  @CodeType_Clear = 1,
  @DefaultInView = @DefaultInView_c4797657cff5,
  @ViewCellTemplate = @ViewCellTemplate_c4797657cff5,
  @ViewCellTemplate_Clear = 1,
  @DefaultColumnWidth = @DefaultColumnWidth_c4797657cff5,
  @AllowUpdateAPI = @AllowUpdateAPI_c4797657cff5,
  @AllowUpdateInView = @AllowUpdateInView_c4797657cff5,
  @IncludeInUserSearchAPI = @IncludeInUserSearchAPI_c4797657cff5,
  @FullTextSearchEnabled = @FullTextSearchEnabled_c4797657cff5,
  @UserSearchParamFormatAPI = @UserSearchParamFormatAPI_c4797657cff5,
  @UserSearchParamFormatAPI_Clear = 1,
  @IncludeInGeneratedForm = @IncludeInGeneratedForm_c4797657cff5,
  @GeneratedFormSection = @GeneratedFormSection_c4797657cff5,
  @IsNameField = @IsNameField_c4797657cff5,
  @RelatedEntityID = @RelatedEntityID_c4797657cff5,
  @RelatedEntityID_Clear = 1,
  @RelatedEntityFieldName = @RelatedEntityFieldName_c4797657cff5,
  @RelatedEntityFieldName_Clear = 1,
  @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_c4797657cff5,
  @RelatedEntityNameFieldMap = @RelatedEntityNameFieldMap_c4797657cff5,
  @RelatedEntityNameFieldMap_Clear = 1,
  @RelatedEntityDisplayType = @RelatedEntityDisplayType_c4797657cff5,
  @EntityIDFieldName = @EntityIDFieldName_c4797657cff5,
  @ScopeDefault = @ScopeDefault_c4797657cff5,
  @ScopeDefault_Clear = 1,
  @AutoUpdateRelatedEntityInfo = @AutoUpdateRelatedEntityInfo_c4797657cff5,
  @ValuesToPackWithSchema = @ValuesToPackWithSchema_c4797657cff5,
  @Status = @Status_c4797657cff5,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_c4797657cff5,
  @AutoUpdateDefaultInView = @AutoUpdateDefaultInView_c4797657cff5,
  @AutoUpdateCategory = @AutoUpdateCategory_c4797657cff5,
  @AutoUpdateDisplayName = @AutoUpdateDisplayName_c4797657cff5,
  @AutoUpdateIncludeInUserSearchAPI = @AutoUpdateIncludeInUserSearchAPI_c4797657cff5,
  @Encrypt = @Encrypt_c4797657cff5,
  @EncryptionKeyID = @EncryptionKeyID_c4797657cff5,
  @EncryptionKeyID_Clear = 1,
  @AllowDecryptInAPI = @AllowDecryptInAPI_c4797657cff5,
  @SendEncryptedValue = @SendEncryptedValue_c4797657cff5,
  @IsSoftPrimaryKey = @IsSoftPrimaryKey_c4797657cff5,
  @IsSoftForeignKey = @IsSoftForeignKey_c4797657cff5,
  @RelatedEntityJoinFields = @RelatedEntityJoinFields_c4797657cff5,
  @RelatedEntityJoinFields_Clear = 1,
  @JSONType = @JSONType_c4797657cff5,
  @JSONType_Clear = 1,
  @JSONTypeIsArray = @JSONTypeIsArray_c4797657cff5,
  @JSONTypeDefinition = @JSONTypeDefinition_c4797657cff5,
  @JSONTypeDefinition_Clear = 1,
  @UserSearchPredicateAPI = @UserSearchPredicateAPI_c4797657cff5,
  @AutoUpdateUserSearchPredicate = @AutoUpdateUserSearchPredicate_c4797657cff5,
  @AutoUpdateFullTextSearch = @AutoUpdateFullTextSearch_c4797657cff5,
  @AutoUpdateExtendedType = @AutoUpdateExtendedType_c4797657cff5,
  @IsComputed = @IsComputed_c4797657cff5,
  @EmbeddedRecord = @EmbeddedRecord_c4797657cff5,
  @EmbeddedRecord_Clear = 1,
  @Configuration = @Configuration_c4797657cff5,
  @Configuration_Clear = 1,
  @ID = @ID_c4797657cff5;

GO

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @EntityID_9279cae5c157 UNIQUEIDENTIFIER,
@Sequence_9279cae5c157 INT,
@RelatedEntityID_9279cae5c157 UNIQUEIDENTIFIER,
@BundleInAPI_9279cae5c157 BIT,
@IncludeInParentAllQuery_9279cae5c157 BIT,
@Type_9279cae5c157 NCHAR(20),
@EntityKeyField_9279cae5c157 NVARCHAR(255),
@RelatedEntityJoinField_9279cae5c157 NVARCHAR(255),
@JoinView_9279cae5c157 NVARCHAR(255),
@JoinEntityJoinField_9279cae5c157 NVARCHAR(255),
@JoinEntityInverseJoinField_9279cae5c157 NVARCHAR(255),
@DisplayInForm_9279cae5c157 BIT,
@DisplayLocation_9279cae5c157 NVARCHAR(50),
@DisplayName_9279cae5c157 NVARCHAR(255),
@DisplayIconType_9279cae5c157 NVARCHAR(50),
@DisplayIcon_9279cae5c157 NVARCHAR(255),
@DisplayComponentID_9279cae5c157 UNIQUEIDENTIFIER,
@DisplayComponentConfiguration_9279cae5c157 NVARCHAR(MAX),
@AutoUpdateFromSchema_9279cae5c157 BIT,
@AdditionalFieldsToInclude_9279cae5c157 NVARCHAR(MAX),
@AutoUpdateAdditionalFieldsToInclude_9279cae5c157 BIT,
@RelatedRecordCollection_9279cae5c157 NVARCHAR(MAX),
@Configuration_9279cae5c157 NVARCHAR(MAX),
@ID_9279cae5c157 UNIQUEIDENTIFIER
SET
  @EntityID_9279cae5c157 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'
SET
  @Sequence_9279cae5c157 = 4
SET
  @RelatedEntityID_9279cae5c157 = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6'
SET
  @BundleInAPI_9279cae5c157 = 1
SET
  @IncludeInParentAllQuery_9279cae5c157 = 0
SET
  @Type_9279cae5c157 = N'One To Many'
SET
  @RelatedEntityJoinField_9279cae5c157 = N'FormID'
SET
  @DisplayInForm_9279cae5c157 = 1
SET
  @DisplayLocation_9279cae5c157 = N'After Field Tabs'
SET
  @DisplayIconType_9279cae5c157 = N'Related Entity Icon'
SET
  @AutoUpdateFromSchema_9279cae5c157 = 1
SET
  @AutoUpdateAdditionalFieldsToInclude_9279cae5c157 = 1
SET
  @RelatedRecordCollection_9279cae5c157 = N'{
  "Name": "Pages",
  "Source": "database",
  "ReadOnly": false,
  "Load": "immediate",
  "OnRemove": "delete",
  "OrderBy": "DisplayOrder ASC",
  "Sequence": {
    "Field": "DisplayOrder",
    "From": 0
  },
  "ClearAfterSave": false
}'
SET
  @ID_9279cae5c157 = '5981266E-6F57-45DF-A394-9AAEABD5AC7F' EXEC [${mjSchema}].spUpdateEntityRelationship @EntityID = @EntityID_9279cae5c157,
  @Sequence = @Sequence_9279cae5c157,
  @RelatedEntityID = @RelatedEntityID_9279cae5c157,
  @BundleInAPI = @BundleInAPI_9279cae5c157,
  @IncludeInParentAllQuery = @IncludeInParentAllQuery_9279cae5c157,
  @Type = @Type_9279cae5c157,
  @EntityKeyField = @EntityKeyField_9279cae5c157,
  @EntityKeyField_Clear = 1,
  @RelatedEntityJoinField = @RelatedEntityJoinField_9279cae5c157,
  @JoinView = @JoinView_9279cae5c157,
  @JoinView_Clear = 1,
  @JoinEntityJoinField = @JoinEntityJoinField_9279cae5c157,
  @JoinEntityJoinField_Clear = 1,
  @JoinEntityInverseJoinField = @JoinEntityInverseJoinField_9279cae5c157,
  @JoinEntityInverseJoinField_Clear = 1,
  @DisplayInForm = @DisplayInForm_9279cae5c157,
  @DisplayLocation = @DisplayLocation_9279cae5c157,
  @DisplayName = @DisplayName_9279cae5c157,
  @DisplayName_Clear = 1,
  @DisplayIconType = @DisplayIconType_9279cae5c157,
  @DisplayIcon = @DisplayIcon_9279cae5c157,
  @DisplayIcon_Clear = 1,
  @DisplayComponentID = @DisplayComponentID_9279cae5c157,
  @DisplayComponentID_Clear = 1,
  @DisplayComponentConfiguration = @DisplayComponentConfiguration_9279cae5c157,
  @DisplayComponentConfiguration_Clear = 1,
  @AutoUpdateFromSchema = @AutoUpdateFromSchema_9279cae5c157,
  @AdditionalFieldsToInclude = @AdditionalFieldsToInclude_9279cae5c157,
  @AdditionalFieldsToInclude_Clear = 1,
  @AutoUpdateAdditionalFieldsToInclude = @AutoUpdateAdditionalFieldsToInclude_9279cae5c157,
  @RelatedRecordCollection = @RelatedRecordCollection_9279cae5c157,
  @Configuration = @Configuration_9279cae5c157,
  @Configuration_Clear = 1,
  @ID = @ID_9279cae5c157;

GO

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @EntityID_5c144ef5bad3 UNIQUEIDENTIFIER,
@Sequence_5c144ef5bad3 INT,
@RelatedEntityID_5c144ef5bad3 UNIQUEIDENTIFIER,
@BundleInAPI_5c144ef5bad3 BIT,
@IncludeInParentAllQuery_5c144ef5bad3 BIT,
@Type_5c144ef5bad3 NCHAR(20),
@EntityKeyField_5c144ef5bad3 NVARCHAR(255),
@RelatedEntityJoinField_5c144ef5bad3 NVARCHAR(255),
@JoinView_5c144ef5bad3 NVARCHAR(255),
@JoinEntityJoinField_5c144ef5bad3 NVARCHAR(255),
@JoinEntityInverseJoinField_5c144ef5bad3 NVARCHAR(255),
@DisplayInForm_5c144ef5bad3 BIT,
@DisplayLocation_5c144ef5bad3 NVARCHAR(50),
@DisplayName_5c144ef5bad3 NVARCHAR(255),
@DisplayIconType_5c144ef5bad3 NVARCHAR(50),
@DisplayIcon_5c144ef5bad3 NVARCHAR(255),
@DisplayComponentID_5c144ef5bad3 UNIQUEIDENTIFIER,
@DisplayComponentConfiguration_5c144ef5bad3 NVARCHAR(MAX),
@AutoUpdateFromSchema_5c144ef5bad3 BIT,
@AdditionalFieldsToInclude_5c144ef5bad3 NVARCHAR(MAX),
@AutoUpdateAdditionalFieldsToInclude_5c144ef5bad3 BIT,
@RelatedRecordCollection_5c144ef5bad3 NVARCHAR(MAX),
@Configuration_5c144ef5bad3 NVARCHAR(MAX),
@ID_5c144ef5bad3 UNIQUEIDENTIFIER
SET
  @EntityID_5c144ef5bad3 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'
SET
  @Sequence_5c144ef5bad3 = 9
SET
  @RelatedEntityID_5c144ef5bad3 = (SELECT TOP 1 [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}')
IF @RelatedEntityID_5c144ef5bad3 IS NULL
    THROW 51162, 'MJ Forms V202610220041: no [Entity] row for FormScreen in this app''s schema, so the Forms -> Form Screens relationship cannot be updated.', 1;
SET
  @BundleInAPI_5c144ef5bad3 = 1
SET
  @IncludeInParentAllQuery_5c144ef5bad3 = 0
SET
  @Type_5c144ef5bad3 = N'One To Many'
SET
  @RelatedEntityJoinField_5c144ef5bad3 = N'FormID'
SET
  @DisplayInForm_5c144ef5bad3 = 1
SET
  @DisplayLocation_5c144ef5bad3 = N'After Field Tabs'
SET
  @DisplayIconType_5c144ef5bad3 = N'Related Entity Icon'
SET
  @AutoUpdateFromSchema_5c144ef5bad3 = 1
SET
  @AutoUpdateAdditionalFieldsToInclude_5c144ef5bad3 = 1
SET
  @RelatedRecordCollection_5c144ef5bad3 = N'{
  "Name": "Screens",
  "Source": "database",
  "ReadOnly": false,
  "Load": "immediate",
  "OnRemove": "delete",
  "OrderBy": "DisplayOrder ASC",
  "ClearAfterSave": false
}'
SET
  @ID_5c144ef5bad3 = '6729890A-D62C-4806-8FD3-3CE466FD0395' EXEC [${mjSchema}].spUpdateEntityRelationship @EntityID = @EntityID_5c144ef5bad3,
  @Sequence = @Sequence_5c144ef5bad3,
  @RelatedEntityID = @RelatedEntityID_5c144ef5bad3,
  @BundleInAPI = @BundleInAPI_5c144ef5bad3,
  @IncludeInParentAllQuery = @IncludeInParentAllQuery_5c144ef5bad3,
  @Type = @Type_5c144ef5bad3,
  @EntityKeyField = @EntityKeyField_5c144ef5bad3,
  @EntityKeyField_Clear = 1,
  @RelatedEntityJoinField = @RelatedEntityJoinField_5c144ef5bad3,
  @JoinView = @JoinView_5c144ef5bad3,
  @JoinView_Clear = 1,
  @JoinEntityJoinField = @JoinEntityJoinField_5c144ef5bad3,
  @JoinEntityJoinField_Clear = 1,
  @JoinEntityInverseJoinField = @JoinEntityInverseJoinField_5c144ef5bad3,
  @JoinEntityInverseJoinField_Clear = 1,
  @DisplayInForm = @DisplayInForm_5c144ef5bad3,
  @DisplayLocation = @DisplayLocation_5c144ef5bad3,
  @DisplayName = @DisplayName_5c144ef5bad3,
  @DisplayName_Clear = 1,
  @DisplayIconType = @DisplayIconType_5c144ef5bad3,
  @DisplayIcon = @DisplayIcon_5c144ef5bad3,
  @DisplayIcon_Clear = 1,
  @DisplayComponentID = @DisplayComponentID_5c144ef5bad3,
  @DisplayComponentID_Clear = 1,
  @DisplayComponentConfiguration = @DisplayComponentConfiguration_5c144ef5bad3,
  @DisplayComponentConfiguration_Clear = 1,
  @AutoUpdateFromSchema = @AutoUpdateFromSchema_5c144ef5bad3,
  @AdditionalFieldsToInclude = @AdditionalFieldsToInclude_5c144ef5bad3,
  @AdditionalFieldsToInclude_Clear = 1,
  @AutoUpdateAdditionalFieldsToInclude = @AutoUpdateAdditionalFieldsToInclude_5c144ef5bad3,
  @RelatedRecordCollection = @RelatedRecordCollection_5c144ef5bad3,
  @Configuration = @Configuration_5c144ef5bad3,
  @Configuration_Clear = 1,
  @ID = @ID_5c144ef5bad3;

GO

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @EntityID_ce025202a2ff UNIQUEIDENTIFIER,
@Sequence_ce025202a2ff INT,
@RelatedEntityID_ce025202a2ff UNIQUEIDENTIFIER,
@BundleInAPI_ce025202a2ff BIT,
@IncludeInParentAllQuery_ce025202a2ff BIT,
@Type_ce025202a2ff NCHAR(20),
@EntityKeyField_ce025202a2ff NVARCHAR(255),
@RelatedEntityJoinField_ce025202a2ff NVARCHAR(255),
@JoinView_ce025202a2ff NVARCHAR(255),
@JoinEntityJoinField_ce025202a2ff NVARCHAR(255),
@JoinEntityInverseJoinField_ce025202a2ff NVARCHAR(255),
@DisplayInForm_ce025202a2ff BIT,
@DisplayLocation_ce025202a2ff NVARCHAR(50),
@DisplayName_ce025202a2ff NVARCHAR(255),
@DisplayIconType_ce025202a2ff NVARCHAR(50),
@DisplayIcon_ce025202a2ff NVARCHAR(255),
@DisplayComponentID_ce025202a2ff UNIQUEIDENTIFIER,
@DisplayComponentConfiguration_ce025202a2ff NVARCHAR(MAX),
@AutoUpdateFromSchema_ce025202a2ff BIT,
@AdditionalFieldsToInclude_ce025202a2ff NVARCHAR(MAX),
@AutoUpdateAdditionalFieldsToInclude_ce025202a2ff BIT,
@RelatedRecordCollection_ce025202a2ff NVARCHAR(MAX),
@Configuration_ce025202a2ff NVARCHAR(MAX),
@ID_ce025202a2ff UNIQUEIDENTIFIER
SET
  @EntityID_ce025202a2ff = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6'
SET
  @Sequence_ce025202a2ff = 1
SET
  @RelatedEntityID_ce025202a2ff = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97'
SET
  @BundleInAPI_ce025202a2ff = 1
SET
  @IncludeInParentAllQuery_ce025202a2ff = 0
SET
  @Type_ce025202a2ff = N'One To Many'
SET
  @RelatedEntityJoinField_ce025202a2ff = N'PageID'
SET
  @DisplayInForm_ce025202a2ff = 1
SET
  @DisplayLocation_ce025202a2ff = N'After Field Tabs'
SET
  @DisplayIconType_ce025202a2ff = N'Related Entity Icon'
SET
  @AutoUpdateFromSchema_ce025202a2ff = 1
SET
  @AutoUpdateAdditionalFieldsToInclude_ce025202a2ff = 1
SET
  @RelatedRecordCollection_ce025202a2ff = N'{
  "Name": "Questions",
  "Source": "database",
  "ReadOnly": false,
  "Load": "immediate",
  "OnRemove": "delete",
  "OrderBy": "DisplayOrder ASC",
  "Sequence": {
    "Field": "DisplayOrder",
    "From": 0
  },
  "ClearAfterSave": false
}'
SET
  @ID_ce025202a2ff = 'EFF9400A-94DA-4F3C-85AA-9A5492DC1867' EXEC [${mjSchema}].spUpdateEntityRelationship @EntityID = @EntityID_ce025202a2ff,
  @Sequence = @Sequence_ce025202a2ff,
  @RelatedEntityID = @RelatedEntityID_ce025202a2ff,
  @BundleInAPI = @BundleInAPI_ce025202a2ff,
  @IncludeInParentAllQuery = @IncludeInParentAllQuery_ce025202a2ff,
  @Type = @Type_ce025202a2ff,
  @EntityKeyField = @EntityKeyField_ce025202a2ff,
  @EntityKeyField_Clear = 1,
  @RelatedEntityJoinField = @RelatedEntityJoinField_ce025202a2ff,
  @JoinView = @JoinView_ce025202a2ff,
  @JoinView_Clear = 1,
  @JoinEntityJoinField = @JoinEntityJoinField_ce025202a2ff,
  @JoinEntityJoinField_Clear = 1,
  @JoinEntityInverseJoinField = @JoinEntityInverseJoinField_ce025202a2ff,
  @JoinEntityInverseJoinField_Clear = 1,
  @DisplayInForm = @DisplayInForm_ce025202a2ff,
  @DisplayLocation = @DisplayLocation_ce025202a2ff,
  @DisplayName = @DisplayName_ce025202a2ff,
  @DisplayName_Clear = 1,
  @DisplayIconType = @DisplayIconType_ce025202a2ff,
  @DisplayIcon = @DisplayIcon_ce025202a2ff,
  @DisplayIcon_Clear = 1,
  @DisplayComponentID = @DisplayComponentID_ce025202a2ff,
  @DisplayComponentID_Clear = 1,
  @DisplayComponentConfiguration = @DisplayComponentConfiguration_ce025202a2ff,
  @DisplayComponentConfiguration_Clear = 1,
  @AutoUpdateFromSchema = @AutoUpdateFromSchema_ce025202a2ff,
  @AdditionalFieldsToInclude = @AdditionalFieldsToInclude_ce025202a2ff,
  @AdditionalFieldsToInclude_Clear = 1,
  @AutoUpdateAdditionalFieldsToInclude = @AutoUpdateAdditionalFieldsToInclude_ce025202a2ff,
  @RelatedRecordCollection = @RelatedRecordCollection_ce025202a2ff,
  @Configuration = @Configuration_ce025202a2ff,
  @Configuration_Clear = 1,
  @ID = @ID_ce025202a2ff;

GO

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @EntityID_99ed7dcf754b UNIQUEIDENTIFIER,
@Sequence_99ed7dcf754b INT,
@RelatedEntityID_99ed7dcf754b UNIQUEIDENTIFIER,
@BundleInAPI_99ed7dcf754b BIT,
@IncludeInParentAllQuery_99ed7dcf754b BIT,
@Type_99ed7dcf754b NCHAR(20),
@EntityKeyField_99ed7dcf754b NVARCHAR(255),
@RelatedEntityJoinField_99ed7dcf754b NVARCHAR(255),
@JoinView_99ed7dcf754b NVARCHAR(255),
@JoinEntityJoinField_99ed7dcf754b NVARCHAR(255),
@JoinEntityInverseJoinField_99ed7dcf754b NVARCHAR(255),
@DisplayInForm_99ed7dcf754b BIT,
@DisplayLocation_99ed7dcf754b NVARCHAR(50),
@DisplayName_99ed7dcf754b NVARCHAR(255),
@DisplayIconType_99ed7dcf754b NVARCHAR(50),
@DisplayIcon_99ed7dcf754b NVARCHAR(255),
@DisplayComponentID_99ed7dcf754b UNIQUEIDENTIFIER,
@DisplayComponentConfiguration_99ed7dcf754b NVARCHAR(MAX),
@AutoUpdateFromSchema_99ed7dcf754b BIT,
@AdditionalFieldsToInclude_99ed7dcf754b NVARCHAR(MAX),
@AutoUpdateAdditionalFieldsToInclude_99ed7dcf754b BIT,
@RelatedRecordCollection_99ed7dcf754b NVARCHAR(MAX),
@Configuration_99ed7dcf754b NVARCHAR(MAX),
@ID_99ed7dcf754b UNIQUEIDENTIFIER
SET
  @EntityID_99ed7dcf754b = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97'
SET
  @Sequence_99ed7dcf754b = 1
SET
  @RelatedEntityID_99ed7dcf754b = 'BF3016E2-8BA7-4975-83B6-02C9435C1441'
SET
  @BundleInAPI_99ed7dcf754b = 1
SET
  @IncludeInParentAllQuery_99ed7dcf754b = 0
SET
  @Type_99ed7dcf754b = N'One To Many'
SET
  @RelatedEntityJoinField_99ed7dcf754b = N'QuestionID'
SET
  @DisplayInForm_99ed7dcf754b = 1
SET
  @DisplayLocation_99ed7dcf754b = N'After Field Tabs'
SET
  @DisplayIconType_99ed7dcf754b = N'Related Entity Icon'
SET
  @AutoUpdateFromSchema_99ed7dcf754b = 1
SET
  @AutoUpdateAdditionalFieldsToInclude_99ed7dcf754b = 1
SET
  @RelatedRecordCollection_99ed7dcf754b = N'{
  "Name": "Options",
  "Source": "database",
  "ReadOnly": false,
  "Load": "immediate",
  "OnRemove": "delete",
  "OrderBy": "DisplayOrder ASC",
  "Sequence": {
    "Field": "DisplayOrder",
    "From": 0
  },
  "ClearAfterSave": false
}'
SET
  @ID_99ed7dcf754b = '60B1B456-9EAA-4B65-902C-47EB232E5CA1' EXEC [${mjSchema}].spUpdateEntityRelationship @EntityID = @EntityID_99ed7dcf754b,
  @Sequence = @Sequence_99ed7dcf754b,
  @RelatedEntityID = @RelatedEntityID_99ed7dcf754b,
  @BundleInAPI = @BundleInAPI_99ed7dcf754b,
  @IncludeInParentAllQuery = @IncludeInParentAllQuery_99ed7dcf754b,
  @Type = @Type_99ed7dcf754b,
  @EntityKeyField = @EntityKeyField_99ed7dcf754b,
  @EntityKeyField_Clear = 1,
  @RelatedEntityJoinField = @RelatedEntityJoinField_99ed7dcf754b,
  @JoinView = @JoinView_99ed7dcf754b,
  @JoinView_Clear = 1,
  @JoinEntityJoinField = @JoinEntityJoinField_99ed7dcf754b,
  @JoinEntityJoinField_Clear = 1,
  @JoinEntityInverseJoinField = @JoinEntityInverseJoinField_99ed7dcf754b,
  @JoinEntityInverseJoinField_Clear = 1,
  @DisplayInForm = @DisplayInForm_99ed7dcf754b,
  @DisplayLocation = @DisplayLocation_99ed7dcf754b,
  @DisplayName = @DisplayName_99ed7dcf754b,
  @DisplayName_Clear = 1,
  @DisplayIconType = @DisplayIconType_99ed7dcf754b,
  @DisplayIcon = @DisplayIcon_99ed7dcf754b,
  @DisplayIcon_Clear = 1,
  @DisplayComponentID = @DisplayComponentID_99ed7dcf754b,
  @DisplayComponentID_Clear = 1,
  @DisplayComponentConfiguration = @DisplayComponentConfiguration_99ed7dcf754b,
  @DisplayComponentConfiguration_Clear = 1,
  @AutoUpdateFromSchema = @AutoUpdateFromSchema_99ed7dcf754b,
  @AdditionalFieldsToInclude = @AdditionalFieldsToInclude_99ed7dcf754b,
  @AdditionalFieldsToInclude_Clear = 1,
  @AutoUpdateAdditionalFieldsToInclude = @AutoUpdateAdditionalFieldsToInclude_99ed7dcf754b,
  @RelatedRecordCollection = @RelatedRecordCollection_99ed7dcf754b,
  @Configuration = @Configuration_99ed7dcf754b,
  @Configuration_Clear = 1,
  @ID = @ID_99ed7dcf754b;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @CategoryID_9eed791439d5 UNIQUEIDENTIFIER,
@Name_9eed791439d5 NVARCHAR(425),
@Description_9eed791439d5 NVARCHAR(MAX),
@Type_9eed791439d5 NVARCHAR(20),
@UserPrompt_9eed791439d5 NVARCHAR(MAX),
@UserComments_9eed791439d5 NVARCHAR(MAX),
@Code_9eed791439d5 NVARCHAR(MAX),
@CodeComments_9eed791439d5 NVARCHAR(MAX),
@CodeApprovalStatus_9eed791439d5 NVARCHAR(20),
@CodeApprovalComments_9eed791439d5 NVARCHAR(MAX),
@CodeApprovedByUserID_9eed791439d5 UNIQUEIDENTIFIER,
@CodeApprovedAt_9eed791439d5 DATETIMEOFFSET,
@CodeLocked_9eed791439d5 BIT,
@ForceCodeGeneration_9eed791439d5 BIT,
@RetentionPeriod_9eed791439d5 INT,
@Status_9eed791439d5 NVARCHAR(20),
@DriverClass_9eed791439d5 NVARCHAR(255),
@ParentID_9eed791439d5 UNIQUEIDENTIFIER,
@IconClass_9eed791439d5 NVARCHAR(100),
@DefaultCompactPromptID_9eed791439d5 UNIQUEIDENTIFIER,
@Config_9eed791439d5 NVARCHAR(MAX),
@RuntimeActionConfiguration_9eed791439d5 NVARCHAR(MAX),
@MaxExecutionTimeMS_9eed791439d5 INT,
@CreatedByAgentID_9eed791439d5 UNIQUEIDENTIFIER,
@ID_9eed791439d5 UNIQUEIDENTIFIER
SET
  @CategoryID_9eed791439d5 = '7F0C0001-A1B2-4C3D-8E4F-000000000001'
SET
  @Name_9eed791439d5 = N'Forms: Generate Form From Brief'
SET
  @Description_9eed791439d5 = N'AI form authoring — turns a natural-language brief (for example ''a 5-question event RSVP with dietary restrictions and a +1 count'') into a draft Form with pages, questions, and options (or, with PublishImmediately, a published one), using the highest-power Claude model with a zod-validated blueprint.'
SET
  @Type_9eed791439d5 = N'Custom'
SET
  @CodeApprovalStatus_9eed791439d5 = N'Pending'
SET
  @CodeLocked_9eed791439d5 = 0
SET
  @ForceCodeGeneration_9eed791439d5 = 0
SET
  @Status_9eed791439d5 = N'Active'
SET
  @DriverClass_9eed791439d5 = N'Forms: Generate Form From Brief'
SET
  @IconClass_9eed791439d5 = N'fa-solid fa-wand-magic-sparkles'
SET
  @ID_9eed791439d5 = '7F0A0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateAction @CategoryID = @CategoryID_9eed791439d5,
  @Name = @Name_9eed791439d5,
  @Description = @Description_9eed791439d5,
  @Type = @Type_9eed791439d5,
  @UserPrompt = @UserPrompt_9eed791439d5,
  @UserPrompt_Clear = 1,
  @UserComments = @UserComments_9eed791439d5,
  @UserComments_Clear = 1,
  @Code = @Code_9eed791439d5,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_9eed791439d5,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_9eed791439d5,
  @CodeApprovalComments = @CodeApprovalComments_9eed791439d5,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_9eed791439d5,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_9eed791439d5,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_9eed791439d5,
  @ForceCodeGeneration = @ForceCodeGeneration_9eed791439d5,
  @RetentionPeriod = @RetentionPeriod_9eed791439d5,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_9eed791439d5,
  @DriverClass = @DriverClass_9eed791439d5,
  @ParentID = @ParentID_9eed791439d5,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_9eed791439d5,
  @DefaultCompactPromptID = @DefaultCompactPromptID_9eed791439d5,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_9eed791439d5,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_9eed791439d5,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_9eed791439d5,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_9eed791439d5,
  @CreatedByAgentID_Clear = 1,
  @ID = @ID_9eed791439d5;

GO

-- Save MJ: Actions (core SP call only)
DECLARE @CategoryID_ffd784d813c0 UNIQUEIDENTIFIER,
@Name_ffd784d813c0 NVARCHAR(425),
@Description_ffd784d813c0 NVARCHAR(MAX),
@Type_ffd784d813c0 NVARCHAR(20),
@UserPrompt_ffd784d813c0 NVARCHAR(MAX),
@UserComments_ffd784d813c0 NVARCHAR(MAX),
@Code_ffd784d813c0 NVARCHAR(MAX),
@CodeComments_ffd784d813c0 NVARCHAR(MAX),
@CodeApprovalStatus_ffd784d813c0 NVARCHAR(20),
@CodeApprovalComments_ffd784d813c0 NVARCHAR(MAX),
@CodeApprovedByUserID_ffd784d813c0 UNIQUEIDENTIFIER,
@CodeApprovedAt_ffd784d813c0 DATETIMEOFFSET,
@CodeLocked_ffd784d813c0 BIT,
@ForceCodeGeneration_ffd784d813c0 BIT,
@RetentionPeriod_ffd784d813c0 INT,
@Status_ffd784d813c0 NVARCHAR(20),
@DriverClass_ffd784d813c0 NVARCHAR(255),
@ParentID_ffd784d813c0 UNIQUEIDENTIFIER,
@IconClass_ffd784d813c0 NVARCHAR(100),
@DefaultCompactPromptID_ffd784d813c0 UNIQUEIDENTIFIER,
@Config_ffd784d813c0 NVARCHAR(MAX),
@RuntimeActionConfiguration_ffd784d813c0 NVARCHAR(MAX),
@MaxExecutionTimeMS_ffd784d813c0 INT,
@CreatedByAgentID_ffd784d813c0 UNIQUEIDENTIFIER,
@ID_ffd784d813c0 UNIQUEIDENTIFIER
SET
  @CategoryID_ffd784d813c0 = '7F0C0001-A1B2-4C3D-8E4F-000000000001'
SET
  @Name_ffd784d813c0 = N'Forms: Create Form From Template'
SET
  @Description_ffd784d813c0 = N'No-AI authoring — instantiates a starter-gallery template (Contact, RSVP, NPS/feedback, Lead capture, Application) into a draft Form (or, with PublishImmediately, a published one).'
SET
  @Type_ffd784d813c0 = N'Custom'
SET
  @CodeApprovalStatus_ffd784d813c0 = N'Pending'
SET
  @CodeLocked_ffd784d813c0 = 0
SET
  @ForceCodeGeneration_ffd784d813c0 = 0
SET
  @Status_ffd784d813c0 = N'Active'
SET
  @DriverClass_ffd784d813c0 = N'Forms: Create Form From Template'
SET
  @IconClass_ffd784d813c0 = N'fa-solid fa-table-list'
SET
  @ID_ffd784d813c0 = '7F0A0002-A1B2-4C3D-8E4F-000000000002' EXEC [${mjSchema}].spUpdateAction @CategoryID = @CategoryID_ffd784d813c0,
  @Name = @Name_ffd784d813c0,
  @Description = @Description_ffd784d813c0,
  @Type = @Type_ffd784d813c0,
  @UserPrompt = @UserPrompt_ffd784d813c0,
  @UserPrompt_Clear = 1,
  @UserComments = @UserComments_ffd784d813c0,
  @UserComments_Clear = 1,
  @Code = @Code_ffd784d813c0,
  @Code_Clear = 1,
  @CodeComments = @CodeComments_ffd784d813c0,
  @CodeComments_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_ffd784d813c0,
  @CodeApprovalComments = @CodeApprovalComments_ffd784d813c0,
  @CodeApprovalComments_Clear = 1,
  @CodeApprovedByUserID = @CodeApprovedByUserID_ffd784d813c0,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_ffd784d813c0,
  @CodeApprovedAt_Clear = 1,
  @CodeLocked = @CodeLocked_ffd784d813c0,
  @ForceCodeGeneration = @ForceCodeGeneration_ffd784d813c0,
  @RetentionPeriod = @RetentionPeriod_ffd784d813c0,
  @RetentionPeriod_Clear = 1,
  @Status = @Status_ffd784d813c0,
  @DriverClass = @DriverClass_ffd784d813c0,
  @ParentID = @ParentID_ffd784d813c0,
  @ParentID_Clear = 1,
  @IconClass = @IconClass_ffd784d813c0,
  @DefaultCompactPromptID = @DefaultCompactPromptID_ffd784d813c0,
  @DefaultCompactPromptID_Clear = 1,
  @Config = @Config_ffd784d813c0,
  @Config_Clear = 1,
  @RuntimeActionConfiguration = @RuntimeActionConfiguration_ffd784d813c0,
  @RuntimeActionConfiguration_Clear = 1,
  @MaxExecutionTimeMS = @MaxExecutionTimeMS_ffd784d813c0,
  @MaxExecutionTimeMS_Clear = 1,
  @CreatedByAgentID = @CreatedByAgentID_ffd784d813c0,
  @CreatedByAgentID_Clear = 1,
  @ID = @ID_ffd784d813c0;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_b4c318d0c80c UNIQUEIDENTIFIER,
@ActionID_b4c318d0c80c UNIQUEIDENTIFIER,
@Name_b4c318d0c80c NVARCHAR(255),
@DefaultValue_b4c318d0c80c NVARCHAR(MAX),
@Type_b4c318d0c80c NCHAR(10),
@ValueType_b4c318d0c80c NVARCHAR(30),
@IsArray_b4c318d0c80c BIT,
@Description_b4c318d0c80c NVARCHAR(MAX),
@IsRequired_b4c318d0c80c BIT,
@MediaModality_b4c318d0c80c NVARCHAR(20),
@LogValue_b4c318d0c80c BIT
SET
  @ID_b4c318d0c80c = '6BE06A2B-6244-488C-A046-5ECE3094D3EA'
SET
  @ActionID_b4c318d0c80c = '7F0A0001-A1B2-4C3D-8E4F-000000000001'
SET
  @Name_b4c318d0c80c = N'PublishImmediately'
SET
  @Type_b4c318d0c80c = N'Input'
SET
  @ValueType_b4c318d0c80c = N'Scalar'
SET
  @IsArray_b4c318d0c80c = 0
SET
  @Description_b4c318d0c80c = N'Publish the form as soon as it is built, in the same transaction: the caller gets a published form (version 1) or, if the publish is refused, no form at all. Default false leaves a draft. Must be true or false; any other value is refused.'
SET
  @IsRequired_b4c318d0c80c = 0
SET
  @LogValue_b4c318d0c80c = 1
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_b4c318d0c80c,
  @ActionID = @ActionID_b4c318d0c80c,
  @Name = @Name_b4c318d0c80c,
  @DefaultValue = @DefaultValue_b4c318d0c80c,
  @DefaultValue_Clear = 1,
  @Type = @Type_b4c318d0c80c,
  @ValueType = @ValueType_b4c318d0c80c,
  @IsArray = @IsArray_b4c318d0c80c,
  @Description = @Description_b4c318d0c80c,
  @IsRequired = @IsRequired_b4c318d0c80c,
  @MediaModality = @MediaModality_b4c318d0c80c,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_b4c318d0c80c;

GO

-- Save MJ: Action Params (core SP call only)
DECLARE @ID_70c7fcf9b20d UNIQUEIDENTIFIER,
@ActionID_70c7fcf9b20d UNIQUEIDENTIFIER,
@Name_70c7fcf9b20d NVARCHAR(255),
@DefaultValue_70c7fcf9b20d NVARCHAR(MAX),
@Type_70c7fcf9b20d NCHAR(10),
@ValueType_70c7fcf9b20d NVARCHAR(30),
@IsArray_70c7fcf9b20d BIT,
@Description_70c7fcf9b20d NVARCHAR(MAX),
@IsRequired_70c7fcf9b20d BIT,
@MediaModality_70c7fcf9b20d NVARCHAR(20),
@LogValue_70c7fcf9b20d BIT
SET
  @ID_70c7fcf9b20d = '915294F3-4365-44E8-B277-5DB62B4DE19D'
SET
  @ActionID_70c7fcf9b20d = '7F0A0002-A1B2-4C3D-8E4F-000000000002'
SET
  @Name_70c7fcf9b20d = N'PublishImmediately'
SET
  @Type_70c7fcf9b20d = N'Input'
SET
  @ValueType_70c7fcf9b20d = N'Scalar'
SET
  @IsArray_70c7fcf9b20d = 0
SET
  @Description_70c7fcf9b20d = N'Publish the form as soon as it is built, in the same transaction: the caller gets a published form (version 1) or, if the publish is refused, no form at all. Default false leaves a draft. Must be true or false; any other value is refused.'
SET
  @IsRequired_70c7fcf9b20d = 0
SET
  @LogValue_70c7fcf9b20d = 1
EXEC [${mjSchema}].spCreateActionParam @ID = @ID_70c7fcf9b20d,
  @ActionID = @ActionID_70c7fcf9b20d,
  @Name = @Name_70c7fcf9b20d,
  @DefaultValue = @DefaultValue_70c7fcf9b20d,
  @DefaultValue_Clear = 1,
  @Type = @Type_70c7fcf9b20d,
  @ValueType = @ValueType_70c7fcf9b20d,
  @IsArray = @IsArray_70c7fcf9b20d,
  @Description = @Description_70c7fcf9b20d,
  @IsRequired = @IsRequired_70c7fcf9b20d,
  @MediaModality = @MediaModality_70c7fcf9b20d,
  @MediaModality_Clear = 1,
  @LogValue = @LogValue_70c7fcf9b20d;

GO

-- Save MJ: API Scopes (core SP call only)
DECLARE @ID_3062b0c97736 UNIQUEIDENTIFIER,
@Name_3062b0c97736 NVARCHAR(100),
@Category_3062b0c97736 NVARCHAR(100),
@Description_3062b0c97736 NVARCHAR(500),
@ParentID_3062b0c97736 UNIQUEIDENTIFIER,
@FullPath_3062b0c97736 NVARCHAR(500),
@ResourceType_3062b0c97736 NVARCHAR(50),
@IsActive_3062b0c97736 BIT,
@UIConfig_3062b0c97736 NVARCHAR(MAX)
SET
  @ID_3062b0c97736 = 'C03D0945-22A2-400E-8711-2F9B2C30F449'
SET
  @Name_3062b0c97736 = N'forms'
SET
  @Category_3062b0c97736 = N'Forms'
SET
  @Description_3062b0c97736 = N'Parent scope for the MJ Forms Remote Operations (forms, share links, automations and responses).'
SET
  @FullPath_3062b0c97736 = N'forms'
SET
  @IsActive_3062b0c97736 = 1
SET
  @UIConfig_3062b0c97736 = N'{
  "icon": "fa-solid fa-clipboard-list",
  "color": "#0f766e"
}' EXEC [${mjSchema}].spCreateAPIScope @ID = @ID_3062b0c97736,
  @Name = @Name_3062b0c97736,
  @Category = @Category_3062b0c97736,
  @Description = @Description_3062b0c97736,
  @ParentID = @ParentID_3062b0c97736,
  @ParentID_Clear = 1,
  @FullPath = @FullPath_3062b0c97736,
  @ResourceType = @ResourceType_3062b0c97736,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_3062b0c97736,
  @UIConfig = @UIConfig_3062b0c97736;

GO

-- Save MJ: API Scopes (core SP call only)
DECLARE @ID_d2c5c5180b90 UNIQUEIDENTIFIER,
@Name_d2c5c5180b90 NVARCHAR(100),
@Category_d2c5c5180b90 NVARCHAR(100),
@Description_d2c5c5180b90 NVARCHAR(500),
@ParentID_d2c5c5180b90 UNIQUEIDENTIFIER,
@FullPath_d2c5c5180b90 NVARCHAR(500),
@ResourceType_d2c5c5180b90 NVARCHAR(50),
@IsActive_d2c5c5180b90 BIT,
@UIConfig_d2c5c5180b90 NVARCHAR(MAX)
SET
  @ID_d2c5c5180b90 = '72BABE5C-ABD9-428A-8E4F-825E2DA8C238'
SET
  @Name_d2c5c5180b90 = N'read'
SET
  @Category_d2c5c5180b90 = N'Forms'
SET
  @Description_d2c5c5180b90 = N'Read Forms data through the Forms Remote Operations: response lists, response detail, response summaries and share-link claims. Resource: the operation key, e.g. Forms.ListResponses.'
SET
  @ParentID_d2c5c5180b90 = 'C03D0945-22A2-400E-8711-2F9B2C30F449'
SET
  @FullPath_d2c5c5180b90 = N'forms:read'
SET
  @IsActive_d2c5c5180b90 = 1
EXEC [${mjSchema}].spCreateAPIScope @ID = @ID_d2c5c5180b90,
  @Name = @Name_d2c5c5180b90,
  @Category = @Category_d2c5c5180b90,
  @Description = @Description_d2c5c5180b90,
  @ParentID = @ParentID_d2c5c5180b90,
  @FullPath = @FullPath_d2c5c5180b90,
  @ResourceType = @ResourceType_d2c5c5180b90,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_d2c5c5180b90,
  @UIConfig = @UIConfig_d2c5c5180b90,
  @UIConfig_Clear = 1;

GO

-- Save MJ: API Scopes (core SP call only)
DECLARE @ID_e6bdbe8a9664 UNIQUEIDENTIFIER,
@Name_e6bdbe8a9664 NVARCHAR(100),
@Category_e6bdbe8a9664 NVARCHAR(100),
@Description_e6bdbe8a9664 NVARCHAR(500),
@ParentID_e6bdbe8a9664 UNIQUEIDENTIFIER,
@FullPath_e6bdbe8a9664 NVARCHAR(500),
@ResourceType_e6bdbe8a9664 NVARCHAR(50),
@IsActive_e6bdbe8a9664 BIT,
@UIConfig_e6bdbe8a9664 NVARCHAR(MAX)
SET
  @ID_e6bdbe8a9664 = 'E816B2EA-F669-40B2-895B-3928245AF1B6'
SET
  @Name_e6bdbe8a9664 = N'write'
SET
  @Category_e6bdbe8a9664 = N'Forms'
SET
  @Description_e6bdbe8a9664 = N'Change Forms through the Forms Remote Operations: publish, clone, create from template, archive, restore, share-link verbs and automation edits. Resource: the operation key, e.g. Forms.PublishForm.'
SET
  @ParentID_e6bdbe8a9664 = 'C03D0945-22A2-400E-8711-2F9B2C30F449'
SET
  @FullPath_e6bdbe8a9664 = N'forms:write'
SET
  @IsActive_e6bdbe8a9664 = 1
EXEC [${mjSchema}].spCreateAPIScope @ID = @ID_e6bdbe8a9664,
  @Name = @Name_e6bdbe8a9664,
  @Category = @Category_e6bdbe8a9664,
  @Description = @Description_e6bdbe8a9664,
  @ParentID = @ParentID_e6bdbe8a9664,
  @FullPath = @FullPath_e6bdbe8a9664,
  @ResourceType = @ResourceType_e6bdbe8a9664,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_e6bdbe8a9664,
  @UIConfig = @UIConfig_e6bdbe8a9664,
  @UIConfig_Clear = 1;

GO

-- Save MJ: API Application Scopes (core SP call only)
DECLARE @ID_13aa9c28bfb1 UNIQUEIDENTIFIER,
@ApplicationID_13aa9c28bfb1 UNIQUEIDENTIFIER,
@ScopeID_13aa9c28bfb1 UNIQUEIDENTIFIER,
@ResourcePattern_13aa9c28bfb1 NVARCHAR(750),
@PatternType_13aa9c28bfb1 NVARCHAR(20),
@IsDeny_13aa9c28bfb1 BIT,
@Priority_13aa9c28bfb1 INT,
@RowFilterID_13aa9c28bfb1 UNIQUEIDENTIFIER
SET
  @ID_13aa9c28bfb1 = '8DBCDC79-062E-48D1-B665-29AF4D1E2A0E'
SET
  @ApplicationID_13aa9c28bfb1 = '15A906BC-55F3-489C-A7D3-F8DAE9F26D6B'
SET
  @ScopeID_13aa9c28bfb1 = '72BABE5C-ABD9-428A-8E4F-825E2DA8C238'
SET
  @ResourcePattern_13aa9c28bfb1 = N'*'
SET
  @PatternType_13aa9c28bfb1 = N'Include'
SET
  @IsDeny_13aa9c28bfb1 = 0
SET
  @Priority_13aa9c28bfb1 = 0
EXEC [${mjSchema}].spCreateAPIApplicationScope @ID = @ID_13aa9c28bfb1,
  @ApplicationID = @ApplicationID_13aa9c28bfb1,
  @ScopeID = @ScopeID_13aa9c28bfb1,
  @ResourcePattern = @ResourcePattern_13aa9c28bfb1,
  @PatternType = @PatternType_13aa9c28bfb1,
  @IsDeny = @IsDeny_13aa9c28bfb1,
  @Priority = @Priority_13aa9c28bfb1,
  @RowFilterID = @RowFilterID_13aa9c28bfb1,
  @RowFilterID_Clear = 1;

GO

-- Save MJ: API Application Scopes (core SP call only)
DECLARE @ID_55d42bd7b44f UNIQUEIDENTIFIER,
@ApplicationID_55d42bd7b44f UNIQUEIDENTIFIER,
@ScopeID_55d42bd7b44f UNIQUEIDENTIFIER,
@ResourcePattern_55d42bd7b44f NVARCHAR(750),
@PatternType_55d42bd7b44f NVARCHAR(20),
@IsDeny_55d42bd7b44f BIT,
@Priority_55d42bd7b44f INT,
@RowFilterID_55d42bd7b44f UNIQUEIDENTIFIER
SET
  @ID_55d42bd7b44f = '11DCD8CF-FF3A-403D-90A4-DFB788CC0364'
SET
  @ApplicationID_55d42bd7b44f = '15A906BC-55F3-489C-A7D3-F8DAE9F26D6B'
SET
  @ScopeID_55d42bd7b44f = 'E816B2EA-F669-40B2-895B-3928245AF1B6'
SET
  @ResourcePattern_55d42bd7b44f = N'*'
SET
  @PatternType_55d42bd7b44f = N'Include'
SET
  @IsDeny_55d42bd7b44f = 0
SET
  @Priority_55d42bd7b44f = 0
EXEC [${mjSchema}].spCreateAPIApplicationScope @ID = @ID_55d42bd7b44f,
  @ApplicationID = @ApplicationID_55d42bd7b44f,
  @ScopeID = @ScopeID_55d42bd7b44f,
  @ResourcePattern = @ResourcePattern_55d42bd7b44f,
  @PatternType = @PatternType_55d42bd7b44f,
  @IsDeny = @IsDeny_55d42bd7b44f,
  @Priority = @Priority_55d42bd7b44f,
  @RowFilterID = @RowFilterID_55d42bd7b44f,
  @RowFilterID_Clear = 1;

GO

-- Save MJ: Remote Operation Categories (core SP call only)
DECLARE @ID_9ab2e10693f8 UNIQUEIDENTIFIER,
@Name_9ab2e10693f8 NVARCHAR(255),
@Description_9ab2e10693f8 NVARCHAR(MAX),
@ParentID_9ab2e10693f8 UNIQUEIDENTIFIER
SET
  @ID_9ab2e10693f8 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Name_9ab2e10693f8 = N'Forms'
SET
  @Description_9ab2e10693f8 = N'MJ Forms: publish, clone, template, archive and restore forms; issue and manage share links; configure on-submit automations; report on responses; and the respondent read and save path.' EXEC [${mjSchema}].spCreateRemoteOperationCategory @ID = @ID_9ab2e10693f8,
  @Name = @Name_9ab2e10693f8,
  @Description = @Description_9ab2e10693f8,
  @ParentID = @ParentID_9ab2e10693f8,
  @ParentID_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_04faee29678c UNIQUEIDENTIFIER,
@Name_04faee29678c NVARCHAR(255),
@OperationKey_04faee29678c NVARCHAR(255),
@CategoryID_04faee29678c UNIQUEIDENTIFIER,
@Description_04faee29678c NVARCHAR(MAX),
@InputTypeName_04faee29678c NVARCHAR(255),
@InputTypeDefinition_04faee29678c NVARCHAR(MAX),
@InputTypeIsArray_04faee29678c BIT,
@OutputTypeName_04faee29678c NVARCHAR(255),
@OutputTypeDefinition_04faee29678c NVARCHAR(MAX),
@OutputTypeIsArray_04faee29678c BIT,
@ExecutionMode_04faee29678c NVARCHAR(20),
@RequiredScope_04faee29678c NVARCHAR(255),
@RequiresSystemUser_04faee29678c BIT,
@GenerationType_04faee29678c NVARCHAR(20),
@Code_04faee29678c NVARCHAR(MAX),
@CodeApprovalStatus_04faee29678c NVARCHAR(20),
@CodeApprovedByUserID_04faee29678c UNIQUEIDENTIFIER,
@CodeApprovedAt_04faee29678c DATETIMEOFFSET,
@ContractFingerprint_04faee29678c NVARCHAR(100),
@Status_04faee29678c NVARCHAR(20),
@CacheTTLSeconds_04faee29678c INT,
@TimeoutMS_04faee29678c INT,
@MaxConcurrency_04faee29678c INT,
@CodeLocked_04faee29678c BIT,
@CodeComments_04faee29678c NVARCHAR(MAX),
@Libraries_04faee29678c NVARCHAR(MAX)
SET
  @ID_04faee29678c = 'A4E84F51-2A3B-4258-B041-24ABBA7EDBFE'
SET
  @Name_04faee29678c = N'Publish Form'
SET
  @OperationKey_04faee29678c = N'Forms.PublishForm'
SET
  @CategoryID_04faee29678c = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_04faee29678c = N'Publish a form''s current authored structure as a new version, server-side and in one transaction: read the live rows, build the snapshot with the contracts builder, refuse it if any rule fails the strict parsers, retire the incumbent Published version, insert the new one and mark the form Published. Template forms are refused.'
SET
  @InputTypeName_04faee29678c = N'FormsPublishFormInput'
SET
  @InputTypeDefinition_04faee29678c = N'/**
 * Input for `Forms.PublishForm`.
 *
 * Publishes the form''s CURRENT authored structure as a new version: the server reads the live rows,
 * builds the snapshot with the contracts builder, gates it on the strict rule parsers, retires the
 * incumbent and inserts the new Published version in one transaction. Nothing the client holds is
 * trusted, so the only input is which form.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsPublishFormInput {
    /** The `MJ_BizApps_Forms: Forms` row to publish. Template forms are refused. */
    FormID: string;
}
'
SET
  @InputTypeIsArray_04faee29678c = 0
SET
  @OutputTypeName_04faee29678c = N'FormsPublishFormOutput'
SET
  @OutputTypeDefinition_04faee29678c = N'/**
 * Output for `Forms.PublishForm`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsPublishFormOutput {
    /** The new `MJ_BizApps_Forms: Form Versions` row, now the form''s one Published version. */
    FormVersionID: string;
    /** Its version number: the form''s highest existing VersionNumber plus one. */
    VersionNumber: number;
    /** Versions this publish moved from Published to Retired (empty on a first publish). */
    RetiredVersionIDs: string[];
}
'
SET
  @OutputTypeIsArray_04faee29678c = 0
SET
  @ExecutionMode_04faee29678c = N'Sync'
SET
  @RequiredScope_04faee29678c = N'forms:write'
SET
  @RequiresSystemUser_04faee29678c = 0
SET
  @GenerationType_04faee29678c = N'Manual'
SET
  @CodeApprovalStatus_04faee29678c = N'Approved'
SET
  @Status_04faee29678c = N'Active'
SET
  @CodeLocked_04faee29678c = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_04faee29678c,
  @Name = @Name_04faee29678c,
  @OperationKey = @OperationKey_04faee29678c,
  @CategoryID = @CategoryID_04faee29678c,
  @Description = @Description_04faee29678c,
  @InputTypeName = @InputTypeName_04faee29678c,
  @InputTypeDefinition = @InputTypeDefinition_04faee29678c,
  @InputTypeIsArray = @InputTypeIsArray_04faee29678c,
  @OutputTypeName = @OutputTypeName_04faee29678c,
  @OutputTypeDefinition = @OutputTypeDefinition_04faee29678c,
  @OutputTypeIsArray = @OutputTypeIsArray_04faee29678c,
  @ExecutionMode = @ExecutionMode_04faee29678c,
  @RequiredScope = @RequiredScope_04faee29678c,
  @RequiresSystemUser = @RequiresSystemUser_04faee29678c,
  @GenerationType = @GenerationType_04faee29678c,
  @Code = @Code_04faee29678c,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_04faee29678c,
  @CodeApprovedByUserID = @CodeApprovedByUserID_04faee29678c,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_04faee29678c,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_04faee29678c,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_04faee29678c,
  @CacheTTLSeconds = @CacheTTLSeconds_04faee29678c,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_04faee29678c,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_04faee29678c,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_04faee29678c,
  @CodeComments = @CodeComments_04faee29678c,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_04faee29678c,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_97dd7bce9c45 UNIQUEIDENTIFIER,
@Name_97dd7bce9c45 NVARCHAR(255),
@OperationKey_97dd7bce9c45 NVARCHAR(255),
@CategoryID_97dd7bce9c45 UNIQUEIDENTIFIER,
@Description_97dd7bce9c45 NVARCHAR(MAX),
@InputTypeName_97dd7bce9c45 NVARCHAR(255),
@InputTypeDefinition_97dd7bce9c45 NVARCHAR(MAX),
@InputTypeIsArray_97dd7bce9c45 BIT,
@OutputTypeName_97dd7bce9c45 NVARCHAR(255),
@OutputTypeDefinition_97dd7bce9c45 NVARCHAR(MAX),
@OutputTypeIsArray_97dd7bce9c45 BIT,
@ExecutionMode_97dd7bce9c45 NVARCHAR(20),
@RequiredScope_97dd7bce9c45 NVARCHAR(255),
@RequiresSystemUser_97dd7bce9c45 BIT,
@GenerationType_97dd7bce9c45 NVARCHAR(20),
@Code_97dd7bce9c45 NVARCHAR(MAX),
@CodeApprovalStatus_97dd7bce9c45 NVARCHAR(20),
@CodeApprovedByUserID_97dd7bce9c45 UNIQUEIDENTIFIER,
@CodeApprovedAt_97dd7bce9c45 DATETIMEOFFSET,
@ContractFingerprint_97dd7bce9c45 NVARCHAR(100),
@Status_97dd7bce9c45 NVARCHAR(20),
@CacheTTLSeconds_97dd7bce9c45 INT,
@TimeoutMS_97dd7bce9c45 INT,
@MaxConcurrency_97dd7bce9c45 INT,
@CodeLocked_97dd7bce9c45 BIT,
@CodeComments_97dd7bce9c45 NVARCHAR(MAX),
@Libraries_97dd7bce9c45 NVARCHAR(MAX)
SET
  @ID_97dd7bce9c45 = 'AE3999C9-EA19-4301-8F19-AA3D53B928EF'
SET
  @Name_97dd7bce9c45 = N'Clone Form'
SET
  @OperationKey_97dd7bce9c45 = N'Forms.CloneForm'
SET
  @CategoryID_97dd7bce9c45 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_97dd7bce9c45 = N'Copy a form''s whole authored tree (pages, questions, options, screens, bindings, automations) into a new Draft form or a template in one transaction, rewriting every rule and field mapping that named a copied question or page. Nothing is left behind on failure. Also the save-as-template verb.'
SET
  @InputTypeName_97dd7bce9c45 = N'FormsCloneFormInput'
SET
  @InputTypeDefinition_97dd7bce9c45 = N'/**
 * Input for `Forms.CloneForm`.
 *
 * Copies a form''s whole authored tree (pages, questions, options, screens, entity bindings,
 * automations) into a new form or template in one transaction, then rewrites every rule and field
 * mapping that referenced a copied question or page by id. Also the "save as template" verb.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCloneFormInput {
    /** The form (or template) to copy. */
    SourceFormID: string;
    /** Name for the copy. Omitted or blank: the server derives one from the source''s name. */
    Name?: string;
    /** Description for the copy. Omitted: the source''s carries over. `null` clears it. */
    Description?: string | null;
    /** `true` produces a template (`IsTemplate = 1`) whose `TemplateSourceFormID` is SourceFormID, which is what the builder''s "Saved as template" indicator looks up; `false` a working Draft form. */
    AsTemplate: boolean;
}
'
SET
  @InputTypeIsArray_97dd7bce9c45 = 0
SET
  @OutputTypeName_97dd7bce9c45 = N'FormsCloneFormOutput'
SET
  @OutputTypeDefinition_97dd7bce9c45 = N'/**
 * Output for `Forms.CloneForm`. The counts describe what was copied, so a caller can confirm the
 * copy is whole without re-reading it.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCloneFormOutput {
    /** The new form''s (or template''s) id. */
    FormID: string;
    /** The copy''s `TemplateSourceFormID`: the input''s SourceFormID when AsTemplate, else `null`. */
    TemplateSourceFormID: string | null;
    /** Pages copied. */
    PageCount: number;
    /** Questions copied. */
    QuestionCount: number;
    /** Question options copied. */
    OptionCount: number;
    /** Welcome and ending screens copied. */
    ScreenCount: number;
    /** Automations copied. */
    AutomationCount: number;
    /** Entity bindings copied. */
    BindingCount: number;
    /** References that could not be carried over (a rule naming a question the source no longer has). Usually empty. */
    Warnings: string[];
}
'
SET
  @OutputTypeIsArray_97dd7bce9c45 = 0
SET
  @ExecutionMode_97dd7bce9c45 = N'Sync'
SET
  @RequiredScope_97dd7bce9c45 = N'forms:write'
SET
  @RequiresSystemUser_97dd7bce9c45 = 0
SET
  @GenerationType_97dd7bce9c45 = N'Manual'
SET
  @CodeApprovalStatus_97dd7bce9c45 = N'Approved'
SET
  @Status_97dd7bce9c45 = N'Active'
SET
  @CodeLocked_97dd7bce9c45 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_97dd7bce9c45,
  @Name = @Name_97dd7bce9c45,
  @OperationKey = @OperationKey_97dd7bce9c45,
  @CategoryID = @CategoryID_97dd7bce9c45,
  @Description = @Description_97dd7bce9c45,
  @InputTypeName = @InputTypeName_97dd7bce9c45,
  @InputTypeDefinition = @InputTypeDefinition_97dd7bce9c45,
  @InputTypeIsArray = @InputTypeIsArray_97dd7bce9c45,
  @OutputTypeName = @OutputTypeName_97dd7bce9c45,
  @OutputTypeDefinition = @OutputTypeDefinition_97dd7bce9c45,
  @OutputTypeIsArray = @OutputTypeIsArray_97dd7bce9c45,
  @ExecutionMode = @ExecutionMode_97dd7bce9c45,
  @RequiredScope = @RequiredScope_97dd7bce9c45,
  @RequiresSystemUser = @RequiresSystemUser_97dd7bce9c45,
  @GenerationType = @GenerationType_97dd7bce9c45,
  @Code = @Code_97dd7bce9c45,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_97dd7bce9c45,
  @CodeApprovedByUserID = @CodeApprovedByUserID_97dd7bce9c45,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_97dd7bce9c45,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_97dd7bce9c45,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_97dd7bce9c45,
  @CacheTTLSeconds = @CacheTTLSeconds_97dd7bce9c45,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_97dd7bce9c45,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_97dd7bce9c45,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_97dd7bce9c45,
  @CodeComments = @CodeComments_97dd7bce9c45,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_97dd7bce9c45,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_0d90c1c0485f UNIQUEIDENTIFIER,
@Name_0d90c1c0485f NVARCHAR(255),
@OperationKey_0d90c1c0485f NVARCHAR(255),
@CategoryID_0d90c1c0485f UNIQUEIDENTIFIER,
@Description_0d90c1c0485f NVARCHAR(MAX),
@InputTypeName_0d90c1c0485f NVARCHAR(255),
@InputTypeDefinition_0d90c1c0485f NVARCHAR(MAX),
@InputTypeIsArray_0d90c1c0485f BIT,
@OutputTypeName_0d90c1c0485f NVARCHAR(255),
@OutputTypeDefinition_0d90c1c0485f NVARCHAR(MAX),
@OutputTypeIsArray_0d90c1c0485f BIT,
@ExecutionMode_0d90c1c0485f NVARCHAR(20),
@RequiredScope_0d90c1c0485f NVARCHAR(255),
@RequiresSystemUser_0d90c1c0485f BIT,
@GenerationType_0d90c1c0485f NVARCHAR(20),
@Code_0d90c1c0485f NVARCHAR(MAX),
@CodeApprovalStatus_0d90c1c0485f NVARCHAR(20),
@CodeApprovedByUserID_0d90c1c0485f UNIQUEIDENTIFIER,
@CodeApprovedAt_0d90c1c0485f DATETIMEOFFSET,
@ContractFingerprint_0d90c1c0485f NVARCHAR(100),
@Status_0d90c1c0485f NVARCHAR(20),
@CacheTTLSeconds_0d90c1c0485f INT,
@TimeoutMS_0d90c1c0485f INT,
@MaxConcurrency_0d90c1c0485f INT,
@CodeLocked_0d90c1c0485f BIT,
@CodeComments_0d90c1c0485f NVARCHAR(MAX),
@Libraries_0d90c1c0485f NVARCHAR(MAX)
SET
  @ID_0d90c1c0485f = 'E1393600-D93C-43D7-A550-470876E2A4E5'
SET
  @Name_0d90c1c0485f = N'Create Form From Template'
SET
  @OperationKey_0d90c1c0485f = N'Forms.CreateFormFromTemplate'
SET
  @CategoryID_0d90c1c0485f = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_0d90c1c0485f = N'Create a new Draft form from a saved template or a starter gallery blueprint, in one transaction.'
SET
  @InputTypeName_0d90c1c0485f = N'FormsCreateFormFromTemplateInput'
SET
  @InputTypeDefinition_0d90c1c0485f = N'/**
 * Input for `Forms.CreateFormFromTemplate`.
 *
 * Exactly one source: a SAVED template (a form row with `IsTemplate = 1`) or a STARTER blueprint
 * from the built-in gallery. The union makes "both" and "neither" unrepresentable to a typed caller;
 * the server still refuses them, because the wire is JSON.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export type FormsCreateFormFromTemplateInput =
    | {
          /** A saved template''s form id. */
          TemplateFormID: string;
          TemplateKey?: never;
          /** Name for the new form. Omitted or blank: the template''s name. */
          Name?: string;
      }
    | {
          TemplateFormID?: never;
          /** A starter gallery key (`STARTER_TEMPLATE_KEYS` in the contracts). Unknown keys are refused. */
          TemplateKey: string;
          /** Name for the new form. Omitted or blank: the starter''s name. */
          Name?: string;
      };
'
SET
  @InputTypeIsArray_0d90c1c0485f = 0
SET
  @OutputTypeName_0d90c1c0485f = N'FormsCreateFormFromTemplateOutput'
SET
  @OutputTypeDefinition_0d90c1c0485f = N'/**
 * Output for `Forms.CreateFormFromTemplate`. The new form is a Draft; publishing is a separate verb.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsCreateFormFromTemplateOutput {
    /** The new Draft form''s id. */
    FormID: string;
    /** References a saved template''s copy could not carry over (a rule naming a question the template no longer has), for the author to fix. Always empty for a starter key. */
    Warnings: string[];
}
'
SET
  @OutputTypeIsArray_0d90c1c0485f = 0
SET
  @ExecutionMode_0d90c1c0485f = N'Sync'
SET
  @RequiredScope_0d90c1c0485f = N'forms:write'
SET
  @RequiresSystemUser_0d90c1c0485f = 0
SET
  @GenerationType_0d90c1c0485f = N'Manual'
SET
  @CodeApprovalStatus_0d90c1c0485f = N'Approved'
SET
  @Status_0d90c1c0485f = N'Active'
SET
  @CodeLocked_0d90c1c0485f = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_0d90c1c0485f,
  @Name = @Name_0d90c1c0485f,
  @OperationKey = @OperationKey_0d90c1c0485f,
  @CategoryID = @CategoryID_0d90c1c0485f,
  @Description = @Description_0d90c1c0485f,
  @InputTypeName = @InputTypeName_0d90c1c0485f,
  @InputTypeDefinition = @InputTypeDefinition_0d90c1c0485f,
  @InputTypeIsArray = @InputTypeIsArray_0d90c1c0485f,
  @OutputTypeName = @OutputTypeName_0d90c1c0485f,
  @OutputTypeDefinition = @OutputTypeDefinition_0d90c1c0485f,
  @OutputTypeIsArray = @OutputTypeIsArray_0d90c1c0485f,
  @ExecutionMode = @ExecutionMode_0d90c1c0485f,
  @RequiredScope = @RequiredScope_0d90c1c0485f,
  @RequiresSystemUser = @RequiresSystemUser_0d90c1c0485f,
  @GenerationType = @GenerationType_0d90c1c0485f,
  @Code = @Code_0d90c1c0485f,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_0d90c1c0485f,
  @CodeApprovedByUserID = @CodeApprovedByUserID_0d90c1c0485f,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_0d90c1c0485f,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_0d90c1c0485f,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_0d90c1c0485f,
  @CacheTTLSeconds = @CacheTTLSeconds_0d90c1c0485f,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_0d90c1c0485f,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_0d90c1c0485f,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_0d90c1c0485f,
  @CodeComments = @CodeComments_0d90c1c0485f,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_0d90c1c0485f,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_ec9d249b759c UNIQUEIDENTIFIER,
@Name_ec9d249b759c NVARCHAR(255),
@OperationKey_ec9d249b759c NVARCHAR(255),
@CategoryID_ec9d249b759c UNIQUEIDENTIFIER,
@Description_ec9d249b759c NVARCHAR(MAX),
@InputTypeName_ec9d249b759c NVARCHAR(255),
@InputTypeDefinition_ec9d249b759c NVARCHAR(MAX),
@InputTypeIsArray_ec9d249b759c BIT,
@OutputTypeName_ec9d249b759c NVARCHAR(255),
@OutputTypeDefinition_ec9d249b759c NVARCHAR(MAX),
@OutputTypeIsArray_ec9d249b759c BIT,
@ExecutionMode_ec9d249b759c NVARCHAR(20),
@RequiredScope_ec9d249b759c NVARCHAR(255),
@RequiresSystemUser_ec9d249b759c BIT,
@GenerationType_ec9d249b759c NVARCHAR(20),
@Code_ec9d249b759c NVARCHAR(MAX),
@CodeApprovalStatus_ec9d249b759c NVARCHAR(20),
@CodeApprovedByUserID_ec9d249b759c UNIQUEIDENTIFIER,
@CodeApprovedAt_ec9d249b759c DATETIMEOFFSET,
@ContractFingerprint_ec9d249b759c NVARCHAR(100),
@Status_ec9d249b759c NVARCHAR(20),
@CacheTTLSeconds_ec9d249b759c INT,
@TimeoutMS_ec9d249b759c INT,
@MaxConcurrency_ec9d249b759c INT,
@CodeLocked_ec9d249b759c BIT,
@CodeComments_ec9d249b759c NVARCHAR(MAX),
@Libraries_ec9d249b759c NVARCHAR(MAX)
SET
  @ID_ec9d249b759c = '72871573-D420-479B-923E-39862EBC0B98'
SET
  @Name_ec9d249b759c = N'Archive Form'
SET
  @OperationKey_ec9d249b759c = N'Forms.ArchiveForm'
SET
  @CategoryID_ec9d249b759c = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_ec9d249b759c = N'Archive a form: move it to Closed and close every Active share link in the same transaction, so the public path stops accepting responses.'
SET
  @InputTypeName_ec9d249b759c = N'FormsFormLifecycleInput'
SET
  @InputTypeDefinition_ec9d249b759c = N'/**
 * Input for `Forms.ArchiveForm` and `Forms.RestoreForm` — one shape, because both name one form and
 * let the server''s status machine decide the rest.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleInput {
    /** The form to archive or restore. */
    FormID: string;
}
'
SET
  @InputTypeIsArray_ec9d249b759c = 0
SET
  @OutputTypeName_ec9d249b759c = N'FormsFormLifecycleOutput'
SET
  @OutputTypeDefinition_ec9d249b759c = N'/**
 * Output for `Forms.ArchiveForm` and `Forms.RestoreForm`.
 *
 * Archive moves the form to `Closed` and closes every Active distribution in the same transaction.
 * Restore moves it back to `Published` when it has a Published version, else to `Draft` — so the
 * caller learns which, rather than assuming.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleOutput {
    /** The form acted on. */
    FormID: string;
    /** The form''s status after the verb (the `Form.Status` CHECK values). */
    Status: ''Draft'' | ''Published'' | ''Closed'';
}
'
SET
  @OutputTypeIsArray_ec9d249b759c = 0
SET
  @ExecutionMode_ec9d249b759c = N'Sync'
SET
  @RequiredScope_ec9d249b759c = N'forms:write'
SET
  @RequiresSystemUser_ec9d249b759c = 0
SET
  @GenerationType_ec9d249b759c = N'Manual'
SET
  @CodeApprovalStatus_ec9d249b759c = N'Approved'
SET
  @Status_ec9d249b759c = N'Active'
SET
  @CodeLocked_ec9d249b759c = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_ec9d249b759c,
  @Name = @Name_ec9d249b759c,
  @OperationKey = @OperationKey_ec9d249b759c,
  @CategoryID = @CategoryID_ec9d249b759c,
  @Description = @Description_ec9d249b759c,
  @InputTypeName = @InputTypeName_ec9d249b759c,
  @InputTypeDefinition = @InputTypeDefinition_ec9d249b759c,
  @InputTypeIsArray = @InputTypeIsArray_ec9d249b759c,
  @OutputTypeName = @OutputTypeName_ec9d249b759c,
  @OutputTypeDefinition = @OutputTypeDefinition_ec9d249b759c,
  @OutputTypeIsArray = @OutputTypeIsArray_ec9d249b759c,
  @ExecutionMode = @ExecutionMode_ec9d249b759c,
  @RequiredScope = @RequiredScope_ec9d249b759c,
  @RequiresSystemUser = @RequiresSystemUser_ec9d249b759c,
  @GenerationType = @GenerationType_ec9d249b759c,
  @Code = @Code_ec9d249b759c,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_ec9d249b759c,
  @CodeApprovedByUserID = @CodeApprovedByUserID_ec9d249b759c,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_ec9d249b759c,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_ec9d249b759c,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_ec9d249b759c,
  @CacheTTLSeconds = @CacheTTLSeconds_ec9d249b759c,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_ec9d249b759c,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_ec9d249b759c,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_ec9d249b759c,
  @CodeComments = @CodeComments_ec9d249b759c,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_ec9d249b759c,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_83ad4b6e2081 UNIQUEIDENTIFIER,
@Name_83ad4b6e2081 NVARCHAR(255),
@OperationKey_83ad4b6e2081 NVARCHAR(255),
@CategoryID_83ad4b6e2081 UNIQUEIDENTIFIER,
@Description_83ad4b6e2081 NVARCHAR(MAX),
@InputTypeName_83ad4b6e2081 NVARCHAR(255),
@InputTypeDefinition_83ad4b6e2081 NVARCHAR(MAX),
@InputTypeIsArray_83ad4b6e2081 BIT,
@OutputTypeName_83ad4b6e2081 NVARCHAR(255),
@OutputTypeDefinition_83ad4b6e2081 NVARCHAR(MAX),
@OutputTypeIsArray_83ad4b6e2081 BIT,
@ExecutionMode_83ad4b6e2081 NVARCHAR(20),
@RequiredScope_83ad4b6e2081 NVARCHAR(255),
@RequiresSystemUser_83ad4b6e2081 BIT,
@GenerationType_83ad4b6e2081 NVARCHAR(20),
@Code_83ad4b6e2081 NVARCHAR(MAX),
@CodeApprovalStatus_83ad4b6e2081 NVARCHAR(20),
@CodeApprovedByUserID_83ad4b6e2081 UNIQUEIDENTIFIER,
@CodeApprovedAt_83ad4b6e2081 DATETIMEOFFSET,
@ContractFingerprint_83ad4b6e2081 NVARCHAR(100),
@Status_83ad4b6e2081 NVARCHAR(20),
@CacheTTLSeconds_83ad4b6e2081 INT,
@TimeoutMS_83ad4b6e2081 INT,
@MaxConcurrency_83ad4b6e2081 INT,
@CodeLocked_83ad4b6e2081 BIT,
@CodeComments_83ad4b6e2081 NVARCHAR(MAX),
@Libraries_83ad4b6e2081 NVARCHAR(MAX)
SET
  @ID_83ad4b6e2081 = 'B67534D8-F319-4D02-812B-A687F56B42E0'
SET
  @Name_83ad4b6e2081 = N'Restore Form'
SET
  @OperationKey_83ad4b6e2081 = N'Forms.RestoreForm'
SET
  @CategoryID_83ad4b6e2081 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_83ad4b6e2081 = N'Restore an archived form: back to Published when it has a Published version, else to Draft. Share links stay closed until reopened.'
SET
  @InputTypeName_83ad4b6e2081 = N'FormsFormLifecycleInput'
SET
  @InputTypeDefinition_83ad4b6e2081 = N'/**
 * Input for `Forms.ArchiveForm` and `Forms.RestoreForm` — one shape, because both name one form and
 * let the server''s status machine decide the rest.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleInput {
    /** The form to archive or restore. */
    FormID: string;
}
'
SET
  @InputTypeIsArray_83ad4b6e2081 = 0
SET
  @OutputTypeName_83ad4b6e2081 = N'FormsFormLifecycleOutput'
SET
  @OutputTypeDefinition_83ad4b6e2081 = N'/**
 * Output for `Forms.ArchiveForm` and `Forms.RestoreForm`.
 *
 * Archive moves the form to `Closed` and closes every Active distribution in the same transaction.
 * Restore moves it back to `Published` when it has a Published version, else to `Draft` — so the
 * caller learns which, rather than assuming.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsFormLifecycleOutput {
    /** The form acted on. */
    FormID: string;
    /** The form''s status after the verb (the `Form.Status` CHECK values). */
    Status: ''Draft'' | ''Published'' | ''Closed'';
}
'
SET
  @OutputTypeIsArray_83ad4b6e2081 = 0
SET
  @ExecutionMode_83ad4b6e2081 = N'Sync'
SET
  @RequiredScope_83ad4b6e2081 = N'forms:write'
SET
  @RequiresSystemUser_83ad4b6e2081 = 0
SET
  @GenerationType_83ad4b6e2081 = N'Manual'
SET
  @CodeApprovalStatus_83ad4b6e2081 = N'Approved'
SET
  @Status_83ad4b6e2081 = N'Active'
SET
  @CodeLocked_83ad4b6e2081 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_83ad4b6e2081,
  @Name = @Name_83ad4b6e2081,
  @OperationKey = @OperationKey_83ad4b6e2081,
  @CategoryID = @CategoryID_83ad4b6e2081,
  @Description = @Description_83ad4b6e2081,
  @InputTypeName = @InputTypeName_83ad4b6e2081,
  @InputTypeDefinition = @InputTypeDefinition_83ad4b6e2081,
  @InputTypeIsArray = @InputTypeIsArray_83ad4b6e2081,
  @OutputTypeName = @OutputTypeName_83ad4b6e2081,
  @OutputTypeDefinition = @OutputTypeDefinition_83ad4b6e2081,
  @OutputTypeIsArray = @OutputTypeIsArray_83ad4b6e2081,
  @ExecutionMode = @ExecutionMode_83ad4b6e2081,
  @RequiredScope = @RequiredScope_83ad4b6e2081,
  @RequiresSystemUser = @RequiresSystemUser_83ad4b6e2081,
  @GenerationType = @GenerationType_83ad4b6e2081,
  @Code = @Code_83ad4b6e2081,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_83ad4b6e2081,
  @CodeApprovedByUserID = @CodeApprovedByUserID_83ad4b6e2081,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_83ad4b6e2081,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_83ad4b6e2081,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_83ad4b6e2081,
  @CacheTTLSeconds = @CacheTTLSeconds_83ad4b6e2081,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_83ad4b6e2081,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_83ad4b6e2081,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_83ad4b6e2081,
  @CodeComments = @CodeComments_83ad4b6e2081,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_83ad4b6e2081,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_e7723c3bf3a5 UNIQUEIDENTIFIER,
@Name_e7723c3bf3a5 NVARCHAR(255),
@OperationKey_e7723c3bf3a5 NVARCHAR(255),
@CategoryID_e7723c3bf3a5 UNIQUEIDENTIFIER,
@Description_e7723c3bf3a5 NVARCHAR(MAX),
@InputTypeName_e7723c3bf3a5 NVARCHAR(255),
@InputTypeDefinition_e7723c3bf3a5 NVARCHAR(MAX),
@InputTypeIsArray_e7723c3bf3a5 BIT,
@OutputTypeName_e7723c3bf3a5 NVARCHAR(255),
@OutputTypeDefinition_e7723c3bf3a5 NVARCHAR(MAX),
@OutputTypeIsArray_e7723c3bf3a5 BIT,
@ExecutionMode_e7723c3bf3a5 NVARCHAR(20),
@RequiredScope_e7723c3bf3a5 NVARCHAR(255),
@RequiresSystemUser_e7723c3bf3a5 BIT,
@GenerationType_e7723c3bf3a5 NVARCHAR(20),
@Code_e7723c3bf3a5 NVARCHAR(MAX),
@CodeApprovalStatus_e7723c3bf3a5 NVARCHAR(20),
@CodeApprovedByUserID_e7723c3bf3a5 UNIQUEIDENTIFIER,
@CodeApprovedAt_e7723c3bf3a5 DATETIMEOFFSET,
@ContractFingerprint_e7723c3bf3a5 NVARCHAR(100),
@Status_e7723c3bf3a5 NVARCHAR(20),
@CacheTTLSeconds_e7723c3bf3a5 INT,
@TimeoutMS_e7723c3bf3a5 INT,
@MaxConcurrency_e7723c3bf3a5 INT,
@CodeLocked_e7723c3bf3a5 BIT,
@CodeComments_e7723c3bf3a5 NVARCHAR(MAX),
@Libraries_e7723c3bf3a5 NVARCHAR(MAX)
SET
  @ID_e7723c3bf3a5 = '2C94EA26-8DF3-4D01-88D2-37923FE349BC'
SET
  @Name_e7723c3bf3a5 = N'Issue Distribution Link'
SET
  @OperationKey_e7723c3bf3a5 = N'Forms.IssueDistributionLink'
SET
  @CategoryID_e7723c3bf3a5 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_e7723c3bf3a5 = N'Create and open a share link for a form. Slug generation and its uniqueness retry, and the anonymous magic-link provisioning, all happen server-side.'
SET
  @InputTypeName_e7723c3bf3a5 = N'FormsIssueDistributionLinkInput'
SET
  @InputTypeDefinition_e7723c3bf3a5 = N'/**
 * Input for `Forms.IssueDistributionLink`.
 *
 * Creates a share link for a form and opens it. Slug generation, its uniqueness retry and the
 * magic-link provisioning all happen server-side; a caller supplies a preferred slug at most.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsIssueDistributionLinkInput {
    /** The form the link serves. */
    FormID: string;
    /** The channel this link is shared through (the `FormDistribution.ChannelType` CHECK values). Omitted: `PublicLink`. */
    ChannelType?: ''Email'' | ''Embed'' | ''PublicLink'' | ''QR'';
    /** Display name for the link. Omitted or blank: the server derives one from the form and channel. */
    Name?: string;
    /** Preferred URL slug. Omitted: derived from the name. Taken: a random suffix is appended. */
    Slug?: string;
    /** Response cap for this link. Omitted or `null`: uncapped. */
    MaxResponses?: number | null;
    /** ISO-8601 instant the link starts accepting responses. Omitted or `null`: immediately. */
    OpenAt?: string | null;
    /** ISO-8601 instant the link stops accepting responses. Omitted or `null`: never. */
    CloseAt?: string | null;
    /** Require a Turnstile check on submit. Omitted: `false` (captcha is opt-in). */
    CaptchaRequired?: boolean;
}
'
SET
  @InputTypeIsArray_e7723c3bf3a5 = 0
SET
  @OutputTypeName_e7723c3bf3a5 = N'FormsDistributionLinkOutput'
SET
  @OutputTypeDefinition_e7723c3bf3a5 = N'/**
 * Output for every distribution verb: `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`,
 * `Forms.OpenDistribution` and `Forms.CloseDistribution`.
 *
 * The link''s state AFTER the verb, read back from the database inside the same server call — the
 * provisioning hook writes the token on the server, so a client copy of the row is stale by design.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionLinkOutput {
    /** The distribution acted on (the new one, for an issue). */
    FormDistributionID: string;
    /** Its slug; `null` for a row that has none (the column is nullable). Reissue keeps it, so every shared URL keeps working; only the credential changes. */
    Slug: string | null;
    /** Its status after the verb (the `FormDistribution.Status` CHECK values). */
    Status: ''Active'' | ''Closed'' | ''Draft'';
    /** The public URL a respondent opens. `null` while the link is closed or no access token could be provisioned. */
    RespondentURL: string | null;
}
'
SET
  @OutputTypeIsArray_e7723c3bf3a5 = 0
SET
  @ExecutionMode_e7723c3bf3a5 = N'Sync'
SET
  @RequiredScope_e7723c3bf3a5 = N'forms:write'
SET
  @RequiresSystemUser_e7723c3bf3a5 = 0
SET
  @GenerationType_e7723c3bf3a5 = N'Manual'
SET
  @CodeApprovalStatus_e7723c3bf3a5 = N'Approved'
SET
  @Status_e7723c3bf3a5 = N'Active'
SET
  @CodeLocked_e7723c3bf3a5 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_e7723c3bf3a5,
  @Name = @Name_e7723c3bf3a5,
  @OperationKey = @OperationKey_e7723c3bf3a5,
  @CategoryID = @CategoryID_e7723c3bf3a5,
  @Description = @Description_e7723c3bf3a5,
  @InputTypeName = @InputTypeName_e7723c3bf3a5,
  @InputTypeDefinition = @InputTypeDefinition_e7723c3bf3a5,
  @InputTypeIsArray = @InputTypeIsArray_e7723c3bf3a5,
  @OutputTypeName = @OutputTypeName_e7723c3bf3a5,
  @OutputTypeDefinition = @OutputTypeDefinition_e7723c3bf3a5,
  @OutputTypeIsArray = @OutputTypeIsArray_e7723c3bf3a5,
  @ExecutionMode = @ExecutionMode_e7723c3bf3a5,
  @RequiredScope = @RequiredScope_e7723c3bf3a5,
  @RequiresSystemUser = @RequiresSystemUser_e7723c3bf3a5,
  @GenerationType = @GenerationType_e7723c3bf3a5,
  @Code = @Code_e7723c3bf3a5,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_e7723c3bf3a5,
  @CodeApprovedByUserID = @CodeApprovedByUserID_e7723c3bf3a5,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_e7723c3bf3a5,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_e7723c3bf3a5,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_e7723c3bf3a5,
  @CacheTTLSeconds = @CacheTTLSeconds_e7723c3bf3a5,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_e7723c3bf3a5,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_e7723c3bf3a5,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_e7723c3bf3a5,
  @CodeComments = @CodeComments_e7723c3bf3a5,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_e7723c3bf3a5,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_3662cdcfca09 UNIQUEIDENTIFIER,
@Name_3662cdcfca09 NVARCHAR(255),
@OperationKey_3662cdcfca09 NVARCHAR(255),
@CategoryID_3662cdcfca09 UNIQUEIDENTIFIER,
@Description_3662cdcfca09 NVARCHAR(MAX),
@InputTypeName_3662cdcfca09 NVARCHAR(255),
@InputTypeDefinition_3662cdcfca09 NVARCHAR(MAX),
@InputTypeIsArray_3662cdcfca09 BIT,
@OutputTypeName_3662cdcfca09 NVARCHAR(255),
@OutputTypeDefinition_3662cdcfca09 NVARCHAR(MAX),
@OutputTypeIsArray_3662cdcfca09 BIT,
@ExecutionMode_3662cdcfca09 NVARCHAR(20),
@RequiredScope_3662cdcfca09 NVARCHAR(255),
@RequiresSystemUser_3662cdcfca09 BIT,
@GenerationType_3662cdcfca09 NVARCHAR(20),
@Code_3662cdcfca09 NVARCHAR(MAX),
@CodeApprovalStatus_3662cdcfca09 NVARCHAR(20),
@CodeApprovedByUserID_3662cdcfca09 UNIQUEIDENTIFIER,
@CodeApprovedAt_3662cdcfca09 DATETIMEOFFSET,
@ContractFingerprint_3662cdcfca09 NVARCHAR(100),
@Status_3662cdcfca09 NVARCHAR(20),
@CacheTTLSeconds_3662cdcfca09 INT,
@TimeoutMS_3662cdcfca09 INT,
@MaxConcurrency_3662cdcfca09 INT,
@CodeLocked_3662cdcfca09 BIT,
@CodeComments_3662cdcfca09 NVARCHAR(MAX),
@Libraries_3662cdcfca09 NVARCHAR(MAX)
SET
  @ID_3662cdcfca09 = 'FB420DC8-36C9-465C-BBFF-C4AE3F6DC82F'
SET
  @Name_3662cdcfca09 = N'Reissue Distribution Link'
SET
  @OperationKey_3662cdcfca09 = N'Forms.ReissueDistributionLink'
SET
  @CategoryID_3662cdcfca09 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_3662cdcfca09 = N'Give a share link a brand-new access credential while keeping its slug, so every shared URL keeps working and a leaked credential stops being redeemable.'
SET
  @InputTypeName_3662cdcfca09 = N'FormsDistributionVerbInput'
SET
  @InputTypeDefinition_3662cdcfca09 = N'/**
 * Input for `Forms.ReissueDistributionLink`, `Forms.OpenDistribution` and `Forms.CloseDistribution`:
 * each acts on one existing share link and nothing else.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionVerbInput {
    /** The `MJ_BizApps_Forms: Form Distributions` row to act on. */
    FormDistributionID: string;
}
'
SET
  @InputTypeIsArray_3662cdcfca09 = 0
SET
  @OutputTypeName_3662cdcfca09 = N'FormsDistributionLinkOutput'
SET
  @OutputTypeDefinition_3662cdcfca09 = N'/**
 * Output for every distribution verb: `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`,
 * `Forms.OpenDistribution` and `Forms.CloseDistribution`.
 *
 * The link''s state AFTER the verb, read back from the database inside the same server call — the
 * provisioning hook writes the token on the server, so a client copy of the row is stale by design.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionLinkOutput {
    /** The distribution acted on (the new one, for an issue). */
    FormDistributionID: string;
    /** Its slug; `null` for a row that has none (the column is nullable). Reissue keeps it, so every shared URL keeps working; only the credential changes. */
    Slug: string | null;
    /** Its status after the verb (the `FormDistribution.Status` CHECK values). */
    Status: ''Active'' | ''Closed'' | ''Draft'';
    /** The public URL a respondent opens. `null` while the link is closed or no access token could be provisioned. */
    RespondentURL: string | null;
}
'
SET
  @OutputTypeIsArray_3662cdcfca09 = 0
SET
  @ExecutionMode_3662cdcfca09 = N'Sync'
SET
  @RequiredScope_3662cdcfca09 = N'forms:write'
SET
  @RequiresSystemUser_3662cdcfca09 = 0
SET
  @GenerationType_3662cdcfca09 = N'Manual'
SET
  @CodeApprovalStatus_3662cdcfca09 = N'Approved'
SET
  @Status_3662cdcfca09 = N'Active'
SET
  @CodeLocked_3662cdcfca09 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_3662cdcfca09,
  @Name = @Name_3662cdcfca09,
  @OperationKey = @OperationKey_3662cdcfca09,
  @CategoryID = @CategoryID_3662cdcfca09,
  @Description = @Description_3662cdcfca09,
  @InputTypeName = @InputTypeName_3662cdcfca09,
  @InputTypeDefinition = @InputTypeDefinition_3662cdcfca09,
  @InputTypeIsArray = @InputTypeIsArray_3662cdcfca09,
  @OutputTypeName = @OutputTypeName_3662cdcfca09,
  @OutputTypeDefinition = @OutputTypeDefinition_3662cdcfca09,
  @OutputTypeIsArray = @OutputTypeIsArray_3662cdcfca09,
  @ExecutionMode = @ExecutionMode_3662cdcfca09,
  @RequiredScope = @RequiredScope_3662cdcfca09,
  @RequiresSystemUser = @RequiresSystemUser_3662cdcfca09,
  @GenerationType = @GenerationType_3662cdcfca09,
  @Code = @Code_3662cdcfca09,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_3662cdcfca09,
  @CodeApprovedByUserID = @CodeApprovedByUserID_3662cdcfca09,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_3662cdcfca09,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_3662cdcfca09,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_3662cdcfca09,
  @CacheTTLSeconds = @CacheTTLSeconds_3662cdcfca09,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_3662cdcfca09,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_3662cdcfca09,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_3662cdcfca09,
  @CodeComments = @CodeComments_3662cdcfca09,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_3662cdcfca09,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_815b06422f54 UNIQUEIDENTIFIER,
@Name_815b06422f54 NVARCHAR(255),
@OperationKey_815b06422f54 NVARCHAR(255),
@CategoryID_815b06422f54 UNIQUEIDENTIFIER,
@Description_815b06422f54 NVARCHAR(MAX),
@InputTypeName_815b06422f54 NVARCHAR(255),
@InputTypeDefinition_815b06422f54 NVARCHAR(MAX),
@InputTypeIsArray_815b06422f54 BIT,
@OutputTypeName_815b06422f54 NVARCHAR(255),
@OutputTypeDefinition_815b06422f54 NVARCHAR(MAX),
@OutputTypeIsArray_815b06422f54 BIT,
@ExecutionMode_815b06422f54 NVARCHAR(20),
@RequiredScope_815b06422f54 NVARCHAR(255),
@RequiresSystemUser_815b06422f54 BIT,
@GenerationType_815b06422f54 NVARCHAR(20),
@Code_815b06422f54 NVARCHAR(MAX),
@CodeApprovalStatus_815b06422f54 NVARCHAR(20),
@CodeApprovedByUserID_815b06422f54 UNIQUEIDENTIFIER,
@CodeApprovedAt_815b06422f54 DATETIMEOFFSET,
@ContractFingerprint_815b06422f54 NVARCHAR(100),
@Status_815b06422f54 NVARCHAR(20),
@CacheTTLSeconds_815b06422f54 INT,
@TimeoutMS_815b06422f54 INT,
@MaxConcurrency_815b06422f54 INT,
@CodeLocked_815b06422f54 BIT,
@CodeComments_815b06422f54 NVARCHAR(MAX),
@Libraries_815b06422f54 NVARCHAR(MAX)
SET
  @ID_815b06422f54 = '98D39998-22AD-4B84-A6E0-666EA3EB55E0'
SET
  @Name_815b06422f54 = N'Open Distribution'
SET
  @OperationKey_815b06422f54 = N'Forms.OpenDistribution'
SET
  @CategoryID_815b06422f54 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_815b06422f54 = N'Open a share link to responses (Status Active and IsActive), provisioning a fresh access credential on the way.'
SET
  @InputTypeName_815b06422f54 = N'FormsDistributionVerbInput'
SET
  @InputTypeDefinition_815b06422f54 = N'/**
 * Input for `Forms.ReissueDistributionLink`, `Forms.OpenDistribution` and `Forms.CloseDistribution`:
 * each acts on one existing share link and nothing else.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionVerbInput {
    /** The `MJ_BizApps_Forms: Form Distributions` row to act on. */
    FormDistributionID: string;
}
'
SET
  @InputTypeIsArray_815b06422f54 = 0
SET
  @OutputTypeName_815b06422f54 = N'FormsDistributionLinkOutput'
SET
  @OutputTypeDefinition_815b06422f54 = N'/**
 * Output for every distribution verb: `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`,
 * `Forms.OpenDistribution` and `Forms.CloseDistribution`.
 *
 * The link''s state AFTER the verb, read back from the database inside the same server call — the
 * provisioning hook writes the token on the server, so a client copy of the row is stale by design.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionLinkOutput {
    /** The distribution acted on (the new one, for an issue). */
    FormDistributionID: string;
    /** Its slug; `null` for a row that has none (the column is nullable). Reissue keeps it, so every shared URL keeps working; only the credential changes. */
    Slug: string | null;
    /** Its status after the verb (the `FormDistribution.Status` CHECK values). */
    Status: ''Active'' | ''Closed'' | ''Draft'';
    /** The public URL a respondent opens. `null` while the link is closed or no access token could be provisioned. */
    RespondentURL: string | null;
}
'
SET
  @OutputTypeIsArray_815b06422f54 = 0
SET
  @ExecutionMode_815b06422f54 = N'Sync'
SET
  @RequiredScope_815b06422f54 = N'forms:write'
SET
  @RequiresSystemUser_815b06422f54 = 0
SET
  @GenerationType_815b06422f54 = N'Manual'
SET
  @CodeApprovalStatus_815b06422f54 = N'Approved'
SET
  @Status_815b06422f54 = N'Active'
SET
  @CodeLocked_815b06422f54 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_815b06422f54,
  @Name = @Name_815b06422f54,
  @OperationKey = @OperationKey_815b06422f54,
  @CategoryID = @CategoryID_815b06422f54,
  @Description = @Description_815b06422f54,
  @InputTypeName = @InputTypeName_815b06422f54,
  @InputTypeDefinition = @InputTypeDefinition_815b06422f54,
  @InputTypeIsArray = @InputTypeIsArray_815b06422f54,
  @OutputTypeName = @OutputTypeName_815b06422f54,
  @OutputTypeDefinition = @OutputTypeDefinition_815b06422f54,
  @OutputTypeIsArray = @OutputTypeIsArray_815b06422f54,
  @ExecutionMode = @ExecutionMode_815b06422f54,
  @RequiredScope = @RequiredScope_815b06422f54,
  @RequiresSystemUser = @RequiresSystemUser_815b06422f54,
  @GenerationType = @GenerationType_815b06422f54,
  @Code = @Code_815b06422f54,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_815b06422f54,
  @CodeApprovedByUserID = @CodeApprovedByUserID_815b06422f54,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_815b06422f54,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_815b06422f54,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_815b06422f54,
  @CacheTTLSeconds = @CacheTTLSeconds_815b06422f54,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_815b06422f54,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_815b06422f54,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_815b06422f54,
  @CodeComments = @CodeComments_815b06422f54,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_815b06422f54,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_e7008710a52f UNIQUEIDENTIFIER,
@Name_e7008710a52f NVARCHAR(255),
@OperationKey_e7008710a52f NVARCHAR(255),
@CategoryID_e7008710a52f UNIQUEIDENTIFIER,
@Description_e7008710a52f NVARCHAR(MAX),
@InputTypeName_e7008710a52f NVARCHAR(255),
@InputTypeDefinition_e7008710a52f NVARCHAR(MAX),
@InputTypeIsArray_e7008710a52f BIT,
@OutputTypeName_e7008710a52f NVARCHAR(255),
@OutputTypeDefinition_e7008710a52f NVARCHAR(MAX),
@OutputTypeIsArray_e7008710a52f BIT,
@ExecutionMode_e7008710a52f NVARCHAR(20),
@RequiredScope_e7008710a52f NVARCHAR(255),
@RequiresSystemUser_e7008710a52f BIT,
@GenerationType_e7008710a52f NVARCHAR(20),
@Code_e7008710a52f NVARCHAR(MAX),
@CodeApprovalStatus_e7008710a52f NVARCHAR(20),
@CodeApprovedByUserID_e7008710a52f UNIQUEIDENTIFIER,
@CodeApprovedAt_e7008710a52f DATETIMEOFFSET,
@ContractFingerprint_e7008710a52f NVARCHAR(100),
@Status_e7008710a52f NVARCHAR(20),
@CacheTTLSeconds_e7008710a52f INT,
@TimeoutMS_e7008710a52f INT,
@MaxConcurrency_e7008710a52f INT,
@CodeLocked_e7008710a52f BIT,
@CodeComments_e7008710a52f NVARCHAR(MAX),
@Libraries_e7008710a52f NVARCHAR(MAX)
SET
  @ID_e7008710a52f = 'B3AEE29C-29E3-41EC-A3DC-BA684EEC9FF9'
SET
  @Name_e7008710a52f = N'Close Distribution'
SET
  @OperationKey_e7008710a52f = N'Forms.CloseDistribution'
SET
  @CategoryID_e7008710a52f = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_e7008710a52f = N'Close a share link to responses and revoke its access credential in the same save.'
SET
  @InputTypeName_e7008710a52f = N'FormsDistributionVerbInput'
SET
  @InputTypeDefinition_e7008710a52f = N'/**
 * Input for `Forms.ReissueDistributionLink`, `Forms.OpenDistribution` and `Forms.CloseDistribution`:
 * each acts on one existing share link and nothing else.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionVerbInput {
    /** The `MJ_BizApps_Forms: Form Distributions` row to act on. */
    FormDistributionID: string;
}
'
SET
  @InputTypeIsArray_e7008710a52f = 0
SET
  @OutputTypeName_e7008710a52f = N'FormsDistributionLinkOutput'
SET
  @OutputTypeDefinition_e7008710a52f = N'/**
 * Output for every distribution verb: `Forms.IssueDistributionLink`, `Forms.ReissueDistributionLink`,
 * `Forms.OpenDistribution` and `Forms.CloseDistribution`.
 *
 * The link''s state AFTER the verb, read back from the database inside the same server call — the
 * provisioning hook writes the token on the server, so a client copy of the row is stale by design.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDistributionLinkOutput {
    /** The distribution acted on (the new one, for an issue). */
    FormDistributionID: string;
    /** Its slug; `null` for a row that has none (the column is nullable). Reissue keeps it, so every shared URL keeps working; only the credential changes. */
    Slug: string | null;
    /** Its status after the verb (the `FormDistribution.Status` CHECK values). */
    Status: ''Active'' | ''Closed'' | ''Draft'';
    /** The public URL a respondent opens. `null` while the link is closed or no access token could be provisioned. */
    RespondentURL: string | null;
}
'
SET
  @OutputTypeIsArray_e7008710a52f = 0
SET
  @ExecutionMode_e7008710a52f = N'Sync'
SET
  @RequiredScope_e7008710a52f = N'forms:write'
SET
  @RequiresSystemUser_e7008710a52f = 0
SET
  @GenerationType_e7008710a52f = N'Manual'
SET
  @CodeApprovalStatus_e7008710a52f = N'Approved'
SET
  @Status_e7008710a52f = N'Active'
SET
  @CodeLocked_e7008710a52f = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_e7008710a52f,
  @Name = @Name_e7008710a52f,
  @OperationKey = @OperationKey_e7008710a52f,
  @CategoryID = @CategoryID_e7008710a52f,
  @Description = @Description_e7008710a52f,
  @InputTypeName = @InputTypeName_e7008710a52f,
  @InputTypeDefinition = @InputTypeDefinition_e7008710a52f,
  @InputTypeIsArray = @InputTypeIsArray_e7008710a52f,
  @OutputTypeName = @OutputTypeName_e7008710a52f,
  @OutputTypeDefinition = @OutputTypeDefinition_e7008710a52f,
  @OutputTypeIsArray = @OutputTypeIsArray_e7008710a52f,
  @ExecutionMode = @ExecutionMode_e7008710a52f,
  @RequiredScope = @RequiredScope_e7008710a52f,
  @RequiresSystemUser = @RequiresSystemUser_e7008710a52f,
  @GenerationType = @GenerationType_e7008710a52f,
  @Code = @Code_e7008710a52f,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_e7008710a52f,
  @CodeApprovedByUserID = @CodeApprovedByUserID_e7008710a52f,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_e7008710a52f,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_e7008710a52f,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_e7008710a52f,
  @CacheTTLSeconds = @CacheTTLSeconds_e7008710a52f,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_e7008710a52f,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_e7008710a52f,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_e7008710a52f,
  @CodeComments = @CodeComments_e7008710a52f,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_e7008710a52f,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_6e539bd8b828 UNIQUEIDENTIFIER,
@Name_6e539bd8b828 NVARCHAR(255),
@OperationKey_6e539bd8b828 NVARCHAR(255),
@CategoryID_6e539bd8b828 UNIQUEIDENTIFIER,
@Description_6e539bd8b828 NVARCHAR(MAX),
@InputTypeName_6e539bd8b828 NVARCHAR(255),
@InputTypeDefinition_6e539bd8b828 NVARCHAR(MAX),
@InputTypeIsArray_6e539bd8b828 BIT,
@OutputTypeName_6e539bd8b828 NVARCHAR(255),
@OutputTypeDefinition_6e539bd8b828 NVARCHAR(MAX),
@OutputTypeIsArray_6e539bd8b828 BIT,
@ExecutionMode_6e539bd8b828 NVARCHAR(20),
@RequiredScope_6e539bd8b828 NVARCHAR(255),
@RequiresSystemUser_6e539bd8b828 BIT,
@GenerationType_6e539bd8b828 NVARCHAR(20),
@Code_6e539bd8b828 NVARCHAR(MAX),
@CodeApprovalStatus_6e539bd8b828 NVARCHAR(20),
@CodeApprovedByUserID_6e539bd8b828 UNIQUEIDENTIFIER,
@CodeApprovedAt_6e539bd8b828 DATETIMEOFFSET,
@ContractFingerprint_6e539bd8b828 NVARCHAR(100),
@Status_6e539bd8b828 NVARCHAR(20),
@CacheTTLSeconds_6e539bd8b828 INT,
@TimeoutMS_6e539bd8b828 INT,
@MaxConcurrency_6e539bd8b828 INT,
@CodeLocked_6e539bd8b828 BIT,
@CodeComments_6e539bd8b828 NVARCHAR(MAX),
@Libraries_6e539bd8b828 NVARCHAR(MAX)
SET
  @ID_6e539bd8b828 = '3E0331F7-E0EF-439B-BE53-A12B7062AE86'
SET
  @Name_6e539bd8b828 = N'Get Distribution Claims'
SET
  @OperationKey_6e539bd8b828 = N'Forms.GetDistributionClaims'
SET
  @CategoryID_6e539bd8b828 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_6e539bd8b828 = N'Report which of a form''s share-link slugs other installed apps own, and which claimant apps could not be consulted. Read-only.'
SET
  @InputTypeName_6e539bd8b828 = N'FormsGetDistributionClaimsInput'
SET
  @InputTypeDefinition_6e539bd8b828 = N'/**
 * Input for `Forms.GetDistributionClaims`: which of a form''s share-link slugs other installed apps
 * own (for example an interview step in another app that publishes the link itself).
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetDistributionClaimsInput {
    /** The form whose share-link slugs are checked. */
    FormID: string;
}
'
SET
  @InputTypeIsArray_6e539bd8b828 = 0
SET
  @OutputTypeName_6e539bd8b828 = N'FormsGetDistributionClaimsOutput'
SET
  @OutputTypeDefinition_6e539bd8b828 = N'/**
 * Output for `Forms.GetDistributionClaims`.
 *
 * A claimant that could not be consulted is a FAILURE entry, not a thrown error: one app being down
 * must not hide the claims the others reported.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One share-link slug another app owns. */
export interface FormsDistributionClaim {
    /** The app that owns the slug, for example "Caliber". */
    AppName: string;
    /** The claimed slug; always one of the form''s own. */
    Slug: string;
    /** What inside the app owns the slug, for example an interview step name. */
    OwnerLabel: string;
    /** The owning app''s own public link, or `null` when it must not be published. */
    RespondentURL: string | null;
}

/** An app that could not be consulted, or whose answer was partly refused. */
export interface FormsDistributionClaimFailure {
    /** The app that failed. */
    AppName: string;
    /** What went wrong, fit to show an author. */
    Message: string;
}

export interface FormsGetDistributionClaimsOutput {
    /** Every claimed slug, across all claimant apps. */
    Claims: FormsDistributionClaim[];
    /** Claimants that could not answer in full. */
    Failures: FormsDistributionClaimFailure[];
}
'
SET
  @OutputTypeIsArray_6e539bd8b828 = 0
SET
  @ExecutionMode_6e539bd8b828 = N'Sync'
SET
  @RequiredScope_6e539bd8b828 = N'forms:read'
SET
  @RequiresSystemUser_6e539bd8b828 = 0
SET
  @GenerationType_6e539bd8b828 = N'Manual'
SET
  @CodeApprovalStatus_6e539bd8b828 = N'Approved'
SET
  @Status_6e539bd8b828 = N'Active'
SET
  @CodeLocked_6e539bd8b828 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_6e539bd8b828,
  @Name = @Name_6e539bd8b828,
  @OperationKey = @OperationKey_6e539bd8b828,
  @CategoryID = @CategoryID_6e539bd8b828,
  @Description = @Description_6e539bd8b828,
  @InputTypeName = @InputTypeName_6e539bd8b828,
  @InputTypeDefinition = @InputTypeDefinition_6e539bd8b828,
  @InputTypeIsArray = @InputTypeIsArray_6e539bd8b828,
  @OutputTypeName = @OutputTypeName_6e539bd8b828,
  @OutputTypeDefinition = @OutputTypeDefinition_6e539bd8b828,
  @OutputTypeIsArray = @OutputTypeIsArray_6e539bd8b828,
  @ExecutionMode = @ExecutionMode_6e539bd8b828,
  @RequiredScope = @RequiredScope_6e539bd8b828,
  @RequiresSystemUser = @RequiresSystemUser_6e539bd8b828,
  @GenerationType = @GenerationType_6e539bd8b828,
  @Code = @Code_6e539bd8b828,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_6e539bd8b828,
  @CodeApprovedByUserID = @CodeApprovedByUserID_6e539bd8b828,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_6e539bd8b828,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_6e539bd8b828,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_6e539bd8b828,
  @CacheTTLSeconds = @CacheTTLSeconds_6e539bd8b828,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_6e539bd8b828,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_6e539bd8b828,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_6e539bd8b828,
  @CodeComments = @CodeComments_6e539bd8b828,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_6e539bd8b828,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_1d85b9d6f52a UNIQUEIDENTIFIER,
@Name_1d85b9d6f52a NVARCHAR(255),
@OperationKey_1d85b9d6f52a NVARCHAR(255),
@CategoryID_1d85b9d6f52a UNIQUEIDENTIFIER,
@Description_1d85b9d6f52a NVARCHAR(MAX),
@InputTypeName_1d85b9d6f52a NVARCHAR(255),
@InputTypeDefinition_1d85b9d6f52a NVARCHAR(MAX),
@InputTypeIsArray_1d85b9d6f52a BIT,
@OutputTypeName_1d85b9d6f52a NVARCHAR(255),
@OutputTypeDefinition_1d85b9d6f52a NVARCHAR(MAX),
@OutputTypeIsArray_1d85b9d6f52a BIT,
@ExecutionMode_1d85b9d6f52a NVARCHAR(20),
@RequiredScope_1d85b9d6f52a NVARCHAR(255),
@RequiresSystemUser_1d85b9d6f52a BIT,
@GenerationType_1d85b9d6f52a NVARCHAR(20),
@Code_1d85b9d6f52a NVARCHAR(MAX),
@CodeApprovalStatus_1d85b9d6f52a NVARCHAR(20),
@CodeApprovedByUserID_1d85b9d6f52a UNIQUEIDENTIFIER,
@CodeApprovedAt_1d85b9d6f52a DATETIMEOFFSET,
@ContractFingerprint_1d85b9d6f52a NVARCHAR(100),
@Status_1d85b9d6f52a NVARCHAR(20),
@CacheTTLSeconds_1d85b9d6f52a INT,
@TimeoutMS_1d85b9d6f52a INT,
@MaxConcurrency_1d85b9d6f52a INT,
@CodeLocked_1d85b9d6f52a BIT,
@CodeComments_1d85b9d6f52a NVARCHAR(MAX),
@Libraries_1d85b9d6f52a NVARCHAR(MAX)
SET
  @ID_1d85b9d6f52a = 'FAFBF717-C07C-4D39-A777-7ED64068FFE5'
SET
  @Name_1d85b9d6f52a = N'Save Automation'
SET
  @OperationKey_1d85b9d6f52a = N'Forms.SaveAutomation'
SET
  @CategoryID_1d85b9d6f52a = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_1d85b9d6f52a = N'Create or update one on-submit step and the entity binding it runs, in one transaction with the built-in steps seeded on a form''s first configured step and the form-settings mark that makes the form''s own automations authoritative.'
SET
  @InputTypeName_1d85b9d6f52a = N'FormsSaveAutomationInput'
SET
  @InputTypeDefinition_1d85b9d6f52a = N'/**
 * Input for `Forms.SaveAutomation`: create or update one on-submit step, together with the entity
 * binding it runs when it is a "send responses to a record" step.
 *
 * One transaction covers everything the builder used to do in separate saves: the binding, the four
 * built-in steps seeded when this is the form''s first configured step, the step itself, and the
 * form-settings mark that makes the form''s own automations authoritative.
 *
 * CREATE versus UPDATE is the presence of `ID`, and each has its own shape so the fields a create
 * needs cannot be forgotten. On create an omitted optional field takes the default named on it; on
 * update an omitted field keeps its stored value. JSON-bearing fields are JSON TEXT, parsed and
 * validated server-side with the contracts'' strict parsers, so this contract does not depend on the
 * contracts types.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** Step fields that may be set on create or changed on update. */
export interface FormsAutomationFields {
    /** Author''s note. `null` clears it. */
    Description?: string | null;
    /** The `MJ: Actions` row to run. Required when TargetType is Action. */
    ActionID?: string | null;
    /** The `MJ: AI Agents` row to run. Required when TargetType is Agent. */
    AgentID?: string | null;
    /** Which submissions fire it (the `FormAutomation.Trigger` CHECK values). Default on create: OnComplete. */
    Trigger?: ''OnComplete'' | ''OnCompleteOrPartial'' | ''OnPartial'';
    /** Sequential (Sync) steps always run before background (Async) ones. Default on create: Sync. */
    ExecutionMode?: ''Sync'' | ''Async'';
    /** JSON text of a ConditionalRule gating the step. `null` clears it (always runs). */
    ConditionalRule?: string | null;
    /** JSON text mapping answers to the target''s parameters. `null` clears it. */
    ParameterMapping?: string | null;
    /** Whether a failure lets later steps run. Default on create: true. */
    ContinueOnError?: boolean;
    /** Per-step timeout in milliseconds. `null`: the runner''s default. */
    TimeoutMS?: number | null;
    /** Whether the step runs at all. Default on create: true. */
    IsActive?: boolean;
}

/** A new step, ordered one past the form''s highest DisplayOrder. */
export interface FormsNewAutomation extends FormsAutomationFields {
    /** Absent: this is a create. */
    ID?: never;
    /** Display name. */
    Name: string;
    /** What the step runs (the `FormAutomation.TargetType` CHECK values). Fixed once created. */
    TargetType: ''Action'' | ''Agent'' | ''EntityBinding'';
}

/** A change to an existing step of the same form. */
export interface FormsAutomationUpdate extends FormsAutomationFields {
    /** The step to update. */
    ID: string;
    /** New display name. Omitted: unchanged. */
    Name?: string;
    /** Not changeable: remove the step and add another instead. */
    TargetType?: never;
}

/** The automation step to write (a `MJ_BizApps_Forms: Form Automations` row). */
export type FormsAutomationDraft = FormsNewAutomation | FormsAutomationUpdate;

/** Binding fields that may be set on create or changed on update. */
export interface FormsEntityBindingFields {
    /** Author''s note. `null` clears it. */
    Description?: string | null;
    /** JSON text of the per-field merge policy. `null` clears it. */
    MergePolicy?: string | null;
    /** Kill switch read at run time (the `FormEntityBinding.Status` CHECK values). Default on create: Active. */
    Status?: ''Active'' | ''Disabled'';
}

/** A new binding for this form. */
export interface FormsNewEntityBinding extends FormsEntityBindingFields {
    /** Absent: this is a create. */
    ID?: never;
    /** Display name. Omitted: derived from the target entity. */
    Name?: string;
    /** The MJ entity name records are written to; the server resolves and stores its id. */
    TargetEntityName: string;
    /** JSON text of the answer-to-field mappings. */
    FieldMappings: string;
    /** JSON text of the identity rule (AlwaysCreate, or MatchThenCreate on named fields). */
    IdentityRule: string;
}

/** A change to the binding the step already runs. */
export interface FormsEntityBindingUpdate extends FormsEntityBindingFields {
    /** The binding to update; must be the one the step runs. */
    ID: string;
    /** New display name. Omitted: unchanged. */
    Name?: string;
    /** Not changeable: a binding writes to one entity for life. */
    TargetEntityName?: never;
    /** New JSON text of the answer-to-field mappings. Omitted: unchanged. */
    FieldMappings?: string;
    /** New JSON text of the identity rule. Omitted: unchanged. */
    IdentityRule?: string;
}

/** The entity binding an EntityBinding step runs (a `MJ_BizApps_Forms: Form Entity Bindings` row). */
export type FormsEntityBindingDraft = FormsNewEntityBinding | FormsEntityBindingUpdate;

export interface FormsSaveAutomationInput {
    /** The form that owns the step. An update to a step of a different form is refused. */
    FormID: string;
    /** The step to create or update. */
    Automation: FormsAutomationDraft;
    /** Required to create an EntityBinding step; refused for Action and Agent steps. Omitted on update: the step keeps its binding. */
    Binding?: FormsEntityBindingDraft;
}
'
SET
  @InputTypeIsArray_1d85b9d6f52a = 0
SET
  @OutputTypeName_1d85b9d6f52a = N'FormsSaveAutomationOutput'
SET
  @OutputTypeDefinition_1d85b9d6f52a = N'/**
 * Output for `Forms.SaveAutomation`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsSaveAutomationOutput {
    /** The step written. */
    FormAutomationID: string;
    /** The binding the step runs, or `null` for an Action or Agent step. */
    FormEntityBindingID: string | null;
    /** The step''s DisplayOrder after the save. */
    DisplayOrder: number;
    /** Built-in steps seeded in the same transaction because this was the form''s first configured step. Usually empty. */
    SeededAutomationIDs: string[];
}
'
SET
  @OutputTypeIsArray_1d85b9d6f52a = 0
SET
  @ExecutionMode_1d85b9d6f52a = N'Sync'
SET
  @RequiredScope_1d85b9d6f52a = N'forms:write'
SET
  @RequiresSystemUser_1d85b9d6f52a = 0
SET
  @GenerationType_1d85b9d6f52a = N'Manual'
SET
  @CodeApprovalStatus_1d85b9d6f52a = N'Approved'
SET
  @Status_1d85b9d6f52a = N'Active'
SET
  @CodeLocked_1d85b9d6f52a = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_1d85b9d6f52a,
  @Name = @Name_1d85b9d6f52a,
  @OperationKey = @OperationKey_1d85b9d6f52a,
  @CategoryID = @CategoryID_1d85b9d6f52a,
  @Description = @Description_1d85b9d6f52a,
  @InputTypeName = @InputTypeName_1d85b9d6f52a,
  @InputTypeDefinition = @InputTypeDefinition_1d85b9d6f52a,
  @InputTypeIsArray = @InputTypeIsArray_1d85b9d6f52a,
  @OutputTypeName = @OutputTypeName_1d85b9d6f52a,
  @OutputTypeDefinition = @OutputTypeDefinition_1d85b9d6f52a,
  @OutputTypeIsArray = @OutputTypeIsArray_1d85b9d6f52a,
  @ExecutionMode = @ExecutionMode_1d85b9d6f52a,
  @RequiredScope = @RequiredScope_1d85b9d6f52a,
  @RequiresSystemUser = @RequiresSystemUser_1d85b9d6f52a,
  @GenerationType = @GenerationType_1d85b9d6f52a,
  @Code = @Code_1d85b9d6f52a,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_1d85b9d6f52a,
  @CodeApprovedByUserID = @CodeApprovedByUserID_1d85b9d6f52a,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_1d85b9d6f52a,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_1d85b9d6f52a,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_1d85b9d6f52a,
  @CacheTTLSeconds = @CacheTTLSeconds_1d85b9d6f52a,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_1d85b9d6f52a,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_1d85b9d6f52a,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_1d85b9d6f52a,
  @CodeComments = @CodeComments_1d85b9d6f52a,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_1d85b9d6f52a,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_e034f02d1e30 UNIQUEIDENTIFIER,
@Name_e034f02d1e30 NVARCHAR(255),
@OperationKey_e034f02d1e30 NVARCHAR(255),
@CategoryID_e034f02d1e30 UNIQUEIDENTIFIER,
@Description_e034f02d1e30 NVARCHAR(MAX),
@InputTypeName_e034f02d1e30 NVARCHAR(255),
@InputTypeDefinition_e034f02d1e30 NVARCHAR(MAX),
@InputTypeIsArray_e034f02d1e30 BIT,
@OutputTypeName_e034f02d1e30 NVARCHAR(255),
@OutputTypeDefinition_e034f02d1e30 NVARCHAR(MAX),
@OutputTypeIsArray_e034f02d1e30 BIT,
@ExecutionMode_e034f02d1e30 NVARCHAR(20),
@RequiredScope_e034f02d1e30 NVARCHAR(255),
@RequiresSystemUser_e034f02d1e30 BIT,
@GenerationType_e034f02d1e30 NVARCHAR(20),
@Code_e034f02d1e30 NVARCHAR(MAX),
@CodeApprovalStatus_e034f02d1e30 NVARCHAR(20),
@CodeApprovedByUserID_e034f02d1e30 UNIQUEIDENTIFIER,
@CodeApprovedAt_e034f02d1e30 DATETIMEOFFSET,
@ContractFingerprint_e034f02d1e30 NVARCHAR(100),
@Status_e034f02d1e30 NVARCHAR(20),
@CacheTTLSeconds_e034f02d1e30 INT,
@TimeoutMS_e034f02d1e30 INT,
@MaxConcurrency_e034f02d1e30 INT,
@CodeLocked_e034f02d1e30 BIT,
@CodeComments_e034f02d1e30 NVARCHAR(MAX),
@Libraries_e034f02d1e30 NVARCHAR(MAX)
SET
  @ID_e034f02d1e30 = '37752C2C-12BB-45FC-998C-D4123A09EE3C'
SET
  @Name_e034f02d1e30 = N'Reorder Automations'
SET
  @OperationKey_e034f02d1e30 = N'Forms.ReorderAutomations'
SET
  @CategoryID_e034f02d1e30 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_e034f02d1e30 = N'Rewrite the run order of every on-submit step of a form in one transaction. Sync steps always precede Async ones, so an order that contradicts that is refused.'
SET
  @InputTypeName_e034f02d1e30 = N'FormsReorderAutomationsInput'
SET
  @InputTypeDefinition_e034f02d1e30 = N'/**
 * Input for `Forms.ReorderAutomations`.
 *
 * The COMPLETE desired order, not a single move: the server rewrites DisplayOrder for every step in
 * one transaction, so there is no half-applied swap to compensate for. Sync steps always run before
 * Async ones whatever DisplayOrder says, so an order placing an Async step ahead of a Sync step is
 * refused rather than saved and silently ignored by the runner.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReorderAutomationsInput {
    /** The form whose steps are reordered. */
    FormID: string;
    /** Every one of the form''s automation ids exactly once, in run order. */
    OrderedAutomationIDs: string[];
}
'
SET
  @InputTypeIsArray_e034f02d1e30 = 0
SET
  @OutputTypeName_e034f02d1e30 = N'FormsReorderAutomationsOutput'
SET
  @OutputTypeDefinition_e034f02d1e30 = N'/**
 * Output for `Forms.ReorderAutomations`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One step''s position after the reorder. */
export interface FormsAutomationPosition {
    /** The step. */
    FormAutomationID: string;
    /** Its stored DisplayOrder. */
    DisplayOrder: number;
}

export interface FormsReorderAutomationsOutput {
    /** Every step of the form, in run order. */
    Automations: FormsAutomationPosition[];
}
'
SET
  @OutputTypeIsArray_e034f02d1e30 = 0
SET
  @ExecutionMode_e034f02d1e30 = N'Sync'
SET
  @RequiredScope_e034f02d1e30 = N'forms:write'
SET
  @RequiresSystemUser_e034f02d1e30 = 0
SET
  @GenerationType_e034f02d1e30 = N'Manual'
SET
  @CodeApprovalStatus_e034f02d1e30 = N'Approved'
SET
  @Status_e034f02d1e30 = N'Active'
SET
  @CodeLocked_e034f02d1e30 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_e034f02d1e30,
  @Name = @Name_e034f02d1e30,
  @OperationKey = @OperationKey_e034f02d1e30,
  @CategoryID = @CategoryID_e034f02d1e30,
  @Description = @Description_e034f02d1e30,
  @InputTypeName = @InputTypeName_e034f02d1e30,
  @InputTypeDefinition = @InputTypeDefinition_e034f02d1e30,
  @InputTypeIsArray = @InputTypeIsArray_e034f02d1e30,
  @OutputTypeName = @OutputTypeName_e034f02d1e30,
  @OutputTypeDefinition = @OutputTypeDefinition_e034f02d1e30,
  @OutputTypeIsArray = @OutputTypeIsArray_e034f02d1e30,
  @ExecutionMode = @ExecutionMode_e034f02d1e30,
  @RequiredScope = @RequiredScope_e034f02d1e30,
  @RequiresSystemUser = @RequiresSystemUser_e034f02d1e30,
  @GenerationType = @GenerationType_e034f02d1e30,
  @Code = @Code_e034f02d1e30,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_e034f02d1e30,
  @CodeApprovedByUserID = @CodeApprovedByUserID_e034f02d1e30,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_e034f02d1e30,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_e034f02d1e30,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_e034f02d1e30,
  @CacheTTLSeconds = @CacheTTLSeconds_e034f02d1e30,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_e034f02d1e30,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_e034f02d1e30,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_e034f02d1e30,
  @CodeComments = @CodeComments_e034f02d1e30,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_e034f02d1e30,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_7a5d91e58541 UNIQUEIDENTIFIER,
@Name_7a5d91e58541 NVARCHAR(255),
@OperationKey_7a5d91e58541 NVARCHAR(255),
@CategoryID_7a5d91e58541 UNIQUEIDENTIFIER,
@Description_7a5d91e58541 NVARCHAR(MAX),
@InputTypeName_7a5d91e58541 NVARCHAR(255),
@InputTypeDefinition_7a5d91e58541 NVARCHAR(MAX),
@InputTypeIsArray_7a5d91e58541 BIT,
@OutputTypeName_7a5d91e58541 NVARCHAR(255),
@OutputTypeDefinition_7a5d91e58541 NVARCHAR(MAX),
@OutputTypeIsArray_7a5d91e58541 BIT,
@ExecutionMode_7a5d91e58541 NVARCHAR(20),
@RequiredScope_7a5d91e58541 NVARCHAR(255),
@RequiresSystemUser_7a5d91e58541 BIT,
@GenerationType_7a5d91e58541 NVARCHAR(20),
@Code_7a5d91e58541 NVARCHAR(MAX),
@CodeApprovalStatus_7a5d91e58541 NVARCHAR(20),
@CodeApprovedByUserID_7a5d91e58541 UNIQUEIDENTIFIER,
@CodeApprovedAt_7a5d91e58541 DATETIMEOFFSET,
@ContractFingerprint_7a5d91e58541 NVARCHAR(100),
@Status_7a5d91e58541 NVARCHAR(20),
@CacheTTLSeconds_7a5d91e58541 INT,
@TimeoutMS_7a5d91e58541 INT,
@MaxConcurrency_7a5d91e58541 INT,
@CodeLocked_7a5d91e58541 BIT,
@CodeComments_7a5d91e58541 NVARCHAR(MAX),
@Libraries_7a5d91e58541 NVARCHAR(MAX)
SET
  @ID_7a5d91e58541 = 'B662E9A2-F200-46E1-9788-235C3D429FC4'
SET
  @Name_7a5d91e58541 = N'Remove Automation'
SET
  @OperationKey_7a5d91e58541 = N'Forms.RemoveAutomation'
SET
  @CategoryID_7a5d91e58541 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_7a5d91e58541 = N'Remove one on-submit step. The binding it ran is kept, and the form stays marked as owning its automation list so removing the last step cannot restore the legacy built-ins.'
SET
  @InputTypeName_7a5d91e58541 = N'FormsRemoveAutomationInput'
SET
  @InputTypeDefinition_7a5d91e58541 = N'/**
 * Input for `Forms.RemoveAutomation`.
 *
 * Removing a step never deletes the binding it ran: a binding''s ledger of written records outlives
 * the step. The form is marked as owning its automation list in the same transaction, so removing
 * the last step cannot bring the legacy built-ins back.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRemoveAutomationInput {
    /** The step to remove. */
    FormAutomationID: string;
}
'
SET
  @InputTypeIsArray_7a5d91e58541 = 0
SET
  @OutputTypeName_7a5d91e58541 = N'FormsRemoveAutomationOutput'
SET
  @OutputTypeDefinition_7a5d91e58541 = N'/**
 * Output for `Forms.RemoveAutomation`.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsRemoveAutomationOutput {
    /** The step removed. */
    FormAutomationID: string;
    /** The form it belonged to. */
    FormID: string;
    /** The binding the step ran, left in place; `null` when it ran an Action or Agent. */
    RetainedBindingID: string | null;
    /**
     * Built-in steps seeded in the same transaction, because the removal is what turned the form''s
     * own steps on (a form still on Legacy dispatch). Usually empty.
     */
    SeededAutomationIDs: string[];
}
'
SET
  @OutputTypeIsArray_7a5d91e58541 = 0
SET
  @ExecutionMode_7a5d91e58541 = N'Sync'
SET
  @RequiredScope_7a5d91e58541 = N'forms:write'
SET
  @RequiresSystemUser_7a5d91e58541 = 0
SET
  @GenerationType_7a5d91e58541 = N'Manual'
SET
  @CodeApprovalStatus_7a5d91e58541 = N'Approved'
SET
  @Status_7a5d91e58541 = N'Active'
SET
  @CodeLocked_7a5d91e58541 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_7a5d91e58541,
  @Name = @Name_7a5d91e58541,
  @OperationKey = @OperationKey_7a5d91e58541,
  @CategoryID = @CategoryID_7a5d91e58541,
  @Description = @Description_7a5d91e58541,
  @InputTypeName = @InputTypeName_7a5d91e58541,
  @InputTypeDefinition = @InputTypeDefinition_7a5d91e58541,
  @InputTypeIsArray = @InputTypeIsArray_7a5d91e58541,
  @OutputTypeName = @OutputTypeName_7a5d91e58541,
  @OutputTypeDefinition = @OutputTypeDefinition_7a5d91e58541,
  @OutputTypeIsArray = @OutputTypeIsArray_7a5d91e58541,
  @ExecutionMode = @ExecutionMode_7a5d91e58541,
  @RequiredScope = @RequiredScope_7a5d91e58541,
  @RequiresSystemUser = @RequiresSystemUser_7a5d91e58541,
  @GenerationType = @GenerationType_7a5d91e58541,
  @Code = @Code_7a5d91e58541,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_7a5d91e58541,
  @CodeApprovedByUserID = @CodeApprovedByUserID_7a5d91e58541,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_7a5d91e58541,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_7a5d91e58541,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_7a5d91e58541,
  @CacheTTLSeconds = @CacheTTLSeconds_7a5d91e58541,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_7a5d91e58541,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_7a5d91e58541,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_7a5d91e58541,
  @CodeComments = @CodeComments_7a5d91e58541,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_7a5d91e58541,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_9e2ec47969cd UNIQUEIDENTIFIER,
@Name_9e2ec47969cd NVARCHAR(255),
@OperationKey_9e2ec47969cd NVARCHAR(255),
@CategoryID_9e2ec47969cd UNIQUEIDENTIFIER,
@Description_9e2ec47969cd NVARCHAR(MAX),
@InputTypeName_9e2ec47969cd NVARCHAR(255),
@InputTypeDefinition_9e2ec47969cd NVARCHAR(MAX),
@InputTypeIsArray_9e2ec47969cd BIT,
@OutputTypeName_9e2ec47969cd NVARCHAR(255),
@OutputTypeDefinition_9e2ec47969cd NVARCHAR(MAX),
@OutputTypeIsArray_9e2ec47969cd BIT,
@ExecutionMode_9e2ec47969cd NVARCHAR(20),
@RequiredScope_9e2ec47969cd NVARCHAR(255),
@RequiresSystemUser_9e2ec47969cd BIT,
@GenerationType_9e2ec47969cd NVARCHAR(20),
@Code_9e2ec47969cd NVARCHAR(MAX),
@CodeApprovalStatus_9e2ec47969cd NVARCHAR(20),
@CodeApprovedByUserID_9e2ec47969cd UNIQUEIDENTIFIER,
@CodeApprovedAt_9e2ec47969cd DATETIMEOFFSET,
@ContractFingerprint_9e2ec47969cd NVARCHAR(100),
@Status_9e2ec47969cd NVARCHAR(20),
@CacheTTLSeconds_9e2ec47969cd INT,
@TimeoutMS_9e2ec47969cd INT,
@MaxConcurrency_9e2ec47969cd INT,
@CodeLocked_9e2ec47969cd BIT,
@CodeComments_9e2ec47969cd NVARCHAR(MAX),
@Libraries_9e2ec47969cd NVARCHAR(MAX)
SET
  @ID_9e2ec47969cd = '64C43464-03CB-471F-8207-E8246BA103BA'
SET
  @Name_9e2ec47969cd = N'Get Response Summary'
SET
  @OperationKey_9e2ec47969cd = N'Forms.GetResponseSummary'
SET
  @CategoryID_9e2ec47969cd = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_9e2ec47969cd = N'Every section of the reporting dashboard for a form (headline counts and typical duration, who responded, per-question charts, written-answer insights, the page funnel), computed server-side from every answer. Returns counts, rates and groupings, never an email, phone, name or written answer (numeric min/max and grouping labels such as countries, organisations and email domains do come from answers; see the output type). Read-only.'
SET
  @InputTypeName_9e2ec47969cd = N'FormsGetResponseSummaryInput'
SET
  @InputTypeDefinition_9e2ec47969cd = N'/**
 * Input for `Forms.GetResponseSummary`.
 *
 * Responses are scoped by FORM, across every version, unless a version is named: each response pins
 * the version that was live when it was submitted, so filtering to the latest version alone hides
 * every response an earlier one collected. Question and page labels come from the named version, or
 * from the form''s Published version when none is named.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetResponseSummaryInput {
    /** The form to report on. */
    FormID: string;
    /** Narrow to the responses of one version, and label from it. Omitted or `null`: every version. */
    FormVersionID?: string | null;
}
'
SET
  @InputTypeIsArray_9e2ec47969cd = 0
SET
  @OutputTypeName_9e2ec47969cd = N'FormsGetResponseSummaryOutput'
SET
  @OutputTypeDefinition_9e2ec47969cd = N'/**
 * Output for `Forms.GetResponseSummary`: every section of the reporting dashboard
 * (`FormReportData` in forms-ng: summary, profile, breakdowns, open text, funnel), computed on the
 * server instead of in the browser over every answer row.
 *
 * AGGREGATES, NOT ANSWERS. The server reads every value and returns counts, rates, medians and
 * groupings. What it does NOT return: an email address, phone number, street address, name, written
 * answer, rendered Matrix answer, or a choice value outside the question''s options (counted in one
 * "Other (not an option)" bucket instead, since such a value can be anything a client sent).
 *
 * What it DOES return that comes from answers, stated exactly so nobody reads more into "aggregate":
 *  - a Number/Rating/NPS question''s `Min` and `Max`, which are stored values verbatim;
 *  - grouping labels taken verbatim from answers: countries and organisation names (as typed) and
 *    email DOMAINS (local parts never read), each folded to the top six plus "Other (n more)";
 *    month and time-of-day buckets of Date and Time answers; LongText theme terms used in at least
 *    two answers;
 *  - any of those groupings at a count of 1 — a single respondent''s country, organisation, personal
 *    email domain or birth month can appear as its own bucket. No minimum-count threshold applies.
 * That is acceptable because every caller of this operation is authorized to read each answer in
 * full through `Forms.ListResponses` and `Forms.GetResponseDetail` (the same reading rule, enforced
 * by row filters there; the summary refuses a caller whose reads of responses are row-filtered). The
 * summary limits what a dashboard puts on screen; it is not an anonymisation boundary.
 *
 * Population rules (applied in forms-core-entities-server''s `reporting/` module and the Forms
 * reporting queries; the browser dashboard computed them until #303): the headline, the breakdowns, the
 * profile and the open-text section describe COMPLETE responses; the funnel counts every response,
 * because drop-off is a fact about the people who abandoned. Instants are ISO-8601 strings.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** Headline figures. */
export interface FormsResponseSummaryStats {
    /** Complete responses: the headline count. A Partial row is an in-progress autosave, not a response. */
    TotalResponses: number;
    /** Responses with Status Complete (equal to TotalResponses; kept so the two meanings stay distinct). */
    CompleteResponses: number;
    /** Responses with Status Partial. */
    PartialResponses: number;
    /** Responses with Status Disqualified (ended by a knockout). */
    DisqualifiedResponses: number;
    /** Complete divided by every started response (Complete + Partial + Disqualified), 0..1; 0 when none. */
    CompletionRate: number;
    /** MEDIAN seconds from StartedAt to SubmittedAt over Complete responses whose gap is 0..24 h; `null` when none qualify. */
    TypicalCompletionSeconds: number | null;
    /** Latest SubmittedAt over Complete responses; `null` when none. */
    LastSubmittedAt: string | null;
}

/** One bucket of a distribution. */
export interface FormsAnswerBucket {
    /** Display label: an option label, "Other (not an option)", Yes/No, a period, a domain, or "Other (n more)". */
    Label: string;
    /** Answers (or, for profile groupings, addresses or responses) in this bucket. */
    Count: number;
    /** Count divided by the distribution''s total, 0..1. */
    Fraction: number;
}

/** Counts of NPS segments. */
export interface FormsNPSSegments {
    /** Ratings 0..6. */
    Detractors: number;
    /** Ratings 7..8. */
    Passives: number;
    /** Ratings 9..10. */
    Promoters: number;
}

/** Aggregates for numeric questions (Number, Rating, NPS, OpinionScale). */
export interface FormsNumericAggregate {
    /** Answers carrying a number. */
    Answered: number;
    /** Smallest answer; `null` when none. */
    Min: number | null;
    /** Largest answer; `null` when none. */
    Max: number | null;
    /** Mean answer; `null` when none. */
    Average: number | null;
    /** NPS score -100..100 over ratings within 0..10 only; `null` unless an NPS question with such ratings. */
    NPSScore: number | null;
    /** Segment counts behind NPSScore; `null` unless NPSScore is set. */
    NPSSegments: FormsNPSSegments | null;
}

/** One (row, column) cell of a Matrix question: how many answers chose that column for that row. */
export interface FormsMatrixCell {
    /** The row option''s label. */
    RowLabel: string;
    /** The column option''s label. */
    ColumnLabel: string;
    /** Answers that chose this column for this row. */
    Count: number;
}

/** One CHARTED question''s breakdown (roles choice, scale, sentiment, consent, temporal, composite). */
export interface FormsQuestionBreakdown {
    /** The question. */
    QuestionID: string;
    /** Its prompt, from the labelling version. */
    Prompt: string;
    /** Its type: a `FormQuestionType` key from the contracts (validate with `isFormQuestionType`). */
    QuestionType: string;
    /** Which card renders it (the dashboard''s insight role; identity, open text and attachment questions are reported elsewhere). */
    Role: ''choice'' | ''scale'' | ''sentiment'' | ''consent'' | ''temporal'' | ''composite'';
    /** Complete responses that stored a value for it: a blank row, a choice answer that selected nothing, or a Matrix answer with no cell chosen does not count. */
    AnsweredCount: number;
    /** choice: every option (plus "Other (not an option)" when an answer held a value outside them), most chosen first. sentiment and consent: Yes then No. temporal: periods in order, never re-sorted. Otherwise empty. */
    Buckets: FormsAnswerBucket[];
    /** scale only; `null` otherwise. */
    Numeric: FormsNumericAggregate | null;
    /** composite (Matrix) only: every row x column cell with a count, in option order; empty otherwise. */
    MatrixCells: FormsMatrixCell[];
}

/** One counted fact about the respondent population, formatted as the profile panel shows it. */
export interface FormsProfileMetric {
    /** What is counted, for example "Contactable". */
    Label: string;
    /** The figure, already formatted, for example "31" or "61%". */
    Value: string;
    /** The reading under it, for example "of 40 responses gave an email"; empty when the value says it all. */
    Detail: string;
    /** 0..1 when the metric is a share, for the inline meter; `null` otherwise. */
    Fraction: number | null;
}

/** A named grouping of the population, folded to the top six plus "Other". */
export interface FormsProfileDistribution {
    /** For example "Email domains", "Countries", "Organisations". */
    Title: string;
    /** What the grouping means and its caveat. */
    Caption: string;
    /** Biggest first. */
    Buckets: FormsAnswerBucket[];
}

/** The "Who responded" section: identity and attachment questions, counted and never quoted. */
export interface FormsRespondentProfile {
    /** True when the form asks nothing that profiles a respondent; the section is then omitted. */
    IsEmpty: boolean;
    /** Contactable, distinct people, work addresses, phone/website/address/drawing/file coverage. */
    Metrics: FormsProfileMetric[];
    /** Email domains (local parts never read), countries, organisations. */
    Distributions: FormsProfileDistribution[];
}

/** One recurring term across a LongText question''s answers. */
export interface FormsTextTheme {
    /** The term, lowercased. */
    Term: string;
    /** Answers containing it (at least 2), not occurrences. */
    Answers: number;
    /** Answers divided by the question''s Answered, 0..1. */
    Fraction: number;
}

/** What can be said about one written question (ShortText, LongText) without quoting it. */
export interface FormsOpenTextInsight {
    /** The question. */
    QuestionID: string;
    /** Its prompt. */
    Prompt: string;
    /** Its type: a `FormQuestionType` key; the client maps it to its display label. */
    QuestionType: string;
    /** Complete responses that wrote something, de-duplicated by response. */
    Answered: number;
    /** Complete responses that did not, clamped at 0. */
    Skipped: number;
    /** Answered divided by Complete responses, 0..1; `null` when there are none. */
    ResponseRate: number | null;
    /** Median characters across non-empty answers, rounded; `null` when nothing was written. */
    MedianLength: number | null;
    /** Up to 8 recurring terms, most common first. Always empty when ThemesApply is false. */
    Themes: FormsTextTheme[];
    /** Whether themes are mined for this type at all (LongText only, so names typed into a ShortText never become themes). */
    ThemesApply: boolean;
}

/** One step of the page completion funnel. */
export interface FormsFunnelStep {
    /** The page. */
    PageID: string;
    /** Its title, or a positional fallback ("Page 2") when it has none. */
    Title: string;
    /** Its DisplayOrder in the labelling version. */
    DisplayOrder: number;
    /** Responses (any status) that answered at least one question on the page. */
    Reached: number;
    /** Reached divided by the first step''s Reached, 0..1. */
    Retention: number;
    /** Drop relative to the previous step, 0..1. */
    DropOff: number;
}

export interface FormsGetResponseSummaryOutput {
    /** The form reported on. */
    FormID: string;
    /** The version the labels came from; `null` when the form has never been published. */
    LabelVersionID: string | null;
    /** Headline figures. */
    Summary: FormsResponseSummaryStats;
    /** Who responded. */
    Profile: FormsRespondentProfile;
    /** One entry per charted question of the labelling version, in page then question order. */
    Questions: FormsQuestionBreakdown[];
    /** One entry per ShortText or LongText question, in page then question order. */
    OpenText: FormsOpenTextInsight[];
    /** One step per page that asks at least one answerable question, in DisplayOrder. */
    Funnel: FormsFunnelStep[];
    /**
     * True when the form holds more identity, written-answer and Matrix answers than one summary
     * reads (a fixed server ceiling). Profile, OpenText and the Matrix cells then describe only the
     * answers read, and the dashboard must say so; every other section is exact either way.
     */
    InsightAnswersCapped: boolean;
}
'
SET
  @OutputTypeIsArray_9e2ec47969cd = 0
SET
  @ExecutionMode_9e2ec47969cd = N'Sync'
SET
  @RequiredScope_9e2ec47969cd = N'forms:read'
SET
  @RequiresSystemUser_9e2ec47969cd = 0
SET
  @GenerationType_9e2ec47969cd = N'Manual'
SET
  @CodeApprovalStatus_9e2ec47969cd = N'Approved'
SET
  @Status_9e2ec47969cd = N'Active'
SET
  @CodeLocked_9e2ec47969cd = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_9e2ec47969cd,
  @Name = @Name_9e2ec47969cd,
  @OperationKey = @OperationKey_9e2ec47969cd,
  @CategoryID = @CategoryID_9e2ec47969cd,
  @Description = @Description_9e2ec47969cd,
  @InputTypeName = @InputTypeName_9e2ec47969cd,
  @InputTypeDefinition = @InputTypeDefinition_9e2ec47969cd,
  @InputTypeIsArray = @InputTypeIsArray_9e2ec47969cd,
  @OutputTypeName = @OutputTypeName_9e2ec47969cd,
  @OutputTypeDefinition = @OutputTypeDefinition_9e2ec47969cd,
  @OutputTypeIsArray = @OutputTypeIsArray_9e2ec47969cd,
  @ExecutionMode = @ExecutionMode_9e2ec47969cd,
  @RequiredScope = @RequiredScope_9e2ec47969cd,
  @RequiresSystemUser = @RequiresSystemUser_9e2ec47969cd,
  @GenerationType = @GenerationType_9e2ec47969cd,
  @Code = @Code_9e2ec47969cd,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_9e2ec47969cd,
  @CodeApprovedByUserID = @CodeApprovedByUserID_9e2ec47969cd,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_9e2ec47969cd,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_9e2ec47969cd,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_9e2ec47969cd,
  @CacheTTLSeconds = @CacheTTLSeconds_9e2ec47969cd,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_9e2ec47969cd,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_9e2ec47969cd,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_9e2ec47969cd,
  @CodeComments = @CodeComments_9e2ec47969cd,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_9e2ec47969cd,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_7594f627451e UNIQUEIDENTIFIER,
@Name_7594f627451e NVARCHAR(255),
@OperationKey_7594f627451e NVARCHAR(255),
@CategoryID_7594f627451e UNIQUEIDENTIFIER,
@Description_7594f627451e NVARCHAR(MAX),
@InputTypeName_7594f627451e NVARCHAR(255),
@InputTypeDefinition_7594f627451e NVARCHAR(MAX),
@InputTypeIsArray_7594f627451e BIT,
@OutputTypeName_7594f627451e NVARCHAR(255),
@OutputTypeDefinition_7594f627451e NVARCHAR(MAX),
@OutputTypeIsArray_7594f627451e BIT,
@ExecutionMode_7594f627451e NVARCHAR(20),
@RequiredScope_7594f627451e NVARCHAR(255),
@RequiresSystemUser_7594f627451e BIT,
@GenerationType_7594f627451e NVARCHAR(20),
@Code_7594f627451e NVARCHAR(MAX),
@CodeApprovalStatus_7594f627451e NVARCHAR(20),
@CodeApprovedByUserID_7594f627451e UNIQUEIDENTIFIER,
@CodeApprovedAt_7594f627451e DATETIMEOFFSET,
@ContractFingerprint_7594f627451e NVARCHAR(100),
@Status_7594f627451e NVARCHAR(20),
@CacheTTLSeconds_7594f627451e INT,
@TimeoutMS_7594f627451e INT,
@MaxConcurrency_7594f627451e INT,
@CodeLocked_7594f627451e BIT,
@CodeComments_7594f627451e NVARCHAR(MAX),
@Libraries_7594f627451e NVARCHAR(MAX)
SET
  @ID_7594f627451e = '4E98ADC2-73E2-4296-8E79-3380C3F9EF65'
SET
  @Name_7594f627451e = N'List Responses'
SET
  @OperationKey_7594f627451e = N'Forms.ListResponses'
SET
  @CategoryID_7594f627451e = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_7594f627451e = N'One page of a form''s responses with the total row count, filterable by version and status; with IncludeAnswers, each row''s stored answers and the labelling definition, which is how the export reads every response page by page. Read-only.'
SET
  @InputTypeName_7594f627451e = N'FormsListResponsesInput'
SET
  @InputTypeDefinition_7594f627451e = N'/**
 * Input for `Forms.ListResponses`: one page of a form''s responses, newest first by default.
 *
 * Two callers: the Responses list, which pages through rows only, and the dashboard''s CSV/Excel
 * export, which pages through EVERY response with its stored answers (`IncludeAnswers: true`)
 * and pivots them response x question. The export reads the whole form this way, page by page,
 * because no single page is allowed to be unbounded.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsListResponsesInput {
    /** The form whose responses are listed. */
    FormID: string;
    /** Only responses pinned to this version. Omitted or `null`: every version. */
    FormVersionID?: string | null;
    /** Only responses in this status (the `FormResponse.Status` CHECK values). Omitted: every status. */
    Status?: ''Complete'' | ''Disqualified'' | ''Partial'';
    /** Zero-based index of the first row to return. */
    StartRow: number;
    /** Rows to return; the server caps it. */
    MaxRows: number;
    /** Sort order, from a fixed set so no caller-supplied SQL reaches the view. Default: SubmittedAt DESC. */
    OrderBy?: ''SubmittedAt DESC'' | ''SubmittedAt ASC'' | ''StartedAt DESC'' | ''StartedAt ASC'';
    /** Attach each row''s stored answers, and the labelling definition, for the export. */
    IncludeAnswers: boolean;
}
'
SET
  @InputTypeIsArray_7594f627451e = 0
SET
  @OutputTypeName_7594f627451e = N'FormsListResponsesOutput'
SET
  @OutputTypeDefinition_7594f627451e = N'/**
 * Output for `Forms.ListResponses`. Instants are ISO-8601 strings.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/**
 * One stored answer, exactly as the `FormResponseAnswer` row holds it (one typed column used per
 * answer; the rest `null`). Shared by `Forms.ListResponses` (export) and `Forms.GetResponseDetail`.
 *
 * `Score` and `ScoreRationale` are deliberately absent: neither the export nor the detail view
 * shows them (the scoring automation scores every ShortText answer, so a first name got
 * "Score: 100" beside it), and a value nobody renders is not worth sending.
 */
export interface FormsStoredAnswer {
    /** The `MJ_BizApps_Forms: Form Response Answers` row. */
    ID: string;
    /** The question answered. */
    QuestionID: string;
    /** Text and single-choice answers. */
    TextValue: string | null;
    /** Number, rating and NPS answers. */
    NumericValue: number | null;
    /** Date answers, ISO-8601. */
    DateValue: string | null;
    /** Yes/no and consent answers. */
    BooleanValue: boolean | null;
    /** JSON text of multi-select and composite answers. */
    JSONValue: string | null;
    /** The `MJ: Files` id of a file answer. */
    FileID: string | null;
}

/** One response in the list. */
export interface FormsResponseListRow {
    /** The `MJ_BizApps_Forms: Form Responses` row. */
    ResponseID: string;
    /** Its status (the `FormResponse.Status` CHECK values). */
    Status: ''Complete'' | ''Disqualified'' | ''Partial'';
    /** The version it was submitted against. */
    FormVersionID: string;
    /** When the respondent began; `null` when unrecorded. */
    StartedAt: string | null;
    /** When it was submitted; `null` for a Partial. */
    SubmittedAt: string | null;
    /** The linked Person, when one was matched; `null` for an anonymous response. */
    RespondentPersonID: string | null;
    /** Who responded, for display: the linked Person''s name, else a name or email answer, else "Anonymous". */
    Respondent: string;
    /** Questions this response stored an answer for. */
    AnsweredCount: number;
    /** Every stored answer of the response. Present only when the input''s IncludeAnswers is true. */
    Answers?: FormsStoredAnswer[];
}

export interface FormsListResponsesOutput {
    /** The requested page of rows. */
    Rows: FormsResponseListRow[];
    /** Rows matching the filters across all pages. */
    TotalRowCount: number;
    /** The version whose questions labelled Respondent (and that the export pivots onto): the input''s FormVersionID when given, else the form''s Published version; `null` if neither exists. */
    LabelVersionID: string | null;
    /** JSON text of LabelVersionID''s `PublishedFormDefinition` snapshot, for export columns. Present only when IncludeAnswers is true and LabelVersionID is set. */
    DefinitionJSON?: string;
}
'
SET
  @OutputTypeIsArray_7594f627451e = 0
SET
  @ExecutionMode_7594f627451e = N'Sync'
SET
  @RequiredScope_7594f627451e = N'forms:read'
SET
  @RequiresSystemUser_7594f627451e = 0
SET
  @GenerationType_7594f627451e = N'Manual'
SET
  @CodeApprovalStatus_7594f627451e = N'Approved'
SET
  @Status_7594f627451e = N'Active'
SET
  @CodeLocked_7594f627451e = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_7594f627451e,
  @Name = @Name_7594f627451e,
  @OperationKey = @OperationKey_7594f627451e,
  @CategoryID = @CategoryID_7594f627451e,
  @Description = @Description_7594f627451e,
  @InputTypeName = @InputTypeName_7594f627451e,
  @InputTypeDefinition = @InputTypeDefinition_7594f627451e,
  @InputTypeIsArray = @InputTypeIsArray_7594f627451e,
  @OutputTypeName = @OutputTypeName_7594f627451e,
  @OutputTypeDefinition = @OutputTypeDefinition_7594f627451e,
  @OutputTypeIsArray = @OutputTypeIsArray_7594f627451e,
  @ExecutionMode = @ExecutionMode_7594f627451e,
  @RequiredScope = @RequiredScope_7594f627451e,
  @RequiresSystemUser = @RequiresSystemUser_7594f627451e,
  @GenerationType = @GenerationType_7594f627451e,
  @Code = @Code_7594f627451e,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_7594f627451e,
  @CodeApprovedByUserID = @CodeApprovedByUserID_7594f627451e,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_7594f627451e,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_7594f627451e,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_7594f627451e,
  @CacheTTLSeconds = @CacheTTLSeconds_7594f627451e,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_7594f627451e,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_7594f627451e,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_7594f627451e,
  @CodeComments = @CodeComments_7594f627451e,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_7594f627451e,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_49a8255d8662 UNIQUEIDENTIFIER,
@Name_49a8255d8662 NVARCHAR(255),
@OperationKey_49a8255d8662 NVARCHAR(255),
@CategoryID_49a8255d8662 UNIQUEIDENTIFIER,
@Description_49a8255d8662 NVARCHAR(MAX),
@InputTypeName_49a8255d8662 NVARCHAR(255),
@InputTypeDefinition_49a8255d8662 NVARCHAR(MAX),
@InputTypeIsArray_49a8255d8662 BIT,
@OutputTypeName_49a8255d8662 NVARCHAR(255),
@OutputTypeDefinition_49a8255d8662 NVARCHAR(MAX),
@OutputTypeIsArray_49a8255d8662 BIT,
@ExecutionMode_49a8255d8662 NVARCHAR(20),
@RequiredScope_49a8255d8662 NVARCHAR(255),
@RequiresSystemUser_49a8255d8662 BIT,
@GenerationType_49a8255d8662 NVARCHAR(20),
@Code_49a8255d8662 NVARCHAR(MAX),
@CodeApprovalStatus_49a8255d8662 NVARCHAR(20),
@CodeApprovedByUserID_49a8255d8662 UNIQUEIDENTIFIER,
@CodeApprovedAt_49a8255d8662 DATETIMEOFFSET,
@ContractFingerprint_49a8255d8662 NVARCHAR(100),
@Status_49a8255d8662 NVARCHAR(20),
@CacheTTLSeconds_49a8255d8662 INT,
@TimeoutMS_49a8255d8662 INT,
@MaxConcurrency_49a8255d8662 INT,
@CodeLocked_49a8255d8662 BIT,
@CodeComments_49a8255d8662 NVARCHAR(MAX),
@Libraries_49a8255d8662 NVARCHAR(MAX)
SET
  @ID_49a8255d8662 = '80AF1E01-3A05-46E7-BE39-5B803B52FDA7'
SET
  @Name_49a8255d8662 = N'Get Response Detail'
SET
  @OperationKey_49a8255d8662 = N'Forms.GetResponseDetail'
SET
  @CategoryID_49a8255d8662 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_49a8255d8662 = N'One response with everything its detail view shows: the response row, its stored answers, the provenance of the files they reference, the automation events its saves queued (with their status and last error), the automation runs it triggered and the business records those wrote, plus the published definition that labels the answers. Sections the caller may not read are reported as unavailable rather than empty. Read-only.'
SET
  @InputTypeName_49a8255d8662 = N'FormsGetResponseDetailInput'
SET
  @InputTypeDefinition_49a8255d8662 = N'/**
 * Input for `Forms.GetResponseDetail`: one response with everything its detail view shows — its
 * stored answers, the files behind file answers, the automation runs it triggered and the
 * business records those wrote. Replaces `ResponsesDataService.loadResponseDetail` and the
 * definition reads beside it.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetResponseDetailInput {
    /** The `MJ_BizApps_Forms: Form Responses` row. */
    ResponseID: string;
    /**
     * The version whose questions label the answers. Omitted or `null`: the version the response
     * was submitted against (the Form Response record view''s choice). The Responses tab and the
     * dashboard pass the form''s Published version so every response reads against one set of labels.
     */
    LabelFormVersionID?: string | null;
}
'
SET
  @InputTypeIsArray_49a8255d8662 = 0
SET
  @OutputTypeName_49a8255d8662 = N'FormsGetResponseDetailOutput'
SET
  @OutputTypeDefinition_49a8255d8662 = N'/**
 * Output for `Forms.GetResponseDetail`. Instants are ISO-8601 strings.
 *
 * The STORED rows, not a rendered view model: the client labels answers against
 * `DefinitionJSON` with the same pure builder it uses today (`buildResponseDetail`), so the
 * rendering rules stay in one place. `FormsStoredAnswer` is declared in
 * `forms-list-responses.output.ts`; CodeGen emits every type into one module, so it resolves.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** The response row''s own fields. */
export interface FormsResponseDetailRecord {
    /** The response. */
    ID: string;
    /** Its form. */
    FormID: string;
    /** The version it was submitted against. */
    FormVersionID: string;
    /** Its status (the `FormResponse.Status` CHECK values). */
    Status: ''Complete'' | ''Disqualified'' | ''Partial'';
    /** When the respondent began; `null` when unrecorded. */
    StartedAt: string | null;
    /** When it was submitted; `null` for a Partial. */
    SubmittedAt: string | null;
    /** The linked Person; `null` when none was matched. */
    RespondentPersonID: string | null;
    /** The linked Person''s display name (the base view''s denormalised field); `null` when none. */
    RespondentPerson: string | null;
}

/** The provenance row of one uploaded file a file answer references. */
export interface FormsResponseUpload {
    /** The `MJ_BizApps_Forms: Form Uploads` row. */
    ID: string;
    /** The `MJ: Files` id the answer holds. */
    FileID: string;
    /** The file name as uploaded; `null` when unrecorded. */
    FileName: string | null;
    /** Its MIME type; `null` when unrecorded. */
    ContentType: string | null;
    /** Its size; `null` when unrecorded. */
    SizeBytes: number | null;
    /** `Revoked` means the file is no longer retrievable (the `FormUpload.Status` CHECK values). */
    Status: ''Active'' | ''Revoked'';
}

/** One on-submit automation attempt this response triggered. */
export interface FormsResponseAutomationRun {
    /** The `MJ_BizApps_Forms: Form Automation Runs` row. */
    ID: string;
    /** The automation that ran. */
    FormAutomationID: string;
    /** Its name (the base view''s denormalised field). */
    FormAutomation: string;
    /** Outcome of the attempt (the `FormAutomationRun.Status` CHECK values). */
    Status: ''Failed'' | ''Pending'' | ''Running'' | ''Skipped'' | ''Succeeded'';
    /** The attempt at its automation event that last opened this row (1-based); not a count of runs. */
    AttemptCount: number;
    /**
     * The `FormAutomationEvent` (the outbox row a save queued) whose run ran this step — the exact link
     * from a run to the submit event that caused it. `null` for runs written before the column existed.
     */
    FormAutomationEventID: string | null;
    /** When it began; `null` if it never started. */
    StartedAt: string | null;
    /** When it finished; `null` while in flight. */
    CompletedAt: string | null;
    /** Why it failed; `null` otherwise. */
    ErrorMessage: string | null;
    /** JSON digest of the result; `null` when none. */
    OutputSummary: string | null;
    /** The `MJ: Action Execution Logs` row when an Action ran. */
    ActionExecutionLogID: string | null;
    /** The `MJ: AI Agent Runs` row when an Agent ran. */
    AIAgentRunID: string | null;
}

/** One automation event (an outbox row a save queued) this response owes or has run. */
export interface FormsResponseAutomationEvent {
    /** The `MJ_BizApps_Forms: Form Automation Events` row; a run''s `FormAutomationEventID` names it. */
    ID: string;
    /** Which save queued it (the `FormAutomationEvent.Trigger` CHECK values). */
    Trigger: ''OnComplete'' | ''OnPartial'';
    /** Where it stands; `DeadLetter` is the one a replay can re-queue (the `FormAutomationEvent.Status` CHECK values). */
    Status: ''Pending'' | ''Running'' | ''Complete'' | ''DeadLetter'' | ''Abandoned'';
    /** How many times a drain has attempted it. */
    AttemptCount: number;
    /** Why the last attempt failed; `null` when none did. */
    LastError: string | null;
    /** When it settled; `null` while it is still open. */
    CompletedAt: string | null;
}

/** One business record this response''s entity bindings created or merged into. */
export interface FormsResponseBindingRecord {
    /** The `MJ_BizApps_Forms: Form Entity Binding Records` ledger row. */
    ID: string;
    /** The binding that wrote it. */
    BindingID: string;
    /** The binding''s name (the base view''s denormalised field). */
    Binding: string;
    /** The entity written to. */
    TargetEntityID: string;
    /** That entity''s canonical name, resolved server-side for deep links; `null` when metadata has none. */
    TargetEntityName: string | null;
    /** The record written; `null` when none was. */
    TargetRecordID: string | null;
    /** What happened (the `FormEntityBindingRecord.Outcome` CHECK values). */
    Outcome: ''Created'' | ''Merged'' | ''Skipped'' | ''Unchanged'';
    /** JSON text of the field names written; `null` when none. */
    WrittenFields: string | null;
}

export interface FormsGetResponseDetailOutput {
    /** The response. */
    Response: FormsResponseDetailRecord;
    /** Every stored answer of the response. */
    Answers: FormsStoredAnswer[];
    /** Provenance of the files the answers reference. Empty when no answer holds a file. */
    Uploads: FormsResponseUpload[];
    /** Automation attempts, oldest first. */
    AutomationRuns: FormsResponseAutomationRun[];
    /** Automation events the response''s saves queued, oldest first. */
    AutomationEvents: FormsResponseAutomationEvent[];
    /** Binding ledger rows, oldest first. */
    BindingRecords: FormsResponseBindingRecord[];
    /** The version that labelled the answers. When none was named, this is the version the response was submitted against, even if it could not be read. */
    LabelFormVersionID: string;
    /**
     * JSON text of the labelling version''s `PublishedFormDefinition` snapshot, or `null`.
     * It is `null` when that version has no snapshot, and also when no label version was named and the
     * version the response was submitted against could not be read: a missing row, no Read on Form
     * Versions, or a version of another form. That case is reported in `UnavailableSections` as
     * "question labels", and the rest of the detail is still returned. A label version the caller
     * NAMES that cannot be read refuses the call instead.
     */
    DefinitionJSON: string | null;
    /** Sections the caller may not read, for example "automation runs" or "question labels": reported as missing, never as empty. */
    UnavailableSections: string[];
}
'
SET
  @OutputTypeIsArray_49a8255d8662 = 0
SET
  @ExecutionMode_49a8255d8662 = N'Sync'
SET
  @RequiredScope_49a8255d8662 = N'forms:read'
SET
  @RequiresSystemUser_49a8255d8662 = 0
SET
  @GenerationType_49a8255d8662 = N'Manual'
SET
  @CodeApprovalStatus_49a8255d8662 = N'Approved'
SET
  @Status_49a8255d8662 = N'Active'
SET
  @CodeLocked_49a8255d8662 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_49a8255d8662,
  @Name = @Name_49a8255d8662,
  @OperationKey = @OperationKey_49a8255d8662,
  @CategoryID = @CategoryID_49a8255d8662,
  @Description = @Description_49a8255d8662,
  @InputTypeName = @InputTypeName_49a8255d8662,
  @InputTypeDefinition = @InputTypeDefinition_49a8255d8662,
  @InputTypeIsArray = @InputTypeIsArray_49a8255d8662,
  @OutputTypeName = @OutputTypeName_49a8255d8662,
  @OutputTypeDefinition = @OutputTypeDefinition_49a8255d8662,
  @OutputTypeIsArray = @OutputTypeIsArray_49a8255d8662,
  @ExecutionMode = @ExecutionMode_49a8255d8662,
  @RequiredScope = @RequiredScope_49a8255d8662,
  @RequiresSystemUser = @RequiresSystemUser_49a8255d8662,
  @GenerationType = @GenerationType_49a8255d8662,
  @Code = @Code_49a8255d8662,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_49a8255d8662,
  @CodeApprovedByUserID = @CodeApprovedByUserID_49a8255d8662,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_49a8255d8662,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_49a8255d8662,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_49a8255d8662,
  @CacheTTLSeconds = @CacheTTLSeconds_49a8255d8662,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_49a8255d8662,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_49a8255d8662,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_49a8255d8662,
  @CodeComments = @CodeComments_49a8255d8662,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_49a8255d8662,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_371f9a114c0c UNIQUEIDENTIFIER,
@Name_371f9a114c0c NVARCHAR(255),
@OperationKey_371f9a114c0c NVARCHAR(255),
@CategoryID_371f9a114c0c UNIQUEIDENTIFIER,
@Description_371f9a114c0c NVARCHAR(MAX),
@InputTypeName_371f9a114c0c NVARCHAR(255),
@InputTypeDefinition_371f9a114c0c NVARCHAR(MAX),
@InputTypeIsArray_371f9a114c0c BIT,
@OutputTypeName_371f9a114c0c NVARCHAR(255),
@OutputTypeDefinition_371f9a114c0c NVARCHAR(MAX),
@OutputTypeIsArray_371f9a114c0c BIT,
@ExecutionMode_371f9a114c0c NVARCHAR(20),
@RequiredScope_371f9a114c0c NVARCHAR(255),
@RequiresSystemUser_371f9a114c0c BIT,
@GenerationType_371f9a114c0c NVARCHAR(20),
@Code_371f9a114c0c NVARCHAR(MAX),
@CodeApprovalStatus_371f9a114c0c NVARCHAR(20),
@CodeApprovedByUserID_371f9a114c0c UNIQUEIDENTIFIER,
@CodeApprovedAt_371f9a114c0c DATETIMEOFFSET,
@ContractFingerprint_371f9a114c0c NVARCHAR(100),
@Status_371f9a114c0c NVARCHAR(20),
@CacheTTLSeconds_371f9a114c0c INT,
@TimeoutMS_371f9a114c0c INT,
@MaxConcurrency_371f9a114c0c INT,
@CodeLocked_371f9a114c0c BIT,
@CodeComments_371f9a114c0c NVARCHAR(MAX),
@Libraries_371f9a114c0c NVARCHAR(MAX)
SET
  @ID_371f9a114c0c = 'B8B91983-F8A1-492B-BD42-882AD4746561'
SET
  @Name_371f9a114c0c = N'Replay Automation Event'
SET
  @OperationKey_371f9a114c0c = N'Forms.ReplayAutomationEvent'
SET
  @CategoryID_371f9a114c0c = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_371f9a114c0c = N'Run a dead-lettered final submit''s automations again. Re-queues one event only while it is DeadLetter and runs it once, now; an event in any other state is refused and nothing is written. A replay reopens only that event''s Dead-lettered: rows, so steps that succeeded never run twice. Needs the forms:write scope.'
SET
  @InputTypeName_371f9a114c0c = N'FormsReplayAutomationEventInput'
SET
  @InputTypeDefinition_371f9a114c0c = N'/**
 * Input for `Forms.ReplayAutomationEvent` — names one dead-lettered automation event to run again.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReplayAutomationEventInput {
    /** The `FormAutomationEvent` to replay; it must be `DeadLetter`, or the call is refused and nothing is written. */
    FormAutomationEventID: string;
}
'
SET
  @InputTypeIsArray_371f9a114c0c = 0
SET
  @OutputTypeName_371f9a114c0c = N'FormsReplayAutomationEventOutput'
SET
  @OutputTypeDefinition_371f9a114c0c = N'/**
 * Output for `Forms.ReplayAutomationEvent`.
 *
 * The event is re-queued, then its response is drained once, now. A replay reopens only that event''s
 * `Dead-lettered: ` run rows, so a step that already succeeded does not run a second time. `Status` is
 * the state the replay WROTE, not the outcome of the run: the caller reloads the response detail to
 * see how the drain ended.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsReplayAutomationEventOutput {
    /** The event replayed. */
    FormAutomationEventID: string;
    /** The status the replay wrote: always `Pending`, the re-queued state. */
    Status: ''Pending'';
}
'
SET
  @OutputTypeIsArray_371f9a114c0c = 0
SET
  @ExecutionMode_371f9a114c0c = N'Sync'
SET
  @RequiredScope_371f9a114c0c = N'forms:write'
SET
  @RequiresSystemUser_371f9a114c0c = 0
SET
  @GenerationType_371f9a114c0c = N'Manual'
SET
  @CodeApprovalStatus_371f9a114c0c = N'Approved'
SET
  @Status_371f9a114c0c = N'Active'
SET
  @CodeLocked_371f9a114c0c = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_371f9a114c0c,
  @Name = @Name_371f9a114c0c,
  @OperationKey = @OperationKey_371f9a114c0c,
  @CategoryID = @CategoryID_371f9a114c0c,
  @Description = @Description_371f9a114c0c,
  @InputTypeName = @InputTypeName_371f9a114c0c,
  @InputTypeDefinition = @InputTypeDefinition_371f9a114c0c,
  @InputTypeIsArray = @InputTypeIsArray_371f9a114c0c,
  @OutputTypeName = @OutputTypeName_371f9a114c0c,
  @OutputTypeDefinition = @OutputTypeDefinition_371f9a114c0c,
  @OutputTypeIsArray = @OutputTypeIsArray_371f9a114c0c,
  @ExecutionMode = @ExecutionMode_371f9a114c0c,
  @RequiredScope = @RequiredScope_371f9a114c0c,
  @RequiresSystemUser = @RequiresSystemUser_371f9a114c0c,
  @GenerationType = @GenerationType_371f9a114c0c,
  @Code = @Code_371f9a114c0c,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_371f9a114c0c,
  @CodeApprovedByUserID = @CodeApprovedByUserID_371f9a114c0c,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_371f9a114c0c,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_371f9a114c0c,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_371f9a114c0c,
  @CacheTTLSeconds = @CacheTTLSeconds_371f9a114c0c,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_371f9a114c0c,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_371f9a114c0c,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_371f9a114c0c,
  @CodeComments = @CodeComments_371f9a114c0c,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_371f9a114c0c,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_67c7b27443b3 UNIQUEIDENTIFIER,
@Name_67c7b27443b3 NVARCHAR(255),
@OperationKey_67c7b27443b3 NVARCHAR(255),
@CategoryID_67c7b27443b3 UNIQUEIDENTIFIER,
@Description_67c7b27443b3 NVARCHAR(MAX),
@InputTypeName_67c7b27443b3 NVARCHAR(255),
@InputTypeDefinition_67c7b27443b3 NVARCHAR(MAX),
@InputTypeIsArray_67c7b27443b3 BIT,
@OutputTypeName_67c7b27443b3 NVARCHAR(255),
@OutputTypeDefinition_67c7b27443b3 NVARCHAR(MAX),
@OutputTypeIsArray_67c7b27443b3 BIT,
@ExecutionMode_67c7b27443b3 NVARCHAR(20),
@RequiredScope_67c7b27443b3 NVARCHAR(255),
@RequiresSystemUser_67c7b27443b3 BIT,
@GenerationType_67c7b27443b3 NVARCHAR(20),
@Code_67c7b27443b3 NVARCHAR(MAX),
@CodeApprovalStatus_67c7b27443b3 NVARCHAR(20),
@CodeApprovedByUserID_67c7b27443b3 UNIQUEIDENTIFIER,
@CodeApprovedAt_67c7b27443b3 DATETIMEOFFSET,
@ContractFingerprint_67c7b27443b3 NVARCHAR(100),
@Status_67c7b27443b3 NVARCHAR(20),
@CacheTTLSeconds_67c7b27443b3 INT,
@TimeoutMS_67c7b27443b3 INT,
@MaxConcurrency_67c7b27443b3 INT,
@CodeLocked_67c7b27443b3 BIT,
@CodeComments_67c7b27443b3 NVARCHAR(MAX),
@Libraries_67c7b27443b3 NVARCHAR(MAX)
SET
  @ID_67c7b27443b3 = '00DC6D34-937F-48C2-9AA8-34DC06468A38'
SET
  @Name_67c7b27443b3 = N'Get Respondent Form'
SET
  @OperationKey_67c7b27443b3 = N'Forms.GetRespondentForm'
SET
  @CategoryID_67c7b27443b3 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_67c7b27443b3 = N'What an anonymous respondent loads to render a form: an allowlisted projection of the published definition (no answer key, ending screens, knockout conditions, automations or quota), the resume snapshot for a resumed draft, and the captcha flag. Authorized only for a magic-link session scoped to the slug''s distribution. No RequiredScope: its Authorize() admits only a magic-link session scoped to the link, which is never an API key, so an API-key scope would gate nothing.'
SET
  @InputTypeName_67c7b27443b3 = N'FormsGetRespondentFormInput'
SET
  @InputTypeDefinition_67c7b27443b3 = N'/**
 * Input for `Forms.GetRespondentForm`: what an anonymous respondent loads to render a form.
 *
 * Authorized only for a magic-link session scoped to the distribution the slug resolves to (or, on a
 * resume, to the response being resumed).
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetRespondentFormInput {
    /** The share link''s slug (the `/f/:slug` path segment). */
    Slug: string;
}
'
SET
  @InputTypeIsArray_67c7b27443b3 = 0
SET
  @OutputTypeName_67c7b27443b3 = N'FormsGetRespondentFormOutput'
SET
  @OutputTypeDefinition_67c7b27443b3 = N'/**
 * Output for `Forms.GetRespondentForm`.
 *
 * The definition is an ALLOWLIST projection of the published snapshot, built field by field
 * (`toRespondentDefinition` in the contracts): it carries what is needed to render and to validate
 * client-side, and never the answer key, the ending screens, score or knockout conditions, the
 * automations, the quota or the redirect URL. It travels as JSON text so this contract does not
 * duplicate, and then drift from, the contracts tree; the widget parses it with the contracts zod
 * schema.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsGetRespondentFormOutput {
    /** The Published version being served. Sent back on every `Forms.SaveResponse` to pin the response. */
    FormVersionID: string;
    /** JSON text of the `RespondentFormDefinition`: name, render mode, welcome screen, pages, questions, options, rules, style tokens. */
    DefinitionJSON: string;
    /** JSON text of a `ResumeSnapshot` when this session is scoped to one draft response; `null` for an ordinary public-link session. */
    ResumeJSON: string | null;
    /** Whether a final submit must carry a Turnstile token. */
    CaptchaRequired: boolean;
}
'
SET
  @OutputTypeIsArray_67c7b27443b3 = 0
SET
  @ExecutionMode_67c7b27443b3 = N'Sync'
SET
  @RequiresSystemUser_67c7b27443b3 = 0
SET
  @GenerationType_67c7b27443b3 = N'Manual'
SET
  @CodeApprovalStatus_67c7b27443b3 = N'Approved'
SET
  @Status_67c7b27443b3 = N'Active'
SET
  @CodeLocked_67c7b27443b3 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_67c7b27443b3,
  @Name = @Name_67c7b27443b3,
  @OperationKey = @OperationKey_67c7b27443b3,
  @CategoryID = @CategoryID_67c7b27443b3,
  @Description = @Description_67c7b27443b3,
  @InputTypeName = @InputTypeName_67c7b27443b3,
  @InputTypeDefinition = @InputTypeDefinition_67c7b27443b3,
  @InputTypeIsArray = @InputTypeIsArray_67c7b27443b3,
  @OutputTypeName = @OutputTypeName_67c7b27443b3,
  @OutputTypeDefinition = @OutputTypeDefinition_67c7b27443b3,
  @OutputTypeIsArray = @OutputTypeIsArray_67c7b27443b3,
  @ExecutionMode = @ExecutionMode_67c7b27443b3,
  @RequiredScope = @RequiredScope_67c7b27443b3,
  @RequiredScope_Clear = 1,
  @RequiresSystemUser = @RequiresSystemUser_67c7b27443b3,
  @GenerationType = @GenerationType_67c7b27443b3,
  @Code = @Code_67c7b27443b3,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_67c7b27443b3,
  @CodeApprovedByUserID = @CodeApprovedByUserID_67c7b27443b3,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_67c7b27443b3,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_67c7b27443b3,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_67c7b27443b3,
  @CacheTTLSeconds = @CacheTTLSeconds_67c7b27443b3,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_67c7b27443b3,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_67c7b27443b3,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_67c7b27443b3,
  @CodeComments = @CodeComments_67c7b27443b3,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_67c7b27443b3,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_c0f0a489b7a8 UNIQUEIDENTIFIER,
@Name_c0f0a489b7a8 NVARCHAR(255),
@OperationKey_c0f0a489b7a8 NVARCHAR(255),
@CategoryID_c0f0a489b7a8 UNIQUEIDENTIFIER,
@Description_c0f0a489b7a8 NVARCHAR(MAX),
@InputTypeName_c0f0a489b7a8 NVARCHAR(255),
@InputTypeDefinition_c0f0a489b7a8 NVARCHAR(MAX),
@InputTypeIsArray_c0f0a489b7a8 BIT,
@OutputTypeName_c0f0a489b7a8 NVARCHAR(255),
@OutputTypeDefinition_c0f0a489b7a8 NVARCHAR(MAX),
@OutputTypeIsArray_c0f0a489b7a8 BIT,
@ExecutionMode_c0f0a489b7a8 NVARCHAR(20),
@RequiredScope_c0f0a489b7a8 NVARCHAR(255),
@RequiresSystemUser_c0f0a489b7a8 BIT,
@GenerationType_c0f0a489b7a8 NVARCHAR(20),
@Code_c0f0a489b7a8 NVARCHAR(MAX),
@CodeApprovalStatus_c0f0a489b7a8 NVARCHAR(20),
@CodeApprovedByUserID_c0f0a489b7a8 UNIQUEIDENTIFIER,
@CodeApprovedAt_c0f0a489b7a8 DATETIMEOFFSET,
@ContractFingerprint_c0f0a489b7a8 NVARCHAR(100),
@Status_c0f0a489b7a8 NVARCHAR(20),
@CacheTTLSeconds_c0f0a489b7a8 INT,
@TimeoutMS_c0f0a489b7a8 INT,
@MaxConcurrency_c0f0a489b7a8 INT,
@CodeLocked_c0f0a489b7a8 BIT,
@CodeComments_c0f0a489b7a8 NVARCHAR(MAX),
@Libraries_c0f0a489b7a8 NVARCHAR(MAX)
SET
  @ID_c0f0a489b7a8 = '8D4E68A9-73CA-4C10-95F1-A8BD76806E58'
SET
  @Name_c0f0a489b7a8 = N'Save Response'
SET
  @OperationKey_c0f0a489b7a8 = N'Forms.SaveResponse'
SET
  @CategoryID_c0f0a489b7a8 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_c0f0a489b7a8 = N'Every respondent write, partial autosave and final submit alike. Validates and settles visibility with the contracts rules, enforces the quota atomically, writes the response and answers and, on a final submit, enqueues the on-submit automations in the same transaction. The server decides whether the form has ended and which ending screen shows. No RequiredScope: its Authorize() admits only a magic-link session scoped to the link, which is never an API key, so an API-key scope would gate nothing.'
SET
  @InputTypeName_c0f0a489b7a8 = N'FormsSaveResponseInput'
SET
  @InputTypeDefinition_c0f0a489b7a8 = N'/**
 * Input for `Forms.SaveResponse`: every respondent write, partial autosave and final submit alike.
 *
 * Carries everything the retired `SubmitFormResponse` mutation accepted (`FormSubmissionInputType`),
 * renamed to PascalCase: `distributionSlug` is `Slug`, `formVersionId` is `FormVersionID`,
 * `partial` is `Mode`, `responseId` is `ClientResponseID`, and the answer fields keep their meaning.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/**
 * One answer. Exactly one typed value (or JSONValue) is expected per question, matching the
 * `FormResponseAnswer` typed-column layout; absent and `null` both mean "this answer does not use
 * this column", because a client may send an explicit `null` for any of them.
 */
export interface FormsAnswerInput {
    /** The question answered. Unknown questions are refused. */
    QuestionID: string;
    /** Text and single-choice answers. */
    TextValue?: string | null;
    /** Number, rating and NPS answers. */
    NumericValue?: number | null;
    /** Date answers, ISO-8601. */
    DateValue?: string | null;
    /** Yes/no and consent answers. */
    BooleanValue?: boolean | null;
    /** JSON text for multi-select and other structured answers (a JSON array of values for multi-select). */
    JSONValue?: string | null;
    /** The uploaded file''s `MJ: Files` id for a file answer; proved against the upload ledger for this link and ClientResponseID. */
    FileID?: string | null;
}

/** Lightweight client telemetry; the IP hash is derived server-side and never sent. */
export interface FormsClientMeta {
    /** `document.referrer` of the embedding page. */
    Referrer?: string;
    /** The browser''s user agent. */
    UserAgent?: string;
}

export interface FormsSaveResponseInput {
    /** The share link''s slug; resolves the distribution, form and published version. */
    Slug: string;
    /** Echoed from `Forms.GetRespondentForm`; pins the response to the version the respondent saw. */
    FormVersionID: string;
    /** `partial` banks a Partial draft (and may end it on a knockout); `final` submits it as Complete. */
    Mode: ''partial'' | ''final'';
    /** Client-minted v4 UUID, stable across every save of one sitting: adopted as the response''s primary key and the idempotency key. */
    ClientResponseID: string;
    /** ISO-8601 instant the respondent began; kept from the first save on later ones. */
    StartedAt?: string;
    /** Cloudflare Turnstile token; required on a final submit when the form or link has captcha on. */
    TurnstileToken?: string;
    /** Client telemetry. */
    ClientMeta?: FormsClientMeta;
    /** Every answer the respondent currently has; the server reconciles stored answers to this set. */
    Answers: FormsAnswerInput[];
}
'
SET
  @InputTypeIsArray_c0f0a489b7a8 = 0
SET
  @OutputTypeName_c0f0a489b7a8 = N'FormsSaveResponseOutput'
SET
  @OutputTypeDefinition_c0f0a489b7a8 = N'/**
 * Output for `Forms.SaveResponse`.
 *
 * Carries every field the retired `SubmitFormResponse` result had (`FormSubmissionResult`), in
 * PascalCase, plus the server-resolved outcome. The SERVER now decides whether the form ends and
 * which ending shows: a partial save that trips a knockout returns `ended` with the disqualification
 * screen, and a final submit returns the matched ending. The widget no longer evaluates scoring or
 * ending rules on the live path, because the respondent never receives them.
 *
 * A refusal the respondent can act on (validation, captcha, quota, a closed link) is a RESULT with
 * `Success: false` and Errors, not a thrown error; a thrown error is a failure of the system.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */

/** One social link under an ending screen. */
export interface FormsEndingSocialLink {
    /** A `SocialPlatformId` from the contracts; a platform the widget cannot draw is skipped. */
    Platform: string;
    /** The link target. */
    URL: string;
}

/** The ending screen the server chose, with the content the widget renders. */
export interface FormsRespondentEnding {
    /** The `MJ_BizApps_Forms: Form Screens` row. */
    ID: string;
    /** Headline. */
    Title: string;
    /** Body copy under the title; plain text. `null` when none. */
    Body: string | null;
    /** The single button''s label. `null`: the widget''s default. */
    ButtonLabel: string | null;
    /** Image above the title, possibly a `/forms/asset/<id>` path relative to the API base. `null` when none. */
    MediaURL: string | null;
    /** Where to send the respondent instead of showing the screen; already checked safe. `null` when none. */
    RedirectURL: string | null;
    /** Social links shown under the message. Empty when none. */
    SocialLinks: FormsEndingSocialLink[];
    /** True when this ending is a knockout (the response is stored as Disqualified). */
    IsDisqualification: boolean;
}

/** A validation or processing error, tied to a question when it is about one. */
export interface FormsFieldError {
    /** The question the error is about; `null` for a form-level refusal (captcha, quota, closed link). */
    QuestionID: string | null;
    /** What to show the respondent. */
    Message: string;
}

export interface FormsSaveResponseOutput {
    /** Whether the save was accepted. `false` means nothing was stored and Errors says why. */
    Success: boolean;
    /** The response row written (equal to the input''s ClientResponseID once adopted); `null` when nothing was stored. */
    ResponseID: string | null;
    /** The stored status (the `FormResponse.Status` CHECK values); `null` when nothing was stored. */
    Status: ''Complete'' | ''Disqualified'' | ''Partial'' | null;
    /** `continue`: keep answering. `ended`: show the final screen (a final submit, or a knockout on a partial save). */
    Outcome: ''continue'' | ''ended'';
    /** The ending screen to show when Outcome is `ended` and an ending screen matched; absent otherwise. */
    Ending?: FormsRespondentEnding;
    /** Resolved confirmation text when ended with no redirect: the ending''s body, else the form''s confirmation message. */
    ConfirmationMessage?: string;
    /** Resolved, safety-checked redirect when ended: the ending''s, else the form-wide fallback. */
    RedirectURL?: string;
    /** Why the save was refused, or problems with individual answers. Empty on success. */
    Errors: FormsFieldError[];
}
'
SET
  @OutputTypeIsArray_c0f0a489b7a8 = 0
SET
  @ExecutionMode_c0f0a489b7a8 = N'Sync'
SET
  @RequiresSystemUser_c0f0a489b7a8 = 0
SET
  @GenerationType_c0f0a489b7a8 = N'Manual'
SET
  @CodeApprovalStatus_c0f0a489b7a8 = N'Approved'
SET
  @Status_c0f0a489b7a8 = N'Active'
SET
  @CodeLocked_c0f0a489b7a8 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_c0f0a489b7a8,
  @Name = @Name_c0f0a489b7a8,
  @OperationKey = @OperationKey_c0f0a489b7a8,
  @CategoryID = @CategoryID_c0f0a489b7a8,
  @Description = @Description_c0f0a489b7a8,
  @InputTypeName = @InputTypeName_c0f0a489b7a8,
  @InputTypeDefinition = @InputTypeDefinition_c0f0a489b7a8,
  @InputTypeIsArray = @InputTypeIsArray_c0f0a489b7a8,
  @OutputTypeName = @OutputTypeName_c0f0a489b7a8,
  @OutputTypeDefinition = @OutputTypeDefinition_c0f0a489b7a8,
  @OutputTypeIsArray = @OutputTypeIsArray_c0f0a489b7a8,
  @ExecutionMode = @ExecutionMode_c0f0a489b7a8,
  @RequiredScope = @RequiredScope_c0f0a489b7a8,
  @RequiredScope_Clear = 1,
  @RequiresSystemUser = @RequiresSystemUser_c0f0a489b7a8,
  @GenerationType = @GenerationType_c0f0a489b7a8,
  @Code = @Code_c0f0a489b7a8,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_c0f0a489b7a8,
  @CodeApprovedByUserID = @CodeApprovedByUserID_c0f0a489b7a8,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_c0f0a489b7a8,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_c0f0a489b7a8,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_c0f0a489b7a8,
  @CacheTTLSeconds = @CacheTTLSeconds_c0f0a489b7a8,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_c0f0a489b7a8,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_c0f0a489b7a8,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_c0f0a489b7a8,
  @CodeComments = @CodeComments_c0f0a489b7a8,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_c0f0a489b7a8,
  @Libraries_Clear = 1;

GO

-- Save MJ: Remote Operations (core SP call only)
DECLARE @ID_a53fff5103a7 UNIQUEIDENTIFIER,
@Name_a53fff5103a7 NVARCHAR(255),
@OperationKey_a53fff5103a7 NVARCHAR(255),
@CategoryID_a53fff5103a7 UNIQUEIDENTIFIER,
@Description_a53fff5103a7 NVARCHAR(MAX),
@InputTypeName_a53fff5103a7 NVARCHAR(255),
@InputTypeDefinition_a53fff5103a7 NVARCHAR(MAX),
@InputTypeIsArray_a53fff5103a7 BIT,
@OutputTypeName_a53fff5103a7 NVARCHAR(255),
@OutputTypeDefinition_a53fff5103a7 NVARCHAR(MAX),
@OutputTypeIsArray_a53fff5103a7 BIT,
@ExecutionMode_a53fff5103a7 NVARCHAR(20),
@RequiredScope_a53fff5103a7 NVARCHAR(255),
@RequiresSystemUser_a53fff5103a7 BIT,
@GenerationType_a53fff5103a7 NVARCHAR(20),
@Code_a53fff5103a7 NVARCHAR(MAX),
@CodeApprovalStatus_a53fff5103a7 NVARCHAR(20),
@CodeApprovedByUserID_a53fff5103a7 UNIQUEIDENTIFIER,
@CodeApprovedAt_a53fff5103a7 DATETIMEOFFSET,
@ContractFingerprint_a53fff5103a7 NVARCHAR(100),
@Status_a53fff5103a7 NVARCHAR(20),
@CacheTTLSeconds_a53fff5103a7 INT,
@TimeoutMS_a53fff5103a7 INT,
@MaxConcurrency_a53fff5103a7 INT,
@CodeLocked_a53fff5103a7 BIT,
@CodeComments_a53fff5103a7 NVARCHAR(MAX),
@Libraries_a53fff5103a7 NVARCHAR(MAX)
SET
  @ID_a53fff5103a7 = '2A8946C7-0045-4B58-9B34-5E030D9D0DF0'
SET
  @Name_a53fff5103a7 = N'Delete Template'
SET
  @OperationKey_a53fff5103a7 = N'Forms.DeleteTemplate'
SET
  @CategoryID_a53fff5103a7 = '180A2931-7AAE-4545-9F2C-FD933176DC3D'
SET
  @Description_a53fff5103a7 = N'Permanently delete a saved template and everything under it (pages, questions, options, screens, automations, bindings) in one transaction. Only a template can be deleted, and only one with no responses, versions or share links; a working form is archived instead.'
SET
  @InputTypeName_a53fff5103a7 = N'FormsDeleteTemplateInput'
SET
  @InputTypeDefinition_a53fff5103a7 = N'/**
 * Input for `Forms.DeleteTemplate`: permanently delete one SAVED template (a `Form` row with
 * `IsTemplate = 1`) and everything under it.
 *
 * Deletion is real only for templates. A working form is archived (`Forms.ArchiveForm`), never
 * deleted, because a form that collected responses must keep them; a template provably has none.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDeleteTemplateInput {
    /** The template to delete. A form that is not a template is refused. */
    TemplateFormID: string;
}
'
SET
  @InputTypeIsArray_a53fff5103a7 = 0
SET
  @OutputTypeName_a53fff5103a7 = N'FormsDeleteTemplateOutput'
SET
  @OutputTypeDefinition_a53fff5103a7 = N'/**
 * Output for `Forms.DeleteTemplate`. The counts say what went with the template, all in one
 * transaction: either all of it is gone or none of it is.
 *
 * NO import statements — definitions are emitted verbatim into remote_operations.ts.
 */
export interface FormsDeleteTemplateOutput {
    /** The template deleted. */
    TemplateFormID: string;
    /** Pages deleted with it. */
    PageCount: number;
    /** Questions deleted with it. */
    QuestionCount: number;
    /** Question options deleted with it. */
    OptionCount: number;
    /** Welcome and ending screens deleted with it. */
    ScreenCount: number;
    /** Automations deleted with it. */
    AutomationCount: number;
    /** Entity bindings deleted with it. */
    BindingCount: number;
}
'
SET
  @OutputTypeIsArray_a53fff5103a7 = 0
SET
  @ExecutionMode_a53fff5103a7 = N'Sync'
SET
  @RequiredScope_a53fff5103a7 = N'forms:write'
SET
  @RequiresSystemUser_a53fff5103a7 = 0
SET
  @GenerationType_a53fff5103a7 = N'Manual'
SET
  @CodeApprovalStatus_a53fff5103a7 = N'Approved'
SET
  @Status_a53fff5103a7 = N'Active'
SET
  @CodeLocked_a53fff5103a7 = 0
EXEC [${mjSchema}].spCreateRemoteOperation @ID = @ID_a53fff5103a7,
  @Name = @Name_a53fff5103a7,
  @OperationKey = @OperationKey_a53fff5103a7,
  @CategoryID = @CategoryID_a53fff5103a7,
  @Description = @Description_a53fff5103a7,
  @InputTypeName = @InputTypeName_a53fff5103a7,
  @InputTypeDefinition = @InputTypeDefinition_a53fff5103a7,
  @InputTypeIsArray = @InputTypeIsArray_a53fff5103a7,
  @OutputTypeName = @OutputTypeName_a53fff5103a7,
  @OutputTypeDefinition = @OutputTypeDefinition_a53fff5103a7,
  @OutputTypeIsArray = @OutputTypeIsArray_a53fff5103a7,
  @ExecutionMode = @ExecutionMode_a53fff5103a7,
  @RequiredScope = @RequiredScope_a53fff5103a7,
  @RequiresSystemUser = @RequiresSystemUser_a53fff5103a7,
  @GenerationType = @GenerationType_a53fff5103a7,
  @Code = @Code_a53fff5103a7,
  @Code_Clear = 1,
  @CodeApprovalStatus = @CodeApprovalStatus_a53fff5103a7,
  @CodeApprovedByUserID = @CodeApprovedByUserID_a53fff5103a7,
  @CodeApprovedByUserID_Clear = 1,
  @CodeApprovedAt = @CodeApprovedAt_a53fff5103a7,
  @CodeApprovedAt_Clear = 1,
  @ContractFingerprint = @ContractFingerprint_a53fff5103a7,
  @ContractFingerprint_Clear = 1,
  @Status = @Status_a53fff5103a7,
  @CacheTTLSeconds = @CacheTTLSeconds_a53fff5103a7,
  @CacheTTLSeconds_Clear = 1,
  @TimeoutMS = @TimeoutMS_a53fff5103a7,
  @TimeoutMS_Clear = 1,
  @MaxConcurrency = @MaxConcurrency_a53fff5103a7,
  @MaxConcurrency_Clear = 1,
  @CodeLocked = @CodeLocked_a53fff5103a7,
  @CodeComments = @CodeComments_a53fff5103a7,
  @CodeComments_Clear = 1,
  @Libraries = @Libraries_a53fff5103a7,
  @Libraries_Clear = 1;

GO

-- Save MJ: Scheduled Job Types (core SP call only)
DECLARE @ID_644e59b8738c UNIQUEIDENTIFIER,
@Name_644e59b8738c NVARCHAR(100),
@Description_644e59b8738c NVARCHAR(MAX),
@DriverClass_644e59b8738c NVARCHAR(255),
@DomainRunEntity_644e59b8738c NVARCHAR(255),
@DomainRunEntityFKey_644e59b8738c NVARCHAR(100),
@NotificationsAvailable_644e59b8738c BIT
SET
  @ID_644e59b8738c = '13CCEF27-0BE4-4194-945C-53FAD408F69A'
SET
  @Name_644e59b8738c = N'Forms Automation Outbox Drain'
SET
  @Description_644e59b8738c = N'Runs the on-submit automations MJ Forms queued in its FormAutomationEvent outbox: claims due events under a lease (one drain per event, oldest first per response), runs their steps, and settles each as Complete, a backed-off retry, DeadLetter or Abandoned. Takes no Configuration.'
SET
  @DriverClass_644e59b8738c = N'FormsAutomationDrainDriver'
SET
  @DomainRunEntity_644e59b8738c = N'MJ_BizApps_Forms: Form Automation Events'
SET
  @NotificationsAvailable_644e59b8738c = 0
EXEC [${mjSchema}].spCreateScheduledJobType @ID = @ID_644e59b8738c,
  @Name = @Name_644e59b8738c,
  @Description = @Description_644e59b8738c,
  @DriverClass = @DriverClass_644e59b8738c,
  @DomainRunEntity = @DomainRunEntity_644e59b8738c,
  @DomainRunEntityFKey = @DomainRunEntityFKey_644e59b8738c,
  @DomainRunEntityFKey_Clear = 1,
  @NotificationsAvailable = @NotificationsAvailable_644e59b8738c;

GO

-- Save MJ: Scheduled Jobs (core SP call only)
DECLARE @ID_c909b78228cb UNIQUEIDENTIFIER,
@JobTypeID_c909b78228cb UNIQUEIDENTIFIER,
@Name_c909b78228cb NVARCHAR(200),
@Description_c909b78228cb NVARCHAR(MAX),
@CronExpression_c909b78228cb NVARCHAR(120),
@Timezone_c909b78228cb NVARCHAR(64),
@StartAt_c909b78228cb DATETIMEOFFSET,
@EndAt_c909b78228cb DATETIMEOFFSET,
@Status_c909b78228cb NVARCHAR(20),
@Configuration_c909b78228cb NVARCHAR(MAX),
@OwnerUserID_c909b78228cb UNIQUEIDENTIFIER,
@LastRunAt_c909b78228cb DATETIMEOFFSET,
@NextRunAt_c909b78228cb DATETIMEOFFSET,
@RunCount_c909b78228cb INT,
@SuccessCount_c909b78228cb INT,
@FailureCount_c909b78228cb INT,
@NotifyOnSuccess_c909b78228cb BIT,
@NotifyOnFailure_c909b78228cb BIT,
@NotifyUserID_c909b78228cb UNIQUEIDENTIFIER,
@NotifyViaEmail_c909b78228cb BIT,
@NotifyViaInApp_c909b78228cb BIT,
@LockToken_c909b78228cb UNIQUEIDENTIFIER,
@LockedAt_c909b78228cb DATETIMEOFFSET,
@LockedByInstance_c909b78228cb NVARCHAR(255),
@ExpectedCompletionAt_c909b78228cb DATETIMEOFFSET,
@ConcurrencyMode_c909b78228cb NVARCHAR(20),
@RunImmediatelyIfNeverRun_c909b78228cb BIT,
@MaxRuntimeMinutes_c909b78228cb INT,
@MissedRunPolicy_c909b78228cb NVARCHAR(20)
SET
  @ID_c909b78228cb = '918925E8-CB7C-43AF-A743-A5AB3998E106'
SET
  @JobTypeID_c909b78228cb = '13CCEF27-0BE4-4194-945C-53FAD408F69A'
SET
  @Name_c909b78228cb = N'Forms — Automation Outbox Sweep (every 30 s)'
SET
  @Description_c909b78228cb = N'Runs MJ Forms on-submit automations that are due: retries after their backoff, and events a stopped process left behind. First attempts run in the submitting process right after commit and do not wait for this sweep.'
SET
  @CronExpression_c909b78228cb = N'*/30 * * * * *'
SET
  @Timezone_c909b78228cb = N'UTC'
SET
  @Status_c909b78228cb = N'Active'
SET
  @Configuration_c909b78228cb = N'{}'
SET
  @RunCount_c909b78228cb = 0
SET
  @SuccessCount_c909b78228cb = 0
SET
  @FailureCount_c909b78228cb = 0
SET
  @NotifyOnSuccess_c909b78228cb = 0
SET
  @NotifyOnFailure_c909b78228cb = 0
SET
  @NotifyViaEmail_c909b78228cb = 0
SET
  @NotifyViaInApp_c909b78228cb = 0
SET
  @ConcurrencyMode_c909b78228cb = N'Skip'
SET
  @RunImmediatelyIfNeverRun_c909b78228cb = 1
SET
  @MissedRunPolicy_c909b78228cb = N'RunOnce' EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_c909b78228cb,
  @JobTypeID = @JobTypeID_c909b78228cb,
  @Name = @Name_c909b78228cb,
  @Description = @Description_c909b78228cb,
  @CronExpression = @CronExpression_c909b78228cb,
  @Timezone = @Timezone_c909b78228cb,
  @StartAt = @StartAt_c909b78228cb,
  @StartAt_Clear = 1,
  @EndAt = @EndAt_c909b78228cb,
  @EndAt_Clear = 1,
  @Status = @Status_c909b78228cb,
  @Configuration = @Configuration_c909b78228cb,
  @OwnerUserID = @OwnerUserID_c909b78228cb,
  @OwnerUserID_Clear = 1,
  @LastRunAt = @LastRunAt_c909b78228cb,
  @LastRunAt_Clear = 1,
  @NextRunAt = @NextRunAt_c909b78228cb,
  @NextRunAt_Clear = 1,
  @RunCount = @RunCount_c909b78228cb,
  @SuccessCount = @SuccessCount_c909b78228cb,
  @FailureCount = @FailureCount_c909b78228cb,
  @NotifyOnSuccess = @NotifyOnSuccess_c909b78228cb,
  @NotifyOnFailure = @NotifyOnFailure_c909b78228cb,
  @NotifyUserID = @NotifyUserID_c909b78228cb,
  @NotifyUserID_Clear = 1,
  @NotifyViaEmail = @NotifyViaEmail_c909b78228cb,
  @NotifyViaInApp = @NotifyViaInApp_c909b78228cb,
  @LockToken = @LockToken_c909b78228cb,
  @LockToken_Clear = 1,
  @LockedAt = @LockedAt_c909b78228cb,
  @LockedAt_Clear = 1,
  @LockedByInstance = @LockedByInstance_c909b78228cb,
  @LockedByInstance_Clear = 1,
  @ExpectedCompletionAt = @ExpectedCompletionAt_c909b78228cb,
  @ExpectedCompletionAt_Clear = 1,
  @ConcurrencyMode = @ConcurrencyMode_c909b78228cb,
  @RunImmediatelyIfNeverRun = @RunImmediatelyIfNeverRun_c909b78228cb,
  @MaxRuntimeMinutes = @MaxRuntimeMinutes_c909b78228cb,
  @MaxRuntimeMinutes_Clear = 1,
  @MissedRunPolicy = @MissedRunPolicy_c909b78228cb;

GO

-- Save MJ: User Notification Types (core SP call only)
DECLARE @ID_095a68d3fee7 UNIQUEIDENTIFIER,
@Name_095a68d3fee7 NVARCHAR(100),
@Description_095a68d3fee7 NVARCHAR(500),
@DefaultInApp_095a68d3fee7 BIT,
@DefaultEmail_095a68d3fee7 BIT,
@DefaultSMS_095a68d3fee7 BIT,
@AllowUserPreference_095a68d3fee7 BIT,
@EmailTemplateID_095a68d3fee7 UNIQUEIDENTIFIER,
@SMSTemplateID_095a68d3fee7 UNIQUEIDENTIFIER,
@Icon_095a68d3fee7 NVARCHAR(100),
@Color_095a68d3fee7 NVARCHAR(50),
@AutoExpireDays_095a68d3fee7 INT,
@Priority_095a68d3fee7 INT
SET
  @ID_095a68d3fee7 = '231405B3-CA10-4E78-9213-F15493CFD855'
SET
  @Name_095a68d3fee7 = N'Form Automation Failed'
SET
  @Description_095a68d3fee7 = N'Sent to a form''s owner when the automations of a submitted response will not be retried (the event dead-lettered); the response''s automation runs carry each step''s error.'
SET
  @DefaultInApp_095a68d3fee7 = 1
SET
  @DefaultEmail_095a68d3fee7 = 0
SET
  @DefaultSMS_095a68d3fee7 = 0
SET
  @AllowUserPreference_095a68d3fee7 = 1
SET
  @Icon_095a68d3fee7 = N'fa-triangle-exclamation'
SET
  @Color_095a68d3fee7 = N'#D32F2F'
SET
  @AutoExpireDays_095a68d3fee7 = 30
SET
  @Priority_095a68d3fee7 = 5
EXEC [${mjSchema}].spCreateUserNotificationType @ID = @ID_095a68d3fee7,
  @Name = @Name_095a68d3fee7,
  @Description = @Description_095a68d3fee7,
  @DefaultInApp = @DefaultInApp_095a68d3fee7,
  @DefaultEmail = @DefaultEmail_095a68d3fee7,
  @DefaultSMS = @DefaultSMS_095a68d3fee7,
  @AllowUserPreference = @AllowUserPreference_095a68d3fee7,
  @EmailTemplateID = @EmailTemplateID_095a68d3fee7,
  @EmailTemplateID_Clear = 1,
  @SMSTemplateID = @SMSTemplateID_095a68d3fee7,
  @SMSTemplateID_Clear = 1,
  @Icon = @Icon_095a68d3fee7,
  @Color = @Color_095a68d3fee7,
  @AutoExpireDays = @AutoExpireDays_095a68d3fee7,
  @Priority = @Priority_095a68d3fee7;

GO


-- End of SQL Logging Session

-- ===== Second push: the three TemplateParam corrections (see the header) =====

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@Name_9f7b66ce5ee0 NVARCHAR(255),
@Description_9f7b66ce5ee0 NVARCHAR(MAX),
@Type_9f7b66ce5ee0 NVARCHAR(20),
@DefaultValue_9f7b66ce5ee0 NVARCHAR(MAX),
@IsRequired_9f7b66ce5ee0 BIT,
@LinkedParameterName_9f7b66ce5ee0 NVARCHAR(255),
@LinkedParameterField_9f7b66ce5ee0 NVARCHAR(500),
@ExtraFilter_9f7b66ce5ee0 NVARCHAR(MAX),
@EntityID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@RecordID_9f7b66ce5ee0 NVARCHAR(2000),
@OrderBy_9f7b66ce5ee0 NVARCHAR(MAX),
@TemplateContentID_9f7b66ce5ee0 UNIQUEIDENTIFIER,
@ID_9f7b66ce5ee0 UNIQUEIDENTIFIER
SET
  @TemplateID_9f7b66ce5ee0 = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_9f7b66ce5ee0 = N'Brief'
SET
  @Description_9f7b66ce5ee0 = N'The natural-language description of the form to design.'
SET
  @Type_9f7b66ce5ee0 = N'Scalar'
SET
  @IsRequired_9f7b66ce5ee0 = 1
SET
  @ID_9f7b66ce5ee0 = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_9f7b66ce5ee0,
  @Name = @Name_9f7b66ce5ee0,
  @Description = @Description_9f7b66ce5ee0,
  @Type = @Type_9f7b66ce5ee0,
  @DefaultValue = @DefaultValue_9f7b66ce5ee0,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_9f7b66ce5ee0,
  @LinkedParameterName = @LinkedParameterName_9f7b66ce5ee0,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_9f7b66ce5ee0,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_9f7b66ce5ee0,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_9f7b66ce5ee0,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_9f7b66ce5ee0,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_9f7b66ce5ee0,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_9f7b66ce5ee0,
  @TemplateContentID_Clear = 1,
  @ID = @ID_9f7b66ce5ee0;

GO

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_e0380d77ac7c UNIQUEIDENTIFIER,
@Name_e0380d77ac7c NVARCHAR(255),
@Description_e0380d77ac7c NVARCHAR(MAX),
@Type_e0380d77ac7c NVARCHAR(20),
@DefaultValue_e0380d77ac7c NVARCHAR(MAX),
@IsRequired_e0380d77ac7c BIT,
@LinkedParameterName_e0380d77ac7c NVARCHAR(255),
@LinkedParameterField_e0380d77ac7c NVARCHAR(500),
@ExtraFilter_e0380d77ac7c NVARCHAR(MAX),
@EntityID_e0380d77ac7c UNIQUEIDENTIFIER,
@RecordID_e0380d77ac7c NVARCHAR(2000),
@OrderBy_e0380d77ac7c NVARCHAR(MAX),
@TemplateContentID_e0380d77ac7c UNIQUEIDENTIFIER,
@ID_e0380d77ac7c UNIQUEIDENTIFIER
SET
  @TemplateID_e0380d77ac7c = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_e0380d77ac7c = N'PreviousAttempt'
SET
  @Description_e0380d77ac7c = N'Optional: the model''s prior invalid output, fed back on a retry attempt.'
SET
  @Type_e0380d77ac7c = N'Scalar'
SET
  @IsRequired_e0380d77ac7c = 0
SET
  @ID_e0380d77ac7c = '2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_e0380d77ac7c,
  @Name = @Name_e0380d77ac7c,
  @Description = @Description_e0380d77ac7c,
  @Type = @Type_e0380d77ac7c,
  @DefaultValue = @DefaultValue_e0380d77ac7c,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_e0380d77ac7c,
  @LinkedParameterName = @LinkedParameterName_e0380d77ac7c,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_e0380d77ac7c,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_e0380d77ac7c,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_e0380d77ac7c,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_e0380d77ac7c,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_e0380d77ac7c,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_e0380d77ac7c,
  @TemplateContentID_Clear = 1,
  @ID = @ID_e0380d77ac7c;

GO

-- Save MJ: Template Params (core SP call only)
DECLARE @TemplateID_903ad94c3518 UNIQUEIDENTIFIER,
@Name_903ad94c3518 NVARCHAR(255),
@Description_903ad94c3518 NVARCHAR(MAX),
@Type_903ad94c3518 NVARCHAR(20),
@DefaultValue_903ad94c3518 NVARCHAR(MAX),
@IsRequired_903ad94c3518 BIT,
@LinkedParameterName_903ad94c3518 NVARCHAR(255),
@LinkedParameterField_903ad94c3518 NVARCHAR(500),
@ExtraFilter_903ad94c3518 NVARCHAR(MAX),
@EntityID_903ad94c3518 UNIQUEIDENTIFIER,
@RecordID_903ad94c3518 NVARCHAR(2000),
@OrderBy_903ad94c3518 NVARCHAR(MAX),
@TemplateContentID_903ad94c3518 UNIQUEIDENTIFIER,
@ID_903ad94c3518 UNIQUEIDENTIFIER
SET
  @TemplateID_903ad94c3518 = '7E0A1B2C-3D4E-4F50-8A61-9B2C3D4E5F61'
SET
  @Name_903ad94c3518 = N'ValidationError'
SET
  @Description_903ad94c3518 = N'Optional: the blueprint validation error from the prior attempt, fed back on a retry.'
SET
  @Type_903ad94c3518 = N'Scalar'
SET
  @IsRequired_903ad94c3518 = 0
SET
  @ID_903ad94c3518 = '3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071' EXEC [${mjSchema}].spUpdateTemplateParam @TemplateID = @TemplateID_903ad94c3518,
  @Name = @Name_903ad94c3518,
  @Description = @Description_903ad94c3518,
  @Type = @Type_903ad94c3518,
  @DefaultValue = @DefaultValue_903ad94c3518,
  @DefaultValue_Clear = 1,
  @IsRequired = @IsRequired_903ad94c3518,
  @LinkedParameterName = @LinkedParameterName_903ad94c3518,
  @LinkedParameterName_Clear = 1,
  @LinkedParameterField = @LinkedParameterField_903ad94c3518,
  @LinkedParameterField_Clear = 1,
  @ExtraFilter = @ExtraFilter_903ad94c3518,
  @ExtraFilter_Clear = 1,
  @EntityID = @EntityID_903ad94c3518,
  @EntityID_Clear = 1,
  @RecordID = @RecordID_903ad94c3518,
  @RecordID_Clear = 1,
  @OrderBy = @OrderBy_903ad94c3518,
  @OrderBy_Clear = 1,
  @TemplateContentID = @TemplateContentID_903ad94c3518,
  @TemplateContentID_Clear = 1,
  @ID = @ID_903ad94c3518;

GO

-- Save MJ: User Views (core SP call only)
DECLARE @UserID_c9c04ad15183 UNIQUEIDENTIFIER,
@EntityID_c9c04ad15183 UNIQUEIDENTIFIER,
@Name_c9c04ad15183 NVARCHAR(100),
@Description_c9c04ad15183 NVARCHAR(MAX),
@CategoryID_c9c04ad15183 UNIQUEIDENTIFIER,
@IsShared_c9c04ad15183 BIT,
@IsDefault_c9c04ad15183 BIT,
@GridState_c9c04ad15183 NVARCHAR(MAX),
@FilterState_c9c04ad15183 NVARCHAR(MAX),
@CustomFilterState_c9c04ad15183 BIT,
@SmartFilterEnabled_c9c04ad15183 BIT,
@SmartFilterPrompt_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterWhereClause_c9c04ad15183 NVARCHAR(MAX),
@SmartFilterExplanation_c9c04ad15183 NVARCHAR(MAX),
@WhereClause_c9c04ad15183 NVARCHAR(MAX),
@CustomWhereClause_c9c04ad15183 BIT,
@SortState_c9c04ad15183 NVARCHAR(MAX),
@Thumbnail_c9c04ad15183 NVARCHAR(MAX),
@CardState_c9c04ad15183 NVARCHAR(MAX),
@DisplayState_c9c04ad15183 NVARCHAR(MAX),
@ViewTypeID_c9c04ad15183 UNIQUEIDENTIFIER,
@ID_c9c04ad15183 UNIQUEIDENTIFIER
SET
  @UserID_c9c04ad15183 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @EntityID_c9c04ad15183 = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8'
SET
  @Name_c9c04ad15183 = N'All Forms'
SET
  @Description_c9c04ad15183 = N''
SET
  @IsShared_c9c04ad15183 = 1
SET
  @IsDefault_c9c04ad15183 = 0
SET
  @GridState_c9c04ad15183 = N'{}'
SET
  @FilterState_c9c04ad15183 = N'{"logic":"and","filters":[]}'
SET
  @CustomFilterState_c9c04ad15183 = 0
SET
  @SmartFilterEnabled_c9c04ad15183 = 0
SET
  @WhereClause_c9c04ad15183 = N''
SET
  @CustomWhereClause_c9c04ad15183 = 0
SET
  @ID_c9c04ad15183 = '7F0D0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateUserView @UserID = @UserID_c9c04ad15183,
  @EntityID = @EntityID_c9c04ad15183,
  @Name = @Name_c9c04ad15183,
  @Description = @Description_c9c04ad15183,
  @CategoryID = @CategoryID_c9c04ad15183,
  @CategoryID_Clear = 1,
  @IsShared = @IsShared_c9c04ad15183,
  @IsDefault = @IsDefault_c9c04ad15183,
  @GridState = @GridState_c9c04ad15183,
  @FilterState = @FilterState_c9c04ad15183,
  @CustomFilterState = @CustomFilterState_c9c04ad15183,
  @SmartFilterEnabled = @SmartFilterEnabled_c9c04ad15183,
  @SmartFilterPrompt = @SmartFilterPrompt_c9c04ad15183,
  @SmartFilterPrompt_Clear = 1,
  @SmartFilterWhereClause = @SmartFilterWhereClause_c9c04ad15183,
  @SmartFilterWhereClause_Clear = 1,
  @SmartFilterExplanation = @SmartFilterExplanation_c9c04ad15183,
  @SmartFilterExplanation_Clear = 1,
  @WhereClause = @WhereClause_c9c04ad15183,
  @CustomWhereClause = @CustomWhereClause_c9c04ad15183,
  @SortState = @SortState_c9c04ad15183,
  @SortState_Clear = 1,
  @Thumbnail = @Thumbnail_c9c04ad15183,
  @Thumbnail_Clear = 1,
  @CardState = @CardState_c9c04ad15183,
  @CardState_Clear = 1,
  @DisplayState = @DisplayState_c9c04ad15183,
  @DisplayState_Clear = 1,
  @ViewTypeID = @ViewTypeID_c9c04ad15183,
  @ViewTypeID_Clear = 1,
  @ID = @ID_c9c04ad15183;

GO


-- End of SQL Logging Session
