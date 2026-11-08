/**
 * The emulated Forms database the engine, operation and authoring-Action specs run against: the shared fake provider, its tables
 * seeded with one draft form, and the REAL `FormEntityServer` / `FormVersionEntityServer` over every
 * Form and Form Version row (see `testing/write-through-entity.ts`) — so each save the engine makes
 * passes through the same invariants a production save does. A spec that also passes
 * `FormDistributionEntityServer` gets it over every Form Distribution row, with the row-lock read
 * its update saves make answered from the table — so the provisioning hook runs as in production.
 *
 * A spec that imports this must first mock `@mj-biz-apps/forms-entities` so the generated bases it
 * runs subclasses over are `WriteThroughEntityBase` (the mock has to live in the spec file; Vitest hoists it there). The
 * subclass constructors are passed in rather than imported here for the same reason: they must be
 * the classes evaluated AFTER that mock.
 */
import type { UserInfo } from '@memberjunction/core';
import { makeFakeProvider, type FakeProvider, type FakeProviderConfig, type FakeRow, type FakeSqlScript } from './fake-provider.js';
import { writeThroughEntities, type WriteThroughEntityBase, type WriteThroughEntitySpec } from './write-through-entity.js';

export const FORMS = 'MJ_BizApps_Forms: Forms';
export const VERSIONS = 'MJ_BizApps_Forms: Form Versions';
export const PAGES = 'MJ_BizApps_Forms: Form Pages';
export const QUESTIONS = 'MJ_BizApps_Forms: Form Questions';
export const OPTIONS = 'MJ_BizApps_Forms: Form Question Options';
export const SCREENS = 'MJ_BizApps_Forms: Form Screens';
export const STYLES = 'MJ_BizApps_Forms: Form Styles';
export const AUTOMATIONS = 'MJ_BizApps_Forms: Form Automations';
export const AUTOMATION_EVENTS = 'MJ_BizApps_Forms: Form Automation Events';
export const BINDINGS = 'MJ_BizApps_Forms: Form Entity Bindings';
export const DISTRIBUTIONS = 'MJ_BizApps_Forms: Form Distributions';
export const ACTIONS = 'MJ: Actions';

/** The columns each real subclass loads from its row — every one the engine or the rules read. */
export const FORM_COLUMNS = [
  'ID', 'Name', 'Description', 'Status', 'RenderMode', 'Settings', 'IsTemplate', 'StyleID', 'OwnerUserID',
  'CategoryID', 'TemplateSourceFormID',
] as const;
export const VERSION_COLUMNS = ['ID', 'FormID', 'VersionNumber', 'Status', 'PublishedAt', 'DefinitionSnapshot'] as const;
export const DISTRIBUTION_COLUMNS = [
  'ID', 'FormID', 'Name', 'Slug', 'ChannelType', 'Status', 'OpenAt', 'CloseAt', 'MaxResponses', 'ResponseCount',
  'MagicLinkInviteID', 'PublicLinkToken', 'CaptchaRequired', 'IsActive', 'AllowedOrigins',
] as const;

export const AUTHOR = {
  ID: 'author-1',
  Name: 'Author',
  IsMagicLinkAnonymous: false,
  MagicLinkScope: undefined,
} as unknown as UserInfo;

/** The constructors of the real subclasses, as the spec evaluated them after its mock. */
export interface ServerSubclasses {
  FormEntityServer: new () => WriteThroughEntityBase;
  FormVersionEntityServer: new () => WriteThroughEntityBase;
  /** Optional: only the specs that exercise share-link provisioning need it. */
  FormDistributionEntityServer?: new () => WriteThroughEntityBase;
}

export function formRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    ID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    Name: 'Intake',
    Description: null,
    Status: 'Draft',
    RenderMode: 'Scroll',
    Settings: null,
    IsTemplate: false,
    StyleID: null,
    OwnerUserID: null,
    CategoryID: null,
    TemplateSourceFormID: null,
    ...overrides,
  };
}

export function versionRow(id: string, versionNumber: number, status: string, formId = '4d81af18-d0fe-5b39-b7de-6a0eb70c5766'): FakeRow {
  return {
    ID: id,
    FormID: formId,
    VersionNumber: versionNumber,
    Status: status,
    PublishedAt: status === 'Draft' ? null : new Date('2026-01-01T00:00:00Z'),
    DefinitionSnapshot: status === 'Draft' ? null : JSON.stringify({ formVersionId: id }),
  };
}

export function pageRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    Title: null,
    Description: null,
    DisplayOrder: 0,
    IsPartialSubmitPoint: false,
    ConditionalRule: null,
    ...overrides,
  };
}

export function questionRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    PageID: 'p1',
    QuestionType: 'ShortText',
    Prompt: overrides.ID,
    HelpText: null,
    IsRequired: false,
    DisplayOrder: 0,
    ConditionalRule: null,
    ValidationRule: null,
    ScoringConfig: null,
    Settings: null,
    ...overrides,
  };
}

export function optionRow(overrides: Partial<FakeRow> & { ID: string; QuestionID: string }): FakeRow {
  return { Label: overrides.ID, Value: null, DisplayOrder: 0, IsDefault: false, ImageURL: null, MatrixAxis: null, ...overrides };
}

