# Score answers

A form that adds up what people picked and sends them to an ending that fits their total.

## Before you start

- Some questions whose answers you wrote yourself. **Scoring** appears on the five types that carry
  options — **Multiple choice**, **Checkboxes**, **Dropdown**, **Picture choice** and **Ranking** —
  because points attach to an option, and a typed answer has none. See
  [The 25 question types](question-types.md).
- At least two ending screens, if you want the score to decide which one people see. See
  [Add sections and screens](sections-and-screens.md).
- One thing settled first, because it changes what scoring is for: *the respondent never sees their
  score*. It is a number you use, not a result you give them.

## Score a form

1. Click a scoring question on the canvas and find **Scoring** in **Question settings**. Its hint is
   the whole design in one line: **Points per answer. The running total can route ending screens
   (score bands) and automations.**
2. Turn it on. A row appears for every option on the question, with your wording on the left and a
   box on the right.
3. Type a number into each box. Zero, negative and decimal numbers are all fine, and an option you
   leave empty is worth nothing. Points on a **Checkboxes** question add up across everything the
   respondent ticked.
4. Repeat on every question that should count. Questions you leave alone contribute nothing, which
   is how you score three questions on a form of twenty.
5. Click an ending screen on the canvas — the **Endings** strip at the foot — and press **Add**
   under **BRANCH** to give it a condition.
6. In the first box of the condition row, choose **Total score**. It sits at the end of the list,
   below the questions. Then pick **is greater than**, **is less than** or **equals**, and type the
   number.
7. Write a condition on each ending except the one you want as the catch-all, and leave that one as
   the **Default ending**. Endings are checked in order and the first match wins, so the ending
   with the narrowest band goes first.

## A worked example: a readiness quiz

Six **Multiple choice** questions, each with three options worth 0, 1 and 2, so the total runs from
0 to 12. Three endings:

| Ending | Its condition | What it says |
|---|---|---|
| *Ready to go* | **Total score** **is greater than** 9 | You are in good shape. Here is the sign-up link. |
| *Nearly there* | **Total score** **is greater than** 5 | A couple of things to sort out first — here they are. |
| *Start here* | none; it is the **Default ending** | Worth going through the basics. Here is the guide. |

Read that top to bottom the way MJ Forms does. A total of 11 matches the first condition and stops.
A total of 7 fails the first, matches the second, and stops. A total of 3 matches neither, so it
falls through to the default. Put *Nearly there* above *Ready to go* and everybody scoring 11 gets
*Nearly there*, because `is greater than 5` is true of them too and the first match wins.

That is the one mistake worth checking for, and **Preview** catches it in a minute: answer the form
as your best case, your middling case and your worst case, and see which screen you land on.

## Where the total is and is not available

**Total score** is offered on an ending screen's condition and nowhere else. A rule in the middle of
the form cannot read it, because at that point there is no total — only part of one, and a rule
banding on a half-finished sum would behave differently depending on how far somebody had got.

So scoring routes *endings*. It does not skip questions, and it cannot show or hide one. If you want
a question to appear only for certain people, gate it on the answer that matters rather than on the
running total: [Show, skip and branch](logic.md).

## What happens next

Two things are true about the total, and both surprise people, so they are worth saying plainly.

- *The respondent never sees it.* There is no score on the ending screen, no percentage, no
  right-and-wrong marking. The only thing their total does is decide which ending they land on — and
  that screen says whatever you wrote on it.
- *It is not in the export.* The spreadsheet from **Responses & Analytics** carries the response
  id, its status, when it started, when it was submitted, the respondent, and then one column per
  question. There is no total column. What you can tell from the export is which ending each person
  reached, which is the banding you set up, read back.

So the ending screen is where a score becomes visible work. Write each one as the answer you would
have given that person, because that screen is the only thing their total produces.

## Related

- [Show, skip and branch](logic.md) — the rest of the rule system, including the ordering rule that
  decides which band wins.
- [Add sections and screens](sections-and-screens.md) — writing the endings a score routes people
  to, and reading the labels that say whether anyone can reach them.
- [The 25 question types](question-types.md) — which five types can carry points, and why.
