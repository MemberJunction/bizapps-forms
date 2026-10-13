/**
 * Guards every Forms engine applies before and after it writes — one copy, so each engine fails the
 * same way, with the same words, for the same misconfiguration.
 */
import { LogError, LogStatus, RunInEntityTransaction, type BaseEntity, type DatabaseProviderBase } from '@memberjunction/core';

/**
 * Refuse a provider that cannot hold an entity transaction.
 *
 * `RunInEntityTransaction` quietly runs the work WITHOUT a transaction on such a provider (it is
 * built for callers that decided non-atomic is acceptable). An engine has not decided that: a
 * publish or a build that commits row by row is exactly the half-written state the engines exist to
 * rule out, so it refuses up front instead.
 */
export function requireEntityTransactions(provider: DatabaseProviderBase, what: string): void {
  if (provider?.SupportsEntityTransactions !== true) {
    throw new Error(
      `${what} needs a provider that supports entity transactions, so it lands whole or not at all; ` +
        'this one does not (a client-side provider?). Run it on the server.',
    );
  }
}

/**
 * The entity as the server subclass the engine relies on, or a throw that says what is misconfigured.
 *
 * The engine's writes are only legitimate because the server subclass checks them, and its engine
 * flag only means something on that subclass. If the plain generated class was handed back instead,
 * `@mj-biz-apps/forms-core-entities-server` was not loaded after `@mj-biz-apps/forms-entities` — so
 * the invariants are off for every writer, and the engine says so rather than writing anyway.
 */
export function requireServerEntity<T>(value: unknown, serverClass: abstract new (...args: never[]) => T, entityName: string): T {
  if (value instanceof serverClass) {
    return value;
  }
  const got = value === null || value === undefined ? String(value) : (value as object).constructor?.name ?? typeof value;
  throw new Error(
    `Expected ${serverClass.name} for '${entityName}' but got ${got}. Load @mj-biz-apps/forms-core-entities-server after ` +
      '@mj-biz-apps/forms-entities so its server subclasses register last.',
  );
}

/** Why a save failed, never empty — MJ's per-field detail is on `CompleteMessage`. */
export function saveFailure(entity: Pick<BaseEntity, 'LatestResult'>): string {
  return entity.LatestResult?.CompleteMessage || entity.LatestResult?.Message || 'no detail reported by the provider';
}

/** An entity server subclass that a Forms engine may write with its privilege. */
export interface EngineWritable {
  AuthorizedByEngine: boolean;
  Save(): Promise<boolean>;
}

/**
 * Save `entity` as the engine: raise its `AuthorizedByEngine` flag for this one save and lower it
 * again in `finally`, whatever the save did.
 *
 * Structural rather than incidental: an engine that kept the instance and saved it again later — or
 * handed it to code that does — would otherwise make that later save privileged too, and no
 * reviewer reading only the second save would see why it was allowed.
 */
export async function saveAsEngine(entity: EngineWritable): Promise<boolean> {
  entity.AuthorizedByEngine = true;
  try {
    return await entity.Save();
  } finally {
    entity.AuthorizedByEngine = false;
  }
}

/**
 * Run an engine's unit of work in one entity transaction — joining the caller's as a savepoint when
 * one is open — and log a failure ONCE, at the outermost boundary ({@link runEngineCall}).
 *
 * Engines nest (`FormAuthoringEngine` publishes through `FormPublishingEngine` inside its own
 * build), and each used to log what it caught, so one failure reached the log twice with two
 * different contexts.
 */
export async function runEngineUnitOfWork<T>(
  provider: DatabaseProviderBase,
  context: string,
  work: () => Promise<T>,
): Promise<T> {
  return runEngineCall(provider, context, () => RunInEntityTransaction(provider, work));
}

/**
 * Run an engine verb and log a failure ONCE, at the outermost boundary — without opening a
 * transaction of its own. For the verb that must not be one unit (issuing a share link; see
 * `FormDistributionEngine.Issue`), and the base of {@link runEngineUnitOfWork}.
 *
 * Only the call that found no transaction open on entry (depth 0) logs: it is the boundary the
 * failure leaves, and its `context` says what was being attempted for whom. Inside a caller's
 * transaction the caller logs. A refusal over the request (`fault === false`) is a status, not an
 * error.
 */
export async function runEngineCall<T>(provider: DatabaseProviderBase, context: string, work: () => Promise<T>): Promise<T> {
  const outermost = (provider.TransactionDepth ?? 0) === 0;
  try {
    return await work();
  } catch (err) {
    if (outermost) {
      const refusal = err instanceof Error && 'fault' in err && err.fault === false;
      (refusal ? LogStatus : LogError)(`${context}: ${err instanceof Error ? err.message : String(err)}`);
    }
    throw err;
  }
}
