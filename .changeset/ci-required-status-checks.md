---
"@mj-biz-apps/forms-entities": patch
---

CI is blocking: every gate now reports on every PR, and both branch rulesets require the seven gate
jobs with "branch must be up to date with base". Adds a local pre-commit gate that runs `lint:ui`
and `typecheck` before a `git commit` or `git push`. Ships no migration and no metadata, so patch.
