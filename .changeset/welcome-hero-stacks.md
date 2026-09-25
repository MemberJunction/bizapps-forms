---
'@mj-biz-apps/forms-ng': patch
---

Welcome and ending screens now render as one centred stack — logo, image, title, description, button, social links — at every width. The form's logo used to stay pinned to the top-left corner while the rest of the screen centred in the middle of the window, and a short description sat on the same line as the Start button (or the social links) whenever both fit.

The "we couldn't reopen your saved answers" notice now appears. The `/f/:slug` page set it on `<mj-form>` as a `resume-notice` attribute, but the element only ever forwarded `slug` to the form, so a respondent whose saved draft could not be reopened was never told.
