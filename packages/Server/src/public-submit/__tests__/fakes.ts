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
  mjBizAppsFormsFormResponseEntityType,
  mjBizAppsFormsFormVersionEntityType,
} from '@mj-biz-apps/forms-entities';
import { FILE_ENTITY_RECORD_LINK_ENTITY } from '../../file-links/file-links.service';
import { FORM_UPLOAD_ENTITY } from '../entity-names';

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
  /** Every status a real row can hold, `Disqualified` included — the gates must see it too. */
  Status: mjBizAppsFormsFormResponseEntityType['Status'];
  FormVersionID: string;
  AnonymousSessionID: string;
  /** Optional stored SourceMetadata JSON, exercised by the client-id LIKE proof lookups. */
  SourceMetadata?: string;
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
  /**
   * FormResponse rows that already exist in the "database" for PK-collision + Load purposes but
   * are INVISIBLE to `RunView` lookups — modeling the TOCTOU race window in which a concurrent
   * request has committed the row after this request's dedupe/adopt SELECTs already ran and
   * missed. A CREATE targeting one of these ids collides on the primary key (as real SQL Server
   * would), and the subsequent recovery `Load` finds it.
   */
  concurrentlyCreated?: ExistingResponseRow[];
  /**
   * `MJ: File Entity Record Links` rows the link view should return. Returned unfiltered: the
   * target is asserted on the WRITTEN row instead, which is where getting it wrong would matter.
   */
  fileLinks?: { ID: string; FileID: string }[];
  /** `FormUpload` rows for the response under test — what Forms is allowed to unlink. */
  responseUploads?: { FileID: string }[];
  /**
   * `FormResponseAnswer` rows already stored against the response — what a re-save has to clear
   * before it re-inserts. Returned unfiltered; the tests that use these assert on what was
   * DELETED, which is where getting it wrong matters.
   *
   * The fake returned an empty list for this entity until answer durability was under test, so
   * "the prior answers were cleared" and "there were none" were indistinguishable — and the
   * window in which a response holds neither its old answers nor its new ones was untestable.
   */
  existingAnswers?: { ID: string; QuestionID?: string }[];
}

/** The fake provider plus inspection handles for tests. */
export interface FakeProvider {
  provider: DatabaseProviderBase;
  saved: SavedRecord[];
  /** Rows `Delete()`d, so a test can assert a removal and not just an absence. */
  deleted: SavedRecord[];
  distribution?: mjBizAppsFormsFormDistributionEntityType;
}

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';

/**
 * A shared "row store" keyed by FormResponse ID — the persistent side of the fake DB. Seeded with
 * both `RunView`-visible rows and race-only rows, it powers PK-collision detection on CREATE and
 * field population on the recovery Load.
 */
type ResponseStore = Map<string, ExistingResponseRow>;

