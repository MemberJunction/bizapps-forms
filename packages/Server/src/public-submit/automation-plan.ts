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

/** What the runner should do with one automation on this save. */
export type PlannedAutomationOutcome = 'run' | 'skipped-condition';

/** One automation paired with the decision made about it. */
export interface PlannedAutomation {
  automation: PublishedFormAutomation;
  outcome: PlannedAutomationOutcome;
}

/** The save the plan is being built for. */
export interface AutomationPlanContext {
  /** True for a finished submission, false for a partial autosave. */
  complete: boolean;
  /** The response's answers, keyed by question id — the conditional evaluator's input. */
  answers: ReadonlyMap<string, AnswerValue>;
  /** The response's running score (C4), for automations whose condition bands on it. */
  score?: number;
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
  return automations
    .filter((a) => a.isActive && triggerMatches(a, context.complete))
    .map((automation, authoringIndex) => ({ automation, authoringIndex }))
    .sort(byExecutionModeThenDisplayOrder)
    .map(({ automation }) => ({
      automation,
      outcome: shouldRun(automation, context) ? 'run' : 'skipped-condition',
    }));
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

function triggerMatches(automation: PublishedFormAutomation, complete: boolean): boolean {
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
