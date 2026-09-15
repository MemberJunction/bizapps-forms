/**
 * The server-derived identity of a public HTTP caller, and the seam that carries it from the
 * Express pipeline to a GraphQL resolver.
 *
 * WHY THIS EXISTS. The public-submit rate limiter used to key on `UserPayload.sessionId`, which
 * MJ populates from the `x-session-id` request header (`@memberjunction/server` context.ts
 * `extractAuthInputs`). A header is chosen by the caller, so rotating it landed every request in
 * a fresh bucket and the limit never tripped — and each accepted completion fires on-submit
 * automations (a confirmation email to an attacker-chosen address, an LLM run, entity upserts).
 * An abuse ceiling has to be keyed on something the caller cannot pick.
 *
 * WHY ASYNCLOCALSTORAGE. The resolver's `AppContext` is `{dataSource, userPayload, queryRunner,
 * dataSources, providers}` — there is no `req`, so there is no IP to read at the point the
 * decision is made, and adding one means forking `@memberjunction/server`. MJ does expose
 * `BaseServerMiddleware.GetPreAuthMiddleware()`, which is mounted before both the auth middleware
 * and the Apollo handler, so a request-scoped store established there is still in scope inside
 * the resolver. ALS is the standard carrier for that: it follows the async continuation chain and
 * cannot leak between concurrent requests the way a module-level variable would.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { sessionHashSalt } from './hash-salt.js';

/** The slice of an Express request needed to identify the caller. */
export interface IdentifiableRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/**
 * The client IP to key abuse controls on.
 *
 * `trustedProxyHops` is the number of proxies WE operate in front of the API, and it is the whole
 * security argument: `X-Forwarded-For` is append-only and world-writable at its left end, so the
 * only entries that mean anything are the right-most `trustedProxyHops` of them — each written by
 * a hop we control. Reading the left-most entry (the common shortcut) hands the key straight back
 * to the caller. At zero hops nothing in the header is trustworthy and only the socket peer is.
 */
export function resolveClientIp(req: IdentifiableRequest, trustedProxyHops: number): string | undefined {
  const socketIp = req.socket?.remoteAddress?.trim() || undefined;
  if (trustedProxyHops <= 0) {
    return socketIp;
  }
  const forwarded = forwardedForEntries(req.headers['x-forwarded-for']);
  const index = forwarded.length - trustedProxyHops;
  return index >= 0 ? forwarded[index] : socketIp;
}

