---
'@mj-biz-apps/forms-ng': patch
---

Responses & Analytics now always shows the report for the form you picked last. Clicking a second form while the first was still loading could leave the first form's numbers on screen under the second form's name, depending on which load finished first. The form list is no longer locked while a report loads, so you can move straight on to another form, and the previous form's figures clear as soon as you do. A response still opening for the form you left no longer appears, or reports a failure, on the new one. An export that fails after you have moved to a different form is recorded in the log rather than shown there; if you are back on the form it was for when it fails, the failure is shown. An export that succeeds still downloads its file wherever you are.
