---
"@mj-biz-apps/forms-entities": patch
---

The pre-commit gate no longer trusts either half of a check's verdict without evidence. A turbo
install missing its platform binary exits non-zero without running anything, which read as a failing
`typecheck` and denied a green commit; and a `--filter` or scan root that matches nothing exits zero
having checked nothing, which read as a green tree in silence. Each check now declares both the
marker it prints once it has reached a verdict and the marker proving that verdict covered any work,
and a claim without its evidence asks instead of deciding. Ships no migration and no metadata, so
patch.
