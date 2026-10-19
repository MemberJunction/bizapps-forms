/**
 * Decide which on-submit automations run for a given save, in what order — the pure core of the
 * automation runner.
 *
 * Separated from dispatch because these are the decisions that are worth testing exhaustively and
 * impossible to test conveniently through the I/O shell: whether a partial autosave fires
 * anything, whether a condition suppressed an automation or an author disabled it, and what order
 * a binding runs in relative to the email that reports its result. Dispatch — RunAction,
 * RunAgent, the binding executor — is the part that needs a database and a service principal, and
 * it consumes this plan rather than re-deriving it.
 */
import { evaluateConditionalRule } from '@mj-biz-apps/forms-entities';
import type { AnswerValue, PublishedFormAutomation } from '@mj-biz-apps/forms-entities';

/**
 * What the runner should do with one automation on this save. `already-terminal` is a re-run
 * meeting a step whose run for this event already finished (see {@link PriorRun}).
 */
export type PlannedAutomationOutcome = 'run' | 'skipped-condition' | 'already-terminal';

/** The `FormAutomationRun.Status` values, as the idempotency rule reads them. */
export type AutomationRunState = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Skipped';

/**
 * Terminal for an event: the step will not run again for it. `Failed` is a PERMANENT failure (one
 * that would fail the same way again); a transient one is left `Pending`, which is not terminal.
 */
export const TERMINAL_RUN_STATES: ReadonlySet<AutomationRunState> = new Set(['Succeeded', 'Failed', 'Skipped']);

/** A step's latest run for the event being delivered. */
export interface PriorRun {
  runId: string;
  status: AutomationRunState;
}

/** One automation paired with the decision made about it. */
export interface PlannedAutomation {
  automation: PublishedFormAutomation;
  outcome: PlannedAutomationOutcome;
  /** `already-terminal` only: how the event's run of this step ended. */
  priorStatus?: AutomationRunState;
  /** `run` only: the event's open (`Running`/`Pending`) row for this step, which the run reuses. */
  openRunId?: string;
}

/** The save the plan is being built for. */
export interface AutomationPlanContext {
  /** True for a finished submission, false for a partial autosave. */
  complete: boolean;
  /** The response's answers, keyed by question id — the conditional evaluator's input. */
  answers: ReadonlyMap<string, AnswerValue>;
  /** The response's running score (C4), for automations whose condition bands on it. */
  score?: number;
  /**
   * This EVENT's runs, one per automation id (any casing): the runs stamped with the outbox event's
   * id. Absent — a direct call outside the drain — means none.
   */
  priorRuns?: ReadonlyMap<string, PriorRun>;
}

/**
 * Build the ordered run plan for a save.
 *
 * Automations that do not apply — inactive, or whose trigger does not match this kind of save —
 * are absent from the plan entirely. An automation suppressed by its CONDITION is present with a
 * `skipped-condition` outcome instead, because those two are different facts about a form and only
 * one of them is interesting: "your automation did not fire because the respondent answered No" is
 * something an author needs to see, while "the automation you turned off did not run" is not.
 */
export function planAutomations(
  automations: readonly PublishedFormAutomation[],
  context: AutomationPlanContext,
): PlannedAutomation[] {
  const prior = new Map([...(context.priorRuns ?? [])].map(([id, run]) => [id.toLowerCase(), run]));
  return automations
    .filter((a) => a.isActive && triggerMatches(a, context.complete))
    .map((automation, authoringIndex) => ({ automation, authoringIndex }))
    .sort(byExecutionModeThenDisplayOrder)
    .map(({ automation }) => planOne(automation, context, prior.get(automation.id.toLowerCase())));
}

/**
 * The re-run check first, the same for a final submit and a partial save: a step whose run for
 * this event is terminal is done, whatever its condition says now; one whose run is still open runs
 * again on that row (so a re-run never leaves two rows for one step of one event).
 */
function planOne(automation: PublishedFormAutomation, context: AutomationPlanContext, prior: PriorRun | undefined): PlannedAutomation {
  if (prior && TERMINAL_RUN_STATES.has(prior.status)) {
    return { automation, outcome: 'already-terminal', priorStatus: prior.status };
  }
  if (!shouldRun(automation, context)) {
    return { automation, outcome: 'skipped-condition' };
  }
  return prior ? { automation, outcome: 'run', openRunId: prior.runId } : { automation, outcome: 'run' };
}

/**
 * Sync before Async, then DisplayOrder, then authoring order.
 *
 * The authoring-order tiebreak is why the sort carries an index: `Array.prototype.sort` is only
 * specified to be stable for the array it is given, and the filter above already rebuilt that
 * array — relying on stability across that would be relying on an accident. Two automations
 * sharing a DisplayOrder is a thing an author can trivially do, and a run order that differs
 * between deploys for no visible reason is a bug that only shows up in production.
 */
function byExecutionModeThenDisplayOrder(
  left: { automation: PublishedFormAutomation; authoringIndex: number },
  right: { automation: PublishedFormAutomation; authoringIndex: number },
): number {
  const byMode = executionModeRank(left.automation) - executionModeRank(right.automation);
  if (byMode !== 0) {
    return byMode;
  }
  const byOrder = left.automation.displayOrder - right.automation.displayOrder;
  return byOrder !== 0 ? byOrder : left.authoringIndex - right.authoringIndex;
}

function executionModeRank(automation: PublishedFormAutomation): number {
  return automation.executionMode === 'Sync' ? 0 : 1;
}

/**
 * Whether `automation` fires on a save of this kind (`complete`: a final submit). Exported because the
 * submit path asks the same question to decide whether a save owes an outbox event at all —
 * one answer for "would this step run", not two.
 */
export function triggerMatches(automation: PublishedFormAutomation, complete: boolean): boolean {
  switch (automation.trigger) {
    case 'OnComplete':
      return complete;
    case 'OnPartial':
      return !complete;
    case 'OnCompleteOrPartial':
      return true;
    default:
      // An unrecognised trigger fires nothing. The parser only admits the three known values, so
      // reaching here means the value list grew without this switch — and not firing is the safe
      // way to be wrong about a side effect.
      return false;
  }
}

function shouldRun(automation: PublishedFormAutomation, context: AutomationPlanContext): boolean {
  return evaluateConditionalRule(automation.conditionalRule, context.answers, { score: context.score });
}
