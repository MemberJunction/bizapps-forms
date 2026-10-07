import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  MAX_READ_ACCOUNTS,
  MAX_REMEMBERED_READS,
  NoStorageAccountError,
  StorageMetadataNotLoadedError,
  StoredObjectReadError,
  describeReadFallback,
  isUniqueStorageKey,
  redactStorageKey,
  readStoredObject,
  resetRememberedReadsForTests,
  type StorageReadEngine,
  type ReadPin,
  type StoredObjectRead,
} from '../read-object.js';

/** Pins for a read, by position; the env-var names only matter to the fallback warning. */
const pins = (...ids: Array<string | undefined>): ReadPin[] => ids.map((value, i) => ({ envVar: `PIN_${i}`, value }));

// The serving-account memo is process-wide; without this, one test's read reorders the next's.
beforeEach(() => resetRememberedReadsForTests());

const SYSTEM = {} as UserInfo;
// Shaped like every key Forms has written since v0.11.0: a per-upload UUID directory before the name.
const KEY = 'forms-assets/form-1/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/logo.png';
const BYTES = Buffer.from('PNGDATA');

/**
 * A driver double with Box / Google Drive / Dropbox / SharePoint semantics: `objectId` is an opaque
 * provider-native id, and only `fullPath` goes through path resolution. MJ: Files.ProviderKey holds a
 * PATH, so a read that passes it as objectId 404s on these providers (#261).
 */
function idKeyedDriver() {
  const nativeIdByPath = new Map([[KEY, '1234567890']]);
  const stored = new Map([['1234567890', BYTES]]);
  return {
    GetObject: vi.fn(async (params: { objectId?: string; fullPath?: string }) => {
      const id = params.objectId ?? (params.fullPath ? nativeIdByPath.get(params.fullPath) : undefined);
      const bytes = id ? stored.get(id) : undefined;
      if (!bytes) throw new Error(`Failed to get object: ${params.objectId ?? params.fullPath}`);
      return bytes;
    }),
  };
}

function engine(driver: ReturnType<typeof idKeyedDriver>): StorageReadEngine {
  return {
    Config: vi.fn(async () => undefined),
    Loaded: true,
    GetAccountsByProviderID: () => [{ ID: 'box-account', Name: 'Box main' }],
    GetProviderById: () => ({ ID: 'box', Name: 'Box.com' }),
    ResolveStorageAccount: () => null,
    GetDriver: vi.fn(async () => driver),
  };
}

interface AccountRow {
  ID: string;
  Name: string;
  ProviderID: string;
}

/** An engine over a table of accounts and a per-account map of stored bytes (path -> bytes). */
function multiAccountEngine(
  accounts: AccountRow[],
  stored: Record<string, Record<string, Buffer>>,
  extra: { throwOnDriver?: string[]; resolve?: (id?: string) => string | null } = {},
) {
  const driverCalls: string[] = [];
  const resolveCalls: Array<string | undefined> = [];
  const providers = new Map(accounts.map((a) => [a.ProviderID, { ID: a.ProviderID, Name: `Provider ${a.ProviderID}` }]));
  const storage: StorageReadEngine = {
    Config: vi.fn(async () => undefined),
    Loaded: true,
    GetAccountsByProviderID: (pid) => accounts.filter((a) => a.ProviderID === pid),
    GetProviderById: (pid) => providers.get(pid),
    ResolveStorageAccount: (id) => {
      resolveCalls.push(id);
      const hit = extra.resolve?.(id);
      const acct = accounts.find((a) => a.ID === hit);
      return acct ? { account: acct, provider: { ID: acct.ProviderID, Name: 'resolved provider' } } : null;
    },
    GetDriver: vi.fn(async (accountId: string) => {
      driverCalls.push(accountId);
      if (extra.throwOnDriver?.includes(accountId)) throw new Error(`credentials rejected for ${accountId}`);
      return {
        GetObject: async ({ fullPath }: { fullPath: string }) => {
          const bytes = stored[accountId]?.[fullPath];
          if (!bytes) throw new Error(`ENOENT ${fullPath}`);
          return bytes;
        },
      };
    }),
  };
  return { storage, driverCalls, resolveCalls };
}

