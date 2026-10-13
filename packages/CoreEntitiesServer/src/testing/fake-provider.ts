/**
 * Test double for the MJ server provider — the slice of `DatabaseProviderBase` that Forms' server
 * code touches, typed against the real interfaces (no `any`) and cast once at the boundary where
 * the fake is handed to code expecting the full class.
 *
 * Lives here, behind the package's `./testing` subpath, because every server-side layer tests
 * against it: the entity server subclasses and engines in this package, and the public-submit
 * pipeline in `forms-server`. It is NOT exported from the package's runtime entry (`.`), so a host
 * that loads the package never evaluates it.
 *
 * What it models, and why each piece exists:
 *  - `RunView` / `RunViews` with `ExtraFilter` emulation, because a fake that ignores a filter lets
 *    a lookup that matches nothing pass a test written to prove it matches something.
 *  - `GetEntityObject` handing back recording entities, so a test asserts on what was WRITTEN.
 *  - Entity transactions (`SupportsEntityTransactions`, `BeginEntityTransaction`) with savepoint
 *    nesting and rollback, so `RunInEntityTransaction` from `@memberjunction/core` runs its real
 *    code path against it and a rolled-back unit of work leaves no recorded writes behind.
 *  - `ExecuteSQL`, recording every statement and answering from a script, so code that reads under
 *    a row lock or counts affected rows (`Dialect.AffectedRowCountSQL`) can be driven and asserted.
 */
import type {
  DatabaseProviderBase,
  EntityInfo,
  EntityTransactionScope,
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
  /** Per-entity CanCreate for the scope check; an entity absent from the map is refused. */
  createPermissions?: CreatePermissions;
  /**
   * Per-entity CanUpdate, for the authoring operations' `Authorize` (which require Update on
   * `MJ_BizApps_Forms: Forms`). An entity absent from the map is refused, like `createPermissions`.
   */
  updatePermissions?: Record<string, boolean>;
  /** Force a RunView failure for a given entity name (to exercise fail-closed paths). */
  failRunViewFor?: string;
  /** Force a Save() to return false for a given entity name. */
  failSaveFor?: string;
  /**
   * Force a generic-table entity's Save() to return false when this says so — for failing ONE row
   * of several, which is what a rollback test needs (the rows saved before it must be undone).
   * Return a string instead of `true` to fail with that message on `LatestResult.CompleteMessage`
   * — how a test stands in for a specific database error, such as a unique-index violation.
   */
  failSaveWhen?: (entityName: string, values: Record<string, unknown>) => boolean | string;
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
  /**
   * Generic rows per entity name. An entity named here is served ONLY from its table — the
   * special-purpose fixtures above (`distribution`, `version`, …) are ignored for it — with
   * `RunView` honouring `Column='value'` equalities and `Status IN (…)` in the filter, all three
   * result types, and `entity_object` rows that write back to the table when saved. The table is
   * live: tests may read it after the code under test ran.
   */
  tables?: Record<string, FakeRow[]>;
  /**
   * How `ExecuteSQL` answers. Scripts are tried in order; the first whose `match` hits the statement
   * supplies its rows (or throws `error`). An unmatched statement returns no rows — and is still
   * recorded in `statements`, which is where a test asserts what was sent.
   */
  sql?: FakeSqlScript[];
  /** Which dialect the provider reports. Defaults to `sqlserver`. */
  platform?: 'sqlserver' | 'postgresql';
  /** Report `SupportsEntityTransactions = false`, to drive a caller's no-transaction path. */
  noTransactions?: boolean;
  /**
   * Hand code under test something other than the bare table record for a generic-table entity —
   * typically a real entity SERVER subclass over a fake base that writes through to `record` — so
   * its overrides run on rows that `RunView` and `GetEntityObject` return. Applied to both.
   */
  wrapEntity?: (entityName: string, record: FakeTableRecord) => unknown;
}

/**
 * A generic-table entity as the fake builds it: the row's columns as properties, plus the slice of
 * `BaseEntity` the fake implements. `Save()` writes every column back to the table row.
 */
export interface FakeTableRecord {
  [column: string]: unknown;
  readonly IsSaved: boolean;
  LatestResult: { CompleteMessage: string };
  NewRecord(): boolean;
  Load(id: string): Promise<boolean>;
  Save(): Promise<boolean>;
  Delete(): Promise<boolean>;
}

/** One row of a generic {@link FakeProviderConfig.tables} entry. Must carry its primary key `ID`. */
export type FakeRow = Record<string, unknown> & { ID: string };

