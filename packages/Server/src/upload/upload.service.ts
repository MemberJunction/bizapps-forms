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
import { LogError, Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { answerColumnFor, isFormQuestionType } from '@mj-biz-apps/forms-entities';
import { randomUUID } from 'node:crypto';


import type { mjBizAppsFormsFormUploadEntity } from '@mj-biz-apps/forms-entities';
import { FORM_UPLOAD_ENTITY } from '../public-submit/entity-names';
import { checkRespondentScope, type ScopeMetadataProvider } from '../public-submit/scope-check.service';
import { resolvePublishedDefinition, type DefinitionRunViewProvider } from '../public-submit/definition-loader.service';
import { contentTypeAllowed, getUploadConfig, uploadTooLargeMessage } from './config';
import type { ParsedFile } from './multipart';

/** What the service needs about the just-parsed request. */
export interface UploadRequest {
  file: ParsedFile | undefined;
  distributionSlug: string | undefined;
  distributionId: string | undefined;
  questionId: string | undefined;
  /**
   * The widget's client-minted response id.
   *
   * The primary correlation key for provenance, because the anonymous session id is documented to
   * be blank in otherwise valid flows — so keying on the session alone would leave a real
   * proportion of legitimate uploads unattributable. Optional: an older widget does not send it,
   * and lenient mode exists for exactly that rollout window.
   */
  responseId: string | undefined;
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
  /**
   * The principal the File row and the provenance row are written as.
   *
   * Separate from `contextUser` on purpose: eligibility is checked against the anonymous caller,
   * and only the WRITE runs elevated. Falls back to the caller when absent, which keeps existing
   * tests honest — but the middleware always supplies it.
   */
  elevatedUser?: UserInfo;
  /** The anonymous session id, a fallback correlation key for provenance. */
  sessionId?: string;
  /**
   * Injectable provenance writer, matching how storage and metadata are injected here.
   *
   * Defaults to the real entity write. A seam rather than a direct `new Metadata()` because the
   * upload now FAILS CLOSED when provenance cannot be recorded — correct behaviour, but it makes
   * the whole endpoint untestable without a database unless the write can be substituted.
   */
  recordProvenance?: (input: ProvenanceRecordInput) => Promise<boolean>;
}

/** What the provenance writer needs to record one upload. */
export interface ProvenanceRecordInput {
  writer: UserInfo;
  fileId: string;
  providerKey?: string;
  distributionId: string;
  formId: string;
  questionId?: string;
  responseId?: string;
  sessionId?: string;
  uploadedByUserId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
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
  }): Promise<{ FileID: string; StoragePath?: string }>;
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

  // 3b. The question must be a real FileUpload question on the published definition. Checked
  // BEFORE any byte is stored: the definition is already in hand from step 3, and validating
  // after storage is how the first live run of this path ended — bytes and an `MJ: Files` row
  // orphaned on disk while the respondent saw a 500 from the ledger insert rejecting a
  // non-GUID question id (found 2026-08-18 driving the full résumé arc, issue #49).
  const questionCheck = validateQuestion(distCheck.resolved, req.questionId);
  if (!questionCheck.ok) {
    return questionCheck;
  }

  // 4. Store bytes + create the MJ: Files record via the canonical MJ storage path.
  //    The ledger records the DEFINITION's spelling of the question id, not the client's: the
  //    match above is case-folded, so writing back what the caller sent would let
  //    `FormUpload.QuestionID` disagree with the published definition about which question an
  //    upload answered — and multipart field values are not trimmed (see multipart.ts), so the
  //    raw string can also carry surrounding whitespace into a uniqueidentifier column.
  return storeFile(ctx, file, req, distCheck.resolved, questionCheck.questionId);
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
    return fail(413, uploadTooLargeMessage());
  }
  if (!contentTypeAllowed(file.contentType, cfg.allowedTypes)) {
    return fail(
      415,
      `Files of type "${file.contentType}" are not accepted here. ${describeAllowedTypes(cfg.allowedTypes)}`,
    );
  }
  return { ok: true };
}

/**
 * The default provenance writer: one row in the Forms upload ledger.
 *
 * Returns false rather than throwing so the caller can fail the upload cleanly; a thrown error
 * here would be reported to the respondent as a storage problem, which is not what happened.
 */
