---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-ng": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-actions": minor
---

Ten new question types (Website, Checkbox, Legal, PictureChoice, OpinionScale, Ranking, Matrix, Address, ContactInfo, Doodle) and Welcome/Ending screens as a first-class `FormScreen` entity rather than as question types — a screen is never answered, produces no `FormResponseAnswer` and appears in no aggregation, so it renders as a phase of the widget shell instead of an item in the question list. Many endings are supported, each with its own condition and redirect, resolved by one function shared between the widget and the server.

Question-type behaviour now comes from a single capability table in forms-entities, with `FormQuestionType` derived from it, replacing six duplicated switches across four packages — including a hand-copied type list in the server's snapshot parser that could not learn when the contract grew. Also adds per-page partial submit points.

Two migrations: `V202608182100` widens `CK_FormQuestion_QuestionType` to 25 values and adds `FormScreen`, `FormQuestionOption.ImageURL`/`MatrixAxis` and `FormPage.IsPartialSubmitPoint`; `V202608182130` updates the AI Designer prompt to the full taxonomy. Apply both before deploying the code — the reverse order lets the builder offer types the CHECK constraint rejects.

Fixes a builder save race in which two edits landing in the same tick silently lost the second (`BaseEntity.Save()` re-reads the record it saved, discarding anything written while it was in flight); saves are now coalesced per entity and flushed before publish. Also repairs the `AssertExtends` compile-time drift guards, which could never fail because a naked type parameter distributes over its union — every "fails the build on drift" guard in the repo had been passing vacuously, hiding a blueprint enum stuck at 15 types.
