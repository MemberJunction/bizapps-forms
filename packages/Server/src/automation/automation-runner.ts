/**
 * Run a submission's configured automations: sync ones awaited in order, async ones dispatched
 * and left to finish.
 *
 * The ORDERING decisions live in `planAutomations`; this module only carries them out, plus the
 * two things that need the outside world — dispatch and error containment.
 *
 * Nothing here may fail a submission. By the time automations run, the respondent's answers are
 * already persisted and the submission has succeeded; an automation that throws is a problem with
 * a side effect, not with the response, and turning it into a failed submit would ask the
 * respondent to fix something they cannot see and did not cause. Failures are recorded and
 * reported, never propagated.
 */
import { LogError } from '@memberjunction/core';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import type { PlannedAutomation } from '../public-submit/automation-plan';

/** What running one automation produced. */
export type AutomationRunStatus = 'Succeeded' | 'Failed' | 'Skipped';

export interface AutomationRunResult {
  automationId: string;
  name: string;
  status: AutomationRunStatus;
  message?: string;
}

/** Runs one automation. Rejecting is allowed and contained; the runner records it as Failed. */
export type AutomationDispatcher = (automation: PublishedFormAutomation) => Promise<void>;

export interface RunAutomationsInput {
  plan: readonly PlannedAutomation[];
  dispatch: AutomationDispatcher;
  /** Awaits async automations too. Tests want this; production does not. */
  awaitAsync?: boolean;
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
    if (planned.outcome === 'skipped-condition') {
      results.push({
        automationId: planned.automation.id,
        name: planned.automation.name,
        status: 'Skipped',
        message: 'Condition did not hold for this response.',
      });
      continue;
    }
    if (planned.automation.executionMode === 'Async') {
      async.push(planned);
      continue;
    }
    if (syncHalted) {
      results.push({
        automationId: planned.automation.id,
        name: planned.automation.name,
        status: 'Skipped',
        message: 'An earlier automation failed and was configured to halt the rest.',
      });
      continue;
    }

    const result = await runOne(planned.automation, input.dispatch);
    results.push(result);
    if (result.status === 'Failed' && !planned.automation.continueOnError) {
      syncHalted = true;
    }
  }

  const asyncRuns = async.map((planned) => runOne(planned.automation, input.dispatch));
  if (input.awaitAsync) {
    results.push(...(await Promise.all(asyncRuns)));
  } else {
    // Deliberately not awaited: the respondent is waiting on the confirmation and these were
    // authored as background work. `void` plus the always-resolving runOne means an async failure
    // can never surface as an unhandled rejection and take the process down.
    asyncRuns.forEach((run) => void run);
  }
  return results;
}

/** Run one automation, converting any throw into a recorded failure. */
async function runOne(
  automation: PublishedFormAutomation,
  dispatch: AutomationDispatcher,
): Promise<AutomationRunResult> {
  try {
    await dispatch(automation);
    return { automationId: automation.id, name: automation.name, status: 'Succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    LogError(`Forms automation "${automation.name}" (${automation.id}) failed: ${message}`);
    return { automationId: automation.id, name: automation.name, status: 'Failed', message };
  }
}
