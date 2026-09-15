# Export responses

Every finished response to one form as a spreadsheet — from **Responses & Analytics**, which is not
the **Responses** tab in the builder, and that difference is where the afternoon goes.

## Before you start

- The export is not on the **Responses** tab. That tab, inside the builder, shows this form's
  responses one at a time. It has no export button, it never had one, and looking harder will not
  produce one. The export is on **Responses & Analytics**, the second link on the **Forms** card on
  your MemberJunction home page; the two places, and which job belongs to which, are in
  [Where everything lives](../get-started/where-everything-lives.md).
- A form that has been published at least once and has collected at least one finished response.
  Nothing else appears on the dashboard: [Publish a form](../share/publish.md).

## Export a form's responses

1. Open **Responses & Analytics**.
2. Find the form in the list down the left-hand side. **Find a form** filters that list by name, and
   the number beside each form is how many finished responses it holds.
3. Click the form, and wait for its report to load.
4. Press **CSV** or **Excel** — the two buttons under **Export responses**, at the right-hand end
   of the header.

The file downloads immediately, named after the form. Either button exports exactly the same rows
and columns: choose **CSV** when another program is going to read the file, **Excel** when a person
is.

You do not have to be on either view to export. **Insights** and **Responses** change what is on
screen; the export buttons sit above both and always export the whole thing.

## What a row is

One row per finished response — one person, one sitting, every question across the page.

Five columns come first, and they are the same on every form:

| Column | What is in it |
|---|---|
| **Response ID** | MJ Forms' own reference for the response. Useful when you need to point somebody at one exact row, and safe to ignore otherwise. |
| **Status** | How far the person got. Today every exported row reads the same, because only finished responses are exported. |
| **Started At** | When they opened the form. |
| **Submitted At** | When they pressed submit. The gap between the two is how long the form took that person. |
| **Respondent** | The name, if MJ Forms could work one out. Usually **Anonymous** — [Read responses](read-responses.md) explains why, and it is not a fault in your form. |

After those comes one column per question, in the order you asked them, each headed with the
question's own wording. Change the wording of a question and the column heading changes with it,
because the heading is read from the form rather than stored in the sheet.

Questions that ask nothing are left out, which is one **Statement**-shaped hole in the columns and
no more: see [The 25 question types](../build/question-types.md).

## Three things the file does not carry

*The people who did not finish.* The export is finished responses only, exactly like the
**Responses** tab. How many started and stopped, and where, is on **Insights** instead:
[Read the insights](insights.md).

*Uploaded files.* A file answer exports as the file's reference, not the file. That reference is
the link between the row and the stored file, which is why it is there rather than being left blank
— but to actually read what somebody sent you, go to
[Find uploaded files](files.md).

*The scores the AI step writes.* One of the built-in steps has AI read the written answers, and
what it writes per answer is deliberately left out of the sheet. It scores every short answer,
including ones where a score means nothing — a first name scored 100 sitting in a column next to a
number that does mean something is worse than no column at all.

## If the export fails

A failure shows **Export failed.** in a red bar across the top of the report, with **Dismiss** to
clear it. Nothing was downloaded and nothing was changed. Press the circular arrow beside the
export buttons to re-read the form's responses, then try again; if it keeps failing, the report
itself is failing to load, and that is worth passing to whoever looks after your MemberJunction
instance.

## What happens next

The file is in your downloads folder, named after the form. Exporting reads the responses and writes
nothing back, so you can export the same form as often as you like, and each export is the responses
as they stand at that moment.

## Related

- [Read responses](read-responses.md) — one response at a time, with what its submission set off.
- [Read the insights](insights.md) — the answer to *what did they say* without opening a
  spreadsheet at all.
- [Where everything lives](../get-started/where-everything-lives.md) — why the export is on the
  dashboard and not on the tab.
- [What MJ Forms cannot do yet](../reference/not-yet.md) — the AI scores and the half-finished
  responses this file leaves out, and what to do instead of waiting for them.
