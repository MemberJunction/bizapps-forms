---
"@mj-biz-apps/forms-ng": patch
---

The respondent widget no longer sends a response without a file that is still uploading. A Submit or Next tapped while a Doodle drawing or a FileUpload is on the wire now waits under "Saving your file…" and sends the answer once the file is stored; before, a signature drawn just before Submit was lost with no message. Uploads that fail on a bad moment (a dropped connection, a 5xx, a stalled request, or the upload rate limit's 429) retry by themselves after 5 s, 15 s and 60 s. A file the server refuses (too large, a type the question does not take) is not retried. The red upload error and its Retry button are replaced by one quiet line: "Choose again" for a refused file, and "Try again" once every retry has failed. Submit and Next refuse while a visible question's upload has failed, including on an optional question.
