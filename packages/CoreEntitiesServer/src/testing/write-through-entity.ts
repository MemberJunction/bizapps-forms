/**
 * A stand-in for a GENERATED entity base class, so a spec can run the real entity server
 * subclasses (`FormEntityServer`, `FormVersionEntityServer`) over the shared fake provider's tables.
 *
 * How a spec uses it: mock `@mj-biz-apps/forms-entities` so the generated base the subclass extends
 * IS this class, then hand {@link writeThroughEntities} to `makeFakeProvider({ wrapEntity })`. Every
 * entity the code under test gets from `GetEntityObject` or an `entity_object` view is then the real
 * subclass, attached to a row of the fake's table — so its `ValidateAsync` runs on every save
 * exactly as MJ's `BaseEntity.Save()` would run it, and a save it allows lands in whatever
 * transaction the fake provider holds.
 *
 * Why the engines need this rather than the fake's plain table records: the engine's whole claim is
 * that it is the ONE writer the invariants let publish. A spec over plain records would pass whether
 * or not the engine set `AuthorizedByEngine`, and whether or not the invariants would have refused
 * it — it would prove the engine writes rows, not that the rows it writes are allowed.
 *
 * What it models of `BaseEntity`, and nothing more: stored-vs-live dirty tracking for
 * `GetFieldByName` (`OldValue` / `Dirty`), `IsSaved`, `NewRecord` / `Load` / `Save` / `Delete`,
 * `ValidateAsync` before every save unless the options switch it off (as MJ's `_innerSave` does),
 * and `RegisterResultHistoryEntry` so a refusal reaches `LatestResult.CompleteMessage`.
 */
import type { BaseEntityResult, EntitySaveOptions, UserInfo } from '@memberjunction/core';
import type { FakeTableRecord } from './fake-provider.js';

/** One field as `BaseEntity.GetFieldByName` returns it — the members the subclasses read. */
export interface WriteThroughFieldState {
  Value: unknown;
  OldValue: unknown;
  Dirty: boolean;
}

/** One validation failure, shaped like MJ's `ValidationErrorInfo` for what the harness reads. */
interface WriteThroughValidation {
  Success: boolean;
  Errors: { Source: string; Message: string; Value: unknown }[];
}

/**
 * Properties of the harness and of the server subclasses that are NOT columns. A column is every
 * other own property — which is why the subclasses' transient flags (the engine flag, and the
 * distribution hook's re-entrancy guard) are named here: written back as a column they would reach
 * the table, and a spec could then "prove" a flag that MJ never persists.
 */
const NOT_COLUMNS = new Set([
  'record',
  'columns',
  'stored',
  'LatestResult',
  'ContextCurrentUser',
  'ProviderToUse',
  'EntityInfo',
  'AuthorizedByEngine',
  'credentialWriteInFlight',
]);

export class WriteThroughEntityBase {
  /** The fake table row this entity reads from and writes to. */
  public record: FakeTableRecord | null = null;
  /** The columns {@link Load} and attach copy out of the record. */
  public columns: readonly string[] = [];
  /** The row as the database holds it; `null` until loaded or first saved. */
  public stored: Record<string, unknown> | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  public ContextCurrentUser: UserInfo | undefined = undefined;
  public ProviderToUse: unknown = undefined;
  /** What the subclasses read: every Forms entity they guard has `TrackRecordChanges` on. */
  public EntityInfo = { SchemaName: '__mj_BizAppsForms', BaseTable: '', TrackRecordChanges: true };

  public get IsSaved(): boolean {
    return this.stored !== null;
  }

  public GetFieldByName(name: string): WriteThroughFieldState {
    const value = (this as unknown as Record<string, unknown>)[name];
    const old = this.stored ? this.stored[name] : null;
    return { Value: value, OldValue: old, Dirty: this.stored ? old !== value : value !== undefined };
  }

  public RegisterResultHistoryEntry(result: BaseEntityResult): void {
    this.LatestResult = { CompleteMessage: result.Message };
  }

  /** The generated classes add no asynchronous validation; the subclasses' overrides do. */
  public async ValidateAsync(): Promise<WriteThroughValidation> {
    return { Success: true, Errors: [] };
  }

  public NewRecord(): boolean {
    for (const column of Object.keys(this.columnValues())) {
      delete (this as unknown as Record<string, unknown>)[column];
    }
    this.stored = null;
    return this.attachedRecord().NewRecord();
  }

  public async Load(id: string): Promise<boolean> {
    const record = this.attachedRecord();
    if (!(await record.Load(id))) {
      return false;
    }
    this.hydrate();
    return true;
  }

  /**
   * Validate the way MJ does, then write every column back through the record — so the write joins
   * the fake provider's transaction, and a rollback undoes it.
   */
  public async Save(options?: EntitySaveOptions): Promise<boolean> {
    if (!options?.ReplayOnly && options?.SkipAsyncValidation !== true) {
      const validation = await this.ValidateAsync();
      if (!validation.Success) {
        this.LatestResult = { CompleteMessage: validation.Errors.map((e) => e.Message).join(' ') };
        return false;
      }
    }
    const record = this.attachedRecord();
    const values = this.columnValues();
    for (const [column, value] of Object.entries(values)) {
      record[column] = value;
    }
    if (!(await record.Save())) {
      this.LatestResult = { CompleteMessage: record.LatestResult.CompleteMessage };
      return false;
    }
    (this as unknown as Record<string, unknown>).ID = record.ID;
    this.stored = { ...values, ID: record.ID };
    return true;
  }

  public async Delete(): Promise<boolean> {
    const deleted = await this.attachedRecord().Delete();
    if (deleted) {
      this.stored = null;
    }
    return deleted;
  }

  /** Copy the named columns out of the attached record, as a load from the database would. */
  public hydrate(): void {
    const record = this.attachedRecord();
    const values = Object.fromEntries(this.columns.map((column) => [column, record[column]]));
    Object.assign(this, values);
    this.stored = { ...values };
  }

  private attachedRecord(): FakeTableRecord {
    if (!this.record) {
      throw new Error('WriteThroughEntityBase: attach a fake table record before using the entity.');
    }
    return this.record;
  }

  /** Every own property that is a column — see {@link NOT_COLUMNS}. */
  private columnValues(): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this).filter(([key]) => !NOT_COLUMNS.has(key)));
  }
}

/** Which real class to construct for an entity name, and the columns to load into it. */
export interface WriteThroughEntitySpec {
  construct: () => WriteThroughEntityBase;
  columns: readonly string[];
}

/**
 * A `wrapEntity` for `makeFakeProvider`: entities named in `specs` come back as the real class,
 * attached to their table row (hydrated when the row already exists); every other entity is the
 * fake's plain record. `provider` is read lazily because the provider does not exist yet when the
 * wrapper is built.
 */
export function writeThroughEntities(
  specs: Readonly<Record<string, WriteThroughEntitySpec>>,
  provider: () => unknown,
  user?: UserInfo,
): (entityName: string, record: FakeTableRecord) => unknown {
  return (entityName, record) => {
    const spec = specs[entityName];
    if (!spec) {
      return record;
    }
    const entity = spec.construct();
    entity.record = record;
    entity.columns = spec.columns;
    entity.ProviderToUse = provider();
    entity.ContextCurrentUser = user;
    if (record.IsSaved) {
      entity.hydrate();
    }
    return entity;
  };
}
