---
"@mj-biz-apps/forms-ng": patch
---

**An empty section can add its first question.** The canvas had a button to add a section, a
welcome screen and an ending, and none to add a question. "Add content" existed and worked — it was
rendered in a place a new form could never reach: inside the question loop, behind
`@if (node.entity.ID === selectedQuestionId)`. Both conditions are unsatisfiable on a section with
no questions, and the empty state was a message with no control in it, so the canvas answered the
one request it exists for by pointing at a different pane. Counted from the DOM of a newly created
form: zero add-content buttons; add one question and there is one. Closes #147.

It is the same button, the same popover and the same write path, rendered in the empty state at
seam 0 — no new state, no new method, no third insert path. `insertQuestionAt` already clamped with
`Math.min(seam.index, page.questions.length)`, so index 0 on an empty page was exact rather than
merely safe, and renumbering still goes through `persistQuestionOrder`, the call the drag path
makes. Index 0 is also unreachable from the per-question bar, which always opens `$index + 1`, so
the two openers cannot collide.

**The selection gate is not violated; it does not apply.** Gating the per-question bar on selection
replaced a hover-revealed gutter `+`, because hover does not exist on a touch screen. An empty
section has nothing to select, so an ungated control there follows that reasoning instead of making
an exception to it.

**This was never only a first-run condition.** A section whose last question is deleted lands in
exactly the same dead end, and it is the same block that fixes both.

`.fb-canvas-empty` loses its own dashed frame: `.fb-screen-add` *is* the dashed treatment, so the
frame became a second border 14px outside the first. It was standing in for "nothing here yet" —
the control now says that, and says what to do about it. The icon and the copy stay, because the
control alone does not say why the section is blank.
