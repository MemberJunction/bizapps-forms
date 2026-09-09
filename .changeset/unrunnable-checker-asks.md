---
"@mj-biz-apps/forms-entities": patch
---

The pre-commit gate no longer reports a checker that never ran as a tree that failed a check. A
turbo install missing its platform binary exits non-zero without running anything, which read as a
failing `typecheck` and denied a green commit. Each check now declares the marker it prints once it
has reached a verdict, and a non-zero exit without that marker asks instead of denying. Ships no
migration and no metadata, so patch.
