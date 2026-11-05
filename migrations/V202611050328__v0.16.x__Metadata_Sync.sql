-- MJ Forms v0.16.x — the consolidated release metadata seed.
--
-- ONE seed per release (#105). v0.14.x shipped V202609291952; that file is append-only history now and
-- is untouched here. v0.15.x shipped no seed (its metadata had not moved). This is a DELTA beside the
-- earlier seeds, and it folds in no retired per-PR seed — there were none outstanding: the five
-- Metadata_Sync files in this directory are all in release tags. `npm run check:seed-cadence` and
-- `npm run check:release-seed` asked for it: metadata/ moved in 70 files since v0.15.1, and 29 of the
-- 48 declared action ids, among others, reached no shipped SQL.
--
-- WHAT IT CARRIES (145 records from the first push, 4 from the second):
--   created  — the 20 Forms Remote Operations of #303 and their category; 12 reporting queries
--              (the three Forms reporting queries plus their fields, parameters, entities, permissions)
--              and their Forms query category; 2 action params and 27 action result codes; 3 API scopes
--              and their 2 MJAPI application scopes; the Forms scheduled job type and its job; one user
--              notification type.
--   updated  — the Form Respondent role's description; the AI form-designer template text and its three
--              params; the two authoring actions' descriptions; the Search-API and name-field curation of
--              the Form Automation Events entity and six response-side EntityFields (#325's polymorphic
--              TargetRecordID included); the RelatedRecordCollection of the four Forms -> Pages ->
--              Questions -> Options / Screens relationships.
-- Every update traces to a deliberate metadata/ edit since v0.15.1 (`git diff v0.15.1 -- metadata/`). The
-- one migration since then that writes the same columns, V202610172100 (the automation outbox), inserts
-- CodeGen's defaults for the new table's fields; metadata/ deliberately overrides them, so this is the
-- metadata reaching hosts, not a seed reverting a migration (migrations/README.md, "a fourth hazard").
--
-- GENERATED AGAINST THE SHIPPED CHAIN AT HEAD, built FROM EMPTY: core __mj at MJ v6.2.0's own frontier
-- (202611032346), bizapps-common at its released tag v5.60.0 (202611042220), bizapps-tasks at v1.10.0
-- (202610200040), Forms at head (202610262300). Migrations only, zero business rows, no dev records.
-- Built from empty rather than from the v0.16 baseline backup because that backup is core 6.1.6 with
-- Common 5.54 already installed, and the 6.2 core migration fails on exactly that shape (MJ#4939).
-- Pushed with the pinned @memberjunction/cli 6.2.0.
--
-- WHAT MJ 6.2's LOGGER DOES DIFFERENTLY, so the README's three hand edits shrink to one:
--   - It writes every core SP call as [${mjSchema}] already. No ${flyway:defaultSchema} -> ${mjSchema}
--     rewrite was needed. The seven ${flyway:defaultSchema} sites it does emit are all INSIDE query SQL and
--     one TechnicalDescription, where the source metadata names __mj_BizAppsForms literally; in this app's
--     migration the placeholder resolves back to __mj_BizAppsForms, so they round-trip unchanged. Checked
--     by hand, not replaced blind (non-EXEC sites can need the opposite call).
--   - It resolves @lookup references BY NAME in a subquery, so the Form Respondent query permissions
--     need no role-id rewrite.
--   - It writes a new record as an upsert (IF NOT EXISTS create, ELSE update), safe on any host.
--   TWO hand edits remain, both for portability, both mechanical (made by the assembly script, not typed):
--   1. The Form Respondent role's OWN spUpdateRole carried its id as a literal. That role is shared and a
--      sibling app may have minted it under another id (#39), so its @ID is resolved by name.
--   2. Every Forms entity lookup is keyed on BaseTable + SchemaName. The logger keys an Entity lookup on
--      Name and an EntityField lookup on a literal EntityID — the values this database held. Some Forms
--      entity rows are seeded under an IF NOT EXISTS natural-key guard (the outbox's, V202610172100), so a
--      host that ran CodeGen first kept its own id and its own name; `npm run lint:distribution` CHECK 7
--      refused the literal 0DBA2EE2 for exactly that reason. BaseTable + SchemaName is the key every host
--      agrees on (.claude/rules/migrations-codegen.md).
--
-- THE PREREQUISITE BLOCK below exists because the remaining UPDATES are bare: spUpdateEntity /
-- spUpdateEntityField / spUpdateEntityRelationship / spUpdateTemplate* / spUpdateAction / spUpdateUserView
-- key on @ID and raise NOTHING when it matches no row — an @ID from a lookup that found nothing is NULL,
-- and the statement reports success having changed nothing. Every row those updates target is checked up
-- front and the migration stops with a named THROW instead.
--
-- WHY THERE IS A SECOND PUSH. Saving a TemplateContent runs MJ's template param extraction, which rewrites
-- that template's param descriptions AFTER the push compared them. Replaying SQL runs no hook, so the
-- first push's log alone would leave the extracted wording on every host. Pushing again against the same
-- database emits exactly the corrections; both logs ship, in order. A third push changed nothing but:
--
-- WHY THE spUpdateUserView IS HERE. It writes the All Forms view back with the values it already has;
-- every earlier seed carries one for the same reason, and it is a generator artifact rather than a change.
-- Kept rather than hand-deleted, because editing generated output by hand is how a seed stops matching
-- what a push produces. The same rule keeps the query field and parameter descriptions as MJ generated
-- them when the queries were saved (their DetectionMethod is 'AI').

-- PREREQUISITES. Every row a bare spUpdate* below targets, checked up front (see header).
IF (SELECT COUNT(*) FROM [${mjSchema}].[Entity] WHERE [SchemaName] = '${flyway:defaultSchema}' AND [BaseTable] IN ('Form', 'FormAutomationEvent', 'FormAutomationRun', 'FormEntityBindingRecord', 'FormPage', 'FormQuestion', 'FormQuestionOption', 'FormResponse', 'FormResponseAnswer', 'FormScreen')) <> 10
    THROW 51160, 'v0.16.x Metadata_Sync: a Forms entity this seed updates (Form, FormAutomationEvent, FormAutomationRun, FormEntityBindingRecord, FormPage, FormQuestion, FormQuestionOption, FormResponse, FormResponseAnswer, FormScreen) has no [Entity] row in this schema. Every update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'FormResponseID' AND e.[BaseTable] = 'FormAutomationEvent' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField FormResponseID of FormAutomationEvent is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'FormResponseID' AND e.[BaseTable] = 'FormAutomationRun' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField FormResponseID of FormAutomationRun is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'FormResponseID' AND e.[BaseTable] = 'FormEntityBindingRecord' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField FormResponseID of FormEntityBindingRecord is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'Form' AND e.[BaseTable] = 'FormResponse' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField Form of FormResponse is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'ResponseID' AND e.[BaseTable] = 'FormResponseAnswer' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField ResponseID of FormResponseAnswer is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] ef JOIN [${mjSchema}].[Entity] e ON e.[ID] = ef.[EntityID]
               WHERE ef.[Name] = N'TargetRecordID' AND e.[BaseTable] = 'FormEntityBindingRecord' AND e.[SchemaName] = '${flyway:defaultSchema}')
    THROW 51161, 'v0.16.x Metadata_Sync: EntityField TargetRecordID of FormEntityBindingRecord is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship] r JOIN [${mjSchema}].[Entity] e ON e.[ID] = r.[EntityID] JOIN [${mjSchema}].[Entity] re ON re.[ID] = r.[RelatedEntityID]
               WHERE e.[BaseTable] = 'Form' AND e.[SchemaName] = '${flyway:defaultSchema}' AND re.[BaseTable] = 'FormPage' AND re.[SchemaName] = '${flyway:defaultSchema}' AND r.[RelatedEntityJoinField] = N'FormID')
    THROW 51162, 'v0.16.x Metadata_Sync: the Form -> FormPage (FormID) relationship is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship] r JOIN [${mjSchema}].[Entity] e ON e.[ID] = r.[EntityID] JOIN [${mjSchema}].[Entity] re ON re.[ID] = r.[RelatedEntityID]
               WHERE e.[BaseTable] = 'Form' AND e.[SchemaName] = '${flyway:defaultSchema}' AND re.[BaseTable] = 'FormScreen' AND re.[SchemaName] = '${flyway:defaultSchema}' AND r.[RelatedEntityJoinField] = N'FormID')
    THROW 51162, 'v0.16.x Metadata_Sync: the Form -> FormScreen (FormID) relationship is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship] r JOIN [${mjSchema}].[Entity] e ON e.[ID] = r.[EntityID] JOIN [${mjSchema}].[Entity] re ON re.[ID] = r.[RelatedEntityID]
               WHERE e.[BaseTable] = 'FormPage' AND e.[SchemaName] = '${flyway:defaultSchema}' AND re.[BaseTable] = 'FormQuestion' AND re.[SchemaName] = '${flyway:defaultSchema}' AND r.[RelatedEntityJoinField] = N'PageID')
    THROW 51162, 'v0.16.x Metadata_Sync: the FormPage -> FormQuestion (PageID) relationship is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityRelationship] r JOIN [${mjSchema}].[Entity] e ON e.[ID] = r.[EntityID] JOIN [${mjSchema}].[Entity] re ON re.[ID] = r.[RelatedEntityID]
               WHERE e.[BaseTable] = 'FormQuestion' AND e.[SchemaName] = '${flyway:defaultSchema}' AND re.[BaseTable] = 'FormQuestionOption' AND re.[SchemaName] = '${flyway:defaultSchema}' AND r.[RelatedEntityJoinField] = N'QuestionID')
    THROW 51162, 'v0.16.x Metadata_Sync: the FormQuestion -> FormQuestionOption (QuestionID) relationship is missing; its update below would match no row.', 1;
IF (SELECT COUNT(*) FROM [${mjSchema}].[Role] WHERE [Name] = N'Form Respondent') <> 1
    THROW 51163, 'v0.16.x Metadata_Sync: expected exactly one Form Respondent role.', 1;
IF (SELECT COUNT(DISTINCT [Name]) FROM [${mjSchema}].[Role] WHERE [Name] IN (N'Developer', N'Integration', N'UI')) <> 3
    THROW 51164, 'v0.16.x Metadata_Sync: a core role a query permission below names is missing (Developer, Integration, UI).', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[TemplateContent] WHERE [ID] = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60')
    THROW 51165, 'v0.16.x Metadata_Sync: TemplateContent 8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[TemplateParam] WHERE [ID] = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F')
    THROW 51165, 'v0.16.x Metadata_Sync: TemplateParam 1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[TemplateParam] WHERE [ID] = '2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60')
    THROW 51165, 'v0.16.x Metadata_Sync: TemplateParam 2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[TemplateParam] WHERE [ID] = '3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071')
    THROW 51165, 'v0.16.x Metadata_Sync: TemplateParam 3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[UserView] WHERE [ID] = '7F0D0001-A1B2-4C3D-8E4F-000000000001')
    THROW 51165, 'v0.16.x Metadata_Sync: UserView 7F0D0001-A1B2-4C3D-8E4F-000000000001, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action] WHERE [ID] = '7F0A0001-A1B2-4C3D-8E4F-000000000001')
    THROW 51165, 'v0.16.x Metadata_Sync: Action 7F0A0001-A1B2-4C3D-8E4F-000000000001, shipped by an earlier seed, is missing; its update below would match no row.', 1;
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[Action] WHERE [ID] = '7F0A0002-A1B2-4C3D-8E4F-000000000002')
    THROW 51165, 'v0.16.x Metadata_Sync: Action 7F0A0002-A1B2-4C3D-8E4F-000000000002, shipped by an earlier seed, is missing; its update below would match no row.', 1;
GO

-- Save MJ: Roles (core SP call only)
DECLARE @Description_24a4190962bc NVARCHAR(MAX),
@ID_24a4190962bc UNIQUEIDENTIFIER
SET
  @Description_24a4190962bc = N'Restricted role for anonymous/external respondents who reach a published MJ Form via a scoped magic-link distribution. The ONE deliberate exception to the magic-link read-only convention. It grants exactly five things and nothing else: CanCreate on Form Responses and Form Response Answers, each carrying a DENY-ALL create filter — the respondent scope check (checkRespondentScope, in forms-core-entities-server) reads only the CanCreate flag, while the real write is performed by the system user, so an unfiltered grant would buy nothing but a bypass of the submit pipeline via MJ''s generic Create mutation; scope-filtered read on Form Distributions, filtered to the distribution the session''s own invite names; and, since #138, scope-filtered read on Form Responses and Form Response Answers, filtered to the ONE response a resume link''s invite names. One shared anonymous principal backs every respondent, so no unfiltered read on a response entity is ever safe; a public-link session''s scope is a distribution id, so it reads zero response rows. Since #303 it holds no read on Form Versions: the raw snapshot carries the answer key and gated endings, so the server reads the published version as the system user and sends the respondent an allowlisted projection. It holds NOTHING on Forms, Form Questions, Form Question Options, Form Pages or Form Styles — the server''s respondent projection already carries all of that, so no anonymous code path reads them. This is a SHARED role: co-installed apps may add their own grants to it, and this app asserts only its own five facts. Authorization is enforced server-side from the session''s mj_scopes union; this role is the entity-permission boundary. Never assign to internal/SSO users.'
SET
  @ID_24a4190962bc = (SELECT [ID] FROM [${mjSchema}].[Role] WHERE [Name] = N'Form Respondent') EXEC [${mjSchema}].spUpdateRole @Description = @Description_24a4190962bc,
  @ID = @ID_24a4190962bc;

-- Save MJ: Template Contents (core SP call only)
DECLARE @TemplateText_7f6922bfd11f NVARCHAR(MAX),
@ID_7f6922bfd11f UNIQUEIDENTIFIER
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
  @ID_7f6922bfd11f = '8F1B6C2A-3D4E-4F50-9A61-7B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateContent @TemplateText = @TemplateText_7f6922bfd11f,
  @ID = @ID_7f6922bfd11f;

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_9f7b66ce5ee0 NVARCHAR(MAX),
@ID_9f7b66ce5ee0 UNIQUEIDENTIFIER
SET
  @Description_9f7b66ce5ee0 = N'The natural-language brief describing the form to be designed'
SET
  @ID_9f7b66ce5ee0 = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_9f7b66ce5ee0,
  @ID = @ID_9f7b66ce5ee0;

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_e0380d77ac7c NVARCHAR(MAX),
@ID_e0380d77ac7c UNIQUEIDENTIFIER
SET
  @Description_e0380d77ac7c = N'The JSON output from the previous failed attempt'
SET
  @ID_e0380d77ac7c = '2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_e0380d77ac7c,
  @ID = @ID_e0380d77ac7c;

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_903ad94c3518 NVARCHAR(MAX),
@ID_903ad94c3518 UNIQUEIDENTIFIER
SET
  @Description_903ad94c3518 = N'A message describing why the previous JSON output was invalid'
SET
  @ID_903ad94c3518 = '3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_903ad94c3518,
  @ID = @ID_903ad94c3518;

-- Save MJ: User Views (core SP call only)
DECLARE @Name_c9c04ad15183 NVARCHAR(100),
@IsShared_c9c04ad15183 BIT,
@ID_c9c04ad15183 UNIQUEIDENTIFIER
SET
  @Name_c9c04ad15183 = N'All Forms'
SET
  @IsShared_c9c04ad15183 = 1
SET
  @ID_c9c04ad15183 = '7F0D0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateUserView @Name = @Name_c9c04ad15183,
  @IsShared = @IsShared_c9c04ad15183,
  @ID = @ID_c9c04ad15183;

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
  @UserID_09b56d2034a1 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[User]
    WHERE
      LOWER([Name]) = LOWER(N'System')
  )
SET
  @DefaultCacheEnabled_09b56d2034a1 = 0
SET
  @CacheInheritanceEnabled_09b56d2034a1 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryCategory]
    WHERE
      [ID] = @ID_09b56d2034a1
  )
BEGIN
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
  @CacheInheritanceEnabled = @CacheInheritanceEnabled_09b56d2034a1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryCategory @ID = @ID_09b56d2034a1,
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
  @CacheInheritanceEnabled = @CacheInheritanceEnabled_09b56d2034a1
END;

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
@IsMaterialized_cb06fe6f2bf3 BIT,
@Configuration_cb06fe6f2bf3 NVARCHAR(MAX),
@EmbeddingVectorBinary_cb06fe6f2bf3 VARBINARY(MAX),
@ApprovalComments_cb06fe6f2bf3 NVARCHAR(MAX),
@ApprovedByUserID_cb06fe6f2bf3 UNIQUEIDENTIFIER,
@ApprovedAt_cb06fe6f2bf3 DATETIMEOFFSET,
@ApprovedFingerprint_cb06fe6f2bf3 NVARCHAR(100),
@ExtractedSQLHash_cb06fe6f2bf3 NVARCHAR(64),
@ExtractionStatus_cb06fe6f2bf3 NVARCHAR(20),
@ExtractionMessage_cb06fe6f2bf3 NVARCHAR(MAX)
SET
  @ID_cb06fe6f2bf3 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_cb06fe6f2bf3 = N'Forms: Response Completion Stats'
SET
  @CategoryID_cb06fe6f2bf3 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[QueryCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
    FROM [${flyway:defaultSchema}].[vwFormResponses] r
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
  @TechnicalDescription_cb06fe6f2bf3 = N'Nunjucks-parameterized. FormID (required) and FormVersionID (optional; absent means every version) filter ${flyway:defaultSchema}.vwFormResponses. MedianCompletionSeconds is PERCENTILE_CONT(0.5) over Complete rows whose SubmittedAt - StartedAt is 0 to 86400 s. Always returns exactly one row.'
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
  @Reusable_cb06fe6f2bf3 = 0
SET
  @IsMaterialized_cb06fe6f2bf3 = 0
SET
  @ApprovedByUserID_cb06fe6f2bf3 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @ApprovedAt_cb06fe6f2bf3 = '2026-11-05T03:12:19.698Z'
SET
  @ExtractedSQLHash_cb06fe6f2bf3 = N'428986d5185f571f6de750e3c6c178fd67016356092ec50cc63d1d509c9d4608'
SET
  @ExtractionStatus_cb06fe6f2bf3 = N'OK' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[Query]
    WHERE
      [ID] = @ID_cb06fe6f2bf3
  )
BEGIN
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_cb06fe6f2bf3,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_cb06fe6f2bf3,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_cb06fe6f2bf3,
  @Reusable = @Reusable_cb06fe6f2bf3,
  @ExternalDataSourceID = @ExternalDataSourceID_cb06fe6f2bf3,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_cb06fe6f2bf3,
  @Configuration = @Configuration_cb06fe6f2bf3,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_cb06fe6f2bf3,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_cb06fe6f2bf3,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_cb06fe6f2bf3,
  @ApprovedAt = @ApprovedAt_cb06fe6f2bf3,
  @ApprovedFingerprint = @ApprovedFingerprint_cb06fe6f2bf3,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_cb06fe6f2bf3,
  @ExtractionStatus = @ExtractionStatus_cb06fe6f2bf3,
  @ExtractionMessage = @ExtractionMessage_cb06fe6f2bf3,
  @ExtractionMessage_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQuery @ID = @ID_cb06fe6f2bf3,
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_cb06fe6f2bf3,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_cb06fe6f2bf3,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_cb06fe6f2bf3,
  @Reusable = @Reusable_cb06fe6f2bf3,
  @ExternalDataSourceID = @ExternalDataSourceID_cb06fe6f2bf3,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_cb06fe6f2bf3,
  @Configuration = @Configuration_cb06fe6f2bf3,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_cb06fe6f2bf3,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_cb06fe6f2bf3,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_cb06fe6f2bf3,
  @ApprovedAt = @ApprovedAt_cb06fe6f2bf3,
  @ApprovedFingerprint = @ApprovedFingerprint_cb06fe6f2bf3,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_cb06fe6f2bf3,
  @ExtractionStatus = @ExtractionStatus_cb06fe6f2bf3,
  @ExtractionMessage = @ExtractionMessage_cb06fe6f2bf3,
  @ExtractionMessage_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_dc5548bfbccf UNIQUEIDENTIFIER,
@QueryID_dc5548bfbccf UNIQUEIDENTIFIER,
@Name_dc5548bfbccf NVARCHAR(255),
@Description_dc5548bfbccf NVARCHAR(MAX),
@Sequence_dc5548bfbccf INT,
@SQLBaseType_dc5548bfbccf NVARCHAR(50),
@SQLFullType_dc5548bfbccf NVARCHAR(100),
@SourceEntityID_dc5548bfbccf UNIQUEIDENTIFIER,
@SourceFieldName_dc5548bfbccf NVARCHAR(255),
@IsComputed_dc5548bfbccf BIT,
@ComputationDescription_dc5548bfbccf NVARCHAR(MAX),
@IsSummary_dc5548bfbccf BIT,
@SummaryDescription_dc5548bfbccf NVARCHAR(MAX),
@DetectionMethod_dc5548bfbccf NVARCHAR(50),
@AutoDetectConfidenceScore_dc5548bfbccf DECIMAL(3, 2),
@SourceEntityFieldID_dc5548bfbccf UNIQUEIDENTIFIER,
@IsNullable_dc5548bfbccf BIT,
@SourceObjectName_dc5548bfbccf NVARCHAR(500)
SET
  @ID_dc5548bfbccf = '4306b676-270b-4b38-946c-08bdd1f91a7e'
SET
  @QueryID_dc5548bfbccf = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_dc5548bfbccf = N'CompleteCount'
SET
  @Sequence_dc5548bfbccf = 1
SET
  @SQLBaseType_dc5548bfbccf = N'int'
SET
  @SQLFullType_dc5548bfbccf = N'int'
SET
  @IsComputed_dc5548bfbccf = 1
SET
  @IsSummary_dc5548bfbccf = 0
SET
  @DetectionMethod_dc5548bfbccf = N'Database'
SET
  @IsNullable_dc5548bfbccf = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_dc5548bfbccf
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_dc5548bfbccf,
  @QueryID = @QueryID_dc5548bfbccf,
  @Name = @Name_dc5548bfbccf,
  @Description = @Description_dc5548bfbccf,
  @Description_Clear = 1,
  @Sequence = @Sequence_dc5548bfbccf,
  @SQLBaseType = @SQLBaseType_dc5548bfbccf,
  @SQLFullType = @SQLFullType_dc5548bfbccf,
  @SourceEntityID = @SourceEntityID_dc5548bfbccf,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_dc5548bfbccf,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_dc5548bfbccf,
  @ComputationDescription = @ComputationDescription_dc5548bfbccf,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_dc5548bfbccf,
  @SummaryDescription = @SummaryDescription_dc5548bfbccf,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_dc5548bfbccf,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dc5548bfbccf,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_dc5548bfbccf,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_dc5548bfbccf,
  @SourceObjectName = @SourceObjectName_dc5548bfbccf,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_dc5548bfbccf,
  @QueryID = @QueryID_dc5548bfbccf,
  @Name = @Name_dc5548bfbccf,
  @Description = @Description_dc5548bfbccf,
  @Description_Clear = 1,
  @Sequence = @Sequence_dc5548bfbccf,
  @SQLBaseType = @SQLBaseType_dc5548bfbccf,
  @SQLFullType = @SQLFullType_dc5548bfbccf,
  @SourceEntityID = @SourceEntityID_dc5548bfbccf,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_dc5548bfbccf,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_dc5548bfbccf,
  @ComputationDescription = @ComputationDescription_dc5548bfbccf,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_dc5548bfbccf,
  @SummaryDescription = @SummaryDescription_dc5548bfbccf,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_dc5548bfbccf,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dc5548bfbccf,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_dc5548bfbccf,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_dc5548bfbccf,
  @SourceObjectName = @SourceObjectName_dc5548bfbccf,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_9380d90cbf70 UNIQUEIDENTIFIER,
