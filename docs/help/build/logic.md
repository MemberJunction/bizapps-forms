# Show, skip and branch

A form that asks each person only the questions that apply to them, and sends them where their
answers say they should go.

## Before you start

- A form with several questions already in it, in the order you want them. Logic is written against
  the order on the canvas, so settle the order first:
  [Add and arrange questions](add-and-arrange-questions.md).
- If you are going to send people to different ending screens, write those screens first:
  [Add sections and screens](sections-and-screens.md).

## Two rules that govern everything

Read these before you write a single rule. Nearly everything confusing about logic is one of these
two facts showing through.

*Rules are checked in order, and the first match wins.* A question can carry several rules. MJ
Forms reads them from the top and takes the first one whose conditions are satisfied; the rest are
never looked at. So an order is a meaning, not a presentation — put your narrowest rule first and
your catch-all last, or the catch-all swallows everything below it. The dialog numbers the rules
and gives you arrows to reorder them for exactly this reason.

*You can only send somebody forwards.* A rule may point at a question, a section or an ending that
comes *after* the rule, and at nothing that comes before it. The destination list simply does not
offer anything earlier. A rule may likewise only read a question the respondent has *already*
answered. There is no going back, no looping, and no "return to question 3" — a form is a path
through, not a program.

Those two constraints are what keep a form's behaviour something a person can read off the canvas.
They are also why moving a question can break a rule: a move can put a question behind something
that was reading it.

## Open the logic for a question

1. Click the question on the canvas. **Question settings** opens on the right.
2. Scroll to the **BRANCH** heading near the foot of the panel. Under it you will see
   **No rules yet. This item always shows.** and a button reading **Add**. Once the question carries
   rules, the same button reads **Edit** and the rules are summarised above it.
3. Press it. **Edit logic** opens, with the subtitle telling you what it covers — when the question
   appears, and where the respondent goes next.
4. Use **Show this question** to decide whether the question appears at all. It is a pair of
   buttons: **Always**, which is where every question starts, and **Only when…**, which opens a
   condition builder underneath.
5. Use **Then, after this question**, the block below it, to decide where the respondent goes after
   answering. Its hint states the first of the two rules above: **Rules are checked in order and the
   first match wins. If none match, the respondent carries on to the next question.** Press
   **Add rule** to write one.
6. Set the destination on each rule with **Then go to**. The menu groups what it offers under the
   section each destination lives in, then **Endings**, then **Finish**, which holds the single
   entry **Submit the form**. A section's own entry leads its group, relabelled to say you are
   jumping to the start of it.
7. Press **Done**, on the left of the dialog's footer, to keep what you have written. **Cancel**, on
   the right, throws it away — nothing you did in the dialog reached the form until you pressed
   **Done**.

## Writing a condition

A condition is a sentence in three parts: a question, a comparison, and a value to compare against.
Both **Only when…** and each **Then go to** rule use the same builder.

Above the rows sits **Match**, then **all** and **any**, then **of these:**. Choose **all** and every
row has to be true; choose **any** and one is enough. Press **Add condition** for another row.

The first box on a row offers the questions the rule is allowed to read, grouped by the section they
sit in. For **Show this question** that is every question *before* this one — a question cannot gate
itself on its own answer. For a **Then go to** rule it also includes *this* question, which is what
most branching is actually about: *if the answer to this is X, go to Y*. If there is nothing to
read, the builder says so: **Add an earlier question first to base a rule on its answer.**

### The comparisons

These are all of them. Which ones a row offers depends on the question you picked, and the narrowing
is deliberate — an offer that could never match, or could never fail, is worse than no offer.

| Comparison | What it asks |
|---|---|
| **equals** | The answer is exactly this one. |
| **does not equal** | The answer is anything but this one. |
| **is one of** | The answer is one of the several you picked. |
| **is not one of** | The answer is none of the several you picked. |
| **is greater than** | The number, rating or date is above this one. |
| **is less than** | The number, rating or date is below this one. |
| **is answered** | They put something. What they put does not matter. |
| **is not answered** | They left it blank. |

Two of those change their wording on a question that accepts several answers, such as
**Checkboxes**, because they mean something different there. **is one of** becomes
**includes any of** and **is not one of** becomes **includes none of** — the respondent's answer is
itself a list, so the question is whether the two lists overlap.

What you get, by the kind of question:

- *Picked from a list you wrote* — **Multiple choice**, **Dropdown**, **Picture choice**: equality
  and membership, and the value is picked from your own options rather than typed. That is the point
  of it. A hand-typed value that misses your spelling never matches, and the only way you find out
  is by filling in the form yourself.
