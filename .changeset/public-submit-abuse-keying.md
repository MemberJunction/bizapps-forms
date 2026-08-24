---
"@mj-biz-apps/forms-server": minor
---

The public-submit abuse ceilings are now keyed on the caller's resolved IP instead of a header they choose.

The rate limiter keyed on `ctx.sessionId`, which is `UserPayload.sessionId` — populated by MJ from the client-settable `x-session-id` request header, not from a JWT claim. A caller who sent a new value per request landed in a fresh bucket every time, so the per-session cap never tripped. Turnstile and both quotas are opt-in, which left that cap as the only always-on gate on completions, and every accepted completion fires the on-submit automations: a confirmation email to an address the submission chose, an LLM run, entity upserts.

The client IP is not available to a resolver — `AppContext` carries no request object — but MJ mounts `BaseServerMiddleware.GetPreAuthMiddleware()` ahead of both auth and Apollo, so the new `RequestIdentityMiddleware` resolves the peer there and carries it in an `AsyncLocalStorage` store the resolver reads. No core fork.

Three gates now, consulted together by `FormsRateLimiter.charge()` so a request one refuses spends nothing in the others: the existing per-(session, distribution) limit, unchanged and documented as shaping rather than a ceiling; a per-(caller, distribution) ceiling (`FORMS_RATELIMIT_IP_MAX`, default 120); and a tighter completions-only ceiling (`FORMS_COMPLETION_MAX`, default 20), charged only on a final submit so autosaves cannot eat the budget that bounds the expensive work.

Every ceiling is per caller **and** per distribution. A cap keyed on the distribution alone is a bucket every respondent of a form shares, so one caller saturating it takes the form offline for everyone — a rate-limit bypass traded for an outage. With no resolved IP the ceilings are dropped rather than re-keyed onto the session id, which MJ leaves blank for header-less clients and which would collapse every such caller into one shared bucket; the pre-existing per-session gate is left exactly as it was and the degraded mode is logged once per process.

Also fixed, both reachable from the same attack: `FormsRateLimiter` pruned timestamps inside a bucket but never removed a bucket, so minting keys grew the map without bound — now capped by `FORMS_RATELIMIT_MAX_KEYS` (default 50000) and evicted least-recently-**used**, where a refusal counts as a use, so a saturated bucket is never the one forgiven. And `POST /forms/upload` had no frequency gate at all despite every call storing bytes and creating an `MJ: Files` row — now gated on the resolved IP before a byte is buffered (`FORMS_UPLOAD_IP_MAX`, default 30), answering 429 with `Retry-After`.

Rate-limiting now runs **before** Turnstile. A Turnstile token is single-use, so verifying first meant a submission the limiter was about to refuse had already spent the respondent's token at Cloudflare, and their retry — the one thing available to someone who has been rate-limited — failed with a captcha error instead of the wait.

**Deployment note:** set `FORMS_TRUSTED_PROXY_HOPS` in any environment where a load balancer or CDN fronts MJAPI (1 behind a single balancer, 2 behind a CDN in front of one). It is the number of trailing `X-Forwarded-For` entries written by infrastructure you operate, and therefore the only ones believed — reading the left-most entry would hand the bucket key back to the caller. Left unset behind a proxy, every respondent keys on the balancer's own address and the ceilings become form-wide caps. A malformed value fails the boot rather than degrading quietly, so a typo stops MJAPI from starting rather than silently disabling the ceilings.

New config: `FORMS_TRUSTED_PROXY_HOPS`, `FORMS_RATELIMIT_IP_MAX`, `FORMS_COMPLETION_MAX`, `FORMS_RATELIMIT_MAX_KEYS`, `FORMS_UPLOAD_IP_MAX`. No schema change and no migration.
