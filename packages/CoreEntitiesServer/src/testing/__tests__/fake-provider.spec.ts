/**
 * The shared fake provider is load-bearing for every server-side spec in the repo, so its own
 * claims are tested: a fake that silently ignored a rollback would let every "nothing was written"
 * assertion downstream pass for the wrong reason.
 */
import { describe, expect, it } from 'vitest';
import { RunInEntityTransaction, RunView, type BaseEntity, type IRunViewProvider } from '@memberjunction/core';
import { makeFakeProvider } from '../index.js';

const DISTRIBUTIONS = 'MJ_BizApps_Forms: Form Distributions';

/** A generic-table entity as code under test sees it: typed columns and a generated-style Load. */
type Row = BaseEntity & { ID: string; FormID: string; Status: string; Load(id: string): Promise<boolean> };

function db() {
  return makeFakeProvider({
    tables: {
      [DISTRIBUTIONS]: [
        { ID: 'd1', FormID: 'form-1', Status: 'Active' },
        { ID: 'd2', FormID: 'form-1', Status: 'Closed' },
        { ID: 'd3', FormID: 'form-2', Status: 'Active' },
      ],
    },
  });
}

describe('entity transactions — RunInEntityTransaction runs its real path against the fake', () => {
  it('reports the capability, and commits a unit of work that returns', async () => {
    const fake = db();
    expect(fake.provider.SupportsEntityTransactions).toBe(true);
    await RunInEntityTransaction(fake.provider, async () => {
      const row = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
      await row.Load('d1');
      row.Status = 'Closed';
      expect(await row.Save()).toBe(true);
    });
    expect(fake.transactions).toEqual(['begin', 'commit']);
    expect(fake.tables[DISTRIBUTIONS][0].Status).toBe('Closed');
  });

  it('a unit of work that throws is rolled back: updates, inserts, deletes and the saved log are all undone', async () => {
    const fake = db();
    await expect(
      RunInEntityTransaction(fake.provider, async () => {
        const updated = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
        await updated.Load('d1');
        updated.Status = 'Closed';
        await updated.Save();
        const inserted = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
        inserted.NewRecord();
        inserted.FormID = 'form-9';
        inserted.Status = 'Draft';
        await inserted.Save();
        const removed = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
        await removed.Load('d3');
        await removed.Delete();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(fake.transactions).toEqual(['begin', 'rollback']);
    expect(fake.tables[DISTRIBUTIONS]).toEqual([
      { ID: 'd1', FormID: 'form-1', Status: 'Active' },
      { ID: 'd2', FormID: 'form-1', Status: 'Closed' },
      { ID: 'd3', FormID: 'form-2', Status: 'Active' },
    ]);
    expect(fake.saved).toEqual([]);
    expect(fake.deleted).toEqual([]);
  });

  it('nests as savepoints: an inner rollback undoes only the inner work, and the outer still commits', async () => {
    const fake = db();
    await RunInEntityTransaction(fake.provider, async () => {
      const outer = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
      await outer.Load('d1');
      outer.Status = 'Closed';
      await outer.Save();
      await expect(
        RunInEntityTransaction(fake.provider, async () => {
          const inner = await fake.provider.GetEntityObject<Row>(DISTRIBUTIONS);
          await inner.Load('d3');
          inner.Status = 'Closed';
          await inner.Save();
          throw new Error('inner');
        }),
      ).rejects.toThrow('inner');
    });
    expect(fake.transactions).toEqual(['begin', 'begin:nested', 'rollback:nested', 'commit']);
    expect(fake.tables[DISTRIBUTIONS].map((d) => d.Status)).toEqual(['Closed', 'Closed', 'Active']);
    expect(fake.saved).toHaveLength(1);
  });

  it('can be told it cannot transact, and RunInEntityTransaction then runs the work bare', async () => {
    const fake = makeFakeProvider({ noTransactions: true });
    expect(await RunInEntityTransaction(fake.provider, async () => 'ran')).toBe('ran');
    expect(fake.transactions).toEqual([]);
  });
});

describe('ExecuteSQL — recorded, scripted, and aware of the transaction it ran in', () => {
  it('records each statement and whether a transaction was open, and answers from the first matching script', async () => {
    const fake = makeFakeProvider({
      sql: [
        { match: /UPDLOCK/, rows: [{ n: 1 }] },
        { match: 'UPDATE', error: 'deadlock victim' },
      ],
    });
    expect(await fake.provider.ExecuteSQL('SELECT 1')).toEqual([]);
    await RunInEntityTransaction(fake.provider, async () => {
      expect(await fake.provider.ExecuteSQL('SELECT x WITH (UPDLOCK, HOLDLOCK)')).toEqual([{ n: 1 }]);
    });
    await expect(fake.provider.ExecuteSQL('UPDATE t SET x = 1')).rejects.toThrow('deadlock victim');
    expect(fake.statements.map((s) => [s.sql.slice(0, 8), s.inTransaction])).toEqual([
      ['SELECT 1', false],
      ['SELECT x', true],
      ['UPDATE t', false],
    ]);
  });

  it('carries the dialect surface engines build statements with', () => {
    const fake = makeFakeProvider({});
    expect(fake.provider.Dialect.AffectedRowCountSQL('UPDATE t SET x = 1', 'n')).toBe('UPDATE t SET x = 1;\nSELECT @@ROWCOUNT AS [n]');
    expect(fake.provider.QuoteSchemaAndView('__mj_BizAppsForms', 'Form')).toBe('[__mj_BizAppsForms].[Form]');
    expect(makeFakeProvider({ platform: 'postgresql' }).provider.QuoteIdentifier('ID')).toBe('"ID"');
  });
});

describe('generic tables — RunView honours the filter and the result type', () => {
  const view = (fake: ReturnType<typeof db>) => new RunView(fake.provider as unknown as IRunViewProvider);

  it('filters on Column=\'value\' equalities and IN lists', async () => {
    const fake = db();
    const active = await view(fake).RunView<{ ID: string }>({
      EntityName: DISTRIBUTIONS,
      ExtraFilter: "FormID='form-1' AND Status IN ('Active','Draft')",
      ResultType: 'simple',
    });
    expect(active.Results.map((r) => r.ID)).toEqual(['d1']);
  });

  it('filters on bit equalities, reading a stored boolean and a stored 0/1 alike', async () => {
    const fake = makeFakeProvider({
      tables: {
        Forms: [
          { ID: 'f1', Name: 'Intake', IsTemplate: true },
          { ID: 'f2', Name: 'Intake', IsTemplate: false },
          { ID: 'f3', Name: 'Survey', IsTemplate: 1 },
        ],
      },
    });
    const templates = await view(fake).RunView<{ ID: string }>({ EntityName: 'Forms', ExtraFilter: 'IsTemplate=1', ResultType: 'simple' });
    expect(templates.Results.map((r) => r.ID)).toEqual(['f1', 'f3']);
    const forms = await view(fake).RunView<{ ID: string }>({
      EntityName: 'Forms',
      ExtraFilter: "IsTemplate = 0 AND Name='Intake'",
      ResultType: 'simple',
    });
    expect(forms.Results.map((r) => r.ID)).toEqual(['f2']);
  });

  it('answers count_only with a total and no rows, and caps rows at MaxRows', async () => {
    const fake = db();
    const count = await view(fake).RunView({ EntityName: DISTRIBUTIONS, ExtraFilter: "Status='Active'", ResultType: 'count_only' });
    expect([count.Results.length, count.TotalRowCount]).toEqual([0, 2]);
    const capped = await view(fake).RunView({ EntityName: DISTRIBUTIONS, ResultType: 'simple', MaxRows: 1 });
    expect([capped.Results.length, capped.TotalRowCount]).toEqual([1, 3]);
  });

  it('hands back entity_object rows that write through to the table', async () => {
    const fake = db();
    const read = await view(fake).RunView<Row>({ EntityName: DISTRIBUTIONS, ExtraFilter: "ID='d3'", ResultType: 'entity_object' });
    read.Results[0].Status = 'Closed';
    expect(await read.Results[0].Save()).toBe(true);
    expect(fake.tables[DISTRIBUTIONS][2].Status).toBe('Closed');
    expect(fake.saved).toEqual([{ entityName: DISTRIBUTIONS, values: { ID: 'd3', FormID: 'form-2', Status: 'Closed' } }]);
  });
});

describe('fix round 1 additions', () => {
  it('throws when two units of work settle their scopes out of order on one provider', async () => {
    const fake = db();
    const outer = await fake.provider.BeginEntityTransaction();
    await fake.provider.BeginEntityTransaction(); // inner, never settled
    await expect(outer.Commit()).rejects.toThrow(/settled out of order/);
  });

  it('wrapEntity decides what RunView and GetEntityObject hand back for a table entity', async () => {
    const fake = makeFakeProvider({
      tables: { [DISTRIBUTIONS]: [{ ID: 'd1', FormID: 'form-1', Status: 'Active' }] },
      wrapEntity: (entityName, record) => ({ wrapped: entityName, id: record.ID }),
    });
    const read = await new RunView(fake.provider as unknown as IRunViewProvider).RunView({
      EntityName: DISTRIBUTIONS,
      ResultType: 'entity_object',
    });
    expect(read.Results).toEqual([{ wrapped: DISTRIBUTIONS, id: 'd1' }]);
    expect(await fake.provider.GetEntityObject(DISTRIBUTIONS)).toEqual({ wrapped: DISTRIBUTIONS, id: undefined });
  });

  it('a scripted answer can be a function of the statement', async () => {
    const fake = makeFakeProvider({ sql: [{ match: 'FROM t', rows: (sql) => [{ echoed: sql }] }] });
    expect(await fake.provider.ExecuteSQL('SELECT 1 FROM t')).toEqual([{ echoed: 'SELECT 1 FROM t' }]);
  });
});