@QueryID_9380d90cbf70 UNIQUEIDENTIFIER,
@Name_9380d90cbf70 NVARCHAR(255),
@Description_9380d90cbf70 NVARCHAR(MAX),
@Sequence_9380d90cbf70 INT,
@SQLBaseType_9380d90cbf70 NVARCHAR(50),
@SQLFullType_9380d90cbf70 NVARCHAR(100),
@SourceEntityID_9380d90cbf70 UNIQUEIDENTIFIER,
@SourceFieldName_9380d90cbf70 NVARCHAR(255),
@IsComputed_9380d90cbf70 BIT,
@ComputationDescription_9380d90cbf70 NVARCHAR(MAX),
@IsSummary_9380d90cbf70 BIT,
@SummaryDescription_9380d90cbf70 NVARCHAR(MAX),
@DetectionMethod_9380d90cbf70 NVARCHAR(50),
@AutoDetectConfidenceScore_9380d90cbf70 DECIMAL(3, 2),
@SourceEntityFieldID_9380d90cbf70 UNIQUEIDENTIFIER,
@IsNullable_9380d90cbf70 BIT,
@SourceObjectName_9380d90cbf70 NVARCHAR(500)
SET
  @ID_9380d90cbf70 = '6ba92c59-044a-4318-bb35-14fe455b924c'
SET
  @QueryID_9380d90cbf70 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_9380d90cbf70 = N'PartialCount'
SET
  @Sequence_9380d90cbf70 = 2
SET
  @SQLBaseType_9380d90cbf70 = N'int'
SET
  @SQLFullType_9380d90cbf70 = N'int'
SET
  @IsComputed_9380d90cbf70 = 1
SET
  @IsSummary_9380d90cbf70 = 0
SET
  @DetectionMethod_9380d90cbf70 = N'Database'
SET
  @IsNullable_9380d90cbf70 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_9380d90cbf70
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_9380d90cbf70,
  @QueryID = @QueryID_9380d90cbf70,
  @Name = @Name_9380d90cbf70,
  @Description = @Description_9380d90cbf70,
  @Description_Clear = 1,
  @Sequence = @Sequence_9380d90cbf70,
  @SQLBaseType = @SQLBaseType_9380d90cbf70,
  @SQLFullType = @SQLFullType_9380d90cbf70,
  @SourceEntityID = @SourceEntityID_9380d90cbf70,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_9380d90cbf70,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_9380d90cbf70,
  @ComputationDescription = @ComputationDescription_9380d90cbf70,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_9380d90cbf70,
  @SummaryDescription = @SummaryDescription_9380d90cbf70,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_9380d90cbf70,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_9380d90cbf70,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_9380d90cbf70,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_9380d90cbf70,
  @SourceObjectName = @SourceObjectName_9380d90cbf70,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_9380d90cbf70,
  @QueryID = @QueryID_9380d90cbf70,
  @Name = @Name_9380d90cbf70,
  @Description = @Description_9380d90cbf70,
  @Description_Clear = 1,
  @Sequence = @Sequence_9380d90cbf70,
  @SQLBaseType = @SQLBaseType_9380d90cbf70,
  @SQLFullType = @SQLFullType_9380d90cbf70,
  @SourceEntityID = @SourceEntityID_9380d90cbf70,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_9380d90cbf70,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_9380d90cbf70,
  @ComputationDescription = @ComputationDescription_9380d90cbf70,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_9380d90cbf70,
  @SummaryDescription = @SummaryDescription_9380d90cbf70,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_9380d90cbf70,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_9380d90cbf70,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_9380d90cbf70,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_9380d90cbf70,
  @SourceObjectName = @SourceObjectName_9380d90cbf70,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_241af84eb5db UNIQUEIDENTIFIER,
@QueryID_241af84eb5db UNIQUEIDENTIFIER,
@Name_241af84eb5db NVARCHAR(255),
@Description_241af84eb5db NVARCHAR(MAX),
@Sequence_241af84eb5db INT,
@SQLBaseType_241af84eb5db NVARCHAR(50),
@SQLFullType_241af84eb5db NVARCHAR(100),
@SourceEntityID_241af84eb5db UNIQUEIDENTIFIER,
@SourceFieldName_241af84eb5db NVARCHAR(255),
@IsComputed_241af84eb5db BIT,
@ComputationDescription_241af84eb5db NVARCHAR(MAX),
@IsSummary_241af84eb5db BIT,
@SummaryDescription_241af84eb5db NVARCHAR(MAX),
@DetectionMethod_241af84eb5db NVARCHAR(50),
@AutoDetectConfidenceScore_241af84eb5db DECIMAL(3, 2),
@SourceEntityFieldID_241af84eb5db UNIQUEIDENTIFIER,
@IsNullable_241af84eb5db BIT,
@SourceObjectName_241af84eb5db NVARCHAR(500)
SET
  @ID_241af84eb5db = '767d6d7b-97ec-4c48-8b2c-094ae53b97c1'
SET
  @QueryID_241af84eb5db = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_241af84eb5db = N'DisqualifiedCount'
SET
  @Sequence_241af84eb5db = 3
SET
  @SQLBaseType_241af84eb5db = N'int'
SET
  @SQLFullType_241af84eb5db = N'int'
SET
  @IsComputed_241af84eb5db = 1
SET
  @IsSummary_241af84eb5db = 0
SET
  @DetectionMethod_241af84eb5db = N'Database'
SET
  @IsNullable_241af84eb5db = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_241af84eb5db
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_241af84eb5db,
  @QueryID = @QueryID_241af84eb5db,
  @Name = @Name_241af84eb5db,
  @Description = @Description_241af84eb5db,
  @Description_Clear = 1,
  @Sequence = @Sequence_241af84eb5db,
  @SQLBaseType = @SQLBaseType_241af84eb5db,
  @SQLFullType = @SQLFullType_241af84eb5db,
  @SourceEntityID = @SourceEntityID_241af84eb5db,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_241af84eb5db,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_241af84eb5db,
  @ComputationDescription = @ComputationDescription_241af84eb5db,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_241af84eb5db,
  @SummaryDescription = @SummaryDescription_241af84eb5db,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_241af84eb5db,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_241af84eb5db,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_241af84eb5db,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_241af84eb5db,
  @SourceObjectName = @SourceObjectName_241af84eb5db,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_241af84eb5db,
  @QueryID = @QueryID_241af84eb5db,
  @Name = @Name_241af84eb5db,
  @Description = @Description_241af84eb5db,
  @Description_Clear = 1,
  @Sequence = @Sequence_241af84eb5db,
  @SQLBaseType = @SQLBaseType_241af84eb5db,
  @SQLFullType = @SQLFullType_241af84eb5db,
  @SourceEntityID = @SourceEntityID_241af84eb5db,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_241af84eb5db,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_241af84eb5db,
  @ComputationDescription = @ComputationDescription_241af84eb5db,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_241af84eb5db,
  @SummaryDescription = @SummaryDescription_241af84eb5db,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_241af84eb5db,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_241af84eb5db,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_241af84eb5db,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_241af84eb5db,
  @SourceObjectName = @SourceObjectName_241af84eb5db,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_cc51f7bd9a16 UNIQUEIDENTIFIER,
@QueryID_cc51f7bd9a16 UNIQUEIDENTIFIER,
@Name_cc51f7bd9a16 NVARCHAR(255),
@Description_cc51f7bd9a16 NVARCHAR(MAX),
@Sequence_cc51f7bd9a16 INT,
@SQLBaseType_cc51f7bd9a16 NVARCHAR(50),
@SQLFullType_cc51f7bd9a16 NVARCHAR(100),
@SourceEntityID_cc51f7bd9a16 UNIQUEIDENTIFIER,
@SourceFieldName_cc51f7bd9a16 NVARCHAR(255),
@IsComputed_cc51f7bd9a16 BIT,
@ComputationDescription_cc51f7bd9a16 NVARCHAR(MAX),
@IsSummary_cc51f7bd9a16 BIT,
@SummaryDescription_cc51f7bd9a16 NVARCHAR(MAX),
@DetectionMethod_cc51f7bd9a16 NVARCHAR(50),
@AutoDetectConfidenceScore_cc51f7bd9a16 DECIMAL(3, 2),
@SourceEntityFieldID_cc51f7bd9a16 UNIQUEIDENTIFIER,
@IsNullable_cc51f7bd9a16 BIT,
@SourceObjectName_cc51f7bd9a16 NVARCHAR(500)
SET
  @ID_cc51f7bd9a16 = '2ca5dd0c-4e43-4cff-bc06-be44fee0ea38'
SET
  @QueryID_cc51f7bd9a16 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_cc51f7bd9a16 = N'StartedCount'
SET
  @Sequence_cc51f7bd9a16 = 4
SET
  @SQLBaseType_cc51f7bd9a16 = N'int'
SET
  @SQLFullType_cc51f7bd9a16 = N'int'
SET
  @IsComputed_cc51f7bd9a16 = 1
SET
  @IsSummary_cc51f7bd9a16 = 0
SET
  @DetectionMethod_cc51f7bd9a16 = N'Database'
SET
  @IsNullable_cc51f7bd9a16 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_cc51f7bd9a16
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_cc51f7bd9a16,
  @QueryID = @QueryID_cc51f7bd9a16,
  @Name = @Name_cc51f7bd9a16,
  @Description = @Description_cc51f7bd9a16,
  @Description_Clear = 1,
  @Sequence = @Sequence_cc51f7bd9a16,
  @SQLBaseType = @SQLBaseType_cc51f7bd9a16,
  @SQLFullType = @SQLFullType_cc51f7bd9a16,
  @SourceEntityID = @SourceEntityID_cc51f7bd9a16,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_cc51f7bd9a16,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_cc51f7bd9a16,
  @ComputationDescription = @ComputationDescription_cc51f7bd9a16,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_cc51f7bd9a16,
  @SummaryDescription = @SummaryDescription_cc51f7bd9a16,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_cc51f7bd9a16,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_cc51f7bd9a16,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_cc51f7bd9a16,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_cc51f7bd9a16,
  @SourceObjectName = @SourceObjectName_cc51f7bd9a16,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_cc51f7bd9a16,
  @QueryID = @QueryID_cc51f7bd9a16,
  @Name = @Name_cc51f7bd9a16,
  @Description = @Description_cc51f7bd9a16,
  @Description_Clear = 1,
  @Sequence = @Sequence_cc51f7bd9a16,
  @SQLBaseType = @SQLBaseType_cc51f7bd9a16,
  @SQLFullType = @SQLFullType_cc51f7bd9a16,
  @SourceEntityID = @SourceEntityID_cc51f7bd9a16,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_cc51f7bd9a16,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_cc51f7bd9a16,
  @ComputationDescription = @ComputationDescription_cc51f7bd9a16,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_cc51f7bd9a16,
  @SummaryDescription = @SummaryDescription_cc51f7bd9a16,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_cc51f7bd9a16,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_cc51f7bd9a16,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_cc51f7bd9a16,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_cc51f7bd9a16,
  @SourceObjectName = @SourceObjectName_cc51f7bd9a16,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_95383a931af1 UNIQUEIDENTIFIER,
@QueryID_95383a931af1 UNIQUEIDENTIFIER,
@Name_95383a931af1 NVARCHAR(255),
@Description_95383a931af1 NVARCHAR(MAX),
@Sequence_95383a931af1 INT,
@SQLBaseType_95383a931af1 NVARCHAR(50),
@SQLFullType_95383a931af1 NVARCHAR(100),
@SourceEntityID_95383a931af1 UNIQUEIDENTIFIER,
@SourceFieldName_95383a931af1 NVARCHAR(255),
@IsComputed_95383a931af1 BIT,
@ComputationDescription_95383a931af1 NVARCHAR(MAX),
@IsSummary_95383a931af1 BIT,
@SummaryDescription_95383a931af1 NVARCHAR(MAX),
@DetectionMethod_95383a931af1 NVARCHAR(50),
@AutoDetectConfidenceScore_95383a931af1 DECIMAL(3, 2),
@SourceEntityFieldID_95383a931af1 UNIQUEIDENTIFIER,
@IsNullable_95383a931af1 BIT,
@SourceObjectName_95383a931af1 NVARCHAR(500)
SET
  @ID_95383a931af1 = '5a80f30a-94a1-401b-9a90-f618504ba786'
SET
  @QueryID_95383a931af1 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_95383a931af1 = N'MedianCompletionSeconds'
SET
  @Sequence_95383a931af1 = 5
SET
  @SQLBaseType_95383a931af1 = N'float'
SET
  @SQLFullType_95383a931af1 = N'float'
SET
  @IsComputed_95383a931af1 = 1
SET
  @IsSummary_95383a931af1 = 0
SET
  @DetectionMethod_95383a931af1 = N'Database'
SET
  @IsNullable_95383a931af1 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_95383a931af1
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_95383a931af1,
  @QueryID = @QueryID_95383a931af1,
  @Name = @Name_95383a931af1,
  @Description = @Description_95383a931af1,
  @Description_Clear = 1,
  @Sequence = @Sequence_95383a931af1,
  @SQLBaseType = @SQLBaseType_95383a931af1,
  @SQLFullType = @SQLFullType_95383a931af1,
  @SourceEntityID = @SourceEntityID_95383a931af1,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_95383a931af1,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_95383a931af1,
  @ComputationDescription = @ComputationDescription_95383a931af1,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_95383a931af1,
  @SummaryDescription = @SummaryDescription_95383a931af1,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_95383a931af1,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_95383a931af1,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_95383a931af1,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_95383a931af1,
  @SourceObjectName = @SourceObjectName_95383a931af1,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_95383a931af1,
  @QueryID = @QueryID_95383a931af1,
  @Name = @Name_95383a931af1,
  @Description = @Description_95383a931af1,
  @Description_Clear = 1,
  @Sequence = @Sequence_95383a931af1,
  @SQLBaseType = @SQLBaseType_95383a931af1,
  @SQLFullType = @SQLFullType_95383a931af1,
  @SourceEntityID = @SourceEntityID_95383a931af1,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_95383a931af1,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_95383a931af1,
  @ComputationDescription = @ComputationDescription_95383a931af1,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_95383a931af1,
  @SummaryDescription = @SummaryDescription_95383a931af1,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_95383a931af1,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_95383a931af1,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_95383a931af1,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_95383a931af1,
  @SourceObjectName = @SourceObjectName_95383a931af1,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_f133eb6c1818 UNIQUEIDENTIFIER,
@QueryID_f133eb6c1818 UNIQUEIDENTIFIER,
@Name_f133eb6c1818 NVARCHAR(255),
@Description_f133eb6c1818 NVARCHAR(MAX),
@Sequence_f133eb6c1818 INT,
@SQLBaseType_f133eb6c1818 NVARCHAR(50),
@SQLFullType_f133eb6c1818 NVARCHAR(100),
@SourceEntityID_f133eb6c1818 UNIQUEIDENTIFIER,
@SourceFieldName_f133eb6c1818 NVARCHAR(255),
@IsComputed_f133eb6c1818 BIT,
@ComputationDescription_f133eb6c1818 NVARCHAR(MAX),
@IsSummary_f133eb6c1818 BIT,
@SummaryDescription_f133eb6c1818 NVARCHAR(MAX),
@DetectionMethod_f133eb6c1818 NVARCHAR(50),
@AutoDetectConfidenceScore_f133eb6c1818 DECIMAL(3, 2),
@SourceEntityFieldID_f133eb6c1818 UNIQUEIDENTIFIER,
@IsNullable_f133eb6c1818 BIT,
@SourceObjectName_f133eb6c1818 NVARCHAR(500)
SET
  @ID_f133eb6c1818 = '6c53716d-96bd-481e-8a43-f1c2a4305853'
SET
  @QueryID_f133eb6c1818 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_f133eb6c1818 = N'LastSubmittedAt'
SET
  @Sequence_f133eb6c1818 = 6
SET
  @SQLBaseType_f133eb6c1818 = N'datetimeoffset'
SET
  @SQLFullType_f133eb6c1818 = N'datetimeoffset(7)'
SET
  @IsComputed_f133eb6c1818 = 1
SET
  @IsSummary_f133eb6c1818 = 0
SET
  @DetectionMethod_f133eb6c1818 = N'Database'
SET
  @IsNullable_f133eb6c1818 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_f133eb6c1818
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_f133eb6c1818,
  @QueryID = @QueryID_f133eb6c1818,
  @Name = @Name_f133eb6c1818,
  @Description = @Description_f133eb6c1818,
  @Description_Clear = 1,
  @Sequence = @Sequence_f133eb6c1818,
  @SQLBaseType = @SQLBaseType_f133eb6c1818,
  @SQLFullType = @SQLFullType_f133eb6c1818,
  @SourceEntityID = @SourceEntityID_f133eb6c1818,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_f133eb6c1818,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_f133eb6c1818,
  @ComputationDescription = @ComputationDescription_f133eb6c1818,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_f133eb6c1818,
  @SummaryDescription = @SummaryDescription_f133eb6c1818,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_f133eb6c1818,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_f133eb6c1818,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_f133eb6c1818,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_f133eb6c1818,
  @SourceObjectName = @SourceObjectName_f133eb6c1818,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_f133eb6c1818,
  @QueryID = @QueryID_f133eb6c1818,
  @Name = @Name_f133eb6c1818,
  @Description = @Description_f133eb6c1818,
  @Description_Clear = 1,
  @Sequence = @Sequence_f133eb6c1818,
  @SQLBaseType = @SQLBaseType_f133eb6c1818,
  @SQLFullType = @SQLFullType_f133eb6c1818,
  @SourceEntityID = @SourceEntityID_f133eb6c1818,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_f133eb6c1818,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_f133eb6c1818,
  @ComputationDescription = @ComputationDescription_f133eb6c1818,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_f133eb6c1818,
  @SummaryDescription = @SummaryDescription_f133eb6c1818,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_f133eb6c1818,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_f133eb6c1818,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_f133eb6c1818,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_f133eb6c1818,
  @SourceObjectName = @SourceObjectName_f133eb6c1818,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_fb60b4ed7767 UNIQUEIDENTIFIER,
@QueryID_fb60b4ed7767 UNIQUEIDENTIFIER,
@Name_fb60b4ed7767 NVARCHAR(255),
@Type_fb60b4ed7767 NVARCHAR(50),
@IsRequired_fb60b4ed7767 BIT,
@DefaultValue_fb60b4ed7767 NVARCHAR(MAX),
@Description_fb60b4ed7767 NVARCHAR(MAX),
@SampleValue_fb60b4ed7767 NVARCHAR(MAX),
@ValidationFilters_fb60b4ed7767 NVARCHAR(MAX),
@DetectionMethod_fb60b4ed7767 NVARCHAR(50),
@AutoDetectConfidenceScore_fb60b4ed7767 DECIMAL(3, 2),
@IsServerSet_fb60b4ed7767 BIT
SET
  @ID_fb60b4ed7767 = '5669dfbb-93e5-4041-8bce-d331b025c592'
SET
  @QueryID_fb60b4ed7767 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_fb60b4ed7767 = N'FormID'
SET
  @Type_fb60b4ed7767 = N'string'
SET
  @IsRequired_fb60b4ed7767 = 1
SET
  @DetectionMethod_fb60b4ed7767 = N'Parser'
SET
  @IsServerSet_fb60b4ed7767 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_fb60b4ed7767
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_fb60b4ed7767,
  @QueryID = @QueryID_fb60b4ed7767,
  @Name = @Name_fb60b4ed7767,
  @Type = @Type_fb60b4ed7767,
  @IsRequired = @IsRequired_fb60b4ed7767,
  @DefaultValue = @DefaultValue_fb60b4ed7767,
  @DefaultValue_Clear = 1,
  @Description = @Description_fb60b4ed7767,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_fb60b4ed7767,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_fb60b4ed7767,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_fb60b4ed7767,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_fb60b4ed7767,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_fb60b4ed7767
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_fb60b4ed7767,
  @QueryID = @QueryID_fb60b4ed7767,
  @Name = @Name_fb60b4ed7767,
  @Type = @Type_fb60b4ed7767,
  @IsRequired = @IsRequired_fb60b4ed7767,
  @DefaultValue = @DefaultValue_fb60b4ed7767,
  @DefaultValue_Clear = 1,
  @Description = @Description_fb60b4ed7767,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_fb60b4ed7767,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_fb60b4ed7767,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_fb60b4ed7767,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_fb60b4ed7767,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_fb60b4ed7767
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_4e43225a7105 UNIQUEIDENTIFIER,
@QueryID_4e43225a7105 UNIQUEIDENTIFIER,
@Name_4e43225a7105 NVARCHAR(255),
@Type_4e43225a7105 NVARCHAR(50),
@IsRequired_4e43225a7105 BIT,
@DefaultValue_4e43225a7105 NVARCHAR(MAX),
@Description_4e43225a7105 NVARCHAR(MAX),
@SampleValue_4e43225a7105 NVARCHAR(MAX),
@ValidationFilters_4e43225a7105 NVARCHAR(MAX),
@DetectionMethod_4e43225a7105 NVARCHAR(50),
@AutoDetectConfidenceScore_4e43225a7105 DECIMAL(3, 2),
@IsServerSet_4e43225a7105 BIT
SET
  @ID_4e43225a7105 = '7ef57c7b-b5d8-4956-94d3-25aa3221655e'
SET
  @QueryID_4e43225a7105 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @Name_4e43225a7105 = N'FormVersionID'
SET
  @Type_4e43225a7105 = N'string'
SET
  @IsRequired_4e43225a7105 = 0
SET
  @DetectionMethod_4e43225a7105 = N'Parser'
SET
  @IsServerSet_4e43225a7105 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_4e43225a7105
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_4e43225a7105,
  @QueryID = @QueryID_4e43225a7105,
  @Name = @Name_4e43225a7105,
  @Type = @Type_4e43225a7105,
  @IsRequired = @IsRequired_4e43225a7105,
  @DefaultValue = @DefaultValue_4e43225a7105,
  @DefaultValue_Clear = 1,
  @Description = @Description_4e43225a7105,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_4e43225a7105,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_4e43225a7105,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_4e43225a7105,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4e43225a7105,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_4e43225a7105
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_4e43225a7105,
  @QueryID = @QueryID_4e43225a7105,
  @Name = @Name_4e43225a7105,
  @Type = @Type_4e43225a7105,
  @IsRequired = @IsRequired_4e43225a7105,
  @DefaultValue = @DefaultValue_4e43225a7105,
  @DefaultValue_Clear = 1,
  @Description = @Description_4e43225a7105,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_4e43225a7105,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_4e43225a7105,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_4e43225a7105,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4e43225a7105,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_4e43225a7105
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_c47dc92f0ad8 UNIQUEIDENTIFIER,
@QueryID_c47dc92f0ad8 UNIQUEIDENTIFIER,
@EntityID_c47dc92f0ad8 UNIQUEIDENTIFIER,
@DetectionMethod_c47dc92f0ad8 NVARCHAR(50),
@AutoDetectConfidenceScore_c47dc92f0ad8 DECIMAL(3, 2),
@AlternateBaseViewID_c47dc92f0ad8 UNIQUEIDENTIFIER
SET
  @ID_c47dc92f0ad8 = 'fe196a4e-223a-47aa-8398-2448bbb08902'
SET
  @QueryID_c47dc92f0ad8 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @EntityID_c47dc92f0ad8 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_c47dc92f0ad8 = N'Parser'
SET
  @AutoDetectConfidenceScore_c47dc92f0ad8 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_c47dc92f0ad8
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_c47dc92f0ad8,
  @QueryID = @QueryID_c47dc92f0ad8,
  @EntityID = @EntityID_c47dc92f0ad8,
  @DetectionMethod = @DetectionMethod_c47dc92f0ad8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_c47dc92f0ad8,
  @AlternateBaseViewID = @AlternateBaseViewID_c47dc92f0ad8,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_c47dc92f0ad8,
  @QueryID = @QueryID_c47dc92f0ad8,
  @EntityID = @EntityID_c47dc92f0ad8,
  @DetectionMethod = @DetectionMethod_c47dc92f0ad8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_c47dc92f0ad8,
  @AlternateBaseViewID = @AlternateBaseViewID_c47dc92f0ad8,
  @AlternateBaseViewID_Clear = 1
END;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ApprovedFingerprint_cb06fe6f2bf3 NVARCHAR(100),
@ID_cb06fe6f2bf3 UNIQUEIDENTIFIER
SET
  @ApprovedFingerprint_cb06fe6f2bf3 = N'd9c7d791123959e1de646a607b3a25d75c516d15f5c57fbe441b02383e9c6eb6'
