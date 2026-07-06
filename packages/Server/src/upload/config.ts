/**
 * Environment-driven configuration for the public file-upload endpoint (Task 3).
 *
 * Read once and memoized. Defaults are safe for local dev; production overrides via the
 * MJAPI `.env`. Size + content-type limits are enforced fail-closed by the middleware.
 *
 * Env vars:
 *  - `FORMS_UPLOAD_ENABLED`         `false` to turn the endpoint off. Default on.
 *  - `FORMS_UPLOAD_MAX_BYTES`       Max accepted file size in bytes. Default 10485760 (10 MiB).
 *  - `FORMS_UPLOAD_ALLOWED_TYPES`   Comma-separated content-type allowlist. A trailing `/*`
 *                                   wildcard matches a whole type family (e.g. `image/*`).
 *                                   Default: common images + PDF + plain text + office docs.
 *  - `FORMS_UPLOAD_STORAGE_ACCOUNT` Optional FileStorageAccount ID to force a specific
 *                                   account; when unset the engine uses the first active one.
 *  - `FORMS_UPLOAD_PATH_PREFIX`     Optional storage path prefix. Default `forms-uploads/<date>`.
 */

/** Route the public upload endpoint is served from (the frozen widget contract). */
export const UPLOAD_ROUTE = '/forms/upload';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Frozen, validated configuration for the upload endpoint. */
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  allowedTypes: readonly string[];
  storageAccountId: string | undefined;
  pathPrefix: string | undefined;
}

/** Numeric env read with a default; non-positive/invalid falls back to the default. */
function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Parse the comma-separated allowlist, lowercased/trimmed; empty falls back to the default. */
function allowedTypesFromEnv(): readonly string[] {
  const raw = process.env.FORMS_UPLOAD_ALLOWED_TYPES?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_TYPES;
  }
  const parsed = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_TYPES;
}

let cached: UploadConfig | undefined;

/** Read (and memoize) the upload configuration from the environment. */
export function getUploadConfig(): UploadConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    enabled: process.env.FORMS_UPLOAD_ENABLED?.trim() !== 'false',
    maxBytes: numberFromEnv('FORMS_UPLOAD_MAX_BYTES', DEFAULT_MAX_BYTES),
    allowedTypes: allowedTypesFromEnv(),
    storageAccountId: process.env.FORMS_UPLOAD_STORAGE_ACCOUNT?.trim() || undefined,
    pathPrefix: process.env.FORMS_UPLOAD_PATH_PREFIX?.trim() || undefined,
  });
  return cached;
}

/**
 * Whether `contentType` is permitted. Matches exact types and `family/*` wildcards
 * (case-insensitive). A blank/undefined content type is rejected (fail-closed).
 */
export function contentTypeAllowed(contentType: string | undefined, allowed: readonly string[]): boolean {
  const ct = contentType?.trim().toLowerCase();
  if (!ct) {
    return false;
  }
  // Strip any `; charset=...` parameter for comparison.
  const bare = ct.split(';')[0].trim();
  const family = bare.split('/')[0];
  return allowed.some((entry) => {
    if (entry.endsWith('/*')) {
      return entry.slice(0, -2) === family;
    }
    return entry === bare;
  });
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetUploadConfigForTests(): void {
  cached = undefined;
}
