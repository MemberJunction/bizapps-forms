/**
 * Shared HTTP primitives for the Forms binary routes (respondent upload, authoring asset).
 *
 * Extracted from `UploadMiddleware` when the authoring-asset route arrived and would otherwise
 * have carried a second copy of the same subtle stream logic. The cap is the reason this is worth
 * sharing: a body reader that resolves late, or that keeps buffering after the cap trips, is an
 * unbounded-memory bug no test of the *route* would catch — so there is exactly one of it, and it
 * is tested directly.
 *
 * The parameter types are structural rather than `express.Request`/`Response` so the tests can
 * drive them with a plain emitter and a recording double, with no HTTP server in the loop.
 */
import type { Request } from 'express';

/** Flat body-read outcome (non-discriminated) so field access is safe under non-strictNullChecks. */
export interface BodyReadResult {
  ok: boolean;
  body?: Buffer;
  status?: number;
  error?: string;
}

/** The slice of an Express request {@link readCappedBody} needs. */
export interface ReadableRequest {
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

/** The slice of an Express response {@link sendJsonError} needs. */
export interface JsonErrorResponse {
  headersSent: boolean;
  status(code: number): JsonErrorResponse;
  set(field: string, value: string): JsonErrorResponse;
  json(body: unknown): unknown;
}

/**
 * Read the request body into a Buffer, aborting fail-closed once it exceeds `maxBytes`, so an
 * oversized upload never buffers unbounded memory. Also short-circuits on a `Content-Length`
 * that already exceeds the cap — that check is what stops a hostile client before a byte is read.
 *
 * Never rejects: every outcome, including a stream error, comes back as a {@link BodyReadResult}
 * carrying the HTTP status the caller should send.
 */
export function readCappedBody(req: ReadableRequest, maxBytes: number): Promise<BodyReadResult> {
  const declared = Number(req.headers['content-length'] ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Promise.resolve(tooLarge(maxBytes));
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
        resolve(tooLarge(maxBytes));
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
        resolve({ ok: false, status: 400, error: `Failed to read request body: ${err.message}` });
      }
    });
  });
}

function tooLarge(maxBytes: number): BodyReadResult {
  return { ok: false, status: 413, error: `Upload exceeds the maximum size of ${maxBytes} bytes.` };
}

/** Send a JSON error body with the given status. A no-op once a response has started. */
export function sendJsonError(res: JsonErrorResponse, status: number, error: string): void {
  if (res.headersSent) {
    return;
  }
  res.status(status).set('Cache-Control', 'no-store').json({ error });
}

/** Read the verified auth payload MJ's `createUnifiedAuthMiddleware` attaches to the request. */
export function userPayloadOf<TPayload>(req: Request): TPayload | undefined {
  return (req as Request & { userPayload?: TPayload }).userPayload;
}
