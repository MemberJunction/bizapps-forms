/**
 * `Forms.RunAutomations` — runs a submitted response's on-submit automations, one
 * `forms.response-submitted` message at a time (spec #303 §5). It replaces the detached promise the
 * submit path used to fire, which a process killed in that window lost for good: the message is
 * published in the submit transaction, so a committed response always has its run waiting.
 *
 * Delivery is at-least-once; idempotency is event-scoped, in `FormAutomationEngine.RunForResponse`.
 * The subscription is `Ordered` on the response id (the publisher's partition key, set by
 * `responseSubmittedRequest`), so one response's messages run in publish order; a partial-save
 * message whose response is already Complete is stale and completes having run nothing.
 *
 * What it decides is the delivery's OUTCOME:
 *  - `Complete` — the steps ran (each failure is on its own `FormAutomationRun` row);
 *  - `Retry` — a step failed transiently, the run was stopped before every step started, the
 *    automation principal is not provisioned yet, or something unexpected broke. Safe for a final
 *    submit and a partial save alike: the redelivery re-runs only the steps with no terminal run for
 *    the message's EVENT (the runs stamped with its MessageID), on their open rows;
 *  - `DeadLetter` — FINAL submits only, when nothing will change: a response that does not exist, a
 *    snapshot that cannot be read, a final message for a response that is not Complete — or the
 *    subscription's last attempt would retry. The event's open rows are closed `Failed` first (on
 *    every path, an unexpected throw included), with the `Dead-lettered: ` prefix that lets an
 *    operator's REPLAY reopen exactly those rows and run those steps.
 *
 * A PARTIAL save never dead-letters (controller ruling, Task 7 fix round 3). Under `Ordered`, a
 * dead-lettered partial would hold the response's FINAL message — confirmation email, bindings,
 * every OnComplete step — until an operator intervened. Where a final would dead-letter, a partial
 * closes its open rows as abandoned, logs one error line naming the response and the steps, and
 * completes; the next save, and in the end the final submit, supersede it.
 *
 * A run belongs to a message's event by EXACT IDENTITY: the dispatcher stamps the message's
 * `MessageID` on every run row it opens (`FormAutomationRun.WorkQueueMessageID`, folded to lower
 * case), and only rows carrying it count. That closed both races the earlier time window had: a
 * partial delivery in flight when the final was published no longer makes the final skip an
 * OnCompleteOrPartial step, and partial save P1 delivered after P2 was published no longer makes P2
 * skip its OnPartial steps (spec #303 §12). A message with no usable `MessageID` cannot be scoped:
 * a final is dead-lettered, a partial completes having run nothing.
 *
 * STILL TRUE, for the operator runbook (Task 11):
 *  - A retrying partial DELAYS its response's final (its delivery holds the key while in backoff):
 *    by at most the subscription's backoff over its attempts — about 30 s in total with
 *    `BackoffBaseSeconds` 2 and 5 attempts — plus up to `LeaseSeconds` (120 s) for each attempt
 *    that hangs until its lease expires.
 *  - A delivery the RUNTIME dead-letters itself (its lease expired on the last attempt) never
 *    reaches this handler: its rows stay open until a replay reuses them, and — a partial's — it
 *    blocks the response's final under `Ordered` until an operator replays or discards it.
 *
 * Every reason is a fixed sentence; provider and database text goes to the log only.
 *
 * Runs as two users on purpose. The host's system user (`this.ContextUser`) reads what plans the run
 * — the automation principal holds no grant on Form Versions — and the steps themselves run as the
 * automation principal, whose grants are the ceiling on what a form's steps may do.
 */
