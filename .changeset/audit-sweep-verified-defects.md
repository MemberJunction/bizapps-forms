---
"@mj-biz-apps/forms-core-entities-server": patch
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-actions": patch
"@mj-biz-apps/forms-ng": patch
---

Fix a set of verified defects found in a whole-repo audit. Publish, clone, automation-run and resume reads no longer stop silently at the entity's 1000-row view limit. The written-response analyzer stops salvaging at the first invalid score so later scores cannot land on the wrong answers. A failed Turnstile script load can be retried. An armed "Remove it" in the Automate tab no longer carries over to another step. A malformed escape on `/forms/files/<id>` answers 404 instead of throwing. A deleted agent is a permanent automation failure rather than five retries. Failed response and distribution reads are now logged with their error, and the "per-IP ceilings not applied" warning is visible in production.
