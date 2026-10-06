/**
 * Boot wiring for the storage-pin check. MJAPI also serves other apps, so the one property that
 * matters most is that ConfigureExpressApp can never throw out of boot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ errors: [] as string[], warnings: [] as string[] }));
const engine = vi.hoisted(() => ({
  Config: vi.fn(),
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
import { AssetMiddleware } from '../AssetMiddleware';
import { resetAssetConfigForTests } from '../config';
import { resetUploadConfigForTests } from '../../upload/config';
import { resetDownloadConfigCache } from '../../download/config';

const app = {} as Application;
const acct = (id: string, active = true) => ({ account: { ID: id, Name: `n-${id}` }, provider: { Name: 'P', IsActive: active } });

describe('AssetMiddleware.ConfigureExpressApp', () => {
  beforeEach(() => {
    logged.errors.length = 0;
    logged.warnings.length = 0;
    engine.Config.mockReset().mockResolvedValue(undefined);
    engine.AccountsWithProviders = [];
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
    await expect(new AssetMiddleware().ConfigureExpressApp(app)).resolves.toBeUndefined();
    expect(logged.errors.join('\n')).toContain('[Forms] Could not check storage-account pins at boot: db down');
  });

  it('logs and returns when there is no system user', async () => {
    systemUser.value = undefined;
    await new AssetMiddleware().ConfigureExpressApp(app);
    expect(engine.Config).not.toHaveBeenCalled();
    expect(logged.errors).toHaveLength(1);
  });

  it('warns when several active accounts exist and no write pin is set, ignoring inactive providers', async () => {
    engine.AccountsWithProviders = [acct('A'), acct('B'), acct('C', false)];
    await new AssetMiddleware().ConfigureExpressApp(app);
    expect(logged.warnings).toHaveLength(1);
    expect(logged.warnings[0]).toMatch(/^\[Forms\] Storage: /);
    expect(logged.warnings[0]).not.toContain('n-C');
  });

  it('errors when a pin names no active account', async () => {
    engine.AccountsWithProviders = [acct('A')];
    process.env.FORMS_UPLOAD_STORAGE_ACCOUNT = 'ZZZ';
    await new AssetMiddleware().ConfigureExpressApp(app);
    expect(logged.errors[0]).toMatch(/^\[Forms\] Storage is NOT ready: FORMS_UPLOAD_STORAGE_ACCOUNT is set to ZZZ/);
  });
});
