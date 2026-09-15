# What happens after submit

What MJ Forms already does every time somebody submits your form, what you can add to it, and the
one guarantee that makes adding anything safe.

## The guarantee, first

Open the **Automate** tab on any form and this is the heading:
**When someone submits this form**. Under it, the sentence worth reading before anything else on the
tab:

> **Their answers are saved first, always — you can read every one on the Responses tab. Then this happens.**

Everything after this depends on it. A step you add can fail, hang, be misconfigured or be pointed
at the wrong thing, and it still cannot cost you a response. The answers were already saved before
it started. Once you have steps set up, the tab repeats the promise beside them:
**Their answers are saved before any of this runs, so a step that fails or takes its time never
costs someone their submission.**

## Four things already happen

Under the eyebrow **Already happening**, four sentences. They are not settings and there is nothing
to switch on: they run on every form that has had nothing configured.

- **Find the person who submitted, or add them if they are new.**
- **Email the respondent to confirm you received it.**
- **Create a follow-up task so someone picks it up.**
- **Have AI read the written answers and summarise them.**

Which is to say: *before you do anything at all*, your respondent is matched to a person record or
given one, sent a confirmation, turned into a task for somebody to pick up, and has their written
answers read by AI. An author who assumes a fresh form does nothing on submit is wrong in the
direction that matters — it is already emailing their respondents.

Add a step of your own and these stop being a fixed list. The tab says so:
**These are built in. Add a step of your own and they become rows here too, which you can reorder or
switch off individually.**

## Add a step

1. Open the form and choose the **Automate** tab.
2. Press **Add a step** — or **Add**, in the list down the left, if the form already has steps.
3. Answer **What should happen when someone submits?** There are three choices, and the page
   restates the guarantee while you choose:
   **Their answers are saved either way. This is what you want done with them.**
4. Pick one:
   - **Save the answers into a record** — the big one, and its own article:
     [Save answers into a record](save-into-a-record.md).
   - **Run an action** or **Run an AI agent** — [Run an action or an agent](actions-and-agents.md).
5. Finish that article's steps. You come back to a two-pane view: your steps listed on the left
   under **On submit**, and the selected one's settings on the right.
6. Publish the form. This is the step people miss, and the next section is about it.

## A step you have not published does nothing

Setting up a step does not put it into service. It goes live the way a question goes live: at the
next publish.

MJ Forms tells you this itself, under **Recent activity** on a step that has never run:
**This has not run yet. It runs the next time someone submits — after you publish.**

So the order is: add the step, check it, then press **Publish changes**. Until you do, every
submission takes the path the last published version described — which for a brand-new step means
your step is not in it. See [Publish a form](../share/publish.md).

## The settings on one step

Select a step in the list on the left and its settings sit under **Settings**, four of them.

**Switched on** — **Turn off to stop this step running, without losing how it is set up.** Turn it
off to suspend a step you are not ready to retire. A step that is off is labelled **Switched off** in
the list rather than merely greyed out, so you can tell at a glance.

**Run it in sequence** — **On: it waits for the step before it, so a later step can rely on what it
made. Off: it starts straight away, alongside the other background steps.** Turn it on when a step
needs something an earlier step produced; leave it off when the step stands on its own, which is
most of the time.

**Carry on if it fails** — **Off means a failure here stops the steps after it, which is what you
want when they depend on this one.** It only applies to steps that run in sequence, because a
background step never holds up the others, and MJ Forms disables the switch and says so when the
step is not sequential.

**Position** — **Steps that run in sequence go in this order. Background steps all start together,
so they can only be moved among themselves.** **Earlier** and **Later** move the selected step.

A step may carry one more fact, which appears beside the others rather than as a setting:
**Also runs on part-way saves, not just on the finished submission.**, or
**Only runs on part-way saves, never on the finished submission.** A step reading either of those
fires on somebody who started your form and stopped, as well as — or instead of — somebody who
submitted. Nothing on this tab sets that; a step without one of those lines runs on finished
submissions only, which is every step you can add here.

## Removing a step

**Remove this step**, then **Remove it** to confirm or **Keep it** to back out. The consequence is
spelled out beside the confirmation: **Past submissions keep whatever this already did. Only future
ones change.**

So removing a step does not undo anything it has done. Records it created stay created; emails it
sent stay sent. Removing it stops it running from the next publish onwards, and nothing more.

## What happens next

The next submission runs your steps. You do not have to wait for one to find out whether it worked:
each step's **Recent activity** lists its last runs, each badged **Succeeded**, **Failed** or
**Skipped**, with the message the run reported.

From the other end, an individual response shows the same runs in its own
**What this submission did** panel, which is usually the faster way to answer *did this one work?*:
[Read responses](../responses/read-responses.md).

## Related

- [Save answers into a record](save-into-a-record.md) — turning each submission into a person, an
  organisation or an application the rest of your system already knows about.
- [Run an action or an agent](actions-and-agents.md) — the other two kinds of step.
- [Read responses](../responses/read-responses.md) — what each submission set off, one response at
  a time.
- [Publish a form](../share/publish.md) — the step that puts anything you set up here into service.
