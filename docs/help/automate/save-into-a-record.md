# Save answers into a record

Each submission becomes something your organisation already keeps track of — a person, an
organisation, an application — so that the rest of your system can find it, report on it and act on
it without anybody retyping a thing.

## Before you start

- The questions written and worded the way you will keep them:
  [Add and arrange questions](../build/add-and-arrange-questions.md). Your wording is what MJ Forms
  matches against, so a question called *Email* pairs itself up and one called *Q4* does not.
- At least one finished response, if you want to check your work before committing it. The check is
  the last step below, and it is worth having.
- A rough idea of what a submission *is*, in your organisation's words. One application? One person?
  One registration? That answer decides everything else on this page.

## What this is for

A response is a response. It sits in MJ Forms, it is yours to read and to export, and that is the
whole of what it is.

A [record](../reference/glossary.md) is different. It is one of the things your organisation already
works with day to day — the people it knows, the organisations it deals with, the applications it
processes. Records are what your colleagues search, what your reports count, and what everything
else your organisation runs can already see.

This step is the bridge between the two. Set it up once, and every submission from then on writes a
record, or updates the one that is already there. The product puts it in a sentence when you pick
this option: **Turn each submission into a real record — a person, an organisation, an application
— that the rest of your system can already find, report on and act on.**

The practical difference shows up six weeks later, when somebody who has never opened MJ Forms asks
how many enquiries came in last month. If your form only collects responses, the answer lives in a
place they do not go.

## Set the step up

1. Open the form and choose the **Automate** tab, then **Add a step**.
2. Choose **Save the answers into a record**.
3. Read **Which record should a submission create?** and the line under it:
   **Pick the thing a submission is really about — the person applying, the organisation
   registering. Each submission will create one, or update it if it already exists.**
4. Pick the kind of record. **Most forms use one of these** offers the handful almost every form
   wants. If yours is not there, type into **Search** — its placeholder is the hint:
   **Start typing — people, organisation, application…** — because
   **Anything else in your system works too — search for it above.**
5. The page changes to **What goes into** and the name of what you picked. If you picked wrongly,
   **Change** takes you back; nothing is saved until the last step.
6. Pair each answer with the place it belongs. That is the next section.
7. Decide what happens when the record is already there. That is the section after it.
8. Press **Try it against a real response** and read what comes back. Do this before the next step,
   every time.
9. Press **Add this step**.
10. Publish the form. Nothing runs until you do — see
    [What happens after submit](after-submit.md).

## Pairing answers with places

The middle of this job is one table, and one sentence under the heading describes all of it:
**Each answer below goes into the field beside it. Anything you leave blank is left alone on the
record.**

Three columns:

- **Field** — a place on the record. One row per place. A place that cannot be left empty carries a
  star, with the tooltip **This field cannot be left empty**.
- **Answer** — which of your questions fills it. Every row starts at **Leave empty**, which means
  *do not write anything here*, and the list offers only the questions whose answers would fit that
  place.
- **If it already has a value** — what to do when the record already holds something there. Three
  choices, covered below.

MJ Forms fills in some rows for you by matching your question wording to the names of the places. It
says how many it paired that way, and it does not pretend to be sure about them — the note ends
**by name — worth a check.** Check them. A question you called *Name* can land somewhere reasonable
and somewhere wrong with equal confidence.

The table starts short. **Show all** opens every place on the record — often dozens — and
**Show fewer** puts it back. Most forms need four or five rows and nothing else.

### If it already has a value

This column only comes into play when your step updates a record rather than creating one, and it
is per row, so different answers can behave differently.

**Keep what is there if the answer is blank** — write the new answer, unless the respondent left the
question empty, in which case leave what is already on the record. The sensible default for almost
everything.

**Always use the new answer** — the latest submission wins, even when it is blank. Use it where the
newest answer is by definition the true one: a current employer, a current address.

**Only fill it in if it is empty** — write once and never again. Use it for something that should
not change after it is first recorded.

### If the record already exists

One choice, under its own heading, and the one people get wrong.

**Always add a new one** is the default, and it means what it says: every submission creates a
separate record. Somebody who fills your form in twice becomes two people. For a form where each
submission genuinely is a separate thing — an incident report, a booking — that is correct.

The alternatives read **Update the one with the same** followed by the name of one of the places you
filled in above. Pick the one that identifies a person or an organisation uniquely — an email
address, usually — and MJ Forms looks for a record already holding that value and updates it rather
than adding another. The hint says why the list is short:
**Matching updates that record instead of adding another one every time. Only a field you filled in
above can be matched on — the value has to come from somewhere.**

Choose the wrong one here and the damage is quiet. Matching on a first name merges every Sarah who
ever answers your form into one record. Matching on nothing at all leaves you with four records for
the person who submitted four times. Neither announces itself.

## Try it against a real response

**Try it against a real response** is the whole reason this page can be written without a warning
attached to it. Press it and MJ Forms takes the most recent finished response to this form, runs
your mapping against it, and lists under **Your latest response would write** exactly what would go
where — using a real person's real answers.

It writes nothing. It only reports.

Do this before **Add this step**, and read every line. A mapping that is silently wrong is invisible
until your records are already wrong, and at that point it is somebody's afternoon to unpick.

Three things it may tell you instead:

- **Nobody has finished this form yet, so there is nothing to try it on.** Open your own share link
  and answer the form, then press it again.
- **That response could not be read.** The check failed rather than passed. Do not treat it as a
  pass.
- **That response left every mapped question blank, so nothing would be written.** Your mapping is
  pointed at questions that person skipped. Either the mapping is wrong or that response was a poor
  one to test against.

If you have not paired a single answer yet, the button and its neighbour both stay disabled, with
**Choose an answer for at least one field to continue.** underneath.

## What happens next

Your step appears in the list on the left, badged **Saves a record**, and its own panel repeats the
mapping under **What it writes** — one line per place, and a sentence saying whether it
adds a record every time or updates a matching one. That panel is where you check months later what
this form has been doing.

After the next submission, two places show you it ran. The step's own **Recent activity** lists the
run. The response itself carries a **What this submission did** panel naming the record, badged
**Created**, **Merged** or **Unchanged**, with **Open record** to go and look at it:
[Read responses](../responses/read-responses.md).

**Unchanged** is worth recognising. It means the step found the record, had nothing new to write,
and correctly did nothing.

## Related

- [What happens after submit](after-submit.md) — the settings shared by every step, and the publish
  that puts this one into service.
- [Run an action or an agent](actions-and-agents.md) — the other two things a submission can set
  off.
- [Read responses](../responses/read-responses.md) — checking, one response at a time, what this
  step actually did.
- [Glossary](../reference/glossary.md) — *record*, *automation* and the other words this page uses
  in a particular sense.
