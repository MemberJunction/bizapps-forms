/**
 * Seam S1-upload — the binary transport a `FileUpload` or `Signature` answer travels on.
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
