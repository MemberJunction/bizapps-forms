/**
 * Read one stored object's bytes, whatever provider is behind it.
 *
 * Extracted from `loadAssetBytes` when the response-file download needed the same four steps —
 * configure the engine, decide which account to read through, get its driver, fetch the object.
 * Two copies of that sequence would be two places to get the account-resolution rule wrong, and
 * that rule is the subtle part: `MJ: Files` records a PROVIDER, not an account.
 *
 * The extraction itself changed no behaviour. The guards that decide WHETHER a caller may read a
 * given object stay with their callers, where they belong — the asset route's guard is the storage
 * prefix, the download route's is the caller's permissions. This module only knows how to fetch
 * bytes once someone else has decided it is allowed.
 */
import type { UserInfo } from '@memberjunction/core';

/**
 * The slice of `FileStorageEngine` a read depends on.
 *
 * `GetObject` is narrowed to `{ fullPath }` on purpose: MJ's driver contract also accepts
 * `objectId`, but that means the provider-native id, which Forms never has. Leaving it out of the
 * slice makes a read by `objectId` a compile error here, not a convention (#261).
 */
export interface StorageReadEngine {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  GetAccountsByProviderID(providerId: string): ReadonlyArray<{ ID: string }>;
  ResolveStorageAccount(accountId?: string): { account: { ID: string } } | null;
  GetDriver(
    accountId: string,
    contextUser: UserInfo,
  ): Promise<{ GetObject(params: { fullPath: string }): Promise<Buffer> }>;
}

/** Where an object lives, as `MJ: Files` records it. */
export interface StoredObjectRef {
  providerId: string;
  /**
   * `MJ: Files.ProviderKey`: the storage PATH `FileStorageEngine.UploadFile` wrote, not a
   * provider-native id. Non-null because callers 404 a file without one before reading.
   */
  providerKey: string;
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
  // By path, never as `objectId`. MJ's `objectId` is the provider-native id (Box / Google Drive /
  // Dropbox / SharePoint); it only coincides with the path on Azure / S3 / GCS, so reading the
  // stored path as an id 404s on ID-keyed providers (#261). Every MJ driver resolves `fullPath`.
  return driver.GetObject({ fullPath: ref.providerKey });
}