const A: AccountRow = { ID: 'AAAAAAAA-0000-4000-8000-000000000001', Name: 'Account A', ProviderID: 'P1' };
const B: AccountRow = { ID: 'BBBBBBBB-0000-4000-8000-000000000002', Name: 'Account B', ProviderID: 'P1' };
const REF = { providerId: 'P1', providerKey: KEY };

describe('readStoredObject — provider-agnostic reads (#261)', () => {
  it('reads a path-keyed file back on an ID-keyed provider such as Box', async () => {
    const driver = idKeyedDriver();
    const bytes = await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY }, pins());
    expect(bytes.content.equals(BYTES)).toBe(true);
  });

  it('passes ProviderKey as fullPath and never as objectId', async () => {
    // ProviderKey is the storage PATH UploadFile wrote; objectId means the provider's own id.
    const driver = idKeyedDriver();
    await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY }, pins());
    expect(driver.GetObject).toHaveBeenCalledWith({ fullPath: KEY });
  });
});

describe('readStoredObject: probing the provider accounts (#290)', () => {
  it('tries the pinned account first even when it is second in engine order', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], { [B.ID]: { [KEY]: BYTES } });
    const read = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(driverCalls).toEqual([B.ID]);
    expect(read.content.equals(BYTES)).toBe(true);
    expect(read.servedBy).toEqual({
      accountId: B.ID,
      accountName: 'Account B',
      providerId: 'P1',
      providerName: 'Provider P1',
    });
    expect(read.failedAttempts).toEqual([]);
  });

  it('with the pin first, the engine-order account is only tried after it fails', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], { [A.ID]: { [KEY]: BYTES } });
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(driverCalls).toEqual([B.ID, A.ID]);
  });

  it('returns bytes held only by the non-pinned account and reports the pinned failure', async () => {
    const { storage } = multiAccountEngine([A, B], { [A.ID]: { [KEY]: BYTES } });
    const read = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(read.servedBy.accountId).toBe(A.ID);
    expect(read.failedAttempts).toHaveLength(1);
    expect(read.failedAttempts[0].account.accountId).toBe(B.ID);
    expect(read.failedAttempts[0].error).toBe(`ENOENT ${KEY}`);
  });

  it('rejects with every attempt, in order, when no account holds the bytes', async () => {
    const { storage } = multiAccountEngine([A, B], {});
    const error = await readStoredObject(storage, SYSTEM, REF, pins(B.ID)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoredObjectReadError);
    const failure = error as StoredObjectReadError;
    expect(failure.attempts.map((a) => a.account.accountId)).toEqual([B.ID, A.ID]);
    expect(failure.truncated).toBe(false);
    expect(failure.message).toContain(A.ID);
    expect(failure.message).toContain(B.ID);
    expect(failure.message).toContain('Provider P1');
  });

  it('matches a lower-case pin against upper-case engine ids', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], { [B.ID]: { [KEY]: BYTES } });
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID.toLowerCase()));
    expect(driverCalls).toEqual([B.ID]);
  });

  it('ignores a pin that names an account on a different provider', async () => {
    const other: AccountRow = { ID: 'CCCCCCCC-0000-4000-8000-000000000003', Name: 'Other', ProviderID: 'P2' };
    const { storage, driverCalls } = multiAccountEngine([A, B, other], { [A.ID]: { [KEY]: BYTES } });
    await readStoredObject(storage, SYSTEM, REF, pins(other.ID));
    expect(driverCalls).toEqual([A.ID]);
  });

  it('tries an account that is both pinned and on the provider exactly once', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], {});
    await expect(readStoredObject(storage, SYSTEM, REF, pins(A.ID, A.ID.toLowerCase()))).rejects.toBeInstanceOf(
      StoredObjectReadError,
    );
    expect(driverCalls).toEqual([A.ID, B.ID]);
  });

  it('counts a GetDriver failure as an attempt and tries the next account', async () => {
    const { storage } = multiAccountEngine([A, B], { [B.ID]: { [KEY]: BYTES } }, { throwOnDriver: [A.ID] });
    const read = await readStoredObject(storage, SYSTEM, REF, pins(A.ID));
    expect(read.servedBy.accountId).toBe(B.ID);
    expect(read.failedAttempts).toHaveLength(1);
    expect(read.failedAttempts[0].account.accountId).toBe(A.ID);
    expect(read.failedAttempts[0].error).toBe(`credentials rejected for ${A.ID}`);
  });

  it('caps the probe at MAX_READ_ACCOUNTS and says more accounts existed', async () => {
    const many: AccountRow[] = Array.from({ length: 10 }, (_, i) => ({
      ID: `0000000${i}-0000-4000-8000-00000000000${i}`,
      Name: `Account ${i}`,
      ProviderID: 'P1',
    }));
    const { storage, driverCalls } = multiAccountEngine(many, {});
    const error = (await readStoredObject(storage, SYSTEM, REF, pins()).catch((e: unknown) => e)) as StoredObjectReadError;
    expect(driverCalls).toHaveLength(MAX_READ_ACCOUNTS);
    expect(error).toBeInstanceOf(StoredObjectReadError);
    expect(error.truncated).toBe(true);
    expect(error.message).toMatch(/more accounts exist than were tried/i);
  });

  it('falls back to the first preferred account that resolves when the provider has none', async () => {
    const orphan: AccountRow = { ID: 'DDDDDDDD-0000-4000-8000-000000000004', Name: 'Orphan', ProviderID: 'P9' };
    const { storage, driverCalls, resolveCalls } = multiAccountEngine(
      [orphan],
      { [orphan.ID]: { [KEY]: BYTES } },
      { resolve: (id) => (id === orphan.ID ? orphan.ID : null) },
    );
    const read = await readStoredObject(storage, SYSTEM, REF, pins(undefined, orphan.ID));
    expect(driverCalls).toEqual([orphan.ID]);
    expect(read.servedBy.accountId).toBe(orphan.ID);
    expect(resolveCalls).toContain(orphan.ID);
  });

  it('tries each preferred id in turn when the provider has no account, skipping ones that do not resolve', async () => {
    const orphan: AccountRow = { ID: 'DDDDDDDD-0000-4000-8000-000000000004', Name: 'Orphan', ProviderID: 'P9' };
    const { storage, resolveCalls } = multiAccountEngine(
      [orphan],
      { [orphan.ID]: { [KEY]: BYTES } },
      { resolve: (id) => (id === orphan.ID ? orphan.ID : null) },
    );
    const read = await readStoredObject(storage, SYSTEM, REF, pins('GONE', orphan.ID));
    expect(resolveCalls).toEqual(['GONE', orphan.ID]);
    expect(read.servedBy.accountId).toBe(orphan.ID);
  });

  it('falls back to the default account when the provider has none and nothing is preferred', async () => {
    const orphan: AccountRow = { ID: 'DDDDDDDD-0000-4000-8000-000000000004', Name: 'Orphan', ProviderID: 'P9' };
    const { storage, resolveCalls, driverCalls } = multiAccountEngine(
      [orphan],
      { [orphan.ID]: { [KEY]: BYTES } },
      { resolve: (id) => (id === undefined ? orphan.ID : null) },
    );
    await readStoredObject(storage, SYSTEM, REF, pins());
    expect(resolveCalls).toEqual([undefined]);
    expect(driverCalls).toEqual([orphan.ID]);
  });

  it('rejects with NoStorageAccountError when nothing resolves', async () => {
    const { storage } = multiAccountEngine([], {});
    await expect(readStoredObject(storage, SYSTEM, REF, pins('x'))).rejects.toBeInstanceOf(NoStorageAccountError);
  });
});

