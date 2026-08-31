import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Automation Runs
 */
export const mjBizAppsFormsFormAutomationRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FormAutomationID: z.string().describe(`
        * * Field Name: FormAutomationID
        * * Display Name: Form Automation
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Automations (vwFormAutomations.ID)`),
    FormResponseID: z.string().describe(`
        * * Field Name: FormResponseID
        * * Display Name: Form Response
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)`),
    Status: z.union([z.literal('Failed'), z.literal('Pending'), z.literal('Running'), z.literal('Skipped'), z.literal('Succeeded')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * Pending
    *   * Running
    *   * Skipped
    *   * Succeeded
        * * Description: Outcome of this attempt. Skipped means a condition did not hold, which the MJ logs cannot record`),
    AttemptCount: z.number().describe(`
        * * Field Name: AttemptCount
        * * Display Name: Attempt Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: How many times this automation has been attempted for this response; the recovery sweep stops re-driving at the configured cap`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset
        * * Description: When this attempt began`),
    CompletedAt: z.date().nullable().describe(`
        * * Field Name: CompletedAt
        * * Display Name: Completed At
        * * SQL Data Type: datetimeoffset
        * * Description: When this attempt finished, successfully or not`),
    ActionExecutionLogID: z.string().nullable().describe(`
        * * Field Name: ActionExecutionLogID
        * * Display Name: Action Execution Log ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Action Execution Logs (vwActionExecutionLogs.ID)
        * * Description: The MJ action execution log for this attempt, when an Action ran`),
    AIAgentRunID: z.string().nullable().describe(`
        * * Field Name: AIAgentRunID
        * * Display Name: AI Agent Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: AI Agent Runs (vwAIAgentRuns.ID)
        * * Description: The MJ agent run for this attempt, when an Agent ran`),
    ErrorMessage: z.string().nullable().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Why this attempt failed`),
    OutputSummary: z.string().nullable().describe(`
        * * Field Name: OutputSummary
        * * Display Name: Output Summary
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON digest of the result, small enough to show in an activity view`),
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
    FormAutomation: z.string().describe(`
        * * Field Name: FormAutomation
        * * Display Name: Form Automation Name
        * * SQL Data Type: nvarchar(255)`),
    ActionExecutionLog: z.string().nullable().describe(`
        * * Field Name: ActionExecutionLog
        * * Display Name: Action Execution Log
        * * SQL Data Type: nvarchar(425)`),
    AIAgentRun: z.string().nullable().describe(`
        * * Field Name: AIAgentRun
        * * Display Name: AI Agent Run
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormAutomationRunEntityType = z.infer<typeof mjBizAppsFormsFormAutomationRunSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Automations
 */
export const mjBizAppsFormsFormAutomationSchema = z.object({
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
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Author-facing label, e.g. "Email confirmation"`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: What this automation is for`),
    TargetType: z.union([z.literal('Action'), z.literal('Agent'), z.literal('EntityBinding')]).describe(`
        * * Field Name: TargetType
        * * Display Name: Target Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Action
    *   * Agent
    *   * EntityBinding
        * * Description: Which kind of target runs: Action, Agent or EntityBinding`),
    ActionID: z.string().nullable().describe(`
        * * Field Name: ActionID
        * * Display Name: Action
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
        * * Description: The MJ Action to run; set only when TargetType is Action`),
    AgentID: z.string().nullable().describe(`
        * * Field Name: AgentID
        * * Display Name: Agent
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: AI Agents (vwAIAgents.ID)
        * * Description: The MJ AI Agent to run; set only when TargetType is Agent`),
    BindingID: z.string().nullable().describe(`
        * * Field Name: BindingID
        * * Display Name: Binding
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Entity Bindings (vwFormEntityBindings.ID)
        * * Description: The entity binding to execute; set only when TargetType is EntityBinding`),
    Trigger: z.union([z.literal('OnComplete'), z.literal('OnCompleteOrPartial'), z.literal('OnPartial')]).describe(`
        * * Field Name: Trigger
        * * Display Name: Trigger
        * * SQL Data Type: nvarchar(30)
        * * Default Value: OnComplete
    * * Value List Type: List
    * * Possible Values 
    *   * OnComplete
    *   * OnCompleteOrPartial
    *   * OnPartial
        * * Description: Which save fires this automation: a completed submission, a partial autosave, or both`),
    ExecutionMode: z.union([z.literal('Async'), z.literal('Sync')]).describe(`
        * * Field Name: ExecutionMode
        * * Display Name: Execution Mode
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Async
    * * Value List Type: List
    * * Possible Values 
    *   * Async
    *   * Sync
        * * Description: Sync automations are awaited before the respondent sees a confirmation; Async are dispatched without waiting`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Run order within an execution mode; Sync automations always run before Async ones regardless`),
    ConditionalRule: z.string().nullable().describe(`
        * * Field Name: ConditionalRule
        * * Display Name: Conditional Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON condition over the response answers; when it does not hold the automation is recorded as skipped rather than run. Null means always run`),
    ParameterMapping: z.string().nullable().describe(`
        * * Field Name: ParameterMapping
        * * Display Name: Parameter Mapping
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON describing how the target's inputs are built from response context, static values and specific answers. Null means the standard response context ids`),
    ContinueOnError: z.boolean().describe(`
        * * Field Name: ContinueOnError
        * * Display Name: Continue On Error
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When false, a failure halts the remaining Sync automations for that response`),
    TimeoutMS: z.number().nullable().describe(`
        * * Field Name: TimeoutMS
        * * Display Name: Timeout (ms)
        * * SQL Data Type: int
        * * Description: Optional per-automation execution cap in milliseconds`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this automation is eligible to run`),
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
    Action: z.string().nullable().describe(`
        * * Field Name: Action
        * * Display Name: Action Name
        * * SQL Data Type: nvarchar(425)`),
    Agent: z.string().nullable().describe(`
        * * Field Name: Agent
        * * Display Name: Agent Name
        * * SQL Data Type: nvarchar(255)`),
    Binding: z.string().nullable().describe(`
        * * Field Name: Binding
        * * Display Name: Binding Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormAutomationEntityType = z.infer<typeof mjBizAppsFormsFormAutomationSchema>;

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
 * zod schema definition for the entity MJ_BizApps_Forms: Form Entity Binding Records
 */
export const mjBizAppsFormsFormEntityBindingRecordSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BindingID: z.string().describe(`
        * * Field Name: BindingID
        * * Display Name: Binding ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Entity Bindings (vwFormEntityBindings.ID)`),
    FormResponseID: z.string().describe(`
        * * Field Name: FormResponseID
        * * Display Name: Form Response ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)`),
    TargetEntityID: z.string().describe(`
        * * Field Name: TargetEntityID
        * * Display Name: Target Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Entity the record belongs to, captured at execution time`),
    TargetRecordID: z.string().nullable().describe(`
        * * Field Name: TargetRecordID
        * * Display Name: Target Record ID
        * * SQL Data Type: nvarchar(750)
        * * Description: Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped`),
    Outcome: z.union([z.literal('Created'), z.literal('Merged'), z.literal('Skipped'), z.literal('Unchanged')]).describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Created
    *   * Merged
    *   * Skipped
    *   * Unchanged
        * * Description: What the binding did: created a record, merged into an existing one, changed nothing, or skipped`),
    WrittenFields: z.string().nullable().describe(`
        * * Field Name: WrittenFields
        * * Display Name: Written Fields
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON list of the field names actually written by this execution`),
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
    Binding: z.string().describe(`
        * * Field Name: Binding
        * * Display Name: Binding
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormEntityBindingRecordEntityType = z.infer<typeof mjBizAppsFormsFormEntityBindingRecordSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Forms: Form Entity Bindings
 */
export const mjBizAppsFormsFormEntityBindingSchema = z.object({
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
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Author-facing label for this binding, e.g. "Create CRM Lead"`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: What this binding is for`),
    TargetEntityID: z.string().describe(`
        * * Field Name: TargetEntityID
        * * Display Name: Target Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
        * * Description: Entity whose records this binding writes`),
    TargetEntityName: z.string().describe(`
        * * Field Name: TargetEntityName
        * * Display Name: Target Entity Name
        * * SQL Data Type: nvarchar(500)
        * * Description: Name of the target entity, stored alongside the ID because a runtime-created entity has a different ID in each environment and the name is the only portable handle`),
    FieldMappings: z.string().describe(`
        * * Field Name: FieldMappings
        * * Display Name: Field Mappings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON mapping of question GUIDs to target entity fields, with optional per-field transforms and conditions`),
    IdentityRule: z.string().describe(`
        * * Field Name: IdentityRule
        * * Display Name: Identity Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON rule deciding whether a submission updates an existing record or creates one: match fields, tenant scope, and what to do on no match or several`),
    MergePolicy: z.string().nullable().describe(`
        * * Field Name: MergePolicy
        * * Display Name: Merge Policy
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON per-field merge policy (neverBlank, latestWins, writeOnce). Null means neverBlank throughout`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Whether this binding is eligible to run`),
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
    TargetEntity: z.string().describe(`
        * * Field Name: TargetEntity
        * * Display Name: Target Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormEntityBindingEntityType = z.infer<typeof mjBizAppsFormsFormEntityBindingSchema>;

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
    IsPartialSubmitPoint: z.boolean().describe(`
        * * Field Name: IsPartialSubmitPoint
        * * Display Name: Is Partial Submit Point
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When set, advancing past this page banks a Partial response immediately instead of waiting for the autosave debounce`),
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
    ImageURL: z.string().nullable().describe(`
        * * Field Name: ImageURL
        * * Display Name: Image URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: PictureChoice only: image shown above the option label. Ignored by every other question type`),
    MatrixAxis: z.union([z.literal('Column'), z.literal('Row')]).nullable().describe(`
        * * Field Name: MatrixAxis
        * * Display Name: Matrix Axis
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Column
    *   * Row
        * * Description: Matrix only: whether this option is a Row or a Column of the grid. NULL for every other question type, and read as Row if left NULL on a Matrix`),
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
    QuestionType: z.union([z.literal('Address'), z.literal('Checkbox'), z.literal('ContactInfo'), z.literal('Date'), z.literal('Doodle'), z.literal('Dropdown'), z.literal('Email'), z.literal('FileUpload'), z.literal('Legal'), z.literal('LongText'), z.literal('Matrix'), z.literal('MultiChoice'), z.literal('NPS'), z.literal('Number'), z.literal('OpinionScale'), z.literal('Phone'), z.literal('PictureChoice'), z.literal('Ranking'), z.literal('Rating'), z.literal('ShortText'), z.literal('SingleChoice'), z.literal('Statement'), z.literal('Time'), z.literal('Website'), z.literal('YesNo')]).describe(`
        * * Field Name: QuestionType
        * * Display Name: Question Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Address
    *   * Checkbox
    *   * ContactInfo
    *   * Date
    *   * Doodle
    *   * Dropdown
    *   * Email
    *   * FileUpload
    *   * Legal
    *   * LongText
    *   * Matrix
    *   * MultiChoice
    *   * NPS
    *   * Number
    *   * OpinionScale
    *   * Phone
    *   * PictureChoice
    *   * Ranking
    *   * Rating
    *   * ShortText
    *   * SingleChoice
    *   * Statement
    *   * Time
    *   * Website
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
    Status: z.union([z.literal('Complete'), z.literal('Disqualified'), z.literal('Partial')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Partial
    * * Value List Type: List
    * * Possible Values 
    *   * Complete
    *   * Disqualified
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
 * zod schema definition for the entity MJ_BizApps_Forms: Form Screens
 */
export const mjBizAppsFormsFormScreenSchema = z.object({
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
    ScreenType: z.union([z.literal('Ending'), z.literal('Welcome')]).describe(`
        * * Field Name: ScreenType
        * * Display Name: Screen Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Ending
    *   * Welcome
        * * Description: Whether this screen is shown before intake begins (Welcome) or after a successful submit (Ending)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)
        * * Description: Headline shown on the screen`),
    Body: z.string().nullable().describe(`
        * * Field Name: Body
        * * Display Name: Body
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Body copy shown under the title. Plain text — the widget does not render HTML from this column`),
    ButtonLabel: z.string().nullable().describe(`
        * * Field Name: ButtonLabel
        * * Display Name: Button Label
        * * SQL Data Type: nvarchar(100)
        * * Description: Label for the screens single button. The widget supplies Start / Done when this is blank`),
    MediaURL: z.string().nullable().describe(`
        * * Field Name: MediaURL
        * * Display Name: Media URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: Optional image shown above the title`),
    RedirectURL: z.string().nullable().describe(`
        * * Field Name: RedirectURL
        * * Display Name: Redirect URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: Ending only: send the respondent here instead of showing this screen. Takes precedence over the form-wide redirect in Form.Settings`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Order among the forms Ending screens. Resolution walks them in this order and takes the first whose ConditionalRule the answers satisfy`),
    ConditionalRule: z.string().nullable().describe(`
        * * Field Name: ConditionalRule
        * * Display Name: Conditional Rule
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Ending only: JSON ConditionalRule deciding whether this ending applies to a given response. Unlike a page rule, a blank rule here does NOT mean always — it means this screen is only reachable as the default`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Ending only: the fallback shown when no conditional ending matched`),
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
    SocialLinks: z.string().nullable().describe(`
        * * Field Name: SocialLinks
        * * Display Name: Social Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Ending screens only: JSON array of { platform, url } social links rendered as icons under the ending message. Absent or empty means no social links are shown; there is no separate enabled flag`),
    IsDisqualification: z.boolean().describe(`
        * * Field Name: IsDisqualification
        * * Display Name: Is Disqualification
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Ending only: this screen is a disqualification — its ConditionalRule is evaluated while the respondent answers, and a match ends the form immediately with FormResponse.Status = Disqualified. The flag alone never fires; the rule arms it`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsFormsFormScreenEntityType = z.infer<typeof mjBizAppsFormsFormScreenSchema>;

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
 * zod schema definition for the entity MJ_BizApps_Forms: Form Uploads
 */
export const mjBizAppsFormsFormUploadSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FileID: z.string().describe(`
        * * Field Name: FileID
        * * Display Name: File
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
        * * Description: The uploaded file`),
    DistributionID: z.string().describe(`
        * * Field Name: DistributionID
        * * Display Name: Distribution
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Distributions (vwFormDistributions.ID)
        * * Description: The distribution the upload was made through. The hard scope every provenance check enforces`),
    FormID: z.string().describe(`
        * * Field Name: FormID
        * * Display Name: Form
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
        * * Description: The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed`),
    QuestionID: z.string().nullable().describe(`
        * * Field Name: QuestionID
        * * Display Name: Question
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)
        * * Description: The question the file answers`),
    ResponseDraftID: z.string().nullable().describe(`
        * * Field Name: ResponseDraftID
        * * Display Name: Response Draft
        * * SQL Data Type: uniqueidentifier
        * * Description: The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows`),
    AnonymousSessionID: z.string().nullable().describe(`
        * * Field Name: AnonymousSessionID
        * * Display Name: Anonymous Session
        * * SQL Data Type: nvarchar(255)
        * * Description: The anonymous session id at upload time. A fallback correlation key; blank is tolerated`),
    UploadedByUserID: z.string().nullable().describe(`
        * * Field Name: UploadedByUserID
        * * Display Name: Uploaded By User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record`),
    ProviderKey: z.string().nullable().describe(`
        * * Field Name: ProviderKey
        * * Display Name: Provider Key
        * * SQL Data Type: nvarchar(1000)
        * * Description: Storage key of the file, so the Forms path prefix can be checked without loading the file row`),
    FileName: z.string().nullable().describe(`
        * * Field Name: FileName
        * * Display Name: File Name
        * * SQL Data Type: nvarchar(500)
        * * Description: Original sanitized filename`),
    ContentType: z.string().nullable().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(255)
        * * Description: Stored content type`),
    SizeBytes: z.number().nullable().describe(`
        * * Field Name: SizeBytes
        * * Display Name: Size (Bytes)
        * * SQL Data Type: bigint
        * * Description: Size in bytes`),
    Status: z.union([z.literal('Active'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Revoked
        * * Description: Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance`),
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
    File: z.string().describe(`
        * * Field Name: File
        * * Display Name: File Reference
        * * SQL Data Type: nvarchar(500)`),
    Distribution: z.string().describe(`
        * * Field Name: Distribution
        * * Display Name: Distribution Reference
        * * SQL Data Type: nvarchar(255)`),
    Form: z.string().describe(`
        * * Field Name: Form
        * * Display Name: Form Reference
        * * SQL Data Type: nvarchar(255)`),
    UploadedByUser: z.string().nullable().describe(`
        * * Field Name: UploadedByUser
        * * Display Name: Uploaded By User Reference
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsFormsFormUploadEntityType = z.infer<typeof mjBizAppsFormsFormUploadSchema>;

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
    IsTemplate: z.boolean().describe(`
        * * Field Name: IsTemplate
        * * Display Name: Is Template
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When 1 this Form is a reusable template rather than a live form: it is hidden from the forms list, cannot be published or distributed, and is offered in the template gallery as a starting point. Creating a form from a template deep-copies it, so the two are independent afterwards. Templates are the only forms that may be deleted, which is safe precisely because CK_Form_TemplateNotPublished stops one ever collecting a response`),
    TemplateSourceFormID: z.string().nullable().describe(`
        * * Field Name: TemplateSourceFormID
        * * Display Name: Template Source Form
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
        * * Description: On a template row (IsTemplate = 1), the Form this template was saved from — what lets the builder show "Saved" instead of offering to save the same form twice. Never set on forms CREATED from a template: those are independent deep copies that diverge immediately, and a link would wrongly imply edits propagate. Null means the template has no living source`),
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
    TemplateSourceForm: z.string().nullable().describe(`
        * * Field Name: TemplateSourceForm
        * * Display Name: Template Source Name
        * * SQL Data Type: nvarchar(255)`),
    RootTemplateSourceFormID: z.string().nullable().describe(`
        * * Field Name: RootTemplateSourceFormID
        * * Display Name: Root Template Source
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsFormsFormEntityType = z.infer<typeof mjBizAppsFormsFormSchema>;
 
 

/**
 * MJ_BizApps_Forms: Form Automation Runs - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormAutomationRun
 * * Base View: vwFormAutomationRuns
 * * @description One execution attempt of an automation against one response, linking out to the MJ action or agent log that holds the detail
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Automation Runs')
export class mjBizAppsFormsFormAutomationRunEntity extends BaseEntity<mjBizAppsFormsFormAutomationRunEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Automation Runs record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Automation Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormAutomationRunEntity
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
    * * Field Name: FormAutomationID
    * * Display Name: Form Automation
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Automations (vwFormAutomations.ID)
    */
    get FormAutomationID(): string {
        return this.Get('FormAutomationID');
    }
    set FormAutomationID(value: string) {
        this.Set('FormAutomationID', value);
    }

    /**
    * * Field Name: FormResponseID
    * * Display Name: Form Response
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)
    */
    get FormResponseID(): string {
        return this.Get('FormResponseID');
    }
    set FormResponseID(value: string) {
        this.Set('FormResponseID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * Pending
    *   * Running
    *   * Skipped
    *   * Succeeded
    * * Description: Outcome of this attempt. Skipped means a condition did not hold, which the MJ logs cannot record
    */
    get Status(): 'Failed' | 'Pending' | 'Running' | 'Skipped' | 'Succeeded' {
        return this.Get('Status');
    }
    set Status(value: 'Failed' | 'Pending' | 'Running' | 'Skipped' | 'Succeeded') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AttemptCount
    * * Display Name: Attempt Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: How many times this automation has been attempted for this response; the recovery sweep stops re-driving at the configured cap
    */
    get AttemptCount(): number {
        return this.Get('AttemptCount');
    }
    set AttemptCount(value: number) {
        this.Set('AttemptCount', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    * * Description: When this attempt began
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: CompletedAt
    * * Display Name: Completed At
    * * SQL Data Type: datetimeoffset
    * * Description: When this attempt finished, successfully or not
    */
    get CompletedAt(): Date | null {
        return this.Get('CompletedAt');
    }
    set CompletedAt(value: Date | null) {
        this.Set('CompletedAt', value);
    }

    /**
    * * Field Name: ActionExecutionLogID
    * * Display Name: Action Execution Log ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Action Execution Logs (vwActionExecutionLogs.ID)
    * * Description: The MJ action execution log for this attempt, when an Action ran
    */
    get ActionExecutionLogID(): string | null {
        return this.Get('ActionExecutionLogID');
    }
    set ActionExecutionLogID(value: string | null) {
        this.Set('ActionExecutionLogID', value);
    }

    /**
    * * Field Name: AIAgentRunID
    * * Display Name: AI Agent Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: AI Agent Runs (vwAIAgentRuns.ID)
    * * Description: The MJ agent run for this attempt, when an Agent ran
    */
    get AIAgentRunID(): string | null {
        return this.Get('AIAgentRunID');
    }
    set AIAgentRunID(value: string | null) {
        this.Set('AIAgentRunID', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Why this attempt failed
    */
    get ErrorMessage(): string | null {
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
    }

    /**
    * * Field Name: OutputSummary
    * * Display Name: Output Summary
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON digest of the result, small enough to show in an activity view
    */
    get OutputSummary(): string | null {
        return this.Get('OutputSummary');
    }
    set OutputSummary(value: string | null) {
        this.Set('OutputSummary', value);
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
    * * Field Name: FormAutomation
    * * Display Name: Form Automation Name
    * * SQL Data Type: nvarchar(255)
    */
    get FormAutomation(): string {
        return this.Get('FormAutomation');
    }

    /**
    * * Field Name: ActionExecutionLog
    * * Display Name: Action Execution Log
    * * SQL Data Type: nvarchar(425)
    */
    get ActionExecutionLog(): string | null {
        return this.Get('ActionExecutionLog');
    }

    /**
    * * Field Name: AIAgentRun
    * * Display Name: AI Agent Run
    * * SQL Data Type: nvarchar(255)
    */
    get AIAgentRun(): string | null {
        return this.Get('AIAgentRun');
    }
}


/**
 * MJ_BizApps_Forms: Form Automations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormAutomation
 * * Base View: vwFormAutomations
 * * @description One configured on-submit automation for a form: an Action, an Agent or an entity binding, with its trigger, ordering, condition and execution mode
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Automations')
export class mjBizAppsFormsFormAutomationEntity extends BaseEntity<mjBizAppsFormsFormAutomationEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Automations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Automations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormAutomationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Forms: Form Automations entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Ensures that based on the selected TargetType, only the corresponding ID field (ActionID, AgentID, or BindingID) is populated, while the other two ID fields must remain empty.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTargetTypeRelationships(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Ensures that based on the selected TargetType, only the corresponding ID field (ActionID, AgentID, or BindingID) is populated, while the other two ID fields must remain empty.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTargetTypeRelationships(result: ValidationResult) {
        const targetType = this.TargetType;
        const actionId = this.ActionID;
        const agentId = this.AgentID;
        const bindingId = this.BindingID;
    
        let isValid = false;
        let errorMessage = "";
    
        if (targetType === "Action") {
            if (actionId != null && agentId == null && bindingId == null) {
                isValid = true;
            } else {
                errorMessage = "When TargetType is 'Action', ActionID must be specified, and both AgentID and BindingID must be null.";
            }
        } else if (targetType === "Agent") {
            if (agentId != null && actionId == null && bindingId == null) {
                isValid = true;
            } else {
                errorMessage = "When TargetType is 'Agent', AgentID must be specified, and both ActionID and BindingID must be null.";
            }
        } else if (targetType === "EntityBinding") {
            if (bindingId != null && actionId == null && agentId == null) {
                isValid = true;
            } else {
                errorMessage = "When TargetType is 'EntityBinding', BindingID must be specified, and both ActionID and AgentID must be null.";
            }
        } else {
            errorMessage = "TargetType must be 'Action', 'Agent', or 'EntityBinding'.";
        }
    
        if (!isValid) {
            result.Errors.push(new ValidationErrorInfo(
                "TargetType",
                errorMessage,
                targetType,
                ValidationErrorType.Failure
            ));
        }
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
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Author-facing label, e.g. "Email confirmation"
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
    * * Description: What this automation is for
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TargetType
    * * Display Name: Target Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Action
    *   * Agent
    *   * EntityBinding
    * * Description: Which kind of target runs: Action, Agent or EntityBinding
    */
    get TargetType(): 'Action' | 'Agent' | 'EntityBinding' {
        return this.Get('TargetType');
    }
    set TargetType(value: 'Action' | 'Agent' | 'EntityBinding') {
        this.Set('TargetType', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    * * Description: The MJ Action to run; set only when TargetType is Action
    */
    get ActionID(): string | null {
        return this.Get('ActionID');
    }
    set ActionID(value: string | null) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: AgentID
    * * Display Name: Agent
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: AI Agents (vwAIAgents.ID)
    * * Description: The MJ AI Agent to run; set only when TargetType is Agent
    */
    get AgentID(): string | null {
        return this.Get('AgentID');
    }
    set AgentID(value: string | null) {
        this.Set('AgentID', value);
    }

    /**
    * * Field Name: BindingID
    * * Display Name: Binding
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Entity Bindings (vwFormEntityBindings.ID)
    * * Description: The entity binding to execute; set only when TargetType is EntityBinding
    */
    get BindingID(): string | null {
        return this.Get('BindingID');
    }
    set BindingID(value: string | null) {
        this.Set('BindingID', value);
    }

    /**
    * * Field Name: Trigger
    * * Display Name: Trigger
    * * SQL Data Type: nvarchar(30)
    * * Default Value: OnComplete
    * * Value List Type: List
    * * Possible Values 
    *   * OnComplete
    *   * OnCompleteOrPartial
    *   * OnPartial
    * * Description: Which save fires this automation: a completed submission, a partial autosave, or both
    */
    get Trigger(): 'OnComplete' | 'OnCompleteOrPartial' | 'OnPartial' {
        return this.Get('Trigger');
    }
    set Trigger(value: 'OnComplete' | 'OnCompleteOrPartial' | 'OnPartial') {
        this.Set('Trigger', value);
    }

    /**
    * * Field Name: ExecutionMode
    * * Display Name: Execution Mode
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Async
    * * Value List Type: List
    * * Possible Values 
    *   * Async
    *   * Sync
    * * Description: Sync automations are awaited before the respondent sees a confirmation; Async are dispatched without waiting
    */
    get ExecutionMode(): 'Async' | 'Sync' {
        return this.Get('ExecutionMode');
    }
    set ExecutionMode(value: 'Async' | 'Sync') {
        this.Set('ExecutionMode', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Run order within an execution mode; Sync automations always run before Async ones regardless
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
    * * Description: JSON condition over the response answers; when it does not hold the automation is recorded as skipped rather than run. Null means always run
    */
    get ConditionalRule(): string | null {
        return this.Get('ConditionalRule');
    }
    set ConditionalRule(value: string | null) {
        this.Set('ConditionalRule', value);
    }

    /**
    * * Field Name: ParameterMapping
    * * Display Name: Parameter Mapping
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON describing how the target's inputs are built from response context, static values and specific answers. Null means the standard response context ids
    */
    get ParameterMapping(): string | null {
        return this.Get('ParameterMapping');
    }
    set ParameterMapping(value: string | null) {
        this.Set('ParameterMapping', value);
    }

    /**
    * * Field Name: ContinueOnError
    * * Display Name: Continue On Error
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When false, a failure halts the remaining Sync automations for that response
    */
    get ContinueOnError(): boolean {
        return this.Get('ContinueOnError');
    }
    set ContinueOnError(value: boolean) {
        this.Set('ContinueOnError', value);
    }

    /**
    * * Field Name: TimeoutMS
    * * Display Name: Timeout (ms)
    * * SQL Data Type: int
    * * Description: Optional per-automation execution cap in milliseconds
    */
    get TimeoutMS(): number | null {
        return this.Get('TimeoutMS');
    }
    set TimeoutMS(value: number | null) {
        this.Set('TimeoutMS', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this automation is eligible to run
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
    * * Field Name: Form
    * * Display Name: Form
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action Name
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string | null {
        return this.Get('Action');
    }

    /**
    * * Field Name: Agent
    * * Display Name: Agent Name
    * * SQL Data Type: nvarchar(255)
    */
    get Agent(): string | null {
        return this.Get('Agent');
    }

    /**
    * * Field Name: Binding
    * * Display Name: Binding Name
    * * SQL Data Type: nvarchar(255)
    */
    get Binding(): string | null {
        return this.Get('Binding');
    }
}


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
 * MJ_BizApps_Forms: Form Entity Binding Records - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormEntityBindingRecord
 * * Base View: vwFormEntityBindingRecords
 * * @description Durable record of which target record a submission produced, making re-execution idempotent and the lineage queryable
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Entity Binding Records')
export class mjBizAppsFormsFormEntityBindingRecordEntity extends BaseEntity<mjBizAppsFormsFormEntityBindingRecordEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Entity Binding Records record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Entity Binding Records record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormEntityBindingRecordEntity
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
    * * Field Name: BindingID
    * * Display Name: Binding ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Entity Bindings (vwFormEntityBindings.ID)
    */
    get BindingID(): string {
        return this.Get('BindingID');
    }
    set BindingID(value: string) {
        this.Set('BindingID', value);
    }

    /**
    * * Field Name: FormResponseID
    * * Display Name: Form Response ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Responses (vwFormResponses.ID)
    */
    get FormResponseID(): string {
        return this.Get('FormResponseID');
    }
    set FormResponseID(value: string) {
        this.Set('FormResponseID', value);
    }

    /**
    * * Field Name: TargetEntityID
    * * Display Name: Target Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Entity the record belongs to, captured at execution time
    */
    get TargetEntityID(): string {
        return this.Get('TargetEntityID');
    }
    set TargetEntityID(value: string) {
        this.Set('TargetEntityID', value);
    }

    /**
    * * Field Name: TargetRecordID
    * * Display Name: Target Record ID
    * * SQL Data Type: nvarchar(750)
    * * Description: Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped
    */
    get TargetRecordID(): string | null {
        return this.Get('TargetRecordID');
    }
    set TargetRecordID(value: string | null) {
        this.Set('TargetRecordID', value);
    }

    /**
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Created
    *   * Merged
    *   * Skipped
    *   * Unchanged
    * * Description: What the binding did: created a record, merged into an existing one, changed nothing, or skipped
    */
    get Outcome(): 'Created' | 'Merged' | 'Skipped' | 'Unchanged' {
        return this.Get('Outcome');
    }
    set Outcome(value: 'Created' | 'Merged' | 'Skipped' | 'Unchanged') {
        this.Set('Outcome', value);
    }

    /**
    * * Field Name: WrittenFields
    * * Display Name: Written Fields
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON list of the field names actually written by this execution
    */
    get WrittenFields(): string | null {
        return this.Get('WrittenFields');
    }
    set WrittenFields(value: string | null) {
        this.Set('WrittenFields', value);
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
    * * Field Name: Binding
    * * Display Name: Binding
    * * SQL Data Type: nvarchar(255)
    */
    get Binding(): string {
        return this.Get('Binding');
    }
}


/**
 * MJ_BizApps_Forms: Form Entity Bindings - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormEntityBinding
 * * Base View: vwFormEntityBindings
 * * @description Declares that submissions to a form create or update a record of a target entity, via a field mapping, an identity rule and a merge policy
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Entity Bindings')
export class mjBizAppsFormsFormEntityBindingEntity extends BaseEntity<mjBizAppsFormsFormEntityBindingEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Entity Bindings record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Entity Bindings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormEntityBindingEntity
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
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Author-facing label for this binding, e.g. "Create CRM Lead"
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
    * * Description: What this binding is for
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TargetEntityID
    * * Display Name: Target Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    * * Description: Entity whose records this binding writes
    */
    get TargetEntityID(): string {
        return this.Get('TargetEntityID');
    }
    set TargetEntityID(value: string) {
        this.Set('TargetEntityID', value);
    }

    /**
    * * Field Name: TargetEntityName
    * * Display Name: Target Entity Name
    * * SQL Data Type: nvarchar(500)
    * * Description: Name of the target entity, stored alongside the ID because a runtime-created entity has a different ID in each environment and the name is the only portable handle
    */
    get TargetEntityName(): string {
        return this.Get('TargetEntityName');
    }
    set TargetEntityName(value: string) {
        this.Set('TargetEntityName', value);
    }

    /**
    * * Field Name: FieldMappings
    * * Display Name: Field Mappings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON mapping of question GUIDs to target entity fields, with optional per-field transforms and conditions
    */
    get FieldMappings(): string {
        return this.Get('FieldMappings');
    }
    set FieldMappings(value: string) {
        this.Set('FieldMappings', value);
    }

    /**
    * * Field Name: IdentityRule
    * * Display Name: Identity Rule
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON rule deciding whether a submission updates an existing record or creates one: match fields, tenant scope, and what to do on no match or several
    */
    get IdentityRule(): string {
        return this.Get('IdentityRule');
    }
    set IdentityRule(value: string) {
        this.Set('IdentityRule', value);
    }

    /**
    * * Field Name: MergePolicy
    * * Display Name: Merge Policy
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON per-field merge policy (neverBlank, latestWins, writeOnce). Null means neverBlank throughout
    */
    get MergePolicy(): string | null {
        return this.Get('MergePolicy');
    }
    set MergePolicy(value: string | null) {
        this.Set('MergePolicy', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Whether this binding is eligible to run
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
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
    * * Field Name: TargetEntity
    * * Display Name: Target Entity
    * * SQL Data Type: nvarchar(255)
    */
    get TargetEntity(): string {
        return this.Get('TargetEntity');
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
    * * Field Name: IsPartialSubmitPoint
    * * Display Name: Is Partial Submit Point
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When set, advancing past this page banks a Partial response immediately instead of waiting for the autosave debounce
    */
    get IsPartialSubmitPoint(): boolean {
        return this.Get('IsPartialSubmitPoint');
    }
    set IsPartialSubmitPoint(value: boolean) {
        this.Set('IsPartialSubmitPoint', value);
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

    /**
    * * Field Name: ImageURL
    * * Display Name: Image URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: PictureChoice only: image shown above the option label. Ignored by every other question type
    */
    get ImageURL(): string | null {
        return this.Get('ImageURL');
    }
    set ImageURL(value: string | null) {
        this.Set('ImageURL', value);
    }

    /**
    * * Field Name: MatrixAxis
    * * Display Name: Matrix Axis
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Column
    *   * Row
    * * Description: Matrix only: whether this option is a Row or a Column of the grid. NULL for every other question type, and read as Row if left NULL on a Matrix
    */
    get MatrixAxis(): 'Column' | 'Row' | null {
        return this.Get('MatrixAxis');
    }
    set MatrixAxis(value: 'Column' | 'Row' | null) {
        this.Set('MatrixAxis', value);
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
    *   * Address
    *   * Checkbox
    *   * ContactInfo
    *   * Date
    *   * Doodle
    *   * Dropdown
    *   * Email
    *   * FileUpload
    *   * Legal
    *   * LongText
    *   * Matrix
    *   * MultiChoice
    *   * NPS
    *   * Number
    *   * OpinionScale
    *   * Phone
    *   * PictureChoice
    *   * Ranking
    *   * Rating
    *   * ShortText
    *   * SingleChoice
    *   * Statement
    *   * Time
    *   * Website
    *   * YesNo
    * * Description: Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)
    */
    get QuestionType(): 'Address' | 'Checkbox' | 'ContactInfo' | 'Date' | 'Doodle' | 'Dropdown' | 'Email' | 'FileUpload' | 'Legal' | 'LongText' | 'Matrix' | 'MultiChoice' | 'NPS' | 'Number' | 'OpinionScale' | 'Phone' | 'PictureChoice' | 'Ranking' | 'Rating' | 'ShortText' | 'SingleChoice' | 'Statement' | 'Time' | 'Website' | 'YesNo' {
        return this.Get('QuestionType');
    }
    set QuestionType(value: 'Address' | 'Checkbox' | 'ContactInfo' | 'Date' | 'Doodle' | 'Dropdown' | 'Email' | 'FileUpload' | 'Legal' | 'LongText' | 'Matrix' | 'MultiChoice' | 'NPS' | 'Number' | 'OpinionScale' | 'Phone' | 'PictureChoice' | 'Ranking' | 'Rating' | 'ShortText' | 'SingleChoice' | 'Statement' | 'Time' | 'Website' | 'YesNo') {
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
    *   * Disqualified
    *   * Partial
    * * Description: Completion status: Partial or Complete
    */
    get Status(): 'Complete' | 'Disqualified' | 'Partial' {
        return this.Get('Status');
    }
    set Status(value: 'Complete' | 'Disqualified' | 'Partial') {
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
 * MJ_BizApps_Forms: Form Screens - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormScreen
 * * Base View: vwFormScreens
 * * @description Welcome and Ending screens for a form. Distinct from questions: a screen is never answered, produces no FormResponseAnswer row, appears in no aggregation and cannot be referenced by a conditional rule. It brackets the intake rather than sitting inside it
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Screens')
export class mjBizAppsFormsFormScreenEntity extends BaseEntity<mjBizAppsFormsFormScreenEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Screens record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Screens record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormScreenEntity
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
    * * Field Name: ScreenType
    * * Display Name: Screen Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Ending
    *   * Welcome
    * * Description: Whether this screen is shown before intake begins (Welcome) or after a successful submit (Ending)
    */
    get ScreenType(): 'Ending' | 'Welcome' {
        return this.Get('ScreenType');
    }
    set ScreenType(value: 'Ending' | 'Welcome') {
        this.Set('ScreenType', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    * * Description: Headline shown on the screen
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Body
    * * Display Name: Body
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Body copy shown under the title. Plain text — the widget does not render HTML from this column
    */
    get Body(): string | null {
        return this.Get('Body');
    }
    set Body(value: string | null) {
        this.Set('Body', value);
    }

    /**
    * * Field Name: ButtonLabel
    * * Display Name: Button Label
    * * SQL Data Type: nvarchar(100)
    * * Description: Label for the screens single button. The widget supplies Start / Done when this is blank
    */
    get ButtonLabel(): string | null {
        return this.Get('ButtonLabel');
    }
    set ButtonLabel(value: string | null) {
        this.Set('ButtonLabel', value);
    }

    /**
    * * Field Name: MediaURL
    * * Display Name: Media URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: Optional image shown above the title
    */
    get MediaURL(): string | null {
        return this.Get('MediaURL');
    }
    set MediaURL(value: string | null) {
        this.Set('MediaURL', value);
    }

    /**
    * * Field Name: RedirectURL
    * * Display Name: Redirect URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: Ending only: send the respondent here instead of showing this screen. Takes precedence over the form-wide redirect in Form.Settings
    */
    get RedirectURL(): string | null {
        return this.Get('RedirectURL');
    }
    set RedirectURL(value: string | null) {
        this.Set('RedirectURL', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Order among the forms Ending screens. Resolution walks them in this order and takes the first whose ConditionalRule the answers satisfy
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
    * * Description: Ending only: JSON ConditionalRule deciding whether this ending applies to a given response. Unlike a page rule, a blank rule here does NOT mean always — it means this screen is only reachable as the default
    */
    get ConditionalRule(): string | null {
        return this.Get('ConditionalRule');
    }
    set ConditionalRule(value: string | null) {
        this.Set('ConditionalRule', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Ending only: the fallback shown when no conditional ending matched
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

    /**
    * * Field Name: SocialLinks
    * * Display Name: Social Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Ending screens only: JSON array of { platform, url } social links rendered as icons under the ending message. Absent or empty means no social links are shown; there is no separate enabled flag
    */
    get SocialLinks(): string | null {
        return this.Get('SocialLinks');
    }
    set SocialLinks(value: string | null) {
        this.Set('SocialLinks', value);
    }

    /**
    * * Field Name: IsDisqualification
    * * Display Name: Is Disqualification
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Ending only: this screen is a disqualification — its ConditionalRule is evaluated while the respondent answers, and a match ends the form immediately with FormResponse.Status = Disqualified. The flag alone never fires; the rule arms it
    */
    get IsDisqualification(): boolean {
        return this.Get('IsDisqualification');
    }
    set IsDisqualification(value: boolean) {
        this.Set('IsDisqualification', value);
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
 * MJ_BizApps_Forms: Form Uploads - strongly typed entity sub-class
 * * Schema: __mj_BizAppsForms
 * * Base Table: FormUpload
 * * Base View: vwFormUploads
 * * @description Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. __mj.File has no owner column, so this is the only evidence of who produced a file
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Forms: Form Uploads')
export class mjBizAppsFormsFormUploadEntity extends BaseEntity<mjBizAppsFormsFormUploadEntityType> {
    /**
    * Loads the MJ_BizApps_Forms: Form Uploads record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Forms: Form Uploads record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsFormsFormUploadEntity
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
    * * Field Name: FileID
    * * Display Name: File
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    * * Description: The uploaded file
    */
    get FileID(): string {
        return this.Get('FileID');
    }
    set FileID(value: string) {
        this.Set('FileID', value);
    }

    /**
    * * Field Name: DistributionID
    * * Display Name: Distribution
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Distributions (vwFormDistributions.ID)
    * * Description: The distribution the upload was made through. The hard scope every provenance check enforces
    */
    get DistributionID(): string {
        return this.Get('DistributionID');
    }
    set DistributionID(value: string) {
        this.Set('DistributionID', value);
    }

    /**
    * * Field Name: FormID
    * * Display Name: Form
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    * * Description: The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed
    */
    get FormID(): string {
        return this.Get('FormID');
    }
    set FormID(value: string) {
        this.Set('FormID', value);
    }

    /**
    * * Field Name: QuestionID
    * * Display Name: Question
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Form Questions (vwFormQuestions.ID)
    * * Description: The question the file answers
    */
    get QuestionID(): string | null {
        return this.Get('QuestionID');
    }
    set QuestionID(value: string | null) {
        this.Set('QuestionID', value);
    }

    /**
    * * Field Name: ResponseDraftID
    * * Display Name: Response Draft
    * * SQL Data Type: uniqueidentifier
    * * Description: The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows
    */
    get ResponseDraftID(): string | null {
        return this.Get('ResponseDraftID');
    }
    set ResponseDraftID(value: string | null) {
        this.Set('ResponseDraftID', value);
    }

    /**
    * * Field Name: AnonymousSessionID
    * * Display Name: Anonymous Session
    * * SQL Data Type: nvarchar(255)
    * * Description: The anonymous session id at upload time. A fallback correlation key; blank is tolerated
    */
    get AnonymousSessionID(): string | null {
        return this.Get('AnonymousSessionID');
    }
    set AnonymousSessionID(value: string | null) {
        this.Set('AnonymousSessionID', value);
    }

    /**
    * * Field Name: UploadedByUserID
    * * Display Name: Uploaded By User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record
    */
    get UploadedByUserID(): string | null {
        return this.Get('UploadedByUserID');
    }
    set UploadedByUserID(value: string | null) {
        this.Set('UploadedByUserID', value);
    }

    /**
    * * Field Name: ProviderKey
    * * Display Name: Provider Key
    * * SQL Data Type: nvarchar(1000)
    * * Description: Storage key of the file, so the Forms path prefix can be checked without loading the file row
    */
    get ProviderKey(): string | null {
        return this.Get('ProviderKey');
    }
    set ProviderKey(value: string | null) {
        this.Set('ProviderKey', value);
    }

    /**
    * * Field Name: FileName
    * * Display Name: File Name
    * * SQL Data Type: nvarchar(500)
    * * Description: Original sanitized filename
    */
    get FileName(): string | null {
        return this.Get('FileName');
    }
    set FileName(value: string | null) {
        this.Set('FileName', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(255)
    * * Description: Stored content type
    */
    get ContentType(): string | null {
        return this.Get('ContentType');
    }
    set ContentType(value: string | null) {
        this.Set('ContentType', value);
    }

    /**
    * * Field Name: SizeBytes
    * * Display Name: Size (Bytes)
    * * SQL Data Type: bigint
    * * Description: Size in bytes
    */
    get SizeBytes(): number | null {
        return this.Get('SizeBytes');
    }
    set SizeBytes(value: number | null) {
        this.Set('SizeBytes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Revoked
    * * Description: Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance
    */
    get Status(): 'Active' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Revoked') {
        this.Set('Status', value);
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
    * * Display Name: File Reference
    * * SQL Data Type: nvarchar(500)
    */
    get File(): string {
        return this.Get('File');
    }

    /**
    * * Field Name: Distribution
    * * Display Name: Distribution Reference
    * * SQL Data Type: nvarchar(255)
    */
    get Distribution(): string {
        return this.Get('Distribution');
    }

    /**
    * * Field Name: Form
    * * Display Name: Form Reference
    * * SQL Data Type: nvarchar(255)
    */
    get Form(): string {
        return this.Get('Form');
    }

    /**
    * * Field Name: UploadedByUser
    * * Display Name: Uploaded By User Reference
    * * SQL Data Type: nvarchar(100)
    */
    get UploadedByUser(): string | null {
        return this.Get('UploadedByUser');
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
    * Validate() method override for MJ_BizApps_Forms: Forms entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Templates cannot be published. If an item is marked as a template, its status must be something other than 'Published'.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTemplateStatusRestriction(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Templates cannot be published. If an item is marked as a template, its status must be something other than 'Published'.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTemplateStatusRestriction(result: ValidationResult) {
    	if (this.IsTemplate && this.Status === 'Published') {
    		result.Errors.push(new ValidationErrorInfo(
    			"Status",
    			"A template cannot have a 'Published' status.",
    			this.Status,
    			ValidationErrorType.Failure
    		));
    	}
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
    * * Field Name: IsTemplate
    * * Display Name: Is Template
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When 1 this Form is a reusable template rather than a live form: it is hidden from the forms list, cannot be published or distributed, and is offered in the template gallery as a starting point. Creating a form from a template deep-copies it, so the two are independent afterwards. Templates are the only forms that may be deleted, which is safe precisely because CK_Form_TemplateNotPublished stops one ever collecting a response
    */
    get IsTemplate(): boolean {
        return this.Get('IsTemplate');
    }
    set IsTemplate(value: boolean) {
        this.Set('IsTemplate', value);
    }

    /**
    * * Field Name: TemplateSourceFormID
    * * Display Name: Template Source Form
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Forms: Forms (vwForms.ID)
    * * Description: On a template row (IsTemplate = 1), the Form this template was saved from — what lets the builder show "Saved" instead of offering to save the same form twice. Never set on forms CREATED from a template: those are independent deep copies that diverge immediately, and a link would wrongly imply edits propagate. Null means the template has no living source
    */
    get TemplateSourceFormID(): string | null {
        return this.Get('TemplateSourceFormID');
    }
    set TemplateSourceFormID(value: string | null) {
        this.Set('TemplateSourceFormID', value);
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

    /**
    * * Field Name: TemplateSourceForm
    * * Display Name: Template Source Name
    * * SQL Data Type: nvarchar(255)
    */
    get TemplateSourceForm(): string | null {
        return this.Get('TemplateSourceForm');
    }

    /**
    * * Field Name: RootTemplateSourceFormID
    * * Display Name: Root Template Source
    * * SQL Data Type: uniqueidentifier
    */
    get RootTemplateSourceFormID(): string | null {
        return this.Get('RootTemplateSourceFormID');
    }
}