/** One scripted answer for `ExecuteSQL`. */
export interface FakeSqlScript {
  match: RegExp | string;
  /** The rows to answer with — or a function of the statement, to answer from a table it names. */
  rows?: Record<string, unknown>[] | ((sql: string) => Record<string, unknown>[]);
  /** Make the statement fail, as a database error would. */
  error?: string;
}

/** One statement `ExecuteSQL` received, and whether a transaction was open when it ran. */
export interface RecordedStatement {
  sql: string;
  parameters: unknown[] | undefined;
  inTransaction: boolean;
}

/** The fake provider plus inspection handles for tests. */
export interface FakeProvider {
  provider: DatabaseProviderBase;
  saved: SavedRecord[];
  /** Rows `Delete()`d, so a test can assert a removal and not just an absence. */
  deleted: SavedRecord[];
  distribution?: mjBizAppsFormsFormDistributionEntityType;
  /**
   * Transaction boundaries in order: `begin`, `begin:nested`, `commit`, `commit:nested`,
   * `rollback`, `rollback:nested`. A rollback also removes from `saved` / `deleted` (and undoes
   * table writes) everything recorded since its own begin, as a database would.
   */
  transactions: string[];
  /** Every `ExecuteSQL` call, in order. */
  statements: RecordedStatement[];
  /** The live generic tables (see {@link FakeProviderConfig.tables}). */
  tables: Record<string, FakeRow[]>;
}

const FORM_RESPONSE_ENTITY = 'MJ_BizApps_Forms: Form Responses';
const FORM_RESPONSE_ANSWER_ENTITY = 'MJ_BizApps_Forms: Form Response Answers';
const FORM_DISTRIBUTION_ENTITY = 'MJ_BizApps_Forms: Form Distributions';
const FORM_VERSION_ENTITY = 'MJ_BizApps_Forms: Form Versions';
const FORM_UPLOAD_ENTITY = 'MJ_BizApps_Forms: Form Uploads';
/** MJ core's file-link entity; the file-link reconciler in forms-server reads and writes it. */
const FILE_ENTITY_RECORD_LINK_ENTITY = 'MJ: File Entity Record Links';

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

/** Build a fake EntityInfo whose GetUserPermisions reflects the configured CanCreate / CanUpdate. */
function makeFakeEntityInfo(entityName: string, canCreate: boolean, canUpdate: boolean): EntityInfo {
  const permissions = { CanCreate: canCreate, CanRead: true, CanUpdate: canUpdate, CanDelete: false } as EntityUserPermissionInfo;
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
  const transactions: string[] = [];
  const statements: RecordedStatement[] = [];
  const tables: Record<string, FakeRow[]> = {};
  for (const [name, rows] of Object.entries(config.tables ?? {})) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const tx = new FakeTransactionLog(saved, deleted, transactions);
  const wrap = (entityName: string, record: FakeTableRecord): unknown =>
    config.wrapEntity ? config.wrapEntity(entityName, record) : record;

  // The persistent row store. RunView-visible rows AND race-only rows both live here (so a
  // CREATE collides and the recovery Load resolves); only `existingResponses` is returned by
  // RunView, so `concurrentlyCreated` rows are the invisible-to-SELECT race window.
  const responseStore: ResponseStore = new Map();
  for (const row of [...(config.existingResponses ?? []), ...(config.concurrentlyCreated ?? [])]) {
    responseStore.set(row.ID, row);
  }

  const runView = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
    const name = params.EntityName ?? '';
    if (config.failRunViewFor && name === config.failRunViewFor) {
      return runViewResult<T>(false, []);
    }
    const table = tables[name];
    if (table) {
      return runTableView<T>(params, table, (row) =>
        wrap(name, makeTableEntity(name, table, row, {
          saved,
          deleted,
          tx,
          failSave: config.failSaveFor === name,
          failSaveWhen: config.failSaveWhen,
        })),
      );
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
    GetEntityObject: async (entityName: string) => {
      const table = tables[entityName];
      if (table) {
        return wrap(entityName, makeTableEntity(entityName, table, null, {
          saved,
          deleted,
          tx,
          failSave: config.failSaveFor === entityName,
          failSaveWhen: config.failSaveWhen,
        }));
      }
      return makeFakeEntity(entityName, saved, deleted, config.failSaveFor === entityName, responseStore);
    },
    EntityByName: (entityName: string) =>
      makeFakeEntityInfo(
        entityName,
        config.createPermissions?.[entityName] ?? false,
        config.updatePermissions?.[entityName] ?? false,
      ),
    SupportsEntityTransactions: config.noTransactions !== true,
    BeginEntityTransaction: async (): Promise<EntityTransactionScope> => tx.begin(),
    get TransactionDepth(): number {
      return tx.depth;
    },
    PlatformKey: config.platform ?? 'sqlserver',
    QuoteIdentifier: (name: string): string => (config.platform === 'postgresql' ? `"${name}"` : `[${name}]`),
    QuoteSchemaAndView: (schema: string, object: string): string =>
      config.platform === 'postgresql' ? `"${schema}"."${object}"` : `[${schema}].[${object}]`,
    Dialect: {
      // The SQL Server spelling, which is all a test needs: the statement is scripted, not executed.
      AffectedRowCountSQL: (dml: string, alias: string): string => `${dml};\nSELECT @@ROWCOUNT AS [${alias}]`,
    },
    ExecuteSQL: async <T>(sql: string, parameters?: unknown[]): Promise<T[]> => {
      statements.push({ sql, parameters, inTransaction: tx.depth > 0 });
      const script = (config.sql ?? []).find((candidate) =>
        typeof candidate.match === 'string' ? sql.includes(candidate.match) : candidate.match.test(sql),
      );
      if (script?.error) {
        throw new Error(script.error);
      }
      const rows = typeof script?.rows === 'function' ? script.rows(sql) : script?.rows ?? [];
      return rows.map((row) => ({ ...row })) as T[];
    },
  };

  return {
    provider: provider as unknown as DatabaseProviderBase,
    saved,
    deleted,
    distribution: config.distribution,
    transactions,
    statements,
    tables,
  };
}

