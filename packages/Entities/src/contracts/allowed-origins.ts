/**
 * `FormDistribution.AllowedOrigins` — the browser origins permitted to embed one distribution —
 * and the closed grammar a single entry is held to (#203).
 *
 * WHAT LIVES HERE AND WHY IT IS PURE. The column is an authorization input read on two different
 * doors: the public submit path turns it into an admit/refuse verdict, and the respondent host
 * page turns it into a `Content-Security-Policy` header. Both must agree about what an authored
 * string means, so the grammar, the parse and the match are one pure module with no I/O and no MJ
 * types — importable from the server, the builder and a unit test alike. The server-side half of
 * the verdict (composing this policy with the API's OWN origin, which is what a real `<iframe>`
 * embed reports) deliberately does NOT live here: that is a deployment fact, and it lives in
 * `forms-server`'s `http/embed-origin.ts`.
 *
 * WHAT IT IS NOT. Defense in depth BEHIND the magic link, never a replacement for it. A
 * distribution's link is anonymous and multi-use by construction, so a leaked link is replayable
 * from anywhere until it closes; an allowlist only bounds that to pages the author named. Nothing
 * here weakens the case for a tight `CloseAt` / `MaxResponses`.
 *
 * WHY WILDCARDS ARE A REFUSAL RATHER THAN AN OMISSION. `*.acme.com` is the entry every author
 * reaches for, and it is why origin allowlists fail in practice: on shared hosting it admits
 * `evil.acme.com`, and implementations disagree about whether it spans schemes and ports. An
 * author who needs three subdomains names three origins. Refusing the pattern outright is louder
 * than accepting-and-ignoring it, and the difference matters: an author who writes `*.acme.com`
 * and is told nothing believes they restricted something, which is strictly worse than having no
 * allowlist at all.
 *
 * WHY AUTHORED-BUT-UNUSABLE IS CLOSED. Invalid JSON, or a list in which every entry fails the
 * grammar, refuses everything rather than falling back to unrestricted. Somebody wrote a value
 * plainly meant to restrict something; of the three answers available (restrict as written,
 * restrict nothing, restrict everything), quietly restricting nothing is the only one that turns
 * an author's intent into its opposite.
 *
 * The per-entry grammar is `bizapps-caliber`'s `Step.AllowedOrigins`
 * (`packages/Entities/src/config/allowed-origins.ts`), unchanged — issue #203's third acceptance
 * criterion. Only the CONTAINER differs (a plain JSON array here, a keyed object there, because a
 * Caliber step inherits down a company chain and must be able to tombstone an inherited origin,
 * while a Forms distribution is a leaf authored whole). `migrations/V202609121200__*.sql` carries
 * the full argument for the column and that divergence.
 */

import type { JSONValue } from './json-value';

/** Schemes an embed may use. `http` is permitted only for loopback — see {@link normalizeOrigin}. */
const ALLOWED_SCHEMES = ['https:', 'http:'] as const;

/** Hosts for which plain `http` is accepted, so local development is authorable without a proxy. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

/**
 * The one description of what a usable entry looks like.
 *
 * A single constant so an author, a refusal log line and a builder hint never say three slightly
 * different things about the same rule — they would believe none of them.
 */
export const ALLOWED_ORIGIN_GRAMMAR =
  'a full browser origin — scheme://host with an optional port, no path, query, fragment or '
  + 'wildcard (e.g. https://careers.acme.com or https://careers.acme.com:8443). '
  + 'http is accepted only for localhost.';

/**
 * Canonicalises an authored origin to the browser's own spelling, or returns `null` when it is
 * not an origin at all.
 *
 * Returning the browser's spelling — lowercase scheme and host, a port only when it is not the
 * scheme default, never a trailing slash — is what lets a stored value be compared with an
 * `Origin` header by string equality. Both sides are run through this same function, so the two
 * cannot normalise differently.
 *
 * Refused, deliberately: a path, query or fragment (the author wrote a page, and honouring it
 * would silently match every page on the host); a wildcard anywhere; `http` on a non-loopback
 * host (a plaintext embed host cannot be authenticated, so the entry would be satisfiable by any
 * network attacker); and credentials, which no `Origin` header ever carries.
 */
export function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.includes('*')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a URL at all. The caller decides what to say about it — `parseAllowedOrigins` names it
    // in its refusal reason, the builder shows it back to the author — so nothing is swallowed.
    return null;
  }
  if (!(ALLOWED_SCHEMES as readonly string[]).includes(url.protocol)) {
    return null;
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return null;
  }
  // `new URL('https://acme.com')` yields pathname '/', which is the no-path case. Anything longer
  // — or any query/fragment — means the author wrote a page, not an origin.
  if (url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:' && !(LOOPBACK_HOSTS as readonly string[]).includes(host)) {
    return null;
  }
  // `url.host` keeps a non-default port and drops a default one — exactly the browser's rule.
  return `${url.protocol}//${url.host.toLowerCase()}`;
}

/** What a distribution's `AllowedOrigins` column means for one request. */
export type EmbedOriginPolicy =
  | { kind: 'unrestricted' }
  | { kind: 'allowlist'; origins: readonly string[] }
  | { kind: 'closed'; reason: string };

