---
'@mj-biz-apps/forms-ng': patch
---

Uploaded form images keep working when a form is served from a different host (#270). The builder now stores `/forms/asset/<fileId>` instead of the uploading API's absolute URL, and the widget and builder previews resolve it against the API they are talking to. Forms already published with an absolute `/forms/asset/<id>` URL are repaired on read — no republish or migration needed.
The builder's image upload and the Responses tab's file download now also reach an MJAPI deployed behind a path prefix (e.g. `https://host/api/graphql`), and a legacy form no longer reports unpublished changes just because its stored images use the old absolute URL.
