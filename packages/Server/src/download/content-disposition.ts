/**
 * Build the `Content-Disposition` header that makes a browser SAVE a file rather than show it.
 *
 * Its own tested module because the filename half is genuinely fiddly and gets shipped wrong all
 * the time. Three things have to hold at once:
 *
 *  - `attachment` is what turns a click into a download. Without it a PNG signature opens in the
 *    tab and the reader has to right-click-save, which is the behaviour this route exists to
 *    replace.
 *  - The quoted `filename=` parameter is ASCII-only per RFC 6266. A résumé called `Lebenslauf
 *    Müller.pdf` cannot go in it, and a raw non-ASCII byte in a header is rejected by Node's HTTP
 *    layer outright — an exception on the response, not a cosmetic problem.
 *  - A quote or backslash inside the name ends the quoted string early, which is header injection
 *    if the rest of the name is chosen carefully. Filenames here come from respondents.
 *
 * So: a stripped ASCII fallback for old clients, plus the RFC 5987 `filename*` form carrying the
 * real UTF-8 name, which every current browser prefers.
 */

/** Used when a name is missing entirely, or when stripping leaves nothing usable. */
export const FALLBACK_FILE_NAME = 'download';

/**
 * `attachment; filename="..."; filename*=UTF-8''...`
 *
 * The `filename*` parameter is omitted when the name is already plain ASCII — it would be a
 * byte-for-byte repeat of the fallback, and a header that says the same thing twice is a header
 * two implementations can disagree about.
 */
export function attachmentDisposition(rawName: string | null | undefined): string {
  const name = basename(rawName ?? '');
  const ascii = asciiFallback(name);
  if (name === ascii && !needsEncoding(name)) {
    return `attachment; filename="${ascii}"`;
  }
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(name)}`;
}

/**
 * Strip any directory part.
 *
 * A stored name is not supposed to contain one, but `Content-Disposition` is a download
 * INSTRUCTION and a name like `../../.bashrc` is worth refusing to pass on regardless of what
 * the receiving browser would have done with it.
 */
function basename(value: string): string {
  const trimmed = value.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
  return trimmed === '.' || trimmed === '..' ? '' : trimmed;
}

/**
 * The ASCII-only name for the quoted parameter.
 *
 * Control characters, quotes and backslashes go entirely — those are the header-injection
 * characters. Everything else non-ASCII becomes `_` so the shape of the name survives:
 * `Lebenslauf_M_ller.pdf` is still recognisably the file that was uploaded.
 */
function asciiFallback(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/["\\]/g, '').replace(/[\u0000-\u001f\u007f]/g, '');
  const ascii = [...cleaned].map((ch) => (ch.charCodeAt(0) < 128 ? ch : '_')).join('').trim();
  // A name that transliterates to nothing but underscores and dots — `世界` becomes `__` — is
  // worse than no name at all: it tells the reader nothing and looks like a bug. The real name
  // still travels in `filename*`, which every current browser prefers, so the fallback only
  // shows up on clients that could not have rendered the original anyway.
  return /[A-Za-z0-9]/.test(ascii) ? ascii : FALLBACK_FILE_NAME;
}

/** True when the name contains anything the quoted ASCII form cannot carry faithfully. */
function needsEncoding(name: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\u0020-\u007e]|["\\]/.test(name) || name.length === 0;
}

/**
 * Percent-encode for RFC 5987, which is stricter than `encodeURIComponent`.
 *
 * `encodeURIComponent` leaves `!'()*` unescaped; `'` in particular is the delimiter of the
 * `UTF-8''` form, so a file called `Bob's CV.pdf` would truncate the parameter without this.
 */
function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
