import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Common: Address Links
 */
export const mjBizAppsCommonAddressLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    AddressID: z.string().describe(`
        * * Field Name: AddressID
        * * Display Name: Address
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(700)
        * * Description: Primary key value(s) of the linked record. NVARCHAR(700) to support concatenated composite keys for entities without single-valued primary keys`),
    AddressTypeID: z.string().describe(`
        * * Field Name: AddressTypeID
        * * Display Name: Address Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Address Types (vwAddressTypes.ID)`),
    IsPrimary: z.boolean().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the primary address for the linked record. Only one address per entity record should be marked primary`),
    Rank: z.number().nullable().describe(`
        * * Field Name: Rank
        * * Display Name: Rank
        * * SQL Data Type: int
        * * Description: Sort order override for this specific link. When NULL, falls back to AddressType.DefaultRank. Lower values appear first`),
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
    Address: z.string().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity Name
        * * SQL Data Type: nvarchar(255)`),
    AddressType: z.string().describe(`
        * * Field Name: AddressType
        * * Display Name: Address Type Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsCommonAddressLinkEntityType = z.infer<typeof mjBizAppsCommonAddressLinkSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Address Types
 */
export const mjBizAppsCommonAddressTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name for the address type`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this address type`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    DefaultRank: z.number().describe(`
        * * Field Name: DefaultRank
        * * Display Name: Default Rank
        * * SQL Data Type: int
        * * Default Value: 100
        * * Description: Default sort order for this address type in dropdown lists. Lower values appear first. Can be overridden per-record via AddressLink.Rank`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`),
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

export type mjBizAppsCommonAddressTypeEntityType = z.infer<typeof mjBizAppsCommonAddressTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Addresses
 */
export const mjBizAppsCommonAddressSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Line1: z.string().describe(`
        * * Field Name: Line1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(255)
        * * Description: Street address line 1`),
    Line2: z.string().nullable().describe(`
        * * Field Name: Line2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(255)
        * * Description: Street address line 2 (suite, apt, etc.)`),
    Line3: z.string().nullable().describe(`
        * * Field Name: Line3
        * * Display Name: Address Line 3
        * * SQL Data Type: nvarchar(255)
        * * Description: Street address line 3 (additional detail)`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)
        * * Description: City or locality name`),
    StateProvince: z.string().nullable().describe(`
        * * Field Name: StateProvince
        * * Display Name: State / Province
        * * SQL Data Type: nvarchar(100)
        * * Description: State, province, or region`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal or ZIP code`),
    Country: z.string().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: US
        * * Description: Country code or name, defaults to US`),
    Latitude: z.number().nullable().describe(`
        * * Field Name: Latitude
        * * Display Name: Latitude
        * * SQL Data Type: decimal(9, 6)
        * * Description: Geographic latitude for mapping`),
    Longitude: z.number().nullable().describe(`
        * * Field Name: Longitude
        * * Display Name: Longitude
        * * SQL Data Type: decimal(9, 6)
        * * Description: Geographic longitude for mapping`),
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

export type mjBizAppsCommonAddressEntityType = z.infer<typeof mjBizAppsCommonAddressSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Contact Methods
 */
export const mjBizAppsCommonContactMethodSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    ContactTypeID: z.string().describe(`
        * * Field Name: ContactTypeID
        * * Display Name: Contact Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Contact Types (vwContactTypes.ID)`),
    Value: z.string().describe(`
        * * Field Name: Value
        * * Display Name: Contact Value
        * * SQL Data Type: nvarchar(500)
        * * Description: The contact value: phone number, email address, URL, social media handle, etc.`),
    Label: z.string().nullable().describe(`
        * * Field Name: Label
        * * Display Name: Label
        * * SQL Data Type: nvarchar(100)
        * * Description: Descriptive label such as Work cell, Personal Gmail, Corporate LinkedIn`),
    IsPrimary: z.boolean().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the primary contact method of its type for the linked person or organization`),
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
    Person: z.string().nullable().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(201)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization Name
        * * SQL Data Type: nvarchar(255)`),
    ContactType: z.string().describe(`
        * * Field Name: ContactType
        * * Display Name: Contact Type Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsCommonContactMethodEntityType = z.infer<typeof mjBizAppsCommonContactMethodSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Contact Types
 */
export const mjBizAppsCommonContactTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name for the contact type`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this contact type`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    DisplayRank: z.number().describe(`
        * * Field Name: DisplayRank
        * * Display Name: Display Rank
        * * SQL Data Type: int
        * * Default Value: 100
        * * Description: Sort order in dropdown lists. Lower values appear first`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`),
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

export type mjBizAppsCommonContactTypeEntityType = z.infer<typeof mjBizAppsCommonContactTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Organization Types
 */
export const mjBizAppsCommonOrganizationTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name for the organization type`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this organization type`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class for UI display`),
    DisplayRank: z.number().describe(`
        * * Field Name: DisplayRank
        * * Display Name: Display Rank
        * * SQL Data Type: int
        * * Default Value: 100
        * * Description: Sort order in dropdown lists. Lower values appear first`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`),
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

export type mjBizAppsCommonOrganizationTypeEntityType = z.infer<typeof mjBizAppsCommonOrganizationTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Organizations
 */
export const mjBizAppsCommonOrganizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Common or display name of the organization`),
    LegalName: z.string().nullable().describe(`
        * * Field Name: LegalName
        * * Display Name: Legal Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Full legal name if different from display name`),
    OrganizationTypeID: z.string().nullable().describe(`
        * * Field Name: OrganizationTypeID
        * * Display Name: Organization Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organization Types (vwOrganizationTypes.ID)`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(1000)
        * * Description: Primary website URL`),
    LogoURL: z.string().nullable().describe(`
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL to organization logo image`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the organization purpose and scope`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary contact email address`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Primary phone number`),
    FoundedDate: z.date().nullable().describe(`
        * * Field Name: FoundedDate
        * * Display Name: Founded Date
        * * SQL Data Type: date
        * * Description: Date the organization was founded or incorporated`),
    TaxID: z.string().nullable().describe(`
        * * Field Name: TaxID
        * * Display Name: Tax ID
        * * SQL Data Type: nvarchar(50)
        * * Description: Tax identification number such as EIN`),
    Status: z.union([z.literal('Active'), z.literal('Dissolved'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Dissolved
    *   * Inactive
        * * Description: Current status: Active, Inactive, or Dissolved`),
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
    OrganizationType: z.string().nullable().describe(`
        * * Field Name: OrganizationType
        * * Display Name: Organization Type
        * * SQL Data Type: nvarchar(100)`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent Name
        * * SQL Data Type: nvarchar(255)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsCommonOrganizationEntityType = z.infer<typeof mjBizAppsCommonOrganizationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: People
 */
export const mjBizAppsCommonPersonSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: First (given) name`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Last (family) name`),
    MiddleName: z.string().nullable().describe(`
        * * Field Name: MiddleName
        * * Display Name: Middle Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Middle name or initial`),
    Prefix: z.string().nullable().describe(`
        * * Field Name: Prefix
        * * Display Name: Prefix
        * * SQL Data Type: nvarchar(20)
        * * Description: Name prefix such as Dr., Mr., Ms., Rev.`),
    Suffix: z.string().nullable().describe(`
        * * Field Name: Suffix
        * * Display Name: Suffix
        * * SQL Data Type: nvarchar(20)
        * * Description: Name suffix such as Jr., III, PhD, Esq.`),
    PreferredName: z.string().nullable().describe(`
        * * Field Name: PreferredName
        * * Display Name: Preferred Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Nickname or preferred name the person goes by`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(200)
        * * Description: Professional or job title, e.g. VP of Engineering, Board Director`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email address for this person`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone Number
        * * SQL Data Type: nvarchar(50)
        * * Description: Primary phone number for this person`),
    DateOfBirth: z.date().nullable().describe(`
        * * Field Name: DateOfBirth
        * * Display Name: Date of Birth
        * * SQL Data Type: date
        * * Description: Date of birth`),
    Gender: z.string().nullable().describe(`
        * * Field Name: Gender
        * * Display Name: Gender
        * * SQL Data Type: nvarchar(50)
        * * Description: Gender identity`),
    PhotoURL: z.string().nullable().describe(`
        * * Field Name: PhotoURL
        * * Display Name: Photo URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL to profile photo or avatar image`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Biography
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Biographical text or notes about this person`),
    LinkedUserID: z.string().nullable().describe(`
        * * Field Name: LinkedUserID
        * * Display Name: Linked User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Deceased'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Deceased
    *   * Inactive
        * * Description: Current status: Active, Inactive, or Deceased`),
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
    DisplayName: z.string().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(201)`),
    LinkedUser: z.string().nullable().describe(`
        * * Field Name: LinkedUser
        * * Display Name: Linked User Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsCommonPersonEntityType = z.infer<typeof mjBizAppsCommonPersonSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Relationship Types
 */
export const mjBizAppsCommonRelationshipTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name for the relationship type, e.g. Employee, Spouse, Partner`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of this relationship type`),
    Category: z.union([z.literal('OrganizationToOrganization'), z.literal('PersonToOrganization'), z.literal('PersonToPerson')]).describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * OrganizationToOrganization
    *   * PersonToOrganization
    *   * PersonToPerson
        * * Description: Which entity types this relationship connects: PersonToPerson, PersonToOrganization, or OrganizationToOrganization`),
    IsDirectional: z.boolean().describe(`
        * * Field Name: IsDirectional
        * * Display Name: Is Directional
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether the relationship has a direction. False for symmetric relationships like Spouse or Partner`),
    ForwardLabel: z.string().nullable().describe(`
        * * Field Name: ForwardLabel
        * * Display Name: Forward Label
        * * SQL Data Type: nvarchar(100)
        * * Description: Label describing the From-to-To direction, e.g. is employee of, is parent of`),
    ReverseLabel: z.string().nullable().describe(`
        * * Field Name: ReverseLabel
        * * Display Name: Reverse Label
        * * SQL Data Type: nvarchar(100)
        * * Description: Label describing the To-to-From direction, e.g. employs, is child of`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records`),
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

export type mjBizAppsCommonRelationshipTypeEntityType = z.infer<typeof mjBizAppsCommonRelationshipTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Common: Relationships
 */
export const mjBizAppsCommonRelationshipSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    RelationshipTypeID: z.string().describe(`
        * * Field Name: RelationshipTypeID
        * * Display Name: Relationship Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Relationship Types (vwRelationshipTypes.ID)`),
    FromPersonID: z.string().nullable().describe(`
        * * Field Name: FromPersonID
        * * Display Name: From Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    FromOrganizationID: z.string().nullable().describe(`
        * * Field Name: FromOrganizationID
        * * Display Name: From Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    ToPersonID: z.string().nullable().describe(`
        * * Field Name: ToPersonID
        * * Display Name: To Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    ToOrganizationID: z.string().nullable().describe(`
        * * Field Name: ToOrganizationID
        * * Display Name: To Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)
        * * Description: Contextual title for this specific relationship, e.g. CEO, Primary Contact, Founding Member`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date
        * * Description: Date the relationship began`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date
        * * Description: Date the relationship ended, if applicable`),
    Status: z.union([z.literal('Active'), z.literal('Ended'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Ended
    *   * Inactive
        * * Description: Current status: Active, Inactive, or Ended`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Additional notes about this relationship`),
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
    RelationshipType: z.string().describe(`
        * * Field Name: RelationshipType
        * * Display Name: Relationship Type
        * * SQL Data Type: nvarchar(100)`),
    FromPerson: z.string().nullable().describe(`
        * * Field Name: FromPerson
        * * Display Name: From Person
        * * SQL Data Type: nvarchar(201)`),
    FromOrganization: z.string().nullable().describe(`
        * * Field Name: FromOrganization
        * * Display Name: From Organization Name
        * * SQL Data Type: nvarchar(255)`),
    ToPerson: z.string().nullable().describe(`
        * * Field Name: ToPerson
        * * Display Name: To Person
        * * SQL Data Type: nvarchar(201)`),
    ToOrganization: z.string().nullable().describe(`
        * * Field Name: ToOrganization
        * * Display Name: To Organization Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsCommonRelationshipEntityType = z.infer<typeof mjBizAppsCommonRelationshipSchema>;

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
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Activities
 */
export const mjBizAppsTasksTaskActivitySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    ActivityType: z.union([z.literal('AssignmentAdded'), z.literal('AssignmentRemoved'), z.literal('Completed'), z.literal('Created'), z.literal('DecisionRecorded'), z.literal('DependencyAdded'), z.literal('DependencyRemoved'), z.literal('DueDateChanged'), z.literal('PercentCompleteChanged'), z.literal('PriorityChanged'), z.literal('StatusChange')]).describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AssignmentAdded
    *   * AssignmentRemoved
    *   * Completed
    *   * Created
    *   * DecisionRecorded
    *   * DependencyAdded
    *   * DependencyRemoved
    *   * DueDateChanged
    *   * PercentCompleteChanged
    *   * PriorityChanged
    *   * StatusChange`),
    PreviousValue: z.string().nullable().describe(`
        * * Field Name: PreviousValue
        * * Display Name: Previous Value
        * * SQL Data Type: nvarchar(500)`),
    NewValue: z.string().nullable().describe(`
        * * Field Name: NewValue
        * * Display Name: New Value
        * * SQL Data Type: nvarchar(500)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    Person: z.string().nullable().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsTasksTaskActivityEntityType = z.infer<typeof mjBizAppsTasksTaskActivitySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Assignments
 */
export const mjBizAppsTasksTaskAssignmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    AssigneeEntityID: z.string().describe(`
        * * Field Name: AssigneeEntityID
        * * Display Name: Assignee Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)`),
    AssigneeRecordID: z.string().describe(`
        * * Field Name: AssigneeRecordID
        * * Display Name: Assignee Record ID
        * * SQL Data Type: nvarchar(450)`),
    RoleID: z.string().nullable().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Roles (vwTaskRoles.ID)`),
    RoleNotes: z.string().nullable().describe(`
        * * Field Name: RoleNotes
        * * Display Name: Role Notes
        * * SQL Data Type: nvarchar(255)`),
    Status: z.union([z.literal('Completed'), z.literal('InProgress'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * InProgress
    *   * Pending`),
    AssignedByPersonID: z.string().nullable().describe(`
        * * Field Name: AssignedByPersonID
        * * Display Name: Assigned By Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    AssignedAt: z.date().describe(`
        * * Field Name: AssignedAt
        * * Display Name: Assigned At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    AssigneeEntity: z.string().describe(`
        * * Field Name: AssigneeEntity
        * * Display Name: Assignee Entity
        * * SQL Data Type: nvarchar(255)`),
    Role: z.string().nullable().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)`),
    AssignedByPerson: z.string().nullable().describe(`
        * * Field Name: AssignedByPerson
        * * Display Name: Assigned By Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsTasksTaskAssignmentEntityType = z.infer<typeof mjBizAppsTasksTaskAssignmentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Categories
 */
export const mjBizAppsTasksTaskCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)`),
    ColorCode: z.string().nullable().describe(`
        * * Field Name: ColorCode
        * * Display Name: Color Code
        * * SQL Data Type: nvarchar(20)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 100`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsTasksTaskCategoryEntityType = z.infer<typeof mjBizAppsTasksTaskCategorySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Comments
 */
export const mjBizAppsTasksTaskCommentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Comments (vwTaskComments.ID)`),
    PersonID: z.string().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    Content: z.string().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)`),
    IsEdited: z.boolean().describe(`
        * * Field Name: IsEdited
        * * Display Name: Is Edited
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    Person: z.string().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(201)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsTasksTaskCommentEntityType = z.infer<typeof mjBizAppsTasksTaskCommentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Decision Outcomes
 */
export const mjBizAppsTasksTaskDecisionOutcomeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Human-readable outcome label (e.g. Approved, Rejected, Approved With Conditions).`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Stable machine code for the outcome, used by orchestration code to map outcome to task status (e.g. Approved, Rejected, ApprovedWithConditions).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 100
        * * Description: Display ordering for the outcome in decision pickers.`),
    IsTerminal: z.boolean().describe(`
        * * Field Name: IsTerminal
        * * Display Name: Is Terminal
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When 1, recording this outcome closes the approval (terminal). When 0, the decision is interim and the task remains open.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: When 0, the outcome is hidden from new decision pickers but preserved on historical decisions.`),
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

export type mjBizAppsTasksTaskDecisionOutcomeEntityType = z.infer<typeof mjBizAppsTasksTaskDecisionOutcomeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Decisions
 */
export const mjBizAppsTasksTaskDecisionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
        * * Description: The task this decision was recorded against.`),
    OutcomeID: z.string().describe(`
        * * Field Name: OutcomeID
        * * Display Name: Outcome ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Decision Outcomes (vwTaskDecisionOutcomes.ID)
        * * Description: The decision outcome (FK to TaskDecisionOutcome).`),
    DecidedByPersonID: z.string().nullable().describe(`
        * * Field Name: DecidedByPersonID
        * * Display Name: Decided By Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The Person who made the decision.`),
    DecidedAt: z.date().describe(`
        * * Field Name: DecidedAt
        * * Display Name: Decided At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
        * * Description: When the decision was recorded.`),
    DecisionNotes: z.string().nullable().describe(`
        * * Field Name: DecisionNotes
        * * Display Name: Decision Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-text rationale or conditions attached to the decision.`),
    TaskAssignmentID: z.string().nullable().describe(`
        * * Field Name: TaskAssignmentID
        * * Display Name: Task Assignment ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Assignments (vwTaskAssignments.ID)
        * * Description: Optional link to the specific TaskAssignment this decision belongs to, for per-assignee decisions in multi-approver flows. Null for a task-level decision.`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    Outcome: z.string().describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(100)`),
    DecidedByPerson: z.string().nullable().describe(`
        * * Field Name: DecidedByPerson
        * * Display Name: Decided By Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsTasksTaskDecisionEntityType = z.infer<typeof mjBizAppsTasksTaskDecisionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Dependencies
 */
export const mjBizAppsTasksTaskDependencySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    DependsOnTaskID: z.string().describe(`
        * * Field Name: DependsOnTaskID
        * * Display Name: Depends On Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    DependencyType: z.union([z.literal('FinishToFinish'), z.literal('FinishToStart'), z.literal('StartToFinish'), z.literal('StartToStart')]).describe(`
        * * Field Name: DependencyType
        * * Display Name: Dependency Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: FinishToStart
    * * Value List Type: List
    * * Possible Values 
    *   * FinishToFinish
    *   * FinishToStart
    *   * StartToFinish
    *   * StartToStart`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    DependsOnTask: z.string().describe(`
        * * Field Name: DependsOnTask
        * * Display Name: Depends On Task
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsTasksTaskDependencyEntityType = z.infer<typeof mjBizAppsTasksTaskDependencySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Links
 */
export const mjBizAppsTasksTaskLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsTasksTaskLinkEntityType = z.infer<typeof mjBizAppsTasksTaskLinkSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Notification Configs
 */
export const mjBizAppsTasksTaskNotificationConfigSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskTypeID: z.string().nullable().describe(`
        * * Field Name: TaskTypeID
        * * Display Name: Task Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)`),
    OverdueNotificationsEnabled: z.boolean().describe(`
        * * Field Name: OverdueNotificationsEnabled
        * * Display Name: Overdue Notifications Enabled
        * * SQL Data Type: bit
        * * Default Value: 1`),
    OverdueGracePeriodHours: z.number().describe(`
        * * Field Name: OverdueGracePeriodHours
        * * Display Name: Overdue Grace Period Hours
        * * SQL Data Type: int
        * * Default Value: 0`),
    OverdueRepeatIntervalHours: z.number().nullable().describe(`
        * * Field Name: OverdueRepeatIntervalHours
        * * Display Name: Overdue Repeat Interval Hours
        * * SQL Data Type: int`),
    NotifyAssignees: z.boolean().describe(`
        * * Field Name: NotifyAssignees
        * * Display Name: Notify Assignees
        * * SQL Data Type: bit
        * * Default Value: 1`),
    NotifyCreator: z.boolean().describe(`
        * * Field Name: NotifyCreator
        * * Display Name: Notify Creator
        * * SQL Data Type: bit
        * * Default Value: 1`),
    OverdueActionID: z.string().nullable().describe(`
        * * Field Name: OverdueActionID
        * * Display Name: Overdue Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)`),
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
    TaskType: z.string().nullable().describe(`
        * * Field Name: TaskType
        * * Display Name: Task Type
        * * SQL Data Type: nvarchar(100)`),
    OverdueAction: z.string().nullable().describe(`
        * * Field Name: OverdueAction
        * * Display Name: Overdue Action
        * * SQL Data Type: nvarchar(425)`),
});

export type mjBizAppsTasksTaskNotificationConfigEntityType = z.infer<typeof mjBizAppsTasksTaskNotificationConfigSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Notification Logs
 */
export const mjBizAppsTasksTaskNotificationLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    NotificationType: z.union([z.literal('Overdue'), z.literal('OverdueReminder')]).describe(`
        * * Field Name: NotificationType
        * * Display Name: Notification Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Overdue
    *   * OverdueReminder`),
    NotifiedUserID: z.string().describe(`
        * * Field Name: NotifiedUserID
        * * Display Name: Notified User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)`),
    NotifiedAt: z.date().describe(`
        * * Field Name: NotifiedAt
        * * Display Name: Notified At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    NotifiedUser: z.string().describe(`
        * * Field Name: NotifiedUser
        * * Display Name: Notified User
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsTasksTaskNotificationLogEntityType = z.infer<typeof mjBizAppsTasksTaskNotificationLogSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Roles
 */
export const mjBizAppsTasksTaskRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 100`),
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

export type mjBizAppsTasksTaskRoleEntityType = z.infer<typeof mjBizAppsTasksTaskRoleSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Tag Links
 */
export const mjBizAppsTasksTaskTagLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TaskID: z.string().describe(`
        * * Field Name: TaskID
        * * Display Name: Task ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    TagID: z.string().describe(`
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Tags (vwTaskTags.ID)`),
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
    Task: z.string().describe(`
        * * Field Name: Task
        * * Display Name: Task
        * * SQL Data Type: nvarchar(255)`),
    Tag: z.string().describe(`
        * * Field Name: Tag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsTasksTaskTagLinkEntityType = z.infer<typeof mjBizAppsTasksTaskTagLinkSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Tags
 */
export const mjBizAppsTasksTaskTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    ColorCode: z.string().nullable().describe(`
        * * Field Name: ColorCode
        * * Display Name: Color Code
        * * SQL Data Type: nvarchar(20)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
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

export type mjBizAppsTasksTaskTagEntityType = z.infer<typeof mjBizAppsTasksTaskTagSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Template Item Dependencies
 */
export const mjBizAppsTasksTaskTemplateItemDependencySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ItemID: z.string().describe(`
        * * Field Name: ItemID
        * * Display Name: Item ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)`),
    DependsOnItemID: z.string().describe(`
        * * Field Name: DependsOnItemID
        * * Display Name: Depends On Item ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)`),
    DependencyType: z.union([z.literal('FinishToFinish'), z.literal('FinishToStart'), z.literal('StartToFinish'), z.literal('StartToStart')]).describe(`
        * * Field Name: DependencyType
        * * Display Name: Dependency Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: FinishToStart
    * * Value List Type: List
    * * Possible Values 
    *   * FinishToFinish
    *   * FinishToStart
    *   * StartToFinish
    *   * StartToStart`),
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
    Item: z.string().describe(`
        * * Field Name: Item
        * * Display Name: Item
        * * SQL Data Type: nvarchar(255)`),
    DependsOnItem: z.string().describe(`
        * * Field Name: DependsOnItem
        * * Display Name: Depends On Item
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsTasksTaskTemplateItemDependencyEntityType = z.infer<typeof mjBizAppsTasksTaskTemplateItemDependencySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Template Item Roles
 */
export const mjBizAppsTasksTaskTemplateItemRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ItemID: z.string().describe(`
        * * Field Name: ItemID
        * * Display Name: Item ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Roles (vwTaskRoles.ID)`),
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
    Item: z.string().describe(`
        * * Field Name: Item
        * * Display Name: Item
        * * SQL Data Type: nvarchar(255)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsTasksTaskTemplateItemRoleEntityType = z.infer<typeof mjBizAppsTasksTaskTemplateItemRoleSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Template Items
 */
export const mjBizAppsTasksTaskTemplateItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TemplateID: z.string().describe(`
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Templates (vwTaskTemplates.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentItemID: z.string().nullable().describe(`
        * * Field Name: ParentItemID
        * * Display Name: Parent Item ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)`),
    Priority: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium`),
    DaysFromStart: z.number().nullable().describe(`
        * * Field Name: DaysFromStart
        * * Display Name: Days From Start
        * * SQL Data Type: int`),
    HoursEstimated: z.number().nullable().describe(`
        * * Field Name: HoursEstimated
        * * Display Name: Hours Estimated
        * * SQL Data Type: decimal(8, 2)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 100`),
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
    Template: z.string().describe(`
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)`),
    ParentItem: z.string().nullable().describe(`
        * * Field Name: ParentItem
        * * Display Name: Parent Item
        * * SQL Data Type: nvarchar(255)`),
    RootParentItemID: z.string().nullable().describe(`
        * * Field Name: RootParentItemID
        * * Display Name: Root Parent Item ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsTasksTaskTemplateItemEntityType = z.infer<typeof mjBizAppsTasksTaskTemplateItemSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Templates
 */
export const mjBizAppsTasksTaskTemplateSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)`),
    TypeID: z.string().nullable().describe(`
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    Type: z.string().nullable().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsTasksTaskTemplateEntityType = z.infer<typeof mjBizAppsTasksTaskTemplateSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Task Types
 */
export const mjBizAppsTasksTaskTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)`),
    DefaultPriority: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).describe(`
        * * Field Name: DefaultPriority
        * * Display Name: Default Priority
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium`),
    OnAssignActionID: z.string().nullable().describe(`
        * * Field Name: OnAssignActionID
        * * Display Name: On Assign Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)`),
    OnCompleteActionID: z.string().nullable().describe(`
        * * Field Name: OnCompleteActionID
        * * Display Name: On Complete Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)`),
    OnOverdueActionID: z.string().nullable().describe(`
        * * Field Name: OnOverdueActionID
        * * Display Name: On Overdue Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)`),
    OnPercentChangeActionID: z.string().nullable().describe(`
        * * Field Name: OnPercentChangeActionID
        * * Display Name: On Percent Change Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    OnRejectActionID: z.string().nullable().describe(`
        * * Field Name: OnRejectActionID
        * * Display Name: On Reject Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
        * * Description: Action invoked when a task of this type transitions to a rejected decision (post-commit, non-blocking). Used by approval workflows.`),
    OnCancelActionID: z.string().nullable().describe(`
        * * Field Name: OnCancelActionID
        * * Display Name: On Cancel Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
        * * Description: Action invoked when a task of this type transitions to Cancelled (post-commit, non-blocking).`),
    OnAssignAction: z.string().nullable().describe(`
        * * Field Name: OnAssignAction
        * * Display Name: On Assign Action
        * * SQL Data Type: nvarchar(425)`),
    OnCompleteAction: z.string().nullable().describe(`
        * * Field Name: OnCompleteAction
        * * Display Name: On Complete Action
        * * SQL Data Type: nvarchar(425)`),
    OnOverdueAction: z.string().nullable().describe(`
        * * Field Name: OnOverdueAction
        * * Display Name: On Overdue Action
        * * SQL Data Type: nvarchar(425)`),
    OnPercentChangeAction: z.string().nullable().describe(`
        * * Field Name: OnPercentChangeAction
        * * Display Name: On Percent Change Action
        * * SQL Data Type: nvarchar(425)`),
    OnRejectAction: z.string().nullable().describe(`
        * * Field Name: OnRejectAction
        * * Display Name: On Reject Action
        * * SQL Data Type: nvarchar(425)`),
    OnCancelAction: z.string().nullable().describe(`
        * * Field Name: OnCancelAction
        * * Display Name: On Cancel Action
        * * SQL Data Type: nvarchar(425)`),
});

export type mjBizAppsTasksTaskTypeEntityType = z.infer<typeof mjBizAppsTasksTaskTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Tasks: Tasks
 */
export const mjBizAppsTasksTaskSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    TypeID: z.string().describe(`
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)`),
    Status: z.union([z.literal('Blocked'), z.literal('Cancelled'), z.literal('Completed'), z.literal('InProgress'), z.literal('Open')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Blocked
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Open`),
    Priority: z.union([z.literal('Critical'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium`),
    StartedAt: z.date().nullable().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetimeoffset`),
    DueAt: z.date().nullable().describe(`
        * * Field Name: DueAt
        * * Display Name: Due At
        * * SQL Data Type: datetimeoffset`),
    CompletedAt: z.date().nullable().describe(`
        * * Field Name: CompletedAt
        * * Display Name: Completed At
        * * SQL Data Type: datetimeoffset`),
    HoursEstimated: z.number().nullable().describe(`
        * * Field Name: HoursEstimated
        * * Display Name: Hours Estimated
        * * SQL Data Type: decimal(8, 2)`),
    HoursActual: z.number().nullable().describe(`
        * * Field Name: HoursActual
        * * Display Name: Hours Actual
        * * SQL Data Type: decimal(8, 2)`),
    PercentComplete: z.number().describe(`
        * * Field Name: PercentComplete
        * * Display Name: Percent Complete
        * * SQL Data Type: int
        * * Default Value: 0`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 100`),
    BlockedReason: z.string().nullable().describe(`
        * * Field Name: BlockedReason
        * * Display Name: Blocked Reason
        * * SQL Data Type: nvarchar(MAX)`),
    CompletionNotes: z.string().nullable().describe(`
        * * Field Name: CompletionNotes
        * * Display Name: Completion Notes
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedByPersonID: z.string().nullable().describe(`
        * * Field Name: CreatedByPersonID
        * * Display Name: Created By Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)`),
    OverdueNotifiedAt: z.date().nullable().describe(`
        * * Field Name: OverdueNotifiedAt
        * * Display Name: Overdue Notified At
        * * SQL Data Type: datetimeoffset`),
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
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
    CreatedByPerson: z.string().nullable().describe(`
        * * Field Name: CreatedByPerson
        * * Display Name: Created By Person
        * * SQL Data Type: nvarchar(201)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type mjBizAppsTasksTaskEntityType = z.infer<typeof mjBizAppsTasksTaskSchema>;
 
 

/**
 * MJ_BizApps_Common: Address Links - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: AddressLink
 * * Base View: vwAddressLinks
 * * @description Polymorphic link table connecting Address records to any entity record in the system via EntityID and RecordID
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Address Links')
export class mjBizAppsCommonAddressLinkEntity extends BaseEntity<mjBizAppsCommonAddressLinkEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Address Links record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Address Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonAddressLinkEntity
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
    * * Field Name: AddressID
    * * Display Name: Address
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Addresses (vwAddresses.ID)
    */
    get AddressID(): string {
        return this.Get('AddressID');
    }
    set AddressID(value: string) {
        this.Set('AddressID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    */
    get EntityID(): string {
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(700)
    * * Description: Primary key value(s) of the linked record. NVARCHAR(700) to support concatenated composite keys for entities without single-valued primary keys
    */
    get RecordID(): string {
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: AddressTypeID
    * * Display Name: Address Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Address Types (vwAddressTypes.ID)
    */
    get AddressTypeID(): string {
        return this.Get('AddressTypeID');
    }
    set AddressTypeID(value: string) {
        this.Set('AddressTypeID', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this is the primary address for the linked record. Only one address per entity record should be marked primary
    */
    get IsPrimary(): boolean {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean) {
        this.Set('IsPrimary', value);
    }

    /**
    * * Field Name: Rank
    * * Display Name: Rank
    * * SQL Data Type: int
    * * Description: Sort order override for this specific link. When NULL, falls back to AddressType.DefaultRank. Lower values appear first
    */
    get Rank(): number | null {
        return this.Get('Rank');
    }
    set Rank(value: number | null) {
        this.Set('Rank', value);
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
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(255)
    */
    get Address(): string {
        return this.Get('Address');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity Name
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {
        return this.Get('Entity');
    }

    /**
    * * Field Name: AddressType
    * * Display Name: Address Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get AddressType(): string {
        return this.Get('AddressType');
    }
}


/**
 * MJ_BizApps_Common: Address Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: AddressType
 * * Base View: vwAddressTypes
 * * @description Categories of addresses such as Home, Work, Mailing, Billing
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Address Types')
export class mjBizAppsCommonAddressTypeEntity extends BaseEntity<mjBizAppsCommonAddressTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Address Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Address Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonAddressTypeEntity
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name for the address type
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
    * * Description: Detailed description of this address type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Field Name: DefaultRank
    * * Display Name: Default Rank
    * * SQL Data Type: int
    * * Default Value: 100
    * * Description: Default sort order for this address type in dropdown lists. Lower values appear first. Can be overridden per-record via AddressLink.Rank
    */
    get DefaultRank(): number {
        return this.Get('DefaultRank');
    }
    set DefaultRank(value: number) {
        this.Set('DefaultRank', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records
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
 * MJ_BizApps_Common: Addresses - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: Address
 * * Base View: vwAddresses
 * * @description Standalone physical address records linked to entities via AddressLink for sharing across people and organizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Addresses')
export class mjBizAppsCommonAddressEntity extends BaseEntity<mjBizAppsCommonAddressEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Addresses record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Addresses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonAddressEntity
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
    * * Field Name: Line1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(255)
    * * Description: Street address line 1
    */
    get Line1(): string {
        return this.Get('Line1');
    }
    set Line1(value: string) {
        this.Set('Line1', value);
    }

    /**
    * * Field Name: Line2
    * * Display Name: Address Line 2
    * * SQL Data Type: nvarchar(255)
    * * Description: Street address line 2 (suite, apt, etc.)
    */
    get Line2(): string | null {
        return this.Get('Line2');
    }
    set Line2(value: string | null) {
        this.Set('Line2', value);
    }

    /**
    * * Field Name: Line3
    * * Display Name: Address Line 3
    * * SQL Data Type: nvarchar(255)
    * * Description: Street address line 3 (additional detail)
    */
    get Line3(): string | null {
        return this.Get('Line3');
    }
    set Line3(value: string | null) {
        this.Set('Line3', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    * * Description: City or locality name
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: StateProvince
    * * Display Name: State / Province
    * * SQL Data Type: nvarchar(100)
    * * Description: State, province, or region
    */
    get StateProvince(): string | null {
        return this.Get('StateProvince');
    }
    set StateProvince(value: string | null) {
        this.Set('StateProvince', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal or ZIP code
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: US
    * * Description: Country code or name, defaults to US
    */
    get Country(): string {
        return this.Get('Country');
    }
    set Country(value: string) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: Latitude
    * * Display Name: Latitude
    * * SQL Data Type: decimal(9, 6)
    * * Description: Geographic latitude for mapping
    */
    get Latitude(): number | null {
        return this.Get('Latitude');
    }
    set Latitude(value: number | null) {
        this.Set('Latitude', value);
    }

    /**
    * * Field Name: Longitude
    * * Display Name: Longitude
    * * SQL Data Type: decimal(9, 6)
    * * Description: Geographic longitude for mapping
    */
    get Longitude(): number | null {
        return this.Get('Longitude');
    }
    set Longitude(value: number | null) {
        this.Set('Longitude', value);
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
 * MJ_BizApps_Common: Contact Methods - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: ContactMethod
 * * Base View: vwContactMethods
 * * @description Additional contact methods for people and organizations beyond the primary email and phone fields
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Contact Methods')
export class mjBizAppsCommonContactMethodEntity extends BaseEntity<mjBizAppsCommonContactMethodEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Contact Methods record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Contact Methods record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonContactMethodEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Common: Contact Methods entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Each record must be linked to either a person or an organization. This ensures that contact information is correctly attributed to exactly one entity and prevents data ambiguity caused by having both or neither assigned.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidatePersonIDOrOrganizationIDExclusivity(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Each record must be linked to either a person or an organization. This ensures that contact information is correctly attributed to exactly one entity and prevents data ambiguity caused by having both or neither assigned.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePersonIDOrOrganizationIDExclusivity(result: ValidationResult) {
    	// Check if both fields are null or if both fields are populated
    	const hasPerson = this.PersonID != null;
    	const hasOrganization = this.OrganizationID != null;
    
    	if (hasPerson === hasOrganization) {
    		const errorMessage = "Each record must be associated with either a person or an organization, but not both.";
    		result.Errors.push(new ValidationErrorInfo(
    			"PersonID",
    			errorMessage,
    			this.PersonID,
    			ValidationErrorType.Failure
    		));
    		result.Errors.push(new ValidationErrorInfo(
    			"OrganizationID",
    			errorMessage,
    			this.OrganizationID,
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
    * * Field Name: PersonID
    * * Display Name: Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: ContactTypeID
    * * Display Name: Contact Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Contact Types (vwContactTypes.ID)
    */
    get ContactTypeID(): string {
        return this.Get('ContactTypeID');
    }
    set ContactTypeID(value: string) {
        this.Set('ContactTypeID', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Contact Value
    * * SQL Data Type: nvarchar(500)
    * * Description: The contact value: phone number, email address, URL, social media handle, etc.
    */
    get Value(): string {
        return this.Get('Value');
    }
    set Value(value: string) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Label
    * * Display Name: Label
    * * SQL Data Type: nvarchar(100)
    * * Description: Descriptive label such as Work cell, Personal Gmail, Corporate LinkedIn
    */
    get Label(): string | null {
        return this.Get('Label');
    }
    set Label(value: string | null) {
        this.Set('Label', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this is the primary contact method of its type for the linked person or organization
    */
    get IsPrimary(): boolean {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean) {
        this.Set('IsPrimary', value);
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
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(201)
    */
    get Person(): string | null {
        return this.Get('Person');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }

    /**
    * * Field Name: ContactType
    * * Display Name: Contact Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get ContactType(): string {
        return this.Get('ContactType');
    }
}


/**
 * MJ_BizApps_Common: Contact Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: ContactType
 * * Base View: vwContactTypes
 * * @description Categories of contact methods such as Phone, Mobile, Email, LinkedIn, Website
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Contact Types')
export class mjBizAppsCommonContactTypeEntity extends BaseEntity<mjBizAppsCommonContactTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Contact Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Contact Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonContactTypeEntity
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name for the contact type
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
    * * Description: Detailed description of this contact type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Default Value: 100
    * * Description: Sort order in dropdown lists. Lower values appear first
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
    * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records
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
 * MJ_BizApps_Common: Organization Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: OrganizationType
 * * Base View: vwOrganizationTypes
 * * @description Categories of organizations such as Company, Non-Profit, Association, Government
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Organization Types')
export class mjBizAppsCommonOrganizationTypeEntity extends BaseEntity<mjBizAppsCommonOrganizationTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Organization Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Organization Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonOrganizationTypeEntity
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name for the organization type
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
    * * Description: Detailed description of this organization type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Default Value: 100
    * * Description: Sort order in dropdown lists. Lower values appear first
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
    * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records
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
 * MJ_BizApps_Common: Organizations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * @description Companies, associations, government bodies, and other organizations with hierarchy support
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Organizations')
export class mjBizAppsCommonOrganizationEntity extends BaseEntity<mjBizAppsCommonOrganizationEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Organizations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonOrganizationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Common: Organizations - Delete method override to wrap in transaction since CascadeDeletes is true.
    * Wrapping in a transaction ensures that all cascade delete operations are handled atomically.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsCommonOrganizationEntity
    * @returns {Promise<boolean>} - true if successful, false otherwise
    */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (Metadata.Provider.ProviderType === ProviderType.Database) { // global-provider-ok: codegen runs offline against a single provider
            // For database providers, use the transaction methods directly
            const provider = Metadata.Provider as DatabaseProviderBase; // global-provider-ok: codegen runs offline against a single provider
            
            try {
                await provider.BeginTransaction();
                const result = await super.Delete(options);
                
                if (result) {
                    await provider.CommitTransaction();
                    return true;
                } else {
                    await provider.RollbackTransaction();
                    return false;
                }
            } catch (error) {
                await provider.RollbackTransaction();
                throw error;
            }
        } else {
            // For network providers, cascading deletes are handled server-side
            return super.Delete(options);
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
    * * Description: Common or display name of the organization
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: LegalName
    * * Display Name: Legal Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Full legal name if different from display name
    */
    get LegalName(): string | null {
        return this.Get('LegalName');
    }
    set LegalName(value: string | null) {
        this.Set('LegalName', value);
    }

    /**
    * * Field Name: OrganizationTypeID
    * * Display Name: Organization Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organization Types (vwOrganizationTypes.ID)
    */
    get OrganizationTypeID(): string | null {
        return this.Get('OrganizationTypeID');
    }
    set OrganizationTypeID(value: string | null) {
        this.Set('OrganizationTypeID', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(1000)
    * * Description: Primary website URL
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: LogoURL
    * * Display Name: Logo URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL to organization logo image
    */
    get LogoURL(): string | null {
        return this.Get('LogoURL');
    }
    set LogoURL(value: string | null) {
        this.Set('LogoURL', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the organization purpose and scope
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary contact email address
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(50)
    * * Description: Primary phone number
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: FoundedDate
    * * Display Name: Founded Date
    * * SQL Data Type: date
    * * Description: Date the organization was founded or incorporated
    */
    get FoundedDate(): Date | null {
        return this.Get('FoundedDate');
    }
    set FoundedDate(value: Date | null) {
        this.Set('FoundedDate', value);
    }

    /**
    * * Field Name: TaxID
    * * Display Name: Tax ID
    * * SQL Data Type: nvarchar(50)
    * * Description: Tax identification number such as EIN
    */
    get TaxID(): string | null {
        return this.Get('TaxID');
    }
    set TaxID(value: string | null) {
        this.Set('TaxID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Dissolved
    *   * Inactive
    * * Description: Current status: Active, Inactive, or Dissolved
    */
    get Status(): 'Active' | 'Dissolved' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Dissolved' | 'Inactive') {
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
    * * Field Name: OrganizationType
    * * Display Name: Organization Type
    * * SQL Data Type: nvarchar(100)
    */
    get OrganizationType(): string | null {
        return this.Get('OrganizationType');
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
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * MJ_BizApps_Common: People - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: Person
 * * Base View: vwPeople
 * * @description Individual people, optionally linked to MJ system user accounts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: People')
export class mjBizAppsCommonPersonEntity extends BaseEntity<mjBizAppsCommonPersonEntityType> {
    /**
    * Loads the MJ_BizApps_Common: People record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: People record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonPersonEntity
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
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: First (given) name
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Last (family) name
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: MiddleName
    * * Display Name: Middle Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Middle name or initial
    */
    get MiddleName(): string | null {
        return this.Get('MiddleName');
    }
    set MiddleName(value: string | null) {
        this.Set('MiddleName', value);
    }

    /**
    * * Field Name: Prefix
    * * Display Name: Prefix
    * * SQL Data Type: nvarchar(20)
    * * Description: Name prefix such as Dr., Mr., Ms., Rev.
    */
    get Prefix(): string | null {
        return this.Get('Prefix');
    }
    set Prefix(value: string | null) {
        this.Set('Prefix', value);
    }

    /**
    * * Field Name: Suffix
    * * Display Name: Suffix
    * * SQL Data Type: nvarchar(20)
    * * Description: Name suffix such as Jr., III, PhD, Esq.
    */
    get Suffix(): string | null {
        return this.Get('Suffix');
    }
    set Suffix(value: string | null) {
        this.Set('Suffix', value);
    }

    /**
    * * Field Name: PreferredName
    * * Display Name: Preferred Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Nickname or preferred name the person goes by
    */
    get PreferredName(): string | null {
        return this.Get('PreferredName');
    }
    set PreferredName(value: string | null) {
        this.Set('PreferredName', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(200)
    * * Description: Professional or job title, e.g. VP of Engineering, Board Director
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary email address for this person
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone Number
    * * SQL Data Type: nvarchar(50)
    * * Description: Primary phone number for this person
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: DateOfBirth
    * * Display Name: Date of Birth
    * * SQL Data Type: date
    * * Description: Date of birth
    */
    get DateOfBirth(): Date | null {
        return this.Get('DateOfBirth');
    }
    set DateOfBirth(value: Date | null) {
        this.Set('DateOfBirth', value);
    }

    /**
    * * Field Name: Gender
    * * Display Name: Gender
    * * SQL Data Type: nvarchar(50)
    * * Description: Gender identity
    */
    get Gender(): string | null {
        return this.Get('Gender');
    }
    set Gender(value: string | null) {
        this.Set('Gender', value);
    }

    /**
    * * Field Name: PhotoURL
    * * Display Name: Photo URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL to profile photo or avatar image
    */
    get PhotoURL(): string | null {
        return this.Get('PhotoURL');
    }
    set PhotoURL(value: string | null) {
        this.Set('PhotoURL', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Biography
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Biographical text or notes about this person
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
    }

    /**
    * * Field Name: LinkedUserID
    * * Display Name: Linked User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get LinkedUserID(): string | null {
        return this.Get('LinkedUserID');
    }
    set LinkedUserID(value: string | null) {
        this.Set('LinkedUserID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Deceased
    *   * Inactive
    * * Description: Current status: Active, Inactive, or Deceased
    */
    get Status(): 'Active' | 'Deceased' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Deceased' | 'Inactive') {
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
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(201)
    */
    get DisplayName(): string {
        return this.Get('DisplayName');
    }

    /**
    * * Field Name: LinkedUser
    * * Display Name: Linked User Name
    * * SQL Data Type: nvarchar(100)
    */
    get LinkedUser(): string | null {
        return this.Get('LinkedUser');
    }
}


/**
 * MJ_BizApps_Common: Relationship Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: RelationshipType
 * * Base View: vwRelationshipTypes
 * * @description Defines types of relationships between people and organizations with directionality and labeling
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Relationship Types')
export class mjBizAppsCommonRelationshipTypeEntity extends BaseEntity<mjBizAppsCommonRelationshipTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Relationship Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Relationship Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonRelationshipTypeEntity
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name for the relationship type, e.g. Employee, Spouse, Partner
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
    * * Description: Detailed description of this relationship type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * OrganizationToOrganization
    *   * PersonToOrganization
    *   * PersonToPerson
    * * Description: Which entity types this relationship connects: PersonToPerson, PersonToOrganization, or OrganizationToOrganization
    */
    get Category(): 'OrganizationToOrganization' | 'PersonToOrganization' | 'PersonToPerson' {
        return this.Get('Category');
    }
    set Category(value: 'OrganizationToOrganization' | 'PersonToOrganization' | 'PersonToPerson') {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsDirectional
    * * Display Name: Is Directional
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether the relationship has a direction. False for symmetric relationships like Spouse or Partner
    */
    get IsDirectional(): boolean {
        return this.Get('IsDirectional');
    }
    set IsDirectional(value: boolean) {
        this.Set('IsDirectional', value);
    }

    /**
    * * Field Name: ForwardLabel
    * * Display Name: Forward Label
    * * SQL Data Type: nvarchar(100)
    * * Description: Label describing the From-to-To direction, e.g. is employee of, is parent of
    */
    get ForwardLabel(): string | null {
        return this.Get('ForwardLabel');
    }
    set ForwardLabel(value: string | null) {
        this.Set('ForwardLabel', value);
    }

    /**
    * * Field Name: ReverseLabel
    * * Display Name: Reverse Label
    * * SQL Data Type: nvarchar(100)
    * * Description: Label describing the To-to-From direction, e.g. employs, is child of
    */
    get ReverseLabel(): string | null {
        return this.Get('ReverseLabel');
    }
    set ReverseLabel(value: string | null) {
        this.Set('ReverseLabel', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this type is available for selection in the UI. Inactive types are hidden from dropdowns but preserved for existing records
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
 * MJ_BizApps_Common: Relationships - strongly typed entity sub-class
 * * Schema: __mj_BizAppsCommon
 * * Base Table: Relationship
 * * Base View: vwRelationships
 * * @description Typed, directional links between people and organizations supporting Person-to-Person, Person-to-Organization, and Organization-to-Organization relationships
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Common: Relationships')
export class mjBizAppsCommonRelationshipEntity extends BaseEntity<mjBizAppsCommonRelationshipEntityType> {
    /**
    * Loads the MJ_BizApps_Common: Relationships record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Common: Relationships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsCommonRelationshipEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Common: Relationships entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A relationship must be linked to exactly one source: either a person or an organization. This ensures that the origin of the relationship is clearly defined and prevents data where both or neither are specified.
    * * Table-Level: A relationship must be linked to exactly one target: either a person or an organization. This ensures that the destination of the relationship is clearly defined and prevents ambiguous or missing links.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateFromPersonOrFromOrganizationExclusivity(result);
        this.ValidateToPersonOrToOrganizationExclusivity(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A relationship must be linked to exactly one source: either a person or an organization. This ensures that the origin of the relationship is clearly defined and prevents data where both or neither are specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateFromPersonOrFromOrganizationExclusivity(result: ValidationResult) {
    	const hasPerson = this.FromPersonID != null;
    	const hasOrg = this.FromOrganizationID != null;
    
    	if ((hasPerson && hasOrg) || (!hasPerson && !hasOrg)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"FromPersonID",
    			"You must specify either a Person or an Organization as the source, but not both and not neither.",
    			this.FromPersonID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * A relationship must be linked to exactly one target: either a person or an organization. This ensures that the destination of the relationship is clearly defined and prevents ambiguous or missing links.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateToPersonOrToOrganizationExclusivity(result: ValidationResult) {
    	// Ensure that exactly one of ToPersonID or ToOrganizationID is populated
    	const hasPerson = this.ToPersonID != null;
    	const hasOrganization = this.ToOrganizationID != null;
    
    	if ((hasPerson && hasOrganization) || (!hasPerson && !hasOrganization)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ToPersonID",
    			"A relationship must be associated with either a person or an organization, but not both and not neither.",
    			this.ToPersonID,
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
    * * Field Name: RelationshipTypeID
    * * Display Name: Relationship Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Relationship Types (vwRelationshipTypes.ID)
    */
    get RelationshipTypeID(): string {
        return this.Get('RelationshipTypeID');
    }
    set RelationshipTypeID(value: string) {
        this.Set('RelationshipTypeID', value);
    }

    /**
    * * Field Name: FromPersonID
    * * Display Name: From Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get FromPersonID(): string | null {
        return this.Get('FromPersonID');
    }
    set FromPersonID(value: string | null) {
        this.Set('FromPersonID', value);
    }

    /**
    * * Field Name: FromOrganizationID
    * * Display Name: From Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get FromOrganizationID(): string | null {
        return this.Get('FromOrganizationID');
    }
    set FromOrganizationID(value: string | null) {
        this.Set('FromOrganizationID', value);
    }

    /**
    * * Field Name: ToPersonID
    * * Display Name: To Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get ToPersonID(): string | null {
        return this.Get('ToPersonID');
    }
    set ToPersonID(value: string | null) {
        this.Set('ToPersonID', value);
    }

    /**
    * * Field Name: ToOrganizationID
    * * Display Name: To Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    */
    get ToOrganizationID(): string | null {
        return this.Get('ToOrganizationID');
    }
    set ToOrganizationID(value: string | null) {
        this.Set('ToOrganizationID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    * * Description: Contextual title for this specific relationship, e.g. CEO, Primary Contact, Founding Member
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    * * Description: Date the relationship began
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: date
    * * Description: Date the relationship ended, if applicable
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Ended
    *   * Inactive
    * * Description: Current status: Active, Inactive, or Ended
    */
    get Status(): 'Active' | 'Ended' | 'Inactive' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Ended' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional notes about this relationship
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
    * * Field Name: RelationshipType
    * * Display Name: Relationship Type
    * * SQL Data Type: nvarchar(100)
    */
    get RelationshipType(): string {
        return this.Get('RelationshipType');
    }

    /**
    * * Field Name: FromPerson
    * * Display Name: From Person
    * * SQL Data Type: nvarchar(201)
    */
    get FromPerson(): string | null {
        return this.Get('FromPerson');
    }

    /**
    * * Field Name: FromOrganization
    * * Display Name: From Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get FromOrganization(): string | null {
        return this.Get('FromOrganization');
    }

    /**
    * * Field Name: ToPerson
    * * Display Name: To Person
    * * SQL Data Type: nvarchar(201)
    */
    get ToPerson(): string | null {
        return this.Get('ToPerson');
    }

    /**
    * * Field Name: ToOrganization
    * * Display Name: To Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get ToOrganization(): string | null {
        return this.Get('ToOrganization');
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


/**
 * MJ_BizApps_Tasks: Task Activities - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskActivity
 * * Base View: vwTaskActivities
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Activities')
export class mjBizAppsTasksTaskActivityEntity extends BaseEntity<mjBizAppsTasksTaskActivityEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Activities record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskActivityEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AssignmentAdded
    *   * AssignmentRemoved
    *   * Completed
    *   * Created
    *   * DecisionRecorded
    *   * DependencyAdded
    *   * DependencyRemoved
    *   * DueDateChanged
    *   * PercentCompleteChanged
    *   * PriorityChanged
    *   * StatusChange
    */
    get ActivityType(): 'AssignmentAdded' | 'AssignmentRemoved' | 'Completed' | 'Created' | 'DecisionRecorded' | 'DependencyAdded' | 'DependencyRemoved' | 'DueDateChanged' | 'PercentCompleteChanged' | 'PriorityChanged' | 'StatusChange' {
        return this.Get('ActivityType');
    }
    set ActivityType(value: 'AssignmentAdded' | 'AssignmentRemoved' | 'Completed' | 'Created' | 'DecisionRecorded' | 'DependencyAdded' | 'DependencyRemoved' | 'DueDateChanged' | 'PercentCompleteChanged' | 'PriorityChanged' | 'StatusChange') {
        this.Set('ActivityType', value);
    }

    /**
    * * Field Name: PreviousValue
    * * Display Name: Previous Value
    * * SQL Data Type: nvarchar(500)
    */
    get PreviousValue(): string | null {
        return this.Get('PreviousValue');
    }
    set PreviousValue(value: string | null) {
        this.Set('PreviousValue', value);
    }

    /**
    * * Field Name: NewValue
    * * Display Name: New Value
    * * SQL Data Type: nvarchar(500)
    */
    get NewValue(): string | null {
        return this.Get('NewValue');
    }
    set NewValue(value: string | null) {
        this.Set('NewValue', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(201)
    */
    get Person(): string | null {
        return this.Get('Person');
    }
}


/**
 * MJ_BizApps_Tasks: Task Assignments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskAssignment
 * * Base View: vwTaskAssignments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Assignments')
export class mjBizAppsTasksTaskAssignmentEntity extends BaseEntity<mjBizAppsTasksTaskAssignmentEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Assignments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Assignments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskAssignmentEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: AssigneeEntityID
    * * Display Name: Assignee Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    */
    get AssigneeEntityID(): string {
        return this.Get('AssigneeEntityID');
    }
    set AssigneeEntityID(value: string) {
        this.Set('AssigneeEntityID', value);
    }

    /**
    * * Field Name: AssigneeRecordID
    * * Display Name: Assignee Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get AssigneeRecordID(): string {
        return this.Get('AssigneeRecordID');
    }
    set AssigneeRecordID(value: string) {
        this.Set('AssigneeRecordID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Roles (vwTaskRoles.ID)
    */
    get RoleID(): string | null {
        return this.Get('RoleID');
    }
    set RoleID(value: string | null) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: RoleNotes
    * * Display Name: Role Notes
    * * SQL Data Type: nvarchar(255)
    */
    get RoleNotes(): string | null {
        return this.Get('RoleNotes');
    }
    set RoleNotes(value: string | null) {
        this.Set('RoleNotes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Completed
    *   * InProgress
    *   * Pending
    */
    get Status(): 'Completed' | 'InProgress' | 'Pending' {
        return this.Get('Status');
    }
    set Status(value: 'Completed' | 'InProgress' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AssignedByPersonID
    * * Display Name: Assigned By Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get AssignedByPersonID(): string | null {
        return this.Get('AssignedByPersonID');
    }
    set AssignedByPersonID(value: string | null) {
        this.Set('AssignedByPersonID', value);
    }

    /**
    * * Field Name: AssignedAt
    * * Display Name: Assigned At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get AssignedAt(): Date {
        return this.Get('AssignedAt');
    }
    set AssignedAt(value: Date) {
        this.Set('AssignedAt', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: AssigneeEntity
    * * Display Name: Assignee Entity
    * * SQL Data Type: nvarchar(255)
    */
    get AssigneeEntity(): string {
        return this.Get('AssigneeEntity');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    */
    get Role(): string | null {
        return this.Get('Role');
    }

    /**
    * * Field Name: AssignedByPerson
    * * Display Name: Assigned By Person
    * * SQL Data Type: nvarchar(201)
    */
    get AssignedByPerson(): string | null {
        return this.Get('AssignedByPerson');
    }
}


/**
 * MJ_BizApps_Tasks: Task Categories - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskCategory
 * * Base View: vwTaskCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Categories')
export class mjBizAppsTasksTaskCategoryEntity extends BaseEntity<mjBizAppsTasksTaskCategoryEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Categories record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskCategoryEntity
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: ColorCode
    * * Display Name: Color Code
    * * SQL Data Type: nvarchar(20)
    */
    get ColorCode(): string | null {
        return this.Get('ColorCode');
    }
    set ColorCode(value: string | null) {
        this.Set('ColorCode', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 100
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
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
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * MJ_BizApps_Tasks: Task Comments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskComment
 * * Base View: vwTaskComments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Comments')
export class mjBizAppsTasksTaskCommentEntity extends BaseEntity<mjBizAppsTasksTaskCommentEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Comments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Comments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskCommentEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Comments (vwTaskComments.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get PersonID(): string {
        return this.Get('PersonID');
    }
    set PersonID(value: string) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content(): string {
        return this.Get('Content');
    }
    set Content(value: string) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: IsEdited
    * * Display Name: Is Edited
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsEdited(): boolean {
        return this.Get('IsEdited');
    }
    set IsEdited(value: boolean) {
        this.Set('IsEdited', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(201)
    */
    get Person(): string {
        return this.Get('Person');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * MJ_BizApps_Tasks: Task Decision Outcomes - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskDecisionOutcome
 * * Base View: vwTaskDecisionOutcomes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Decision Outcomes')
export class mjBizAppsTasksTaskDecisionOutcomeEntity extends BaseEntity<mjBizAppsTasksTaskDecisionOutcomeEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Decision Outcomes record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Decision Outcomes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskDecisionOutcomeEntity
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Human-readable outcome label (e.g. Approved, Rejected, Approved With Conditions).
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Stable machine code for the outcome, used by orchestration code to map outcome to task status (e.g. Approved, Rejected, ApprovedWithConditions).
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 100
    * * Description: Display ordering for the outcome in decision pickers.
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsTerminal
    * * Display Name: Is Terminal
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 1, recording this outcome closes the approval (terminal). When 0, the decision is interim and the task remains open.
    */
    get IsTerminal(): boolean {
        return this.Get('IsTerminal');
    }
    set IsTerminal(value: boolean) {
        this.Set('IsTerminal', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When 0, the outcome is hidden from new decision pickers but preserved on historical decisions.
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
 * MJ_BizApps_Tasks: Task Decisions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskDecision
 * * Base View: vwTaskDecisions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Decisions')
export class mjBizAppsTasksTaskDecisionEntity extends BaseEntity<mjBizAppsTasksTaskDecisionEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Decisions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Decisions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskDecisionEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    * * Description: The task this decision was recorded against.
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: OutcomeID
    * * Display Name: Outcome ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Decision Outcomes (vwTaskDecisionOutcomes.ID)
    * * Description: The decision outcome (FK to TaskDecisionOutcome).
    */
    get OutcomeID(): string {
        return this.Get('OutcomeID');
    }
    set OutcomeID(value: string) {
        this.Set('OutcomeID', value);
    }

    /**
    * * Field Name: DecidedByPersonID
    * * Display Name: Decided By Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The Person who made the decision.
    */
    get DecidedByPersonID(): string | null {
        return this.Get('DecidedByPersonID');
    }
    set DecidedByPersonID(value: string | null) {
        this.Set('DecidedByPersonID', value);
    }

    /**
    * * Field Name: DecidedAt
    * * Display Name: Decided At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: When the decision was recorded.
    */
    get DecidedAt(): Date {
        return this.Get('DecidedAt');
    }
    set DecidedAt(value: Date) {
        this.Set('DecidedAt', value);
    }

    /**
    * * Field Name: DecisionNotes
    * * Display Name: Decision Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-text rationale or conditions attached to the decision.
    */
    get DecisionNotes(): string | null {
        return this.Get('DecisionNotes');
    }
    set DecisionNotes(value: string | null) {
        this.Set('DecisionNotes', value);
    }

    /**
    * * Field Name: TaskAssignmentID
    * * Display Name: Task Assignment ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Assignments (vwTaskAssignments.ID)
    * * Description: Optional link to the specific TaskAssignment this decision belongs to, for per-assignee decisions in multi-approver flows. Null for a task-level decision.
    */
    get TaskAssignmentID(): string | null {
        return this.Get('TaskAssignmentID');
    }
    set TaskAssignmentID(value: string | null) {
        this.Set('TaskAssignmentID', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(100)
    */
    get Outcome(): string {
        return this.Get('Outcome');
    }

    /**
    * * Field Name: DecidedByPerson
    * * Display Name: Decided By Person
    * * SQL Data Type: nvarchar(201)
    */
    get DecidedByPerson(): string | null {
        return this.Get('DecidedByPerson');
    }
}


/**
 * MJ_BizApps_Tasks: Task Dependencies - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskDependency
 * * Base View: vwTaskDependencies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Dependencies')
export class mjBizAppsTasksTaskDependencyEntity extends BaseEntity<mjBizAppsTasksTaskDependencyEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Dependencies record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Dependencies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskDependencyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Tasks: Task Dependencies entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: A task cannot depend on itself. This prevents circular dependencies and ensures that a task can only have a dependency on a different task.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTaskIDNotEqualToDependsOnTaskID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * A task cannot depend on itself. This prevents circular dependencies and ensures that a task can only have a dependency on a different task.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTaskIDNotEqualToDependsOnTaskID(result: ValidationResult) {
    	if (this.TaskID != null && this.DependsOnTaskID != null && this.TaskID === this.DependsOnTaskID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"DependsOnTaskID",
    			"A task cannot depend on itself. The Task ID and Depends On Task ID must be different.",
    			this.DependsOnTaskID,
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: DependsOnTaskID
    * * Display Name: Depends On Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get DependsOnTaskID(): string {
        return this.Get('DependsOnTaskID');
    }
    set DependsOnTaskID(value: string) {
        this.Set('DependsOnTaskID', value);
    }

    /**
    * * Field Name: DependencyType
    * * Display Name: Dependency Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: FinishToStart
    * * Value List Type: List
    * * Possible Values 
    *   * FinishToFinish
    *   * FinishToStart
    *   * StartToFinish
    *   * StartToStart
    */
    get DependencyType(): 'FinishToFinish' | 'FinishToStart' | 'StartToFinish' | 'StartToStart' {
        return this.Get('DependencyType');
    }
    set DependencyType(value: 'FinishToFinish' | 'FinishToStart' | 'StartToFinish' | 'StartToStart') {
        this.Set('DependencyType', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: DependsOnTask
    * * Display Name: Depends On Task
    * * SQL Data Type: nvarchar(255)
    */
    get DependsOnTask(): string {
        return this.Get('DependsOnTask');
    }
}


/**
 * MJ_BizApps_Tasks: Task Links - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskLink
 * * Base View: vwTaskLinks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Links')
export class mjBizAppsTasksTaskLinkEntity extends BaseEntity<mjBizAppsTasksTaskLinkEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Links record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskLinkEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    */
    get EntityID(): string {
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {
        return this.Get('Entity');
    }
}


/**
 * MJ_BizApps_Tasks: Task Notification Configs - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskNotificationConfig
 * * Base View: vwTaskNotificationConfigs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Notification Configs')
export class mjBizAppsTasksTaskNotificationConfigEntity extends BaseEntity<mjBizAppsTasksTaskNotificationConfigEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Notification Configs record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Notification Configs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskNotificationConfigEntity
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
    * * Field Name: TaskTypeID
    * * Display Name: Task Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)
    */
    get TaskTypeID(): string | null {
        return this.Get('TaskTypeID');
    }
    set TaskTypeID(value: string | null) {
        this.Set('TaskTypeID', value);
    }

    /**
    * * Field Name: OverdueNotificationsEnabled
    * * Display Name: Overdue Notifications Enabled
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get OverdueNotificationsEnabled(): boolean {
        return this.Get('OverdueNotificationsEnabled');
    }
    set OverdueNotificationsEnabled(value: boolean) {
        this.Set('OverdueNotificationsEnabled', value);
    }

    /**
    * * Field Name: OverdueGracePeriodHours
    * * Display Name: Overdue Grace Period Hours
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get OverdueGracePeriodHours(): number {
        return this.Get('OverdueGracePeriodHours');
    }
    set OverdueGracePeriodHours(value: number) {
        this.Set('OverdueGracePeriodHours', value);
    }

    /**
    * * Field Name: OverdueRepeatIntervalHours
    * * Display Name: Overdue Repeat Interval Hours
    * * SQL Data Type: int
    */
    get OverdueRepeatIntervalHours(): number | null {
        return this.Get('OverdueRepeatIntervalHours');
    }
    set OverdueRepeatIntervalHours(value: number | null) {
        this.Set('OverdueRepeatIntervalHours', value);
    }

    /**
    * * Field Name: NotifyAssignees
    * * Display Name: Notify Assignees
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get NotifyAssignees(): boolean {
        return this.Get('NotifyAssignees');
    }
    set NotifyAssignees(value: boolean) {
        this.Set('NotifyAssignees', value);
    }

    /**
    * * Field Name: NotifyCreator
    * * Display Name: Notify Creator
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get NotifyCreator(): boolean {
        return this.Get('NotifyCreator');
    }
    set NotifyCreator(value: boolean) {
        this.Set('NotifyCreator', value);
    }

    /**
    * * Field Name: OverdueActionID
    * * Display Name: Overdue Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    */
    get OverdueActionID(): string | null {
        return this.Get('OverdueActionID');
    }
    set OverdueActionID(value: string | null) {
        this.Set('OverdueActionID', value);
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
    * * Field Name: TaskType
    * * Display Name: Task Type
    * * SQL Data Type: nvarchar(100)
    */
    get TaskType(): string | null {
        return this.Get('TaskType');
    }

    /**
    * * Field Name: OverdueAction
    * * Display Name: Overdue Action
    * * SQL Data Type: nvarchar(425)
    */
    get OverdueAction(): string | null {
        return this.Get('OverdueAction');
    }
}


/**
 * MJ_BizApps_Tasks: Task Notification Logs - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskNotificationLog
 * * Base View: vwTaskNotificationLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Notification Logs')
export class mjBizAppsTasksTaskNotificationLogEntity extends BaseEntity<mjBizAppsTasksTaskNotificationLogEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Notification Logs record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Notification Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskNotificationLogEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: NotificationType
    * * Display Name: Notification Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Overdue
    *   * OverdueReminder
    */
    get NotificationType(): 'Overdue' | 'OverdueReminder' {
        return this.Get('NotificationType');
    }
    set NotificationType(value: 'Overdue' | 'OverdueReminder') {
        this.Set('NotificationType', value);
    }

    /**
    * * Field Name: NotifiedUserID
    * * Display Name: Notified User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    */
    get NotifiedUserID(): string {
        return this.Get('NotifiedUserID');
    }
    set NotifiedUserID(value: string) {
        this.Set('NotifiedUserID', value);
    }

    /**
    * * Field Name: NotifiedAt
    * * Display Name: Notified At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get NotifiedAt(): Date {
        return this.Get('NotifiedAt');
    }
    set NotifiedAt(value: Date) {
        this.Set('NotifiedAt', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: NotifiedUser
    * * Display Name: Notified User
    * * SQL Data Type: nvarchar(100)
    */
    get NotifiedUser(): string {
        return this.Get('NotifiedUser');
    }
}


/**
 * MJ_BizApps_Tasks: Task Roles - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskRole
 * * Base View: vwTaskRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Roles')
export class mjBizAppsTasksTaskRoleEntity extends BaseEntity<mjBizAppsTasksTaskRoleEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Roles record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskRoleEntity
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
    * * SQL Data Type: nvarchar(100)
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 100
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
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
 * MJ_BizApps_Tasks: Task Tag Links - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTagLink
 * * Base View: vwTaskTagLinks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Tag Links')
export class mjBizAppsTasksTaskTagLinkEntity extends BaseEntity<mjBizAppsTasksTaskTagLinkEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Tag Links record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Tag Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTagLinkEntity
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
    * * Field Name: TaskID
    * * Display Name: Task ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get TaskID(): string {
        return this.Get('TaskID');
    }
    set TaskID(value: string) {
        this.Set('TaskID', value);
    }

    /**
    * * Field Name: TagID
    * * Display Name: Tag ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Tags (vwTaskTags.ID)
    */
    get TagID(): string {
        return this.Get('TagID');
    }
    set TagID(value: string) {
        this.Set('TagID', value);
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
    * * Field Name: Task
    * * Display Name: Task
    * * SQL Data Type: nvarchar(255)
    */
    get Task(): string {
        return this.Get('Task');
    }

    /**
    * * Field Name: Tag
    * * Display Name: Tag
    * * SQL Data Type: nvarchar(100)
    */
    get Tag(): string {
        return this.Get('Tag');
    }
}


/**
 * MJ_BizApps_Tasks: Task Tags - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTag
 * * Base View: vwTaskTags
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Tags')
export class mjBizAppsTasksTaskTagEntity extends BaseEntity<mjBizAppsTasksTaskTagEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Tags record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTagEntity
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
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ColorCode
    * * Display Name: Color Code
    * * SQL Data Type: nvarchar(20)
    */
    get ColorCode(): string | null {
        return this.Get('ColorCode');
    }
    set ColorCode(value: string | null) {
        this.Set('ColorCode', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
 * MJ_BizApps_Tasks: Task Template Item Dependencies - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTemplateItemDependency
 * * Base View: vwTaskTemplateItemDependencies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Template Item Dependencies')
export class mjBizAppsTasksTaskTemplateItemDependencyEntity extends BaseEntity<mjBizAppsTasksTaskTemplateItemDependencyEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Template Item Dependencies record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Template Item Dependencies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTemplateItemDependencyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Tasks: Task Template Item Dependencies entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: An item cannot depend on itself. The item and its dependency must be different items to prevent self-referential relationships.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateItemNotDependentOnSelf(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * An item cannot depend on itself. The item and its dependency must be different items to prevent self-referential relationships.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateItemNotDependentOnSelf(result: ValidationResult) {
    	if (this.ItemID != null && this.DependsOnItemID != null && this.ItemID === this.DependsOnItemID) {
    		result.Errors.push(new ValidationErrorInfo(
    			"DependsOnItemID",
    			"An item cannot depend on itself. The Item ID and Depends On Item ID must be different.",
    			this.DependsOnItemID,
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
    * * Field Name: ItemID
    * * Display Name: Item ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)
    */
    get ItemID(): string {
        return this.Get('ItemID');
    }
    set ItemID(value: string) {
        this.Set('ItemID', value);
    }

    /**
    * * Field Name: DependsOnItemID
    * * Display Name: Depends On Item ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)
    */
    get DependsOnItemID(): string {
        return this.Get('DependsOnItemID');
    }
    set DependsOnItemID(value: string) {
        this.Set('DependsOnItemID', value);
    }

    /**
    * * Field Name: DependencyType
    * * Display Name: Dependency Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: FinishToStart
    * * Value List Type: List
    * * Possible Values 
    *   * FinishToFinish
    *   * FinishToStart
    *   * StartToFinish
    *   * StartToStart
    */
    get DependencyType(): 'FinishToFinish' | 'FinishToStart' | 'StartToFinish' | 'StartToStart' {
        return this.Get('DependencyType');
    }
    set DependencyType(value: 'FinishToFinish' | 'FinishToStart' | 'StartToFinish' | 'StartToStart') {
        this.Set('DependencyType', value);
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
    * * Field Name: Item
    * * Display Name: Item
    * * SQL Data Type: nvarchar(255)
    */
    get Item(): string {
        return this.Get('Item');
    }

    /**
    * * Field Name: DependsOnItem
    * * Display Name: Depends On Item
    * * SQL Data Type: nvarchar(255)
    */
    get DependsOnItem(): string {
        return this.Get('DependsOnItem');
    }
}


/**
 * MJ_BizApps_Tasks: Task Template Item Roles - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTemplateItemRole
 * * Base View: vwTaskTemplateItemRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Template Item Roles')
export class mjBizAppsTasksTaskTemplateItemRoleEntity extends BaseEntity<mjBizAppsTasksTaskTemplateItemRoleEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Template Item Roles record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Template Item Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTemplateItemRoleEntity
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
    * * Field Name: ItemID
    * * Display Name: Item ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)
    */
    get ItemID(): string {
        return this.Get('ItemID');
    }
    set ItemID(value: string) {
        this.Set('ItemID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Roles (vwTaskRoles.ID)
    */
    get RoleID(): string {
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
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
    * * Field Name: Item
    * * Display Name: Item
    * * SQL Data Type: nvarchar(255)
    */
    get Item(): string {
        return this.Get('Item');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    */
    get Role(): string {
        return this.Get('Role');
    }
}


/**
 * MJ_BizApps_Tasks: Task Template Items - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTemplateItem
 * * Base View: vwTaskTemplateItems
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Template Items')
export class mjBizAppsTasksTaskTemplateItemEntity extends BaseEntity<mjBizAppsTasksTaskTemplateItemEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Template Items record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Template Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTemplateItemEntity
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
    * * Field Name: TemplateID
    * * Display Name: Template ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Templates (vwTaskTemplates.ID)
    */
    get TemplateID(): string {
        return this.Get('TemplateID');
    }
    set TemplateID(value: string) {
        this.Set('TemplateID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentItemID
    * * Display Name: Parent Item ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Template Items (vwTaskTemplateItems.ID)
    */
    get ParentItemID(): string | null {
        return this.Get('ParentItemID');
    }
    set ParentItemID(value: string | null) {
        this.Set('ParentItemID', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    */
    get Priority(): 'Critical' | 'High' | 'Low' | 'Medium' {
        return this.Get('Priority');
    }
    set Priority(value: 'Critical' | 'High' | 'Low' | 'Medium') {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: DaysFromStart
    * * Display Name: Days From Start
    * * SQL Data Type: int
    */
    get DaysFromStart(): number | null {
        return this.Get('DaysFromStart');
    }
    set DaysFromStart(value: number | null) {
        this.Set('DaysFromStart', value);
    }

    /**
    * * Field Name: HoursEstimated
    * * Display Name: Hours Estimated
    * * SQL Data Type: decimal(8, 2)
    */
    get HoursEstimated(): number | null {
        return this.Get('HoursEstimated');
    }
    set HoursEstimated(value: number | null) {
        this.Set('HoursEstimated', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 100
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
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
    * * Field Name: Template
    * * Display Name: Template
    * * SQL Data Type: nvarchar(255)
    */
    get Template(): string {
        return this.Get('Template');
    }

    /**
    * * Field Name: ParentItem
    * * Display Name: Parent Item
    * * SQL Data Type: nvarchar(255)
    */
    get ParentItem(): string | null {
        return this.Get('ParentItem');
    }

    /**
    * * Field Name: RootParentItemID
    * * Display Name: Root Parent Item ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentItemID(): string | null {
        return this.Get('RootParentItemID');
    }
}


/**
 * MJ_BizApps_Tasks: Task Templates - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskTemplate
 * * Base View: vwTaskTemplates
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Templates')
export class mjBizAppsTasksTaskTemplateEntity extends BaseEntity<mjBizAppsTasksTaskTemplateEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Templates record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Templates record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTemplateEntity
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
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: TypeID
    * * Display Name: Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)
    */
    get TypeID(): string | null {
        return this.Get('TypeID');
    }
    set TypeID(value: string | null) {
        this.Set('TypeID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {
        return this.Get('Category');
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(100)
    */
    get Type(): string | null {
        return this.Get('Type');
    }
}


/**
 * MJ_BizApps_Tasks: Task Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: TaskType
 * * Base View: vwTaskTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Task Types')
export class mjBizAppsTasksTaskTypeEntity extends BaseEntity<mjBizAppsTasksTaskTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Task Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Task Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskTypeEntity
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
    * * SQL Data Type: nvarchar(100)
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: DefaultPriority
    * * Display Name: Default Priority
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    */
    get DefaultPriority(): 'Critical' | 'High' | 'Low' | 'Medium' {
        return this.Get('DefaultPriority');
    }
    set DefaultPriority(value: 'Critical' | 'High' | 'Low' | 'Medium') {
        this.Set('DefaultPriority', value);
    }

    /**
    * * Field Name: OnAssignActionID
    * * Display Name: On Assign Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    */
    get OnAssignActionID(): string | null {
        return this.Get('OnAssignActionID');
    }
    set OnAssignActionID(value: string | null) {
        this.Set('OnAssignActionID', value);
    }

    /**
    * * Field Name: OnCompleteActionID
    * * Display Name: On Complete Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    */
    get OnCompleteActionID(): string | null {
        return this.Get('OnCompleteActionID');
    }
    set OnCompleteActionID(value: string | null) {
        this.Set('OnCompleteActionID', value);
    }

    /**
    * * Field Name: OnOverdueActionID
    * * Display Name: On Overdue Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    */
    get OnOverdueActionID(): string | null {
        return this.Get('OnOverdueActionID');
    }
    set OnOverdueActionID(value: string | null) {
        this.Set('OnOverdueActionID', value);
    }

    /**
    * * Field Name: OnPercentChangeActionID
    * * Display Name: On Percent Change Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    */
    get OnPercentChangeActionID(): string | null {
        return this.Get('OnPercentChangeActionID');
    }
    set OnPercentChangeActionID(value: string | null) {
        this.Set('OnPercentChangeActionID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
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
    * * Field Name: OnRejectActionID
    * * Display Name: On Reject Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    * * Description: Action invoked when a task of this type transitions to a rejected decision (post-commit, non-blocking). Used by approval workflows.
    */
    get OnRejectActionID(): string | null {
        return this.Get('OnRejectActionID');
    }
    set OnRejectActionID(value: string | null) {
        this.Set('OnRejectActionID', value);
    }

    /**
    * * Field Name: OnCancelActionID
    * * Display Name: On Cancel Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Actions (vwActions.ID)
    * * Description: Action invoked when a task of this type transitions to Cancelled (post-commit, non-blocking).
    */
    get OnCancelActionID(): string | null {
        return this.Get('OnCancelActionID');
    }
    set OnCancelActionID(value: string | null) {
        this.Set('OnCancelActionID', value);
    }

    /**
    * * Field Name: OnAssignAction
    * * Display Name: On Assign Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnAssignAction(): string | null {
        return this.Get('OnAssignAction');
    }

    /**
    * * Field Name: OnCompleteAction
    * * Display Name: On Complete Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnCompleteAction(): string | null {
        return this.Get('OnCompleteAction');
    }

    /**
    * * Field Name: OnOverdueAction
    * * Display Name: On Overdue Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnOverdueAction(): string | null {
        return this.Get('OnOverdueAction');
    }

    /**
    * * Field Name: OnPercentChangeAction
    * * Display Name: On Percent Change Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnPercentChangeAction(): string | null {
        return this.Get('OnPercentChangeAction');
    }

    /**
    * * Field Name: OnRejectAction
    * * Display Name: On Reject Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnRejectAction(): string | null {
        return this.Get('OnRejectAction');
    }

    /**
    * * Field Name: OnCancelAction
    * * Display Name: On Cancel Action
    * * SQL Data Type: nvarchar(425)
    */
    get OnCancelAction(): string | null {
        return this.Get('OnCancelAction');
    }
}


/**
 * MJ_BizApps_Tasks: Tasks - strongly typed entity sub-class
 * * Schema: __mj_BizAppsTasks
 * * Base Table: Task
 * * Base View: vwTasks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Tasks: Tasks')
export class mjBizAppsTasksTaskEntity extends BaseEntity<mjBizAppsTasksTaskEntityType> {
    /**
    * Loads the MJ_BizApps_Tasks: Tasks record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Tasks: Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsTasksTaskEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Tasks: Tasks entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * PercentComplete: Percent complete must be a value between 0 and 100 percent.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidatePercentCompleteRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Percent complete must be a value between 0 and 100 percent.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePercentCompleteRange(result: ValidationResult) {
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TypeID
    * * Display Name: Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Types (vwTaskTypes.ID)
    */
    get TypeID(): string {
        return this.Get('TypeID');
    }
    set TypeID(value: string) {
        this.Set('TypeID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Task Categories (vwTaskCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Tasks: Tasks (vwTasks.ID)
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Blocked
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Open
    */
    get Status(): 'Blocked' | 'Cancelled' | 'Completed' | 'InProgress' | 'Open' {
        return this.Get('Status');
    }
    set Status(value: 'Blocked' | 'Cancelled' | 'Completed' | 'InProgress' | 'Open') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Critical
    *   * High
    *   * Low
    *   * Medium
    */
    get Priority(): 'Critical' | 'High' | 'Low' | 'Medium' {
        return this.Get('Priority');
    }
    set Priority(value: 'Critical' | 'High' | 'Low' | 'Medium') {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetimeoffset
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: DueAt
    * * Display Name: Due At
    * * SQL Data Type: datetimeoffset
    */
    get DueAt(): Date | null {
        return this.Get('DueAt');
    }
    set DueAt(value: Date | null) {
        this.Set('DueAt', value);
    }

    /**
    * * Field Name: CompletedAt
    * * Display Name: Completed At
    * * SQL Data Type: datetimeoffset
    */
    get CompletedAt(): Date | null {
        return this.Get('CompletedAt');
    }
    set CompletedAt(value: Date | null) {
        this.Set('CompletedAt', value);
    }

    /**
    * * Field Name: HoursEstimated
    * * Display Name: Hours Estimated
    * * SQL Data Type: decimal(8, 2)
    */
    get HoursEstimated(): number | null {
        return this.Get('HoursEstimated');
    }
    set HoursEstimated(value: number | null) {
        this.Set('HoursEstimated', value);
    }

    /**
    * * Field Name: HoursActual
    * * Display Name: Hours Actual
    * * SQL Data Type: decimal(8, 2)
    */
    get HoursActual(): number | null {
        return this.Get('HoursActual');
    }
    set HoursActual(value: number | null) {
        this.Set('HoursActual', value);
    }

    /**
    * * Field Name: PercentComplete
    * * Display Name: Percent Complete
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get PercentComplete(): number {
        return this.Get('PercentComplete');
    }
    set PercentComplete(value: number) {
        this.Set('PercentComplete', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 100
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: BlockedReason
    * * Display Name: Blocked Reason
    * * SQL Data Type: nvarchar(MAX)
    */
    get BlockedReason(): string | null {
        return this.Get('BlockedReason');
    }
    set BlockedReason(value: string | null) {
        this.Set('BlockedReason', value);
    }

    /**
    * * Field Name: CompletionNotes
    * * Display Name: Completion Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get CompletionNotes(): string | null {
        return this.Get('CompletionNotes');
    }
    set CompletionNotes(value: string | null) {
        this.Set('CompletionNotes', value);
    }

    /**
    * * Field Name: CreatedByPersonID
    * * Display Name: Created By Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    */
    get CreatedByPersonID(): string | null {
        return this.Get('CreatedByPersonID');
    }
    set CreatedByPersonID(value: string | null) {
        this.Set('CreatedByPersonID', value);
    }

    /**
    * * Field Name: OverdueNotifiedAt
    * * Display Name: Overdue Notified At
    * * SQL Data Type: datetimeoffset
    */
    get OverdueNotifiedAt(): Date | null {
        return this.Get('OverdueNotifiedAt');
    }
    set OverdueNotifiedAt(value: Date | null) {
        this.Set('OverdueNotifiedAt', value);
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
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(100)
    */
    get Type(): string {
        return this.Get('Type');
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
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: CreatedByPerson
    * * Display Name: Created By Person
    * * SQL Data Type: nvarchar(201)
    */
    get CreatedByPerson(): string | null {
        return this.Get('CreatedByPerson');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}
