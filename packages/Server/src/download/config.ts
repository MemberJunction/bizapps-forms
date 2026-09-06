/**
 * Configuration for the response-file download route (`GET /forms/files/:fileId`).
 *
 * Its own module rather than a corner of `asset/config.ts`, because the two answer opposite
 * questions. The asset route serves bytes that are PUBLIC BY LOCATION — anything under
 * `forms-assets/` renders for a respondent with no session at all. This route serves the exact
 * opposite: respondent-uploaded answers, a résumé or a drawing, which must never be readable
 * without a session. Keeping the two configurations apart keeps the two invariants apart.
 *
 * Env vars:
 *  - `FORMS_DOWNLOAD_ENABLED`         `false` to turn the route off. Default on.
 *  - `FORMS_DOWNLOAD_STORAGE_ACCOUNT` Optional FileStorageAccount ID used only when the file's
 *                                     own provider has no account; unset uses the first account.
 */

/** Base path the download route hangs off; the file id is the next path segment. */
export const DOWNLOAD_ROUTE = '/forms/files';

/** What this route sends back. */
export interface DownloadConfig {
  enabled: boolean;
  storageAccountId?: string;
}

let cached: Readonly<DownloadConfig> | undefined;

/** Read (and memoize) the download configuration from the environment. */
export function getDownloadConfig(): Readonly<DownloadConfig> {
  if (!cached) {
    cached = Object.freeze({
      enabled: (process.env.FORMS_DOWNLOAD_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
      storageAccountId: process.env.FORMS_DOWNLOAD_STORAGE_ACCOUNT?.trim() || undefined,
    });
  }
  return cached;
}

/** Test seam: drop the memoized configuration. */
export function resetDownloadConfigCache(): void {
  cached = undefined;
}

/**
 * Response headers for a served file.
 *
 * `no-store` because these are one person's answers and a shared cache has no business holding
 * them. `nosniff` because the stored content type is respondent-supplied at heart: without it a
 * browser may sniff a text/plain upload into HTML and run it on the API origin.
 */
export const DOWNLOAD_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
});

/**
 * The file id from `/forms/files/<id>`, or undefined when the path is not this route.
 *
 * Lives here rather than beside the handler so it can be tested at all: importing the middleware
 * pulls in `@memberjunction/server`, which loads and validates MJ's configuration at import time
 * and throws without a database. Route shape is exactly the kind of thing worth a test, so it
 * belongs in a module a test can import.
 *
 * A single trailing segment is all that is accepted: `/forms/files/a/b` is not a request for `a`,
 * and treating it as one is how a route that looks strict starts matching things nobody intended.
 */
export function fileIdFromPath(path: string): string | undefined {
  if (!path.startsWith(`${DOWNLOAD_ROUTE}/`)) {
    return undefined;
  }
  const rest = path.slice(DOWNLOAD_ROUTE.length + 1);
  return rest.length > 0 && !rest.includes('/') ? decodeURIComponent(rest) : undefined;
}
