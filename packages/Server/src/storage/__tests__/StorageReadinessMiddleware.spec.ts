/**
 * Boot wiring for the storage-pin check. MJAPI also serves other apps, so the one property that
 * matters most is that ConfigureExpressApp can never throw out of boot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ errors: [] as string[], warnings: [] as string[] }));
const engine = vi.hoisted(() => ({
  Config: vi.fn(),
  Loaded: true,
  AccountsWithProviders: [] as Array<{ account: { ID: string; Name: string }; provider: { Name: string; IsActive: boolean } }>,
}));
const systemUser = vi.hoisted(() => ({ value: { ID: 'sys' } as { ID: string } | undefined }));

vi.mock('@memberjunction/server', () => ({
  BaseServerMiddleware: class {},
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/core')>()),
  LogStatus: () => undefined,
  LogError: (m: string) => void logged.errors.push(m),
  LogErrorEx: (o: { message: string }) => void logged.warnings.push(o.message),
}));
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => systemUser.value } },
}));
vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: {} } }));
vi.mock('@memberjunction/core-entities', () => ({ FileStorageEngineBase: { Instance: engine } }));

import type { Application } from 'express';
import { StorageReadinessMiddleware } from '../StorageReadinessMiddleware';
import { resetAssetConfigForTests } from '../../asset/config';
import { resetUploadConfigForTests } from '../../upload/config';
import { resetDownloadConfigCache } from '../../download/config';

const app = {} as Application;
const acct = (id: string, active = true) => ({ account: { ID: id, Name: `n-${id}` }, provider: { Name: 'P', IsActive: active } });

describe('StorageReadinessMiddleware.ConfigureExpressApp', () => {
  beforeEach(() => {
    logged.errors.length = 0;
    logged.warnings.length = 0;
    engine.Config.mockReset().mockResolvedValue(undefined);
    engine.AccountsWithProviders = [];
    engine.Loaded = true;
    systemUser.value = { ID: 'sys' };
    delete process.env.FORMS_ASSET_STORAGE_ACCOUNT;
    delete process.env.FORMS_UPLOAD_STORAGE_ACCOUNT;
    delete process.env.FORMS_DOWNLOAD_STORAGE_ACCOUNT;
    resetAssetConfigForTests();
    resetUploadConfigForTests();
    resetDownloadConfigCache();
  });

  it('does not throw and logs context when the engine Config rejects', async () => {
    engine.Config.mockRejectedValue(new Error('db down'));
    await expect(new StorageReadinessMiddleware().ConfigureExpressApp(app)).resolves.toBeUndefined();
    expect(logged.errors.join('\n')).toContain('[Forms] Could not check storage-account pins at boot: db down');
  });

  it('logs and returns when there is no system user', async () => {
    systemUser.value = undefined;
    await new StorageReadinessMiddleware().ConfigureExpressApp(app);
    expect(engine.Config).not.toHaveBeenCalled();
    expect(logged.errors).toEqual([
      '[Forms] Could not check storage-account pins at boot: the user cache has no system user.',
    ]);
  });

  it('warns when several active accounts exist and no write pin is set, ignoring inactive providers', async () => {
    engine.AccountsWithProviders = [acct('A'), acct('B'), acct('C', false)];
    await new StorageReadinessMiddleware().ConfigureExpressApp(app);
    expect(logged.warnings).toHaveLength(1);
    expect(logged.warnings[0]).toMatch(/^\[Forms\] Storage: /);
    expect(logged.warnings[0]).not.toContain('n-C');
  });

  it('passes accounts on an inactive provider through, so a pin naming one gets its own error', async () => {
    engine.AccountsWithProviders = [acct('A'), acct('C', false)];
    process.env.FORMS_UPLOAD_STORAGE_ACCOUNT = 'C';
    await new StorageReadinessMiddleware().ConfigureExpressApp(app);
    expect(logged.errors).toHaveLength(1);
    expect(logged.errors[0]).toMatch(/^\[Forms\] Storage is NOT ready: FORMS_UPLOAD_STORAGE_ACCOUNT is set to C, /);
    expect(logged.errors[0]).toContain('which names "n-C" on provider "P", which is inactive');
  });

  it('errors when a pin names no active account', async () => {
    engine.AccountsWithProviders = [acct('A')];
    process.env.FORMS_UPLOAD_STORAGE_ACCOUNT = 'ZZZ';
    await new StorageReadinessMiddleware().ConfigureExpressApp(app);
    expect(logged.errors[0]).toMatch(/^\[Forms\] Storage is NOT ready: FORMS_UPLOAD_STORAGE_ACCOUNT is set to ZZZ/);
  });

  it('does not claim a pin is unknown when the metadata failed to load (Config resolves anyway)', async () => {
    engine.Loaded = false;
    process.env.FORMS_UPLOAD_STORAGE_ACCOUNT = 'ZZZ';
    await new StorageReadinessMiddleware().ConfigureExpressApp(app);
    expect(logged.errors).toEqual([
      '[Forms] Could not check storage-account pins at boot: File Storage metadata did not load (see the engine error above).',
    ]);
  });

  it('is always enabled and contributes no route middleware', async () => {
    const mw = new StorageReadinessMiddleware();
    expect(mw.Label).toBe('mj:formsStorageReadiness');
    expect(mw.Enabled).toBe(true);
    // Any route registration (app.use / app.get / ...) reads a property of the app; this one throws.
    const untouchable = new Proxy({} as Application, {
      get(_target, property) {
        throw new Error(`ConfigureExpressApp touched app.${String(property)}`);
      },
    });
    await expect(mw.ConfigureExpressApp(untouchable)).resolves.toBeUndefined();
    expect(logged.errors).toEqual([]);
  });
});