/** Split an `X-Forwarded-For` header (possibly repeated, possibly comma-joined) into entries. */
function forwardedForEntries(raw: string | string[] | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  return joined
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * The one-way abuse key for a client IP.
 *
 * Salted with `FORMS_SESSION_HASH_SALT` — deliberately the SAME secret `hashSessionId` uses, so
 * a deployment has one salt to set and rotate rather than two, one of which it will forget.
 * Sharing a salt is only safe because BOTH sides tag their preimage: `ip:` here, `sid:` there.
 * With a tag on one side only, `x-session-id: ip:203.0.113.7` would have produced a session hash
 * byte-identical to that address's IP hash — a header the caller writes, colliding with a value
 * derived precisely because they cannot write it.
 *
 * Hashed rather than stored raw because this value reaches a log line and a bucket key, and a
 * raw IP in either is personal data we have no reason to keep.
 */
export function hashClientIp(ip: string): string {
  return createHash('sha256').update(`${ipHashSalt()}:ip:${normalizeIpForKeying(ip)}`).digest('hex');
}

/**
 * The address we are willing to hand to ANOTHER SERVICE as an address, or nothing.
 *
 * `resolveClientIp` returns an `X-Forwarded-For` entry trimmed and otherwise untouched, because
 * for its original purpose that was enough: the value went straight into {@link hashClientIp},
 * whose {@link normalizeIpForKeying} does all the cleaning, and an unparseable entry still keys a
 * perfectly good bucket. Nothing else ever saw it.
 *
 * The server-side redeem changed that. It forwards the resolved peer to core, which parses it as
 * an address, buckets its per-IP redeem cap on it and writes it to `MagicLinkRedemption.IPAddress`.
 * Along that path the value is no longer an opaque key — it is a claim about the world, and two
 * shapes that a bucket key absorbs harmlessly do real damage:
 *
 *  - **A source port.** Some proxies append one (see {@link stripSourcePort}). Core's limiter takes
 *    `req.ip` verbatim, so `203.0.113.7:52431` is a DIFFERENT bucket on every connection — one
 *    caller with an unlimited supply of them. That is the exact bypass this module already exists
 *    to close, reproduced one layer down in somebody else's limiter.
 *  - **Anything over 64 characters.** `MagicLinkRedemption.IPAddress` is `NVARCHAR(64)`; core's
 *    audit write is best-effort, so it logs the rejection and mints the session anyway — the
 *    redemption simply leaves no audit row at all.
 *
 * So this is the guard at the boundary, and it is the ONLY one: `ipHash` deliberately still keys on
 * whatever was seen, because refusing to bucket an unparseable caller would hand them free traffic
 * in the name of tidiness. Returning `undefined` means the header is omitted and core falls back to
 * its own peer for that one request — a degradation, never an invented value.
 */
export function forwardableAddress(rawIp: string | undefined): string | undefined {
  const trimmed = rawIp?.trim();
  if (!trimmed) {
    return undefined;
  }
  const candidate = stripSourcePort(trimmed).split('%')[0];
  return isIP(candidate) ? candidate : undefined;
}

/**
 * Salt for the one-way IP hash — literally the same secret the session hash uses, resolved by the
 * same function so the two cannot drift. See `http/hash-salt.ts` for why they share it and why
 * that is safe (each side tags its own preimage).
 */
function ipHashSalt(): string {
  return sessionHashSalt();
}

/**
 * Reduce an address to the unit we are willing to call "one caller".
 *
 * Two failure directions, and this has to avoid both. Splitting one caller across buckets hands
 * them extra budget; merging two callers into one bucket lets either refuse service to the other.
 * Address text is unusually good at causing both, because a single address has many legal
 * spellings and unrelated addresses can share a prefix.
 *
 * The rules, in order:
 *   - IPv4 is already the unit; only its octets are canonicalised (`01.02.03.04` and `1.2.3.4`
 *     are one host, and treating them as two would be free budget).
 *   - An IPv4-mapped IPv6 address IS an IPv4 caller, in every spelling — `::ffff:1.2.3.4`,
 *     `0:0:0:0:0:ffff:1.2.3.4`, `::ffff:0102:0304`. Detected after expansion rather than by
 *     matching one written form, because matching the dotted form alone let the other two fall
 *     through to the `::/64` bucket, where they shared a key with each other and with loopback.
 *   - Any other IPv6 keys on its /64. An ordinary host is delegated a whole /64 and can source
 *     from any address in it at no cost, so per-address keying would let one machine mint 2^64
 *     buckets. Two respondents behind one /64 do share a bucket; they are, by construction, one
 *     network.
 */
export function normalizeIpForKeying(rawIp: string): string {
  const ip = stripSourcePort(rawIp.trim().toLowerCase()).split('%')[0]; // drop IPv6 zone (fe80::1%eth0)
  if (!ip.includes(':')) {
    return canonicalIpv4(ip) ?? ip;
  }
  const hextets = expandIpv6(ip);
  if (!hextets) {
    return ip; // unparseable: key on it verbatim rather than on a wrong reduction
  }
  return mappedIpv4(hextets) ?? hextets.slice(0, 4).join(':');
}

/** `1.2.3.4` from an IPv4 string, with octets canonicalised; `undefined` if it is not one. */
function canonicalIpv4(ip: string): string | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets.join('.') : undefined;
}

