---
"@mj-biz-apps/forms-server": patch
---

Security: bound anonymous abuse on the public form path where the existing limiter could be bypassed by rotating the client-controlled `x-session-id` header.

- **Upload endpoint** (previously had NO rate limit): adds a per-IP sliding-window rate limit (`FORMS_UPLOAD_RATELIMIT_MAX`/`_WINDOW_MS`, default 20/min) plus a process-wide in-flight concurrency cap (`FORMS_UPLOAD_MAX_IN_FLIGHT`, default 10), both applied in `UploadMiddleware` where `req.ip` is available. The in-flight cap is the header-proof control; the IP window is a generous ceiling (documented shared-proxy caveat, mirroring bizapps-caliber's `InterviewHostMiddleware` — never reads `X-Forwarded-For`).
- **Submit pipeline**: adds an in-flight concurrency cap (`FORMS_SUBMIT_MAX_IN_FLIGHT`, default 50) around the whole pipeline and a hard per-version cap on the number of `Partial` (autosave) rows (`FORMS_MAX_PARTIALS_PER_VERSION`, default 10000). Both are independent of request context a GraphQL resolver cannot see, so a rotated session id cannot defeat them. Only NEW partial rows are capped — complete submits (Turnstile + quota, unchanged) and updates to an existing partial are unaffected.

A shared `InFlightLimiter` is used by both paths. A true IP-based rate limit on the GraphQL submit route still requires a transport-layer Express middleware (the resolver `AppContext` cannot see `req.ip`) — flagged as follow-up.
