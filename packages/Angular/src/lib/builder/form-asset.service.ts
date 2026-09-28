/**
 * Uploads an image from the author's computer and returns the URL to store on the form.
 *
 * Why this exists at all: every image on a form — a welcome screen's picture, a thank-you
 * screen's, a logo, a page background, a picture-choice option — used to be a URL field, which
 * silently assumed the author already had the image hosted somewhere public. Most do not. This
 * service is the other half: hand it a `File`, get back the stored asset.
 *
 * It POSTs `multipart/form-data` to MJAPI's `POST /forms/asset` under the EXPLORER session's
 * bearer token — a different route and a different identity from the widget's respondent upload,
 * which is anonymous and scoped to a distribution. The URL that comes back is ABSOLUTE and points
 * at MJAPI's anonymous read route — a convenience (it is clickable), not what the form stores. The
 * builder stores `toAssetRef(url)`, the host-independent `/forms/asset/<id>`, and every renderer
 * resolves that against the API it is talking to: an absolute URL names whichever MJAPI took the
 * upload, often `localhost`, and broke every form served from anywhere else (#270). See
 * `../widget/core/asset-ref.ts`.
 *
 * Before sending, the image is shrunk in the browser (`image-optimize.ts`): at most 1600 px on its
 * longest side, re-encoded as WebP where the browser can. Published forms otherwise made every
 * respondent download the author's original, often a multi-megabyte phone photo.
 *
 * `XMLHttpRequest` rather than `fetch` for the same reason as the respondent uploader: it is the
 * only one that reports upload progress, and an author dragging in a 4 MB photo needs to see
 * that something is happening.
 */
import { Injectable } from '@angular/core';

import { resolveApiBase, resolveApiToken } from '../shared/mj-api-origin';
import { serverErrorText } from '../shared/server-error-text';
// The upload POST and the anonymous read share one route, so one constant names both.
import { ASSET_ROUTE } from '../widget/core/asset-ref';
import { optimizeImageForUpload } from './image-optimize';

/** What the server returns for a stored asset. */
export interface UploadedAsset {
  /** The `MJ: Files` record id. */
  fileId: string;
  /**
   * Absolute URL of the uploading MJAPI's read route. Do NOT store it as-is: store
   * `toAssetRef(url)` so the form keeps working on any host (#270).
   */
  url: string;
  name: string;
  size: number;
  contentType: string;
}

/** Progress callback: fraction 0–1 of bytes sent, or `null` when indeterminate. */
export type AssetUploadProgress = (fraction: number | null) => void;

/**
 * Build the multipart body. Pure and framework-free so the field wiring the server matches on
 * is unit-testable without an HTTP stack.
 */
export function buildAssetFormData(file: File, formId: string): FormData {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('formId', formId);
  return body;
}

/**
 * Parse the raw `POST /forms/asset` response, throwing an author-facing error when the shape is
 * wrong. A response with no `url` is useless — storing a blank would look like a successful
 * upload that quietly cleared the field.
 */
export function parseAssetResponse(raw: unknown): UploadedAsset {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Upload failed: unexpected server response.');
  }
  const obj = raw as Record<string, unknown>;
  const url = obj['url'];
  const fileId = obj['fileId'];
  if (typeof url !== 'string' || url.length === 0 || typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('Upload failed: the server did not return an image URL.');
  }
  return {
    fileId,
    url,
    name: typeof obj['name'] === 'string' ? obj['name'] : '',
    size: typeof obj['size'] === 'number' ? obj['size'] : 0,
    contentType: typeof obj['contentType'] === 'string' ? obj['contentType'] : '',
  };
}

/**
 * Turn a failed response into something an author can act on.
 *
 * The server's own message is preferred where there is one — it is the only thing that can say
 * *why* (too large, wrong type, no permission). The status-based fallbacks exist because a
 * proxy or a crash can produce a bare status with no body.
 */
