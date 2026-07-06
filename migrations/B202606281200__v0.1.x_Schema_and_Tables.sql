-- =============================================================================
-- MJ Forms — Schema and Tables (Phase 1)
-- =============================================================================
-- Free, open-source forms / surveys / intake for MemberJunction.
-- Schema: __mj_BizAppsForms  ·  Entity prefix (set in mj.config.cjs): "MJ_BizApps_Forms: "
--
-- Conventions (see CLAUDE.md / plans/FORMS_BUILD_PLAN.md §5.1):
--   * Business columns + PK/FK/CHECK/UNIQUE constraints only.
--   * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds them + triggers.
--   * NO foreign-key indexes — CodeGen adds IDX_AUTO_MJ_FKEY_* automatically.
--   * sp_addextendedproperty on every non-PK, non-FK business column (CodeGen
--     turns these into entity-field descriptions).
--   * CHECK constraints on value-list columns — CodeGen parses them into value lists.
--   * Root table is `Form` (DG-2 default) → entity "MJ_BizApps_Forms: Forms".
--   * Cross-schema FKs to MJ core: __mj.[User], __mj.[File].
-- Phase-2 entities (FormGroup + MaterializedEntityID RSU bridge) are deliberately
-- NOT created here — see plan §5.2.
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '__mj_BizAppsForms')
    EXEC('CREATE SCHEMA __mj_BizAppsForms');
GO

---------------------------------------------------------------------------
-- FormCategory: hierarchical organization of forms (self-referencing tree)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    IconClass NVARCHAR(100) NULL,
    DisplayRank INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_FormCategory PRIMARY KEY (ID),
    CONSTRAINT FK_FormCategory_Parent FOREIGN KEY (ParentID) REFERENCES __mj_BizAppsForms.FormCategory(ID)
);
GO

---------------------------------------------------------------------------
-- FormStyle: reusable themes / CSS token sets for departments & brands
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormStyle (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CSSVariables NVARCHAR(MAX) NULL,
    CustomCSS NVARCHAR(MAX) NULL,
    LogoURL NVARCHAR(1000) NULL,
    DisplayRank INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_FormStyle PRIMARY KEY (ID),
    CONSTRAINT UQ_FormStyle_Name UNIQUE (Name)
);
GO

---------------------------------------------------------------------------
-- Form: the root instrument definition
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.Form (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CategoryID UNIQUEIDENTIFIER NULL,
    StyleID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    OwnerUserID UNIQUEIDENTIFIER NULL,
    RenderMode NVARCHAR(20) NOT NULL DEFAULT 'Scroll',
    Settings NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Form PRIMARY KEY (ID),
    CONSTRAINT FK_Form_Category FOREIGN KEY (CategoryID) REFERENCES __mj_BizAppsForms.FormCategory(ID),
    CONSTRAINT FK_Form_Style FOREIGN KEY (StyleID) REFERENCES __mj_BizAppsForms.FormStyle(ID),
    CONSTRAINT FK_Form_OwnerUser FOREIGN KEY (OwnerUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_Form_Status CHECK (Status IN ('Draft', 'Published', 'Closed')),
    CONSTRAINT CK_Form_RenderMode CHECK (RenderMode IN ('Scroll', 'OneQuestion'))
);
GO

---------------------------------------------------------------------------
-- FormVersion: immutable published snapshots (responses pin a version)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormVersion (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    VersionNumber INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    PublishedAt DATETIMEOFFSET NULL,
    DefinitionSnapshot NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormVersion PRIMARY KEY (ID),
    CONSTRAINT FK_FormVersion_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT UQ_FormVersion_Form_VersionNumber UNIQUE (FormID, VersionNumber),
    CONSTRAINT CK_FormVersion_Status CHECK (Status IN ('Draft', 'Published', 'Retired'))
);
GO

---------------------------------------------------------------------------
-- FormPage: an ordered page/section within a form
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormPage (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL,
    DisplayOrder INT NOT NULL DEFAULT 0,
    ConditionalRule NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormPage PRIMARY KEY (ID),
    CONSTRAINT FK_FormPage_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID)
);
GO

---------------------------------------------------------------------------
-- FormQuestion: a single question/field on a page
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormQuestion (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    PageID UNIQUEIDENTIFIER NULL,
    QuestionType NVARCHAR(50) NOT NULL,
    Prompt NVARCHAR(MAX) NOT NULL,
    HelpText NVARCHAR(MAX) NULL,
    IsRequired BIT NOT NULL DEFAULT 0,
    DisplayOrder INT NOT NULL DEFAULT 0,
    ValidationRule NVARCHAR(MAX) NULL,
    ConditionalRule NVARCHAR(MAX) NULL,
    ScoringConfig NVARCHAR(MAX) NULL,
    Settings NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormQuestion PRIMARY KEY (ID),
    CONSTRAINT FK_FormQuestion_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT FK_FormQuestion_Page FOREIGN KEY (PageID) REFERENCES __mj_BizAppsForms.FormPage(ID),
    CONSTRAINT CK_FormQuestion_QuestionType CHECK (QuestionType IN (
        'ShortText', 'LongText', 'Email', 'Phone', 'Number', 'SingleChoice',
        'MultiChoice', 'Dropdown', 'Rating', 'NPS', 'YesNo', 'Date', 'Time',
        'FileUpload', 'Statement'
    ))
);
GO

---------------------------------------------------------------------------
-- FormQuestionOption: choices for choice-style questions
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormQuestionOption (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    QuestionID UNIQUEIDENTIFIER NOT NULL,
    Label NVARCHAR(500) NOT NULL,
    Value NVARCHAR(500) NULL,
    DisplayOrder INT NOT NULL DEFAULT 0,
    IsDefault BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_FormQuestionOption PRIMARY KEY (ID),
    CONSTRAINT FK_FormQuestionOption_Question FOREIGN KEY (QuestionID) REFERENCES __mj_BizAppsForms.FormQuestion(ID)
);
GO

---------------------------------------------------------------------------
-- FormDistribution: a published channel (public link / embed / QR / email)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormDistribution (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Slug NVARCHAR(255) NULL,
    ChannelType NVARCHAR(20) NOT NULL DEFAULT 'PublicLink',
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    OpenAt DATETIMEOFFSET NULL,
    CloseAt DATETIMEOFFSET NULL,
    MaxResponses INT NULL,
    ResponseCount INT NOT NULL DEFAULT 0,
    MagicLinkInviteID UNIQUEIDENTIFIER NULL,
    CaptchaRequired BIT NOT NULL DEFAULT 1,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_FormDistribution PRIMARY KEY (ID),
    CONSTRAINT FK_FormDistribution_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT CK_FormDistribution_ChannelType CHECK (ChannelType IN ('PublicLink', 'Embed', 'QR', 'Email')),
    CONSTRAINT CK_FormDistribution_Status CHECK (Status IN ('Draft', 'Active', 'Closed'))
);
GO

-- Business index (non-FK): one distribution per public slug
CREATE UNIQUE INDEX UQ_FormDistribution_Slug
    ON __mj_BizAppsForms.FormDistribution (Slug)
    WHERE Slug IS NOT NULL;
GO

---------------------------------------------------------------------------
-- FormResponse: one submission (anonymous or identified), pinned to a version
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormResponse (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    FormVersionID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Partial',
    AnonymousSessionID NVARCHAR(255) NULL,
    RespondentPersonID UNIQUEIDENTIFIER NULL,
    StartedAt DATETIMEOFFSET NULL,
    SubmittedAt DATETIMEOFFSET NULL,
    SourceMetadata NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormResponse PRIMARY KEY (ID),
    CONSTRAINT FK_FormResponse_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT FK_FormResponse_FormVersion FOREIGN KEY (FormVersionID) REFERENCES __mj_BizAppsForms.FormVersion(ID),
    -- Hard cross-schema FK to bizapps-common (a required dependency — see mj-app.json).
    CONSTRAINT FK_FormResponse_RespondentPerson FOREIGN KEY (RespondentPersonID) REFERENCES __mj_BizAppsCommon.Person(ID),
    CONSTRAINT CK_FormResponse_Status CHECK (Status IN ('Partial', 'Complete'))
);
GO

---------------------------------------------------------------------------
-- FormResponseAnswer: one answer to one question (typed columns + JSON fallback)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormResponseAnswer (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ResponseID UNIQUEIDENTIFIER NOT NULL,
    QuestionID UNIQUEIDENTIFIER NOT NULL,
    TextValue NVARCHAR(MAX) NULL,
    NumericValue DECIMAL(18, 4) NULL,
    DateValue DATETIMEOFFSET NULL,
    BooleanValue BIT NULL,
    JSONValue NVARCHAR(MAX) NULL,
    FileID UNIQUEIDENTIFIER NULL,
    Score DECIMAL(18, 4) NULL,
    ScoreRationale NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormResponseAnswer PRIMARY KEY (ID),
    CONSTRAINT FK_FormResponseAnswer_Response FOREIGN KEY (ResponseID) REFERENCES __mj_BizAppsForms.FormResponse(ID),
    CONSTRAINT FK_FormResponseAnswer_Question FOREIGN KEY (QuestionID) REFERENCES __mj_BizAppsForms.FormQuestion(ID),
    CONSTRAINT FK_FormResponseAnswer_File FOREIGN KEY (FileID) REFERENCES __mj.[File](ID)
);
GO

-- =============================================================================
-- EXTENDED PROPERTIES (descriptions → CodeGen entity-field metadata)
-- =============================================================================

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: Schema
---------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MJ Forms — forms, surveys & intake. Anonymous-friendly, mobile-first, with responses stored as first-class MemberJunction records.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormCategory
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Hierarchical categories that organize forms into a browsable tree',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the category',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description of this category',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Font Awesome icon class for UI display',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory', @level2type = N'COLUMN', @level2name = N'IconClass';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort order among siblings. Lower values appear first',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory', @level2type = N'COLUMN', @level2name = N'DisplayRank';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this category is available for selection. Inactive categories are hidden but preserved',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormCategory', @level2type = N'COLUMN', @level2name = N'IsActive';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormStyle
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the style/theme',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description of this style',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON object of --mj-* design-token overrides applied to the respondent widget',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'CSSVariables';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional raw CSS appended after the token overrides for advanced theming',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'CustomCSS';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL of a logo to display on forms using this style',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'LogoURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort order in style pickers. Lower values appear first',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'DisplayRank';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this style is available for selection. Inactive styles are hidden but preserved',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormStyle', @level2type = N'COLUMN', @level2name = N'IsActive';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: Form
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The root definition of a form/survey/intake instrument',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the form',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description / purpose of the form',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lifecycle status: Draft, Published, or Closed',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form', @level2type = N'COLUMN', @level2name = N'RenderMode';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'Form', @level2type = N'COLUMN', @level2name = N'Settings';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormVersion
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Immutable published snapshots of a form; responses pin the version they were filled against',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Monotonic version number within a form',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormVersion', @level2type = N'COLUMN', @level2name = N'VersionNumber';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version status: Draft, Published, or Retired',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormVersion', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp this version was published (null while Draft)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormVersion', @level2type = N'COLUMN', @level2name = N'PublishedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Full pages/questions/options/logic as published, captured as a JSON snapshot',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormVersion', @level2type = N'COLUMN', @level2name = N'DefinitionSnapshot';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormPage
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An ordered page/section of a form',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormPage';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Page title shown to respondents',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormPage', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Page description / intro text',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormPage', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort order of the page within the form. Lower values appear first',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormPage', @level2type = N'COLUMN', @level2name = N'DisplayOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormPage', @level2type = N'COLUMN', @level2name = N'ConditionalRule';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormQuestion
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A single question/field within a form page',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'QuestionType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The question text shown to the respondent',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'Prompt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional helper/assistive text shown beneath the prompt',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'HelpText';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether an answer is required before the form can be submitted',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'IsRequired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort order of the question within its page. Lower values appear first',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'DisplayOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON validation rule (min/max, regex, length, etc.) applied client- and server-side',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'ValidationRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON show/hide rule evaluated against prior answers (see plan §6)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'ConditionalRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'ScoringConfig';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON per-type settings (e.g. rating scale, NPS labels, file constraints)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestion', @level2type = N'COLUMN', @level2name = N'Settings';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormQuestionOption
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A selectable choice offered by a choice-style question',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestionOption';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Label shown to the respondent for this option',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'Label';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Stored value for this option (defaults to Label when omitted)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'Value';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort order of the option within its question. Lower values appear first',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'DisplayOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this option is selected by default',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormQuestionOption', @level2type = N'COLUMN', @level2name = N'IsDefault';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormDistribution
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Internal name for this distribution',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL-friendly slug used in the public link (unique when set)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'Slug';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Channel type: PublicLink, Embed, QR, or Email',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'ChannelType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Distribution status: Draft, Active, or Closed',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When this distribution opens for responses (null = immediately)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'OpenAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When this distribution stops accepting responses (null = no end)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'CloseAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum number of responses allowed through this distribution (null = unlimited)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'MaxResponses';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Running count of responses received through this distribution',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'ResponseCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'MagicLinkInviteID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'CaptchaRequired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this distribution is active and usable',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormDistribution', @level2type = N'COLUMN', @level2name = N'IsActive';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormResponse
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Completion status: Partial or Complete',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'AnonymousSessionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp the respondent began the form',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp the response was submitted (null while Partial)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'SubmittedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON source metadata: hashed IP, user-agent, distribution id, referrer',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'SourceMetadata';
GO

---------------------------------------------------------------------------
-- EXTENDED PROPERTIES: FormResponseAnswer
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Text answer value (short/long text, email, phone, single-choice label, etc.)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'TextValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Numeric answer value (Number, Rating, NPS)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'NumericValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date/time answer value (Date, Time)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'DateValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Boolean answer value (YesNo)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'BooleanValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON answer value for multi-select or complex/structured answers',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'JSONValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'Score';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rationale/explanation for the assigned score (LLM-judge output)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponseAnswer', @level2type = N'COLUMN', @level2name = N'ScoreRationale';
GO






























































/* SQL generated to create new entity MJ_BizApps_Forms: Form Categories */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '43ecbea3-6cfc-480c-823f-96b5db201fe7',
         'MJ_BizApps_Forms: Form Categories',
         'Form Categories',
         'Hierarchical categories that organize forms into a browsable tree',
         NULL,
         'FormCategory',
         'vwFormCategories',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to create new application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('c2b2d4af-0fc5-4301-a4fd-d59731af33c8', '${flyway:defaultSchema}', 'Generated for schema', '${flyway:defaultSchema}', 'mjbizappsforms', 1);

