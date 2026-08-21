/**
 * Where an AI-generated image's bytes actually go: the SAME pipeline a human upload takes.
 *
 * ── ONE PATH INTO STORAGE, DELIBERATELY. ─────────────────────────────────────────────────────
 * This routes through `runAssetUpload` rather than calling `FileStorageEngine.UploadFile` directly,
 * so a generated image inherits every constraint an author's upload already has: the 5 MiB cap, the
 * raster-only allowlist (SVG stays excluded — it is a document that can carry `<script>`, and these
 * bytes are served from the API origin), the public `forms-assets/` prefix that makes the URL
 * loadable by an anonymous respondent, and the immutable-cache headers.
 *
 * A second path with its own rules is a second set of rules to keep right, and the one most likely
 * to drift is the one nobody looks at. An AI-generated file is not more trustworthy than an
 * uploaded one — if anything it is less, since nobody chose it.
 *
 * ── WHY IT WRITES AS THE AUTHOR AND NOT AS A SERVICE PRINCIPAL. ──────────────────────────────
 * `runAssetUpload` checks Update-on-Forms against the caller, which is what proves this author may
 * write assets for this form at all. Elevation applies only to the `MJ: Files` row itself, exactly
 * as it does for a human upload, because an ordinary author role carries no Files grant on a clean
 * install.
 */
import { LogError, Metadata, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';
import {
  setGeneratedImageStore,
  type GeneratedImageStore,
  type StoredGeneratedImage,
} from '@mj-biz-apps/forms-actions';

import { runAssetUpload } from '../asset/asset.service.js';
import { assetPublicUrl } from '../asset/config.js';

/** Stores generated images through the authoring-asset pipeline. */
export class AssetPipelineImageStore implements GeneratedImageStore {
  async store(
    formId: string,
    bytes: Uint8Array,
    contentType: string,
    fileName: string,
    contextUser: UserInfo,
  ): Promise<StoredGeneratedImage> {
    const metadata = new Metadata();
    const result = await runAssetUpload(
      {
        contextUser,
        metadataProvider: metadata,
        runViewProvider: new RunView(),
        storage: FileStorageEngine.Instance,
        // The `MJ: Files` row is written as the system user, exactly as a human upload's is
        // (`AssetMiddleware`). Omitting this made the header above describe behaviour the code did
        // not have: the row was written as the AUTHOR, who carries no Files grant on a clean
        // install — so every generated picture failed at the Files insert while the upload button
        // beside it worked. Update-on-Forms is still checked against the caller; only the Files
        // row is elevated, which is the whole scope of the elevation.
        elevatedUser: UserCache.Instance.GetSystemUser(),
      },
      {
        // `Buffer.from(bytes)` rather than a cast: the asset pipeline hands these to
        // `FileStorageEngine.UploadFile`, which wants a real Buffer, and a Uint8Array that merely
        // satisfies the type would fail at the provider rather than here.
        // `fieldName` is the multipart part name a browser would have sent. There is no browser
        // here, so it names the origin instead — it reaches nothing but logs, and "file" would say
        // less than nothing about where these bytes came from.
        file: { fieldName: 'generated', data: Buffer.from(bytes), filename: fileName, contentType },
        formId,
      },
    );

    if (!result.ok || !result.success) {
      // Thrown rather than returned: the image stage's whole contract is that a failure degrades
      // ONE picture, and it can only do that if it is told which one failed and why.
      throw new Error(result.failure?.error ?? 'The image could not be stored.');
    }
    return { url: assetPublicUrl(result.success.fileId) };
  }
}

/**
 * Install the store.
 *
 * Called at MODULE LOAD as well as from the startup export, for the same reason the progress
 * publisher is: MJAPI evaluates this package by importing `RESOLVER_PATHS` without necessarily
 * calling `LoadBizAppsFormsServer()`, and a registration stranded in that function never runs.
 * Its symptom would be forms that silently never get pictures.
 */
export function installGeneratedImageStore(): void {
  try {
    setGeneratedImageStore(new AssetPipelineImageStore());
  } catch (error) {
    LogError(
      '[Forms authoring] Could not install the generated-image store; generated forms will be ' +
        `built without pictures. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
