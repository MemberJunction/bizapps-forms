-- =============================================================================
-- On-submit automation layer + entity binding
--
-- Fulfils plans/ON_SUBMIT_AUTOMATION_SPEC.md §3 and plans/ENTITY_BINDING_SPEC.md §4.
-- Both land together because the settled v1 scope is the full layer (binding spec §13.1):
-- FormAutomation carries `EntityBinding` as a target type from the start, so splitting them
-- would mean shipping a CHECK constraint and an FK we already know we are about to widen.
--
-- Conventions (migrations/CLAUDE.md): hardcoded UUIDs are not needed here (no seed rows);
-- no __mj_* timestamp columns and no FK indexes — CodeGen adds both; sp_addextendedproperty
-- on every business column, because CodeGen turns those into entity-field descriptions;
-- CHECK constraints on value-list columns, because CodeGen parses them into value lists.
--
-- Creation order is FK order: FormEntityBinding precedes FormAutomation, which references it.
-- =============================================================================

---------------------------------------------------------------------------
-- FormEntityBinding: "submissions to this form create/update a record of entity X"
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormEntityBinding (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TargetEntityID UNIQUEIDENTIFIER NOT NULL,
    TargetEntityName NVARCHAR(500) NOT NULL,
    FieldMappings NVARCHAR(MAX) NOT NULL,
    IdentityRule NVARCHAR(MAX) NOT NULL,
    MergePolicy NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_FormEntityBinding PRIMARY KEY (ID),
    CONSTRAINT FK_FormEntityBinding_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    -- Bound by ID, matching MJ's own precedent (CompanyIntegrationEntityMap, MLModelScoringBinding).
    -- TargetEntityName is carried alongside because an entity created at runtime gets a different
    -- ID in every environment, so the name is the only portable handle: resolve by ID, repair by name.
    CONSTRAINT FK_FormEntityBinding_TargetEntity FOREIGN KEY (TargetEntityID) REFERENCES __mj.Entity(ID),
    CONSTRAINT CK_FormEntityBinding_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

---------------------------------------------------------------------------
-- FormAutomation: per-form on-submit configuration (the authoring store)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormAutomation (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TargetType NVARCHAR(20) NOT NULL,
    ActionID UNIQUEIDENTIFIER NULL,
    AgentID UNIQUEIDENTIFIER NULL,
    BindingID UNIQUEIDENTIFIER NULL,
    [Trigger] NVARCHAR(30) NOT NULL DEFAULT 'OnComplete',
    ExecutionMode NVARCHAR(10) NOT NULL DEFAULT 'Async',
    DisplayOrder INT NOT NULL DEFAULT 0,
    ConditionalRule NVARCHAR(MAX) NULL,
    ParameterMapping NVARCHAR(MAX) NULL,
    ContinueOnError BIT NOT NULL DEFAULT 1,
    TimeoutMS INT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_FormAutomation PRIMARY KEY (ID),
    CONSTRAINT FK_FormAutomation_Form FOREIGN KEY (FormID) REFERENCES __mj_BizAppsForms.Form(ID),
    CONSTRAINT FK_FormAutomation_Action FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID),
    CONSTRAINT FK_FormAutomation_Agent FOREIGN KEY (AgentID) REFERENCES __mj.AIAgent(ID),
    CONSTRAINT FK_FormAutomation_Binding FOREIGN KEY (BindingID) REFERENCES __mj_BizAppsForms.FormEntityBinding(ID),
    CONSTRAINT CK_FormAutomation_TargetType CHECK (TargetType IN ('Action', 'Agent', 'EntityBinding')),
    CONSTRAINT CK_FormAutomation_Trigger CHECK ([Trigger] IN ('OnComplete', 'OnPartial', 'OnCompleteOrPartial')),
    CONSTRAINT CK_FormAutomation_ExecutionMode CHECK (ExecutionMode IN ('Sync', 'Async')),
    -- One target, and it must be the one TargetType names. Enforcing only "exactly one non-null"
    -- would still admit TargetType='Action' pointing at an agent, which the runner would then
    -- dispatch by TargetType and fail on at execution time, per response, in production.
    CONSTRAINT CK_FormAutomation_SingleTarget CHECK (
        (TargetType = 'Action' AND ActionID IS NOT NULL AND AgentID IS NULL AND BindingID IS NULL)
     OR (TargetType = 'Agent' AND AgentID IS NOT NULL AND ActionID IS NULL AND BindingID IS NULL)
     OR (TargetType = 'EntityBinding' AND BindingID IS NOT NULL AND ActionID IS NULL AND AgentID IS NULL)
    )
);
GO

---------------------------------------------------------------------------
-- FormAutomationRun: one execution attempt (observability + the retry watermark)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormAutomationRun (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FormAutomationID UNIQUEIDENTIFIER NOT NULL,
    FormResponseID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    AttemptCount INT NOT NULL DEFAULT 0,
    StartedAt DATETIMEOFFSET NULL,
    CompletedAt DATETIMEOFFSET NULL,
    ActionExecutionLogID UNIQUEIDENTIFIER NULL,
    AIAgentRunID UNIQUEIDENTIFIER NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    OutputSummary NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormAutomationRun PRIMARY KEY (ID),
    CONSTRAINT FK_FormAutomationRun_Automation FOREIGN KEY (FormAutomationID) REFERENCES __mj_BizAppsForms.FormAutomation(ID),
    CONSTRAINT FK_FormAutomationRun_Response FOREIGN KEY (FormResponseID) REFERENCES __mj_BizAppsForms.FormResponse(ID),
    -- The heavy audit lives in MJ's own logs; these link to it rather than duplicating it.
    CONSTRAINT FK_FormAutomationRun_ActionExecutionLog FOREIGN KEY (ActionExecutionLogID) REFERENCES __mj.ActionExecutionLog(ID),
    CONSTRAINT FK_FormAutomationRun_AIAgentRun FOREIGN KEY (AIAgentRunID) REFERENCES __mj.AIAgentRun(ID),
    CONSTRAINT CK_FormAutomationRun_Status CHECK (Status IN ('Pending', 'Running', 'Succeeded', 'Failed', 'Skipped'))
);
GO

---------------------------------------------------------------------------
-- FormEntityBindingRecord: which record a submission produced (the identity ledger)
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsForms.FormEntityBindingRecord (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BindingID UNIQUEIDENTIFIER NOT NULL,
    FormResponseID UNIQUEIDENTIFIER NOT NULL,
    TargetEntityID UNIQUEIDENTIFIER NOT NULL,
    TargetRecordID NVARCHAR(750) NULL,
    Outcome NVARCHAR(20) NOT NULL,
    WrittenFields NVARCHAR(MAX) NULL,
    CONSTRAINT PK_FormEntityBindingRecord PRIMARY KEY (ID),
    CONSTRAINT FK_FormEntityBindingRecord_Binding FOREIGN KEY (BindingID) REFERENCES __mj_BizAppsForms.FormEntityBinding(ID),
    CONSTRAINT FK_FormEntityBindingRecord_Response FOREIGN KEY (FormResponseID) REFERENCES __mj_BizAppsForms.FormResponse(ID),
    -- TargetEntityID is deliberately NOT a foreign key: this is a historical record of what a
    -- submission produced, and an old ledger row must not be the reason an entity cannot be
    -- retired. The binding row carries the enforced reference; this one carries the fact.
    CONSTRAINT CK_FormEntityBindingRecord_Outcome CHECK (Outcome IN ('Created', 'Merged', 'Unchanged', 'Skipped'))
);
GO

-- The idempotency backstop. App-side "look for an existing row, then insert" loses the race
-- between an inline execution and the recovery sweep re-driving the same response; this makes
-- the second writer fail rather than produce a duplicate record silently. Not an FK index, so
-- CodeGen will not add it.
CREATE UNIQUE INDEX UQ_FormEntityBindingRecord_Binding_Response
    ON __mj_BizAppsForms.FormEntityBindingRecord (BindingID, FormResponseID);
GO

-- =============================================================================
-- EXTENDED PROPERTIES (descriptions → CodeGen entity-field metadata)
-- =============================================================================

---------------------------------------------------------------------------
-- FormEntityBinding
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Declares that submissions to a form create or update a record of a target entity, via a field mapping, an identity rule and a merge policy',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Author-facing label for this binding, e.g. "Create CRM Lead"',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What this binding is for',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Entity whose records this binding writes',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'TargetEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Name of the target entity, stored alongside the ID because a runtime-created entity has a different ID in each environment and the name is the only portable handle',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'TargetEntityName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON mapping of question GUIDs to target entity fields, with optional per-field transforms and conditions',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'FieldMappings';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON rule deciding whether a submission updates an existing record or creates one: match fields, tenant scope, and what to do on no match or several',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'IdentityRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON per-field merge policy (neverBlank, latestWins, writeOnce). Null means neverBlank throughout',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'MergePolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this binding is eligible to run',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBinding', @level2type = N'COLUMN', @level2name = N'Status';
GO

