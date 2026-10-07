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
 * Probing is only safe for a key that names one object across all accounts. Every key Forms has
 * written since v0.11.0 does (a per-upload UUID directory); a respondent upload from before that does
 * not, so another account may hold someone else's file at the same key. Such a key is read exactly
 * as before #290 — one account, never probed, never remembered ({@link isUniqueStorageKey}).
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
  /**
   * True when the account that last served this object in this process was tried first and failed,
   * which changes the likely cause a fallback warning should name.
   */
  rememberedAccountFailed: boolean;
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
  /**
   * False after a metadata load that failed. MJ 6.1.4's `FileStorageEngine` still marks itself
   * configured in that case (its base engine logs and swallows the error), so `Config(false)` never
   * retries; this is the only signal. See {@link readStoredObject}.
   */
  readonly Loaded: boolean;
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

/**
 * One `FORMS_*_STORAGE_ACCOUNT` pin as a read uses it: the value orders the probe, the name goes
 * into the fallback warning. Carried together so the two cannot drift apart.
 */
export interface ReadPin {
  envVar: string;
  /** The configured account id; `undefined` when unset. */
  value: string | undefined;
  /**
   * True for the pin this route read through before #290 when the file's provider had no account
   * (asset: `FORMS_ASSET_STORAGE_ACCOUNT`; download: `FORMS_DOWNLOAD_STORAGE_ACCOUNT`). A key that
   * may not be unique is still read that way — see {@link isUniqueStorageKey}.
   */
  legacyFallback?: boolean;
}

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure. True when the object's name sits directly under a UUID directory, which Forms has written
 * for every upload and asset since v0.11.0 (`uploadPathPrefix`, `assetPathPrefix`).
 *
 * Why it matters: probing several accounts is only safe when a key names ONE object across all of
 * them. Respondent uploads before v0.11.0 were stored at `forms-uploads/<date>/<name>`, so two
 * accounts can each hold a different respondent's `signature.png` at the same key, and bytes found
 * under it on some account prove nothing about whose file they are. Asset uploads first shipped in
 * v0.11.0, already with the UUID, so no released asset key fails this test.
 *
 * A configured `FORMS_UPLOAD_PATH_PREFIX` could itself end in a UUID (a tenant id), and before
 * v0.11.0 the name followed it directly; pass it as `uploadPathPrefix` and a key straight under it
 * is not unique. What this cannot see is a prefix an operator has CHANGED since then.
 */
export function isUniqueStorageKey(providerKey: string, uploadPathPrefix?: string): boolean {
  const segments = providerKey.split('/');
  if (segments.length < 2 || !UUID_SEGMENT.test(segments[segments.length - 2])) return false;
  const prefix = normalizeStoragePrefix(uploadPathPrefix);
  return prefix === '' || segments.slice(0, -1).join('/') !== prefix;
}

