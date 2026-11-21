---
'@mj-biz-apps/forms-server': patch
---

Security hardening: boot-time re-assertion of the Respondent Grant Hardening invariant (the deny-all Create RLS rows on both response entities are now verified at every boot, with an ERROR log when a sibling install or operator edit has reopened the direct-create bypass), and the respondent host page scrubs a URL-supplied bearer token from the address bar and history once read.
