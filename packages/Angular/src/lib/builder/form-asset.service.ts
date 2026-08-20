/**
 * Uploads an image from the author's computer and returns the URL to store on the form.
 *
 * Why this exists at all: every image on a form — a welcome screen's picture, a thank-you
 * screen's, a logo, a page background, a picture-choice option — used to be a URL field, which
 * silently assumed the author already had the image hosted somewhere public. Most do not. This
 * service is the other half: hand it a `File`, get back a URL that behaves exactly like a pasted
 * one, so nothing downstream (the snapshot, the widget, the published definition) has to learn
 * that some URLs came from an upload.
 *
 * It POSTs `multipart/form-data` to MJAPI's `POST /forms/asset` under the EXPLORER session's
 * bearer token — a different route and a different identity from the widget's respondent upload,
 * which is anonymous and scoped to a distribution. The URL that comes back is absolute and
 * points at MJAPI's anonymous read route, because a respondent loading a published form has no
 * session and may be on a completely different origin.
 *
 * `XMLHttpRequest` rather than `fetch` for the same reason as the respondent uploader: it is the
 * only one that reports upload progress, and an author dragging in a 4 MB photo needs to see
 * that something is happening.
 */
import { Injectable } from '@angular/core';

import { resolveApiOrigin, resolveApiToken } from '../shared/mj-api-origin';

/** Route MJAPI serves the authoring-asset endpoints from. */
const ASSET_PATH = '/forms/asset';

/** What the server returns for a stored asset. */
export interface UploadedAsset {
  /** The `MJ: Files` record id. */
  fileId: string;
  /** Absolute, stable URL to store on the form. */
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
  const serverMessage =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['error'] : undefined;
  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage;
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
  return `Upload failed (HTTP ${status}). Please try again.`;
}

@Injectable({ providedIn: 'root' })
export class FormAssetService {
  /** True when there is an API origin and a session token to upload with. */
  public get canUpload(): boolean {
    return !!resolveApiOrigin() && !!resolveApiToken();
  }

  /** Upload one image for a form. Resolves with the stored asset, or rejects with a usable Error. */
  public upload(file: File, formId: string, onProgress?: AssetUploadProgress): Promise<UploadedAsset> {
    const origin = resolveApiOrigin();
    if (!origin) {
      return Promise.reject(new Error('Cannot upload: the MemberJunction API location is not configured.'));
    }
    return this.send(`${origin}${ASSET_PATH}`, buildAssetFormData(file, formId), onProgress);
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
          reject(new Error(assetErrorMessage(xhr.status, parsedBody)));
        }
      };
      xhr.onerror = (): void => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.onabort = (): void => reject(new Error('Upload cancelled.'));

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
