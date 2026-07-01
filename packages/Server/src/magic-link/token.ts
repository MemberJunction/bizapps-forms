/**
 * Magic-link raw-token + hash primitives.
 *
 * These MUST byte-for-byte match MJ core's shipped redeem path
 * (`@memberjunction/server` `magicLinkCore`), which is not importable on 5.43.0
 * (blocked by the package `exports` map). The format is fixed and trivial:
 *  - raw token: `mj_ml_` + 32 random bytes, hex-encoded
 *  - stored hash: SHA-256 of the raw token, base64url-encoded
 * Redemption hashes the incoming raw token the same way and matches on `TokenHash`,
 * so any drift here would silently break redemption — keep these identical.
 */
import { randomBytes, createHash } from 'node:crypto';

/** Token prefix, mirroring MJ core (`mj_ml_`). */
export const MAGIC_LINK_TOKEN_PREFIX = 'mj_ml_';

/** Generates a cryptographically random raw magic-link token. */
export function generateRawToken(): string {
  return MAGIC_LINK_TOKEN_PREFIX + randomBytes(32).toString('hex');
}

/** SHA-256 hash of a raw token, base64url-encoded — only the hash is ever persisted. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('base64url');
}
