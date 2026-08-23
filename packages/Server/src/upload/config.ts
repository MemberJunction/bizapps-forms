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
 *  - `FORMS_UPLOAD_IP_MAX`          Max uploads per rate-limit window per client IP. Default 30.
 *  - `FORMS_UPLOAD_PATH_PREFIX`     Optional storage path prefix. Default `forms-uploads/<date>`.
 *                                   REFUSED if it lands under the authoring-asset prefix — see
 *                                   {@link assertUploadPrefixIsPrivate}.
 */

import { LogError } from '@memberjunction/core';

import { assertUploadPrefixIsPrivate, formatBytes } from '../asset/config.js';

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
    pathPrefix: privatePathPrefix(),
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

/**
 * The configured respondent-upload prefix, refusing one that would land these files under the
 * world-readable authoring-asset prefix. A misconfiguration here would publish every file a
 * respondent ever uploaded, so it fails loudly to the log and falls back rather than obeying.
 */
function privatePathPrefix(): string | undefined {
  const requested = process.env.FORMS_UPLOAD_PATH_PREFIX?.trim() || undefined;
  const verdict = assertUploadPrefixIsPrivate(requested);
  if (verdict.refused) {
    LogError(`[Forms] ${verdict.refused}`);
  }
  return verdict.prefix;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetUploadConfigForTests(): void {
  cached = undefined;
}

/**
 * Max uploads one caller may make per rate-limit window.
 *
 * Read per call rather than frozen into {@link getUploadConfig} so a test (and an operator
 * restarting with a new value) sees it without a cache reset; the read is a single env parse.
 * Generous by design — a respondent attaching several files to one form is ordinary — while
 * still bounding a caller who wants to write to storage in a loop.
 */
export function uploadRateLimitMax(): number {
  return numberFromEnv('FORMS_UPLOAD_IP_MAX', 30);
}

/**
 * Slack between the raw-body cap and the file cap, for the multipart envelope — boundary
 * lines, part headers, the field parts that travel beside the file.
 */
const MULTIPART_ENVELOPE_HEADROOM = 64 * 1024;

/**
 * Byte cap for the raw request body, deliberately ABOVE the file cap.
 *
 * The body reader is a memory guard, not the size policy. Capping the body at exactly
 * `maxBytes` made it the policy by accident: it fired before the file was ever inspected,
 * so a respondent who picked a slightly-too-big file read "Upload exceeds the maximum size
 * of 10485760 bytes" while the file check's own sentence was unreachable through the route.
 * It also rejected a file of exactly the limit, because the envelope pushed the body past
 * the cap — making the advertised limit a lie by a few hundred bytes.
 *
 * The authoring asset route hit this and fixed it; the PUBLIC upload route kept the bug,
 * which is the worse half — respondents cannot read source to work out what went wrong.
 */
export function uploadBodyCap(): number {
  return getUploadConfig().maxBytes + MULTIPART_ENVELOPE_HEADROOM;
}

/**
 * The one wording for "too big", shared by the body reader and the file check.
 *
 * Both can reject an oversized upload, at different layers and against different numbers,
 * and a respondent should not be able to tell which one fired.
 */
export function uploadTooLargeMessage(): string {
  return `That file is larger than the ${formatBytes(getUploadConfig().maxBytes)} limit.`;
}
