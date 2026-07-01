---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-core-entities-server": minor
---

Phase 1: anonymous forms, submit hardening, AI authoring and reporting

Adds the first working slice of MJ Forms:

- public submit endpoint with anonymous magic-link scope enforcement (create-only on response entities) and anti-abuse hardening: Cloudflare Turnstile (per-form, fail-closed), rate limiting, distribution and form quotas, and duplicate-submission recovery
- the `<mj-form>` respondent widget as a shell-free Angular custom element, with scroll and one-question render modes, design-token theming, conditional logic, file upload and debounced partial-save
- server-side `/f/:slug` magic-link redeem and widget bundle serving
- metadata-driven AI form authoring from a plain-language brief, plus 5 starter templates
- 4 on-submit actions: person upsert, confirmation email, follow-up task, and written-response analysis
- reporting dashboard with summaries, per-question breakdowns, net promoter score, funnel, response views and CSV or Excel export
