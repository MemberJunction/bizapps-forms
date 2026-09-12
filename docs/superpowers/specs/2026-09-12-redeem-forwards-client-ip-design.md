# The server-side redeem forwards no client IP — design

**Status:** approved 2026-09-12
**Register rows:** 29 (this defect), 28 (already closed by #188), 36 (folded in — see Scope)
**Related issue:** forms#202 (the proxy-hops half — a precondition, not a duplicate)

## The defect

`/f/:slug` redeems on the respondent's behalf: the route POSTs the distribution's raw
`PublicLinkToken` to core's `/magic-link/redeem` from inside the MJAPI process
(`respondent-host/redeem.service.ts`, `postRedeem`). That POST carries two headers —
`content-type` and `accept` — and no client identity of any kind.

Core rate-limits that endpoint at 20 requests per 60s (`MJServer/src/config.ts`
`redeemRateLimitMax` default 20, `rateLimitWindowMs` default 60_000), keyed by
`express-rate-limit`'s default key generator, which is `req.ip`. With nothing forwarded,
`req.ip` for every redeem in the deployment is the same address — so the cap is one bucket
shared by every respondent of every form. The 21st form open per minute, across the whole
install, is refused.

## Reproduction (measured 2026-09-12, branch harness on :4131)

25 *different* respondents open the same form inside one window. Each has its own Forms
bucket (`FORMS_REDEEM_IP_MAX` 30/IP/window), so no respondent is near their own budget:

| requests | client IPs | result |
|---|---|---|
| 1–15 | `198.51.100.1` … `.15` | 200, session minted |
| 16–25 | `198.51.100.16` … `.25` | 429, "Too many attempts from this network…" |

15 through, plus 5 earlier probes on the same shared bucket, is exactly 20 — core's cap.
The server's own log names the source, once per refused request:

```
[Forms] Redeem rate-limited for distribution 'all-types-smoke'
(POST http://localhost:4131/magic-link/redeem?format=json, HTTP 429):
errorCode=invalid error=Too many redemption attempts. retryAfterSeconds=28
```

That line exists only inside `postRedeem`, so those requests reached core. Forms' own meter
never fired.

## Root cause, and a correction to the filed issue

The issue states that having core trust a forwarded address "is an MJ change". It is not.

`packages/Server/src/http/RequestIdentityMiddleware.ts:112` — **Forms itself** calls
`app.set('trust proxy', trustedProxyHops())` on the shared Express app, and its own comment
says why: to keep MJ's `req.ip`-derived audit address and Forms' bucket key the same address.
Core's magic-link router is mounted on that same app, so it already honours whatever the
trust-proxy setting admits. Hitting core's endpoint directly isolates it:

| request | observed |
|---|---|
| no `X-Forwarded-For` | `RateLimit: remaining` 19→18→17→16→15 — one shared bucket |
| distinct `X-Forwarded-For` per request | `remaining` stays 19 — a bucket each |

**The whole fix is in Forms' court.**

## Three measured constraints on the design

1. **One forwarded entry is enough at any hop count ≥ 1.** With a single-entry header,
   `req.ip` resolves to that entry at `trust proxy` 1, 2 and 3 alike — Express's `proxy-addr`
   clamps to the left-most available address rather than falling back to the socket. So the
   redeem call does not have to pad the header to match `FORMS_TRUSTED_PROXY_HOPS`.
2. **Sending it at hop count 0 is harmless.** `express-rate-limit` v8 raises
   `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` once and keeps counting normally (19→18→17→16). It
   does **not** fail open. So no conditional is needed around the header.
3. **Calling core in-process is not available.** `MagicLinkService` is not re-exported from
   `@memberjunction/server`'s public entry and the package's `exports` map exposes only
   `"."`. Bypassing HTTP would need an MJ change; forwarding the header does not.

## Decision

Forward the **real** resolved client address as a single `X-Forwarded-For` entry on the
redeem POST.

Rejected: a pseudonymous stand-in derived from `ipHash`. It would split the buckets correctly,
but core writes `ipAddress: req.ip` into the magic-link redemption audit trail, and a synthetic
address makes that column hold a fiction — worse than the loopback address it holds today,
because anything reading it as a real address (geo, abuse lists, subnet matching) gets nonsense
rather than an obvious placeholder.

Rejected: raising `magicLink.redeemRateLimitMax` in the host config. It raises the ceiling
without removing it — the bucket stays global, and the cap stops being an abuse control.

**Privacy posture change, accepted deliberately:** raw respondent addresses will start landing
in `__mj` magic-link audit rows, where today every respondent is recorded as the loopback
address. That column exists for exactly this, and Forms still persists nothing raw itself — the
address lives for the life of one request in the existing `AsyncLocalStorage` store and its only
use is the outbound header.

## Known limitation

Correct wherever `FORMS_TRUSTED_PROXY_HOPS >= 1`. At `0` Express ignores the header and the
bucket stays global — but at `0` Forms cannot identify a respondent for *any* of its own
ceilings either, so that is forms#202's precondition rather than a second defect here. The two
compose: set the hop count right and both are fixed.

## Scope

In the blast radius, and therefore in this change:

- `FORMS_REDEEM_IP_MAX` defaults to 30, above core's 20. Once both key on the same respondent,
  core still refuses first and Forms' own meter stays unreachable on this path (register row
  36). Aligning the default to 20 makes Forms refuse before spending a DB read and an outbound
  POST on a request core will reject anyway.
- Neither `FORMS_REDEEM_IP_MAX` nor `FORMS_REDEEM_MAX_IN_FLIGHT` appears in `.env.example`.

Out of scope: forms#202 (setting the hop count on the AIDP host), and any change to MJ.

## Why the unit suite did not catch this

Every test in `redeem.service.spec.ts` stubs `fetch`, and no test asserts anything about the
*request* — only about the response the stub returns. A green `pnpm test` therefore says nothing
about what the door actually sends. The end-to-end harness run is the real gate for this change.