/* Adding role UI to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('c2b2d4af-0fc5-4301-a4fd-d59731af33c8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('c2b2d4af-0fc5-4301-a4fd-d59731af33c8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('c2b2d4af-0fc5-4301-a4fd-d59731af33c8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity MJ_BizApps_Forms: Form Categories to application ID: 'c2b2d4af-0fc5-4301-a4fd-d59731af33c8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('c2b2d4af-0fc5-4301-a4fd-d59731af33c8', '43ecbea3-6cfc-480c-823f-96b5db201fe7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'c2b2d4af-0fc5-4301-a4fd-d59731af33c8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43ecbea3-6cfc-480c-823f-96b5db201fe7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43ecbea3-6cfc-480c-823f-96b5db201fe7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Categories for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('43ecbea3-6cfc-480c-823f-96b5db201fe7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Styles */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '1ef36db1-004d-4672-8a57-a0f3b71c0050',
         'MJ_BizApps_Forms: Form Styles',
         'Form Styles',
         'Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt',
         NULL,
         'FormStyle',
         'vwFormStyles',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Styles to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '1ef36db1-004d-4672-8a57-a0f3b71c0050', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1ef36db1-004d-4672-8a57-a0f3b71c0050', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1ef36db1-004d-4672-8a57-a0f3b71c0050', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Styles for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1ef36db1-004d-4672-8a57-a0f3b71c0050', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Forms */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8',
         'MJ_BizApps_Forms: Forms',
         'Forms',
         'The root definition of a form/survey/intake instrument',
         NULL,
         'Form',
         'vwForms',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Forms to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'c6db9ad8-11ea-451b-b0e1-71d7bfd894b8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6db9ad8-11ea-451b-b0e1-71d7bfd894b8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6db9ad8-11ea-451b-b0e1-71d7bfd894b8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Forms for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6db9ad8-11ea-451b-b0e1-71d7bfd894b8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Versions */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '622e2804-5b6d-4b43-92a4-294adc538f50',
         'MJ_BizApps_Forms: Form Versions',
         'Form Versions',
         'Immutable published snapshots of a form; responses pin the version they were filled against',
         NULL,
         'FormVersion',
         'vwFormVersions',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Versions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '622e2804-5b6d-4b43-92a4-294adc538f50', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('622e2804-5b6d-4b43-92a4-294adc538f50', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('622e2804-5b6d-4b43-92a4-294adc538f50', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Versions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('622e2804-5b6d-4b43-92a4-294adc538f50', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Pages */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'a3bfaa2d-3158-4eed-9934-76d1e35d20f6',
         'MJ_BizApps_Forms: Form Pages',
         'Form Pages',
         'An ordered page/section of a form',
         NULL,
         'FormPage',
         'vwFormPages',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Pages to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'a3bfaa2d-3158-4eed-9934-76d1e35d20f6', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3bfaa2d-3158-4eed-9934-76d1e35d20f6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3bfaa2d-3158-4eed-9934-76d1e35d20f6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Pages for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a3bfaa2d-3158-4eed-9934-76d1e35d20f6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Questions */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'c396b99f-0677-47f8-baef-bcb08de5cf97',
         'MJ_BizApps_Forms: Form Questions',
         'Form Questions',
         'A single question/field within a form page',
         NULL,
         'FormQuestion',
         'vwFormQuestions',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Questions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'c396b99f-0677-47f8-baef-bcb08de5cf97', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c396b99f-0677-47f8-baef-bcb08de5cf97', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c396b99f-0677-47f8-baef-bcb08de5cf97', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Questions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c396b99f-0677-47f8-baef-bcb08de5cf97', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Question Options */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'bf3016e2-8ba7-4975-83b6-02c9435c1441',
         'MJ_BizApps_Forms: Form Question Options',
         'Form Question Options',
         'A selectable choice offered by a choice-style question',
         NULL,
         'FormQuestionOption',
         'vwFormQuestionOptions',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Question Options to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'bf3016e2-8ba7-4975-83b6-02c9435c1441', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3016e2-8ba7-4975-83b6-02c9435c1441', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3016e2-8ba7-4975-83b6-02c9435c1441', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Question Options for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bf3016e2-8ba7-4975-83b6-02c9435c1441', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Distributions */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '1fc60bda-25b8-473b-ace5-1238670d3535',
         'MJ_BizApps_Forms: Form Distributions',
         'Form Distributions',
         'A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link',
         NULL,
         'FormDistribution',
         'vwFormDistributions',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Distributions to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '1fc60bda-25b8-473b-ace5-1238670d3535', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1fc60bda-25b8-473b-ace5-1238670d3535', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1fc60bda-25b8-473b-ace5-1238670d3535', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Distributions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1fc60bda-25b8-473b-ace5-1238670d3535', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Responses */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '63600739-7165-4bdc-b7d7-19a1b1951dfa',
         'MJ_BizApps_Forms: Form Responses',
         'Form Responses',
         'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.',
         NULL,
         'FormResponse',
         'vwFormResponses',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Responses to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', '63600739-7165-4bdc-b7d7-19a1b1951dfa', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('63600739-7165-4bdc-b7d7-19a1b1951dfa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('63600739-7165-4bdc-b7d7-19a1b1951dfa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Responses for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('63600739-7165-4bdc-b7d7-19a1b1951dfa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Response Answers */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'd03bcdf5-0b32-4ea8-88e8-f73d70a90810',
         'MJ_BizApps_Forms: Form Response Answers',
         'Form Response Answers',
         'One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.',
         NULL,
         'FormResponseAnswer',
         'vwFormResponseAnswers',
         '${flyway:defaultSchema}',
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Forms: Form Response Answers to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'd03bcdf5-0b32-4ea8-88e8-f73d70a90810', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d03bcdf5-0b32-4ea8-88e8-f73d70a90810', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d03bcdf5-0b32-4ea8-88e8-f73d70a90810', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Response Answers for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d03bcdf5-0b32-4ea8-88e8-f73d70a90810', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
UPDATE [${flyway:defaultSchema}].[FormQuestionOption] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD CONSTRAINT [DF___mj_BizAppsForms_FormQuestionOption___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
UPDATE [${flyway:defaultSchema}].[FormQuestionOption] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestionOption */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestionOption] ADD CONSTRAINT [DF___mj_BizAppsForms_FormQuestionOption___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormDistribution */
UPDATE [${flyway:defaultSchema}].[FormDistribution] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ADD CONSTRAINT [DF___mj_BizAppsForms_FormDistribution___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormDistribution */
UPDATE [${flyway:defaultSchema}].[FormDistribution] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormDistribution */
ALTER TABLE [${flyway:defaultSchema}].[FormDistribution] ADD CONSTRAINT [DF___mj_BizAppsForms_FormDistribution___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponse */
UPDATE [${flyway:defaultSchema}].[FormResponse] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ADD CONSTRAINT [DF___mj_BizAppsForms_FormResponse___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponse */
UPDATE [${flyway:defaultSchema}].[FormResponse] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponse */
ALTER TABLE [${flyway:defaultSchema}].[FormResponse] ADD CONSTRAINT [DF___mj_BizAppsForms_FormResponse___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormVersion */
UPDATE [${flyway:defaultSchema}].[FormVersion] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD CONSTRAINT [DF___mj_BizAppsForms_FormVersion___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormVersion */
UPDATE [${flyway:defaultSchema}].[FormVersion] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormVersion */
ALTER TABLE [${flyway:defaultSchema}].[FormVersion] ADD CONSTRAINT [DF___mj_BizAppsForms_FormVersion___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Form */
UPDATE [${flyway:defaultSchema}].[Form] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ADD CONSTRAINT [DF___mj_BizAppsForms_Form___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Form */
UPDATE [${flyway:defaultSchema}].[Form] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Form */
ALTER TABLE [${flyway:defaultSchema}].[Form] ADD CONSTRAINT [DF___mj_BizAppsForms_Form___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormPage */
UPDATE [${flyway:defaultSchema}].[FormPage] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD CONSTRAINT [DF___mj_BizAppsForms_FormPage___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormPage */
UPDATE [${flyway:defaultSchema}].[FormPage] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormPage */
ALTER TABLE [${flyway:defaultSchema}].[FormPage] ADD CONSTRAINT [DF___mj_BizAppsForms_FormPage___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormCategory */
UPDATE [${flyway:defaultSchema}].[FormCategory] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ADD CONSTRAINT [DF___mj_BizAppsForms_FormCategory___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormCategory */
UPDATE [${flyway:defaultSchema}].[FormCategory] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormCategory */
ALTER TABLE [${flyway:defaultSchema}].[FormCategory] ADD CONSTRAINT [DF___mj_BizAppsForms_FormCategory___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormStyle */
UPDATE [${flyway:defaultSchema}].[FormStyle] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ADD CONSTRAINT [DF___mj_BizAppsForms_FormStyle___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormStyle */
UPDATE [${flyway:defaultSchema}].[FormStyle] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormStyle */
ALTER TABLE [${flyway:defaultSchema}].[FormStyle] ADD CONSTRAINT [DF___mj_BizAppsForms_FormStyle___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestion */
UPDATE [${flyway:defaultSchema}].[FormQuestion] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD CONSTRAINT [DF___mj_BizAppsForms_FormQuestion___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestion */
UPDATE [${flyway:defaultSchema}].[FormQuestion] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormQuestion */
ALTER TABLE [${flyway:defaultSchema}].[FormQuestion] ADD CONSTRAINT [DF___mj_BizAppsForms_FormQuestion___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
UPDATE [${flyway:defaultSchema}].[FormResponseAnswer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ADD CONSTRAINT [DF___mj_BizAppsForms_FormResponseAnswer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
UPDATE [${flyway:defaultSchema}].[FormResponseAnswer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormResponseAnswer */
ALTER TABLE [${flyway:defaultSchema}].[FormResponseAnswer] ADD CONSTRAINT [DF___mj_BizAppsForms_FormResponseAnswer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '994dcc05-13cf-45b4-b70d-4ef00e053997' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'ID')) BEGIN
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
            '994dcc05-13cf-45b4-b70d-4ef00e053997',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f3e792a1-6b2b-448e-95b1-0c2ecab5febc' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'QuestionID')) BEGIN
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
            'f3e792a1-6b2b-448e-95b1-0c2ecab5febc',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100002,
            'QuestionID',
            'Question ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '02b3434b-2660-4665-b1d7-383876adfc24' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'Label')) BEGIN
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
            '02b3434b-2660-4665-b1d7-383876adfc24',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100003,
            'Label',
            'Label',
            'Label shown to the respondent for this option',
            'nvarchar',
            1000,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '34062c98-e7f1-4000-8e98-ac020b1b7225' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'Value')) BEGIN
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
            '34062c98-e7f1-4000-8e98-ac020b1b7225',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100004,
            'Value',
            'Value',
            'Stored value for this option (defaults to Label when omitted)',
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'afeea024-7e9f-4c98-aee1-0332d898c101' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'DisplayOrder')) BEGIN
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
            'afeea024-7e9f-4c98-aee1-0332d898c101',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100005,
            'DisplayOrder',
            'Display Order',
            'Sort order of the option within its question. Lower values appear first',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '405711df-cdb0-4ffa-88af-af9d9e971fca' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = 'IsDefault')) BEGIN
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
            '405711df-cdb0-4ffa-88af-af9d9e971fca',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100006,
            'IsDefault',
            'Is Default',
            'Whether this option is selected by default',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a491cd71-2032-48c4-9579-23ac41803627' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a491cd71-2032-48c4-9579-23ac41803627',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7586e5e7-058e-4172-b75a-f322768d89ae' OR (EntityID = 'BF3016E2-8BA7-4975-83B6-02C9435C1441' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7586e5e7-058e-4172-b75a-f322768d89ae',
            'BF3016E2-8BA7-4975-83B6-02C9435C1441', -- Entity: MJ_BizApps_Forms: Form Question Options
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'eb722f5e-2fd8-437a-8b1a-ef01a930f980' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'ID')) BEGIN
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
            'eb722f5e-2fd8-437a-8b1a-ef01a930f980',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6798b45d-6288-4a1c-bdfe-4c1d29929b5f' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'FormID')) BEGIN
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
            '6798b45d-6288-4a1c-bdfe-4c1d29929b5f',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100002,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '20e36f64-0f3f-4c81-8645-659c9f50f5fa' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'Name')) BEGIN
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
            '20e36f64-0f3f-4c81-8645-659c9f50f5fa',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100003,
            'Name',
            'Name',
            'Internal name for this distribution',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '866866b1-f573-4d3d-acdb-c74582a22054' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'Slug')) BEGIN
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
            '866866b1-f573-4d3d-acdb-c74582a22054',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100004,
            'Slug',
            'Slug',
            'URL-friendly slug used in the public link (unique when set)',
            'nvarchar',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3a10a102-4a2a-4f15-bdad-231bd16ec34f' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'ChannelType')) BEGIN
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
            '3a10a102-4a2a-4f15-bdad-231bd16ec34f',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100005,
            'ChannelType',
            'Channel Type',
            'Channel type: PublicLink, Embed, QR, or Email',
            'nvarchar',
            40,
            0,
            0,
            0,
            'PublicLink',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b2168352-1a2c-413d-a7f2-0ad9ae14bfac' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'Status')) BEGIN
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
            'b2168352-1a2c-413d-a7f2-0ad9ae14bfac',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100006,
            'Status',
            'Status',
            'Distribution status: Draft, Active, or Closed',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6ca1d54e-3de5-4505-9d62-f5f46031b164' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'OpenAt')) BEGIN
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
            '6ca1d54e-3de5-4505-9d62-f5f46031b164',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100007,
            'OpenAt',
            'Open At',
            'When this distribution opens for responses (null = immediately)',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e2346265-1bb3-4957-9768-b7a286339d38' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'CloseAt')) BEGIN
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
            'e2346265-1bb3-4957-9768-b7a286339d38',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100008,
            'CloseAt',
            'Close At',
            'When this distribution stops accepting responses (null = no end)',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd0668174-8180-4c67-9df7-8183e0b30851' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'MaxResponses')) BEGIN
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
            'd0668174-8180-4c67-9df7-8183e0b30851',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100009,
            'MaxResponses',
            'Max Responses',
            'Maximum number of responses allowed through this distribution (null = unlimited)',
            'int',
            4,
            10,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '19a5fb8d-be86-4f84-9bb9-45437a878efb' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'ResponseCount')) BEGIN
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
            '19a5fb8d-be86-4f84-9bb9-45437a878efb',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100010,
            'ResponseCount',
            'Response Count',
            'Running count of responses received through this distribution',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b77f00d4-f944-4023-9a5e-3ee46e242b6a' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'MagicLinkInviteID')) BEGIN
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
            'b77f00d4-f944-4023-9a5e-3ee46e242b6a',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100011,
            'MagicLinkInviteID',
            'Magic Link Invite ID',
            'ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b8fc49df-b819-41f0-b1de-dadbff171519' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'CaptchaRequired')) BEGIN
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
            'b8fc49df-b819-41f0-b1de-dadbff171519',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100012,
            'CaptchaRequired',
            'Captcha Required',
            'Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '284688de-aea8-4960-aa9a-b98ed80bcf96' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'IsActive')) BEGIN
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
            '284688de-aea8-4960-aa9a-b98ed80bcf96',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100013,
            'IsActive',
            'Is Active',
            'Whether this distribution is active and usable',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '41d93c94-5cb9-4126-8e63-f662c05878e2' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = '__mj_CreatedAt')) BEGIN
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
            '41d93c94-5cb9-4126-8e63-f662c05878e2',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100014,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1053b9b8-3094-4201-9903-506a702dff22' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1053b9b8-3094-4201-9903-506a702dff22',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100015,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f1fe5a15-8a97-4e58-969c-9141f08645f8' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'ID')) BEGIN
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
            'f1fe5a15-8a97-4e58-969c-9141f08645f8',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dc96c1fc-1f9b-4d7a-9fc7-9c25a7161d1f' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'FormID')) BEGIN
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
            'dc96c1fc-1f9b-4d7a-9fc7-9c25a7161d1f',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100002,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f566f224-45b9-4629-b04b-a3b39eb13e54' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'FormVersionID')) BEGIN
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
            'f566f224-45b9-4629-b04b-a3b39eb13e54',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100003,
            'FormVersionID',
            'Form Version ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '622E2804-5B6D-4B43-92A4-294ADC538F50',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '38ca5677-5a04-4121-aa5c-d8fd325fef67' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'Status')) BEGIN
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
            '38ca5677-5a04-4121-aa5c-d8fd325fef67',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100004,
            'Status',
            'Status',
            'Completion status: Partial or Complete',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Partial',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c3db71fe-8c4f-47e7-9ce3-4fe7182ec829' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'AnonymousSessionID')) BEGIN
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
            'c3db71fe-8c4f-47e7-9ce3-4fe7182ec829',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100005,
            'AnonymousSessionID',
            'Anonymous Session ID',
            'Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session',
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a6cfe92b-2751-4668-8651-0b6c25f23b17' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'RespondentPersonID')) BEGIN
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
            'a6cfe92b-2751-4668-8651-0b6c25f23b17',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100006,
            'RespondentPersonID',
            'Respondent Person ID',
            NULL,
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
            '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c1fd44fb-013f-4919-8214-fb04a5968e93' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'StartedAt')) BEGIN
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
            'c1fd44fb-013f-4919-8214-fb04a5968e93',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100007,
            'StartedAt',
            'Started At',
            'Timestamp the respondent began the form',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fd111def-402d-4044-9e13-8a115beb1fba' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'SubmittedAt')) BEGIN
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
            'fd111def-402d-4044-9e13-8a115beb1fba',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100008,
            'SubmittedAt',
            'Submitted At',
            'Timestamp the response was submitted (null while Partial)',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5a92b934-65e1-4fee-92de-c53a776ad87c' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'SourceMetadata')) BEGIN
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
            '5a92b934-65e1-4fee-92de-c53a776ad87c',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100009,
            'SourceMetadata',
            'Source Metadata',
            'JSON source metadata: hashed IP, user-agent, distribution id, referrer',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '304f0501-0984-4454-88c7-62b2fd251fdd' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = '__mj_CreatedAt')) BEGIN
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
            '304f0501-0984-4454-88c7-62b2fd251fdd',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '14c4d3dc-bcc7-4cfb-93ff-e40914d80433' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '14c4d3dc-bcc7-4cfb-93ff-e40914d80433',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '36b23d09-ef86-4a96-99ed-a862203c95c5' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'ID')) BEGIN
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
            '36b23d09-ef86-4a96-99ed-a862203c95c5',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9a7d5e0a-73a9-4461-84e9-5ae14ee24990' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'FormID')) BEGIN
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
            '9a7d5e0a-73a9-4461-84e9-5ae14ee24990',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100002,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1baa2ea5-c5a4-4f8b-b6ed-84c2eb7f4a02' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'VersionNumber')) BEGIN
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
            '1baa2ea5-c5a4-4f8b-b6ed-84c2eb7f4a02',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100003,
            'VersionNumber',
            'Version Number',
            'Monotonic version number within a form',
            'int',
            4,
            10,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '36801486-e291-48f4-bc02-432be04642f3' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'Status')) BEGIN
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
            '36801486-e291-48f4-bc02-432be04642f3',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100004,
            'Status',
            'Status',
            'Version status: Draft, Published, or Retired',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e833c165-d0dd-4491-afdc-fae97236f845' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'PublishedAt')) BEGIN
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
            'e833c165-d0dd-4491-afdc-fae97236f845',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100005,
            'PublishedAt',
            'Published At',
            'Timestamp this version was published (null while Draft)',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'abba6d48-7952-4065-ab3c-eb99cffcdf5e' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'DefinitionSnapshot')) BEGIN
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
            'abba6d48-7952-4065-ab3c-eb99cffcdf5e',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100006,
            'DefinitionSnapshot',
            'Definition Snapshot',
            'Full pages/questions/options/logic as published, captured as a JSON snapshot',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '948df34c-0257-4077-acb9-a6289b63fc48' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = '__mj_CreatedAt')) BEGIN
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
            '948df34c-0257-4077-acb9-a6289b63fc48',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '561e289e-c030-4320-a55d-71d46febabe8' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '561e289e-c030-4320-a55d-71d46febabe8',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8dc15128-b17f-45c1-87be-dc4cd02b49e6' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'ID')) BEGIN
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
            '8dc15128-b17f-45c1-87be-dc4cd02b49e6',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '78b49574-a9c0-41b2-9352-01c24fe35fba' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Name')) BEGIN
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
            '78b49574-a9c0-41b2-9352-01c24fe35fba',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100002,
            'Name',
            'Name',
            'Display name of the form',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '27d8b5eb-327d-4379-9836-154ff01c06be' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Description')) BEGIN
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
            '27d8b5eb-327d-4379-9836-154ff01c06be',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100003,
            'Description',
            'Description',
            'Detailed description / purpose of the form',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2421f226-3a60-4e97-94f0-b819aee55e6a' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'CategoryID')) BEGIN
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
            '2421f226-3a60-4e97-94f0-b819aee55e6a',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100004,
            'CategoryID',
            'Category ID',
            NULL,
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
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cafefeb9-0912-41c4-aa68-83ab38119540' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'StyleID')) BEGIN
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
            'cafefeb9-0912-41c4-aa68-83ab38119540',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100005,
            'StyleID',
            'Style ID',
            NULL,
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
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8c879f40-9016-463a-99c5-1bd6495cf3a5' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Status')) BEGIN
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
            '8c879f40-9016-463a-99c5-1bd6495cf3a5',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100006,
            'Status',
            'Status',
            'Lifecycle status: Draft, Published, or Closed',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8ae25576-ac84-41c5-9176-56c0b4b1698a' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'OwnerUserID')) BEGIN
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
            '8ae25576-ac84-41c5-9176-56c0b4b1698a',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100007,
            'OwnerUserID',
            'Owner User ID',
            NULL,
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6e914524-14e8-4408-96b6-cbc4b6b97e17' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'RenderMode')) BEGIN
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
            '6e914524-14e8-4408-96b6-cbc4b6b97e17',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100008,
            'RenderMode',
            'Render Mode',
            'Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Scroll',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd82a7d4b-5ff0-4cd6-a891-2e5de984ca1b' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Settings')) BEGIN
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
            'd82a7d4b-5ff0-4cd6-a891-2e5de984ca1b',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100009,
            'Settings',
            'Settings',
            'JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '292e2057-dd6f-4d78-beaf-f5ee6f12cd0d' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = '__mj_CreatedAt')) BEGIN
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
            '292e2057-dd6f-4d78-beaf-f5ee6f12cd0d',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '37ca4680-5a61-4205-bd03-fb37143c698b' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '37ca4680-5a61-4205-bd03-fb37143c698b',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '499a1f6f-ed7b-4a6b-9f41-ce033e0f4117' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'ID')) BEGIN
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
            '499a1f6f-ed7b-4a6b-9f41-ce033e0f4117',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dca0c023-9dac-4610-be75-b992961f0d73' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'FormID')) BEGIN
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
            'dca0c023-9dac-4610-be75-b992961f0d73',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100002,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '85651746-4fd6-4b72-8e1e-cf6d9155358c' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'Title')) BEGIN
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
            '85651746-4fd6-4b72-8e1e-cf6d9155358c',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100003,
            'Title',
            'Title',
            'Page title shown to respondents',
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e9e0b37b-2360-49e9-b0f5-09d27718e771' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'Description')) BEGIN
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
            'e9e0b37b-2360-49e9-b0f5-09d27718e771',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100004,
            'Description',
            'Description',
            'Page description / intro text',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '885257f0-f6a9-4999-8c07-6b5764c3b8a6' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'DisplayOrder')) BEGIN
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
            '885257f0-f6a9-4999-8c07-6b5764c3b8a6',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100005,
            'DisplayOrder',
            'Display Order',
            'Sort order of the page within the form. Lower values appear first',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a6895d0e-fbf5-420b-924a-f6bfde686f0c' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'ConditionalRule')) BEGIN
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
            'a6895d0e-fbf5-420b-924a-f6bfde686f0c',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100006,
            'ConditionalRule',
            'Conditional Rule',
            'JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '89ac8052-1b77-4569-90d5-90b7c4e7edfa' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = '__mj_CreatedAt')) BEGIN
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
            '89ac8052-1b77-4569-90d5-90b7c4e7edfa',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2e12e031-c7d1-495d-9d51-86b9693c6d08' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '2e12e031-c7d1-495d-9d51-86b9693c6d08',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e02e1400-5755-45bb-b7af-b2a73bfa2b83' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'ID')) BEGIN
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
            'e02e1400-5755-45bb-b7af-b2a73bfa2b83',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bc9e36ef-c93e-48bf-9f84-53f402ce6de2' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'Name')) BEGIN
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
            'bc9e36ef-c93e-48bf-9f84-53f402ce6de2',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100002,
            'Name',
            'Name',
            'Display name of the category',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4028417c-6bbd-41dc-8429-27bc0020690e' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'Description')) BEGIN
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
            '4028417c-6bbd-41dc-8429-27bc0020690e',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100003,
            'Description',
            'Description',
            'Detailed description of this category',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bfec1de7-95e3-4c68-841e-80402093eade' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'ParentID')) BEGIN
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
            'bfec1de7-95e3-4c68-841e-80402093eade',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100004,
            'ParentID',
            'Parent ID',
            NULL,
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
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5f77b517-002f-4bfd-942e-2063342d5014' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'IconClass')) BEGIN
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
            '5f77b517-002f-4bfd-942e-2063342d5014',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100005,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class for UI display',
            'nvarchar',
            200,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd79c0b78-e04f-421b-a400-ca553ff59323' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'DisplayRank')) BEGIN
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
            'd79c0b78-e04f-421b-a400-ca553ff59323',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100006,
            'DisplayRank',
            'Display Rank',
            'Sort order among siblings. Lower values appear first',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '93b156ad-2c29-4092-91c2-65f92e98e578' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'IsActive')) BEGIN
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
            '93b156ad-2c29-4092-91c2-65f92e98e578',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100007,
            'IsActive',
            'Is Active',
            'Whether this category is available for selection. Inactive categories are hidden but preserved',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '77de29d8-1a47-4174-a476-14d2fbf10d3b' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '77de29d8-1a47-4174-a476-14d2fbf10d3b',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4235ac79-5aa0-4232-8754-b037487f1397' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4235ac79-5aa0-4232-8754-b037487f1397',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '79db70ec-842f-4f05-9d16-876d59f3ab69' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'ID')) BEGIN
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
            '79db70ec-842f-4f05-9d16-876d59f3ab69',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e99aca0b-4f27-49a8-96f0-d6b4244920a1' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'Name')) BEGIN
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
            'e99aca0b-4f27-49a8-96f0-d6b4244920a1',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100002,
            'Name',
            'Name',
            'Display name of the style/theme',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd7100a09-f513-4d69-9f62-29add26140f7' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'Description')) BEGIN
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
            'd7100a09-f513-4d69-9f62-29add26140f7',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100003,
            'Description',
            'Description',
            'Detailed description of this style',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f090b12b-bc26-40f6-94b1-05c08c761230' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'CSSVariables')) BEGIN
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
            'f090b12b-bc26-40f6-94b1-05c08c761230',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100004,
            'CSSVariables',
            'CSS Variables',
            'JSON object of --mj-* design-token overrides applied to the respondent widget',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e3d8d3c6-f6fa-49ff-8a2a-318118dbf94f' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'CustomCSS')) BEGIN
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
            'e3d8d3c6-f6fa-49ff-8a2a-318118dbf94f',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100005,
            'CustomCSS',
            'Custom CSS',
            'Optional raw CSS appended after the token overrides for advanced theming',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd950cb92-e4ab-4799-be78-83850e027650' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'LogoURL')) BEGIN
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
            'd950cb92-e4ab-4799-be78-83850e027650',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100006,
            'LogoURL',
            'Logo URL',
            'URL of a logo to display on forms using this style',
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '94bce002-088d-4d73-83e0-76666ba3055f' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'DisplayRank')) BEGIN
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
            '94bce002-088d-4d73-83e0-76666ba3055f',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100007,
            'DisplayRank',
            'Display Rank',
            'Sort order in style pickers. Lower values appear first',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '38345d6e-f2ad-4fda-81b0-255b00f177a5' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = 'IsActive')) BEGIN
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
            '38345d6e-f2ad-4fda-81b0-255b00f177a5',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100008,
            'IsActive',
            'Is Active',
            'Whether this style is available for selection. Inactive styles are hidden but preserved',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a30dbd4a-a40b-4b26-ba51-a1bcedede24e' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a30dbd4a-a40b-4b26-ba51-a1bcedede24e',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '62ff749c-aa71-4a58-a831-f252380645b6' OR (EntityID = '1EF36DB1-004D-4672-8A57-A0F3B71C0050' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '62ff749c-aa71-4a58-a831-f252380645b6',
            '1EF36DB1-004D-4672-8A57-A0F3B71C0050', -- Entity: MJ_BizApps_Forms: Form Styles
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e9903e88-261d-4043-becc-a9448e75bf8a' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'ID')) BEGIN
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
            'e9903e88-261d-4043-becc-a9448e75bf8a',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c83fddaa-982b-4756-9488-f01f819889b8' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'FormID')) BEGIN
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
            'c83fddaa-982b-4756-9488-f01f819889b8',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100002,
            'FormID',
            'Form ID',
            NULL,
            'uniqueidentifier',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e5610750-df58-471f-933d-a8873b15600b' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'PageID')) BEGIN
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
            'e5610750-df58-471f-933d-a8873b15600b',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100003,
            'PageID',
            'Page ID',
            NULL,
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
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0a4ff448-80df-4d5d-94ec-e315822a1b45' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'QuestionType')) BEGIN
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
            '0a4ff448-80df-4d5d-94ec-e315822a1b45',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100004,
            'QuestionType',
            'Question Type',
            'Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)',
            'nvarchar',
            100,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f43882ad-2dfd-4bc3-9fbe-abf60adff048' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'Prompt')) BEGIN
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
            'f43882ad-2dfd-4bc3-9fbe-abf60adff048',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100005,
            'Prompt',
            'Prompt',
            'The question text shown to the respondent',
            'nvarchar',
            -1,
            0,
            0,
            0,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a3f91065-efbc-48a3-9546-80e3a431344d' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'HelpText')) BEGIN
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
            'a3f91065-efbc-48a3-9546-80e3a431344d',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100006,
            'HelpText',
            'Help Text',
            'Optional helper/assistive text shown beneath the prompt',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '27b92bc4-4f9b-4167-abc9-b22d7eb6939a' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'IsRequired')) BEGIN
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
            '27b92bc4-4f9b-4167-abc9-b22d7eb6939a',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100007,
            'IsRequired',
            'Is Required',
            'Whether an answer is required before the form can be submitted',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b404e767-712e-48dd-9b1c-849074a06d5d' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'DisplayOrder')) BEGIN
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
            'b404e767-712e-48dd-9b1c-849074a06d5d',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100008,
            'DisplayOrder',
            'Display Order',
            'Sort order of the question within its page. Lower values appear first',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a2677db5-121e-41f1-862b-6f7fe876fefa' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'ValidationRule')) BEGIN
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
            'a2677db5-121e-41f1-862b-6f7fe876fefa',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100009,
            'ValidationRule',
            'Validation Rule',
            'JSON validation rule (min/max, regex, length, etc.) applied client- and server-side',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd7ec6a52-f85c-45d8-89e4-26cadf2efcca' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'ConditionalRule')) BEGIN
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
            'd7ec6a52-f85c-45d8-89e4-26cadf2efcca',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100010,
            'ConditionalRule',
            'Conditional Rule',
            'JSON show/hide rule evaluated against prior answers (see plan §6)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bfae940f-b36b-479d-833d-88ba789da4a7' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'ScoringConfig')) BEGIN
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
            'bfae940f-b36b-479d-833d-88ba789da4a7',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100011,
            'ScoringConfig',
            'Scoring Config',
            'JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9685e608-f874-4dce-92b1-c628fc77db15' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'Settings')) BEGIN
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
            '9685e608-f874-4dce-92b1-c628fc77db15',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100012,
            'Settings',
            'Settings',
            'JSON per-type settings (e.g. rating scale, NPS labels, file constraints)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd6f82852-d6ba-42c5-8085-af83bc25896c' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd6f82852-d6ba-42c5-8085-af83bc25896c',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100013,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd4960171-01a7-4200-93eb-794f736f616e' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd4960171-01a7-4200-93eb-794f736f616e',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100014,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4d082382-a267-408a-8aa5-40ec3162682b' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'ID')) BEGIN
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
            '4d082382-a267-408a-8aa5-40ec3162682b',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b4d02511-4eb2-4d84-a3f7-a1b9d15666d9' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'ResponseID')) BEGIN
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
            'b4d02511-4eb2-4d84-a3f7-a1b9d15666d9',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100002,
            'ResponseID',
            'Response ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '63600739-7165-4BDC-B7D7-19A1B1951DFA',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a500243a-077b-4218-b5cc-8dc9d123206c' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'QuestionID')) BEGIN
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
            'a500243a-077b-4218-b5cc-8dc9d123206c',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100003,
            'QuestionID',
            'Question ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'acf08639-0240-41ae-a165-d793e087e262' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'TextValue')) BEGIN
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
            'acf08639-0240-41ae-a165-d793e087e262',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100004,
            'TextValue',
            'Text Value',
            'Text answer value (short/long text, email, phone, single-choice label, etc.)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '31571eca-c123-49bd-b9e3-493d561d0f86' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'NumericValue')) BEGIN
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
            '31571eca-c123-49bd-b9e3-493d561d0f86',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100005,
            'NumericValue',
            'Numeric Value',
            'Numeric answer value (Number, Rating, NPS)',
            'decimal',
            9,
            18,
            4,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1381e224-7565-483d-8012-f03df96a1e77' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'DateValue')) BEGIN
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
            '1381e224-7565-483d-8012-f03df96a1e77',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100006,
            'DateValue',
            'Date Value',
            'Date/time answer value (Date, Time)',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4c390d42-2642-4568-9bd9-a01d1dbd56f1' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'BooleanValue')) BEGIN
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
            '4c390d42-2642-4568-9bd9-a01d1dbd56f1',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100007,
            'BooleanValue',
            'Boolean Value',
            'Boolean answer value (YesNo)',
            'bit',
            1,
            1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e62dbdc4-ce0c-4723-99fe-83fe905ccf18' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'JSONValue')) BEGIN
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
            'e62dbdc4-ce0c-4723-99fe-83fe905ccf18',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100008,
            'JSONValue',
            'JSON Value',
            'JSON answer value for multi-select or complex/structured answers',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '75af68cf-0a5b-410d-a087-a43f1a0f3a47' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'FileID')) BEGIN
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
            '75af68cf-0a5b-410d-a087-a43f1a0f3a47',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100009,
            'FileID',
            'File ID',
            NULL,
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
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3ac92d71-70ff-498a-a316-993a78979c61' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'Score')) BEGIN
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
            '3ac92d71-70ff-498a-a316-993a78979c61',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100010,
            'Score',
            'Score',
            'Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored',
            'decimal',
            9,
            18,
            4,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7c03ead1-3a5b-408c-aeb6-261318143025' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'ScoreRationale')) BEGIN
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
            '7c03ead1-3a5b-408c-aeb6-261318143025',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100011,
            'ScoreRationale',
            'Score Rationale',
            'Rationale/explanation for the assigned score (LLM-judge output)',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b3c5d14a-5fa8-47d4-9450-e0d3434fb3fe' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b3c5d14a-5fa8-47d4-9450-e0d3434fb3fe',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100012,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fc891545-f18b-4afb-a46b-fc89ed81f14f' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'fc891545-f18b-4afb-a46b-fc89ed81f14f',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100013,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* SQL text to insert entity field value with ID 46f3b85f-0008-49a6-b137-7ad3b610e9aa */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('46f3b85f-0008-49a6-b137-7ad3b610e9aa', '8C879F40-9016-463A-99C5-1BD6495CF3A5', 1, 'Closed', 'Closed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 48c3b8da-e89b-4ed1-b983-6127edde45b6 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('48c3b8da-e89b-4ed1-b983-6127edde45b6', '8C879F40-9016-463A-99C5-1BD6495CF3A5', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4125b0d3-1b51-4905-951c-be612b14aad1 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4125b0d3-1b51-4905-951c-be612b14aad1', '8C879F40-9016-463A-99C5-1BD6495CF3A5', 3, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8C879F40-9016-463A-99C5-1BD6495CF3A5 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='8C879F40-9016-463A-99C5-1BD6495CF3A5';

/* SQL text to insert entity field value with ID 2fbc806c-0504-432d-8e7d-cd4e237df8aa */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2fbc806c-0504-432d-8e7d-cd4e237df8aa', '6E914524-14E8-4408-96B6-CBC4B6B97E17', 1, 'OneQuestion', 'OneQuestion', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ac4ea032-ba66-4243-a55f-7572498709ea */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ac4ea032-ba66-4243-a55f-7572498709ea', '6E914524-14E8-4408-96B6-CBC4B6B97E17', 2, 'Scroll', 'Scroll', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6E914524-14E8-4408-96B6-CBC4B6B97E17 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='6E914524-14E8-4408-96B6-CBC4B6B97E17';

/* SQL text to insert entity field value with ID 5a506965-8ae0-4a8d-aac1-1dbf18a52425 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a506965-8ae0-4a8d-aac1-1dbf18a52425', '36801486-E291-48F4-BC02-432BE04642F3', 1, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c7020cbb-cdb4-4dcf-87fd-f34ca7023ee3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c7020cbb-cdb4-4dcf-87fd-f34ca7023ee3', '36801486-E291-48F4-BC02-432BE04642F3', 2, 'Published', 'Published', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3d7c6481-453b-4def-a7fa-cfbd99a3665f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3d7c6481-453b-4def-a7fa-cfbd99a3665f', '36801486-E291-48F4-BC02-432BE04642F3', 3, 'Retired', 'Retired', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 36801486-E291-48F4-BC02-432BE04642F3 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='36801486-E291-48F4-BC02-432BE04642F3';

/* SQL text to insert entity field value with ID b603b9ee-e9f1-41a8-8d9c-500160f70c92 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b603b9ee-e9f1-41a8-8d9c-500160f70c92', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 1, 'Date', 'Date', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6e88eeec-0c44-413b-9add-c1dd8d325215 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e88eeec-0c44-413b-9add-c1dd8d325215', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 2, 'Dropdown', 'Dropdown', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2d1336bf-066e-402b-a823-8d94ab544ea2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2d1336bf-066e-402b-a823-8d94ab544ea2', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 3, 'Email', 'Email', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7963bb8-b712-40dd-a7b5-9b18a5b14ae1 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7963bb8-b712-40dd-a7b5-9b18a5b14ae1', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 4, 'FileUpload', 'FileUpload', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bef3dc65-2dbe-4d98-8675-696a2be17a59 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bef3dc65-2dbe-4d98-8675-696a2be17a59', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 5, 'LongText', 'LongText', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7c8be7c9-6a4f-454c-a855-81751fb8955e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7c8be7c9-6a4f-454c-a855-81751fb8955e', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 6, 'MultiChoice', 'MultiChoice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7af7260d-177f-413f-aabc-a07121c4f538 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7af7260d-177f-413f-aabc-a07121c4f538', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 7, 'NPS', 'NPS', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 236665a7-f0ca-4254-92e7-106dcd6dfd35 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('236665a7-f0ca-4254-92e7-106dcd6dfd35', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 8, 'Number', 'Number', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 47b88450-fda8-4a13-bec7-38c6a7f2daee */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47b88450-fda8-4a13-bec7-38c6a7f2daee', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 9, 'Phone', 'Phone', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5a836273-74fd-4d37-8918-a1cb0f5dee57 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a836273-74fd-4d37-8918-a1cb0f5dee57', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 10, 'Rating', 'Rating', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 753c2962-6d2a-4081-8869-231cf37a15c8 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('753c2962-6d2a-4081-8869-231cf37a15c8', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 11, 'ShortText', 'ShortText', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4b4b6b5e-54f8-433f-bb63-cd271191d464 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b4b6b5e-54f8-433f-bb63-cd271191d464', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 12, 'SingleChoice', 'SingleChoice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d17f31f1-cfda-4684-9f76-ca0c8c17129b */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d17f31f1-cfda-4684-9f76-ca0c8c17129b', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 13, 'Statement', 'Statement', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f99a1046-5229-43fb-b95b-394208573996 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f99a1046-5229-43fb-b95b-394208573996', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 14, 'Time', 'Time', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 00cd7332-1881-48de-ae14-16d3a89c7835 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('00cd7332-1881-48de-ae14-16d3a89c7835', '0A4FF448-80DF-4D5D-94EC-E315822A1B45', 15, 'YesNo', 'YesNo', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0A4FF448-80DF-4D5D-94EC-E315822A1B45 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='0A4FF448-80DF-4D5D-94EC-E315822A1B45';

/* SQL text to insert entity field value with ID e3a63078-de8f-4836-9c49-fda146d97c6c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e3a63078-de8f-4836-9c49-fda146d97c6c', '3A10A102-4A2A-4F15-BDAD-231BD16EC34F', 1, 'Email', 'Email', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 92634c32-6ea1-4a07-ada7-bfcf3ec710c7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92634c32-6ea1-4a07-ada7-bfcf3ec710c7', '3A10A102-4A2A-4F15-BDAD-231BD16EC34F', 2, 'Embed', 'Embed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a4e687dd-a28f-4bcb-b2d1-b9fa26d640c2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a4e687dd-a28f-4bcb-b2d1-b9fa26d640c2', '3A10A102-4A2A-4F15-BDAD-231BD16EC34F', 3, 'PublicLink', 'PublicLink', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7ed9f470-3169-41a3-99ae-49b73fec367c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7ed9f470-3169-41a3-99ae-49b73fec367c', '3A10A102-4A2A-4F15-BDAD-231BD16EC34F', 4, 'QR', 'QR', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3A10A102-4A2A-4F15-BDAD-231BD16EC34F */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3A10A102-4A2A-4F15-BDAD-231BD16EC34F';

/* SQL text to insert entity field value with ID ec642f96-3acc-4627-a0f4-cad9bf0cc80f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ec642f96-3acc-4627-a0f4-cad9bf0cc80f', 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13f97d82-a070-490f-a8be-da1129a3ed3e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13f97d82-a070-490f-a8be-da1129a3ed3e', 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC', 2, 'Closed', 'Closed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8adec9aa-cbb8-4561-9d7c-0d806fff9b1a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8adec9aa-cbb8-4561-9d7c-0d806fff9b1a', 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC', 3, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B2168352-1A2C-413D-A7F2-0AD9AE14BFAC */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='B2168352-1A2C-413D-A7F2-0AD9AE14BFAC';

/* SQL text to insert entity field value with ID bf7fe39e-306d-407a-a86a-2aa338acd0b7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bf7fe39e-306d-407a-a86a-2aa338acd0b7', '38CA5677-5A04-4121-AA5C-D8FD325FEF67', 1, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 719712d6-558c-4087-8c3c-a1254801e211 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('719712d6-558c-4087-8c3c-a1254801e211', '38CA5677-5A04-4121-AA5C-D8FD325FEF67', 2, 'Partial', 'Partial', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 38CA5677-5A04-4121-AA5C-D8FD325FEF67 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='38CA5677-5A04-4121-AA5C-D8FD325FEF67';


/* Create Entity Relationship: MJ_BizApps_Forms: Form Responses -> MJ_BizApps_Forms: Form Response Answers (One To Many via ResponseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'e257cc40-2091-4c6f-9d5f-e30a95140e53'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e257cc40-2091-4c6f-9d5f-e30a95140e53', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'ResponseID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Versions -> MJ_BizApps_Forms: Form Responses (One To Many via FormVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '50260ae4-7623-4726-b049-523bb931f1ea'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('50260ae4-7623-4726-b049-523bb931f1ea', '622E2804-5B6D-4B43-92A4-294ADC538F50', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FormVersionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Forms: Forms (One To Many via OwnerUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ba2b7ea1-3602-4763-8358-f46617a0306a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ba2b7ea1-3602-4763-8358-f46617a0306a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'OwnerUserID', 'One To Many', 1, 1, 108, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ_BizApps_Forms: Form Response Answers (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c11d64f0-e2af-401c-bb75-f31ae1905c2c'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c11d64f0-e2af-401c-bb75-f31ae1905c2c', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'FileID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Distributions (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'bad12a59-2724-4a47-8808-785ce1edab63'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bad12a59-2724-4a47-8808-785ce1edab63', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '1FC60BDA-25B8-473B-ACE5-1238670D3535', 'FormID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Versions (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '3f0828d1-fbdb-464f-8fa5-8dc40626a743'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3f0828d1-fbdb-464f-8fa5-8dc40626a743', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '622E2804-5B6D-4B43-92A4-294ADC538F50', 'FormID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Questions (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6a072e73-3670-4200-b45f-4ec7c9858ef0'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6a072e73-3670-4200-b45f-4ec7c9858ef0', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'FormID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Pages (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '5981266e-6f57-45df-a394-9aaeabd5ac7f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5981266e-6f57-45df-a394-9aaeabd5ac7f', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'FormID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Responses (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'de633c98-baf5-406e-8159-3937b611c2e3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('de633c98-baf5-406e-8159-3937b611c2e3', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FormID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Pages -> MJ_BizApps_Forms: Form Questions (One To Many via PageID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'eff9400a-94da-4f3c-85aa-9a5492dc1867'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('eff9400a-94da-4f3c-85aa-9a5492dc1867', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'PageID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Categories -> MJ_BizApps_Forms: Forms (One To Many via CategoryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '29184830-0df4-4ca8-95f2-18959fadc81f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('29184830-0df4-4ca8-95f2-18959fadc81f', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'CategoryID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Categories -> MJ_BizApps_Forms: Form Categories (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '9d6bbfd7-0150-4389-9ed1-c3c66ee78598'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9d6bbfd7-0150-4389-9ed1-c3c66ee78598', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'ParentID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Styles -> MJ_BizApps_Forms: Forms (One To Many via StyleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '29c119d5-4dc2-4e7b-be58-395f024aaf0a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('29c119d5-4dc2-4e7b-be58-395f024aaf0a', '1EF36DB1-004D-4672-8A57-A0F3B71C0050', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'StyleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Questions -> MJ_BizApps_Forms: Form Question Options (One To Many via QuestionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '60b1b456-9eaa-4b65-902c-47eb232e5ca1'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('60b1b456-9eaa-4b65-902c-47eb232e5ca1', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'BF3016E2-8BA7-4975-83B6-02C9435C1441', 'QuestionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Questions -> MJ_BizApps_Forms: Form Response Answers (One To Many via QuestionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a03dd408-f488-48f5-a453-df62bd37a05a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a03dd408-f488-48f5-a453-df62bd37a05a', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'QuestionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Common: People -> MJ_BizApps_Forms: Form Responses (One To Many via RespondentPersonID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '446d0b34-2281-4987-bf84-667f68870677'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('446d0b34-2281-4987-bf84-667f68870677', '7A94ADA9-7880-4FAE-97D8-DB0E934C3F5F', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'RespondentPersonID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Base View SQL for MJ_BizApps_Common: Contact Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Contact Methods
-- Item: vwContactMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Common: Contact Methods
-----               SCHEMA:      ${mjSchema}_BizAppsCommon
-----               BASE TABLE:  ContactMethod
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[vwContactMethods]', 'V') IS NOT NULL
    DROP VIEW [${mjSchema}_BizAppsCommon].[vwContactMethods];
GO

CREATE VIEW [${mjSchema}_BizAppsCommon].[vwContactMethods]
AS
SELECT
    c.*,
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person],
    mjBizAppsCommonOrganization_OrganizationID.[Name] AS [Organization],
    mjBizAppsCommonContactType_ContactTypeID.[Name] AS [ContactType]
FROM
    [${mjSchema}_BizAppsCommon].[ContactMethod] AS c
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [c].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_OrganizationID
  ON
    [c].[OrganizationID] = mjBizAppsCommonOrganization_OrganizationID.[ID]
INNER JOIN
    [${mjSchema}_BizAppsCommon].[ContactType] AS mjBizAppsCommonContactType_ContactTypeID
  ON
    [c].[ContactTypeID] = mjBizAppsCommonContactType_ContactTypeID.[ID]
GO
GRANT SELECT ON [${mjSchema}_BizAppsCommon].[vwContactMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Common: Contact Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Contact Methods
-- Item: Permissions for vwContactMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${mjSchema}_BizAppsCommon].[vwContactMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Common: Contact Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Contact Methods
-- Item: spCreateContactMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactMethod
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spCreateContactMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spCreateContactMethod];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spCreateContactMethod]
    @ID uniqueidentifier = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @OrganizationID_Clear bit = 0,
    @OrganizationID uniqueidentifier = NULL,
    @ContactTypeID uniqueidentifier,
    @Value nvarchar(500),
    @Label_Clear bit = 0,
    @Label nvarchar(100) = NULL,
    @IsPrimary bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${mjSchema}_BizAppsCommon].[ContactMethod]
            (
                [ID],
                [PersonID],
                [OrganizationID],
                [ContactTypeID],
                [Value],
                [Label],
                [IsPrimary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, NULL) END,
                @ContactTypeID,
                @Value,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                ISNULL(@IsPrimary, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${mjSchema}_BizAppsCommon].[ContactMethod]
            (
                [PersonID],
                [OrganizationID],
                [ContactTypeID],
                [Value],
                [Label],
                [IsPrimary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, NULL) END,
                @ContactTypeID,
                @Value,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                ISNULL(@IsPrimary, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${mjSchema}_BizAppsCommon].[vwContactMethods] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spCreateContactMethod] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Common: Contact Methods */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spCreateContactMethod] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Common: Contact Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Contact Methods
-- Item: spUpdateContactMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactMethod
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spUpdateContactMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spUpdateContactMethod];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spUpdateContactMethod]
    @ID uniqueidentifier,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @OrganizationID_Clear bit = 0,
    @OrganizationID uniqueidentifier = NULL,
    @ContactTypeID uniqueidentifier = NULL,
    @Value nvarchar(500) = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(100) = NULL,
    @IsPrimary bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${mjSchema}_BizAppsCommon].[ContactMethod]
    SET
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [OrganizationID] = CASE WHEN @OrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OrganizationID, [OrganizationID]) END,
        [ContactTypeID] = ISNULL(@ContactTypeID, [ContactTypeID]),
        [Value] = ISNULL(@Value, [Value]),
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [IsPrimary] = ISNULL(@IsPrimary, [IsPrimary])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${mjSchema}_BizAppsCommon].[vwContactMethods] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${mjSchema}_BizAppsCommon].[vwContactMethods]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spUpdateContactMethod] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactMethod table
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[trgUpdateContactMethod]', 'TR') IS NOT NULL
    DROP TRIGGER [${mjSchema}_BizAppsCommon].[trgUpdateContactMethod];
