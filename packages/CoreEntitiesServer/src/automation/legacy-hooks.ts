/**
 * The four legacy on-submit Actions, fired by NAME for a form that configures none of its own
 * (`resolveOnSubmitDispatch` says `legacy`) — the one implementation, called only by the
 * `Forms.RunAutomations` Work Queue handler since #303 retired the submit pipeline's in-process path.
 *
 * Each is resolved defensively via `ActionEngineServer.GetActionByName` and SKIPPED-with-log when
 * absent: a host may not have them all, and the legacy runner never failed a submission for it.
 * Each receives the four response-context ids (`FormResponseID`, `FormID`, `FormVersionID`,
 * `DistributionID`) as input params — the S3 contract every on-submit action reads — and never the
 * answers, which an action execution log would otherwise persist unredacted.
 *
 * These write no `FormAutomationRun` rows (there is no automation row for a run to name), so a
 * redelivered final-submit message fires them again; a form that needs exactly-once side effects
 * configures its own steps, which the handler deduplicates.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { LogError, LogStatus } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { LEGACY_ON_SUBMIT_ACTION_NAMES, type LegacyOnSubmitActionName } from '@mj-biz-apps/forms-entities';

/** The response a legacy hook acts on. */
export interface LegacyHookContext {
  responseId: string;
  formId: string;
  formVersionId: string;
  distributionId: string;
}

/** What firing one legacy hook did. */
export interface LegacyHookResult {
  name: LegacyOnSubmitActionName;
  status: 'fired' | 'skipped-not-registered' | 'failed';
  message?: string;
}

/**
 * Fire all four, in their legacy order, one after another on `provider` as `contextUser`. Never
 * throws: a hook that fails is a `failed` result and the next one still runs. The caller has
 * configured `engine` for `contextUser`.
 */
export async function runLegacyOnSubmitHooks(
  ctx: LegacyHookContext,
  contextUser: UserInfo,
  provider: DatabaseProviderBase,
  engine: ActionEngineServer = ActionEngineServer.Instance,
): Promise<LegacyHookResult[]> {
  const results: LegacyHookResult[] = [];
  for (const name of LEGACY_ON_SUBMIT_ACTION_NAMES) {
    results.push(await fireOne(engine, name, ctx, contextUser, provider));
  }
  return results;
}

/** The standard input params passed to every on-submit action. */
function hookParams(ctx: LegacyHookContext): ActionParam[] {
  return [
    Object.assign(new ActionParam(), { Name: 'FormResponseID', Value: ctx.responseId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'FormID', Value: ctx.formId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'FormVersionID', Value: ctx.formVersionId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'DistributionID', Value: ctx.distributionId, Type: 'Input' as const }),
  ];
}

/**
 * Resolve + run one action by name; never throws.
 *
 * The lookup runs INSIDE the try, not just the RunAction call: a throwing lookup used to escape and
 * be caught only at the chain level, which reported ALL FOUR hooks failed — overwriting the real
 * result of any hook that had already run (bizapps-forms#260 final review, F2).
 */
async function fireOne(
  engine: ActionEngineServer,
  name: LegacyOnSubmitActionName,
  ctx: LegacyHookContext,
  contextUser: UserInfo,
  provider: DatabaseProviderBase,
): Promise<LegacyHookResult> {
  try {
    const action = engine.GetActionByName(name);
    if (!action) {
      LogStatus(`[forms] On-submit action "${name}" is not registered; skipping (response ${ctx.responseId}).`);
      return { name, status: 'skipped-not-registered' };
    }
    const params = Object.assign(new RunActionParams(), {
      Action: action,
      ContextUser: contextUser,
      Filters: [],
      Params: hookParams(ctx),
      Provider: provider,
    });
    const result = await engine.RunAction(params);
    if (result.Success) {
      return { name, status: 'fired' };
    }
    LogError(`[forms] On-submit action "${name}" returned failure for response ${ctx.responseId}: ${result.Message ?? ''}`);
    return { name, status: 'failed', message: result.Message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LogError(`[forms] On-submit action "${name}" threw for response ${ctx.responseId}: ${message}`);
    return { name, status: 'failed', message };
  }
}