/**
 * Reads the column into the policy one request is judged against.
 *
 * Three outcomes, and the asymmetry between the last two is the point:
 *
 *   - NULL, blank or `[]` is UNRESTRICTED. Every distribution is NULL until an author sets one,
 *     so this is what keeps every live embed working unchanged.
 *   - A list with SOME unusable entries keeps the usable ones and drops the rest. Dropping an
 *     entry can only ever make the allowlist smaller, so the result is never more permissive than
 *     what the author wrote — the failure direction that matters is closed off by construction.
 *     (The authoring path in the builder refuses the whole edit instead, so the drop is a safety
 *     net for a value written elsewhere, not the normal way an entry goes missing.)
 *   - A list with NOTHING usable is CLOSED, not unrestricted. The same reasoning inverts here:
 *     falling back to unrestricted would turn an author's attempt to restrict into no restriction
 *     at all, which is the one answer that silently does the opposite of what was asked. Closed is
 *     wrong loudly, and `reason` says exactly which entries caused it.
 */
export function parseAllowedOrigins(raw: string | null | undefined): EmbedOriginPolicy {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return { kind: 'unrestricted' };
  }
  let parsed: JSONValue;
  try {
    parsed = JSON.parse(raw) as JSONValue;
  } catch {
    return { kind: 'closed', reason: `AllowedOrigins is not valid JSON: ${truncate(raw)}` };
  }
  if (!Array.isArray(parsed)) {
    return {
      kind: 'closed',
      reason: `AllowedOrigins must be a JSON array of origin strings; got ${typeof parsed}. ${ALLOWED_ORIGIN_GRAMMAR}`,
    };
  }
  if (parsed.length === 0) {
    return { kind: 'unrestricted' };
  }
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const entry of parsed) {
    const normalized = typeof entry === 'string' ? normalizeOrigin(entry) : null;
    if (normalized === null) {
      rejected.push(typeof entry === 'string' ? entry : JSON.stringify(entry));
    } else if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  if (origins.length === 0) {
    return {
      kind: 'closed',
      reason: `AllowedOrigins named ${rejected.length} entr${rejected.length === 1 ? 'y' : 'ies'} `
        + `and none is usable (${rejected.join(', ')}). Expected ${ALLOWED_ORIGIN_GRAMMAR}`,
    };
  }
  return { kind: 'allowlist', origins };
}

/**
 * Whether one caller's `Origin` is admitted by a policy.
 *
 * An ABSENT origin is admitted under `unrestricted` and refused under a list, and that asymmetry
 * is the whole fail-closed doctrine in one line: a caller that will not say where it came from
 * cannot be checked against a list of places, and admitting it anyway would make every list
 * decorative — a control that reports success and does nothing.
 *
 * Say the consequence out loud rather than discovering it in the field: a non-browser client
 * (curl, a server-to-server integration, anything scripted) sends no `Origin` at all and is
 * therefore refused by any distribution that has authored a list. That is the intent, not a gap.
 * A link that must serve such a caller leaves `AllowedOrigins` NULL.
 *
 * Pure, and both sides go through {@link normalizeOrigin}, so the caller's casing and default-port
 * spelling cannot make a listed origin miss.
 */
export function isOriginAdmitted(
  origin: string | null | undefined,
  policy: EmbedOriginPolicy,
): boolean {
  if (policy.kind === 'unrestricted') {
    return true;
  }
  if (policy.kind === 'closed' || typeof origin !== 'string') {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  return normalized !== null && policy.origins.includes(normalized);
}

/**
 * The `Content-Security-Policy` value the respondent host page sends, or `undefined` for none.
 *
 * `'self'` is ALWAYS in the list. Our own surfaces frame this page — the builder's preview and
 * anything else served same-origin — and an author naming their careers site is not asking for
 * our own preview to go blank. `'self'` costs nothing they did not already have: a page can
 * always frame itself.
 *
 * No `X-Frame-Options` is emitted here or anywhere else, and that is a decision rather than an
 * oversight. It cannot express a list — `ALLOW-FROM` is unsupported in every current browser —
 * so the only values available are `DENY` and `SAMEORIGIN`, and sending `SAMEORIGIN` beside a
 * permissive `frame-ancestors` would refuse precisely the third-party embeds this feature exists
 * to enable. A browser too old for `frame-ancestors` therefore gets no framing control at all,
 * which is exactly today's behaviour and is stated rather than papered over.
 */
export function frameAncestorsDirective(policy: EmbedOriginPolicy): string | undefined {
  if (policy.kind === 'unrestricted') {
    return undefined;
  }
  if (policy.kind === 'closed') {
    return "frame-ancestors 'none'";
  }
  return `frame-ancestors 'self' ${policy.origins.join(' ')}`;
}

/**
 * Reads an author's free-text block into the origins it names and the entries it got wrong.
 *
 * Newlines and commas both separate, because an author pasting a list will use whichever their
 * source used. `rejected` is returned rather than dropped so the builder can refuse the whole
 * edit and show the offending strings back — the one place a bad entry should never disappear
 * quietly is the screen where it was typed.
 */
export function authorAllowedOrigins(authored: string): { origins: string[]; rejected: string[] } {
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const entry of authored.split(/[\n,]/).map((part) => part.trim()).filter((part) => part.length > 0)) {
    const normalized = normalizeOrigin(entry);
    if (normalized === null) {
      rejected.push(entry);
    } else if (!origins.includes(normalized)) {
      origins.push(normalized);
    }
  }
  return { origins, rejected };
}

/**
 * The column value for a list of origins — `null` for an empty one, which is the only way an
 * author clears a distribution back to unrestricted.
 */
export function serializeAllowedOrigins(origins: readonly string[]): string | null {
  return origins.length === 0 ? null : JSON.stringify(origins);
}

/** Keep a refused value out of a log line's way while still naming it. */
function truncate(raw: string): string {
  const flat = raw.trim().replace(/\s+/g, ' ');
  return flat.length <= 80 ? flat : `${flat.slice(0, 77)}...`;
}
