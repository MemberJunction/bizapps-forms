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
import { serverErrorText } from '../../shared/server-error-text';
import type { IFormsUploadService, UploadedFile, UploadProgress } from './form-upload.interface';

/**
 * Build the multipart body for an upload. Pure + framework-free so the field wiring
 * (which the server matches on) is unit-testable. Field names mirror the WP-B seam:
 * `file`, `distributionSlug`, `questionId`, `responseId`.
 *
 * `responseId` is the widget's client-minted response id, and it is what later proves this file
 * belongs to this respondent's submission. The anonymous session id cannot do that job — it is
 * legitimately blank in ordinary public-link flows — so without this field the server can only
 * scope an upload to a distribution, which on a public form is no scope at all. Omitted when the
 * caller has no id yet; the server's lenient mode exists for exactly that window.
 */
export function buildUploadFormData(
  file: File,
  distributionSlug: string,
  questionId: string,
  responseId?: string,
): FormData {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('distributionSlug', distributionSlug);
  body.append('questionId', questionId);
  if (responseId) {
    body.append('responseId', responseId);
  }
  return body;
}

/**
 * The sentence a respondent should read when an upload fails.
 *
 * The server already writes a usable explanation for every refusal it makes — the file is
 * too big, the content type is not allowed — and the widget used to discard it and show
 * `Upload failed (HTTP 415). Please try again.` instead. That is two failures in one
 * line: it names a number that means nothing outside a spec, and it prescribes an action
 * that cannot possibly work. A 413 and a 415 are verdicts on the FILE; retrying the same
 * one produces the same answer forever, and the respondent has no way to guess that what
 * they actually need is a different file.
 *
 * So the server's message wins whenever there is one, and the fallbacks distinguish the
 * two situations that matter: something wrong with the file (pick another) and something
 * wrong at the moment (try again).
 */
export function uploadErrorMessage(status: number, body: unknown): string {
  const fromServer = serverErrorText(body);
  if (fromServer) {
    return fromServer;
  }
  // 4xx here is always a judgement about this file — the endpoint's own failures are
  // size, content type, an unknown question, or a closed form. None improve on a retry.
  if (status >= 400 && status < 500) {
    return 'That file was not accepted. Try a different file.';
  }
  return 'The upload did not go through. Please try again.';
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
export class FormUploadService implements IFormsUploadService {
  private readonly config = inject(FORMS_API_CONFIG);

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
    responseId?: string,
  ): Promise<UploadedFile> {
    const url = this.endpoint();
    if (!url) {
      return Promise.reject(new Error('Uploads are not available for this form.'));
    }
    const body = buildUploadFormData(file, distributionSlug, questionId, responseId);
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
          // `xhr.response`, never `xhr.responseText`: reading responseText while
          // responseType is 'json' throws InvalidStateError, and it throws INSIDE onload —
          // so the promise never settles, the widget sits at "Uploading … 100%" forever,
          // and Submit stays blocked behind an upload the server already answered.
          reject(new Error(uploadErrorMessage(xhr.status, xhr.response)));
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
