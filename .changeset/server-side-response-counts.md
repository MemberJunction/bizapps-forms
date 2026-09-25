---
'@mj-biz-apps/forms-ng': patch
---

Response counts on the Forms home list and the Responses & Analytics rail are now computed by the database, which fixes counts that were silently truncated once a host held more than 1000 responses (#247).

Both surfaces used to download one row per Complete response across every form and count them in the browser. The entity's 1000-row view cap cut that download short, so a form with 712 responses could read 536, and the payload grew with every response. Each surface now asks for one aggregate count per form in a single request that returns no rows. On the home list a failed count is logged and the grid still loads; on the rail it fails the load rather than showing zeros.
