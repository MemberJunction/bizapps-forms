/**
 * The outbox store's statements (#303). A fake provider cannot run SQL, so these assert what each
 * write sends. On SQL Server that is an EXEC of the write's procedure (#338, V202610222300), whose
 * body — the atomic, ordered, leased claim, the fenced settle and renew, the `DeadLetter`-fenced
 * replay — is pinned by `shared/__tests__/guarded-write-sprocs.migration.spec.ts`. On PostgreSQL it
 * is still the raw statement, so the SHAPE assertions here carry each rule for that dialect. The
 * opt-in DB suite in `engines/__tests__/FormSubmissionEngine.integration.spec.ts` proves the
 * behaviour on a real SQL Server.
 */
import { describe, expect, it } from 'vitest';
import { makeContextUser, makeFakeProvider } from '../../../testing/index.js';
import { DRAIN_BATCH_SIZE, LEASE_SECONDS, replayDeadLetteredEvent, sqlOutboxStore } from '../claim.js';

const RESPONSE = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';

function world(platform: 'sqlserver' | 'postgresql' = 'sqlserver', rows: Record<string, unknown>[] = []) {
  const db = makeFakeProvider({ platform, sql: [{ match: /UPDATE|EXEC/, rows }] });
  return { db, outbox: sqlOutboxStore(db.provider, makeContextUser()) };
}

