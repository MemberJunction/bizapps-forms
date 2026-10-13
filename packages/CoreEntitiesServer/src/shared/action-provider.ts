/**
 * The provider a Forms action reads and writes through.
 *
 * The on-submit chain hands every action a provider instance of its own (RunActionParams.Provider)
 * so that a transaction something ELSE opens on the process-global provider cannot capture the
 * action's queries — bizapps-forms#260, where Common.LogActivity's transaction on the global
 * provider made the later hooks' reads collide with its COMMIT. Direct invocations supply none and
 * keep using the global provider, exactly as before.
 */
import { LogError, Metadata } from '@memberjunction/core';
import type { DatabaseProviderBase, IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import { requireDatabaseProvider } from './database-provider.js';

/** A provider that can both resolve entity metadata and run views — what every on-submit action needs. */
export type ActionDataProvider = IMetadataProvider & IRunViewProvider;

/** Structural check: does `p` also implement the RunView side, not just metadata? */
export function isActionDataProvider(p: IMetadataProvider | null | undefined): p is ActionDataProvider {
  return (
    !!p &&
    typeof (p as Partial<IRunViewProvider>).RunView === 'function' &&
    typeof (p as Partial<IRunViewProvider>).RunViews === 'function'
  );
}

/**
 * Resolve the provider an action's data access must run through: the caller's, when supplied,
 * else the process-global default (unchanged behavior for direct invocations).
 *
 * Never falls back to the global provider when the caller DID supply one that turns out
 * unusable — that would silently undo the isolation the caller asked for, which is the exact
 * failure mode #260 exists to close off.
 */
export function resolveActionProvider(params: { Provider?: IMetadataProvider }): ActionDataProvider {
  if (params.Provider) {
    if (!isActionDataProvider(params.Provider)) {
      throw new Error('RunActionParams.Provider must also implement RunView/RunViews; Forms actions read through it.');
    }
    return params.Provider;
  }
  const global = Metadata.Provider;
  if (!isActionDataProvider(global)) {
    throw new Error('There is no metadata provider that can run views; Forms actions are server-only.');
  }
  return global;
}

/**
 * Run an action's TRANSACTIONAL work — anything that opens `RunInEntityTransaction` — on a provider
 * no other unit of work shares.
 *
 * A caller-supplied provider is used as-is, through {@link resolveActionProvider}: the on-submit
 * chain and a request already hand the action an instance of its own. With none supplied — which is
 * how MJ's agent runner invokes every Action — {@link resolveActionProvider} would fall back to the
 * process-global provider, and a transaction opened there captures every write anyone else makes
 * through that instance until it settles (MJ#2140, bizapps-forms#260). So the work gets an isolated
 * instance instead, released in `finally`.
 *
 * The instance comes from `CreateIndependentInstance()` on the process provider — exactly what
 * `@memberjunction/server`'s `CreateIsolatedProvider()` is. This package does not import that
 * function: `@memberjunction/server` parses the host's MJ config when it is first evaluated, so a
 * static import would make every consumer of this library (the actions, their specs) fail to load
 * outside a configured MJAPI.
 */
export async function withActionDatabaseProvider<T>(
  params: { Provider?: IMetadataProvider },
  caller: string,
  work: (provider: DatabaseProviderBase) => Promise<T>,
): Promise<T> {
  if (params.Provider) {
    return work(requireDatabaseProvider(suppliedProvider(params, caller), caller));
  }
  const isolated = await createIsolatedProvider(caller);
  try {
    return await work(isolated);
  } finally {
    await releaseIsolatedProvider(isolated, caller);
  }
}

/** The caller's provider through {@link resolveActionProvider}, with a refusal that names the caller. */
function suppliedProvider(params: { Provider?: IMetadataProvider }, caller: string): ActionDataProvider {
  try {
    return resolveActionProvider(params);
  } catch (err) {
    throw new Error(`${caller}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** A provider instance of its own, sharing the process provider's pool and metadata — never the process provider. */
async function createIsolatedProvider(caller: string): Promise<DatabaseProviderBase> {
  const global: Partial<DatabaseProviderBase> | undefined = Metadata.Provider as Partial<DatabaseProviderBase> | undefined;
  if (typeof global?.CreateIndependentInstance !== 'function') {
    throw new Error(
      `${caller}: the process provider cannot create an isolated instance, so there is no provider this ` +
        'transactional work may run on. Pass RunActionParams.Provider, or run it on the server.',
    );
  }
  const isolated = await global.CreateIndependentInstance();
  if ((isolated as unknown) === global) {
    throw new Error(`${caller}: CreateIndependentInstance returned the shared provider itself, which isolates nothing.`);
  }
  return requireDatabaseProvider(isolated, caller);
}

/** Release the instance; a failure is logged with the caller, never allowed to replace the work's own outcome. */
async function releaseIsolatedProvider(isolated: DatabaseProviderBase, caller: string): Promise<void> {
  try {
    await isolated.ReleaseIndependentInstance();
  } catch (err) {
    LogError(`${caller}: could not release its isolated provider: ${err instanceof Error ? err.message : String(err)}`);
  }
}