export function automationRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    Name: overrides.ID,
    TargetType: 'Action',
    ActionID: 'action-1',
    AgentID: null,
    BindingID: null,
    Trigger: 'OnComplete',
    ExecutionMode: 'Sync',
    DisplayOrder: 1,
    ConditionalRule: null,
    ContinueOnError: true,
    IsActive: true,
    ...overrides,
  };
}

/** An outbox event as the replay operation reads it: its response and its status. */
export function automationEventRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return { FormResponseID: 'a8d1a6a4-0a53-4d52-9b62-0d5d0f6f1111', Status: 'DeadLetter', ...overrides };
}

export function bindingRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    Name: overrides.ID,
    TargetEntityName: 'MJ_BizApps_Common: People',
    FieldMappings: JSON.stringify({ version: 1, fields: [{ targetField: 'Email', source: { kind: 'question', questionId: 'q1' } }] }),
    IdentityRule: JSON.stringify({ mode: 'AlwaysCreate' }),
    MergePolicy: null,
    Status: 'Active',
    ...overrides,
  };
}

export function screenRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    ScreenType: 'Ending',
    Title: overrides.ID,
    Body: null,
    ButtonLabel: null,
    MediaURL: null,
    RedirectURL: null,
    DisplayOrder: 0,
    IsDefault: false,
    SocialLinks: null,
    ConditionalRule: null,
    IsDisqualification: false,
    ...overrides,
  };
}

export function distributionRow(overrides: Partial<FakeRow> & { ID: string }): FakeRow {
  return {
    FormID: '4d81af18-d0fe-5b39-b7de-6a0eb70c5766',
    Name: overrides.ID,
    Slug: overrides.ID,
    ChannelType: 'PublicLink',
    Status: 'Active',
    IsActive: true,
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    MagicLinkInviteID: null,
    PublicLinkToken: null,
    CaptchaRequired: false,
    AllowedOrigins: null,
    ...overrides,
  };
}

/** A draft with one page, a text question and a choice question with two options. */
export function draftTables(): Record<string, FakeRow[]> {
  return {
    [FORMS]: [formRow()],
    [VERSIONS]: [],
    [PAGES]: [pageRow({ ID: 'p1', Title: 'About you' })],
    [QUESTIONS]: [
      questionRow({ ID: 'q1', Prompt: 'Your name', IsRequired: true }),
      questionRow({ ID: 'q2', QuestionType: 'SingleChoice', Prompt: 'Colour', DisplayOrder: 1 }),
    ],
    [OPTIONS]: [
      optionRow({ ID: 'o2', QuestionID: 'q2', Label: 'Blue', DisplayOrder: 1 }),
      optionRow({ ID: 'o1', QuestionID: 'q2', Label: 'Red', DisplayOrder: 0 }),
    ],
    [SCREENS]: [],
    [STYLES]: [],
    [AUTOMATIONS]: [],
    [BINDINGS]: [],
    [ACTIONS]: [],
  };
}

/**
 * The fake provider over `tables`, with every Form and Form Version as its real server subclass.
 * `config` is merged last, so a spec can add failures, scripts or `noTransactions`.
 */
export function formsWorld(
  subclasses: ServerSubclasses,
  tables: Record<string, FakeRow[]> = draftTables(),
  config: Partial<FakeProviderConfig> = {},
): FakeProvider {
  let world: FakeProvider | undefined;
  const Distribution = subclasses.FormDistributionEntityServer;
  const specs: Record<string, WriteThroughEntitySpec> = {
    [FORMS]: { construct: () => new subclasses.FormEntityServer(), columns: FORM_COLUMNS },
    [VERSIONS]: { construct: () => new subclasses.FormVersionEntityServer(), columns: VERSION_COLUMNS },
  };
  if (Distribution) {
    specs[DISTRIBUTIONS] = { construct: () => new Distribution(), columns: DISTRIBUTION_COLUMNS };
  }
  world = makeFakeProvider({
    tables,
    wrapEntity: writeThroughEntities(specs, () => world?.provider, AUTHOR),
    ...config,
    sql: [...(Distribution ? [storedCredentialRead(() => world)] : []), ...(config.sql ?? [])],
  });
  return world;
}

/**
 * Answer `FormDistributionEntityServer`'s locked read of a row's stored credential from the table,
 * as the database would — so a save carries the pair the "database" holds, not the instance's copy.
 */
function storedCredentialRead(world: () => FakeProvider | undefined): FakeSqlScript {
  return {
    // The SQL Server spelling is a call of the locked-read procedure (#338), the id in `@ID = '…'`;
    // a raw SELECT names it `[ID] = '…'`.
    match: /spFormDistributionReadServerColumnsLocked|SELECT \[MagicLinkInviteID\], \[PublicLinkToken\]/,
    rows: (sql) => {
      const id = /(?:@ID|\[ID\]) = '((?:[^']|'')*)'/.exec(sql)?.[1]?.replace(/''/g, "'");
      const row = (world()?.tables[DISTRIBUTIONS] ?? []).find((candidate) => candidate.ID === id);
      return row ? [{ MagicLinkInviteID: row.MagicLinkInviteID ?? null, PublicLinkToken: row.PublicLinkToken ?? null }] : [];
    },
  };
}

/** The rows of one table, as the "database" holds them now. */
export function rowsOf(world: FakeProvider, entityName: string): FakeRow[] {
  return world.tables[entityName] ?? [];
}
