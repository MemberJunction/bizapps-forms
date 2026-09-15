---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

The release runbook describes a pipeline that has now been run

Four files still said the release had never been executed, which stopped being true on 2026-09-15
when `v0.11.0` shipped through it. They now record that, the two defects the first run found
(#225, #226), and what to expect next time. The "some packages published, others did not" row was
the one actively misleading entry: npm's packument is eventually consistent and served a mixed view
for about three minutes after `v0.11.0`, so following that advice would have triggered a needless
re-run. It now says to wait and read the publish step's own output first.
