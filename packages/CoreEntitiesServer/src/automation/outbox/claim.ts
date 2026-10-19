/**
 * The automation outbox's claim and settle statements (#303) — the two writes that make the drain
 * safe to run in several processes at once.
 *
 * CLAIM is one statement: it picks due events under `UPDLOCK, READPAST` (SQL Server) or `FOR UPDATE
 * SKIP LOCKED` (PostgreSQL), so two drains never take the same row and neither waits on the other,
 * and in the same statement marks them `Running` under a lease. "Due" is a Pending event never yet
 * attempted, or one whose retry `NextAttemptAt` has passed, or a Running one whose lease expired (its
 * drain died). A first attempt does not wait on `NextAttemptAt`, because on insert that column holds
 * the API host's clock, not the database's: `BaseEntity.NewRecord()` turns the column's
 * `SYSDATETIMEOFFSET()` default into the process's `Date`, so a host clock running ahead would hide a
 * fresh event from the post-commit drain — for good when the scheduler is off. Only the settle writes
 * a `NextAttemptAt` the claim compares, and it writes it from the database's clock. An event is not
 * due while an OLDER event of the same response is still Pending or Running: one response's events
 * run in the order they were queued, so a partial save's run never overtakes the final submit's.
 *
 * SETTLE and RENEW are fenced on the lease: they update the event only while it is still `Running`
 * under THIS drain's `LockedBy`. Zero rows means the lease expired and another drain owns the event
 * now; the caller writes nothing further. A run in flight renews its lease on a timer, so a step that
 * takes longer than the lease is not dispatched a second time by a reclaiming drain.
 *
 * REPLAY is the third write, and the only one with no lease: it re-queues a `DeadLetter` event, fenced
 * on that status, so an event that is not dead-lettered is left untouched.
 *
 * The PostgreSQL branches have not been run against a database: `migrations-pg/` stops at v0.8.x, so
 * no PostgreSQL host has this table yet.
 *
 * Both go through `ExecuteSQL` with the database's clock, never the process's: leases compare times
 * written by different API instances, and only the database has one clock for all of them.
 *
 * Raw SQL bypasses BaseEntity, so no entity event fires for these writes; every RunView that reads
 * `FormAutomationEvent` passes `BypassCache: true` for that reason.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import { AFFECTED_ROWS_ALIAS, affectedRows } from '../../shared/affected-rows.js';
import { isGuid } from '../../shared/guid.js';
import type { ResponseSubmittedTrigger } from './response-submitted-event.js';

/** How many events one claim takes. The drain runs a batch concurrently, so this bounds the load. */
export const DRAIN_BATCH_SIZE = 5;

/** How long a claim holds an event before another drain may reclaim it. */
export const LEASE_SECONDS = 120;

/** `FormAutomationEvent.LockedBy` is NVARCHAR(100). */
const MAX_WORKER_ID_LENGTH = 100;

/** One event a drain now holds. */
export interface ClaimedEvent {
  ID: string;
  FormResponseID: string;
  Trigger: ResponseSubmittedTrigger;
  PartialSaveKey: string | null;
  /** Including this claim: 1 on the first attempt. */
  AttemptCount: number;
  IsReplay: boolean;
}

/** How a drain leaves an event it held. */
export type EventSettlement =
  | { status: 'Complete'; lastError: null }
  | { status: 'Pending'; retryAfterSeconds: number; lastError: string }
  | { status: 'DeadLetter' | 'Abandoned'; lastError: string };

/** The two writes the drain makes on the outbox — a seam, so the drain's specs need no database. */
export interface OutboxStore {
  /** Claim up to {@link DRAIN_BATCH_SIZE} due events (only `responseId`'s, when given). */
  Claim(workerId: string, responseId?: string): Promise<ClaimedEvent[]>;
  /** Settle an event this worker holds; `false` when its lease was lost and nothing was written. */
  Settle(eventId: string, workerId: string, settlement: EventSettlement): Promise<boolean>;
  /** Extend this worker's lease on a Running event; `false` when another drain holds it now. */
  Renew(eventId: string, workerId: string): Promise<boolean>;
}

/** The outbox store over `provider`'s `FormAutomationEvent` table. */
export function sqlOutboxStore(provider: DatabaseProviderBase, contextUser: UserInfo): OutboxStore {
  return {
    Claim: (workerId, responseId) => claimDueEvents(provider, workerId, responseId, contextUser),
    Settle: (eventId, workerId, settlement) => settleEvent(provider, eventId, workerId, settlement, contextUser),
    Renew: (eventId, workerId) => renewLease(provider, eventId, workerId, contextUser),
  };
}

async function claimDueEvents(provider: DatabaseProviderBase, workerId: string, responseId: string | undefined, contextUser: UserInfo): Promise<ClaimedEvent[]> {
  if (workerId.length === 0 || workerId.length > MAX_WORKER_ID_LENGTH) {
    throw new Error(`A drain's worker id must be 1-${MAX_WORKER_ID_LENGTH} characters to fit FormAutomationEvent.LockedBy; got ${workerId.length}.`);
  }
  const rows = await provider.ExecuteSQL<Record<string, unknown>>(claimStatement(provider, workerId, responseId), undefined, undefined, contextUser);
  return (rows ?? []).map(readClaimed);
}

