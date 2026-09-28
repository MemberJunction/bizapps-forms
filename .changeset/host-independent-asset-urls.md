---
'@mj-biz-apps/forms-ng': patch
---

Uploaded form images keep working when a form is served from a different host (#270). The builder now stores `/forms/asset/<fileId>` instead of the uploading API's absolute URL, and the widget and builder previews resolve it against the API they are talking to. Forms already published with an absolute `/forms/asset/<id>` URL are repaired on read — no republish or migration needed.
