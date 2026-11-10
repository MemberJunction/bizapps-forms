---
"@mj-biz-apps/forms-core-entities-server": patch
"@mj-biz-apps/forms-server": patch
---

Three security defaults are stricter. Each can refuse a request that the previous release accepted.

**Turnstile solve-hostname is enforced by default.** A verified Turnstile token whose solve hostname is outside the expected set (`MJAPI_PUBLIC_URL` plus the distribution's `AllowedOrigins`) is now refused. Before, the mismatch was only logged unless `FORMS_TURNSTILE_ENFORCE_HOSTNAME` was `true`. A deployment that answers on a host the expected set does not name (a multi-host proxy, an internal name) will see captcha-enabled submissions refused: add the host to `AllowedOrigins`, or set `FORMS_TURNSTILE_ENFORCE_HOSTNAME=false` to return to warn-only until the set is complete.

**`/f/:slug/remember` no longer mints a resume invite for an unowned draft from its response id alone.** A draft with no owner now needs the client-id proof stored in its `SourceMetadata`, or a response-scoped session that names it. Resumed sittings keep working.

**The respondent session's create access is an allow-list.** A session that holds `CanCreate` on any entity other than Form Responses and Form Response Answers is refused as privilege accretion. Before, only Forms, Form Versions and Form Distributions were checked. A host that granted the Form Respondent role create access on another entity must remove that grant.
