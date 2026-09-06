import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The Action is the re-drivable entry point — an approval hook in bizapps-tasks, an admin
 * clicking "re-run". Both are things that happen twice.
 *
 * So it has to honour the same identity ledger the submit path does. It briefly did not: it never
 * read a prior outcome and never wrote one, which under an `AlwaysCreate` rule meant a second
 * invocation silently created a second business record, with nothing in the ledger to show either
 * had run. These tests pin the ledger participation rather than the executor's own logic, which is
 * covered in binding-executor.spec.ts.
 */

/** Ledger rows keyed by the filter the reader builds; empty means "never run". */
const ledgerRows: { Outcome: string; TargetRecordID: string | null; WrittenFields: string | null }[] = [];
const savedLedgerRows: { BindingID: string; FormResponseID: string; Outcome: string }[] = [];
/** Every entity a record was written to by the gateway — proof of a real target write. */
const targetWrites: string[] = [];

class FakeLedgerRow {
  public BindingID = '';
  public FormResponseID = '';
  public TargetEntityID = '';
  public TargetRecordID: string | null = null;
  public Outcome = '';
  public WrittenFields: string | null = null;
  public LatestResult = { CompleteMessage: '' };
  public NewRecord(): void {}
  public async Load(): Promise<boolean> {
    return true;
  }
  public async Save(): Promise<boolean> {
    savedLedgerRows.push({ BindingID: this.BindingID, FormResponseID: this.FormResponseID, Outcome: this.Outcome });
    return true;
  }
}

class FakeBinding {
  public ID = 'binding-1';
  public Status = 'Active';
  public TargetEntityID = 'entity-1';
  public TargetEntityName = 'Known: Entity';
  public FieldMappings =
    '{"version":1,"fields":[{"targetField":"Email","source":{"kind":"question","questionId":"q1"}}]}';
  public IdentityRule = '{"mode":"AlwaysCreate"}';
  public MergePolicy = '{"default":"neverBlank"}';
  public async Load(): Promise<boolean> {
    return true;
  }
}

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class Metadata {
    public EntityByName(name: string) {
      if (name !== 'Known: Entity') {
        return undefined;
      }
      return {
        Name: 'Known: Entity',
        FieldByName: (f: string) => (f.toLowerCase() === 'email' ? { Name: 'Email' } : undefined),
        PrimaryKeys: [{ Name: 'ID' }],
        IncludeInAPI: true,
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        Fields: [{ Name: 'Email', ReadOnly: false }],
      };
    }
    public async GetEntityObject(entityName: string) {
      if (entityName === 'MJ_BizApps_Forms: Form Entity Bindings') {
        return new FakeBinding();
      }
      if (entityName === 'MJ_BizApps_Forms: Form Entity Binding Records') {
        return new FakeLedgerRow();
      }
      // The binding's target record.
      targetWrites.push(entityName);
      return {
        NewRecord: () => {},
        Set: () => {},
        Save: async () => true,
        PrimaryKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'written-1' }] },
        LatestResult: { CompleteMessage: '' },
      };
    }
  }
  class RunView {
    public async RunView(params: { EntityName: string }) {
      if (params.EntityName === 'MJ_BizApps_Forms: Form Entity Binding Records') {
        return { Success: true, Results: [...ledgerRows] };
      }
      return { Success: true, Results: [] };
    }
  }
  return { ...actual, Metadata, RunView, LogError: () => {} };
});

vi.mock('../../shared/form-response-context', () => ({
  loadFormResponseContext: async () => ({
    canonicalAnswers: {
      Has: (id: string) => id === 'q1',
      Get: (id: string) => (id === 'q1' ? 'a@b.com' : undefined),
      Size: 1,
      Entries: () => [['q1', 'a@b.com']],
    },
    // `FormResponseContext` carries BOTH shapes: the collapsed values and the typed projection
    // beside them. The mock returned only the first, so it modelled a context the loader never
    // produces — and the action reads the second to tell the binding executor what type each
    // answer is. A fixture narrower than its contract is a fixture that passes for the wrong
    // reason right up until the code uses the part it left out.
    answers: [
      {
        answerId: 'a1',
        questionId: 'q1',
        questionType: 'Email',
        prompt: 'Email',
        textValue: 'a@b.com',
        numericValue: null,
        dateValue: null,
        dateText: null,
        booleanValue: null,
        jsonValue: null,
        fileId: null,
        score: null,
      },
    ],
  }),
}));

const { BindResponseToEntityAction } = await import('../bind-response-to-entity.action');

function params(): { Params: { Name: string; Value: string }[]; ContextUser: unknown } {
  return {
    Params: [
      { Name: 'BindingID', Value: 'binding-1' },
      { Name: 'FormResponseID', Value: 'response-1' },
    ],
    ContextUser: { Name: 'tester' },
  };
}

async function run(): Promise<{ Success: boolean; ResultCode?: string; Message?: string }> {
  const action = new BindResponseToEntityAction();
  // InternalRunAction is the protected seam BaseAction calls; exercising it directly keeps the
  // test on this action's own behaviour rather than on the Actions framework.
  return (action as unknown as {
    InternalRunAction: (p: unknown) => Promise<{ Success: boolean; ResultCode?: string; Message?: string }>;
  }).InternalRunAction(params());
}

describe('Forms: Bind Response To Entity — ledger participation', () => {
  beforeEach(() => {
    ledgerRows.length = 0;
    savedLedgerRows.length = 0;
    targetWrites.length = 0;
  });

  it('records what it did, so a later re-drive can see this run happened', async () => {
    const result = await run();

    expect(result.Success).toBe(true);
    expect(savedLedgerRows).toHaveLength(1);
    expect(savedLedgerRows[0]).toMatchObject({ BindingID: 'binding-1', FormResponseID: 'response-1' });
  });

  it('THE DOUBLE-INVOKE CASE: a prior outcome short-circuits instead of creating a second record', async () => {
    ledgerRows.push({ Outcome: 'Created', TargetRecordID: 'already-written', WrittenFields: '["Email"]' });

    const result = await run();

    expect(result.Success).toBe(true);
    // AlwaysCreate never matches an existing record, so without the ledger this writes again.
    expect(targetWrites).toHaveLength(0);
    expect(result.Message).toContain('already-written');
  });
});
