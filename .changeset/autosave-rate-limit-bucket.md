---
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
---

Autosaves no longer spend the per-session Submit budget (#271). `FORMS_RATELIMIT_MAX` now counts
only FINAL submits (completions and knockouts) and defaults to 10 (was 5, and was shared with
autosaves); a new `FORMS_AUTOSAVE_RATELIMIT_MAX` (default 60) is autosave's own bucket, so a
respondent's own typing can no longer exhaust the budget their Submit press needs. The per-address
ceiling `FORMS_RATELIMIT_IP_MAX` now counts autosaves only, so several respondents typing behind one
shared address (an office or campus NAT) can no longer get each other's Submit refused; final
submits stay bounded per address by `FORMS_COMPLETION_MAX` / `FORMS_KNOCKOUT_MAX`. The widget now
reports a server-refused autosave as an error (previously swallowed silently) and retries it on a
capped backoff (5s, 15s, then 60s — one full rate-limit window, so the last retry lands after the
window that refused it — then stops; the next edit or a final submit still carries every answer).
MJAPI now logs a one-time `[WARNING]` when a request other than Forms' own internal redeem call
arrives with `X-Forwarded-For` while `FORMS_TRUSTED_PROXY_HOPS` is 0 (the default): if a load
balancer or CDN fronts the API, that setting keys every respondent's per-IP rate limit on the
proxy's own address instead of theirs; see `docs/install.md` for the new hosted-deployment section covering
`FORMS_TRUSTED_PROXY_HOPS` and the public-submit rate-limit env vars.
