-- =============================================================================
-- MJ Forms — Schema and Tables (Phase 1)
-- =============================================================================
-- Free, open-source forms / surveys / intake for MemberJunction.
-- Schema: __mj_BizAppsForms  ·  Entity prefix (set in mj.config.cjs): "MJ Forms: "
--
-- Conventions (see CLAUDE.md / plans/FORMS_BUILD_PLAN.md §5.1):
--   * Business columns + PK/FK/CHECK/UNIQUE constraints only.
--   * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds them + triggers.
--   * NO foreign-key indexes — CodeGen adds IDX_AUTO_MJ_FKEY_* automatically.
--   * sp_addextendedproperty on every non-PK, non-FK business column (CodeGen
--     turns these into entity-field descriptions).
--   * CHECK constraints on value-list columns — CodeGen parses them into value lists.
--   * Root table is `Form` (DG-2 default) → entity "MJ Forms: Forms".
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
    SubjectEntityName NVARCHAR(255) NULL,
    SubjectID NVARCHAR(450) NULL,
    StartedAt DATETIMEOFFSET NULL,
    SubmittedAt DATETIMEOFFSET NULL,
    SourceMetadata NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormResponse PRIMARY KEY (ID),
    CONSTRAINT FK_FormResponse_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT FK_FormResponse_FormVersion FOREIGN KEY (FormVersionID) REFERENCES __mj_BizAppsForms.FormVersion(ID),
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
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Carries a polymorphic subject link (SubjectEntityName + SubjectID).',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Completion status: Partial or Complete',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'AnonymousSessionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional polymorphic subject: the MJ entity name this response is about (e.g. a Person). Enables consumption by Caliber and others.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'SubjectEntityName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional polymorphic subject: the primary-key value of the subject record (string to support any key shape)',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormResponse', @level2type = N'COLUMN', @level2name = N'SubjectID';
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