/**
 * The fake's transaction stack: depth-counted like the real provider (the outermost scope is the
 * physical transaction, nested ones are savepoints), settle-once like `EntityTransactionScope`, and
 * able to undo what a rolled-back scope recorded.
 */
class FakeTransactionLog {
  public depth = 0;
  /** Undo steps for table writes, in the order they happened. */
  private readonly undo: (() => void)[] = [];

  constructor(
    private readonly saved: SavedRecord[],
    private readonly deleted: SavedRecord[],
    private readonly log: string[],
  ) {}

  /** Remember how to put a table write back, if a scope enclosing it rolls back. */
  public journal(step: () => void): void {
    if (this.depth > 0) {
      this.undo.push(step);
    }
  }

  public begin(): EntityTransactionScope {
    const nested = this.depth > 0;
    this.depth += 1;
    const depthAtBegin = this.depth;
    this.log.push(nested ? 'begin:nested' : 'begin');
    const mark = { saved: this.saved.length, deleted: this.deleted.length, undo: this.undo.length };
    let settled = false;
    const settle = async (commit: boolean): Promise<void> => {
      if (settled) {
        return;
      }
      if (this.depth !== depthAtBegin) {
        // The real provider logs this and carries on, entangling two units of work in one
        // physical transaction. A test double should make it impossible to miss instead.
        throw new Error(
          `Fake transaction scope settled out of order: begun at depth ${depthAtBegin}, settled at depth ` +
            `${this.depth}. Two units of work interleaved their scopes on one provider instance.`,
        );
      }
      settled = true;
      this.depth -= 1;
      this.log.push(`${commit ? 'commit' : 'rollback'}${nested ? ':nested' : ''}`);
      if (!commit) {
        this.saved.length = mark.saved;
        this.deleted.length = mark.deleted;
        for (const step of this.undo.splice(mark.undo).reverse()) {
          step();
        }
      } else if (!nested) {
        this.undo.length = 0;
      }
    };
    return { IsNested: nested, Commit: () => settle(true), Rollback: () => settle(false) };
  }
}

/** What a generic-table entity needs from its provider. */
interface TableEntityHost {
  saved: SavedRecord[];
  deleted: SavedRecord[];
  tx: FakeTransactionLog;
  failSave: boolean;
  failSaveWhen?: (entityName: string, values: Record<string, unknown>) => boolean | string;
}

/**
 * An entity backed by one row of a generic table: reads come from the row, `Save()` writes the
 * whole value set back (or inserts the row when new), `Delete()` removes it. Every write is
 * journalled so a rolled-back transaction puts the table back as it was.
 */
