/**
 * The outbox store's statements (#303). A fake provider cannot run SQL, so these assert the SHAPE
 * each statement must keep — the parts that make a claim atomic, ordered and leased, and a settle
 * fenced — and the DB spec (`claim.db.spec.ts`) proves the behaviour on a real SQL Server.
 */
import { describe, expect, it } from 'vitest';
import { makeContextUser, makeFakeProvider } from '../../../testing/index.js';
import { LEASE_SECONDS, sqlOutboxStore } from '../claim.js';

const RESPONSE = '11111111-1111-4111-8111-111111111111';

function world(platform: 'sqlserver' | 'postgresql' = 'sqlserver', rows: Record<string, unknown>[] = []) {
  const db = makeFakeProvider({ platform, sql: [{ match: /UPDATE/, rows }] });
  return { db, outbox: sqlOutboxStore(db.provider, makeContextUser()) };
}

describe('the claim', () => {
  it('is ONE statement that skips rows another drain holds and leases what it takes (SQL Server)', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1');

    expect(db.statements).toHaveLength(1);
    const sql = db.statements[0].sql;
    expect(sql).toMatch(/WITH \(UPDLOCK, READPAST, ROWLOCK\)/);
    expect(sql).toMatch(/\[Status\] = 'Running'/);
    expect(sql).toMatch(new RegExp(`DATEADD\\(SECOND, ${LEASE_SECONDS}, SYSDATETIMEOFFSET\\(\\)\\)`));
    expect(sql).toMatch(/\[AttemptCount\] = \[AttemptCount\] \+ 1/);
    // INTO a table variable: CodeGen gives the table an __mj_UpdatedAt trigger, and SQL Server refuses a
    // bare OUTPUT on a table with an enabled trigger.
    expect(sql).toMatch(/OUTPUT inserted\..* INTO @claimed;/);
    expect(sql).toMatch(/SELECT .* FROM @claimed/);
  });

  it('takes a Pending event once it is due, and a Running one whose lease expired', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1');

    const sql = db.statements[0].sql;
    expect(sql).toMatch(/\[Status\] = 'Pending' AND e\.\[NextAttemptAt\] <= SYSDATETIMEOFFSET\(\)/);
    expect(sql).toMatch(/\[Status\] = 'Running' AND e\.\[LockedUntil\] < SYSDATETIMEOFFSET\(\)/);
  });

  it('never takes an event while an older one of the same response is still Pending or Running', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1');

    expect(db.statements[0].sql).toMatch(
      /NOT EXISTS \(SELECT 1 FROM .* o WHERE o\.\[FormResponseID\] = e\.\[FormResponseID\] AND o\.\[Status\] IN \('Pending', 'Running'\) AND \(o\.\[__mj_CreatedAt\] < e\.\[__mj_CreatedAt\] OR \(o\.\[__mj_CreatedAt\] = e\.\[__mj_CreatedAt\] AND o\.\[ID\] < e\.\[ID\]\)\)\)/,
    );
  });

  it('narrows to one response when asked', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1', RESPONSE);

    expect(db.statements[0].sql).toContain(`e.[FormResponseID] = '${RESPONSE}'`);
  });

  it('uses FOR UPDATE SKIP LOCKED on PostgreSQL', async () => {
    const { db, outbox } = world('postgresql');

    await outbox.Claim('worker-1');

    expect(db.statements[0].sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(db.statements[0].sql).toMatch(/RETURNING/);
  });

  it('reads back what it claimed, booleans and counts included', async () => {
    const { outbox } = world('sqlserver', [
      { ID: 'E1', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'k', AttemptCount: 3, IsReplay: true },
    ]);

    expect(await outbox.Claim('worker-1')).toEqual([
      { ID: 'E1', FormResponseID: RESPONSE, Trigger: 'OnPartial', PartialSaveKey: 'k', AttemptCount: 3, IsReplay: true },
    ]);
  });

  it('refuses a worker id longer than LockedBy holds, before any SQL', async () => {
    const { db, outbox } = world();

    await expect(outbox.Claim('w'.repeat(101))).rejects.toThrow(/LockedBy/);
    expect(db.statements).toHaveLength(0);
  });
});

describe('the settle', () => {
  it('is fenced on the lease: only the drain that holds a Running event may settle it', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    expect(await outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).toBe(true);

    const sql = db.statements[0].sql;
    expect(sql).toMatch(/WHERE \[ID\] = 'E1' AND \[Status\] = 'Running' AND \[LockedBy\] = 'worker-1'/);
    expect(sql).toMatch(/\[CompletedAt\] = SYSDATETIMEOFFSET\(\)/);
    expect(sql).toMatch(/\[LockedBy\] = NULL, \[LockedUntil\] = NULL/);
    expect(sql).toMatch(/\[IsReplay\] = 0/);
  });

  it('keeps a replay marked across a retry, and clears it only when the event settles for good', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'Pending', retryAfterSeconds: 2, lastError: 'later' });
    await outbox.Settle('E1', 'worker-1', { status: 'DeadLetter', lastError: 'gave up' });

    expect(db.statements[0].sql).not.toMatch(/\[IsReplay\]/);
    expect(db.statements[1].sql).toMatch(/\[IsReplay\] = 0/);
  });

  it('reports a lost lease as false', async () => {
    const { outbox } = world('sqlserver', [{ AffectedRows: 0 }]);

    expect(await outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).toBe(false);
  });

  it('schedules a retry after its backoff and keeps the event open', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'Pending', retryAfterSeconds: 8, lastError: "Step(s) \"x\" failed; it's retryable" });

    const sql = db.statements[0].sql;
    expect(sql).toMatch(/\[NextAttemptAt\] = DATEADD\(SECOND, 8, SYSDATETIMEOFFSET\(\)\)/);
    expect(sql).toMatch(/\[CompletedAt\] = NULL/);
    expect(sql).toContain("it''s retryable");
  });

  it('throws, naming the event, when the database reports no readable count', async () => {
    const { outbox } = world('sqlserver', []);

    await expect(outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).rejects.toThrow(/E1/);
  });
});

describe('the lease renewal', () => {
  it('extends the lease only while this drain still holds the event', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    expect(await outbox.Renew('E1', 'worker-1')).toBe(true);

    const sql = db.statements[0].sql;
    expect(sql).toMatch(new RegExp(`\\[LockedUntil\\] = DATEADD\\(SECOND, ${LEASE_SECONDS}, SYSDATETIMEOFFSET\\(\\)\\)`));
    expect(sql).toMatch(/WHERE \[ID\] = 'E1' AND \[Status\] = 'Running' AND \[LockedBy\] = 'worker-1'/);
  });

  it('reports a lease another drain took as false', async () => {
    const { outbox } = world('sqlserver', [{ AffectedRows: 0 }]);

    expect(await outbox.Renew('E1', 'worker-1')).toBe(false);
  });
});