SET
  @ID_cb06fe6f2bf3 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC' EXEC [${mjSchema}].spUpdateQuery @ApprovedFingerprint = @ApprovedFingerprint_cb06fe6f2bf3,
  @ID = @ID_cb06fe6f2bf3;

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
@IsMaterialized_d181d21344e2 BIT,
@Configuration_d181d21344e2 NVARCHAR(MAX),
@EmbeddingVectorBinary_d181d21344e2 VARBINARY(MAX),
@ApprovalComments_d181d21344e2 NVARCHAR(MAX),
@ApprovedByUserID_d181d21344e2 UNIQUEIDENTIFIER,
@ApprovedAt_d181d21344e2 DATETIMEOFFSET,
@ApprovedFingerprint_d181d21344e2 NVARCHAR(100),
@ExtractedSQLHash_d181d21344e2 NVARCHAR(64),
@ExtractionStatus_d181d21344e2 NVARCHAR(20),
@ExtractionMessage_d181d21344e2 NVARCHAR(MAX)
SET
  @ID_d181d21344e2 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_d181d21344e2 = N'Forms: Question Answer Value Counts'
SET
  @CategoryID_d181d21344e2 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[QueryCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
    FROM [${flyway:defaultSchema}].[vwFormResponses] r
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
    FROM [${flyway:defaultSchema}].[vwFormResponseAnswers] a
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
  @Reusable_d181d21344e2 = 0
SET
  @IsMaterialized_d181d21344e2 = 0
SET
  @ApprovedByUserID_d181d21344e2 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @ApprovedAt_d181d21344e2 = '2026-11-05T03:12:20.011Z'
SET
  @ExtractedSQLHash_d181d21344e2 = N'37bc88e2c8ae0aa9b75e1e913b959929640aaf04d42ac9d76a7105384411e96e'
SET
  @ExtractionStatus_d181d21344e2 = N'OK' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[Query]
    WHERE
      [ID] = @ID_d181d21344e2
  )
BEGIN
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_d181d21344e2,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_d181d21344e2,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_d181d21344e2,
  @Reusable = @Reusable_d181d21344e2,
  @ExternalDataSourceID = @ExternalDataSourceID_d181d21344e2,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_d181d21344e2,
  @Configuration = @Configuration_d181d21344e2,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_d181d21344e2,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_d181d21344e2,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_d181d21344e2,
  @ApprovedAt = @ApprovedAt_d181d21344e2,
  @ApprovedFingerprint = @ApprovedFingerprint_d181d21344e2,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_d181d21344e2,
  @ExtractionStatus = @ExtractionStatus_d181d21344e2,
  @ExtractionMessage = @ExtractionMessage_d181d21344e2,
  @ExtractionMessage_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQuery @ID = @ID_d181d21344e2,
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_d181d21344e2,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_d181d21344e2,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_d181d21344e2,
  @Reusable = @Reusable_d181d21344e2,
  @ExternalDataSourceID = @ExternalDataSourceID_d181d21344e2,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_d181d21344e2,
  @Configuration = @Configuration_d181d21344e2,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_d181d21344e2,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_d181d21344e2,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_d181d21344e2,
  @ApprovedAt = @ApprovedAt_d181d21344e2,
  @ApprovedFingerprint = @ApprovedFingerprint_d181d21344e2,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_d181d21344e2,
  @ExtractionStatus = @ExtractionStatus_d181d21344e2,
  @ExtractionMessage = @ExtractionMessage_d181d21344e2,
  @ExtractionMessage_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_5536e0dc5fea UNIQUEIDENTIFIER,
@QueryID_5536e0dc5fea UNIQUEIDENTIFIER,
@Name_5536e0dc5fea NVARCHAR(255),
@Description_5536e0dc5fea NVARCHAR(MAX),
@Sequence_5536e0dc5fea INT,
@SQLBaseType_5536e0dc5fea NVARCHAR(50),
@SQLFullType_5536e0dc5fea NVARCHAR(100),
@SourceEntityID_5536e0dc5fea UNIQUEIDENTIFIER,
@SourceFieldName_5536e0dc5fea NVARCHAR(255),
@IsComputed_5536e0dc5fea BIT,
@ComputationDescription_5536e0dc5fea NVARCHAR(MAX),
@IsSummary_5536e0dc5fea BIT,
@SummaryDescription_5536e0dc5fea NVARCHAR(MAX),
@DetectionMethod_5536e0dc5fea NVARCHAR(50),
@AutoDetectConfidenceScore_5536e0dc5fea DECIMAL(3, 2),
@SourceEntityFieldID_5536e0dc5fea UNIQUEIDENTIFIER,
@IsNullable_5536e0dc5fea BIT,
@SourceObjectName_5536e0dc5fea NVARCHAR(500)
SET
  @ID_5536e0dc5fea = '9ebae504-0019-4814-aa9c-01f964b1b839'
SET
  @QueryID_5536e0dc5fea = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_5536e0dc5fea = N'QuestionID'
SET
  @Sequence_5536e0dc5fea = 1
SET
  @SQLBaseType_5536e0dc5fea = N'uniqueidentifier'
SET
  @SQLFullType_5536e0dc5fea = N'uniqueidentifier'
SET
  @IsComputed_5536e0dc5fea = 1
SET
  @IsSummary_5536e0dc5fea = 0
SET
  @DetectionMethod_5536e0dc5fea = N'Database'
SET
  @IsNullable_5536e0dc5fea = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_5536e0dc5fea
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_5536e0dc5fea,
  @QueryID = @QueryID_5536e0dc5fea,
  @Name = @Name_5536e0dc5fea,
  @Description = @Description_5536e0dc5fea,
  @Description_Clear = 1,
  @Sequence = @Sequence_5536e0dc5fea,
  @SQLBaseType = @SQLBaseType_5536e0dc5fea,
  @SQLFullType = @SQLFullType_5536e0dc5fea,
  @SourceEntityID = @SourceEntityID_5536e0dc5fea,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_5536e0dc5fea,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_5536e0dc5fea,
  @ComputationDescription = @ComputationDescription_5536e0dc5fea,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_5536e0dc5fea,
  @SummaryDescription = @SummaryDescription_5536e0dc5fea,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_5536e0dc5fea,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_5536e0dc5fea,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_5536e0dc5fea,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_5536e0dc5fea,
  @SourceObjectName = @SourceObjectName_5536e0dc5fea,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_5536e0dc5fea,
  @QueryID = @QueryID_5536e0dc5fea,
  @Name = @Name_5536e0dc5fea,
  @Description = @Description_5536e0dc5fea,
  @Description_Clear = 1,
  @Sequence = @Sequence_5536e0dc5fea,
  @SQLBaseType = @SQLBaseType_5536e0dc5fea,
  @SQLFullType = @SQLFullType_5536e0dc5fea,
  @SourceEntityID = @SourceEntityID_5536e0dc5fea,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_5536e0dc5fea,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_5536e0dc5fea,
  @ComputationDescription = @ComputationDescription_5536e0dc5fea,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_5536e0dc5fea,
  @SummaryDescription = @SummaryDescription_5536e0dc5fea,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_5536e0dc5fea,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_5536e0dc5fea,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_5536e0dc5fea,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_5536e0dc5fea,
  @SourceObjectName = @SourceObjectName_5536e0dc5fea,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_8b840164046b UNIQUEIDENTIFIER,
@QueryID_8b840164046b UNIQUEIDENTIFIER,
@Name_8b840164046b NVARCHAR(255),
@Description_8b840164046b NVARCHAR(MAX),
@Sequence_8b840164046b INT,
@SQLBaseType_8b840164046b NVARCHAR(50),
@SQLFullType_8b840164046b NVARCHAR(100),
@SourceEntityID_8b840164046b UNIQUEIDENTIFIER,
@SourceFieldName_8b840164046b NVARCHAR(255),
@IsComputed_8b840164046b BIT,
@ComputationDescription_8b840164046b NVARCHAR(MAX),
@IsSummary_8b840164046b BIT,
@SummaryDescription_8b840164046b NVARCHAR(MAX),
@DetectionMethod_8b840164046b NVARCHAR(50),
@AutoDetectConfidenceScore_8b840164046b DECIMAL(3, 2),
@SourceEntityFieldID_8b840164046b UNIQUEIDENTIFIER,
@IsNullable_8b840164046b BIT,
@SourceObjectName_8b840164046b NVARCHAR(500)
SET
  @ID_8b840164046b = 'e0a9a4cd-30cc-43dc-963e-e6f5ccf73bc9'
SET
  @QueryID_8b840164046b = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_8b840164046b = N'AnsweredResponses'
SET
  @Sequence_8b840164046b = 2
SET
  @SQLBaseType_8b840164046b = N'int'
SET
  @SQLFullType_8b840164046b = N'int'
SET
  @IsComputed_8b840164046b = 1
SET
  @IsSummary_8b840164046b = 0
SET
  @DetectionMethod_8b840164046b = N'Database'
SET
  @IsNullable_8b840164046b = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_8b840164046b
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_8b840164046b,
  @QueryID = @QueryID_8b840164046b,
  @Name = @Name_8b840164046b,
  @Description = @Description_8b840164046b,
  @Description_Clear = 1,
  @Sequence = @Sequence_8b840164046b,
  @SQLBaseType = @SQLBaseType_8b840164046b,
  @SQLFullType = @SQLFullType_8b840164046b,
  @SourceEntityID = @SourceEntityID_8b840164046b,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_8b840164046b,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_8b840164046b,
  @ComputationDescription = @ComputationDescription_8b840164046b,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_8b840164046b,
  @SummaryDescription = @SummaryDescription_8b840164046b,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_8b840164046b,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_8b840164046b,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_8b840164046b,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_8b840164046b,
  @SourceObjectName = @SourceObjectName_8b840164046b,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_8b840164046b,
  @QueryID = @QueryID_8b840164046b,
  @Name = @Name_8b840164046b,
  @Description = @Description_8b840164046b,
  @Description_Clear = 1,
  @Sequence = @Sequence_8b840164046b,
  @SQLBaseType = @SQLBaseType_8b840164046b,
  @SQLFullType = @SQLFullType_8b840164046b,
  @SourceEntityID = @SourceEntityID_8b840164046b,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_8b840164046b,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_8b840164046b,
  @ComputationDescription = @ComputationDescription_8b840164046b,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_8b840164046b,
  @SummaryDescription = @SummaryDescription_8b840164046b,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_8b840164046b,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_8b840164046b,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_8b840164046b,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_8b840164046b,
  @SourceObjectName = @SourceObjectName_8b840164046b,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_29732f670d03 UNIQUEIDENTIFIER,
@QueryID_29732f670d03 UNIQUEIDENTIFIER,
@Name_29732f670d03 NVARCHAR(255),
@Description_29732f670d03 NVARCHAR(MAX),
@Sequence_29732f670d03 INT,
@SQLBaseType_29732f670d03 NVARCHAR(50),
@SQLFullType_29732f670d03 NVARCHAR(100),
@SourceEntityID_29732f670d03 UNIQUEIDENTIFIER,
@SourceFieldName_29732f670d03 NVARCHAR(255),
@IsComputed_29732f670d03 BIT,
@ComputationDescription_29732f670d03 NVARCHAR(MAX),
@IsSummary_29732f670d03 BIT,
@SummaryDescription_29732f670d03 NVARCHAR(MAX),
@DetectionMethod_29732f670d03 NVARCHAR(50),
@AutoDetectConfidenceScore_29732f670d03 DECIMAL(3, 2),
@SourceEntityFieldID_29732f670d03 UNIQUEIDENTIFIER,
@IsNullable_29732f670d03 BIT,
@SourceObjectName_29732f670d03 NVARCHAR(500)
SET
  @ID_29732f670d03 = '105c0101-bbf5-42eb-8f59-96798b0747e1'
SET
  @QueryID_29732f670d03 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_29732f670d03 = N'ValueKind'
SET
  @Sequence_29732f670d03 = 3
SET
  @SQLBaseType_29732f670d03 = N'nvarchar'
SET
  @SQLFullType_29732f670d03 = N'nvarchar(7)'
SET
  @IsComputed_29732f670d03 = 1
SET
  @IsSummary_29732f670d03 = 0
SET
  @DetectionMethod_29732f670d03 = N'Database'
SET
  @IsNullable_29732f670d03 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_29732f670d03
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_29732f670d03,
  @QueryID = @QueryID_29732f670d03,
  @Name = @Name_29732f670d03,
  @Description = @Description_29732f670d03,
  @Description_Clear = 1,
  @Sequence = @Sequence_29732f670d03,
  @SQLBaseType = @SQLBaseType_29732f670d03,
  @SQLFullType = @SQLFullType_29732f670d03,
  @SourceEntityID = @SourceEntityID_29732f670d03,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_29732f670d03,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_29732f670d03,
  @ComputationDescription = @ComputationDescription_29732f670d03,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_29732f670d03,
  @SummaryDescription = @SummaryDescription_29732f670d03,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_29732f670d03,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_29732f670d03,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_29732f670d03,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_29732f670d03,
  @SourceObjectName = @SourceObjectName_29732f670d03,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_29732f670d03,
  @QueryID = @QueryID_29732f670d03,
  @Name = @Name_29732f670d03,
  @Description = @Description_29732f670d03,
  @Description_Clear = 1,
  @Sequence = @Sequence_29732f670d03,
  @SQLBaseType = @SQLBaseType_29732f670d03,
  @SQLFullType = @SQLFullType_29732f670d03,
  @SourceEntityID = @SourceEntityID_29732f670d03,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_29732f670d03,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_29732f670d03,
  @ComputationDescription = @ComputationDescription_29732f670d03,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_29732f670d03,
  @SummaryDescription = @SummaryDescription_29732f670d03,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_29732f670d03,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_29732f670d03,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_29732f670d03,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_29732f670d03,
  @SourceObjectName = @SourceObjectName_29732f670d03,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_ccdc0c34f109 UNIQUEIDENTIFIER,
@QueryID_ccdc0c34f109 UNIQUEIDENTIFIER,
@Name_ccdc0c34f109 NVARCHAR(255),
@Description_ccdc0c34f109 NVARCHAR(MAX),
@Sequence_ccdc0c34f109 INT,
@SQLBaseType_ccdc0c34f109 NVARCHAR(50),
@SQLFullType_ccdc0c34f109 NVARCHAR(100),
@SourceEntityID_ccdc0c34f109 UNIQUEIDENTIFIER,
@SourceFieldName_ccdc0c34f109 NVARCHAR(255),
@IsComputed_ccdc0c34f109 BIT,
@ComputationDescription_ccdc0c34f109 NVARCHAR(MAX),
@IsSummary_ccdc0c34f109 BIT,
@SummaryDescription_ccdc0c34f109 NVARCHAR(MAX),
@DetectionMethod_ccdc0c34f109 NVARCHAR(50),
@AutoDetectConfidenceScore_ccdc0c34f109 DECIMAL(3, 2),
@SourceEntityFieldID_ccdc0c34f109 UNIQUEIDENTIFIER,
@IsNullable_ccdc0c34f109 BIT,
@SourceObjectName_ccdc0c34f109 NVARCHAR(500)
SET
  @ID_ccdc0c34f109 = '75259ca6-221f-41b1-9f67-c40a68617855'
SET
  @QueryID_ccdc0c34f109 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_ccdc0c34f109 = N'Value'
SET
  @Sequence_ccdc0c34f109 = 4
SET
  @SQLBaseType_ccdc0c34f109 = N'nvarchar'
SET
  @SQLFullType_ccdc0c34f109 = N'nvarchar(max)'
SET
  @IsComputed_ccdc0c34f109 = 1
SET
  @IsSummary_ccdc0c34f109 = 0
SET
  @DetectionMethod_ccdc0c34f109 = N'Database'
SET
  @IsNullable_ccdc0c34f109 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_ccdc0c34f109
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_ccdc0c34f109,
  @QueryID = @QueryID_ccdc0c34f109,
  @Name = @Name_ccdc0c34f109,
  @Description = @Description_ccdc0c34f109,
  @Description_Clear = 1,
  @Sequence = @Sequence_ccdc0c34f109,
  @SQLBaseType = @SQLBaseType_ccdc0c34f109,
  @SQLFullType = @SQLFullType_ccdc0c34f109,
  @SourceEntityID = @SourceEntityID_ccdc0c34f109,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_ccdc0c34f109,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_ccdc0c34f109,
  @ComputationDescription = @ComputationDescription_ccdc0c34f109,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_ccdc0c34f109,
  @SummaryDescription = @SummaryDescription_ccdc0c34f109,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_ccdc0c34f109,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_ccdc0c34f109,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_ccdc0c34f109,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_ccdc0c34f109,
  @SourceObjectName = @SourceObjectName_ccdc0c34f109,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_ccdc0c34f109,
  @QueryID = @QueryID_ccdc0c34f109,
  @Name = @Name_ccdc0c34f109,
  @Description = @Description_ccdc0c34f109,
  @Description_Clear = 1,
  @Sequence = @Sequence_ccdc0c34f109,
  @SQLBaseType = @SQLBaseType_ccdc0c34f109,
  @SQLFullType = @SQLFullType_ccdc0c34f109,
  @SourceEntityID = @SourceEntityID_ccdc0c34f109,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_ccdc0c34f109,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_ccdc0c34f109,
  @ComputationDescription = @ComputationDescription_ccdc0c34f109,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_ccdc0c34f109,
  @SummaryDescription = @SummaryDescription_ccdc0c34f109,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_ccdc0c34f109,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_ccdc0c34f109,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_ccdc0c34f109,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_ccdc0c34f109,
  @SourceObjectName = @SourceObjectName_ccdc0c34f109,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_7ba1b2a93fdb UNIQUEIDENTIFIER,
@QueryID_7ba1b2a93fdb UNIQUEIDENTIFIER,
@Name_7ba1b2a93fdb NVARCHAR(255),
@Description_7ba1b2a93fdb NVARCHAR(MAX),
@Sequence_7ba1b2a93fdb INT,
@SQLBaseType_7ba1b2a93fdb NVARCHAR(50),
@SQLFullType_7ba1b2a93fdb NVARCHAR(100),
@SourceEntityID_7ba1b2a93fdb UNIQUEIDENTIFIER,
@SourceFieldName_7ba1b2a93fdb NVARCHAR(255),
@IsComputed_7ba1b2a93fdb BIT,
@ComputationDescription_7ba1b2a93fdb NVARCHAR(MAX),
@IsSummary_7ba1b2a93fdb BIT,
@SummaryDescription_7ba1b2a93fdb NVARCHAR(MAX),
@DetectionMethod_7ba1b2a93fdb NVARCHAR(50),
@AutoDetectConfidenceScore_7ba1b2a93fdb DECIMAL(3, 2),
@SourceEntityFieldID_7ba1b2a93fdb UNIQUEIDENTIFIER,
@IsNullable_7ba1b2a93fdb BIT,
@SourceObjectName_7ba1b2a93fdb NVARCHAR(500)
SET
  @ID_7ba1b2a93fdb = '1e91e652-31b5-476b-aab2-e9ebc162f4aa'
SET
  @QueryID_7ba1b2a93fdb = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_7ba1b2a93fdb = N'NumericValue'
SET
  @Sequence_7ba1b2a93fdb = 5
SET
  @SQLBaseType_7ba1b2a93fdb = N'decimal'
SET
  @SQLFullType_7ba1b2a93fdb = N'decimal(18,4)'
SET
  @IsComputed_7ba1b2a93fdb = 1
SET
  @IsSummary_7ba1b2a93fdb = 0
SET
  @DetectionMethod_7ba1b2a93fdb = N'Database'
SET
  @IsNullable_7ba1b2a93fdb = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_7ba1b2a93fdb
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_7ba1b2a93fdb,
  @QueryID = @QueryID_7ba1b2a93fdb,
  @Name = @Name_7ba1b2a93fdb,
  @Description = @Description_7ba1b2a93fdb,
  @Description_Clear = 1,
  @Sequence = @Sequence_7ba1b2a93fdb,
  @SQLBaseType = @SQLBaseType_7ba1b2a93fdb,
  @SQLFullType = @SQLFullType_7ba1b2a93fdb,
  @SourceEntityID = @SourceEntityID_7ba1b2a93fdb,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_7ba1b2a93fdb,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_7ba1b2a93fdb,
  @ComputationDescription = @ComputationDescription_7ba1b2a93fdb,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_7ba1b2a93fdb,
  @SummaryDescription = @SummaryDescription_7ba1b2a93fdb,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_7ba1b2a93fdb,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_7ba1b2a93fdb,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_7ba1b2a93fdb,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_7ba1b2a93fdb,
  @SourceObjectName = @SourceObjectName_7ba1b2a93fdb,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_7ba1b2a93fdb,
  @QueryID = @QueryID_7ba1b2a93fdb,
  @Name = @Name_7ba1b2a93fdb,
  @Description = @Description_7ba1b2a93fdb,
  @Description_Clear = 1,
  @Sequence = @Sequence_7ba1b2a93fdb,
  @SQLBaseType = @SQLBaseType_7ba1b2a93fdb,
  @SQLFullType = @SQLFullType_7ba1b2a93fdb,
  @SourceEntityID = @SourceEntityID_7ba1b2a93fdb,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_7ba1b2a93fdb,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_7ba1b2a93fdb,
  @ComputationDescription = @ComputationDescription_7ba1b2a93fdb,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_7ba1b2a93fdb,
  @SummaryDescription = @SummaryDescription_7ba1b2a93fdb,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_7ba1b2a93fdb,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_7ba1b2a93fdb,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_7ba1b2a93fdb,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_7ba1b2a93fdb,
  @SourceObjectName = @SourceObjectName_7ba1b2a93fdb,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_3f47202490a8 UNIQUEIDENTIFIER,
@QueryID_3f47202490a8 UNIQUEIDENTIFIER,
@Name_3f47202490a8 NVARCHAR(255),
@Description_3f47202490a8 NVARCHAR(MAX),
@Sequence_3f47202490a8 INT,
@SQLBaseType_3f47202490a8 NVARCHAR(50),
@SQLFullType_3f47202490a8 NVARCHAR(100),
@SourceEntityID_3f47202490a8 UNIQUEIDENTIFIER,
@SourceFieldName_3f47202490a8 NVARCHAR(255),
@IsComputed_3f47202490a8 BIT,
@ComputationDescription_3f47202490a8 NVARCHAR(MAX),
@IsSummary_3f47202490a8 BIT,
@SummaryDescription_3f47202490a8 NVARCHAR(MAX),
@DetectionMethod_3f47202490a8 NVARCHAR(50),
@AutoDetectConfidenceScore_3f47202490a8 DECIMAL(3, 2),
@SourceEntityFieldID_3f47202490a8 UNIQUEIDENTIFIER,
@IsNullable_3f47202490a8 BIT,
@SourceObjectName_3f47202490a8 NVARCHAR(500)
SET
  @ID_3f47202490a8 = '845b37af-cd09-4d7a-bece-a795bb6a8740'
SET
  @QueryID_3f47202490a8 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_3f47202490a8 = N'ValueCount'
SET
  @Sequence_3f47202490a8 = 6
SET
  @SQLBaseType_3f47202490a8 = N'int'
SET
  @SQLFullType_3f47202490a8 = N'int'
SET
  @IsComputed_3f47202490a8 = 1
SET
  @IsSummary_3f47202490a8 = 0
SET
  @DetectionMethod_3f47202490a8 = N'Database'
SET
  @IsNullable_3f47202490a8 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_3f47202490a8
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_3f47202490a8,
  @QueryID = @QueryID_3f47202490a8,
  @Name = @Name_3f47202490a8,
  @Description = @Description_3f47202490a8,
  @Description_Clear = 1,
  @Sequence = @Sequence_3f47202490a8,
  @SQLBaseType = @SQLBaseType_3f47202490a8,
  @SQLFullType = @SQLFullType_3f47202490a8,
  @SourceEntityID = @SourceEntityID_3f47202490a8,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_3f47202490a8,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_3f47202490a8,
  @ComputationDescription = @ComputationDescription_3f47202490a8,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_3f47202490a8,
  @SummaryDescription = @SummaryDescription_3f47202490a8,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_3f47202490a8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_3f47202490a8,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_3f47202490a8,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_3f47202490a8,
  @SourceObjectName = @SourceObjectName_3f47202490a8,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_3f47202490a8,
  @QueryID = @QueryID_3f47202490a8,
  @Name = @Name_3f47202490a8,
  @Description = @Description_3f47202490a8,
  @Description_Clear = 1,
  @Sequence = @Sequence_3f47202490a8,
  @SQLBaseType = @SQLBaseType_3f47202490a8,
  @SQLFullType = @SQLFullType_3f47202490a8,
  @SourceEntityID = @SourceEntityID_3f47202490a8,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_3f47202490a8,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_3f47202490a8,
  @ComputationDescription = @ComputationDescription_3f47202490a8,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_3f47202490a8,
  @SummaryDescription = @SummaryDescription_3f47202490a8,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_3f47202490a8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_3f47202490a8,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_3f47202490a8,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_3f47202490a8,
  @SourceObjectName = @SourceObjectName_3f47202490a8,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_bcde681a74e8 UNIQUEIDENTIFIER,
