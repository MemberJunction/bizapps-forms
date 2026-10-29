---
"@mj-biz-apps/forms-ng": patch
"@mj-biz-apps/forms-entities": patch
"@mj-biz-apps/forms-core-entities-server": patch
---

Fixes from the review of the UI audit work.

- Builder: a second delete inside the undo window waits for the first to be written before it leaves the canvas. Undoing it no longer puts the item back at an order the database does not have, and deleting the default ending and then the last other ending no longer leaves the form with no default ending after Undo.
- Builder: a delete or an Undo updates the Publish state and the stale-notice banners at once, not when the undo window closes. Preview writes a held delete first.
- Builder: while the default ending's delete is held, the ending that will replace it reads "Default ending", not "Never shown — add a condition". `endingReachFor` now treats a form with no default as the runtime does.
- Responses: Next or Previous across a page edge opens nothing when the page fails to load or the reader went Back, keeps the position line correct while the page loads, and closes the old response if the new one fails to open. Refresh tells the host that it closed the open response, so the URL stops naming it.
- Forms home: a failed reload under a list already on screen is shown in the banner.
- Widget: a Matrix question moves the progress bar per answered row, as a composite question does per part.
- `Forms.ListResponses` refuses a caller who may not read answers, with a reason, before any read. Before, the list read the answers anyway and failed.
