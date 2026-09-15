/**
 * Download one respondent-uploaded file from the Responses tab.
 *
 * WHY A FETCH-THEN-SAVE RATHER THAN A LINK. The route requires the Explorer session's bearer
 * token, and an `<a href>` or `window.open` cannot carry a header — the browser would arrive
 * unauthenticated and be turned away. So the bytes are fetched with the token, wrapped in a blob,
 * and handed to a synthetic link that has only to save something already in memory.
 *
 * The object URL is revoked on the next frame rather than immediately: revoking before the
 * browser has started the save cancels it in Safari, and never revoking leaks the whole file for
 * the lifetime of the page — which for a reviewer working through a list of applications is every
 * résumé they opened.
 */
import { Injectable } from '@angular/core';
import { LogError } from '@memberjunction/core';

import { resolveApiOrigin, resolveApiToken } from '../shared/mj-api-origin';
import { downloadErrorMessage, downloadUrl } from './response-file-download';

/** What a download attempt produced. `error` is set only on failure. */
export interface DownloadOutcome {
  ok: boolean;
  error?: string;
}

@Injectable()
export class ResponseFileDownloadService {
  /**
   * Fetch one file and save it under `fileName`.
   *
   * Never throws: the caller renders whatever comes back beside the file it belongs to, and a
   * rejected promise would leave the reader with a spinner that stopped for no stated reason.
   */
  public async download(fileId: string, fileName: string): Promise<DownloadOutcome> {
    const url = downloadUrl(resolveApiOrigin(), fileId);
    if (!url) {
      return { ok: false, error: 'Downloads are not available — the API address is not configured.' };
    }

    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers(), credentials: 'omit' });
    } catch (err) {
      LogError(err);
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }

    if (!response.ok) {
      // The body carries the server's own sentence; a failure to read it must not replace a
      // useful message with a parsing error.
      const body = await response.text().catch(() => '');
      return { ok: false, error: downloadErrorMessage(response.status, body) };
    }

    try {
      this.save(await response.blob(), fileName);
      return { ok: true };
    } catch (err) {
      LogError(err);
      return { ok: false, error: 'The file arrived but could not be saved.' };
    }
  }

  private headers(): Record<string, string> {
    const token = resolveApiToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /** Hand the blob to the browser's own save flow. */
  private save(blob: Blob, fileName: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName || 'download';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // See the class comment: not sooner (Safari cancels the save), not never (the bytes leak).
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