---------------------------------------------------------------------------
-- FormAutomation
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One configured on-submit automation for a form: an Action, an Agent or an entity binding, with its trigger, ordering, condition and execution mode',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Author-facing label, e.g. "Email confirmation"',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What this automation is for',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Which kind of target runs: Action, Agent or EntityBinding',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'TargetType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ Action to run; set only when TargetType is Action',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'ActionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ AI Agent to run; set only when TargetType is Agent',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'AgentID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity binding to execute; set only when TargetType is EntityBinding',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'BindingID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Which save fires this automation: a completed submission, a partial autosave, or both',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'Trigger';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sync automations are awaited before the respondent sees a confirmation; Async are dispatched without waiting',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'ExecutionMode';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Run order within an execution mode; Sync automations always run before Async ones regardless',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'DisplayOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON condition over the response answers; when it does not hold the automation is recorded as skipped rather than run. Null means always run',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'ConditionalRule';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON describing how the target''s inputs are built from response context, static values and specific answers. Null means the standard response context ids',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'ParameterMapping';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When false, a failure halts the remaining Sync automations for that response',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'ContinueOnError';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional per-automation execution cap in milliseconds',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'TimeoutMS';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this automation is eligible to run',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomation', @level2type = N'COLUMN', @level2name = N'IsActive';
GO

---------------------------------------------------------------------------
-- FormAutomationRun
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One execution attempt of an automation against one response, linking out to the MJ action or agent log that holds the detail',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Outcome of this attempt. Skipped means a condition did not hold, which the MJ logs cannot record',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'How many times this automation has been attempted for this response; the recovery sweep stops re-driving at the configured cap',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'AttemptCount';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When this attempt began',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When this attempt finished, successfully or not',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'CompletedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ action execution log for this attempt, when an Action ran',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'ActionExecutionLogID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The MJ agent run for this attempt, when an Agent ran',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'AIAgentRunID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Why this attempt failed',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'ErrorMessage';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON digest of the result, small enough to show in an activity view',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormAutomationRun', @level2type = N'COLUMN', @level2name = N'OutputSummary';
GO

---------------------------------------------------------------------------
-- FormEntityBindingRecord
---------------------------------------------------------------------------
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Durable record of which target record a submission produced, making re-execution idempotent and the lineage queryable',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBindingRecord';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Entity the record belongs to, captured at execution time',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBindingRecord', @level2type = N'COLUMN', @level2name = N'TargetEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBindingRecord', @level2type = N'COLUMN', @level2name = N'TargetRecordID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the binding did: created a record, merged into an existing one, changed nothing, or skipped',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBindingRecord', @level2type = N'COLUMN', @level2name = N'Outcome';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON list of the field names actually written by this execution',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsForms', @level1type = N'TABLE', @level1name = N'FormEntityBindingRecord', @level2type = N'COLUMN', @level2name = N'WrittenFields';
GO

-- =============================================================================
-- CodeGen output for the four entities above (views, CRUD procedures, and the
-- __mj metadata rows). Appended per migrations/CLAUDE.md so another environment
-- gets the entities themselves, not just the tables: without this a fresh install
-- would have the schema and no way to read or write it through MJ.
-- Generated by `npm run mj:codegen` after applying the DDL above.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Forms: Form Entity Bindings */

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
         'c7f71a7d-fa84-45e8-bde3-fe1ccc46a778',
         'MJ_BizApps_Forms: Form Entity Bindings',
         'Form Entity Bindings',
         'Declares that submissions to a form create or update a record of a target entity, via a field mapping, an identity rule and a merge policy',
         NULL,
         'FormEntityBinding',
         'vwFormEntityBindings',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Entity Bindings to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'c7f71a7d-fa84-45e8-bde3-fe1ccc46a778', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Bindings for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7f71a7d-fa84-45e8-bde3-fe1ccc46a778', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Bindings for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7f71a7d-fa84-45e8-bde3-fe1ccc46a778', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Bindings for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7f71a7d-fa84-45e8-bde3-fe1ccc46a778', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Automations */

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
         'b91defe0-a2c5-4462-bbc3-d3bfd01d631a',
         'MJ_BizApps_Forms: Form Automations',
         'Form Automations',
         'One configured on-submit automation for a form: an Action, an Agent or an entity binding, with its trigger, ordering, condition and execution mode',
         NULL,
         'FormAutomation',
         'vwFormAutomations',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Automations to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'b91defe0-a2c5-4462-bbc3-d3bfd01d631a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automations for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b91defe0-a2c5-4462-bbc3-d3bfd01d631a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automations for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b91defe0-a2c5-4462-bbc3-d3bfd01d631a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automations for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b91defe0-a2c5-4462-bbc3-d3bfd01d631a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Automation Runs */

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
         'dc399b21-517e-4e71-9571-037ab9e2641e',
         'MJ_BizApps_Forms: Form Automation Runs',
         'Form Automation Runs',
         'One execution attempt of an automation against one response, linking out to the MJ action or agent log that holds the detail',
         NULL,
         'FormAutomationRun',
         'vwFormAutomationRuns',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Automation Runs to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'dc399b21-517e-4e71-9571-037ab9e2641e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Runs for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dc399b21-517e-4e71-9571-037ab9e2641e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Runs for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dc399b21-517e-4e71-9571-037ab9e2641e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Automation Runs for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('dc399b21-517e-4e71-9571-037ab9e2641e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_Forms: Form Entity Binding Records */

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
         'ed974050-6da2-40da-813b-38927002246b',
         'MJ_BizApps_Forms: Form Entity Binding Records',
         'Form Entity Binding Records',
         'Durable record of which target record a submission produced, making re-execution idempotent and the lineage queryable',
         NULL,
         'FormEntityBindingRecord',
         'vwFormEntityBindingRecords',
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

