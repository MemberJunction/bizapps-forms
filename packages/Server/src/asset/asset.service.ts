/**
 * Core logic for the authoring-asset routes, factored out of the Express middleware so both
 * halves are unit-testable with auth, metadata and storage injected.
 *
 * WRITE (`POST /forms/asset`) — an authenticated author uploads artwork for one form:
 *   1. The caller must hold **Update on `MJ_BizApps_Forms: Forms`**. That single check is also
 *      what rejects an anonymous respondent session, which reaches this route holding a valid
 *      JWT: the Form Respondent role grants CanCreate on the two response entities and nothing
 *      else, so it fails here. Checking the permission rather than the identity mode means a
 *      future role gets the right answer without this code learning about it.
 *   2. `formId` must be a GUID naming a form the caller can actually see (RunView under the
 *      CALLER's context, so row-level visibility is enforced, not bypassed).
 *   3. The bytes must be present, within the cap, and of an allowed image type.
 *   4. Store via {@link FileStorageEngine.UploadFile} under the public asset prefix.
 *
 * READ (`GET /forms/asset/:id`) — ANONYMOUS, because a published form's welcome image has to
 * load for a respondent who has no session at all. The guard is the storage prefix and nothing
 * else: a file whose `ProviderKey` is not under `forms-assets/` is a 404 here, so the route
 * cannot be turned into a reader for the résumés the respondent-upload endpoint stores.
 */