@QueryID_bcde681a74e8 UNIQUEIDENTIFIER,
@Name_bcde681a74e8 NVARCHAR(255),
@Type_bcde681a74e8 NVARCHAR(50),
@IsRequired_bcde681a74e8 BIT,
@DefaultValue_bcde681a74e8 NVARCHAR(MAX),
@Description_bcde681a74e8 NVARCHAR(MAX),
@SampleValue_bcde681a74e8 NVARCHAR(MAX),
@ValidationFilters_bcde681a74e8 NVARCHAR(MAX),
@DetectionMethod_bcde681a74e8 NVARCHAR(50),
@AutoDetectConfidenceScore_bcde681a74e8 DECIMAL(3, 2),
@IsServerSet_bcde681a74e8 BIT
SET
  @ID_bcde681a74e8 = 'ad97d8d3-4b7b-440d-875e-2a04b4cb7aeb'
SET
  @QueryID_bcde681a74e8 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_bcde681a74e8 = N'FormID'
SET
  @Type_bcde681a74e8 = N'string'
SET
  @IsRequired_bcde681a74e8 = 1
SET
  @DetectionMethod_bcde681a74e8 = N'Parser'
SET
  @IsServerSet_bcde681a74e8 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_bcde681a74e8
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_bcde681a74e8,
  @QueryID = @QueryID_bcde681a74e8,
  @Name = @Name_bcde681a74e8,
  @Type = @Type_bcde681a74e8,
  @IsRequired = @IsRequired_bcde681a74e8,
  @DefaultValue = @DefaultValue_bcde681a74e8,
  @DefaultValue_Clear = 1,
  @Description = @Description_bcde681a74e8,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_bcde681a74e8,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_bcde681a74e8,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_bcde681a74e8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_bcde681a74e8,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_bcde681a74e8
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_bcde681a74e8,
  @QueryID = @QueryID_bcde681a74e8,
  @Name = @Name_bcde681a74e8,
  @Type = @Type_bcde681a74e8,
  @IsRequired = @IsRequired_bcde681a74e8,
  @DefaultValue = @DefaultValue_bcde681a74e8,
  @DefaultValue_Clear = 1,
  @Description = @Description_bcde681a74e8,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_bcde681a74e8,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_bcde681a74e8,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_bcde681a74e8,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_bcde681a74e8,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_bcde681a74e8
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_a409a701b022 UNIQUEIDENTIFIER,
@QueryID_a409a701b022 UNIQUEIDENTIFIER,
@Name_a409a701b022 NVARCHAR(255),
@Type_a409a701b022 NVARCHAR(50),
@IsRequired_a409a701b022 BIT,
@DefaultValue_a409a701b022 NVARCHAR(MAX),
@Description_a409a701b022 NVARCHAR(MAX),
@SampleValue_a409a701b022 NVARCHAR(MAX),
@ValidationFilters_a409a701b022 NVARCHAR(MAX),
@DetectionMethod_a409a701b022 NVARCHAR(50),
@AutoDetectConfidenceScore_a409a701b022 DECIMAL(3, 2),
@IsServerSet_a409a701b022 BIT
SET
  @ID_a409a701b022 = 'bd1a4f78-cf41-4ae3-a410-afe84b2db78b'
SET
  @QueryID_a409a701b022 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @Name_a409a701b022 = N'FormVersionID'
SET
  @Type_a409a701b022 = N'string'
SET
  @IsRequired_a409a701b022 = 0
SET
  @DetectionMethod_a409a701b022 = N'Parser'
SET
  @IsServerSet_a409a701b022 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_a409a701b022
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_a409a701b022,
  @QueryID = @QueryID_a409a701b022,
  @Name = @Name_a409a701b022,
  @Type = @Type_a409a701b022,
  @IsRequired = @IsRequired_a409a701b022,
  @DefaultValue = @DefaultValue_a409a701b022,
  @DefaultValue_Clear = 1,
  @Description = @Description_a409a701b022,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_a409a701b022,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_a409a701b022,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_a409a701b022,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_a409a701b022,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_a409a701b022
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_a409a701b022,
  @QueryID = @QueryID_a409a701b022,
  @Name = @Name_a409a701b022,
  @Type = @Type_a409a701b022,
  @IsRequired = @IsRequired_a409a701b022,
  @DefaultValue = @DefaultValue_a409a701b022,
  @DefaultValue_Clear = 1,
  @Description = @Description_a409a701b022,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_a409a701b022,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_a409a701b022,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_a409a701b022,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_a409a701b022,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_a409a701b022
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_dbf5904ea850 UNIQUEIDENTIFIER,
@QueryID_dbf5904ea850 UNIQUEIDENTIFIER,
@EntityID_dbf5904ea850 UNIQUEIDENTIFIER,
@DetectionMethod_dbf5904ea850 NVARCHAR(50),
@AutoDetectConfidenceScore_dbf5904ea850 DECIMAL(3, 2),
@AlternateBaseViewID_dbf5904ea850 UNIQUEIDENTIFIER
SET
  @ID_dbf5904ea850 = 'a905403a-f07f-4be7-90d9-fd5eae7dd4a2'
SET
  @QueryID_dbf5904ea850 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @EntityID_dbf5904ea850 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_dbf5904ea850 = N'Parser'
SET
  @AutoDetectConfidenceScore_dbf5904ea850 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_dbf5904ea850
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_dbf5904ea850,
  @QueryID = @QueryID_dbf5904ea850,
  @EntityID = @EntityID_dbf5904ea850,
  @DetectionMethod = @DetectionMethod_dbf5904ea850,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dbf5904ea850,
  @AlternateBaseViewID = @AlternateBaseViewID_dbf5904ea850,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_dbf5904ea850,
  @QueryID = @QueryID_dbf5904ea850,
  @EntityID = @EntityID_dbf5904ea850,
  @DetectionMethod = @DetectionMethod_dbf5904ea850,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dbf5904ea850,
  @AlternateBaseViewID = @AlternateBaseViewID_dbf5904ea850,
  @AlternateBaseViewID_Clear = 1
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_ac6d021b1085 UNIQUEIDENTIFIER,
@QueryID_ac6d021b1085 UNIQUEIDENTIFIER,
@EntityID_ac6d021b1085 UNIQUEIDENTIFIER,
@DetectionMethod_ac6d021b1085 NVARCHAR(50),
@AutoDetectConfidenceScore_ac6d021b1085 DECIMAL(3, 2),
@AlternateBaseViewID_ac6d021b1085 UNIQUEIDENTIFIER
SET
  @ID_ac6d021b1085 = '301fe019-9dcf-4e75-a81a-4feeb47618a0'
SET
  @QueryID_ac6d021b1085 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @EntityID_ac6d021b1085 = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810'
SET
  @DetectionMethod_ac6d021b1085 = N'Parser'
SET
  @AutoDetectConfidenceScore_ac6d021b1085 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_ac6d021b1085
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_ac6d021b1085,
  @QueryID = @QueryID_ac6d021b1085,
  @EntityID = @EntityID_ac6d021b1085,
  @DetectionMethod = @DetectionMethod_ac6d021b1085,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_ac6d021b1085,
  @AlternateBaseViewID = @AlternateBaseViewID_ac6d021b1085,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_ac6d021b1085,
  @QueryID = @QueryID_ac6d021b1085,
  @EntityID = @EntityID_ac6d021b1085,
  @DetectionMethod = @DetectionMethod_ac6d021b1085,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_ac6d021b1085,
  @AlternateBaseViewID = @AlternateBaseViewID_ac6d021b1085,
  @AlternateBaseViewID_Clear = 1
END;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ApprovedFingerprint_d181d21344e2 NVARCHAR(100),
@ID_d181d21344e2 UNIQUEIDENTIFIER
SET
  @ApprovedFingerprint_d181d21344e2 = N'fa95ca1ae48f22a26079b5652faf22d4ff6933f88b04966f4b4d24ce88f37b44'
SET
  @ID_d181d21344e2 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851' EXEC [${mjSchema}].spUpdateQuery @ApprovedFingerprint = @ApprovedFingerprint_d181d21344e2,
  @ID = @ID_d181d21344e2;

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
@IsMaterialized_4729458b1444 BIT,
@Configuration_4729458b1444 NVARCHAR(MAX),
@EmbeddingVectorBinary_4729458b1444 VARBINARY(MAX),
@ApprovalComments_4729458b1444 NVARCHAR(MAX),
@ApprovedByUserID_4729458b1444 UNIQUEIDENTIFIER,
@ApprovedAt_4729458b1444 DATETIMEOFFSET,
@ApprovedFingerprint_4729458b1444 NVARCHAR(100),
@ExtractedSQLHash_4729458b1444 NVARCHAR(64),
@ExtractionStatus_4729458b1444 NVARCHAR(20),
@ExtractionMessage_4729458b1444 NVARCHAR(MAX)
SET
  @ID_4729458b1444 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_4729458b1444 = N'Forms: Page Funnel Reach'
SET
  @CategoryID_4729458b1444 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[QueryCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
    FROM [${flyway:defaultSchema}].[vwFormVersions] v
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
    FROM [${flyway:defaultSchema}].[vwFormResponses] r
    WHERE r.FormID = {{ FormID | sqlString }}
    {% if FormVersionID %}
      AND r.FormVersionID = {{ FormVersionID | sqlString }}
    {% endif %}
),
reached AS (
    SELECT pq.PageID, COUNT(DISTINCT a.ResponseID) AS ReachedCount
    FROM page_questions pq
    INNER JOIN [${flyway:defaultSchema}].[vwFormResponseAnswers] a ON a.QuestionID = pq.QuestionID
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
  @Reusable_4729458b1444 = 0
SET
  @IsMaterialized_4729458b1444 = 0
SET
  @ApprovedByUserID_4729458b1444 = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'
SET
  @ApprovedAt_4729458b1444 = '2026-11-05T03:12:20.190Z'
SET
  @ExtractedSQLHash_4729458b1444 = N'7737f4b32f889f09a7938251b56945ec9fb925fcba56605abf02da75ceb75c70'
SET
  @ExtractionStatus_4729458b1444 = N'OK' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[Query]
    WHERE
      [ID] = @ID_4729458b1444
  )
BEGIN
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_4729458b1444,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_4729458b1444,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_4729458b1444,
  @Reusable = @Reusable_4729458b1444,
  @ExternalDataSourceID = @ExternalDataSourceID_4729458b1444,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_4729458b1444,
  @Configuration = @Configuration_4729458b1444,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_4729458b1444,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_4729458b1444,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_4729458b1444,
  @ApprovedAt = @ApprovedAt_4729458b1444,
  @ApprovedFingerprint = @ApprovedFingerprint_4729458b1444,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_4729458b1444,
  @ExtractionStatus = @ExtractionStatus_4729458b1444,
  @ExtractionMessage = @ExtractionMessage_4729458b1444,
  @ExtractionMessage_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQuery @ID = @ID_4729458b1444,
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
  @EmbeddingVector_Clear = 1,
  @EmbeddingModelID = @EmbeddingModelID_4729458b1444,
  @EmbeddingModelID_Clear = 1,
  @CacheValidationSQL = @CacheValidationSQL_4729458b1444,
  @CacheValidationSQL_Clear = 1,
  @SQLDialectID = @SQLDialectID_4729458b1444,
  @Reusable = @Reusable_4729458b1444,
  @ExternalDataSourceID = @ExternalDataSourceID_4729458b1444,
  @ExternalDataSourceID_Clear = 1,
  @IsMaterialized = @IsMaterialized_4729458b1444,
  @Configuration = @Configuration_4729458b1444,
  @Configuration_Clear = 1,
  @EmbeddingVectorBinary = @EmbeddingVectorBinary_4729458b1444,
  @EmbeddingVectorBinary_Clear = 1,
  @ApprovalComments = @ApprovalComments_4729458b1444,
  @ApprovalComments_Clear = 1,
  @ApprovedByUserID = @ApprovedByUserID_4729458b1444,
  @ApprovedAt = @ApprovedAt_4729458b1444,
  @ApprovedFingerprint = @ApprovedFingerprint_4729458b1444,
  @ApprovedFingerprint_Clear = 1,
  @ExtractedSQLHash = @ExtractedSQLHash_4729458b1444,
  @ExtractionStatus = @ExtractionStatus_4729458b1444,
  @ExtractionMessage = @ExtractionMessage_4729458b1444,
  @ExtractionMessage_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_a7c30bb963dc UNIQUEIDENTIFIER,
@QueryID_a7c30bb963dc UNIQUEIDENTIFIER,
@Name_a7c30bb963dc NVARCHAR(255),
@Description_a7c30bb963dc NVARCHAR(MAX),
@Sequence_a7c30bb963dc INT,
@SQLBaseType_a7c30bb963dc NVARCHAR(50),
@SQLFullType_a7c30bb963dc NVARCHAR(100),
@SourceEntityID_a7c30bb963dc UNIQUEIDENTIFIER,
@SourceFieldName_a7c30bb963dc NVARCHAR(255),
@IsComputed_a7c30bb963dc BIT,
@ComputationDescription_a7c30bb963dc NVARCHAR(MAX),
@IsSummary_a7c30bb963dc BIT,
@SummaryDescription_a7c30bb963dc NVARCHAR(MAX),
@DetectionMethod_a7c30bb963dc NVARCHAR(50),
@AutoDetectConfidenceScore_a7c30bb963dc DECIMAL(3, 2),
@SourceEntityFieldID_a7c30bb963dc UNIQUEIDENTIFIER,
@IsNullable_a7c30bb963dc BIT,
@SourceObjectName_a7c30bb963dc NVARCHAR(500)
SET
  @ID_a7c30bb963dc = 'b4a36ea3-6c8d-4732-8b3f-622bf45cf471'
SET
  @QueryID_a7c30bb963dc = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_a7c30bb963dc = N'PageID'
SET
  @Sequence_a7c30bb963dc = 1
SET
  @SQLBaseType_a7c30bb963dc = N'nvarchar'
SET
  @SQLFullType_a7c30bb963dc = N'nvarchar(4000)'
SET
  @IsComputed_a7c30bb963dc = 1
SET
  @IsSummary_a7c30bb963dc = 0
SET
  @DetectionMethod_a7c30bb963dc = N'Database'
SET
  @IsNullable_a7c30bb963dc = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_a7c30bb963dc
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_a7c30bb963dc,
  @QueryID = @QueryID_a7c30bb963dc,
  @Name = @Name_a7c30bb963dc,
  @Description = @Description_a7c30bb963dc,
  @Description_Clear = 1,
  @Sequence = @Sequence_a7c30bb963dc,
  @SQLBaseType = @SQLBaseType_a7c30bb963dc,
  @SQLFullType = @SQLFullType_a7c30bb963dc,
  @SourceEntityID = @SourceEntityID_a7c30bb963dc,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_a7c30bb963dc,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_a7c30bb963dc,
  @ComputationDescription = @ComputationDescription_a7c30bb963dc,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_a7c30bb963dc,
  @SummaryDescription = @SummaryDescription_a7c30bb963dc,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_a7c30bb963dc,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_a7c30bb963dc,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_a7c30bb963dc,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_a7c30bb963dc,
  @SourceObjectName = @SourceObjectName_a7c30bb963dc,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_a7c30bb963dc,
  @QueryID = @QueryID_a7c30bb963dc,
  @Name = @Name_a7c30bb963dc,
  @Description = @Description_a7c30bb963dc,
  @Description_Clear = 1,
  @Sequence = @Sequence_a7c30bb963dc,
  @SQLBaseType = @SQLBaseType_a7c30bb963dc,
  @SQLFullType = @SQLFullType_a7c30bb963dc,
  @SourceEntityID = @SourceEntityID_a7c30bb963dc,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_a7c30bb963dc,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_a7c30bb963dc,
  @ComputationDescription = @ComputationDescription_a7c30bb963dc,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_a7c30bb963dc,
  @SummaryDescription = @SummaryDescription_a7c30bb963dc,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_a7c30bb963dc,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_a7c30bb963dc,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_a7c30bb963dc,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_a7c30bb963dc,
  @SourceObjectName = @SourceObjectName_a7c30bb963dc,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_bedadd8c5fd4 UNIQUEIDENTIFIER,
@QueryID_bedadd8c5fd4 UNIQUEIDENTIFIER,
@Name_bedadd8c5fd4 NVARCHAR(255),
@Description_bedadd8c5fd4 NVARCHAR(MAX),
@Sequence_bedadd8c5fd4 INT,
@SQLBaseType_bedadd8c5fd4 NVARCHAR(50),
@SQLFullType_bedadd8c5fd4 NVARCHAR(100),
@SourceEntityID_bedadd8c5fd4 UNIQUEIDENTIFIER,
@SourceFieldName_bedadd8c5fd4 NVARCHAR(255),
@IsComputed_bedadd8c5fd4 BIT,
@ComputationDescription_bedadd8c5fd4 NVARCHAR(MAX),
@IsSummary_bedadd8c5fd4 BIT,
@SummaryDescription_bedadd8c5fd4 NVARCHAR(MAX),
@DetectionMethod_bedadd8c5fd4 NVARCHAR(50),
@AutoDetectConfidenceScore_bedadd8c5fd4 DECIMAL(3, 2),
@SourceEntityFieldID_bedadd8c5fd4 UNIQUEIDENTIFIER,
@IsNullable_bedadd8c5fd4 BIT,
@SourceObjectName_bedadd8c5fd4 NVARCHAR(500)
SET
  @ID_bedadd8c5fd4 = 'f8dc53e9-a1f0-4d43-8a6b-64318520a95e'
SET
  @QueryID_bedadd8c5fd4 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_bedadd8c5fd4 = N'Title'
SET
  @Sequence_bedadd8c5fd4 = 2
SET
  @SQLBaseType_bedadd8c5fd4 = N'nvarchar'
SET
  @SQLFullType_bedadd8c5fd4 = N'nvarchar(4000)'
SET
  @IsComputed_bedadd8c5fd4 = 1
SET
  @IsSummary_bedadd8c5fd4 = 0
SET
  @DetectionMethod_bedadd8c5fd4 = N'Database'
SET
  @IsNullable_bedadd8c5fd4 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_bedadd8c5fd4
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_bedadd8c5fd4,
  @QueryID = @QueryID_bedadd8c5fd4,
  @Name = @Name_bedadd8c5fd4,
  @Description = @Description_bedadd8c5fd4,
  @Description_Clear = 1,
  @Sequence = @Sequence_bedadd8c5fd4,
  @SQLBaseType = @SQLBaseType_bedadd8c5fd4,
  @SQLFullType = @SQLFullType_bedadd8c5fd4,
  @SourceEntityID = @SourceEntityID_bedadd8c5fd4,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_bedadd8c5fd4,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_bedadd8c5fd4,
  @ComputationDescription = @ComputationDescription_bedadd8c5fd4,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_bedadd8c5fd4,
  @SummaryDescription = @SummaryDescription_bedadd8c5fd4,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_bedadd8c5fd4,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_bedadd8c5fd4,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_bedadd8c5fd4,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_bedadd8c5fd4,
  @SourceObjectName = @SourceObjectName_bedadd8c5fd4,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_bedadd8c5fd4,
  @QueryID = @QueryID_bedadd8c5fd4,
  @Name = @Name_bedadd8c5fd4,
  @Description = @Description_bedadd8c5fd4,
  @Description_Clear = 1,
  @Sequence = @Sequence_bedadd8c5fd4,
  @SQLBaseType = @SQLBaseType_bedadd8c5fd4,
  @SQLFullType = @SQLFullType_bedadd8c5fd4,
  @SourceEntityID = @SourceEntityID_bedadd8c5fd4,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_bedadd8c5fd4,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_bedadd8c5fd4,
  @ComputationDescription = @ComputationDescription_bedadd8c5fd4,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_bedadd8c5fd4,
  @SummaryDescription = @SummaryDescription_bedadd8c5fd4,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_bedadd8c5fd4,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_bedadd8c5fd4,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_bedadd8c5fd4,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_bedadd8c5fd4,
  @SourceObjectName = @SourceObjectName_bedadd8c5fd4,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_06a9778f2603 UNIQUEIDENTIFIER,
@QueryID_06a9778f2603 UNIQUEIDENTIFIER,
@Name_06a9778f2603 NVARCHAR(255),
@Description_06a9778f2603 NVARCHAR(MAX),
@Sequence_06a9778f2603 INT,
@SQLBaseType_06a9778f2603 NVARCHAR(50),
@SQLFullType_06a9778f2603 NVARCHAR(100),
@SourceEntityID_06a9778f2603 UNIQUEIDENTIFIER,
@SourceFieldName_06a9778f2603 NVARCHAR(255),
@IsComputed_06a9778f2603 BIT,
@ComputationDescription_06a9778f2603 NVARCHAR(MAX),
@IsSummary_06a9778f2603 BIT,
@SummaryDescription_06a9778f2603 NVARCHAR(MAX),
@DetectionMethod_06a9778f2603 NVARCHAR(50),
@AutoDetectConfidenceScore_06a9778f2603 DECIMAL(3, 2),
@SourceEntityFieldID_06a9778f2603 UNIQUEIDENTIFIER,
@IsNullable_06a9778f2603 BIT,
@SourceObjectName_06a9778f2603 NVARCHAR(500)
SET
  @ID_06a9778f2603 = '643d7c3e-538e-4e12-930d-c85c4fa35233'
SET
  @QueryID_06a9778f2603 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_06a9778f2603 = N'DisplayOrder'
SET
  @Sequence_06a9778f2603 = 3
SET
  @SQLBaseType_06a9778f2603 = N'int'
SET
  @SQLFullType_06a9778f2603 = N'int'
SET
  @IsComputed_06a9778f2603 = 1
SET
  @IsSummary_06a9778f2603 = 0
SET
  @DetectionMethod_06a9778f2603 = N'Database'
SET
  @IsNullable_06a9778f2603 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_06a9778f2603
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_06a9778f2603,
  @QueryID = @QueryID_06a9778f2603,
  @Name = @Name_06a9778f2603,
  @Description = @Description_06a9778f2603,
  @Description_Clear = 1,
  @Sequence = @Sequence_06a9778f2603,
  @SQLBaseType = @SQLBaseType_06a9778f2603,
  @SQLFullType = @SQLFullType_06a9778f2603,
  @SourceEntityID = @SourceEntityID_06a9778f2603,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_06a9778f2603,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_06a9778f2603,
  @ComputationDescription = @ComputationDescription_06a9778f2603,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_06a9778f2603,
  @SummaryDescription = @SummaryDescription_06a9778f2603,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_06a9778f2603,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_06a9778f2603,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_06a9778f2603,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_06a9778f2603,
  @SourceObjectName = @SourceObjectName_06a9778f2603,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_06a9778f2603,
  @QueryID = @QueryID_06a9778f2603,
  @Name = @Name_06a9778f2603,
  @Description = @Description_06a9778f2603,
  @Description_Clear = 1,
  @Sequence = @Sequence_06a9778f2603,
  @SQLBaseType = @SQLBaseType_06a9778f2603,
  @SQLFullType = @SQLFullType_06a9778f2603,
  @SourceEntityID = @SourceEntityID_06a9778f2603,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_06a9778f2603,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_06a9778f2603,
  @ComputationDescription = @ComputationDescription_06a9778f2603,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_06a9778f2603,
  @SummaryDescription = @SummaryDescription_06a9778f2603,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_06a9778f2603,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_06a9778f2603,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_06a9778f2603,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_06a9778f2603,
  @SourceObjectName = @SourceObjectName_06a9778f2603,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_77cba32875c9 UNIQUEIDENTIFIER,
