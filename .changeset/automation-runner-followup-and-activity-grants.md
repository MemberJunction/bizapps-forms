---
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
---

Two built-in on-submit hooks failed on every installed host, and the server now names a missing automation grant at startup (#239).

**What was broken.** `Forms: Create Followup Task` could not read `MJ_BizApps_Tasks: Task Types` as the automation principal, so it created no task and reported the misleading `No TaskType available to assign to the task.` And creating a Person in `Forms: Upsert Respondent Person` fires bizapps-common's `Common.LogActivity` action as the same principal, which failed first as `references 1 unknown action(s): Common.LogActivity` (no Read on `MJ: Actions`) and then on `MJ_BizApps_Common: Activity Types`, so no activity was ever logged for a respondent. Each failure showed up only as a per-submit log line on a best-effort hook.

**What the migration grants.** `V202609251200` gives the `Forms Automation Runner` role, and nothing wider: Read on Task Types; Create only on Tasks and Task Links; Read on `MJ: Actions`; Read on Activity Types; Read + Create on Activities (the read is the action's dedupe check); Create only on Activity Links. No Update or Delete. It widens an existing row without lowering anything an operator granted by hand. When a sibling entity does not exist on the database — Activities arrived in bizapps-common 5.35, and a database not built by `mj app install` may lack bizapps-tasks — that grant is skipped with a printed message instead of failing the migration. The same seven records are declared in `metadata/`.

**An expected log line that stays.** After a respondent's Person is created you will still see MJ report that `Common.LogActivity` asked for durable dispatch but ran inline instead. That is deliberate: durable dispatch would need write on core's task-graph entities, which not even the `UI` role holds, and a principal driven by anonymous submissions must not be able to create task graphs. The action runs inline and the activity is written.

**New at startup.** Forms checks the automation principal's effective permissions against every grant the shipped hooks need and logs each gap as `[Forms] On-submit automations are NOT ready: <entity, missing permission, which hook needs it>`. A clean start logs nothing.

**New result code.** When `Forms: Create Followup Task` cannot read Task Types, it now fails with `TASK_TYPE_LOOKUP_FAILED` and the underlying error, instead of `NO_TASK_TYPE`, which now means only that no matching task type exists.