/** The prefix as MJ's UploadFile stores it: no leading, trailing or doubled slashes. */
function normalizeStoragePrefix(prefix: string | undefined): string {
  return (prefix ?? '').trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

/** Where an object lives, as `MJ: Files` records it. */
export interface StoredObjectRef {
  providerId: string;
  /**
   * `MJ: Files.ProviderKey`: the storage PATH `FileStorageEngine.UploadFile` wrote, not a
   * provider-native id. Non-null because callers 404 a file without one before reading.
   */
  providerKey: string;
  /**
   * The configured `FORMS_UPLOAD_PATH_PREFIX`, for respondent files. Before v0.11.0 a configured
   * prefix had the file name appended directly, so a key straight under it is never unique — even
   * when the prefix itself ends in a UUID. See {@link isUniqueStorageKey}.
   */
  uploadPathPrefix?: string;
}

/** Raised when no storage account can be resolved to read through. */
export class NoStorageAccountError extends Error {
  constructor(providerId: string) {
    super(`No storage account resolves for provider ${providerId}.`);
    this.name = 'NoStorageAccountError';
  }
}

/**
 * Raised when File Storage metadata is still not loaded after one forced reload. Without it the
 * read would report "no storage account resolves", which names the wrong cause for the life of
 * the process.
 */
export class StorageMetadataNotLoadedError extends Error {
  constructor() {
    super(
      'File Storage metadata did not load on this host; see the engine error logged earlier. ' +
        'Reads cannot resolve a storage account until it does.',
    );
    this.name = 'StorageMetadataNotLoadedError';
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

const REDACTED_KEY = '<storage key>';

/** Characters a stored file name can carry; a basename flanked by one of these is part of a longer word. */
const FILE_NAME_CHAR = '[A-Za-z0-9._-]';

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure. Replaces every occurrence of `providerKey`, and every standalone occurrence of its final
 * path segment, with `<storage key>`. Both are matched as literal strings, in ONE pass.
 *
 * Why the final segment too: a respondent upload's key ends in the uploader's filename, which is
 * personal data, and some drivers (and cloud SDK messages) report only the object's basename. The
 * full key wins where both match, so a path is replaced whole rather than leaving its directories
 * behind. An empty key, or an empty final segment (a key ending in `/`), redacts nothing for that part.
 *
 * Why standalone, and why one pass: a respondent may upload a file named `e` or `a`, and MJ stores a
 * dot-only name as `file`. Matched anywhere, such a basename rewrote the inside of ordinary words —
 * the account names, "provider" and the driver's error in the line this redaction exists to keep
 * readable — and a second pass also rewrote the placeholder the first had just inserted. A
 * standalone word equal to the basename is still redacted: it cannot be told apart from a driver
 * naming the object.
 */
export function redactStorageKey(text: string, providerKey: string): string {
  if (providerKey === '') return text;
  const baseName = providerKey.slice(providerKey.lastIndexOf('/') + 1);
  const alternatives = [escapeRegExp(providerKey)];
  if (baseName !== '') {
    alternatives.push(`(?<!${FILE_NAME_CHAR})${escapeRegExp(baseName)}(?!${FILE_NAME_CHAR})`);
  }
  return text.replace(new RegExp(alternatives.join('|'), 'g'), REDACTED_KEY);
}

/**
 * Pure. The warning for a read that succeeded only after other accounts failed, or `undefined`
 * when the first account tried served it.
 *
 * Names the likely causes, because the log line cannot tell them apart. Normally: the object was
 * written under a different pin or by another host sharing the database, OR the earlier account is
 * failing. When the account that served it before was the one that failed: that account is
 * failing, or the object moved. It names the read order as context, never as an instruction to
 * re-pin — re-pinning is wrong for a failing account and for a legacy row. "Once per object" holds
 * because {@link readStoredObject} remembers the serving account.
 *
 * @param label The route's noun for the object, e.g. `Asset` or `Download`.
 * @param providerKey The object's storage key, shown as `(key …)`; `undefined` omits that clause.
 *   Pass `undefined` for respondent files, whose key ends in the uploader's filename and so must
 *   not reach a log. This function does NOT redact the attempt errors (they may repeat the key):
 *   a caller that omits the key must run the returned line through {@link redactStorageKey}.
 * @param pins The pins that order this route's reads, in the order they are tried — the same list
 *   passed to {@link readStoredObject}.
 */
export function describeReadFallback(
  label: string,
  fileId: string,
  providerKey: string | undefined,
  read: StoredObjectRead,
  pins: ReadonlyArray<ReadPin>,
): string | undefined {
  if (read.failedAttempts.length === 0) return undefined;
  const cause = read.rememberedAccountFailed
    ? 'The account that last served this object in this process failed this time (its error is shown first): ' +
      'that account is failing or the object has moved. '
    : 'Usually it was written under a different pin or by another host sharing this database; otherwise ' +
      'the earlier account is failing (its error is shown). ';
  const order = ['the account that last served this object (if any)', ...pins.map((p) => p.envVar)].join(', then ');
  return (
    `[Forms] ${label} ${fileId}${providerKey === undefined ? '' : ` (key ${providerKey})`} is held by ${describeReadAccount(read.servedBy)}, ` +
    `not by the account(s) tried first: ${describeReadAttempts(read.failedAttempts)}. ` +
    cause +
    `This route's reads are ordered by ${order}, then the provider's other accounts. ` +
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
 * When the provider has no account at all (a row whose provider was replaced) the candidates are
 * every preferred id the engine resolves, in order and deduped, else the engine default; `[]` if
 * nothing resolves. The remembered account plays no part there. Only for keys that are unique across
 * accounts — {@link readStoredObject} reads any other key through {@link findLegacyCandidate}.
 */
export function findReadCandidates(
  storage: StorageReadEngine,
  providerId: string,
  preferredAccountIds: ReadonlyArray<string | undefined>,
  rememberedAccountId?: string,
): { candidates: ReadAccountRef[]; truncated: boolean } {
  const onProvider = storage.GetAccountsByProviderID(providerId);
  if (onProvider.length === 0) {
    return { candidates: findFallbackCandidates(storage, preferredAccountIds), truncated: false };
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

type ResolvedAccount = NonNullable<ReturnType<StorageReadEngine['ResolveStorageAccount']>>;

function toReadAccountRef(resolved: ResolvedAccount): ReadAccountRef {
  return {
    accountId: resolved.account.ID,
    accountName: resolved.account.Name,
    providerId: resolved.provider.ID,
    providerName: resolved.provider.Name,
  };
}

function findFallbackCandidates(
  storage: StorageReadEngine,
  preferredAccountIds: ReadonlyArray<string | undefined>,
): ReadAccountRef[] {
  const resolved = preferredAccountIds
    .filter((id): id is string => !!id)
    .map((id) => storage.ResolveStorageAccount(id))
    .filter((r): r is ResolvedAccount => r !== null)
    .filter((r, index, all) => all.findIndex((other) => UUIDsEqual(other.account.ID, r.account.ID)) === index);
  if (resolved.length > 0) return resolved.map(toReadAccountRef);
  const fallback = storage.ResolveStorageAccount(undefined);
  return fallback ? [toReadAccountRef(fallback)] : [];
}

/**
 * Pure. The one account a key that may not be unique is read through: exactly the rule before #290,
 * the provider's first account in engine order, else the route's {@link ReadPin.legacyFallback} pin
 * (the engine default when it is unset). Never more than one: a second account could hold another
 * respondent's object at the same key.
 */
export function findLegacyCandidate(
  storage: StorageReadEngine,
  providerId: string,
  legacyFallbackAccountId: string | undefined,
): ReadAccountRef[] {
  const first = storage.GetAccountsByProviderID(providerId)[0];
  if (first) {
    const providerName = storage.GetProviderById(providerId)?.Name ?? UNKNOWN_PROVIDER_NAME;
    return [{ accountId: first.ID, accountName: first.Name, providerId, providerName }];
  }
  const resolved = storage.ResolveStorageAccount(legacyFallbackAccountId);
  return resolved ? [toReadAccountRef(resolved)] : [];
}

/**
 * Load the engine's metadata, retrying ONCE with a forced refresh when an earlier load failed:
 * one transient database error on the first storage use would otherwise leave every later read
 * failing with the wrong cause. Still not loaded → {@link StorageMetadataNotLoadedError}.
 */
async function configureStorage(storage: StorageReadEngine, systemUser: UserInfo): Promise<void> {
  await storage.Config(false, systemUser);
  if (storage.Loaded) return;
  await storage.Config(true, systemUser);
  if (!storage.Loaded) throw new StorageMetadataNotLoadedError();
}

/**
 * Fetch the bytes, probing {@link findReadCandidates} in order — the account that last served this
 * object first, so a fallback-served object costs one call (and no failed attempt) from its second
 * read on. Throws {@link StorageMetadataNotLoadedError} when the engine's metadata will not load,
 * {@link NoStorageAccountError} when nothing resolves and
 * {@link StoredObjectReadError}, carrying every attempt, when every candidate fails. Callers turn
 * those into their own route's error, because a 404 and a 500 mean different things to the two
 * routes that use this.
 */
export async function readStoredObject(
  storage: StorageReadEngine,
  systemUser: UserInfo,
  ref: StoredObjectRef,
  pins: ReadonlyArray<ReadPin>,
): Promise<StoredObjectRead> {
  await configureStorage(storage, systemUser);
  const unique = isUniqueStorageKey(ref.providerKey, ref.uploadPathPrefix);
  // Only a unique key is remembered or probed; see isUniqueStorageKey for why.
  const remembered = unique ? findRememberedAccountId(ref) : undefined;
  const { candidates, truncated } = unique
    ? findReadCandidates(storage, ref.providerId, pins.map((p) => p.value), remembered)
    : { candidates: findLegacyCandidate(storage, ref.providerId, pins.find((p) => p.legacyFallback)?.value), truncated: false };
  if (candidates.length === 0) {
    throw new NoStorageAccountError(ref.providerId);
  }
  const failedAttempts: ReadAttempt[] = [];
  let rememberedAccountFailed = false;
  for (const account of candidates) {
    try {
      const driver = await storage.GetDriver(account.accountId, systemUser);
      // By path, never as `objectId`. MJ's `objectId` is the provider-native id (Box / Google Drive /
      // Dropbox / SharePoint); it only coincides with the path on Azure / S3 / GCS, so reading the
      // stored path as an id 404s on ID-keyed providers (#261). Every MJ driver resolves `fullPath`.
      const content = await driver.GetObject({ fullPath: ref.providerKey });
      if (unique) rememberServingAccount(ref, account.accountId);
      return { content, servedBy: account, failedAttempts, rememberedAccountFailed };
    } catch (error) {
      // Not swallowed: recorded, and surfaced in StoredObjectReadError if no later account serves it.
      failedAttempts.push({ account, error: error instanceof Error ? error.message : String(error) });
      if (remembered && UUIDsEqual(account.accountId, remembered)) {
        rememberedAccountFailed = true;
        forgetServingAccount(ref);
      }
    }
  }
  throw new StoredObjectReadError(failedAttempts, truncated);
}
