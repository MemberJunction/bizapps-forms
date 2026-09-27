/**
 * The provider a Forms action reads and writes through.
 *
 * The on-submit chain hands every action a provider instance of its own (RunActionParams.Provider)
 * so that a transaction something ELSE opens on the process-global provider cannot capture the
 * action's queries — bizapps-forms#260, where Common.LogActivity's transaction on the global
 * provider made the later hooks' reads collide with its COMMIT. Direct invocations supply none and
 * keep using the global provider, exactly as before.
 */
import { Metadata } from '@memberjunction/core';
import type { IMetadataProvider, IRunViewProvider } from '@memberjunction/core';

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
