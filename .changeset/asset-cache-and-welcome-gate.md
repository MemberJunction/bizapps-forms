---
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-ng": patch
---

Uploaded form images load faster and the welcome screen no longer jumps (#291). `GET /forms/asset/<id>` now keeps a copy of each image it serves in memory (up to 50 MB in total, images up to 8 MB), so only the first request for an image on a server process reads it from the storage provider; on Box that read took about 3 seconds. An image an author uploads is kept from the upload itself. Concurrent first requests share one read, a failed read is not kept, and the check that the file is a live public asset still runs on every request. On a published form whose welcome screen has an image, the widget now keeps its loading screen — showing the MemberJunction logo — until that image and the form's logo have loaded, or 3 seconds have passed, and then shows the welcome screen whole; a logo that fails to load is left out rather than shown and then removed. Every other loading state keeps the existing spinner.