describe('the claim', () => {
  it('is ONE call of the claim procedure, with the batch and the lease (SQL Server)', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1');

    expect(db.statements.map((s) => s.sql)).toEqual([
      `EXEC [__mj_BizAppsForms].[spFormAutomationEventClaim] @WorkerID = 'worker-1', @FormResponseID = NULL, @BatchSize = ${DRAIN_BATCH_SIZE}, @LeaseSeconds = ${LEASE_SECONDS}`,
    ]);
  });

  it('narrows to one response when asked (SQL Server)', async () => {
    const { db, outbox } = world();

    await outbox.Claim('worker-1', RESPONSE);

    expect(db.statements[0].sql).toBe(
      `EXEC [__mj_BizAppsForms].[spFormAutomationEventClaim] @WorkerID = 'worker-1', @FormResponseID = '${RESPONSE}', @BatchSize = 5, @LeaseSeconds = 120`,
    );
  });

  it('is ONE statement that skips rows another drain holds and leases what it takes (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql');

    await outbox.Claim('worker-1');

    expect(db.statements).toHaveLength(1);
    const sql = db.statements[0].sql;
    expect(sql).toMatch(new RegExp(`LIMIT ${DRAIN_BATCH_SIZE} FOR UPDATE SKIP LOCKED`));
    expect(sql).toMatch(/"Status" = 'Running', "LockedBy" = 'worker-1'/);
    expect(sql).toContain(`"LockedUntil" = now() + interval '${LEASE_SECONDS} seconds'`);
    expect(sql).toMatch(/"AttemptCount" = "AttemptCount" \+ 1/);
    expect(sql).toMatch(/RETURNING "ID", "FormResponseID", "Trigger", "PartialSaveKey", "AttemptCount", "IsReplay"$/);
  });

  it('takes a Pending event never attempted or whose retry is due, and a Running one whose lease expired (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql');

    await outbox.Claim('worker-1');

    const sql = db.statements[0].sql;
    // A first attempt ignores NextAttemptAt: on insert it holds the API host's clock, not the database's.
    expect(sql).toContain(`e."Status" = 'Pending' AND (e."AttemptCount" = 0 OR e."NextAttemptAt" <= now())`);
    expect(sql).toContain(`e."Status" = 'Running' AND e."LockedUntil" < now()`);
  });

  it('never takes an event while an older one of the same response is still Pending or Running (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql');

    await outbox.Claim('worker-1');

    expect(db.statements[0].sql).toMatch(
      /NOT EXISTS \(SELECT 1 FROM .* o WHERE o\."FormResponseID" = e\."FormResponseID" AND o\."Status" IN \('Pending', 'Running'\) AND \(o\."__mj_CreatedAt" < e\."__mj_CreatedAt" OR \(o\."__mj_CreatedAt" = e\."__mj_CreatedAt" AND o\."ID" < e\."ID"\)\)\)/,
    );
    expect(db.statements[0].sql).toContain('ORDER BY e."__mj_CreatedAt", e."ID"');
  });

  it('narrows to one response when asked (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql');

    await outbox.Claim('worker-1', RESPONSE);

    expect(db.statements[0].sql).toContain(`e."FormResponseID" = '${RESPONSE}'`);
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
  it('calls the settle procedure, fenced on this worker, reading the count it returns (SQL Server)', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    expect(await outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).toBe(true);

    // No AffectedRowCountSQL wrap: the procedure SELECTs @@ROWCOUNT AS [AffectedRows] itself.
    expect(db.statements.map((s) => s.sql)).toEqual([
      "EXEC [__mj_BizAppsForms].[spFormAutomationEventSettle] @ID = 'E1', @WorkerID = 'worker-1', @Status = 'Complete', @LastError = NULL, @RetryAfterSeconds = NULL",
    ]);
  });

  it('passes a retry its backoff and its error, quoted (SQL Server)', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'Pending', retryAfterSeconds: 8, lastError: "Step(s) \"x\" failed; it's retryable" });

    expect(db.statements[0].sql).toBe(
      "EXEC [__mj_BizAppsForms].[spFormAutomationEventSettle] @ID = 'E1', @WorkerID = 'worker-1', @Status = 'Pending', " +
        "@LastError = 'Step(s) \"x\" failed; it''s retryable', @RetryAfterSeconds = 8",
    );
  });

  it('gives a final settle no retry delay, whatever the settlement (SQL Server)', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'DeadLetter', lastError: 'gave up' });

    expect(db.statements[0].sql).toBe(
      "EXEC [__mj_BizAppsForms].[spFormAutomationEventSettle] @ID = 'E1', @WorkerID = 'worker-1', @Status = 'DeadLetter', @LastError = 'gave up', @RetryAfterSeconds = NULL",
    );
  });

  it('is fenced on the lease: only the drain that holds a Running event may settle it (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql', [{ AffectedRows: 1 }]);

    expect(await outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).toBe(true);

    const sql = db.statements[0].sql;
    expect(sql).toContain(`WHERE "ID" = 'E1' AND "Status" = 'Running' AND "LockedBy" = 'worker-1'`);
    expect(sql).toContain('"CompletedAt" = now()');
    expect(sql).toContain('"LockedBy" = NULL, "LockedUntil" = NULL');
    expect(sql).toContain('"IsReplay" = false');
    expect(sql).toContain('@@ROWCOUNT'); // the fake's Dialect.AffectedRowCountSQL wrap
  });

  it('keeps a replay marked across a retry, and clears it only when the event settles for good (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'Pending', retryAfterSeconds: 2, lastError: 'later' });
    await outbox.Settle('E1', 'worker-1', { status: 'DeadLetter', lastError: 'gave up' });

    expect(db.statements[0].sql).not.toMatch(/"IsReplay"/);
    expect(db.statements[1].sql).toContain('"IsReplay" = false');
  });

  it('schedules a retry after its backoff and keeps the event open (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql', [{ AffectedRows: 1 }]);

    await outbox.Settle('E1', 'worker-1', { status: 'Pending', retryAfterSeconds: 8, lastError: "Step(s) \"x\" failed; it's retryable" });

    const sql = db.statements[0].sql;
    expect(sql).toContain(`"NextAttemptAt" = now() + interval '8 seconds'`);
    expect(sql).toContain('"CompletedAt" = NULL');
    expect(sql).toContain("it''s retryable");
  });

  it('reports a lost lease as false', async () => {
    const { outbox } = world('sqlserver', [{ AffectedRows: 0 }]);

    expect(await outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).toBe(false);
  });

  it.each(['sqlserver', 'postgresql'] as const)('throws, naming the event, when the database reports no readable count (%s)', async (platform) => {
    const { outbox } = world(platform, []);

    await expect(outbox.Settle('E1', 'worker-1', { status: 'Complete', lastError: null })).rejects.toThrow(/E1/);
  });
});

