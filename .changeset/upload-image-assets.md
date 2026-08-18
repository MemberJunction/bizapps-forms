---
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-server": minor
---

Every image on a form can now be uploaded from the author's computer instead of only pasted as a URL: the Welcome screen's picture, each Ending's, the logo, the page background, and each Picture-choice option. All five were bare URL boxes, which quietly assumed the author already had the image hosted somewhere public.

Two new MJAPI routes. `POST /forms/asset` is authenticated and gated on Update permission for `MJ_BizApps_Forms: Forms` — which is also what rejects an anonymous respondent session, since the Form Respondent role holds CanCreate on the two response entities and nothing else. `GET /forms/asset/:id` is deliberately anonymous, because a published form's welcome image has to render for a respondent with no session, possibly on a different origin.

That read route's guard is storage location, not identity: only objects whose provider key sits under the constant `forms-assets/` prefix are servable, so it can never be turned into an unauthenticated reader for the files respondents attach to their answers (those live under `forms-uploads/`). The prefix is not configurable for exactly that reason, and `FORMS_UPLOAD_PATH_PREFIX` is now refused if it would land respondent uploads inside the public tree. Unknown ids and non-asset ids get the same 404 so the route is not an oracle for which `MJ: Files` records exist.

No schema change: assets are ordinary `MJ: Files` records written through `FileStorageEngine`, and the stored value is still just a URL, so the published snapshot, the widget and the response pipeline needed no changes at all.

**Deployment note:** uploading requires a configured `MJ: File Storage Account`. An instance with none (MJ seeds storage *providers* but no account) returns a 503 naming that as the cause and pointing at the URL box as the workaround. The respondent `FileUpload` question already had this same prerequisite.

New config: `FORMS_ASSET_ENABLED`, `FORMS_ASSET_MAX_BYTES` (default 5 MiB), `FORMS_ASSET_ALLOWED_TYPES` (default PNG/JPEG/GIF/WebP — SVG is excluded because it is a scriptable document served from the API origin; an operator can opt in), `FORMS_ASSET_STORAGE_ACCOUNT`.
