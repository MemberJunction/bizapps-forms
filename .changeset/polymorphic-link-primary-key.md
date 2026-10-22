---
"@mj-biz-apps/forms-entities": minor
---

The `TargetRecordID` polymorphic link on Form Entity Binding Records (#325) now reaches a host. Its
metadata record had no `primaryKey`, so `mj sync push` treated it as a new field: it emitted
`spCreateEntityField` with a NULL `EntityID` and aborted the run. The record now looks up the
existing CodeGen-owned field by name and entity and updates it, so the release's metadata seed
(`Metadata_Sync`) can be generated and carries the link.
