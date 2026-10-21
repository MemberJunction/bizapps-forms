---
"@mj-biz-apps/forms-entities": minor
---

Withdraw the `SaveReturnMode: "datestamps_only"` return on `MJ_BizApps_Forms: Form Automation Runs` and `MJ_BizApps_Forms: Form Response Answers`. A new migration redefines their `spCreate*` and `spUpdate*` stored procedures to return the full base-view row again, because no published MemberJunction release supports the three-column return: on MJ 6.1.6 and 6.2.0-edge.4 every form submit failed with "Your response could not be saved", and every automation run failed because its run record could not be saved.