@QueryID_77cba32875c9 UNIQUEIDENTIFIER,
@Name_77cba32875c9 NVARCHAR(255),
@Description_77cba32875c9 NVARCHAR(MAX),
@Sequence_77cba32875c9 INT,
@SQLBaseType_77cba32875c9 NVARCHAR(50),
@SQLFullType_77cba32875c9 NVARCHAR(100),
@SourceEntityID_77cba32875c9 UNIQUEIDENTIFIER,
@SourceFieldName_77cba32875c9 NVARCHAR(255),
@IsComputed_77cba32875c9 BIT,
@ComputationDescription_77cba32875c9 NVARCHAR(MAX),
@IsSummary_77cba32875c9 BIT,
@SummaryDescription_77cba32875c9 NVARCHAR(MAX),
@DetectionMethod_77cba32875c9 NVARCHAR(50),
@AutoDetectConfidenceScore_77cba32875c9 DECIMAL(3, 2),
@SourceEntityFieldID_77cba32875c9 UNIQUEIDENTIFIER,
@IsNullable_77cba32875c9 BIT,
@SourceObjectName_77cba32875c9 NVARCHAR(500)
SET
  @ID_77cba32875c9 = 'd19342fe-45f8-44c0-aaeb-5510f96c44f2'
SET
  @QueryID_77cba32875c9 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_77cba32875c9 = N'ReachedCount'
SET
  @Sequence_77cba32875c9 = 4
SET
  @SQLBaseType_77cba32875c9 = N'int'
SET
  @SQLFullType_77cba32875c9 = N'int'
SET
  @IsComputed_77cba32875c9 = 1
SET
  @IsSummary_77cba32875c9 = 0
SET
  @DetectionMethod_77cba32875c9 = N'Database'
SET
  @IsNullable_77cba32875c9 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_77cba32875c9
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_77cba32875c9,
  @QueryID = @QueryID_77cba32875c9,
  @Name = @Name_77cba32875c9,
  @Description = @Description_77cba32875c9,
  @Description_Clear = 1,
  @Sequence = @Sequence_77cba32875c9,
  @SQLBaseType = @SQLBaseType_77cba32875c9,
  @SQLFullType = @SQLFullType_77cba32875c9,
  @SourceEntityID = @SourceEntityID_77cba32875c9,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_77cba32875c9,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_77cba32875c9,
  @ComputationDescription = @ComputationDescription_77cba32875c9,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_77cba32875c9,
  @SummaryDescription = @SummaryDescription_77cba32875c9,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_77cba32875c9,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_77cba32875c9,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_77cba32875c9,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_77cba32875c9,
  @SourceObjectName = @SourceObjectName_77cba32875c9,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_77cba32875c9,
  @QueryID = @QueryID_77cba32875c9,
  @Name = @Name_77cba32875c9,
  @Description = @Description_77cba32875c9,
  @Description_Clear = 1,
  @Sequence = @Sequence_77cba32875c9,
  @SQLBaseType = @SQLBaseType_77cba32875c9,
  @SQLFullType = @SQLFullType_77cba32875c9,
  @SourceEntityID = @SourceEntityID_77cba32875c9,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_77cba32875c9,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_77cba32875c9,
  @ComputationDescription = @ComputationDescription_77cba32875c9,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_77cba32875c9,
  @SummaryDescription = @SummaryDescription_77cba32875c9,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_77cba32875c9,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_77cba32875c9,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_77cba32875c9,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_77cba32875c9,
  @SourceObjectName = @SourceObjectName_77cba32875c9,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @ID_4c4885454343 UNIQUEIDENTIFIER,
@QueryID_4c4885454343 UNIQUEIDENTIFIER,
@Name_4c4885454343 NVARCHAR(255),
@Description_4c4885454343 NVARCHAR(MAX),
@Sequence_4c4885454343 INT,
@SQLBaseType_4c4885454343 NVARCHAR(50),
@SQLFullType_4c4885454343 NVARCHAR(100),
@SourceEntityID_4c4885454343 UNIQUEIDENTIFIER,
@SourceFieldName_4c4885454343 NVARCHAR(255),
@IsComputed_4c4885454343 BIT,
@ComputationDescription_4c4885454343 NVARCHAR(MAX),
@IsSummary_4c4885454343 BIT,
@SummaryDescription_4c4885454343 NVARCHAR(MAX),
@DetectionMethod_4c4885454343 NVARCHAR(50),
@AutoDetectConfidenceScore_4c4885454343 DECIMAL(3, 2),
@SourceEntityFieldID_4c4885454343 UNIQUEIDENTIFIER,
@IsNullable_4c4885454343 BIT,
@SourceObjectName_4c4885454343 NVARCHAR(500)
SET
  @ID_4c4885454343 = 'e7a70ec4-8edf-44d7-bc76-082d2749dfe2'
SET
  @QueryID_4c4885454343 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_4c4885454343 = N'QuestionTypes'
SET
  @Sequence_4c4885454343 = 5
SET
  @SQLBaseType_4c4885454343 = N'nvarchar'
SET
  @SQLFullType_4c4885454343 = N'nvarchar(4000)'
SET
  @IsComputed_4c4885454343 = 1
SET
  @IsSummary_4c4885454343 = 0
SET
  @DetectionMethod_4c4885454343 = N'Database'
SET
  @IsNullable_4c4885454343 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryField]
    WHERE
      [ID] = @ID_4c4885454343
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryField @ID = @ID_4c4885454343,
  @QueryID = @QueryID_4c4885454343,
  @Name = @Name_4c4885454343,
  @Description = @Description_4c4885454343,
  @Description_Clear = 1,
  @Sequence = @Sequence_4c4885454343,
  @SQLBaseType = @SQLBaseType_4c4885454343,
  @SQLFullType = @SQLFullType_4c4885454343,
  @SourceEntityID = @SourceEntityID_4c4885454343,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_4c4885454343,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_4c4885454343,
  @ComputationDescription = @ComputationDescription_4c4885454343,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_4c4885454343,
  @SummaryDescription = @SummaryDescription_4c4885454343,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_4c4885454343,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4c4885454343,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_4c4885454343,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_4c4885454343,
  @SourceObjectName = @SourceObjectName_4c4885454343,
  @SourceObjectName_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryField @ID = @ID_4c4885454343,
  @QueryID = @QueryID_4c4885454343,
  @Name = @Name_4c4885454343,
  @Description = @Description_4c4885454343,
  @Description_Clear = 1,
  @Sequence = @Sequence_4c4885454343,
  @SQLBaseType = @SQLBaseType_4c4885454343,
  @SQLFullType = @SQLFullType_4c4885454343,
  @SourceEntityID = @SourceEntityID_4c4885454343,
  @SourceEntityID_Clear = 1,
  @SourceFieldName = @SourceFieldName_4c4885454343,
  @SourceFieldName_Clear = 1,
  @IsComputed = @IsComputed_4c4885454343,
  @ComputationDescription = @ComputationDescription_4c4885454343,
  @ComputationDescription_Clear = 1,
  @IsSummary = @IsSummary_4c4885454343,
  @SummaryDescription = @SummaryDescription_4c4885454343,
  @SummaryDescription_Clear = 1,
  @DetectionMethod = @DetectionMethod_4c4885454343,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4c4885454343,
  @AutoDetectConfidenceScore_Clear = 1,
  @SourceEntityFieldID = @SourceEntityFieldID_4c4885454343,
  @SourceEntityFieldID_Clear = 1,
  @IsNullable = @IsNullable_4c4885454343,
  @SourceObjectName = @SourceObjectName_4c4885454343,
  @SourceObjectName_Clear = 1
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_2e112cec9cb1 UNIQUEIDENTIFIER,
@QueryID_2e112cec9cb1 UNIQUEIDENTIFIER,
@Name_2e112cec9cb1 NVARCHAR(255),
@Type_2e112cec9cb1 NVARCHAR(50),
@IsRequired_2e112cec9cb1 BIT,
@DefaultValue_2e112cec9cb1 NVARCHAR(MAX),
@Description_2e112cec9cb1 NVARCHAR(MAX),
@SampleValue_2e112cec9cb1 NVARCHAR(MAX),
@ValidationFilters_2e112cec9cb1 NVARCHAR(MAX),
@DetectionMethod_2e112cec9cb1 NVARCHAR(50),
@AutoDetectConfidenceScore_2e112cec9cb1 DECIMAL(3, 2),
@IsServerSet_2e112cec9cb1 BIT
SET
  @ID_2e112cec9cb1 = 'e5fa99a8-6733-4ce4-9e1f-1fa2ebb61f36'
SET
  @QueryID_2e112cec9cb1 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_2e112cec9cb1 = N'FormID'
SET
  @Type_2e112cec9cb1 = N'string'
SET
  @IsRequired_2e112cec9cb1 = 1
SET
  @DetectionMethod_2e112cec9cb1 = N'Parser'
SET
  @IsServerSet_2e112cec9cb1 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_2e112cec9cb1
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_2e112cec9cb1,
  @QueryID = @QueryID_2e112cec9cb1,
  @Name = @Name_2e112cec9cb1,
  @Type = @Type_2e112cec9cb1,
  @IsRequired = @IsRequired_2e112cec9cb1,
  @DefaultValue = @DefaultValue_2e112cec9cb1,
  @DefaultValue_Clear = 1,
  @Description = @Description_2e112cec9cb1,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_2e112cec9cb1,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_2e112cec9cb1,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_2e112cec9cb1,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_2e112cec9cb1,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_2e112cec9cb1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_2e112cec9cb1,
  @QueryID = @QueryID_2e112cec9cb1,
  @Name = @Name_2e112cec9cb1,
  @Type = @Type_2e112cec9cb1,
  @IsRequired = @IsRequired_2e112cec9cb1,
  @DefaultValue = @DefaultValue_2e112cec9cb1,
  @DefaultValue_Clear = 1,
  @Description = @Description_2e112cec9cb1,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_2e112cec9cb1,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_2e112cec9cb1,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_2e112cec9cb1,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_2e112cec9cb1,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_2e112cec9cb1
END;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @ID_e70e6b1aeda4 UNIQUEIDENTIFIER,
@QueryID_e70e6b1aeda4 UNIQUEIDENTIFIER,
@Name_e70e6b1aeda4 NVARCHAR(255),
@Type_e70e6b1aeda4 NVARCHAR(50),
@IsRequired_e70e6b1aeda4 BIT,
@DefaultValue_e70e6b1aeda4 NVARCHAR(MAX),
@Description_e70e6b1aeda4 NVARCHAR(MAX),
@SampleValue_e70e6b1aeda4 NVARCHAR(MAX),
@ValidationFilters_e70e6b1aeda4 NVARCHAR(MAX),
@DetectionMethod_e70e6b1aeda4 NVARCHAR(50),
@AutoDetectConfidenceScore_e70e6b1aeda4 DECIMAL(3, 2),
@IsServerSet_e70e6b1aeda4 BIT
SET
  @ID_e70e6b1aeda4 = '2152f93e-c190-49c6-8a18-1bdfd516b875'
SET
  @QueryID_e70e6b1aeda4 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @Name_e70e6b1aeda4 = N'FormVersionID'
SET
  @Type_e70e6b1aeda4 = N'string'
SET
  @IsRequired_e70e6b1aeda4 = 0
SET
  @DetectionMethod_e70e6b1aeda4 = N'Parser'
SET
  @IsServerSet_e70e6b1aeda4 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryParameter]
    WHERE
      [ID] = @ID_e70e6b1aeda4
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryParameter @ID = @ID_e70e6b1aeda4,
  @QueryID = @QueryID_e70e6b1aeda4,
  @Name = @Name_e70e6b1aeda4,
  @Type = @Type_e70e6b1aeda4,
  @IsRequired = @IsRequired_e70e6b1aeda4,
  @DefaultValue = @DefaultValue_e70e6b1aeda4,
  @DefaultValue_Clear = 1,
  @Description = @Description_e70e6b1aeda4,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_e70e6b1aeda4,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_e70e6b1aeda4,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_e70e6b1aeda4,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_e70e6b1aeda4,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_e70e6b1aeda4
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryParameter @ID = @ID_e70e6b1aeda4,
  @QueryID = @QueryID_e70e6b1aeda4,
  @Name = @Name_e70e6b1aeda4,
  @Type = @Type_e70e6b1aeda4,
  @IsRequired = @IsRequired_e70e6b1aeda4,
  @DefaultValue = @DefaultValue_e70e6b1aeda4,
  @DefaultValue_Clear = 1,
  @Description = @Description_e70e6b1aeda4,
  @Description_Clear = 1,
  @SampleValue = @SampleValue_e70e6b1aeda4,
  @SampleValue_Clear = 1,
  @ValidationFilters = @ValidationFilters_e70e6b1aeda4,
  @ValidationFilters_Clear = 1,
  @DetectionMethod = @DetectionMethod_e70e6b1aeda4,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_e70e6b1aeda4,
  @AutoDetectConfidenceScore_Clear = 1,
  @IsServerSet = @IsServerSet_e70e6b1aeda4
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_4db2a5bc1363 UNIQUEIDENTIFIER,
@QueryID_4db2a5bc1363 UNIQUEIDENTIFIER,
@EntityID_4db2a5bc1363 UNIQUEIDENTIFIER,
@DetectionMethod_4db2a5bc1363 NVARCHAR(50),
@AutoDetectConfidenceScore_4db2a5bc1363 DECIMAL(3, 2),
@AlternateBaseViewID_4db2a5bc1363 UNIQUEIDENTIFIER
SET
  @ID_4db2a5bc1363 = 'e1e85cf1-695a-4c3c-aab5-36d8f1665e7e'
SET
  @QueryID_4db2a5bc1363 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @EntityID_4db2a5bc1363 = '622E2804-5B6D-4B43-92A4-294ADC538F50'
SET
  @DetectionMethod_4db2a5bc1363 = N'Parser'
SET
  @AutoDetectConfidenceScore_4db2a5bc1363 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_4db2a5bc1363
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_4db2a5bc1363,
  @QueryID = @QueryID_4db2a5bc1363,
  @EntityID = @EntityID_4db2a5bc1363,
  @DetectionMethod = @DetectionMethod_4db2a5bc1363,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4db2a5bc1363,
  @AlternateBaseViewID = @AlternateBaseViewID_4db2a5bc1363,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_4db2a5bc1363,
  @QueryID = @QueryID_4db2a5bc1363,
  @EntityID = @EntityID_4db2a5bc1363,
  @DetectionMethod = @DetectionMethod_4db2a5bc1363,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_4db2a5bc1363,
  @AlternateBaseViewID = @AlternateBaseViewID_4db2a5bc1363,
  @AlternateBaseViewID_Clear = 1
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_dd55cbf0af77 UNIQUEIDENTIFIER,
@QueryID_dd55cbf0af77 UNIQUEIDENTIFIER,
@EntityID_dd55cbf0af77 UNIQUEIDENTIFIER,
@DetectionMethod_dd55cbf0af77 NVARCHAR(50),
@AutoDetectConfidenceScore_dd55cbf0af77 DECIMAL(3, 2),
@AlternateBaseViewID_dd55cbf0af77 UNIQUEIDENTIFIER
SET
  @ID_dd55cbf0af77 = 'b6f2ca15-7bb7-4e5b-b986-d11069809ce3'
SET
  @QueryID_dd55cbf0af77 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @EntityID_dd55cbf0af77 = '63600739-7165-4BDC-B7D7-19A1B1951DFA'
SET
  @DetectionMethod_dd55cbf0af77 = N'Parser'
SET
  @AutoDetectConfidenceScore_dd55cbf0af77 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_dd55cbf0af77
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_dd55cbf0af77,
  @QueryID = @QueryID_dd55cbf0af77,
  @EntityID = @EntityID_dd55cbf0af77,
  @DetectionMethod = @DetectionMethod_dd55cbf0af77,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dd55cbf0af77,
  @AlternateBaseViewID = @AlternateBaseViewID_dd55cbf0af77,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_dd55cbf0af77,
  @QueryID = @QueryID_dd55cbf0af77,
  @EntityID = @EntityID_dd55cbf0af77,
  @DetectionMethod = @DetectionMethod_dd55cbf0af77,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_dd55cbf0af77,
  @AlternateBaseViewID = @AlternateBaseViewID_dd55cbf0af77,
  @AlternateBaseViewID_Clear = 1
END;

-- Save MJ: Query Entities (core SP call only)
DECLARE @ID_f15df39853da UNIQUEIDENTIFIER,
@QueryID_f15df39853da UNIQUEIDENTIFIER,
@EntityID_f15df39853da UNIQUEIDENTIFIER,
@DetectionMethod_f15df39853da NVARCHAR(50),
@AutoDetectConfidenceScore_f15df39853da DECIMAL(3, 2),
@AlternateBaseViewID_f15df39853da UNIQUEIDENTIFIER
SET
  @ID_f15df39853da = 'ca5e3b6e-b9bf-413b-b7a7-654d10d2f323'
SET
  @QueryID_f15df39853da = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @EntityID_f15df39853da = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810'
SET
  @DetectionMethod_f15df39853da = N'Parser'
SET
  @AutoDetectConfidenceScore_f15df39853da = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryEntity]
    WHERE
      [ID] = @ID_f15df39853da
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryEntity @ID = @ID_f15df39853da,
  @QueryID = @QueryID_f15df39853da,
  @EntityID = @EntityID_f15df39853da,
  @DetectionMethod = @DetectionMethod_f15df39853da,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_f15df39853da,
  @AlternateBaseViewID = @AlternateBaseViewID_f15df39853da,
  @AlternateBaseViewID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryEntity @ID = @ID_f15df39853da,
  @QueryID = @QueryID_f15df39853da,
  @EntityID = @EntityID_f15df39853da,
  @DetectionMethod = @DetectionMethod_f15df39853da,
  @AutoDetectConfidenceScore = @AutoDetectConfidenceScore_f15df39853da,
  @AlternateBaseViewID = @AlternateBaseViewID_f15df39853da,
  @AlternateBaseViewID_Clear = 1
END;

GO

-- Save MJ: Queries (core SP call only)
DECLARE @ApprovedFingerprint_4729458b1444 NVARCHAR(100),
@ID_4729458b1444 UNIQUEIDENTIFIER
SET
  @ApprovedFingerprint_4729458b1444 = N'671d837b72966c0d8587e1ab10e6a8d776087c2ee78daba35a8b1f94082f55b6'
SET
  @ID_4729458b1444 = 'A49D124C-056D-422E-B2FD-95131B546E84' EXEC [${mjSchema}].spUpdateQuery @ApprovedFingerprint = @ApprovedFingerprint_4729458b1444,
  @ID = @ID_4729458b1444;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_cc652908f056 UNIQUEIDENTIFIER,
@QueryID_cc652908f056 UNIQUEIDENTIFIER,
@RoleID_cc652908f056 UNIQUEIDENTIFIER
SET
  @ID_cc652908f056 = '0F071145-C1C6-4C63-BBE3-44F3A74C39DA'
SET
  @QueryID_cc652908f056 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_cc652908f056 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Developer')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_cc652908f056
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_cc652908f056,
  @QueryID = @QueryID_cc652908f056,
  @RoleID = @RoleID_cc652908f056
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_cc652908f056,
  @QueryID = @QueryID_cc652908f056,
  @RoleID = @RoleID_cc652908f056
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_c211c02753b1 UNIQUEIDENTIFIER,
@QueryID_c211c02753b1 UNIQUEIDENTIFIER,
@RoleID_c211c02753b1 UNIQUEIDENTIFIER
SET
  @ID_c211c02753b1 = '67760AF4-07FC-4CC8-8B51-AE3A3F1AF725'
SET
  @QueryID_c211c02753b1 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_c211c02753b1 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Integration')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_c211c02753b1
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_c211c02753b1,
  @QueryID = @QueryID_c211c02753b1,
  @RoleID = @RoleID_c211c02753b1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_c211c02753b1,
  @QueryID = @QueryID_c211c02753b1,
  @RoleID = @RoleID_c211c02753b1
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_f0f50aea3247 UNIQUEIDENTIFIER,
@QueryID_f0f50aea3247 UNIQUEIDENTIFIER,
@RoleID_f0f50aea3247 UNIQUEIDENTIFIER
SET
  @ID_f0f50aea3247 = 'C8768CAF-4613-46D6-B0F8-0624EE8D5B79'
SET
  @QueryID_f0f50aea3247 = 'B51015E9-0EE4-4F44-B4CB-F9948D6394EC'
SET
  @RoleID_f0f50aea3247 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'UI')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_f0f50aea3247
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_f0f50aea3247,
  @QueryID = @QueryID_f0f50aea3247,
  @RoleID = @RoleID_f0f50aea3247
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_f0f50aea3247,
  @QueryID = @QueryID_f0f50aea3247,
  @RoleID = @RoleID_f0f50aea3247
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_6ff1245aecb8 UNIQUEIDENTIFIER,
@QueryID_6ff1245aecb8 UNIQUEIDENTIFIER,
@RoleID_6ff1245aecb8 UNIQUEIDENTIFIER
SET
  @ID_6ff1245aecb8 = '5C571EC4-F923-4A11-B975-1DDA08F87E2D'
SET
  @QueryID_6ff1245aecb8 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_6ff1245aecb8 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Developer')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_6ff1245aecb8
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_6ff1245aecb8,
  @QueryID = @QueryID_6ff1245aecb8,
  @RoleID = @RoleID_6ff1245aecb8
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_6ff1245aecb8,
  @QueryID = @QueryID_6ff1245aecb8,
  @RoleID = @RoleID_6ff1245aecb8
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_da34224bcaeb UNIQUEIDENTIFIER,
@QueryID_da34224bcaeb UNIQUEIDENTIFIER,
@RoleID_da34224bcaeb UNIQUEIDENTIFIER
SET
  @ID_da34224bcaeb = 'F4C56BD9-FC37-4C66-8F22-2B467B53E550'
SET
  @QueryID_da34224bcaeb = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_da34224bcaeb = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Integration')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_da34224bcaeb
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_da34224bcaeb,
  @QueryID = @QueryID_da34224bcaeb,
  @RoleID = @RoleID_da34224bcaeb
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_da34224bcaeb,
  @QueryID = @QueryID_da34224bcaeb,
  @RoleID = @RoleID_da34224bcaeb
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_8f37f37341c7 UNIQUEIDENTIFIER,
@QueryID_8f37f37341c7 UNIQUEIDENTIFIER,
@RoleID_8f37f37341c7 UNIQUEIDENTIFIER
SET
  @ID_8f37f37341c7 = '7633BEFC-1941-43A6-84BA-D4F14FB19AF8'
SET
  @QueryID_8f37f37341c7 = '2D37244B-05F6-4B7C-8A33-B3537C2F0851'
SET
  @RoleID_8f37f37341c7 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'UI')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_8f37f37341c7
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_8f37f37341c7,
  @QueryID = @QueryID_8f37f37341c7,
  @RoleID = @RoleID_8f37f37341c7
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_8f37f37341c7,
  @QueryID = @QueryID_8f37f37341c7,
  @RoleID = @RoleID_8f37f37341c7
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_3559f5ea1487 UNIQUEIDENTIFIER,
@QueryID_3559f5ea1487 UNIQUEIDENTIFIER,
@RoleID_3559f5ea1487 UNIQUEIDENTIFIER
SET
  @ID_3559f5ea1487 = '2DD55B24-4082-417A-A4A9-3A36CB9FEE23'
SET
  @QueryID_3559f5ea1487 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_3559f5ea1487 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Developer')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_3559f5ea1487
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_3559f5ea1487,
  @QueryID = @QueryID_3559f5ea1487,
  @RoleID = @RoleID_3559f5ea1487
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_3559f5ea1487,
  @QueryID = @QueryID_3559f5ea1487,
  @RoleID = @RoleID_3559f5ea1487
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_b15f3245b51f UNIQUEIDENTIFIER,
@QueryID_b15f3245b51f UNIQUEIDENTIFIER,
@RoleID_b15f3245b51f UNIQUEIDENTIFIER
SET
  @ID_b15f3245b51f = '3BDE1A93-2798-4962-A1D1-DEF5E373BA6D'
SET
  @QueryID_b15f3245b51f = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_b15f3245b51f = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'Integration')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_b15f3245b51f
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_b15f3245b51f,
  @QueryID = @QueryID_b15f3245b51f,
  @RoleID = @RoleID_b15f3245b51f
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_b15f3245b51f,
  @QueryID = @QueryID_b15f3245b51f,
  @RoleID = @RoleID_b15f3245b51f
END;

-- Save MJ: Query Permissions (core SP call only)
DECLARE @ID_74f1a4b86273 UNIQUEIDENTIFIER,
@QueryID_74f1a4b86273 UNIQUEIDENTIFIER,
@RoleID_74f1a4b86273 UNIQUEIDENTIFIER
SET
  @ID_74f1a4b86273 = '94B1BFDB-6521-48D3-A5F1-A786FBCF15C2'
