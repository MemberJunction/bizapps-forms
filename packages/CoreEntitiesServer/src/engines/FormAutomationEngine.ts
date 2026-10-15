/**
 * `FormAutomationEngine` — a form's on-submit automations (spec #303 §4): editing the steps
 * (`SaveAutomation`, `Reorder`, `Remove`) and running them for a response (`RunForResponse`).
 *
 * Editing was the builder's Automate tab: twenty entity calls, a reorder that was two saves plus a
 * compensating re-save, and the built-in seeding and the authoritative mark as separate writes. Here
 * each verb is one unit of work, so a failure leaves the form's steps exactly as they were, and an
 * Action, an agent or a host with no Angular gets the same result from the same call.
 *
 * Running is what the `Forms.RunAutomations` work-queue handler calls for each submission (§5): the
 * plan comes from the published snapshot, a redelivered final submit runs no step twice, and a
 * failure says whether another delivery could help. See `automation-run.ts`.
 */
import { type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import type {
  FormsAutomationPosition,
  FormsRemoveAutomationOutput,
  FormsSaveAutomationInput,
  FormsSaveAutomationOutput,
} from '@mj-biz-apps/forms-entities';
import { requireEntityTransactions, runEngineCall, runEngineUnitOfWork } from './engine-guards.js';
import { removeAutomation, reorderAutomations, saveAutomation } from './automation-editing.js';
import {
  closeOpenRuns,
  runResponseAutomations,
  type CloseOpenRunsRequest,
  type ResponseAutomationReport,
  type ResponseAutomationRequest,
} from './automation-run.js';
import { FormAutomationError } from './automation-errors.js';

export { FormAutomationError };
export type { CloseOpenRunsRequest, ResponseAutomationReport, ResponseAutomationRequest };

export class FormAutomationEngine extends BaseSingleton<FormAutomationEngine> {
  public static get Instance(): FormAutomationEngine {
    return super.getInstance<FormAutomationEngine>();
  }

  /**
   * Create or update one step — with the binding it runs, the built-ins seeded when this turns the
   * form's own steps on, and the form's authoritative mark — in one transaction. Create versus update
   * is the presence of `Automation.ID`. Throws {@link FormAutomationError}; nothing is written then.
   */
  public async SaveAutomation(
    input: FormsSaveAutomationInput,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<FormsSaveAutomationOutput> {
    const what = `${input?.Automation?.ID ? `step ${input.Automation.ID}` : 'a new step'} of form ${input?.FormID}`;
    requireActor(user, `Saving ${what} needs the acting user; none was given.`);
    requireEntityTransactions(provider, `Saving ${what}`);
    return runEngineUnitOfWork(provider, `[FormAutomationEngine] ${what} was not saved (user ${user.ID})`, () =>
      saveAutomation(input, provider, user),
    );
  }

  /**
   * Rewrite the run order of every step of a form: `orderedIds` names each exactly once, Sync steps
   * first. One transaction — there is no half-applied swap to compensate for.
   */
  public async Reorder(
    formId: string,
    orderedIds: readonly string[],
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<FormsAutomationPosition[]> {
    requireActor(user, `Reordering the steps of form ${formId} needs the acting user; none was given.`);
    requireEntityTransactions(provider, `Reordering the steps of form ${formId}`);
    return runEngineUnitOfWork(provider, `[FormAutomationEngine] the steps of form ${formId} were not reordered (user ${user.ID})`, () =>
      reorderAutomations(formId, orderedIds, provider, user),
    );
  }

  /** Remove one step. Its binding is kept; the form stays marked as owning its steps. One transaction. */
  public async Remove(automationId: string, provider: DatabaseProviderBase, user: UserInfo): Promise<FormsRemoveAutomationOutput> {
    requireActor(user, `Removing step ${automationId} needs the acting user; none was given.`);
    requireEntityTransactions(provider, `Removing step ${automationId}`);
    return runEngineUnitOfWork(provider, `[FormAutomationEngine] step ${automationId} was not removed (user ${user.ID})`, () =>
      removeAutomation(automationId, provider, user),
    );
  }

  /**
   * Run one response's automations for one save. The steps run as `request.principal` — the
   * automation service principal, never the respondent; what plans them is read as `user` (the
   * work-queue host's system user, or the submit path's elevated user). Not a transaction: each
   * step's side effects are its own, and a step that opens a transaction does so on the provider it
   * was dispatched with. Throws {@link FormAutomationError} when nothing could be run; a failure is
   * logged once.
   */
  public async RunForResponse(
    request: ResponseAutomationRequest,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<ResponseAutomationReport> {
    requireActor(user, "Reading a response's automations needs the acting user; none was given.");
    requireActor(request?.principal, "Running a response's automations needs the automation principal; none was given.");
    return runEngineCall(
      provider,
      `[FormAutomationEngine] ${request.trigger} automations for response ${request.responseId} did not run (user ${user.ID}, principal ${request.principal.ID})`,
      () => runResponseAutomations(request, provider, user),
    );
  }

  /**
   * Close a dead-lettered or abandoned delivery's open run rows (`Running`/`Pending` since its
   * message was published) `Failed`, read and written as `user`. Returns the steps closed.
   */
  public async CloseOpenRuns(request: CloseOpenRunsRequest, provider: DatabaseProviderBase, user: UserInfo): Promise<string[]> {
    requireActor(user, "Closing a response's open automation runs needs the acting user; none was given.");
    return runEngineCall(
      provider,
      `[FormAutomationEngine] the open automation runs of response ${request?.responseId} were not closed (user ${user.ID})`,
      () => closeOpenRuns(request, provider, user),
    );
  }
}

/** Refuse, with `refusal`, when there is no user to act as. */
function requireActor(user: UserInfo | undefined, refusal: string): asserts user is UserInfo {
  if (!user) {
    throw new FormAutomationError(refusal);
  }
}
