/**
 * Generate a stable, unguessable client response id — the widget's primary idempotency
 * key for partial autosaves + the final submit (see FORMS_BUILD_PLAN §4 / the submit
 * lifecycle hardening).
 *
 * One id is minted ONCE per form load and sent on EVERY save so all of them target one
 * FormResponse row regardless of debounce/network timing or a blank server session id.
 * The id is a v4-shaped UUID: `crypto.randomUUID()` when available (all modern browsers
 * over HTTPS, Node 19+), else a `crypto.getRandomValues`-seeded fallback, else a
 * last-resort `Math.random` fallback for environments with no Web Crypto at all.
 *
 * The value is used verbatim as the FormResponse primary key server-side, so it MUST be a
 * syntactically valid uniqueidentifier — every branch below returns canonical UUID text.
 */

/** Return a fresh v4-shaped UUID string, degrading gracefully when Web Crypto is absent. */
export function generateClientResponseId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    return uuidFromBytes(c.getRandomValues(new Uint8Array(16)));
  }
  return uuidFromBytes(mathRandomBytes());
}

/** Format 16 bytes as a canonical v4 UUID (sets the version + variant bits). */
function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/** Non-cryptographic 16-byte fallback for the (rare) no-Web-Crypto environment. */
function mathRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}
