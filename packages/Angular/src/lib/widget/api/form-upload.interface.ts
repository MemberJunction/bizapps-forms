/**
 * Seam S1-upload — the binary transport a `FileUpload` or `Doodle` answer travels on.
 *
 * Sibling of {@link IFormsApiService}: the widget codes only against this interface so the
 * real XHR transport ({@link FormUploadService}) and the preview stand-in
 * ({@link FormsMockUploadService}) are interchangeable. Both are bound by
 * `formsWidgetProviders` from the SAME `graphqlUrl` test that picks the read/submit
 * transport, so a host can never end up previewing with a live uploader or submitting to
 * a mock with a real one.
 *
 * Binary uploads cannot ride the GraphQL transport, which is why this is a second seam
 * rather than two more methods on the first one.
 */
import { InjectionToken } from '@angular/core';

/** Metadata for a stored upload. `fileId` is what the widget keeps as the answer value. */
export interface UploadedFile {
  fileId: string;
  name: string;
  size: number;
  contentType: string;
}

/** Progress callback: fraction 0–1 of bytes sent, or `null` when indeterminate. */
export type UploadProgress = (fraction: number | null) => void;

/**
 * The two kinds of upload failure, which call for opposite responses.
 *
 * `refused` is a verdict on the file or the form — too big, a type the question does not take, no
 * upload endpoint configured. Sending the same bytes again gets the same answer, so a retry only
 * delays the moment the respondent learns they must choose a different file. `transient` is a
 * verdict on the moment — a 5xx, a dropped connection, an abort — and the next attempt may land.
 */
export type UploadFailureKind = 'refused' | 'transient';

/**
 * A rejection from {@link IFormsUploadService.upload} that says which kind of failure it is.
 *
 * It lives on the seam, not in the XHR transport, because the caller that decides whether to retry
 * (the upload store) must not have to know which transport is bound. A transport that rejects with
 * a plain `Error` is still legal; the store treats anything that is not an `UploadError` as
 * transient, because guessing "refused" would give up on an upload a retry could have saved.
 */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly kind: UploadFailureKind,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/** The upload contract. `distributionSlug` + `responseId` scope the file to one submission. */
export interface IFormsUploadService {
  upload(
    file: File,
    distributionSlug: string,
    questionId: string,
    onProgress?: UploadProgress,
    responseId?: string,
  ): Promise<UploadedFile>;
}

/** DI token for the active {@link IFormsUploadService}; components inject this, not a class. */
export const FORMS_UPLOAD_SERVICE = new InjectionToken<IFormsUploadService>('FORMS_UPLOAD_SERVICE');
