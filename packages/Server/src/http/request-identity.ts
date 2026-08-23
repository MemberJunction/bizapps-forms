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
 * a deployment has one salt to set and rotate rather than two, one of which it will forget. The
 * two hash spaces are domain-separated by the `ip:` prefix below, so a session hash and an IP
 * hash can never collide even though they share a salt.
 *
 * Hashed rather than stored raw because this value reaches a log line and a bucket key, and a
 * raw IP in either is personal data we have no reason to keep.
 */
export function hashClientIp(ip: string): string {
  return createHash('sha256').update(`${ipHashSalt()}:ip:${normalizeIpForKeying(ip)}`).digest('hex');
}

/** Salt for the one-way IP hash; shared with the session hash, with the same stable default. */
function ipHashSalt(): string {
  return process.env.FORMS_SESSION_HASH_SALT?.trim() || 'mj-forms-source-metadata-v1';
}

/**
 * Reduce an address to the unit we are willing to call "one caller".
 *
 * IPv4 is that unit already. IPv6 is not: an ordinary host is delegated a whole /64 and can
 * source traffic from any address in it at no cost, so keying on the full address would let one
 * machine mint 2^64 buckets — the very bypass this module exists to close, moved one field over.
 * We therefore key IPv6 on its /64 prefix, accepting that two respondents behind one /64 share a
 * bucket (they are, by construction, one network).
 */
export function normalizeIpForKeying(rawIp: string): string {
  const ip = stripSourcePort(rawIp.trim().toLowerCase()).split('%')[0]; // drop IPv6 zone (fe80::1%eth0)
  const mappedV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mappedV4) {
    return mappedV4[1]; // an IPv4 peer on a dual-stack socket is the same caller as a bare v4 peer
  }
  return ip.includes(':') ? ipv6Prefix64(ip) : ip;
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

/** The run of zero hextets a `::` stands in for. */
function zeroHextets(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => '0');
}

/** Expand an IPv6 address far enough to read its first four hextets (the /64 prefix). */
function ipv6Prefix64(ip: string): string {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const parts =
    tail === undefined
      ? headParts
      : [...headParts, ...zeroHextets(8 - headParts.length - tailParts.length), ...tailParts];
  return parts
    .slice(0, 4)
    .map((hextet) => (hextet || '0').padStart(4, '0'))
    .join(':');
}

/** What the public routes know about a caller, independent of anything the caller told us. */
export interface RequestIdentity {
  /** Salted one-way hash of the resolved client IP (IPv6 reduced to its /64). */
  ipHash: string;
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