SET
  @QueryID_74f1a4b86273 = 'A49D124C-056D-422E-B2FD-95131B546E84'
SET
  @RoleID_74f1a4b86273 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Role]
    WHERE
      LOWER([Name]) = LOWER(N'UI')
  ) IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[QueryPermission]
    WHERE
      [ID] = @ID_74f1a4b86273
  )
BEGIN
EXEC [${mjSchema}].spCreateQueryPermission @ID = @ID_74f1a4b86273,
  @QueryID = @QueryID_74f1a4b86273,
  @RoleID = @RoleID_74f1a4b86273
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateQueryPermission @ID = @ID_74f1a4b86273,
  @QueryID = @QueryID_74f1a4b86273,
  @RoleID = @RoleID_74f1a4b86273
END;

-- Save MJ: Entities (core SP call only)
DECLARE @AutoUpdateAllowUserSearchAPI_5ea7e6abd541 BIT,
@ID_5ea7e6abd541 UNIQUEIDENTIFIER
SET
  @AutoUpdateAllowUserSearchAPI_5ea7e6abd541 = 0
SET
  @ID_5ea7e6abd541 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[Entity]
    WHERE
      [BaseTable] = 'FormAutomationEvent' AND [SchemaName] = '${flyway:defaultSchema}'
  )
EXEC [${mjSchema}].spUpdateEntity @AutoUpdateAllowUserSearchAPI = @AutoUpdateAllowUserSearchAPI_5ea7e6abd541,
  @ID = @ID_5ea7e6abd541;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e BIT,
@ID_ee757dd2f38e UNIQUEIDENTIFIER
SET
  @IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e = 0
SET
  @ID_ee757dd2f38e = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'FormResponseID')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormAutomationEvent' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_ee757dd2f38e,
  @ID = @ID_ee757dd2f38e;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0 BIT,
@ID_4f3ab01f9db0 UNIQUEIDENTIFIER
SET
  @IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0 = 0
SET
  @ID_4f3ab01f9db0 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'FormResponseID')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormAutomationRun' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_4f3ab01f9db0,
  @ID = @ID_4f3ab01f9db0;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5 BIT,
@ID_142ee16f9bd5 UNIQUEIDENTIFIER
SET
  @IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5 = 0
SET
  @ID_142ee16f9bd5 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'FormResponseID')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormEntityBindingRecord' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_142ee16f9bd5,
  @ID = @ID_142ee16f9bd5;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @IncludeRelatedEntityNameFieldInBaseView_980580dcbe83 BIT,
@ID_980580dcbe83 UNIQUEIDENTIFIER
SET
  @IncludeRelatedEntityNameFieldInBaseView_980580dcbe83 = 0
SET
  @ID_980580dcbe83 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'ResponseID')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormResponseAnswer' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @IncludeRelatedEntityNameFieldInBaseView = @IncludeRelatedEntityNameFieldInBaseView_980580dcbe83,
  @ID = @ID_980580dcbe83;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @IsNameField_af90f6299da0 BIT,
@AutoUpdateIsNameField_af90f6299da0 BIT,
@ID_af90f6299da0 UNIQUEIDENTIFIER
SET
  @IsNameField_af90f6299da0 = 1
SET
  @AutoUpdateIsNameField_af90f6299da0 = 0
SET
  @ID_af90f6299da0 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'Form')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormResponse' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @IsNameField = @IsNameField_af90f6299da0,
  @AutoUpdateIsNameField = @AutoUpdateIsNameField_af90f6299da0,
  @ID = @ID_af90f6299da0;

-- Save MJ: Entity Fields (core SP call only)
DECLARE @EntityIDFieldName_c4797657cff5 NVARCHAR(100),
@ID_c4797657cff5 UNIQUEIDENTIFIER
SET
  @EntityIDFieldName_c4797657cff5 = N'TargetEntityID'
SET
  @ID_c4797657cff5 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityField]
    WHERE
      LOWER([Name]) = LOWER(N'TargetRecordID')
      AND [EntityID] = (SELECT [ID] FROM [${mjSchema}].[Entity] WHERE [BaseTable] = 'FormEntityBindingRecord' AND [SchemaName] = '${flyway:defaultSchema}')
  )
EXEC [${mjSchema}].spUpdateEntityField @EntityIDFieldName = @EntityIDFieldName_c4797657cff5,
  @ID = @ID_c4797657cff5;

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @RelatedRecordCollection_9279cae5c157 NVARCHAR(MAX),
@ID_9279cae5c157 UNIQUEIDENTIFIER
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
  @ID_9279cae5c157 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityRelationship]
    WHERE
      [EntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'Form' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND [RelatedEntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormPage' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND LOWER([RelatedEntityJoinField]) = LOWER(N'FormID')
  )
EXEC [${mjSchema}].spUpdateEntityRelationship @RelatedRecordCollection = @RelatedRecordCollection_9279cae5c157,
  @ID = @ID_9279cae5c157;

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @RelatedRecordCollection_5c144ef5bad3 NVARCHAR(MAX),
@ID_5c144ef5bad3 UNIQUEIDENTIFIER
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
  @ID_5c144ef5bad3 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityRelationship]
    WHERE
      [EntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'Form' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND [RelatedEntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormScreen' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND LOWER([RelatedEntityJoinField]) = LOWER(N'FormID')
  )
EXEC [${mjSchema}].spUpdateEntityRelationship @RelatedRecordCollection = @RelatedRecordCollection_5c144ef5bad3,
  @ID = @ID_5c144ef5bad3;

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @RelatedRecordCollection_ce025202a2ff NVARCHAR(MAX),
@ID_ce025202a2ff UNIQUEIDENTIFIER
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
  @ID_ce025202a2ff = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityRelationship]
    WHERE
      [EntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormPage' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND [RelatedEntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormQuestion' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND LOWER([RelatedEntityJoinField]) = LOWER(N'PageID')
  )
EXEC [${mjSchema}].spUpdateEntityRelationship @RelatedRecordCollection = @RelatedRecordCollection_ce025202a2ff,
  @ID = @ID_ce025202a2ff;

-- Save MJ: Entity Relationships (core SP call only)
DECLARE @RelatedRecordCollection_99ed7dcf754b NVARCHAR(MAX),
@ID_99ed7dcf754b UNIQUEIDENTIFIER
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
  @ID_99ed7dcf754b = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[EntityRelationship]
    WHERE
      [EntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormQuestion' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND [RelatedEntityID] = (
        SELECT
          [ID]
        FROM
          [${mjSchema}].[Entity]
        WHERE
          [BaseTable] = 'FormQuestionOption' AND [SchemaName] = '${flyway:defaultSchema}'
      )
      AND LOWER([RelatedEntityJoinField]) = LOWER(N'QuestionID')
  )
EXEC [${mjSchema}].spUpdateEntityRelationship @RelatedRecordCollection = @RelatedRecordCollection_99ed7dcf754b,
  @ID = @ID_99ed7dcf754b;

-- Save MJ: Actions (core SP call only)
DECLARE @Description_9eed791439d5 NVARCHAR(MAX),
@ID_9eed791439d5 UNIQUEIDENTIFIER
SET
  @Description_9eed791439d5 = N'AI form authoring — turns a natural-language brief (for example ''a 5-question event RSVP with dietary restrictions and a +1 count'') into a draft Form with pages, questions, and options (or, with PublishImmediately, a published one), using the highest-power Claude model with a zod-validated blueprint.'
SET
  @ID_9eed791439d5 = '7F0A0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateAction @Description = @Description_9eed791439d5,
  @ID = @ID_9eed791439d5;

-- Save MJ: Actions (core SP call only)
DECLARE @Description_ffd784d813c0 NVARCHAR(MAX),
@ID_ffd784d813c0 UNIQUEIDENTIFIER
SET
  @Description_ffd784d813c0 = N'No-AI authoring — instantiates a starter-gallery template (Contact, RSVP, NPS/feedback, Lead capture, Application) into a draft Form (or, with PublishImmediately, a published one).'
SET
  @ID_ffd784d813c0 = '7F0A0002-A1B2-4C3D-8E4F-000000000002' EXEC [${mjSchema}].spUpdateAction @Description = @Description_ffd784d813c0,
  @ID = @ID_ffd784d813c0;

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
@LogValue_b4c318d0c80c BIT,
@ValueSchema_b4c318d0c80c NVARCHAR(MAX)
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
  @LogValue_b4c318d0c80c = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionParam]
    WHERE
      [ID] = @ID_b4c318d0c80c
  )
BEGIN
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
  @LogValue = @LogValue_b4c318d0c80c,
  @ValueSchema = @ValueSchema_b4c318d0c80c,
  @ValueSchema_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionParam @ID = @ID_b4c318d0c80c,
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
  @LogValue = @LogValue_b4c318d0c80c,
  @ValueSchema = @ValueSchema_b4c318d0c80c,
  @ValueSchema_Clear = 1
END;

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
@LogValue_70c7fcf9b20d BIT,
@ValueSchema_70c7fcf9b20d NVARCHAR(MAX)
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
  @LogValue_70c7fcf9b20d = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionParam]
    WHERE
      [ID] = @ID_70c7fcf9b20d
  )
BEGIN
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
  @LogValue = @LogValue_70c7fcf9b20d,
  @ValueSchema = @ValueSchema_70c7fcf9b20d,
  @ValueSchema_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionParam @ID = @ID_70c7fcf9b20d,
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
  @LogValue = @LogValue_70c7fcf9b20d,
  @ValueSchema = @ValueSchema_70c7fcf9b20d,
  @ValueSchema_Clear = 1
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_177f9af9d264 UNIQUEIDENTIFIER,
@ActionID_177f9af9d264 UNIQUEIDENTIFIER,
@ResultCode_177f9af9d264 NVARCHAR(255),
@IsSuccess_177f9af9d264 BIT,
@Description_177f9af9d264 NVARCHAR(MAX)
SET
  @ID_177f9af9d264 = '2BE58582-9AC8-43D6-B84A-A08991911AA6'
SET
  @ActionID_177f9af9d264 = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_177f9af9d264 = N'SUCCESS'
SET
  @IsSuccess_177f9af9d264 = 1
SET
  @Description_177f9af9d264 = N'The action completed and did its work.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_177f9af9d264
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_177f9af9d264,
  @ActionID = @ActionID_177f9af9d264,
  @ResultCode = @ResultCode_177f9af9d264,
  @IsSuccess = @IsSuccess_177f9af9d264,
  @Description = @Description_177f9af9d264
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_177f9af9d264,
  @ActionID = @ActionID_177f9af9d264,
  @ResultCode = @ResultCode_177f9af9d264,
  @IsSuccess = @IsSuccess_177f9af9d264,
  @Description = @Description_177f9af9d264
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_7326d969a7d9 UNIQUEIDENTIFIER,
@ActionID_7326d969a7d9 UNIQUEIDENTIFIER,
@ResultCode_7326d969a7d9 NVARCHAR(255),
@IsSuccess_7326d969a7d9 BIT,
@Description_7326d969a7d9 NVARCHAR(MAX)
SET
  @ID_7326d969a7d9 = '5EA57777-B89D-48BF-8C41-8651E680BC4C'
SET
  @ActionID_7326d969a7d9 = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_7326d969a7d9 = N'SKIPPED'
SET
  @IsSuccess_7326d969a7d9 = 1
SET
  @Description_7326d969a7d9 = N'Nothing to do for this response, so the action intentionally did nothing.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_7326d969a7d9
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_7326d969a7d9,
  @ActionID = @ActionID_7326d969a7d9,
  @ResultCode = @ResultCode_7326d969a7d9,
  @IsSuccess = @IsSuccess_7326d969a7d9,
  @Description = @Description_7326d969a7d9
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_7326d969a7d9,
  @ActionID = @ActionID_7326d969a7d9,
  @ResultCode = @ResultCode_7326d969a7d9,
  @IsSuccess = @IsSuccess_7326d969a7d9,
  @Description = @Description_7326d969a7d9
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_48f8f7564405 UNIQUEIDENTIFIER,
@ActionID_48f8f7564405 UNIQUEIDENTIFIER,
@ResultCode_48f8f7564405 NVARCHAR(255),
@IsSuccess_48f8f7564405 BIT,
@Description_48f8f7564405 NVARCHAR(MAX)
SET
  @ID_48f8f7564405 = '5D85B493-EB91-4F8C-9D6B-542422C6B382'
SET
  @ActionID_48f8f7564405 = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_48f8f7564405 = N'MISSING_PARAMETERS'
SET
  @IsSuccess_48f8f7564405 = 0
SET
  @Description_48f8f7564405 = N'The required FormResponseID parameter was not provided.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_48f8f7564405
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_48f8f7564405,
  @ActionID = @ActionID_48f8f7564405,
  @ResultCode = @ResultCode_48f8f7564405,
  @IsSuccess = @IsSuccess_48f8f7564405,
  @Description = @Description_48f8f7564405
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_48f8f7564405,
  @ActionID = @ActionID_48f8f7564405,
  @ResultCode = @ResultCode_48f8f7564405,
  @IsSuccess = @IsSuccess_48f8f7564405,
  @Description = @Description_48f8f7564405
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_834f6efe9f34 UNIQUEIDENTIFIER,
@ActionID_834f6efe9f34 UNIQUEIDENTIFIER,
@ResultCode_834f6efe9f34 NVARCHAR(255),
@IsSuccess_834f6efe9f34 BIT,
@Description_834f6efe9f34 NVARCHAR(MAX)
SET
  @ID_834f6efe9f34 = '9CACC2AC-DCE3-46AE-ADBB-677D45760B6B'
SET
  @ActionID_834f6efe9f34 = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_834f6efe9f34 = N'ENTITY_CLASS_UNREGISTERED'
SET
  @IsSuccess_834f6efe9f34 = 0
SET
  @Description_834f6efe9f34 = N'A sibling-app entity class the action needs is not registered in this process (the host did not load that app''s server package).' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_834f6efe9f34
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_834f6efe9f34,
  @ActionID = @ActionID_834f6efe9f34,
  @ResultCode = @ResultCode_834f6efe9f34,
  @IsSuccess = @IsSuccess_834f6efe9f34,
  @Description = @Description_834f6efe9f34
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_834f6efe9f34,
  @ActionID = @ActionID_834f6efe9f34,
  @ResultCode = @ResultCode_834f6efe9f34,
  @IsSuccess = @IsSuccess_834f6efe9f34,
  @Description = @Description_834f6efe9f34
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_2688e093400b UNIQUEIDENTIFIER,
@ActionID_2688e093400b UNIQUEIDENTIFIER,
@ResultCode_2688e093400b NVARCHAR(255),
@IsSuccess_2688e093400b BIT,
@Description_2688e093400b NVARCHAR(MAX)
SET
  @ID_2688e093400b = '11F61C38-E1F8-413B-867B-01054E751308'
SET
  @ActionID_2688e093400b = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_2688e093400b = N'RESPONSE_LOAD_FAILED'
SET
  @IsSuccess_2688e093400b = 0
SET
  @Description_2688e093400b = N'The FormResponse could not be loaded.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_2688e093400b
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_2688e093400b,
  @ActionID = @ActionID_2688e093400b,
  @ResultCode = @ResultCode_2688e093400b,
  @IsSuccess = @IsSuccess_2688e093400b,
  @Description = @Description_2688e093400b
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_2688e093400b,
  @ActionID = @ActionID_2688e093400b,
  @ResultCode = @ResultCode_2688e093400b,
  @IsSuccess = @IsSuccess_2688e093400b,
  @Description = @Description_2688e093400b
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_4ed29dcfab6a UNIQUEIDENTIFIER,
@ActionID_4ed29dcfab6a UNIQUEIDENTIFIER,
@ResultCode_4ed29dcfab6a NVARCHAR(255),
@IsSuccess_4ed29dcfab6a BIT,
@Description_4ed29dcfab6a NVARCHAR(MAX)
SET
  @ID_4ed29dcfab6a = '5950F3C6-C5FB-4F59-8364-A7713533D38B'
SET
  @ActionID_4ed29dcfab6a = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_4ed29dcfab6a = N'PERSON_LOOKUP_FAILED'
SET
  @IsSuccess_4ed29dcfab6a = 0
SET
  @Description_4ed29dcfab6a = N'The Person records could not be read to match the respondent.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_4ed29dcfab6a
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_4ed29dcfab6a,
  @ActionID = @ActionID_4ed29dcfab6a,
  @ResultCode = @ResultCode_4ed29dcfab6a,
  @IsSuccess = @IsSuccess_4ed29dcfab6a,
  @Description = @Description_4ed29dcfab6a
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_4ed29dcfab6a,
  @ActionID = @ActionID_4ed29dcfab6a,
  @ResultCode = @ResultCode_4ed29dcfab6a,
  @IsSuccess = @IsSuccess_4ed29dcfab6a,
  @Description = @Description_4ed29dcfab6a
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_d3678adb5b1b UNIQUEIDENTIFIER,
@ActionID_d3678adb5b1b UNIQUEIDENTIFIER,
@ResultCode_d3678adb5b1b NVARCHAR(255),
@IsSuccess_d3678adb5b1b BIT,
@Description_d3678adb5b1b NVARCHAR(MAX)
SET
  @ID_d3678adb5b1b = '7432A8EC-A31F-4D03-98A2-EDEBB722BBFF'
SET
  @ActionID_d3678adb5b1b = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_d3678adb5b1b = N'PERSON_SAVE_FAILED'
SET
  @IsSuccess_d3678adb5b1b = 0
SET
  @Description_d3678adb5b1b = N'The new Person record could not be saved.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_d3678adb5b1b
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_d3678adb5b1b,
  @ActionID = @ActionID_d3678adb5b1b,
  @ResultCode = @ResultCode_d3678adb5b1b,
  @IsSuccess = @IsSuccess_d3678adb5b1b,
  @Description = @Description_d3678adb5b1b
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_d3678adb5b1b,
  @ActionID = @ActionID_d3678adb5b1b,
  @ResultCode = @ResultCode_d3678adb5b1b,
  @IsSuccess = @IsSuccess_d3678adb5b1b,
  @Description = @Description_d3678adb5b1b
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_665e1aebf4c4 UNIQUEIDENTIFIER,
@ActionID_665e1aebf4c4 UNIQUEIDENTIFIER,
@ResultCode_665e1aebf4c4 NVARCHAR(255),
@IsSuccess_665e1aebf4c4 BIT,
@Description_665e1aebf4c4 NVARCHAR(MAX)
SET
  @ID_665e1aebf4c4 = '08AECF9C-7951-4404-B9C3-62AFF51148ED'
SET
  @ActionID_665e1aebf4c4 = '7F0A0003-A1B2-4C3D-8E4F-000000000003'
SET
  @ResultCode_665e1aebf4c4 = N'RESPONSE_SAVE_FAILED'
SET
  @IsSuccess_665e1aebf4c4 = 0
SET
  @Description_665e1aebf4c4 = N'The Person was resolved but FormResponse.RespondentPersonID could not be saved.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_665e1aebf4c4
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_665e1aebf4c4,
  @ActionID = @ActionID_665e1aebf4c4,
  @ResultCode = @ResultCode_665e1aebf4c4,
  @IsSuccess = @IsSuccess_665e1aebf4c4,
  @Description = @Description_665e1aebf4c4
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_665e1aebf4c4,
  @ActionID = @ActionID_665e1aebf4c4,
  @ResultCode = @ResultCode_665e1aebf4c4,
  @IsSuccess = @IsSuccess_665e1aebf4c4,
  @Description = @Description_665e1aebf4c4
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_bb6a734bdaf8 UNIQUEIDENTIFIER,
@ActionID_bb6a734bdaf8 UNIQUEIDENTIFIER,
@ResultCode_bb6a734bdaf8 NVARCHAR(255),
@IsSuccess_bb6a734bdaf8 BIT,
@Description_bb6a734bdaf8 NVARCHAR(MAX)
SET
  @ID_bb6a734bdaf8 = '41599C79-6164-4098-905A-90B4D3E66680'
SET
  @ActionID_bb6a734bdaf8 = '7F0A0004-A1B2-4C3D-8E4F-000000000004'
SET
  @ResultCode_bb6a734bdaf8 = N'SUCCESS'
SET
  @IsSuccess_bb6a734bdaf8 = 1
SET
  @Description_bb6a734bdaf8 = N'The action completed and did its work.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_bb6a734bdaf8
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_bb6a734bdaf8,
  @ActionID = @ActionID_bb6a734bdaf8,
  @ResultCode = @ResultCode_bb6a734bdaf8,
  @IsSuccess = @IsSuccess_bb6a734bdaf8,
  @Description = @Description_bb6a734bdaf8
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_bb6a734bdaf8,
  @ActionID = @ActionID_bb6a734bdaf8,
  @ResultCode = @ResultCode_bb6a734bdaf8,
  @IsSuccess = @IsSuccess_bb6a734bdaf8,
  @Description = @Description_bb6a734bdaf8
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_290ac6f3c9e2 UNIQUEIDENTIFIER,
@ActionID_290ac6f3c9e2 UNIQUEIDENTIFIER,
@ResultCode_290ac6f3c9e2 NVARCHAR(255),
@IsSuccess_290ac6f3c9e2 BIT,
@Description_290ac6f3c9e2 NVARCHAR(MAX)
SET
  @ID_290ac6f3c9e2 = '476C38A7-DFC5-4F6F-AD49-573F1CBB85D3'
SET
  @ActionID_290ac6f3c9e2 = '7F0A0004-A1B2-4C3D-8E4F-000000000004'
SET
  @ResultCode_290ac6f3c9e2 = N'SKIPPED'
SET
  @IsSuccess_290ac6f3c9e2 = 1
SET
  @Description_290ac6f3c9e2 = N'Nothing to do for this response, so the action intentionally did nothing.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_290ac6f3c9e2
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_290ac6f3c9e2,
  @ActionID = @ActionID_290ac6f3c9e2,
  @ResultCode = @ResultCode_290ac6f3c9e2,
  @IsSuccess = @IsSuccess_290ac6f3c9e2,
  @Description = @Description_290ac6f3c9e2
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_290ac6f3c9e2,
  @ActionID = @ActionID_290ac6f3c9e2,
  @ResultCode = @ResultCode_290ac6f3c9e2,
  @IsSuccess = @IsSuccess_290ac6f3c9e2,
  @Description = @Description_290ac6f3c9e2
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_1a93e865574d UNIQUEIDENTIFIER,
@ActionID_1a93e865574d UNIQUEIDENTIFIER,
@ResultCode_1a93e865574d NVARCHAR(255),
@IsSuccess_1a93e865574d BIT,
@Description_1a93e865574d NVARCHAR(MAX)
SET
  @ID_1a93e865574d = '1789ADFE-2CA8-4B6D-922C-D5E80DF183DF'
SET
  @ActionID_1a93e865574d = '7F0A0004-A1B2-4C3D-8E4F-000000000004'
SET
  @ResultCode_1a93e865574d = N'NOT_SENT'
SET
  @IsSuccess_1a93e865574d = 1
SET
  @Description_1a93e865574d = N'The action succeeded but sent nothing: the configured sender declined or could not deliver the email (the default logging sender never delivers).' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_1a93e865574d
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_1a93e865574d,
  @ActionID = @ActionID_1a93e865574d,
  @ResultCode = @ResultCode_1a93e865574d,
  @IsSuccess = @IsSuccess_1a93e865574d,
  @Description = @Description_1a93e865574d
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_1a93e865574d,
  @ActionID = @ActionID_1a93e865574d,
  @ResultCode = @ResultCode_1a93e865574d,
  @IsSuccess = @IsSuccess_1a93e865574d,
  @Description = @Description_1a93e865574d
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_3afc0b44fdeb UNIQUEIDENTIFIER,
@ActionID_3afc0b44fdeb UNIQUEIDENTIFIER,
@ResultCode_3afc0b44fdeb NVARCHAR(255),
@IsSuccess_3afc0b44fdeb BIT,
@Description_3afc0b44fdeb NVARCHAR(MAX)
SET
  @ID_3afc0b44fdeb = '20C69144-A90D-4477-9F5F-04FA050E68FA'