import { LogError, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { Outcome, type WorkContext, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';
import { resolveAutomationPrincipal } from '../automation/service-principal.js';
import { FormAutomationError } from '../engines/automation-errors.js';
import { FormAutomationEngine, type ResponseAutomationReport } from '../engines/FormAutomationEngine.js';
import { withIsolatedProvider } from '../shared/isolated-provider.js';
import {
  RUN_AUTOMATIONS_HANDLER_KEY,
  responseSubmittedPayloadRefusal,
  type ResponseSubmittedPayload,
} from './response-submitted.js';
import { isGuid } from '../shared/guid.js';

@RegisterClass(BaseWorkHandler, RUN_AUTOMATIONS_HANDLER_KEY)
export class RunAutomationsHandler extends BaseWorkHandler<ResponseSubmittedPayload> {
  public async Handle(message: WorkMessage<ResponseSubmittedPayload>, context: WorkContext): Promise<WorkOutcome> {
    const refusal = responseSubmittedPayloadRefusal(message.Payload);
    if (refusal || !message.Payload) {
      // Not ours — not even knowably a partial save — so it cannot be run and is dead-lettered.
      return Outcome.DeadLetter(`Not a forms.response-submitted payload: ${refusal ?? 'no payload'}.`);
    }
    const payload = message.Payload;
    const eventMessageId = messageIdOf(message);
    if (!eventMessageId) {
      // Without it no run can be told apart from another message's, so a redelivery could repeat
      // or skip side effects; nothing is run (and with no event, no row can be closed).
      return this.giveUp(Outcome.DeadLetter('The message carries no usable MessageID, which its runs are matched on.'), payload, null, null);
    }
    const principal = resolveAutomationPrincipal();
    if (!principal) {
      // `resolveAutomationPrincipal` has logged why and how to fix it.
      return this.settle(Outcome.Retry('The Forms automation principal is not provisioned on this host, so no step may run yet.'), payload, eventMessageId, context);
    }
    const purpose = `Forms.RunAutomations delivery ${context.DeliveryID} (response ${payload.ResponseID})`;
    try {
      return await withIsolatedProvider(
        purpose,
        async (provider) => {
          const outcome = lastAttemptGuard(await this.run(payload, eventMessageId, principal, context, provider), context);
          return this.giveUp(outcome, payload, eventMessageId, provider);
        },
        this.Provider,
      );
    } catch (err) {
      LogError(`[Forms.RunAutomations] ${purpose} failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      return this.settle(Outcome.Retry('The automations could not be run on this attempt; the server log has the detail.'), payload, eventMessageId, context);
    }
  }

  /**
   * Apply the last-attempt rule to an outcome reached outside a provider scope, then give up as
   * {@link giveUp} does — on a fresh isolated instance, so even an unexpected throw on the last
   * attempt closes the event's open rows first (re-review B3).
   */
  private async settle(outcome: WorkOutcome, payload: ResponseSubmittedPayload, eventMessageId: string, context: WorkContext): Promise<WorkOutcome> {
    const guarded = lastAttemptGuard(outcome, context);
    if (guarded.Kind !== 'DeadLetter') {
      return guarded;
    }
    try {
      return await withIsolatedProvider(
        `Forms.RunAutomations close-out of delivery ${context.DeliveryID} (response ${payload.ResponseID})`,
        (provider) => this.giveUp(guarded, payload, eventMessageId, provider),
        this.Provider,
      );
    } catch (err) {
      LogError(
        `[Forms.RunAutomations] the open runs of response ${payload.ResponseID} were not closed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.giveUp(guarded, payload, null, null);
    }
  }

  /**
   * What a dead letter becomes. A final submit closes its event's open rows (prefix
   * `Dead-lettered: `, which a replay reopens) and dead-letters. A partial save NEVER dead-letters:
   * it closes them as abandoned, logs one error line naming the response and the steps, and
   * completes, so it can never block its response's final under `Ordered`. With no event or no
   * provider no row can be closed; the outcome is the same.
   */
  private async giveUp(
    outcome: WorkOutcome,
    payload: ResponseSubmittedPayload,
    eventMessageId: string | null,
    provider: DatabaseProviderBase | null,
  ): Promise<WorkOutcome> {
    if (outcome.Kind !== 'DeadLetter') {
      return outcome;
    }
    const partial = payload.Trigger === 'OnPartial';
    const closed =
      eventMessageId && provider
        ? await this.closeOpenRuns(payload.ResponseID, eventMessageId, partial ? 'Abandoned' : 'DeadLettered', outcome.Reason, provider)
        : [];
    if (!partial) {
      return outcome;
    }
    LogError(
      `[Forms.RunAutomations] partial-save automations of response ${payload.ResponseID} abandoned, not dead-lettered ` +
        `(a dead letter would block the response's final message): ${outcome.Reason} Steps closed: ${closed.length > 0 ? closed.join(', ') : 'none'}.`,
    );
    return Outcome.Complete();
  }

  /** Run the event's steps; the outcome before the last-attempt rule. */
  private async run(
    payload: ResponseSubmittedPayload,
    eventMessageId: string,
    principal: UserInfo,
    context: WorkContext,
    provider: DatabaseProviderBase,
  ): Promise<WorkOutcome> {
    try {
      const report = await FormAutomationEngine.Instance.RunForResponse(
        {
          responseId: payload.ResponseID,
          trigger: payload.Trigger,
          principal,
          attempt: context.Attempt,
          signal: context.Signal,
          eventMessageId,
          isReplay: context.IsReplay,
        },
        provider,
        this.ContextUser,
      );
      return outcomeOf(report);
    } catch (err) {
      if (err instanceof FormAutomationError) {
        // Logged once already, with its detail, by the engine's boundary.
        return err.retryable ? Outcome.Retry(err.message) : Outcome.DeadLetter(err.message);
      }
      throw err;
    }
  }

  /** Best-effort: returns the steps closed; a failure is logged and closes none. */
  private async closeOpenRuns(
    responseId: string,
    eventMessageId: string,
    closedAs: 'DeadLettered' | 'Abandoned',
    reason: string,
    provider: DatabaseProviderBase,
  ): Promise<string[]> {
    try {
      return await FormAutomationEngine.Instance.CloseOpenRuns({ responseId, eventMessageId, closedAs, reason }, provider, this.ContextUser);
    } catch (err) {
      if (!(err instanceof FormAutomationError)) {
        LogError(`[Forms.RunAutomations] the open runs of response ${responseId} were not closed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return [];
    }
  }
}

/** The message's `MessageID`, folded to lower case, or `null` when it has none a run could carry. */
function messageIdOf(message: WorkMessage<ResponseSubmittedPayload>): string | null {
  const id = typeof message.MessageID === 'string' ? message.MessageID.trim() : '';
  return isGuid(id) ? id.toLowerCase() : null;
}

/**
 * On the subscription's last attempt a `Retry` would be dead-lettered by the runtime anyway; saying
 * so here lets the handler close the event's open rows with the reason first.
 */
function lastAttemptGuard(outcome: WorkOutcome, context: WorkContext): WorkOutcome {
  if (outcome.Kind !== 'Retry' || context.Attempt < context.MaxAttempts) {
    return outcome;
  }
  return Outcome.DeadLetter(`Gave up after ${context.Attempt} attempts: ${outcome.Reason ?? 'no reason given'}`);
}

/** The delivery's outcome for a run that happened. */
function outcomeOf(report: ResponseAutomationReport): WorkOutcome {
  if (report.stopped) {
    return Outcome.Retry('The run was stopped before every step had started.');
  }
  if (report.retry) {
    const failed = report.results.filter((r) => r.status === 'Failed' && r.retryable === true).map((r) => `"${r.name}"`);
    return Outcome.Retry(`Step(s) ${failed.join(', ')} failed in a way another attempt may fix.`);
  }
  return Outcome.Complete();
}

/** Anti-tree-shake anchor: `LoadBizAppsFormsServer()` calls it so `@RegisterClass` above is kept. */
export function LoadRunAutomationsHandler(): void {
  // intentionally empty
}
