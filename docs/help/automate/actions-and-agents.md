# Run an action or an agent

Hand each submission to something your organisation has already built — a job that runs, or an AI
agent that reads.

## Which of the two you want

They are the other two answers to **What should happen when someone submits?**, and the difference
is whether the work is known in advance.

An *action* is a job somebody has already built and named, which does the same thing every time it
runs. The chooser describes it as **Send an email, create a task, call another system. Anything
already built as an action.** You are not writing one here; you are pointing your form at one that
exists.

An *AI agent* reads the submission and decides what to do with it. The chooser:
**Hand the submission to an agent to read it, score it, summarise it or route it.** Use one where
the work depends on what somebody actually wrote — sorting enquiries by subject, drafting a reply,
flagging the applications worth reading first.

If what you want is for the submission to become a record your colleagues can find, neither of these
is it: that is [Save answers into a record](save-into-a-record.md).

## Before you start

- Someone must have set up the action or the agent already. This is the part that most often stops
  the job, and there is a whole section on it below.
- A form worth wiring up: [Publish a form](../share/publish.md), since nothing here runs until the
  form is published.

## Add one

1. Open the form and choose the **Automate** tab, then **Add a step**.
2. Choose **Run an action** or **Run an AI agent**.
3. Read the line under the heading. For an action, **Which action should run?** and
   **Actions are the jobs already built in your system.** For an agent,
   **Which AI agent should run?** and **The agent receives the submitted answers to work on.**
4. Find yours. **Search actions…** and **Search agents…** filter a long list; each entry shows its
   own name with its own description under it, which is the only account of what it does that MJ
   Forms can give you.
5. Click it. That saves the step — unlike a record step, there is nothing further to configure and
   no pairing to do.
6. Publish the form.

There is no mapping stage because there is nothing to map. An action and an agent both receive the
submission whole, and what they make of it is their business, not the form's.

## If the list is empty

**There are none set up in this system yet.** means exactly that, and it is not something you can
fix from here.

Actions and agents are built once for your whole MemberJunction instance and then used by anything
that wants them. What appears in these two lists is whatever your organisation has built, so two
people reading this page at two organisations see two different lists — and a brand-new instance
shows none at all.

If the thing you need does not exist yet, that is a conversation with whoever looks after your
MemberJunction instance, not a setting you have missed. Tell them what you want to happen when
somebody submits, and they will know whether it is an action or an agent.

## What happens next

Your step appears in the list on the left, badged **Runs an action** or **Runs an AI agent**, and
its panel says in one line what it will do — **Runs this action against the submission.** or
**Hands the submission to this agent to work on.**

Everything else about it — **Switched on**, **Run it in sequence**, **Carry on if it fails**,
**Position**, and the fact that it does nothing until you publish — works the same as for any other
step: [What happens after submit](after-submit.md).

After a submission, the run shows up twice. Under the step's **Recent activity**, badged
**Succeeded**, **Failed** or **Skipped**. And on the response itself, in the
**What this submission did** panel, where **Action log** and **Agent run** open the full record of
what happened — which is where to go when a run failed and you want to know why:
[Read responses](../responses/read-responses.md).

## Related

- [What happens after submit](after-submit.md) — the four things that already happen, and the
  settings every step shares.
- [Save answers into a record](save-into-a-record.md) — the third kind of step, and the one most
  forms want first.
- [Read responses](../responses/read-responses.md) — what each submission set off, and the log
  behind a failed run.
