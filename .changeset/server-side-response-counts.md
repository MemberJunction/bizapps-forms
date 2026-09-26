---
'@mj-biz-apps/forms-ng': patch
---

Response counts on the Forms home list and the Responses & Analytics rail are now computed by the database, which fixes counts that were silently truncated once a host held more than 1000 responses (#247).

Both surfaces used to download one row per Complete response across every form and count them in the browser. The entity's 1000-row view cap cut that download short, so a form with 712 responses could read 536, and the payload grew with every response. Each surface now asks for one aggregate count per form in a single request that returns no rows. On the home list a failed count is logged and the grid still loads, showing the count as unavailable (—) rather than a false 0; on the rail a failed load now says the forms could not be loaded, with a retry, instead of the "Nothing to report on yet" empty state and "0 forms · 0 responses".

The same 1000-row cap also truncated the per-form reads behind the Responses & Analytics report, its CSV/Excel export and the builder's Responses tab: a form with 712 responses and 4,338 answers was reported from 1,000 of them ("First name · 176 answered · 536 skipped" instead of 703 and 9). Those reads now fetch every row.
