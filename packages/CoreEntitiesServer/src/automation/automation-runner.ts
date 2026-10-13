/**
 * Run a submission's planned automations: sync ones one at a time in plan order, then async ones
 * together — and wait for all of them.
 *
 * The ORDERING decisions live in `planAutomations`; this module only carries them out, plus the
 * two things that need the outside world — dispatch and error containment.
 *
 * Nothing here may fail a submission. By the time automations run the respondent's answers are
 * already persisted; an automation that throws is a problem with a side effect, not with the
 * response. Failures are recorded and reported — with whether trying again could help, which is
 * what decides whether the work-queue message that carried them is retried — never propagated.
 *
 * Async steps are awaited too (they used to be fired and forgotten so a respondent did not wait on
 * them). Nobody waits on this any more: it runs from the work queue, or detached from the submit
 * request. And the provider an async step runs on lives only as long as the call that created it, so
 * a step left running after this returned would have its transaction rolled back under it — the
 * collision bizapps-forms#260 fixed.
 */
import { LogError } from '@memberjunction/core';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import type { PlannedAutomation } from './automation-plan.js';

/** What running one automation produced. */
export type AutomationRunStatus = 'Succeeded' | 'Failed' | 'Skipped';

export interface AutomationRunResult {
  automationId: string;
  name: string;
  status: AutomationRunStatus;
  message?: string;
  /** Failed only: whether another attempt could succeed (a database blip) or not (a missing action). */
  retryable?: boolean;
  /** Skipped only: not started because the run was told to stop — it still needs running. */
  stopped?: true;
}

/**
 * Runs one automation. Rejecting is allowed and contained; the runner records it as Failed. An error
 * carrying `retryable: false` is one that would fail the same way again; any other is assumed
 * transient, because an unexpected throw is usually the environment (a connection, a timeout).
 */
export type AutomationDispatcher = (automation: PublishedFormAutomation, openRunId?: string) => Promise<void>;

export interface RunAutomationsInput {
  plan: readonly PlannedAutomation[];
  dispatch: AutomationDispatcher;
  /**
   * Stop starting automations once this aborts (a work-queue delivery that was cancelled, lost its
   * lease or is shutting down). A step already running finishes; the rest are reported Skipped.
   */
  signal?: AbortSignal;
}

/**
 * Execute a plan.
 *
 * Sync automations run one at a time in plan order, because a later one may depend on what an
 * earlier one produced — a binding creating the record that the confirmation email then reports.
 * `continueOnError: false` stops the remaining SYNC automations for that reason: once the record
 * the rest were written against does not exist, running them produces confident nonsense rather
 * than a partial success. Async automations are unaffected by that stop; they were never ordered
 * against anything.
 */
export async function runAutomations(input: RunAutomationsInput): Promise<AutomationRunResult[]> {
  const results: AutomationRunResult[] = [];
  const async: PlannedAutomation[] = [];
  let syncHalted = false;

  for (const planned of input.plan) {
    const skip = skipReason(planned);
    if (skip) {
      results.push(skippedResult(planned.automation, skip));
      // A permanent failure that halted the steps after it on the first delivery halts them on every
      // redelivery too — otherwise the redelivery would run what the author said must not run.
      if (haltsLaterSteps(planned)) {
        syncHalted = true;
      }
      continue;
    }
    if (planned.automation.executionMode === 'Async') {
      async.push(planned);
      continue;
    }
    if (input.signal?.aborted) {
      results.push(stoppedResult(planned.automation, input.signal));
      continue;
    }
    if (syncHalted) {
      results.push(skippedResult(planned.automation, 'An earlier automation failed and was configured to halt the rest.'));
      continue;
    }

    const result = await runOne(planned, input.dispatch);
    results.push(result);
    if (result.status === 'Failed' && !planned.automation.continueOnError) {
      syncHalted = true;
    }
  }

  if (input.signal?.aborted) {
    results.push(...async.map((planned) => stoppedResult(planned.automation, input.signal)));
    return results;
  }
  results.push(...(await Promise.all(async.map((planned) => runOne(planned, input.dispatch)))));
  return results;
}

function haltsLaterSteps(planned: PlannedAutomation): boolean {
  return (
    planned.outcome === 'already-terminal' &&
    planned.priorStatus === 'Failed' &&
    planned.automation.executionMode !== 'Async' &&
    !planned.automation.continueOnError
  );
}

/** Why the plan says not to run this one, or `null` when it should run. */
function skipReason(planned: PlannedAutomation): string | null {
  switch (planned.outcome) {
    case 'skipped-condition':
      return 'Condition did not hold for this response.';
    case 'already-terminal':
      return `Already ${planned.priorStatus ?? 'finished'} for this submission; a redelivery does not run it again.`;
    default:
      return null;
  }
}

function skippedResult(automation: PublishedFormAutomation, message: string): AutomationRunResult {
  return { automationId: automation.id, name: automation.name, status: 'Skipped', message };
}

function stoppedResult(automation: PublishedFormAutomation, signal: AbortSignal | undefined): AutomationRunResult {
  return {
    ...skippedResult(automation, `Not started: the run was stopped (${String(signal?.reason ?? 'aborted')}).`),
    stopped: true,
  };
}

/** Run one automation, converting any throw into a recorded failure. */
async function runOne(planned: PlannedAutomation, dispatch: AutomationDispatcher): Promise<AutomationRunResult> {
  const automation = planned.automation;
  try {
    await dispatch(automation, planned.openRunId);
    return { automationId: automation.id, name: automation.name, status: 'Succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    LogError(`Forms automation "${automation.name}" (${automation.id}) failed: ${message}`);
    return { automationId: automation.id, name: automation.name, status: 'Failed', message, retryable: isRetryable(error) };
  }
}

function isRetryable(error: unknown): boolean {
  return !(typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false);
}
