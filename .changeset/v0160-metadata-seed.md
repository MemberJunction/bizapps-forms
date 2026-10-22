---
"@mj-biz-apps/forms-entities": minor
---

Ship the v0.16 metadata seed. A new `Metadata_Sync` migration installs the records this release added under `metadata/`: the `Forms.*` Remote Operations, the three reporting queries, the `forms`, `forms:read` and `forms:write` API scopes, the automation outbox sweep job, and the `Form Automation Failed` notification type. It also applies this release's metadata edits to records that already exist. Without it, a host that installed this release would get the server code without the records it calls. The polymorphic record link on Form Entity Binding Records now updates its existing field instead of trying to create a new one.