SET
  @ActionID_3afc0b44fdeb = '7F0A0004-A1B2-4C3D-8E4F-000000000004'
SET
  @ResultCode_3afc0b44fdeb = N'MISSING_PARAMETERS'
SET
  @IsSuccess_3afc0b44fdeb = 0
SET
  @Description_3afc0b44fdeb = N'The required FormResponseID parameter was not provided.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_3afc0b44fdeb
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_3afc0b44fdeb,
  @ActionID = @ActionID_3afc0b44fdeb,
  @ResultCode = @ResultCode_3afc0b44fdeb,
  @IsSuccess = @IsSuccess_3afc0b44fdeb,
  @Description = @Description_3afc0b44fdeb
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_3afc0b44fdeb,
  @ActionID = @ActionID_3afc0b44fdeb,
  @ResultCode = @ResultCode_3afc0b44fdeb,
  @IsSuccess = @IsSuccess_3afc0b44fdeb,
  @Description = @Description_3afc0b44fdeb
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_5faf883e4b1a UNIQUEIDENTIFIER,
@ActionID_5faf883e4b1a UNIQUEIDENTIFIER,
@ResultCode_5faf883e4b1a NVARCHAR(255),
@IsSuccess_5faf883e4b1a BIT,
@Description_5faf883e4b1a NVARCHAR(MAX)
SET
  @ID_5faf883e4b1a = 'B9658328-6898-4A58-B8B9-BF2CB120C22A'
SET
  @ActionID_5faf883e4b1a = '7F0A0004-A1B2-4C3D-8E4F-000000000004'
SET
  @ResultCode_5faf883e4b1a = N'RESPONSE_LOAD_FAILED'
SET
  @IsSuccess_5faf883e4b1a = 0
SET
  @Description_5faf883e4b1a = N'The FormResponse could not be loaded.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_5faf883e4b1a
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_5faf883e4b1a,
  @ActionID = @ActionID_5faf883e4b1a,
  @ResultCode = @ResultCode_5faf883e4b1a,
  @IsSuccess = @IsSuccess_5faf883e4b1a,
  @Description = @Description_5faf883e4b1a
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_5faf883e4b1a,
  @ActionID = @ActionID_5faf883e4b1a,
  @ResultCode = @ResultCode_5faf883e4b1a,
  @IsSuccess = @IsSuccess_5faf883e4b1a,
  @Description = @Description_5faf883e4b1a
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_38fee91f77e1 UNIQUEIDENTIFIER,
@ActionID_38fee91f77e1 UNIQUEIDENTIFIER,
@ResultCode_38fee91f77e1 NVARCHAR(255),
@IsSuccess_38fee91f77e1 BIT,
@Description_38fee91f77e1 NVARCHAR(MAX)
SET
  @ID_38fee91f77e1 = 'F842660C-2A55-48A8-A18A-68F57AA146AA'
SET
  @ActionID_38fee91f77e1 = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_38fee91f77e1 = N'SUCCESS'
SET
  @IsSuccess_38fee91f77e1 = 1
SET
  @Description_38fee91f77e1 = N'The action completed and did its work.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_38fee91f77e1
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_38fee91f77e1,
  @ActionID = @ActionID_38fee91f77e1,
  @ResultCode = @ResultCode_38fee91f77e1,
  @IsSuccess = @IsSuccess_38fee91f77e1,
  @Description = @Description_38fee91f77e1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_38fee91f77e1,
  @ActionID = @ActionID_38fee91f77e1,
  @ResultCode = @ResultCode_38fee91f77e1,
  @IsSuccess = @IsSuccess_38fee91f77e1,
  @Description = @Description_38fee91f77e1
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_82669173550b UNIQUEIDENTIFIER,
@ActionID_82669173550b UNIQUEIDENTIFIER,
@ResultCode_82669173550b NVARCHAR(255),
@IsSuccess_82669173550b BIT,
@Description_82669173550b NVARCHAR(MAX)
SET
  @ID_82669173550b = 'AEC1F6DE-0624-4279-9FFE-C53AF0023435'
SET
  @ActionID_82669173550b = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_82669173550b = N'SKIPPED'
SET
  @IsSuccess_82669173550b = 1
SET
  @Description_82669173550b = N'Nothing to do for this response, so the action intentionally did nothing.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_82669173550b
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_82669173550b,
  @ActionID = @ActionID_82669173550b,
  @ResultCode = @ResultCode_82669173550b,
  @IsSuccess = @IsSuccess_82669173550b,
  @Description = @Description_82669173550b
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_82669173550b,
  @ActionID = @ActionID_82669173550b,
  @ResultCode = @ResultCode_82669173550b,
  @IsSuccess = @IsSuccess_82669173550b,
  @Description = @Description_82669173550b
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_f16f3d95f167 UNIQUEIDENTIFIER,
@ActionID_f16f3d95f167 UNIQUEIDENTIFIER,
@ResultCode_f16f3d95f167 NVARCHAR(255),
@IsSuccess_f16f3d95f167 BIT,
@Description_f16f3d95f167 NVARCHAR(MAX)
SET
  @ID_f16f3d95f167 = '08262F7D-BB73-46DC-80A4-82CD7194A7E8'
SET
  @ActionID_f16f3d95f167 = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_f16f3d95f167 = N'MISSING_PARAMETERS'
SET
  @IsSuccess_f16f3d95f167 = 0
SET
  @Description_f16f3d95f167 = N'The required FormResponseID parameter was not provided.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_f16f3d95f167
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_f16f3d95f167,
  @ActionID = @ActionID_f16f3d95f167,
  @ResultCode = @ResultCode_f16f3d95f167,
  @IsSuccess = @IsSuccess_f16f3d95f167,
  @Description = @Description_f16f3d95f167
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_f16f3d95f167,
  @ActionID = @ActionID_f16f3d95f167,
  @ResultCode = @ResultCode_f16f3d95f167,
  @IsSuccess = @IsSuccess_f16f3d95f167,
  @Description = @Description_f16f3d95f167
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_b466672f540c UNIQUEIDENTIFIER,
@ActionID_b466672f540c UNIQUEIDENTIFIER,
@ResultCode_b466672f540c NVARCHAR(255),
@IsSuccess_b466672f540c BIT,
@Description_b466672f540c NVARCHAR(MAX)
SET
  @ID_b466672f540c = 'EF46E671-D52E-4187-B756-7720D086790F'
SET
  @ActionID_b466672f540c = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_b466672f540c = N'ENTITY_CLASS_UNREGISTERED'
SET
  @IsSuccess_b466672f540c = 0
SET
  @Description_b466672f540c = N'A sibling-app entity class the action needs is not registered in this process (the host did not load that app''s server package).' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_b466672f540c
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_b466672f540c,
  @ActionID = @ActionID_b466672f540c,
  @ResultCode = @ResultCode_b466672f540c,
  @IsSuccess = @IsSuccess_b466672f540c,
  @Description = @Description_b466672f540c
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_b466672f540c,
  @ActionID = @ActionID_b466672f540c,
  @ResultCode = @ResultCode_b466672f540c,
  @IsSuccess = @IsSuccess_b466672f540c,
  @Description = @Description_b466672f540c
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_9d444fa9642c UNIQUEIDENTIFIER,
@ActionID_9d444fa9642c UNIQUEIDENTIFIER,
@ResultCode_9d444fa9642c NVARCHAR(255),
@IsSuccess_9d444fa9642c BIT,
@Description_9d444fa9642c NVARCHAR(MAX)
SET
  @ID_9d444fa9642c = '21040D42-B46D-448F-9D1D-14223A49347A'
SET
  @ActionID_9d444fa9642c = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_9d444fa9642c = N'RESPONSE_LOAD_FAILED'
SET
  @IsSuccess_9d444fa9642c = 0
SET
  @Description_9d444fa9642c = N'The FormResponse could not be loaded.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_9d444fa9642c
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_9d444fa9642c,
  @ActionID = @ActionID_9d444fa9642c,
  @ResultCode = @ResultCode_9d444fa9642c,
  @IsSuccess = @IsSuccess_9d444fa9642c,
  @Description = @Description_9d444fa9642c
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_9d444fa9642c,
  @ActionID = @ActionID_9d444fa9642c,
  @ResultCode = @ResultCode_9d444fa9642c,
  @IsSuccess = @IsSuccess_9d444fa9642c,
  @Description = @Description_9d444fa9642c
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_af2e99ab5b16 UNIQUEIDENTIFIER,
@ActionID_af2e99ab5b16 UNIQUEIDENTIFIER,
@ResultCode_af2e99ab5b16 NVARCHAR(255),
@IsSuccess_af2e99ab5b16 BIT,
@Description_af2e99ab5b16 NVARCHAR(MAX)
SET
  @ID_af2e99ab5b16 = '22572923-3744-4451-A5FA-24FA0E239746'
SET
  @ActionID_af2e99ab5b16 = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_af2e99ab5b16 = N'TASK_TYPE_LOOKUP_FAILED'
SET
  @IsSuccess_af2e99ab5b16 = 0
SET
  @Description_af2e99ab5b16 = N'The Task Types could not be read.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_af2e99ab5b16
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_af2e99ab5b16,
  @ActionID = @ActionID_af2e99ab5b16,
  @ResultCode = @ResultCode_af2e99ab5b16,
  @IsSuccess = @IsSuccess_af2e99ab5b16,
  @Description = @Description_af2e99ab5b16
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_af2e99ab5b16,
  @ActionID = @ActionID_af2e99ab5b16,
  @ResultCode = @ResultCode_af2e99ab5b16,
  @IsSuccess = @IsSuccess_af2e99ab5b16,
  @Description = @Description_af2e99ab5b16
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_f144d4f81e8e UNIQUEIDENTIFIER,
@ActionID_f144d4f81e8e UNIQUEIDENTIFIER,
@ResultCode_f144d4f81e8e NVARCHAR(255),
@IsSuccess_f144d4f81e8e BIT,
@Description_f144d4f81e8e NVARCHAR(MAX)
SET
  @ID_f144d4f81e8e = '73327BA8-C516-4B17-891C-B2CCB3BC4E3B'
SET
  @ActionID_f144d4f81e8e = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_f144d4f81e8e = N'NO_TASK_TYPE'
SET
  @IsSuccess_f144d4f81e8e = 0
SET
  @Description_f144d4f81e8e = N'No Task Type was available to assign to the follow-up task.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_f144d4f81e8e
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_f144d4f81e8e,
  @ActionID = @ActionID_f144d4f81e8e,
  @ResultCode = @ResultCode_f144d4f81e8e,
  @IsSuccess = @IsSuccess_f144d4f81e8e,
  @Description = @Description_f144d4f81e8e
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_f144d4f81e8e,
  @ActionID = @ActionID_f144d4f81e8e,
  @ResultCode = @ResultCode_f144d4f81e8e,
  @IsSuccess = @IsSuccess_f144d4f81e8e,
  @Description = @Description_f144d4f81e8e
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_6587dd2f3591 UNIQUEIDENTIFIER,
@ActionID_6587dd2f3591 UNIQUEIDENTIFIER,
@ResultCode_6587dd2f3591 NVARCHAR(255),
@IsSuccess_6587dd2f3591 BIT,
@Description_6587dd2f3591 NVARCHAR(MAX)
SET
  @ID_6587dd2f3591 = '21E7DE8E-EC01-49F0-B474-C1A9DA3239FF'
SET
  @ActionID_6587dd2f3591 = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_6587dd2f3591 = N'TASK_SAVE_FAILED'
SET
  @IsSuccess_6587dd2f3591 = 0
SET
  @Description_6587dd2f3591 = N'The follow-up Task could not be saved.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_6587dd2f3591
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_6587dd2f3591,
  @ActionID = @ActionID_6587dd2f3591,
  @ResultCode = @ResultCode_6587dd2f3591,
  @IsSuccess = @IsSuccess_6587dd2f3591,
  @Description = @Description_6587dd2f3591
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_6587dd2f3591,
  @ActionID = @ActionID_6587dd2f3591,
  @ResultCode = @ResultCode_6587dd2f3591,
  @IsSuccess = @IsSuccess_6587dd2f3591,
  @Description = @Description_6587dd2f3591
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_e4fbd79ac20c UNIQUEIDENTIFIER,
@ActionID_e4fbd79ac20c UNIQUEIDENTIFIER,
@ResultCode_e4fbd79ac20c NVARCHAR(255),
@IsSuccess_e4fbd79ac20c BIT,
@Description_e4fbd79ac20c NVARCHAR(MAX)
SET
  @ID_e4fbd79ac20c = '2E58E51C-28F5-4907-B35A-4DF90A62B565'
SET
  @ActionID_e4fbd79ac20c = '7F0A0005-A1B2-4C3D-8E4F-000000000005'
SET
  @ResultCode_e4fbd79ac20c = N'TASK_LINK_FAILED'
SET
  @IsSuccess_e4fbd79ac20c = 0
SET
  @Description_e4fbd79ac20c = N'The Task was saved but its link to the FormResponse could not be saved.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_e4fbd79ac20c
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_e4fbd79ac20c,
  @ActionID = @ActionID_e4fbd79ac20c,
  @ResultCode = @ResultCode_e4fbd79ac20c,
  @IsSuccess = @IsSuccess_e4fbd79ac20c,
  @Description = @Description_e4fbd79ac20c
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_e4fbd79ac20c,
  @ActionID = @ActionID_e4fbd79ac20c,
  @ResultCode = @ResultCode_e4fbd79ac20c,
  @IsSuccess = @IsSuccess_e4fbd79ac20c,
  @Description = @Description_e4fbd79ac20c
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_e6a8935b9f2f UNIQUEIDENTIFIER,
@ActionID_e6a8935b9f2f UNIQUEIDENTIFIER,
@ResultCode_e6a8935b9f2f NVARCHAR(255),
@IsSuccess_e6a8935b9f2f BIT,
@Description_e6a8935b9f2f NVARCHAR(MAX)
SET
  @ID_e6a8935b9f2f = '933A0E0B-48F6-45F5-88C0-EAF61800E131'
SET
  @ActionID_e6a8935b9f2f = '7F0A0006-A1B2-4C3D-8E4F-000000000006'
SET
  @ResultCode_e6a8935b9f2f = N'SUCCESS'
SET
  @IsSuccess_e6a8935b9f2f = 1
SET
  @Description_e6a8935b9f2f = N'The action completed and did its work.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_e6a8935b9f2f
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_e6a8935b9f2f,
  @ActionID = @ActionID_e6a8935b9f2f,
  @ResultCode = @ResultCode_e6a8935b9f2f,
  @IsSuccess = @IsSuccess_e6a8935b9f2f,
  @Description = @Description_e6a8935b9f2f
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_e6a8935b9f2f,
  @ActionID = @ActionID_e6a8935b9f2f,
  @ResultCode = @ResultCode_e6a8935b9f2f,
  @IsSuccess = @IsSuccess_e6a8935b9f2f,
  @Description = @Description_e6a8935b9f2f
END;

GO

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_aaf0e1fb738f UNIQUEIDENTIFIER,
@ActionID_aaf0e1fb738f UNIQUEIDENTIFIER,
@ResultCode_aaf0e1fb738f NVARCHAR(255),
@IsSuccess_aaf0e1fb738f BIT,
@Description_aaf0e1fb738f NVARCHAR(MAX)
SET
  @ID_aaf0e1fb738f = '791B9A46-89AB-4A25-AE73-871A44E468D5'
SET
  @ActionID_aaf0e1fb738f = '7F0A0006-A1B2-4C3D-8E4F-000000000006'
SET
  @ResultCode_aaf0e1fb738f = N'SKIPPED'
SET
  @IsSuccess_aaf0e1fb738f = 1
SET
  @Description_aaf0e1fb738f = N'Nothing to do for this response, so the action intentionally did nothing.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_aaf0e1fb738f
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_aaf0e1fb738f,
  @ActionID = @ActionID_aaf0e1fb738f,
  @ResultCode = @ResultCode_aaf0e1fb738f,
  @IsSuccess = @IsSuccess_aaf0e1fb738f,
  @Description = @Description_aaf0e1fb738f
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_aaf0e1fb738f,
  @ActionID = @ActionID_aaf0e1fb738f,
  @ResultCode = @ResultCode_aaf0e1fb738f,
  @IsSuccess = @IsSuccess_aaf0e1fb738f,
  @Description = @Description_aaf0e1fb738f
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_bb5af7757913 UNIQUEIDENTIFIER,
@ActionID_bb5af7757913 UNIQUEIDENTIFIER,
@ResultCode_bb5af7757913 NVARCHAR(255),
@IsSuccess_bb5af7757913 BIT,
@Description_bb5af7757913 NVARCHAR(MAX)
SET
  @ID_bb5af7757913 = '3BECFA1B-9352-4D6F-A3F4-2F75164A82B5'
SET
  @ActionID_bb5af7757913 = '7F0A0006-A1B2-4C3D-8E4F-000000000006'
SET
  @ResultCode_bb5af7757913 = N'MISSING_PARAMETERS'
SET
  @IsSuccess_bb5af7757913 = 0
SET
  @Description_bb5af7757913 = N'The required FormResponseID parameter was not provided.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_bb5af7757913
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_bb5af7757913,
  @ActionID = @ActionID_bb5af7757913,
  @ResultCode = @ResultCode_bb5af7757913,
  @IsSuccess = @IsSuccess_bb5af7757913,
  @Description = @Description_bb5af7757913
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_bb5af7757913,
  @ActionID = @ActionID_bb5af7757913,
  @ResultCode = @ResultCode_bb5af7757913,
  @IsSuccess = @IsSuccess_bb5af7757913,
  @Description = @Description_bb5af7757913
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_3c4276736517 UNIQUEIDENTIFIER,
@ActionID_3c4276736517 UNIQUEIDENTIFIER,
@ResultCode_3c4276736517 NVARCHAR(255),
@IsSuccess_3c4276736517 BIT,
@Description_3c4276736517 NVARCHAR(MAX)
SET
  @ID_3c4276736517 = '03865682-2AC2-40A2-8860-4886A6FBB071'
SET
  @ActionID_3c4276736517 = '7F0A0006-A1B2-4C3D-8E4F-000000000006'
SET
  @ResultCode_3c4276736517 = N'RESPONSE_LOAD_FAILED'
SET
  @IsSuccess_3c4276736517 = 0
SET
  @Description_3c4276736517 = N'The FormResponse could not be loaded.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_3c4276736517
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_3c4276736517,
  @ActionID = @ActionID_3c4276736517,
  @ResultCode = @ResultCode_3c4276736517,
  @IsSuccess = @IsSuccess_3c4276736517,
  @Description = @Description_3c4276736517
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_3c4276736517,
  @ActionID = @ActionID_3c4276736517,
  @ResultCode = @ResultCode_3c4276736517,
  @IsSuccess = @IsSuccess_3c4276736517,
  @Description = @Description_3c4276736517
END;

-- Save MJ: Action Result Codes (core SP call only)
DECLARE @ID_60013db8fce1 UNIQUEIDENTIFIER,
@ActionID_60013db8fce1 UNIQUEIDENTIFIER,
@ResultCode_60013db8fce1 NVARCHAR(255),
@IsSuccess_60013db8fce1 BIT,
@Description_60013db8fce1 NVARCHAR(MAX)
SET
  @ID_60013db8fce1 = '1C49B74C-DC90-487B-994F-58772DF287C9'
SET
  @ActionID_60013db8fce1 = '7F0A0006-A1B2-4C3D-8E4F-000000000006'
SET
  @ResultCode_60013db8fce1 = N'SCORES_NOT_SAVED'
SET
  @IsSuccess_60013db8fce1 = 0
SET
  @Description_60013db8fce1 = N'The analysis ran but none of the per-answer scores could be saved.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ActionResultCode]
    WHERE
      [ID] = @ID_60013db8fce1
  )
BEGIN
EXEC [${mjSchema}].spCreateActionResultCode @ID = @ID_60013db8fce1,
  @ActionID = @ActionID_60013db8fce1,
  @ResultCode = @ResultCode_60013db8fce1,
  @IsSuccess = @IsSuccess_60013db8fce1,
  @Description = @Description_60013db8fce1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateActionResultCode @ID = @ID_60013db8fce1,
  @ActionID = @ActionID_60013db8fce1,
  @ResultCode = @ResultCode_60013db8fce1,
  @IsSuccess = @IsSuccess_60013db8fce1,
  @Description = @Description_60013db8fce1
END;

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
}' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      [ID] = @ID_3062b0c97736
  )
BEGIN
EXEC [${mjSchema}].spCreateAPIScope @ID = @ID_3062b0c97736,
  @Name = @Name_3062b0c97736,
  @Category = @Category_3062b0c97736,
  @Description = @Description_3062b0c97736,
  @ParentID = @ParentID_3062b0c97736,
  @ParentID_Clear = 1,
  @FullPath = @FullPath_3062b0c97736,
  @ResourceType = @ResourceType_3062b0c97736,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_3062b0c97736,
  @UIConfig = @UIConfig_3062b0c97736
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateAPIScope @ID = @ID_3062b0c97736,
  @Name = @Name_3062b0c97736,
  @Category = @Category_3062b0c97736,
  @Description = @Description_3062b0c97736,
  @ParentID = @ParentID_3062b0c97736,
  @ParentID_Clear = 1,
  @FullPath = @FullPath_3062b0c97736,
  @ResourceType = @ResourceType_3062b0c97736,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_3062b0c97736,
  @UIConfig = @UIConfig_3062b0c97736
END;

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
  @ParentID_d2c5c5180b90 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      LOWER([FullPath]) = LOWER(N'forms')
  )
SET
  @FullPath_d2c5c5180b90 = N'forms:read'
SET
  @IsActive_d2c5c5180b90 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      [ID] = @ID_d2c5c5180b90
  )
BEGIN
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
  @UIConfig_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateAPIScope @ID = @ID_d2c5c5180b90,
  @Name = @Name_d2c5c5180b90,
  @Category = @Category_d2c5c5180b90,
  @Description = @Description_d2c5c5180b90,
  @ParentID = @ParentID_d2c5c5180b90,
  @FullPath = @FullPath_d2c5c5180b90,
  @ResourceType = @ResourceType_d2c5c5180b90,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_d2c5c5180b90,
  @UIConfig = @UIConfig_d2c5c5180b90,
  @UIConfig_Clear = 1
END;

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
  @ParentID_e6bdbe8a9664 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      LOWER([FullPath]) = LOWER(N'forms')
  )
SET
  @FullPath_e6bdbe8a9664 = N'forms:write'
SET
  @IsActive_e6bdbe8a9664 = 1 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      [ID] = @ID_e6bdbe8a9664
  )
BEGIN
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
  @UIConfig_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateAPIScope @ID = @ID_e6bdbe8a9664,
  @Name = @Name_e6bdbe8a9664,
  @Category = @Category_e6bdbe8a9664,
  @Description = @Description_e6bdbe8a9664,
  @ParentID = @ParentID_e6bdbe8a9664,
  @FullPath = @FullPath_e6bdbe8a9664,
  @ResourceType = @ResourceType_e6bdbe8a9664,
  @ResourceType_Clear = 1,
  @IsActive = @IsActive_e6bdbe8a9664,
  @UIConfig = @UIConfig_e6bdbe8a9664,
  @UIConfig_Clear = 1
END;

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
  @ApplicationID_13aa9c28bfb1 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIApplication]
    WHERE
      LOWER([Name]) = LOWER(N'MJAPI')
  )
SET
  @ScopeID_13aa9c28bfb1 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      LOWER([FullPath]) = LOWER(N'forms:read')
  )
SET
  @ResourcePattern_13aa9c28bfb1 = N'*'
SET
  @PatternType_13aa9c28bfb1 = N'Include'
SET
  @IsDeny_13aa9c28bfb1 = 0
SET
  @Priority_13aa9c28bfb1 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[APIApplicationScope]
    WHERE
      [ID] = @ID_13aa9c28bfb1
  )