/** The dotted IPv4 address an expanded IPv6 encodes, if it is `::ffff:a.b.c.d` in any spelling. */
function mappedIpv4(hextets: readonly string[]): string | undefined {
  const isMapped = hextets.slice(0, 5).every((h) => h === '0000') && hextets[5] === 'ffff';
  if (!isMapped) {
    return undefined;
  }
  const high = Number.parseInt(hextets[6], 16);
  const low = Number.parseInt(hextets[7], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/**
 * Drop a source port, which some proxies append when writing `X-Forwarded-For`.
 *
 * Not cosmetic: the port changes on every connection, so leaving it in the key would hand a
 * caller an unlimited supply of buckets — the exact bypass this module exists to close, restored
 * by a formatting detail. A bare IPv6 address is left alone, since its colons are structure
 * rather than a separator.
 */
function stripSourcePort(ip: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) {
    return bracketed[1];
  }
  const colons = ip.split(':').length - 1;
  return colons === 1 ? ip.split(':')[0] : ip;
}

/** All eight hextets of an IPv6 address, zero-padded; `undefined` if it does not parse. */
function expandIpv6(ip: string): string[] | undefined {
  const [head, tail] = dottedTailAsHextets(ip).split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const parts =
    tail === undefined
      ? headParts
      : [...headParts, ...zeroHextets(8 - headParts.length - tailParts.length), ...tailParts];
  if (parts.length !== 8 || parts.some((h) => !/^[0-9a-f]{0,4}$/.test(h))) {
    return undefined;
  }
  return parts.map((hextet) => (hextet || '0').padStart(4, '0'));
}

/**
 * Rewrite a trailing dotted quad as the two hextets it stands for, so one expansion routine
 * handles `::ffff:1.2.3.4` and `::ffff:0102:0304` identically instead of only recognising the
 * form somebody happened to write down first.
 */
function dottedTailAsHextets(ip: string): string {
  const match = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (!match) {
    return ip;
  }
  const octets = match[2].split('.').map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return ip;
  }
  return `${match[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
}

/** The run of zero hextets a `::` stands in for. */
function zeroHextets(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => '0');
}

/** What the public routes know about a caller, independent of anything the caller told us. */
export interface RequestIdentity {
  /**
   * The resolved client address itself, request-scoped and never persisted by Forms.
   *
   * Kept alongside the hash for ONE reason: the server-side redeem in `respondent-host/
   * redeem.service.ts` POSTs to core from inside this process, so without an address forwarded
   * on it core keys its per-IP redeem cap on the loopback peer — one bucket for every respondent
   * in the deployment (bizapps-forms register row 29). A hash cannot be forwarded: core reads the
   * value as an address, writes it to the magic-link redemption audit trail, and Express has to
   * parse it before `req.ip` exists at all.
   *
   * Everything that STORES or BUCKETS still uses `ipHash`. This field must not leak into a Forms
   * log line, bucket key or database column of Forms' own — see `hashClientIp` for why that rule
   * exists. Core's magic-link redemption audit trail, above, is the one place this address is
   * written on purpose; that write is core's, not Forms'.
   *
   * Optional for the same reason `ipHash` is, and the reason is the store's, not this field's:
   * the store is now entered even when no peer address resolved, so that `origin` below still
   * reaches the embed gate. Every consumer already reads it as `currentRequestIdentity()?.ip`
   * and `forwardedHeaders` already forwards nothing for an absent address, so an absent `ip`
   * behaves exactly as an absent store did before.
   */
  ip?: string;
  /**
   * Salted one-way hash of the resolved client IP (IPv6 reduced to its /64).
   *
   * Optional because the peer address can already be gone by the time the handler runs. When it
   * is, the abuse ceilings simply drop for that request rather than re-keying onto something
   * weaker — a header the caller writes would be worse than no ceiling, since it is a ceiling the
   * caller controls.
   */
  ipHash?: string;
  /**
   * The caller's `Origin` header, VERBATIM and unnormalised.
   *
   * The caller DID choose this, unlike `ipHash` beside it — so nothing keys an abuse ceiling on
   * it, and nothing here treats it as identity. What makes a caller-supplied value load-bearing
   * anyway is that it is checked against a list the form's AUTHOR wrote: a browser will not let a
   * page lie about its own origin, and a non-browser client that forges one still has to pass
   * every other gate on the public path.
   *
   * Left unnormalised on purpose. Normalisation runs at the point of comparison instead —
   * `normalizeOrigin` against the author's list, `normalizeReportedOrigin` against this API's own
   * origin — so this field and the header the caller actually sent are the same string when one
   * reaches a log line, which is the difference between a refusal an operator can act on and one
   * they have to guess at.
   */
  origin?: string;
}

const identityStorage = new AsyncLocalStorage<RequestIdentity>();

/** Run `fn` — and everything it awaits — with `identity` as the ambient caller identity. */
export function runWithRequestIdentity<T>(identity: RequestIdentity, fn: () => T): T {
  return identityStorage.run(identity, fn);
}

/**
 * The current request's caller identity, or `undefined` outside a request.
 *
 * Undefined is a real, expected answer — a unit test, or a deployment that has not mounted
 * {@link RequestIdentityMiddleware} — so every caller must degrade rather than throw. What they
 * must NOT do is degrade silently; see the one-time warning in the submit pipeline.
 */
export function currentRequestIdentity(): RequestIdentity | undefined {
  return identityStorage.getStore();
}
