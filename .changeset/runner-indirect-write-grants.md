---
'@mj-biz-apps/forms-server': minor
---

The `Forms Automation Runner` role now gets Read on bizapps-tasks' Task Type Status, Create on its Task Activities, and Read/Create/Update on `MJ: Record Geo Codes`. Without these, Create Followup Task saved tasks with no status and silently without their 'Created' activity, and geocoding the Activity that `Common.LogActivity` writes for a newly created respondent Person was refused and logged on every such submit (#269). Core task-graph writes are still withheld on purpose.
