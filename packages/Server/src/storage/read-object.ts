/**
 * Read one stored object's bytes, whatever provider is behind it.
 *
 * Extracted from `loadAssetBytes` when the response-file download needed the same steps, so the
 * account-selection rule lives in one place rather than two.
 *
 * That rule is the subtle part: `MJ: Files` records a PROVIDER, not an account, and nothing
 * upstream records which account held the bytes. So the read PROBES: it tries the configured
 * (pinned) account first, because that is the one the upload used and the common case is then a
 * single call, and falls back through the rest of the file's provider's accounts, which also covers
 * legacy rows written before a pin was set or under a different one (#290). Every failed try is
 * reported, so a log line can name the account and provider that actually failed.
 *
 * The guards that decide WHETHER a caller may read a given object stay with their callers: the
 * asset route's guard is the storage prefix, the download route's is the caller's permissions.
 */
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** Upper bound on accounts probed for one read; a provider with more is reported as truncated. */
export const MAX_READ_ACCOUNTS = 8;

const UNKNOWN_PROVIDER_NAME = '(unknown provider)';

/** One storage account as the read names it in logs. */
export interface ReadAccountRef {
  accountId: string;
  accountName: string;
  providerId: string;
  providerName: string;
}

/** One failed try. */
export interface ReadAttempt {
  account: ReadAccountRef;
  error: string;
}

/** A successful read: the bytes, who served them, and what failed first (usually empty). */
export interface StoredObjectRead {
  content: Buffer;
  servedBy: ReadAccountRef;
  failedAttempts: ReadAttempt[];
}

/**
 * The slice of `FileStorageEngine` a read depends on.
 *
 * `GetObject` is narrowed to `{ fullPath }` on purpose: MJ's driver contract also accepts
 * `objectId`, but that means the provider-native id, which Forms never has. Leaving it out of the
 * slice makes a read by `objectId` a compile error here, not a convention (#261).
 */
export interface StorageReadEngine {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  GetAccountsByProviderID(providerId: string): ReadonlyArray<{ ID: string; Name: string }>;
  GetProviderById(providerId: string): { ID: string; Name: string } | undefined;
  ResolveStorageAccount(
    accountId?: string,
  ): { account: { ID: string; Name: string }; provider: { ID: string; Name: string } } | null;
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

/** Pure. `account "<name>" (<id>) on provider "<name>" (<id>)` */
export function describeReadAccount(account: ReadAccountRef): string {
  return `account "${account.accountName}" (${account.accountId}) on provider "${account.providerName}" (${account.providerId})`;
}

/** Pure. One line: each failed try as `<account>: <error>`, joined by `; `. */
export function describeReadAttempts(attempts: ReadonlyArray<ReadAttempt>): string {
  return attempts.map((a) => `${describeReadAccount(a.account)}: ${a.error}`).join('; ');
}

/** Every candidate failed. `attempts` is never empty; `truncated` = more accounts existed than were tried. */
export class StoredObjectReadError extends Error {
  readonly attempts: ReadAttempt[];
  readonly truncated: boolean;
  constructor(attempts: ReadAttempt[], truncated: boolean) {
    const cap = truncated
      ? ` (more accounts exist than were tried; stopped after ${MAX_READ_ACCOUNTS})`
      : '';
    super(`${describeReadAttempts(attempts)}${cap}`);
    this.name = 'StoredObjectReadError';
    this.attempts = attempts;
    this.truncated = truncated;
  }
}

/**
 * Pure. The accounts to try, in order: preferred accounts that sit on the file's provider first
 * (in preferred order, deduped), then the rest of the provider's accounts in engine order, capped
 * at {@link MAX_READ_ACCOUNTS}. A preferred account on ANOTHER provider cannot hold this file, so
 * it does not reorder anything.
 *
 * When the provider has no account at all (a legacy row whose provider was replaced) the closest
 * answer is the first preferred id the engine resolves, else the engine default; `[]` if nothing
 * resolves.
 */
export function findReadCandidates(
  storage: StorageReadEngine,
  providerId: string,
  preferredAccountIds: ReadonlyArray<string | undefined>,
): { candidates: ReadAccountRef[]; truncated: boolean } {
  const onProvider = storage.GetAccountsByProviderID(providerId);
  if (onProvider.length === 0) {
    return { candidates: findFallbackCandidate(storage, preferredAccountIds), truncated: false };
  }
  const preferred = preferredAccountIds
    .filter((id): id is string => !!id)
    .map((id) => onProvider.find((a) => UUIDsEqual(a.ID, id)))
    .filter((a): a is { ID: string; Name: string } => a !== undefined);
  const ordered = [...preferred, ...onProvider].filter(
    (account, index, all) => all.findIndex((other) => UUIDsEqual(other.ID, account.ID)) === index,
  );
  const providerName = storage.GetProviderById(providerId)?.Name ?? UNKNOWN_PROVIDER_NAME;
  return {
    candidates: ordered
      .slice(0, MAX_READ_ACCOUNTS)
      .map((a) => ({ accountId: a.ID, accountName: a.Name, providerId, providerName })),
    truncated: ordered.length > MAX_READ_ACCOUNTS,
  };
}

function findFallbackCandidate(
  storage: StorageReadEngine,
  preferredAccountIds: ReadonlyArray<string | undefined>,
): ReadAccountRef[] {
  const firstPreferred = preferredAccountIds.find((id): id is string => !!id);
  const resolved =
    (firstPreferred ? storage.ResolveStorageAccount(firstPreferred) : null) ?? storage.ResolveStorageAccount(undefined);
  if (!resolved) return [];
  return [
    {
      accountId: resolved.account.ID,
      accountName: resolved.account.Name,
      providerId: resolved.provider.ID,
      providerName: resolved.provider.Name,
    },
  ];
}

/**
 * Fetch the bytes, probing {@link findReadCandidates} in order. Throws
 * {@link NoStorageAccountError} when nothing resolves and {@link StoredObjectReadError}, carrying
 * every attempt, when every candidate fails. Callers turn those into their own route's error,
 * because a 404 and a 500 mean different things to the two routes that use this.
 */
export async function readStoredObject(
  storage: StorageReadEngine,
  systemUser: UserInfo,
  ref: StoredObjectRef,
  preferredAccountIds: ReadonlyArray<string | undefined>,
): Promise<StoredObjectRead> {
  await storage.Config(false, systemUser);
  const { candidates, truncated } = findReadCandidates(storage, ref.providerId, preferredAccountIds);
  if (candidates.length === 0) {
    throw new NoStorageAccountError(ref.providerId);
  }
  const failedAttempts: ReadAttempt[] = [];
  for (const account of candidates) {
    try {
      const driver = await storage.GetDriver(account.accountId, systemUser);
      // By path, never as `objectId`. MJ's `objectId` is the provider-native id (Box / Google Drive /
      // Dropbox / SharePoint); it only coincides with the path on Azure / S3 / GCS, so reading the
      // stored path as an id 404s on ID-keyed providers (#261). Every MJ driver resolves `fullPath`.
      const content = await driver.GetObject({ fullPath: ref.providerKey });
      return { content, servedBy: account, failedAttempts };
    } catch (error) {
      // Not swallowed: recorded, and surfaced in StoredObjectReadError if no later account serves it.
      failedAttempts.push({ account, error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new StoredObjectReadError(failedAttempts, truncated);
}
