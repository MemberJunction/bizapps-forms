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
 * reported, so a log line can name the account and provider that actually failed. The account that
 * served an object is remembered in-process and tried first next time, so the fallback (and its
 * warning) happens once per object, not once per request.
 *
 * The guards that decide WHETHER a caller may read a given object stay with their callers: the
 * asset route's guard is the storage prefix, the download route's is the caller's permissions.
 */
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** Upper bound on accounts probed for one read; a provider with more is reported as truncated. */
export const MAX_READ_ACCOUNTS = 8;

const UNKNOWN_PROVIDER_NAME = '(unknown provider)';

/** Upper bound on objects whose serving account is remembered; past it the oldest is forgotten. */
export const MAX_REMEMBERED_READS = 1000;

/**
 * `<PROVIDER ID>|<provider key>` → the id of the account that last served that object, oldest first
 * (Map insertion order, re-inserted on every successful read so eviction drops the least recent).
 *
 * Why it exists: an object held by an account other than the preferred one would otherwise fail on
 * the preferred account on EVERY read — a remote round trip on Box — and every caller would log a
 * fallback warning per request, for the life of the file. Remembering the serving account makes the
 * second read a single call with no failed attempts. A per-process cache, not a record: losing it
 * (restart, eviction) costs only the probe it saved.
 */
const rememberedReads = new Map<string, string>();

function rememberedReadKey(ref: StoredObjectRef): string {
  // Provider ids are UUIDs: SQL Server returns them upper-case, other callers may not.
  return `${ref.providerId.toUpperCase()}|${ref.providerKey}`;
}

function findRememberedAccountId(ref: StoredObjectRef): string | undefined {
  return rememberedReads.get(rememberedReadKey(ref));
}

function rememberServingAccount(ref: StoredObjectRef, accountId: string): void {
  const key = rememberedReadKey(ref);
  rememberedReads.delete(key);
  rememberedReads.set(key, accountId);
  if (rememberedReads.size > MAX_REMEMBERED_READS) {
    const oldest = rememberedReads.keys().next();
    if (!oldest.done) rememberedReads.delete(oldest.value);
  }
}

function forgetServingAccount(ref: StoredObjectRef): void {
  rememberedReads.delete(rememberedReadKey(ref));
}

/** Test seam: forget every remembered serving account. */
export function resetRememberedReadsForTests(): void {
  rememberedReads.clear();
}

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

/**
 * Pure. The warning for a read that succeeded only after other accounts failed, or `undefined`
 * when the first account tried served it.
 *
 * Names both causes because the log line cannot tell them apart: the object was written under a
 * different pin or by another host sharing the database, OR the earlier account is failing (its
 * error is shown). It names the pins that order the route's reads as context, never as an
 * instruction to re-pin — re-pinning is wrong for the second cause and for a legacy row. "Once per
 * object" holds because {@link readStoredObject} remembers the serving account.
 *
 * @param label The route's noun for the object, e.g. `Asset` or `Download`.
 * @param pinEnvVars The env vars that order this route's reads, in the order they are tried.
 */
export function describeReadFallback(
  label: string,
  fileId: string,
  providerKey: string,
  read: StoredObjectRead,
  pinEnvVars: ReadonlyArray<string>,
): string | undefined {
  if (read.failedAttempts.length === 0) return undefined;
  return (
    `[Forms] ${label} ${fileId} (key ${providerKey}) is held by ${describeReadAccount(read.servedBy)}, ` +
    `not by the account(s) tried first: ${describeReadAttempts(read.failedAttempts)}. ` +
    'Usually it was written under a different pin or by another host sharing this database; otherwise ' +
    'the earlier account is failing (its error is shown). ' +
    `This route's reads are ordered by ${pinEnvVars.join(', then ')}, then the provider's other accounts. ` +
    'Logged once per object while this process remembers where it lives.'
  );
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
 * Pure. The accounts to try, in order: the account that last served this object (if any), then
 * preferred accounts — each only if it sits on the file's provider, in that order, deduped — then
 * the rest of the provider's accounts in engine order, capped at {@link MAX_READ_ACCOUNTS}. An
 * account on ANOTHER provider, or one the engine no longer has, cannot hold this file, so it does
 * not reorder anything.
 *
 * When the provider has no account at all (a legacy row whose provider was replaced) the closest
 * answer is the first preferred id the engine resolves, else the engine default; `[]` if nothing
 * resolves. The remembered account plays no part there: there is only ever one candidate.
 */
export function findReadCandidates(
  storage: StorageReadEngine,
  providerId: string,
  preferredAccountIds: ReadonlyArray<string | undefined>,
  rememberedAccountId?: string,
): { candidates: ReadAccountRef[]; truncated: boolean } {
  const onProvider = storage.GetAccountsByProviderID(providerId);
  if (onProvider.length === 0) {
    return { candidates: findFallbackCandidate(storage, preferredAccountIds), truncated: false };
  }
  const preferred = [rememberedAccountId, ...preferredAccountIds]
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
  let resolved: ReturnType<StorageReadEngine['ResolveStorageAccount']> = null;
  for (const id of preferredAccountIds) {
    if (!id) continue;
    resolved = storage.ResolveStorageAccount(id);
    if (resolved) break;
  }
  resolved ??= storage.ResolveStorageAccount(undefined);
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
 * Fetch the bytes, probing {@link findReadCandidates} in order — the account that last served this
 * object first, so a fallback-served object costs one call (and no failed attempt) from its second
 * read on. Throws {@link NoStorageAccountError} when nothing resolves and
 * {@link StoredObjectReadError}, carrying every attempt, when every candidate fails. Callers turn
 * those into their own route's error, because a 404 and a 500 mean different things to the two
 * routes that use this.
 */
export async function readStoredObject(
  storage: StorageReadEngine,
  systemUser: UserInfo,
  ref: StoredObjectRef,
  preferredAccountIds: ReadonlyArray<string | undefined>,
): Promise<StoredObjectRead> {
  await storage.Config(false, systemUser);
  const remembered = findRememberedAccountId(ref);
  const { candidates, truncated } = findReadCandidates(storage, ref.providerId, preferredAccountIds, remembered);
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
      rememberServingAccount(ref, account.accountId);
      return { content, servedBy: account, failedAttempts };
    } catch (error) {
      // Not swallowed: recorded, and surfaced in StoredObjectReadError if no later account serves it.
      failedAttempts.push({ account, error: error instanceof Error ? error.message : String(error) });
      if (remembered && UUIDsEqual(account.accountId, remembered)) forgetServingAccount(ref);
    }
  }
  throw new StoredObjectReadError(failedAttempts, truncated);
}