/** The claim, in the provider's dialect. */
function claimStatement(provider: DatabaseProviderBase, workerId: string, responseId: string | undefined): string {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const table = eventTable(provider);
  const pg = provider.PlatformKey === 'postgresql';
  const now = pg ? 'now()' : 'SYSDATETIMEOFFSET()';
  const due =
    `((e.${q('Status')} = 'Pending' AND (e.${q('AttemptCount')} = 0 OR e.${q('NextAttemptAt')} <= ${now})) OR (e.${q('Status')} = 'Running' AND e.${q('LockedUntil')} < ${now}))` +
    (responseId ? ` AND e.${q('FormResponseID')} = ${quoteSqlString(responseId)}` : '') +
    ` AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.${q('FormResponseID')} = e.${q('FormResponseID')}` +
    ` AND o.${q('Status')} IN ('Pending', 'Running')` +
    ` AND (o.${q('__mj_CreatedAt')} < e.${q('__mj_CreatedAt')} OR (o.${q('__mj_CreatedAt')} = e.${q('__mj_CreatedAt')} AND o.${q('ID')} < e.${q('ID')})))`;
  const order = `e.${q('__mj_CreatedAt')}, e.${q('ID')}`;
  const lease = leaseExpiry(provider);
  const set =
    `${q('Status')} = 'Running', ${q('LockedBy')} = ${quoteSqlString(workerId)}, ${q('LockedUntil')} = ${lease}, ` +
    `${q('AttemptCount')} = ${q('AttemptCount')} + 1, ${q('__mj_UpdatedAt')} = ${now}`;
  const columns = ['ID', 'FormResponseID', 'Trigger', 'PartialSaveKey', 'AttemptCount', 'IsReplay'];
  if (pg) {
    return (
      `UPDATE ${table} SET ${set} WHERE ${q('ID')} IN (SELECT e.${q('ID')} FROM ${table} e WHERE ${due} ` +
      `ORDER BY ${order} LIMIT ${DRAIN_BATCH_SIZE} FOR UPDATE SKIP LOCKED) RETURNING ${columns.map(q).join(', ')}`
    );
  }
  // OUTPUT … INTO a table variable, then read it back: CodeGen gives the table an `__mj_UpdatedAt`
  // trigger, and SQL Server refuses a bare OUTPUT clause on a table with an enabled trigger.
  return (
    `DECLARE @claimed TABLE (${q('ID')} UNIQUEIDENTIFIER, ${q('FormResponseID')} UNIQUEIDENTIFIER, ${q('Trigger')} NVARCHAR(20), ` +
    `${q('PartialSaveKey')} NVARCHAR(64), ${q('AttemptCount')} INT, ${q('IsReplay')} BIT); ` +
    `WITH due AS (SELECT TOP (${DRAIN_BATCH_SIZE}) e.* FROM ${table} e WITH (UPDLOCK, READPAST, ROWLOCK) WHERE ${due} ORDER BY ${order}) ` +
    `UPDATE due SET ${set} OUTPUT ${columns.map((c) => `inserted.${q(c)}`).join(', ')} INTO @claimed; ` +
    `SELECT ${columns.map(q).join(', ')} FROM @claimed;`
  );
}

async function settleEvent(
  provider: DatabaseProviderBase,
  eventId: string,
  workerId: string,
  settlement: EventSettlement,
  contextUser: UserInfo,
): Promise<boolean> {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const pg = provider.PlatformKey === 'postgresql';
  const now = pg ? 'now()' : 'SYSDATETIMEOFFSET()';
  const next =
    settlement.status === 'Pending'
      ? `, ${q('NextAttemptAt')} = ${pg ? `now() + interval '${settlement.retryAfterSeconds} seconds'` : `DATEADD(SECOND, ${settlement.retryAfterSeconds}, SYSDATETIMEOFFSET())`}`
      : '';
  const update =
    `UPDATE ${eventTable(provider)} SET ${q('Status')} = ${quoteSqlString(settlement.status)}${next}, ` +
    `${q('LastError')} = ${settlement.lastError === null ? 'NULL' : quoteSqlString(settlement.lastError)}, ` +
    `${q('CompletedAt')} = ${settlement.status === 'Pending' ? 'NULL' : now}, ` +
    `${q('LockedBy')} = NULL, ${q('LockedUntil')} = NULL, ` +
    // A replay stays marked across a retry: if its first attempt retries before any step ran, the
    // next attempt must still reopen the steps the dead letter closed.
    (settlement.status === 'Pending' ? '' : `${q('IsReplay')} = ${pg ? 'false' : '0'}, `) +
    `${q('__mj_UpdatedAt')} = ${now} ` +
    `WHERE ${leaseHeldBy(provider, eventId, workerId)}`;
  return (await affectedOne(provider, update, contextUser, `Settling automation event ${eventId} as ${settlement.status}`)) === 1;
}

