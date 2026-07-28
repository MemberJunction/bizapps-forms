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


import { mjBizAppsFormsFormCategoryEntity, mjBizAppsFormsFormDistributionEntity, mjBizAppsFormsFormPageEntity, mjBizAppsFormsFormQuestionOptionEntity, mjBizAppsFormsFormQuestionEntity, mjBizAppsFormsFormResponseAnswerEntity, mjBizAppsFormsFormResponseEntity, mjBizAppsFormsFormStyleEntity, mjBizAppsFormsFormVersionEntity, mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';
    

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
    mjBizAppsFormsMJ_BizApps_Forms_Forms_CategoryIDArray: mjBizAppsFormsForm_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_Forms
    
    @Field(() => [mjBizAppsFormsFormCategory_])
    mjBizAppsFormsMJ_BizApps_Forms_FormCategories_ParentIDArray: mjBizAppsFormsFormCategory_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormCategories
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_Forms_CategoryIDArray(@Root() mjbizappsformsformcategory_: mjBizAppsFormsFormCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwForms')} WHERE ${provider.QuoteIdentifier('CategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Forms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormCategory_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormCategories_ParentIDArray(@Root() mjbizappsformsformcategory_: mjBizAppsFormsFormCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
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
        
    @Field() 
    @MaxLength(255)
    Form: string;
        
    @Field(() => [mjBizAppsFormsFormQuestion_])
    mjBizAppsFormsMJ_BizApps_Forms_FormQuestions_PageIDArray: mjBizAppsFormsFormQuestion_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormQuestions
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_FormQuestions_PageIDArray(@Root() mjbizappsformsformpage_: mjBizAppsFormsFormPage_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
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
    mjBizAppsFormsMJ_BizApps_Forms_FormQuestionOptions_QuestionIDArray: mjBizAppsFormsFormQuestionOption_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormQuestionOptions
    
    @Field(() => [mjBizAppsFormsFormResponseAnswer_])
    mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers_QuestionIDArray: mjBizAppsFormsFormResponseAnswer_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_FormQuestionOptions_QuestionIDArray(@Root() mjbizappsformsformquestion_: mjBizAppsFormsFormQuestion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Question Options', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestionOptions')} WHERE ${provider.QuoteIdentifier('QuestionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Question Options', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformquestion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Question Options', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormResponseAnswer_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers_QuestionIDArray(@Root() mjbizappsformsformquestion_: mjBizAppsFormsFormQuestion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Response Answers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponseAnswers')} WHERE ${provider.QuoteIdentifier('QuestionID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Response Answers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformquestion_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Response Answers', rows, this.GetUserFromPayload(userPayload));
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
    mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers_ResponseIDArray: mjBizAppsFormsFormResponseAnswer_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_FormResponseAnswers_ResponseIDArray(@Root() mjbizappsformsformresponse_: mjBizAppsFormsFormResponse_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Response Answers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponseAnswers')} WHERE ${provider.QuoteIdentifier('ResponseID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Response Answers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsformresponse_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Response Answers', rows, this.GetUserFromPayload(userPayload));
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
    mjBizAppsFormsMJ_BizApps_Forms_Forms_StyleIDArray: mjBizAppsFormsForm_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_Forms
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_Forms_StyleIDArray(@Root() mjbizappsformsformstyle_: mjBizAppsFormsFormStyle_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
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
    mjBizAppsFormsMJ_BizApps_Forms_FormResponses_FormVersionIDArray: mjBizAppsFormsFormResponse_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormResponses
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_FormResponses_FormVersionIDArray(@Root() mjbizappsformsformversion_: mjBizAppsFormsFormVersion_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
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
    mjBizAppsFormsMJ_BizApps_Forms_FormDistributions_FormIDArray: mjBizAppsFormsFormDistribution_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormDistributions
    
    @Field(() => [mjBizAppsFormsFormVersion_])
    mjBizAppsFormsMJ_BizApps_Forms_FormVersions_FormIDArray: mjBizAppsFormsFormVersion_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormVersions
    
    @Field(() => [mjBizAppsFormsFormQuestion_])
    mjBizAppsFormsMJ_BizApps_Forms_FormQuestions_FormIDArray: mjBizAppsFormsFormQuestion_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormQuestions
    
    @Field(() => [mjBizAppsFormsFormPage_])
    mjBizAppsFormsMJ_BizApps_Forms_FormPages_FormIDArray: mjBizAppsFormsFormPage_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormPages
    
    @Field(() => [mjBizAppsFormsFormResponse_])
    mjBizAppsFormsMJ_BizApps_Forms_FormResponses_FormIDArray: mjBizAppsFormsFormResponse_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormResponses
    
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
    async mjBizAppsFormsMJ_BizApps_Forms_FormDistributions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Distributions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormDistributions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Distributions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Distributions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormVersion_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormVersions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Versions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormVersions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Versions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Versions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormQuestion_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormQuestions_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Questions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormQuestions')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Questions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Questions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormPage_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormPages_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Pages', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormPages')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Pages', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Pages', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormResponse_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormResponses_FormIDArray(@Root() mjbizappsformsform_: mjBizAppsFormsForm_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Responses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponses')} WHERE ${provider.QuoteIdentifier('FormID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Responses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappsformsform_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Responses', rows, this.GetUserFromPayload(userPayload));
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
