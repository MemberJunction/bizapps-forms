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
seam 0 — no new state and no third insert path. `insertQuestionAt` already clamped with
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

**Three things review added on top of the original change.**

*The insert now leaves focus on the question it created.* `QuestionTypePickerComponent` restores
focus to whatever opened it, which is right for a dismissal — Escape, the backdrop and the close
button all land back on the control. It cannot be right for an insert, because every insert path
removes its own opener: the empty state unmounts once the section is no longer empty, and a
per-question bar unmounts once selection moves to the new question. `focus()` on a detached node is
a silent no-op, so focus fell to `<body>` and a keyboard author restarted from the top of the page.
Measured identical on **both** openers before it was treated as a defect, so it is not something the
empty-state control introduced — the pre-existing per-question path is fixed by the same change.
The canvas now focuses the card it just selected, keyed on a new `data-question-id` rather than on
the `.is-selected` styling class, via `afterNextRender` because the card does not exist yet. This is
the one new method, and the picker is left opener-independent.

*The empty state's own icon rule was capturing the new button's glyph.* `.fb-canvas-empty i` was
written when the block held one decorative illustration and nothing else, so "any descendant" and
"my own illustration" named the same set. A control in the block ends that: a rule that targets an
element beats a value it would otherwise inherit, so the plus rendered at 1.5rem in
`--mj-text-disabled` — the token reserved for things you cannot click — on an enabled control 8px
taller than the identical button two rows below it, and deaf to that button's hover colour. Both
rules are now scoped with the child combinator (`> i`, `> p`), so the trap is gone rather than
patched; `.fb-canvas-empty .fb-screen-add` stays a descendant rule on purpose, because it targets a
class and cannot capture something that merely happens to be nested.

*The control is centred in this one context.* Every canvas add-button computes
`justify-content: normal` and left-labels itself, which is right where they start a list. Inside the
empty state the button closes a centred column — a centred illustration and centred copy — so it is
centred there and only there. The three canvas buttons are unchanged.
