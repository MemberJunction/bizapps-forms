/**
 * Lightweight test doubles for the public-submit pipeline. These implement only
 * the slice of the MJ provider / entity surface the pipeline touches, and are
 * typed against the real interfaces (no `any`) via narrowly-scoped casts at the
 * boundary where the fake is handed to code expecting the full class.
 */
import type {
  DatabaseProviderBase,
  EntityInfo,
  EntityUserPermissionInfo,
  RunViewParams,
  RunViewResult,
  UserInfo,
} from '@memberjunction/core';
import { IsPlatformSQL } from '@memberjunction/core';
import type {
  PublishedFormDefinition,
  mjBizAppsFormsFormDistributionEntityType,
  mjBizAppsFormsFormVersionEntityType,
} from '@mj-biz-apps/forms-entities';

/** A recorded entity save, captured by the fake provider for assertions. */
export interface SavedRecord {
  entityName: string;
  values: Record<string, unknown>;
}

/** Per-entity create-permission map for the scope check. */
export type CreatePermissions = Record<string, boolean>;

/** A stored FormResponse row the fake returns from session-response lookups. */
export interface ExistingResponseRow {
  ID: string;
  Status: 'Complete' | 'Partial';
  FormVersionID: string;
  AnonymousSessionID: string;
}

/** Configuration for {@link makeFakeProvider}. */
export interface FakeProviderConfig {
  distribution?: mjBizAppsFormsFormDistributionEntityType;
  version?: mjBizAppsFormsFormVersionEntityType;
  /** Existing completed-response count returned for the form-quota count query. */
  formResponseCount?: number;
  createPermissions: CreatePermissions;
  /** Force a RunView failure for a given entity name (to exercise fail-closed paths). */
  failRunViewFor?: string;
  /** Force a Save() to return false for a given entity name. */
  failSaveFor?: string;
  /**
   * Existing FormResponse rows the session-response lookup should return. The fake filters
   * these by the requested `Status` (parsed out of the ExtraFilter). Used to exercise dedupe
   * (a Complete row) and partial upsert/promotion (a Partial row).
   */
  existingResponses?: ExistingResponseRow[];
}

/** The fake provider plus inspection handles for tests. */
export interface FakeProvider {
  provider: DatabaseProviderBase;
  saved: SavedRecord[];
  distribution?: mjBizAppsFormsFormDistributionEntityType;
}

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';

/** Build a minimal BaseEntity-like record that records its field writes. */
function makeFakeEntity(entityName: string, saved: SavedRecord[], failSave: boolean) {
  const values: Record<string, unknown> = {};
  const record = new Proxy(
    {
      ID: `id-${entityName}-${saved.length + 1}`,
      LatestResult: { CompleteMessage: 'forced save failure' },
      NewRecord: () => true,
      Load: async (id?: string) => {
        // Emulate loading an existing row: adopt its id so update/promote key on it correctly.
        if (typeof id === 'string' && id.length > 0) {
          record.ID = id;
        }
        return true;
      },
      Save: async () => {
        if (failSave) {
          return false;
        }
        saved.push({ entityName, values: { ...values } });
        return true;
      },
      Delete: async () => true,
    },
    {
      set(target, prop: string, value) {
        if (prop in target) {
          // preserve harness fields (ID/LatestResult/methods)
          Reflect.set(target, prop, value);
        }
        values[prop] = value;
        return true;
      },
      get(target, prop: string) {
        if (prop in target) {
          return Reflect.get(target, prop);
        }
        return values[prop];
      },
    },
  );
  return record;
}

/** Build a fake EntityInfo whose GetUserPermisions reflects the configured CanCreate. */
function makeFakeEntityInfo(entityName: string, canCreate: boolean): EntityInfo {
  const permissions = { CanCreate: canCreate, CanRead: true, CanUpdate: false, CanDelete: false } as EntityUserPermissionInfo;
  const info = {
    Name: entityName,
    GetUserPermisions: (_user: UserInfo): EntityUserPermissionInfo => permissions,
  };
  return info as unknown as EntityInfo;
}

