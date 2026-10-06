/**
 * The authoring-asset routes on MJAPI: `POST /forms/asset` (authenticated) and
 * `GET /forms/asset/:id` (anonymous).
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsAsset')` so MJ server bootstrap
 * discovers it through ClassFactory — no core fork, no GraphQL resolver, matching the
 * Upload/WidgetBundle/RespondentHost pattern already in this package.
 *
 * ── Why the two halves mount differently ────────────────────────────────────────────────────
 * The WRITE runs POST-AUTH ({@link GetPostAuthMiddleware}), because it must know WHICH
 * authenticated author is calling in order to check their permission on the Forms entity.
 *
 * The READ runs PRE-AUTH, contributed through {@link GetPreAuthMiddleware} exactly like the
 * `/f/:slug` respondent host page, because a published form's welcome image has to render for a
 * respondent who has no session at all — an `<img>` tag cannot present a bearer token. Its guard
 * is therefore not identity but storage location: only objects under the public asset prefix are
 * servable, so this route can never be turned into a reader for respondent-uploaded files.
 *
 * SEAM NOTE: the same `BaseServerExtension` migration noted on `RespondentHostMiddleware` applies
 * to the GET half here.
 */
import type { NextFunction, RequestHandler, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogStatus, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { MJFileEntity } from '@memberjunction/core-entities';

import { readCappedBody, sendJsonError, userPayloadOf } from '../http/request-body.js';
import { getRequestOrigin } from '../http/request-origin.js';
import { matchSingleSegmentRoute } from '../http/route-match.js';
import { parseMultipart } from '../upload/multipart.js';
import {
  ASSET_RESPONSE_HEADERS,
  ASSET_ROUTE,
  assetBodyCap,
  assetPublicUrl,
  assetTooLargeMessage,
  getAssetConfig,
} from './config.js';
import {
  loadAssetBytes,
  runAssetUpload,
  type AssetReadContext,
  type AssetReadStorage,
  type AssetUploadContext,
  type AssetUploadStorage,
  type StoredAssetRecord,
} from './asset.service.js';

/** The verified payload MJ's `createUnifiedAuthMiddleware` attaches to the request. */
interface VerifiedUserPayload {
  userRecord?: UserInfo;
}

/** MJ core's Files entity, the row the read guard is decided from. */
const FILE_ENTITY = 'MJ: Files';

@RegisterClass(BaseServerMiddleware, 'mj:formsAsset')
export class AssetMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsAsset';
  }

  public override get Enabled(): boolean {
    return getAssetConfig().enabled;
  }

  /**
   * The anonymous read route, in the slot that sits BEHIND MJ's `compression()`.
   *
   * ── Why this is pre-auth middleware and not a `ConfigureExpressApp` route (#181) ───────────────
   * Both hooks run before auth; they differ in where the route lands in Express's stack. `serve()`
   * calls `ConfigureExpressApp` while still collecting middleware contributions (`index.ts:824`),
   * BEFORE it mounts `compression()` (`index.ts:1129`), so a route registered there finishes its
   * response before the compressor can wrap it. This is the same defect #121 fixed for the widget
   * bundle and #181 fixed for the respondent page.
   *
   * WHAT THIS BUYS, HONESTLY. Today: nothing, in bytes. `FORMS_ASSET_ALLOWED_TYPES` defaults to
   * PNG/JPEG/GIF/WebP, and `compression.filter` consults `mime-db`, which marks all four
   * incompressible — so they were never going to be encoded in either slot. It is taken because the
   * defect is the SLOT rather than the payload: an operator who adds `image/svg+xml` to the
   * allowlist (which `config.ts` explicitly contemplates) would otherwise inherit the bug silently,
   * and leaving one of the two routes in the broken slot preserves the trap.
   *
   * (A correction, since the reverse is easy to assume: MJ's custom compression `filter` reads
   * `req.headers['content-type']` — the REQUEST's type, which a GET does not send — so its
   * `image/` skip never fires here. What decides is `compression.filter` on the RESPONSE type.)
   *
   * The read is anonymous because a published form's welcome image has to render for a respondent
   * with no session at all — an `<img>` cannot present a bearer token. Its guard is therefore not
   * identity but storage location: only objects under the public asset prefix are servable.
   *
   * MOVING SLOTS also puts this route behind every other pre-auth handler, including MJ's global
   * `RateLimitMiddleware` (`enabled: false` by default). On a host that turns rate limiting on, a
   * form's images are now counted and can answer 429 — which a respondent sees as a broken image,
   * not as a rate-limit message.
   */
  public override GetPreAuthMiddleware(): RequestHandler[] {
    LogStatus(`[Forms] Public asset endpoint registered at GET ${ASSET_ROUTE}/:fileId`);
    return [
      (req: Request, res: Response, next: NextFunction): void => {
        // GET and HEAD, like the `app.get` this replaced. `matchSingleSegmentRoute` reproduces what
        // path-to-regexp claimed: a case-insensitive literal, one optional trailing slash, and a
        // percent-decoded single segment — so a mis-cased asset URL in published HTML still renders
        // instead of falling through to a 401.
        const fileId =
          req.method === 'GET' || req.method === 'HEAD'
            ? matchSingleSegmentRoute(req.path, ASSET_ROUTE)
            : undefined;
        if (fileId === undefined) {
          next();
          return;
        }
        void this.handleFetch(fileId, res).catch((e: unknown) => {
          LogError(`[Forms] Asset fetch route error: ${e instanceof Error ? e.message : String(e)}`);
          sendJsonError(res, 500, 'Could not read the image.');
        });
      },
    ];
  }

  /** The authenticated write route, mounted after auth so `req.userPayload` is verified. */
  public override GetPostAuthMiddleware(): RequestHandler[] {
    LogStatus(`[Forms] Authoring asset upload registered at POST ${ASSET_ROUTE}`);
    return [
      (req: Request, res: Response, next: (err?: unknown) => void): void => {
        if (req.method !== 'POST' || req.path !== ASSET_ROUTE) {
          next();
          return;
        }
        void this.handleUpload(req, res).catch((e: unknown) => {
          LogError(`[Forms] Asset upload route error: ${e instanceof Error ? e.message : String(e)}`);
          sendJsonError(res, 500, 'Upload failed unexpectedly. Please try again later.');
        });
      },
    ];
  }

  /** Buffer the body (size-capped), parse multipart, run the service, and respond JSON. */
  private async handleUpload(req: Request, res: Response): Promise<void> {
    const contextUser = userPayloadOf<VerifiedUserPayload>(req)?.userRecord;
    if (!contextUser) {
      // Should not happen (unified auth would have 401'd) — defensive fail-closed.
      sendJsonError(res, 401, 'Sign in to upload an image.');
      return;
    }

    // The body cap is ABOVE the file cap (see assetBodyCap) so the size verdict belongs to
    // validateImage, which knows it is judging a file. Both layers speak with one voice.
    const body = await readCappedBody(req, assetBodyCap(), assetTooLargeMessage());
    if (!body.ok || !body.body) {
      sendJsonError(res, body.status ?? 400, body.error ?? 'Failed to read upload.');
      return;
    }

    const parsed = parseMultipart(body.body, req.headers['content-type']);
    if (!parsed.ok) {
      sendJsonError(res, 400, parsed.reason ?? 'Malformed upload.');
      return;
    }

    const ctx: AssetUploadContext = {
      contextUser,
      metadataProvider: new Metadata(),
      runViewProvider: new RunView(),
      storage: FileStorageEngine.Instance as AssetUploadStorage,
      // The `MJ: Files` row is written elevated for the same reason the respondent path does it:
      // an ordinary author role carries no Files grant on a clean install. Eligibility was
      // already decided against the caller.
      elevatedUser: UserCache.Instance.GetSystemUser(),
    };

    const result = await runAssetUpload(ctx, { file: parsed.file, formId: parsed.fields.formId });
    if (!result.ok || !result.success) {
      const failure = result.failure ?? { status: 500, error: 'Upload failed.' };
      sendJsonError(res, failure.status, failure.error);
      return;
    }
    res
      .status(200)
      .set('Cache-Control', 'no-store')
      .json({ ...result.success, url: assetPublicUrl(result.success.fileId, getRequestOrigin(req)) });
  }

  /** Serve one stored asset's bytes to an anonymous caller. */
  private async handleFetch(fileId: string, res: Response): Promise<void> {
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
      LogError('[Forms] Asset fetch has no system user; the user cache is not loaded.');
      sendJsonError(res, 500, 'Could not read the image.');
      return;
    }

    const ctx: AssetReadContext = {
      systemUser,
      storage: FileStorageEngine.Instance as AssetReadStorage,
      loadFile: loadFileRecord,
    };
    const result = await loadAssetBytes(ctx, fileId);
    if (!result.ok || !result.asset) {
      const failure = result.failure ?? { status: 404, error: 'Not found.' };
      sendJsonError(res, failure.status, failure.error);
      return;
    }

    res.status(200).set(ASSET_RESPONSE_HEADERS).type(result.asset.contentType).send(result.asset.content);
  }
}

/**
 * Load the `MJ: Files` row behind an asset id.
 *
 * A point read through the entity object rather than a RunView: this runs on every image request
 * of every published form, and `Load` is the cheapest path to one row by primary key.
 */
async function loadFileRecord(fileId: string, user: UserInfo): Promise<StoredAssetRecord | undefined> {
  const file = await new Metadata().GetEntityObject<MJFileEntity>(FILE_ENTITY, user);
  if (!file || !(await file.Load(fileId))) {
    return undefined;
  }
  return {
    ID: file.ID,
    Name: file.Name,
    ContentType: file.ContentType,
    ProviderID: file.ProviderID,
    ProviderKey: file.ProviderKey,
    Status: file.Status,
  };
}
