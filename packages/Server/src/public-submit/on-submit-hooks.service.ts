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
import { LEGACY_ON_SUBMIT_ACTION_NAMES, type LegacyOnSubmitActionName } from '@mj-biz-apps/forms-entities';
import { resolveAutomationPrincipal } from '../automation/service-principal';

/**
 * The S3 action names — the frozen contract WP-E implements.
 *
 * Re-exported from the shared contract rather than restated here, because the builder seeds an
 * equivalent automation for each of these the first time a form configures anything. Two copies of
 * this list would let the two paths drift, and the symptom would be a form quietly losing one of
 * its on-submit behaviours when its author added something unrelated.
 */
export const ON_SUBMIT_ACTION_NAMES = LEGACY_ON_SUBMIT_ACTION_NAMES;

/**
 * The union of the four names, not `string`.
 *
 * This was briefly widened to `string` when the list moved to the shared contract, which removed
 * the compile-time check that made the list "frozen" in the first place — a mistyped action name
 * would then have failed only at runtime, as a hook that silently never fired.
 */
export type OnSubmitActionName = LegacyOnSubmitActionName;

/** Per-hook outcome for observability/tests. */
export interface HookFireResult {
  name: OnSubmitActionName;
  status: 'fired' | 'skipped-not-registered' | 'skipped-no-principal' | 'failed';
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
  engine: ActionEngineServer = ActionEngineServer.Instance,
  runAsUser: UserInfo | null = resolveAutomationPrincipal(),
): Promise<HookFireResult[]> {
  // On-submit hooks run under the SCOPED automation principal ("Forms Automation Service"), NOT
  // the anonymous respondent and NOT the full system user. The respondent scope is
  // CanCreate-on-responses only, so it cannot read the response back, run privileged actions
  // (upsert Person, create Task, analyze answers), or write MJ's Action Execution Logs — the work
  // needs elevation, but only to the grants the automation principal carries. This path used to
  // fall back to `UserCache.GetSystemUser()`, which silently restored the broad grants the
  // dedicated principal exists to avoid; it now fails CLOSED exactly like the configured-automation
  // path (`runConfiguredAutomations`): no resolvable principal means the hooks are skipped with a
  // logged warning, never elevated further. See ON_SUBMIT_AUTOMATION_SPEC §7.
  if (!runAsUser) {
    // `resolveAutomationPrincipal` has already logged WHY (missing/inactive user, and how to fix
    // it); this line says what that costs on THIS path.
    console.warn('[forms] legacy on-submit hooks skipped: no automation principal could be resolved.');
    return ON_SUBMIT_ACTION_NAMES.map((name) => ({ name, status: 'skipped-no-principal' as const }));
  }
  await engine.Config(false, runAsUser);
  const results: HookFireResult[] = [];
  for (const name of ON_SUBMIT_ACTION_NAMES) {
    results.push(await fireOne(engine, name, ctx, runAsUser));
  }
  return results;
}
