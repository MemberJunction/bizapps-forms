/**
 * `GET /forms/files/:fileId` on MJAPI — download one respondent-uploaded answer.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsDownload')` so MJ server
 * bootstrap discovers it through ClassFactory — no core fork, no GraphQL resolver, matching the
 * Upload/Asset/WidgetBundle/RespondentHost pattern already in this package.
 *
 * MOUNTED POST-AUTH, unlike the asset READ route beside it. That route is deliberately pre-auth
 * because a published form's welcome image must render for a respondent with no session, and its
 * guard is therefore the storage prefix rather than identity. This route is the opposite: it
 * serves a résumé, and identity IS the guard. `createUnifiedAuthMiddleware` has already verified
 * the bearer token and attached the caller at `req.userPayload.userRecord`; everything that
 * decides whether this caller may have these bytes lives in {@link loadResponseFile}.
 */
import type { RequestHandler, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogStatus, RunView, type UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';

import { sendJsonError, userPayloadOf } from '../http/request-body.js';
import { attachmentDisposition } from './content-disposition.js';
import { DOWNLOAD_RESPONSE_HEADERS, DOWNLOAD_ROUTE, fileIdFromPath, getDownloadConfig } from './config.js';
import { loadResponseFile, type DownloadContext } from './download.service.js';
import type { StorageReadEngine } from '../storage/read-object.js';

/** The verified payload MJ's `createUnifiedAuthMiddleware` attaches to the request. */
interface VerifiedUserPayload {
  userRecord?: UserInfo;
}

@RegisterClass(BaseServerMiddleware, 'mj:formsDownload')
export class DownloadMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsDownload';
  }

  public override get Enabled(): boolean {
    return getDownloadConfig().enabled;
  }

  /** Contribute the handler as POST-AUTH middleware so `req.userPayload` is already verified. */
  public override GetPostAuthMiddleware(): RequestHandler[] {
    LogStatus(`[Forms] Response-file download registered at GET ${DOWNLOAD_ROUTE}/:fileId`);
    return [
      (req: Request, res: Response, next: (err?: unknown) => void): void => {
        const fileId = req.method === 'GET' ? fileIdFromPath(req.path) : undefined;
        if (!fileId) {
          next();
          return;
        }
        void this.handleDownload(req, res, fileId).catch((e: unknown) => {
          LogError(`[Forms] Download route error: ${e instanceof Error ? e.message : String(e)}`);
          sendJsonError(res, 500, 'That file could not be read.');
        });
      },
    ];
  }

  private async handleDownload(req: Request, res: Response, fileId: string): Promise<void> {
    const contextUser = userPayloadOf<VerifiedUserPayload>(req)?.userRecord;
    if (!contextUser) {
      // Should not happen — unified auth would have 401'd. Defensive fail-closed.
      sendJsonError(res, 401, 'Sign in to download this file.');
      return;
    }
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
      LogError('[Forms] Download unavailable: no system user in the cache.');
      sendJsonError(res, 500, 'That file could not be read.');
      return;
    }

    const ctx: DownloadContext = {
      contextUser,
      elevatedUser: systemUser,
      runViewProvider: new RunView(),
      storage: FileStorageEngine.Instance as StorageReadEngine,
    };

    const result = await loadResponseFile(ctx, fileId);
    if (!result.ok || !result.payload) {
      const failure = result.failure ?? { status: 500, error: 'That file could not be read.' };
      sendJsonError(res, failure.status, failure.error);
      return;
    }

    const { content, contentType, fileName } = result.payload;
    res
      .status(200)
      .set(DOWNLOAD_RESPONSE_HEADERS)
      .set('Content-Type', contentType)
      .set('Content-Length', String(content.length))
      .set('Content-Disposition', attachmentDisposition(fileName))
      .send(content);
  }
}
