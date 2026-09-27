---
'@mj-biz-apps/forms-server': patch
---

Stored files now read back on Box, Google Drive, Dropbox and SharePoint. Welcome-screen images (`GET /forms/asset/:id`) and respondent file-upload downloads (`GET /forms/files/:fileId`) returned HTTP 500 on any host whose Forms storage account is one of those providers, because the read passed the stored path to the driver as a provider-native object id. It is now passed as a path, which every MJ storage driver resolves; Azure Blob, AWS S3 and Google Cloud Storage behave as before. Hosts using the `FORMS_*_STORAGE_ACCOUNT` workaround can drop it. (#261)
