import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Categories
 */
export const mjBizAppsFormsFormCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name of the category`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this category`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Categories (vwFormCategories.ID)`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    DisplayRank: z.number().describe(`
        * * Field Name: DisplayRank
        * * Display Name: Display Rank
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Sort order among siblings. Lower values appear first`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this category is available for selection. Inactive categories are hidden but preserved`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent Name
        * * SQL Data Type: nvarchar(255)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsFormsFormCategoryEntityType = z.infer<typeof mjBizAppsFormsFormCategorySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Distributions
 */
export const mjBizAppsFormsFormDistributionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Internal name for this distribution`),
    Slug: z.string().nullable().describe(`
        * * Field Name: Slug
        * * Display Name: Slug
        * * SQL Data Type: nvarchar(255)
        * * Description: URL-friendly slug used in the public link (unique when set)`),
    ChannelType: z.union([z.literal('Email'), z.literal('Embed'), z.literal('PublicLink'), z.literal('QR')]).describe(`
        * * Field Name: ChannelType
        * * Display Name: Channel Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: PublicLink
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Embed
    *   * PublicLink
    *   * QR
        * * Description: Channel type: PublicLink, Embed, QR, or Email`),
    Status: z.union([z.literal('Active'), z.literal('Closed'), z.literal('Draft')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Draft
        * * Description: Distribution status: Draft, Active, or Closed`),
    OpenAt: z.date().nullable().describe(`
        * * Field Name: OpenAt
        * * Display Name: Open At
        * * SQL Data Type: datetimeoffset
        * * Description: When this distribution opens for responses (null = immediately)`),
    CloseAt: z.date().nullable().describe(`
        * * Field Name: CloseAt
        * * Display Name: Close At
        * * SQL Data Type: datetimeoffset
        * * Description: When this distribution stops accepting responses (null = no end)`),
    MaxResponses: z.number().nullable().describe(`
        * * Field Name: MaxResponses
        * * Display Name: Max Responses
        * * SQL Data Type: int
        * * Description: Maximum number of responses allowed through this distribution (null = unlimited)`),
    ResponseCount: z.number().describe(`
        * * Field Name: ResponseCount
        * * Display Name: Response Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Running count of responses received through this distribution`),
    MagicLinkInviteID: z.string().nullable().describe(`
        * * Field Name: MagicLinkInviteID
        * * Display Name: Magic Link Invite
        * * SQL Data Type: uniqueidentifier
        * * Description: ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution`),
    CaptchaRequired: z.boolean().describe(`
        * * Field Name: CaptchaRequired
        * * Display Name: Captcha Required
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this distribution is active and usable`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    PublicLinkToken: z.string().nullable().describe(`
        * * Field Name: PublicLinkToken
        * * Display Name: Public Link Token
        * * SQL Data Type: nvarchar(255)
        * * Description: Raw redeemable magic-link token for this distribution's public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormDistributionEntityType = z.infer<typeof mjBizAppsFormsFormDistributionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Pages
 */
export const mjBizAppsFormsFormPageSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)
        * * Description: Page title shown to respondents`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Page description / intro text`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Sort order of the page within the form. Lower values appear first`),
    ConditionalRule: z.string().nullable().describe(`
        * * Field Name: ConditionalRule
        * * Display Name: Conditional Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormPageEntityType = z.infer<typeof mjBizAppsFormsFormPageSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Question Options
 */
export const mjBizAppsFormsFormQuestionOptionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    QuestionID: z.string().describe(`
        * * Field Name: QuestionID
        * * Display Name: Question
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)`),
    Label: z.string().describe(`
        * * Field Name: Label
        * * Display Name: Label
        * * SQL Data Type: nvarchar(500)
        * * Description: Label shown to the respondent for this option`),
    Value: z.string().nullable().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(500)
        * * Description: Stored value for this option (defaults to Label when omitted)`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Sort order of the option within its question. Lower values appear first`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this option is selected by default`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsFormsFormQuestionOptionEntityType = z.infer<typeof mjBizAppsFormsFormQuestionOptionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Questions
 */
export const mjBizAppsFormsFormQuestionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)`),
    PageID: z.string().nullable().describe(`
        * * Field Name: PageID
        * * Display Name: Page ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Pages (vwFormPages.ID)`),
    QuestionType: z.union([z.literal('Date'), z.literal('Dropdown'), z.literal('Email'), z.literal('FileUpload'), z.literal('LongText'), z.literal('MultiChoice'), z.literal('NPS'), z.literal('Number'), z.literal('Phone'), z.literal('Rating'), z.literal('ShortText'), z.literal('SingleChoice'), z.literal('Statement'), z.literal('Time'), z.literal('YesNo')]).describe(`
        * * Field Name: QuestionType
        * * Display Name: Question Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Date
    *   * Dropdown
    *   * Email
    *   * FileUpload
    *   * LongText
    *   * MultiChoice
    *   * NPS
    *   * Number
    *   * Phone
    *   * Rating
    *   * ShortText
    *   * SingleChoice
    *   * Statement
    *   * Time
    *   * YesNo
        * * Description: Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)`),
    Prompt: z.string().describe(`
        * * Field Name: Prompt
        * * Display Name: Prompt
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The question text shown to the respondent`),
    HelpText: z.string().nullable().describe(`
        * * Field Name: HelpText
        * * Display Name: Help Text
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional helper/assistive text shown beneath the prompt`),
    IsRequired: z.boolean().describe(`
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether an answer is required before the form can be submitted`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Sort order of the question within its page. Lower values appear first`),
    ValidationRule: z.string().nullable().describe(`
        * * Field Name: ValidationRule
        * * Display Name: Validation Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON validation rule (min/max, regex, length, etc.) applied client- and server-side`),
    ConditionalRule: z.string().nullable().describe(`
        * * Field Name: ConditionalRule
        * * Display Name: Conditional Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON show/hide rule evaluated against prior answers (see plan §6)`),
    ScoringConfig: z.string().nullable().describe(`
        * * Field Name: ScoringConfig
        * * Display Name: Scoring Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored`),
    Settings: z.string().nullable().describe(`
        * * Field Name: Settings
        * * Display Name: Settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON per-type settings (e.g. rating scale, NPS labels, file constraints)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form
        * * SQL Data Type: nvarchar(255)`),
    Page: z.string().nullable().describe(`
        * * Field Name: Page
        * * Display Name: Page
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormQuestionEntityType = z.infer<typeof mjBizAppsFormsFormQuestionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Response Answers
 */
export const mjBizAppsFormsFormResponseAnswerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ResponseID: z.string().describe(`
        * * Field Name: ResponseID
        * * Display Name: Response
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)`),
    QuestionID: z.string().describe(`
        * * Field Name: QuestionID
        * * Display Name: Question
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)`),
    TextValue: z.string().nullable().describe(`
        * * Field Name: TextValue
        * * Display Name: Text Value
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Text answer value (short/long text, email, phone, single-choice label, etc.)`),
    NumericValue: z.number().nullable().describe(`
        * * Field Name: NumericValue
        * * Display Name: Numeric Value
        * * SQL Data Type: decimal(18, 4)
        * * Description: Numeric answer value (Number, Rating, NPS)`),
    DateValue: z.date().nullable().describe(`
        * * Field Name: DateValue
        * * Display Name: Date Value
        * * SQL Data Type: datetimeoffset
        * * Description: Date/time answer value (Date, Time)`),
    BooleanValue: z.boolean().nullable().describe(`
        * * Field Name: BooleanValue
        * * Display Name: Boolean Value
        * * SQL Data Type: bit
        * * Description: Boolean answer value (YesNo)`),
    JSONValue: z.string().nullable().describe(`
        * * Field Name: JSONValue
        * * Display Name: JSON Value
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON answer value for multi-select or complex/structured answers`),
    FileID: z.string().nullable().describe(`
        * * Field Name: FileID
        * * Display Name: File ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)`),
    Score: z.number().nullable().describe(`
        * * Field Name: Score
        * * Display Name: Score
        * * SQL Data Type: decimal(18, 4)
        * * Description: Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored`),
    ScoreRationale: z.string().nullable().describe(`
        * * Field Name: ScoreRationale
        * * Display Name: Score Rationale
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Rationale/explanation for the assigned score (LLM-judge output)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    File: z.string().nullable().describe(`
        * * Field Name: File
        * * Display Name: File
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsFormsFormResponseAnswerEntityType = z.infer<typeof mjBizAppsFormsFormResponseAnswerSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Responses
 */
export const mjBizAppsFormsFormResponseSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)`),
    FormVersionID: z.string().describe(`
        * * Field Name: FormVersionID
        * * Display Name: Form Version ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Versions (vwFormVersions.ID)`),
    Status: z.union([z.literal('Complete'), z.literal('Partial')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Partial
    * * Value List Type: List
    * * Possible Values 
    *   * Complete
    *   * Partial
        * * Description: Completion status: Partial or Complete`),
    AnonymousSessionID: z.string().nullable().describe(`
        * * Field Name: AnonymousSessionID
        * * Display Name: Anonymous Session ID
        * * SQL Data Type: nvarchar(255)
        * * Description: Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session`),
    RespondentPersonID: z.string().nullable().describe(`
        * * Field Name: RespondentPersonID
        * * Display Name: Respondent Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the respondent began the form`),
    SubmittedAt: z.date().nullable().describe(`
        * * Field Name: SubmittedAt
        * * Display Name: Submitted At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the response was submitted (null while Partial)`),
    SourceMetadata: z.string().nullable().describe(`
        * * Field Name: SourceMetadata
        * * Display Name: Source Metadata
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON source metadata: hashed IP, user-agent, distribution id, referrer`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form Name
        * * SQL Data Type: nvarchar(255)`),
    RespondentPerson: z.string().nullable().describe(`
        * * Field Name: RespondentPerson
        * * Display Name: Respondent Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsFormsFormResponseEntityType = z.infer<typeof mjBizAppsFormsFormResponseSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Styles
 */
export const mjBizAppsFormsFormStyleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name of the style/theme`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this style`),
    CSSVariables: z.string().nullable().describe(`
        * * Field Name: CSSVariables
        * * Display Name: CSS Variables
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON object of --mj-* design-token overrides applied to the respondent widget`),
    CustomCSS: z.string().nullable().describe(`
        * * Field Name: CustomCSS
        * * Display Name: Custom CSS
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional raw CSS appended after the token overrides for advanced theming`),
    LogoURL: z.string().nullable().describe(`
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL of a logo to display on forms using this style`),
    DisplayRank: z.number().describe(`
        * * Field Name: DisplayRank
        * * Display Name: Display Rank
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Sort order in style pickers. Lower values appear first`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this style is available for selection. Inactive styles are hidden but preserved`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsFormsFormStyleEntityType = z.infer<typeof mjBizAppsFormsFormStyleSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Versions
 */
export const mjBizAppsFormsFormVersionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)`),
    VersionNumber: z.number().describe(`
        * * Field Name: VersionNumber
        * * Display Name: Version Number
        * * SQL Data Type: int
        * * Description: Monotonic version number within a form`),
    Status: z.union([z.literal('Draft'), z.literal('Published'), z.literal('Retired')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Draft
    *   * Published
    *   * Retired
        * * Description: Version status: Draft, Published, or Retired`),
    PublishedAt: z.date().nullable().describe(`
        * * Field Name: PublishedAt
        * * Display Name: Published At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this version was published (null while Draft)`),
    DefinitionSnapshot: z.string().nullable().describe(`
        * * Field Name: DefinitionSnapshot
        * * Display Name: Definition Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full pages/questions/options/logic as published, captured as a JSON snapshot`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormVersionEntityType = z.infer<typeof mjBizAppsFormsFormVersionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Forms
 */
export const mjBizAppsFormsFormSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name of the form`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description / purpose of the form`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Categories (vwFormCategories.ID)`),
    StyleID: z.string().nullable().describe(`
        * * Field Name: StyleID
        * * Display Name: Style ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Styles (vwFormStyles.ID)`),
    Status: z.union([z.literal('Closed'), z.literal('Draft'), z.literal('Published')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * Draft
    *   * Published
        * * Description: Lifecycle status: Draft, Published, or Closed`),
    OwnerUserID: z.string().nullable().describe(`
        * * Field Name: OwnerUserID
        * * Display Name: Owner User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    RenderMode: z.union([z.literal('OneQuestion'), z.literal('Scroll')]).describe(`
        * * Field Name: RenderMode
        * * Display Name: Render Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Scroll
    * * Value List Type: List
    * * Possible Values 
    *   * OneQuestion
    *   * Scroll
        * * Description: Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)`),
    Settings: z.string().nullable().describe(`
        * * Field Name: Settings
        * * Display Name: Settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    Style: z.string().nullable().describe(`
        * * Field Name: Style
        * * Display Name: Style
        * * SQL Data Type: nvarchar(255)`),
    OwnerUser: z.string().nullable().describe(`
        * * Field Name: OwnerUser
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsFormsFormEntityType = z.infer<typeof mjBizAppsFormsFormSchema>;
 
 

/**
 * MJ_BizApps_Forms: Form Categories - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormCategory
 * * Base View: vwFormCategories
 * * @description Hierarchical categories that organize forms into a browsable tree
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Categories')
export class mjBizAppsFormsFormCategoryEntity extends BaseEntity<mjBizAppsFormsFormCategoryEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Categories record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormCategoryEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name of the category
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of this category
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Categories (vwFormCategories.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome icon class for UI display
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: DisplayRank
    * * Display Name: Display Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Sort order among siblings. Lower values appear first
    */
    get DisplayRank(): number {
        return this.Get('DisplayRank');
    }
    set DisplayRank(value: number) {
        this.Set('DisplayRank', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this category is available for selection. Inactive categories are hidden but preserved
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent Name
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * MJ_BizApps_Forms: Form Distributions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormDistribution
 * * Base View: vwFormDistributions
 * * @description A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Distributions')
export class mjBizAppsFormsFormDistributionEntity extends BaseEntity<mjBizAppsFormsFormDistributionEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Distributions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Distributions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormDistributionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Internal name for this distribution
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Slug
    * * Display Name: Slug
    * * SQL Data Type: nvarchar(255)
    * * Description: URL-friendly slug used in the public link (unique when set)
    */
    get Slug(): string | null {
        return this.Get('Slug');
    }
    set Slug(value: string | null) {
        this.Set('Slug', value);
    }

    /**
    * * Field Name: ChannelType
    * * Display Name: Channel Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: PublicLink
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Embed
    *   * PublicLink
    *   * QR
    * * Description: Channel type: PublicLink, Embed, QR, or Email
    */
    get ChannelType(): 'Email' | 'Embed' | 'PublicLink' | 'QR' {
        return this.Get('ChannelType');
    }
    set ChannelType(value: 'Email' | 'Embed' | 'PublicLink' | 'QR') {
        this.Set('ChannelType', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Draft
    * * Description: Distribution status: Draft, Active, or Closed
    */
    get Status(): 'Active' | 'Closed' | 'Draft' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Closed' | 'Draft') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: OpenAt
    * * Display Name: Open At
    * * SQL Data Type: datetimeoffset
    * * Description: When this distribution opens for responses (null = immediately)
    */
    get OpenAt(): Date | null {
        return this.Get('OpenAt');
    }
    set OpenAt(value: Date | null) {
        this.Set('OpenAt', value);
    }

    /**
    * * Field Name: CloseAt
    * * Display Name: Close At
    * * SQL Data Type: datetimeoffset
    * * Description: When this distribution stops accepting responses (null = no end)
    */
    get CloseAt(): Date | null {
        return this.Get('CloseAt');
    }
    set CloseAt(value: Date | null) {
        this.Set('CloseAt', value);
    }

    /**
    * * Field Name: MaxResponses
    * * Display Name: Max Responses
    * * SQL Data Type: int
    * * Description: Maximum number of responses allowed through this distribution (null = unlimited)
    */
    get MaxResponses(): number | null {
        return this.Get('MaxResponses');
    }
    set MaxResponses(value: number | null) {
        this.Set('MaxResponses', value);
    }

    /**
    * * Field Name: ResponseCount
    * * Display Name: Response Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Running count of responses received through this distribution
    */
    get ResponseCount(): number {
        return this.Get('ResponseCount');
    }
    set ResponseCount(value: number) {
        this.Set('ResponseCount', value);
    }

    /**
    * * Field Name: MagicLinkInviteID
    * * Display Name: Magic Link Invite
    * * SQL Data Type: uniqueidentifier
    * * Description: ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution
    */
    get MagicLinkInviteID(): string | null {
        return this.Get('MagicLinkInviteID');
    }
    set MagicLinkInviteID(value: string | null) {
        this.Set('MagicLinkInviteID', value);
    }

    /**
    * * Field Name: CaptchaRequired
    * * Display Name: Captcha Required
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution
    */
    get CaptchaRequired(): boolean {
        return this.Get('CaptchaRequired');
    }
    set CaptchaRequired(value: boolean) {
        this.Set('CaptchaRequired', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this distribution is active and usable
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: PublicLinkToken
    * * Display Name: Public Link Token
    * * SQL Data Type: nvarchar(255)
    * * Description: Raw redeemable magic-link token for this distribution's public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.
    */
    get PublicLinkToken(): string | null {
        return this.Get('PublicLinkToken');
    }
    set PublicLinkToken(value: string | null) {
        this.Set('PublicLinkToken', value);
    }

    /**
    * * Field Name: Form
    * * Display Name: Form Name
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }
}


/**
 * MJ_BizApps_Forms: Form Pages - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormPage
 * * Base View: vwFormPages
 * * @description An ordered page/section of a form
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Pages')
export class mjBizAppsFormsFormPageEntity extends BaseEntity<mjBizAppsFormsFormPageEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Pages record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Pages record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormPageEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    * * Description: Page title shown to respondents
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Page description / intro text
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Sort order of the page within the form. Lower values appear first
    */
    get DisplayOrder(): number {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: ConditionalRule
    * * Display Name: Conditional Rule
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)
    */
    get ConditionalRule(): string | null {
        return this.Get('ConditionalRule');
    }
    set ConditionalRule(value: string | null) {
        this.Set('ConditionalRule', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Form
    * * Display Name: Form
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }
}


/**
 * MJ_BizApps_Forms: Form Question Options - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormQuestionOption
 * * Base View: vwFormQuestionOptions
 * * @description A selectable choice offered by a choice-style question
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Question Options')
export class mjBizAppsFormsFormQuestionOptionEntity extends BaseEntity<mjBizAppsFormsFormQuestionOptionEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Question Options record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Question Options record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormQuestionOptionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: QuestionID
    * * Display Name: Question
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)
    */
    get QuestionID(): string {
        return this.Get('QuestionID');
    }
    set QuestionID(value: string) {
        this.Set('QuestionID', value);
    }

    /**
    * * Field Name: Label
    * * Display Name: Label
    * * SQL Data Type: nvarchar(500)
    * * Description: Label shown to the respondent for this option
    */
    get Label(): string {
        return this.Get('Label');
    }
    set Label(value: string) {
        this.Set('Label', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(500)
    * * Description: Stored value for this option (defaults to Label when omitted)
    */
    get Value(): string | null {
        return this.Get('Value');
    }
    set Value(value: string | null) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Sort order of the option within its question. Lower values appear first
    */
    get DisplayOrder(): number {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this option is selected by default
    */
    get IsDefault(): boolean {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Forms: Form Questions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormQuestion
 * * Base View: vwFormQuestions
 * * @description A single question/field within a form page
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Questions')
export class mjBizAppsFormsFormQuestionEntity extends BaseEntity<mjBizAppsFormsFormQuestionEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Questions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Questions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormQuestionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: PageID
    * * Display Name: Page ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Pages (vwFormPages.ID)
    */
    get PageID(): string | null {
        return this.Get('PageID');
    }
    set PageID(value: string | null) {
        this.Set('PageID', value);
    }

    /**
    * * Field Name: QuestionType
    * * Display Name: Question Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Date
    *   * Dropdown
    *   * Email
    *   * FileUpload
    *   * LongText
    *   * MultiChoice
    *   * NPS
    *   * Number
    *   * Phone
    *   * Rating
    *   * ShortText
    *   * SingleChoice
    *   * Statement
    *   * Time
    *   * YesNo
    * * Description: Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)
    */
    get QuestionType(): 'Date' | 'Dropdown' | 'Email' | 'FileUpload' | 'LongText' | 'MultiChoice' | 'NPS' | 'Number' | 'Phone' | 'Rating' | 'ShortText' | 'SingleChoice' | 'Statement' | 'Time' | 'YesNo' {
        return this.Get('QuestionType');
    }
    set QuestionType(value: 'Date' | 'Dropdown' | 'Email' | 'FileUpload' | 'LongText' | 'MultiChoice' | 'NPS' | 'Number' | 'Phone' | 'Rating' | 'ShortText' | 'SingleChoice' | 'Statement' | 'Time' | 'YesNo') {
        this.Set('QuestionType', value);
    }

    /**
    * * Field Name: Prompt
    * * Display Name: Prompt
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The question text shown to the respondent
    */
    get Prompt(): string {
        return this.Get('Prompt');
    }
    set Prompt(value: string) {
        this.Set('Prompt', value);
    }

    /**
    * * Field Name: HelpText
    * * Display Name: Help Text
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional helper/assistive text shown beneath the prompt
    */
    get HelpText(): string | null {
        return this.Get('HelpText');
    }
    set HelpText(value: string | null) {
        this.Set('HelpText', value);
    }

    /**
    * * Field Name: IsRequired
    * * Display Name: Is Required
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether an answer is required before the form can be submitted
    */
    get IsRequired(): boolean {
        return this.Get('IsRequired');
    }
    set IsRequired(value: boolean) {
        this.Set('IsRequired', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Sort order of the question within its page. Lower values appear first
    */
    get DisplayOrder(): number {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: ValidationRule
    * * Display Name: Validation Rule
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON validation rule (min/max, regex, length, etc.) applied client- and server-side
    */
    get ValidationRule(): string | null {
        return this.Get('ValidationRule');
    }
    set ValidationRule(value: string | null) {
        this.Set('ValidationRule', value);
    }

    /**
    * * Field Name: ConditionalRule
    * * Display Name: Conditional Rule
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON show/hide rule evaluated against prior answers (see plan §6)
    */
    get ConditionalRule(): string | null {
        return this.Get('ConditionalRule');
    }
    set ConditionalRule(value: string | null) {
        this.Set('ConditionalRule', value);
    }

    /**
    * * Field Name: ScoringConfig
    * * Display Name: Scoring Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored
    */
    get ScoringConfig(): string | null {
        return this.Get('ScoringConfig');
    }
    set ScoringConfig(value: string | null) {
        this.Set('ScoringConfig', value);
    }

    /**
    * * Field Name: Settings
    * * Display Name: Settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON per-type settings (e.g. rating scale, NPS labels, file constraints)
    */
    get Settings(): string | null {
        return this.Get('Settings');
    }
    set Settings(value: string | null) {
        this.Set('Settings', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Form
    * * Display Name: Form
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }

    /**
    * * Field Name: Page
    * * Display Name: Page
    * * SQL Data Type: nvarchar(255)
    */
    get Page(): string | null {
        return this.Get('Page');
    }
}


/**
 * MJ_BizApps_Forms: Form Response Answers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormResponseAnswer
 * * Base View: vwFormResponseAnswers
 * * @description One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Response Answers')
export class mjBizAppsFormsFormResponseAnswerEntity extends BaseEntity<mjBizAppsFormsFormResponseAnswerEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Response Answers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Response Answers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormResponseAnswerEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ResponseID
    * * Display Name: Response
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)
    */
    get ResponseID(): string {
        return this.Get('ResponseID');
    }
    set ResponseID(value: string) {
        this.Set('ResponseID', value);
    }

    /**
    * * Field Name: QuestionID
    * * Display Name: Question
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)
    */
    get QuestionID(): string {
        return this.Get('QuestionID');
    }
    set QuestionID(value: string) {
        this.Set('QuestionID', value);
    }

    /**
    * * Field Name: TextValue
    * * Display Name: Text Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Text answer value (short/long text, email, phone, single-choice label, etc.)
    */
    get TextValue(): string | null {
        return this.Get('TextValue');
    }
    set TextValue(value: string | null) {
        this.Set('TextValue', value);
    }

    /**
    * * Field Name: NumericValue
    * * Display Name: Numeric Value
    * * SQL Data Type: decimal(18, 4)
    * * Description: Numeric answer value (Number, Rating, NPS)
    */
    get NumericValue(): number | null {
        return this.Get('NumericValue');
    }
    set NumericValue(value: number | null) {
        this.Set('NumericValue', value);
    }

    /**
    * * Field Name: DateValue
    * * Display Name: Date Value
    * * SQL Data Type: datetimeoffset
    * * Description: Date/time answer value (Date, Time)
    */
    get DateValue(): Date | null {
        return this.Get('DateValue');
    }
    set DateValue(value: Date | null) {
        this.Set('DateValue', value);
    }

    /**
    * * Field Name: BooleanValue
    * * Display Name: Boolean Value
    * * SQL Data Type: bit
    * * Description: Boolean answer value (YesNo)
    */
    get BooleanValue(): boolean | null {
        return this.Get('BooleanValue');
    }
    set BooleanValue(value: boolean | null) {
        this.Set('BooleanValue', value);
    }

    /**
    * * Field Name: JSONValue
    * * Display Name: JSON Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON answer value for multi-select or complex/structured answers
    */
    get JSONValue(): string | null {
        return this.Get('JSONValue');
    }
    set JSONValue(value: string | null) {
        this.Set('JSONValue', value);
    }

    /**
    * * Field Name: FileID
    * * Display Name: File ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    */
    get FileID(): string | null {
        return this.Get('FileID');
    }
    set FileID(value: string | null) {
        this.Set('FileID', value);
    }

    /**
    * * Field Name: Score
    * * Display Name: Score
    * * SQL Data Type: decimal(18, 4)
    * * Description: Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored
    */
    get Score(): number | null {
        return this.Get('Score');
    }
    set Score(value: number | null) {
        this.Set('Score', value);
    }

    /**
    * * Field Name: ScoreRationale
    * * Display Name: Score Rationale
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Rationale/explanation for the assigned score (LLM-judge output)
    */
    get ScoreRationale(): string | null {
        return this.Get('ScoreRationale');
    }
    set ScoreRationale(value: string | null) {
        this.Set('ScoreRationale', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: File
    * * Display Name: File
    * * SQL Data Type: nvarchar(500)
    */
    get File(): string | null {
        return this.Get('File');
    }
}


/**
 * MJ_BizApps_Forms: Form Responses - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormResponse
 * * Base View: vwFormResponses
 * * @description One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Responses')
export class mjBizAppsFormsFormResponseEntity extends BaseEntity<mjBizAppsFormsFormResponseEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Responses record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Responses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormResponseEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: FormVersionID
    * * Display Name: Form Version ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Versions (vwFormVersions.ID)
    */
    get FormVersionID(): string {
        return this.Get('FormVersionID');
    }
    set FormVersionID(value: string) {
        this.Set('FormVersionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Partial
    * * Value List Type: List
    * * Possible Values 
    *   * Complete
    *   * Partial
    * * Description: Completion status: Partial or Complete
    */
    get Status(): 'Complete' | 'Partial' {
        return this.Get('Status');
    }
    set Status(value: 'Complete' | 'Partial') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AnonymousSessionID
    * * Display Name: Anonymous Session ID
    * * SQL Data Type: nvarchar(255)
    * * Description: Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session
    */
    get AnonymousSessionID(): string | null {
        return this.Get('AnonymousSessionID');
    }
    set AnonymousSessionID(value: string | null) {
        this.Set('AnonymousSessionID', value);
    }

    /**
    * * Field Name: RespondentPersonID
    * * Display Name: Respondent Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get RespondentPersonID(): string | null {
        return this.Get('RespondentPersonID');
    }
    set RespondentPersonID(value: string | null) {
        this.Set('RespondentPersonID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the respondent began the form
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: SubmittedAt
    * * Display Name: Submitted At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the response was submitted (null while Partial)
    */
    get SubmittedAt(): Date | null {
        return this.Get('SubmittedAt');
    }
    set SubmittedAt(value: Date | null) {
        this.Set('SubmittedAt', value);
    }

    /**
    * * Field Name: SourceMetadata
    * * Display Name: Source Metadata
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON source metadata: hashed IP, user-agent, distribution id, referrer
    */
    get SourceMetadata(): string | null {
        return this.Get('SourceMetadata');
    }
    set SourceMetadata(value: string | null) {
        this.Set('SourceMetadata', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Form
    * * Display Name: Form Name
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }

    /**
    * * Field Name: RespondentPerson
    * * Display Name: Respondent Person
    * * SQL Data Type: nvarchar(201)
    */
    get RespondentPerson(): string | null {
        return this.Get('RespondentPerson');
    }
}


/**
 * MJ_BizApps_Forms: Form Styles - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormStyle
 * * Base View: vwFormStyles
 * * @description Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Styles')
export class mjBizAppsFormsFormStyleEntity extends BaseEntity<mjBizAppsFormsFormStyleEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Styles record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Styles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormStyleEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name of the style/theme
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of this style
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CSSVariables
    * * Display Name: CSS Variables
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON object of --mj-* design-token overrides applied to the respondent widget
    */
    get CSSVariables(): string | null {
        return this.Get('CSSVariables');
    }
    set CSSVariables(value: string | null) {
        this.Set('CSSVariables', value);
    }

    /**
    * * Field Name: CustomCSS
    * * Display Name: Custom CSS
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional raw CSS appended after the token overrides for advanced theming
    */
    get CustomCSS(): string | null {
        return this.Get('CustomCSS');
    }
    set CustomCSS(value: string | null) {
        this.Set('CustomCSS', value);
    }

    /**
    * * Field Name: LogoURL
    * * Display Name: Logo URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL of a logo to display on forms using this style
    */
    get LogoURL(): string | null {
        return this.Get('LogoURL');
    }
    set LogoURL(value: string | null) {
        this.Set('LogoURL', value);
    }

    /**
    * * Field Name: DisplayRank
    * * Display Name: Display Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Sort order in style pickers. Lower values appear first
    */
    get DisplayRank(): number {
        return this.Get('DisplayRank');
    }
    set DisplayRank(value: number) {
        this.Set('DisplayRank', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this style is available for selection. Inactive styles are hidden but preserved
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Forms: Form Versions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormVersion
 * * Base View: vwFormVersions
 * * @description Immutable published snapshots of a form; responses pin the version they were filled against
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Versions')
export class mjBizAppsFormsFormVersionEntity extends BaseEntity<mjBizAppsFormsFormVersionEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Versions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Versions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormVersionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: VersionNumber
    * * Display Name: Version Number
    * * SQL Data Type: int
    * * Description: Monotonic version number within a form
    */
    get VersionNumber(): number {
        return this.Get('VersionNumber');
    }
    set VersionNumber(value: number) {
        this.Set('VersionNumber', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Draft
    *   * Published
    *   * Retired
    * * Description: Version status: Draft, Published, or Retired
    */
    get Status(): 'Draft' | 'Published' | 'Retired' {
        return this.Get('Status');
    }
    set Status(value: 'Draft' | 'Published' | 'Retired') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: PublishedAt
    * * Display Name: Published At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this version was published (null while Draft)
    */
    get PublishedAt(): Date | null {
        return this.Get('PublishedAt');
    }
    set PublishedAt(value: Date | null) {
        this.Set('PublishedAt', value);
    }

    /**
    * * Field Name: DefinitionSnapshot
    * * Display Name: Definition Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full pages/questions/options/logic as published, captured as a JSON snapshot
    */
    get DefinitionSnapshot(): string | null {
        return this.Get('DefinitionSnapshot');
    }
    set DefinitionSnapshot(value: string | null) {
        this.Set('DefinitionSnapshot', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Form
    * * Display Name: Form Name
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }
}


/**
 * MJ_BizApps_Forms: Forms - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: Form
 * * Base View: vwForms
 * * @description The root definition of a form/survey/intake instrument
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Forms')
export class mjBizAppsFormsFormEntity extends BaseEntity<mjBizAppsFormsFormEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Forms record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Forms record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name of the form
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description / purpose of the form
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Categories (vwFormCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: StyleID
    * * Display Name: Style ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Styles (vwFormStyles.ID)
    */
    get StyleID(): string | null {
        return this.Get('StyleID');
    }
    set StyleID(value: string | null) {
        this.Set('StyleID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * Draft
    *   * Published
    * * Description: Lifecycle status: Draft, Published, or Closed
    */
    get Status(): 'Closed' | 'Draft' | 'Published' {
        return this.Get('Status');
    }
    set Status(value: 'Closed' | 'Draft' | 'Published') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: OwnerUserID
    * * Display Name: Owner User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get OwnerUserID(): string | null {
        return this.Get('OwnerUserID');
    }
    set OwnerUserID(value: string | null) {
        this.Set('OwnerUserID', value);
    }

    /**
    * * Field Name: RenderMode
    * * Display Name: Render Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Scroll
    * * Value List Type: List
    * * Possible Values 
    *   * OneQuestion
    *   * Scroll
    * * Description: Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)
    */
    get RenderMode(): 'OneQuestion' | 'Scroll' {
        return this.Get('RenderMode');
    }
    set RenderMode(value: 'OneQuestion' | 'Scroll') {
        this.Set('RenderMode', value);
    }

    /**
    * * Field Name: Settings
    * * Display Name: Settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect
    */
    get Settings(): string | null {
        return this.Get('Settings');
    }
    set Settings(value: string | null) {
        this.Set('Settings', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {
        return this.Get('Category');
    }

    /**
    * * Field Name: Style
    * * Display Name: Style
    * * SQL Data Type: nvarchar(255)
    */
    get Style(): string | null {
        return this.Get('Style');
    }

    /**
    * * Field Name: OwnerUser
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get OwnerUser(): string | null {
        return this.Get('OwnerUser');
    }
}
