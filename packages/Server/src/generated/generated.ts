/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { mjBizAppsFormsFormAutomationRunEntity, mjBizAppsFormsFormAutomationEntity, mjBizAppsFormsFormCategoryEntity, mjBizAppsFormsFormDistributionEntity, mjBizAppsFormsFormEntityBindingRecordEntity, mjBizAppsFormsFormEntityBindingEntity, mjBizAppsFormsFormPageEntity, mjBizAppsFormsFormQuestionOptionEntity, mjBizAppsFormsFormQuestionEntity, mjBizAppsFormsFormResponseAnswerEntity, mjBizAppsFormsFormResponseEntity, mjBizAppsFormsFormScreenEntity, mjBizAppsFormsFormStyleEntity, mjBizAppsFormsFormUploadEntity, mjBizAppsFormsFormVersionEntity, mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Automation Runs
//****************************************************************************
@ObjectType({ description: `One execution attempt of an automation against one response, linking out to the MJ action or agent log that holds the detail` })
export class mjBizAppsFormsFormAutomationRun_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormAutomationID: string;
        
    @Field() 
    @MaxLength(36)
    FormResponseID: string;
        
    @Field({description: `Outcome of this attempt. Skipped means a condition did not hold, which the MJ logs cannot record`}) 
    @MaxLength(20)
    Status: string;
        
    @Field(() => Int, {description: `How many times this automation has been attempted for this response; the recovery sweep stops re-driving at the configured cap`}) 
    AttemptCount: number;
        
    @Field({nullable: true, description: `When this attempt began`}) 
    StartedAt?: Date;
        
    @Field({nullable: true, description: `When this attempt finished, successfully or not`}) 
    CompletedAt?: Date;
        
    @Field({nullable: true, description: `The MJ action execution log for this attempt, when an Action ran`}) 
    @MaxLength(36)
    ActionExecutionLogID?: string;
        
    @Field({nullable: true, description: `The MJ agent run for this attempt, when an Agent ran`}) 
    @MaxLength(36)
    AIAgentRunID?: string;
        
    @Field({nullable: true, description: `Why this attempt failed`}) 
    ErrorMessage?: string;
        
    @Field({nullable: true, description: `JSON digest of the result, small enough to show in an activity view`}) 
    OutputSummary?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    FormAutomation: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    ActionExecutionLog?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    AIAgentRun?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Automation Runs
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormAutomationRunInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormAutomationID?: string;

    @Field({ nullable: true })
    FormResponseID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    AttemptCount?: number;

    @Field({ nullable: true })
    StartedAt: Date | null;

    @Field({ nullable: true })
    CompletedAt: Date | null;

    @Field({ nullable: true })
    ActionExecutionLogID: string | null;

    @Field({ nullable: true })
    AIAgentRunID: string | null;

    @Field({ nullable: true })
    ErrorMessage: string | null;

    @Field({ nullable: true })
    OutputSummary: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Automation Runs
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormAutomationRunInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormAutomationID?: string;

    @Field({ nullable: true })
    FormResponseID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => Int, { nullable: true })
    AttemptCount?: number;

    @Field({ nullable: true })
    StartedAt?: Date | null;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field({ nullable: true })
    ActionExecutionLogID?: string | null;

    @Field({ nullable: true })
    AIAgentRunID?: string | null;

    @Field({ nullable: true })
    ErrorMessage?: string | null;

    @Field({ nullable: true })
    OutputSummary?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Automation Runs
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormAutomationRunViewResult {
    @Field(() => [mjBizAppsFormsFormAutomationRun_])
    Results: mjBizAppsFormsFormAutomationRun_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormAutomationRun_)
export class mjBizAppsFormsFormAutomationRunResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormAutomationRunViewResult)
    async RunmjBizAppsFormsFormAutomationRunViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormAutomationRunViewResult)
    async RunmjBizAppsFormsFormAutomationRunViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormAutomationRunViewResult)
    async RunmjBizAppsFormsFormAutomationRunDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Automation Runs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormAutomationRun_, { nullable: true })
    async mjBizAppsFormsFormAutomationRun(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormAutomationRun_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automation Runs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomationRuns')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automation Runs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automation Runs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormAutomationRun_)
    async CreatemjBizAppsFormsFormAutomationRun(
        @Arg('input', () => CreatemjBizAppsFormsFormAutomationRunInput) input: CreatemjBizAppsFormsFormAutomationRunInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Automation Runs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormAutomationRun_)
    async UpdatemjBizAppsFormsFormAutomationRun(
        @Arg('input', () => UpdatemjBizAppsFormsFormAutomationRunInput) input: UpdatemjBizAppsFormsFormAutomationRunInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Automation Runs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormAutomationRun_)
    async DeletemjBizAppsFormsFormAutomationRun(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Automation Runs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Automations
//****************************************************************************
@ObjectType({ description: `One configured on-submit automation for a form: an Action, an Agent or an entity binding, with its trigger, ordering, condition and execution mode` })
export class mjBizAppsFormsFormAutomation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({description: `Author-facing label, e.g. "Email confirmation"`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `What this automation is for`}) 
    Description?: string;
        
    @Field({description: `Which kind of target runs: Action, Agent or EntityBinding`}) 
    @MaxLength(20)
    TargetType: string;
        
    @Field({nullable: true, description: `The MJ Action to run; set only when TargetType is Action`}) 
    @MaxLength(36)
    ActionID?: string;
        
    @Field({nullable: true, description: `The MJ AI Agent to run; set only when TargetType is Agent`}) 
    @MaxLength(36)
    AgentID?: string;
        
    @Field({nullable: true, description: `The entity binding to execute; set only when TargetType is EntityBinding`}) 
    @MaxLength(36)
    BindingID?: string;
        
    @Field({description: `Which save fires this automation: a completed submission, a partial autosave, or both`}) 
    @MaxLength(30)
    Trigger: string;
        
    @Field({description: `Sync automations are awaited before the respondent sees a confirmation; Async are dispatched without waiting`}) 
    @MaxLength(10)
    ExecutionMode: string;
        
    @Field(() => Int, {description: `Run order within an execution mode; Sync automations always run before Async ones regardless`}) 
    DisplayOrder: number;
        
    @Field({nullable: true, description: `JSON condition over the response answers; when it does not hold the automation is recorded as skipped rather than run. Null means always run`}) 
    ConditionalRule?: string;
        
    @Field({nullable: true, description: `JSON describing how the target's inputs are built from response context, static values and specific answers. Null means the standard response context ids`}) 
    ParameterMapping?: string;
        
    @Field(() => Boolean, {description: `When false, a failure halts the remaining Sync automations for that response`}) 
    ContinueOnError: boolean;
        
    @Field(() => Int, {nullable: true, description: `Optional per-automation execution cap in milliseconds`}) 
    TimeoutMS?: number;
        
    @Field(() => Boolean, {description: `Whether this automation is eligible to run`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    Action?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Agent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Binding?: string;
        
    @Field(() => [mjBizAppsFormsFormAutomationRun_])
    mjBizAppsFormsFormAutomationRuns_FormAutomationIDArray: mjBizAppsFormsFormAutomationRun_[]; // Link to mjBizAppsFormsFormAutomationRuns
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Automations
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormAutomationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TargetType?: string;

    @Field({ nullable: true })
    ActionID: string | null;

    @Field({ nullable: true })
    AgentID: string | null;

    @Field({ nullable: true })
    BindingID: string | null;

    @Field({ nullable: true })
    Trigger?: string;

    @Field({ nullable: true })
    ExecutionMode?: string;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule: string | null;

    @Field({ nullable: true })
    ParameterMapping: string | null;

    @Field(() => Boolean, { nullable: true })
    ContinueOnError?: boolean;

    @Field(() => Int, { nullable: true })
    TimeoutMS: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Automations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormAutomationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TargetType?: string;

    @Field({ nullable: true })
    ActionID?: string | null;

    @Field({ nullable: true })
    AgentID?: string | null;

    @Field({ nullable: true })
    BindingID?: string | null;

    @Field({ nullable: true })
    Trigger?: string;

    @Field({ nullable: true })
    ExecutionMode?: string;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule?: string | null;

    @Field({ nullable: true })
    ParameterMapping?: string | null;

    @Field(() => Boolean, { nullable: true })
    ContinueOnError?: boolean;

    @Field(() => Int, { nullable: true })
    TimeoutMS?: number | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Automations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormAutomationViewResult {
    @Field(() => [mjBizAppsFormsFormAutomation_])
    Results: mjBizAppsFormsFormAutomation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormAutomation_)
export class mjBizAppsFormsFormAutomationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormAutomationViewResult)
    async RunmjBizAppsFormsFormAutomationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormAutomationViewResult)
    async RunmjBizAppsFormsFormAutomationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormAutomationViewResult)
    async RunmjBizAppsFormsFormAutomationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Automations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormAutomation_, { nullable: true })
    async mjBizAppsFormsFormAutomation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormAutomation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormAutomationRun_])
    async mjBizAppsFormsFormAutomationRuns_FormAutomationIDArray(@Root() mjbizappsformsformautomation_: mjBizAppsFormsFormAutomation_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automation Runs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomationRuns')} WHERE ${provider.QuoteIdentifier('FormAutomationID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automation Runs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformautomation_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automation Runs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormAutomation_)
    async CreatemjBizAppsFormsFormAutomation(
        @Arg('input', () => CreatemjBizAppsFormsFormAutomationInput) input: CreatemjBizAppsFormsFormAutomationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Automations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormAutomation_)
    async UpdatemjBizAppsFormsFormAutomation(
        @Arg('input', () => UpdatemjBizAppsFormsFormAutomationInput) input: UpdatemjBizAppsFormsFormAutomationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Automations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormAutomation_)
    async DeletemjBizAppsFormsFormAutomation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Automations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Categories
