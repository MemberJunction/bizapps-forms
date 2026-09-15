# Read responses

Everything one person sent you — their answers, when they submitted, and what their submission set
off — read one at a time, on the tab beside the questions you wrote.

![The Responses tab, listing one row per submission with who sent it, how far they got, how many
questions they answered and when — and a search box above them.](../images/responses-tab.png)

## Before you start

- A published form with a share link, so that there is something to read:
  [Publish a form](../share/publish.md), then [Create a share link](../share/share-link.md).
- At least one response. If nobody has answered yet, open your own link and answer it. It counts as
  a real response and you can read it back within seconds.

## Open a response

1. Open the form and choose the **Responses** tab.
2. Read the line under the heading. It counts what you have, and says the count is
   **across every published version of this form.** — publishing again does not start it over.
3. Find the response in the table. Its columns are **Status**, **Respondent**, **Answered** — how
   many questions that person actually filled in, not how many you asked — and **Submitted**.
4. Narrow a long table with **Search respondent**. It matches the **Respondent** column and nothing
   else, so it finds people by name and never by what they answered.
5. Click anywhere on the row. The table gives way to that one response: every question, in the order
   you asked it, with the answer underneath.
6. Press **Back to responses** to go back to the table.

Nothing on this tab changes the form or the response, so you can read, leave and come back without
touching anything. **Refresh** re-reads the list, which is worth pressing if you are watching
answers arrive.

## Why the respondent reads Anonymous

This is the first thing every author asks, and usually about a form that plainly asked for a name.

**Respondent** is the person a response belongs to, and a share link deliberately knows nobody:
your respondents do not sign in and have no account of any kind. So MJ Forms falls back to reading a
name out of the answers — but it only recognises a name when the question is *about* a name, one
whose wording says *full name*, *first name* or *last name*, or when the question is of the
**Email** type.

A **Contact info** question is neither. It is one question drawing five boxes, and its wording is a
heading for the block rather than a name question, so there is nothing for MJ Forms to recognise.
That is why a form which collected a first name, a last name and an email address through
**Contact info** still reads **Anonymous** in this column.

The answers themselves are not lost, and nothing went wrong. Open the response and they are all
there. *Anonymous* is a statement about identity, not about what you hold — and turning each
submission into a person your team can find later is
[Save answers into a record](../automate/save-into-a-record.md).

## Where the half-finished responses are

The table lists finished responses. Somebody who started your form and stopped *is* saved — MJ Forms
does that on its own, on every form, without your having to switch anything on — but they never
arrive here as a row you can open, and they are not in the export either.

What you get instead is the count, next door. **Responses & Analytics** shows how many people
started and did not finish beside how many did, and charts where they gave up:
[Read the insights](insights.md).

This also accounts for a control you may have gone looking for. The filter offering **All**,
**Complete** and **Partial** appears only when the table holds more than one status, and today it
never does. If you could not find it, it was not hidden from you and nothing is broken — opening a
half-finished response is on the short list of things
[MJ Forms cannot do yet](../reference/not-yet.md).

## What this submission did

Under the answers, a response that set something off carries a panel headed
**What this submission did**.

One line per thing that ran, each badged with how it went — **Succeeded**, **Failed**, **Running**,
**Pending** or **Skipped** — followed by how long it took and how many attempts it made.
**Action log** and **Agent run** open the full record of a run you want to look into.

Below those, one line per record the submission wrote, badged **Created**, **Merged** or
**Unchanged**, with **Open record** to go straight to that record and **Wrote** followed by the
fields it filled in. What any of this is, and how to set it up, is
[What happens after submit](../automate/after-submit.md).

No panel means the submission set nothing off beyond the built-in steps, which is the normal state
of a form nobody has automated.

## When an answer has no question to sit under

Occasionally a response reports that some of its answers are **not shown: the form version being
used for labels has no matching question, so there is no truthful prompt to show them under.**

That happens when a question the respondent answered has since been deleted. MJ Forms labels
answers from the current published version, and it will not invent a prompt for a question that is
no longer in it. The answers are still stored; the export still carries every column the current
version has.

## What the tab says instead of a table

**Not published yet** — nobody could have answered, because no version of this form exists to
answer. The tab tells you where to go: **Publish and distribute this form to start collecting
responses. The Distribute tab creates the link people fill in.**

**No responses yet** — the form is live and waiting. Open your own link and answer it, which proves
the whole path from link to table in about a minute.

## What happens next

Reading a response changes nothing about it, so there is no state to check afterwards. The two
things authors do next are read all of them at once —
[Read the insights](insights.md) — and take them out of MJ Forms entirely:
[Export responses](export.md).

## Related

- [Export responses](export.md) — the same responses as a spreadsheet, from the dashboard rather
  than this tab.
- [Read the insights](insights.md) — what the answers add up to, including the people who started
  and did not finish.
- [Find uploaded files](files.md) — getting the actual file behind a file answer.
- [What happens after submit](../automate/after-submit.md) — what fills in the
  **What this submission did** panel.
