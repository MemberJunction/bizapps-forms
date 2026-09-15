---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

The empty states now link to the help centre

Five dead ends — no forms yet, no share link, no automation step, no rule, nothing to report on —
each gained a short link to the article that answers the question the person is asking while they
are looking at it. A reader at an empty state is stuck by definition, and until now nothing
anywhere in the product pointed at the documentation that was written for exactly that moment.

The URLs live in one place (`shared/help-links.ts`) rather than as the same origin pasted into five
templates, and they point at the published Pages site, which reaches a host in the same release as
this package.