BEGIN
EXEC [${mjSchema}].spCreateAPIApplicationScope @ID = @ID_13aa9c28bfb1,
  @ApplicationID = @ApplicationID_13aa9c28bfb1,
  @ScopeID = @ScopeID_13aa9c28bfb1,
  @ResourcePattern = @ResourcePattern_13aa9c28bfb1,
  @PatternType = @PatternType_13aa9c28bfb1,
  @IsDeny = @IsDeny_13aa9c28bfb1,
  @Priority = @Priority_13aa9c28bfb1,
  @RowFilterID = @RowFilterID_13aa9c28bfb1,
  @RowFilterID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateAPIApplicationScope @ID = @ID_13aa9c28bfb1,
  @ApplicationID = @ApplicationID_13aa9c28bfb1,
  @ScopeID = @ScopeID_13aa9c28bfb1,
  @ResourcePattern = @ResourcePattern_13aa9c28bfb1,
  @PatternType = @PatternType_13aa9c28bfb1,
  @IsDeny = @IsDeny_13aa9c28bfb1,
  @Priority = @Priority_13aa9c28bfb1,
  @RowFilterID = @RowFilterID_13aa9c28bfb1,
  @RowFilterID_Clear = 1
END;

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
  @ApplicationID_55d42bd7b44f = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIApplication]
    WHERE
      LOWER([Name]) = LOWER(N'MJAPI')
  )
SET
  @ScopeID_55d42bd7b44f = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[APIScope]
    WHERE
      LOWER([FullPath]) = LOWER(N'forms:write')
  )
SET
  @ResourcePattern_55d42bd7b44f = N'*'
SET
  @PatternType_55d42bd7b44f = N'Include'
SET
  @IsDeny_55d42bd7b44f = 0
SET
  @Priority_55d42bd7b44f = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[APIApplicationScope]
    WHERE
      [ID] = @ID_55d42bd7b44f
  )
BEGIN
EXEC [${mjSchema}].spCreateAPIApplicationScope @ID = @ID_55d42bd7b44f,
  @ApplicationID = @ApplicationID_55d42bd7b44f,
  @ScopeID = @ScopeID_55d42bd7b44f,
  @ResourcePattern = @ResourcePattern_55d42bd7b44f,
  @PatternType = @PatternType_55d42bd7b44f,
  @IsDeny = @IsDeny_55d42bd7b44f,
  @Priority = @Priority_55d42bd7b44f,
  @RowFilterID = @RowFilterID_55d42bd7b44f,
  @RowFilterID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateAPIApplicationScope @ID = @ID_55d42bd7b44f,
  @ApplicationID = @ApplicationID_55d42bd7b44f,
  @ScopeID = @ScopeID_55d42bd7b44f,
  @ResourcePattern = @ResourcePattern_55d42bd7b44f,
  @PatternType = @PatternType_55d42bd7b44f,
  @IsDeny = @IsDeny_55d42bd7b44f,
  @Priority = @Priority_55d42bd7b44f,
  @RowFilterID = @RowFilterID_55d42bd7b44f,
  @RowFilterID_Clear = 1
END;

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
  @Description_9ab2e10693f8 = N'MJ Forms: publish, clone, template, archive and restore forms; issue and manage share links; configure on-submit automations; report on responses; and the respondent read and save path.' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      [ID] = @ID_9ab2e10693f8
  )
BEGIN
EXEC [${mjSchema}].spCreateRemoteOperationCategory @ID = @ID_9ab2e10693f8,
  @Name = @Name_9ab2e10693f8,
  @Description = @Description_9ab2e10693f8,
  @ParentID = @ParentID_9ab2e10693f8,
  @ParentID_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperationCategory @ID = @ID_9ab2e10693f8,
  @Name = @Name_9ab2e10693f8,
  @Description = @Description_9ab2e10693f8,
  @ParentID = @ParentID_9ab2e10693f8,
  @ParentID_Clear = 1
END;

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
  @CategoryID_04faee29678c = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_04faee29678c = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_04faee29678c
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_04faee29678c,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_97dd7bce9c45 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_97dd7bce9c45 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_97dd7bce9c45
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_97dd7bce9c45,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_0d90c1c0485f = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_0d90c1c0485f = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_0d90c1c0485f
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_0d90c1c0485f,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_ec9d249b759c = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_ec9d249b759c = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_ec9d249b759c
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_ec9d249b759c,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_83ad4b6e2081 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_83ad4b6e2081 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_83ad4b6e2081
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_83ad4b6e2081,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_e7723c3bf3a5 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_e7723c3bf3a5 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_e7723c3bf3a5
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_e7723c3bf3a5,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_3662cdcfca09 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_3662cdcfca09 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_3662cdcfca09
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_3662cdcfca09,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_815b06422f54 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_815b06422f54 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_815b06422f54
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_815b06422f54,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_e7008710a52f = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_e7008710a52f = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_e7008710a52f
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_e7008710a52f,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_6e539bd8b828 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_6e539bd8b828 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_6e539bd8b828
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_6e539bd8b828,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_1d85b9d6f52a = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_1d85b9d6f52a = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_1d85b9d6f52a
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_1d85b9d6f52a,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_e034f02d1e30 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_e034f02d1e30 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_e034f02d1e30
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_e034f02d1e30,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_7a5d91e58541 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_7a5d91e58541 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_7a5d91e58541
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_7a5d91e58541,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_9e2ec47969cd = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_9e2ec47969cd = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_9e2ec47969cd
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_9e2ec47969cd,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_7594f627451e = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
    /**
     * Only responses whose linked person''s name, or any text answer the caller may read, contains
     * this, matched literally. Blank or omitted: no narrowing. At most 100 characters.
     */
    Search?: string | null;
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
  @CodeLocked_7594f627451e = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_7594f627451e
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_7594f627451e,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_49a8255d8662 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_49a8255d8662 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_49a8255d8662
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_49a8255d8662,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_371f9a114c0c = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_371f9a114c0c = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_371f9a114c0c
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_371f9a114c0c,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_67c7b27443b3 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_67c7b27443b3 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_67c7b27443b3
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_67c7b27443b3,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_c0f0a489b7a8 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_c0f0a489b7a8 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_c0f0a489b7a8
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_c0f0a489b7a8,
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
  @Libraries_Clear = 1
END;

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
  @CategoryID_a53fff5103a7 = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[RemoteOperationCategory]
    WHERE
      LOWER([Name]) = LOWER(N'Forms')
  )
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
  @CodeLocked_a53fff5103a7 = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[RemoteOperation]
    WHERE
      [ID] = @ID_a53fff5103a7
  )
BEGIN
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
  @Libraries_Clear = 1
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateRemoteOperation @ID = @ID_a53fff5103a7,
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
  @Libraries_Clear = 1
END;

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
  @NotificationsAvailable_644e59b8738c = 0 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ScheduledJobType]
    WHERE
      [ID] = @ID_644e59b8738c
  )
BEGIN
EXEC [${mjSchema}].spCreateScheduledJobType @ID = @ID_644e59b8738c,
  @Name = @Name_644e59b8738c,
  @Description = @Description_644e59b8738c,
  @DriverClass = @DriverClass_644e59b8738c,
  @DomainRunEntity = @DomainRunEntity_644e59b8738c,
  @DomainRunEntityFKey = @DomainRunEntityFKey_644e59b8738c,
  @DomainRunEntityFKey_Clear = 1,
  @NotificationsAvailable = @NotificationsAvailable_644e59b8738c
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateScheduledJobType @ID = @ID_644e59b8738c,
  @Name = @Name_644e59b8738c,
  @Description = @Description_644e59b8738c,
  @DriverClass = @DriverClass_644e59b8738c,
  @DomainRunEntity = @DomainRunEntity_644e59b8738c,
  @DomainRunEntityFKey = @DomainRunEntityFKey_644e59b8738c,
  @DomainRunEntityFKey_Clear = 1,
  @NotificationsAvailable = @NotificationsAvailable_644e59b8738c
END;

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
  @JobTypeID_c909b78228cb = (
    SELECT
      [ID]
    FROM
      [${mjSchema}].[ScheduledJobType]
    WHERE
      LOWER([DriverClass]) = LOWER(N'FormsAutomationDrainDriver')
  )
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
  @MissedRunPolicy_c909b78228cb = N'RunOnce' IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[ScheduledJob]
    WHERE
      [ID] = @ID_c909b78228cb
  )
BEGIN
EXEC [${mjSchema}].spCreateScheduledJob @ID = @ID_c909b78228cb,
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
  @MissedRunPolicy = @MissedRunPolicy_c909b78228cb
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateScheduledJob @ID = @ID_c909b78228cb,
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
  @MissedRunPolicy = @MissedRunPolicy_c909b78228cb
END;

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
  @Priority_095a68d3fee7 = 5 IF NOT EXISTS (
    SELECT
      1
    FROM
      [${mjSchema}].[UserNotificationType]
    WHERE
      [ID] = @ID_095a68d3fee7
  )
BEGIN
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
  @Priority = @Priority_095a68d3fee7
END ELSE
BEGIN
EXEC [${mjSchema}].spUpdateUserNotificationType @ID = @ID_095a68d3fee7,
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
  @Priority = @Priority_095a68d3fee7
END;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_dc5548bfbccf NVARCHAR(MAX),
@DetectionMethod_dc5548bfbccf NVARCHAR(50),
@ID_dc5548bfbccf UNIQUEIDENTIFIER
SET
  @Description_dc5548bfbccf = N'Total number of fully completed form responses.'
SET
  @DetectionMethod_dc5548bfbccf = N'AI'
SET
  @ID_dc5548bfbccf = '4306B676-270B-4B38-946C-08BDD1F91A7E' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_dc5548bfbccf,
  @DetectionMethod = @DetectionMethod_dc5548bfbccf,
  @ID = @ID_dc5548bfbccf;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_241af84eb5db NVARCHAR(MAX),
@DetectionMethod_241af84eb5db NVARCHAR(50),
@ID_241af84eb5db UNIQUEIDENTIFIER
SET
  @Description_241af84eb5db = N'Total number of form responses marked as disqualified.'
SET
  @DetectionMethod_241af84eb5db = N'AI'
SET
  @ID_241af84eb5db = '767D6D7B-97EC-4C48-8B2C-094AE53B97C1' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_241af84eb5db,
  @DetectionMethod = @DetectionMethod_241af84eb5db,
  @ID = @ID_241af84eb5db;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_9380d90cbf70 NVARCHAR(MAX),
@DetectionMethod_9380d90cbf70 NVARCHAR(50),
@ID_9380d90cbf70 UNIQUEIDENTIFIER
SET
  @Description_9380d90cbf70 = N'Total number of partially completed form responses.'
SET
  @DetectionMethod_9380d90cbf70 = N'AI'
SET
  @ID_9380d90cbf70 = '6BA92C59-044A-4318-BB35-14FE455B924C' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_9380d90cbf70,
  @DetectionMethod = @DetectionMethod_9380d90cbf70,
  @ID = @ID_9380d90cbf70;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_cc51f7bd9a16 NVARCHAR(MAX),
@DetectionMethod_cc51f7bd9a16 NVARCHAR(50),
@ID_cc51f7bd9a16 UNIQUEIDENTIFIER
SET
  @Description_cc51f7bd9a16 = N'Total number of form responses created, regardless of status.'
SET
  @DetectionMethod_cc51f7bd9a16 = N'AI'
SET
  @ID_cc51f7bd9a16 = '2CA5DD0C-4E43-4CFF-BC06-BE44FEE0EA38' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_cc51f7bd9a16,
  @DetectionMethod = @DetectionMethod_cc51f7bd9a16,
  @ID = @ID_cc51f7bd9a16;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_f133eb6c1818 NVARCHAR(MAX),
@DetectionMethod_f133eb6c1818 NVARCHAR(50),
@ID_f133eb6c1818 UNIQUEIDENTIFIER
SET
  @Description_f133eb6c1818 = N'Timestamp when the most recent completed form response was submitted.'
SET
  @DetectionMethod_f133eb6c1818 = N'AI'
SET
  @ID_f133eb6c1818 = '6C53716D-96BD-481E-8A43-F1C2A4305853' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_f133eb6c1818,
  @DetectionMethod = @DetectionMethod_f133eb6c1818,
  @ID = @ID_f133eb6c1818;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_95383a931af1 NVARCHAR(MAX),
@DetectionMethod_95383a931af1 NVARCHAR(50),
@ID_95383a931af1 UNIQUEIDENTIFIER
SET
  @Description_95383a931af1 = N'Median duration in seconds taken to complete the form for submissions completed within 24 hours.'
SET
  @DetectionMethod_95383a931af1 = N'AI'
SET
  @ID_95383a931af1 = '5A80F30A-94A1-401B-9A90-F618504BA786' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_95383a931af1,
  @DetectionMethod = @DetectionMethod_95383a931af1,
  @ID = @ID_95383a931af1;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_4e43225a7105 NVARCHAR(MAX),
@ID_4e43225a7105 UNIQUEIDENTIFIER
SET
  @Description_4e43225a7105 = N'Filters response metrics to a specific version of the form; if omitted, responses across all versions are included.'
SET
  @ID_4e43225a7105 = '7EF57C7B-B5D8-4956-94D3-25AA3221655E' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_4e43225a7105,
  @ID = @ID_4e43225a7105;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_fb60b4ed7767 NVARCHAR(MAX),
@ID_fb60b4ed7767 UNIQUEIDENTIFIER
SET
  @Description_fb60b4ed7767 = N'The unique identifier of the form for which to aggregate completion statistics.'
SET
  @ID_fb60b4ed7767 = '5669DFBB-93E5-4041-8BCE-D331B025C592' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_fb60b4ed7767,
  @ID = @ID_fb60b4ed7767;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_5536e0dc5fea NVARCHAR(MAX),
@DetectionMethod_5536e0dc5fea NVARCHAR(50),
@ID_5536e0dc5fea UNIQUEIDENTIFIER
SET
  @Description_5536e0dc5fea = N'Unique identifier of the form question associated with the summarized answer values.'
SET
  @DetectionMethod_5536e0dc5fea = N'AI'
SET
  @ID_5536e0dc5fea = '9EBAE504-0019-4814-AA9C-01F964B1B839' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_5536e0dc5fea,
  @DetectionMethod = @DetectionMethod_5536e0dc5fea,
  @ID = @ID_5536e0dc5fea;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_29732f670d03 NVARCHAR(MAX),
@DetectionMethod_29732f670d03 NVARCHAR(50),
@ID_29732f670d03 UNIQUEIDENTIFIER
SET
  @Description_29732f670d03 = N'Category of the submitted answer value, such as Text, Numeric, Boolean, or Date.'
SET
  @DetectionMethod_29732f670d03 = N'AI'
SET
  @ID_29732f670d03 = '105C0101-BBF5-42EB-8F59-96798B0747E1' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_29732f670d03,
  @DetectionMethod = @DetectionMethod_29732f670d03,
  @ID = @ID_29732f670d03;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_3f47202490a8 NVARCHAR(MAX),
@DetectionMethod_3f47202490a8 NVARCHAR(50),
@ID_3f47202490a8 UNIQUEIDENTIFIER
SET
  @Description_3f47202490a8 = N'Total number of times this specific answer value was submitted across all completed form responses.'
SET
  @DetectionMethod_3f47202490a8 = N'AI'
SET
  @ID_3f47202490a8 = '845B37AF-CD09-4D7A-BECE-A795BB6A8740' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_3f47202490a8,
  @DetectionMethod = @DetectionMethod_3f47202490a8,
  @ID = @ID_3f47202490a8;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_ccdc0c34f109 NVARCHAR(MAX),
@DetectionMethod_ccdc0c34f109 NVARCHAR(50),
@ID_ccdc0c34f109 UNIQUEIDENTIFIER
SET
  @Description_ccdc0c34f109 = N'Text representation of the specific answer choice or value selected by respondents.'
SET
  @DetectionMethod_ccdc0c34f109 = N'AI'
SET
  @ID_ccdc0c34f109 = '75259CA6-221F-41B1-9F67-C40A68617855' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_ccdc0c34f109,
  @DetectionMethod = @DetectionMethod_ccdc0c34f109,
  @ID = @ID_ccdc0c34f109;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_8b840164046b NVARCHAR(MAX),
@DetectionMethod_8b840164046b NVARCHAR(50),
@ID_8b840164046b UNIQUEIDENTIFIER
SET
  @Description_8b840164046b = N'Total number of distinct complete form responses that provided an answer of this data type for the question.'
SET
  @DetectionMethod_8b840164046b = N'AI'
SET
  @ID_8b840164046b = 'E0A9A4CD-30CC-43DC-963E-E6F5CCF73BC9' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_8b840164046b,
  @DetectionMethod = @DetectionMethod_8b840164046b,
  @ID = @ID_8b840164046b;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_7ba1b2a93fdb NVARCHAR(MAX),
@DetectionMethod_7ba1b2a93fdb NVARCHAR(50),
@ID_7ba1b2a93fdb UNIQUEIDENTIFIER
SET
  @Description_7ba1b2a93fdb = N'Raw numeric value of the answer when the data type is numeric, used for sorting or scale calculations.'
SET
  @DetectionMethod_7ba1b2a93fdb = N'AI'
SET
  @ID_7ba1b2a93fdb = '1E91E652-31B5-476B-AAB2-E9EBC162F4AA' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_7ba1b2a93fdb,
  @DetectionMethod = @DetectionMethod_7ba1b2a93fdb,
  @ID = @ID_7ba1b2a93fdb;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_bcde681a74e8 NVARCHAR(MAX),
@ID_bcde681a74e8 UNIQUEIDENTIFIER
SET
  @Description_bcde681a74e8 = N'Unique identifier of the form for which answer summaries and value counts are generated.'
SET
  @ID_bcde681a74e8 = 'AD97D8D3-4B7B-440D-875E-2A04B4CB7AEB' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_bcde681a74e8,
  @ID = @ID_bcde681a74e8;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_a409a701b022 NVARCHAR(MAX),
@ID_a409a701b022 UNIQUEIDENTIFIER
SET
  @Description_a409a701b022 = N'Optional identifier to filter answers to a specific version of the form; if omitted, responses across all versions are included.'
SET
  @ID_a409a701b022 = 'BD1A4F78-CF41-4AE3-A410-AFE84B2DB78B' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_a409a701b022,
  @ID = @ID_a409a701b022;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_4c4885454343 NVARCHAR(MAX),
@DetectionMethod_4c4885454343 NVARCHAR(50),
@ID_4c4885454343 UNIQUEIDENTIFIER
SET
  @Description_4c4885454343 = N'Comma-separated list of all question types present on the page.'
SET
  @DetectionMethod_4c4885454343 = N'AI'
SET
  @ID_4c4885454343 = 'E7A70EC4-8EDF-44D7-BC76-082D2749DFE2' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_4c4885454343,
  @DetectionMethod = @DetectionMethod_4c4885454343,
  @ID = @ID_4c4885454343;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_77cba32875c9 NVARCHAR(MAX),
@DetectionMethod_77cba32875c9 NVARCHAR(50),
@ID_77cba32875c9 UNIQUEIDENTIFIER
SET
  @Description_77cba32875c9 = N'Total number of unique form responses that included an answer to at least one question on this page.'
SET
  @DetectionMethod_77cba32875c9 = N'AI'
SET
  @ID_77cba32875c9 = 'D19342FE-45F8-44C0-AAEB-5510F96C44F2' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_77cba32875c9,
  @DetectionMethod = @DetectionMethod_77cba32875c9,
  @ID = @ID_77cba32875c9;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_a7c30bb963dc NVARCHAR(MAX),
@DetectionMethod_a7c30bb963dc NVARCHAR(50),
@ID_a7c30bb963dc UNIQUEIDENTIFIER
SET
  @Description_a7c30bb963dc = N'Unique identifier of the form page defined in the form version snapshot.'
SET
  @DetectionMethod_a7c30bb963dc = N'AI'
SET
  @ID_a7c30bb963dc = 'B4A36EA3-6C8D-4732-8B3F-622BF45CF471' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_a7c30bb963dc,
  @DetectionMethod = @DetectionMethod_a7c30bb963dc,
  @ID = @ID_a7c30bb963dc;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_bedadd8c5fd4 NVARCHAR(MAX),
@DetectionMethod_bedadd8c5fd4 NVARCHAR(50),
@ID_bedadd8c5fd4 UNIQUEIDENTIFIER
SET
  @Description_bedadd8c5fd4 = N'Title or heading displayed for the page.'
SET
  @DetectionMethod_bedadd8c5fd4 = N'AI'
SET
  @ID_bedadd8c5fd4 = 'F8DC53E9-A1F0-4D43-8A6B-64318520A95E' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_bedadd8c5fd4,
  @DetectionMethod = @DetectionMethod_bedadd8c5fd4,
  @ID = @ID_bedadd8c5fd4;

-- Save MJ: Query Fields (core SP call only)
DECLARE @Description_06a9778f2603 NVARCHAR(MAX),
@DetectionMethod_06a9778f2603 NVARCHAR(50),
@ID_06a9778f2603 UNIQUEIDENTIFIER
SET
  @Description_06a9778f2603 = N'Numerical position specifying the order in which the page is displayed.'
SET
  @DetectionMethod_06a9778f2603 = N'AI'
SET
  @ID_06a9778f2603 = '643D7C3E-538E-4E12-930D-C85C4FA35233' EXEC [${mjSchema}].spUpdateQueryField @Description = @Description_06a9778f2603,
  @DetectionMethod = @DetectionMethod_06a9778f2603,
  @ID = @ID_06a9778f2603;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_e70e6b1aeda4 NVARCHAR(MAX),
@ID_e70e6b1aeda4 UNIQUEIDENTIFIER
SET
  @Description_e70e6b1aeda4 = N'Filters the layout and response counts to a specific form version; if omitted, the query defaults to the currently published form version layout and aggregates responses across all versions.'
SET
  @ID_e70e6b1aeda4 = '2152F93E-C190-49C6-8A18-1BDFD516B875' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_e70e6b1aeda4,
  @ID = @ID_e70e6b1aeda4;

-- Save MJ: Query Parameters (core SP call only)
DECLARE @Description_2e112cec9cb1 NVARCHAR(MAX),
@ID_2e112cec9cb1 UNIQUEIDENTIFIER
SET
  @Description_2e112cec9cb1 = N'Unique identifier of the form to generate page reach statistics for.'
SET
  @ID_2e112cec9cb1 = 'E5FA99A8-6733-4CE4-9E1F-1FA2EBB61F36' EXEC [${mjSchema}].spUpdateQueryParameter @Description = @Description_2e112cec9cb1,
  @ID = @ID_2e112cec9cb1;

GO

-- ---- Second push: the corrections MJ's template param extraction made necessary (see header). ----

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_9f7b66ce5ee0 NVARCHAR(MAX),
@ID_9f7b66ce5ee0 UNIQUEIDENTIFIER
SET
  @Description_9f7b66ce5ee0 = N'The natural-language description of the form to design.'
SET
  @ID_9f7b66ce5ee0 = '1C2D3E4F-5A6B-4C7D-8E9F-0A1B2C3D4E5F' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_9f7b66ce5ee0,
  @ID = @ID_9f7b66ce5ee0;

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_e0380d77ac7c NVARCHAR(MAX),
@ID_e0380d77ac7c UNIQUEIDENTIFIER
SET
  @Description_e0380d77ac7c = N'Optional: the model''s prior invalid output, fed back on a retry attempt.'
SET
  @ID_e0380d77ac7c = '2D3E4F5A-6B7C-4D8E-9F0A-1B2C3D4E5F60' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_e0380d77ac7c,
  @ID = @ID_e0380d77ac7c;

-- Save MJ: Template Params (core SP call only)
DECLARE @Description_903ad94c3518 NVARCHAR(MAX),
@ID_903ad94c3518 UNIQUEIDENTIFIER
SET
  @Description_903ad94c3518 = N'Optional: the blueprint validation error from the prior attempt, fed back on a retry.'
SET
  @ID_903ad94c3518 = '3E4F5A6B-7C8D-4E9F-0A1B-2C3D4E5F6071' EXEC [${mjSchema}].spUpdateTemplateParam @Description = @Description_903ad94c3518,
  @ID = @ID_903ad94c3518;

-- Save MJ: User Views (core SP call only)
DECLARE @Name_c9c04ad15183 NVARCHAR(100),
@IsShared_c9c04ad15183 BIT,
@ID_c9c04ad15183 UNIQUEIDENTIFIER
SET
  @Name_c9c04ad15183 = N'All Forms'
SET
  @IsShared_c9c04ad15183 = 1
SET
  @ID_c9c04ad15183 = '7F0D0001-A1B2-4C3D-8E4F-000000000001' EXEC [${mjSchema}].spUpdateUserView @Name = @Name_c9c04ad15183,
  @IsShared = @IsShared_c9c04ad15183,
  @ID = @ID_c9c04ad15183;