describe('readStoredObject: remembering the account that served an object (#290)', () => {
  /** Pin B; the bytes live only in A — the cross-host shape the live smoke reproduced. */
  function fallbackServed() {
    return multiAccountEngine([A, B], { [A.ID]: { [KEY]: BYTES } });
  }

  it('reads a fallback-served object a second time with ONE GetDriver call, through the serving account', async () => {
    const { storage, driverCalls } = fallbackServed();
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    driverCalls.length = 0;
    const second = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(driverCalls).toEqual([A.ID]);
    expect(second.servedBy.accountId).toBe(A.ID);
  });

  // Contract, not a driver of the code: the memo is filled only when a read succeeds, so reads that
  // overlap the first one have nothing to consult. This pins what the warning text now says.
  it('reports the failed attempt on every read that overlaps the first, since nothing is remembered yet', async () => {
    const { storage } = fallbackServed();
    const [one, two] = await Promise.all([
      readStoredObject(storage, SYSTEM, REF, pins(B.ID)),
      readStoredObject(storage, SYSTEM, REF, pins(B.ID)),
    ]);
    expect(one.failedAttempts).toHaveLength(1);
    expect(two.failedAttempts).toHaveLength(1);
  });

  it('reports no failed attempts on the second read, so callers warn once per object, not per request', async () => {
    const { storage } = fallbackServed();
    const first = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    const second = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(first.failedAttempts).toHaveLength(1);
    expect(second.failedAttempts).toEqual([]);
  });

  it('remembers per provider case-insensitively, since SQL Server returns ids upper-case and callers may not', async () => {
    const { storage, driverCalls } = fallbackServed();
    const caseBlind: StorageReadEngine = {
      ...storage,
      GetAccountsByProviderID: (pid) => storage.GetAccountsByProviderID(pid.toUpperCase()),
    };
    await readStoredObject(caseBlind, SYSTEM, { providerId: 'P1', providerKey: KEY }, pins(B.ID));
    driverCalls.length = 0;
    await readStoredObject(caseBlind, SYSTEM, { providerId: 'p1', providerKey: KEY }, pins(B.ID));
    expect(driverCalls).toEqual([A.ID]);
  });

  it('forgets a remembered account that later fails, and the normal order resumes', async () => {
    const stored: Record<string, Record<string, Buffer>> = { [A.ID]: { [KEY]: BYTES } };
    const { storage, driverCalls } = multiAccountEngine([A, B], stored);
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    delete stored[A.ID];

    driverCalls.length = 0;
    await expect(readStoredObject(storage, SYSTEM, REF, pins(B.ID))).rejects.toBeInstanceOf(StoredObjectReadError);
    expect(driverCalls).toEqual([A.ID, B.ID]);

    driverCalls.length = 0;
    await expect(readStoredObject(storage, SYSTEM, REF, pins(B.ID))).rejects.toBeInstanceOf(StoredObjectReadError);
    expect(driverCalls).toEqual([B.ID, A.ID]);
  });

  it('never resurrects a remembered account the engine no longer has', async () => {
    const accounts = [A, B];
    const { storage, driverCalls } = multiAccountEngine(accounts, {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: { [KEY]: BYTES },
    });
    // No pin: A (engine order) serves and is remembered.
    await readStoredObject(storage, SYSTEM, REF, pins());
    accounts.splice(0, 1);
    driverCalls.length = 0;
    const read = await readStoredObject(storage, SYSTEM, REF, pins());
    expect(driverCalls).toEqual([B.ID]);
    expect(read.servedBy.accountId).toBe(B.ID);
  });

  it(`evicts the oldest object once more than MAX_REMEMBERED_READS (${MAX_REMEMBERED_READS}) are remembered`, async () => {
    const fillers = Array.from({ length: MAX_REMEMBERED_READS }, (_, i) => `forms-assets/filler/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/${i}.png`);
    const { storage, driverCalls } = multiAccountEngine([A, B], {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: Object.fromEntries(fillers.map((key) => [key, BYTES])),
    });
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    for (const key of fillers) await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: key }, pins(B.ID));

    driverCalls.length = 0;
    const read = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(driverCalls).toEqual([B.ID, A.ID]);
    expect(read.failedAttempts).toHaveLength(1);
  });

  it('keeps a recently re-read object when the cap evicts, because a hit makes it the newest entry', async () => {
    const fillers = Array.from({ length: MAX_REMEMBERED_READS }, (_, i) => `forms-assets/filler/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/${i}.png`);
    const { storage, driverCalls } = multiAccountEngine([A, B], {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: Object.fromEntries(fillers.map((key) => [key, BYTES])),
    });
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    for (const key of fillers.slice(0, -1)) {
      await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: key }, pins(B.ID));
    }
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID)); // hit: now the newest
    await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: fillers[fillers.length - 1] }, pins(B.ID));

    driverCalls.length = 0;
    await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(driverCalls).toEqual([A.ID]);
  });
});