/* SQL generated to add new entity MJ_BizApps_Forms: Form Entity Binding Records to application ID: 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8', 'ed974050-6da2-40da-813b-38927002246b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'C2B2D4AF-0FC5-4301-A4FD-D59731AF33C8'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Binding Records for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed974050-6da2-40da-813b-38927002246b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Binding Records for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed974050-6da2-40da-813b-38927002246b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Forms: Form Entity Binding Records for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ed974050-6da2-40da-813b-38927002246b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
UPDATE [${flyway:defaultSchema}].[FormAutomationRun] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomationRun___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
UPDATE [${flyway:defaultSchema}].[FormAutomationRun] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomationRun */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomationRun] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomationRun___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
UPDATE [${flyway:defaultSchema}].[FormEntityBindingRecord] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ADD CONSTRAINT [DF___mj_BizAppsForms_FormEntityBindingRecord___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
UPDATE [${flyway:defaultSchema}].[FormEntityBindingRecord] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBindingRecord */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBindingRecord] ADD CONSTRAINT [DF___mj_BizAppsForms_FormEntityBindingRecord___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomation */
UPDATE [${flyway:defaultSchema}].[FormAutomation] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomation___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomation */
UPDATE [${flyway:defaultSchema}].[FormAutomation] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormAutomation */
ALTER TABLE [${flyway:defaultSchema}].[FormAutomation] ADD CONSTRAINT [DF___mj_BizAppsForms_FormAutomation___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
UPDATE [${flyway:defaultSchema}].[FormEntityBinding] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ADD CONSTRAINT [DF___mj_BizAppsForms_FormEntityBinding___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
UPDATE [${flyway:defaultSchema}].[FormEntityBinding] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FormEntityBinding */
ALTER TABLE [${flyway:defaultSchema}].[FormEntityBinding] ADD CONSTRAINT [DF___mj_BizAppsForms_FormEntityBinding___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 52 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c3251afc-4358-4e5f-8154-22e8aa62e273' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'ID')) BEGIN
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
            'c3251afc-4358-4e5f-8154-22e8aa62e273',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2ac71eeb-871a-4f09-9b72-1f351ab7a305' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'FormAutomationID')) BEGIN
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
            '2ac71eeb-871a-4f09-9b72-1f351ab7a305',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100002,
            'FormAutomationID',
            'Form Automation ID',
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
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4b524be8-6c81-49ed-9aa5-b6e3c9d54635' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'FormResponseID')) BEGIN
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
            '4b524be8-6c81-49ed-9aa5-b6e3c9d54635',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100003,
            'FormResponseID',
            'Form Response ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '49c59e16-6142-4146-913b-e409d3b6a52e' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'Status')) BEGIN
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
            '49c59e16-6142-4146-913b-e409d3b6a52e',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100004,
            'Status',
            'Status',
            'Outcome of this attempt. Skipped means a condition did not hold, which the MJ logs cannot record',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c441c916-1d67-4621-9ea9-e0782d0cbdf3' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'AttemptCount')) BEGIN
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
            'c441c916-1d67-4621-9ea9-e0782d0cbdf3',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100005,
            'AttemptCount',
            'Attempt Count',
            'How many times this automation has been attempted for this response; the recovery sweep stops re-driving at the configured cap',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'df958a16-1158-446c-8937-502e05416adb' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'StartedAt')) BEGIN
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
            'df958a16-1158-446c-8937-502e05416adb',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100006,
            'StartedAt',
            'Started At',
            'When this attempt began',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5f6e63be-35c1-40f1-b995-2dc52179bf37' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'CompletedAt')) BEGIN
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
            '5f6e63be-35c1-40f1-b995-2dc52179bf37',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100007,
            'CompletedAt',
            'Completed At',
            'When this attempt finished, successfully or not',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6da010c3-b2e7-4634-88eb-33469f97f463' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'ActionExecutionLogID')) BEGIN
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
            '6da010c3-b2e7-4634-88eb-33469f97f463',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100008,
            'ActionExecutionLogID',
            'Action Execution Log ID',
            'The MJ action execution log for this attempt, when an Action ran',
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
            '3E248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9d5a556e-da8b-497f-be0b-e79ad04b1456' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'AIAgentRunID')) BEGIN
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
            '9d5a556e-da8b-497f-be0b-e79ad04b1456',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100009,
            'AIAgentRunID',
            'AI Agent Run ID',
            'The MJ agent run for this attempt, when an Agent ran',
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
            '5190AF93-4C39-4429-BDAA-0AEB492A0256',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ac070fce-be4a-475c-82c9-604b8e2033be' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'ErrorMessage')) BEGIN
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
            'ac070fce-be4a-475c-82c9-604b8e2033be',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100010,
            'ErrorMessage',
            'Error Message',
            'Why this attempt failed',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '78b90006-03e0-40f7-bbfa-0d6065a710a8' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'OutputSummary')) BEGIN
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
            '78b90006-03e0-40f7-bbfa-0d6065a710a8',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100011,
            'OutputSummary',
            'Output Summary',
            'JSON digest of the result, small enough to show in an activity view',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '06ef5452-05cb-4754-a6e5-191a0b9229e8' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = '__mj_CreatedAt')) BEGIN
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
            '06ef5452-05cb-4754-a6e5-191a0b9229e8',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ee11fca7-37ae-4357-96ea-b427ae97c4eb' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'ee11fca7-37ae-4357-96ea-b427ae97c4eb',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e9d25b10-7929-4a19-a194-11db2af72f49' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'ID')) BEGIN
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
            'e9d25b10-7929-4a19-a194-11db2af72f49',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8dbd2922-11ec-4873-ac7e-f0805cda5c01' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'BindingID')) BEGIN
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
            '8dbd2922-11ec-4873-ac7e-f0805cda5c01',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100002,
            'BindingID',
            'Binding ID',
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
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ba8e088c-65bd-4fa6-870e-4e3ab919c38b' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'FormResponseID')) BEGIN
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
            'ba8e088c-65bd-4fa6-870e-4e3ab919c38b',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100003,
            'FormResponseID',
            'Form Response ID',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5c0e24ef-7307-45af-aa8a-ccc1f27a5e3d' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'TargetEntityID')) BEGIN
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
            '5c0e24ef-7307-45af-aa8a-ccc1f27a5e3d',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100004,
            'TargetEntityID',
            'Target Entity ID',
            'Entity the record belongs to, captured at execution time',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd8664c7d-c78e-40aa-9e42-94cdf189dcb6' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'TargetRecordID')) BEGIN
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
            'd8664c7d-c78e-40aa-9e42-94cdf189dcb6',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100005,
            'TargetRecordID',
            'Target Record ID',
            'Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped',
            'nvarchar',
            1500,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cbffd659-71f2-47f5-b41e-e680e7bcc329' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'Outcome')) BEGIN
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
            'cbffd659-71f2-47f5-b41e-e680e7bcc329',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100006,
            'Outcome',
            'Outcome',
            'What the binding did: created a record, merged into an existing one, changed nothing, or skipped',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'efae5ed9-4fac-4c04-b553-f926d58a6d2d' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'WrittenFields')) BEGIN
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
            'efae5ed9-4fac-4c04-b553-f926d58a6d2d',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100007,
            'WrittenFields',
            'Written Fields',
            'JSON list of the field names actually written by this execution',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3263248f-8c5d-427e-97dd-ce246e6c9096' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '3263248f-8c5d-427e-97dd-ce246e6c9096',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cfd49358-2ab3-46c6-bc2c-18a62d4fdfb5' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'cfd49358-2ab3-46c6-bc2c-18a62d4fdfb5',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'eebb828b-ef0d-485c-89e5-1568efe4de52' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ID')) BEGIN
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
            'eebb828b-ef0d-485c-89e5-1568efe4de52',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8aedf24a-8cb6-43be-8f4e-77ad166118e0' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'FormID')) BEGIN
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
            '8aedf24a-8cb6-43be-8f4e-77ad166118e0',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5d49b5ef-0752-47a9-9eda-1d46b2e4860a' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Name')) BEGIN
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
            '5d49b5ef-0752-47a9-9eda-1d46b2e4860a',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100003,
            'Name',
            'Name',
            'Author-facing label, e.g. "Email confirmation"',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a7f6dfbc-d242-4288-8251-74d7fe1e1bb0' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Description')) BEGIN
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
            'a7f6dfbc-d242-4288-8251-74d7fe1e1bb0',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100004,
            'Description',
            'Description',
            'What this automation is for',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '68929541-8a1c-4b91-b179-06517447c2b9' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'TargetType')) BEGIN
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
            '68929541-8a1c-4b91-b179-06517447c2b9',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100005,
            'TargetType',
            'Target Type',
            'Which kind of target runs: Action, Agent or EntityBinding',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd6dcca02-37b8-4b58-83cf-be56c880dbfa' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ActionID')) BEGIN
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
            'd6dcca02-37b8-4b58-83cf-be56c880dbfa',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100006,
            'ActionID',
            'Action ID',
            'The MJ Action to run; set only when TargetType is Action',
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
            '38248F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '047bb79d-9ab2-47d3-b7a7-cb0bc3fbb856' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'AgentID')) BEGIN
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
            '047bb79d-9ab2-47d3-b7a7-cb0bc3fbb856',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100007,
            'AgentID',
            'Agent ID',
            'The MJ AI Agent to run; set only when TargetType is Agent',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '299d07c0-8a27-4134-9317-a8050e57b0f8' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'BindingID')) BEGIN
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
            '299d07c0-8a27-4134-9317-a8050e57b0f8',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100008,
            'BindingID',
            'Binding ID',
            'The entity binding to execute; set only when TargetType is EntityBinding',
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
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1546a699-24af-45ba-8601-9226aea943a6' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Trigger')) BEGIN
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
            '1546a699-24af-45ba-8601-9226aea943a6',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100009,
            'Trigger',
            'Trigger',
            'Which save fires this automation: a completed submission, a partial autosave, or both',
            'nvarchar',
            60,
            0,
            0,
            0,
            'OnComplete',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fae87806-34b8-4d3d-a283-997e2a42fffd' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ExecutionMode')) BEGIN
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
            'fae87806-34b8-4d3d-a283-997e2a42fffd',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100010,
            'ExecutionMode',
            'Execution Mode',
            'Sync automations are awaited before the respondent sees a confirmation; Async are dispatched without waiting',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Async',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '57c81864-5aba-48a4-8a07-a9131c548ded' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'DisplayOrder')) BEGIN
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
            '57c81864-5aba-48a4-8a07-a9131c548ded',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100011,
            'DisplayOrder',
            'Display Order',
            'Run order within an execution mode; Sync automations always run before Async ones regardless',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c0fc8e25-e3c1-4cf8-944b-ca7b54667cc6' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ConditionalRule')) BEGIN
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
            'c0fc8e25-e3c1-4cf8-944b-ca7b54667cc6',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100012,
            'ConditionalRule',
            'Conditional Rule',
            'JSON condition over the response answers; when it does not hold the automation is recorded as skipped rather than run. Null means always run',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fdcdc7bc-cbda-4573-9dd6-c9a5a3b6ee78' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ParameterMapping')) BEGIN
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
            'fdcdc7bc-cbda-4573-9dd6-c9a5a3b6ee78',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100013,
            'ParameterMapping',
            'Parameter Mapping',
            'JSON describing how the target''s inputs are built from response context, static values and specific answers. Null means the standard response context ids',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f70eddb9-d06d-4094-9007-43b771b531f1' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'ContinueOnError')) BEGIN
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
            'f70eddb9-d06d-4094-9007-43b771b531f1',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100014,
            'ContinueOnError',
            'Continue On Error',
            'When false, a failure halts the remaining Sync automations for that response',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ca7bdc83-a9e0-4372-882f-a3f349a78f3c' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'TimeoutMS')) BEGIN
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
            'ca7bdc83-a9e0-4372-882f-a3f349a78f3c',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100015,
            'TimeoutMS',
            'Timeout MS',
            'Optional per-automation execution cap in milliseconds',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '00e2d1ee-d335-482e-9f08-0cfb82ed6506' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'IsActive')) BEGIN
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
            '00e2d1ee-d335-482e-9f08-0cfb82ed6506',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100016,
            'IsActive',
            'Is Active',
            'Whether this automation is eligible to run',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '46de2666-3d81-4f32-ac46-d176b3a1c5f2' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = '__mj_CreatedAt')) BEGIN
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
            '46de2666-3d81-4f32-ac46-d176b3a1c5f2',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '33ee0833-e6a0-4585-8fc3-471886315c00' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '33ee0833-e6a0-4585-8fc3-471886315c00',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '12a1d241-395d-4b2b-8298-03e16d743a6b' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'ID')) BEGIN
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
            '12a1d241-395d-4b2b-8298-03e16d743a6b',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '28cf168e-f4e7-4d5a-a55e-faf754f0b992' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'FormID')) BEGIN
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
            '28cf168e-f4e7-4d5a-a55e-faf754f0b992',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '301c6966-9dbc-4724-8f70-d823f2be8a87' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'Name')) BEGIN
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
            '301c6966-9dbc-4724-8f70-d823f2be8a87',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100003,
            'Name',
            'Name',
            'Author-facing label for this binding, e.g. "Create CRM Lead"',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7f1d141c-dce4-4f85-8391-aa77396a8e38' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'Description')) BEGIN
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
            '7f1d141c-dce4-4f85-8391-aa77396a8e38',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100004,
            'Description',
            'Description',
            'What this binding is for',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ed441c06-7545-4f5f-9f60-e133eda4b996' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'TargetEntityID')) BEGIN
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
            'ed441c06-7545-4f5f-9f60-e133eda4b996',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100005,
            'TargetEntityID',
            'Target Entity ID',
            'Entity whose records this binding writes',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8a3cc693-4427-4dc3-b8c4-891968f1a682' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'TargetEntityName')) BEGIN
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
            '8a3cc693-4427-4dc3-b8c4-891968f1a682',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100006,
            'TargetEntityName',
            'Target Entity Name',
            'Name of the target entity, stored alongside the ID because a runtime-created entity has a different ID in each environment and the name is the only portable handle',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6e505c53-e248-402c-80a3-6a6128c437cf' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'FieldMappings')) BEGIN
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
            '6e505c53-e248-402c-80a3-6a6128c437cf',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100007,
            'FieldMappings',
            'Field Mappings',
            'JSON mapping of question GUIDs to target entity fields, with optional per-field transforms and conditions',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9ed22796-73b7-44fb-a224-a6584ad16fd9' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'IdentityRule')) BEGIN
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
            '9ed22796-73b7-44fb-a224-a6584ad16fd9',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100008,
            'IdentityRule',
            'Identity Rule',
            'JSON rule deciding whether a submission updates an existing record or creates one: match fields, tenant scope, and what to do on no match or several',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9520208e-1ccd-49ba-a7df-340d81755943' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'MergePolicy')) BEGIN
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
            '9520208e-1ccd-49ba-a7df-340d81755943',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100009,
            'MergePolicy',
            'Merge Policy',
            'JSON per-field merge policy (neverBlank, latestWins, writeOnce). Null means neverBlank throughout',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f3c877c9-197a-435d-983f-e4cc902ed0e7' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'Status')) BEGIN
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
            'f3c877c9-197a-435d-983f-e4cc902ed0e7',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100010,
            'Status',
            'Status',
            'Whether this binding is eligible to run',
            'nvarchar',
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
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f0d5db34-57cf-434c-b007-165cae3c3ad3' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = '__mj_CreatedAt')) BEGIN
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
            'f0d5db34-57cf-434c-b007-165cae3c3ad3',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e29d7694-bde2-4e30-9f37-6b7d181b069e' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e29d7694-bde2-4e30-9f37-6b7d181b069e',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100012,
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
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks';

