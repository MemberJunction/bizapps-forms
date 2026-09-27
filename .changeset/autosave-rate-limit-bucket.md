---
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
---

Autosaves no longer spend the per-session Submit budget (#271). `FORMS_RATELIMIT_MAX` now counts
only FINAL submits (completions and knockouts) and defaults to 10 (was 5, and was shared with
autosaves); a new `FORMS_AUTOSAVE_RATELIMIT_MAX` (default 60) is autosave's own bucket, so a
respondent's own typing can no longer exhaust the budget their Submit press needs. The widget now
reports a server-refused autosave as an error (previously swallowed silently) and retries it on a
capped backoff (5s, 15s, 30s, then stops automatically — the next edit or a final submit still
carries every answer). Hosted deployments running behind a load balancer or CDN now get a one-time
runtime warning if a request arrives with `X-Forwarded-For` while `FORMS_TRUSTED_PROXY_HOPS` is
unset, since that combination silently keys every respondent's per-IP rate limit on the proxy's own
address instead of theirs; see `docs/install.md` for the new hosted-deployment section covering
`FORMS_TRUSTED_PROXY_HOPS` and the public-submit rate-limit env vars.
