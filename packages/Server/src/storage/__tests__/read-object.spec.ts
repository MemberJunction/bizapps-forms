import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { readStoredObject, type StorageReadEngine } from '../read-object.js';

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
    GetAccountsByProviderID: () => [{ ID: 'box-account' }],
    ResolveStorageAccount: () => null,
    GetDriver: vi.fn(async () => driver),
  };
}

describe('readStoredObject — provider-agnostic reads (#261)', () => {
  it('reads a path-keyed file back on an ID-keyed provider such as Box', async () => {
    const driver = idKeyedDriver();
    const bytes = await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY });
    expect(bytes.equals(BYTES)).toBe(true);
  });

  it('passes ProviderKey as fullPath and never as objectId', async () => {
    // ProviderKey is the storage PATH UploadFile wrote; objectId means the provider's own id.
    const driver = idKeyedDriver();
    await readStoredObject(engine(driver), SYSTEM, { providerId: 'box', providerKey: KEY });
    expect(driver.GetObject).toHaveBeenCalledWith({ fullPath: KEY });
  });
});