- *Several answers* — **Checkboxes**: **includes any of**, **includes none of**, and the answered
  pair. No equality, because a list is never equal to one value.
- *Numbers and scales* — **Number**, **Rating**, **Opinion scale**, **Net promoter score**: the
  ordering comparisons as well, which is most of why a rating is on a form at all.
- *Dates and times*: the same ordering comparisons, on the calendar and on the clock.
- *Yes / no* — **Yes / No**, **Checkbox**, **Legal**: equality and the answered pair. There is no
  greater than yes.
- *Typed text* — **Short text**, **Long text**, **Email**: equality and the answered pair, and no
  ordering. Comparing two arbitrary sentences is not a question anyone meant to ask.
- *Everything else* — **Address**, **Contact info**, **Matrix**, **File upload**, **Doodle**,
  **Ranking**: only **is answered** and **is not answered**. Their answers are whole structures, and
  every other comparison on one is true for everybody or false for everybody.

A **Statement** collects no answer, so it never appears in the list at all.

## Sending people to different endings, by score

An ending screen carries logic too — select it on the canvas and you get the same **BRANCH** panel —
and its condition list carries one entry that no question's does: **Total score**. It reads the
running total of the points you attached to answers, so an ending can be chosen by a band:
*over 70 → the pass screen*.

**Total score** is offered on ending screens only. A rule in the middle of the form cannot read it,
because at that point the total is not finished being added up. [Score answers](scoring.md) covers
attaching the points.

## The warnings, and what they are telling you

MJ Forms says what a rule costs while you are choosing the destination, under the **Then go to**
box.

- A note like `Skips 3 questions` counts what a respondent taking this rule never sees. A jump that
  reads as a shortcut behaves as a deletion, and this is where you find that out rather than in the
  responses.
- `Skips 3 questions, 1 of them required` is the same count with the part that matters called out.
  A compulsory question that gets skipped is not asked, and nothing later complains about it.
- **This destination is no longer ahead of the rule, so it never runs** means a reorder has put the
  destination behind the rule. The rule is still stored and still reads correctly; it simply can
  never fire, because of the second of the two governing rules.

At the foot of the dialog MJ Forms states where everyone who finishes ends up: on the default ending
by name, unless a rule sends them elsewhere — or, when no ending is set as the catch-all, that they
get the form's own confirmation message instead.

On the canvas, a question or section carrying logic wears a badge: **Conditional** when something
gates whether it appears, **Branches** when it sends people somewhere. Hovering one lists its rules
in order.

## When a rule breaks

A rule breaks when the thing it depends on stops existing or stops being reachable — you deleted the
question it read, changed that question to a **Statement**, or moved something so the rule now reads
an answer that has not been given yet.

A broken rule is not harmless. A condition that reads a missing answer is not simply ignored: it
comes out *false* for the equality comparisons and *true* for **does not equal** and
**is not answered**. So the question it guards is pinned shut for every respondent, or pinned open
for every respondent, and the form looks completely normal while it happens.

The canvas says so. The badge changes to **Rule is broken**, which replaces what the rule does
rather than sitting beside it, because what it was *meant* to do stopped being the useful fact about
it.

And the form will not publish. Press **Publish** with a broken rule in it and the status line
refuses, counts them, and reads them back to you:

```
Publish refused — 2 broken rules would ship with this form. Fix them and publish again:
Show "Your postcode" when (deleted question) equals Yes — references a question that no
longer exists; After "Rating", finish on "Thanks" when Rating is greater than 3 —
references a destination that is no longer ahead of it, so the rule never runs.
```

It names up to three and counts the rest, so a form with a dozen of them says
`(and 9 more)` at the end rather than filling the line.

The refusal retracts itself the moment you fix the rules — it is a statement about the form as it
stands, not an error to dismiss. Open each named item, press **Edit** under **BRANCH**, and either
repair the rule or delete it.

## What happens next

Nothing is live until you publish. Until then the rules sit in the draft alongside everything else
you have changed.

Check them the cheap way first: press **Preview** in the bar above the tabs and answer the form as
each kind of respondent in turn. A branch that never fires and a branch that always fires look
identical on the canvas and obvious in a preview. Then publish, open your own share link, and do it
once more for real — a rule reading a question the respondent never reached is the mistake that
survives every other check.

## Related

- [Add sections and screens](sections-and-screens.md) — the endings your rules point at, and the
  labels that tell you whether anybody can reach them.
- [Score answers](scoring.md) — points per option, and using **Total score** to pick an ending.
- [The 25 question types](question-types.md) — which type gives you which comparisons.