export async function writeProvenanceRow(input: ProvenanceRecordInput): Promise<boolean> {
  try {
    const row = await new Metadata().GetEntityObject<mjBizAppsFormsFormUploadEntity>(
      FORM_UPLOAD_ENTITY,
      input.writer,
    );
    if (!row) {
      return false;
    }
    row.NewRecord();
    row.FileID = input.fileId;
    row.DistributionID = input.distributionId;
    row.FormID = input.formId;
    row.QuestionID = input.questionId ?? null;
    row.ResponseDraftID = input.responseId ?? null;
    row.AnonymousSessionID = input.sessionId ?? null;
    // Audit only. Every anonymous session shares one user record, so this can never be a
    // correlation key — that is what ResponseDraftID is for.
    row.UploadedByUserID = input.uploadedByUserId ?? null;
    row.ProviderKey = input.providerKey ?? null;
    row.FileName = input.fileName;
    row.ContentType = input.contentType;
    row.SizeBytes = input.sizeBytes;
    row.Status = 'Active';
    if (await row.Save()) {
      return true;
    }
    LogError(`Forms upload: provenance row save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
    return false;
  } catch (error) {
    LogError(
      `Forms upload: provenance row could not be written: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** What step 3 hands to the question check and the store step. */
interface ResolvedUploadTarget {
  distributionId: string;
  formId: string;
  /** Every question on the published definition, flattened across pages. */
  questions: ReadonlyArray<{ id: string; type: string }>;
}

/**
 * Resolve the distribution slug to an open published form (rejects closed/unknown).
 *
 * Returns the resolved ids as well as the verdict, because the provenance row needs them and
 * resolving twice would leave two answers free to disagree about which form an upload belonged to.
 */
async function resolveOpenDistribution(
  ctx: UploadContext,
  req: UploadRequest,
): Promise<UploadResult & { resolved?: ResolvedUploadTarget }> {
  const slug = req.distributionSlug ?? req.distributionId;
  if (!slug) {
    return fail(400, 'Missing required field "distributionSlug" (or "distributionId").');
  }
  const loaded = await resolvePublishedDefinition(ctx.runViewProvider, slug, ctx.contextUser);
  if (!loaded.ok || !loaded.value) {
    return fail(404, `Form unavailable (${loaded.failure ?? 'not-found'}).`);
  }
  return {
    ok: true,
    resolved: {
      distributionId: loaded.value.distribution.ID,
      formId: loaded.value.definition.formId,
      questions: loaded.value.definition.pages.flatMap((p) => p.questions.map((q) => ({ id: q.id, type: q.type }))),
    },
  };
}

/**
 * The uploaded-against question must exist on the published definition and be a FileUpload
 * question. Fail-closed on both: an unknown id would otherwise travel all the way to the
 * provenance insert (where a non-GUID surfaces as a raw SQL conversion error), and a non-file
 * question id would mint a ledger row the submit path can never match to a file answer.
 *
 * GUIDs are compared case-folded — minted lowercase on the client, returned uppercase by
 * SQL Server — the same boundary every other identifier in this codebase crosses.
 */
function validateQuestion(
  target: ResolvedUploadTarget | undefined,
  questionId: string,
): UploadResult & { questionId?: string } {
  const wanted = questionId.trim().toLowerCase();
  const question = target?.questions.find((q) => q.id.trim().toLowerCase() === wanted);
  if (!question) {
    return fail(400, 'Unknown "questionId" for this form.');
  }
  // Ask the question-type contract whether this answer IS a file, rather than naming one type.
  // The hardcoded 'FileUpload' rejected every Signature upload with a 400 — the pad exports a
  // PNG and sends it down this exact route, so the respondent drew a signature and got
  // "Upload failed (HTTP 400)" underneath it with nothing to do about it. Both types declare
  // `answerColumn: 'file'`, which is the property this guard was always reaching for: the
  // ledger row must match a file answer at submit, and that is decided by the column, not the
  // type name. Anything else added to that column later works here without a second edit.
  // Guarded rather than cast: `type` arrives as a plain string off the published snapshot (it
  // is JSON), so a definition published by an older or newer build can carry a type this server
  // does not know. Treating an unrecognised one as "not a file" keeps the endpoint fail-closed.
  if (!isFormQuestionType(question.type) || answerColumnFor(question.type) !== 'file') {
    return fail(400, `Question does not take a file answer (got "${question.type}").`);
  }
  // Return the DEFINITION's id, not the caller's — the one place that decides which question this
  // upload answered, so the ledger cannot record a spelling the definition disagrees with.
  return { ok: true, questionId: question.id };
}

/** Store the file via FileStorageEngine.UploadFile and shape the success body. */
async function storeFile(
  ctx: UploadContext,
  file: ParsedFile,
  req: UploadRequest,
  resolved: { distributionId: string; formId: string } | undefined,
  /** The published definition's spelling of the question id, from {@link validateQuestion}. */
  questionId: string | undefined,
): Promise<UploadResult> {
  const cfg = getUploadConfig();
  // The File row and the provenance row are both written under an ELEVATED principal, not the
  // anonymous session. Two reasons, and the second is the load-bearing one: the anonymous role
  // holds no `MJ: Files` grant, so writing as the caller fails default-deny on a clean install
  // (F-SEC-2); and a provenance row the caller could write would prove nothing, since every
  // IncludeInAPI entity has a generated CreateRecord mutation gated on the caller's own roles.
  // Eligibility was already checked against the caller above — only the WORK runs elevated.
  const writer = ctx.elevatedUser ?? ctx.contextUser;
  try {
    await ctx.storage.Config(false, writer);
    const result = await ctx.storage.UploadFile({
      content: file.data,
      fileName: safeFileName(file.filename),
      mimeType: bareContentType(file.contentType),
      contextUser: writer,
      storageAccountId: cfg.storageAccountId,
      pathPrefix: uploadPathPrefix(cfg.pathPrefix),
    });

    if (resolved) {
      const record = ctx.recordProvenance ?? writeProvenanceRow;
      const recorded = await record({
        writer,
        fileId: result.FileID,
        providerKey: result.StoragePath,
        distributionId: resolved.distributionId,
        formId: resolved.formId,
        questionId,
        responseId: req.responseId,
        sessionId: ctx.sessionId,
        uploadedByUserId: ctx.contextUser?.ID,
        fileName: safeFileName(file.filename),
        contentType: bareContentType(file.contentType),
        sizeBytes: file.data.length,
      });
      if (!recorded) {
        // Fail closed. A file with no provenance row is unusable downstream — submit will reject
        // it — so returning its id would hand the respondent something that looks like a
        // successful upload and then silently fails their submission.
        return fail(500, 'Upload could not be recorded; please try again.');
      }
    }

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
/**
 * The allow-list, as a sentence a respondent can act on.
 *
 * Deliberately families rather than the raw MIME list: "application/vnd.openxmlformats-
 * officedocument.wordprocessingml.document" is the correct answer to a question nobody
 * asked, and eleven of them is not a hint, it is a wall. Naming the recognisable kinds
 * gets someone to the right file; the exact list stays in config for the operator.
 */
function describeAllowedTypes(allowed: readonly string[]): string {
  const families = new Set<string>();
  for (const type of allowed) {
    if (type.startsWith('image/')) families.add('images');
    else if (type === 'application/pdf') families.add('PDFs');
    else if (type.startsWith('text/')) families.add('text files');
    else families.add('Word and Excel documents');
  }
  const names = [...families];
  if (names.length === 0) {
    return 'No file types are currently accepted.';
  }
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `You can upload ${list}.`;
}

/**
 * Where one upload's bytes go, given whatever prefix the operator configured.
 *
 * The UUID is the whole point, not decoration. The object path is `<prefix>/<filename>`, and the
 * signature pad names every file it exports `signature.png` — so without a unique segment every
 * signature drawn on a given day, by every respondent, on every form, resolved to ONE object.
 * Each upload overwrote the previous one while its own MJ: Files row was created happily, leaving
 * several responses pointing at whichever bytes landed last: a respondent's signature replaced by
 * a stranger's, now served to a reviewer with a 200 by the download route.
 *
 * `configured` is folded in HERE rather than short-circuiting this function, because the first
 * version of this fix lived in a `?? defaultPathPrefix()` fallback — which meant it protected only
 * the hosts that had configured nothing, and `FORMS_UPLOAD_PATH_PREFIX` (documented and supported)
 * silently put the data loss back. Uniqueness is an invariant of the path, so it belongs on every
 * path this builds. The date stays because it makes the store browsable.
 */
export function uploadPathPrefix(configured?: string): string {
  const base = configured?.replace(/\/+$/, '') || `forms-uploads/${new Date().toISOString().slice(0, 10)}`;
  return `${base}/${randomUUID()}`;
}
