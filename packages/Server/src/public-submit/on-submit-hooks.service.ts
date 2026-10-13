/**
 * Fire the on-submit Actions by NAME (seam S3) after a response is saved.
 *
 * The firing itself is `runLegacyOnSubmitHooks` in forms-core-entities-server — the one
 * implementation, which the work-queue handler runs too. This wrapper adds what the submit path
 * needs around it: the automation principal (fail-closed) and an isolated provider. A hook failure
 * never fails the submit — the response is already persisted; hooks are best-effort side effects.
 *
 * Each hook receives the `FormResponseID` (and `FormID`) as input ActionParams so the
 * action can load the response and do its work (upsert Person, send email, create
 * a follow-up Task). `FormResponseID` is the S3 input-param contract every WP-E
 * on-submit action reads — keep producer and consumers on the same name.
 *
 * The whole chain runs on one isolated provider instance (`withIsolatedProvider`),
 * not the process-global one: bizapps-forms#260, where a durable action's detached
 * transaction on the global provider made a later hook's reads race its COMMIT. When
 * no isolated instance can be created, every hook is reported `failed` with the
 * reason instead of silently running on the global provider.
 */
import { ActionEngineServer } from '@memberjunction/actions';
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { LEGACY_ON_SUBMIT_ACTION_NAMES, type LegacyOnSubmitActionName } from '@mj-biz-apps/forms-entities';
import {
  resolveAutomationPrincipal,
  runLegacyOnSubmitHooks,
  withIsolatedProvider,
  type IsolatedProviderRunner,
} from '@mj-biz-apps/forms-core-entities-server';

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

/**
 * Fire all four on-submit hooks (in order), on one isolated provider instance.
 * Configures the engine once with the context user. Hooks run only for COMPLETE
 * submissions — partial saves do not trigger side effects. Returns per-hook
 * results; the caller ignores them for the client response (best-effort) but
 * tests assert on them.
 */
export async function fireOnSubmitHooks(
  ctx: OnSubmitContext,
  engine: ActionEngineServer = ActionEngineServer.Instance,
  runAsUser: UserInfo | null = resolveAutomationPrincipal(),
  isolate: IsolatedProviderRunner = withIsolatedProvider,
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
  try {
    return await isolate(`on-submit hooks for response ${ctx.responseId}`, (provider) =>
      runLegacyOnSubmitHooks(ctx, runAsUser, provider, engine),
    );
  } catch (err) {
    // Isolation itself failed (no instance could be created) — every hook is unrun, not merely
    // one of them. Fail-closed like the no-principal path above: report it, never fall back to
    // the global provider, which is the exact collision #260 exists to close off.
    const message = err instanceof Error ? err.message : String(err);
    LogError(`[forms] legacy on-submit hooks did not run for response ${ctx.responseId}: ${message}`);
    return ON_SUBMIT_ACTION_NAMES.map((name) => ({ name, status: 'failed' as const, message }));
  }
}
