/**
 * Public file-upload endpoint for the `<mj-form>` widget (Task 3), served on MJAPI.
 *
 * Registered via `@RegisterClass(BaseServerMiddleware, 'mj:formsUpload')` so MJ server
 * bootstrap discovers it through ClassFactory — no core fork, no GraphQL resolver (so
 * schema.graphql / codegen never churn), matching the WidgetBundle/RespondentHost pattern.
 *
 * AUTH — POST-AUTH, NOT PRE-AUTH: unlike the RespondentHost/WidgetBundle static routes
 * (which register via `ConfigureExpressApp`, BEFORE MJ's auth middleware), this route needs
 * the VERIFIED anonymous magic-link session. MJ's `createUnifiedAuthMiddleware` runs before
 * post-auth middleware, verifies the `Authorization: Bearer` JWT, and attaches the
 * synthesized anonymous `UserInfo` at `req.userPayload.userRecord` + `req.userPayload.sessionId`
 * (`mj_sid`). We therefore contribute this route through {@link GetPostAuthMiddleware} and
 * simply READ that verified payload — the exact same identity the `SubmitFormResponse`
 * GraphQL mutation runs under — instead of re-verifying the token or reinventing JWKS/JWT
 * handling. A missing/invalid token is already rejected upstream (401) and never reaches us
 * (fail-closed). If a payload is somehow absent we still 401 defensively.
 *
 * The handler only acts on `POST /forms/upload`; all other requests pass straight through.
 * The route enforces a hard byte cap on the raw body BEFORE buffering, a content-type
 * allowlist, the anonymous CanCreate-on-answers scope, and that the distribution slug
 * resolves to an OPEN published form — then stores bytes + creates an `MJ: Files` record via
 * {@link FileStorageEngine.UploadFile}. Missing storage config yields a clean 5xx, never a
 * boot crash.
 */
import type { RequestHandler, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { LogError, LogStatus, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';

import { getUploadConfig, UPLOAD_ROUTE } from './config.js';
import { parseMultipart } from './multipart.js';
import { runUpload, type UploadContext, type UploadRequest, type UploadStorageEngine } from './upload.service.js';

/** The verified magic-link payload MJ's `createUnifiedAuthMiddleware` attaches to the request. */
interface VerifiedUserPayload {
  userRecord?: UserInfo;
  sessionId?: string;
}

/** Flat body-read outcome (non-discriminated) so field access is safe under non-strictNullChecks. */
interface BodyReadResult {
  ok: boolean;
  body?: Buffer;
  status?: number;
  error?: string;
}

/** Read the verified anonymous session's UserInfo off the request (set by the auth middleware). */
function userPayloadOf(req: Request): VerifiedUserPayload | undefined {
  return (req as Request & { userPayload?: VerifiedUserPayload }).userPayload;
}

@RegisterClass(BaseServerMiddleware, 'mj:formsUpload')
export class UploadMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:formsUpload';
  }

  public override get Enabled(): boolean {
    return getUploadConfig().enabled;
  }

  /**
   * Contribute the upload handler as POST-AUTH middleware so `req.userPayload` is already
   * verified. The handler is a no-op for every request except `POST /forms/upload`.
   */
  public override GetPostAuthMiddleware(): RequestHandler[] {
    LogStatus(`[Forms] Public upload endpoint registered at POST ${UPLOAD_ROUTE}`);
    return [
      (req: Request, res: Response, next: (err?: unknown) => void): void => {
        if (req.method !== 'POST' || req.path !== UPLOAD_ROUTE) {
          next();
          return;
        }
        void this.handleUpload(req, res).catch((e: unknown) => {
          LogError(`[Forms] Upload route error: ${e instanceof Error ? e.message : String(e)}`);
          this.sendError(res, 500, 'Upload failed unexpectedly. Please try again later.');
        });
      },
    ];
  }

  /** Buffer the body (size-capped), parse multipart, run the service, and respond JSON. */
  private async handleUpload(req: Request, res: Response): Promise<void> {
    const contextUser = userPayloadOf(req)?.userRecord;
    if (!contextUser) {
      // Should not happen (unified auth would have 401'd) — defensive fail-closed.
      this.sendError(res, 401, 'Authentication required to upload.');
      return;
    }

    const bodyResult = await this.readCappedBody(req);
    if (!bodyResult.ok || !bodyResult.body) {
      this.sendError(res, bodyResult.status ?? 400, bodyResult.error ?? 'Failed to read upload.');
      return;
    }

    const parsed = parseMultipart(bodyResult.body, req.headers['content-type']);
    if (!parsed.ok) {
      this.sendError(res, 400, parsed.reason ?? 'Malformed upload.');
      return;
    }

    const uploadReq: UploadRequest = {
      file: parsed.file,
      distributionSlug: parsed.fields.distributionSlug,
      distributionId: parsed.fields.distributionId,
      questionId: parsed.fields.questionId,
    };
    const ctx: UploadContext = {
      contextUser,
      metadataProvider: new Metadata(),
      runViewProvider: new RunView(),
      storage: this.storageEngine(),
    };

    const result = await runUpload(ctx, uploadReq);
    if (!result.ok || !result.success) {
      const failure = result.failure ?? { status: 500, error: 'Upload failed.' };
      this.sendError(res, failure.status, failure.error);
      return;
    }
    res.status(200).set('Cache-Control', 'no-store').json(result.success);
  }

  /**
   * Read the request body into a Buffer, aborting fail-closed once it exceeds the configured
   * cap (so an oversized upload never buffers unbounded memory). Also short-circuits on a
   * `Content-Length` that already exceeds the cap.
   */
  private readCappedBody(req: Request): Promise<BodyReadResult> {
    const maxBytes = getUploadConfig().maxBytes;
    const declared = Number(req.headers['content-length'] ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) {
      return Promise.resolve({ ok: false, status: 413, error: `Upload exceeds the maximum size of ${maxBytes} bytes.` });
    }
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let aborted = false;
      req.on('data', (chunk: Buffer) => {
        if (aborted) {
          return;
        }
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          resolve({ ok: false, status: 413, error: `Upload exceeds the maximum size of ${maxBytes} bytes.` });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!aborted) {
          resolve({ ok: true, body: Buffer.concat(chunks) });
        }
      });
      req.on('error', (err: Error) => {
        if (!aborted) {
          aborted = true;
          resolve({ ok: false, status: 400, error: `Failed to read upload: ${err.message}` });
        }
      });
    });
  }

  /** Send a JSON error body with the given status (never throws twice). */
  private sendError(res: Response, status: number, error: string): void {
    if (res.headersSent) {
      return;
    }
    res.status(status).set('Cache-Control', 'no-store').json({ error });
  }

  /** The configured MJ file-storage engine (canonical "store bytes + create File row"). */
  private storageEngine(): UploadStorageEngine {
    return FileStorageEngine.Instance;
  }
}
