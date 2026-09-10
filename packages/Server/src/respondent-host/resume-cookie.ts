/**
 * The device pointer's cookie — the ONLY thing a resumed browser holds (#138).
 *
 * It carries a magic-link token and nothing else. Not the answers, not the response id, not the
 * session: a pointer the server can turn into a read path, which is revocable, audited by core's
 * use counting, and worthless to anyone who cannot present it to this origin.
 *
 * Every attribute closes something specific:
 *   - `HttpOnly` — no script on the page can read it, including a customer's analytics tags.
 *   - `Secure` — it never travels in clear (see `secure` below for the one deliberate exception).
 *   - `SameSite=Lax` — it is not sent on a cross-site POST, which is what makes the resume route
 *     CSRF-safe without a token of its own.
 *   - `Path=/f/<slug>` — it reaches that ONE form's routes and nothing else. Two forms on the same
 *     host never see each other's pointer, and the GraphQL endpoint never receives it at all, which
 *     is why the submission contract does not mention cookies.
 *
 * Hand-rolled rather than a cookie library: this is four attributes and one parse, both of which
 * have to be exactly right, and a dependency would hide them behind defaults that change.
 */

/** One cookie per form path, so the name never has to be qualified. */
export const RESUME_COOKIE_NAME = 'mjf_resume';

/** What a cookie is being written for. */
export interface ResumeCookieOptions {
  /** The RAW invite token. The server stores only its hash, as core does for every invite. */
  token: string;
  /** The distribution slug whose route this cookie is scoped to. */
  slug: string;
  /** Remaining life, in seconds — sized to the invite's expiry so the two die together. */
  maxAgeSeconds: number;
  /**
   * Whether to mark it `Secure`.
   *
   * Off ONLY where a host serves the respondent page over plain http — a local harness, or a
   * private network without TLS. Chrome and Firefox accept a `Secure` cookie on `http://localhost`,
   * but not every browser a smoke run uses does, and "turn resume off" is a poor answer to that. It
   * is config-driven rather than sniffed so it cannot silently degrade in production.
   */
  secure: boolean;
}

/** The `Set-Cookie` header value that plants the pointer. */
export function buildResumeCookie(options: ResumeCookieOptions): string {
  return [
    `${RESUME_COOKIE_NAME}=${encodeURIComponent(options.token)}`,
    `Path=${cookiePathFor(options.slug)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    'HttpOnly',
    ...(options.secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');
}

/**
 * The `Set-Cookie` header value that removes it.
 *
 * The PATH has to match the one it was written with, exactly: a browser keys a cookie on
 * (name, domain, path), so a clear sent for a different path plants a second, empty cookie beside
 * the live one and leaves the pointer exactly where it was. That is why the slug is required here
 * rather than optional.
 */
export function clearResumeCookieHeader(slug: string, secure: boolean): string {
  return buildResumeCookie({ token: '', slug, maxAgeSeconds: 0, secure });
}

/**
 * The path a form's cookie is scoped to.
 *
 * The slug arrives from the URL and is therefore attacker-controlled, so it is percent-encoded: an
 * unencoded `;` or space would end the Path attribute and let the rest of the slug become
 * attributes of its own — a `Domain=` among them would widen the cookie to every host in a parent
 * domain. `encodeURIComponent` leaves the characters a real slug uses (letters, digits, `-`)
 * untouched, so this changes nothing for legitimate input.
 */
function cookiePathFor(slug: string): string {
  return `/f/${encodeURIComponent(slug)}`;
}

/**
 * The pointer this request carries, or `undefined`.
 *
 * Parses the raw `Cookie` header rather than depending on a body-parser being mounted, because
 * these routes run pre-auth on a middleware chain this package does not own. Tolerant of the
 * spacing browsers actually send, and of a cookie jar holding others.
 *
 * An EMPTY value is `undefined`, not `''`: a cleared cookie lingers as `mjf_resume=` until the
 * browser drops it, and treating that as a pointer would send the resume route off to redeem the
 * empty string on every load.
 */
export function readResumeCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    if (part.slice(0, index).trim() !== RESUME_COOKIE_NAME) {
      continue;
    }
    const raw = part.slice(index + 1).trim();
    if (raw === '') {
      return undefined;
    }
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed percent-escape is not a pointer we can present to core. Treat it as absent —
      // the respondent gets a fresh form, which is this feature's failure mode everywhere else too.
      return undefined;
    }
  }
  return undefined;
}