//****************************************************************************
@ObjectType({ description: `Hierarchical categories that organize forms into a browsable tree` })
export class mjBizAppsFormsFormCategory_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the category`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this category`}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field(() => Int, {description: `Sort order among siblings. Lower values appear first`}) 
    DisplayRank: number;
        
    @Field(() => Boolean, {description: `Whether this category is available for selection. Inactive categories are hidden but preserved`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsFormsForm_])
    mjBizAppsFormsForms_CategoryIDArray: mjBizAppsFormsForm_[]; // Link to mjBizAppsFormsForms
    
    @Field(() => [mjBizAppsFormsFormCategory_])
    mjBizAppsFormsFormCategories_ParentIDArray: mjBizAppsFormsFormCategory_[]; // Link to mjBizAppsFormsFormCategories
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Categories
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field(() => Int, { nullable: true })
    DisplayRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Categories
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Categories
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormCategoryViewResult {
    @Field(() => [mjBizAppsFormsFormCategory_])
    Results: mjBizAppsFormsFormCategory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormCategory_)
export class mjBizAppsFormsFormCategoryResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormCategoryViewResult)
    async RunmjBizAppsFormsFormCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormCategoryViewResult)
    async RunmjBizAppsFormsFormCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormCategoryViewResult)
    async RunmjBizAppsFormsFormCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormCategory_, { nullable: true })
    async mjBizAppsFormsFormCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormCategory_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormCategories')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsForm_])
    async mjBizAppsFormsForms_CategoryIDArray(@Root() mjbizappsformsformcategory_: mjBizAppsFormsFormCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwForms')} WHERE ${provider.QuoteIdentifier('CategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Forms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormCategory_])
    async mjBizAppsFormsFormCategories_ParentIDArray(@Root() mjbizappsformsformcategory_: mjBizAppsFormsFormCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormCategories')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormCategory_)
    async CreatemjBizAppsFormsFormCategory(
        @Arg('input', () => CreatemjBizAppsFormsFormCategoryInput) input: CreatemjBizAppsFormsFormCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormCategory_)
    async UpdatemjBizAppsFormsFormCategory(
        @Arg('input', () => UpdatemjBizAppsFormsFormCategoryInput) input: UpdatemjBizAppsFormsFormCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormCategory_)
    async DeletemjBizAppsFormsFormCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Distributions
//****************************************************************************
@ObjectType({ description: `A published channel for a form (public link, embed, QR, or email); wraps an anonymous, multi-use, scoped magic link` })
export class mjBizAppsFormsFormDistribution_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({description: `Internal name for this distribution`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `URL-friendly slug used in the public link (unique when set)`}) 
    @MaxLength(255)
    Slug?: string;
        
    @Field({description: `Channel type: PublicLink, Embed, QR, or Email`}) 
    @MaxLength(20)
    ChannelType: string;
        
    @Field({description: `Distribution status: Draft, Active, or Closed`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `When this distribution opens for responses (null = immediately)`}) 
    OpenAt?: Date;
        
    @Field({nullable: true, description: `When this distribution stops accepting responses (null = no end)`}) 
    CloseAt?: Date;
        
    @Field(() => Int, {nullable: true, description: `Maximum number of responses allowed through this distribution (null = unlimited)`}) 
    MaxResponses?: number;
        
    @Field(() => Int, {description: `Running count of responses received through this distribution`}) 
    ResponseCount: number;
        
    @Field({nullable: true, description: `ID of the anonymous, multi-use, scoped MJ magic-link invite backing this distribution`}) 
    @MaxLength(36)
    MagicLinkInviteID?: string;
        
    @Field(() => Boolean, {description: `Whether a CAPTCHA (Cloudflare Turnstile) challenge is required for submissions via this distribution`}) 
    CaptchaRequired: boolean;
        
    @Field(() => Boolean, {description: `Whether this distribution is active and usable`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Raw redeemable magic-link token for this distribution's public URL. A public link is low-secrecy by design (the URL is shared), so the raw token is persisted here to build the redeem URL (/magic-link/redeem?token=<token>); the invite row stores only its SHA-256 hash. Written once after a successful mint and left unchanged thereafter; NULL until the anonymous link is provisioned.`}) 
    @MaxLength(255)
    PublicLinkToken?: string;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field(() => [mjBizAppsFormsFormUpload_])
    mjBizAppsFormsFormUploads_DistributionIDArray: mjBizAppsFormsFormUpload_[]; // Link to mjBizAppsFormsFormUploads
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Distributions
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormDistributionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Slug: string | null;

    @Field({ nullable: true })
    ChannelType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OpenAt: Date | null;

    @Field({ nullable: true })
    CloseAt: Date | null;

    @Field(() => Int, { nullable: true })
    MaxResponses: number | null;

    @Field(() => Int, { nullable: true })
    ResponseCount?: number;

    @Field({ nullable: true })
    MagicLinkInviteID: string | null;

    @Field(() => Boolean, { nullable: true })
    CaptchaRequired?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PublicLinkToken: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Distributions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormDistributionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Slug?: string | null;

    @Field({ nullable: true })
    ChannelType?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OpenAt?: Date | null;

    @Field({ nullable: true })
    CloseAt?: Date | null;

    @Field(() => Int, { nullable: true })
    MaxResponses?: number | null;

    @Field(() => Int, { nullable: true })
    ResponseCount?: number;

    @Field({ nullable: true })
    MagicLinkInviteID?: string | null;

    @Field(() => Boolean, { nullable: true })
    CaptchaRequired?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    PublicLinkToken?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Distributions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormDistributionViewResult {
    @Field(() => [mjBizAppsFormsFormDistribution_])
    Results: mjBizAppsFormsFormDistribution_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormDistribution_)
export class mjBizAppsFormsFormDistributionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormDistributionViewResult)
    async RunmjBizAppsFormsFormDistributionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormDistributionViewResult)
    async RunmjBizAppsFormsFormDistributionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormDistributionViewResult)
    async RunmjBizAppsFormsFormDistributionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Distributions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormDistribution_, { nullable: true })
    async mjBizAppsFormsFormDistribution(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormDistribution_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Distributions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormDistributions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Distributions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Distributions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormUpload_])
    async mjBizAppsFormsFormUploads_DistributionIDArray(@Root() mjbizappsformsformdistribution_: mjBizAppsFormsFormDistribution_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Uploads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormUploads')} WHERE ${provider.QuoteIdentifier('DistributionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Uploads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformdistribution_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Uploads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormDistribution_)
    async CreatemjBizAppsFormsFormDistribution(
        @Arg('input', () => CreatemjBizAppsFormsFormDistributionInput) input: CreatemjBizAppsFormsFormDistributionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Distributions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormDistribution_)
    async UpdatemjBizAppsFormsFormDistribution(
        @Arg('input', () => UpdatemjBizAppsFormsFormDistributionInput) input: UpdatemjBizAppsFormsFormDistributionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Distributions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormDistribution_)
    async DeletemjBizAppsFormsFormDistribution(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Distributions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Entity Binding Records
//****************************************************************************
@ObjectType({ description: `Durable record of which target record a submission produced, making re-execution idempotent and the lineage queryable` })
export class mjBizAppsFormsFormEntityBindingRecord_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    BindingID: string;
        
    @Field() 
    @MaxLength(36)
    FormResponseID: string;
        
    @Field({description: `Entity the record belongs to, captured at execution time`}) 
    @MaxLength(36)
    TargetEntityID: string;
        
    @Field({nullable: true, description: `Primary key of the record written, pipe-joined for a composite key. Null when the binding was skipped`}) 
    @MaxLength(750)
    TargetRecordID?: string;
        
    @Field({description: `What the binding did: created a record, merged into an existing one, changed nothing, or skipped`}) 
    @MaxLength(20)
    Outcome: string;
        
    @Field({nullable: true, description: `JSON list of the field names actually written by this execution`}) 
    WrittenFields?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Binding: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Entity Binding Records
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormEntityBindingRecordInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BindingID?: string;

    @Field({ nullable: true })
    FormResponseID?: string;

    @Field({ nullable: true })
    TargetEntityID?: string;

    @Field({ nullable: true })
    TargetRecordID: string | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field({ nullable: true })
    WrittenFields: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Entity Binding Records
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormEntityBindingRecordInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BindingID?: string;

    @Field({ nullable: true })
    FormResponseID?: string;

    @Field({ nullable: true })
    TargetEntityID?: string;

    @Field({ nullable: true })
    TargetRecordID?: string | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field({ nullable: true })
    WrittenFields?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Entity Binding Records
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormEntityBindingRecordViewResult {
    @Field(() => [mjBizAppsFormsFormEntityBindingRecord_])
    Results: mjBizAppsFormsFormEntityBindingRecord_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormEntityBindingRecord_)
export class mjBizAppsFormsFormEntityBindingRecordResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormEntityBindingRecordViewResult)
    async RunmjBizAppsFormsFormEntityBindingRecordViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormEntityBindingRecordViewResult)
    async RunmjBizAppsFormsFormEntityBindingRecordViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormEntityBindingRecordViewResult)
    async RunmjBizAppsFormsFormEntityBindingRecordDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Entity Binding Records';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormEntityBindingRecord_, { nullable: true })
    async mjBizAppsFormsFormEntityBindingRecord(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormEntityBindingRecord_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Entity Binding Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormEntityBindingRecords')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Entity Binding Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Entity Binding Records', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormEntityBindingRecord_)
    async CreatemjBizAppsFormsFormEntityBindingRecord(
        @Arg('input', () => CreatemjBizAppsFormsFormEntityBindingRecordInput) input: CreatemjBizAppsFormsFormEntityBindingRecordInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Entity Binding Records', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormEntityBindingRecord_)
    async UpdatemjBizAppsFormsFormEntityBindingRecord(
        @Arg('input', () => UpdatemjBizAppsFormsFormEntityBindingRecordInput) input: UpdatemjBizAppsFormsFormEntityBindingRecordInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Entity Binding Records', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormEntityBindingRecord_)
    async DeletemjBizAppsFormsFormEntityBindingRecord(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Entity Binding Records', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Entity Bindings
//****************************************************************************
@ObjectType({ description: `Declares that submissions to a form create or update a record of a target entity, via a field mapping, an identity rule and a merge policy` })
export class mjBizAppsFormsFormEntityBinding_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({description: `Author-facing label for this binding, e.g. "Create CRM Lead"`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `What this binding is for`}) 
    Description?: string;
        
    @Field({description: `Entity whose records this binding writes`}) 
    @MaxLength(36)
    TargetEntityID: string;
        
    @Field({description: `Name of the target entity, stored alongside the ID because a runtime-created entity has a different ID in each environment and the name is the only portable handle`}) 
    @MaxLength(500)
    TargetEntityName: string;
        
    @Field({description: `JSON mapping of question GUIDs to target entity fields, with optional per-field transforms and conditions`}) 
    FieldMappings: string;
        
    @Field({description: `JSON rule deciding whether a submission updates an existing record or creates one: match fields, tenant scope, and what to do on no match or several`}) 
    IdentityRule: string;
        
    @Field({nullable: true, description: `JSON per-field merge policy (neverBlank, latestWins, writeOnce). Null means neverBlank throughout`}) 
    MergePolicy?: string;
        
    @Field({description: `Whether this binding is eligible to run`}) 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field() 
    @MaxLength(255)
    TargetEntity: string;
        
    @Field(() => [mjBizAppsFormsFormAutomation_])
    mjBizAppsFormsFormAutomations_BindingIDArray: mjBizAppsFormsFormAutomation_[]; // Link to mjBizAppsFormsFormAutomations
    
    @Field(() => [mjBizAppsFormsFormEntityBindingRecord_])
    mjBizAppsFormsFormEntityBindingRecords_BindingIDArray: mjBizAppsFormsFormEntityBindingRecord_[]; // Link to mjBizAppsFormsFormEntityBindingRecords
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Entity Bindings
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormEntityBindingInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TargetEntityID?: string;

    @Field({ nullable: true })
    TargetEntityName?: string;

    @Field({ nullable: true })
    FieldMappings?: string;

    @Field({ nullable: true })
    IdentityRule?: string;

    @Field({ nullable: true })
    MergePolicy: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Entity Bindings
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormEntityBindingInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TargetEntityID?: string;

    @Field({ nullable: true })
    TargetEntityName?: string;

    @Field({ nullable: true })
    FieldMappings?: string;

    @Field({ nullable: true })
    IdentityRule?: string;

    @Field({ nullable: true })
    MergePolicy?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Entity Bindings
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormEntityBindingViewResult {
    @Field(() => [mjBizAppsFormsFormEntityBinding_])
    Results: mjBizAppsFormsFormEntityBinding_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormEntityBinding_)
export class mjBizAppsFormsFormEntityBindingResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormEntityBindingViewResult)
    async RunmjBizAppsFormsFormEntityBindingViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormEntityBindingViewResult)
    async RunmjBizAppsFormsFormEntityBindingViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormEntityBindingViewResult)
    async RunmjBizAppsFormsFormEntityBindingDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Entity Bindings';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormEntityBinding_, { nullable: true })
    async mjBizAppsFormsFormEntityBinding(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormEntityBinding_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Entity Bindings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormEntityBindings')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Entity Bindings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Entity Bindings', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormAutomation_])
    async mjBizAppsFormsFormAutomations_BindingIDArray(@Root() mjbizappsformsformentitybinding_: mjBizAppsFormsFormEntityBinding_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomations')} WHERE ${provider.QuoteIdentifier('BindingID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformentitybinding_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormEntityBindingRecord_])
    async mjBizAppsFormsFormEntityBindingRecords_BindingIDArray(@Root() mjbizappsformsformentitybinding_: mjBizAppsFormsFormEntityBinding_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Entity Binding Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormEntityBindingRecords')} WHERE ${provider.QuoteIdentifier('BindingID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Entity Binding Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformentitybinding_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Entity Binding Records', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormEntityBinding_)
    async CreatemjBizAppsFormsFormEntityBinding(
        @Arg('input', () => CreatemjBizAppsFormsFormEntityBindingInput) input: CreatemjBizAppsFormsFormEntityBindingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Entity Bindings', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormEntityBinding_)
    async UpdatemjBizAppsFormsFormEntityBinding(
        @Arg('input', () => UpdatemjBizAppsFormsFormEntityBindingInput) input: UpdatemjBizAppsFormsFormEntityBindingInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Entity Bindings', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormEntityBinding_)
    async DeletemjBizAppsFormsFormEntityBinding(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Entity Bindings', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Pages
//****************************************************************************
@ObjectType({ description: `An ordered page/section of a form` })
export class mjBizAppsFormsFormPage_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({nullable: true, description: `Page title shown to respondents`}) 
    @MaxLength(255)
    Title?: string;
        
    @Field({nullable: true, description: `Page description / intro text`}) 
    Description?: string;
        
    @Field(() => Int, {description: `Sort order of the page within the form. Lower values appear first`}) 
    DisplayOrder: number;
        
    @Field({nullable: true, description: `JSON show/hide (and skip-to) rule evaluated against prior answers (see plan §6)`}) 
    ConditionalRule?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => Boolean, {description: `When set, advancing past this page banks a Partial response immediately instead of waiting for the autosave debounce`}) 
    IsPartialSubmitPoint: boolean;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field(() => [mjBizAppsFormsFormQuestion_])
    mjBizAppsFormsFormQuestions_PageIDArray: mjBizAppsFormsFormQuestion_[]; // Link to mjBizAppsFormsFormQuestions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Pages
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormPageInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPartialSubmitPoint?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Pages
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormPageInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPartialSubmitPoint?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Pages
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormPageViewResult {
    @Field(() => [mjBizAppsFormsFormPage_])
    Results: mjBizAppsFormsFormPage_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormPage_)
export class mjBizAppsFormsFormPageResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormPageViewResult)
    async RunmjBizAppsFormsFormPageViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormPageViewResult)
    async RunmjBizAppsFormsFormPageViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormPageViewResult)
    async RunmjBizAppsFormsFormPageDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Pages';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormPage_, { nullable: true })
    async mjBizAppsFormsFormPage(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormPage_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Pages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormPages')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Pages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Pages', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormQuestion_])
    async mjBizAppsFormsFormQuestions_PageIDArray(@Root() mjbizappsformsformpage_: mjBizAppsFormsFormPage_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Questions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestions')} WHERE ${provider.QuoteIdentifier('PageID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Questions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformpage_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Questions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormPage_)
    async CreatemjBizAppsFormsFormPage(
        @Arg('input', () => CreatemjBizAppsFormsFormPageInput) input: CreatemjBizAppsFormsFormPageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Pages', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormPage_)
    async UpdatemjBizAppsFormsFormPage(
        @Arg('input', () => UpdatemjBizAppsFormsFormPageInput) input: UpdatemjBizAppsFormsFormPageInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Pages', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormPage_)
    async DeletemjBizAppsFormsFormPage(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Pages', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Question Options
//****************************************************************************
@ObjectType({ description: `A selectable choice offered by a choice-style question` })
export class mjBizAppsFormsFormQuestionOption_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    QuestionID: string;
        
    @Field({description: `Label shown to the respondent for this option`}) 
    @MaxLength(500)
    Label: string;
        
    @Field({nullable: true, description: `Stored value for this option (defaults to Label when omitted)`}) 
    @MaxLength(500)
    Value?: string;
        
    @Field(() => Int, {description: `Sort order of the option within its question. Lower values appear first`}) 
    DisplayOrder: number;
        
    @Field(() => Boolean, {description: `Whether this option is selected by default`}) 
    IsDefault: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `PictureChoice only: image shown above the option label. Ignored by every other question type`}) 
    @MaxLength(1000)
    ImageURL?: string;
        
    @Field({nullable: true, description: `Matrix only: whether this option is a Row or a Column of the grid. NULL for every other question type, and read as Row if left NULL on a Matrix`}) 
    @MaxLength(20)
    MatrixAxis?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Question Options
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormQuestionOptionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    QuestionID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Value: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    ImageURL: string | null;

    @Field({ nullable: true })
    MatrixAxis: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Question Options
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormQuestionOptionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    QuestionID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Value?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    ImageURL?: string | null;

    @Field({ nullable: true })
    MatrixAxis?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Question Options
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormQuestionOptionViewResult {
    @Field(() => [mjBizAppsFormsFormQuestionOption_])
    Results: mjBizAppsFormsFormQuestionOption_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormQuestionOption_)
export class mjBizAppsFormsFormQuestionOptionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormQuestionOptionViewResult)
    async RunmjBizAppsFormsFormQuestionOptionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormQuestionOptionViewResult)
    async RunmjBizAppsFormsFormQuestionOptionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormQuestionOptionViewResult)
    async RunmjBizAppsFormsFormQuestionOptionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Question Options';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormQuestionOption_, { nullable: true })
    async mjBizAppsFormsFormQuestionOption(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormQuestionOption_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Question Options', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestionOptions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Question Options', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Question Options', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormQuestionOption_)
    async CreatemjBizAppsFormsFormQuestionOption(
        @Arg('input', () => CreatemjBizAppsFormsFormQuestionOptionInput) input: CreatemjBizAppsFormsFormQuestionOptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Question Options', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormQuestionOption_)
    async UpdatemjBizAppsFormsFormQuestionOption(
        @Arg('input', () => UpdatemjBizAppsFormsFormQuestionOptionInput) input: UpdatemjBizAppsFormsFormQuestionOptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Question Options', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormQuestionOption_)
    async DeletemjBizAppsFormsFormQuestionOption(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Question Options', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Questions
//****************************************************************************
@ObjectType({ description: `A single question/field within a form page` })
export class mjBizAppsFormsFormQuestion_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PageID?: string;
        
    @Field({description: `Question input type (ShortText, Email, SingleChoice, Rating, NPS, FileUpload, Statement, etc.)`}) 
    @MaxLength(50)
    QuestionType: string;
        
    @Field({description: `The question text shown to the respondent`}) 
    Prompt: string;
        
    @Field({nullable: true, description: `Optional helper/assistive text shown beneath the prompt`}) 
    HelpText?: string;
        
    @Field(() => Boolean, {description: `Whether an answer is required before the form can be submitted`}) 
    IsRequired: boolean;
        
    @Field(() => Int, {description: `Sort order of the question within its page. Lower values appear first`}) 
    DisplayOrder: number;
        
    @Field({nullable: true, description: `JSON validation rule (min/max, regex, length, etc.) applied client- and server-side`}) 
    ValidationRule?: string;
        
    @Field({nullable: true, description: `JSON show/hide rule evaluated against prior answers (see plan §6)`}) 
    ConditionalRule?: string;
        
    @Field({nullable: true, description: `JSON scoring configuration (e.g. LLM-judge prompt or numeric weights); null when unscored`}) 
    ScoringConfig?: string;
        
    @Field({nullable: true, description: `JSON per-type settings (e.g. rating scale, NPS labels, file constraints)`}) 
    Settings?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Page?: string;
        
    @Field(() => [mjBizAppsFormsFormQuestionOption_])
    mjBizAppsFormsFormQuestionOptions_QuestionIDArray: mjBizAppsFormsFormQuestionOption_[]; // Link to mjBizAppsFormsFormQuestionOptions
    
    @Field(() => [mjBizAppsFormsFormResponseAnswer_])
    mjBizAppsFormsFormResponseAnswers_QuestionIDArray: mjBizAppsFormsFormResponseAnswer_[]; // Link to mjBizAppsFormsFormResponseAnswers
    
    @Field(() => [mjBizAppsFormsFormUpload_])
    mjBizAppsFormsFormUploads_QuestionIDArray: mjBizAppsFormsFormUpload_[]; // Link to mjBizAppsFormsFormUploads
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Questions
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormQuestionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    PageID: string | null;

    @Field({ nullable: true })
    QuestionType?: string;

    @Field({ nullable: true })
    Prompt?: string;

    @Field({ nullable: true })
    HelpText: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ValidationRule: string | null;

    @Field({ nullable: true })
    ConditionalRule: string | null;

    @Field({ nullable: true })
    ScoringConfig: string | null;

    @Field({ nullable: true })
    Settings: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Questions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormQuestionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    PageID?: string | null;

    @Field({ nullable: true })
    QuestionType?: string;

    @Field({ nullable: true })
    Prompt?: string;

    @Field({ nullable: true })
    HelpText?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsRequired?: boolean;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ValidationRule?: string | null;

    @Field({ nullable: true })
    ConditionalRule?: string | null;

    @Field({ nullable: true })
    ScoringConfig?: string | null;

    @Field({ nullable: true })
    Settings?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Questions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormQuestionViewResult {
    @Field(() => [mjBizAppsFormsFormQuestion_])
    Results: mjBizAppsFormsFormQuestion_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormQuestion_)
export class mjBizAppsFormsFormQuestionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormQuestionViewResult)
    async RunmjBizAppsFormsFormQuestionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormQuestionViewResult)
    async RunmjBizAppsFormsFormQuestionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormQuestionViewResult)
    async RunmjBizAppsFormsFormQuestionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Questions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormQuestion_, { nullable: true })
    async mjBizAppsFormsFormQuestion(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormQuestion_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Questions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Questions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Questions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormQuestionOption_])
    async mjBizAppsFormsFormQuestionOptions_QuestionIDArray(@Root() mjbizappsformsformquestion_: mjBizAppsFormsFormQuestion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Question Options', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestionOptions')} WHERE ${provider.QuoteIdentifier('QuestionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Question Options', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformquestion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Question Options', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormResponseAnswer_])
    async mjBizAppsFormsFormResponseAnswers_QuestionIDArray(@Root() mjbizappsformsformquestion_: mjBizAppsFormsFormQuestion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Response Answers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponseAnswers')} WHERE ${provider.QuoteIdentifier('QuestionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Response Answers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformquestion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Response Answers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormUpload_])
    async mjBizAppsFormsFormUploads_QuestionIDArray(@Root() mjbizappsformsformquestion_: mjBizAppsFormsFormQuestion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Uploads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormUploads')} WHERE ${provider.QuoteIdentifier('QuestionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Uploads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformquestion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Uploads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormQuestion_)
    async CreatemjBizAppsFormsFormQuestion(
        @Arg('input', () => CreatemjBizAppsFormsFormQuestionInput) input: CreatemjBizAppsFormsFormQuestionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Questions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormQuestion_)
    async UpdatemjBizAppsFormsFormQuestion(
        @Arg('input', () => UpdatemjBizAppsFormsFormQuestionInput) input: UpdatemjBizAppsFormsFormQuestionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Questions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormQuestion_)
    async DeletemjBizAppsFormsFormQuestion(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Questions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Response Answers
//****************************************************************************
@ObjectType({ description: `One answer to one question. Typed columns for query-ability with a JSON fallback for complex/multi values.` })
export class mjBizAppsFormsFormResponseAnswer_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ResponseID: string;
        
    @Field() 
    @MaxLength(36)
    QuestionID: string;
        
    @Field({nullable: true, description: `Text answer value (short/long text, email, phone, single-choice label, etc.)`}) 
    TextValue?: string;
        
    @Field(() => Float, {nullable: true, description: `Numeric answer value (Number, Rating, NPS)`}) 
    NumericValue?: number;
        
    @Field({nullable: true, description: `Date/time answer value (Date, Time)`}) 
    DateValue?: Date;
        
    @Field(() => Boolean, {nullable: true, description: `Boolean answer value (YesNo)`}) 
    BooleanValue?: boolean;
        
    @Field({nullable: true, description: `JSON answer value for multi-select or complex/structured answers`}) 
    JSONValue?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    FileID?: string;
        
    @Field(() => Float, {nullable: true, description: `Numeric score assigned to this answer (e.g. by an LLM-judge); null when unscored`}) 
    Score?: number;
        
    @Field({nullable: true, description: `Rationale/explanation for the assigned score (LLM-judge output)`}) 
    ScoreRationale?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    File?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Response Answers
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormResponseAnswerInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ResponseID?: string;

    @Field({ nullable: true })
    QuestionID?: string;

    @Field({ nullable: true })
    TextValue: string | null;

    @Field(() => Float, { nullable: true })
    NumericValue: number | null;

    @Field({ nullable: true })
    DateValue: Date | null;

    @Field(() => Boolean, { nullable: true })
    BooleanValue: boolean | null;

    @Field({ nullable: true })
    JSONValue: string | null;

    @Field({ nullable: true })
    FileID: string | null;

    @Field(() => Float, { nullable: true })
    Score: number | null;

    @Field({ nullable: true })
    ScoreRationale: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Response Answers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormResponseAnswerInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ResponseID?: string;

    @Field({ nullable: true })
    QuestionID?: string;

    @Field({ nullable: true })
    TextValue?: string | null;

    @Field(() => Float, { nullable: true })
    NumericValue?: number | null;

    @Field({ nullable: true })
    DateValue?: Date | null;

    @Field(() => Boolean, { nullable: true })
    BooleanValue?: boolean | null;

    @Field({ nullable: true })
    JSONValue?: string | null;

    @Field({ nullable: true })
    FileID?: string | null;

    @Field(() => Float, { nullable: true })
    Score?: number | null;

    @Field({ nullable: true })
    ScoreRationale?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Response Answers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormResponseAnswerViewResult {
    @Field(() => [mjBizAppsFormsFormResponseAnswer_])
    Results: mjBizAppsFormsFormResponseAnswer_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormResponseAnswer_)
export class mjBizAppsFormsFormResponseAnswerResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormResponseAnswerViewResult)
    async RunmjBizAppsFormsFormResponseAnswerViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormResponseAnswerViewResult)
    async RunmjBizAppsFormsFormResponseAnswerViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormResponseAnswerViewResult)
    async RunmjBizAppsFormsFormResponseAnswerDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Response Answers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormResponseAnswer_, { nullable: true })
    async mjBizAppsFormsFormResponseAnswer(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormResponseAnswer_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Response Answers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponseAnswers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Response Answers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Response Answers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormResponseAnswer_)
    async CreatemjBizAppsFormsFormResponseAnswer(
        @Arg('input', () => CreatemjBizAppsFormsFormResponseAnswerInput) input: CreatemjBizAppsFormsFormResponseAnswerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Response Answers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormResponseAnswer_)
    async UpdatemjBizAppsFormsFormResponseAnswer(
        @Arg('input', () => UpdatemjBizAppsFormsFormResponseAnswerInput) input: UpdatemjBizAppsFormsFormResponseAnswerInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Response Answers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormResponseAnswer_)
    async DeletemjBizAppsFormsFormResponseAnswer(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Response Answers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Responses
//****************************************************************************
@ObjectType({ description: `One submission of a form. Anonymous or identified; pins the FormVersion it was filled against. Identified respondents link to a bizapps-common Person via RespondentPersonID.` })
export class mjBizAppsFormsFormResponse_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field() 
    @MaxLength(36)
    FormVersionID: string;
        
    @Field({description: `Completion status: Partial or Complete`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Opaque anonymous session id (mj_sid) correlating this response to one anonymous magic-link session`}) 
    @MaxLength(255)
    AnonymousSessionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RespondentPersonID?: string;
        
    @Field({nullable: true, description: `Timestamp the respondent began the form`}) 
    StartedAt?: Date;
        
    @Field({nullable: true, description: `Timestamp the response was submitted (null while Partial)`}) 
    SubmittedAt?: Date;
        
    @Field({nullable: true, description: `JSON source metadata: hashed IP, user-agent, distribution id, referrer`}) 
    SourceMetadata?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    RespondentPerson?: string;
        
    @Field(() => [mjBizAppsFormsFormResponseAnswer_])
    mjBizAppsFormsFormResponseAnswers_ResponseIDArray: mjBizAppsFormsFormResponseAnswer_[]; // Link to mjBizAppsFormsFormResponseAnswers
    
    @Field(() => [mjBizAppsFormsFormEntityBindingRecord_])
    mjBizAppsFormsFormEntityBindingRecords_FormResponseIDArray: mjBizAppsFormsFormEntityBindingRecord_[]; // Link to mjBizAppsFormsFormEntityBindingRecords
    
    @Field(() => [mjBizAppsFormsFormAutomationRun_])
    mjBizAppsFormsFormAutomationRuns_FormResponseIDArray: mjBizAppsFormsFormAutomationRun_[]; // Link to mjBizAppsFormsFormAutomationRuns
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Responses
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormResponseInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    FormVersionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AnonymousSessionID: string | null;

    @Field({ nullable: true })
    RespondentPersonID: string | null;

    @Field({ nullable: true })
    StartedAt: Date | null;

    @Field({ nullable: true })
    SubmittedAt: Date | null;

    @Field({ nullable: true })
    SourceMetadata: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Responses
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormResponseInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    FormVersionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AnonymousSessionID?: string | null;

    @Field({ nullable: true })
    RespondentPersonID?: string | null;

    @Field({ nullable: true })
    StartedAt?: Date | null;

    @Field({ nullable: true })
    SubmittedAt?: Date | null;

    @Field({ nullable: true })
    SourceMetadata?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Responses
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormResponseViewResult {
    @Field(() => [mjBizAppsFormsFormResponse_])
    Results: mjBizAppsFormsFormResponse_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormResponse_)
export class mjBizAppsFormsFormResponseResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormResponseViewResult)
    async RunmjBizAppsFormsFormResponseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormResponseViewResult)
    async RunmjBizAppsFormsFormResponseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormResponseViewResult)
    async RunmjBizAppsFormsFormResponseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Responses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormResponse_, { nullable: true })
    async mjBizAppsFormsFormResponse(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormResponse_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Responses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponses')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Responses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Responses', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormResponseAnswer_])
    async mjBizAppsFormsFormResponseAnswers_ResponseIDArray(@Root() mjbizappsformsformresponse_: mjBizAppsFormsFormResponse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Response Answers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponseAnswers')} WHERE ${provider.QuoteIdentifier('ResponseID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Response Answers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformresponse_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Response Answers', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormEntityBindingRecord_])
    async mjBizAppsFormsFormEntityBindingRecords_FormResponseIDArray(@Root() mjbizappsformsformresponse_: mjBizAppsFormsFormResponse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Entity Binding Records', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormEntityBindingRecords')} WHERE ${provider.QuoteIdentifier('FormResponseID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Entity Binding Records', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformresponse_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Entity Binding Records', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormAutomationRun_])
    async mjBizAppsFormsFormAutomationRuns_FormResponseIDArray(@Root() mjbizappsformsformresponse_: mjBizAppsFormsFormResponse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automation Runs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomationRuns')} WHERE ${provider.QuoteIdentifier('FormResponseID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automation Runs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformresponse_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automation Runs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormResponse_)
    async CreatemjBizAppsFormsFormResponse(
        @Arg('input', () => CreatemjBizAppsFormsFormResponseInput) input: CreatemjBizAppsFormsFormResponseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Responses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormResponse_)
    async UpdatemjBizAppsFormsFormResponse(
        @Arg('input', () => UpdatemjBizAppsFormsFormResponseInput) input: UpdatemjBizAppsFormsFormResponseInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Responses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormResponse_)
    async DeletemjBizAppsFormsFormResponse(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Responses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Screens
//****************************************************************************
@ObjectType({ description: `Welcome and Ending screens for a form. Distinct from questions: a screen is never answered, produces no FormResponseAnswer row, appears in no aggregation and cannot be referenced by a conditional rule. It brackets the intake rather than sitting inside it` })
export class mjBizAppsFormsFormScreen_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field({description: `Whether this screen is shown before intake begins (Welcome) or after a successful submit (Ending)`}) 
    @MaxLength(20)
    ScreenType: string;
        
    @Field({description: `Headline shown on the screen`}) 
    @MaxLength(500)
    Title: string;
        
    @Field({nullable: true, description: `Body copy shown under the title. Plain text — the widget does not render HTML from this column`}) 
    Body?: string;
        
    @Field({nullable: true, description: `Label for the screens single button. The widget supplies Start / Done when this is blank`}) 
    @MaxLength(100)
    ButtonLabel?: string;
        
    @Field({nullable: true, description: `Optional image shown above the title`}) 
    @MaxLength(1000)
    MediaURL?: string;
        
    @Field({nullable: true, description: `Ending only: send the respondent here instead of showing this screen. Takes precedence over the form-wide redirect in Form.Settings`}) 
    @MaxLength(1000)
    RedirectURL?: string;
        
    @Field(() => Int, {description: `Order among the forms Ending screens. Resolution walks them in this order and takes the first whose ConditionalRule the answers satisfy`}) 
    DisplayOrder: number;
        
    @Field({nullable: true, description: `Ending only: JSON ConditionalRule deciding whether this ending applies to a given response. Unlike a page rule, a blank rule here does NOT mean always — it means this screen is only reachable as the default`}) 
    ConditionalRule?: string;
        
    @Field(() => Boolean, {description: `Ending only: the fallback shown when no conditional ending matched`}) 
    IsDefault: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Ending screens only: JSON array of { platform, url } social links rendered as icons under the ending message. Absent or empty means no social links are shown; there is no separate enabled flag`}) 
    SocialLinks?: string;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Screens
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormScreenInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    ScreenType?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Body: string | null;

    @Field({ nullable: true })
    ButtonLabel: string | null;

    @Field({ nullable: true })
    MediaURL: string | null;

    @Field({ nullable: true })
    RedirectURL: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    SocialLinks: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Screens
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormScreenInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    ScreenType?: string;

    @Field({ nullable: true })
    Title?: string;

    @Field({ nullable: true })
    Body?: string | null;

    @Field({ nullable: true })
    ButtonLabel?: string | null;

    @Field({ nullable: true })
    MediaURL?: string | null;

    @Field({ nullable: true })
    RedirectURL?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayOrder?: number;

    @Field({ nullable: true })
    ConditionalRule?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsDefault?: boolean;

    @Field({ nullable: true })
    SocialLinks?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Screens
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormScreenViewResult {
    @Field(() => [mjBizAppsFormsFormScreen_])
    Results: mjBizAppsFormsFormScreen_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormScreen_)
export class mjBizAppsFormsFormScreenResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormScreenViewResult)
    async RunmjBizAppsFormsFormScreenViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormScreenViewResult)
    async RunmjBizAppsFormsFormScreenViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormScreenViewResult)
    async RunmjBizAppsFormsFormScreenDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Screens';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormScreen_, { nullable: true })
    async mjBizAppsFormsFormScreen(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormScreen_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Screens', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormScreens')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Screens', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Screens', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormScreen_)
    async CreatemjBizAppsFormsFormScreen(
        @Arg('input', () => CreatemjBizAppsFormsFormScreenInput) input: CreatemjBizAppsFormsFormScreenInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Screens', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormScreen_)
    async UpdatemjBizAppsFormsFormScreen(
        @Arg('input', () => UpdatemjBizAppsFormsFormScreenInput) input: UpdatemjBizAppsFormsFormScreenInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Screens', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormScreen_)
    async DeletemjBizAppsFormsFormScreen(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Screens', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Styles
//****************************************************************************
@ObjectType({ description: `Reusable visual themes (design-token overrides + custom CSS) that a Form can adopt` })
export class mjBizAppsFormsFormStyle_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the style/theme`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this style`}) 
    Description?: string;
        
    @Field({nullable: true, description: `JSON object of --mj-* design-token overrides applied to the respondent widget`}) 
    CSSVariables?: string;
        
    @Field({nullable: true, description: `Optional raw CSS appended after the token overrides for advanced theming`}) 
    CustomCSS?: string;
        
    @Field({nullable: true, description: `URL of a logo to display on forms using this style`}) 
    @MaxLength(1000)
    LogoURL?: string;
        
    @Field(() => Int, {description: `Sort order in style pickers. Lower values appear first`}) 
    DisplayRank: number;
        
    @Field(() => Boolean, {description: `Whether this style is available for selection. Inactive styles are hidden but preserved`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsFormsForm_])
    mjBizAppsFormsForms_StyleIDArray: mjBizAppsFormsForm_[]; // Link to mjBizAppsFormsForms
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Styles
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormStyleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CSSVariables: string | null;

    @Field({ nullable: true })
    CustomCSS: string | null;

    @Field({ nullable: true })
    LogoURL: string | null;

    @Field(() => Int, { nullable: true })
    DisplayRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Styles
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormStyleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CSSVariables?: string | null;

    @Field({ nullable: true })
    CustomCSS?: string | null;

    @Field({ nullable: true })
    LogoURL?: string | null;

    @Field(() => Int, { nullable: true })
    DisplayRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Styles
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormStyleViewResult {
    @Field(() => [mjBizAppsFormsFormStyle_])
    Results: mjBizAppsFormsFormStyle_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormStyle_)
export class mjBizAppsFormsFormStyleResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormStyleViewResult)
    async RunmjBizAppsFormsFormStyleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormStyleViewResult)
    async RunmjBizAppsFormsFormStyleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormStyleViewResult)
    async RunmjBizAppsFormsFormStyleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Styles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormStyle_, { nullable: true })
    async mjBizAppsFormsFormStyle(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormStyle_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Styles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormStyles')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Styles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Styles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsForm_])
    async mjBizAppsFormsForms_StyleIDArray(@Root() mjbizappsformsformstyle_: mjBizAppsFormsFormStyle_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwForms')} WHERE ${provider.QuoteIdentifier('StyleID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformstyle_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Forms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormStyle_)
    async CreatemjBizAppsFormsFormStyle(
        @Arg('input', () => CreatemjBizAppsFormsFormStyleInput) input: CreatemjBizAppsFormsFormStyleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Styles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormStyle_)
    async UpdatemjBizAppsFormsFormStyle(
        @Arg('input', () => UpdatemjBizAppsFormsFormStyleInput) input: UpdatemjBizAppsFormsFormStyleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Styles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormStyle_)
    async DeletemjBizAppsFormsFormStyle(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Styles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Uploads
//****************************************************************************
@ObjectType({ description: `Records that a file was uploaded through the Forms upload endpoint, for a specific distribution and draft response, so a submitted file id can be told apart from an arbitrary one. __mj.File has no owner column, so this is the only evidence of who produced a file` })
export class mjBizAppsFormsFormUpload_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The uploaded file`}) 
    @MaxLength(36)
    FileID: string;
        
    @Field({description: `The distribution the upload was made through. The hard scope every provenance check enforces`}) 
    @MaxLength(36)
    DistributionID: string;
        
    @Field({description: `The form the distribution belonged to at upload time, denormalized so the record survives a distribution being repointed`}) 
    @MaxLength(36)
    FormID: string;
        
    @Field({nullable: true, description: `The question the file answers`}) 
    @MaxLength(36)
    QuestionID?: string;
        
    @Field({nullable: true, description: `The client-minted response id the upload was made for. The primary correlation key, because the anonymous session id is documented to be blank in otherwise valid flows`}) 
    @MaxLength(36)
    ResponseDraftID?: string;
        
    @Field({nullable: true, description: `The anonymous session id at upload time. A fallback correlation key; blank is tolerated`}) 
    @MaxLength(255)
    AnonymousSessionID?: string;
        
    @Field({nullable: true, description: `The session principal that made the upload. Audit only — never a correlation key, since anonymous sessions share one user record`}) 
    @MaxLength(36)
    UploadedByUserID?: string;
        
    @Field({nullable: true, description: `Storage key of the file, so the Forms path prefix can be checked without loading the file row`}) 
    @MaxLength(1000)
    ProviderKey?: string;
        
    @Field({nullable: true, description: `Original sanitized filename`}) 
    @MaxLength(500)
    FileName?: string;
        
    @Field({nullable: true, description: `Stored content type`}) 
    @MaxLength(255)
    ContentType?: string;
        
    @Field(() => Int, {nullable: true, description: `Size in bytes`}) 
    SizeBytes?: number;
        
    @Field({description: `Revoked means the upload was withdrawn or garbage-collected; a revoked row fails provenance`}) 
    @MaxLength(20)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(500)
    File: string;
        
    @Field() 
    @MaxLength(255)
    Distribution: string;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    UploadedByUser?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Uploads
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormUploadInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FileID?: string;

    @Field({ nullable: true })
    DistributionID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    QuestionID: string | null;

    @Field({ nullable: true })
    ResponseDraftID: string | null;

    @Field({ nullable: true })
    AnonymousSessionID: string | null;

    @Field({ nullable: true })
    UploadedByUserID: string | null;

    @Field({ nullable: true })
    ProviderKey: string | null;

    @Field({ nullable: true })
    FileName: string | null;

    @Field({ nullable: true })
    ContentType: string | null;

    @Field(() => Int, { nullable: true })
    SizeBytes: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Uploads
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormUploadInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FileID?: string;

    @Field({ nullable: true })
    DistributionID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field({ nullable: true })
    QuestionID?: string | null;

    @Field({ nullable: true })
    ResponseDraftID?: string | null;

    @Field({ nullable: true })
    AnonymousSessionID?: string | null;

    @Field({ nullable: true })
    UploadedByUserID?: string | null;

    @Field({ nullable: true })
    ProviderKey?: string | null;

    @Field({ nullable: true })
    FileName?: string | null;

    @Field({ nullable: true })
    ContentType?: string | null;

    @Field(() => Int, { nullable: true })
    SizeBytes?: number | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Uploads
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormUploadViewResult {
    @Field(() => [mjBizAppsFormsFormUpload_])
    Results: mjBizAppsFormsFormUpload_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormUpload_)
export class mjBizAppsFormsFormUploadResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormUploadViewResult)
    async RunmjBizAppsFormsFormUploadViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormUploadViewResult)
    async RunmjBizAppsFormsFormUploadViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormUploadViewResult)
    async RunmjBizAppsFormsFormUploadDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Uploads';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormUpload_, { nullable: true })
    async mjBizAppsFormsFormUpload(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormUpload_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Uploads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormUploads')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Uploads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Uploads', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsFormsFormUpload_)
    async CreatemjBizAppsFormsFormUpload(
        @Arg('input', () => CreatemjBizAppsFormsFormUploadInput) input: CreatemjBizAppsFormsFormUploadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Uploads', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormUpload_)
    async UpdatemjBizAppsFormsFormUpload(
        @Arg('input', () => UpdatemjBizAppsFormsFormUploadInput) input: UpdatemjBizAppsFormsFormUploadInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Uploads', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormUpload_)
    async DeletemjBizAppsFormsFormUpload(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Uploads', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Form Versions
//****************************************************************************
@ObjectType({ description: `Immutable published snapshots of a form; responses pin the version they were filled against` })
export class mjBizAppsFormsFormVersion_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    FormID: string;
        
    @Field(() => Int, {description: `Monotonic version number within a form`}) 
    VersionNumber: number;
        
    @Field({description: `Version status: Draft, Published, or Retired`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true, description: `Timestamp this version was published (null while Draft)`}) 
    PublishedAt?: Date;
        
    @Field({nullable: true, description: `Full pages/questions/options/logic as published, captured as a JSON snapshot`}) 
    DefinitionSnapshot?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field(() => [mjBizAppsFormsFormResponse_])
    mjBizAppsFormsFormResponses_FormVersionIDArray: mjBizAppsFormsFormResponse_[]; // Link to mjBizAppsFormsFormResponses
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Versions
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormVersionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field(() => Int, { nullable: true })
    VersionNumber?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    PublishedAt: Date | null;

    @Field({ nullable: true })
    DefinitionSnapshot: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Form Versions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormVersionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FormID?: string;

    @Field(() => Int, { nullable: true })
    VersionNumber?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    PublishedAt?: Date | null;

    @Field({ nullable: true })
    DefinitionSnapshot?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Form Versions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormVersionViewResult {
    @Field(() => [mjBizAppsFormsFormVersion_])
    Results: mjBizAppsFormsFormVersion_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsFormVersion_)
export class mjBizAppsFormsFormVersionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormVersionViewResult)
    async RunmjBizAppsFormsFormVersionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormVersionViewResult)
    async RunmjBizAppsFormsFormVersionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormVersionViewResult)
    async RunmjBizAppsFormsFormVersionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Form Versions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsFormVersion_, { nullable: true })
    async mjBizAppsFormsFormVersion(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsFormVersion_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormVersions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Versions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormResponse_])
    async mjBizAppsFormsFormResponses_FormVersionIDArray(@Root() mjbizappsformsformversion_: mjBizAppsFormsFormVersion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Responses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponses')} WHERE ${provider.QuoteIdentifier('FormVersionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Responses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformversion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Responses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsFormVersion_)
    async CreatemjBizAppsFormsFormVersion(
        @Arg('input', () => CreatemjBizAppsFormsFormVersionInput) input: CreatemjBizAppsFormsFormVersionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Form Versions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsFormVersion_)
    async UpdatemjBizAppsFormsFormVersion(
        @Arg('input', () => UpdatemjBizAppsFormsFormVersionInput) input: UpdatemjBizAppsFormsFormVersionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Form Versions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsFormVersion_)
    async DeletemjBizAppsFormsFormVersion(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Form Versions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Forms: Forms
//****************************************************************************
@ObjectType({ description: `The root definition of a form/survey/intake instrument` })
export class mjBizAppsFormsForm_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name of the form`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description / purpose of the form`}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CategoryID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    StyleID?: string;
        
    @Field({description: `Lifecycle status: Draft, Published, or Closed`}) 
    @MaxLength(20)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OwnerUserID?: string;
        
    @Field({description: `Render mode for the respondent widget: Scroll (classic) or OneQuestion (Typeform-style)`}) 
    @MaxLength(20)
    RenderMode: string;
        
    @Field({nullable: true, description: `JSON settings: anonymous-allowed, captcha-on, quota, open/close dates, confirmation message/redirect`}) 
    Settings?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Style?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    OwnerUser?: string;
        
    @Field(() => [mjBizAppsFormsFormDistribution_])
    mjBizAppsFormsFormDistributions_FormIDArray: mjBizAppsFormsFormDistribution_[]; // Link to mjBizAppsFormsFormDistributions
    
    @Field(() => [mjBizAppsFormsFormVersion_])
    mjBizAppsFormsFormVersions_FormIDArray: mjBizAppsFormsFormVersion_[]; // Link to mjBizAppsFormsFormVersions
    
    @Field(() => [mjBizAppsFormsFormQuestion_])
    mjBizAppsFormsFormQuestions_FormIDArray: mjBizAppsFormsFormQuestion_[]; // Link to mjBizAppsFormsFormQuestions
    
    @Field(() => [mjBizAppsFormsFormPage_])
    mjBizAppsFormsFormPages_FormIDArray: mjBizAppsFormsFormPage_[]; // Link to mjBizAppsFormsFormPages
    
    @Field(() => [mjBizAppsFormsFormResponse_])
    mjBizAppsFormsFormResponses_FormIDArray: mjBizAppsFormsFormResponse_[]; // Link to mjBizAppsFormsFormResponses
    
    @Field(() => [mjBizAppsFormsFormAutomation_])
    mjBizAppsFormsFormAutomations_FormIDArray: mjBizAppsFormsFormAutomation_[]; // Link to mjBizAppsFormsFormAutomations
    
    @Field(() => [mjBizAppsFormsFormEntityBinding_])
    mjBizAppsFormsFormEntityBindings_FormIDArray: mjBizAppsFormsFormEntityBinding_[]; // Link to mjBizAppsFormsFormEntityBindings
    
    @Field(() => [mjBizAppsFormsFormUpload_])
    mjBizAppsFormsFormUploads_FormIDArray: mjBizAppsFormsFormUpload_[]; // Link to mjBizAppsFormsFormUploads
    
    @Field(() => [mjBizAppsFormsFormScreen_])
    mjBizAppsFormsFormScreens_FormIDArray: mjBizAppsFormsFormScreen_[]; // Link to mjBizAppsFormsFormScreens
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Forms
//****************************************************************************
@InputType()
export class CreatemjBizAppsFormsFormInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    StyleID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OwnerUserID: string | null;

    @Field({ nullable: true })
    RenderMode?: string;

    @Field({ nullable: true })
    Settings: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Forms: Forms
//****************************************************************************
@InputType()
export class UpdatemjBizAppsFormsFormInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    StyleID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    OwnerUserID?: string | null;

    @Field({ nullable: true })
    RenderMode?: string;

    @Field({ nullable: true })
    Settings?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Forms: Forms
//****************************************************************************
@ObjectType()
export class RunmjBizAppsFormsFormViewResult {
    @Field(() => [mjBizAppsFormsForm_])
    Results: mjBizAppsFormsForm_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsFormsForm_)
export class mjBizAppsFormsFormResolver extends ResolverBase {
    @Query(() => RunmjBizAppsFormsFormViewResult)
    async RunmjBizAppsFormsFormViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormViewResult)
    async RunmjBizAppsFormsFormViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsFormsFormViewResult)
    async RunmjBizAppsFormsFormDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Forms: Forms';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsFormsForm_, { nullable: true })
    async mjBizAppsFormsForm(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsFormsForm_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwForms')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Forms: Forms', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsFormsFormDistribution_])
    async mjBizAppsFormsFormDistributions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Distributions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormDistributions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Distributions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Distributions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormVersion_])
    async mjBizAppsFormsFormVersions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormVersions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Versions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormQuestion_])
    async mjBizAppsFormsFormQuestions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Questions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Questions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Questions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormPage_])
    async mjBizAppsFormsFormPages_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Pages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormPages')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Pages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Pages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormResponse_])
    async mjBizAppsFormsFormResponses_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Responses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponses')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Responses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Responses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormAutomation_])
    async mjBizAppsFormsFormAutomations_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Automations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormAutomations')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Automations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Automations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormEntityBinding_])
    async mjBizAppsFormsFormEntityBindings_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Entity Bindings', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormEntityBindings')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Entity Bindings', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Entity Bindings', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormUpload_])
    async mjBizAppsFormsFormUploads_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Uploads', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormUploads')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Uploads', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Uploads', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormScreen_])
    async mjBizAppsFormsFormScreens_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Screens', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormScreens')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Screens', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Screens', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsFormsForm_)
    async CreatemjBizAppsFormsForm(
        @Arg('input', () => CreatemjBizAppsFormsFormInput) input: CreatemjBizAppsFormsFormInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Forms: Forms', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsFormsForm_)
    async UpdatemjBizAppsFormsForm(
        @Arg('input', () => UpdatemjBizAppsFormsFormInput) input: UpdatemjBizAppsFormsFormInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Forms: Forms', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsFormsForm_)
    async DeletemjBizAppsFormsForm(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Forms: Forms', key, options, provider, userPayload, pubSub);
    }
    
}