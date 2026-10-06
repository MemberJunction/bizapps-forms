import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  MAX_READ_ACCOUNTS,
  NoStorageAccountError,
  StoredObjectReadError,
  readStoredObject,
  type StorageReadEngine,
} from '../read-object.js';

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
    await readStoredObject(storage, SYSTEM, REF, [A.ID, A.ID.toLowerCase()]).catch(() => undefined);
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
