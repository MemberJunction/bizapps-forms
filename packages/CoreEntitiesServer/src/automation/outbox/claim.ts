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
 * ON SQL SERVER EACH WRITE IS A PROCEDURE (#338, migration V202610222300): spFormAutomationEventClaim,
 * spFormAutomationEventSettle, spFormAutomationEventRenewLease and spFormAutomationEventReplay. MJ
 * grants its runtime roles EXECUTE on procedures and no rights on base tables, so the raw statements
 * were refused for a roles-only MJAPI login. The statements' shapes now live in that migration, and
 * `shared/__tests__/guarded-write-sprocs.migration.spec.ts` pins them; the fenced procedures return
 * `AffectedRows` themselves, so only the PostgreSQL UPDATEs are wrapped to count their rows.
 *
 * The PostgreSQL branches keep their raw statements, and have not been run against a database:
 * `migrations-pg/` stops at v0.8.x, so no PostgreSQL host has this table yet.
 *
 * Every write uses the database's clock, never the process's: leases compare times written by
 * different API instances, and only the database has one clock for all of them.
 *
 * Raw SQL and the procedures bypass BaseEntity, so no entity event fires for these writes; every RunView that reads
 * `FormAutomationEvent` passes `BypassCache: true` for that reason.
 */
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { quoteSqlString } from '@mj-biz-apps/forms-entities';
import { FORMS_ENTITY } from '../../shared/entity-names.js';
import { AFFECTED_ROWS_ALIAS, affectedRows } from '../../shared/affected-rows.js';
import { formsProcedureCall } from '../../shared/forms-procedure.js';
import { isGuid } from '../../shared/guid.js';
import type { ResponseSubmittedTrigger } from './response-submitted-event.js';

/** How many events one claim takes. The drain runs a batch concurrently, so this bounds the load. */
export const DRAIN_BATCH_SIZE = 5;

/** How long a claim holds an event before another drain may reclaim it. */
export const LEASE_SECONDS = 120;

/** A lease's new expiry, from the database's clock (PostgreSQL; the SQL Server procedures take {@link LEASE_SECONDS}). */
const POSTGRES_LEASE_EXPIRY = `now() + interval '${LEASE_SECONDS} seconds'`;

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
  const claim = isPostgres(provider)
    ? postgresClaimStatement(provider, workerId, responseId)
    : formsProcedureCall(provider, FORMS_ENTITY.FormAutomationEvent, 'spFormAutomationEventClaim', {
        WorkerID: workerId,
        FormResponseID: responseId ?? null,
        BatchSize: DRAIN_BATCH_SIZE,
        LeaseSeconds: LEASE_SECONDS,
      });
  const rows = await provider.ExecuteSQL<Record<string, unknown>>(claim, undefined, undefined, contextUser);
  return (rows ?? []).map(readClaimed);
}

/** The claim on PostgreSQL: one UPDATE over a `FOR UPDATE SKIP LOCKED` subquery, RETURNING the rows. */
function postgresClaimStatement(provider: DatabaseProviderBase, workerId: string, responseId: string | undefined): string {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const table = eventTable(provider);
  const due =
    `((e.${q('Status')} = 'Pending' AND (e.${q('AttemptCount')} = 0 OR e.${q('NextAttemptAt')} <= now())) OR (e.${q('Status')} = 'Running' AND e.${q('LockedUntil')} < now()))` +
    (responseId ? ` AND e.${q('FormResponseID')} = ${quoteSqlString(responseId)}` : '') +
    ` AND NOT EXISTS (SELECT 1 FROM ${table} o WHERE o.${q('FormResponseID')} = e.${q('FormResponseID')}` +
    ` AND o.${q('Status')} IN ('Pending', 'Running')` +
    ` AND (o.${q('__mj_CreatedAt')} < e.${q('__mj_CreatedAt')} OR (o.${q('__mj_CreatedAt')} = e.${q('__mj_CreatedAt')} AND o.${q('ID')} < e.${q('ID')})))`;
  const set =
    `${q('Status')} = 'Running', ${q('LockedBy')} = ${quoteSqlString(workerId)}, ${q('LockedUntil')} = ${POSTGRES_LEASE_EXPIRY}, ` +
    `${q('AttemptCount')} = ${q('AttemptCount')} + 1, ${q('__mj_UpdatedAt')} = now()`;
  const columns = ['ID', 'FormResponseID', 'Trigger', 'PartialSaveKey', 'AttemptCount', 'IsReplay'];
  return (
    `UPDATE ${table} SET ${set} WHERE ${q('ID')} IN (SELECT e.${q('ID')} FROM ${table} e WHERE ${due} ` +
    `ORDER BY e.${q('__mj_CreatedAt')}, e.${q('ID')} LIMIT ${DRAIN_BATCH_SIZE} FOR UPDATE SKIP LOCKED) RETURNING ${columns.map(q).join(', ')}`
  );
}

