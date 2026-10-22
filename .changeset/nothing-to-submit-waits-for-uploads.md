---
"@mj-biz-apps/forms-ng": patch
---

A respondent whose only answer was a drawing or a file still uploading (or whose upload had given up) was refused with "Please answer at least one question before submitting." Submit now waits for the upload, or restarts it, and then sends. The "You can submit now" line counts an upload on its way too. An upload the server rejected still shows its own message.
