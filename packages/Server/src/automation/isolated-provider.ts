/**
 * Run a unit of work — an on-submit hook, or a device-resume route (#265) — on a provider instance
 * of its own.
 *
 * The instance shares the process provider's connection pool and metadata cache but has its own
 * transaction stack (MJ's CreateIndependentInstance — what MJServer does per request). On the
 * process-global provider, a transaction some other unit of work opens captures every query issued
 * through that instance: bizapps-forms#260, where Common.LogActivity's transaction made the later
 * on-submit hooks' reads race its COMMIT and fail. Refuses, rather than falling back to the global
 * provider, when an instance cannot be created — the fallback is the defect.
 *
 * `withLazyIsolatedProvider` is the primitive: it hands `work` an `acquire()` function instead of
 * an instance, and the instance is created only on the first call to it (memoized, so concurrent
 * `acquire()` calls share one instance and a failed creation rejects every later call identically),
 * released in `finally` only if creation ever succeeded. This is *lazy* because a request-handler
 * unit of work often exits before touching the DB at all — no pointer, rate-limited, validation
 * failure (bizapps-forms#265's `/resume`, `/remember`, `/forget`) — and a provider outage on that
 * path must not turn a cheap early exit into a 500 for work that was never going to touch the DB.
 *
 * `withIsolatedProvider` is the eager convenience form built on top: it acquires immediately and
 * hands `work` the resolved instance, matching its pre-#265 signature exactly.
 */
import { LogError, Metadata } from '@memberjunction/core';
import type { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';

export type IsolatedProviderRunner = <T>(
  purpose: string,
  work: (provider: DatabaseProviderBase) => Promise<T>,
) => Promise<T>;

/** Creates the isolated instance on first call, memoized; every later call returns the same promise. */
export type AcquireIsolatedProvider = () => Promise<DatabaseProviderBase>;

function canCreateIndependentInstance(p: IMetadataProvider | null | undefined): p is DatabaseProviderBase {
  return !!p && typeof (p as Partial<DatabaseProviderBase>).CreateIndependentInstance === 'function';
}

export async function withLazyIsolatedProvider<T>(
  purpose: string,
  work: (acquire: AcquireIsolatedProvider) => Promise<T>,
  source: IMetadataProvider | null = Metadata.Provider,
): Promise<T> {
  let instancePromise: Promise<DatabaseProviderBase> | undefined;
  const acquire: AcquireIsolatedProvider = () => {
    if (!instancePromise) {
      instancePromise = createInstance(purpose, source);
    }
    return instancePromise;
  };

  try {
    return await work(acquire);
  } finally {
    if (instancePromise) {
      // `instancePromise` is the ONLY other consumer besides `work`'s own await(s) of `acquire()`,
      // and it's memoized, so this can't trigger a second `CreateIndependentInstance` call and
      // can't leave a rejection unhandled if `work` never awaited (or already swallowed) it. Only
      // a SUCCESSFUL creation gets released — a lease that never opened has nothing to close.
      await instancePromise.then(
        (instance) => releaseInstance(purpose, instance),
        () => undefined,
      );
    }
  }
}

export async function withIsolatedProvider<T>(
  purpose: string,
  work: (provider: DatabaseProviderBase) => Promise<T>,
  source: IMetadataProvider | null = Metadata.Provider,
): Promise<T> {
  return withLazyIsolatedProvider(purpose, async (acquire) => work(await acquire()), source);
}

async function createInstance(purpose: string, source: IMetadataProvider | null): Promise<DatabaseProviderBase> {
  if (!canCreateIndependentInstance(source)) {
    throw new Error(
      `${purpose}: the process provider cannot create an independent instance, so this work has no isolated provider to run on.`,
    );
  }
  let instance: DatabaseProviderBase;
  try {
    instance = await source.CreateIndependentInstance();
  } catch (e) {
    throw new Error(`${purpose}: could not create an isolated provider: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (instance === source) {
    throw new Error(`${purpose}: CreateIndependentInstance returned the shared provider itself, which isolates nothing.`);
  }
  return instance;
}

async function releaseInstance(purpose: string, instance: DatabaseProviderBase): Promise<void> {
  const depth = instance.TransactionDepth;
  if (depth > 0) {
    // Release rolls this back. Only work that outlived its caller can leave one open, and without
    // this line the rollback of its writes would have no witness.
    LogError(`${purpose}: releasing an isolated provider with ${depth} open transaction level(s); they will be rolled back.`);
  }
  try {
    await instance.ReleaseIndependentInstance();
  } catch (e) {
    LogError(`${purpose}: could not release its isolated provider: ${e instanceof Error ? e.message : String(e)}`);
  }
}
