---
'@mj-biz-apps/forms-entities': minor
'@mj-biz-apps/forms-actions': minor
'@mj-biz-apps/forms-server': minor
'@mj-biz-apps/forms-ng': minor
'@mj-biz-apps/forms-core-entities-server': minor
---

Raise the MemberJunction floor to 5.51.0, and make the release workflow's schema-change rule enforceable.

**A minor rather than a patch, because installs are affected.** `mj-app.json` now requires MJ `>=5.51.0` and all five packages' peer ranges moved to `^5.51.0`. A host below that can no longer install Forms. Nothing in 5.51.0 is *required* by Forms — this is a routine rev to the current `latest` to keep the delta to MJ small — but the raised requirement is what consumers see, and this repo treats a raised install requirement as a minor.

**Upgrading is a database operation, not just a pin bump.** 5.51.x ships two core `__mj` migrations, so `npx mj migrate -t v5.51.0` is required per environment. A partially-migrated core still installs, builds, tests and boots cleanly; the failure surfaces later as `Entity <name> not found in metadata` from an unrelated feature. Verified end to end on the dev database: frontier advanced, entity count held at 422, MJAPI startup clean, and the anonymous respondent path passes all 8 smoke assertions.

**The release workflow's migration rule could only ever abort a release, never enforce one.** `changeset version` reads solely `.changeset/*.md` and knows nothing about `migrations/`, so raising the predicted bump moved the expectation away from what would actually happen — the mismatch guard then failed the release reporting a predictor error instead of naming the missing changeset. The rule is now an explicit policy gate that runs on every path that can cut a release, including `workflow_dispatch`, which previously skipped it and shipped a patch carrying a schema change.

Also fixes the E404 fast path in the npm placeholder check, which never fired because it read `$?` after an `if` — always 0 — so a genuinely missing package burned every retry before being reported.
