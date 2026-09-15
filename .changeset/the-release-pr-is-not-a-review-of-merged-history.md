---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

The CodeGen-append gate checks a main-bound ref against `next`, not against `main`

A pull request into `main` is a release or a back-merge, and its base is `main` — hundreds of
commits back. The gate's banner rule applies only to files the diff adds, so against that base every
migration merged since the last release read as newly added, and the four that predate the gate
relit. It is a required check with no bypass, so the release pull request would have opened and
stalled. The base is now resolved from the branch the ref is aimed at; a hotfix committed straight
onto `main` still owes its CodeGen output and still fails.