GO
CREATE TRIGGER [${mjSchema}_BizAppsCommon].trgUpdateContactMethod
ON [${mjSchema}_BizAppsCommon].[ContactMethod]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${mjSchema}_BizAppsCommon].[ContactMethod]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${mjSchema}_BizAppsCommon].[ContactMethod] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Common: Contact Methods */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spUpdateContactMethod] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Common: Contact Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Contact Methods
-- Item: spDeleteContactMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactMethod
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spDeleteContactMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spDeleteContactMethod];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spDeleteContactMethod]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${mjSchema}_BizAppsCommon].[ContactMethod]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spDeleteContactMethod] TO [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Common: Contact Methods */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spDeleteContactMethod] TO [cdp_Integration];

/* Base View SQL for MJ_BizApps_Common: Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Relationships
-- Item: vwRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Common: Relationships
-----               SCHEMA:      ${mjSchema}_BizAppsCommon
-----               BASE TABLE:  Relationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[vwRelationships]', 'V') IS NOT NULL
    DROP VIEW [${mjSchema}_BizAppsCommon].[vwRelationships];
GO

CREATE VIEW [${mjSchema}_BizAppsCommon].[vwRelationships]
AS
SELECT
    r.*,
    mjBizAppsCommonRelationshipType_RelationshipTypeID.[Name] AS [RelationshipType],
    mjBizAppsCommonPerson_FromPersonID.[DisplayName] AS [FromPerson],
    mjBizAppsCommonOrganization_FromOrganizationID.[Name] AS [FromOrganization],
    mjBizAppsCommonPerson_ToPersonID.[DisplayName] AS [ToPerson],
    mjBizAppsCommonOrganization_ToOrganizationID.[Name] AS [ToOrganization]
FROM
    [${mjSchema}_BizAppsCommon].[Relationship] AS r
INNER JOIN
    [${mjSchema}_BizAppsCommon].[RelationshipType] AS mjBizAppsCommonRelationshipType_RelationshipTypeID
  ON
    [r].[RelationshipTypeID] = mjBizAppsCommonRelationshipType_RelationshipTypeID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_FromPersonID
  ON
    [r].[FromPersonID] = mjBizAppsCommonPerson_FromPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_FromOrganizationID
  ON
    [r].[FromOrganizationID] = mjBizAppsCommonOrganization_FromOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ToPersonID
  ON
    [r].[ToPersonID] = mjBizAppsCommonPerson_ToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ToOrganizationID
  ON
    [r].[ToOrganizationID] = mjBizAppsCommonOrganization_ToOrganizationID.[ID]
GO
GRANT SELECT ON [${mjSchema}_BizAppsCommon].[vwRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Common: Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Relationships
-- Item: Permissions for vwRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${mjSchema}_BizAppsCommon].[vwRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Common: Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Relationships
-- Item: spCreateRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Relationship
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spCreateRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spCreateRelationship];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spCreateRelationship]
    @ID uniqueidentifier = NULL,
    @RelationshipTypeID uniqueidentifier,
    @FromPersonID_Clear bit = 0,
    @FromPersonID uniqueidentifier = NULL,
    @FromOrganizationID_Clear bit = 0,
    @FromOrganizationID uniqueidentifier = NULL,
    @ToPersonID_Clear bit = 0,
    @ToPersonID uniqueidentifier = NULL,
    @ToOrganizationID_Clear bit = 0,
    @ToOrganizationID uniqueidentifier = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate date = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @Status nvarchar(50) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${mjSchema}_BizAppsCommon].[Relationship]
            (
                [ID],
                [RelationshipTypeID],
                [FromPersonID],
                [FromOrganizationID],
                [ToPersonID],
                [ToOrganizationID],
                [Title],
                [StartDate],
                [EndDate],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RelationshipTypeID,
                CASE WHEN @FromPersonID_Clear = 1 THEN NULL ELSE ISNULL(@FromPersonID, NULL) END,
                CASE WHEN @FromOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@FromOrganizationID, NULL) END,
                CASE WHEN @ToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ToPersonID, NULL) END,
                CASE WHEN @ToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ToOrganizationID, NULL) END,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${mjSchema}_BizAppsCommon].[Relationship]
            (
                [RelationshipTypeID],
                [FromPersonID],
                [FromOrganizationID],
                [ToPersonID],
                [ToOrganizationID],
                [Title],
                [StartDate],
                [EndDate],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RelationshipTypeID,
                CASE WHEN @FromPersonID_Clear = 1 THEN NULL ELSE ISNULL(@FromPersonID, NULL) END,
                CASE WHEN @FromOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@FromOrganizationID, NULL) END,
                CASE WHEN @ToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ToPersonID, NULL) END,
                CASE WHEN @ToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ToOrganizationID, NULL) END,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${mjSchema}_BizAppsCommon].[vwRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spCreateRelationship] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Common: Relationships */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spCreateRelationship] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Common: Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Relationships
