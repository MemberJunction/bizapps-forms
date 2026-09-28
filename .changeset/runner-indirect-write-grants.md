---
'@mj-biz-apps/forms-server': minor
---

The `Forms Automation Runner` role now gets Read on bizapps-tasks' Task Type Status and Read/Create/Update on `MJ: Record Geo Codes`. Without these, Create Followup Task saved tasks with no status, and a new respondent Person was never geocoded (#269). Core task-graph writes are still withheld on purpose.
