---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

A dead-lettered automation event is now visible and can be replayed (#311). Before, a final
submit whose automations gave up was only a `DeadLetter` row in `FormAutomationEvent`.

- **Logged.** Once the dead letter is written, the drain logs one error line naming the response,
  the trigger, the reason and the steps it closed. A drain that lost its lease before it settled
  logs no dead letter: the event is the new holder's.
- **The form's owner is notified in-app**, through the new `Form Automation Failed` user
  notification type (in-app on by default, email off, the user may change it). The notice names the
  form, the reason and the steps closed, and carries the response's and the event's ids. A form with no owner sends
  nothing; a notice that fails is logged and changes nothing about the event.
- **"Retry automations"** in the response detail. A dead-lettered event shows under an
  "Automations failed" badge with its last error, beside a button that re-queues it with a fresh
  attempt budget, runs it once, now, and reloads the detail to show how it ended. The replay reruns
  only the steps the dead letter closed; a step that already succeeded is never run twice.
- **`Forms.ReplayAutomationEvent`** (`forms:write`, authoring permission) is the operation behind
  the button. It refuses an event that is not dead-lettered, or that a concurrent replay already
  re-queued, naming the event. `Forms.GetResponseDetail` gains `AutomationEvents`, the response's
  outbox events oldest first.
- **A refused record write is no longer retried.** A binding step whose `Save()` the entity layer
  refuses (validation, permission) now fails without a retry, since every attempt would be refused
  the same way; it used to spend all five attempts first.

The `Form Automation Failed` notification type and the `Forms.ReplayAutomationEvent` remote
operation ship in this release's metadata seed (`Metadata_Sync`); until a host has it, dead letters
are logged but nobody is notified, and the button is refused. `forms-core-entities-server` gains the
MJ peer `@memberjunction/notifications`. Runbook, including the hand-run replay update for a host
without the UI: `docs/local-host.md`, "Operating the automation outbox".
