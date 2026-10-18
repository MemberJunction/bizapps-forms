/**
 * The automation drain (#303) — runs the on-submit automations queued in the `FormAutomationEvent`
 * outbox. It replaced the Work Queue handler of the 6.2 design; the decisions below are that
 * handler's, unchanged in meaning. Two callers: the submitting process, right after its commit
 * (narrowed to that response, so a first attempt does not wait for a schedule), and the
 * `FormsAutomationDrainDriver` scheduled job every 30 seconds (retries, and events a dead process
 * left behind).
 *
 * At least once: an event whose drain dies mid-run is reclaimed when its lease expires. Idempotency
 * is the run engine's, scoped to the event's id (`FormAutomationEngine.RunForResponse`).
 *
 * What it decides is each event's settlement:
 *  - `Complete` — the steps ran (each failure is on its own `FormAutomationRun` row), or a stale
 *    partial save found its response already Complete;
 *  - `Pending` again, after a backoff — a step failed transiently, the run was stopped before every
 *    step started, the automation principal is not provisioned yet, or something unexpected broke;
 *  - `DeadLetter` — FINAL submits only, when nothing will change (a response that does not exist, a
 *    snapshot that cannot be read), or the event's last attempt would retry. The event's open run
 *    rows are closed `Failed` first, with the `Dead-lettered: ` prefix that lets an operator's
 *    replay (`IsReplay`) reopen exactly those rows;
 *  - `Abandoned` — where a final would dead-letter, a PARTIAL save instead closes its open rows as
 *    abandoned, logs one error line naming the response and the steps, and settles; it must never
 *    hold the response's final behind it (the claim runs one response's events in order).
 *
 * Every reason is a fixed sentence; provider and database text goes to the log only.
 *
 * Runs as two users on purpose: `contextUser` (the host's system user) reads what plans the run —
 * the automation principal holds no grant on Form Versions — and the steps run as the automation
 * principal, whose grants are the ceiling on what a form's steps may do.
 */
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { LogError, LogStatus, Metadata, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { resolveAutomationPrincipal } from '../service-principal.js';
import { FormAutomationError } from '../../engines/automation-errors.js';
import { FormAutomationEngine, type ResponseAutomationReport } from '../../engines/FormAutomationEngine.js';
import { withIsolatedProvider } from '../../shared/isolated-provider.js';
import { LEASE_SECONDS, sqlOutboxStore, type ClaimedEvent, type EventSettlement, type OutboxStore } from './claim.js';

/** Attempts per event, the first included; the last one that would retry gives up instead. */
export const MAX_ATTEMPTS = 5;
/** The first retry's delay; each later one doubles. */
export const BACKOFF_BASE_SECONDS = 2;
/** No retry waits longer than this. */
export const BACKOFF_MAX_SECONDS = 300;
/** Claims per drain call; a backlog beyond it is left for the next sweep, and logged. */
export const MAX_CLAIM_ROUNDS = 20;
/**
 * How often a run in flight renews its event's lease — a third of the lease, so two renewals can
 * fail transiently before another drain may reclaim the event and dispatch a running step again.
 */
export const LEASE_RENEW_SECONDS = Math.floor(LEASE_SECONDS / 3);

/** What one drain call did. */
export interface DrainReport {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  abandoned: number;
  /** Stopped at {@link MAX_CLAIM_ROUNDS} with events possibly still due. */
  roundsCapped: boolean;
}

/** Test seams. Production passes none of them. */
export interface DrainSeams {
  /** The outbox; defaults to the SQL store on an isolated instance of `source`. */
  readonly store?: OutboxStore;
  /** The provider isolated instances are made from; defaults to the process provider. */
  readonly source?: IMetadataProvider | null;
}

/** What the drain should do; `responseId` narrows it to one response (the post-commit drain). */
export interface DrainRequest {
  reason: string;
  responseId?: string;
  /** Called between claim rounds — the scheduled job's lease heartbeat. */
  heartbeat?: () => Promise<void>;
}

/** Run every due event, at most {@link MAX_CLAIM_ROUNDS} claims. Throws only when the outbox itself cannot be read or written. */
export async function drainAutomationOutbox(request: DrainRequest, contextUser: UserInfo, seams: DrainSeams = {}): Promise<DrainReport> {
  const source = seams.source === undefined ? Metadata.Provider : seams.source;
  const workerId = `${hostname().slice(0, 40)}:${process.pid}:${randomUUID().slice(0, 8)}`;
  if (seams.store) {
    return drainRounds(request, seams.store, workerId, contextUser, source);
  }
  return withIsolatedProvider(
    `Forms automation drain (${request.reason})`,
    (provider) => drainRounds(request, sqlOutboxStore(provider, contextUser), workerId, contextUser, source),
    source,
  );
}

/** The delay before attempt `attempt + 1`, given that attempt `attempt` asked to retry. */
export function backoffSeconds(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  return Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** exponent);
}

