/**
 * Read one stored object's bytes, whatever provider is behind it.
 *
 * Extracted from `loadAssetBytes` when the response-file download needed the same four steps —
 * configure the engine, decide which account to read through, get its driver, fetch the object.
 * Two copies of that sequence would be two places to get the account-resolution rule wrong, and
 * that rule is the subtle part: `MJ: Files` records a PROVIDER, not an account.
 *
 * No behaviour change. The guards that decide WHETHER a caller may read a given object stay with
 * their callers, where they belong — the asset route's guard is the storage prefix, the download
 * route's is the caller's permissions. This module only knows how to fetch bytes once someone
 * else has decided it is allowed.
 */
import type { UserInfo } from '@memberjunction/core';

/** The slice of `FileStorageEngine` a read depends on. */
export interface StorageReadEngine {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  GetAccountsByProviderID(providerId: string): ReadonlyArray<{ ID: string }>;
  ResolveStorageAccount(accountId?: string): { account: { ID: string } } | null;
  GetDriver(
    accountId: string,
    contextUser: UserInfo,
  ): Promise<{ GetObject(params: { objectId?: string }): Promise<Buffer> }>;
}

/** Where an object lives, as `MJ: Files` records it. */
export interface StoredObjectRef {
  providerId: string;
  providerKey: string | null;
}

/** Raised when no storage account can be resolved to read through. */
export class NoStorageAccountError extends Error {
  constructor(providerId: string) {
    super(`No storage account resolves for provider ${providerId}.`);
    this.name = 'NoStorageAccountError';
  }
}

/**
 * Which storage account to read through.
 *
 * `MJ: Files` records a PROVIDER, not an account, so a deployment with two accounts on one
 * provider is genuinely ambiguous at this level — MJ's model does not record which one held the
 * bytes. Preferring an account on the file's own provider is the closest available answer; the
 * configured/default account is the fallback for a provider with none.
 */
export function resolveReadAccountId(
  storage: StorageReadEngine,
  providerId: string,
  fallbackAccountId?: string,
): string | undefined {
  const onProvider = storage.GetAccountsByProviderID(providerId);
  if (onProvider.length > 0) {
    return onProvider[0].ID;
  }
  return storage.ResolveStorageAccount(fallbackAccountId)?.account.ID;
}

/**
 * Fetch the bytes. Throws {@link NoStorageAccountError} when nothing resolves, and whatever the
 * driver throws otherwise — callers turn those into their own route's error, because a 404 and a
 * 500 mean different things to the two routes that use this.
 */
export async function readStoredObject(
  storage: StorageReadEngine,
  systemUser: UserInfo,
  ref: StoredObjectRef,
  fallbackAccountId?: string,
): Promise<Buffer> {
  await storage.Config(false, systemUser);
  const accountId = resolveReadAccountId(storage, ref.providerId, fallbackAccountId);
  if (!accountId) {
    throw new NoStorageAccountError(ref.providerId);
  }
  const driver = await storage.GetDriver(accountId, systemUser);
  return driver.GetObject({ objectId: ref.providerKey ?? undefined });
}