-- Item: spUpdateRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Relationship
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spUpdateRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spUpdateRelationship];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spUpdateRelationship]
    @ID uniqueidentifier,
    @RelationshipTypeID uniqueidentifier = NULL,
    @FromPersonID_Clear bit = 0,
    @FromPersonID uniqueidentifier = NULL,
    @FromOrganizationID_Clear bit = 0,
    @FromOrganizationID uniqueidentifier = NULL,
    @ToPersonID_Clear bit = 0,
    @ToPersonID uniqueidentifier = NULL,
    @ToOrganizationID_Clear bit = 0,
    @ToOrganizationID uniqueidentifier = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @StartDate_Clear bit = 0,
    @StartDate date = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @Status nvarchar(50) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${mjSchema}_BizAppsCommon].[Relationship]
    SET
        [RelationshipTypeID] = ISNULL(@RelationshipTypeID, [RelationshipTypeID]),
        [FromPersonID] = CASE WHEN @FromPersonID_Clear = 1 THEN NULL ELSE ISNULL(@FromPersonID, [FromPersonID]) END,
        [FromOrganizationID] = CASE WHEN @FromOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@FromOrganizationID, [FromOrganizationID]) END,
        [ToPersonID] = CASE WHEN @ToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ToPersonID, [ToPersonID]) END,
        [ToOrganizationID] = CASE WHEN @ToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ToOrganizationID, [ToOrganizationID]) END,
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [StartDate] = CASE WHEN @StartDate_Clear = 1 THEN NULL ELSE ISNULL(@StartDate, [StartDate]) END,
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${mjSchema}_BizAppsCommon].[vwRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${mjSchema}_BizAppsCommon].[vwRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spUpdateRelationship] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Relationship table
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[trgUpdateRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${mjSchema}_BizAppsCommon].[trgUpdateRelationship];
GO
CREATE TRIGGER [${mjSchema}_BizAppsCommon].trgUpdateRelationship
ON [${mjSchema}_BizAppsCommon].[Relationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${mjSchema}_BizAppsCommon].[Relationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${mjSchema}_BizAppsCommon].[Relationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Common: Relationships */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spUpdateRelationship] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Common: Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Common: Relationships
-- Item: spDeleteRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Relationship
------------------------------------------------------------
IF OBJECT_ID('[${mjSchema}_BizAppsCommon].[spDeleteRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${mjSchema}_BizAppsCommon].[spDeleteRelationship];
GO

CREATE PROCEDURE [${mjSchema}_BizAppsCommon].[spDeleteRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${mjSchema}_BizAppsCommon].[Relationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spDeleteRelationship] TO [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Common: Relationships */

GRANT EXECUTE ON [${mjSchema}_BizAppsCommon].[spDeleteRelationship] TO [cdp_Integration];

/* Index for Foreign Keys for FormCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table FormCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormCategory_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormCategory_ParentID ON [${flyway:defaultSchema}].[FormCategory] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID BFEC1DE7-95E3-4C68-841E-80402093EADE */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='BFEC1DE7-95E3-4C68-841E-80402093EADE', @RelatedEntityNameFieldMap='Parent';

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

/* SQL text to update entity field related entity name field map for entity field ID 6798B45D-6288-4A1C-BDFE-4C1D29929B5F */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6798B45D-6288-4A1C-BDFE-4C1D29929B5F', @RelatedEntityNameFieldMap='Form';

/* Index for Foreign Keys for FormPage */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormPage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormPage_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormPage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormPage_FormID ON [${flyway:defaultSchema}].[FormPage] ([FormID]);

/* SQL text to update entity field related entity name field map for entity field ID DCA0C023-9DAC-4610-BE75-B992961F0D73 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DCA0C023-9DAC-4610-BE75-B992961F0D73', @RelatedEntityNameFieldMap='Form';

/* Index for Foreign Keys for FormQuestionOption */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key QuestionID in table FormQuestionOption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestionOption_QuestionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestionOption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestionOption_QuestionID ON [${flyway:defaultSchema}].[FormQuestionOption] ([QuestionID]);

/* Index for Foreign Keys for FormQuestion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormQuestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestion_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestion_FormID ON [${flyway:defaultSchema}].[FormQuestion] ([FormID]);

-- Index for foreign key PageID in table FormQuestion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormQuestion_PageID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormQuestion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormQuestion_PageID ON [${flyway:defaultSchema}].[FormQuestion] ([PageID]);

/* SQL text to update entity field related entity name field map for entity field ID C83FDDAA-982B-4756-9488-F01F819889B8 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C83FDDAA-982B-4756-9488-F01F819889B8', @RelatedEntityNameFieldMap='Form';

/* Base View SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: vwFormQuestionOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Question Options
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormQuestionOption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormQuestionOptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormQuestionOptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormQuestionOptions]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FormQuestionOption] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestionOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: Permissions for vwFormQuestionOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestionOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spCreateFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestionOption]
    @ID uniqueidentifier = NULL,
    @QuestionID uniqueidentifier,
    @Label nvarchar(500),
    @Value_Clear bit = 0,
    @Value nvarchar(500) = NULL,
    @DisplayOrder int = NULL,
    @IsDefault bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormQuestionOption]
            (
                [ID],
                [QuestionID],
                [Label],
                [Value],
                [DisplayOrder],
                [IsDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QuestionID,
                @Label,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                ISNULL(@DisplayOrder, 0),
                ISNULL(@IsDefault, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormQuestionOption]
            (
                [QuestionID],
                [Label],
                [Value],
                [DisplayOrder],
                [IsDefault]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QuestionID,
                @Label,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                ISNULL(@DisplayOrder, 0),
                ISNULL(@IsDefault, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormQuestionOptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spUpdateFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestionOption]
    @ID uniqueidentifier,
    @QuestionID uniqueidentifier = NULL,
    @Label nvarchar(500) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(500) = NULL,
    @DisplayOrder int = NULL,
    @IsDefault bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestionOption]
    SET
        [QuestionID] = ISNULL(@QuestionID, [QuestionID]),
        [Label] = ISNULL(@Label, [Label]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormQuestionOptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormQuestionOptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestionOption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormQuestionOption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormQuestionOption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormQuestionOption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormQuestionOption
ON [${flyway:defaultSchema}].[FormQuestionOption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestionOption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormQuestionOption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Question Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Question Options
-- Item: spDeleteFormQuestionOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormQuestionOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormQuestionOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestionOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestionOption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormQuestionOption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Question Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestionOption] TO [cdp_Developer], [cdp_Integration];

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
    @IsActive bit = NULL
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
                [IsActive]
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
                ISNULL(@CaptchaRequired, 1),
                ISNULL(@IsActive, 1)
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
                [IsActive]
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
                ISNULL(@CaptchaRequired, 1),
                ISNULL(@IsActive, 1)
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
    @IsActive bit = NULL
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
        [IsActive] = ISNULL(@IsActive, [IsActive])
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

/* Base View SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Questions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormQuestion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormQuestions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormQuestions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormQuestions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormQuestion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: Permissions for vwFormQuestions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormQuestions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spCreateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormQuestion]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50),
    @Prompt nvarchar(MAX),
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [ID],
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormQuestion]
            (
                [FormID],
                [PageID],
                [QuestionType],
                [Prompt],
                [HelpText],
                [IsRequired],
                [DisplayOrder],
                [ValidationRule],
                [ConditionalRule],
                [ScoringConfig],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, NULL) END,
                @QuestionType,
                @Prompt,
                CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, NULL) END,
                ISNULL(@IsRequired, 0),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, NULL) END,
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spUpdateFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormQuestion]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @PageID_Clear bit = 0,
    @PageID uniqueidentifier = NULL,
    @QuestionType nvarchar(50) = NULL,
    @Prompt nvarchar(MAX) = NULL,
    @HelpText_Clear bit = 0,
    @HelpText nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @DisplayOrder int = NULL,
    @ValidationRule_Clear bit = 0,
    @ValidationRule nvarchar(MAX) = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ScoringConfig_Clear bit = 0,
    @ScoringConfig nvarchar(MAX) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [PageID] = CASE WHEN @PageID_Clear = 1 THEN NULL ELSE ISNULL(@PageID, [PageID]) END,
        [QuestionType] = ISNULL(@QuestionType, [QuestionType]),
        [Prompt] = ISNULL(@Prompt, [Prompt]),
        [HelpText] = CASE WHEN @HelpText_Clear = 1 THEN NULL ELSE ISNULL(@HelpText, [HelpText]) END,
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ValidationRule] = CASE WHEN @ValidationRule_Clear = 1 THEN NULL ELSE ISNULL(@ValidationRule, [ValidationRule]) END,
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [ScoringConfig] = CASE WHEN @ScoringConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScoringConfig, [ScoringConfig]) END,
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormQuestions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormQuestions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormQuestion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormQuestion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormQuestion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormQuestion
ON [${flyway:defaultSchema}].[FormQuestion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormQuestion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormQuestion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Questions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Questions
-- Item: spDeleteFormQuestion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormQuestion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormQuestion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormQuestion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormQuestion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Questions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormQuestion] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for MJ_BizApps_Forms: Form Categories.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: fnFormCategoryParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [FormCategory].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[FormCategory]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[FormCategory] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: vwFormCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormCategories]
AS
SELECT
    f.*,
    mjBizAppsFormsFormCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[FormCategory] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormCategory] AS mjBizAppsFormsFormCategory_ParentID
  ON
    [f].[ParentID] = mjBizAppsFormsFormCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnFormCategoryParentID_GetRootID]([f].[ID], [f].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: Permissions for vwFormCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spCreateFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [IconClass],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [IconClass],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spUpdateFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormCategory]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [DisplayRank] = ISNULL(@DisplayRank, [DisplayRank]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormCategory
ON [${flyway:defaultSchema}].[FormCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Categories
-- Item: spDeleteFormCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormCategory] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: vwFormPages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Pages
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormPage
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormPages]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormPages];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormPages]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormPage] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormPages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: Permissions for vwFormPages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormPages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spCreateFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormPage]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormPage]
            (
                [ID],
                [FormID],
                [Title],
                [Description],
                [DisplayOrder],
                [ConditionalRule]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormPage]
            (
                [FormID],
                [Title],
                [Description],
                [DisplayOrder],
                [ConditionalRule]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormPages] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormPage] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormPage] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spUpdateFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormPage]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Title_Clear bit = 0,
    @Title nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormPage]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Title] = CASE WHEN @Title_Clear = 1 THEN NULL ELSE ISNULL(@Title, [Title]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormPages] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormPages]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormPage] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormPage table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormPage]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormPage];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormPage
ON [${flyway:defaultSchema}].[FormPage]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormPage]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormPage] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormPage] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Pages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Pages
-- Item: spDeleteFormPage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormPage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormPage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormPage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormPage]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormPage]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormPage] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Pages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormPage] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for FormResponseAnswer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ResponseID in table FormResponseAnswer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponseAnswer_ResponseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponseAnswer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponseAnswer_ResponseID ON [${flyway:defaultSchema}].[FormResponseAnswer] ([ResponseID]);

-- Index for foreign key QuestionID in table FormResponseAnswer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponseAnswer_QuestionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponseAnswer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponseAnswer_QuestionID ON [${flyway:defaultSchema}].[FormResponseAnswer] ([QuestionID]);

-- Index for foreign key FileID in table FormResponseAnswer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponseAnswer_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponseAnswer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponseAnswer_FileID ON [${flyway:defaultSchema}].[FormResponseAnswer] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID 75AF68CF-0A5B-410D-A087-A43F1A0F3A47 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='75AF68CF-0A5B-410D-A087-A43F1A0F3A47', @RelatedEntityNameFieldMap='File';

/* Index for Foreign Keys for FormResponse */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_FormID ON [${flyway:defaultSchema}].[FormResponse] ([FormID]);

-- Index for foreign key FormVersionID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_FormVersionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_FormVersionID ON [${flyway:defaultSchema}].[FormResponse] ([FormVersionID]);

-- Index for foreign key RespondentPersonID in table FormResponse
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormResponse_RespondentPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormResponse]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormResponse_RespondentPersonID ON [${flyway:defaultSchema}].[FormResponse] ([RespondentPersonID]);

/* SQL text to update entity field related entity name field map for entity field ID DC96C1FC-1F9B-4D7A-9FC7-9C25A7161D1F */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DC96C1FC-1F9B-4D7A-9FC7-9C25A7161D1F', @RelatedEntityNameFieldMap='Form';

/* Index for Foreign Keys for FormStyle */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for FormVersion */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormVersion
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormVersion_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormVersion]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormVersion_FormID ON [${flyway:defaultSchema}].[FormVersion] ([FormID]);

