---
"@mj-biz-apps/forms-server": patch
---

The server-side redeem now tells core which respondent is asking, so core's per-IP redeem cap applies per respondent instead of once per deployment.

`/f/:slug` redeems on the respondent's behalf: it POSTs the link's token to core's `/magic-link/redeem` from inside the MJAPI process. That POST carried `content-type` and `accept` and no client identity, and core keys that endpoint's 20-per-minute cap on `req.ip` — so every redeem in the install arrived from the same peer and shared one bucket. Measured on a branch harness: 25 different respondents opening the same form, each with their own Forms bucket, and the deployment was refused from the 16th onward, 20 requests into the window. A classroom, an office behind NAT or a conference wifi did not have to be involved; ordinary traffic across unrelated forms was enough.

The redeem now forwards the already-resolved respondent address as a single `X-Forwarded-For` entry. Forms sets Express's `trust proxy` itself (`RequestIdentityMiddleware`), so core honours it with no change in MemberJunction, and core's magic-link redemption audit trail records the respondent instead of the loopback address. One entry, never appended to an inbound header: `proxy-addr` clamps to the left-most address, so the result is the same at every trusted hop count of 1 or more.

**Deployment note:** this is correct wherever `FORMS_TRUSTED_PROXY_HOPS` is set to the number of proxies you operate. At the default of 0 Express ignores the header and the bucket stays global — the same precondition every other Forms rate-limit ceiling already has.

`FORMS_REDEEM_IP_MAX` defaults to 20, matching core's own redeem cap. Forms' gate fronts core's on the page route, where one `/f/:slug` open costs one core redeem: a looser number here is never reached there, because core refuses first, after Forms has already spent a DB read and an outbound POST on a request core was always going to reject. A returning respondent is the exception — the host page auto-POSTs `/f/:slug/resume` whenever a resume cookie is present, and that leg makes a second core redeem charged to its own `resume:` bucket (`RESUME_RATE_MAX = 30`) rather than to this meter, so for that respondent core's cap binds first, at half the opens this default implies. Closing that gap means charging the resume redeem to this same meter; this branch does not do it. Both redeem knobs are now documented in `.env.example`.

**This also closes #191.** The `POST /f/:slug/resume` route never mounted the request-identity handler, so `currentRequestIdentity()` was always undefined there — which made the forwarded address empty on the resume leg AND degraded that route's rate limit to its `slug:` fallback, one shared bucket per form that one caller could exhaust for every respondent. Both symptoms had the same cause, and mounting the handler fixes both. The route now keys on the resolved peer, like the page route beside it.
