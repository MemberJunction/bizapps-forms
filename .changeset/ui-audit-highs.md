---
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-core-entities-server": minor
---

The High findings from the October UI audit. `minor` because `Forms.ListResponses` gains an input, declared in `metadata/remote-operations/types/` and seeded at release.

- **Builder deletes can be undone.** Deleting a question, a screen, a section or an option takes it off the canvas at once and shows "Deleted “Email” · Undo" for 10 seconds; the delete is saved when the window passes, or before any other change, a publish, or leaving the builder. The browser's OK/Cancel box on section delete is gone, and every remove button names its option. On a public form, Undo after Doodle "Clear" brings the drawing back.
- **The Responses table works past one page.** `Forms.ListResponses` takes a `Search`, matched on the server against the linked person's name and any text answer the caller may read. The table searches every response, sorts by Submitted (announced to screen readers), keeps its header in view, and pages 25, 50 or 100 at a time instead of "Load more". The status chips, which could never apply, are gone. An open response has Previous and Next.
- **The URL keeps your place.** The Forms home search and archived toggle, the Analytics form and view, and the builder's tab with its Responses page, sort, search and open response are kept in the URL, so a reload or a shared link opens where the reader was.
- **A required Matrix needs every row.** A partly answered required Matrix is refused with "2 rows still need an answer." and the rows are marked, in the form and on the server alike. Logic rules still count a Matrix as answered once any row is. A widget bundle cached from before this release still lets a respondent continue past a partly answered required Matrix; the server then refuses that submission with the same message.
- **Button hover never lowers contrast.** The public form's primary button now moves away from its text colour on hover, where it used to drop MJ's blue below AA.
