/**
 * Re-drive automations that failed for a reason worth retrying.
 *
 * Inline execution is the happy path; this is what makes a binding survive the process dying
 * mid-write, a database blip during an identity lookup, or a deploy that restarted the API between
 * a response being saved and its automation finishing.
 *
 * WHAT IS PENDING IS DERIVED FROM STATE, not from a queue. MJ 5.51 has no at-least-once primitive
 * — MJQueue is in-memory and at-most-once, and the claim-based dispatcher is a later version — so
 * a queue here would be a second source of truth that can itself be lost. A `FormAutomationRun`
 * row that is `Failed` with attempts left IS the work item, which means recovery after a crash is
 * a query rather than a replay of something we hope was durable.
 *
 * Only RETRYABLE failures come back. A config-scoped failure — a column that does not exist, a rule
 * that will not parse — produces exactly the same result every time, so re-running it burns the
 * attempt budget and buries the real signal under repeated identical errors.
 */
import { LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { mjBizAppsFormsFormAutomationRunEntity } from '@mj-biz-apps/forms-entities';

/**
 * How many times one automation may be attempted for one response before it is left alone.
 *
 * The limit-hit case is explicit: the run is parked `Failed` at the cap and surfaces in the
 * activity view. Retrying forever turns one broken form into a permanent load on whatever it
 * writes to, and hides the failure by making it indistinguishable from ordinary churn.
 */
export const MAX_BINDING_ATTEMPTS = 5;

/** A run the sweep decided to retry. */
export interface RetryCandidate {
  runId: string;
  automationId: string;
  responseId: string;
  attemptCount: number;
}

/**
 * Which failed runs are worth another attempt.
 *
 * Pure, so the policy can be tested without a database: the sweep's whole job is deciding what NOT
 * to touch, and that is the part that is expensive to get wrong.
 */
export function selectRetryCandidates(
  runs: readonly { ID: string; FormAutomationID: string; FormResponseID: string; AttemptCount: number; ErrorMessage: string | null }[],
  maxAttempts: number = MAX_BINDING_ATTEMPTS,
): RetryCandidate[] {
  return runs
    .filter((run) => run.AttemptCount < maxAttempts && isRetryable(run.ErrorMessage))
    .map((run) => ({
      runId: run.ID,
      automationId: run.FormAutomationID,
      responseId: run.FormResponseID,
      attemptCount: run.AttemptCount,
    }));
}

/**
 * Whether a recorded failure is one that might succeed next time.
 *
 * Read off the message because that is what the run row preserves; the executor prefixes a
 * config-scoped failure with `config:`, and those are deterministic by definition — the same
 * mapping against the same entity fails identically forever.
 */
function isRetryable(errorMessage: string | null): boolean {
  if (!errorMessage) {
    // No recorded reason usually means the process died between opening the run and closing it,
    // which is the exact case this sweep exists for.
    return true;
  }
  return !errorMessage.startsWith('config:');
}

export interface SweepResult {
  examined: number;
  retried: number;
  parked: number;
}

/**
 * Find failed automation runs and re-drive the retryable ones.
 *
 * `retry` is injected so the sweep can be exercised without dispatching anything, and so the
 * caller decides what re-running means — production hands it the same dispatcher the submit path
 * uses, which is what keeps the two from drifting.
 */
export async function sweepFailedAutomations(
  principal: UserInfo,
  retry: (candidate: RetryCandidate) => Promise<void>,
  maxAttempts: number = MAX_BINDING_ATTEMPTS,
): Promise<SweepResult> {
  const result = await new RunView().RunView<{
    ID: string;
    FormAutomationID: string;
    FormResponseID: string;
    AttemptCount: number;
    ErrorMessage: string | null;
  }>(
    {
      EntityName: 'MJ_BizApps_Forms: Form Automation Runs',
      ExtraFilter: `Status='Failed' AND AttemptCount < ${maxAttempts}`,
      Fields: ['ID', 'FormAutomationID', 'FormResponseID', 'AttemptCount', 'ErrorMessage'],
      ResultType: 'simple',
      OrderBy: '__mj_CreatedAt ASC',
    },
    principal,
  );
  if (!result.Success) {
    LogError(`Forms automation sweep: could not read failed runs: ${result.ErrorMessage}`);
    return { examined: 0, retried: 0, parked: 0 };
  }

  const candidates = selectRetryCandidates(result.Results, maxAttempts);
  let retried = 0;
  for (const candidate of candidates) {
    try {
      await retry(candidate);
      await bumpAttempt(candidate, principal);
      retried += 1;
    } catch (error) {
      // One failing retry must not stop the sweep reaching the rest; it is recorded on its own row.
      await bumpAttempt(candidate, principal);
      LogError(`Forms automation sweep: retry of run ${candidate.runId} failed: ${messageOf(error)}`);
    }
  }

  const parked = result.Results.length - candidates.length;
  LogStatus(`Forms automation sweep: ${result.Results.length} failed run(s), ${retried} retried, ${parked} left alone.`);
  return { examined: result.Results.length, retried, parked };
}

/** Record the attempt, so a permanently broken automation walks to the cap instead of looping. */
async function bumpAttempt(candidate: RetryCandidate, principal: UserInfo): Promise<void> {
  const row = await new Metadata().GetEntityObject<mjBizAppsFormsFormAutomationRunEntity>(
    'MJ_BizApps_Forms: Form Automation Runs',
    principal,
  );
  if (!row || !(await row.Load(candidate.runId))) {
    return;
  }
  row.AttemptCount = candidate.attemptCount + 1;
  if (!(await row.Save())) {
    // If this cannot be recorded the sweep would retry the same row forever, so say so loudly.
    LogError(`Forms automation sweep: could not record attempt ${candidate.attemptCount + 1} on run ${candidate.runId}.`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
