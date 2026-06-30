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


import { mjBizAppsCommonAddressLinkEntity, mjBizAppsCommonAddressTypeEntity, mjBizAppsCommonAddressEntity, mjBizAppsCommonContactMethodEntity, mjBizAppsCommonContactTypeEntity, mjBizAppsCommonOrganizationTypeEntity, mjBizAppsCommonOrganizationEntity, mjBizAppsCommonPersonEntity, mjBizAppsCommonRelationshipTypeEntity, mjBizAppsCommonRelationshipEntity, mjBizAppsFormsFormCategoryEntity, mjBizAppsFormsFormDistributionEntity, mjBizAppsFormsFormPageEntity, mjBizAppsFormsFormQuestionOptionEntity, mjBizAppsFormsFormQuestionEntity, mjBizAppsFormsFormResponseAnswerEntity, mjBizAppsFormsFormResponseEntity, mjBizAppsFormsFormStyleEntity, mjBizAppsFormsFormVersionEntity, mjBizAppsFormsFormEntity, mjBizAppsTasksTaskActivityEntity, mjBizAppsTasksTaskAssignmentEntity, mjBizAppsTasksTaskCategoryEntity, mjBizAppsTasksTaskCommentEntity, mjBizAppsTasksTaskDecisionOutcomeEntity, mjBizAppsTasksTaskDecisionEntity, mjBizAppsTasksTaskDependencyEntity, mjBizAppsTasksTaskLinkEntity, mjBizAppsTasksTaskNotificationConfigEntity, mjBizAppsTasksTaskNotificationLogEntity, mjBizAppsTasksTaskRoleEntity, mjBizAppsTasksTaskTagLinkEntity, mjBizAppsTasksTaskTagEntity, mjBizAppsTasksTaskTemplateItemDependencyEntity, mjBizAppsTasksTaskTemplateItemRoleEntity, mjBizAppsTasksTaskTemplateItemEntity, mjBizAppsTasksTaskTemplateEntity, mjBizAppsTasksTaskTypeEntity, mjBizAppsTasksTaskEntity } from '@mj-biz-apps/forms-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Address Links
//****************************************************************************
@ObjectType({ description: `Polymorphic link table connecting Address records to any entity record in the system via EntityID and RecordID` })
export class mjBizAppsCommonAddressLink_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    AddressID: string;
        
    @Field() 
    @MaxLength(36)
    EntityID: string;
        
    @Field({description: `Primary key value(s) of the linked record. NVARCHAR(700) to support concatenated composite keys for entities without single-valued primary keys`}) 
    @MaxLength(700)
    RecordID: string;
        
    @Field() 
    @MaxLength(36)
    AddressTypeID: string;
        
    @Field(() => Boolean, {description: `Whether this is the primary address for the linked record. Only one address per entity record should be marked primary`}) 
    IsPrimary: boolean;
        
    @Field(() => Int, {nullable: true, description: `Sort order override for this specific link. When NULL, falls back to AddressType.DefaultRank. Lower values appear first`}) 
    Rank?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Address: string;
        
    @Field() 
    @MaxLength(255)
    Entity: string;
        
    @Field() 
    @MaxLength(100)
    AddressType: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Address Links
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    AddressID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    AddressTypeID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Rank: number | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Address Links
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    AddressID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    AddressTypeID?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Rank?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Address Links
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressLinkViewResult {
    @Field(() => [mjBizAppsCommonAddressLink_])
    Results: mjBizAppsCommonAddressLink_[];

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

@Resolver(mjBizAppsCommonAddressLink_)
export class mjBizAppsCommonAddressLinkResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressLinkViewResult)
    async RunmjBizAppsCommonAddressLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Address Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddressLink_, { nullable: true })
    async mjBizAppsCommonAddressLink(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddressLink_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Address Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async CreatemjBizAppsCommonAddressLink(
        @Arg('input', () => CreatemjBizAppsCommonAddressLinkInput) input: CreatemjBizAppsCommonAddressLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Address Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async UpdatemjBizAppsCommonAddressLink(
        @Arg('input', () => UpdatemjBizAppsCommonAddressLinkInput) input: UpdatemjBizAppsCommonAddressLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Address Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddressLink_)
    async DeletemjBizAppsCommonAddressLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Address Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Address Types
//****************************************************************************
@ObjectType({ description: `Categories of addresses such as Home, Work, Mailing, Billing` })
export class mjBizAppsCommonAddressType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the address type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this address type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field(() => Int, {description: `Default sort order for this address type in dropdown lists. Lower values appear first. Can be overridden per-record via AddressLink.Rank`}) 
    DefaultRank: number;
        
    @Field(() => Boolean, {description: `Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonAddressLink_])
    mjBizAppsCommonAddressLinks_AddressTypeIDArray: mjBizAppsCommonAddressLink_[]; // Link to mjBizAppsCommonAddressLinks
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Address Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field(() => Int, { nullable: true })
    DefaultRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Address Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field(() => Int, { nullable: true })
    DefaultRank?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Address Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressTypeViewResult {
    @Field(() => [mjBizAppsCommonAddressType_])
    Results: mjBizAppsCommonAddressType_[];

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

@Resolver(mjBizAppsCommonAddressType_)
export class mjBizAppsCommonAddressTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressTypeViewResult)
    async RunmjBizAppsCommonAddressTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Address Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddressType_, { nullable: true })
    async mjBizAppsCommonAddressType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddressType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Address Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Address Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Address Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonAddressLink_])
    async mjBizAppsCommonAddressLinks_AddressTypeIDArray(@Root() mjbizappscommonaddresstype_: mjBizAppsCommonAddressType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('AddressTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonaddresstype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Address Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonAddressType_)
    async CreatemjBizAppsCommonAddressType(
        @Arg('input', () => CreatemjBizAppsCommonAddressTypeInput) input: CreatemjBizAppsCommonAddressTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Address Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddressType_)
    async UpdatemjBizAppsCommonAddressType(
        @Arg('input', () => UpdatemjBizAppsCommonAddressTypeInput) input: UpdatemjBizAppsCommonAddressTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Address Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddressType_)
    async DeletemjBizAppsCommonAddressType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Address Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Addresses
//****************************************************************************
@ObjectType({ description: `Standalone physical address records linked to entities via AddressLink for sharing across people and organizations` })
export class mjBizAppsCommonAddress_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Street address line 1`}) 
    @MaxLength(255)
    Line1: string;
        
    @Field({nullable: true, description: `Street address line 2 (suite, apt, etc.)`}) 
    @MaxLength(255)
    Line2?: string;
        
    @Field({nullable: true, description: `Street address line 3 (additional detail)`}) 
    @MaxLength(255)
    Line3?: string;
        
    @Field({description: `City or locality name`}) 
    @MaxLength(100)
    City: string;
        
    @Field({nullable: true, description: `State, province, or region`}) 
    @MaxLength(100)
    StateProvince?: string;
        
    @Field({nullable: true, description: `Postal or ZIP code`}) 
    @MaxLength(20)
    PostalCode?: string;
        
    @Field({description: `Country code or name, defaults to US`}) 
    @MaxLength(100)
    Country: string;
        
    @Field(() => Float, {nullable: true, description: `Geographic latitude for mapping`}) 
    Latitude?: number;
        
    @Field(() => Float, {nullable: true, description: `Geographic longitude for mapping`}) 
    Longitude?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonAddressLink_])
    mjBizAppsCommonAddressLinks_AddressIDArray: mjBizAppsCommonAddressLink_[]; // Link to mjBizAppsCommonAddressLinks
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Addresses
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonAddressInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Line1?: string;

    @Field({ nullable: true })
    Line2: string | null;

    @Field({ nullable: true })
    Line3: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    StateProvince: string | null;

    @Field({ nullable: true })
    PostalCode: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field(() => Float, { nullable: true })
    Latitude: number | null;

    @Field(() => Float, { nullable: true })
    Longitude: number | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Addresses
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonAddressInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Line1?: string;

    @Field({ nullable: true })
    Line2?: string | null;

    @Field({ nullable: true })
    Line3?: string | null;

    @Field({ nullable: true })
    City?: string;

    @Field({ nullable: true })
    StateProvince?: string | null;

    @Field({ nullable: true })
    PostalCode?: string | null;

    @Field({ nullable: true })
    Country?: string;

    @Field(() => Float, { nullable: true })
    Latitude?: number | null;

    @Field(() => Float, { nullable: true })
    Longitude?: number | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Addresses
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonAddressViewResult {
    @Field(() => [mjBizAppsCommonAddress_])
    Results: mjBizAppsCommonAddress_[];

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

@Resolver(mjBizAppsCommonAddress_)
export class mjBizAppsCommonAddressResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonAddressViewResult)
    async RunmjBizAppsCommonAddressDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Addresses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonAddress_, { nullable: true })
    async mjBizAppsCommonAddress(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonAddress_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Addresses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddresses')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Addresses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Addresses', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonAddressLink_])
    async mjBizAppsCommonAddressLinks_AddressIDArray(@Root() mjbizappscommonaddress_: mjBizAppsCommonAddress_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Address Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwAddressLinks')} WHERE ${provider.QuoteIdentifier('AddressID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Address Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonaddress_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Address Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonAddress_)
    async CreatemjBizAppsCommonAddress(
        @Arg('input', () => CreatemjBizAppsCommonAddressInput) input: CreatemjBizAppsCommonAddressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Addresses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonAddress_)
    async UpdatemjBizAppsCommonAddress(
        @Arg('input', () => UpdatemjBizAppsCommonAddressInput) input: UpdatemjBizAppsCommonAddressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Addresses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonAddress_)
    async DeletemjBizAppsCommonAddress(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Addresses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Contact Methods
//****************************************************************************
@ObjectType({ description: `Additional contact methods for people and organizations beyond the primary email and phone fields` })
export class mjBizAppsCommonContactMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationID?: string;
        
    @Field() 
    @MaxLength(36)
    ContactTypeID: string;
        
    @Field({description: `The contact value: phone number, email address, URL, social media handle, etc.`}) 
    @MaxLength(500)
    Value: string;
        
    @Field({nullable: true, description: `Descriptive label such as Work cell, Personal Gmail, Corporate LinkedIn`}) 
    @MaxLength(100)
    Label?: string;
        
    @Field(() => Boolean, {description: `Whether this is the primary contact method of its type for the linked person or organization`}) 
    IsPrimary: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    Person?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Organization?: string;
        
    @Field() 
    @MaxLength(100)
    ContactType: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Contact Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonContactMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    PersonID: string | null;

    @Field({ nullable: true })
    OrganizationID: string | null;

    @Field({ nullable: true })
    ContactTypeID?: string;

    @Field({ nullable: true })
    Value?: string;

    @Field({ nullable: true })
    Label: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Contact Methods
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonContactMethodInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    PersonID?: string | null;

    @Field({ nullable: true })
    OrganizationID?: string | null;

    @Field({ nullable: true })
    ContactTypeID?: string;

    @Field({ nullable: true })
    Value?: string;

    @Field({ nullable: true })
    Label?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Contact Methods
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonContactMethodViewResult {
    @Field(() => [mjBizAppsCommonContactMethod_])
    Results: mjBizAppsCommonContactMethod_[];

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

@Resolver(mjBizAppsCommonContactMethod_)
export class mjBizAppsCommonContactMethodResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactMethodViewResult)
    async RunmjBizAppsCommonContactMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Contact Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonContactMethod_, { nullable: true })
    async mjBizAppsCommonContactMethod(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonContactMethod_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Contact Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async CreatemjBizAppsCommonContactMethod(
        @Arg('input', () => CreatemjBizAppsCommonContactMethodInput) input: CreatemjBizAppsCommonContactMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Contact Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async UpdatemjBizAppsCommonContactMethod(
        @Arg('input', () => UpdatemjBizAppsCommonContactMethodInput) input: UpdatemjBizAppsCommonContactMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Contact Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonContactMethod_)
    async DeletemjBizAppsCommonContactMethod(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Contact Methods', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Contact Types
//****************************************************************************
@ObjectType({ description: `Categories of contact methods such as Phone, Mobile, Email, LinkedIn, Website` })
export class mjBizAppsCommonContactType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the contact type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this contact type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field(() => Int, {description: `Sort order in dropdown lists. Lower values appear first`}) 
    DisplayRank: number;
        
    @Field(() => Boolean, {description: `Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_ContactTypeIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Contact Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonContactTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

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
// INPUT TYPE for MJ_BizApps_Common: Contact Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonContactTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

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
// RESOLVER for MJ_BizApps_Common: Contact Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonContactTypeViewResult {
    @Field(() => [mjBizAppsCommonContactType_])
    Results: mjBizAppsCommonContactType_[];

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

@Resolver(mjBizAppsCommonContactType_)
export class mjBizAppsCommonContactTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonContactTypeViewResult)
    async RunmjBizAppsCommonContactTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Contact Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonContactType_, { nullable: true })
    async mjBizAppsCommonContactType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonContactType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Contact Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Contact Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Contact Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_ContactTypeIDArray(@Root() mjbizappscommoncontacttype_: mjBizAppsCommonContactType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('ContactTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommoncontacttype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonContactType_)
    async CreatemjBizAppsCommonContactType(
        @Arg('input', () => CreatemjBizAppsCommonContactTypeInput) input: CreatemjBizAppsCommonContactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Contact Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonContactType_)
    async UpdatemjBizAppsCommonContactType(
        @Arg('input', () => UpdatemjBizAppsCommonContactTypeInput) input: UpdatemjBizAppsCommonContactTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Contact Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonContactType_)
    async DeletemjBizAppsCommonContactType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Contact Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Organization Types
//****************************************************************************
@ObjectType({ description: `Categories of organizations such as Company, Non-Profit, Association, Government` })
export class mjBizAppsCommonOrganizationType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the organization type`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this organization type`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Font Awesome icon class for UI display`}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field(() => Int, {description: `Sort order in dropdown lists. Lower values appear first`}) 
    DisplayRank: number;
        
    @Field(() => Boolean, {description: `Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonOrganization_])
    mjBizAppsCommonOrganizations_OrganizationTypeIDArray: mjBizAppsCommonOrganization_[]; // Link to mjBizAppsCommonOrganizations
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Organization Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonOrganizationTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

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
// INPUT TYPE for MJ_BizApps_Common: Organization Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonOrganizationTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

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
// RESOLVER for MJ_BizApps_Common: Organization Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonOrganizationTypeViewResult {
    @Field(() => [mjBizAppsCommonOrganizationType_])
    Results: mjBizAppsCommonOrganizationType_[];

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

@Resolver(mjBizAppsCommonOrganizationType_)
export class mjBizAppsCommonOrganizationTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationTypeViewResult)
    async RunmjBizAppsCommonOrganizationTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Organization Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonOrganizationType_, { nullable: true })
    async mjBizAppsCommonOrganizationType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonOrganizationType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Organization Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizationTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Organization Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Organization Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonOrganization_])
    async mjBizAppsCommonOrganizations_OrganizationTypeIDArray(@Root() mjbizappscommonorganizationtype_: mjBizAppsCommonOrganizationType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('OrganizationTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonorganizationtype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async CreatemjBizAppsCommonOrganizationType(
        @Arg('input', () => CreatemjBizAppsCommonOrganizationTypeInput) input: CreatemjBizAppsCommonOrganizationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Organization Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async UpdatemjBizAppsCommonOrganizationType(
        @Arg('input', () => UpdatemjBizAppsCommonOrganizationTypeInput) input: UpdatemjBizAppsCommonOrganizationTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Organization Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonOrganizationType_)
    async DeletemjBizAppsCommonOrganizationType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Organization Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Organizations
//****************************************************************************
@ObjectType({ description: `Companies, associations, government bodies, and other organizations with hierarchy support` })
export class mjBizAppsCommonOrganization_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Common or display name of the organization`}) 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true, description: `Full legal name if different from display name`}) 
    @MaxLength(255)
    LegalName?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OrganizationTypeID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field({nullable: true, description: `Primary website URL`}) 
    @MaxLength(1000)
    Website?: string;
        
    @Field({nullable: true, description: `URL to organization logo image`}) 
    @MaxLength(1000)
    LogoURL?: string;
        
    @Field({nullable: true, description: `Description of the organization purpose and scope`}) 
    Description?: string;
        
    @Field({nullable: true, description: `Primary contact email address`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `Date the organization was founded or incorporated`}) 
    FoundedDate?: Date;
        
    @Field({nullable: true, description: `Tax identification number such as EIN`}) 
    @MaxLength(50)
    TaxID?: string;
        
    @Field({description: `Current status: Active, Inactive, or Dissolved`}) 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    OrganizationType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsCommonOrganization_])
    mjBizAppsCommonOrganizations_ParentIDArray: mjBizAppsCommonOrganization_[]; // Link to mjBizAppsCommonOrganizations
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_ToOrganizationIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_OrganizationIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_FromOrganizationIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Organizations
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonOrganizationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    LegalName: string | null;

    @Field({ nullable: true })
    OrganizationTypeID: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    Website: string | null;

    @Field({ nullable: true })
    LogoURL: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    FoundedDate: Date | null;

    @Field({ nullable: true })
    TaxID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Organizations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonOrganizationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    LegalName?: string | null;

    @Field({ nullable: true })
    OrganizationTypeID?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    Website?: string | null;

    @Field({ nullable: true })
    LogoURL?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    FoundedDate?: Date | null;

    @Field({ nullable: true })
    TaxID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Organizations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonOrganizationViewResult {
    @Field(() => [mjBizAppsCommonOrganization_])
    Results: mjBizAppsCommonOrganization_[];

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

@Resolver(mjBizAppsCommonOrganization_)
export class mjBizAppsCommonOrganizationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonOrganizationViewResult)
    async RunmjBizAppsCommonOrganizationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Organizations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonOrganization_, { nullable: true })
    async mjBizAppsCommonOrganization(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonOrganization_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Organizations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonOrganization_])
    async mjBizAppsCommonOrganizations_ParentIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Organizations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwOrganizations')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Organizations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonorganization_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Organizations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_ToOrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ToOrganizationID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonorganization_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_OrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('OrganizationID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonorganization_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_FromOrganizationIDArray(@Root() mjbizappscommonorganization_: mjBizAppsCommonOrganization_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('FromOrganizationID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonorganization_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonOrganization_)
    async CreatemjBizAppsCommonOrganization(
        @Arg('input', () => CreatemjBizAppsCommonOrganizationInput) input: CreatemjBizAppsCommonOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Organizations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonOrganization_)
    async UpdatemjBizAppsCommonOrganization(
        @Arg('input', () => UpdatemjBizAppsCommonOrganizationInput) input: UpdatemjBizAppsCommonOrganizationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Organizations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonOrganization_)
    async DeletemjBizAppsCommonOrganization(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Organizations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: People
//****************************************************************************
@ObjectType({ description: `Individual people, optionally linked to MJ system user accounts` })
export class mjBizAppsCommonPerson_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `First (given) name`}) 
    @MaxLength(100)
    FirstName: string;
        
    @Field({description: `Last (family) name`}) 
    @MaxLength(100)
    LastName: string;
        
    @Field({nullable: true, description: `Middle name or initial`}) 
    @MaxLength(100)
    MiddleName?: string;
        
    @Field({nullable: true, description: `Name prefix such as Dr., Mr., Ms., Rev.`}) 
    @MaxLength(20)
    Prefix?: string;
        
    @Field({nullable: true, description: `Name suffix such as Jr., III, PhD, Esq.`}) 
    @MaxLength(20)
    Suffix?: string;
        
    @Field({nullable: true, description: `Nickname or preferred name the person goes by`}) 
    @MaxLength(100)
    PreferredName?: string;
        
    @Field({nullable: true, description: `Professional or job title, e.g. VP of Engineering, Board Director`}) 
    @MaxLength(200)
    Title?: string;
        
    @Field({nullable: true, description: `Primary email address for this person`}) 
    @MaxLength(255)
    Email?: string;
        
    @Field({nullable: true, description: `Primary phone number for this person`}) 
    @MaxLength(50)
    Phone?: string;
        
    @Field({nullable: true, description: `Date of birth`}) 
    DateOfBirth?: Date;
        
    @Field({nullable: true, description: `Gender identity`}) 
    @MaxLength(50)
    Gender?: string;
        
    @Field({nullable: true, description: `URL to profile photo or avatar image`}) 
    @MaxLength(1000)
    PhotoURL?: string;
        
    @Field({nullable: true, description: `Biographical text or notes about this person`}) 
    Bio?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    LinkedUserID?: string;
        
    @Field({description: `Current status: Active, Inactive, or Deceased`}) 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(201)
    DisplayName: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    LinkedUser?: string;
        
    @Field(() => [mjBizAppsCommonContactMethod_])
    mjBizAppsCommonContactMethods_PersonIDArray: mjBizAppsCommonContactMethod_[]; // Link to mjBizAppsCommonContactMethods
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_ToPersonIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
    @Field(() => [mjBizAppsTasksTaskComment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_PersonIDArray: mjBizAppsTasksTaskComment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskComments
    
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_FromPersonIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
    @Field(() => [mjBizAppsTasksTaskAssignment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_AssignedByPersonIDArray: mjBizAppsTasksTaskAssignment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments
    
    @Field(() => [mjBizAppsTasksTaskActivity_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities_PersonIDArray: mjBizAppsTasksTaskActivity_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities
    
    @Field(() => [mjBizAppsTasksTask_])
    mjBizAppsTasksMJ_BizApps_Tasks_Tasks_CreatedByPersonIDArray: mjBizAppsTasksTask_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_Tasks
    
    @Field(() => [mjBizAppsTasksTaskDecision_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_DecidedByPersonIDArray: mjBizAppsTasksTaskDecision_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions
    
    @Field(() => [mjBizAppsFormsFormResponse_])
    mjBizAppsFormsMJ_BizApps_Forms_FormResponses_RespondentPersonIDArray: mjBizAppsFormsFormResponse_[]; // Link to mjBizAppsFormsMJ_BizApps_Forms_FormResponses
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: People
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonPersonInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    MiddleName: string | null;

    @Field({ nullable: true })
    Prefix: string | null;

    @Field({ nullable: true })
    Suffix: string | null;

    @Field({ nullable: true })
    PreferredName: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    Email: string | null;

    @Field({ nullable: true })
    Phone: string | null;

    @Field({ nullable: true })
    DateOfBirth: Date | null;

    @Field({ nullable: true })
    Gender: string | null;

    @Field({ nullable: true })
    PhotoURL: string | null;

    @Field({ nullable: true })
    Bio: string | null;

    @Field({ nullable: true })
    LinkedUserID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: People
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonPersonInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    FirstName?: string;

    @Field({ nullable: true })
    LastName?: string;

    @Field({ nullable: true })
    MiddleName?: string | null;

    @Field({ nullable: true })
    Prefix?: string | null;

    @Field({ nullable: true })
    Suffix?: string | null;

    @Field({ nullable: true })
    PreferredName?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    Email?: string | null;

    @Field({ nullable: true })
    Phone?: string | null;

    @Field({ nullable: true })
    DateOfBirth?: Date | null;

    @Field({ nullable: true })
    Gender?: string | null;

    @Field({ nullable: true })
    PhotoURL?: string | null;

    @Field({ nullable: true })
    Bio?: string | null;

    @Field({ nullable: true })
    LinkedUserID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: People
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonPersonViewResult {
    @Field(() => [mjBizAppsCommonPerson_])
    Results: mjBizAppsCommonPerson_[];

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

@Resolver(mjBizAppsCommonPerson_)
export class mjBizAppsCommonPersonResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonPersonViewResult)
    async RunmjBizAppsCommonPersonDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: People';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonPerson_, { nullable: true })
    async mjBizAppsCommonPerson(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonPerson_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: People', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwPeople')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: People', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: People', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonContactMethod_])
    async mjBizAppsCommonContactMethods_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Contact Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwContactMethods')} WHERE ${provider.QuoteIdentifier('PersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Contact Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Contact Methods', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_ToPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ToPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskComment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskComments')} WHERE ${provider.QuoteIdentifier('PersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_FromPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('FromPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskAssignment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_AssignedByPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskAssignments')} WHERE ${provider.QuoteIdentifier('AssignedByPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Assignments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskActivity_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities_PersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskActivities')} WHERE ${provider.QuoteIdentifier('PersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTask_])
    async mjBizAppsTasksMJ_BizApps_Tasks_Tasks_CreatedByPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTasks')} WHERE ${provider.QuoteIdentifier('CreatedByPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskDecision_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_DecidedByPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decisions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisions')} WHERE ${provider.QuoteIdentifier('DecidedByPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decisions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decisions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsFormsFormResponse_])
    async mjBizAppsFormsMJ_BizApps_Forms_FormResponses_RespondentPersonIDArray(@Root() mjbizappscommonperson_: mjBizAppsCommonPerson_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Forms: Form Responses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsForms', 'vwFormResponses')} WHERE ${provider.QuoteIdentifier('RespondentPersonID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Forms: Form Responses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonperson_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Forms: Form Responses', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonPerson_)
    async CreatemjBizAppsCommonPerson(
        @Arg('input', () => CreatemjBizAppsCommonPersonInput) input: CreatemjBizAppsCommonPersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: People', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonPerson_)
    async UpdatemjBizAppsCommonPerson(
        @Arg('input', () => UpdatemjBizAppsCommonPersonInput) input: UpdatemjBizAppsCommonPersonInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: People', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonPerson_)
    async DeletemjBizAppsCommonPerson(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: People', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Relationship Types
//****************************************************************************
@ObjectType({ description: `Defines types of relationships between people and organizations with directionality and labeling` })
export class mjBizAppsCommonRelationshipType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Display name for the relationship type, e.g. Employee, Spouse, Partner`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true, description: `Detailed description of this relationship type`}) 
    Description?: string;
        
    @Field({description: `Which entity types this relationship connects: PersonToPerson, PersonToOrganization, or OrganizationToOrganization`}) 
    @MaxLength(50)
    Category: string;
        
    @Field(() => Boolean, {description: `Whether the relationship has a direction. False for symmetric relationships like Spouse or Partner`}) 
    IsDirectional: boolean;
        
    @Field({nullable: true, description: `Label describing the From-to-To direction, e.g. is employee of, is parent of`}) 
    @MaxLength(100)
    ForwardLabel?: string;
        
    @Field({nullable: true, description: `Label describing the To-to-From direction, e.g. employs, is child of`}) 
    @MaxLength(100)
    ReverseLabel?: string;
        
    @Field(() => Boolean, {description: `Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsCommonRelationship_])
    mjBizAppsCommonRelationships_RelationshipTypeIDArray: mjBizAppsCommonRelationship_[]; // Link to mjBizAppsCommonRelationships
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Relationship Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonRelationshipTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field(() => Boolean, { nullable: true })
    IsDirectional?: boolean;

    @Field({ nullable: true })
    ForwardLabel: string | null;

    @Field({ nullable: true })
    ReverseLabel: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Relationship Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonRelationshipTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    Category?: string;

    @Field(() => Boolean, { nullable: true })
    IsDirectional?: boolean;

    @Field({ nullable: true })
    ForwardLabel?: string | null;

    @Field({ nullable: true })
    ReverseLabel?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Relationship Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonRelationshipTypeViewResult {
    @Field(() => [mjBizAppsCommonRelationshipType_])
    Results: mjBizAppsCommonRelationshipType_[];

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

@Resolver(mjBizAppsCommonRelationshipType_)
export class mjBizAppsCommonRelationshipTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipTypeViewResult)
    async RunmjBizAppsCommonRelationshipTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Relationship Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonRelationshipType_, { nullable: true })
    async mjBizAppsCommonRelationshipType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonRelationshipType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationship Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationshipTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationship Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Relationship Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsCommonRelationship_])
    async mjBizAppsCommonRelationships_RelationshipTypeIDArray(@Root() mjbizappscommonrelationshiptype_: mjBizAppsCommonRelationshipType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('RelationshipTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappscommonrelationshiptype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async CreatemjBizAppsCommonRelationshipType(
        @Arg('input', () => CreatemjBizAppsCommonRelationshipTypeInput) input: CreatemjBizAppsCommonRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Relationship Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async UpdatemjBizAppsCommonRelationshipType(
        @Arg('input', () => UpdatemjBizAppsCommonRelationshipTypeInput) input: UpdatemjBizAppsCommonRelationshipTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Relationship Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonRelationshipType_)
    async DeletemjBizAppsCommonRelationshipType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Relationship Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Common: Relationships
//****************************************************************************
@ObjectType({ description: `Typed, directional links between people and organizations supporting Person-to-Person, Person-to-Organization, and Organization-to-Organization relationships` })
export class mjBizAppsCommonRelationship_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    RelationshipTypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    FromPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    FromOrganizationID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ToPersonID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ToOrganizationID?: string;
        
    @Field({nullable: true, description: `Contextual title for this specific relationship, e.g. CEO, Primary Contact, Founding Member`}) 
    @MaxLength(255)
    Title?: string;
        
    @Field({nullable: true, description: `Date the relationship began`}) 
    StartDate?: Date;
        
    @Field({nullable: true, description: `Date the relationship ended, if applicable`}) 
    EndDate?: Date;
        
    @Field({description: `Current status: Active, Inactive, or Ended`}) 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true, description: `Additional notes about this relationship`}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    RelationshipType: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    FromPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    FromOrganization?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    ToPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ToOrganization?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Relationships
//****************************************************************************
@InputType()
export class CreatemjBizAppsCommonRelationshipInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    RelationshipTypeID?: string;

    @Field({ nullable: true })
    FromPersonID: string | null;

    @Field({ nullable: true })
    FromOrganizationID: string | null;

    @Field({ nullable: true })
    ToPersonID: string | null;

    @Field({ nullable: true })
    ToOrganizationID: string | null;

    @Field({ nullable: true })
    Title: string | null;

    @Field({ nullable: true })
    StartDate: Date | null;

    @Field({ nullable: true })
    EndDate: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Common: Relationships
//****************************************************************************
@InputType()
export class UpdatemjBizAppsCommonRelationshipInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    RelationshipTypeID?: string;

    @Field({ nullable: true })
    FromPersonID?: string | null;

    @Field({ nullable: true })
    FromOrganizationID?: string | null;

    @Field({ nullable: true })
    ToPersonID?: string | null;

    @Field({ nullable: true })
    ToOrganizationID?: string | null;

    @Field({ nullable: true })
    Title?: string | null;

    @Field({ nullable: true })
    StartDate?: Date | null;

    @Field({ nullable: true })
    EndDate?: Date | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Common: Relationships
//****************************************************************************
@ObjectType()
export class RunmjBizAppsCommonRelationshipViewResult {
    @Field(() => [mjBizAppsCommonRelationship_])
    Results: mjBizAppsCommonRelationship_[];

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

@Resolver(mjBizAppsCommonRelationship_)
export class mjBizAppsCommonRelationshipResolver extends ResolverBase {
    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsCommonRelationshipViewResult)
    async RunmjBizAppsCommonRelationshipDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Common: Relationships';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsCommonRelationship_, { nullable: true })
    async mjBizAppsCommonRelationship(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsCommonRelationship_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Common: Relationships', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsCommon', 'vwRelationships')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Common: Relationships', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Common: Relationships', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsCommonRelationship_)
    async CreatemjBizAppsCommonRelationship(
        @Arg('input', () => CreatemjBizAppsCommonRelationshipInput) input: CreatemjBizAppsCommonRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Common: Relationships', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsCommonRelationship_)
    async UpdatemjBizAppsCommonRelationship(
        @Arg('input', () => UpdatemjBizAppsCommonRelationshipInput) input: UpdatemjBizAppsCommonRelationshipInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Common: Relationships', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsCommonRelationship_)
    async DeletemjBizAppsCommonRelationship(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Common: Relationships', key, options, provider, userPayload, pubSub);
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

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Activities
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskActivity_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field() 
    @MaxLength(50)
    ActivityType: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    PreviousValue?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    NewValue?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    Person?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Activities
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskActivityInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    PersonID: string | null;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    PreviousValue: string | null;

    @Field({ nullable: true })
    NewValue: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Activities
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskActivityInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    PersonID?: string | null;

    @Field({ nullable: true })
    ActivityType?: string;

    @Field({ nullable: true })
    PreviousValue?: string | null;

    @Field({ nullable: true })
    NewValue?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Activities
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskActivityViewResult {
    @Field(() => [mjBizAppsTasksTaskActivity_])
    Results: mjBizAppsTasksTaskActivity_[];

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

@Resolver(mjBizAppsTasksTaskActivity_)
export class mjBizAppsTasksTaskActivityResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskActivityViewResult)
    async RunmjBizAppsTasksTaskActivityViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskActivityViewResult)
    async RunmjBizAppsTasksTaskActivityViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskActivityViewResult)
    async RunmjBizAppsTasksTaskActivityDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskActivity_, { nullable: true })
    async mjBizAppsTasksTaskActivity(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskActivity_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskActivities')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Activities', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskActivity_)
    async CreatemjBizAppsTasksTaskActivity(
        @Arg('input', () => CreatemjBizAppsTasksTaskActivityInput) input: CreatemjBizAppsTasksTaskActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskActivity_)
    async UpdatemjBizAppsTasksTaskActivity(
        @Arg('input', () => UpdatemjBizAppsTasksTaskActivityInput) input: UpdatemjBizAppsTasksTaskActivityInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskActivity_)
    async DeletemjBizAppsTasksTaskActivity(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Assignments
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskAssignment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field() 
    @MaxLength(36)
    AssigneeEntityID: string;
        
    @Field() 
    @MaxLength(450)
    AssigneeRecordID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RoleID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    RoleNotes?: string;
        
    @Field() 
    @MaxLength(50)
    Status: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    AssignedByPersonID?: string;
        
    @Field() 
    AssignedAt: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(255)
    AssigneeEntity: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Role?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    AssignedByPerson?: string;
        
    @Field(() => [mjBizAppsTasksTaskDecision_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_TaskAssignmentIDArray: mjBizAppsTasksTaskDecision_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Assignments
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskAssignmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    AssigneeEntityID?: string;

    @Field({ nullable: true })
    AssigneeRecordID?: string;

    @Field({ nullable: true })
    RoleID: string | null;

    @Field({ nullable: true })
    RoleNotes: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AssignedByPersonID: string | null;

    @Field({ nullable: true })
    AssignedAt?: Date;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Assignments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskAssignmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    AssigneeEntityID?: string;

    @Field({ nullable: true })
    AssigneeRecordID?: string;

    @Field({ nullable: true })
    RoleID?: string | null;

    @Field({ nullable: true })
    RoleNotes?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AssignedByPersonID?: string | null;

    @Field({ nullable: true })
    AssignedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Assignments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskAssignmentViewResult {
    @Field(() => [mjBizAppsTasksTaskAssignment_])
    Results: mjBizAppsTasksTaskAssignment_[];

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

@Resolver(mjBizAppsTasksTaskAssignment_)
export class mjBizAppsTasksTaskAssignmentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskAssignmentViewResult)
    async RunmjBizAppsTasksTaskAssignmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskAssignmentViewResult)
    async RunmjBizAppsTasksTaskAssignmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskAssignmentViewResult)
    async RunmjBizAppsTasksTaskAssignmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Assignments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskAssignment_, { nullable: true })
    async mjBizAppsTasksTaskAssignment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskAssignment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskAssignments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Assignments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskDecision_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_TaskAssignmentIDArray(@Root() mjbizappstaskstaskassignment_: mjBizAppsTasksTaskAssignment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decisions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisions')} WHERE ${provider.QuoteIdentifier('TaskAssignmentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decisions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskassignment_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decisions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskAssignment_)
    async CreatemjBizAppsTasksTaskAssignment(
        @Arg('input', () => CreatemjBizAppsTasksTaskAssignmentInput) input: CreatemjBizAppsTasksTaskAssignmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Assignments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskAssignment_)
    async UpdatemjBizAppsTasksTaskAssignment(
        @Arg('input', () => UpdatemjBizAppsTasksTaskAssignmentInput) input: UpdatemjBizAppsTasksTaskAssignmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Assignments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskAssignment_)
    async DeletemjBizAppsTasksTaskAssignment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Assignments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Categories
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskCategory_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ColorCode?: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field(() => Boolean) 
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
        
    @Field(() => [mjBizAppsTasksTaskTemplate_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates_CategoryIDArray: mjBizAppsTasksTaskTemplate_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates
    
    @Field(() => [mjBizAppsTasksTaskCategory_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskCategories_ParentIDArray: mjBizAppsTasksTaskCategory_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskCategories
    
    @Field(() => [mjBizAppsTasksTask_])
    mjBizAppsTasksMJ_BizApps_Tasks_Tasks_CategoryIDArray: mjBizAppsTasksTask_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_Tasks
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Categories
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskCategoryInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    ColorCode: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Categories
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskCategoryInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    ColorCode?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Categories
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskCategoryViewResult {
    @Field(() => [mjBizAppsTasksTaskCategory_])
    Results: mjBizAppsTasksTaskCategory_[];

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

@Resolver(mjBizAppsTasksTaskCategory_)
export class mjBizAppsTasksTaskCategoryResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskCategoryViewResult)
    async RunmjBizAppsTasksTaskCategoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskCategoryViewResult)
    async RunmjBizAppsTasksTaskCategoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskCategoryViewResult)
    async RunmjBizAppsTasksTaskCategoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Categories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskCategory_, { nullable: true })
    async mjBizAppsTasksTaskCategory(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskCategory_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskCategories')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Categories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskTemplate_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates_CategoryIDArray(@Root() mjbizappstaskstaskcategory_: mjBizAppsTasksTaskCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Templates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplates')} WHERE ${provider.QuoteIdentifier('CategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Templates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Templates', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskCategory_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskCategories_ParentIDArray(@Root() mjbizappstaskstaskcategory_: mjBizAppsTasksTaskCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Categories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskCategories')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Categories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Categories', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTask_])
    async mjBizAppsTasksMJ_BizApps_Tasks_Tasks_CategoryIDArray(@Root() mjbizappstaskstaskcategory_: mjBizAppsTasksTaskCategory_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTasks')} WHERE ${provider.QuoteIdentifier('CategoryID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskcategory_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskCategory_)
    async CreatemjBizAppsTasksTaskCategory(
        @Arg('input', () => CreatemjBizAppsTasksTaskCategoryInput) input: CreatemjBizAppsTasksTaskCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Categories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskCategory_)
    async UpdatemjBizAppsTasksTaskCategory(
        @Arg('input', () => UpdatemjBizAppsTasksTaskCategoryInput) input: UpdatemjBizAppsTasksTaskCategoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Categories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskCategory_)
    async DeletemjBizAppsTasksTaskCategory(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Categories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Comments
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskComment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field() 
    @MaxLength(36)
    PersonID: string;
        
    @Field() 
    Content: string;
        
    @Field(() => Boolean) 
    IsEdited: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(201)
    Person: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsTasksTaskComment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_ParentIDArray: mjBizAppsTasksTaskComment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskComments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Comments
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskCommentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    Content?: string;

    @Field(() => Boolean, { nullable: true })
    IsEdited?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Comments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskCommentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    Content?: string;

    @Field(() => Boolean, { nullable: true })
    IsEdited?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Comments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskCommentViewResult {
    @Field(() => [mjBizAppsTasksTaskComment_])
    Results: mjBizAppsTasksTaskComment_[];

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

@Resolver(mjBizAppsTasksTaskComment_)
export class mjBizAppsTasksTaskCommentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskCommentViewResult)
    async RunmjBizAppsTasksTaskCommentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskCommentViewResult)
    async RunmjBizAppsTasksTaskCommentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskCommentViewResult)
    async RunmjBizAppsTasksTaskCommentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Comments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskComment_, { nullable: true })
    async mjBizAppsTasksTaskComment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskComment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskComments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Comments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskComment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_ParentIDArray(@Root() mjbizappstaskstaskcomment_: mjBizAppsTasksTaskComment_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskComments')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskcomment_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskComment_)
    async CreatemjBizAppsTasksTaskComment(
        @Arg('input', () => CreatemjBizAppsTasksTaskCommentInput) input: CreatemjBizAppsTasksTaskCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Comments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskComment_)
    async UpdatemjBizAppsTasksTaskComment(
        @Arg('input', () => UpdatemjBizAppsTasksTaskCommentInput) input: UpdatemjBizAppsTasksTaskCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Comments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskComment_)
    async DeletemjBizAppsTasksTaskComment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Comments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Decision Outcomes
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskDecisionOutcome_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `Human-readable outcome label (e.g. Approved, Rejected, Approved With Conditions).`}) 
    @MaxLength(100)
    Name: string;
        
    @Field({description: `Stable machine code for the outcome, used by orchestration code to map outcome to task status (e.g. Approved, Rejected, ApprovedWithConditions).`}) 
    @MaxLength(50)
    Code: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int, {description: `Display ordering for the outcome in decision pickers.`}) 
    Sequence: number;
        
    @Field(() => Boolean, {description: `When 1, recording this outcome closes the approval (terminal). When 0, the decision is interim and the task remains open.`}) 
    IsTerminal: boolean;
        
    @Field(() => Boolean, {description: `When 0, the outcome is hidden from new decision pickers but preserved on historical decisions.`}) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsTasksTaskDecision_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_OutcomeIDArray: mjBizAppsTasksTaskDecision_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Decision Outcomes
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskDecisionOutcomeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsTerminal?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Decision Outcomes
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskDecisionOutcomeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsTerminal?: boolean;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Decision Outcomes
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskDecisionOutcomeViewResult {
    @Field(() => [mjBizAppsTasksTaskDecisionOutcome_])
    Results: mjBizAppsTasksTaskDecisionOutcome_[];

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

@Resolver(mjBizAppsTasksTaskDecisionOutcome_)
export class mjBizAppsTasksTaskDecisionOutcomeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskDecisionOutcomeViewResult)
    async RunmjBizAppsTasksTaskDecisionOutcomeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDecisionOutcomeViewResult)
    async RunmjBizAppsTasksTaskDecisionOutcomeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDecisionOutcomeViewResult)
    async RunmjBizAppsTasksTaskDecisionOutcomeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Decision Outcomes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskDecisionOutcome_, { nullable: true })
    async mjBizAppsTasksTaskDecisionOutcome(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskDecisionOutcome_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decision Outcomes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisionOutcomes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decision Outcomes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decision Outcomes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskDecision_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_OutcomeIDArray(@Root() mjbizappstaskstaskdecisionoutcome_: mjBizAppsTasksTaskDecisionOutcome_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decisions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisions')} WHERE ${provider.QuoteIdentifier('OutcomeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decisions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskdecisionoutcome_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decisions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskDecisionOutcome_)
    async CreatemjBizAppsTasksTaskDecisionOutcome(
        @Arg('input', () => CreatemjBizAppsTasksTaskDecisionOutcomeInput) input: CreatemjBizAppsTasksTaskDecisionOutcomeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Decision Outcomes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskDecisionOutcome_)
    async UpdatemjBizAppsTasksTaskDecisionOutcome(
        @Arg('input', () => UpdatemjBizAppsTasksTaskDecisionOutcomeInput) input: UpdatemjBizAppsTasksTaskDecisionOutcomeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Decision Outcomes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskDecisionOutcome_)
    async DeletemjBizAppsTasksTaskDecisionOutcome(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Decision Outcomes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Decisions
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskDecision_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({description: `The task this decision was recorded against.`}) 
    @MaxLength(36)
    TaskID: string;
        
    @Field({description: `The decision outcome (FK to TaskDecisionOutcome).`}) 
    @MaxLength(36)
    OutcomeID: string;
        
    @Field({nullable: true, description: `The Person who made the decision.`}) 
    @MaxLength(36)
    DecidedByPersonID?: string;
        
    @Field({description: `When the decision was recorded.`}) 
    DecidedAt: Date;
        
    @Field({nullable: true, description: `Free-text rationale or conditions attached to the decision.`}) 
    DecisionNotes?: string;
        
    @Field({nullable: true, description: `Optional link to the specific TaskAssignment this decision belongs to, for per-assignee decisions in multi-approver flows. Null for a task-level decision.`}) 
    @MaxLength(36)
    TaskAssignmentID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(100)
    Outcome: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    DecidedByPerson?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Decisions
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskDecisionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    OutcomeID?: string;

    @Field({ nullable: true })
    DecidedByPersonID: string | null;

    @Field({ nullable: true })
    DecidedAt?: Date;

    @Field({ nullable: true })
    DecisionNotes: string | null;

    @Field({ nullable: true })
    TaskAssignmentID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Decisions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskDecisionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    OutcomeID?: string;

    @Field({ nullable: true })
    DecidedByPersonID?: string | null;

    @Field({ nullable: true })
    DecidedAt?: Date;

    @Field({ nullable: true })
    DecisionNotes?: string | null;

    @Field({ nullable: true })
    TaskAssignmentID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Decisions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskDecisionViewResult {
    @Field(() => [mjBizAppsTasksTaskDecision_])
    Results: mjBizAppsTasksTaskDecision_[];

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

@Resolver(mjBizAppsTasksTaskDecision_)
export class mjBizAppsTasksTaskDecisionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskDecisionViewResult)
    async RunmjBizAppsTasksTaskDecisionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDecisionViewResult)
    async RunmjBizAppsTasksTaskDecisionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDecisionViewResult)
    async RunmjBizAppsTasksTaskDecisionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Decisions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskDecision_, { nullable: true })
    async mjBizAppsTasksTaskDecision(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskDecision_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decisions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decisions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decisions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskDecision_)
    async CreatemjBizAppsTasksTaskDecision(
        @Arg('input', () => CreatemjBizAppsTasksTaskDecisionInput) input: CreatemjBizAppsTasksTaskDecisionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Decisions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskDecision_)
    async UpdatemjBizAppsTasksTaskDecision(
        @Arg('input', () => UpdatemjBizAppsTasksTaskDecisionInput) input: UpdatemjBizAppsTasksTaskDecisionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Decisions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskDecision_)
    async DeletemjBizAppsTasksTaskDecision(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Decisions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Dependencies
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskDependency_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field() 
    @MaxLength(36)
    DependsOnTaskID: string;
        
    @Field() 
    @MaxLength(50)
    DependencyType: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(255)
    DependsOnTask: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Dependencies
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskDependencyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    DependsOnTaskID?: string;

    @Field({ nullable: true })
    DependencyType?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Dependencies
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskDependencyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    DependsOnTaskID?: string;

    @Field({ nullable: true })
    DependencyType?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Dependencies
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskDependencyViewResult {
    @Field(() => [mjBizAppsTasksTaskDependency_])
    Results: mjBizAppsTasksTaskDependency_[];

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

@Resolver(mjBizAppsTasksTaskDependency_)
export class mjBizAppsTasksTaskDependencyResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskDependencyViewResult)
    async RunmjBizAppsTasksTaskDependencyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDependencyViewResult)
    async RunmjBizAppsTasksTaskDependencyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskDependencyViewResult)
    async RunmjBizAppsTasksTaskDependencyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Dependencies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskDependency_, { nullable: true })
    async mjBizAppsTasksTaskDependency(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskDependency_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDependencies')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Dependencies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskDependency_)
    async CreatemjBizAppsTasksTaskDependency(
        @Arg('input', () => CreatemjBizAppsTasksTaskDependencyInput) input: CreatemjBizAppsTasksTaskDependencyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Dependencies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskDependency_)
    async UpdatemjBizAppsTasksTaskDependency(
        @Arg('input', () => UpdatemjBizAppsTasksTaskDependencyInput) input: UpdatemjBizAppsTasksTaskDependencyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Dependencies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskDependency_)
    async DeletemjBizAppsTasksTaskDependency(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Dependencies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Links
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskLink_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field() 
    @MaxLength(36)
    EntityID: string;
        
    @Field() 
    @MaxLength(450)
    RecordID: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(255)
    Entity: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Links
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Links
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Links
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskLinkViewResult {
    @Field(() => [mjBizAppsTasksTaskLink_])
    Results: mjBizAppsTasksTaskLink_[];

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

@Resolver(mjBizAppsTasksTaskLink_)
export class mjBizAppsTasksTaskLinkResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskLinkViewResult)
    async RunmjBizAppsTasksTaskLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskLinkViewResult)
    async RunmjBizAppsTasksTaskLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskLinkViewResult)
    async RunmjBizAppsTasksTaskLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskLink_, { nullable: true })
    async mjBizAppsTasksTaskLink(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskLink_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskLinks')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskLink_)
    async CreatemjBizAppsTasksTaskLink(
        @Arg('input', () => CreatemjBizAppsTasksTaskLinkInput) input: CreatemjBizAppsTasksTaskLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskLink_)
    async UpdatemjBizAppsTasksTaskLink(
        @Arg('input', () => UpdatemjBizAppsTasksTaskLinkInput) input: UpdatemjBizAppsTasksTaskLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskLink_)
    async DeletemjBizAppsTasksTaskLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Notification Configs
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskNotificationConfig_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    TaskTypeID?: string;
        
    @Field(() => Boolean) 
    OverdueNotificationsEnabled: boolean;
        
    @Field(() => Int) 
    OverdueGracePeriodHours: number;
        
    @Field(() => Int, {nullable: true}) 
    OverdueRepeatIntervalHours?: number;
        
    @Field(() => Boolean) 
    NotifyAssignees: boolean;
        
    @Field(() => Boolean) 
    NotifyCreator: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OverdueActionID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    TaskType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OverdueAction?: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Notification Configs
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskNotificationConfigInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskTypeID: string | null;

    @Field(() => Boolean, { nullable: true })
    OverdueNotificationsEnabled?: boolean;

    @Field(() => Int, { nullable: true })
    OverdueGracePeriodHours?: number;

    @Field(() => Int, { nullable: true })
    OverdueRepeatIntervalHours: number | null;

    @Field(() => Boolean, { nullable: true })
    NotifyAssignees?: boolean;

    @Field(() => Boolean, { nullable: true })
    NotifyCreator?: boolean;

    @Field({ nullable: true })
    OverdueActionID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Notification Configs
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskNotificationConfigInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskTypeID?: string | null;

    @Field(() => Boolean, { nullable: true })
    OverdueNotificationsEnabled?: boolean;

    @Field(() => Int, { nullable: true })
    OverdueGracePeriodHours?: number;

    @Field(() => Int, { nullable: true })
    OverdueRepeatIntervalHours?: number | null;

    @Field(() => Boolean, { nullable: true })
    NotifyAssignees?: boolean;

    @Field(() => Boolean, { nullable: true })
    NotifyCreator?: boolean;

    @Field({ nullable: true })
    OverdueActionID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Notification Configs
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskNotificationConfigViewResult {
    @Field(() => [mjBizAppsTasksTaskNotificationConfig_])
    Results: mjBizAppsTasksTaskNotificationConfig_[];

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

@Resolver(mjBizAppsTasksTaskNotificationConfig_)
export class mjBizAppsTasksTaskNotificationConfigResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskNotificationConfigViewResult)
    async RunmjBizAppsTasksTaskNotificationConfigViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskNotificationConfigViewResult)
    async RunmjBizAppsTasksTaskNotificationConfigViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskNotificationConfigViewResult)
    async RunmjBizAppsTasksTaskNotificationConfigDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Notification Configs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskNotificationConfig_, { nullable: true })
    async mjBizAppsTasksTaskNotificationConfig(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskNotificationConfig_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Notification Configs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskNotificationConfigs')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Notification Configs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Notification Configs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskNotificationConfig_)
    async CreatemjBizAppsTasksTaskNotificationConfig(
        @Arg('input', () => CreatemjBizAppsTasksTaskNotificationConfigInput) input: CreatemjBizAppsTasksTaskNotificationConfigInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Notification Configs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskNotificationConfig_)
    async UpdatemjBizAppsTasksTaskNotificationConfig(
        @Arg('input', () => UpdatemjBizAppsTasksTaskNotificationConfigInput) input: UpdatemjBizAppsTasksTaskNotificationConfigInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Notification Configs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskNotificationConfig_)
    async DeletemjBizAppsTasksTaskNotificationConfig(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Notification Configs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Notification Logs
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskNotificationLog_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field() 
    @MaxLength(50)
    NotificationType: string;
        
    @Field() 
    @MaxLength(36)
    NotifiedUserID: string;
        
    @Field() 
    NotifiedAt: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(100)
    NotifiedUser: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Notification Logs
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskNotificationLogInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    NotificationType?: string;

    @Field({ nullable: true })
    NotifiedUserID?: string;

    @Field({ nullable: true })
    NotifiedAt?: Date;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Notification Logs
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskNotificationLogInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    NotificationType?: string;

    @Field({ nullable: true })
    NotifiedUserID?: string;

    @Field({ nullable: true })
    NotifiedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Notification Logs
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskNotificationLogViewResult {
    @Field(() => [mjBizAppsTasksTaskNotificationLog_])
    Results: mjBizAppsTasksTaskNotificationLog_[];

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

@Resolver(mjBizAppsTasksTaskNotificationLog_)
export class mjBizAppsTasksTaskNotificationLogResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskNotificationLogViewResult)
    async RunmjBizAppsTasksTaskNotificationLogViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskNotificationLogViewResult)
    async RunmjBizAppsTasksTaskNotificationLogViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskNotificationLogViewResult)
    async RunmjBizAppsTasksTaskNotificationLogDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Notification Logs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskNotificationLog_, { nullable: true })
    async mjBizAppsTasksTaskNotificationLog(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskNotificationLog_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Notification Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskNotificationLogs')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Notification Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Notification Logs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskNotificationLog_)
    async CreatemjBizAppsTasksTaskNotificationLog(
        @Arg('input', () => CreatemjBizAppsTasksTaskNotificationLogInput) input: CreatemjBizAppsTasksTaskNotificationLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Notification Logs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskNotificationLog_)
    async UpdatemjBizAppsTasksTaskNotificationLog(
        @Arg('input', () => UpdatemjBizAppsTasksTaskNotificationLogInput) input: UpdatemjBizAppsTasksTaskNotificationLogInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Notification Logs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskNotificationLog_)
    async DeletemjBizAppsTasksTaskNotificationLog(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Notification Logs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Roles
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskRole_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsTasksTaskTemplateItemRole_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles_RoleIDArray: mjBizAppsTasksTaskTemplateItemRole_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles
    
    @Field(() => [mjBizAppsTasksTaskAssignment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_RoleIDArray: mjBizAppsTasksTaskAssignment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Roles
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskRoleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Roles
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskRoleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Roles
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskRoleViewResult {
    @Field(() => [mjBizAppsTasksTaskRole_])
    Results: mjBizAppsTasksTaskRole_[];

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

@Resolver(mjBizAppsTasksTaskRole_)
export class mjBizAppsTasksTaskRoleResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskRoleViewResult)
    async RunmjBizAppsTasksTaskRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskRoleViewResult)
    async RunmjBizAppsTasksTaskRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskRoleViewResult)
    async RunmjBizAppsTasksTaskRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Roles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskRole_, { nullable: true })
    async mjBizAppsTasksTaskRole(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskRole_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskRoles')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Roles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItemRole_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles_RoleIDArray(@Root() mjbizappstaskstaskrole_: mjBizAppsTasksTaskRole_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemRoles')} WHERE ${provider.QuoteIdentifier('RoleID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskrole_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Roles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskAssignment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_RoleIDArray(@Root() mjbizappstaskstaskrole_: mjBizAppsTasksTaskRole_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskAssignments')} WHERE ${provider.QuoteIdentifier('RoleID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstaskrole_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Assignments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskRole_)
    async CreatemjBizAppsTasksTaskRole(
        @Arg('input', () => CreatemjBizAppsTasksTaskRoleInput) input: CreatemjBizAppsTasksTaskRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Roles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskRole_)
    async UpdatemjBizAppsTasksTaskRole(
        @Arg('input', () => UpdatemjBizAppsTasksTaskRoleInput) input: UpdatemjBizAppsTasksTaskRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Roles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskRole_)
    async DeletemjBizAppsTasksTaskRole(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Roles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Tag Links
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTagLink_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TaskID: string;
        
    @Field() 
    @MaxLength(36)
    TagID: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Task: string;
        
    @Field() 
    @MaxLength(100)
    Tag: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Tag Links
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTagLinkInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    TagID?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Tag Links
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTagLinkInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TaskID?: string;

    @Field({ nullable: true })
    TagID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Tag Links
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTagLinkViewResult {
    @Field(() => [mjBizAppsTasksTaskTagLink_])
    Results: mjBizAppsTasksTaskTagLink_[];

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

@Resolver(mjBizAppsTasksTaskTagLink_)
export class mjBizAppsTasksTaskTagLinkResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTagLinkViewResult)
    async RunmjBizAppsTasksTaskTagLinkViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTagLinkViewResult)
    async RunmjBizAppsTasksTaskTagLinkViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTagLinkViewResult)
    async RunmjBizAppsTasksTaskTagLinkDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Tag Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTagLink_, { nullable: true })
    async mjBizAppsTasksTaskTagLink(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTagLink_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTagLinks')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Tag Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskTagLink_)
    async CreatemjBizAppsTasksTaskTagLink(
        @Arg('input', () => CreatemjBizAppsTasksTaskTagLinkInput) input: CreatemjBizAppsTasksTaskTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Tag Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTagLink_)
    async UpdatemjBizAppsTasksTaskTagLink(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTagLinkInput) input: UpdatemjBizAppsTasksTaskTagLinkInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Tag Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTagLink_)
    async DeletemjBizAppsTasksTaskTagLink(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Tag Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Tags
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTag_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ColorCode?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [mjBizAppsTasksTaskTagLink_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks_TagIDArray: mjBizAppsTasksTaskTagLink_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Tags
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTagInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ColorCode: string | null;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Tags
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTagInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    ColorCode?: string | null;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Tags
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTagViewResult {
    @Field(() => [mjBizAppsTasksTaskTag_])
    Results: mjBizAppsTasksTaskTag_[];

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

@Resolver(mjBizAppsTasksTaskTag_)
export class mjBizAppsTasksTaskTagResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTagViewResult)
    async RunmjBizAppsTasksTaskTagViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTagViewResult)
    async RunmjBizAppsTasksTaskTagViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTagViewResult)
    async RunmjBizAppsTasksTaskTagDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTag_, { nullable: true })
    async mjBizAppsTasksTaskTag(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTag_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTags')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Tags', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskTagLink_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks_TagIDArray(@Root() mjbizappstaskstasktag_: mjBizAppsTasksTaskTag_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTagLinks')} WHERE ${provider.QuoteIdentifier('TagID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktag_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskTag_)
    async CreatemjBizAppsTasksTaskTag(
        @Arg('input', () => CreatemjBizAppsTasksTaskTagInput) input: CreatemjBizAppsTasksTaskTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTag_)
    async UpdatemjBizAppsTasksTaskTag(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTagInput) input: UpdatemjBizAppsTasksTaskTagInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTag_)
    async DeletemjBizAppsTasksTaskTag(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Template Item Dependencies
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTemplateItemDependency_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ItemID: string;
        
    @Field() 
    @MaxLength(36)
    DependsOnItemID: string;
        
    @Field() 
    @MaxLength(50)
    DependencyType: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Item: string;
        
    @Field() 
    @MaxLength(255)
    DependsOnItem: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Item Dependencies
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTemplateItemDependencyInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ItemID?: string;

    @Field({ nullable: true })
    DependsOnItemID?: string;

    @Field({ nullable: true })
    DependencyType?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Item Dependencies
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTemplateItemDependencyInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ItemID?: string;

    @Field({ nullable: true })
    DependsOnItemID?: string;

    @Field({ nullable: true })
    DependencyType?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Template Item Dependencies
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTemplateItemDependencyViewResult {
    @Field(() => [mjBizAppsTasksTaskTemplateItemDependency_])
    Results: mjBizAppsTasksTaskTemplateItemDependency_[];

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

@Resolver(mjBizAppsTasksTaskTemplateItemDependency_)
export class mjBizAppsTasksTaskTemplateItemDependencyResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTemplateItemDependencyViewResult)
    async RunmjBizAppsTasksTaskTemplateItemDependencyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemDependencyViewResult)
    async RunmjBizAppsTasksTaskTemplateItemDependencyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemDependencyViewResult)
    async RunmjBizAppsTasksTaskTemplateItemDependencyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Template Item Dependencies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTemplateItemDependency_, { nullable: true })
    async mjBizAppsTasksTaskTemplateItemDependency(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTemplateItemDependency_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemDependencies')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Dependencies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplateItemDependency_)
    async CreatemjBizAppsTasksTaskTemplateItemDependency(
        @Arg('input', () => CreatemjBizAppsTasksTaskTemplateItemDependencyInput) input: CreatemjBizAppsTasksTaskTemplateItemDependencyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Template Item Dependencies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplateItemDependency_)
    async UpdatemjBizAppsTasksTaskTemplateItemDependency(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTemplateItemDependencyInput) input: UpdatemjBizAppsTasksTaskTemplateItemDependencyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Template Item Dependencies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplateItemDependency_)
    async DeletemjBizAppsTasksTaskTemplateItemDependency(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Template Item Dependencies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Template Item Roles
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTemplateItemRole_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    ItemID: string;
        
    @Field() 
    @MaxLength(36)
    RoleID: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Item: string;
        
    @Field() 
    @MaxLength(100)
    Role: string;
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Item Roles
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTemplateItemRoleInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ItemID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Item Roles
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTemplateItemRoleInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ItemID?: string;

    @Field({ nullable: true })
    RoleID?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Template Item Roles
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTemplateItemRoleViewResult {
    @Field(() => [mjBizAppsTasksTaskTemplateItemRole_])
    Results: mjBizAppsTasksTaskTemplateItemRole_[];

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

@Resolver(mjBizAppsTasksTaskTemplateItemRole_)
export class mjBizAppsTasksTaskTemplateItemRoleResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTemplateItemRoleViewResult)
    async RunmjBizAppsTasksTaskTemplateItemRoleViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemRoleViewResult)
    async RunmjBizAppsTasksTaskTemplateItemRoleViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemRoleViewResult)
    async RunmjBizAppsTasksTaskTemplateItemRoleDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Template Item Roles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTemplateItemRole_, { nullable: true })
    async mjBizAppsTasksTaskTemplateItemRole(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTemplateItemRole_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemRoles')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Roles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplateItemRole_)
    async CreatemjBizAppsTasksTaskTemplateItemRole(
        @Arg('input', () => CreatemjBizAppsTasksTaskTemplateItemRoleInput) input: CreatemjBizAppsTasksTaskTemplateItemRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Template Item Roles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplateItemRole_)
    async UpdatemjBizAppsTasksTaskTemplateItemRole(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTemplateItemRoleInput) input: UpdatemjBizAppsTasksTaskTemplateItemRoleInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Template Item Roles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplateItemRole_)
    async DeletemjBizAppsTasksTaskTemplateItemRole(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Template Item Roles', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Template Items
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTemplateItem_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(36)
    TemplateID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentItemID?: string;
        
    @Field() 
    @MaxLength(20)
    Priority: string;
        
    @Field(() => Int, {nullable: true}) 
    DaysFromStart?: number;
        
    @Field(() => Float, {nullable: true}) 
    HoursEstimated?: number;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(255)
    Template: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ParentItem?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentItemID?: string;
        
    @Field(() => [mjBizAppsTasksTaskTemplateItem_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems_ParentItemIDArray: mjBizAppsTasksTaskTemplateItem_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems
    
    @Field(() => [mjBizAppsTasksTaskTemplateItemRole_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles_ItemIDArray: mjBizAppsTasksTaskTemplateItemRole_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles
    
    @Field(() => [mjBizAppsTasksTaskTemplateItemDependency_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies_DependsOnItemIDArray: mjBizAppsTasksTaskTemplateItemDependency_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies
    
    @Field(() => [mjBizAppsTasksTaskTemplateItemDependency_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies_ItemIDArray: mjBizAppsTasksTaskTemplateItemDependency_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Items
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTemplateItemInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    TemplateID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ParentItemID: string | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field(() => Int, { nullable: true })
    DaysFromStart: number | null;

    @Field(() => Float, { nullable: true })
    HoursEstimated: number | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Template Items
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTemplateItemInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    TemplateID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ParentItemID?: string | null;

    @Field({ nullable: true })
    Priority?: string;

    @Field(() => Int, { nullable: true })
    DaysFromStart?: number | null;

    @Field(() => Float, { nullable: true })
    HoursEstimated?: number | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Template Items
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTemplateItemViewResult {
    @Field(() => [mjBizAppsTasksTaskTemplateItem_])
    Results: mjBizAppsTasksTaskTemplateItem_[];

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

@Resolver(mjBizAppsTasksTaskTemplateItem_)
export class mjBizAppsTasksTaskTemplateItemResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTemplateItemViewResult)
    async RunmjBizAppsTasksTaskTemplateItemViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemViewResult)
    async RunmjBizAppsTasksTaskTemplateItemViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateItemViewResult)
    async RunmjBizAppsTasksTaskTemplateItemDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Template Items';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTemplateItem_, { nullable: true })
    async mjBizAppsTasksTaskTemplateItem(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTemplateItem_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItems')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Items', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItem_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems_ParentItemIDArray(@Root() mjbizappstaskstasktemplateitem_: mjBizAppsTasksTaskTemplateItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItems')} WHERE ${provider.QuoteIdentifier('ParentItemID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktemplateitem_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItemRole_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemRoles_ItemIDArray(@Root() mjbizappstaskstasktemplateitem_: mjBizAppsTasksTaskTemplateItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Roles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemRoles')} WHERE ${provider.QuoteIdentifier('ItemID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Roles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktemplateitem_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Roles', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItemDependency_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies_DependsOnItemIDArray(@Root() mjbizappstaskstasktemplateitem_: mjBizAppsTasksTaskTemplateItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemDependencies')} WHERE ${provider.QuoteIdentifier('DependsOnItemID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktemplateitem_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Dependencies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItemDependency_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItemDependencies_ItemIDArray(@Root() mjbizappstaskstasktemplateitem_: mjBizAppsTasksTaskTemplateItem_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItemDependencies')} WHERE ${provider.QuoteIdentifier('ItemID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Item Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktemplateitem_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Item Dependencies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplateItem_)
    async CreatemjBizAppsTasksTaskTemplateItem(
        @Arg('input', () => CreatemjBizAppsTasksTaskTemplateItemInput) input: CreatemjBizAppsTasksTaskTemplateItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Template Items', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplateItem_)
    async UpdatemjBizAppsTasksTaskTemplateItem(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTemplateItemInput) input: UpdatemjBizAppsTasksTaskTemplateItemInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Template Items', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplateItem_)
    async DeletemjBizAppsTasksTaskTemplateItem(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Template Items', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Templates
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskTemplate_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CategoryID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    TypeID?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Type?: string;
        
    @Field(() => [mjBizAppsTasksTaskTemplateItem_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems_TemplateIDArray: mjBizAppsTasksTaskTemplateItem_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Templates
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTemplateInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    TypeID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Templates
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTemplateInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    TypeID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Templates
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTemplateViewResult {
    @Field(() => [mjBizAppsTasksTaskTemplate_])
    Results: mjBizAppsTasksTaskTemplate_[];

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

@Resolver(mjBizAppsTasksTaskTemplate_)
export class mjBizAppsTasksTaskTemplateResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTemplateViewResult)
    async RunmjBizAppsTasksTaskTemplateViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateViewResult)
    async RunmjBizAppsTasksTaskTemplateViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTemplateViewResult)
    async RunmjBizAppsTasksTaskTemplateDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Templates';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskTemplate_, { nullable: true })
    async mjBizAppsTasksTaskTemplate(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskTemplate_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Templates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplates')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Templates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Templates', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskTemplateItem_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplateItems_TemplateIDArray(@Root() mjbizappstaskstasktemplate_: mjBizAppsTasksTaskTemplate_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Template Items', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplateItems')} WHERE ${provider.QuoteIdentifier('TemplateID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Template Items', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktemplate_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Template Items', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplate_)
    async CreatemjBizAppsTasksTaskTemplate(
        @Arg('input', () => CreatemjBizAppsTasksTaskTemplateInput) input: CreatemjBizAppsTasksTaskTemplateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Templates', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskTemplate_)
    async UpdatemjBizAppsTasksTaskTemplate(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTemplateInput) input: UpdatemjBizAppsTasksTaskTemplateInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Templates', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskTemplate_)
    async DeletemjBizAppsTasksTaskTemplate(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Templates', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Task Types
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTaskType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(100)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field() 
    @MaxLength(20)
    DefaultPriority: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OnAssignActionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OnCompleteActionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OnOverdueActionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    OnPercentChangeActionID?: string;
        
    @Field(() => Boolean) 
    IsActive: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true, description: `Action invoked when a task of this type transitions to a rejected decision (post-commit, non-blocking). Used by approval workflows.`}) 
    @MaxLength(36)
    OnRejectActionID?: string;
        
    @Field({nullable: true, description: `Action invoked when a task of this type transitions to Cancelled (post-commit, non-blocking).`}) 
    @MaxLength(36)
    OnCancelActionID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnAssignAction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnCompleteAction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnOverdueAction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnPercentChangeAction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnRejectAction?: string;
        
    @Field({nullable: true}) 
    @MaxLength(425)
    OnCancelAction?: string;
        
    @Field(() => [mjBizAppsTasksTaskNotificationConfig_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationConfigs_TaskTypeIDArray: mjBizAppsTasksTaskNotificationConfig_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationConfigs
    
    @Field(() => [mjBizAppsTasksTask_])
    mjBizAppsTasksMJ_BizApps_Tasks_Tasks_TypeIDArray: mjBizAppsTasksTask_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_Tasks
    
    @Field(() => [mjBizAppsTasksTaskTemplate_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates_TypeIDArray: mjBizAppsTasksTaskTemplate_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field({ nullable: true })
    DefaultPriority?: string;

    @Field({ nullable: true })
    OnAssignActionID: string | null;

    @Field({ nullable: true })
    OnCompleteActionID: string | null;

    @Field({ nullable: true })
    OnOverdueActionID: string | null;

    @Field({ nullable: true })
    OnPercentChangeActionID: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    OnRejectActionID: string | null;

    @Field({ nullable: true })
    OnCancelActionID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Task Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field({ nullable: true })
    DefaultPriority?: string;

    @Field({ nullable: true })
    OnAssignActionID?: string | null;

    @Field({ nullable: true })
    OnCompleteActionID?: string | null;

    @Field({ nullable: true })
    OnOverdueActionID?: string | null;

    @Field({ nullable: true })
    OnPercentChangeActionID?: string | null;

    @Field(() => Boolean, { nullable: true })
    IsActive?: boolean;

    @Field({ nullable: true })
    OnRejectActionID?: string | null;

    @Field({ nullable: true })
    OnCancelActionID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Task Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskTypeViewResult {
    @Field(() => [mjBizAppsTasksTaskType_])
    Results: mjBizAppsTasksTaskType_[];

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

@Resolver(mjBizAppsTasksTaskType_)
export class mjBizAppsTasksTaskTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskTypeViewResult)
    async RunmjBizAppsTasksTaskTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTypeViewResult)
    async RunmjBizAppsTasksTaskTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskTypeViewResult)
    async RunmjBizAppsTasksTaskTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Task Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTaskType_, { nullable: true })
    async mjBizAppsTasksTaskType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTaskType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskNotificationConfig_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationConfigs_TaskTypeIDArray(@Root() mjbizappstaskstasktype_: mjBizAppsTasksTaskType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Notification Configs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskNotificationConfigs')} WHERE ${provider.QuoteIdentifier('TaskTypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Notification Configs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Notification Configs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTask_])
    async mjBizAppsTasksMJ_BizApps_Tasks_Tasks_TypeIDArray(@Root() mjbizappstaskstasktype_: mjBizAppsTasksTaskType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTasks')} WHERE ${provider.QuoteIdentifier('TypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskTemplate_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTemplates_TypeIDArray(@Root() mjbizappstaskstasktype_: mjBizAppsTasksTaskType_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Templates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTemplates')} WHERE ${provider.QuoteIdentifier('TypeID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Templates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstasktype_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Templates', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTaskType_)
    async CreatemjBizAppsTasksTaskType(
        @Arg('input', () => CreatemjBizAppsTasksTaskTypeInput) input: CreatemjBizAppsTasksTaskTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Task Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTaskType_)
    async UpdatemjBizAppsTasksTaskType(
        @Arg('input', () => UpdatemjBizAppsTasksTaskTypeInput) input: UpdatemjBizAppsTasksTaskTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Task Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTaskType_)
    async DeletemjBizAppsTasksTaskType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Task Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Tasks: Tasks
//****************************************************************************
@ObjectType()
export class mjBizAppsTasksTask_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field() 
    @MaxLength(255)
    Name: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field() 
    @MaxLength(36)
    TypeID: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CategoryID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ParentID?: string;
        
    @Field() 
    @MaxLength(50)
    Status: string;
        
    @Field() 
    @MaxLength(20)
    Priority: string;
        
    @Field({nullable: true}) 
    StartedAt?: Date;
        
    @Field({nullable: true}) 
    DueAt?: Date;
        
    @Field({nullable: true}) 
    CompletedAt?: Date;
        
    @Field(() => Float, {nullable: true}) 
    HoursEstimated?: number;
        
    @Field(() => Float, {nullable: true}) 
    HoursActual?: number;
        
    @Field(() => Int) 
    PercentComplete: number;
        
    @Field(() => Int) 
    Sequence: number;
        
    @Field({nullable: true}) 
    BlockedReason?: string;
        
    @Field({nullable: true}) 
    CompletionNotes?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    CreatedByPersonID?: string;
        
    @Field({nullable: true}) 
    OverdueNotifiedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field() 
    @MaxLength(100)
    Type: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Category?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Parent?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    CreatedByPerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    RootParentID?: string;
        
    @Field(() => [mjBizAppsTasksTaskDependency_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies_DependsOnTaskIDArray: mjBizAppsTasksTaskDependency_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies
    
    @Field(() => [mjBizAppsTasksTaskDependency_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies_TaskIDArray: mjBizAppsTasksTaskDependency_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies
    
    @Field(() => [mjBizAppsTasksTask_])
    mjBizAppsTasksMJ_BizApps_Tasks_Tasks_ParentIDArray: mjBizAppsTasksTask_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_Tasks
    
    @Field(() => [mjBizAppsTasksTaskAssignment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_TaskIDArray: mjBizAppsTasksTaskAssignment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments
    
    @Field(() => [mjBizAppsTasksTaskLink_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskLinks_TaskIDArray: mjBizAppsTasksTaskLink_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskLinks
    
    @Field(() => [mjBizAppsTasksTaskComment_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_TaskIDArray: mjBizAppsTasksTaskComment_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskComments
    
    @Field(() => [mjBizAppsTasksTaskActivity_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities_TaskIDArray: mjBizAppsTasksTaskActivity_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities
    
    @Field(() => [mjBizAppsTasksTaskTagLink_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks_TaskIDArray: mjBizAppsTasksTaskTagLink_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks
    
    @Field(() => [mjBizAppsTasksTaskNotificationLog_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationLogs_TaskIDArray: mjBizAppsTasksTaskNotificationLog_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationLogs
    
    @Field(() => [mjBizAppsTasksTaskDecision_])
    mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_TaskIDArray: mjBizAppsTasksTaskDecision_[]; // Link to mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions
    
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Tasks
//****************************************************************************
@InputType()
export class CreatemjBizAppsTasksTaskInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    CategoryID: string | null;

    @Field({ nullable: true })
    ParentID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    StartedAt: Date | null;

    @Field({ nullable: true })
    DueAt: Date | null;

    @Field({ nullable: true })
    CompletedAt: Date | null;

    @Field(() => Float, { nullable: true })
    HoursEstimated: number | null;

    @Field(() => Float, { nullable: true })
    HoursActual: number | null;

    @Field(() => Int, { nullable: true })
    PercentComplete?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    BlockedReason: string | null;

    @Field({ nullable: true })
    CompletionNotes: string | null;

    @Field({ nullable: true })
    CreatedByPersonID: string | null;

    @Field({ nullable: true })
    OverdueNotifiedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Tasks: Tasks
//****************************************************************************
@InputType()
export class UpdatemjBizAppsTasksTaskInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    TypeID?: string;

    @Field({ nullable: true })
    CategoryID?: string | null;

    @Field({ nullable: true })
    ParentID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Priority?: string;

    @Field({ nullable: true })
    StartedAt?: Date | null;

    @Field({ nullable: true })
    DueAt?: Date | null;

    @Field({ nullable: true })
    CompletedAt?: Date | null;

    @Field(() => Float, { nullable: true })
    HoursEstimated?: number | null;

    @Field(() => Float, { nullable: true })
    HoursActual?: number | null;

    @Field(() => Int, { nullable: true })
    PercentComplete?: number;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    BlockedReason?: string | null;

    @Field({ nullable: true })
    CompletionNotes?: string | null;

    @Field({ nullable: true })
    CreatedByPersonID?: string | null;

    @Field({ nullable: true })
    OverdueNotifiedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Tasks: Tasks
//****************************************************************************
@ObjectType()
export class RunmjBizAppsTasksTaskViewResult {
    @Field(() => [mjBizAppsTasksTask_])
    Results: mjBizAppsTasksTask_[];

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

@Resolver(mjBizAppsTasksTask_)
export class mjBizAppsTasksTaskResolver extends ResolverBase {
    @Query(() => RunmjBizAppsTasksTaskViewResult)
    async RunmjBizAppsTasksTaskViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskViewResult)
    async RunmjBizAppsTasksTaskViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsTasksTaskViewResult)
    async RunmjBizAppsTasksTaskDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Tasks: Tasks';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsTasksTask_, { nullable: true })
    async mjBizAppsTasksTask(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsTasksTask_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTasks')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Tasks: Tasks', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [mjBizAppsTasksTaskDependency_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies_DependsOnTaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDependencies')} WHERE ${provider.QuoteIdentifier('DependsOnTaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Dependencies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskDependency_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDependencies_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Dependencies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDependencies')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Dependencies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Dependencies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTask_])
    async mjBizAppsTasksMJ_BizApps_Tasks_Tasks_ParentIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Tasks', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTasks')} WHERE ${provider.QuoteIdentifier('ParentID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Tasks', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Tasks', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskAssignment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskAssignments_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Assignments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskAssignments')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Assignments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Assignments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskLink_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskLinks_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskLinks')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskComment_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskComments_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskComments')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Comments', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskActivity_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskActivities_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskActivities')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskTagLink_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskTagLinks_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Tag Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskTagLinks')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Tag Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Tag Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskNotificationLog_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskNotificationLogs_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Notification Logs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskNotificationLogs')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Notification Logs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Notification Logs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [mjBizAppsTasksTaskDecision_])
    async mjBizAppsTasksMJ_BizApps_Tasks_TaskDecisions_TaskIDArray(@Root() mjbizappstaskstask_: mjBizAppsTasksTask_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('MJ_BizApps_Tasks: Task Decisions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsTasks', 'vwTaskDecisions')} WHERE ${provider.QuoteIdentifier('TaskID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Tasks: Task Decisions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [mjbizappstaskstask_.ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('MJ_BizApps_Tasks: Task Decisions', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => mjBizAppsTasksTask_)
    async CreatemjBizAppsTasksTask(
        @Arg('input', () => CreatemjBizAppsTasksTaskInput) input: CreatemjBizAppsTasksTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Tasks: Tasks', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsTasksTask_)
    async UpdatemjBizAppsTasksTask(
        @Arg('input', () => UpdatemjBizAppsTasksTaskInput) input: UpdatemjBizAppsTasksTaskInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Tasks: Tasks', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsTasksTask_)
    async DeletemjBizAppsTasksTask(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Tasks: Tasks', key, options, provider, userPayload, pubSub);
    }
    
}