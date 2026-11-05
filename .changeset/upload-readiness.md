---
"@mj-biz-apps/forms-ng": patch
"@mj-biz-apps/forms-server": patch
"@mj-biz-apps/forms-core-entities-server": patch
---

A file question no longer reads "Uploading … 100%" while the server is still storing the file. It now shows "Uploading resume.pdf — 63%…" while the bytes go up and "Saving resume.pdf…" until the file is stored, so a full bar no longer looks like a finished upload.

While a file on the current step is uploading, a note beside Submit (or Next) says the respondent can press it and the response is sent once the file is saved. Pressing it was already safe; nothing said so before the press.

A final submit that fails because the device is offline is now sent again by itself when the browser reports it is back online, and the banner says so. It is not sent if the respondent changes an answer first, and it is not promised when the browser reports it is online (a blocked or unreachable server), where the banner still asks the respondent to try again.

The upload route refuses (409) a file for a response that is already Complete or Disqualified, instead of storing a file that can never become an answer. Every upload answer now carries a `Server-Timing` header (`body`, `resolve`, `response`, `store`, `record`, `total`), so a slow upload on a host shows in the browser's DevTools where the time went.

A custom upload transport (`IFormsUploadService`) may report the storing phase by calling its progress callback as `onProgress(null, 'storing')`; one that does not keeps working as before.