/* SQL text to insert entity field value with ID b31a33e8-e104-4aaf-a337-788fa5021bf7 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b31a33e8-e104-4aaf-a337-788fa5021bf7', 'F3C877C9-197A-435D-983F-E4CC902ED0E7', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fc54b33a-fb70-4dc9-afd6-56f5b949bc3c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fc54b33a-fb70-4dc9-afd6-56f5b949bc3c', 'F3C877C9-197A-435D-983F-E4CC902ED0E7', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F3C877C9-197A-435D-983F-E4CC902ED0E7 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='F3C877C9-197A-435D-983F-E4CC902ED0E7';

/* SQL text to insert entity field value with ID 647068b5-787a-4c2b-8127-ec2db1e87dae */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('647068b5-787a-4c2b-8127-ec2db1e87dae', '68929541-8A1C-4B91-B179-06517447C2B9', 1, 'Action', 'Action', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0f9ebd2d-d0bf-4aa0-a54f-ff3826f9f403 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0f9ebd2d-d0bf-4aa0-a54f-ff3826f9f403', '68929541-8A1C-4B91-B179-06517447C2B9', 2, 'Agent', 'Agent', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 807748f6-3f33-4ba8-981c-eaafe85216aa */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('807748f6-3f33-4ba8-981c-eaafe85216aa', '68929541-8A1C-4B91-B179-06517447C2B9', 3, 'EntityBinding', 'EntityBinding', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 68929541-8A1C-4B91-B179-06517447C2B9 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='68929541-8A1C-4B91-B179-06517447C2B9';

/* SQL text to insert entity field value with ID 453f5cd2-7f4d-45a4-866c-1ce93450554e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('453f5cd2-7f4d-45a4-866c-1ce93450554e', '1546A699-24AF-45BA-8601-9226AEA943A6', 1, 'OnComplete', 'OnComplete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 12baae6c-faec-4c4d-8e1b-c6edc7ffbd4c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('12baae6c-faec-4c4d-8e1b-c6edc7ffbd4c', '1546A699-24AF-45BA-8601-9226AEA943A6', 2, 'OnCompleteOrPartial', 'OnCompleteOrPartial', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID abab7c57-9b99-468a-9e5f-c18421a4deb3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('abab7c57-9b99-468a-9e5f-c18421a4deb3', '1546A699-24AF-45BA-8601-9226AEA943A6', 3, 'OnPartial', 'OnPartial', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1546A699-24AF-45BA-8601-9226AEA943A6 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='1546A699-24AF-45BA-8601-9226AEA943A6';

/* SQL text to insert entity field value with ID 87d1e19a-fa0c-485c-8ffe-9bbfeeab2da8 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('87d1e19a-fa0c-485c-8ffe-9bbfeeab2da8', 'FAE87806-34B8-4D3D-A283-997E2A42FFFD', 1, 'Async', 'Async', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8f2c1add-d5bf-4f2d-9223-43ec2e753c36 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8f2c1add-d5bf-4f2d-9223-43ec2e753c36', 'FAE87806-34B8-4D3D-A283-997E2A42FFFD', 2, 'Sync', 'Sync', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FAE87806-34B8-4D3D-A283-997E2A42FFFD */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='FAE87806-34B8-4D3D-A283-997E2A42FFFD';

/* SQL text to insert entity field value with ID b6249419-2aea-4ca0-ae3e-6d0921ea56c8 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6249419-2aea-4ca0-ae3e-6d0921ea56c8', '49C59E16-6142-4146-913B-E409D3B6A52E', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 14c2396b-5501-4e9f-98bb-0ef20fe47e5b */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('14c2396b-5501-4e9f-98bb-0ef20fe47e5b', '49C59E16-6142-4146-913B-E409D3B6A52E', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 74c8f1cc-8248-46d7-bcc8-9742fb3575c9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74c8f1cc-8248-46d7-bcc8-9742fb3575c9', '49C59E16-6142-4146-913B-E409D3B6A52E', 3, 'Running', 'Running', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa3cd6f3-23d8-46f0-902c-42e6794d7d37 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa3cd6f3-23d8-46f0-902c-42e6794d7d37', '49C59E16-6142-4146-913B-E409D3B6A52E', 4, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4b2ae59a-5164-4c31-b0c5-ef4eef9926e6 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b2ae59a-5164-4c31-b0c5-ef4eef9926e6', '49C59E16-6142-4146-913B-E409D3B6A52E', 5, 'Succeeded', 'Succeeded', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 49C59E16-6142-4146-913B-E409D3B6A52E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='49C59E16-6142-4146-913B-E409D3B6A52E';

/* SQL text to insert entity field value with ID 9fd66541-c04b-4388-842f-0fd5dd37897e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9fd66541-c04b-4388-842f-0fd5dd37897e', 'CBFFD659-71F2-47F5-B41E-E680E7BCC329', 1, 'Created', 'Created', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 615dc147-fdf6-42a2-bd9f-af72c692aee4 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('615dc147-fdf6-42a2-bd9f-af72c692aee4', 'CBFFD659-71F2-47F5-B41E-E680E7BCC329', 2, 'Merged', 'Merged', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4320724f-581f-4dbb-b123-9c001b6dde83 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4320724f-581f-4dbb-b123-9c001b6dde83', 'CBFFD659-71F2-47F5-B41E-E680E7BCC329', 3, 'Skipped', 'Skipped', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1d1f3166-9622-481c-8ba9-df3c702c0fb8 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d1f3166-9622-481c-8ba9-df3c702c0fb8', 'CBFFD659-71F2-47F5-B41E-E680E7BCC329', 4, 'Unchanged', 'Unchanged', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CBFFD659-71F2-47F5-B41E-E680E7BCC329 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='CBFFD659-71F2-47F5-B41E-E680E7BCC329';


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ_BizApps_Forms: Form Automation Runs (One To Many via AIAgentRunID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '07f69516-3be3-4c2d-8f49-251e04537d5f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('07f69516-3be3-4c2d-8f49-251e04537d5f', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'AIAgentRunID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Responses -> MJ_BizApps_Forms: Form Entity Binding Records (One To Many via FormResponseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '3f5aea01-5da7-42bb-a9c1-a85113a6a8eb'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3f5aea01-5da7-42bb-a9c1-a85113a6a8eb', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'ED974050-6DA2-40DA-813B-38927002246B', 'FormResponseID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Responses -> MJ_BizApps_Forms: Form Automation Runs (One To Many via FormResponseID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '82e358d1-44e4-4838-854a-b7274cc1fb77'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('82e358d1-44e4-4838-854a-b7274cc1fb77', '63600739-7165-4BDC-B7D7-19A1B1951DFA', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'FormResponseID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Agents -> MJ_BizApps_Forms: Form Automations (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '1277404c-bcbf-4205-b84a-a34412da235e'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1277404c-bcbf-4205-b84a-a34412da235e', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'AgentID', 'One To Many', 1, 1, 38, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ_BizApps_Forms: Form Entity Bindings (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a5180cde-f95b-478a-be95-e0d0f551bda6'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a5180cde-f95b-478a-be95-e0d0f551bda6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'TargetEntityID', 'One To Many', 1, 1, 75, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Actions -> MJ_BizApps_Forms: Form Automations (One To Many via ActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a84a44b3-b50a-4bf3-bc77-d3dad2320526'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a84a44b3-b50a-4bf3-bc77-d3dad2320526', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'ActionID', 'One To Many', 1, 1, 22, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Action Execution Logs -> MJ_BizApps_Forms: Form Automation Runs (One To Many via ActionExecutionLogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'bd2f8814-454d-4d24-a038-81d991f551c3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd2f8814-454d-4d24-a038-81d991f551c3', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'ActionExecutionLogID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Automations (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'abb41ff6-7f31-4e4e-96b7-0593565e67a8'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('abb41ff6-7f31-4e4e-96b7-0593565e67a8', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'FormID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Forms -> MJ_BizApps_Forms: Form Entity Bindings (One To Many via FormID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'd0854c08-76e1-44a8-baca-99c3e867b24f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d0854c08-76e1-44a8-baca-99c3e867b24f', 'C6DB9AD8-11EA-451B-B0E1-71D7BFD894B8', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'FormID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Automations -> MJ_BizApps_Forms: Form Automation Runs (One To Many via FormAutomationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '98d6958e-9c4f-42a4-92ff-6de7bea766d5'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('98d6958e-9c4f-42a4-92ff-6de7bea766d5', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'FormAutomationID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Forms: Form Entity Bindings -> MJ_BizApps_Forms: Form Automations (One To Many via BindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'dbb1abaf-f640-44a9-9224-afefd3d9821a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dbb1abaf-f640-44a9-9224-afefd3d9821a', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'BindingID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Forms: Form Entity Bindings -> MJ_BizApps_Forms: Form Entity Binding Records (One To Many via BindingID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '7d692aab-0c16-4e51-9972-2a7614ae3d36'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7d692aab-0c16-4e51-9972-2a7614ae3d36', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'ED974050-6DA2-40DA-813B-38927002246B', 'BindingID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks';

/* Index for Foreign Keys for FormAutomationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormAutomationID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_FormAutomationID ON [${flyway:defaultSchema}].[FormAutomationRun] ([FormAutomationID]);

-- Index for foreign key FormResponseID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_FormResponseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_FormResponseID ON [${flyway:defaultSchema}].[FormAutomationRun] ([FormResponseID]);

-- Index for foreign key ActionExecutionLogID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_ActionExecutionLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_ActionExecutionLogID ON [${flyway:defaultSchema}].[FormAutomationRun] ([ActionExecutionLogID]);

-- Index for foreign key AIAgentRunID in table FormAutomationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomationRun_AIAgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomationRun_AIAgentRunID ON [${flyway:defaultSchema}].[FormAutomationRun] ([AIAgentRunID]);

/* SQL text to update entity field related entity name field map for entity field ID 2AC71EEB-871A-4F09-9B72-1F351AB7A305 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2AC71EEB-871A-4F09-9B72-1F351AB7A305', @RelatedEntityNameFieldMap='FormAutomation';

/* Index for Foreign Keys for FormAutomation */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormAutomation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomation_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomation_FormID ON [${flyway:defaultSchema}].[FormAutomation] ([FormID]);

-- Index for foreign key ActionID in table FormAutomation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomation_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomation_ActionID ON [${flyway:defaultSchema}].[FormAutomation] ([ActionID]);

-- Index for foreign key AgentID in table FormAutomation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomation_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomation_AgentID ON [${flyway:defaultSchema}].[FormAutomation] ([AgentID]);

-- Index for foreign key BindingID in table FormAutomation
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormAutomation_BindingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormAutomation]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormAutomation_BindingID ON [${flyway:defaultSchema}].[FormAutomation] ([BindingID]);

/* SQL text to update entity field related entity name field map for entity field ID 8AEDF24A-8CB6-43BE-8F4E-77AD166118E0 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8AEDF24A-8CB6-43BE-8F4E-77AD166118E0', @RelatedEntityNameFieldMap='Form';

/* Index for Foreign Keys for FormEntityBindingRecord */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BindingID in table FormEntityBindingRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormEntityBindingRecord_BindingID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormEntityBindingRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormEntityBindingRecord_BindingID ON [${flyway:defaultSchema}].[FormEntityBindingRecord] ([BindingID]);

-- Index for foreign key FormResponseID in table FormEntityBindingRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormEntityBindingRecord_FormResponseID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormEntityBindingRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormEntityBindingRecord_FormResponseID ON [${flyway:defaultSchema}].[FormEntityBindingRecord] ([FormResponseID]);

/* SQL text to update entity field related entity name field map for entity field ID 8DBD2922-11EC-4873-AC7E-F0805CDA5C01 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8DBD2922-11EC-4873-AC7E-F0805CDA5C01', @RelatedEntityNameFieldMap='Binding';

/* SQL text to update entity field related entity name field map for entity field ID D6DCCA02-37B8-4B58-83CF-BE56C880DBFA */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D6DCCA02-37B8-4B58-83CF-BE56C880DBFA', @RelatedEntityNameFieldMap='Action';

/* Base View SQL for MJ_BizApps_Forms: Form Entity Binding Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: vwFormEntityBindingRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Entity Binding Records
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormEntityBindingRecord
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormEntityBindingRecords]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormEntityBindingRecords];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormEntityBindingRecords]
AS
SELECT
    f.*,
    mjBizAppsFormsFormEntityBinding_BindingID.[Name] AS [Binding]
FROM
    [${flyway:defaultSchema}].[FormEntityBindingRecord] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FormEntityBinding] AS mjBizAppsFormsFormEntityBinding_BindingID
  ON
    [f].[BindingID] = mjBizAppsFormsFormEntityBinding_BindingID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormEntityBindingRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Entity Binding Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: Permissions for vwFormEntityBindingRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormEntityBindingRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Entity Binding Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: spCreateFormEntityBindingRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormEntityBindingRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormEntityBindingRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormEntityBindingRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormEntityBindingRecord]
    @ID uniqueidentifier = NULL,
    @BindingID uniqueidentifier,
    @FormResponseID uniqueidentifier,
    @TargetEntityID uniqueidentifier,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Outcome nvarchar(20),
    @WrittenFields_Clear bit = 0,
    @WrittenFields nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormEntityBindingRecord]
            (
                [ID],
                [BindingID],
                [FormResponseID],
                [TargetEntityID],
                [TargetRecordID],
                [Outcome],
                [WrittenFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @BindingID,
                @FormResponseID,
                @TargetEntityID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                @Outcome,
                CASE WHEN @WrittenFields_Clear = 1 THEN NULL ELSE ISNULL(@WrittenFields, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormEntityBindingRecord]
            (
                [BindingID],
                [FormResponseID],
                [TargetEntityID],
                [TargetRecordID],
                [Outcome],
                [WrittenFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @BindingID,
                @FormResponseID,
                @TargetEntityID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                @Outcome,
                CASE WHEN @WrittenFields_Clear = 1 THEN NULL ELSE ISNULL(@WrittenFields, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormEntityBindingRecords] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Entity Binding Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Entity Binding Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: spUpdateFormEntityBindingRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormEntityBindingRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormEntityBindingRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormEntityBindingRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormEntityBindingRecord]
    @ID uniqueidentifier,
    @BindingID uniqueidentifier = NULL,
    @FormResponseID uniqueidentifier = NULL,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Outcome nvarchar(20) = NULL,
    @WrittenFields_Clear bit = 0,
    @WrittenFields nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormEntityBindingRecord]
    SET
        [BindingID] = ISNULL(@BindingID, [BindingID]),
        [FormResponseID] = ISNULL(@FormResponseID, [FormResponseID]),
        [TargetEntityID] = ISNULL(@TargetEntityID, [TargetEntityID]),
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [Outcome] = ISNULL(@Outcome, [Outcome]),
        [WrittenFields] = CASE WHEN @WrittenFields_Clear = 1 THEN NULL ELSE ISNULL(@WrittenFields, [WrittenFields]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormEntityBindingRecords] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormEntityBindingRecords]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormEntityBindingRecord table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormEntityBindingRecord]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormEntityBindingRecord];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormEntityBindingRecord
ON [${flyway:defaultSchema}].[FormEntityBindingRecord]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormEntityBindingRecord]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormEntityBindingRecord] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Entity Binding Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Entity Binding Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Binding Records
-- Item: spDeleteFormEntityBindingRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormEntityBindingRecord
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormEntityBindingRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormEntityBindingRecord];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormEntityBindingRecord]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormEntityBindingRecord]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Entity Binding Records */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormEntityBindingRecord] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 047BB79D-9AB2-47D3-B7A7-CB0BC3FBB856 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='047BB79D-9AB2-47D3-B7A7-CB0BC3FBB856', @RelatedEntityNameFieldMap='Agent';