async function settleEvent(
  provider: DatabaseProviderBase,
  eventId: string,
  workerId: string,
  settlement: EventSettlement,
  contextUser: UserInfo,
): Promise<boolean> {
  const what = `Settling automation event ${eventId} as ${settlement.status}`;
  if (!isPostgres(provider)) {
    const settle = formsProcedureCall(provider, FORMS_ENTITY.FormAutomationEvent, 'spFormAutomationEventSettle', {
      ID: eventId,
      WorkerID: workerId,
      Status: settlement.status,
      LastError: settlement.lastError,
      RetryAfterSeconds: settlement.status === 'Pending' ? settlement.retryAfterSeconds : null,
    });
    return (await affectedOne(provider, settle, contextUser, what)) === 1;
  }
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const next = settlement.status === 'Pending' ? `, ${q('NextAttemptAt')} = now() + interval '${settlement.retryAfterSeconds} seconds'` : '';
  const update =
    `UPDATE ${eventTable(provider)} SET ${q('Status')} = ${quoteSqlString(settlement.status)}${next}, ` +
    `${q('LastError')} = ${settlement.lastError === null ? 'NULL' : quoteSqlString(settlement.lastError)}, ` +
    `${q('CompletedAt')} = ${settlement.status === 'Pending' ? 'NULL' : 'now()'}, ` +
    `${q('LockedBy')} = NULL, ${q('LockedUntil')} = NULL, ` +
    // A replay stays marked across a retry: if its first attempt retries before any step ran, the
    // next attempt must still reopen the steps the dead letter closed.
    (settlement.status === 'Pending' ? '' : `${q('IsReplay')} = false, `) +
    `${q('__mj_UpdatedAt')} = now() ` +
    `WHERE ${postgresLeaseHeldBy(provider, eventId, workerId)}`;
  return (await affectedOne(provider, counted(provider, update), contextUser, what)) === 1;
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
  const what = `Replaying automation event ${eventId}`;
  if (!isPostgres(provider)) {
    const replay = formsProcedureCall(provider, FORMS_ENTITY.FormAutomationEvent, 'spFormAutomationEventReplay', { ID: eventId });
    return (await affectedOne(provider, replay, contextUser, what)) === 1;
  }
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const update =
    `UPDATE ${eventTable(provider)} SET ${q('Status')} = 'Pending', ${q('AttemptCount')} = 0, ${q('IsReplay')} = true, ` +
    `${q('NextAttemptAt')} = now(), ${q('LastError')} = NULL, ${q('CompletedAt')} = NULL, ${q('__mj_UpdatedAt')} = now() ` +
    `WHERE ${q('ID')} = ${quoteSqlString(eventId)} AND ${q('Status')} = 'DeadLetter'`;
  return (await affectedOne(provider, counted(provider, update), contextUser, what)) === 1;
}

/** Push this worker's lease out by {@link LEASE_SECONDS} again; a run in flight calls it on a timer. */
async function renewLease(provider: DatabaseProviderBase, eventId: string, workerId: string, contextUser: UserInfo): Promise<boolean> {
  const what = `Renewing the lease on automation event ${eventId}`;
  if (!isPostgres(provider)) {
    const renew = formsProcedureCall(provider, FORMS_ENTITY.FormAutomationEvent, 'spFormAutomationEventRenewLease', {
      ID: eventId,
      WorkerID: workerId,
      LeaseSeconds: LEASE_SECONDS,
    });
    return (await affectedOne(provider, renew, contextUser, what)) === 1;
  }
  const q = (name: string): string => provider.QuoteIdentifier(name);
  const update = `UPDATE ${eventTable(provider)} SET ${q('LockedUntil')} = ${POSTGRES_LEASE_EXPIRY} WHERE ${postgresLeaseHeldBy(provider, eventId, workerId)}`;
  return (await affectedOne(provider, counted(provider, update), contextUser, what)) === 1;
}

function isPostgres(provider: DatabaseProviderBase): boolean {
  return provider.PlatformKey === 'postgresql';
}

/** The fence every PostgreSQL write after the claim carries: the event is still Running, under THIS worker. */
function postgresLeaseHeldBy(provider: DatabaseProviderBase, eventId: string, workerId: string): string {
  const q = (name: string): string => provider.QuoteIdentifier(name);
  return `${q('ID')} = ${quoteSqlString(eventId)} AND ${q('Status')} = 'Running' AND ${q('LockedBy')} = ${quoteSqlString(workerId)}`;
}

/** A raw PostgreSQL UPDATE that also reports its affected-row count. The SQL Server procedures report their own. */
function counted(provider: DatabaseProviderBase, update: string): string {
  return provider.Dialect.AffectedRowCountSQL(update, AFFECTED_ROWS_ALIAS);
}

/** Run a fenced write that reports `AffectedRows`, and read the count; an unreadable count is a fault, named by `what`. */
async function affectedOne(provider: DatabaseProviderBase, statement: string, contextUser: UserInfo, what: string): Promise<number> {
  const rows = await provider.ExecuteSQL<Record<string, unknown>>(statement, undefined, undefined, contextUser);
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
