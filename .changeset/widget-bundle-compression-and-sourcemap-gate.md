---
"@mj-biz-apps/forms-server": patch
---

The `<mj-form>` widget bundle is served compressed, and its sourcemap is withheld on a host that declares itself production.

Every first-time respondent downloaded the full 1.2 MB bundle with no `Content-Encoding`, even though MJAPI has had `compression()` mounted the whole time — the route was simply registered ahead of it. `WidgetBundleMiddleware` now contributes both routes from `GetPreAuthMiddleware()`, the slot the base class documents as running "after compression but before OAuth/REST/GraphQL routes", so MJ's own negotiation, threshold and level apply. Measured on a real host: 1,265,968 bytes → 348,785 gzip / 352,926 brotli (~28%), `Vary: Accept-Encoding` emitted, ETag preserved and `If-None-Match` still answering 304. The 8.5 MB sourcemap is now gated on `NODE_ENV`, overridable in either direction with `FORMS_WIDGET_SOURCEMAP_ENABLED`; when withheld the route stays registered and answers 404 with the reason in the body, never the 401 an unserved path falls through to. A host that sets neither variable still serves the map — that is the documented local-dev path — but now says so once at boot instead of doing it silently. Closes #121.