/* SQL text to update entity field related entity name field map for entity field ID 9A7D5E0A-73A9-4461-84E9-5AE14EE24990 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9A7D5E0A-73A9-4461-84E9-5AE14EE24990', @RelatedEntityNameFieldMap='Form';

/* Index for Foreign Keys for Form */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Form
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_CategoryID ON [${flyway:defaultSchema}].[Form] ([CategoryID]);

-- Index for foreign key StyleID in table Form
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_StyleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_StyleID ON [${flyway:defaultSchema}].[Form] ([StyleID]);

-- Index for foreign key OwnerUserID in table Form
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Form_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Form]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Form_OwnerUserID ON [${flyway:defaultSchema}].[Form] ([OwnerUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 2421F226-3A60-4E97-94F0-B819AEE55E6A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2421F226-3A60-4E97-94F0-B819AEE55E6A', @RelatedEntityNameFieldMap='Category';

/* Base View SQL for MJ_BizApps_Forms: Form Styles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: vwFormStyles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Styles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormStyle
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormStyles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormStyles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormStyles]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FormStyle] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormStyles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Styles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: Permissions for vwFormStyles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormStyles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Styles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: spCreateFormStyle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormStyle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormStyle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormStyle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormStyle]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CSSVariables_Clear bit = 0,
    @CSSVariables nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(1000) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormStyle]
            (
                [ID],
                [Name],
                [Description],
                [CSSVariables],
                [CustomCSS],
                [LogoURL],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CSSVariables_Clear = 1 THEN NULL ELSE ISNULL(@CSSVariables, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormStyle]
            (
                [Name],
                [Description],
                [CSSVariables],
                [CustomCSS],
                [LogoURL],
                [DisplayRank],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CSSVariables_Clear = 1 THEN NULL ELSE ISNULL(@CSSVariables, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END,
                CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, NULL) END,
                ISNULL(@DisplayRank, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormStyles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormStyle] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Styles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormStyle] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Styles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: spUpdateFormStyle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormStyle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormStyle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormStyle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormStyle]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CSSVariables_Clear bit = 0,
    @CSSVariables nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(1000) = NULL,
    @DisplayRank int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormStyle]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CSSVariables] = CASE WHEN @CSSVariables_Clear = 1 THEN NULL ELSE ISNULL(@CSSVariables, [CSSVariables]) END,
        [CustomCSS] = CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, [CustomCSS]) END,
        [LogoURL] = CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, [LogoURL]) END,
        [DisplayRank] = ISNULL(@DisplayRank, [DisplayRank]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormStyles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormStyles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormStyle] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormStyle table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormStyle]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormStyle];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormStyle
ON [${flyway:defaultSchema}].[FormStyle]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormStyle]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormStyle] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Styles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormStyle] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Styles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Styles
-- Item: spDeleteFormStyle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormStyle
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormStyle]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormStyle];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormStyle]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormStyle]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormStyle] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Styles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormStyle] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID A6CFE92B-2751-4668-8651-0B6C25F23B17 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A6CFE92B-2751-4668-8651-0B6C25F23B17', @RelatedEntityNameFieldMap='RespondentPerson';

/* SQL text to update entity field related entity name field map for entity field ID CAFEFEB9-0912-41C4-AA68-83AB38119540 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CAFEFEB9-0912-41C4-AA68-83AB38119540', @RelatedEntityNameFieldMap='Style';

/* Base View SQL for MJ_BizApps_Forms: Form Response Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: vwFormResponseAnswers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Response Answers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormResponseAnswer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormResponseAnswers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormResponseAnswers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormResponseAnswers]
AS
SELECT
    f.*,
    MJFile_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[FormResponseAnswer] AS f
LEFT OUTER JOIN
    [${mjSchema}].[File] AS MJFile_FileID
  ON
    [f].[FileID] = MJFile_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponseAnswers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Response Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: Permissions for vwFormResponseAnswers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponseAnswers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Response Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: spCreateFormResponseAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormResponseAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormResponseAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponseAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponseAnswer]
    @ID uniqueidentifier = NULL,
    @ResponseID uniqueidentifier,
    @QuestionID uniqueidentifier,
    @TextValue_Clear bit = 0,
    @TextValue nvarchar(MAX) = NULL,
    @NumericValue_Clear bit = 0,
    @NumericValue decimal(18, 4) = NULL,
    @DateValue_Clear bit = 0,
    @DateValue datetimeoffset = NULL,
    @BooleanValue_Clear bit = 0,
    @BooleanValue bit = NULL,
    @JSONValue_Clear bit = 0,
    @JSONValue nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Score_Clear bit = 0,
    @Score decimal(18, 4) = NULL,
    @ScoreRationale_Clear bit = 0,
    @ScoreRationale nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormResponseAnswer]
            (
                [ID],
                [ResponseID],
                [QuestionID],
                [TextValue],
                [NumericValue],
                [DateValue],
                [BooleanValue],
                [JSONValue],
                [FileID],
                [Score],
                [ScoreRationale]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ResponseID,
                @QuestionID,
                CASE WHEN @TextValue_Clear = 1 THEN NULL ELSE ISNULL(@TextValue, NULL) END,
                CASE WHEN @NumericValue_Clear = 1 THEN NULL ELSE ISNULL(@NumericValue, NULL) END,
                CASE WHEN @DateValue_Clear = 1 THEN NULL ELSE ISNULL(@DateValue, NULL) END,
                CASE WHEN @BooleanValue_Clear = 1 THEN NULL ELSE ISNULL(@BooleanValue, NULL) END,
                CASE WHEN @JSONValue_Clear = 1 THEN NULL ELSE ISNULL(@JSONValue, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @ScoreRationale_Clear = 1 THEN NULL ELSE ISNULL(@ScoreRationale, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormResponseAnswer]
            (
                [ResponseID],
                [QuestionID],
                [TextValue],
                [NumericValue],
                [DateValue],
                [BooleanValue],
                [JSONValue],
                [FileID],
                [Score],
                [ScoreRationale]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ResponseID,
                @QuestionID,
                CASE WHEN @TextValue_Clear = 1 THEN NULL ELSE ISNULL(@TextValue, NULL) END,
                CASE WHEN @NumericValue_Clear = 1 THEN NULL ELSE ISNULL(@NumericValue, NULL) END,
                CASE WHEN @DateValue_Clear = 1 THEN NULL ELSE ISNULL(@DateValue, NULL) END,
                CASE WHEN @BooleanValue_Clear = 1 THEN NULL ELSE ISNULL(@BooleanValue, NULL) END,
                CASE WHEN @JSONValue_Clear = 1 THEN NULL ELSE ISNULL(@JSONValue, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @ScoreRationale_Clear = 1 THEN NULL ELSE ISNULL(@ScoreRationale, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormResponseAnswers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponseAnswer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Response Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponseAnswer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Response Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: spUpdateFormResponseAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormResponseAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormResponseAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponseAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponseAnswer]
    @ID uniqueidentifier,
    @ResponseID uniqueidentifier = NULL,
    @QuestionID uniqueidentifier = NULL,
    @TextValue_Clear bit = 0,
    @TextValue nvarchar(MAX) = NULL,
    @NumericValue_Clear bit = 0,
    @NumericValue decimal(18, 4) = NULL,
    @DateValue_Clear bit = 0,
    @DateValue datetimeoffset = NULL,
    @BooleanValue_Clear bit = 0,
    @BooleanValue bit = NULL,
    @JSONValue_Clear bit = 0,
    @JSONValue nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Score_Clear bit = 0,
    @Score decimal(18, 4) = NULL,
    @ScoreRationale_Clear bit = 0,
    @ScoreRationale nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponseAnswer]
    SET
        [ResponseID] = ISNULL(@ResponseID, [ResponseID]),
        [QuestionID] = ISNULL(@QuestionID, [QuestionID]),
        [TextValue] = CASE WHEN @TextValue_Clear = 1 THEN NULL ELSE ISNULL(@TextValue, [TextValue]) END,
        [NumericValue] = CASE WHEN @NumericValue_Clear = 1 THEN NULL ELSE ISNULL(@NumericValue, [NumericValue]) END,
        [DateValue] = CASE WHEN @DateValue_Clear = 1 THEN NULL ELSE ISNULL(@DateValue, [DateValue]) END,
        [BooleanValue] = CASE WHEN @BooleanValue_Clear = 1 THEN NULL ELSE ISNULL(@BooleanValue, [BooleanValue]) END,
        [JSONValue] = CASE WHEN @JSONValue_Clear = 1 THEN NULL ELSE ISNULL(@JSONValue, [JSONValue]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [Score] = CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, [Score]) END,
        [ScoreRationale] = CASE WHEN @ScoreRationale_Clear = 1 THEN NULL ELSE ISNULL(@ScoreRationale, [ScoreRationale]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormResponseAnswers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormResponseAnswers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponseAnswer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormResponseAnswer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormResponseAnswer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormResponseAnswer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormResponseAnswer
ON [${flyway:defaultSchema}].[FormResponseAnswer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponseAnswer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormResponseAnswer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Response Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponseAnswer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Response Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Response Answers
-- Item: spDeleteFormResponseAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormResponseAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormResponseAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponseAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponseAnswer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormResponseAnswer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponseAnswer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Response Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponseAnswer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: vwFormVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Versions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormVersion
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormVersions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormVersions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormVersions]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form]
FROM
    [${flyway:defaultSchema}].[FormVersion] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: Permissions for vwFormVersions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormVersions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spCreateFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormVersion]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @VersionNumber int,
    @Status nvarchar(20) = NULL,
    @PublishedAt_Clear bit = 0,
    @PublishedAt datetimeoffset = NULL,
    @DefinitionSnapshot_Clear bit = 0,
    @DefinitionSnapshot nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormVersion]
            (
                [ID],
                [FormID],
                [VersionNumber],
                [Status],
                [PublishedAt],
                [DefinitionSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @VersionNumber,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, NULL) END,
                CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormVersion]
            (
                [FormID],
                [VersionNumber],
                [Status],
                [PublishedAt],
                [DefinitionSnapshot]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @VersionNumber,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, NULL) END,
                CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormVersions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spUpdateFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormVersion]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @VersionNumber int = NULL,
    @Status nvarchar(20) = NULL,
    @PublishedAt_Clear bit = 0,
    @PublishedAt datetimeoffset = NULL,
    @DefinitionSnapshot_Clear bit = 0,
    @DefinitionSnapshot nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormVersion]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [VersionNumber] = ISNULL(@VersionNumber, [VersionNumber]),
        [Status] = ISNULL(@Status, [Status]),
        [PublishedAt] = CASE WHEN @PublishedAt_Clear = 1 THEN NULL ELSE ISNULL(@PublishedAt, [PublishedAt]) END,
        [DefinitionSnapshot] = CASE WHEN @DefinitionSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@DefinitionSnapshot, [DefinitionSnapshot]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormVersions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormVersions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormVersion table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormVersion]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormVersion];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormVersion
ON [${flyway:defaultSchema}].[FormVersion]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormVersion]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormVersion] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Versions
-- Item: spDeleteFormVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormVersion
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormVersion]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormVersion];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormVersion]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormVersion]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Versions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormVersion] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: vwFormResponses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Responses
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormResponse
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormResponses]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormResponses];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormResponses]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    mjBizAppsCommonPerson_RespondentPersonID.[DisplayName] AS [RespondentPerson]
FROM
    [${flyway:defaultSchema}].[FormResponse] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_RespondentPersonID
  ON
    [f].[RespondentPersonID] = mjBizAppsCommonPerson_RespondentPersonID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: Permissions for vwFormResponses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormResponses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spCreateFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormResponse]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @FormVersionID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @RespondentPersonID_Clear bit = 0,
    @RespondentPersonID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @SubmittedAt_Clear bit = 0,
    @SubmittedAt datetimeoffset = NULL,
    @SourceMetadata_Clear bit = 0,
    @SourceMetadata nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormResponse]
            (
                [ID],
                [FormID],
                [FormVersionID],
                [Status],
                [AnonymousSessionID],
                [RespondentPersonID],
                [StartedAt],
                [SubmittedAt],
                [SourceMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @FormVersionID,
                ISNULL(@Status, 'Partial'),
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, NULL) END,
                CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormResponse]
            (
                [FormID],
                [FormVersionID],
                [Status],
                [AnonymousSessionID],
                [RespondentPersonID],
                [StartedAt],
                [SubmittedAt],
                [SourceMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @FormVersionID,
                ISNULL(@Status, 'Partial'),
                CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, NULL) END,
                CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, NULL) END,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, NULL) END,
                CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormResponses] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spUpdateFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormResponse]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @FormVersionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @AnonymousSessionID_Clear bit = 0,
    @AnonymousSessionID nvarchar(255) = NULL,
    @RespondentPersonID_Clear bit = 0,
    @RespondentPersonID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @SubmittedAt_Clear bit = 0,
    @SubmittedAt datetimeoffset = NULL,
    @SourceMetadata_Clear bit = 0,
    @SourceMetadata nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponse]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [FormVersionID] = ISNULL(@FormVersionID, [FormVersionID]),
        [Status] = ISNULL(@Status, [Status]),
        [AnonymousSessionID] = CASE WHEN @AnonymousSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AnonymousSessionID, [AnonymousSessionID]) END,
        [RespondentPersonID] = CASE WHEN @RespondentPersonID_Clear = 1 THEN NULL ELSE ISNULL(@RespondentPersonID, [RespondentPersonID]) END,
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [SubmittedAt] = CASE WHEN @SubmittedAt_Clear = 1 THEN NULL ELSE ISNULL(@SubmittedAt, [SubmittedAt]) END,
        [SourceMetadata] = CASE WHEN @SourceMetadata_Clear = 1 THEN NULL ELSE ISNULL(@SourceMetadata, [SourceMetadata]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormResponses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormResponses]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponse] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormResponse table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormResponse]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormResponse];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormResponse
ON [${flyway:defaultSchema}].[FormResponse]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormResponse]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormResponse] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Responses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Responses
-- Item: spDeleteFormResponse
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormResponse
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormResponse]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponse];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormResponse]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormResponse]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponse] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Responses */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormResponse] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 8AE25576-AC84-41C5-9176-56C0B4B1698A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8AE25576-AC84-41C5-9176-56C0B4B1698A', @RelatedEntityNameFieldMap='OwnerUser';

/* Base View SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: vwForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Forms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Form
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwForms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwForms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwForms]
AS
SELECT
    f.*,
    mjBizAppsFormsFormCategory_CategoryID.[Name] AS [Category],
    mjBizAppsFormsFormStyle_StyleID.[Name] AS [Style],
    MJUser_OwnerUserID.[Name] AS [OwnerUser]
FROM
    [${flyway:defaultSchema}].[Form] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormCategory] AS mjBizAppsFormsFormCategory_CategoryID
  ON
    [f].[CategoryID] = mjBizAppsFormsFormCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormStyle] AS mjBizAppsFormsFormStyle_StyleID
  ON
    [f].[StyleID] = mjBizAppsFormsFormStyle_StyleID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_OwnerUserID
  ON
    [f].[OwnerUserID] = MJUser_OwnerUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: Permissions for vwForms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwForms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spCreateForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateForm]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @StyleID_Clear bit = 0,
    @StyleID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @RenderMode nvarchar(20) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Form]
            (
                [ID],
                [Name],
                [Description],
                [CategoryID],
                [StyleID],
                [Status],
                [OwnerUserID],
                [RenderMode],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@RenderMode, 'Scroll'),
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Form]
            (
                [Name],
                [Description],
                [CategoryID],
                [StyleID],
                [Status],
                [OwnerUserID],
                [RenderMode],
                [Settings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, NULL) END,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                ISNULL(@RenderMode, 'Scroll'),
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwForms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateForm] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spUpdateForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateForm]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @StyleID_Clear bit = 0,
    @StyleID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @RenderMode nvarchar(20) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Form]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [StyleID] = CASE WHEN @StyleID_Clear = 1 THEN NULL ELSE ISNULL(@StyleID, [StyleID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [OwnerUserID] = CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, [OwnerUserID]) END,
        [RenderMode] = ISNULL(@RenderMode, [RenderMode]),
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwForms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwForms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Form table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateForm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateForm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateForm
ON [${flyway:defaultSchema}].[Form]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Form]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Form] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateForm] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Forms
-- Item: spDeleteForm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Form
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteForm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteForm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteForm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Form]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Forms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteForm] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (10 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='43ECBEA3-6CFC-480C-823F-96B5DB201FE7,1EF36DB1-004D-4672-8A57-A0F3B71C0050,C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8,622E2804-5B6D-4B43-92A4-294ADC538F50,A3BFAA2D-3158-4EED-9934-76D1E35D20F6,C396B99F-0677-47F8-BAEF-BCB08DE5CF97,BF3016E2-8BA7-4975-83B6-02C9435C1441,1FC60BDA-25B8-473B-ACE5-1238670D3535,63600739-7165-4BDC-B7D7-19A1B1951DFA,D03BCDF5-0B32-4EA8-88E8-F73D70A90810';

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7331258f-34a3-4bda-b4db-347db3a16148' OR (EntityID = '1FC60BDA-25B8-473B-ACE5-1238670D3535' AND Name = 'Form')) BEGIN
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
            '7331258f-34a3-4bda-b4db-347db3a16148',
            '1FC60BDA-25B8-473B-ACE5-1238670D3535', -- Entity: MJ_BizApps_Forms: Form Distributions
            100031,
            'Form',
            'Form',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6a6fca68-3ed7-437a-85ff-e94b903994c3' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'Form')) BEGIN
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
            '6a6fca68-3ed7-437a-85ff-e94b903994c3',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100023,
            'Form',
            'Form',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fd73ced5-a116-4a34-be6f-12c86f054274' OR (EntityID = '63600739-7165-4BDC-B7D7-19A1B1951DFA' AND Name = 'RespondentPerson')) BEGIN
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
            'fd73ced5-a116-4a34-be6f-12c86f054274',
            '63600739-7165-4BDC-B7D7-19A1B1951DFA', -- Entity: MJ_BizApps_Forms: Form Responses
            100024,
            'RespondentPerson',
            'Respondent Person',
            NULL,
            'nvarchar',
            402,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e99b2d46-1141-43e9-a3b8-578a0e25dc65' OR (EntityID = '622E2804-5B6D-4B43-92A4-294ADC538F50' AND Name = 'Form')) BEGIN
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
            'e99b2d46-1141-43e9-a3b8-578a0e25dc65',
            '622E2804-5B6D-4B43-92A4-294ADC538F50', -- Entity: MJ_BizApps_Forms: Form Versions
            100017,
            'Form',
            'Form',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e8a0c1d1-ce9d-439d-8034-04abefa7eb40' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Category')) BEGIN
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
            'e8a0c1d1-ce9d-439d-8034-04abefa7eb40',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100023,
            'Category',
            'Category',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fb29e97e-f448-4c04-9d4b-8f79ba25be65' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'Style')) BEGIN
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
            'fb29e97e-f448-4c04-9d4b-8f79ba25be65',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100024,
            'Style',
            'Style',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a744f418-66db-4475-a548-009f548b0105' OR (EntityID = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8' AND Name = 'OwnerUser')) BEGIN
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
            'a744f418-66db-4475-a548-009f548b0105',
            'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', -- Entity: MJ_BizApps_Forms: Forms
            100025,
            'OwnerUser',
            'Owner User',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '888297d3-e8c8-4bc2-ba81-7583b2987424' OR (EntityID = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6' AND Name = 'Form')) BEGIN
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
            '888297d3-e8c8-4bc2-ba81-7583b2987424',
            'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', -- Entity: MJ_BizApps_Forms: Form Pages
            100017,
            'Form',
            'Form',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '23b52466-20e8-4bad-9415-3ed07e743b8e' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'Parent')) BEGIN
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
            '23b52466-20e8-4bad-9415-3ed07e743b8e',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100019,
            'Parent',
            'Parent',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'abe1e6be-cd00-4cf7-819f-63d3157ec493' OR (EntityID = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7' AND Name = 'RootParentID')) BEGIN
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
            'abe1e6be-cd00-4cf7-819f-63d3157ec493',
            '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', -- Entity: MJ_BizApps_Forms: Form Categories
            100020,
            'RootParentID',
            'Root Parent ID',
            NULL,
            'uniqueidentifier',
            16,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '581327c5-0a60-41ba-a25a-3b5a171050cc' OR (EntityID = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97' AND Name = 'Form')) BEGIN
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
            '581327c5-0a60-41ba-a25a-3b5a171050cc',
            'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', -- Entity: MJ_BizApps_Forms: Form Questions
            100029,
            'Form',
            'Form',
            NULL,
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5345a5a1-e772-43f6-8fad-9794c3153d2e' OR (EntityID = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810' AND Name = 'File')) BEGIN
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
            '5345a5a1-e772-43f6-8fad-9794c3153d2e',
            'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', -- Entity: MJ_BizApps_Forms: Form Response Answers
            100027,
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
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

/* SQL text to update existing entity fields from schema (10 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}', @EntityIDs='43ECBEA3-6CFC-480C-823F-96B5DB201FE7,1EF36DB1-004D-4672-8A57-A0F3B71C0050,C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8,622E2804-5B6D-4B43-92A4-294ADC538F50,A3BFAA2D-3158-4EED-9934-76D1E35D20F6,C396B99F-0677-47F8-BAEF-BCB08DE5CF97,BF3016E2-8BA7-4975-83B6-02C9435C1441,1FC60BDA-25B8-473B-ACE5-1238670D3535,63600739-7165-4BDC-B7D7-19A1B1951DFA,D03BCDF5-0B32-4EA8-88E8-F73D70A90810';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema}';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D79C0B78-E04F-421B-A400-CA553FF59323'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '93B156AD-2C29-4092-91C2-65F92E98E578'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '23B52466-20E8-4BAD-9415-3ED07E743B8E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'BC9E36EF-C93E-48BF-9F84-53F402CE6DE2'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '885257F0-F6A9-4999-8C07-6B5764C3B8A6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '888297D3-E8C8-4BC2-BA81-7583B2987424'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F43882AD-2DFD-4BC3-9FBE-ABF60ADFF048'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '27B92BC4-4F9B-4167-ABC9-B22D7EB6939A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B404E767-712E-48DD-9B1C-849074A06D5D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F43882AD-2DFD-4BC3-9FBE-ABF60ADFF048'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '19A5FB8D-BE86-4F84-9BB9-45437A878EFB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '284688DE-AEA8-4960-AA9A-B98ED80BCF96'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7331258F-34A3-4BDA-B4DB-347DB3A16148'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '866866B1-F573-4D3D-ACDB-C74582A22054'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '866866B1-F573-4D3D-ACDB-C74582A22054'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '02B3434B-2660-4665-B1D7-383876ADFC24'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '02B3434B-2660-4665-B1D7-383876ADFC24'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '34062C98-E7F1-4000-8E98-AC020B1B7225'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AFEEA024-7E9F-4C98-AEE1-0332D898C101'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '405711DF-CDB0-4FFA-88AF-AF9D9E971FCA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '02B3434B-2660-4665-B1D7-383876ADFC24'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '34062C98-E7F1-4000-8E98-AC020B1B7225'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E02E1400-5755-45BB-B7AF-B2A73BFA2B83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Category Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC9E36EF-C93E-48BF-9F84-53F402CE6DE2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Category Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4028417C-6BBD-41DC-8429-27BC0020690E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.IconClass 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Category Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F77B517-002F-4BFD-942E-2063342D5014' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.ParentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BFEC1DE7-95E3-4C68-841E-80402093EADE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.Parent 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23B52466-20E8-4BAD-9415-3ED07E743B8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.RootParentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABE1E6BE-CD00-4CF7-819F-63D3157EC493' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.DisplayRank 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Hierarchy and Sorting',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D79C0B78-E04F-421B-A400-CA553FF59323' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Category Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93B156AD-2C29-4092-91C2-65F92E98E578' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77DE29D8-1A47-4174-A476-14D2FBF10D3B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Categories.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4235AC79-5AA0-4232-8754-B037487F1397' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-folder-tree */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-folder-tree', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('df34db0b-af0f-4f8b-8c9e-024a929fefa3', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'FieldCategoryInfo', '{"Category Details":{"icon":"fa fa-info-circle","description":"Essential descriptive information and display settings for the category"},"Hierarchy and Sorting":{"icon":"fa fa-sitemap","description":"Structure and navigation order settings for the category tree"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9d7c42e4-ce87-4819-8a74-501ec4e859e0', '43ECBEA3-6CFC-480C-823F-96B5DB201FE7', 'FieldCategoryIcons', '{"Category Details":"fa fa-info-circle","Hierarchy and Sorting":"fa fa-sitemap","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '43ECBEA3-6CFC-480C-823F-96B5DB201FE7';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '994DCC05-13CF-45B4-B70D-4EF00E053997' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.QuestionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Question',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3E792A1-6B2B-448E-95B1-0C2ECAB5FEBC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.Label 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '02B3434B-2660-4665-B1D7-383876ADFC24' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.Value 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34062C98-E7F1-4000-8E98-AC020B1B7225' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AFEEA024-7E9F-4C98-AEE1-0332D898C101' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '405711DF-CDB0-4FFA-88AF-AF9D9E971FCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A491CD71-2032-48C4-9579-23AC41803627' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Question Options.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7586E5E7-058E-4172-B75A-F322768D89AE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-list-ul */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-list-ul', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BF3016E2-8BA7-4975-83B6-02C9435C1441';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('eb41d3c5-7894-46b7-96d5-fd2dfe1cfe4c', 'BF3016E2-8BA7-4975-83B6-02C9435C1441', 'FieldCategoryInfo', '{"Option Configuration":{"icon":"fa fa-cog","description":"Core settings for the choice option including its label, value, and parent question"},"Display Settings":{"icon":"fa fa-sort-amount-down","description":"Settings controlling the visual order and default selection state of the option"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('605389f8-669f-4916-84ba-d19c8be71625', 'BF3016E2-8BA7-4975-83B6-02C9435C1441', 'FieldCategoryIcons', '{"Option Configuration":"fa fa-cog","Display Settings":"fa fa-sort-amount-down","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BF3016E2-8BA7-4975-83B6-02C9435C1441';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '499A1F6F-ED7B-4A6B-9F41-CE033E0F4117' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Structure & Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCA0C023-9DAC-4610-BE75-B992961F0D73' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Structure & Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '888297D3-E8C8-4BC2-BA81-7583B2987424' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Title 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Page Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '85651746-4FD6-4B72-8E1E-CF6D9155358C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Page Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9E0B37B-2360-49E9-B0F5-09D27718E771' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Structure & Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '885257F0-F6A9-4999-8C07-6B5764C3B8A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Structure & Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A6895D0E-FBF5-420B-924A-F6BFDE686F0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '89AC8052-1B77-4569-90D5-90B7C4E7EDFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Pages.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E12E031-C7D1-495D-9D51-86B9693C6D08' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-medical-alt */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-file-medical-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9df10b71-ce04-4e2f-9ace-0cca74b46592', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'FieldCategoryInfo', '{"Page Content":{"icon":"fa fa-file-alt","description":"The text, headings, and descriptions displayed directly to the respondent on this page."},"Structure & Logic":{"icon":"fa fa-sitemap","description":"Settings governing the page''s position, parent form association, and visibility rules."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('78c66bf4-2747-4fbd-9072-d62d3097bbe2', 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6', 'FieldCategoryIcons', '{"Page Content":"fa fa-file-alt","Structure & Logic":"fa fa-sitemap","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'A3BFAA2D-3158-4EED-9934-76D1E35D20F6';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9903E88-261D-4043-BECC-A9448E75BF8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Structure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C83FDDAA-982B-4756-9488-F01F819889B8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.PageID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Structure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5610750-DF58-471F-933D-A8873B15600B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Structure',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '581327C5-0A60-41BA-A25A-3B5A171050CC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Structure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B404E767-712E-48DD-9B1C-849074A06D5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.QuestionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Question Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A4FF448-80DF-4D5D-94EC-E315822A1B45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Prompt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Question Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F43882AD-2DFD-4BC3-9FBE-ABF60ADFF048' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.HelpText 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Question Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A3F91065-EFBC-48A3-9546-80E3A431344D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.IsRequired 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Rules and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27B92BC4-4F9B-4167-ABC9-B22D7EB6939A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ValidationRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Rules and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'A2677DB5-121E-41F1-862B-6F7FE876FEFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Rules and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D7EC6A52-F85C-45D8-89E4-26CADF2EFCCA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.ScoringConfig 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Rules and Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Scoring Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'BFAE940F-B36B-479D-833D-88BA789DA4A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.Settings 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Rules and Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9685E608-F874-4DCE-92B1-C628FC77DB15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6F82852-D6BA-42C5-8085-AF83BC25896C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Questions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4960171-01A7-4200-93EB-794F736F616E' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-question-circle */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-question-circle', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4dd9e49d-408d-40ba-87f6-945d76942792', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'FieldCategoryInfo', '{"Question Content":{"icon":"fa fa-comment-alt","description":"The textual content, prompts, and input types of the question."},"Form Structure":{"icon":"fa fa-sitemap","description":"Structural properties linking the question to forms, pages, and defining display order."},"Rules and Configuration":{"icon":"fa fa-sliders-h","description":"Validation, conditional visibility, scoring, and custom settings for the question."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('100b642c-ae70-4c71-832f-e53a0045f2eb', 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97', 'FieldCategoryIcons', '{"Question Content":"fa fa-comment-alt","Form Structure":"fa fa-sitemap","Rules and Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C396B99F-0677-47F8-BAEF-BCB08DE5CF97';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB722F5E-2FD8-437A-8B1A-EF01A930F980' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6798B45D-6288-4A1C-BDFE-4C1D29929B5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7331258F-34A3-4BDA-B4DB-347DB3A16148' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20E36F64-0F3F-4C81-8645-659C9F50F5FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Slug 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'URL Slug',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '866866B1-F573-4D3D-ACDB-C74582A22054' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ChannelType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A10A102-4A2A-4F15-BDAD-231BD16EC34F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2168352-1A2C-413D-A7F2-0AD9AE14BFAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Distribution Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284688DE-AEA8-4960-AA9A-B98ED80BCF96' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.OpenAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CA1D54E-3DE5-4505-9D62-F5F46031B164' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.CloseAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E2346265-1BB3-4957-9768-B7A286339D38' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.MaxResponses 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   DisplayName = 'Maximum Responses',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0668174-8180-4C67-9DF7-8183E0B30851' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.ResponseCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19A5FB8D-BE86-4F84-9BB9-45437A878EFB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.CaptchaRequired 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   DisplayName = 'CAPTCHA Required',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8FC49DF-B819-41F0-B1DE-DADBFF171519' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.MagicLinkInviteID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Access and Limits',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B77F00D4-F944-4023-9A5E-3EE46E242B6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41D93C94-5CB9-4126-8E63-F662C05878E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Distributions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1053B9B8-3094-4201-9903-506A702DFF22' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-share-square */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-share-square', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4cddc64e-bf63-4069-8c56-d23eeb4b48c5', '1FC60BDA-25B8-473B-ACE5-1238670D3535', 'FieldCategoryInfo', '{"Distribution Configuration":{"icon":"fa fa-share-alt","description":"Settings defining the channel type, status, and naming of the form distribution."},"Access and Limits":{"icon":"fa fa-key","description":"Controls for scheduling, response limits, security verification, and secure links."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('61bb5988-6eec-470e-b5e3-08d539dd089d', '1FC60BDA-25B8-473B-ACE5-1238670D3535', 'FieldCategoryIcons', '{"Distribution Configuration":"fa fa-share-alt","Access and Limits":"fa fa-key","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1FC60BDA-25B8-473B-ACE5-1238670D3535';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '94BCE002-088D-4D73-83E0-76666BA3055F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '38345D6E-F2AD-4FDA-81B0-255B00F177A5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '62FF749C-AA71-4A58-A831-F252380645B6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E99ACA0B-4F27-49A8-96F0-D6B4244920A1'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '38CA5677-5A04-4121-AA5C-D8FD325FEF67'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C1FD44FB-013F-4919-8214-FB04A5968E93'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FD111DEF-402D-4044-9E13-8A115BEB1FBA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6A6FCA68-3ED7-437A-85FF-E94B903994C3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FD73CED5-A116-4A34-BE6F-12C86F054274'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6A6FCA68-3ED7-437A-85FF-E94B903994C3'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD73CED5-A116-4A34-BE6F-12C86F054274'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ACF08639-0240-41AE-A165-D793E087E262'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '31571ECA-C123-49BD-B9E3-493D561D0F86'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1381E224-7565-483D-8012-F03DF96A1E77'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4C390D42-2642-4568-9BD9-A01D1DBD56F1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3AC92D71-70FF-498A-A316-993A78979C61'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ACF08639-0240-41AE-A165-D793E087E262'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C03EAD1-3A5B-408C-AEB6-261318143025'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8C879F40-9016-463A-99C5-1BD6495CF3A5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6E914524-14E8-4408-96B6-CBC4B6B97E17'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A744F418-66DB-4475-A548-009F548B0105'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8C879F40-9016-463A-99C5-1BD6495CF3A5'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A744F418-66DB-4475-A548-009F548B0105'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '78B49574-A9C0-41B2-9352-01C24FE35FBA'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '8C879F40-9016-463A-99C5-1BD6495CF3A5'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A744F418-66DB-4475-A548-009F548B0105'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1BAA2EA5-C5A4-4F8B-B6ED-84C2EB7F4A02'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '36801486-E291-48F4-BC02-432BE04642F3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E833C165-D0DD-4491-AFDC-FAE97236F845'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E99B2D46-1141-43E9-A3B8-578A0E25DC65'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E99B2D46-1141-43E9-A3B8-578A0E25DC65'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D082382-A267-408A-8AA5-40EC3162682B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.ResponseID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Response Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Response',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B4D02511-4EB2-4D84-A3F7-A1B9D15666D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.QuestionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Response Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Question',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A500243A-077B-4218-B5CC-8DC9D123206C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.TextValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Answer Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACF08639-0240-41AE-A165-D793E087E262' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.NumericValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Answer Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '31571ECA-C123-49BD-B9E3-493D561D0F86' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.DateValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Answer Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1381E224-7565-483D-8012-F03DF96A1E77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.BooleanValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Answer Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C390D42-2642-4568-9BD9-A01D1DBD56F1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.JSONValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Answer Content',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E62DBDC4-CE0C-4723-99FE-83FE905CCF18' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.FileID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Attachment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '75AF68CF-0A5B-410D-A087-A43F1A0F3A47' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.File 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'File Attachment',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5345A5A1-E772-43F6-8FAD-9794C3153D2E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.Score 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Evaluation and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AC92D71-70FF-498A-A316-993A78979C61' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.ScoreRationale 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Evaluation and Scoring',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C03EAD1-3A5B-408C-AEB6-261318143025' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3C5D14A-5FA8-47D4-9450-E0D3434FB3FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Response Answers.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC891545-F18B-4AFB-A46B-FC89ED81F14F' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-list-alt */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-list-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('73d15d2a-8a6d-46a5-b921-52ed9f63ee7a', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'FieldCategoryInfo', '{"Form Response Context":{"icon":"fa fa-link","description":"Fields linking the answer to the specific form response and question."},"Answer Content":{"icon":"fa fa-edit","description":"Typed fields for storing various types of answer data."},"File Attachment":{"icon":"fa fa-paperclip","description":"Fields related to file uploads and attachments."},"Evaluation and Scoring":{"icon":"fa fa-star","description":"Fields for automated scoring and reasoning of form answers."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ab48fd46-22be-4c1f-a96b-415474306d44', 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810', 'FieldCategoryIcons', '{"Form Response Context":"fa fa-link","Answer Content":"fa fa-edit","File Attachment":"fa fa-paperclip","Evaluation and Scoring":"fa fa-star","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D03BCDF5-0B32-4EA8-88E8-F73D70A90810';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '79DB70EC-842F-4F05-9D16-876D59F3AB69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Style Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E99ACA0B-4F27-49A8-96F0-D6B4244920A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Style Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D7100A09-F513-4D69-9F62-29ADD26140F7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.CSSVariables 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Theme Code',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F090B12B-BC26-40F6-94B1-05C08C761230' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.CustomCSS 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Theme Code',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'CSS'
WHERE 
   ID = 'E3D8D3C6-F6FA-49FF-8A2A-318118DBF94F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.LogoURL 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Style Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'D950CB92-E4AB-4799-BE78-83850E027650' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.DisplayRank 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Style Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '94BCE002-088D-4D73-83E0-76666BA3055F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Style Identity',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38345D6E-F2AD-4FDA-81B0-255B00F177A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A30DBD4A-A40B-4B26-BA51-A1BCEDEDE24E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Styles.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '62FF749C-AA71-4A58-A831-F252380645B6' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-palette */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-palette', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '1EF36DB1-004D-4672-8A57-A0F3B71C0050';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7c782860-6069-46af-8a2c-fbfece74fe58', '1EF36DB1-004D-4672-8A57-A0F3B71C0050', 'FieldCategoryInfo', '{"Style Identity":{"icon":"fa fa-id-card","description":"Basic identification, logo, and display settings for the style theme"},"Theme Code":{"icon":"fa fa-code","description":"Design token overrides and raw CSS stylesheets for advanced custom styling"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('18a56260-c266-4085-834d-d19a64c44622', '1EF36DB1-004D-4672-8A57-A0F3B71C0050', 'FieldCategoryIcons', '{"Style Identity":"fa fa-id-card","Theme Code":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '1EF36DB1-004D-4672-8A57-A0F3B71C0050';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1FE5A15-8A97-4E58-969C-9141F08645F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC96C1FC-1F9B-4D7A-9FC7-9C25A7161D1F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.FormVersionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F566F224-45B9-4629-B04B-A3B39EB13E54' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form & Status',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A6FCA68-3ED7-437A-85FF-E94B903994C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form & Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38CA5677-5A04-4121-AA5C-D8FD325FEF67' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.RespondentPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Respondent Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6CFE92B-2751-4668-8651-0B6C25F23B17' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.RespondentPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Respondent Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD73CED5-A116-4A34-BE6F-12C86F054274' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.AnonymousSessionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Respondent Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3DB71FE-8C4F-47E7-9CE3-4FE7182EC829' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.StartedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Submission Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1FD44FB-013F-4919-8214-FB04A5968E93' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.SubmittedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Submission Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD111DEF-402D-4044-9E13-8A115BEB1FBA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.SourceMetadata 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Submission Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '5A92B934-65E1-4FEE-92DE-C53A776AD87C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '304F0501-0984-4454-88C7-62B2FD251FDD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Responses.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '14C4D3DC-BCC7-4CFB-93FF-E40914D80433' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('79b89780-aaab-4c06-91cc-a97890cf94d7', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FieldCategoryInfo', '{"Form & Status":{"icon":"fa fa-file-alt","description":"Information regarding the associated form, version, and completion status."},"Respondent Details":{"icon":"fa fa-user-circle","description":"Information identifying the individual who submitted the response, whether anonymous or registered."},"Submission Metadata":{"icon":"fa fa-clock","description":"Timestamps and technical metadata captured during the form submission process."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a414ef60-e97d-4cd6-8129-670af218a6cb', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'FieldCategoryIcons', '{"Form & Status":"fa fa-file-alt","Respondent Details":"fa fa-user-circle","Submission Metadata":"fa fa-clock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '63600739-7165-4BDC-B7D7-19A1B1951DFA';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DC15128-B17F-45C1-87BE-DC4CD02B49E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78B49574-A9C0-41B2-9352-01C24FE35FBA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27D8B5EB-327D-4379-9836-154FF01C06BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.CategoryID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2421F226-3A60-4E97-94F0-B819AEE55E6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Category 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E8A0C1D1-CE9D-439D-8034-04ABEFA7EB40' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C879F40-9016-463A-99C5-1BD6495CF3A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.OwnerUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AE25576-AC84-41C5-9176-56C0B4B1698A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.OwnerUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A744F418-66DB-4475-A548-009F548B0105' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.StyleID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Presentation & Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CAFEFEB9-0912-41C4-AA68-83AB38119540' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Style 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Presentation & Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB29E97E-F448-4C04-9D4B-8F79BA25BE65' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.RenderMode 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Presentation & Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6E914524-14E8-4408-96B6-CBC4B6B97E17' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.Settings 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Presentation & Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D82A7D4B-5FF0-4CD6-A891-2E5DE984CA1B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '292E2057-DD6F-4D78-BEAF-F5EE6F12CD0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Forms.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37CA4680-5A61-4205-BD03-FB37143C698B' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-wpforms */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-wpforms', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ea1ea85f-835c-4d35-880e-7a40c529484d', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'FieldCategoryInfo', '{"Form Information":{"icon":"fa fa-file-alt","description":"Core identity, description, status, and ownership of the form"},"Presentation & Settings":{"icon":"fa fa-sliders-h","description":"Visual styling, rendering mode, and advanced behavioral settings"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d7e9d3fb-fcaf-4e6d-9265-e88accfe76ca', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'FieldCategoryIcons', '{"Form Information":"fa fa-file-alt","Presentation & Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Reference',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E99B2D46-1141-43E9-A3B8-578A0E25DC65' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Form Reference',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A7D5E0A-73A9-4461-84E9-5AE14EE24990' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.VersionNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Version Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BAA2EA5-C5A4-4F8B-B6ED-84C2EB7F4A02' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Version Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36801486-E291-48F4-BC02-432BE04642F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.PublishedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Version Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E833C165-D0DD-4491-AFDC-FAE97236F845' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.DefinitionSnapshot 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Version Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'ABBA6D48-7952-4065-AB3C-EB99CFFCDF5E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36B23D09-EF86-4A96-99ED-A862203C95C5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '948DF34C-0257-4077-ACB9-A6289B63FC48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Versions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '561E289E-C030-4320-A55D-71D46FEBABE8' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-history */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '622E2804-5B6D-4B43-92A4-294ADC538F50';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c79f7c57-cd0d-44eb-9c9a-571c61da62d0', '622E2804-5B6D-4B43-92A4-294ADC538F50', 'FieldCategoryInfo', '{"Form Reference":{"icon":"fa fa-link","description":"Association and identifiers linking the version to its parent form"},"Version Details":{"icon":"fa fa-code-branch","description":"Version numbering, lifecycle status, publication timeline, and schema definition"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit, tracking, and technical identifier fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9dd409c3-f5df-4633-b65e-e184d7a9eccd', '622E2804-5B6D-4B43-92A4-294ADC538F50', 'FieldCategoryIcons', '{"Form Reference":"fa fa-link","Version Details":"fa fa-code-branch","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '622E2804-5B6D-4B43-92A4-294ADC538F50';

/* Generated Validation Functions for MJ_BizApps_Tasks: Task Dependencies */
-- CHECK constraint for MJ_BizApps_Tasks: Task Dependencies @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TaskID]<>[DependsOnTaskID])', 'public ValidateTaskIDNotEqualToDependsOnTaskID(result: ValidationResult) {
	if (this.TaskID != null && this.DependsOnTaskID != null && this.TaskID === this.DependsOnTaskID) {
		result.Errors.push(new ValidationErrorInfo(
			"DependsOnTaskID",
			"A task cannot depend on itself. The Task ID and Depends On Task ID must be different.",
			this.DependsOnTaskID,
			ValidationErrorType.Failure
		));
	}
}', 'A task cannot depend on itself. This prevents circular dependencies and ensures that a task can only have a dependency on a different task.', 'ValidateTaskIDNotEqualToDependsOnTaskID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0662FC0F-3F2B-49C9-9BE8-5B59E036044A');

/* Generated Validation Functions for MJ_BizApps_Tasks: Task Template Item Dependencies */
-- CHECK constraint for MJ_BizApps_Tasks: Task Template Item Dependencies @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ItemID]<>[DependsOnItemID])', 'public ValidateItemNotDependentOnSelf(result: ValidationResult) {
	if (this.ItemID != null && this.DependsOnItemID != null && this.ItemID === this.DependsOnItemID) {
		result.Errors.push(new ValidationErrorInfo(
			"DependsOnItemID",
			"An item cannot depend on itself. The Item ID and Depends On Item ID must be different.",
			this.DependsOnItemID,
			ValidationErrorType.Failure
		));
	}
}', 'An item cannot depend on itself. The item and its dependency must be different items to prevent self-referential relationships.', 'ValidateItemNotDependentOnSelf', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '8A30F14C-26FF-476E-8CA1-B10EAD29A428');

/* Generated Validation Functions for MJ_BizApps_Tasks: Tasks */
-- CHECK constraint for MJ_BizApps_Tasks: Tasks: Field: PercentComplete was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([PercentComplete]>=(0) AND [PercentComplete]<=(100))', 'public ValidatePercentCompleteRange(result: ValidationResult) {
	if (this.PercentComplete !== undefined && this.PercentComplete !== null) {
		if (this.PercentComplete < 0 || this.PercentComplete > 100) {
			result.Errors.push(new ValidationErrorInfo(
				"PercentComplete",
				"Percent complete must be between 0 and 100.",
				this.PercentComplete,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Percent complete must be a value between 0 and 100 percent.', 'ValidatePercentCompleteRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5812F201-256C-47AC-AEEB-3402FD1E9846');

