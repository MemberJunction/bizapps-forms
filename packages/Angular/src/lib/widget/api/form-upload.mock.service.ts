/**
 * Preview stand-in for {@link FormUploadService}.
 *
 * The builder's Preview modal runs the widget with an empty {@link FormsApiConfig} so a trial
 * submission writes nothing. That leaves nowhere to PUT a file either — which is why this
 * exists. It accepts the bytes, drops them, and answers with the metadata the respondent UI
 * needs, so an author can draw a signature or pick a file, watch the same states a respondent
 * will, satisfy a required file question, and reach the ending screen. Nothing leaves the page.
 *
 * The `fileId` is deliberately a `preview-…` string rather than a plausible GUID: it is only
 * ever held in memory by a mock submit, and anything that did try to resolve it should fail
 * loudly instead of chasing a well-formed id that was never stored.
 *
 * Mirrors {@link FormsMockApiService}, including its simulated latency — the progress bar and
 * the "Saving signature…" state are part of what the author is previewing.
 */
import { Injectable } from '@angular/core';

import type { IFormsUploadService, UploadedFile, UploadProgress } from './form-upload.interface';

/** Matches FormsMockApiService.simulateLatency, so preview pacing is consistent. */
const SIMULATED_LATENCY_MS = 250;

@Injectable()
export class FormsMockUploadService implements IFormsUploadService {
  /** Per-instance, and an instance is per-host, so ids are unique within one preview. */
  private stored = 0;

  public async upload(
    file: File,
    _distributionSlug: string,
    _questionId: string,
    onProgress?: UploadProgress,
    _responseId?: string,
  ): Promise<UploadedFile> {
    onProgress?.(0);
    await new Promise<void>((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
    onProgress?.(1);

    this.stored += 1;
    return {
      fileId: `preview-file-${this.stored}`,
      name: file.name,
      size: file.size,
      contentType: file.type,
    };
  }
}
