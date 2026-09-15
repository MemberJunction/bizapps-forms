/**
 * Which image formats the builder offers, and how the limit is worded.
 *
 * Deliberately a plain module rather than constants inside `ImageFieldComponent`: this is policy,
 * not presentation, and keeping it separate is what lets it be tested at all — the package's
 * vitest runs in a node environment with no Angular JIT compiler, so anything importable from a
 * spec must not be a component.
 *
 * These values MIRROR the server's defaults (`FORMS_ASSET_ALLOWED_TYPES`, `FORMS_ASSET_MAX_BYTES`)
 * and cannot read them — the client has no view of the server's environment. They are therefore a
 * HINT and a courtesy: the server's allowlist is the authority, and its refusal is what the author
 * is shown if an operator has configured something different.
 */

/** Accepted content types, mirroring the server's default allowlist. */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** Value for an `<input type="file">` `accept` attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

/** Human-readable formats, for the line under the dropzone. */
export const ACCEPTED_FORMATS_LABEL = 'PNG, JPG, GIF or WebP';

/** Mirrors the server's `FORMS_ASSET_MAX_BYTES` default. Same caveat as the type list above. */
export const MAX_SIZE_LABEL = '5 MB';

/**
 * Whether a browser-reported content type is one the server will accept.
 *
 * Screening locally duplicates a check the server also performs, on purpose: refusing a PDF here
 * is instant, whereas the same refusal from the server costs an upload and, for a large file, a
 * real wait. Only the server's check matters for correctness; this one saves the author time.
 */
export function isAcceptedType(contentType: string): boolean {
  const bare = contentType.split(';')[0].trim().toLowerCase();
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(bare);
}