/**
 * Re-queue a dead-lettered event for one more run (the third write; no drain holds the event, so it
 * is fenced on `Status = 'DeadLetter'` rather than on a lease). Two callers racing to replay the same
 * event cannot both win: the loser finds it already Pending and writes nothing. `IsReplay` tells the
 * next run to reopen the dead letter's `Dead-lettered: ` step rows. `LockedBy`/`LockedUntil` are
 * already NULL on a settled event. `false` when the event is not dead-lettered.
 */
export async function replayDeadLetteredEvent(provider: DatabaseProviderBase, eventId: string, contextUser: UserInfo): Promise<boolean> {
  // The id goes into the WHERE: SQL Server fails converting a non-GUID to uniqueidentifier.
  if (!isGuid(eventId)) {
    throw new Error(`Replaying an automation event needs an event id; got ${JSON.stringify(eventId)}.`);
  }
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const pg = provider.PlatformKey === 'postgresql';
  const now = pg ? 'now()' : 'SYSDATETIMEOFFSET()';
  const update =
    `UPDATE ${eventTable(provider)} SET ${q('Status')} = 'Pending', ${q('AttemptCount')} = 0, ${q('IsReplay')} = ${pg ? 'true' : '1'}, ` +
    `${q('NextAttemptAt')} = ${now}, ${q('LastError')} = NULL, ${q('CompletedAt')} = NULL, ${q('__mj_UpdatedAt')} = ${now} ` +
    `WHERE ${q('ID')} = ${quoteSqlString(eventId)} AND ${q('Status')} = 'DeadLetter'`;
  return (await affectedOne(provider, update, contextUser, `Replaying automation event ${eventId}`)) === 1;
}

/** Push this worker's lease out by {@link LEASE_SECONDS} again; a run in flight calls it on a timer. */
async function renewLease(provider: DatabaseProviderBase, eventId: string, workerId: string, contextUser: UserInfo): Promise<boolean> {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const update =
    `UPDATE ${eventTable(provider)} SET ${q('LockedUntil')} = ${leaseExpiry(provider)} ` +
    `WHERE ${leaseHeldBy(provider, eventId, workerId)}`;
  return (await affectedOne(provider, update, contextUser, `Renewing the lease on automation event ${eventId}`)) === 1;
}

/** The fence every write after the claim carries: the event is still Running, under THIS worker. */
function leaseHeldBy(provider: DatabaseProviderBase, eventId: string, workerId: string): string {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  return `${q('ID')} = ${quoteSqlString(eventId)} AND ${q('Status')} = 'Running' AND ${q('LockedBy')} = ${quoteSqlString(workerId)}`;
}

function leaseExpiry(provider: DatabaseProviderBase): string {
  return provider.PlatformKey === 'postgresql' ? `now() + interval '${LEASE_SECONDS} seconds'` : `DATEADD(SECOND, ${LEASE_SECONDS}, SYSDATETIMEOFFSET())`;
}

/** Run a fenced UPDATE and read its affected-row count; an unreadable count is a fault, named by `what`. */
async function affectedOne(provider: DatabaseProviderBase, update: string, contextUser: UserInfo, what: string): Promise<number> {
  const rows = await provider.ExecuteSQL<Record<string, unknown>>(provider.Dialect.AffectedRowCountSQL(update, AFFECTED_ROWS_ALIAS), undefined, undefined, contextUser);
  const affected = affectedRows(rows);
  if (affected === undefined) {
    throw new Error(`${what} returned no readable affected-row count.`);
  }
  return affected;
}

function eventTable(provider: DatabaseProviderBase): string {
  const entity = provider.EntityByName(FORMS_ENTITY.FormAutomationEvent);
  if (!entity) {
    throw new Error(`"${FORMS_ENTITY.FormAutomationEvent}" is not in this host's metadata, so no automation can be drained.`);
  }
  return provider.QuoteSchemaAndView(entity.SchemaName, entity.BaseTable);
}

/** A claimed row as the driver returns it: booleans may arrive as 0/1, counts as strings. */
function readClaimed(row: Record<string, unknown>): ClaimedEvent {
  const trigger = String(row.Trigger);
  if (trigger !== 'OnComplete' && trigger !== 'OnPartial') {
    throw new Error(`Automation event ${String(row.ID)} has an unknown trigger "${trigger}".`);
  }
  return {
    ID: String(row.ID),
    FormResponseID: String(row.FormResponseID),
    Trigger: trigger,
    PartialSaveKey: row.PartialSaveKey === null || row.PartialSaveKey === undefined ? null : String(row.PartialSaveKey),
    AttemptCount: Number(row.AttemptCount),
    IsReplay: row.IsReplay === true || row.IsReplay === 1 || row.IsReplay === '1',
  };
}