/** Build a minimal BaseEntity-like record that records its field writes. */
function makeFakeEntity(
  entityName: string,
  saved: SavedRecord[],
  deleted: SavedRecord[],
  failSave: boolean,
  responseStore: ResponseStore,
) {
  const values: Record<string, unknown> = {};
  const isResponse = entityName === FORM_RESPONSE_ENTITY;
  let isNew = false;
  const record = new Proxy(
    {
      ID: `id-${entityName}-${saved.length + 1}`,
      // Only answer rows carry one; the loader below sets it when the fixture supplies it.
      QuestionID: undefined as string | undefined,
      LatestResult: { CompleteMessage: 'forced save failure' },
      NewRecord: () => {
        isNew = true;
        return true;
      },
      Load: async (id?: string) => {
        // Emulate loading an existing row: adopt its id so update/promote key on it correctly,
        // and hydrate the persisted fields (Status especially) so promote-vs-update count logic
        // reads the row's PRIOR status.
        if (typeof id === 'string' && id.length > 0) {
          record.ID = id;
          const stored = isResponse ? responseStore.get(id) : undefined;
          if (stored) {
            values.Status = stored.Status;
            values.FormVersionID = stored.FormVersionID;
            values.AnonymousSessionID = stored.AnonymousSessionID;
            if (stored.SourceMetadata !== undefined) {
              values.SourceMetadata = stored.SourceMetadata;
            }
          }
        }
        isNew = false;
        return true;
      },
      Save: async () => {
        if (failSave) {
          return false;
        }
        // Emulate the DB PRIMARY KEY: a fresh insert whose id already exists is rejected exactly
        // as SQL Server would — the signal the persistence layer recovers from under a race.
        if (isResponse && isNew && responseStore.has(record.ID)) {
          record.LatestResult = {
            CompleteMessage:
              `Violation of PRIMARY KEY constraint 'PK_FormResponse'. Cannot insert duplicate key ` +
              `in object '__mj_BizAppsForms.FormResponse'. The duplicate key value is (${record.ID}).`,
          };
          return false;
        }
        saved.push({ entityName, values: { ...values } });
        // A real BaseEntity stops being new the moment it is inserted — the next Save is an
        // UPDATE. Without this the fake treated a second save of the same row as a fresh insert
        // and returned the PK-collision failure, which only mattered once anything saved a row
        // twice (sealing a response after its answers are stored).
        isNew = false;
        if (isResponse) {
          responseStore.set(record.ID, {
            ID: record.ID,
            Status: values.Status as 'Complete' | 'Partial',
            FormVersionID: values.FormVersionID as string,
            AnonymousSessionID: (values.AnonymousSessionID as string) ?? '',
            SourceMetadata: values.SourceMetadata as string | undefined,
          });
        }
        return true;
      },
      Delete: async () => {
        deleted.push({ entityName, values: { ID: record.ID } });
        return true;
      },
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

/**
 * Stable, GUID-shaped ids for the fake's entities. The file-link table stores an entity's ROW ID
 * rather than its name, and rejects anything not shaped like one — so a fake `EntityInfo` without
 * a realistic `ID` would make that guard look broken instead of exercising it.
 */
const fakeEntityIds = new Map<string, string>();
export function fakeEntityId(entityName: string): string {
  let id = fakeEntityIds.get(entityName);
  if (!id) {
    id = `eeeeeeee-0000-4000-8000-${String(fakeEntityIds.size + 1).padStart(12, '0')}`;
    fakeEntityIds.set(entityName, id);
  }
  return id;
}

/** Build a fake EntityInfo whose GetUserPermisions reflects the configured CanCreate. */
function makeFakeEntityInfo(entityName: string, canCreate: boolean): EntityInfo {
  const permissions = { CanCreate: canCreate, CanRead: true, CanUpdate: false, CanDelete: false } as EntityUserPermissionInfo;
  const info = {
    ID: fakeEntityId(entityName),
    Name: entityName,
    GetUserPermisions: (_user: UserInfo): EntityUserPermissionInfo => permissions,
  };
  return info as unknown as EntityInfo;
}

/** Construct a fake provider implementing the pipeline's required surface. */
export function makeFakeProvider(config: FakeProviderConfig): FakeProvider {
  const saved: SavedRecord[] = [];
  const deleted: SavedRecord[] = [];

  // The persistent row store. RunView-visible rows AND race-only rows both live here (so a
  // CREATE collides and the recovery Load resolves); only `existingResponses` is returned by
  // RunView, so `concurrentlyCreated` rows are the invisible-to-SELECT race window.
  const responseStore: ResponseStore = new Map();
  for (const row of [...(config.existingResponses ?? []), ...(config.concurrentlyCreated ?? [])]) {
    responseStore.set(row.ID, row);
  }

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
    if (name === FILE_ENTITY_RECORD_LINK_ENTITY) {
      return runViewResult<T>(true, (config.fileLinks ?? []) as unknown as T[]);
    }
    if (name === FORM_UPLOAD_ENTITY) {
      return runViewResult<T>(true, (config.responseUploads ?? []) as unknown as T[]);
    }
    if (name === FORM_RESPONSE_ANSWER_ENTITY) {
      // `replaceAnswersClear` asks for `entity_object` and calls `.Delete()` on each row, so
      // these have to be entity-LIKE, not plain data — a bare `{ ID }` throws inside the code
      // under test rather than exercising it.
      const rows = (config.existingAnswers ?? []).map((row) => {
        const entity = makeFakeEntity(FORM_RESPONSE_ANSWER_ENTITY, saved, deleted, config.failSaveFor === name, responseStore);
        entity.ID = row.ID;
        if (row.QuestionID !== undefined) {
          entity.QuestionID = row.QuestionID;
        }
        return entity;
      });
      return runViewResult<T>(true, rows as unknown as T[]);
    }
    return runViewResult<T>(true, []);
  };

  const provider = {
    RunView: runView,
    // Batched reads go through the SAME emulation as single ones. This returned an empty array
    // until the file-link reconciler started batching, at which point "no results" and "the view
    // did not run" became indistinguishable to the code under test.
    RunViews: async <T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> =>
      Promise.all(params.map((p) => runView<T>(p))),
    GetEntityObject: async (entityName: string) =>
      makeFakeEntity(entityName, saved, deleted, config.failSaveFor === entityName, responseStore),
    EntityByName: (entityName: string) =>
      makeFakeEntityInfo(entityName, config.createPermissions[entityName] ?? false),
  };

  return {
    provider: provider as unknown as DatabaseProviderBase,
    saved,
    deleted,
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
  // A bare `Status='Partial'` predicate (no explicit `=`) is emitted literally by the adopt/by-id
  // lookups; the eq() form above already covers it.
  return (
    matchesStatusIn(row, filter) &&
    eq('Status', row.Status) &&
    eq('ID', row.ID) &&
    eq('AnonymousSessionID', row.AnonymousSessionID) &&
    eq('FormVersionID', row.FormVersionID) &&
    matchesSourceMetadataLike(row, filter)
  );
}

/**
 * Emulate the `Status IN ('A','B')` predicate the session lookup emits.
 *
 * A real test double has to model the query it stands in for. When this fake only understood
 * `Status='X'`, an `IN` filter matched every row regardless of status — so the very test written
 * to prove dedupe recognises a sealed session would have passed against a lookup that recognised
 * nothing. Absent from the filter => matches (the `=` form is checked separately).
 */
function matchesStatusIn(row: ExistingResponseRow, filter: string): boolean {
  const m = filter.match(/(?:^|\W)Status\s+IN\s*\(([^)]*)\)/i);
  if (m === null) {
    return true;
  }
  const allowed = [...m[1].matchAll(/'([^']*)'/g)].map((q) => q[1]);
  return allowed.includes(row.Status);
}

/**
 * Emulate the `SourceMetadata LIKE '%...%' ESCAPE '\'` predicate the client-id proof lookups add:
 * the stored SourceMetadata must contain the (unescaped) needle. Absent from the filter => matches.
 */
function matchesSourceMetadataLike(row: ExistingResponseRow, filter: string): boolean {
  const m = filter.match(/SourceMetadata\s+LIKE\s+'%(.*?)%'\s+ESCAPE/i);
  if (m === null) {
    return true;
  }
  const needle = m[1].replace(/\\([\\%_])/g, '$1');
  return (row.SourceMetadata ?? '').includes(needle);
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
    automations: [],
    endScreens: [],
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
