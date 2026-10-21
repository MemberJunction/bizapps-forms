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
import { UploadError, type IFormsUploadService, type UploadedFile, type UploadProgress } from './form-upload.interface';

/**
 * How long an upload may go without any sign of life — upload progress, the body finishing, or
 * response progress — before it is aborted as stalled.
 *
 * Without it a dead connection the browser had not noticed fired no event, so the upload never
 * settled: the store's capped retries never got their turn, and a submit waiting on the file sat
 * under "Saving your file…" for good. A stall rejects as `transient`, so the store retries it on
 * its schedule; this bounds each attempt and the schedule bounds the whole wait (#248).
 */
export const UPLOAD_STALL_MS = 30_000;

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
  if (isVerdictOnFile(status)) {
    return 'That file was not accepted. Choose a different file.';
  }
  return 'The upload did not go through. Please try again.';
}

/**
 * Whether a response status judges the FILE, so that only a different file can succeed.
 *
 * A 4xx from this endpoint is mostly that — size, content type, an unknown question, a closed
 * form — but not all of it. 429 is the endpoint's own per-caller rate limit
 * (`UploadMiddleware.refuseIfRateLimited`, "Too many uploads. Please wait Ns and try again."), and
 * 408 is a request that timed out; both judge the moment, and the same bytes land once it passes.
 * Called "refused", a 429'd drawing was never sent again: the only link offered erased it, and
 * Submit-again skipped it.
 */
function isVerdictOnFile(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * The rejection for a non-2xx upload response: the respondent's sentence plus which kind of
 * failure it is.
 *
 * The sentence and the kind read the same judgement ({@link isVerdictOnFile}), so "choose a
 * different file" and the store's decision not to retry cannot disagree. Everything else,
 * including a 5xx and the status 0 a dropped connection reports, is `transient`.
 */
export function uploadFailure(status: number, body: unknown): UploadError {
  return new UploadError(uploadErrorMessage(status, body), isVerdictOnFile(status) ? 'refused' : 'transient');
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
   * metadata (store `fileId` as the answer) or rejects with an {@link UploadError} whose
   * `kind` tells the store whether a retry can help. A 2xx whose body cannot be parsed
   * rejects with a plain `Error`, which the store treats as transient.
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
      // Refused, not transient: a missing endpoint is configuration, and no retry can fix it.
      return Promise.reject(new UploadError('Uploads are not available for this form.', 'refused'));
    }
    const body = buildUploadFormData(file, distributionSlug, questionId, responseId);
    return this.send(url, body, onProgress);
  }

  /** The resolved upload endpoint (explicit config wins; else derived from GraphQL URL). */
  private endpoint(): string {
    return this.config.uploadUrl || deriveUploadUrl(this.config.graphqlUrl);
  }

  /**
   * XHR POST with upload-progress + typed JSON parsing, and a stall watchdog.
   *
   * Every outcome goes through `settle`, so the first one wins and every one of them stops the
   * watchdog. That ordering is what lets a stall report itself: the watchdog settles with the stall
   * error BEFORE aborting, so the `abort` event that follows finds the promise already settled and
   * its "Upload cancelled." is dropped.
   */
  private send(url: string, body: FormData, onProgress?: UploadProgress): Promise<UploadedFile> {
    return new Promise<UploadedFile>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;

      const settle = (finish: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(stallTimer);
        finish();
      };
      /** (Re)start the countdown to declaring the request stalled; called on every sign of life. */
      const watchForStall = (): void => {
        if (settled) {
          return;
        }
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          settle(() => reject(new UploadError('The upload stalled. Check your connection and try again.', 'transient')));
          xhr.abort();
        }, UPLOAD_STALL_MS);
      };

      xhr.open('POST', url);
      if (this.config.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.config.token}`);
      }
      xhr.responseType = 'json';

      if (xhr.upload) {
        xhr.upload.onprogress = (e: ProgressEvent): void => {
          watchForStall();
          onProgress?.(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
        };
        // The body is all sent; the server is now storing it, which can be slow but is not a stall.
        xhr.upload.onload = (): void => watchForStall();
      }
      xhr.onprogress = (): void => watchForStall();

      xhr.onload = (): void => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const stored = parseUploadResponse(this.readBody(xhr));
            settle(() => resolve(stored));
          } catch (err) {
            settle(() => reject(err instanceof Error ? err : new Error('Upload failed.')));
          }
        } else {
          // `xhr.response`, never `xhr.responseText`: reading responseText while
          // responseType is 'json' throws InvalidStateError, and it throws INSIDE onload —
          // so the promise never settles, the widget sits at "Uploading … 100%" forever,
          // and Submit stays blocked behind an upload the server already answered.
          settle(() => reject(uploadFailure(xhr.status, xhr.response)));
        }
      };
      // Both transient: no response means nothing was judged, so the next attempt may land.
      xhr.onerror = (): void =>
        settle(() => reject(new UploadError('Upload failed. Check your connection and try again.', 'transient')));
      xhr.onabort = (): void => settle(() => reject(new UploadError('Upload cancelled.', 'transient')));

      xhr.send(body);
      // Armed only once the request is on its way: if `send` throws, the executor rejects and
      // there is no timer left behind to fire later.
      watchForStall();
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
