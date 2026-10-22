---
"@mj-biz-apps/forms-entities": minor
---

Two metadata files no longer carry keys outside the record format, which MetadataSync on MemberJunction `next` now rejects ("Unknown top-level property"), failing the app's whole metadata push. `metadata/entities/.entity-field-hierarchy-configurations.json` drops the `Entity`, `FieldName` and `Configuration` keys left beside the first record's `fields`/`relatedEntities`/`primaryKey`, which already set the same `Hierarchy.IsHierarchy` value. `metadata/notification-types/.form-automation-failed-type.json` drops `entityName`; the folder's `.mj-sync.json` names the entity. The values pushed are unchanged.
