/**
 * A stand-in for a generated entity class, for specs that run an entity SERVER subclass over it.
 *
 * The technique is the one `FormDistributionEntityServer.behaviour.spec.ts` uses: mock
 * `@mj-biz-apps/forms-entities` so the generated base is this class, and let the real subclass run
 * on top. What this base adds is MJ's dirty tracking, modelled rather than hand-set per test: a
 * record holds a STORED snapshot (what `Load` read, what the last `Save` wrote), and
 * `GetFieldByName` answers `OldValue` / `Dirty` by comparing the live property with it — so a test
 * writes `version.Status = 'Retired'` exactly as production code does, and the subclass sees the
 * change the way it would on a real `BaseEntity`.
 *
 * `Save()` and `Delete()` record what they were asked and stand in for MJ's own write. They do NOT
 * call `ValidateAsync` — MJ does that inside its own `Save()`, and a spec that wants to know what a
 * save would be refused for calls `ValidateAsync()` directly, the same method MJ calls.
 */
import type { BaseEntityResult, EntityDeleteOptions, EntitySaveOptions, UserInfo } from '@memberjunction/core';

/** One field as `BaseEntity.GetFieldByName` returns it — the three members the subclasses read. */
export interface FakeFieldState {
  Value: unknown;
  OldValue: unknown;
  Dirty: boolean;
}

/** What a fake record recorded, in order: `save`, `delete`, plus anything a test pushes. */
export type FakeEvent = string;

export class FakeEntityBase {
  /** The row as the database holds it; `null` until the record is loaded or first saved. */
  public stored: Record<string, unknown> | null = null;
  public events: FakeEvent[] = [];
  public saveOptions: (EntitySaveOptions | undefined)[] = [];
  public saveResult = true;
  public deleteResult = true;
  public LatestResult: { CompleteMessage: string } | null = null;
  public ContextCurrentUser: UserInfo | undefined = { ID: 'author-1', Name: 'Author' } as unknown as UserInfo;
  /** Set by the spec to the provider under test (usually `makeFakeProvider(...).provider`). */
  public ProviderToUse: unknown = undefined;
  /**
   * The metadata the subclasses read. `TrackRecordChanges` is on, as it is for every Forms entity
   * the subclasses guard; a spec turns it off to drive the untracked-update refusal.
   */
  public EntityInfo = { SchemaName: '__mj_BizAppsForms', BaseTable: '', TrackRecordChanges: true };

  /** Hydrate as a row loaded from the database: every field clean. */
  public load(values: Record<string, unknown>): this {
    Object.assign(this, values);
    this.stored = { ...values };
    return this;
  }

  public get IsSaved(): boolean {
    return this.stored !== null;
  }

  public GetFieldByName(name: string): FakeFieldState {
    const value = (this as unknown as Record<string, unknown>)[name];
    const old = this.stored ? this.stored[name] : null;
    return { Value: value, OldValue: old, Dirty: this.stored ? old !== value : value !== undefined };
  }

  public RegisterResultHistoryEntry(result: BaseEntityResult): void {
    this.LatestResult = { CompleteMessage: result.Message };
  }

  /** The generated classes add nothing asynchronous; neither does this. */
  public async ValidateAsync(): Promise<{ Success: boolean; Errors: { Source: string; Message: string; Value: unknown }[] }> {
    return { Success: true, Errors: [] };
  }

  public async Save(options?: EntitySaveOptions): Promise<boolean> {
    this.events.push('save');
    this.saveOptions.push(options);
    if (this.saveResult) {
      this.stored = { ...(this.stored ?? {}), ...this.columnValues() };
    }
    return this.saveResult;
  }

  public async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
    this.events.push('delete');
    return this.deleteResult;
  }

  /** The record's column values: every own enumerable property that is not part of this harness. */
  protected columnValues(): Record<string, unknown> {
    const harness = new Set([
      'EntityInfo',
      'stored',
      'events',
      'saveOptions',
      'saveResult',
      'deleteResult',
      'LatestResult',
      'ContextCurrentUser',
      'ProviderToUse',
    ]);
    return Object.fromEntries(Object.entries(this).filter(([key]) => !harness.has(key)));
  }
}
