import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { ActionDataProvider } from '../../shared/action-provider';
import type { BindingOutcome } from '../binding-executor';

const LEDGER_ENTITY = 'MJ_BizApps_Forms: Form Entity Binding Records';

/** Ledger rows the mocked provider hands back, keyed by whatever the read asked for. */
const state: {
  existingId: string | null;
  readRows: Record<string, unknown>[];
  loggedMessages: string[];
} = { existingId: null, readRows: [], loggedMessages: [] };

// The global Metadata/RunView (what `new Metadata()` / `new RunView()` with no args resolve to)
// THROW on any use. Neither ledger function may ever fall back to them — every read and write has
// to go through the `provider` argument the test passes explicitly, exactly as a caller-supplied
// RunActionParams.Provider does in production (bizapps-forms#260).
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    async GetEntityObject(): Promise<never> {
      throw new Error('global provider used');
    }
  }
  class RunView {
    constructor(private readonly provider?: { RunView(p: unknown, u?: unknown): Promise<unknown> } | null) {}
    async RunView(params: unknown, user?: unknown): Promise<unknown> {
      if (!this.provider) throw new Error('global provider used');
      return this.provider.RunView(params, user);
    }
  }
  return { ...actual, Metadata, RunView, LogError: (message: string) => state.loggedMessages.push(message) };
});

const { readPriorBindingOutcome, recordBindingLedgerRow } = await import('../binding-ledger');

const fakeUser = { Name: 'tester' } as unknown as UserInfo;

/** A row this gateway's `Save` writes into, so a test can inspect what was persisted. */
class FakeLedgerRow {
  public BindingID = '';
  public FormResponseID = '';
  public TargetEntityID = '';
  public TargetRecordID: string | null = null;
  public Outcome = '';
  public WrittenFields: string | null = null;
  public LatestResult = { CompleteMessage: '' };
  public loaded = false;
  public saved = false;
  public NewRecord(): void {
    this.loaded = false;
  }
  public async Load(id: string): Promise<boolean> {
    this.loaded = true;
    return id === state.existingId;
  }
  public async Save(): Promise<boolean> {
    this.saved = true;
    return true;
  }
}

/** The fake provider passed explicitly to every call below. */
function fakeProvider(): ActionDataProvider {
  return {
    async RunView<T>(): Promise<{ Success: boolean; Results: T[] }> {
      return { Success: true, Results: state.readRows as unknown as T[] };
    },
    async GetEntityObject<T>(entityName: string): Promise<T> {
      if (entityName !== LEDGER_ENTITY) {
        throw new Error(`Unexpected GetEntityObject('${entityName}')`);
      }
      return new FakeLedgerRow() as unknown as T;
    },
  } as unknown as ActionDataProvider;
}

beforeEach(() => {
  state.existingId = null;
  state.readRows = [];
  state.loggedMessages = [];
});

describe('readPriorBindingOutcome — routes through the supplied provider, never the global (#260)', () => {
  it('reports null (never run) when no ledger row matches', async () => {
    const result = await readPriorBindingOutcome('binding-1', 'resp-1', fakeUser, fakeProvider());
    expect(result).toBeNull();
  });

  it('reads the prior outcome off the supplied provider', async () => {
    state.readRows = [{ Outcome: 'Created', TargetRecordID: 'rec-1', WrittenFields: '["Email"]' }];

    const result = await readPriorBindingOutcome('binding-1', 'resp-1', fakeUser, fakeProvider());

    expect(result).toEqual({ kind: 'Created', targetRecordId: 'rec-1', writtenFields: ['Email'] });
  });
});

describe('recordBindingLedgerRow — routes through the supplied provider, never the global (#260)', () => {
  const outcome: BindingOutcome = { kind: 'Created', targetRecordId: 'rec-1', writtenFields: ['Email'] };

  it('creates a new ledger row through the supplied provider when none exists', async () => {
    await recordBindingLedgerRow('binding-1', 'entity-1', 'resp-1', outcome, fakeUser, fakeProvider());

    // Reaching this point without the mocked global's `throw new Error('global provider used')`
    // firing is itself most of the assertion — see the `vi.mock` comment above.
    expect(state.loggedMessages).toEqual([]);
  });

  it('loads and updates the existing row when the read finds one', async () => {
    state.existingId = 'ledger-row-1';
    state.readRows = [{ ID: 'ledger-row-1' }];

    await recordBindingLedgerRow('binding-1', 'entity-1', 'resp-1', outcome, fakeUser, fakeProvider());

    expect(state.loggedMessages).toEqual([]);
  });
});
