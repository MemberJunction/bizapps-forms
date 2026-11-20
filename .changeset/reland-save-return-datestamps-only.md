---
"@mj-biz-apps/forms-entities": minor
---

Re-enable `SaveReturnMode: 'datestamps_only'` (and `TrackRecordChanges: false`) on `MJ_BizApps_Forms: Form Automation Runs` and `MJ_BizApps_Forms: Form Response Answers` now that MJ Forms targets MJ 6.2 (`>=6.2.0-edge.8`, pinned to `6.2.1`) which ships `f033cb970b`. Updates the four save stored procedures atomically with `Entity.Configuration` / `TrackRecordChanges` while preserving `@FormAutomationEventID`.
