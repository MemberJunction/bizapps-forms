---
"@mj-biz-apps/forms-server": patch
---

Two abuse bounds on the public form path that the per-caller rate ceilings structurally cannot provide.

- **In-flight concurrency caps.** `FORMS_SUBMIT_MAX_IN_FLIGHT` (default 50) around the whole submit pipeline and `FORMS_UPLOAD_MAX_IN_FLIGHT` (default 10) on the upload route, via a shared `InFlightLimiter`. A sliding window limits how OFTEN a caller may act and says nothing about how many requests they may have executing at once, so a caller comfortably inside every ceiling can still exhaust sockets, pool connections and memory. Refused immediately with a 503 rather than queued — holding an anonymous request is the resource exhaustion this defends against wearing a politer hat — and the cap is checked before the per-caller window so a request shed for load is never charged to anyone's budget.

- **A hard per-version cap on `Partial` rows** (`FORMS_MAX_PARTIALS_PER_VERSION`, default 10000). This is the only DURABLE bound of the set: the ceilings are sliding windows held in one process's memory, so a caller pacing themselves under all of them — or spread across addresses — accumulates rows for as long as they care to, and partial writes are otherwise ungated entirely (Turnstile and both quotas apply only to COMPLETE submissions). Only a partial submit that would CREATE a new row is capped; complete submits and updates to an existing partial are unaffected. Fail-closed on a count error, which autosave retries silently.

Rebased onto the IP-keyed abuse ceilings. Two things this branch carried did not survive, both because they were superseded rather than wrong: the per-call `max`/`windowMs` override on `FormsRateLimiter.check()` (the limiter now takes a set of gates and each carries its own `max`, so a caller with different limits expresses them as a gate), and a second upload rate limit keyed on `req.ip` with its own `FORMS_UPLOAD_RATELIMIT_MAX`/`_WINDOW_MS` (the route already has one, keyed on the resolved peer IP under `FORMS_UPLOAD_IP_MAX`, which reads `X-Forwarded-For` only under an explicit trusted-hop count).

The follow-up this branch flagged — "a true IP-based rate limit on the GraphQL submit route requires a transport-layer Express middleware, since the resolver `AppContext` cannot see `req.ip`" — has since shipped as `RequestIdentityMiddleware`. The rationale comments here have been rewritten accordingly: they argued that an in-flight cap was the only control a header-rotating attacker could not defeat, which was true when written and is no longer.
