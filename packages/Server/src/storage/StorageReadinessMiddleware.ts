/**
 * Boot-time check of the `FORMS_*_STORAGE_ACCOUNT` pins (#290). Registers no route.
 *
 * ── Why this is its own middleware and not part of `AssetMiddleware` ────────────────────────────
 * MJServer calls `ConfigureExpressApp` only for ENABLED middleware, and `AssetMiddleware` is
 * disabled by `FORMS_ASSET_ENABLED=false`. A host that turns assets off still uploads and
 * downloads respondent files through the same storage accounts, so the check must not hang off
 * the asset switch.
 */
import type { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogErrorEx } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { FileStorageEngineBase } from '@memberjunction/core-entities';

import { getAssetConfig } from '../asset/config.js';
import { getUploadConfig } from '../upload/config.js';
import { getDownloadConfig } from '../download/config.js';
import { assessStoragePins } from './storage-readiness.js';

@RegisterClass(BaseServerMiddleware, 'mj:formsStorageReadiness')
export class StorageReadinessMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsStorageReadiness';
  }

  public override get Enabled(): boolean {
    return true;
  }

  /**
   * Same reasoning as `RespondentHostMiddleware.reportReadiness`: a wrong or missing pin is silent
   * until a respondent or author pays for it, far from the env var that caused it.
   */
  public override async ConfigureExpressApp(_app: Application): Promise<void> {
    await this.reportStoragePins();
  }

  /**
   * Reads only the engine's METADATA (`FileStorageEngineBase`), never `FileStorageEngine.Config`,
   * which would initialise every driver and refresh Box tokens at boot. Must never throw out of
   * boot — MJAPI also serves other apps — so any failure is logged with what was being checked.
   */
  private async reportStoragePins(): Promise<void> {
    try {
      const systemUser = UserCache.Instance.GetSystemUser();
      if (!systemUser) {
        LogError('[Forms] Could not check storage-account pins at boot: the user cache has no system user.');
        return;
      }
      const engine = FileStorageEngineBase.Instance;
      await engine.Config(false, systemUser);
      // BaseEngine.Load logs and swallows a failed metadata load, so Config resolves with no
      // accounts. Judging pins against that would report every pin as unknown.
      if (!engine.Loaded) {
        LogError(
          '[Forms] Could not check storage-account pins at boot: File Storage metadata did not load (see the engine error above).',
        );
        return;
      }
      // Every account, inactive providers included: MJ still uploads to and reads from them by id.
      const accounts = engine.AccountsWithProviders.map((a) => ({
        id: a.account.ID,
        name: a.account.Name,
        providerName: a.provider.Name,
        providerActive: a.provider.IsActive,
      }));
      const { warnings, errors } = assessStoragePins(accounts, [
        { envVar: 'FORMS_ASSET_STORAGE_ACCOUNT', value: getAssetConfig().storageAccountId, role: 'write' },
        { envVar: 'FORMS_UPLOAD_STORAGE_ACCOUNT', value: getUploadConfig().storageAccountId, role: 'write' },
        { envVar: 'FORMS_DOWNLOAD_STORAGE_ACCOUNT', value: getDownloadConfig().storageAccountId, role: 'read' },
      ]);
      for (const e of errors) LogError(`[Forms] Storage is NOT ready: ${e}`);
      for (const w of warnings) LogErrorEx({ severity: 'warning', message: `[Forms] Storage: ${w}` });
    } catch (e) {
      LogError(`[Forms] Could not check storage-account pins at boot: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