describe('describeReadFallback', () => {
  const served = { accountId: A.ID, accountName: 'Account A', providerId: 'P1', providerName: 'Provider P1' };
  const tried = { accountId: B.ID, accountName: 'Account B', providerId: 'P1', providerName: 'Provider P1' };
  const fallback: StoredObjectRead = {
    content: BYTES,
    servedBy: served,
    failedAttempts: [{ account: tried, error: `ENOENT ${KEY}` }],
    rememberedAccountFailed: false,
  };
  const PINS: ReadPin[] = [
    { envVar: 'FORMS_UPLOAD_STORAGE_ACCOUNT', value: B.ID },
    { envVar: 'FORMS_DOWNLOAD_STORAGE_ACCOUNT', value: undefined },
  ];

  it('says nothing when the first account served the object', () => {
    expect(describeReadFallback('Download', 'file-1', KEY, { ...fallback, failedAttempts: [] }, PINS)).toBeUndefined();
  });

  it('names the object, the account holding it, and each account tried first with its error', () => {
    const message = describeReadFallback('Download', 'file-1', KEY, fallback, PINS) ?? '';
    expect(message.startsWith(`[Forms] Download file-1 (key ${KEY}) is held by `)).toBe(true);
    expect(message).toContain(`account "Account A" (${A.ID}) on provider "Provider P1" (P1)`);
    expect(message).toContain(`account "Account B" (${B.ID}) on provider "Provider P1" (P1): ENOENT ${KEY}`);
  });

  it('names both causes rather than assuming the pin is wrong', () => {
    const message = describeReadFallback('Download', 'file-1', KEY, fallback, PINS) ?? '';
    expect(message).toContain('written under a different pin or by another host sharing this database');
    expect(message).toContain('the earlier account is failing');
    expect(message).not.toMatch(/\bPin FORMS_/);
  });

  it('names the pins that order this route\'s reads, in order, as context', () => {
    const message = describeReadFallback('Download', 'file-1', KEY, fallback, PINS) ?? '';
    expect(message).toContain(
      'ordered by the account that last served this object (if any), then FORMS_UPLOAD_STORAGE_ACCOUNT, ' +
        "then FORMS_DOWNLOAD_STORAGE_ACCOUNT, then the provider's other accounts.",
    );
  });

  it('blames the remembered account, not a pin, when the account that last served the object fails first', async () => {
    const stored: Record<string, Record<string, Buffer>> = { [A.ID]: { [KEY]: BYTES } };
    const { storage } = multiAccountEngine([A, B], stored);
    const first = await readStoredObject(storage, SYSTEM, REF, pins(B.ID)); // B fails, A serves and is remembered
    expect(first.rememberedAccountFailed).toBe(false);
    stored[B.ID] = stored[A.ID];
    delete stored[A.ID]; // the object moved: A, tried first now, fails
    const read = await readStoredObject(storage, SYSTEM, REF, pins(B.ID));
    expect(read.rememberedAccountFailed).toBe(true);
    const message = describeReadFallback('Download', 'file-1', KEY, read, PINS) ?? '';
    expect(message).toContain(
      'The account that last served this object in this process failed this time (its error is shown first): ' +
        'that account is failing or the object has moved.',
    );
    expect(message).not.toContain('Usually it was written under a different pin');
  });

  it('says it is logged once per object after the first read, and that overlapping first reads each log it', () => {
    expect(describeReadFallback('Asset', 'file-1', KEY, fallback, [{ envVar: 'FORMS_ASSET_STORAGE_ACCOUNT', value: B.ID }])).toContain(
      'Logged once per object once this process has read it; requests that overlap that first read each log it.',
    );
  });
});

