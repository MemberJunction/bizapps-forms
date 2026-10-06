import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  MAX_READ_ACCOUNTS,
  MAX_REMEMBERED_READS,
  NoStorageAccountError,
  StoredObjectReadError,
  describeReadFallback,
  readStoredObject,
  resetRememberedReadsForTests,
  type StorageReadEngine,
  type StoredObjectRead,
} from '../read-object.js';

// The serving-account memo is process-wide; without this, one test's read reorders the next's.
beforeEach(() => resetRememberedReadsForTests());

const SYSTEM = {} as UserInfo;
const KEY = 'forms-assets/form-1/uuid/logo.png';
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
    const bytes = await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY }, []);
    expect(bytes.content.equals(BYTES)).toBe(true);
  });

  it('passes ProviderKey as fullPath and never as objectId', async () => {
    // ProviderKey is the storage PATH UploadFile wrote; objectId means the provider's own id.
    const driver = idKeyedDriver();
    await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY }, []);
    expect(driver.GetObject).toHaveBeenCalledWith({ fullPath: KEY });
  });
});

describe('readStoredObject: probing the provider accounts (#290)', () => {
  it('tries the pinned account first even when it is second in engine order', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], { [B.ID]: { [KEY]: BYTES } });
    const read = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
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
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    expect(driverCalls).toEqual([B.ID, A.ID]);
  });

  it('returns bytes held only by the non-pinned account and reports the pinned failure', async () => {
    const { storage } = multiAccountEngine([A, B], { [A.ID]: { [KEY]: BYTES } });
    const read = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    expect(read.servedBy.accountId).toBe(A.ID);
    expect(read.failedAttempts).toHaveLength(1);
    expect(read.failedAttempts[0].account.accountId).toBe(B.ID);
    expect(read.failedAttempts[0].error).toBe(`ENOENT ${KEY}`);
  });

  it('rejects with every attempt, in order, when no account holds the bytes', async () => {
    const { storage } = multiAccountEngine([A, B], {});
    const error = await readStoredObject(storage, SYSTEM, REF, [B.ID]).catch((e: unknown) => e);
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
    await readStoredObject(storage, SYSTEM, REF, [B.ID.toLowerCase()]);
    expect(driverCalls).toEqual([B.ID]);
  });

  it('ignores a pin that names an account on a different provider', async () => {
    const other: AccountRow = { ID: 'CCCCCCCC-0000-4000-8000-000000000003', Name: 'Other', ProviderID: 'P2' };
    const { storage, driverCalls } = multiAccountEngine([A, B, other], { [A.ID]: { [KEY]: BYTES } });
    await readStoredObject(storage, SYSTEM, REF, [other.ID]);
    expect(driverCalls).toEqual([A.ID]);
  });

  it('tries an account that is both pinned and on the provider exactly once', async () => {
    const { storage, driverCalls } = multiAccountEngine([A, B], {});
    await expect(readStoredObject(storage, SYSTEM, REF, [A.ID, A.ID.toLowerCase()])).rejects.toBeInstanceOf(
      StoredObjectReadError,
    );
    expect(driverCalls).toEqual([A.ID, B.ID]);
  });

  it('counts a GetDriver failure as an attempt and tries the next account', async () => {
    const { storage } = multiAccountEngine([A, B], { [B.ID]: { [KEY]: BYTES } }, { throwOnDriver: [A.ID] });
    const read = await readStoredObject(storage, SYSTEM, REF, [A.ID]);
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
    const error = (await readStoredObject(storage, SYSTEM, REF, []).catch((e: unknown) => e)) as StoredObjectReadError;
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
    const read = await readStoredObject(storage, SYSTEM, REF, [undefined, orphan.ID]);
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
    const read = await readStoredObject(storage, SYSTEM, REF, ['GONE', orphan.ID]);
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
    await readStoredObject(storage, SYSTEM, REF, []);
    expect(resolveCalls).toEqual([undefined]);
    expect(driverCalls).toEqual([orphan.ID]);
  });

  it('rejects with NoStorageAccountError when nothing resolves', async () => {
    const { storage } = multiAccountEngine([], {});
    await expect(readStoredObject(storage, SYSTEM, REF, ['x'])).rejects.toBeInstanceOf(NoStorageAccountError);
  });
});

