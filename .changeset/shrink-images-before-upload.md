---
'@mj-biz-apps/forms-ng': patch
---

Images added in the form builder (welcome and ending screens, picture-choice options, logo, page background) are now shrunk in the browser before upload: at most 1600 px on the longest side, and re-encoded as WebP where the browser supports it (JPEG or PNG otherwise, so transparency is kept). A published form no longer makes each respondent download the author's original photo; a 927 KB welcome photo previously took 5.8 s longer than its text to appear on a slow mobile connection. GIFs, small images, and images that would not get smaller are uploaded unchanged. Images uploaded before this change keep their original size until they are re-uploaded.