describe('readStoredObject: a File Storage metadata load that failed (#290)', () => {
  /**
   * MJ 6.1.4's FileStorageEngine marks itself configured even when its metadata load failed (the
   * base engine logs and swallows the error), so Config(false) never retries; only `Loaded` tells.
   * `loadsOnForcedRefresh` says whether a Config(true) recovers it.
   */
  function unloadedEngine(loadsOnForcedRefresh: boolean) {
    const state = { loaded: false };
    const { storage, driverCalls } = multiAccountEngine([A], { [A.ID]: { [KEY]: BYTES } });
    const Config = vi.fn(async (forceRefresh?: boolean) => {
      if (forceRefresh && loadsOnForcedRefresh) state.loaded = true;
    });
    const unloaded: StorageReadEngine = {
      ...storage,
      Config,
      get Loaded() {
        return state.loaded;
      },
    };
    return { storage: unloaded, Config, driverCalls };
  }

  it('forces ONE metadata reload when the engine reports it is not loaded, then reads', async () => {
    const { storage, Config, driverCalls } = unloadedEngine(true);
    const read = await readStoredObject(storage, SYSTEM, REF, pins());
    expect(read.content.equals(BYTES)).toBe(true);
    expect(Config.mock.calls.filter(([force]) => force === true)).toHaveLength(1);
    expect(Config).toHaveBeenCalledWith(true, SYSTEM);
    expect(driverCalls).toEqual([A.ID]);
  });

  it('rejects with StorageMetadataNotLoadedError, never "no account resolves", when the reload fails too', async () => {
    const { storage, Config, driverCalls } = unloadedEngine(false);
    const attempt = readStoredObject(storage, SYSTEM, REF, pins());
    await expect(attempt).rejects.toBeInstanceOf(StorageMetadataNotLoadedError);
    await expect(attempt).rejects.toThrow(
      'File Storage metadata did not load on this host; see the engine error logged earlier. ' +
        'Reads cannot resolve a storage account until it does.',
    );
    expect(Config.mock.calls.filter(([force]) => force === true)).toHaveLength(1);
    expect(driverCalls).toEqual([]);
  });

  it('does not force a reload when the metadata is loaded', async () => {
    const { storage } = multiAccountEngine([A], { [A.ID]: { [KEY]: BYTES } });
    await readStoredObject(storage, SYSTEM, REF, pins());
    expect(storage.Config).toHaveBeenCalledTimes(1);
    expect(storage.Config).toHaveBeenCalledWith(false, SYSTEM);
  });
});

