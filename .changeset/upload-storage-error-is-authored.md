---
"@mj-biz-apps/forms-server": patch
---

The public upload endpoint no longer returns the storage provider's error text to the respondent (#142). When storing a file fails, the response is `Your file could not be uploaded. Please try again.`; the provider's message goes to the server log with the response, question and distribution ids, and with the uploaded file's name redacted. An upload whose `responseId` is not a GUID is now refused with a 400 before anything is stored. When the upload ledger row cannot be written, the server log keeps the database's error but no longer repeats the statement it ran, which carried the uploaded file's name. Size, type and other 4xx messages are unchanged.