async function drainRounds(
  request: DrainRequest,
  store: OutboxStore,
  workerId: string,
  contextUser: UserInfo,
  source: IMetadataProvider | null,
): Promise<DrainReport> {
  const report: DrainReport = { claimed: 0, completed: 0, retried: 0, deadLettered: 0, abandoned: 0, roundsCapped: false };
  for (let round = 1; round <= MAX_CLAIM_ROUNDS; round++) {
    const batch = await store.Claim(workerId, request.responseId);
    if (batch.length === 0) {
      return report;
    }
    report.claimed += batch.length;
    // One response appears at most once per claim (an older open event blocks a newer one), so the
    // batch runs concurrently without two of a response's events racing each other.
    const settled = await Promise.all(batch.map((event) => runAndSettle(event, store, workerId, contextUser, source)));
    for (const status of settled) {
      tally(report, status);
    }
    await request.heartbeat?.();
  }
  report.roundsCapped = true;
  LogStatus(`[Forms automation drain] stopped after ${MAX_CLAIM_ROUNDS} claims (${request.reason}); any events still due wait for the next sweep.`);
  return report;
}

function tally(report: DrainReport, status: EventSettlement['status'] | 'unsettled'): void {
  if (status === 'Complete') report.completed++;
  else if (status === 'Pending') report.retried++;
  else if (status === 'DeadLetter') report.deadLettered++;
  else if (status === 'Abandoned') report.abandoned++;
}

/** Run one event and settle it; returns how it was settled, or `unsettled` (lease lost, or the settle failed). Never throws. */
async function runAndSettle(
  event: ClaimedEvent,
  store: OutboxStore,
  workerId: string,
  contextUser: UserInfo,
  source: IMetadataProvider | null,
): Promise<EventSettlement['status'] | 'unsettled'> {
  try {
    const ran = event.AttemptCount > MAX_ATTEMPTS ? neverSettled(event) : await runEvent(event, store, workerId, contextUser, source);
    if (ran.kind === 'lease-taken') {
      // Already logged by the renewal. Closing the event's rows or settling it is the new holder's
      // job: a dead letter written here would close rows that drain is about to run.
      return 'unsettled';
    }
    const outcome = lastAttemptGuard(ran, event);
    const settlement = await settlementFor(outcome, event, contextUser, source);
    if (!(await store.Settle(event.ID, workerId, settlement))) {
      LogError(
        `[Forms automation drain] the lease on event ${event.ID} (response ${event.FormResponseID}) was lost before it settled as ${settlement.status}; another drain owns it now.`,
      );
      return 'unsettled';
    }
    return settlement.status;
  } catch (err) {
    LogError(`[Forms automation drain] event ${event.ID} (response ${event.FormResponseID}) could not be settled: ${describe(err)}`);
    return 'unsettled';
  }
}

/**
 * An event reclaimed past the attempt cap: its earlier attempts never settled (the drain died, or
 * ran past its lease), so a run that kills its process cannot be reclaimed forever — nor hold the
 * response's later events behind it. Not run again; given up on like any other last attempt.
 */
function neverSettled(event: ClaimedEvent): RunOutcome {
  return {
    kind: 'dead-letter',
    reason: `Gave up after ${event.AttemptCount} attempts: the event's previous attempt never settled (its drain stopped, or ran past its lease).`,
  };
}

/** What a run asks for, before the last-attempt rule. */
type RunOutcome = { kind: 'complete' } | { kind: 'retry'; reason: string } | { kind: 'dead-letter'; reason: string };

/**
 * A run's view of its lease. `guard` stops new steps once the lease is in doubt; `taken` is set only
 * when a renewal found another drain holding the event, the one case where this drain must write
 * nothing more; `finished` is set when the run returns, so a renewal still in flight across the
 * settle does not report the settled event as taken.
 */
interface RunLease {
  guard: AbortController;
  taken: boolean;
  finished: boolean;
}

