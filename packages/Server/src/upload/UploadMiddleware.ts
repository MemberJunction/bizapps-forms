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
 * (which is the caller's `x-session-id` header, NOT an `mj_sid` claim — MJ reads it straight off
 * the request, so it identifies nobody). We contribute this route through {@link GetPostAuthMiddleware} and
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
import { UserCache } from '@memberjunction/generic-database-provider';

import { readCappedBody, sendJsonError, userPayloadOf } from '../http/request-body.js';
import { InFlightLimiter } from '../http/in-flight-limiter.js';
import { currentRequestIdentity } from '../http/request-identity.js';
import { UPLOAD_ROUTE, getUploadConfig, uploadBodyCap, uploadTooLargeMessage } from './config.js';
import { parseMultipart } from './multipart.js';
import { runUpload, type UploadContext, type UploadRequest, type UploadStorageEngine } from './upload.service.js';
import { checkUploadRateLimit } from './upload-rate-limit.js';

/**
 * Process-wide in-flight cap on the anonymous upload endpoint, lazily built from config.
 *
 * Module-level (not per-instance) so the bound is one number for the whole process however many
 * times ClassFactory instantiates the middleware. Bounds simultaneous work, which the per-caller
 * IP ceiling beside it does not — see {@link InFlightLimiter}.
 */
let uploadInFlight: InFlightLimiter | undefined;
function uploadInFlightLimiter(): InFlightLimiter {
  if (!uploadInFlight) {
    uploadInFlight = new InFlightLimiter(getUploadConfig().maxInFlight);
  }
  return uploadInFlight;
}

/** Test-only: drop the memoized limiter so a fresh config takes effect. */
export function resetUploadInFlightForTests(): void {
  uploadInFlight = undefined;
}

/** The verified magic-link payload MJ's `createUnifiedAuthMiddleware` attaches to the request. */
interface VerifiedUserPayload {
  userRecord?: UserInfo;
  sessionId?: string;
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
          sendJsonError(res, 500, 'Upload failed unexpectedly. Please try again later.');
        });
      },
    ];
  }

  /**
   * Two gates BEFORE any work, answering different questions: a process-wide in-flight cap (how
   * much can run at once) and, inside `processUpload`, a per-caller window keyed on the resolved
   * peer IP (how often one caller may act). Both run ahead of buffering the body, so a flood is
   * refused before it costs memory or storage, and the in-flight slot wraps the whole request in a
   * `finally` so it releases on every exit path.
   *
   * The in-flight cap goes FIRST so a request shed for load is never charged to anyone's window.
   *
   * Until these landed the upload endpoint had no frequency control at all: an authenticated
   * anonymous session could POST files without bound (storage DoS).
   */
  private async handleUpload(req: Request, res: Response): Promise<void> {
    if (!uploadInFlightLimiter().TryEnter()) {
      // 503 (load), not 429 (bad request): this clears the instant in-flight work drains.
      //
      // Deliberately BEFORE the per-caller window inside `processUpload`, so a request shed for
      // load is never charged to anyone's budget. Charging load would let a flood spend the
      // budget of unrelated callers, which is the failure the in-flight cap exists to avoid.
      LogStatus('[Forms] Upload refused: too many uploads in flight. Clears as in-flight work drains.');
      sendJsonError(res, 503, 'The upload service is busy right now. Please try again in a moment.');
      return;
    }
    try {
      await this.processUpload(req, res);
    } finally {
      uploadInFlightLimiter().Exit();
    }
  }

  /** Buffer the body (size-capped), parse multipart, run the service, and respond JSON. */
  private async processUpload(req: Request, res: Response): Promise<void> {
    const contextUser = userPayloadOf<VerifiedUserPayload>(req)?.userRecord;
    if (!contextUser) {
      // Should not happen (unified auth would have 401'd) — defensive fail-closed.
      sendJsonError(res, 401, 'Authentication required to upload.');
      return;
    }

    // Before a single byte is buffered: an accepted upload stores bytes and creates an
    // `MJ: Files` row, so the cheapest place to refuse a caller hammering this route is the
    // moment we know who they are — which is on arrival, since the key is their resolved peer
    // IP rather than anything in the (as yet unread) body.
    if (this.refuseIfRateLimited(req, res)) {
      return;
    }

    const bodyResult = await readCappedBody(req, uploadBodyCap(), uploadTooLargeMessage());
    if (!bodyResult.ok || !bodyResult.body) {
      sendJsonError(res, bodyResult.status ?? 400, bodyResult.error ?? 'Failed to read upload.');
      return;
    }

    const parsed = parseMultipart(bodyResult.body, req.headers['content-type']);
    if (!parsed.ok) {
      sendJsonError(res, 400, parsed.reason ?? 'Malformed upload.');
      return;
    }

    const result = await runUpload(this.uploadContextFor(req, contextUser), {
      file: parsed.file,
      distributionSlug: parsed.fields.distributionSlug,
      distributionId: parsed.fields.distributionId,
      questionId: parsed.fields.questionId,
      responseId: parsed.fields.responseId,
    });
    if (!result.ok || !result.success) {
      const failure = result.failure ?? { status: 500, error: 'Upload failed.' };
      sendJsonError(res, failure.status, failure.error);
      return;
    }
    res.status(200).set('Cache-Control', 'no-store').json(result.success);
  }

  /**
   * The identities and providers the upload service runs under.
   *
   * Two principals, deliberately. `contextUser` is the verified anonymous caller and is what
   * authorizes the request; the File row and its provenance row are written as the SYSTEM user,
   * because the anonymous role holds no `MJ: Files` grant and a provenance row the caller could
   * write would prove nothing about who uploaded the file.
   */
  private uploadContextFor(req: Request, contextUser: UserInfo): UploadContext {
    return {
      contextUser,
      metadataProvider: new Metadata(),
      runViewProvider: new RunView(),
      storage: this.storageEngine(),
      elevatedUser: UserCache.Instance.GetSystemUser(),
      sessionId: userPayloadOf<VerifiedUserPayload>(req)?.sessionId,
    };
  }

  /**
   * Refuse an over-budget caller with 429 + `Retry-After`, and report whether it did.
   *
   * Returns a boolean rather than throwing because the caller is a route handler that has already
   * written a response by this point; a thrown error there would produce a second one.
   */
  private refuseIfRateLimited(req: Request, res: Response): boolean {
    const limit = checkUploadRateLimit({
      clientIpHash: currentRequestIdentity()?.ipHash,
      sessionId: userPayloadOf<VerifiedUserPayload>(req)?.sessionId,
    });
    if (limit.allowed) {
      return false;
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((limit.retryAfterMs ?? 0) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    sendJsonError(res, 429, `Too many uploads. Please wait ${retryAfterSeconds}s and try again.`);
    return true;
  }

  /** The configured MJ file-storage engine (canonical "store bytes + create File row"). */
  private storageEngine(): UploadStorageEngine {
    return FileStorageEngine.Instance;
  }
}