describe('redactStorageKey', () => {
  const PRIVATE = 'forms-uploads/abc/Jane_Doe_Resume.pdf';

  it('replaces every occurrence of the full key', () => {
    expect(redactStorageKey(`open '/r/${PRIVATE}' then ${PRIVATE}`, PRIVATE)).toBe(
      "open '/r/<storage key>' then <storage key>",
    );
  });

  it('replaces the bare filename when a driver reports only the basename', () => {
    expect(redactStorageKey('No such object: Jane_Doe_Resume.pdf', PRIVATE)).toBe('No such object: <storage key>');
  });

  it('leaves unrelated text alone', () => {
    expect(redactStorageKey('token refresh refused', PRIVATE)).toBe('token refresh refused');
  });

  it('treats the key as a literal, not a pattern', () => {
    expect(redactStorageKey('a.b and axb', 'a.b')).toBe('<storage key> and axb');
  });

  it('returns the text unchanged when the key is empty', () => {
    expect(redactStorageKey('anything at all', '')).toBe('anything at all');
  });

  it('does not redact an empty final segment of a key ending in a slash', () => {
    expect(redactStorageKey('dir/ listing', 'dir/')).toBe('<storage key> listing');
  });

  // A respondent may upload a file named `e` or `a`, and MJ stores a dot-only name as `file`, so
  // the basename can be a fragment of ordinary words. Redacting it inside those words destroyed the
  // account names, "provider" and the driver's error in the very line that diagnoses the read.
  const LINE =
    'Download read failed: account "Account B" on provider "Local Disk": ENOENT: no such file or directory';

  it.each(['e', 'a'])('leaves words containing a short basename %j intact', (name) => {
    expect(redactStorageKey(LINE, `forms-uploads/2026-10-06/u1/${name}`)).toBe(LINE);
  });

  it('redacts a basename that is itself a word only where it stands alone, keeping the accounts', () => {
    // A standalone "file" cannot be told apart from a driver naming the object, so it goes.
    expect(redactStorageKey(LINE, 'forms-uploads/2026-10-06/u1/file')).toBe(
      'Download read failed: account "Account B" on provider "Local Disk": ENOENT: no such <storage key> or directory',
    );
  });

  it('still redacts a short basename where it stands as its own name', () => {
    expect(redactStorageKey("open '/r/x/e' failed; object e missing", 'forms-uploads/d/u1/e')).toBe(
      "open '/r/x/<storage key>' failed; object <storage key> missing",
    );
  });

  it('never rewrites the placeholder it has just inserted', () => {
    expect(redactStorageKey("open '/r/forms-uploads/d/u1/e'", 'forms-uploads/d/u1/e')).toBe("open '/r/<storage key>'");
  });
});

