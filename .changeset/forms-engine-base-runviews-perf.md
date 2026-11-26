---
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-core-entities-server": patch
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

Add `FormsEngineBase` (`@mj-biz-apps/forms-entities`) for `BaseEngine`-backed taxonomy caching (`Form Categories`, `Form Styles`) with O(1) indexed lookups, active `ProviderToUse` routing, `CanRead` permission gating, user-switch invalidation, and a bounded per-`FormID` structural definition LRU cache with in-flight deduplication and automatic `BaseEntityEvent` invalidation. Collapse sequential and `Promise.all` `RunView` waterfalls into single batched `RunViews` calls across the builder bootstrap/publish refresh, Forms home listing, design style service, template deletion, response reporting, response context loading, published-link resolution, resume snapshot loading, and `/f/:slug` redeem checks.
