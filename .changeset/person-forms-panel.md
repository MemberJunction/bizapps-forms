---
'@mj-biz-apps/forms-ng': patch
---

A Person's record in Explorer now has a **Forms** section listing every form response linked to that person — form, status (an in-progress Partial is marked), started and submitted — and each row opens the response. It replaces MJ's generic Form Responses grid on Person, loads only when the section is expanded, and an admin can move or hide it with a `MJ: Form Chrome Rules` row for contribution key `forms`. Responses appear only once linked to the person (the Upsert Respondent Person on-submit action links them by email).