describe('describeReadFallback without a key', () => {
  it('has no key clause and leaves the attempt text alone', () => {
    const acct = { accountId: A.ID, accountName: 'Account A', providerId: 'P1', providerName: 'Provider P1' };
    const read: StoredObjectRead = {
      content: BYTES,
      servedBy: acct,
      failedAttempts: [{ account: acct, error: 'boom' }],
      rememberedAccountFailed: false,
    };
    const message = describeReadFallback('Download', 'file-1', undefined, read, []) ?? '';
    expect(message).not.toContain('(key');
    expect(message).toContain('Download file-1 is held by');
    expect(message).toContain(': boom');
  });
});

describe('isUniqueStorageKey', () => {
  it('is true when the name sits under a per-upload UUID directory, as Forms writes since v0.11.0', () => {
    expect(isUniqueStorageKey('forms-uploads/2026-10-06/3f2b9c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/resume.pdf')).toBe(true);
    expect(isUniqueStorageKey(KEY)).toBe(true);
  });

  it('is false for a pre-v0.11.0 respondent key, which is only a date and a file name', () => {
    expect(isUniqueStorageKey('forms-uploads/2026-08-01/signature.png')).toBe(false);
    expect(isUniqueStorageKey('signature.png')).toBe(false);
  });

  it('is false when the only UUID belongs to a configured prefix, not to the upload', () => {
    // FORMS_UPLOAD_PATH_PREFIX may name a tenant or bucket id; before v0.11.0 the name followed it directly.
    expect(isUniqueStorageKey('tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/uploads/signature.png')).toBe(false);
  });

  it('is false for a name directly under the configured prefix, even when that prefix ends in a UUID', () => {
    // Before v0.11.0 a configured FORMS_UPLOAD_PATH_PREFIX got the name appended directly.
    expect(isUniqueStorageKey('tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/signature.png', 'tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c')).toBe(false);
    expect(isUniqueStorageKey('tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/signature.png', '/tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/')).toBe(false);
  });

  it('is true for a per-upload UUID directory under the configured prefix', () => {
    expect(isUniqueStorageKey('tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/3f2b9c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/signature.png', 'tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c')).toBe(true);
  });
});