/* SQL text to update entity field related entity name field map for entity field ID 6DA010C3-B2E7-4634-88EB-33469F97F463 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6DA010C3-B2E7-4634-88EB-33469F97F463', @RelatedEntityNameFieldMap='ActionExecutionLog';

/* SQL text to update entity field related entity name field map for entity field ID 299D07C0-8A27-4134-9317-A8050E57B0F8 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='299D07C0-8A27-4134-9317-A8050E57B0F8', @RelatedEntityNameFieldMap='Binding';

/* SQL text to update entity field related entity name field map for entity field ID 9D5A556E-DA8B-497F-BE0B-E79AD04B1456 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9D5A556E-DA8B-497F-BE0B-E79AD04B1456', @RelatedEntityNameFieldMap='AIAgentRun';

/* Base View SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: vwFormAutomationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Automation Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormAutomationRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormAutomationRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormAutomationRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormAutomationRuns]
AS
SELECT
    f.*,
    mjBizAppsFormsFormAutomation_FormAutomationID.[Name] AS [FormAutomation],
    MJActionExecutionLog_ActionExecutionLogID.[Action] AS [ActionExecutionLog],
    MJAIAgentRun_AIAgentRunID.[RunName] AS [AIAgentRun]
FROM
    [${flyway:defaultSchema}].[FormAutomationRun] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FormAutomation] AS mjBizAppsFormsFormAutomation_FormAutomationID
  ON
    [f].[FormAutomationID] = mjBizAppsFormsFormAutomation_FormAutomationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[vwActionExecutionLogs] AS MJActionExecutionLog_ActionExecutionLogID
  ON
    [f].[ActionExecutionLogID] = MJActionExecutionLog_ActionExecutionLogID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[AIAgentRun] AS MJAIAgentRun_AIAgentRunID
  ON
    [f].[AIAgentRunID] = MJAIAgentRun_AIAgentRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: Permissions for vwFormAutomationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomationRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spCreateFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomationRun]
    @ID uniqueidentifier = NULL,
    @FormAutomationID uniqueidentifier,
    @FormResponseID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @OutputSummary_Clear bit = 0,
    @OutputSummary nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationRun]
            (
                [ID],
                [FormAutomationID],
                [FormResponseID],
                [Status],
                [AttemptCount],
                [StartedAt],
                [CompletedAt],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [ErrorMessage],
                [OutputSummary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormAutomationID,
                @FormResponseID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormAutomationRun]
            (
                [FormAutomationID],
                [FormResponseID],
                [Status],
                [AttemptCount],
                [StartedAt],
                [CompletedAt],
                [ActionExecutionLogID],
                [AIAgentRunID],
                [ErrorMessage],
                [OutputSummary]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormAutomationID,
                @FormResponseID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@AttemptCount, 0),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormAutomationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Automation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spUpdateFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomationRun]
    @ID uniqueidentifier,
    @FormAutomationID uniqueidentifier = NULL,
    @FormResponseID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @AttemptCount int = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @OutputSummary_Clear bit = 0,
    @OutputSummary nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationRun]
    SET
        [FormAutomationID] = ISNULL(@FormAutomationID, [FormAutomationID]),
        [FormResponseID] = ISNULL(@FormResponseID, [FormResponseID]),
        [Status] = ISNULL(@Status, [Status]),
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ActionExecutionLogID] = CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, [ActionExecutionLogID]) END,
        [AIAgentRunID] = CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, [AIAgentRunID]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [OutputSummary] = CASE WHEN @OutputSummary_Clear = 1 THEN NULL ELSE ISNULL(@OutputSummary, [OutputSummary]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormAutomationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormAutomationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormAutomationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormAutomationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormAutomationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormAutomationRun
ON [${flyway:defaultSchema}].[FormAutomationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormAutomationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Automation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Automation Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automation Runs
-- Item: spDeleteFormAutomationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormAutomationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormAutomationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormAutomationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Automation Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomationRun] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Forms: Form Automations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: vwFormAutomations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Automations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormAutomation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormAutomations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormAutomations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormAutomations]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    MJAction_ActionID.[Name] AS [Action],
    MJAIAgent_AgentID.[Name] AS [Agent],
    mjBizAppsFormsFormEntityBinding_BindingID.[Name] AS [Binding]
FROM
    [${flyway:defaultSchema}].[FormAutomation] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[Action] AS MJAction_ActionID
  ON
    [f].[ActionID] = MJAction_ActionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [f].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FormEntityBinding] AS mjBizAppsFormsFormEntityBinding_BindingID
  ON
    [f].[BindingID] = mjBizAppsFormsFormEntityBinding_BindingID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Automations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: Permissions for vwFormAutomations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormAutomations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Automations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: spCreateFormAutomation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormAutomation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormAutomation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormAutomation]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TargetType nvarchar(20),
    @ActionID_Clear bit = 0,
    @ActionID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @BindingID_Clear bit = 0,
    @BindingID uniqueidentifier = NULL,
    @Trigger nvarchar(30) = NULL,
    @ExecutionMode nvarchar(10) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ParameterMapping_Clear bit = 0,
    @ParameterMapping nvarchar(MAX) = NULL,
    @ContinueOnError bit = NULL,
    @TimeoutMS_Clear bit = 0,
    @TimeoutMS int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormAutomation]
            (
                [ID],
                [FormID],
                [Name],
                [Description],
                [TargetType],
                [ActionID],
                [AgentID],
                [BindingID],
                [Trigger],
                [ExecutionMode],
                [DisplayOrder],
                [ConditionalRule],
                [ParameterMapping],
                [ContinueOnError],
                [TimeoutMS],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TargetType,
                CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @BindingID_Clear = 1 THEN NULL ELSE ISNULL(@BindingID, NULL) END,
                ISNULL(@Trigger, 'OnComplete'),
                ISNULL(@ExecutionMode, 'Async'),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ParameterMapping_Clear = 1 THEN NULL ELSE ISNULL(@ParameterMapping, NULL) END,
                ISNULL(@ContinueOnError, 1),
                CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormAutomation]
            (
                [FormID],
                [Name],
                [Description],
                [TargetType],
                [ActionID],
                [AgentID],
                [BindingID],
                [Trigger],
                [ExecutionMode],
                [DisplayOrder],
                [ConditionalRule],
                [ParameterMapping],
                [ContinueOnError],
                [TimeoutMS],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TargetType,
                CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, NULL) END,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @BindingID_Clear = 1 THEN NULL ELSE ISNULL(@BindingID, NULL) END,
                ISNULL(@Trigger, 'OnComplete'),
                ISNULL(@ExecutionMode, 'Async'),
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, NULL) END,
                CASE WHEN @ParameterMapping_Clear = 1 THEN NULL ELSE ISNULL(@ParameterMapping, NULL) END,
                ISNULL(@ContinueOnError, 1),
                CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormAutomations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomation] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Automations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormAutomation] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Automations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: spUpdateFormAutomation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormAutomation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormAutomation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormAutomation]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TargetType nvarchar(20) = NULL,
    @ActionID_Clear bit = 0,
    @ActionID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @BindingID_Clear bit = 0,
    @BindingID uniqueidentifier = NULL,
    @Trigger nvarchar(30) = NULL,
    @ExecutionMode nvarchar(10) = NULL,
    @DisplayOrder int = NULL,
    @ConditionalRule_Clear bit = 0,
    @ConditionalRule nvarchar(MAX) = NULL,
    @ParameterMapping_Clear bit = 0,
    @ParameterMapping nvarchar(MAX) = NULL,
    @ContinueOnError bit = NULL,
    @TimeoutMS_Clear bit = 0,
    @TimeoutMS int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomation]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TargetType] = ISNULL(@TargetType, [TargetType]),
        [ActionID] = CASE WHEN @ActionID_Clear = 1 THEN NULL ELSE ISNULL(@ActionID, [ActionID]) END,
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [BindingID] = CASE WHEN @BindingID_Clear = 1 THEN NULL ELSE ISNULL(@BindingID, [BindingID]) END,
        [Trigger] = ISNULL(@Trigger, [Trigger]),
        [ExecutionMode] = ISNULL(@ExecutionMode, [ExecutionMode]),
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [ConditionalRule] = CASE WHEN @ConditionalRule_Clear = 1 THEN NULL ELSE ISNULL(@ConditionalRule, [ConditionalRule]) END,
        [ParameterMapping] = CASE WHEN @ParameterMapping_Clear = 1 THEN NULL ELSE ISNULL(@ParameterMapping, [ParameterMapping]) END,
        [ContinueOnError] = ISNULL(@ContinueOnError, [ContinueOnError]),
        [TimeoutMS] = CASE WHEN @TimeoutMS_Clear = 1 THEN NULL ELSE ISNULL(@TimeoutMS, [TimeoutMS]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormAutomations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormAutomations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormAutomation table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormAutomation]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormAutomation];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormAutomation
ON [${flyway:defaultSchema}].[FormAutomation]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormAutomation]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormAutomation] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Automations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormAutomation] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Automations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Automations
-- Item: spDeleteFormAutomation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormAutomation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormAutomation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormAutomation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormAutomation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomation] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Automations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormAutomation] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for FormEntityBinding */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FormID in table FormEntityBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormEntityBinding_FormID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormEntityBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormEntityBinding_FormID ON [${flyway:defaultSchema}].[FormEntityBinding] ([FormID]);

