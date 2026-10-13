/**
 * The provider a Forms engine writes through must be a server DATABASE provider.
 *
 * Operations and actions receive an `IMetadataProvider` — the interface MJ hands every caller — but
 * the engines need what only `DatabaseProviderBase` has: `ExecuteSQL` (counters and row locks that
 * join the ambient transaction) and entity transactions (`RunInEntityTransaction`). A client-side
 * provider has neither, and handing one through would not fail loudly: `RunInEntityTransaction`
 * runs the work without a transaction on a provider that cannot hold one.
 *
 * Structural rather than `instanceof`: the check is what the engines CALL, which is also what a test
 * double has to provide — and the class may exist twice in a workspace with two copies of
 * `@memberjunction/core`.
 */
import type { DatabaseProviderBase, IMetadataProvider } from '@memberjunction/core';

/** `provider` as a database provider, or a throw naming `caller` and what was wrong. */
export function requireDatabaseProvider(provider: IMetadataProvider | null | undefined, caller: string): DatabaseProviderBase {
  if (!provider) {
    throw new Error(`${caller} needs a server database provider; no provider was given.`);
  }
  const candidate = provider as Partial<Record<'ExecuteSQL' | 'BeginEntityTransaction' | 'RunViews' | 'GetEntityObject', unknown>>;
  const isDatabase =
    typeof candidate.ExecuteSQL === 'function' &&
    typeof candidate.BeginEntityTransaction === 'function' &&
    typeof candidate.RunViews === 'function' &&
    typeof candidate.GetEntityObject === 'function';
  if (!isDatabase) {
    throw new Error(
      `${caller} needs a server database provider (one with ExecuteSQL and entity transactions); ` +
        `got ${provider.constructor?.name ?? typeof provider}. Run it on the server.`,
    );
  }
  return provider as DatabaseProviderBase;
}