describe('readStoredObject: a key that may not be unique across accounts (#290)', () => {
  // Respondent uploads before v0.11.0 were stored at forms-uploads/<date>/<name>, so two accounts
  // can each hold a DIFFERENT respondent's object at the same key. Bytes found under the key on some
  // account prove nothing about whose file they are, so such a key is read exactly as before #290.
  const LEGACY = 'forms-uploads/2026-08-01/signature.png';
  const LEGACY_REF = { providerId: 'P1', providerKey: LEGACY };
  const MINE = Buffer.from('MINE');
  const THEIRS = Buffer.from('SOMEONE ELSE');

  it('reads only the provider\'s first account, whatever the pins say', async () => {
    const { storage, driverCalls } = multiAccountEngine([B, A], { [B.ID]: { [LEGACY]: MINE }, [A.ID]: { [LEGACY]: THEIRS } });
    const read = await readStoredObject(storage, SYSTEM, LEGACY_REF, pins(A.ID));
    expect(driverCalls).toEqual([B.ID]);
    expect(read.content).toBe(MINE);
  });

  it('reads a key directly under the configured prefix through the first account only', async () => {
    const key = 'tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c/signature.png';
    const { storage, driverCalls } = multiAccountEngine([B, A], { [B.ID]: { [key]: MINE }, [A.ID]: { [key]: THEIRS } });
    const read = await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: key, uploadPathPrefix: 'tenants/0b7e2c1a-9d4f-4e8b-a1c2-3d4e5f6a7b8c' }, pins(A.ID));
    expect(driverCalls).toEqual([B.ID]);
    expect(read.content).toBe(MINE);
  });

  it('never falls through to another account that holds an object at the same key', async () => {
    const { storage, driverCalls } = multiAccountEngine([B, A], { [A.ID]: { [LEGACY]: THEIRS } }, { throwOnDriver: [B.ID] });
    const error = (await readStoredObject(storage, SYSTEM, LEGACY_REF, pins()).catch((e: unknown) => e)) as StoredObjectReadError;
    expect(error).toBeInstanceOf(StoredObjectReadError);
    expect(driverCalls).toEqual([B.ID]);
  });

  it('when the provider has no account, reads through the pin the route used before #290, not the first that resolves', async () => {
    const upload: AccountRow = { ID: 'EEEEEEEE-0000-4000-8000-000000000005', Name: 'Upload', ProviderID: 'P8' };
    const moved: AccountRow = { ID: 'DDDDDDDD-0000-4000-8000-000000000004', Name: 'Moved', ProviderID: 'P9' };
    const { storage, driverCalls } = multiAccountEngine([upload, moved], { [moved.ID]: { [LEGACY]: MINE } }, { resolve: (id) => id ?? null });
    const legacyPins: ReadPin[] = [
      { envVar: 'FORMS_UPLOAD_STORAGE_ACCOUNT', value: upload.ID },
      { envVar: 'FORMS_DOWNLOAD_STORAGE_ACCOUNT', value: moved.ID, legacyFallback: true },
    ];
    const read = await readStoredObject(storage, SYSTEM, LEGACY_REF, legacyPins);
    expect(driverCalls).toEqual([moved.ID]);
    expect(read.content).toBe(MINE);
  });
});

describe('readStoredObject: a unique key whose provider has no account (#290)', () => {
  it('tries every pin that resolves, in order, so a later pin still serves the file', async () => {
    const upload: AccountRow = { ID: 'EEEEEEEE-0000-4000-8000-000000000005', Name: 'Upload', ProviderID: 'P8' };
    const moved: AccountRow = { ID: 'DDDDDDDD-0000-4000-8000-000000000004', Name: 'Moved', ProviderID: 'P9' };
    const { storage, driverCalls } = multiAccountEngine([upload, moved], { [moved.ID]: { [KEY]: BYTES } }, { resolve: (id) => id ?? null });
    const read = await readStoredObject(storage, SYSTEM, REF, pins(upload.ID, moved.ID));
    expect(driverCalls).toEqual([upload.ID, moved.ID]);
    expect(read.servedBy.accountId).toBe(moved.ID);
  });
});