export function assetErrorMessage(status: number, body: unknown): string {
  const fromServer = serverErrorText(body);
  if (fromServer) {
    return fromServer;
  }
  if (status === 401 || status === 403) {
    return 'You do not have permission to upload images for this form.';
  }
  if (status === 413) {
    return 'That image is too large.';
  }
  if (status === 415) {
    return 'That file is not an image we can use.';
  }
  // Deliberately names neither a status code nor a retry for the remaining 4xx: those are
  // verdicts on the FILE, and retrying the same one produces the same answer forever.
  if (status >= 400 && status < 500) {
    return 'That image was not accepted. Try a different file.';
  }
  return 'The upload did not go through. Please try again.';
}

/** An upload that failed, with the HTTP status (0 for a network error or abort). Its message is author-facing. */
export class AssetUploadError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AssetUploadError';
  }
}

/**
 * Whether to send the author's original after the optimized file was refused. Only a 415 counts,
 * and only when the optimizer changed the file: an operator's `FORMS_ASSET_ALLOWED_TYPES` may omit
 * `image/webp`, which would otherwise reject a JPEG the author never converted. Any other failure
 * is a verdict on the file, and retrying it produces the same answer.
 */
export function shouldRetryWithOriginal(error: unknown, optimized: File, original: File): boolean {
  return error instanceof AssetUploadError && error.status === 415 && optimized !== original;
}

@Injectable({ providedIn: 'root' })
export class FormAssetService {
  /** True when there is an API location and a session token to upload with. */
  public get canUpload(): boolean {
    return !!resolveApiBase() && !!resolveApiToken();
  }

  /**
   * Upload one image for a form. Resolves with the stored asset, or rejects with a usable Error.
   * The file is shrunk first (`image-optimize.ts`); when shrinking cannot help, or the server refuses the shrunk file's type (415), the original is sent.
   */
  public async upload(file: File, formId: string, onProgress?: AssetUploadProgress): Promise<UploadedAsset> {
    // The API BASE, not its origin: an MJAPI reverse-proxied at `/api` takes the upload at
    // `/api/forms/asset`, and the bare origin would post past it (#270).
    const apiBase = resolveApiBase();
    if (!apiBase) {
      throw new Error('Cannot upload: the MemberJunction API location is not configured.');
    }
    const optimized = await optimizeImageForUpload(file);
    const url = `${apiBase}${ASSET_ROUTE}`;
    try {
      return await this.send(url, buildAssetFormData(optimized, formId), onProgress);
    } catch (err) {
      if (!shouldRetryWithOriginal(err, optimized, file)) {
        throw err;
      }
      // At most ONE retry, by construction: this second send is outside the try, and a 415 on the
      // original (optimized === file) is never retried.
      console.warn(`[Forms] Server rejected the optimized "${optimized.name}" (${optimized.type}); uploading the original "${file.name}" instead.`);
      return this.send(url, buildAssetFormData(file, formId), onProgress);
    }
  }

  /** XHR POST with upload-progress and typed JSON parsing. */
  private send(url: string, body: FormData, onProgress?: AssetUploadProgress): Promise<UploadedAsset> {
    return new Promise<UploadedAsset>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      const token = resolveApiToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.responseType = 'json';

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e: ProgressEvent): void =>
          onProgress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
      }

      xhr.onload = (): void => {
        const parsedBody = readBody(xhr);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(parseAssetResponse(parsedBody));
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Upload failed.'));
          }
        } else {
          reject(new AssetUploadError(assetErrorMessage(xhr.status, parsedBody), xhr.status));
        }
      };
      xhr.onerror = (): void => reject(new AssetUploadError('Upload failed. Check your connection and try again.', 0));
      xhr.onabort = (): void => reject(new AssetUploadError('Upload cancelled.', 0));

      xhr.send(body);
    });
  }
}

/** Read the XHR body whether it arrived parsed or as text; never throws. */
function readBody(xhr: XMLHttpRequest): unknown {
  if (xhr.response && typeof xhr.response === 'object') {
    return xhr.response;
  }
  const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