-- Index for foreign key TargetEntityID in table FormEntityBinding
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FormEntityBinding_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FormEntityBinding]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FormEntityBinding_TargetEntityID ON [${flyway:defaultSchema}].[FormEntityBinding] ([TargetEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 28CF168E-F4E7-4D5A-A55E-FAF754F0B992 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='28CF168E-F4E7-4D5A-A55E-FAF754F0B992', @RelatedEntityNameFieldMap='Form';

/* SQL text to update entity field related entity name field map for entity field ID ED441C06-7545-4F5F-9F60-E133EDA4B996 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ED441C06-7545-4F5F-9F60-E133EDA4B996', @RelatedEntityNameFieldMap='TargetEntity';

/* Base View SQL for MJ_BizApps_Forms: Form Entity Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: vwFormEntityBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Forms: Form Entity Bindings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FormEntityBinding
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFormEntityBindings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFormEntityBindings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFormEntityBindings]
AS
SELECT
    f.*,
    mjBizAppsFormsForm_FormID.[Name] AS [Form],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[FormEntityBinding] AS f
INNER JOIN
    [${flyway:defaultSchema}].[Form] AS mjBizAppsFormsForm_FormID
  ON
    [f].[FormID] = mjBizAppsFormsForm_FormID.[ID]
INNER JOIN
    [${mjSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [f].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFormEntityBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Forms: Form Entity Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: Permissions for vwFormEntityBindings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFormEntityBindings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Forms: Form Entity Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: spCreateFormEntityBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FormEntityBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFormEntityBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFormEntityBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFormEntityBinding]
    @ID uniqueidentifier = NULL,
    @FormID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TargetEntityID uniqueidentifier,
    @TargetEntityName nvarchar(500),
    @FieldMappings nvarchar(MAX),
    @IdentityRule nvarchar(MAX),
    @MergePolicy_Clear bit = 0,
    @MergePolicy nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FormEntityBinding]
            (
                [ID],
                [FormID],
                [Name],
                [Description],
                [TargetEntityID],
                [TargetEntityName],
                [FieldMappings],
                [IdentityRule],
                [MergePolicy],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FormID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TargetEntityID,
                @TargetEntityName,
                @FieldMappings,
                @IdentityRule,
                CASE WHEN @MergePolicy_Clear = 1 THEN NULL ELSE ISNULL(@MergePolicy, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FormEntityBinding]
            (
                [FormID],
                [Name],
                [Description],
                [TargetEntityID],
                [TargetEntityName],
                [FieldMappings],
                [IdentityRule],
                [MergePolicy],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FormID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TargetEntityID,
                @TargetEntityName,
                @FieldMappings,
                @IdentityRule,
                CASE WHEN @MergePolicy_Clear = 1 THEN NULL ELSE ISNULL(@MergePolicy, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFormEntityBindings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormEntityBinding] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Forms: Form Entity Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFormEntityBinding] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Forms: Form Entity Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: spUpdateFormEntityBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FormEntityBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFormEntityBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFormEntityBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFormEntityBinding]
    @ID uniqueidentifier,
    @FormID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetEntityName nvarchar(500) = NULL,
    @FieldMappings nvarchar(MAX) = NULL,
    @IdentityRule nvarchar(MAX) = NULL,
    @MergePolicy_Clear bit = 0,
    @MergePolicy nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormEntityBinding]
    SET
        [FormID] = ISNULL(@FormID, [FormID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TargetEntityID] = ISNULL(@TargetEntityID, [TargetEntityID]),
        [TargetEntityName] = ISNULL(@TargetEntityName, [TargetEntityName]),
        [FieldMappings] = ISNULL(@FieldMappings, [FieldMappings]),
        [IdentityRule] = ISNULL(@IdentityRule, [IdentityRule]),
        [MergePolicy] = CASE WHEN @MergePolicy_Clear = 1 THEN NULL ELSE ISNULL(@MergePolicy, [MergePolicy]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFormEntityBindings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFormEntityBindings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormEntityBinding] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FormEntityBinding table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFormEntityBinding]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFormEntityBinding];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFormEntityBinding
ON [${flyway:defaultSchema}].[FormEntityBinding]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FormEntityBinding]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FormEntityBinding] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Forms: Form Entity Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFormEntityBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Forms: Form Entity Bindings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Forms: Form Entity Bindings
-- Item: spDeleteFormEntityBinding
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FormEntityBinding
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFormEntityBinding]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFormEntityBinding];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFormEntityBinding]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FormEntityBinding]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormEntityBinding] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Forms: Form Entity Bindings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFormEntityBinding] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (4 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks', @EntityIDs='C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778,B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A,DC399B21-517E-4E71-9571-037AB9E2641E,ED974050-6DA2-40DA-813B-38927002246B';

/* SQL text to insert 10 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c9b4c2ca-7cc0-41c9-a0c9-d97d9584b168' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'FormAutomation')) BEGIN
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
            'c9b4c2ca-7cc0-41c9-a0c9-d97d9584b168',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100027,
            'FormAutomation',
            'Form Automation',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '87d582a3-d8e4-4905-a4e1-ce89cdde2f4d' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'ActionExecutionLog')) BEGIN
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
            '87d582a3-d8e4-4905-a4e1-ce89cdde2f4d',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100028,
            'ActionExecutionLog',
            'Action Execution Log',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4186f0eb-18b2-4a59-bc94-86f87b063734' OR (EntityID = 'DC399B21-517E-4E71-9571-037AB9E2641E' AND Name = 'AIAgentRun')) BEGIN
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
            '4186f0eb-18b2-4a59-bc94-86f87b063734',
            'DC399B21-517E-4E71-9571-037AB9E2641E', -- Entity: MJ_BizApps_Forms: Form Automation Runs
            100029,
            'AIAgentRun',
            'AI Agent Run',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e97753e7-966a-4fc7-a0e9-f8ca31b648f2' OR (EntityID = 'ED974050-6DA2-40DA-813B-38927002246B' AND Name = 'Binding')) BEGIN
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
            'e97753e7-966a-4fc7-a0e9-f8ca31b648f2',
            'ED974050-6DA2-40DA-813B-38927002246B', -- Entity: MJ_BizApps_Forms: Form Entity Binding Records
            100019,
            'Binding',
            'Binding',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6ea5a667-3d04-475d-bb15-87ead76bcb5c' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Form')) BEGIN
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
            '6ea5a667-3d04-475d-bb15-87ead76bcb5c',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100037,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7ce3226e-0aa3-41ce-b8d4-1574daf9d995' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Action')) BEGIN
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
            '7ce3226e-0aa3-41ce-b8d4-1574daf9d995',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100038,
            'Action',
            'Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '80ffa65a-161e-4418-9a44-5da1d2152c51' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Agent')) BEGIN
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
            '80ffa65a-161e-4418-9a44-5da1d2152c51',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100039,
            'Agent',
            'Agent',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'eb0e2fde-fd7c-4db0-a401-91edab05f87c' OR (EntityID = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A' AND Name = 'Binding')) BEGIN
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
            'eb0e2fde-fd7c-4db0-a401-91edab05f87c',
            'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', -- Entity: MJ_BizApps_Forms: Form Automations
            100040,
            'Binding',
            'Binding',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '464efedb-f301-4358-9b06-e33d5696b406' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'Form')) BEGIN
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
            '464efedb-f301-4358-9b06-e33d5696b406',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100025,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c67bce01-f222-44ef-8b1e-da711b744122' OR (EntityID = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778' AND Name = 'TargetEntity')) BEGIN
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
            'c67bce01-f222-44ef-8b1e-da711b744122',
            'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', -- Entity: MJ_BizApps_Forms: Form Entity Bindings
            100026,
            'TargetEntity',
            'Target Entity',
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

/* SQL text to update existing entity fields from schema (4 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks', @EntityIDs='C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778,B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A,DC399B21-517E-4E71-9571-037AB9E2641E,ED974050-6DA2-40DA-813B-38927002246B';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${commonSchema},${mjSchema}_BizAppsTasks,${commonSchema},${mjSchema}_bizappstasks';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8A3CC693-4427-4DC3-B8C4-891968F1A682'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F3C877C9-197A-435D-983F-E4CC902ED0E7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E29D7694-BDE2-4E30-9F37-6B7D181B069E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8A3CC693-4427-4DC3-B8C4-891968F1A682'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '301C6966-9DBC-4724-8F70-D823F2BE8A87'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '49C59E16-6142-4146-913B-E409D3B6A52E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C441C916-1D67-4621-9EA9-E0782D0CBDF3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DF958A16-1158-446C-8937-502E05416ADB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5F6E63BE-35C1-40F1-B995-2DC52179BF37'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C9B4C2CA-7CC0-41C9-A0C9-D97D9584B168'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '49C59E16-6142-4146-913B-E409D3B6A52E'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C9B4C2CA-7CC0-41C9-A0C9-D97D9584B168'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '49C59E16-6142-4146-913B-E409D3B6A52E'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '68929541-8A1C-4B91-B179-06517447C2B9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1546A699-24AF-45BA-8601-9226AEA943A6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FAE87806-34B8-4D3D-A283-997E2A42FFFD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '00E2D1EE-D335-482E-9F08-0CFB82ED6506'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '68929541-8A1C-4B91-B179-06517447C2B9'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1546A699-24AF-45BA-8601-9226AEA943A6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FAE87806-34B8-4D3D-A283-997E2A42FFFD'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '68929541-8A1C-4B91-B179-06517447C2B9'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1546A699-24AF-45BA-8601-9226AEA943A6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'FAE87806-34B8-4D3D-A283-997E2A42FFFD'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8664C7D-C78E-40AA-9E42-94CDF189DCB6'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CBFFD659-71F2-47F5-B41E-E680E7BCC329'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3263248F-8C5D-427E-97DD-CE246E6C9096'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E97753E7-966A-4FC7-A0E9-F8CA31B648F2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D8664C7D-C78E-40AA-9E42-94CDF189DCB6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CBFFD659-71F2-47F5-B41E-E680E7BCC329'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E97753E7-966A-4FC7-A0E9-F8CA31B648F2'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'D8664C7D-C78E-40AA-9E42-94CDF189DCB6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CBFFD659-71F2-47F5-B41E-E680E7BCC329'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9D25B10-7929-4A19-A194-11DB2AF72F49' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.BindingID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8DBD2922-11EC-4873-AC7E-F0805CDA5C01' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.FormResponseID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA8E088C-65BD-4FA6-870E-4E3AB919C38B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.Binding 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E97753E7-966A-4FC7-A0E9-F8CA31B648F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.TargetEntityID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C0E24EF-7307-45AF-AA8A-CCC1F27A5E3D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.TargetRecordID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8664C7D-C78E-40AA-9E42-94CDF189DCB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.Outcome 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBFFD659-71F2-47F5-B41E-E680E7BCC329' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.WrittenFields 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Context',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'EFAE5ED9-4FAC-4C04-B553-F926D58A6D2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3263248F-8C5D-427E-97DD-CE246E6C9096' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Binding Records.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CFD49358-2AB3-46C6-BC2C-18A62D4FDFB5' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-tasks */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'ED974050-6DA2-40DA-813B-38927002246B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('33cf50aa-6ad5-43b2-a0ab-1dfa7fe5667a', 'ED974050-6DA2-40DA-813B-38927002246B', 'FieldCategoryInfo', '{"Binding Details":{"icon":"fa fa-link","description":"Information regarding the form binding configuration and source response"},"Execution Context":{"icon":"fa fa-play-circle","description":"Details about the specific execution, target records, and results"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7ddc551b-3b10-456d-8949-ac24cdd4ff3c', 'ED974050-6DA2-40DA-813B-38927002246B', 'FieldCategoryIcons', '{"Binding Details":"fa fa-link","Execution Context":"fa fa-play-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'ED974050-6DA2-40DA-813B-38927002246B';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12A1D241-395D-4B2B-8298-03E16D743A6B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28CF168E-F4E7-4D5A-A55E-FAF754F0B992' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '301C6966-9DBC-4724-8F70-D823F2BE8A87' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F1D141C-DCE4-4F85-8391-AA77396A8E38' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.TargetEntityID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Target Entity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ED441C06-7545-4F5F-9F60-E133EDA4B996' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.TargetEntityName 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Target Entity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A3CC693-4427-4DC3-B8C4-891968F1A682' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.FieldMappings 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Logic and Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '6E505C53-E248-402C-80A3-6A6128C437CF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.IdentityRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Logic and Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9ED22796-73B7-44FB-A224-A6584AD16FD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.MergePolicy 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Logic and Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '9520208E-1CCD-49BA-A7DF-340D81755943' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3C877C9-197A-435D-983F-E4CC902ED0E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Binding Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '464EFEDB-F301-4358-9B06-E33D5696B406' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.TargetEntity 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Target Entity Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C67BCE01-F222-44EF-8B1E-DA711B744122' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0D5DB34-57CF-434C-B007-165CAE3C3AD3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Entity Bindings.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E29D7694-BDE2-4E30-9F37-6B7D181B069E' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-plug */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-plug', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b727078c-d233-499e-b7f0-9991be5be075', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'FieldCategoryInfo', '{"Binding Configuration":{"icon":"fa fa-sliders-h","description":"General configuration and identification settings for the form binding"},"Target Entity Details":{"icon":"fa fa-database","description":"Information regarding the destination entity record"},"Logic and Rules":{"icon":"fa fa-code","description":"Technical rules and mappings for data processing and record management"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('cf485a79-165b-4494-9631-6ae11671dba4', 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778', 'FieldCategoryIcons', '{"Binding Configuration":"fa fa-sliders-h","Target Entity Details":"fa fa-database","Logic and Rules":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C7F71A7D-FA84-45E8-BDE3-FE1CCC46A778';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3251AFC-4358-4E5F-8154-22E8AA62E273' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.FormAutomationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Automation',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2AC71EEB-871A-4F09-9B72-1F351AB7A305' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.FormResponseID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Response',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B524BE8-6C81-49ED-9AA5-B6E3C9D54635' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.FormAutomation 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Automation Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C9B4C2CA-7CC0-41C9-A0C9-D97D9584B168' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '49C59E16-6142-4146-913B-E409D3B6A52E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.AttemptCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Status',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C441C916-1D67-4621-9EA9-E0782D0CBDF3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.StartedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DF958A16-1158-446C-8937-502E05416ADB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.CompletedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F6E63BE-35C1-40F1-B995-2DC52179BF37' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.ActionExecutionLogID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6DA010C3-B2E7-4634-88EB-33469F97F463' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.ActionExecutionLog 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87D582A3-D8E4-4905-A4E1-CE89CDDE2F4D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.AIAgentRunID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D5A556E-DA8B-497F-BE0B-E79AD04B1456' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.AIAgentRun 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4186F0EB-18B2-4A59-BC94-86F87B063734' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.ErrorMessage 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC070FCE-BE4A-475C-82C9-604B8E2033BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.OutputSummary 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '78B90006-03E0-40F7-BBFA-0D6065A710A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '06EF5452-05CB-4754-A6E5-191A0B9229E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automation Runs.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE11FCA7-37AE-4357-96EA-B427AE97C4EB' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-tasks */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'DC399B21-517E-4E71-9571-037AB9E2641E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('139dcfef-7507-44a5-a84e-d9202651b7c7', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'FieldCategoryInfo', '{"Automation Context":{"icon":"fa fa-cogs","description":"Links and identifiers relating the run to the automation and form response."},"Execution Status":{"icon":"fa fa-check-circle","description":"Information regarding the current state and retry history of the run."},"Execution Timeline":{"icon":"fa fa-clock","description":"Timestamps tracking the lifecycle of the automation attempt."},"Execution Details":{"icon":"fa fa-info-circle","description":"Logs, AI agent references, and result summaries for the execution."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ecb8ff03-e978-4a82-b721-1eadf8c7f64c', 'DC399B21-517E-4E71-9571-037AB9E2641E', 'FieldCategoryIcons', '{"Automation Context":"fa fa-cogs","Execution Status":"fa fa-check-circle","Execution Timeline":"fa fa-clock","Execution Details":"fa fa-info-circle","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'DC399B21-517E-4E71-9571-037AB9E2641E';

/* Set categories for 22 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEBB828B-EF0D-485C-89E5-1568EFE4DE52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.FormID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AEDF24A-8CB6-43BE-8F4E-77AD166118E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D49B5EF-0752-47A9-9EDA-1D46B2E4860A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7F6DFBC-D242-4288-8251-74D7FE1E1BB0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.TargetType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68929541-8A1C-4B91-B179-06517447C2B9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ActionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6DCCA02-37B8-4B58-83CF-BE56C880DBFA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.AgentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '047BB79D-9AB2-47D3-B7A7-CB0BC3FBB856' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.BindingID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   DisplayName = 'Binding',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '299D07C0-8A27-4134-9317-A8050E57B0F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Trigger 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1546A699-24AF-45BA-8601-9226AEA943A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ExecutionMode 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FAE87806-34B8-4D3D-A283-997E2A42FFFD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.DisplayOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '57C81864-5ABA-48A4-8A07-A9131C548DED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ConditionalRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'C0FC8E25-E3C1-4CF8-944B-CA7B54667CC6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ParameterMapping 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Logic',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FDCDC7BC-CBDA-4573-9DD6-C9A5A3B6EE78' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.ContinueOnError 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F70EDDB9-D06D-4094-9007-43B771B531F1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.TimeoutMS 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Execution Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Timeout (ms)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA7BDC83-A9E0-4372-882F-A3F349A78F3C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'General Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00E2D1EE-D335-482E-9F08-0CFB82ED6506' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46DE2666-3D81-4F32-AC46-D176B3A1C5F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33EE0833-E6A0-4585-8FC3-471886315C00' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Form 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6EA5A667-3D04-475D-BB15-87EAD76BCB5C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Action 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Action Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CE3226E-0AA3-41CE-B8D4-1574DAF9D995' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Agent 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80FFA65A-161E-4418-9A44-5DA1D2152C51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Forms: Form Automations.Binding 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Automation Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Binding Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EB0E2FDE-FD7C-4DB0-A401-91EDAB05F87C' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-bolt */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-bolt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('50c3bfc0-aa11-4c07-905a-252e3a5f025f', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Basic identification and status settings for the automation"},"Automation Logic":{"icon":"fa fa-cogs","description":"Core configuration for targets, conditions, and parameter mappings"},"Execution Settings":{"icon":"fa fa-clock","description":"Configuration for trigger conditions, ordering, and error handling"},"Automation Context":{"icon":"fa fa-database","description":"Contextual references and labels for the parent form and targets"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3e4a5a1b-b25a-4cee-887a-c55b65ec6a2d', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Automation Logic":"fa fa-cogs","Execution Settings":"fa fa-clock","Automation Context":"fa fa-database","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A';

/* Generated Validation Functions for MJ_BizApps_Forms: Form Automations */
-- CHECK constraint for MJ_BizApps_Forms: Form Automations @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TargetType]=''Action'' AND [ActionID] IS NOT NULL AND [AgentID] IS NULL AND [BindingID] IS NULL OR [TargetType]=''Agent'' AND [AgentID] IS NOT NULL AND [ActionID] IS NULL AND [BindingID] IS NULL OR [TargetType]=''EntityBinding'' AND [BindingID] IS NOT NULL AND [ActionID] IS NULL AND [AgentID] IS NULL)', 'public ValidateTargetTypeRelationships(result: ValidationResult) {
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
            errorMessage = "When TargetType is ''Action'', ActionID must be specified, and both AgentID and BindingID must be null.";
        }
    } else if (targetType === "Agent") {
        if (agentId != null && actionId == null && bindingId == null) {
            isValid = true;
        } else {
            errorMessage = "When TargetType is ''Agent'', AgentID must be specified, and both ActionID and BindingID must be null.";
        }
    } else if (targetType === "EntityBinding") {
        if (bindingId != null && actionId == null && agentId == null) {
            isValid = true;
        } else {
            errorMessage = "When TargetType is ''EntityBinding'', BindingID must be specified, and both ActionID and AgentID must be null.";
        }
    } else {
        errorMessage = "TargetType must be ''Action'', ''Agent'', or ''EntityBinding''.";
    }

    if (!isValid) {
        result.Errors.push(new ValidationErrorInfo(
            "TargetType",
            errorMessage,
            targetType,
            ValidationErrorType.Failure
        ));
    }
}', 'Ensures that based on the selected TargetType, only the corresponding ID field (ActionID, AgentID, or BindingID) is populated, while the other two ID fields must remain empty.', 'ValidateTargetTypeRelationships', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B91DEFE0-A2C5-4462-BBC3-D3BFD01D631A');

