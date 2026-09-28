---
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-server': patch
---

Uploaded form images keep working when a form is served from a different host (#270). The builder now stores `/forms/asset/<fileId>` instead of the uploading API's absolute URL, and the widget and builder previews resolve it against the API they are talking to. Forms already published with an absolute `/forms/asset/<id>` URL are repaired on read — no republish or migration needed.
The builder's image upload and the Responses tab's file download now also reach an MJAPI deployed behind a path prefix (e.g. `https://host/api/graphql`), and a legacy form no longer reports unpublished changes just because its stored images use the old absolute URL.
MJAPI now logs an error at boot when `GRAPHQL_ROOT_PATH` is set to anything other than `/` or a path ending in `/graphql` (e.g. `/api`): MJServer moves only GraphQL there, so Forms' images and file uploads would 404. Put a path prefix in `MJAPI_PUBLIC_URL` behind a reverse proxy instead.
