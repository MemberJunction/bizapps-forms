/**
 * Fire the on-submit Actions by NAME (seam S3) after a response is saved.
 *
 * The three Phase-1 hooks are implemented by WP-E and may not be registered yet,
 * so each is resolved defensively via `ActionEngineServer.GetActionByName` and
 * SKIPPED-with-log when absent. A hook failure never fails the submit — the
 * response is already persisted; hooks are best-effort side effects.
 *
 * Each hook receives the `FormResponseID` (and `FormID`) as input ActionParams so the
 * action can load the response and do its work (upsert Person, send email, create
 * a follow-up Task). `FormResponseID` is the S3 input-param contract every WP-E
 * on-submit action reads — keep producer and consumers on the same name.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';

/** The S3 action names — the frozen contract WP-E implements. */
export const ON_SUBMIT_ACTION_NAMES = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
  'Forms: Analyze Written Responses',
] as const;

export type OnSubmitActionName = (typeof ON_SUBMIT_ACTION_NAMES)[number];

/** Per-hook outcome for observability/tests. */
export interface HookFireResult {
  name: OnSubmitActionName;
  status: 'fired' | 'skipped-not-registered' | 'failed';
  message?: string;
}

/** Context a hook needs to act on the just-saved response. */
export interface OnSubmitContext {
  responseId: string;
  formId: string;
  formVersionId: string;
  distributionId: string;
}

/** Build the standard input params passed to every on-submit action. */
function buildHookParams(ctx: OnSubmitContext): ActionParam[] {
  return [
    Object.assign(new ActionParam(), { Name: 'FormResponseID', Value: ctx.responseId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'FormID', Value: ctx.formId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'FormVersionID', Value: ctx.formVersionId, Type: 'Input' as const }),
    Object.assign(new ActionParam(), { Name: 'DistributionID', Value: ctx.distributionId, Type: 'Input' as const }),
  ];
}

/** Resolve + run one action by name; never throws. */
async function fireOne(
  engine: ActionEngineServer,
  name: OnSubmitActionName,
  ctx: OnSubmitContext,
  contextUser: UserInfo,
): Promise<HookFireResult> {
  const action = engine.GetActionByName(name);
  if (!action) {
    console.warn(`[forms] On-submit action "${name}" is not registered; skipping.`);
    return { name, status: 'skipped-not-registered' };
  }
  try {
    const params = Object.assign(new RunActionParams(), {
      Action: action,
      ContextUser: contextUser,
      Filters: [],
      Params: buildHookParams(ctx),
    });
    const result = await engine.RunAction(params);
    if (result.Success) {
      return { name, status: 'fired' };
    }
    console.warn(`[forms] On-submit action "${name}" returned failure: ${result.Message ?? ''}`);
    return { name, status: 'failed', message: result.Message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[forms] On-submit action "${name}" threw: ${message}`);
    return { name, status: 'failed', message };
  }
}

/**
 * Fire all three on-submit hooks (in order). Configures the engine once with the
 * context user. Hooks run only for COMPLETE submissions — partial saves do not
 * trigger side effects. Returns per-hook results; the caller ignores them for the
 * client response (best-effort) but tests assert on them.
 */
export async function fireOnSubmitHooks(
  ctx: OnSubmitContext,
  contextUser: UserInfo,
  engine: ActionEngineServer = ActionEngineServer.Instance,
): Promise<HookFireResult[]> {
  await engine.Config(false, contextUser);
  const results: HookFireResult[] = [];
  for (const name of ON_SUBMIT_ACTION_NAMES) {
    results.push(await fireOne(engine, name, ctx, contextUser));
  }
  return results;
}
