/**
 * Configuration for the authoring-asset routes (`POST /forms/asset`, `GET /forms/asset/:id`).
 *
 * Separate from `upload/config.ts` on purpose: that endpoint serves ANONYMOUS RESPONDENTS
 * uploading answers, this one serves AUTHENTICATED AUTHORS uploading form artwork. The two
 * differ in who may call them, what they accept, and — the load-bearing difference — whether
 * what they store is readable without a login.
 *
 * ── The public-prefix invariant ─────────────────────────────────────────────────────────────
 * A welcome-screen image has to load for an anonymous respondent on the public internet, from a
 * URL that keeps working for as long as the form is published. That rules out a pre-signed
 * provider URL (they expire) and rules out serving every `MJ: Files` record by id (that would
 * hand out every résumé a respondent ever uploaded). So the guard is WHERE THE BYTES LIVE:
 *
 *     everything under `forms-assets/` is world-readable through `GET /forms/asset/:id`,
 *     and nothing else is.
 *
 * {@link ASSET_STORAGE_PREFIX} is therefore a CONSTANT, not an env var — an operator who could
 * point it at the respondent-upload prefix would publish every uploaded file, and that is not a
 * knob worth offering. For the same reason {@link assertUploadPrefixIsPrivate} rejects a
 * `FORMS_UPLOAD_PATH_PREFIX` that lands under it.
 *
 * Env vars:
 *  - `FORMS_ASSET_ENABLED`         `false` to turn both routes off. Default on.
 *  - `FORMS_ASSET_MAX_BYTES`       Max accepted image size in bytes. Default 5242880 (5 MiB).
 *  - `FORMS_ASSET_ALLOWED_TYPES`   Comma-separated content-type allowlist. Default: PNG, JPEG,
 *                                  GIF and WebP. See the SVG note below before adding it.
 *  - `FORMS_ASSET_STORAGE_ACCOUNT` Optional FileStorageAccount ID; unset uses the first account.
 *  - `MJAPI_PUBLIC_URL`            Origin the returned absolute asset URL is built against
 *                                  (shared with the respondent host page).
 */

/** Base path both asset routes hang off. */
export const ASSET_ROUTE = '/forms/asset';

/**
 * Storage path prefix that MEANS "publicly readable". Deliberately not configurable — see the
 * public-prefix invariant above.
 */
export const ASSET_STORAGE_PREFIX = 'forms-assets';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Raster image types only.
 *
 * SVG is excluded by default even though it is the obvious logo format: we serve these bytes
 * from the MJAPI origin, and an SVG is a document that can carry `<script>`. In an `<img>` tag
 * that script is inert, but a respondent who opens the asset URL directly is running author
 * -supplied markup on the API origin. An operator who accepts that can add `image/svg+xml` to
 * `FORMS_ASSET_ALLOWED_TYPES`; the response headers ({@link ASSET_RESPONSE_HEADERS}) already
 * carry the CSP and nosniff that make it survivable.
 */
const DEFAULT_ALLOWED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Headers every asset response carries.
 *
 * `immutable` is honest here rather than optimistic: an asset URL names one `MJ: Files` record,
 * and replacing a screen's image mints a NEW file with a NEW id, so the bytes behind a given URL
 * never change. The CSP + nosniff pair is what keeps a stored document from being treated as an
 * active one on our origin.
 */
export const ASSET_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Content-Disposition': 'inline',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
});

/** Frozen, validated configuration for the asset routes. */
export interface AssetConfig {
  enabled: boolean;
  maxBytes: number;
  allowedTypes: readonly string[];
  storageAccountId: string | undefined;
}

let cached: AssetConfig | undefined;

/** Read (and memoize) the asset configuration from the environment. */
export function getAssetConfig(): AssetConfig {
  if (cached) {
    return cached;
  }
  cached = Object.freeze({
    enabled: process.env.FORMS_ASSET_ENABLED?.trim() !== 'false',
    maxBytes: positiveNumberFromEnv('FORMS_ASSET_MAX_BYTES', DEFAULT_MAX_BYTES),
    allowedTypes: allowedTypesFromEnv(),
    storageAccountId: process.env.FORMS_ASSET_STORAGE_ACCOUNT?.trim() || undefined,
  });
  return cached;
}

/**
 * The storage path an asset for `formId` is written under. Keeping the form id in the path makes
 * a bucket listing legible and gives a future cleanup job something to select on; it is NOT an
 * access control — {@link ASSET_STORAGE_PREFIX} is what decides readability.
 */
export function assetPathPrefix(formId: string): string {
  return `${ASSET_STORAGE_PREFIX}/${formId}`;
}

/** True when a stored object's provider key sits under the public asset prefix. */
export function isPublicAssetKey(providerKey: string | null | undefined): boolean {
  return typeof providerKey === 'string' && providerKey.startsWith(`${ASSET_STORAGE_PREFIX}/`);
}

/**
 * Absolute, stable URL for one stored asset.
 *
 * Absolute rather than relative because `<mj-form>` is an embeddable custom element: on a
 * customer's own page a relative `/forms/asset/…` resolves against THEIR origin and 404s.
 * `MJAPI_PUBLIC_URL` is the same setting the respondent host page builds its links from;
 * `requestOrigin` is the dev fallback for a host that has not set it.
 */
export function assetPublicUrl(fileId: string, requestOrigin?: string): string {
  const base = (process.env.MJAPI_PUBLIC_URL?.trim() || requestOrigin || 'http://localhost:4121').replace(/\/+$/, '');
  return `${base}${ASSET_ROUTE}/${encodeURIComponent(fileId)}`;
}

/**
 * Guard the public-prefix invariant against the one configuration that would break it: a
 * respondent-upload prefix pointing into the asset tree, which would make every uploaded answer
 * file world-readable. Returns the prefix to use — the caller's, or `undefined` to fall back to
 * the default — and the reason when one was refused.
 */
export function assertUploadPrefixIsPrivate(prefix: string | undefined): { prefix: string | undefined; refused?: string } {
  if (prefix && (prefix === ASSET_STORAGE_PREFIX || prefix.startsWith(`${ASSET_STORAGE_PREFIX}/`))) {
    return {
      prefix: undefined,
      refused:
        `FORMS_UPLOAD_PATH_PREFIX may not sit under "${ASSET_STORAGE_PREFIX}/" — everything there is ` +
        'served without authentication. Falling back to the default respondent-upload prefix.',
    };
  }
  return { prefix };
}

/**
 * Whether `contentType` is permitted. Matches exact types and `family/*` wildcards
 * (case-insensitive); a blank content type is rejected (fail-closed).
 */
export function assetTypeAllowed(contentType: string | undefined, allowed: readonly string[]): boolean {
  const bare = contentType?.split(';')[0].trim().toLowerCase();
  if (!bare) {
    return false;
  }
  const family = bare.split('/')[0];
  return allowed.some((entry) => (entry.endsWith('/*') ? entry.slice(0, -2) === family : entry === bare));
}

function positiveNumberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedTypesFromEnv(): readonly string[] {
  const raw = process.env.FORMS_ASSET_ALLOWED_TYPES?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_TYPES;
  }
  const parsed = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_TYPES;
}

/** Test-only: clear the memoized config so env changes take effect. */
export function resetAssetConfigForTests(): void {
  cached = undefined;
}