function makeTableEntity(entityName: string, table: FakeRow[], row: FakeRow | null, host: TableEntityHost): FakeTableRecord {
  const values: Record<string, unknown> = row ? { ...row } : {};
  let current: FakeRow | null = row;
  let insertCount = 0;
  const record = new Proxy(
    {
      LatestResult: { CompleteMessage: 'forced save failure' },
      get IsSaved(): boolean {
        return current !== null;
      },
      NewRecord: () => {
        current = null;
        for (const key of Object.keys(values)) {
          delete values[key];
        }
        return true;
      },
      Load: async (id: string) => {
        const found = table.find((candidate) => candidate.ID === id) ?? null;
        current = found;
        if (found) {
          Object.assign(values, found);
        }
        return found !== null;
      },
      Save: async () => {
        const forced = host.failSaveWhen?.(entityName, { ...values });
        if (typeof forced === 'string') {
          record.LatestResult = { CompleteMessage: forced };
          return false;
        }
        if (host.failSave || forced === true) {
          return false;
        }
        if (current === null) {
          insertCount += 1;
          const inserted: FakeRow = { ...values, ID: String(values.ID ?? `id-${entityName}-${table.length + insertCount}`) };
          values.ID = inserted.ID;
          table.push(inserted);
          current = inserted;
          host.tx.journal(() => {
            table.splice(table.indexOf(inserted), 1);
          });
        } else {
          const target = current;
          const before = { ...target };
          Object.assign(target, values);
          host.tx.journal(() => {
            for (const key of Object.keys(target)) {
              delete target[key];
            }
            Object.assign(target, before);
          });
        }
        host.saved.push({ entityName, values: { ...values } });
        return true;
      },
      Delete: async () => {
        const target = current;
        if (target) {
          const index = table.indexOf(target);
          table.splice(index, 1);
          host.tx.journal(() => {
            table.splice(index, 0, target);
          });
        }
        host.deleted.push({ entityName, values: { ID: values.ID } });
        return true;
      },
    },
    {
      set(target, prop: string, value) {
        if (prop in target) {
          Reflect.set(target, prop, value);
          return true;
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
  return record as unknown as FakeTableRecord;
}

/** Serve one `RunView` from a generic table, honouring the filter and the requested result type. */
function runTableView<T>(
  params: RunViewParams,
  table: FakeRow[],
  toEntity: (row: FakeRow) => unknown,
): RunViewResult<T> {
  const rawFilter = params.ExtraFilter;
  const filter = IsPlatformSQL(rawFilter) ? rawFilter.default : rawFilter ?? '';
  const matching = table.filter((row) => matchesRowFilter(row, filter));
  if (params.ResultType === 'count_only') {
    return runViewResult<T>(true, [], matching.length);
  }
  const limited = params.MaxRows ? matching.slice(0, params.MaxRows) : matching;
  const rows = params.ResultType === 'entity_object' ? limited.map(toEntity) : limited.map((row) => ({ ...row }));
  return { ...runViewResult<T>(true, rows as T[]), TotalRowCount: matching.length };
}

/**
 * A generic row matches when every `Column='value'` equality, every bit equality (`Column=1`,
 * `Column = 0`), every `Column IN ('a','b')` list and every `Column IS [NOT] NULL` in the filter holds
 * for it. Anything else in the filter is ignored — so a test that depends on a richer predicate must
 * assert on the filter text too, rather than trusting this to have applied it.
 *
 * `IS [NOT] NULL` is honoured for the same reason as bits: a read of "this form's slugs" that also
 * returned its slug-less links handed `null` to code that asked for slugs. A missing column reads as
 * null, as it would in a row the database filled with its default.
 *
 * Bit equalities are honoured because a flag is often the whole point of a read (`IsTemplate=1`):
 * ignoring it answered with every row, so a check meant to look only at templates also "found" the
 * ordinary forms. A row holds a bit as a boolean or as 0/1, and both read the same here.
 */
function matchesRowFilter(row: FakeRow, filter: string): boolean {
  for (const m of filter.matchAll(/(?:^|[^\w.])\[?(\w+)\]?\s*=\s*N?'((?:[^']|'')*)'/g)) {
    if (String(row[m[1]] ?? '') !== m[2].replace(/''/g, "'")) {
      return false;
    }
  }
  for (const m of filter.matchAll(/(?:^|[^\w.])\[?(\w+)\]?\s*=\s*([01])(?![\w.'])/g)) {
    if (Number(row[m[1]] ?? 0) !== Number(m[2])) {
      return false;
    }
  }
  for (const m of filter.matchAll(/(?:^|[^\w.])\[?(\w+)\]?\s+IS\s+(NOT\s+)?NULL\b/gi)) {
    const isNull = row[m[1]] === null || row[m[1]] === undefined;
    if (isNull === Boolean(m[2])) {
      return false;
    }
  }
  for (const m of filter.matchAll(/(?:^|[^\w.])\[?(\w+)\]?\s+IN\s*\(([^)]*)\)/gi)) {
    const allowed = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((q) => q[1].replace(/''/g, "'"));
    if (!allowed.includes(String(row[m[1]] ?? ''))) {
      return false;
    }
  }
  return true;
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
