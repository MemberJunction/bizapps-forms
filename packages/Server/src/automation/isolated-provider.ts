/**
 * Run on-submit work on a provider instance of its own.
 *
 * The instance shares the process provider's connection pool and metadata cache but has its own
 * transaction stack (MJ's CreateIndependentInstance — what MJServer does per request). On the
 * process-global provider, a transaction some other unit of work opens captures every query issued
 * through that instance: bizapps-forms#260, where Common.LogActivity's transaction made the later
 * on-submit hooks' reads race its COMMIT and fail. Refuses, rather than falling back to the global
 * provider, when an instance cannot be created — the fallback is the defect.
 */
import { LogError, Metadata } from '@memberjunction/core';
import type { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';

export type IsolatedProviderRunner = <T>(
  purpose: string,
  work: (provider: DatabaseProviderBase) => Promise<T>,
) => Promise<T>;

function canCreateIndependentInstance(p: IMetadataProvider | null | undefined): p is DatabaseProviderBase {
  return !!p && typeof (p as Partial<DatabaseProviderBase>).CreateIndependentInstance === 'function';
}

export async function withIsolatedProvider<T>(
  purpose: string,
  work: (provider: DatabaseProviderBase) => Promise<T>,
  source: IMetadataProvider | null = Metadata.Provider,
): Promise<T> {
  const instance = await createInstance(purpose, source);
  try {
    return await work(instance);
  } finally {
    await releaseInstance(purpose, instance);
  }
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
