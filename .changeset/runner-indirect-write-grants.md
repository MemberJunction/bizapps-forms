---
'@mj-biz-apps/forms-server': minor
---

The `Forms Automation Runner` role now gets Read on bizapps-tasks' Task Type Status and Read/Create/Update on `MJ: Record Geo Codes`. Without these, Create Followup Task saved tasks with no status, and geocoding the respondent Person was refused and logged on every submit that created or updated one (#269). Core task-graph writes are still withheld on purpose.
