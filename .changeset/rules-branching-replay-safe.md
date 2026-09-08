---
"@mj-biz-apps/forms-entities": patch
---

Replay-safe Rules & Branching migration: DDL only, then inlined R__RefreshMetadata, then CodeGen emit captured on a blank-install DB so EntityField IDs match. Also fix invalid JSON in entity-field-hierarchy-configurations.json.
