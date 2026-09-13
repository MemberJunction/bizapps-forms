---
"@mj-biz-apps/forms-entities": minor
---

The Forms application now appears in the Explorer app launcher.

The curated `Forms` application shipped `DefaultForNewUser: false`, so it was never added to any host user's `__mj.UserApplication` list — the list the launcher renders. The builder, both dashboards and the seven browsable admin entities were unreachable on every host, fresh or upgraded, and the only Forms-shaped entry an operator could find was the auto-generated `__mj_BizAppsForms` schema shell.

This fix ships as two writes, because the flag alone repairs only users whose application list is empty. `V202609131200` sets the flag for users created later and backfills `UserApplication` rows for the users who exist today. Users with no rows at all are deliberately left alone so MJ's client self-heal still provisions their full default set.