async function runEvent(
  event: ClaimedEvent,
  store: OutboxStore,
  workerId: string,
  contextUser: UserInfo,
  source: IMetadataProvider | null,
): Promise<RunOutcome | { kind: 'lease-taken' }> {
  const principal = resolveAutomationPrincipal();
  if (!principal) {
    return { kind: 'retry', reason: 'The Forms automation principal is not provisioned on this host, so no step may run yet.' };
  }
  const purpose = `Forms automation event ${event.ID} (response ${event.FormResponseID})`;
  const lease: RunLease = { guard: new AbortController(), taken: false, finished: false };
  const renewal = setInterval(() => void renewOrStop(event, store, workerId, lease), LEASE_RENEW_SECONDS * 1000);
  try {
    const report = await withIsolatedProvider(
      purpose,
      (provider: DatabaseProviderBase) =>
        FormAutomationEngine.Instance.RunForResponse(
          {
            responseId: event.FormResponseID,
            trigger: event.Trigger,
            principal,
            attempt: event.AttemptCount,
            eventId: event.ID,
            isReplay: event.IsReplay,
            signal: lease.guard.signal,
          },
          provider,
          contextUser,
        ),
      source,
    );
    return lease.taken ? { kind: 'lease-taken' } : outcomeOf(report);
  } catch (err) {
    if (err instanceof FormAutomationError) {
      return err.retryable ? { kind: 'retry', reason: err.message } : { kind: 'dead-letter', reason: err.message };
    }
    LogError(`[Forms automation drain] ${purpose} failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return { kind: 'retry', reason: 'The automations could not be run on this attempt; the server log has the detail.' };
  } finally {
    clearInterval(renewal);
    lease.finished = true;
  }
}

/**
 * Renew the event's lease while its run is in flight. If another drain holds it now — or the renewal
 * itself fails — stop STARTING steps: the run's remaining steps are the new holder's to run.
 */
async function renewOrStop(event: ClaimedEvent, store: OutboxStore, workerId: string, lease: RunLease): Promise<void> {
  if (lease.guard.signal.aborted || lease.finished) {
    return;
  }
  try {
    if ((await store.Renew(event.ID, workerId)) || lease.finished) {
      return;
    }
    lease.taken = true;
    LogError(`[Forms automation drain] the lease on event ${event.ID} (response ${event.FormResponseID}) was taken by another drain mid-run; no further step starts here.`);
  } catch (err) {
    if (lease.finished) {
      return;
    }
    LogError(`[Forms automation drain] the lease on event ${event.ID} (response ${event.FormResponseID}) could not be renewed (${describe(err)}); no further step starts here.`);
  }
  lease.guard.abort();
}

/** The run's outcome for a run that happened. */
function outcomeOf(report: ResponseAutomationReport): RunOutcome {
  if (report.stopped) {
    return { kind: 'retry', reason: 'The run was stopped before every step had started.' };
  }
  if (report.retry) {
    const failed = report.results.filter((r) => r.status === 'Failed' && r.retryable === true).map((r) => `"${r.name}"`);
    return { kind: 'retry', reason: `Step(s) ${failed.join(', ')} failed in a way another attempt may fix.` };
  }
  return { kind: 'complete' };
}

/** On the event's last attempt a retry would only be retried never, so it gives up now — with the reason. */
function lastAttemptGuard(outcome: RunOutcome, event: ClaimedEvent): RunOutcome {
  if (outcome.kind !== 'retry' || event.AttemptCount < MAX_ATTEMPTS) {
    return outcome;
  }
  return { kind: 'dead-letter', reason: `Gave up after ${event.AttemptCount} attempts: ${outcome.reason}` };
}

/**
 * How the event settles. Giving up closes its open run rows first — `DeadLettered` for a final,
 * which a replay may reopen; `Abandoned` for a partial, which settles Abandoned rather than holding
 * its response's final behind a dead letter.
 */
async function settlementFor(outcome: RunOutcome, event: ClaimedEvent, contextUser: UserInfo, source: IMetadataProvider | null): Promise<EventSettlement> {
  if (outcome.kind === 'complete') {
    return { status: 'Complete', lastError: null };
  }
  if (outcome.kind === 'retry') {
    return { status: 'Pending', retryAfterSeconds: backoffSeconds(event.AttemptCount), lastError: outcome.reason };
  }
  const partial = event.Trigger === 'OnPartial';
  const closed = await closeOpenRuns(event, partial ? 'Abandoned' : 'DeadLettered', outcome.reason, contextUser, source);
  if (!partial) {
    return { status: 'DeadLetter', lastError: outcome.reason };
  }
  LogError(
    `[Forms automation drain] partial-save automations of response ${event.FormResponseID} abandoned, not dead-lettered ` +
      `(a dead letter would hold the response's final behind it): ${outcome.reason} Steps closed: ${closed.length > 0 ? closed.join(', ') : 'none'}.`,
  );
  return { status: 'Abandoned', lastError: outcome.reason };
}

/** Best-effort, on its own isolated instance: returns the steps closed; a failure is logged and closes none. */
async function closeOpenRuns(
  event: ClaimedEvent,
  closedAs: 'DeadLettered' | 'Abandoned',
  reason: string,
  contextUser: UserInfo,
  source: IMetadataProvider | null,
): Promise<string[]> {
  try {
    return await withIsolatedProvider(
      `Forms automation close-out of event ${event.ID} (response ${event.FormResponseID})`,
      (provider) => FormAutomationEngine.Instance.CloseOpenRuns({ responseId: event.FormResponseID, eventId: event.ID, closedAs, reason }, provider, contextUser),
      source,
    );
  } catch (err) {
    LogError(`[Forms automation drain] the open runs of response ${event.FormResponseID} (event ${event.ID}) were not closed: ${describe(err)}`);
    return [];
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
