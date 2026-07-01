/**
 * Core logic for the public file-upload endpoint (Task 3), factored out of the Express
 * middleware so it is fully unit-testable (auth + storage injected).
 *
 * Contract enforced here (fail-closed at every gate):
 *   1. Anonymous scope — the session must hold CanCreate on `Form Response Answers`
 *      (reuses {@link checkRespondentScope}, the SAME guard the submit pipeline uses).
 *   2. A file must be present, within the size cap, and of an allowed content type.
 *   3. Context fields — a `distributionSlug` (or `distributionId`) and a `questionId` —
 *      must be present; the slug must resolve to an OPEN published distribution (so a
 *      closed/nonexistent form cannot be used as an anonymous upload dumping ground).
 *   4. Store the bytes via MJ's configured file-storage provider, creating an `MJ: Files`
 *      record, by reusing {@link FileStorageEngine.UploadFile} (the canonical MJ path that
 *      does "store bytes + create File row + set ProviderKey/Status"). We do NOT roll our
 *      own S3/disk code.
 *
 * The returned `fileId` is the `MJ: Files` record ID the widget submits as the answer's
 * `FileID` (that column already exists on FormResponseAnswer).
 */
import type { UserInfo } from '@memberjunction/core';
import { checkRespondentScope, type ScopeMetadataProvider } from '../public-submit/scope-check.service';
import { resolvePublishedDefinition, type DefinitionRunViewProvider } from '../public-submit/definition-loader.service';
import { contentTypeAllowed, getUploadConfig } from './config';
import type { ParsedFile } from './multipart';

/** What the service needs about the just-parsed request. */
export interface UploadRequest {
  file: ParsedFile | undefined;
  distributionSlug: string | undefined;
  distributionId: string | undefined;
  questionId: string | undefined;
}

/** The authenticated context (from the verified magic-link session). */
export interface UploadContext {
  /** The anonymous session's UserInfo (already verified by MJ's unified auth middleware). */
  contextUser: UserInfo;
  /** Metadata provider for the anonymous-scope check (`EntityByName`/`GetUserPermisions`). */
  metadataProvider: ScopeMetadataProvider;
  /** RunView provider for resolving the distribution slug to its published definition. */
  runViewProvider: DefinitionRunViewProvider;
  /** Injectable storage engine (defaults to FileStorageEngine.Instance in the middleware). */
  storage: UploadStorageEngine;
}

/** The slice of `FileStorageEngine` this service depends on (lets tests inject a stub). */
export interface UploadStorageEngine {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  UploadFile(options: {
    content: Buffer;
    fileName: string;
    mimeType: string;
    contextUser: UserInfo;
    storageAccountId?: string;
    pathPrefix?: string;
  }): Promise<{ FileID: string }>;
}

/** The endpoint's JSON success body (the frozen widget contract). */
export interface UploadSuccess {
  fileId: string;
  name: string;
  size: number;
  contentType: string;
}

/** A typed failure carrying the HTTP status the middleware should return. */
export interface UploadFailure {
  status: number;
  error: string;
}

/** Flat result union (non-discriminated) — safe field access under non-strictNullChecks. */
export interface UploadResult {
  ok: boolean;
  success?: UploadSuccess;
  failure?: UploadFailure;
}

function fail(status: number, error: string): UploadResult {
  return { ok: false, failure: { status, error } };
}

/**
 * Run the full upload flow. Pure of Express — the middleware supplies the parsed request +
 * verified context and maps the {@link UploadResult} to an HTTP response.
 */
export async function runUpload(ctx: UploadContext, req: UploadRequest): Promise<UploadResult> {
  // 1. Anonymous scope: must be able to create response answers (same guard as submit).
  const scope = checkRespondentScope(ctx.metadataProvider, ctx.contextUser);
  if (!scope.allowed) {
    return fail(403, scope.reason ?? 'Not authorized to upload.');
  }

  // 2. File presence + size + type (fail-closed).
  const fileCheck = validateFile(req.file);
  if (!fileCheck.ok) {
    return fileCheck;
  }
  const file = req.file as ParsedFile;

  // 3. Context fields + the distribution must resolve to an OPEN published form.
  if (!req.questionId) {
    return fail(400, 'Missing required field "questionId".');
  }
  const distCheck = await resolveOpenDistribution(ctx, req);
  if (!distCheck.ok) {
    return distCheck;
  }

  // 4. Store bytes + create the MJ: Files record via the canonical MJ storage path.
  return storeFile(ctx, file);
}

/** Enforce presence, size cap, and content-type allowlist. */
function validateFile(file: ParsedFile | undefined): UploadResult {
  if (!file) {
    return fail(400, 'No file part found in the upload.');
  }
  const cfg = getUploadConfig();
  if (file.data.length === 0) {
    return fail(400, 'Uploaded file is empty.');
  }
  if (file.data.length > cfg.maxBytes) {
    return fail(413, `File exceeds the maximum allowed size of ${cfg.maxBytes} bytes.`);
  }
  if (!contentTypeAllowed(file.contentType, cfg.allowedTypes)) {
    return fail(415, `Content type "${file.contentType}" is not allowed.`);
  }
  return { ok: true };
}

/** Resolve the distribution slug to an open published form (rejects closed/unknown). */
async function resolveOpenDistribution(ctx: UploadContext, req: UploadRequest): Promise<UploadResult> {
  const slug = req.distributionSlug ?? req.distributionId;
  if (!slug) {
    return fail(400, 'Missing required field "distributionSlug" (or "distributionId").');
  }
  const loaded = await resolvePublishedDefinition(ctx.runViewProvider, slug, ctx.contextUser);
  if (!loaded.ok || !loaded.value) {
    return fail(404, `Form unavailable (${loaded.failure ?? 'not-found'}).`);
  }
  return { ok: true };
}

/** Store the file via FileStorageEngine.UploadFile and shape the success body. */
async function storeFile(ctx: UploadContext, file: ParsedFile): Promise<UploadResult> {
  const cfg = getUploadConfig();
  try {
    await ctx.storage.Config(false, ctx.contextUser);
    const result = await ctx.storage.UploadFile({
      content: file.data,
      fileName: safeFileName(file.filename),
      mimeType: bareContentType(file.contentType),
      contextUser: ctx.contextUser,
      storageAccountId: cfg.storageAccountId,
      pathPrefix: cfg.pathPrefix ?? defaultPathPrefix(),
    });
    return {
      ok: true,
      success: {
        fileId: result.FileID,
        name: safeFileName(file.filename),
        size: file.data.length,
        contentType: bareContentType(file.contentType),
      },
    };
  } catch (error) {
    // No storage account configured / provider misconfigured / upload failed. This is a
    // 5xx (server problem), never a crash — the caller returns a clean JSON error body.
    const detail = error instanceof Error ? error.message : String(error);
    return fail(500, `File storage is not available: ${detail}`);
  }
}

/** Strip any `; charset=` parameter from the content type before storing. */
function bareContentType(contentType: string): string {
  return contentType.split(';')[0].trim() || 'application/octet-stream';
}

/** Sanitize a client-supplied filename to a safe basename (no path traversal). */
function safeFileName(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  // Keep letters/digits/dot/dash/underscore/space; drop everything else.
  const cleaned = base
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'upload.bin';
}

/** Default storage path prefix: `forms-uploads/<YYYY-MM-DD>`. */
function defaultPathPrefix(): string {
  return `forms-uploads/${new Date().toISOString().slice(0, 10)}`;
}