/** Construct a fake provider implementing the pipeline's required surface. */
export function makeFakeProvider(config: FakeProviderConfig): FakeProvider {
  const saved: SavedRecord[] = [];

  const runView = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
    const name = params.EntityName;
    if (config.failRunViewFor && name === config.failRunViewFor) {
      return runViewResult<T>(false, []);
    }
    if (name === FORM_DISTRIBUTION_ENTITY) {
      return runViewResult<T>(true, config.distribution ? [config.distribution as unknown as T] : []);
    }
    if (name === FORM_VERSION_ENTITY) {
      return runViewResult<T>(true, config.version ? [config.version as unknown as T] : []);
    }
    if (name === FORM_RESPONSE_ENTITY) {
      // Quota uses count_only; the dedupe/partial lookups use entity_object with a Status filter.
      if (params.ResultType === 'count_only') {
        return runViewResult<T>(true, [], config.formResponseCount ?? 0);
      }
      const rawFilter = params.ExtraFilter;
      const filter = IsPlatformSQL(rawFilter) ? rawFilter.default : rawFilter ?? '';
      const rows = (config.existingResponses ?? []).filter((r) => matchesResponseFilter(r, filter));
      return runViewResult<T>(true, rows as unknown as T[]);
    }
    return runViewResult<T>(true, []);
  };

  const provider = {
    RunView: runView,
    RunViews: async () => [],
    GetEntityObject: async (entityName: string) =>
      makeFakeEntity(entityName, saved, config.failSaveFor === entityName),
    EntityByName: (entityName: string) =>
      makeFakeEntityInfo(entityName, config.createPermissions[entityName] ?? false),
  };

  return {
    provider: provider as unknown as DatabaseProviderBase,
    saved,
    distribution: config.distribution,
  };
}

/**
 * Emulate the FormResponse lookups' `ExtraFilter` semantics against a stored row: every
 * `Column='value'` equality predicate present in the filter must hold. This makes the fake honor
 * not just `Status` (dedupe / session-key partial lookup) but also `ID` and `AnonymousSessionID`
 * (the client-supplied-id ownership guard) — so a foreign-session id correctly matches NOTHING.
 */
function matchesResponseFilter(row: ExistingResponseRow, filter: string): boolean {
  const eq = (column: string, value: string | undefined): boolean => {
    // Anchor the column name on a word boundary so `ID=` does not also match `FormVersionID=`.
    const m = filter.match(new RegExp(`(?:^|\\W)${column}='([^']*)'`));
    return m === null || m[1] === value;
  };
  return (
    eq('Status', row.Status) &&
    eq('ID', row.ID) &&
    eq('AnonymousSessionID', row.AnonymousSessionID) &&
    eq('FormVersionID', row.FormVersionID)
  );
}

/** Shape a RunViewResult with sensible defaults. */
function runViewResult<T>(success: boolean, results: T[], totalRowCount?: number): RunViewResult<T> {
  return {
    Success: success,
    Results: results,
    RowCount: results.length,
    TotalRowCount: totalRowCount ?? results.length,
    ExecutionTime: 0,
    ErrorMessage: success ? '' : 'forced runview failure',
  } as RunViewResult<T>;
}

/** A minimal anonymous contextUser. */
export function makeContextUser(): UserInfo {
  return { ID: 'anon-user', Name: 'Anonymous', Email: 'anon@example.com' } as unknown as UserInfo;
}

/** Build a published definition for tests (one required ShortText question). */
export function makeDefinition(overrides?: Partial<PublishedFormDefinition>): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Test Form',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks!' },
    styleTokens: { cssVariables: {} },
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        questions: [
          {
            id: 'q-name',
            type: 'ShortText',
            prompt: 'Your name',
            isRequired: true,
            displayOrder: 1,
            options: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** Build a distribution row pointing at a form, optionally capped/captcha. */
export function makeDistribution(
  overrides?: Partial<mjBizAppsFormsFormDistributionEntityType>,
): mjBizAppsFormsFormDistributionEntityType {
  return {
    ID: 'dist-1',
    FormID: 'form-1',
    Name: 'Public Link',
    Slug: 'public-1',
    ChannelType: 'PublicLink',
    Status: 'Active',
    OpenAt: null,
    CloseAt: null,
    MaxResponses: null,
    ResponseCount: 0,
    MagicLinkInviteID: null,
    CaptchaRequired: false,
    IsActive: true,
    ...overrides,
  } as mjBizAppsFormsFormDistributionEntityType;
}

/** Build a published version row whose snapshot is the given definition. */
export function makeVersion(definition: PublishedFormDefinition): mjBizAppsFormsFormVersionEntityType {
  return {
    ID: 'ver-1',
    FormID: 'form-1',
    VersionNumber: 1,
    Status: 'Published',
    PublishedAt: new Date(),
    DefinitionSnapshot: JSON.stringify(definition),
  } as mjBizAppsFormsFormVersionEntityType;
}

/** Default all-allowed respondent create-permissions map. */
export function respondentPermissions(): CreatePermissions {
  return {
    [FORM_RESPONSE_ENTITY]: true,
    [FORM_RESPONSE_ANSWER_ENTITY]: true,
    'MJ_BizApps_Forms: Forms': false,
    'MJ_BizApps_Forms: Form Versions': false,
    'MJ_BizApps_Forms: Form Distributions': false,
  };
}
