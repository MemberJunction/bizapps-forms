---
"@mj-biz-apps/forms-ng": patch
---

**A range no answer could satisfy is refused where it is authored (#80).** A `Number` question
accepted a minimum of 500 beside a maximum of 120 with no warning and no inline error, persisted it
to `FormQuestion.ValidationRule` as `{"min":500,"max":120}`, and shipped it. Both validators — the
widget's and the server's — apply the bounds in sequence, so every possible answer failed one of
them: the respondent entering `100` was told "Must be at least 500." and the respondent entering
`500` was told "Must be at most 120.", two mutually exclusive instructions with nothing anywhere
saying the form itself was broken. On a required question the form could not be submitted at all.

**The pair is one decision, so it is checked as one.** The validation-rule editor no longer emits a
rule whose bounds contradict each other; it holds both numbers on screen, names the conflict, and
says the rule is not being saved until one of them moves. Equal bounds stay valid — "exactly 5" is a
rule authors write on purpose — and clearing either box is never refused, which is what keeps an
open-ended range legal and gives an inherited contradiction a way out. The check is derived from the
rule rather than recorded when an edit is refused, so a form that already holds an impossible range
— authored before this existed, or written by mj-sync metadata or the AI builder — states its
problem the moment its question is opened instead of sitting there looking correct.

**Both bounded pairs, not just the reported one.** `minLength`/`maxLength` traps a text respondent
through the same sequential validators that `min`/`max` traps a number respondent; the invariant
belongs to a bounded question, not to a number question. `rangeConflict` in `validation-bounds.ts` is
pure and about the rule rather than about the editor, so a publish-time preflight can consult the
same two numbers rather than growing a second opinion about them.

**And the host stopped taking back what the editor is holding.** `QuestionEditorComponent`'s
`validationRule` getter parsed the stored JSON on every read, handing the editor a fresh object on
every change-detection pass and resetting it each time. That was invisible while the editor emitted
everything it was given, and would have erased the number the author is being asked to fix the
moment it legitimately withholds one. It is now the same object while the question and its stored
rule are unchanged.