import { LogError } from '@memberjunction/core';
import type { EntityInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

import { FORM_ENTITY } from '../public-submit/entity-names.js';
import {
  assetPathPrefix,
  assetTypeAllowed,
  getAssetConfig,
  isPublicAssetKey,
} from './config.js';
import type { ParsedFile } from '../upload/multipart.js';

/** Entity-definition lookup — satisfied by a global `Metadata` and by a per-request provider. */
export interface AssetMetadataProvider {
  EntityByName(entityName: string): EntityInfo | undefined;
}

/** The narrow RunView surface the form-existence check needs (matches `DefinitionRunViewProvider`). */
export interface AssetRunViewProvider {
  RunView<T = unknown>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;
}

/** The slice of `FileStorageEngine` the write path depends on. */
export interface AssetUploadStorage {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  /** False when the instance has no `MJ: File Storage Accounts` row at all. */
  readonly HasStorageAccounts: boolean;
  UploadFile(options: {
    content: Buffer;
    fileName: string;
    mimeType: string;
    contextUser: UserInfo;
    storageAccountId?: string;
    pathPrefix?: string;
  }): Promise<{ FileID: string; StoragePath?: string }>;
}

/** The slice of `FileStorageEngine` the read path depends on. */
export interface AssetReadStorage {
  Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;
  GetAccountsByProviderID(providerId: string): ReadonlyArray<{ ID: string }>;
  ResolveStorageAccount(accountId?: string): { account: { ID: string } } | null;
  GetDriver(accountId: string, contextUser: UserInfo): Promise<{ GetObject(params: { objectId?: string }): Promise<Buffer> }>;
}

/** The stored-file facts the read path needs, however the caller chooses to load them. */
export interface StoredAssetRecord {
  ID: string;
  Name: string | null;
  ContentType: string | null;
  ProviderID: string;
  ProviderKey: string | null;
  Status: string;
}

/** What the write path receives from the parsed multipart body. */
export interface AssetUploadRequest {
  file: ParsedFile | undefined;
  formId: string | undefined;
}

/** Injected context for the write path. */
export interface AssetUploadContext {
  /** The authenticated author. Eligibility is checked against this principal. */
  contextUser: UserInfo;
  metadataProvider: AssetMetadataProvider;
  runViewProvider: AssetRunViewProvider;
  storage: AssetUploadStorage;
  /**
   * The principal the `MJ: Files` row is written as. Separate from `contextUser` for the same
   * reason the respondent path separates them: eligibility is the caller's, the WRITE is
   * elevated, because an ordinary author role carries no `MJ: Files` grant on a clean install.
   */
  elevatedUser?: UserInfo;
}

/** Injected context for the read path. */
export interface AssetReadContext {
  /** Server-side principal — this route has no request user by design. */
  systemUser: UserInfo;
  storage: AssetReadStorage;
  /** Loads the `MJ: Files` row, or undefined when there is none. */
  loadFile: (fileId: string, user: UserInfo) => Promise<StoredAssetRecord | undefined>;
}

/** The write route's JSON success body (the builder's contract). */
export interface AssetUploadSuccess {
  fileId: string;
  name: string;
  size: number;
  contentType: string;
}

/** The read route's payload. */
export interface AssetBytes {
  content: Buffer;
  contentType: string;
  fileName: string;
}

/** A typed failure carrying the HTTP status the middleware should return. */
export interface AssetFailure {
  status: number;
  error: string;
}

/** Flat result union (non-discriminated) — safe field access under non-strictNullChecks. */
export interface AssetUploadResult {
  ok: boolean;
  success?: AssetUploadSuccess;
  failure?: AssetFailure;
}

/** Flat result union for the read path. */
export interface AssetReadResult {
  ok: boolean;
  asset?: AssetBytes;
  failure?: AssetFailure;
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failUpload(status: number, error: string): AssetUploadResult {
  return { ok: false, failure: { status, error } };
}

function failRead(status: number, error: string): AssetReadResult {
  return { ok: false, failure: { status, error } };
}

/** Run the full authoring-asset upload. Pure of Express — the middleware maps the result. */
export async function runAssetUpload(
  ctx: AssetUploadContext,
  req: AssetUploadRequest,
): Promise<AssetUploadResult> {
  const authorized = checkAuthorScope(ctx.metadataProvider, ctx.contextUser);
  if (!authorized.ok) {
    return authorized;
  }

  const fileCheck = validateImage(req.file);
  if (!fileCheck.ok) {
    return fileCheck;
  }
  const file = req.file as ParsedFile;

  const formCheck = await resolveForm(ctx, req.formId);
  if (!formCheck.ok || !formCheck.formId) {
    return formCheck;
  }

  return storeAsset(ctx, file, formCheck.formId);
}

/**
 * Authorize an ASSET AUTHOR: Update on Forms. Deliberately a permission check and not an
 * identity-mode check — see the file header for why an anonymous session fails it.
 */
export function checkAuthorScope(provider: AssetMetadataProvider, user: UserInfo): AssetUploadResult {
  const entity = provider.EntityByName(FORM_ENTITY);
  if (!entity) {
    return failUpload(500, `Entity "${FORM_ENTITY}" is not present in metadata.`);
  }
  if (!entity.GetUserPermisions(user).CanUpdate) {
    return failUpload(403, 'You do not have permission to upload images for this form.');
  }
  return { ok: true };
}

/** Presence, size cap and image-type allowlist, all fail-closed. */
export function validateImage(file: ParsedFile | undefined): AssetUploadResult {
  if (!file) {
    return failUpload(400, 'No file part found in the upload.');
  }
  const cfg = getAssetConfig();
  if (file.data.length === 0) {
    return failUpload(400, 'The selected file is empty.');
  }
  if (file.data.length > cfg.maxBytes) {
    return failUpload(413, `Image exceeds the maximum size of ${formatBytes(cfg.maxBytes)}.`);
  }
  if (!assetTypeAllowed(file.contentType, cfg.allowedTypes)) {
    return failUpload(415, `"${bareContentType(file.contentType)}" is not an accepted image type.`);
  }
  return { ok: true };
}

/**
 * The form must exist and be visible to the CALLER. Run under the caller's context on purpose:
 * an elevated read here would let any author write assets into any tenant's form folder.
 */
async function resolveForm(
  ctx: AssetUploadContext,
  formId: string | undefined,
): Promise<AssetUploadResult & { formId?: string }> {
  const wanted = formId?.trim();
  if (!wanted) {
    return failUpload(400, 'Missing required field "formId".');
  }
  if (!GUID_PATTERN.test(wanted)) {
    return failUpload(400, 'Field "formId" is not a valid id.');
  }
  // The GUID check above IS the injection guard — a value matching that pattern cannot carry a
  // quote — so the filter interpolates it directly rather than adding a second escaping rule.
  const view = await ctx.runViewProvider.RunView<{ ID: string }>(
    {
      EntityName: FORM_ENTITY,
      ExtraFilter: `ID = '${wanted}'`,
      ResultType: 'simple',
      Fields: ['ID'],
      MaxRows: 1,
    },
    ctx.contextUser,
  );
  if (!view.Success) {
    return failUpload(500, `Could not look up the form: ${view.ErrorMessage ?? 'unknown error'}.`);
  }
  const found = view.Results?.[0];
  if (!found) {
    return failUpload(404, 'Form not found.');
  }
  // The DATABASE's spelling of the id, not the caller's — the storage path must not be able to
  // disagree with the row about which form an asset belongs to.
  return { ok: true, formId: found.ID };
}

/** Store the bytes under the public asset prefix and shape the success body. */
async function storeAsset(
  ctx: AssetUploadContext,
  file: ParsedFile,
  formId: string,
): Promise<AssetUploadResult> {
  const cfg = getAssetConfig();
  const writer = ctx.elevatedUser ?? ctx.contextUser;
  const fileName = safeFileName(file.filename);
  try {
    await ctx.storage.Config(false, writer);
    // Checked explicitly rather than left to the engine's throw. A brand-new MJ instance has
    // providers but no ACCOUNT, so this is the single likeliest failure here — and the engine's
    // own message ("FileStorageEngine.UploadFile: no file storage accounts configured") tells an
    // author writing a thank-you screen nothing about what to do next.
    if (!ctx.storage.HasStorageAccounts) {
      return failUpload(
        503,
        'Image uploads are not set up on this MemberJunction instance yet — an administrator ' +
          'needs to add a File Storage Account. You can paste an image URL instead.',
      );
    }
    const stored = await ctx.storage.UploadFile({
      content: file.data,
      fileName,
      mimeType: bareContentType(file.contentType),
      contextUser: writer,
      storageAccountId: cfg.storageAccountId,
      pathPrefix: assetPathPrefix(formId),
    });
    return {
      ok: true,
      success: {
        fileId: stored.FileID,
        name: fileName,
        size: file.data.length,
        contentType: bareContentType(file.contentType),
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    LogError(`[Forms] Asset upload failed for form ${formId}: ${detail}`);
    return failUpload(500, `File storage is not available: ${detail}`);
  }
}

/**
 * Read one stored asset's bytes for the anonymous route.
 *
 * Every rejection is a flat 404 with the same wording. That is deliberate: distinguishing
 * "no such file" from "that file is not an asset" would turn this route into an oracle telling
 * an anonymous caller which `MJ: Files` ids exist.
 */
export async function loadAssetBytes(ctx: AssetReadContext, fileId: string): Promise<AssetReadResult> {
  const wanted = fileId?.trim();
  if (!wanted || !GUID_PATTERN.test(wanted)) {
    return failRead(404, 'Not found.');
  }

  let file: StoredAssetRecord | undefined;
  try {
    file = await ctx.loadFile(wanted, ctx.systemUser);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    LogError(`[Forms] Asset lookup failed for ${wanted}: ${detail}`);
    return failRead(500, 'Could not read the image.');
  }

  // THE GUARD. Nothing outside the public asset prefix is servable here, whatever it is.
  if (!file || !isPublicAssetKey(file.ProviderKey) || file.Status === 'Deleted') {
    return failRead(404, 'Not found.');
  }

  try {
    await ctx.storage.Config(false, ctx.systemUser);
    const accountId = resolveReadAccountId(ctx.storage, file.ProviderID);
    if (!accountId) {
      LogError(`[Forms] No storage account resolves for provider ${file.ProviderID} (asset ${wanted}).`);
      return failRead(500, 'Could not read the image.');
    }
    const driver = await ctx.storage.GetDriver(accountId, ctx.systemUser);
    const content = await driver.GetObject({ objectId: file.ProviderKey ?? undefined });
    return {
      ok: true,
      asset: {
        content,
        contentType: file.ContentType?.trim() || 'application/octet-stream',
        fileName: file.Name?.trim() || 'image',
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    LogError(`[Forms] Asset read failed for ${wanted}: ${detail}`);
    return failRead(500, 'Could not read the image.');
  }
}

/**
 * Which storage account to read through.
 *
 * `MJ: Files` records a PROVIDER, not an account, so a deployment with two accounts on one
 * provider is genuinely ambiguous at this level — MJ's model does not record which one held the
 * bytes. Preferring an account on the file's own provider is the closest available answer;
 * the configured/default account is the fallback for a provider with none.
 */
function resolveReadAccountId(storage: AssetReadStorage, providerId: string): string | undefined {
  const onProvider = storage.GetAccountsByProviderID(providerId);
  if (onProvider.length > 0) {
    return onProvider[0].ID;
  }
  return storage.ResolveStorageAccount(getAssetConfig().storageAccountId)?.account.ID;
}

/** Strip any `; charset=` parameter from a content type. */
function bareContentType(contentType: string): string {
  return contentType.split(';')[0].trim() || 'application/octet-stream';
}

/** Sanitize a client-supplied filename to a safe basename (no path traversal). */
function safeFileName(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = base
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'image';
}

/** Byte cap rendered for a person: authors read "5 MB", not "5242880 bytes". */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Number(mb.toFixed(mb % 1 === 0 ? 0 : 1))} MB` : `${Math.round(bytes / 1024)} KB`;
}
