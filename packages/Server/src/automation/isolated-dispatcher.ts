/**
 * Give each planned automation the provider its execution mode needs.
 *
 * Sync automations dispatch on the on-submit chain's own isolated provider (`chainProvider`) —
 * `runAutomations` awaits them one at a time, in the SAME `withIsolatedProvider` scope that
 * provider came from, so they are guaranteed to finish before that scope's `finally` releases it.
 *
 * Async automations are fired by `runAutomations` WITHOUT being awaited — by design, so a
 * respondent never waits on background work — which means one can still be running after the
 * chain's own scope closes. `withIsolatedProvider`'s release rolls back any transaction still open
 * on the instance it releases, so an Async automation left running on `chainProvider` would have
 * its work rolled out from under it the moment the chain's scope exits: the same collision
 * bizapps-forms#260 fixed, relocated one level up from the legacy hook chain to the plan runner.
 * Each Async automation gets its OWN isolated scope instead, so its lifetime is its own.
 *
 * When an Async automation's OWN isolated provider cannot be created, `dispatchAutomation` never
 * runs at all, so no `FormAutomationRun` row is opened for it — only `runOne`'s `LogError` records
 * the failure. A recovery sweep that looks for stuck/missing run rows will not see this one; it
 * exists purely in the log.
 */
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { PublishedFormAutomation } from '@mj-biz-apps/forms-entities';
import type { AutomationDispatcher } from './automation-runner';
import { dispatchAutomation, type DispatchContext } from './dispatch-automation';
import { withIsolatedProvider, type IsolatedProviderRunner } from './isolated-provider';

/** Builds the full dispatch context for one automation, given the provider it should run on. */
export type DispatchContextBuilder = (
  automation: PublishedFormAutomation,
  provider: DatabaseProviderBase,
) => DispatchContext;

/**
 * Build the `AutomationDispatcher` that `runAutomations` calls for every planned automation.
 *
 * `chainProvider` is the on-submit chain's own isolated instance (the one
 * `runConfiguredAutomations`'s `withIsolatedProvider` call handed it). `responseId` names the
 * response being processed, for the Async purpose string below — passed directly rather than read
 * off a built `DispatchContext`, because building that context is what this function must NOT do
 * with the wrong provider (see below). `isolate` defaults to the real `withIsolatedProvider` and is
 * injectable so a test can observe the purpose string and the provider identity without a database.
 *
 * `buildContext` is called with the provider each automation will ACTUALLY dispatch on — never
 * built once against `chainProvider` and patched afterward. A context built with the wrong
 * provider and then spread over would look identical today, because `buildContext`'s only
 * provider-touching field is `.provider` itself — but that is an accident of the current
 * implementation, not a guarantee `DispatchContextBuilder`'s signature makes. A future builder that
 * reads anything through the provider it receives (a lookup, a cached value keyed by connection)
 * would silently compute it against `chainProvider` while reporting the isolated one.
 */
export function isolatedDispatcher(
  chainProvider: DatabaseProviderBase,
  responseId: string,
  buildContext: DispatchContextBuilder,
  isolate: IsolatedProviderRunner = withIsolatedProvider,
): AutomationDispatcher {
  return (automation: PublishedFormAutomation) => {
    if (automation.executionMode !== 'Async') {
      return dispatchAutomation(automation, buildContext(automation, chainProvider));
    }
    // Named by automation AND response: a purpose string naming only the response would make
    // every Async automation on the same response indistinguishable in a log — and there can be
    // more than one running concurrently.
    return isolate(`on-submit automation ${automation.id} for response ${responseId}`, (own) =>
      dispatchAutomation(automation, buildContext(automation, own)),
    );
  };
}