describe('readStoredObject: remembering the account that served an object (#290)', () => {
  /** Pin B; the bytes live only in A — the cross-host shape the live smoke reproduced. */
  function fallbackServed() {
    return multiAccountEngine([A, B], { [A.ID]: { [KEY]: BYTES } });
  }

  it('reads a fallback-served object a second time with ONE GetDriver call, through the serving account', async () => {
    const { storage, driverCalls } = fallbackServed();
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    driverCalls.length = 0;
    const second = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    expect(driverCalls).toEqual([A.ID]);
    expect(second.servedBy.accountId).toBe(A.ID);
  });

  it('reports no failed attempts on the second read, so callers warn once per object, not per request', async () => {
    const { storage } = fallbackServed();
    const first = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    const second = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    expect(first.failedAttempts).toHaveLength(1);
    expect(second.failedAttempts).toEqual([]);
  });

  it('remembers per provider case-insensitively, since SQL Server returns ids upper-case and callers may not', async () => {
    const { storage, driverCalls } = fallbackServed();
    const caseBlind: StorageReadEngine = {
      ...storage,
      GetAccountsByProviderID: (pid) => storage.GetAccountsByProviderID(pid.toUpperCase()),
    };
    await readStoredObject(caseBlind, SYSTEM, { providerId: 'P1', providerKey: KEY }, [B.ID]);
    driverCalls.length = 0;
    await readStoredObject(caseBlind, SYSTEM, { providerId: 'p1', providerKey: KEY }, [B.ID]);
    expect(driverCalls).toEqual([A.ID]);
  });

  it('forgets a remembered account that later fails, and the normal order resumes', async () => {
    const stored: Record<string, Record<string, Buffer>> = { [A.ID]: { [KEY]: BYTES } };
    const { storage, driverCalls } = multiAccountEngine([A, B], stored);
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    delete stored[A.ID];

    driverCalls.length = 0;
    await expect(readStoredObject(storage, SYSTEM, REF, [B.ID])).rejects.toBeInstanceOf(StoredObjectReadError);
    expect(driverCalls).toEqual([A.ID, B.ID]);

    driverCalls.length = 0;
    await expect(readStoredObject(storage, SYSTEM, REF, [B.ID])).rejects.toBeInstanceOf(StoredObjectReadError);
    expect(driverCalls).toEqual([B.ID, A.ID]);
  });

  it('never resurrects a remembered account the engine no longer has', async () => {
    const accounts = [A, B];
    const { storage, driverCalls } = multiAccountEngine(accounts, {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: { [KEY]: BYTES },
    });
    // No pin: A (engine order) serves and is remembered.
    await readStoredObject(storage, SYSTEM, REF, []);
    accounts.splice(0, 1);
    driverCalls.length = 0;
    const read = await readStoredObject(storage, SYSTEM, REF, []);
    expect(driverCalls).toEqual([B.ID]);
    expect(read.servedBy.accountId).toBe(B.ID);
  });

  it(`evicts the oldest object once more than MAX_REMEMBERED_READS (${MAX_REMEMBERED_READS}) are remembered`, async () => {
    const fillers = Array.from({ length: MAX_REMEMBERED_READS }, (_, i) => `forms-assets/filler/${i}.png`);
    const { storage, driverCalls } = multiAccountEngine([A, B], {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: Object.fromEntries(fillers.map((key) => [key, BYTES])),
    });
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    for (const key of fillers) await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: key }, [B.ID]);

    driverCalls.length = 0;
    const read = await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    expect(driverCalls).toEqual([B.ID, A.ID]);
    expect(read.failedAttempts).toHaveLength(1);
  });

  it('keeps a recently re-read object when the cap evicts, because a hit makes it the newest entry', async () => {
    const fillers = Array.from({ length: MAX_REMEMBERED_READS }, (_, i) => `forms-assets/filler/${i}.png`);
    const { storage, driverCalls } = multiAccountEngine([A, B], {
      [A.ID]: { [KEY]: BYTES },
      [B.ID]: Object.fromEntries(fillers.map((key) => [key, BYTES])),
    });
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
    for (const key of fillers.slice(0, -1)) {
      await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: key }, [B.ID]);
    }
    await readStoredObject(storage, SYSTEM, REF, [B.ID]); // hit: now the newest
    await readStoredObject(storage, SYSTEM, { providerId: 'P1', providerKey: fillers[fillers.length - 1] }, [B.ID]);

    driverCalls.length = 0;
    await readStoredObject(storage, SYSTEM, REF, [B.ID]);
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
  };
  const PINS = ['FORMS_UPLOAD_STORAGE_ACCOUNT', 'FORMS_DOWNLOAD_STORAGE_ACCOUNT'];

  it('says nothing when the first account served the object', () => {
    expect(describeReadFallback('Download', 'file-1', KEY, { ...fallback, failedAttempts: [] }, PINS)).toBeUndefined();
  });

  it('names the object, the account holding it, and each account tried first with its error', () => {
    const message = describeReadFallback('Download', 'file-1', KEY, fallback, PINS) ?? '';
    expect(message).toMatch(/^\[Forms\] Download file-1 \(key forms-assets\/form-1\/uuid\/logo\.png\) is held by /);
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
    expect(message).toContain('ordered by FORMS_UPLOAD_STORAGE_ACCOUNT, then FORMS_DOWNLOAD_STORAGE_ACCOUNT, then');
  });

  it('says it is logged once per object, which the serving-account memo makes true', () => {
    expect(describeReadFallback('Asset', 'file-1', KEY, fallback, ['FORMS_ASSET_STORAGE_ACCOUNT'])).toContain(
      'Logged once per object while this process remembers where it lives.',
    );
  });
});
