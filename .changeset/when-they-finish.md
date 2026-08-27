---
"@mj-biz-apps/forms-ng": patch
---

State the form's catch-all ending in the Edit logic dialog (#74).

The dialog's jump hint ends with "if none match, the respondent carries on to the next
question", which invites "…and then what?". It now answers: one read-only line naming the ending
everyone who finishes lands on, or saying plainly that nothing catches them and they will see
the form's confirmation message.

Deliberately a sentence, not a picker. #74 and QUESTION_LEVEL_LOGIC_PLAN.md §6 specify an "All
other cases go to" control, and one was built and rejected in review: the catch-all is already
authored on the Endings strip, made exclusive in v0.12, so a second writer inside a PER-QUESTION
dialog needed a caption admitting it changed the setting for every other question too. A control
that needs that caption has already failed. Stating the fact answers the question without adding
a second place that writes it.

Also fixes a latent freeze on the Endings strip: `setDefaultEnding` throws on an id naming no
eligible ending, and the builder's handler had no `try/finally`, so a refused move would have
left `busy` true and every guarded action in the builder inert.
