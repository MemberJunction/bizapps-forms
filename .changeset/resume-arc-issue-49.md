---
"@mj-biz-apps/forms-server": patch
---

Résumé/file-answer arc fixes (issue #49): the public upload endpoint now validates `questionId` against the published definition (must exist and be a FileUpload question) before any byte is stored, instead of failing deep in the provenance insert and orphaning the stored bytes; and the new `V202608181030` migration grants `Forms Automation Runner` read on `MJ_BizApps_Forms: Form Uploads`, without which bind-time provenance verification always failed closed and no file answer could ever be copied onto a bound entity.
