---
"@mj-biz-apps/forms-server": patch
---

Security hardening of deployment defaults, no behavior change for correctly configured hosts. Turnstile siteverify now forwards the resolved peer address as `remoteip` (Cloudflare binds the token to the machine that solved it) and checks the reported `hostname` against this API's public host plus the distribution's allowed embed origins, logging — never refusing — a mismatch. An unset `FORMS_SESSION_HASH_SALT` is now announced at ERROR level at every boot as leaving stored privacy hashes dictionary-recoverable, and `FORMS_REQUIRE_SESSION_HASH_SALT=true` opts into failing the boot without one. An unset `FORMS_BINDING_ALLOWED_ENTITIES` on a host whose automation principal is live is announced at ERROR level as leaving entity bindings unrestricted, and `FORMS_BINDING_REQUIRE_ALLOWLIST=true` opts into failing closed. `embed-origin.ts` now states plainly that `AllowedOrigins` constrains browser embeds only, never scripted submissions.
