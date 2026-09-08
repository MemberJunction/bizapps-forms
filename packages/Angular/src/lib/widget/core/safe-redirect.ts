/**
 * Whether a respondent-facing redirect URL may be followed.
 *
 * An ending-screen or disqualification `redirectURL` is AUTHOR-controlled content, and the widget
 * follows it with `window.location.assign` **on whatever third-party site embeds the form**. So a
 * `javascript:` (or `data:`) URL here is not a redirect at all — it is script execution in the
 * embedding page's origin, reachable from a compromised builder account and landing on careers
 * pages and customer sites that never see our code.
 *
 * The server drops these too, at both mutation chokepoints. This half is still load-bearing rather
 * than belt-and-braces: `mj-form.component.ts` also follows `outcome.screen.redirectURL` read
 * straight from the PUBLISHED DEFINITION, without asking the server, so on that path this check is
 * the only one there is.
 *
 * Lives here, as a pure function, because the alternative is a private method on a component that
 * cannot be instantiated without the whole widget runtime — which is how it came to ship untested.
 */

/** Schemes a respondent redirect may use. Everything else — including relative — is judged below. */
const ALLOWED_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/** Why a URL was refused, for the log line. `null` means it is safe to follow. */
export type RedirectRefusal = { reason: 'unparseable' } | { reason: 'scheme'; protocol: string } | null;

/**
 * Judge `url` as resolved against `baseHref` (the page the widget is running in).
 *
 * Parsed WITH the base so a RELATIVE url is judged too rather than waved through: the WHATWG
 * parser strips tabs, newlines and leading control characters and lower-cases the scheme before
 * it decides anything, so `java<TAB>script:` and `JAVASCRIPT:` both resolve to the `javascript:`
 * protocol here instead of sliding past as "no scheme, must be relative".
 */
export function judgeRedirect(url: string, baseHref: string): RedirectRefusal {
  let parsed: URL;
  try {
    parsed = new URL(url, baseHref);
  } catch {
    return { reason: 'unparseable' };
  }
  return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? null : { reason: 'scheme', protocol: parsed.protocol };
}

/** The sentence written to the console when a redirect is refused. */
export function redirectRefusalMessage(url: string, refusal: NonNullable<RedirectRefusal>): string {
  return refusal.reason === 'unparseable'
    ? `[mj-form] ignoring an unparseable redirect URL: ${url}`
    : `[mj-form] ignoring a redirect URL with a disallowed scheme (${refusal.protocol}); only http(s) redirects are followed.`;
}
