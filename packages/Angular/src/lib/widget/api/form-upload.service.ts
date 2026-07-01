/**
 * Anonymous file-upload transport for FileUpload questions.
 *
 * The widget cannot use the GraphQL transport for binary uploads, so it POSTs a
 * `multipart/form-data` body to MJAPI's `POST /forms/upload` route (seam with WP-B),
 * authenticated by the SAME anonymous magic-link bearer token the GraphQL transport
 * uses ({@link FormsApiConfig.token}). The server stores the file as an `MJ: Files`
 * record scoped to the distribution and returns its `fileId`, which the widget stores
 * as the question's answer value (mapped to `FormResponseAnswer.FileID` at submit).
 *
 * `XMLHttpRequest` is used rather than `fetch` solely because it exposes upload
 * progress events, which the respondent-facing UI needs for a real progress bar.
 */
import { Injectable, inject } from '@angular/core';

import { FORMS_API_CONFIG, deriveUploadUrl } from './forms-api.config';

/** Metadata the server returns for a successfully-stored upload. */
export interface UploadedFile {
  fileId: string;
  name: string;
  size: number;
  contentType: string;
}

/** Progress callback: fraction 0–1 of bytes sent, or `null` when indeterminate. */
export type UploadProgress = (fraction: number | null) => void;

/**
 * Build the multipart body for an upload. Pure + framework-free so the field wiring
 * (which the server matches on) is unit-testable. Field names mirror the WP-B seam:
 * `file`, `distributionSlug`, `questionId`.
 */
export function buildUploadFormData(
  file: File,
  distributionSlug: string,
  questionId: string,
): FormData {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('distributionSlug', distributionSlug);
  body.append('questionId', questionId);
  return body;
}

/**
 * Parse the raw `POST /forms/upload` JSON response into an {@link UploadedFile},
 * throwing a respondent-friendly error when the shape is wrong. Pure + testable.
 */
export function parseUploadResponse(raw: unknown): UploadedFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Upload failed: unexpected server response.');
  }
  const obj = raw as Record<string, unknown>;
  const fileId = obj['fileId'];
  if (typeof fileId !== 'string' || fileId.length === 0) {
    throw new Error('Upload failed: no file id returned.');
  }
  return {
    fileId,
    name: typeof obj['name'] === 'string' ? obj['name'] : '',
    size: typeof obj['size'] === 'number' ? obj['size'] : 0,
    contentType: typeof obj['contentType'] === 'string' ? obj['contentType'] : '',
  };
}

@Injectable()
export class FormUploadService {
  private readonly config = inject(FORMS_API_CONFIG);

  /** True when the widget has an endpoint + token to upload with. */
  public get canUpload(): boolean {
    return !!this.endpoint() && !!this.config.token;
  }

  /**
   * Upload one file for a FileUpload question. Resolves with the stored file's
   * metadata (store `fileId` as the answer) or rejects with a friendly Error the
   * caller can surface inline for retry.
   */
  public upload(
    file: File,
    distributionSlug: string,
    questionId: string,
    onProgress?: UploadProgress,
  ): Promise<UploadedFile> {
    const url = this.endpoint();
    if (!url) {
      return Promise.reject(new Error('Uploads are not available for this form.'));
    }
    const body = buildUploadFormData(file, distributionSlug, questionId);
    return this.send(url, body, onProgress);
  }

  /** The resolved upload endpoint (explicit config wins; else derived from GraphQL URL). */
  private endpoint(): string {
    return this.config.uploadUrl || deriveUploadUrl(this.config.graphqlUrl);
  }

  /** XHR POST with upload-progress + typed JSON parsing. */
  private send(url: string, body: FormData, onProgress?: UploadProgress): Promise<UploadedFile> {
    return new Promise<UploadedFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      if (this.config.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.config.token}`);
      }
      xhr.responseType = 'json';

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e: ProgressEvent): void =>
          onProgress(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
      }

      xhr.onload = (): void => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(parseUploadResponse(this.readBody(xhr)));
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Upload failed.'));
          }
        } else {
          reject(new Error(`Upload failed (HTTP ${xhr.status}). Please try again.`));
        }
      };
      xhr.onerror = (): void => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.onabort = (): void => reject(new Error('Upload cancelled.'));

      xhr.send(body);
    });
  }

  /** Read the XHR body whether it arrived as parsed JSON or a raw string. */
  private readBody(xhr: XMLHttpRequest): unknown {
    if (xhr.response && typeof xhr.response === 'object') {
      return xhr.response;
    }
    const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Upload failed: could not read server response.');
    }
  }
}