describe('the replay', () => {
  const ctx = makeContextUser();

  it('calls the replay procedure with the event id (SQL Server)', async () => {
    const { db } = world('sqlserver', [{ AffectedRows: 1 }]);

    expect(await replayDeadLetteredEvent(db.provider, EVENT, ctx)).toBe(true);

    expect(db.statements.map((s) => s.sql)).toEqual([`EXEC [__mj_BizAppsForms].[spFormAutomationEventReplay] @ID = '${EVENT}'`]);
  });

  it('re-queues only a DeadLetter event, as a fresh replay due now (PostgreSQL)', async () => {
    const { db } = world('postgresql', [{ AffectedRows: 1 }]);

    expect(await replayDeadLetteredEvent(db.provider, EVENT, ctx)).toBe(true);

    const sql = db.statements[0].sql;
    expect(sql).toContain(`"Status" = 'Pending'`);
    expect(sql).toContain('"AttemptCount" = 0');
    expect(sql).toContain('"IsReplay" = true');
    expect(sql).toContain('"NextAttemptAt" = now()');
    expect(sql).toContain('"LastError" = NULL');
    expect(sql).toContain('"CompletedAt" = NULL');
    expect(sql).toContain('"__mj_UpdatedAt" = now()');
    expect(sql).toContain(`WHERE "ID" = '${EVENT}' AND "Status" = 'DeadLetter'`);
  });

  it('reports an event that is not dead-lettered as false', async () => {
    const { db } = world('sqlserver', [{ AffectedRows: 0 }]);

    expect(await replayDeadLetteredEvent(db.provider, EVENT, ctx)).toBe(false);
  });

  it('throws, naming the event, when the database reports no readable count', async () => {
    const { db } = world('sqlserver', []);

    await expect(replayDeadLetteredEvent(db.provider, EVENT, ctx)).rejects.toThrow(EVENT);
  });

  it('refuses an empty event id, before any SQL', async () => {
    const { db } = world();

    await expect(replayDeadLetteredEvent(db.provider, '', ctx)).rejects.toThrow(/event id/);
    expect(db.statements).toHaveLength(0);
  });

  // SQL Server fails converting a non-GUID to uniqueidentifier, so the id is checked before it reaches SQL.
  it.each(['not-a-guid', ' '])('refuses the non-GUID event id %j, naming it, before any SQL', async (eventId) => {
    const { db } = world();

    await expect(replayDeadLetteredEvent(db.provider, eventId, ctx)).rejects.toThrow(`"${eventId}"`);
    expect(db.statements).toHaveLength(0);
  });
});

describe('the lease renewal', () => {
  it('calls the renew procedure, fenced on this worker (SQL Server)', async () => {
    const { db, outbox } = world('sqlserver', [{ AffectedRows: 1 }]);

    expect(await outbox.Renew('E1', 'worker-1')).toBe(true);

    expect(db.statements.map((s) => s.sql)).toEqual([
      `EXEC [__mj_BizAppsForms].[spFormAutomationEventRenewLease] @ID = 'E1', @WorkerID = 'worker-1', @LeaseSeconds = ${LEASE_SECONDS}`,
    ]);
  });

  it('extends the lease only while this drain still holds the event (PostgreSQL)', async () => {
    const { db, outbox } = world('postgresql', [{ AffectedRows: 1 }]);

    expect(await outbox.Renew('E1', 'worker-1')).toBe(true);

    const sql = db.statements[0].sql;
    expect(sql).toContain(`"LockedUntil" = now() + interval '${LEASE_SECONDS} seconds'`);
    expect(sql).toContain(`WHERE "ID" = 'E1' AND "Status" = 'Running' AND "LockedBy" = 'worker-1'`);
  });

  it('reports a lease another drain took as false', async () => {
    const { outbox } = world('sqlserver', [{ AffectedRows: 0 }]);

    expect(await outbox.Renew('E1', 'worker-1')).toBe(false);
  });
});
